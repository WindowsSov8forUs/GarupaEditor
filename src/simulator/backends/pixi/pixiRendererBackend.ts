import {
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Rectangle,
  Sprite,
  Text,
  Texture,
  type DestroyOptions,
} from "pixi.js";
import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../../engine/evidence";
import { RecordingSimulatorRendererBackend } from "../recordingRendererBackend";
import { validateAndFreezeRenderProfile } from "../renderingValidation";
import type {
  RenderBackendSnapshot,
  RenderCommand,
  RenderCommandBatch,
  RenderOrthographicProjectionProfile,
  RenderResourceAssetProfile,
  RenderResourcePreflightAdapter,
  RenderResourceProfile,
  SimulatorRendererBackend,
  SimulatorResourceProvider,
} from "../renderingContracts";

export interface PixiTextureDecoder {
  decodePng(
    asset: RenderResourceAssetProfile,
    bytes: Uint8Array,
  ): Promise<SimulatorResult<Texture>>;
}

export interface PixiSceneObjectFactory {
  create(role: string, renderObjectId: string, roundPixels: boolean): Container;
}

interface PendingPixiBatch {
  readonly recordingBatch: RenderCommandBatch;
  readonly commands: readonly RenderCommand[];
  readonly reservedNodes: ReadonlyMap<number, Container>;
  readonly reservedGeometry: ReadonlyMap<number, Mesh>;
  readonly reservedMasks: ReadonlyMap<number, Graphics>;
}

interface PixiHudVisual {
  readonly content: Container;
  readonly text: Text;
  readonly primaryFill: Graphics;
  readonly secondaryFill: Graphics;
  readonly animationLayer: Container;
  readonly digitSprites: Sprite[];
  readonly scoreDigitTexts: Text[];
  fillRatios: readonly [number, number];
}

type EvidenceAnimationRole =
  | "combo"
  | "all-perfect"
  | "add-score"
  | "result"
  | "life-heal"
  | "damage-guard"
  | "never-die"
  | "score-skill"
  | "judge-skill"
  | "fever"
  | "habahiro-lane-change"
  | "note-flick"
  | "note-directional-flick"
  | "note-long-flash";

interface PixiObjectRecord {
  readonly role: string;
  readonly node: Container;
  ordering: readonly [number, number, number, number];
  hudState: Readonly<Record<string, string | number | boolean | null>> | null;
  spriteBindingKey: string | null;
  hudBindingKeys: string[];
  spriteContent: Sprite | null;
  materialTexture: Texture | null;
  geometryContent: Mesh | null;
  maskContent: Graphics | null;
  thresholdMaskContent: Graphics | null;
  threshold: number | null;
  maskVertexCount: number | null;
  hudVisual: PixiHudVisual | null;
  activeAnimationRole: EvidenceAnimationRole | null;
  animationElapsedSeconds: number | null;
}

interface PixiShadowObject {
  readonly role: string;
  readonly parentObjectId: string | null;
  readonly materialBound: boolean;
  readonly maskConfigured: boolean;
  readonly activeAnimationRole: EvidenceAnimationRole | null;
}

export class PixiRendererBackend implements SimulatorRendererBackend {
  readonly id = "pixi-v8-renderer";

  readonly stage: Container;
  private readonly recording = new RecordingSimulatorRendererBackend();
  private readonly objects = new Map<string, PixiObjectRecord>();
  private readonly baseTextures = new Map<string, Texture>();
  private readonly spriteTextures = new Map<string, Texture>();
  private readonly spriteReferenceCounts = new Map<string, number>();
  private readonly pending = new Map<RenderCommandBatch, PendingPixiBatch>();
  private profile: RenderResourceProfile | null = null;

  constructor(
    private readonly decoder: PixiTextureDecoder,
    private readonly objectFactory: PixiSceneObjectFactory = defaultObjectFactory,
  ) {
    this.stage = new Container({ label: "GarupaSimulatorRoot", sortableChildren: true });
    this.stage.sortableChildren = true;
  }

  async prepare(
    sessionId: string,
    profile: RenderResourceProfile,
    provider: SimulatorResourceProvider,
    preflight: RenderResourcePreflightAdapter,
  ): Promise<SimulatorResult<void>> {
    if (this.recording.snapshot().state !== "unprepared") {
      return reject(
        "render.pixi.prepare-invalid-state",
        "A Pixi renderer session is prepared exactly once and never silently reloaded.",
      );
    }
    if (this.stage.destroyed || this.stage.children.length !== 0) {
      return reject(
        "render.pixi.stage-not-empty-or-destroyed",
        "The injected Pixi stage must be live and empty before atomic prepare.",
      );
    }
    const frozenProfile = validateAndFreezeRenderProfile(profile);
    if (frozenProfile.status !== "ok") return frozenProfile;
    const cache = new CachingProvider(provider);
    const validator = new RecordingSimulatorRendererBackend();
    const validated = await validator.prepare(
      sessionId,
      frozenProfile.value,
      cache,
      preflight,
    );
    if (validated.status !== "ok") return validated;
    validator.dispose();

    const decodedIdentities = new Set<Texture>();
    try {
      for (const asset of frozenProfile.value.assets) {
        if (asset.mime !== "image/png") continue;
        const bytes = cache.get(asset.logicalAssetId);
        if (bytes === undefined) {
          this.resetPreparedTextures();
          return reject(
            "render.pixi.validated-bytes-unavailable",
            "Pixi decode consumes the exact bytes already validated during the same atomic prepare.",
          );
        }
        const decoded = await this.decoder.decodePng(asset, bytes);
        if (decoded.status !== "ok") {
          this.resetPreparedTextures();
          return decoded;
        }
        const base = decoded.value;
        if (decodedIdentities.has(base)) {
          this.resetPreparedTextures();
          return reject(
            "render.pixi.decoder-texture-alias",
            "Each logical image asset must return one independently owned decoded Texture identity.",
          );
        }
        decodedIdentities.add(base);
        if (base.source.width !== asset.width || base.source.height !== asset.height) {
          base.destroy(true);
          this.resetPreparedTextures();
          return reject(
            "render.pixi.decoded-dimension-mismatch",
            "Decoded Pixi Texture dimensions must match the hash-validated profile.",
          );
        }
        this.baseTextures.set(asset.logicalAssetId, base);
        applyTextureSettings(base, asset);
        for (const row of asset.atlasRows) {
          const texture = new Texture({
            source: base.source,
            frame: new Rectangle(row.x, row.y, row.width, row.height),
            orig: new Rectangle(0, 0, row.width, row.height),
            defaultAnchor: { x: row.pivotX, y: row.pivotY },
            label: `${asset.logicalAssetId}:${row.exactKey}`,
          });
          this.spriteTextures.set(spriteKey(asset.logicalAssetId, row.exactKey), texture);
        }
      }
    } catch {
      this.resetPreparedTextures();
      return reject(
        "render.pixi.decode-or-texture-create-threw",
        "Pixi decode and subtexture construction fail before the backend becomes ready.",
      );
    }

    const ready = await this.recording.prepare(
      sessionId,
      frozenProfile.value,
      cache,
      preflight,
    );
    if (ready.status !== "ok") {
      this.resetPreparedTextures();
      return ready;
    }
    this.profile = frozenProfile.value;
    return ok(undefined);
  }

