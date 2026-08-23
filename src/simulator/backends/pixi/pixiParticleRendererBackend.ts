import {
  Container,
  Matrix,
  Rectangle,
  Sprite,
  Texture,
  type DestroyOptions,
} from "pixi.js";
import type {
  ParticleBundleProfile,
  ParticleInstanceIdentity,
  ParticleOperationResult,
  ParticlePixiSceneProfile,
  ParticlePortableProfile,
  ParticleRenderSample,
  ParticleRendererBackendSnapshot,
  ParticleRendererFrameBatch,
  ParticleRendererFrameRequest,
  ParticleRendererProfile,
  ParticleResourceAllowlistEntry,
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
  SimulatorParticleRendererBackend,
} from "../particleContracts";
import {
  particleAccepted,
  particleFloat32FromBits,
  particleRejected,
} from "../particleValidation";
import { prepareCurrentParticleResources } from "../resources/particleResourcePreparation";

export interface ParticlePixiTextureDecoder {
  decodePng(
    asset: ParticleResourceAllowlistEntry,
    bytes: Uint8Array,
  ): Promise<ParticleOperationResult<Texture>>;
}

interface SystemRenderBinding {
  readonly bundle: ParticleBundleProfile;
  readonly system: ParticleBundleProfile["systems"][number];
  readonly renderer: ParticleRendererProfile;
  readonly materialName: string;
  readonly logicalTextureId: string;
  readonly blend: "normal" | "add";
  readonly tilesX: number;
  readonly tilesY: number;
}

interface PendingParticleFrame {
  readonly capability: ParticleRendererFrameBatch;
  readonly sprites: readonly Sprite[];
  readonly samples: readonly ParticleRenderSample[];
}

export class PixiParticleRendererBackend implements SimulatorParticleRendererBackend {
  readonly id = "pixi-v8-particle-portable-v1";
  readonly stage = new Container({ label: "GarupaSimulatorParticles", sortableChildren: false });

  private state: ParticleRendererBackendSnapshot["state"] = "unprepared";
  private sessionId: string | null = null;
  private scene: ParticlePixiSceneProfile | null = null;
  private profile: ParticlePortableProfile | null = null;
  private readonly systems = new Map<string, SystemRenderBinding>();
  private readonly textures = new Map<string, Texture>();
  private readonly uniqueBaseTextures = new Set<Texture>();
  private readonly uvTextures = new Map<string, Texture>();
  private readonly liveSprites: Sprite[] = [];
  private pending: PendingParticleFrame | null = null;
  private nextFrame: number | null = null;
  private lastSampleCount = 0;
  private fault: ParticleRendererBackendSnapshot["fault"] = null;

  constructor(private readonly decoder: ParticlePixiTextureDecoder) {}

