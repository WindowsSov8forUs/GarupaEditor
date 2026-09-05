import { Container, Texture } from "pixi.js";
import type {
  ParticleBundleProfile,
  ParticleInstanceIdentity,
  ParticleOperationResult,
  ParticleOwnerTransform,
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
import {
  buildCurrentParticlePrimitives,
  ParticleGeometryFault,
  type ParticleNativeRenderPrimitive,
} from "../../engine/particles/particleGeometry";
import {
  createPixiParticleNativePrimitiveMesh,
  destroyPixiParticleLinearColorMesh,
  type PixiParticleLinearColorMesh,
} from "./pixiParticleLinearColorMesh";

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
}

interface PendingParticleFrame {
  readonly capability: ParticleRendererFrameBatch;
  readonly meshes: readonly PixiParticleLinearColorMesh[];
  readonly primitives: readonly ParticleNativeRenderPrimitive[];
}

export class PixiParticleRendererBackend implements SimulatorParticleRendererBackend {
  readonly id = "pixi-v8-current-native-particle-primitives-v2";
  readonly stage = new Container({ label: "GarupaSimulatorParticles", sortableChildren: false });
  /** Kept as an empty compatibility mount only; native ordering uses one primitive sequence. */
  readonly highSortingStage = new Container({ label: "GarupaSimulatorParticlesHigh", sortableChildren: false });

  private state: ParticleRendererBackendSnapshot["state"] = "unprepared";
  private sessionId: string | null = null;
  private scene: ParticlePixiSceneProfile | null = null;
  private profile: ParticlePortableProfile | null = null;
  private readonly systems = new Map<string, SystemRenderBinding>();
  private readonly textures = new Map<string, Texture>();
  private readonly uniqueBaseTextures = new Set<Texture>();
  private readonly liveMeshes: PixiParticleLinearColorMesh[] = [];
  private readonly livePrimitives: ParticleNativeRenderPrimitive[] = [];
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
    if (this.stage.destroyed || this.highSortingStage.destroyed ||
      this.stage.children.length !== 0 || this.highSortingStage.children.length !== 0) {
      return this.reject("particle.pixi.stage-not-empty-or-destroyed", "Particle stages must be live and empty before atomic prepare.");
    }

    this.state = "preparing";
    const preparingTextures = new Set<Texture>();
    try {
      const prepared = await prepareCurrentParticleResources(provider, preflight);
      if (prepared.status !== "accepted") return this.abortPrepare(prepared);
      if (prepared.value.textures.status !== "selected-skin-portable-textures") {
        return this.abortPrepare(this.reject(
          "particle.pixi.application-leased-textures-required",
          "Production Pixi particles require selected application-leased Skin textures.",
        ));
      }
      const decoded = new Map<string, Texture>();
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
        if (bytes === undefined) {
          destroyTextureSet(preparingTextures);
          return this.abortPrepare(this.reject(
            "particle.pixi.validated-png-unavailable",
            "Pixi decode consumes only the exact bytes validated during the same atomic prepare.",
          ));
        }
        const result = await this.decoder.decodePng(resource, Uint8Array.from(bytes));
        if (result.status !== "accepted") {
          destroyTextureSet(preparingTextures);
          return this.abortPrepare(result);
        }
        const texture = result.value;
        if (!(texture instanceof Texture) || preparingTextures.has(texture) || texture.destroyed ||
          texture.source.width !== resource.width || texture.source.height !== resource.height) {
          if (texture instanceof Texture && !preparingTextures.has(texture) && !texture.destroyed) texture.destroy(true);
          destroyTextureSet(preparingTextures);
          return this.abortPrepare(particleRejected(
            "particle-resource-decode",
            "particle.pixi.decoder-identity-or-dimensions",
            "Each unique PNG requires one live independently owned Texture with exact validated dimensions.",
          ));
        }
        preparingTextures.add(texture);
        decoded.set(resource.logicalAssetId, texture);
      }
      for (const alias of prepared.value.textures.entries.filter(
        (entry): entry is Extract<typeof entry, { readonly aliasOf: string }> => "aliasOf" in entry,
      )) {
        const target = decoded.get(alias.aliasOf);
        if (target === undefined) {
          destroyTextureSet(preparingTextures);
          return this.abortPrepare(this.reject("particle.pixi.texture-alias-target-missing", "Every texture alias must resolve inside the same prepared token."));
        }
        decoded.set(alias.logicalAssetId, target);
      }
      const bindings = buildSystemBindings(prepared.value.profile);
      if (bindings.status !== "accepted") {
        destroyTextureSet(preparingTextures);
        return this.abortPrepare(bindings);
      }
      for (const binding of bindings.value.values()) {
        const texture = decoded.get(binding.logicalTextureId);
        const profileTexture = binding.bundle.textures.find(
          (candidate) => `particle-texture:${binding.bundle.key}:${candidate.name}` === binding.logicalTextureId,
        );
        if (texture === undefined || profileTexture === undefined) {
          destroyTextureSet(preparingTextures);
          return this.abortPrepare(this.reject("particle.pixi.profile-texture-missing", "Every slot-0 material texture must resolve to one prepared PNG."));
        }
        applyTextureSettings(texture, profileTexture.wrapU, profileTexture.wrapV);
      }