  preflight(commands: readonly RenderCommand[]): SimulatorResult<RenderCommandBatch> {
    const recordingBatch = this.recording.preflight(commands);
    if (recordingBatch.status !== "ok") {
      if (this.recording.snapshot().state === "faulted") {
        this.resetSceneAfterTerminalMutation();
        this.recording.resetObjectsAfterTerminalRendererMutation();
      }
      return recordingBatch;
    }
    const supported = this.validatePixiBatch(commands);
    if (supported.status !== "ok") {
      this.recording.discard(recordingBatch.value);
      return supported;
    }
    const reservedNodes = new Map<number, Container>();
    const reservedGeometry = new Map<number, Mesh>();
    const reservedMasks = new Map<number, Graphics>();
    try {
      for (const command of commands) {
        if (command.kind === "create-object" || command.kind === "acquire-object") {
          const node = this.objectFactory.create(
            command.role,
            command.renderObjectId,
            this.profile!.scene.roundPixels,
          );
          if (
            node.destroyed ||
            node.parent !== null ||
            (spriteRole(command.role) && spriteChild(node) === null)
          ) {
            node.destroy({ children: true } as DestroyOptions);
            throw new Error("invalid reserved Pixi node");
          }
          node.label = command.renderObjectId;
          node.visible = false;
          reservedNodes.set(command.sequence, node);
        } else if (command.kind === "set-mesh") {
          reservedGeometry.set(command.sequence, createEvidenceMesh(command));
        } else if (command.kind === "set-line") {
          reservedGeometry.set(command.sequence, createEvidenceLine(
            command,
            this.profile!.scene.projection,
          ));
        } else if (command.kind === "set-mask") {
          reservedMasks.set(command.sequence, createEvidenceMask(command));
        } else if (command.kind === "set-threshold") {
          reservedMasks.set(command.sequence, createThresholdMask(
            command.threshold.value,
            this.profile!.scene.projection,
          ));
        }
      }
    } catch {
      for (const node of reservedNodes.values()) {
        node.destroy({ children: true } as DestroyOptions);
      }
      for (const mesh of reservedGeometry.values()) destroyMesh(mesh);
      for (const mask of reservedMasks.values()) mask.destroy();
      this.recording.discard(recordingBatch.value);
      return reject(
        "render.pixi.preflight-object-create-threw",
        "Pixi object and geometry allocation is reserved during preflight so allocation failure precedes domain mutation.",
      );
    }
    const capability = Object.freeze({ ...recordingBatch.value });
    this.pending.set(capability, Object.freeze({
      recordingBatch: recordingBatch.value,
      commands: Object.freeze(commands.map(copyPixiCommand)),
      reservedNodes,
      reservedGeometry,
      reservedMasks,
    }));
    return ok(capability);
  }

  commit(batch: RenderCommandBatch): SimulatorResult<void> {
    const pending = this.pending.get(batch);
    if (pending === undefined) {
      const fault = this.recording.recordTerminalFault(
        "render.pixi.invalid-batch-capability",
        "Pixi accepts only its own one-use preflight capability.",
      );
      this.resetSceneAfterTerminalMutation();
      this.recording.resetObjectsAfterTerminalRendererMutation();
      return fault;
    }
    try {
      for (const command of pending.commands) {
        this.apply(command, pending.reservedNodes, pending.reservedGeometry, pending.reservedMasks);
      }
    } catch {
      this.pending.delete(batch);
      this.recording.discard(pending.recordingBatch);
      this.resetSceneAfterTerminalMutation(pending);
      this.recording.resetObjectsAfterTerminalRendererMutation();
      return this.recording.recordTerminalFault(
        "render.pixi.scene-mutation-threw",
        "A Pixi scene exception terminates the renderer and is never converted to a no-op.",
      );
    }
    const committed = this.recording.commit(pending.recordingBatch);
    this.pending.delete(batch);
    return committed;
  }

  discard(batch: RenderCommandBatch): SimulatorResult<void> {
    const pending = this.pending.get(batch);
    if (pending === undefined) {
      const fault = this.recording.recordTerminalFault(
        "render.pixi.invalid-discard-capability",
        "Pixi discards only its exact pending batch capability.",
      );
      this.resetSceneAfterTerminalMutation();
      this.recording.resetObjectsAfterTerminalRendererMutation();
      return fault;
    }
    this.pending.delete(batch);
    this.destroyUnownedReservations(
      pending.reservedNodes,
      pending.reservedGeometry,
      pending.reservedMasks,
    );
    return this.recording.discard(pending.recordingBatch);
  }

  execute(command: RenderCommand): SimulatorResult<void> {
    const batch = this.preflight([command]);
    return batch.status === "ok" ? this.commit(batch.value) : batch;
  }

  snapshot(): RenderBackendSnapshot {
    return this.recording.snapshot();
  }

  notifyContextLoss(): SimulatorResult<void> {
    const state = this.recording.snapshot().state;
    if (state !== "ready" && state !== "faulted") {
      return reject(
        "render.pixi.context-loss-outside-ready-session",
        "Context-loss notification is valid only for an active or already faulted Pixi session.",
      );
    }
    const fault = this.recording.recordTerminalFault(
      "render.pixi.context-lost",
      "WebGL/WebGPU context loss is terminal for the current renderer session and never auto-reloads resources.",
    );
    this.resetSceneAfterTerminalMutation();
    this.recording.resetObjectsAfterTerminalRendererMutation();
    return fault;
  }

  resourceSnapshot(): readonly {
    readonly logicalAssetId: string;
    readonly decoded: boolean;
    readonly atlasTextureCount: number;
    readonly spriteReferenceCount: number;
  }[] {
    return Object.freeze((this.profile?.assets ?? []).map((asset) => Object.freeze({
      logicalAssetId: asset.logicalAssetId,
      decoded: this.baseTextures.has(asset.logicalAssetId),
      atlasTextureCount: asset.atlasRows.length,
      spriteReferenceCount: [...this.spriteReferenceCounts].reduce(
        (total, [key, count]) => key.startsWith(`${asset.logicalAssetId}\u0000`)
          ? total + count
          : total,
        0,
      ),
    })));
  }

  sceneSnapshot(): readonly {
    readonly renderObjectId: string;
    readonly role: string;
    readonly visible: boolean;
    readonly alpha: number;
    readonly position: readonly [number, number];
    readonly parent: string | null;
    readonly ordering: readonly [number, number, number, number];
    readonly hudState: Readonly<Record<string, string | number | boolean | null>> | null;
    readonly geometryVertexCount: number | null;
    readonly geometryIndexCount: number | null;
    readonly geometryPositions: readonly number[] | null;
    readonly maskVertexCount: number | null;
    readonly threshold: number | null;
    readonly hudText: string | null;
    readonly hudSpriteCount: number | null;
    readonly hudScoreDigitCount: number | null;
    readonly hudFillRatios: readonly [number, number] | null;
    readonly activeAnimationRole: EvidenceAnimationRole | null;
    readonly animationElapsedSeconds: number | null;
  }[] {
    const idsByNode = new Map([...this.objects].map(([id, value]) => [value.node, id]));
    return Object.freeze([...this.objects].map(([renderObjectId, value]) => Object.freeze({
      renderObjectId,
      role: value.role,
      visible: value.node.visible,
      alpha: value.node.alpha,
      position: Object.freeze([value.node.position.x, value.node.position.y] as const),
      parent: value.node.parent === this.stage
        ? null
        : idsByNode.get(value.node.parent as Container) ?? null,
      ordering: value.ordering,
      hudState: value.hudState,
      geometryVertexCount: value.geometryContent?.geometry.positions.length
        ? value.geometryContent.geometry.positions.length / 2
        : null,
      geometryIndexCount: value.geometryContent?.geometry.indices.length ?? null,
      geometryPositions: value.geometryContent === null
        ? null
        : Object.freeze(Array.from(value.geometryContent.geometry.positions)),
      maskVertexCount: value.maskVertexCount,
      threshold: value.threshold,
      hudText: value.hudVisual?.text.text ?? null,
      hudSpriteCount: value.hudVisual?.digitSprites.length ?? null,
      hudScoreDigitCount: value.hudVisual?.scoreDigitTexts.length ?? null,
      hudFillRatios: value.hudVisual?.fillRatios ?? null,
      activeAnimationRole: value.activeAnimationRole,
      animationElapsedSeconds: value.animationElapsedSeconds,
    })));
  }

  dispose(): SimulatorResult<void> {
    for (const value of [...this.objects.values()].reverse()) {
      if (value.geometryContent !== null) destroyMesh(value.geometryContent);
      value.node.removeFromParent();
      value.node.destroy({ children: true } as DestroyOptions);
    }
    this.objects.clear();
    for (const pending of this.pending.values()) {
      this.destroyUnownedReservations(
        pending.reservedNodes,
        pending.reservedGeometry,
        pending.reservedMasks,
      );
    }
    this.pending.clear();
    for (const texture of this.spriteTextures.values()) texture.destroy(false);
    for (const texture of this.baseTextures.values()) texture.destroy(true);
    this.spriteTextures.clear();
    this.spriteReferenceCounts.clear();
    this.baseTextures.clear();
    this.profile = null;
    return this.recording.dispose();
  }