  async prepare(
    sessionId: string,
    scene: ParticlePixiSceneProfile,
    provider: ParticleResourceProvider,
    preflight: ParticleResourcePreflightAdapter,
  ): Promise<ParticleOperationResult<void>> {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
    if (this.state !== "unprepared") {
      return this.reject("particle.pixi.prepare-invalid-state", "A Pixi particle renderer prepares one session exactly once.");
    }
    if (typeof sessionId !== "string" || sessionId.length === 0 ||
      provider === null || typeof provider !== "object" || typeof provider.read !== "function" ||
      preflight === null || typeof preflight !== "object" || typeof preflight.sha256 !== "function" ||
      typeof preflight.inspectPng !== "function" ||
      this.decoder === null || typeof this.decoder !== "object" || typeof this.decoder.decodePng !== "function") {
      return this.reject("particle.pixi.invalid-prepare-capability", "Pixi particle preparation requires explicit session, offline resources, preflight and PNG decoder capabilities.");
    }
    const validatedScene = validateScene(scene);
    if (validatedScene.status !== "accepted") return validatedScene;
    if (this.stage.destroyed || this.stage.children.length !== 0) {
      return this.reject("particle.pixi.stage-not-empty-or-destroyed", "The particle stage must be live and empty before atomic prepare.");
    }

    this.state = "preparing";
    const preparingTextures = new Set<Texture>();
    try {
      const prepared = await prepareCurrentParticleResources(provider, preflight);
      if (prepared.status !== "accepted") return this.abortPrepare(prepared);
      const decoded = new Map<string, Texture>();
      const identities = preparingTextures;
      if (prepared.value.textures.status !== "selected-skin-portable-textures") {
        return this.abortPrepare(this.reject(
          "particle.pixi.application-leased-textures-required",
          "Production Pixi particles require selected application-leased Skin textures; fixed manifest fallback is removed.",
        ));
      }
      const textureResources = prepared.value.textures.entries
        .filter((entry): entry is Exclude<typeof entry, { readonly aliasOf: string }> => !("aliasOf" in entry))
        .map((entry) => ({
          logicalAssetId: entry.logicalAssetId,
          byteLength: entry.bytes,
          sha256: entry.sha256,
          mime: "image/png" as const,
          width: entry.width,
          height: entry.height,
        }));
      for (const resource of textureResources) {
        const bytes = prepared.value.pngBytes.get(resource.logicalAssetId);
        if (bytes === undefined) return this.abortPrepare(this.reject(
          "particle.pixi.validated-png-unavailable",
          "Pixi decode consumes only the exact bytes validated during the same atomic prepare.",
        ));
        const result = await this.decoder.decodePng(resource, Uint8Array.from(bytes));
        if (result.status !== "accepted") {
          destroyTextureSet(identities);
          return this.abortPrepare(result);
        }
        const texture = result.value;
        if (!(texture instanceof Texture) || identities.has(texture) ||
          texture.destroyed || texture.source.width !== resource.width || texture.source.height !== resource.height) {
          if (texture instanceof Texture && !identities.has(texture) && !texture.destroyed) texture.destroy(true);
          destroyTextureSet(identities);
          return this.abortPrepare(particleRejected(
            "particle-resource-decode",
            "particle.pixi.decoder-identity-or-dimensions",
            "Each unique PNG requires one live independently owned Texture with exact validated dimensions.",
          ));
        }
        identities.add(texture);
        decoded.set(resource.logicalAssetId, texture);
      }
      const alias = prepared.value.textures.entries.find((entry) => "aliasOf" in entry);
      if (alias === undefined) {
        if (prepared.value.textures.status !== "selected-skin-portable-textures") {
          destroyTextureSet(identities);
          return this.abortPrepare(this.reject("particle.pixi.texture-alias-missing", "The exact current directional effect_circle alias must be present."));
        }
      } else {
        const aliasedTexture = decoded.get(alias.aliasOf);
        if (aliasedTexture === undefined) {
          destroyTextureSet(identities);
          return this.abortPrepare(this.reject("particle.pixi.texture-alias-target-missing", "The exact texture alias target must resolve before commit."));
        }
        decoded.set(alias.logicalAssetId, aliasedTexture);
      }

      const systemBindings = buildSystemBindings(prepared.value.profile);
      if (systemBindings.status !== "accepted") {
        destroyTextureSet(identities);
        return this.abortPrepare(systemBindings);
      }
      for (const bundle of prepared.value.profile.bundles) {
        for (const textureProfile of bundle.textures) {
          const logicalId = `particle-texture:${bundle.key}:${textureProfile.name}`;
          const texture = decoded.get(logicalId);
          if (texture === undefined) {
            destroyTextureSet(identities);
            return this.abortPrepare(this.reject("particle.pixi.profile-texture-missing", "Every material texture must resolve to its prepared PNG or exact alias."));
          }
          applyTextureSettings(texture, textureProfile.wrapU, textureProfile.wrapV);
        }
      }

      this.sessionId = sessionId;
      this.scene = validatedScene.value;
      this.profile = prepared.value.profile;
      for (const [identity, binding] of systemBindings.value) this.systems.set(identity, binding);
      for (const [logicalId, texture] of decoded) this.textures.set(logicalId, texture);
      for (const texture of identities) this.uniqueBaseTextures.add(texture);
      this.createUvTextures();
      this.state = "ready";
      return particleAccepted(undefined);
    } catch {
      destroyTextureSet(preparingTextures);
      this.resetTextures();
      this.systems.clear();
      this.state = "unprepared";
      return particleRejected(
        "particle-resource-decode",
        "particle.pixi.prepare-threw",
        "Particle resource decode/subtexture construction failure rolls back every texture and remains unprepared.",
      );
    }
  }