      this.sessionId = sessionId;
      this.scene = validatedScene.value;
      this.profile = prepared.value.profile;
      for (const [identity, binding] of bindings.value) this.systems.set(identity, binding);
      for (const [logicalId, texture] of decoded) this.textures.set(logicalId, texture);
      for (const texture of preparingTextures) this.uniqueBaseTextures.add(texture);
      this.state = "ready";
      return particleAccepted(undefined);
    } catch (error) {
      destroyTextureSet(preparingTextures);
      this.resetTextures();
      this.systems.clear();
      this.state = "unprepared";
      return error instanceof ParticleGeometryFault
        ? particleRejected("particle-resource-decode", error.capability, error.boundary)
        : particleRejected(
            "particle-resource-decode",
            "particle.pixi.prepare-threw",
            "Particle resource decode or native binding construction failure rolls back every texture.",
          );
    }
  }

  preflightFrame(request: ParticleRendererFrameRequest): ParticleOperationResult<ParticleRendererFrameBatch> {
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
    const meshes: PixiParticleLinearColorMesh[] = [];
    let primitives: readonly ParticleNativeRenderPrimitive[];
    try {
      primitives = buildCurrentParticlePrimitives(this.profile, this.scene, request.samples);
      for (let index = 0; index < primitives.length; index += 1) {
        const primitive = primitives[index]!;
        const texture = this.textures.get(primitive.logicalTextureId);
        if (texture === undefined || texture.destroyed) throw new Error("missing primitive texture");
        const mesh = createPixiParticleNativePrimitiveMesh(texture, primitive);
        // One native order sequence replaces the old sortingOrder>20 stage split
        // and arbitrary large-radix zIndex mapping.
        mesh.zIndex = index;
        meshes.push(mesh);
      }
    } catch (error) {
      const cleanupFailures = destroyMeshes(meshes);
      return error instanceof ParticleGeometryFault
        ? this.latchFault(error.capability, error.boundary)
        : this.latchFault(
            "particle.pixi.primitive-allocation-threw",
            cleanupFailures.length === 0
              ? "Detached native primitive allocation failed before any scene mutation."
              : `Detached primitive cleanup continued; failed identities: ${cleanupFailures.join(",")}.`,
          );
    }
    const capability = Object.freeze({
      sessionId: this.sessionId,
      frame: request.frame,
      sampleCount: request.samples.length,
    });
    this.pending = Object.freeze({ capability, meshes: Object.freeze(meshes), primitives });
    return particleAccepted(capability);
  }

  commitFrame(batch: ParticleRendererFrameBatch): ParticleOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    const pending = this.pending;
    if (pending === null || pending.capability !== batch || batch.sessionId !== this.sessionId ||
      (this.nextFrame !== null && batch.frame !== this.nextFrame)) {
      return this.latchFault("particle.pixi.invalid-batch-capability", "Pixi accepts only its exact one-use detached primitive capability.");
    }
    try {
      const failures = this.clearLiveMeshes();
      if (failures.length > 0) throw new Error(failures.join(","));
      for (let index = 0; index < pending.meshes.length; index += 1) {
        this.stage.addChild(pending.meshes[index]!);
        this.liveMeshes.push(pending.meshes[index]!);
        this.livePrimitives.push(pending.primitives[index]!);
      }
    } catch {
      this.pending = null;
      const cleanupFailures = [...destroyMeshes(pending.meshes), ...this.clearLiveMeshes()];
      return this.latchFault(
        "particle.pixi.scene-mutation-threw",
        cleanupFailures.length === 0
          ? "A Pixi particle scene mutation is terminal and clears every live/detached primitive."
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
    const cleanupFailures = destroyMeshes(this.pending.meshes);
    this.pending = null;
    return cleanupFailures.length === 0
      ? particleAccepted(undefined)
      : this.latchFault("particle.pixi.discard-owner-threw", `Discard cleanup failures: ${cleanupFailures.join(",")}.`);
  }

  recordTerminalFault(capability: string, boundary: string): ParticleOperationResult<never> {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
    return this.latchFault(capability, boundary);
  }

  notifyContextLoss(): ParticleOperationResult<never> {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
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
      nodeCount: this.liveMeshes.length,
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
    readonly linearColor: readonly [number, number, number, number];
    readonly blendMode: string;
    readonly textureLabel: string;
    readonly sortingStage: "low" | "high";
    readonly zIndex: number;
  }[] {
    return Object.freeze(this.liveMeshes.map((mesh, index) => {
      const primitive = this.livePrimitives[index]!;
      return Object.freeze({
        particleId: mesh.label,
        position: Object.freeze([
          Math.fround((primitive.bounds.left + primitive.bounds.right) / 2),
          Math.fround((primitive.bounds.top + primitive.bounds.bottom) / 2),
        ] as const),
        scale: Object.freeze([
          Math.fround(primitive.bounds.right - primitive.bounds.left),
          Math.fround(primitive.bounds.bottom - primitive.bounds.top),
        ] as const),
        rotation: 0,
        alpha: primitive.linearColor[3],
        tint: 0xffffff,
        linearColor: mesh.particleLinearColor,
        blendMode: String(mesh.blendMode),
        textureLabel: mesh.particleTextureLabel,
        sortingStage: "low" as const,
        zIndex: mesh.zIndex,
      });
    }));
  }

  dispose(): ParticleOperationResult<void> {
    if (this.state === "disposed") return particleAccepted(undefined);
    const cleanupFailures = [
      ...(this.pending === null ? [] : destroyMeshes(this.pending.meshes, "pending")),
      ...this.clearLiveMeshes(),
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
        boundary: `Pixi particle disposal continued across every owner: ${cleanupFailures.join(",")}.`,
      });
    }
    this.state = "disposed";
    return cleanupFailures.length === 0
      ? particleAccepted(undefined)
      : particleRejected("particle-backend-fault", "particle.pixi.dispose-owner-threw", this.fault!.boundary);
  }

  private validateSamples(samples: readonly ParticleRenderSample[]): ParticleOperationResult<void> {
    const ids = new Set<string>();
    let previous: ParticleRenderSample | null = null;
    for (const sample of samples) {
      const binding = sample === null || typeof sample !== "object" ? undefined : this.systems.get(sample.systemId);
      if (sample === null || typeof sample !== "object" || typeof sample.particleId !== "string" ||
        sample.particleId.length === 0 || ids.has(sample.particleId) || typeof sample.ownerKey !== "string" ||
        sample.ownerKey.length === 0 || !isNativeInstance(sample.instance) || binding === undefined) {
        return this.reject("particle.pixi.invalid-sample-identity", "Every sample requires one unique particle, explicit native owner transform and exact prepared system.");
      }
      ids.add(sample.particleId);
      const profile = binding.bundle.profiles[binding.system.profile]!;
      const uvKey = profile.modules.UVModule;
      const uv = uvKey === undefined ? null : binding.bundle.moduleProfiles.UVModule?.[uvKey] ?? null;
      if (sample.root !== binding.system.root || sample.material !== binding.materialName ||
        sample.sortingOrder !== binding.renderer.m_SortingOrder || sample.renderMode !== binding.renderer.m_RenderMode ||
        sample.renderAlignment !== binding.renderer.m_RenderAlignment ||
        sample.meshProfile !== (binding.system.meshProfile ?? null) ||
        sample.sortingLayerId !== binding.renderer.m_SortingLayerID ||
        particleFloat32FromBits(sample.sortingFudgeBits ?? "") !== binding.renderer.m_SortingFudge ||
        sample.rendererPriority !== binding.renderer.m_RendererPriority ||
        sample.sourceOrdinal !== binding.system.sourceOrdinal || !Number.isSafeInteger(sample.ownerGeneration) || sample.ownerGeneration! < 1 ||
        !Number.isSafeInteger(sample.ownerSortOrdinal) || sample.ownerSortOrdinal! < 0 ||
        !Number.isSafeInteger(sample.creationSequence) || sample.creationSequence < 1 ||
        !Number.isInteger(sample.uvFrame) || sample.uvFrame < 0 || sample.uvFrame >= (uv?.tilesX ?? 1) * (uv?.tilesY ?? 1) ||
        !sampleBitsFinite(sample)) {
        return this.reject("particle.pixi.sample-profile-mismatch", "Samples must match exact current renderer/material/mesh/UV/source-order and finite binary32 state.");
      }
      if (previous !== null && compareSamples(previous, sample) > 0) {
        return this.reject("particle.pixi.sample-order-mismatch", "Particle handoff order is renderer order, concrete owner, source ordinal and native storage creation order.");
      }
      previous = sample;
    }
    return particleAccepted(undefined);
  }

  private clearLiveMeshes(): readonly string[] {
    const failures: string[] = [];
    for (const mesh of this.liveMeshes.splice(0)) {
      try { destroyPixiParticleLinearColorMesh(mesh); } catch { failures.push(`live-mesh:${mesh.label}`); }
    }
    this.livePrimitives.splice(0);
    return failures;
  }

  private resetTextures(): readonly string[] {
    const failures: string[] = [];
    for (const texture of this.uniqueBaseTextures) {
      try { if (!texture.destroyed) texture.destroy(true); } catch { failures.push(`base-texture:${texture.label ?? "unlabelled"}`); }
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
      const failures = [
        ...(this.pending === null ? [] : destroyMeshes(this.pending.meshes, "pending")),
        ...this.clearLiveMeshes(),
      ];
      this.fault = Object.freeze({
        code: "particle-backend-fault",
        capability,
        boundary: failures.length === 0 ? boundary : `${boundary} Secondary cleanup failures: ${failures.join(",")}.`,
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
    return particleRejected("terminal-disposed", "particle.pixi.terminal-disposed", "Disposed Pixi particle sessions reject every API except repeated dispose.");
  }

  private reject(capability: string, boundary: string): ParticleOperationResult<never> {
    return particleRejected("integrity-failure", capability, boundary);
  }
}

function buildSystemBindings(profile: ParticlePortableProfile): ParticleOperationResult<ReadonlyMap<string, SystemRenderBinding>> {
  const bindings = new Map<string, SystemRenderBinding>();
  let enabledCount = 0;
  for (const bundle of profile.bundles) {
    const materials = new Map(bundle.materials.map((material) => [material.name, material]));
    for (const system of bundle.systems) {
      const definition = bundle.profiles[system.profile];
      const renderer = definition === undefined ? undefined : bundle.rendererProfiles[definition.renderer];
      if (definition === undefined || renderer === undefined) {
        return particleRejected("integrity-failure", "particle.pixi.missing-system-renderer", "Every system must resolve its current profile and complete renderer.");
      }
      if (!renderer.m_Enabled) continue;
      enabledCount += 1;
      const reference = renderer.m_Materials[0] ?? null;
      const material = reference === null ? undefined : materials.get(reference.name);
      if (material === undefined || material.texture === null || material.fragment === undefined ||
        material.sourceBlendFactor === undefined || material.destinationBlendFactor === undefined) {
        return particleRejected("integrity-failure", "particle.pixi.missing-visible-material", "Every enabled current renderer requires exact slot-0 material semantics and texture.");
      }
      if (renderer.m_RenderMode === 4 && (system.meshProfile === null || system.meshProfile === undefined ||
        bundle.meshProfiles?.[system.meshProfile] === undefined)) {
        return particleRejected("integrity-failure", "particle.pixi.missing-visible-mesh", "Every enabled current mode-4 renderer requires exact source mesh geometry.");
      }
      bindings.set(system.identity, Object.freeze({
        bundle,
        system,
        renderer,
        materialName: material.name,
        logicalTextureId: `particle-texture:${bundle.key}:${material.texture}`,
      }));
    }
  }
  return bindings.size === enabledCount && enabledCount > 0
    ? particleAccepted(bindings)
    : particleRejected("integrity-failure", "particle.pixi.renderer-binding-relation", "Enabled bindings are derived from the complete prepared inventory without a literal count.");
}

function validateScene(scene: ParticlePixiSceneProfile): ParticleOperationResult<ParticlePixiSceneProfile> {
  const ppu = scene === null || typeof scene !== "object" ? null : particleFloat32FromBits(scene.pixelsPerWorldUnitBits);
  const legacyScale = scene === null || typeof scene !== "object" ? null : particleFloat32FromBits(scene.gameplayTransformScaleBits);
  const gameClearAuthoredScale = scene?.gameClearOwner === undefined
    ? null
    : particleFloat32FromBits(scene.gameClearOwner.authoredUiScaleBits);
  const gameClearOwnerScale = scene?.gameClearOwner === undefined
    ? null
    : particleFloat32FromBits(scene.gameClearOwner.transform.scale.xBits);
  if (scene === null || typeof scene !== "object" || !Number.isSafeInteger(scene.viewportWidth) || scene.viewportWidth <= 0 ||
    !Number.isSafeInteger(scene.viewportHeight) || scene.viewportHeight <= 0 || scene.viewportWidth < scene.viewportHeight ||
    scene.worldCenterXBits !== "0x00000000" || scene.worldCenterYBits !== "0x00000000" ||
    ppu !== Math.fround(scene.viewportHeight / 2) || legacyScale === null || legacyScale <= 0 || scene.roundPixels !== false ||
    !Array.isArray(scene.buttonAnchors) || scene.buttonAnchors.length !== 15 ||
    !Array.isArray(scene.buttonOwners) || scene.buttonOwners.length !== 15 || scene.slidePool === undefined ||
    scene.gameClearOwner === undefined || scene.gameClearOwner.transform.source !== "game-clear-ui-root" ||
    scene.gameClearOwner.particleSystemSetupScaleBits !== "0x3F800000" ||
    gameClearAuthoredScale === null || gameClearAuthoredScale <= 0 || gameClearOwnerScale === null ||
    gameClearOwnerScale !== Math.fround(gameClearAuthoredScale / ppu) ||
    !finiteOwnerTransform(scene.gameClearOwner.transform) ||
    scene.slidePool.poolSize !== 8 || scene.slidePool.initialCursor !== 0 || scene.slidePool.firstAcquiredSlot !== 1 ||
    positiveBits(scene.slidePool.outerScaleBits) === null || positiveBits(scene.slidePool.particleSystemSetupScaleBits) === null ||
    scene.buttonOwners.some((owner, index) => owner.buttonType !== (index < 7 ? index : index + 1) ||
      owner.transform.source !== "game-play-button" || positiveBits(owner.particleSystemSetupScaleBits) === null ||
      !finiteOwnerTransform(owner.transform))) {
    return particleRejected(
      "integrity-failure",
      "particle.pixi.invalid-scene-profile",
      "Particle projection requires exact camera, 15 typed GamePlayButton owners and current eight-slot NoteSlide pool transforms.",
    );
  }
  return particleAccepted(scene);
}

function isNativeInstance(value: ParticleInstanceIdentity): boolean {
  if (value === null || typeof value !== "object" || value.ownerTransform === undefined ||
    positiveBits(value.particleSystemSetupScaleBits ?? "") === null || !finiteOwnerTransform(value.ownerTransform)) return false;
  if (value.kind === "game-clear") {
    return (value.clearStatus === 1 || value.clearStatus === 2 || value.clearStatus === 3) &&
      value.buttonType === 0 && value.rangeLength === null &&
      value.ownerTransform.source === "game-clear-ui-root" &&
      value.particleSystemSetupScaleBits === "0x3F800000";
  }
  if (value.kind === "game-play-button") {
    return Number.isInteger(value.buttonType) && value.buttonType >= 0 && value.buttonType <= 15 &&
      (value.rangeLength === null || Number.isInteger(value.rangeLength) && value.rangeLength >= 1 && value.rangeLength <= 7) &&
      value.ownerTransform.source === "game-play-button";
  }
  return Number.isSafeInteger(value.noteIndex) && value.noteIndex >= 0 &&
    Number.isSafeInteger(value.absolutePosition) && value.absolutePosition >= 0 && Number.isInteger(value.rangeLength) && value.rangeLength >= 1 &&
    Number.isInteger(value.poolSlot) && value.poolSlot! >= 0 && value.poolSlot! < 8 &&
    (value.route === "original" || value.route === "product-extension") &&
    value.ownerTransform.source === (value.route === "original" ? "original-note-slide" : "product-extension-note-slide") &&
    value.rootPositionXBits === value.ownerTransform.position.xBits && value.rootPositionYBits === value.ownerTransform.position.yBits &&
    value.rootScaleBits === value.ownerTransform.scale.xBits;
}

function finiteOwnerTransform(transform: ParticleOwnerTransform): boolean {
  return [transform.position.xBits, transform.position.yBits, transform.position.zBits,
    transform.rotation.xBits, transform.rotation.yBits, transform.rotation.zBits, transform.rotation.wBits,
    transform.scale.xBits, transform.scale.yBits, transform.scale.zBits]
    .every((bits) => particleFloat32FromBits(bits) !== null) &&
    [transform.scale.xBits, transform.scale.yBits, transform.scale.zBits]
      .every((bits) => positiveBits(bits) !== null);
}

function positiveBits(bits: string): number | null {
  const value = particleFloat32FromBits(bits);
  return value !== null && value > 0 ? value : null;
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
  return left.sortingLayerId! - right.sortingLayerId! || left.sortingOrder - right.sortingOrder ||
    particleFloat32FromBits(left.sortingFudgeBits!)! - particleFloat32FromBits(right.sortingFudgeBits!)! ||
    left.rendererPriority! - right.rendererPriority! ||
    left.ownerSortOrdinal! - right.ownerSortOrdinal! ||
    left.sourceOrdinal! - right.sourceOrdinal! ||
    left.creationSequence - right.creationSequence;
}

function applyTextureSettings(texture: Texture, wrapU: 0 | 1, wrapV: 0 | 1): void {
  texture.source.scaleMode = "linear";
  texture.source.style.addressModeU = wrapU === 0 ? "repeat" : "clamp-to-edge";
  texture.source.style.addressModeV = wrapV === 0 ? "repeat" : "clamp-to-edge";
  texture.source.style.update();
  texture.source.autoGenerateMipmaps = false;
  texture.source.alphaMode = "no-premultiply-alpha";
  texture.source.format = "rgba8unorm-srgb";
}

function destroyMeshes(meshes: readonly PixiParticleLinearColorMesh[], ownerPrefix = "detached"): readonly string[] {
  const failures: string[] = [];
  for (const mesh of meshes) {
    try { destroyPixiParticleLinearColorMesh(mesh); } catch { failures.push(`${ownerPrefix}-mesh:${mesh.label}`); }
  }
  return failures;
}

function destroyTextureSet(textures: ReadonlySet<Texture>): readonly string[] {
  const failures: string[] = [];
  for (const texture of textures) {
    try { if (!texture.destroyed) texture.destroy(true); } catch { failures.push(`texture:${texture.label ?? "unlabelled"}`); }
  }
  return failures;
}