  private supports(command: RenderCommand): boolean {
    switch (command.kind) {
      case "create-object":
      case "acquire-object":
      case "activate-object":
      case "hide-object":
      case "deactivate-object":
      case "release-object":
        return true;
      case "set-transform":
      case "set-mask":
      case "set-hud":
        return true;
      case "bind-resource":
        if (command.binding === "sprite") {
          return command.exactKey !== null &&
            this.spriteTextures.has(spriteKey(command.logicalAssetId, command.exactKey));
        }
        if (command.binding === "material" && command.exactKey === null) {
          const asset = this.profile?.assets.find(
            (candidate) => candidate.logicalAssetId === command.logicalAssetId,
          );
          return (asset?.materialRole === "sync-line" ||
            asset?.materialRole === "multiple-directional-line" ||
            asset?.materialRole === "long-note" || asset?.materialRole === "curve-note") &&
            this.baseTextures.has(command.logicalAssetId);
        }
        return false;
      case "set-mesh":
        return command.materialRole === "long-note" || command.materialRole === "curve-note";
      case "set-line":
        return command.materialRole === "sync-line" ||
          command.materialRole === "multiple-directional-line";
      case "play-animation":
      case "stop-animation":
      case "sample-animation":
        return isEvidenceAnimationRole(command.animationRole);
      case "set-threshold":
        return command.threshold.value >= 0 && Number.isFinite(command.threshold.value);
    }
  }

  private validatePixiBatch(
    commands: readonly RenderCommand[],
  ): SimulatorResult<void> {
    const nodeIds = new Map([...this.objects].map(([id, value]) => [value.node, id]));
    const shadow = new Map<string, PixiShadowObject>();
    for (const [id, value] of this.objects) {
      shadow.set(id, {
        role: value.role,
        parentObjectId: value.node.parent === this.stage
          ? null
          : nodeIds.get(value.node.parent as Container) ?? null,
        materialBound: value.materialTexture !== null,
        maskConfigured: value.maskContent !== null,
        activeAnimationRole: value.activeAnimationRole,
      });
    }
    for (const command of commands) {
      if (!this.supports(command)) {
        return reject(
          "render.pixi.unsupported-semantic-command",
          "Pixi rejects unimplemented mesh, line, mask, HUD and animation mappings instead of applying defaults.",
        );
      }
      switch (command.kind) {
        case "create-object":
        case "acquire-object":
          shadow.set(command.renderObjectId, {
            role: command.role,
            parentObjectId: command.parentObjectId,
            materialBound: false,
            maskConfigured: false,
            activeAnimationRole: null,
          });
          break;
        case "release-object":
          if ([...shadow.values()].some(
            (candidate) => candidate.parentObjectId === command.renderObjectId,
          )) {
            return reject(
              "render.pixi.release-object-with-live-children",
              "Pixi child identities must be released before their parent identity.",
            );
          }
          shadow.delete(command.renderObjectId);
          break;
        case "bind-resource": {
          const role = shadow.get(command.renderObjectId)!.role;
          if (
            (command.binding === "sprite" && !spriteRole(role)) ||
            (command.binding === "material" &&
              role !== "sync-line" &&
              role !== "multiple-directional-line" && role !== "note-mesh")
          ) {
            return reject(
              "render.pixi.resource-binding-role-mismatch",
              "Sprite and Note/line material bindings require their exact engine-authored object roles.",
            );
          }
          if (command.binding === "material") {
            shadow.set(command.renderObjectId, {
              ...shadow.get(command.renderObjectId)!,
              materialBound: true,
              maskConfigured: shadow.get(command.renderObjectId)!.maskConfigured,
              activeAnimationRole: shadow.get(command.renderObjectId)!.activeAnimationRole,
            });
          }
          break;
        }
        case "activate-object":
        case "hide-object":
        case "deactivate-object":
          break;
        case "set-transform":
          if (
            command.maskObjectId !== null &&
            (shadow.get(command.maskObjectId)?.role !== "mask" ||
              !shadow.get(command.maskObjectId)?.maskConfigured)
          ) {
            return reject(
              "render.pixi.invalid-mask-reference",
              "A transform may reference only one configured visible-inside mask identity from the same session.",
            );
          }
          break;
        case "set-mask":
          if (shadow.get(command.renderObjectId)!.role !== "mask") {
            return reject(
              "render.pixi.mask-role-mismatch",
              "Only an explicit mask object may receive portable polygon geometry.",
            );
          }
          shadow.set(command.renderObjectId, {
            ...shadow.get(command.renderObjectId)!,
            maskConfigured: true,
          });
          break;
        case "set-mesh":
          if (
            shadow.get(command.renderObjectId)!.role !== "note-mesh" ||
            !isEvidenceMesh(command)
          ) {
            return reject(
              "render.pixi.mesh-outside-r7-profile",
              "Pixi accepts the current ordinary R7 base/advanced uniform-color NoteMesh profiles.",
            );
          }
          break;
        case "set-line":
          if (
            (shadow.get(command.renderObjectId)!.role === "sync-line"
              ? command.materialRole !== "sync-line"
              : shadow.get(command.renderObjectId)!.role === "multiple-directional-line"
              ? command.materialRole !== "multiple-directional-line"
              : true) ||
            !shadow.get(command.renderObjectId)!.materialBound ||
            !isEvidenceLine(command)
          ) {
            return reject(
              "render.pixi.line-outside-r2-r4-profile",
              "Pixi accepts only positive-width non-degenerate ordinary R2 sync or R4 MultipleDirectional line segments.",
            );
          }
          break;
        case "set-hud":
          if (!isEvidenceHud(command, shadow.get(command.renderObjectId)!.role, this.spriteTextures)) {
            return reject(
              "render.pixi.hud-outside-r3-profile",
              "Pixi accepts only the current ordinary R3 bitmap/text/fill HUD state shapes and exact combo digit keys.",
            );
          }
          break;
        case "play-animation": {
          const object = shadow.get(command.renderObjectId)!;
          const requiredSprite = command.animationRole === "life-heal"
            ? "UI_effect_life_plus_icon"
            : command.animationRole === "damage-guard"
            ? "effect_health_guard_outline"
            : command.animationRole === "never-die"
            ? "effect_health_guts_outline"
            : null;
          if (
            !animationMatchesRole(command.animationRole, object.role) ||
            requiredSprite !== null && findTextureBinding(this.spriteTextures, requiredSprite) === null
          ) {
            return reject(
              "render.pixi.animation-role-mismatch",
              "Portable R7 animation roles require their exact engine-owned HUD/Note owner and frozen Sprite key where applicable.",
            );
          }
          shadow.set(command.renderObjectId, {
            ...object,
            activeAnimationRole: requireEvidenceAnimationRole(command.animationRole),
          });
          break;
        }
        case "sample-animation":
        case "stop-animation": {
          const object = shadow.get(command.renderObjectId)!;
          if (object.activeAnimationRole !== command.animationRole) {
            return reject(
              "render.pixi.animation-owner-not-playing",
              "Animation sample/stop commands require the same owner-local role to have been started first.",
            );
          }
          if (command.kind === "stop-animation") {
            shadow.set(command.renderObjectId, {
              ...object,
              activeAnimationRole: null,
            });
          }
          break;
        }
        case "set-threshold":
          if (shadow.get(command.renderObjectId)!.role !== "note-mesh") {
            return reject(
              "render.pixi.threshold-role-mismatch",
              "The current bottom-left threshold semantic applies only to a NoteMesh owner.",
            );
          }
          break;
      }
    }
    return ok(undefined);
  }