  preflightFrame(
    request: ParticleRendererFrameRequest,
  ): ParticleOperationResult<ParticleRendererFrameBatch> {
    const terminal = this.terminalResult<ParticleRendererFrameBatch>();
    if (terminal !== null) return terminal;
    if (this.state !== "ready" || this.sessionId === null || this.scene === null || this.profile === null) {
      return this.reject("particle.pixi.not-ready", "Particle samples require a prepared Pixi particle session.");
    }
    if (this.pending !== null) {
      return this.reject("particle.pixi.overlapping-frame", "Only one detached Pixi particle frame reservation may be pending.");
    }
    if (request === null || typeof request !== "object" || request.sessionId !== this.sessionId ||
      !Number.isSafeInteger(request.frame) || request.frame < 0 || !Array.isArray(request.samples) ||
      (this.nextFrame !== null && request.frame !== this.nextFrame)) {
      return this.reject("particle.pixi.invalid-frame", "Pixi consumes one exact-session contiguous immutable particle sample frame.");
    }
    const validation = this.validateSamples(request.samples);
    if (validation.status !== "accepted") return validation;
    const sprites: Sprite[] = [];
    try {
      for (const sample of request.samples) sprites.push(this.createSprite(sample));
    } catch {
      const cleanupFailures = destroySprites(sprites);
      return this.latchFault(
        "particle.pixi.sample-allocation-threw",
        cleanupFailures.length === 0
          ? "Detached Sprite allocation, texture or mapping failure is the first terminal Pixi particle fault and consumes no frame."
          : `Detached Sprite allocation failed and cleanup continued; failed identities: ${cleanupFailures.join(",")}.`,
      );
    }
    const capability = Object.freeze({
      sessionId: this.sessionId,
      frame: request.frame,
      sampleCount: request.samples.length,
    });
    this.pending = Object.freeze({
      capability,
      sprites: Object.freeze(sprites),
      samples: Object.freeze([...request.samples]),
    });
    return particleAccepted(capability);
  }