  private apply(
    command: RenderCommand,
    reservedNodes: ReadonlyMap<number, Container>,
    reservedGeometry: ReadonlyMap<number, Mesh>,
    reservedMasks: ReadonlyMap<number, Graphics>,
  ): void {
    switch (command.kind) {
      case "create-object":
      case "acquire-object": {
        const node = reservedNodes.get(command.sequence)!;
        const parent = command.parentObjectId === null
          ? this.stage
          : this.objects.get(command.parentObjectId)!.node;
        parent.addChild(node);
        this.objects.set(command.renderObjectId, {
          role: command.role,
          node,
          ordering: Object.freeze([0, 0, 0, command.sequence]),
          hudState: null,
          spriteBindingKey: null,
          hudBindingKeys: [],
          spriteContent: spriteChild(node),
          materialTexture: null,
          geometryContent: null,
          maskContent: null,
          thresholdMaskContent: null,
          threshold: null,
          maskVertexCount: null,
          hudVisual: null,
          activeAnimationRole: null,
          animationElapsedSeconds: null,
        });
        return;
      }
      case "activate-object":
        this.objects.get(command.renderObjectId)!.node.visible = true;
        return;
      case "hide-object":
      case "deactivate-object":
        this.objects.get(command.renderObjectId)!.node.visible = false;
        return;
      case "release-object": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.spriteBindingKey !== null) this.decrementSpriteReference(object.spriteBindingKey);
        for (const bindingKey of object.hudBindingKeys) this.decrementSpriteReference(bindingKey);
        if (object.geometryContent !== null) destroyMesh(object.geometryContent);
        object.node.removeFromParent();
        object.node.destroy({ children: true } as DestroyOptions);
        this.objects.delete(command.renderObjectId);
        return;
      }
      case "bind-resource": {
        const object = this.objects.get(command.renderObjectId)!;
        const asset = this.profile!.assets.find(
          (candidate) => candidate.logicalAssetId === command.logicalAssetId,
        )!;
        const bindingKey = command.binding === "sprite"
          ? spriteKey(command.logicalAssetId, command.exactKey!)
          : materialKey(command.logicalAssetId);
        if (command.binding === "sprite") {
          const node = object.spriteContent!;
          node.texture = this.spriteTextures.get(bindingKey)!;
          node.anchor.copyFrom(node.texture.defaultAnchor ?? { x: 0, y: 0 });
          node.blendMode = asset.textureSettings!.blendMode;
        } else {
          const texture = this.baseTextures.get(command.logicalAssetId)!;
          object.materialTexture = texture;
          if (object.geometryContent !== null) {
            object.geometryContent.texture = texture;
            object.geometryContent.blendMode = asset.textureSettings!.blendMode;
          }
        }
        if (object.spriteBindingKey !== bindingKey) {
          if (object.spriteBindingKey !== null) {
            this.decrementSpriteReference(object.spriteBindingKey);
          }
          this.spriteReferenceCounts.set(
            bindingKey,
            (this.spriteReferenceCounts.get(bindingKey) ?? 0) + 1,
          );
          object.spriteBindingKey = bindingKey;
        }
        return;
      }
      case "set-transform": {
        const object = this.objects.get(command.renderObjectId)!;
        const node = object.node;
        node.position.set(command.position.x.value, command.position.y.value);
        node.scale.set(command.scale.x.value, command.scale.y.value);
        node.rotation = command.rotationDegrees.value * Math.PI / 180;
        node.alpha = command.color.alpha.value;
        node.tint = rgbTint(command.color.red.value, command.color.green.value, command.color.blue.value);
        node.mask = command.maskObjectId === null
          ? null
          : this.objects.get(command.maskObjectId)!.node;
        object.ordering = Object.freeze([
          command.ordering.domainLayer,
          command.ordering.sourceDepthOrSortingOrder,
          command.ordering.sourceZ.value,
          command.ordering.creationSequence,
        ]);
        this.sortSiblings(node.parent as Container);
        return;
      }
      case "set-mask": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.maskContent !== null) object.maskContent.destroy();
        const mask = reservedMasks.get(command.sequence)!;
        object.node.addChild(mask);
        object.maskContent = mask;
        object.maskVertexCount = command.polygon.length;
        return;
      }
      case "set-hud": {
        const object = this.objects.get(command.renderObjectId)!;
        object.hudState = Object.freeze({ ...command.state });
        object.hudVisual = applyEvidenceHud(
          object,
          command,
          this.spriteTextures,
          this.spriteReferenceCounts,
        );
        return;
      }
      case "set-mesh": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.geometryContent !== null) destroyMesh(object.geometryContent);
        const mesh = reservedGeometry.get(command.sequence)!;
        object.node.addChild(mesh);
        if (object.thresholdMaskContent !== null) mesh.mask = object.thresholdMaskContent;
        object.geometryContent = mesh;
        return;
      }
      case "set-line": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.geometryContent !== null) destroyMesh(object.geometryContent);
        const mesh = reservedGeometry.get(command.sequence)!;
        if (object.materialTexture !== null) {
          mesh.texture = object.materialTexture;
          const asset = this.profile!.assets.find(
            (candidate) => this.baseTextures.get(candidate.logicalAssetId) === object.materialTexture,
          )!;
          mesh.blendMode = asset.textureSettings!.blendMode;
        }
        object.node.addChild(mesh);
        object.geometryContent = mesh;
        return;
      }
      case "play-animation": {
        const object = this.objects.get(command.renderObjectId)!;
        const role = requireEvidenceAnimationRole(command.animationRole);
        object.activeAnimationRole = role;
        object.animationElapsedSeconds = 0;
        applyEvidenceAnimation(object, role, 0);
        return;
      }
      case "sample-animation": {
        const object = this.objects.get(command.renderObjectId)!;
        const role = requireEvidenceAnimationRole(command.animationRole);
        object.animationElapsedSeconds = command.elapsedSeconds.value;
        applyEvidenceAnimation(object, role, command.elapsedSeconds.value);
        return;
      }
      case "stop-animation": {
        const object = this.objects.get(command.renderObjectId)!;
        const role = requireEvidenceAnimationRole(command.animationRole);
        stopEvidenceAnimation(object, role);
        object.activeAnimationRole = null;
        object.animationElapsedSeconds = null;
        return;
      }
      case "set-threshold": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.thresholdMaskContent !== null) object.thresholdMaskContent.destroy();
        const mask = reservedMasks.get(command.sequence)!;
        object.node.addChild(mask);
        if (object.geometryContent !== null) object.geometryContent.mask = mask;
        object.thresholdMaskContent = mask;
        object.threshold = command.threshold.value;
        return;
      }
    }
  }

  private sortSiblings(parent: Container): void {
    const ids = new Map([...this.objects].map(([id, value]) => [value.node, id]));
    parent.children.sort((left, right) => {
      const leftRecord = this.objects.get(ids.get(left)!)!;
      const rightRecord = this.objects.get(ids.get(right)!)!;
      return compareOrdering(leftRecord.ordering, rightRecord.ordering);
    });
  }

  private destroyUnownedReservations(
    reservedNodes: ReadonlyMap<number, Container>,
    reservedGeometry: ReadonlyMap<number, Mesh>,
    reservedMasks: ReadonlyMap<number, Graphics>,
  ): void {
    const ownedNodes = new Set([...this.objects.values()].map((value) => value.node));
    const ownedGeometry = new Set(
      [...this.objects.values()].flatMap((value) =>
        value.geometryContent === null ? [] : [value.geometryContent]),
    );
    const ownedMasks = new Set(
      [...this.objects.values()].flatMap((value) =>
        [value.maskContent, value.thresholdMaskContent].filter(
          (mask): mask is Graphics => mask !== null,
        )),
    );
    for (const node of reservedNodes.values()) {
      if (!ownedNodes.has(node) && !node.destroyed) {
        node.destroy({ children: true } as DestroyOptions);
      }
    }
    for (const mesh of reservedGeometry.values()) {
      if (!ownedGeometry.has(mesh) && !mesh.destroyed) destroyMesh(mesh);
    }
    for (const mask of reservedMasks.values()) {
      if (!ownedMasks.has(mask) && !mask.destroyed) mask.destroy();
    }
  }

  private resetSceneAfterTerminalMutation(pending?: PendingPixiBatch): void {
    const pendingValues = pending === undefined
      ? [...this.pending.values()]
      : [pending, ...[...this.pending.values()].filter((value) => value !== pending)];
    this.pending.clear();
    const records = [...this.objects.values()].reverse();
    this.objects.clear();
    this.spriteReferenceCounts.clear();
    try {
      this.stage.removeChildren();
    } catch {
      // The terminal path continues best-effort cleanup after an injected Pixi exception.
    }
    for (const value of records) {
      if (value.geometryContent !== null && !value.geometryContent.destroyed) {
        try {
          destroyMesh(value.geometryContent);
        } catch {
          // Terminal cleanup must continue with every remaining owned identity.
        }
      }
      if (!value.node.destroyed) {
        try {
          value.node.removeFromParent();
          value.node.destroy({ children: true } as DestroyOptions);
        } catch {
          // The scene identity is already detached from the backend ownership map.
        }
      }
    }
    for (const pendingValue of pendingValues) {
      for (const mesh of pendingValue.reservedGeometry.values()) {
        if (!mesh.destroyed) {
          try {
            destroyMesh(mesh);
          } catch {
            // Terminal cleanup is best effort after scene mutation has already failed.
          }
        }
      }
      for (const mask of pendingValue.reservedMasks.values()) {
        if (!mask.destroyed) {
          try {
            mask.destroy();
          } catch {
            // Terminal cleanup continues after one reserved mask failure.
          }
        }
      }
      for (const node of pendingValue.reservedNodes.values()) {
        if (!node.destroyed) {
          try {
            node.removeFromParent();
            node.destroy({ children: true } as DestroyOptions);
          } catch {
            // The terminal renderer does not retain this reservation.
          }
        }
      }
    }
  }

  private resetPreparedTextures(): void {
    for (const texture of this.spriteTextures.values()) texture.destroy(false);
    for (const texture of this.baseTextures.values()) texture.destroy(true);
    this.spriteTextures.clear();
    this.spriteReferenceCounts.clear();
    this.baseTextures.clear();
  }

  private decrementSpriteReference(bindingKey: string): void {
    const next = (this.spriteReferenceCounts.get(bindingKey) ?? 0) - 1;
    if (next <= 0) this.spriteReferenceCounts.delete(bindingKey);
    else this.spriteReferenceCounts.set(bindingKey, next);
  }

}