  commitFrame(batch: ParticleRendererFrameBatch): ParticleOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    const pending = this.pending;
    if (pending === null || pending.capability !== batch || batch.sessionId !== this.sessionId ||
      batch.sampleCount !== pending.sprites.length ||
      (this.nextFrame !== null && batch.frame !== this.nextFrame)) {
      return this.latchFault(
        "particle.pixi.invalid-batch-capability",
        "Pixi accepts only its exact one-use detached sample capability.",
      );
    }
    try {
      const priorCleanupFailures = this.clearLiveSprites();
      if (priorCleanupFailures.length > 0) {
        throw new Error(`failed prior live Sprite cleanup: ${priorCleanupFailures.join(",")}`);
      }
      for (const sprite of pending.sprites) {
        this.stage.addChild(sprite);
        this.liveSprites.push(sprite);
      }
    } catch {
      this.pending = null;
      const cleanupFailures = [
        ...destroySprites(pending.sprites),
        ...this.clearLiveSprites(),
      ];
      return this.latchFault(
        "particle.pixi.scene-mutation-threw",
        cleanupFailures.length === 0
          ? "A Pixi particle scene mutation is terminal and clears every live/detached sample node."
          : `A Pixi particle scene mutation is terminal; cleanup continued with failed identities: ${cleanupFailures.join(",")}.`,
      );
    }
    this.pending = null;
    this.nextFrame = batch.frame + 1;
    this.lastSampleCount = batch.sampleCount;
    return particleAccepted(undefined);
  }

  discardFrame(batch: ParticleRendererFrameBatch): ParticleOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    if (this.pending?.capability !== batch) {
      return this.reject("particle.pixi.invalid-discard-capability", "Only the exact pending Pixi particle frame may be discarded.");
    }
    const cleanupFailures = destroySprites(this.pending.sprites);
    this.pending = null;
    return cleanupFailures.length === 0
      ? particleAccepted(undefined)
      : this.latchFault(
          "particle.pixi.discard-owner-threw",
          `Discard continued across every detached Sprite; failed identities: ${cleanupFailures.join(",")}.`,
        );
  }

  recordTerminalFault(capability: string, boundary: string): ParticleOperationResult<never> {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
    return this.latchFault(capability, boundary);
  }

  notifyContextLoss(): ParticleOperationResult<never> {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
    if (this.state !== "ready") {
      return this.latchFault(
        "particle.pixi.context-loss-outside-ready-session",
        "Context loss is accepted only for a ready particle renderer.",
      );
    }
    return this.latchFault(
      "particle.pixi.context-lost",
      "WebGL/WebGPU context loss is terminal and never triggers a software/network/resource fallback.",
    );
  }

  snapshot(): ParticleRendererBackendSnapshot {
    return Object.freeze({
      state: this.state,
      sessionId: this.sessionId,
      nextFrame: this.nextFrame,
      resourceCount: this.uniqueBaseTextures.size,
      nodeCount: this.liveSprites.length,
      lastSampleCount: this.lastSampleCount,
      fault: this.fault === null ? null : Object.freeze({ ...this.fault }),
    });
  }

  sceneSnapshot(): readonly {
    readonly particleId: string;
    readonly position: readonly [number, number];
    readonly scale: readonly [number, number];
    readonly rotation: number;
    readonly alpha: number;
    readonly tint: number;
    readonly blendMode: string;
    readonly textureLabel: string;
  }[] {
    return Object.freeze(this.liveSprites.map((sprite) => Object.freeze({
      particleId: sprite.label,
      position: Object.freeze([sprite.position.x, sprite.position.y] as const),
      scale: Object.freeze([sprite.scale.x, sprite.scale.y] as const),
      rotation: sprite.rotation,
      alpha: sprite.alpha,
      tint: Number(sprite.tint),
      blendMode: String(sprite.blendMode),
      textureLabel: sprite.texture.label ?? "",
    })));
  }

  dispose(): ParticleOperationResult<void> {
    if (this.state === "disposed") return particleAccepted(undefined);
    const cleanupFailures = [
      ...(this.pending === null ? [] : destroySprites(this.pending.sprites, "pending")),
      ...this.clearLiveSprites(),
      ...this.resetTextures(),
    ];
    this.pending = null;
    this.systems.clear();
    this.profile = null;
    this.scene = null;
    this.sessionId = null;
    this.nextFrame = null;
    this.lastSampleCount = 0;
    if (cleanupFailures.length > 0 && this.fault === null) {
      this.fault = Object.freeze({
        code: "particle-backend-fault" as const,
        capability: "particle.pixi.dispose-owner-threw",
        boundary: `Pixi particle disposal continued across every owner; failed cleanup identities: ${cleanupFailures.join(",")}.`,
      });
    }
    this.state = "disposed";
    return cleanupFailures.length === 0
      ? particleAccepted(undefined)
      : particleRejected(
          "particle-backend-fault",
          "particle.pixi.dispose-owner-threw",
          `Pixi particle disposal continued across every owner; failed cleanup identities: ${cleanupFailures.join(",")}.`,
        );
  }

  private validateSamples(samples: readonly ParticleRenderSample[]): ParticleOperationResult<void> {
    const ids = new Set<string>();
    let previous: ParticleRenderSample | null = null;
    for (const sample of samples) {
      if (sample === null || typeof sample !== "object" || typeof sample.particleId !== "string" ||
        sample.particleId.length === 0 || ids.has(sample.particleId) || typeof sample.ownerKey !== "string" ||
        sample.ownerKey.length === 0 || !isInstance(sample.instance) ||
        !this.scene?.buttonAnchors.some((anchor) => anchor.buttonType === sample.instance.buttonType)) {
        return this.reject("particle.pixi.invalid-sample-identity", "Every sample requires one unique stable particle and typed owner instance identity.");
      }
      ids.add(sample.particleId);
      const binding = this.systems.get(sample.systemId);
      if (binding === undefined || sample.root !== binding.bundle.systems.find(
        (system) => system.identity === sample.systemId,
      )?.root || sample.material !== binding.materialName ||
        sample.sortingOrder !== binding.renderer.m_SortingOrder ||
        sample.renderMode !== binding.renderer.m_RenderMode ||
        sample.renderAlignment !== binding.renderer.m_RenderAlignment ||
        !Number.isSafeInteger(sample.creationSequence) || sample.creationSequence < 1 ||
        !Number.isInteger(sample.uvFrame) || sample.uvFrame < 0 ||
        sample.uvFrame >= binding.tilesX * binding.tilesY || !sampleBitsFinite(sample)) {
        return this.reject("particle.pixi.sample-profile-mismatch", "Samples must match their exact current system renderer/material/UV profile and finite binary32 state.");
      }
      if (previous !== null && compareSamples(previous, sample) > 0) {
        return this.reject("particle.pixi.sample-order-mismatch", "Particle handoff order is sortingOrder/system identity/creation sequence and never Pixi default zIndex.");
      }
      previous = sample;
    }
    return particleAccepted(undefined);
  }

  private createSprite(sample: ParticleRenderSample): Sprite {
    const binding = this.systems.get(sample.systemId)!;
    const texture = binding.tilesX === 1 && binding.tilesY === 1
      ? this.textures.get(binding.logicalTextureId)
      : this.uvTextures.get(`${binding.logicalTextureId}\u0000${sample.uvFrame}`);
    if (texture === undefined || texture.destroyed) throw new Error("missing particle texture");
    const sprite = new Sprite({
      texture,
      label: sample.particleId,
      roundPixels: false,
    });
    sprite.anchor.set(0.5);
    const anchor = this.scene!.buttonAnchors.find(
      (candidate) => candidate.buttonType === sample.instance.buttonType,
    );
    if (anchor === undefined) {
      throw new Error("particle button has no evidence-authored scene anchor");
    }
    const worldX = addBits(anchor.position.xBits, sample.position.xBits);
    const worldY = addBits(anchor.position.yBits, sample.position.yBits);
    const pixelsPerUnit = particleFloat32FromBits(this.scene!.pixelsPerWorldUnitBits)!;
    sprite.position.set(
      Math.fround(this.scene!.viewportWidth / 2 + Math.fround(worldX * pixelsPerUnit)),
      Math.fround(this.scene!.viewportHeight / 2 - Math.fround(worldY * pixelsPerUnit)),
    );
    sprite.setFromMatrix(particleSpriteMatrix(
      sample,
      binding,
      texture,
      pixelsPerUnit,
      sprite.position.x,
      sprite.position.y,
    ));
    const red = particleFloat32FromBits(sample.color.redBits)!;
    const green = particleFloat32FromBits(sample.color.greenBits)!;
    const blue = particleFloat32FromBits(sample.color.blueBits)!;
    sprite.alpha = particleFloat32FromBits(sample.color.alphaBits)!;
    sprite.tint = rgbTint(red, green, blue);
    sprite.blendMode = binding.blend;
    return sprite;
  }

  private createUvTextures(): void {
    const tileProfiles = new Map<string, readonly [number, number]>();
    for (const binding of this.systems.values()) {
      if (binding.tilesX === 1 && binding.tilesY === 1) continue;
      const current = tileProfiles.get(binding.logicalTextureId);
      if (current !== undefined && (current[0] !== binding.tilesX || current[1] !== binding.tilesY)) {
        throw new Error("inconsistent UV tile profile");
      }
      tileProfiles.set(binding.logicalTextureId, [binding.tilesX, binding.tilesY]);
    }
    for (const [logicalId, [tilesX, tilesY]] of tileProfiles) {
      const base = this.textures.get(logicalId)!;
      const width = base.width / tilesX;
      const height = base.height / tilesY;
      if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error("non-integral UV tiles");
      for (let frame = 0; frame < tilesX * tilesY; frame += 1) {
        const column = frame % tilesX;
        const unityRow = Math.floor(frame / tilesX);
        const pixiRow = tilesY - 1 - unityRow;
        const texture = new Texture({
          source: base.source,
          frame: new Rectangle(column * width, pixiRow * height, width, height),
          orig: new Rectangle(0, 0, width, height),
          label: `${logicalId}:uv:${frame}`,
        });
        this.uvTextures.set(`${logicalId}\u0000${frame}`, texture);
      }
    }
  }

  private clearLiveSprites(): readonly string[] {
    const failures: string[] = [];
    for (const sprite of this.liveSprites.splice(0)) {
      try {
        sprite.removeFromParent();
        if (!sprite.destroyed) sprite.destroy({ children: true } as DestroyOptions);
      } catch {
        failures.push(`live-sprite:${sprite.label}`);
      }
    }
    return failures;
  }

  private resetTextures(): readonly string[] {
    const failures: string[] = [];
    for (const [key, texture] of this.uvTextures) {
      try {
        if (!texture.destroyed) texture.destroy(false);
      } catch {
        failures.push(`uv-texture:${key}`);
      }
    }
    this.uvTextures.clear();
    for (const texture of this.uniqueBaseTextures) {
      try {
        if (!texture.destroyed) texture.destroy(true);
      } catch {
        failures.push(`base-texture:${texture.label ?? "unlabelled"}`);
      }
    }
    this.uniqueBaseTextures.clear();
    this.textures.clear();
    return failures;
  }

  private abortPrepare<T>(result: ParticleOperationResult<T>): ParticleOperationResult<void> {
    this.resetTextures();
    this.systems.clear();
    this.state = "unprepared";
    return result.status === "accepted" ? particleAccepted(undefined) : result;
  }

  private terminalResult<T>(): ParticleOperationResult<T> | null {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
    return null;
  }

  private latchFault(capability: string, boundary: string): ParticleOperationResult<never> {
    if (this.fault === null) {
      const cleanupFailures = [
        ...(this.pending === null ? [] : destroySprites(this.pending.sprites, "pending")),
        ...this.clearLiveSprites(),
      ];
      this.fault = Object.freeze({
        code: "particle-backend-fault",
        capability,
        boundary: cleanupFailures.length === 0
          ? boundary
          : `${boundary} Secondary cleanup failures: ${cleanupFailures.join(",")}.`,
      });
      this.pending = null;
      this.state = "faulted";
    }
    return this.faultResult();
  }

  private faultResult<T = never>(): ParticleOperationResult<T> {
    return particleRejected("particle-backend-fault", this.fault!.capability, this.fault!.boundary);
  }

  private disposedResult<T = never>(): ParticleOperationResult<T> {
    return particleRejected(
      "terminal-disposed",
      "particle.pixi.terminal-disposed",
      "Disposed Pixi particle sessions reject every API except idempotent repeated dispose.",
    );
  }

  private reject(capability: string, boundary: string): ParticleOperationResult<never> {
    return particleRejected("integrity-failure", capability, boundary);
  }
}