class CachingProvider implements SimulatorResourceProvider {
  private readonly bytes = new Map<string, Uint8Array>();

  constructor(private readonly source: SimulatorResourceProvider) {}

  async read(logicalAssetId: string): Promise<SimulatorResult<Uint8Array>> {
    const cached = this.bytes.get(logicalAssetId);
    if (cached !== undefined) return ok(Uint8Array.from(cached));
    const result = await this.source.read(logicalAssetId);
    if (result.status === "ok") this.bytes.set(logicalAssetId, Uint8Array.from(result.value));
    return result.status === "ok" ? ok(Uint8Array.from(result.value)) : result;
  }

  get(logicalAssetId: string): Uint8Array | undefined {
    const value = this.bytes.get(logicalAssetId);
    return value === undefined ? undefined : Uint8Array.from(value);
  }
}

type SetMeshCommand = Extract<RenderCommand, { readonly kind: "set-mesh" }>;
type SetLineCommand = Extract<RenderCommand, { readonly kind: "set-line" }>;
type SetMaskCommand = Extract<RenderCommand, { readonly kind: "set-mask" }>;
type SetHudCommand = Extract<RenderCommand, { readonly kind: "set-hud" }>;
function createEvidenceMask(command: SetMaskCommand): Graphics {
  const points = command.polygon.flatMap((point) => [point.x.value, point.y.value]);
  return new Graphics().poly(points, true).fill(0xffffff);
}

function createThresholdMask(
  threshold: number,
  projection: RenderOrthographicProjectionProfile,
): Graphics {
  const topPixel = Math.fround(projection.viewportHeight - threshold);
  const upperWorldY = Math.fround(
    projection.worldCenterY +
      Math.fround((projection.viewportHeight / 2 - topPixel) / projection.pixelsPerWorldUnit),
  );
  return new Graphics().rect(-100, -100, 200, upperWorldY + 100).fill(0xffffff);
}

function isEvidenceHud(
  command: SetHudCommand,
  objectRole: string,
  textures: ReadonlyMap<string, Texture>,
): boolean {
  const state = command.state;
  switch (command.hudRole) {
    case "score":
      return objectRole === "hud-score" &&
        exactStateKeys(state, ["digits", "firstSignificant", "gaugeFill", "score"]) &&
        isNonNegativeSafeInteger(state.score) &&
        typeof state.digits === "string" && /^\d{8}$/.test(state.digits) &&
        Number.isInteger(state.firstSignificant) &&
        (state.firstSignificant as number) >= 0 && (state.firstSignificant as number) <= 7 &&
        isUnitFill(state.gaugeFill);
    case "combo": {
      if (
        objectRole !== "hud-combo" ||
        !exactStateKeys(state, ["allPerfect", "combo"]) ||
        !isNonNegativeSafeInteger(state.combo) ||
        state.combo > 9999 ||
        typeof state.allPerfect !== "boolean"
      ) return false;
      const prefix = state.allPerfect ? "icon_number_big_AP_" : "icon_number_big_";
      return String(state.combo).split("").every((digit) =>
        findTextureBinding(textures, `${prefix}${digit}`) !== null);
    }
    case "result": {
      if (
        objectRole !== "hud-result" ||
        !exactStateKeys(state, ["crescendoTenths", "judgeTiming", "representativeResult", "representativeSlot", "scoreUpType"]) ||
        !isNullableFiniteScalar(state.representativeResult) ||
        !isNullableFiniteScalar(state.representativeSlot) ||
        !Number.isInteger(state.judgeTiming) || (state.judgeTiming as number) < 0 || (state.judgeTiming as number) > 2 ||
        !Number.isInteger(state.scoreUpType) ||
        (state.scoreUpType as number) < 0 ||
        (state.scoreUpType as number) > 5 ||
        !Number.isInteger(state.crescendoTenths)
      ) return false;
      if (state.scoreUpType === 0 || state.scoreUpType === 5) return true;
      const key = scoreUpSpriteKey(state.scoreUpType as number);
      return key !== null && findTextureBinding(textures, key) !== null &&
        findTextureBinding(textures, "skill_eff") !== null;
    }
    case "life":
      return objectRole === "hud-life" &&
        exactStateKeys(state, [
          "currentLife", "lifeUpperLimit", "playerMaxLife",
          "danger", "damageGuardPlaying", "primaryFill", "secondaryFill", "singleGameOver", "warning",
        ]) &&
        isNonNegativeSafeInteger(state.currentLife) &&
        isNonNegativeSafeInteger(state.playerMaxLife) &&
        isNonNegativeSafeInteger(state.lifeUpperLimit) &&
        typeof state.singleGameOver === "boolean" &&
        typeof state.danger === "boolean" && typeof state.warning === "boolean" &&
        typeof state.damageGuardPlaying === "boolean" &&
        isUnitFill(state.primaryFill) && isNonNegativeFinite(state.secondaryFill);
    case "overlay":
      return objectRole === "hud-overlay" && (
        exactStateKeys(state, ["addScore", "depth", "freeLiveEventBonusAddScore", "phase", "phaseProgress", "poolIndex"]) &&
          typeof state.addScore === "number" && Number.isFinite(state.addScore) &&
          typeof state.freeLiveEventBonusAddScore === "number" && Number.isFinite(state.freeLiveEventBonusAddScore) &&
          Number.isInteger(state.poolIndex) && (state.poolIndex as number) >= 0 && (state.poolIndex as number) < 4 &&
          Number.isInteger(state.depth) && (state.depth as number) >= 0 && (state.depth as number) < 8 &&
          state.phase === 0 && state.phaseProgress === 0 ||
        exactStateKeys(state, [
          "currentSkillNoteIndex", "scoreGaugeActive", "scoreSkill", "skillActive",
        ]) && state.skillActive === true &&
          typeof state.scoreSkill === "boolean" &&
          typeof state.scoreGaugeActive === "boolean" &&
          isNonNegativeSafeInteger(state.currentSkillNoteIndex) ||
        exactStateKeys(state, ["habahiroFlashPhase", "progress"]) &&
          state.habahiroFlashPhase === "flash-start" && state.progress === 0 ||
        exactStateKeys(state, ["active", "feverCommand", "feverState"]) &&
          typeof state.active === "boolean" &&
          (state.feverCommand === "ready" || state.feverCommand === "start" || state.feverCommand === "end") &&
          Number.isInteger(state.feverState) && (state.feverState as number) >= 0 && (state.feverState as number) <= 2
      );
    case "fidelity-label":
      return objectRole === "fidelity-label" &&
        state.label === "HABAHIRO" && state.visible === true && (
          exactStateKeys(state, ["label", "visible"]) ||
          exactStateKeys(state, ["absolutePosition", "label", "laneChangePhase", "visible"]) &&
            Number.isInteger(state.absolutePosition) &&
            (state.absolutePosition as number) >= 0 &&
            (state.laneChangePhase === "flash-start" ||
              state.laneChangePhase === "change-lane" || state.laneChangePhase === "complete")
        );
  }
}

function applyEvidenceHud(
  object: PixiObjectRecord,
  command: SetHudCommand,
  textures: ReadonlyMap<string, Texture>,
  referenceCounts: Map<string, number>,
): PixiHudVisual {
  const visual = object.hudVisual ?? createHudVisual(object.node);
  visual.text.visible = true;
  visual.primaryFill.clear();
  visual.secondaryFill.clear();
  visual.fillRatios = Object.freeze([0, 0]);
  const state = command.state;
  switch (command.hudRole) {
    case "score": {
      object.node.position.set(601, 135);
      visual.text.visible = false;
      for (const digit of visual.scoreDigitTexts.splice(0)) digit.destroy();
      const firstSignificant = state.firstSignificant as number;
      [...String(state.digits)].forEach((digit, index) => {
        const text = new Text({
          text: digit,
          style: { fill: index < firstSignificant ? 0xbebebe : 0xff3b72, fontSize: 40, fontWeight: "bold" },
        });
        text.anchor.set(0.5);
        text.position.set((index - 3.5) * 25, 0);
        visual.content.addChild(text);
        visual.scoreDigitTexts.push(text);
      });
      const gauge = state.gaugeFill as number;
      visual.primaryFill.rect(-100, 28, 200 * gauge, 5).fill(0xff3b72);
      visual.fillRatios = Object.freeze([gauge, 0]);
      break;
    }
    case "combo": {
      object.node.position.set(1256.699951171875, 277.20001220703125);
      for (const bindingKey of object.hudBindingKeys) {
        const next = (referenceCounts.get(bindingKey) ?? 0) - 1;
        if (next <= 0) referenceCounts.delete(bindingKey);
        else referenceCounts.set(bindingKey, next);
      }
      object.hudBindingKeys.length = 0;
      for (const sprite of visual.digitSprites.splice(0)) sprite.destroy();
      visual.text.visible = false;
      const value = String(state.combo);
      const prefix = state.allPerfect ? "icon_number_big_AP_" : "icon_number_big_";
      [...value].reverse().forEach((digit, index) => {
        const binding = findTextureBinding(textures, `${prefix}${digit}`)!;
        const sprite = new Sprite({ texture: binding.texture, label: `combo-digit-${index}` });
        sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 0.5 });
        sprite.position.set(35 - index * 70, 0);
        visual.content.addChild(sprite);
        visual.digitSprites.push(sprite);
        object.hudBindingKeys.push(binding.key);
        referenceCounts.set(binding.key, (referenceCounts.get(binding.key) ?? 0) + 1);
      });
      break;
    }
    case "result": {
      object.node.position.set(800, 520);
      clearHudSprites(object, visual, referenceCounts);
      const scoreUpType = state.scoreUpType as number;
      const timing = state.judgeTiming === 1 ? " FAST" : state.judgeTiming === 2 ? " SLOW" : "";
      if (scoreUpType === 0) {
        setHudText(
          visual.text,
          state.representativeResult === null ? "" : `${state.representativeResult}${timing}`,
          54,
          0xffffff,
        );
        break;
      }
      if (scoreUpType === 5) {
        const tenths = Math.abs(state.crescendoTenths as number);
        setHudText(visual.text, `${Math.trunc(tenths / 10)}.${tenths % 10}${timing}`, 36, 0xf3ec03);
        break;
      }
      visual.text.visible = false;
      const mainKey = scoreUpSpriteKey(scoreUpType)!;
      const tint = scoreUpTint(scoreUpType);
      for (const [exactKey, x, y, label] of [
        ["skill_eff", 0, 44, "score-up-base"],
        [mainKey, 44, 11, "score-up-main"],
      ] as const) {
        const binding = findTextureBinding(textures, exactKey)!;
        const sprite = new Sprite({ texture: binding.texture, label });
        sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 0.5 });
        sprite.position.set(x, y);
        sprite.tint = tint;
        visual.content.addChild(sprite);
        visual.digitSprites.push(sprite);
        object.hudBindingKeys.push(binding.key);
        referenceCounts.set(binding.key, (referenceCounts.get(binding.key) ?? 0) + 1);
      }
      break;
    }
    case "life": {
      object.node.position.set(1000, 95);
      const primary = state.primaryFill as number;
      const secondary = state.secondaryFill as number;
      visual.secondaryFill.rect(0, 0, 224 * secondary, 26).fill(0x64d8ff);
      visual.primaryFill.rect(0, 0, 224 * primary, 26).fill(0xff679b);
      visual.primaryFill.position.set(0, 0);
      visual.secondaryFill.position.set(0, 0);
      visual.fillRatios = Object.freeze([primary, secondary]);
      setHudText(
        visual.text,
        `${state.currentLife}/${state.playerMaxLife}`,
        28,
        state.singleGameOver || state.danger ? 0xff4d72 : state.warning ? 0xffd166 : 0xffffff,
      );
      visual.text.position.set(107, 36);
      if (visual.animationLayer.children.length === 0) {
        for (const exactKey of [
          "effect_health_guard_outline",
          "effect_health_guts_outline",
          "UI_effect_life_plus_gauge",
          "UI_effect_life_plus_icon",
        ]) {
          const binding = findTextureBinding(textures, exactKey);
          if (binding === null) continue;
          const sprite = new Sprite({ texture: binding.texture, label: exactKey });
          sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 0.5 });
          if (exactKey === "UI_effect_life_plus_icon") sprite.position.set(-114, 12);
          visual.animationLayer.addChild(sprite);
          object.hudBindingKeys.push(binding.key);
          referenceCounts.set(binding.key, (referenceCounts.get(binding.key) ?? 0) + 1);
        }
      }
      break;
    }
    case "overlay": {
      if (Object.prototype.hasOwnProperty.call(state, "habahiroFlashPhase")) {
        object.node.position.set(0, 0);
        visual.text.visible = false;
        visual.primaryFill.rect(0, 0, 1600, 720).fill(0xffffff);
        visual.primaryFill.alpha = 0;
      } else if (Object.prototype.hasOwnProperty.call(state, "feverCommand")) {
        object.node.position.set(800, 185);
        const label = state.feverCommand === "ready"
          ? "FEVER READY"
          : state.feverCommand === "end" ? "" : state.feverState === 1 ? "FEVER" : "FEVER FAILED";
        setHudText(visual.text, label, 36, state.feverState === 2 ? 0xbebebe : 0xff3b72);
      } else if (Object.prototype.hasOwnProperty.call(state, "skillActive")) {
        object.node.position.set(800, 120);
        setHudText(visual.text, state.scoreSkill ? "SCORE UP" : "SKILL", 30, 0xffffff);
      } else {
        object.node.position.set(389, -50);
        object.node.zIndex = state.depth as number;
        const total = (state.addScore as number) + (state.freeLiveEventBonusAddScore as number);
        setHudText(visual.text, total === 0 ? "" : `+${total}`, 30, 0xffffff);
      }
      break;
    }
    case "fidelity-label":
      if (Object.prototype.hasOwnProperty.call(state, "laneChangePhase")) {
        object.node.position.set(20, 52);
        setHudText(
          visual.text,
          state.laneChangePhase === "flash-start"
            ? "HABAHIRO · Flash"
            : "HABAHIRO · Lane Changed",
          20,
          0xffd166,
        );
      } else {
        object.node.position.set(20, 20);
        setHudText(visual.text, String(state.label), 24, 0xffd166);
      }
      break;
  }
  return visual;
}

function createHudVisual(node: Container): PixiHudVisual {
  const content = new Container({ sortableChildren: true });
  const secondaryFill = new Graphics();
  const primaryFill = new Graphics();
  const text = new Text({ text: "", style: { fill: 0xffffff, fontSize: 32 } });
  const animationLayer = new Container({ visible: false });
  content.addChild(secondaryFill, primaryFill, text, animationLayer);
  node.addChild(content);
  return {
    content,
    text,
    primaryFill,
    secondaryFill,
    animationLayer,
    digitSprites: [],
    scoreDigitTexts: [],
    fillRatios: Object.freeze([0, 0]),
  };
}

function clearHudSprites(
  object: PixiObjectRecord,
  visual: PixiHudVisual,
  referenceCounts: Map<string, number>,
): void {
  for (const bindingKey of object.hudBindingKeys) {
    const next = (referenceCounts.get(bindingKey) ?? 0) - 1;
    if (next <= 0) referenceCounts.delete(bindingKey);
    else referenceCounts.set(bindingKey, next);
  }
  object.hudBindingKeys.length = 0;
  for (const sprite of visual.digitSprites.splice(0)) sprite.destroy();
}

function scoreUpSpriteKey(scoreUpType: number): string | null {
  switch (scoreUpType) {
    case 1: return "icon_skill_score_up_1";
    case 2: return "icon_skill_score_up_2";
    case 3: return "icon_skill_score_zero";
    case 4: return "icon_skill_score_half";
    default: return null;
  }
}

function scoreUpTint(scoreUpType: number): number {
  if (scoreUpType === 1) return 0xf3ec03;
  if (scoreUpType === 2) return 0xe18800;
  return 0xc0c0c0;
}