function buildSystemBindings(
  profile: ParticlePortableProfile,
): ParticleOperationResult<ReadonlyMap<string, SystemRenderBinding>> {
  const bindings = new Map<string, SystemRenderBinding>();
  for (const bundle of profile.bundles) {
    const materials = new Map(bundle.materials.map((material) => [material.name, material]));
    for (const system of bundle.systems) {
      const definition = bundle.profiles[system.profile];
      const renderer = definition === undefined ? undefined : bundle.rendererProfiles[definition.renderer];
      if (definition === undefined || renderer === undefined) {
        return particleRejected("integrity-failure", "particle.pixi.missing-system-renderer", "Every system must resolve its current profile and renderer.");
      }
      if (!renderer.m_Enabled) continue;
      const reference = renderer.m_Materials.find((material) => material !== null);
      const material = reference === null || reference === undefined ? undefined : materials.get(reference.name);
      if (material === undefined || material.texture === null) {
        return particleRejected("integrity-failure", "particle.pixi.missing-visible-material", "Every enabled current renderer requires its exact material and texture.");
      }
      const uvKey = definition.modules.UVModule;
      const uv = uvKey === undefined ? null : bundle.moduleProfiles.UVModule?.[uvKey] ?? null;
      bindings.set(system.identity, Object.freeze({
        bundle,
        system,
        renderer,
        materialName: material.name,
        logicalTextureId: `particle-texture:${bundle.key}:${material.texture}`,
        blend: material.blend,
        tilesX: uv?.tilesX ?? 1,
        tilesY: uv?.tilesY ?? 1,
      }));
    }
  }
  return bindings.size === 104
    ? particleAccepted(bindings)
    : particleRejected("integrity-failure", "particle.pixi.renderer-binding-count-mismatch", "Exactly 104 of the 120 current systems have enabled renderer bindings.");
}

function validateScene(scene: ParticlePixiSceneProfile): ParticleOperationResult<ParticlePixiSceneProfile> {
  const pixelsPerWorldUnit = scene === null || typeof scene !== "object"
    ? null
    : particleFloat32FromBits(scene.pixelsPerWorldUnitBits);
  if (scene === null || typeof scene !== "object" ||
    !Number.isSafeInteger(scene.viewportWidth) || scene.viewportWidth <= 0 ||
    !Number.isSafeInteger(scene.viewportHeight) || scene.viewportHeight <= 0 ||
    scene.viewportWidth < scene.viewportHeight ||
    scene.worldCenterXBits !== "0x00000000" || scene.worldCenterYBits !== "0x00000000" ||
    pixelsPerWorldUnit !== Math.fround(scene.viewportHeight / 2) || scene.roundPixels !== false ||
    !Array.isArray(scene.buttonAnchors) || scene.buttonAnchors.length !== 15 ||
    scene.buttonAnchors.some((anchor, index) =>
      anchor.buttonType !== (index < 7 ? index : index + 1) ||
      particleFloat32FromBits(anchor.position.xBits) === null ||
      particleFloat32FromBits(anchor.position.yBits) === null ||
      particleFloat32FromBits(anchor.position.zBits) === null)) {
    return particleRejected(
      "integrity-failure",
      "particle.pixi.invalid-scene-profile",
      "Particle projection requires the current landscape orthographic height/2 PPU and the 15 ordered engine-authored anchors; unsupported Button_07 fails closed without a fixed-device viewport fallback.",
    );
  }
  return particleAccepted(Object.freeze({
    ...scene,
    buttonAnchors: Object.freeze(scene.buttonAnchors.map((anchor) => Object.freeze({
      buttonType: anchor.buttonType,
      position: Object.freeze({ ...anchor.position }),
    }))),
  }));
}