function setHudText(text: Text, value: string, fontSize: number, fill: number): void {
  text.text = value;
  text.style = { fill, fontSize, fontWeight: "bold" };
  text.anchor.set(0.5);
}

function applyEvidenceAnimation(
  object: PixiObjectRecord,
  role: EvidenceAnimationRole,
  elapsedSeconds: number,
): void {
  if (role === "combo") {
    const scale = samplePolynomialCurve(COMBO_SCALE_KEYS, elapsedSeconds);
    object.node.scale.set(scale, scale);
    return;
  }
  if (role === "all-perfect") {
    object.node.alpha = Math.fround(0.7 + 0.3 * Math.abs(Math.sin(elapsedSeconds * Math.PI)));
    return;
  }
  if (role === "habahiro-lane-change") {
    const visual = object.hudVisual;
    if (visual === null) throw new Error("HABAHIRO flash owner missing HUD visual");
    visual.primaryFill.alpha = Math.fround(Math.sin(
      Math.min(1, elapsedSeconds / 0.25) * Math.PI,
    ));
    return;
  }
  if (role === "add-score") {
    const phaseSeconds = Math.fround(0.14000000059604645);
    const phase = Math.min(2, Math.floor(elapsedSeconds / phaseSeconds));
    const progress = Math.fround((elapsedSeconds - phase * phaseSeconds) / phaseSeconds);
    object.node.position.y = phase === 0
      ? Math.fround(-50 + 8 * progress)
      : phase === 1 ? Math.fround(-42 + progress) : Math.fround(-41 + progress);
    object.node.alpha = phase === 0
      ? Math.fround(0.6 + 0.4 * progress)
      : phase === 1 ? 1 : Math.fround(1 - progress);
    return;
  }
  if (role === "result") {
    object.node.scale.set(1, 1);
    object.node.alpha = elapsedSeconds < 0.85 ? 1 : Math.max(0, (1 - elapsedSeconds) / 0.15);
    return;
  }
  if (role === "note-flick" || role === "note-directional-flick" || role === "note-long-flash") {
    const sprite = object.spriteContent;
    if (sprite === null) throw new Error("Note animation owner missing Sprite");
    const pulse = Math.fround(1 + 0.08 * Math.sin(elapsedSeconds * Math.PI * 8));
    sprite.scale.set(pulse, pulse);
    if (role === "note-directional-flick" || role === "note-long-flash") sprite.alpha = Math.fround(0.8 + 0.2 * Math.abs(Math.sin(elapsedSeconds * Math.PI * 4)));
    return;
  }
  const visual = object.hudVisual;
  if (visual === null) throw new Error("HUD missing before animation");
  if (role === "score-skill" || role === "judge-skill" || role === "fever") {
    visual.animationLayer.visible = true;
    visual.animationLayer.scale.set(1);
    visual.animationLayer.alpha = 1;
    return;
  }
  visual.animationLayer.visible = true;
  for (const child of visual.animationLayer.children) {
    child.visible = role === "life-heal"
      ? child.label.includes("life_plus")
      : role === "never-die"
      ? child.label === "effect_health_guts_outline"
      : child.label === "effect_health_guard_outline";
  }
  visual.animationLayer.scale.set(
    role === "life-heal" ? samplePolynomialCurve(LIFE_ICON_SCALE_KEYS, elapsedSeconds) : 1,
  );
  visual.animationLayer.alpha = role === "life-heal"
    ? samplePolynomialCurve(LIFE_ICON_ALPHA_KEYS, elapsedSeconds) : 1;
}

function stopEvidenceAnimation(object: PixiObjectRecord, role: EvidenceAnimationRole): void {
  if (role === "combo" || role === "all-perfect" || role === "result") {
    object.node.scale.set(1, 1);
    object.node.alpha = 1;
    return;
  }
  if (role === "habahiro-lane-change") {
    if (object.hudVisual !== null) object.hudVisual.primaryFill.alpha = 0;
    return;
  }
  if (role === "add-score") {
    object.node.alpha = 1;
    return;
  }
  if (role === "note-flick" || role === "note-directional-flick" || role === "note-long-flash") {
    if (object.spriteContent !== null) {
      object.spriteContent.scale.set(1, 1);
      object.spriteContent.alpha = 1;
    }
    return;
  }
  if (object.hudVisual !== null) object.hudVisual.animationLayer.visible = false;
}

const COMBO_SCALE_KEYS = Object.freeze([
  Object.freeze({ time: 0, coefficients: Object.freeze([-1036.800048828125, 129.60000610351562, 0, 0.800000011920929]) }),
  Object.freeze({ time: 0.0833333358168602, coefficients: Object.freeze([0, 0, -1.200000286102295, 1.100000023841858]) }),
  Object.freeze({ time: 0.1666666716337204, coefficients: Object.freeze([0, 0, 0, 1]) }),
  Object.freeze({ time: 1, coefficients: Object.freeze([0, 0, 0, 1]) }),
]);
const LIFE_ICON_SCALE_KEYS = Object.freeze([
  Object.freeze({ time: 0, coefficients: Object.freeze([0, 0, 2.25, 1]) }),
  Object.freeze({ time: 0.6666666865348816, coefficients: Object.freeze([0, 0, 0, 2.5]) }),
]);
const LIFE_ICON_ALPHA_KEYS = Object.freeze([
  Object.freeze({ time: 0, coefficients: Object.freeze([0, 0, -1.5, 1]) }),
  Object.freeze({ time: 0.6666666865348816, coefficients: Object.freeze([0, 0, 0, 0]) }),
]);

function samplePolynomialCurve(
  keys: readonly { readonly time: number; readonly coefficients: readonly number[] }[],
  elapsedSeconds: number,
): number {
  let key = keys[0]!;
  for (const candidate of keys) {
    if (candidate.time > elapsedSeconds) break;
    key = candidate;
  }
  const delta = Math.fround(elapsedSeconds - key.time);
  const [a, b, c, d] = key.coefficients;
  return Math.fround(Math.fround(Math.fround(Math.fround(a! * delta) + b!) * delta + c!) * delta + d!);
}

function findTextureBinding(
  textures: ReadonlyMap<string, Texture>,
  exactKey: string,
): { readonly key: string; readonly texture: Texture } | null {
  const suffix = `\u0000${exactKey}`;
  for (const [key, texture] of textures) {
    if (key.endsWith(suffix)) return { key, texture };
  }
  return null;
}