function isInstance(value: ParticleInstanceIdentity): boolean {
  if (value === null || typeof value !== "object" ||
    !Number.isInteger(value.buttonType) || value.buttonType < 0 || value.buttonType > 15) return false;
  if (value.kind === "game-play-button") {
    return value.rangeLength === null ||
      Number.isInteger(value.rangeLength) && value.rangeLength >= 1 && value.rangeLength <= 7;
  }
  const rangeLength = value.rangeLength;
  return value.kind === "note-slide" && Number.isSafeInteger(value.noteIndex) && value.noteIndex >= 0 &&
    Number.isSafeInteger(value.absolutePosition) && value.absolutePosition >= 0 &&
    typeof rangeLength === "number" && Number.isInteger(rangeLength) && rangeLength >= 1 && rangeLength <= 7;
}

function sampleBitsFinite(sample: ParticleRenderSample): boolean {
  return [
    sample.position.xBits, sample.position.yBits, sample.position.zBits,
    sample.velocity.xBits, sample.velocity.yBits, sample.velocity.zBits,
    sample.size.xBits, sample.size.yBits, sample.size.zBits,
    sample.rotation.xBits, sample.rotation.yBits, sample.rotation.zBits,
    sample.color.redBits, sample.color.greenBits, sample.color.blueBits, sample.color.alphaBits,
    sample.ageBits, sample.lifetimeBits,
  ].every((bits) => particleFloat32FromBits(bits) !== null);
}

function compareSamples(left: ParticleRenderSample, right: ParticleRenderSample): number {
  return left.sortingOrder - right.sortingOrder || compareOrdinal(left.systemId, right.systemId) ||
    left.creationSequence - right.creationSequence;
}

type ParticleVector = readonly [number, number, number];

function particleSpriteMatrix(
  sample: ParticleRenderSample,
  binding: SystemRenderBinding,
  texture: Texture,
  pixelsPerUnit: number,
  positionX: number,
  positionY: number,
): Matrix {
  const sizeX = particleFloat32FromBits(sample.size.xBits)!;
  const sizeY = particleFloat32FromBits(sample.size.yBits)!;
  const rotation = particleFloat32FromBits(sample.rotation.zBits)!;
  if (sample.renderMode === 1) {
    const velocity: ParticleVector = [
      particleFloat32FromBits(sample.velocity.xBits)!,
      particleFloat32FromBits(sample.velocity.yBits)!,
      particleFloat32FromBits(sample.velocity.zBits)!,
    ];
    const hierarchyScale = systemHierarchyScale(binding);
    const speedSquared = velocity.reduce(
      (sum, component) => renderAdd(sum, renderMultiply(component, component)),
      renderF32(0),
    );
    const speed = renderF32(Math.sqrt(speedSquared));
    const width = renderMultiply(renderMultiply(sizeX, hierarchyScale[0]), pixelsPerUnit);
    const heightWorld = renderAdd(
      renderMultiply(renderMultiply(sizeY, hierarchyScale[1]), binding.renderer.m_LengthScale),
      renderMultiply(speed, binding.renderer.m_VelocityScale),
    );
    const height = renderMultiply(heightWorld, pixelsPerUnit);
    const screenRotation = velocity[0] === 0 && velocity[1] === 0
      ? Math.fround(-rotation)
      : Math.fround(Math.atan2(-velocity[1], velocity[0]) - Math.PI / 2);
    return viewAlignedMatrix(texture, width, height, screenRotation, positionX, positionY);
  }
  if (sample.renderAlignment === 2) {
    const cosine = renderF32(Math.cos(rotation));
    const sine = renderF32(Math.sin(rotation));
    const localX: ParticleVector = [
      renderMultiply(cosine, sizeX),
      renderMultiply(sine, sizeX),
      0,
    ];
    const localY: ParticleVector = [
      renderMultiply(-sine, sizeY),
      renderMultiply(cosine, sizeY),
      0,
    ];
    const worldX = applySystemLinear(localX, binding);
    const worldY = applySystemLinear(localY, binding);
    return new Matrix(
      renderMultiply(worldX[0], pixelsPerUnit) / texture.width,
      renderMultiply(-worldX[1], pixelsPerUnit) / texture.width,
      renderMultiply(worldY[0], pixelsPerUnit) / texture.height,
      renderMultiply(-worldY[1], pixelsPerUnit) / texture.height,
      positionX,
      positionY,
    );
  }
  const hierarchyScale = systemHierarchyScale(binding);
  return viewAlignedMatrix(
    texture,
    renderMultiply(renderMultiply(sizeX, hierarchyScale[0]), pixelsPerUnit),
    renderMultiply(renderMultiply(sizeY, hierarchyScale[1]), pixelsPerUnit),
    Math.fround(-rotation),
    positionX,
    positionY,
  );
}