function exactStateKeys(
  state: Readonly<Record<string, string | number | boolean | null>>,
  keys: readonly string[],
): boolean {
  return Object.keys(state).sort().join(",") === [...keys].sort().join(",");
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNullableFiniteScalar(value: unknown): boolean {
  return value === null || typeof value === "string" ||
    typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
}

function isUnitFill(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function animationMatchesRole(role: string, objectRole: string): boolean {
  return (role === "combo" || role === "all-perfect") && objectRole === "hud-combo" ||
    role === "result" && objectRole === "hud-result" ||
    (role === "life-heal" || role === "damage-guard" || role === "never-die") && objectRole === "hud-life" ||
    (role === "score-skill" || role === "judge-skill" || role === "fever" ||
      role === "habahiro-lane-change" || role === "add-score") && objectRole === "hud-overlay" ||
    (role === "note-flick" || role === "note-directional-flick" || role === "note-long-flash") &&
      (objectRole === "note-root" || objectRole === "note-head" || objectRole === "note-icon" ||
        objectRole === "note-intermediate" || objectRole === "note-side-visual");
}

function isEvidenceAnimationRole(role: string): role is EvidenceAnimationRole {
  return role === "combo" || role === "all-perfect" || role === "add-score" ||
    role === "result" || role === "life-heal" || role === "damage-guard" ||
    role === "never-die" || role === "score-skill" || role === "judge-skill" ||
    role === "fever" || role === "habahiro-lane-change" || role === "note-flick" ||
    role === "note-directional-flick" || role === "note-long-flash";
}

function requireEvidenceAnimationRole(role: string): EvidenceAnimationRole {
  if (!isEvidenceAnimationRole(role)) throw new Error("unsupported animation role");
  return role;
}

function isEvidenceLine(command: SetLineCommand): boolean {
  return (command.materialRole === "sync-line" ||
    command.materialRole === "multiple-directional-line") &&
    command.width.value > 0 &&
    Math.hypot(
      command.end.x.value - command.start.x.value,
      command.end.y.value - command.start.y.value,
    ) > 0;
}

function createEvidenceLine(
  command: SetLineCommand,
  projection: RenderOrthographicProjectionProfile,
): Mesh {
  if (!isEvidenceLine(command)) throw new Error("line outside R2 profile");
  const startX = projection.viewportWidth / 2 +
    (command.start.x.value - projection.worldCenterX) * projection.pixelsPerWorldUnit;
  const startY = projection.viewportHeight / 2 -
    (command.start.y.value - projection.worldCenterY) * projection.pixelsPerWorldUnit;
  const endX = projection.viewportWidth / 2 +
    (command.end.x.value - projection.worldCenterX) * projection.pixelsPerWorldUnit;
  const endY = projection.viewportHeight / 2 -
    (command.end.y.value - projection.worldCenterY) * projection.pixelsPerWorldUnit;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  const halfWidth = command.width.value * projection.pixelsPerWorldUnit / 2;
  const nx = -dy / length * halfWidth;
  const ny = dx / length * halfWidth;
  const geometry = new MeshGeometry({
    positions: new Float32Array([
      startX + nx, startY + ny,
      endX + nx, endY + ny,
      endX - nx, endY - ny,
      startX - nx, startY - ny,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    topology: "triangle-list",
    shrinkBuffersToFit: true,
  });
  return new Mesh({ geometry, texture: Texture.EMPTY, roundPixels: false });
}

function isEvidenceMesh(command: SetMeshCommand): boolean {
  const base = command.vertices.length === 22 && command.indices.length === 60;
  const advanced = command.vertices.length === 42 && command.indices.length === 120;
  if (
    (!base && !advanced) ||
    command.uv.length !== command.vertices.length ||
    command.colors.length !== command.vertices.length ||
    command.vertices.some((vertex) => vertex.z.bits !== "00000000")
  ) {
    return false;
  }
  const first = command.colors[0]!;
  return command.colors.every((color) =>
    color.red.bits === first.red.bits &&
    color.green.bits === first.green.bits &&
    color.blue.bits === first.blue.bits &&
    color.alpha.bits === first.alpha.bits);
}

function createEvidenceMesh(command: SetMeshCommand): Mesh {
  if (!isEvidenceMesh(command)) throw new Error("mesh outside R7 profile");
  const positions = new Float32Array(command.vertices.length * 2);
  const uvs = new Float32Array(command.uv.length * 2);
  for (let index = 0; index < command.vertices.length; index += 1) {
    positions[index * 2] = command.vertices[index]!.x.value;
    positions[index * 2 + 1] = command.vertices[index]!.y.value;
    uvs[index * 2] = command.uv[index]!.x.value;
    uvs[index * 2 + 1] = command.uv[index]!.y.value;
  }
  const geometry = new MeshGeometry({
    positions,
    uvs,
    indices: Uint32Array.from(command.indices),
    topology: "triangle-list",
    shrinkBuffersToFit: true,
  });
  const mesh = new Mesh({ geometry, texture: Texture.WHITE, roundPixels: false });
  const color = command.colors[0]!;
  mesh.tint = rgbTint(color.red.value, color.green.value, color.blue.value);
  mesh.alpha = color.alpha.value;
  return mesh;
}

function destroyMesh(mesh: Mesh): void {
  mesh.removeFromParent();
  mesh.geometry.destroy();
  mesh.destroy({ texture: false, textureSource: false } as DestroyOptions);
}

const defaultObjectFactory: PixiSceneObjectFactory = Object.freeze({
  create(role: string, renderObjectId: string, roundPixels: boolean): Container {
    const root = new Container({ label: renderObjectId, sortableChildren: true });
    if (spriteRole(role)) {
      root.addChild(new Sprite({
        texture: Texture.EMPTY,
        roundPixels,
        label: `${renderObjectId}:sprite`,
      }));
    }
    return root;
  },
});

function applyTextureSettings(texture: Texture, asset: RenderResourceAssetProfile): void {
  const settings = asset.textureSettings!;
  texture.source.scaleMode = settings.scaleMode;
  texture.source.style.addressModeU = settings.wrapModeU === "repeat"
    ? "repeat"
    : "clamp-to-edge";
  texture.source.style.addressModeV = settings.wrapModeV === "repeat"
    ? "repeat"
    : "clamp-to-edge";
  texture.source.style.update();
  texture.source.autoGenerateMipmaps = settings.mipmap === "on";
  texture.source.alphaMode = settings.premultiplyAlpha
    ? "premultiply-alpha-on-upload"
    : "no-premultiply-alpha";
}

function spriteChild(node: Container): Sprite | null {
  const child = node.children[0];
  return child instanceof Sprite ? child : null;
}

function spriteRole(role: string): boolean {
  return role === "note-root" || role === "note-head" || role === "note-icon" ||
    role === "note-intermediate" || role === "note-side-visual" ||
    role === "field-line" || role === "judge-line";
}

function spriteKey(logicalAssetId: string, exactKey: string): string {
  return `${logicalAssetId}\u0000${exactKey}`;
}

function materialKey(logicalAssetId: string): string {
  return `${logicalAssetId}\u0000`;
}

function rgbTint(red: number, green: number, blue: number): number {
  const byte = (value: number) => Math.round(value * 255);
  return (byte(red) << 16) | (byte(green) << 8) | byte(blue);
}

function compareOrdering(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function copyPixiCommand(command: RenderCommand): RenderCommand {
  if (command.kind === "set-mesh") {
    return Object.freeze({
      ...command,
      vertices: Object.freeze(command.vertices.map((value) => Object.freeze({
        x: Object.freeze({ ...value.x }),
        y: Object.freeze({ ...value.y }),
        z: Object.freeze({ ...value.z }),
      }))),
      indices: Object.freeze([...command.indices]),
      uv: Object.freeze(command.uv.map((value) => Object.freeze({
        x: Object.freeze({ ...value.x }),
        y: Object.freeze({ ...value.y }),
      }))),
      colors: Object.freeze(command.colors.map((value) => Object.freeze({
        red: Object.freeze({ ...value.red }),
        green: Object.freeze({ ...value.green }),
        blue: Object.freeze({ ...value.blue }),
        alpha: Object.freeze({ ...value.alpha }),
      }))),
    });
  }
  if (command.kind === "set-line") {
    return Object.freeze({
      ...command,
      start: Object.freeze({
        x: Object.freeze({ ...command.start.x }),
        y: Object.freeze({ ...command.start.y }),
        z: Object.freeze({ ...command.start.z }),
      }),
      end: Object.freeze({
        x: Object.freeze({ ...command.end.x }),
        y: Object.freeze({ ...command.end.y }),
        z: Object.freeze({ ...command.end.z }),
      }),
      width: Object.freeze({ ...command.width }),
    });
  }
  if (command.kind === "set-mask") {
    return Object.freeze({
      ...command,
      polygon: Object.freeze(command.polygon.map((value) => Object.freeze({
        x: Object.freeze({ ...value.x }),
        y: Object.freeze({ ...value.y }),
      }))),
    });
  }
  if (command.kind === "set-hud") {
    return Object.freeze({ ...command, state: Object.freeze({ ...command.state }) });
  }
  if (command.kind === "sample-animation") {
    return Object.freeze({
      ...command,
      elapsedSeconds: Object.freeze({ ...command.elapsedSeconds }),
    });
  }
  if (command.kind === "set-transform") {
    return Object.freeze({
      ...command,
      position: Object.freeze({
        x: Object.freeze({ ...command.position.x }),
        y: Object.freeze({ ...command.position.y }),
        z: Object.freeze({ ...command.position.z }),
      }),
      scale: Object.freeze({
        x: Object.freeze({ ...command.scale.x }),
        y: Object.freeze({ ...command.scale.y }),
      }),
      rotationDegrees: Object.freeze({ ...command.rotationDegrees }),
      color: Object.freeze({
        red: Object.freeze({ ...command.color.red }),
        green: Object.freeze({ ...command.color.green }),
        blue: Object.freeze({ ...command.color.blue }),
        alpha: Object.freeze({ ...command.color.alpha }),
      }),
      ordering: Object.freeze({
        ...command.ordering,
        sourceZ: Object.freeze({ ...command.ordering.sourceZ }),
      }),
    });
  }
  return Object.freeze({ ...command });
}

function reject(capability: string, boundary: string) {
  return evidenceRequired(
    capability,
    ["RPR-D14", "RPR-D15", "RPR-D17", "PR35", "PR36", "PR37"],
    boundary,
  );
}