function viewAlignedMatrix(
  texture: Texture,
  width: number,
  height: number,
  rotation: number,
  positionX: number,
  positionY: number,
): Matrix {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return new Matrix(
    cosine * width / texture.width,
    sine * width / texture.width,
    -sine * height / texture.height,
    cosine * height / texture.height,
    positionX,
    positionY,
  );
}

function systemHierarchyScale(binding: SystemRenderBinding): readonly [number, number] {
  const x = applySystemLinear([1, 0, 0], binding);
  const y = applySystemLinear([0, 1, 0], binding);
  return Object.freeze([
    renderF32(Math.hypot(x[0], x[1], x[2])),
    renderF32(Math.hypot(y[0], y[1], y[2])),
  ] as const);
}

function applySystemLinear(vector: ParticleVector, binding: SystemRenderBinding): ParticleVector {
  let value = vector;
  for (const transform of [binding.system.transform, ...binding.system.parentTransforms]) {
    value = quaternionRotate([
      renderMultiply(value[0], transform.m_LocalScale.x),
      renderMultiply(value[1], transform.m_LocalScale.y),
      renderMultiply(value[2], transform.m_LocalScale.z),
    ], transform.m_LocalRotation);
  }
  return value;
}

function quaternionRotate(
  vector: ParticleVector,
  quaternion: ParticleBundleProfile["systems"][number]["transform"]["m_LocalRotation"],
): ParticleVector {
  const [x, y, z] = vector.map(renderF32) as [number, number, number];
  const qx = renderF32(quaternion.x);
  const qy = renderF32(quaternion.y);
  const qz = renderF32(quaternion.z);
  const qw = renderF32(quaternion.w);
  const tx = renderMultiply(2, renderSubtract(renderMultiply(qy, z), renderMultiply(qz, y)));
  const ty = renderMultiply(2, renderSubtract(renderMultiply(qz, x), renderMultiply(qx, z)));
  const tz = renderMultiply(2, renderSubtract(renderMultiply(qx, y), renderMultiply(qy, x)));
  return [
    renderAdd(x, renderAdd(renderMultiply(qw, tx), renderSubtract(renderMultiply(qy, tz), renderMultiply(qz, ty)))),
    renderAdd(y, renderAdd(renderMultiply(qw, ty), renderSubtract(renderMultiply(qz, tx), renderMultiply(qx, tz)))),
    renderAdd(z, renderAdd(renderMultiply(qw, tz), renderSubtract(renderMultiply(qx, ty), renderMultiply(qy, tx)))),
  ];
}

function renderF32(value: number): number { return Math.fround(value); }
function renderAdd(left: number, right: number): number {
  return renderF32(renderF32(left) + renderF32(right));
}
function renderSubtract(left: number, right: number): number {
  return renderF32(renderF32(left) - renderF32(right));
}
function renderMultiply(left: number, right: number): number {
  return renderF32(renderF32(left) * renderF32(right));
}

function applyTextureSettings(texture: Texture, wrapU: 0 | 1, wrapV: 0 | 1): void {
  texture.source.scaleMode = "linear";
  texture.source.style.addressModeU = wrapU === 0 ? "repeat" : "clamp-to-edge";
  texture.source.style.addressModeV = wrapV === 0 ? "repeat" : "clamp-to-edge";
  texture.source.style.update();
  texture.source.autoGenerateMipmaps = false;
  texture.source.alphaMode = "no-premultiply-alpha";
}

function addBits(leftBits: string, rightBits: string): number {
  return Math.fround(particleFloat32FromBits(leftBits)! + particleFloat32FromBits(rightBits)!);
}

function rgbTint(red: number, green: number, blue: number): number {
  if (![red, green, blue].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("particle color outside portable tint domain");
  }
  const byte = (value: number) => Math.round(value * 255);
  return (byte(red) << 16) | (byte(green) << 8) | byte(blue);
}

function destroySprites(
  sprites: readonly Sprite[],
  ownerPrefix = "detached",
): readonly string[] {
  const failures: string[] = [];
  for (const sprite of sprites) {
    try {
      sprite.removeFromParent();
      if (!sprite.destroyed) sprite.destroy({ children: true } as DestroyOptions);
    } catch {
      failures.push(`${ownerPrefix}-sprite:${sprite.label}`);
    }
  }
  return failures;
}

function destroyTextureSet(textures: ReadonlySet<Texture>): readonly string[] {
  const failures: string[] = [];
  for (const texture of textures) {
    try {
      if (!texture.destroyed) texture.destroy(true);
    } catch {
      failures.push(`texture:${texture.label ?? "unlabelled"}`);
    }
  }
  return failures;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
