import {
  Container,
  Mesh,
  MeshGeometry,
  Rectangle,
  Sprite,
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
}

interface PixiObjectRecord {
  readonly role: string;
  readonly node: Container;
  ordering: readonly [number, number, number, number];
  hudState: Readonly<Record<string, string | number | boolean | null>> | null;
  spriteBindingKey: string | null;
  spriteContent: Sprite | null;
  materialTexture: Texture | null;
  geometryContent: Mesh | null;
}

interface PixiShadowObject {
  readonly role: string;
  readonly parentObjectId: string | null;
  readonly materialBound: boolean;
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
        }
      }
    } catch {
      for (const node of reservedNodes.values()) {
        node.destroy({ children: true } as DestroyOptions);
      }
      for (const mesh of reservedGeometry.values()) destroyMesh(mesh);
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
        this.apply(command, pending.reservedNodes, pending.reservedGeometry);
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
    this.destroyUnownedReservations(pending.reservedNodes, pending.reservedGeometry);
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
    readonly parent: string | null;
    readonly ordering: readonly [number, number, number, number];
    readonly hudState: Readonly<Record<string, string | number | boolean | null>> | null;
    readonly geometryVertexCount: number | null;
    readonly geometryIndexCount: number | null;
    readonly geometryPositions: readonly number[] | null;
  }[] {
    const idsByNode = new Map([...this.objects].map(([id, value]) => [value.node, id]));
    return Object.freeze([...this.objects].map(([renderObjectId, value]) => Object.freeze({
      renderObjectId,
      role: value.role,
      visible: value.node.visible,
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
      this.destroyUnownedReservations(pending.reservedNodes, pending.reservedGeometry);
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
        return command.maskObjectId === null;
      case "set-hud":
        return false;
      case "bind-resource":
        if (command.binding === "sprite") {
          return command.exactKey !== null &&
            this.spriteTextures.has(spriteKey(command.logicalAssetId, command.exactKey));
        }
        if (command.binding === "material" && command.exactKey === null) {
          const asset = this.profile?.assets.find(
            (candidate) => candidate.logicalAssetId === command.logicalAssetId,
          );
          return asset?.materialRole === "sync-line" &&
            this.baseTextures.has(command.logicalAssetId);
        }
        return false;
      case "set-mesh":
        return command.materialRole === "long-note" || command.materialRole === "curve-note";
      case "set-line":
        return command.materialRole === "sync-line";
      case "set-threshold":
      case "play-animation":
      case "stop-animation":
        return false;
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
            (command.binding === "material" && role !== "sync-line")
          ) {
            return reject(
              "render.pixi.resource-binding-role-mismatch",
              "Sprite and sync-line material bindings require their exact engine-authored object roles.",
            );
          }
          if (command.binding === "material") {
            shadow.set(command.renderObjectId, {
              ...shadow.get(command.renderObjectId)!,
              materialBound: true,
            });
          }
          break;
        }
        case "activate-object":
        case "hide-object":
        case "deactivate-object":
        case "set-transform":
          break;
        case "set-mesh":
          if (
            shadow.get(command.renderObjectId)!.role !== "note-mesh" ||
            !isEvidenceMesh(command)
          ) {
            return reject(
              "render.pixi.mesh-outside-r2-profile",
              "Pixi accepts only the ordinary R2 22-vertex uniform-color NoteMesh profile.",
            );
          }
          break;
        case "set-line":
          if (
            shadow.get(command.renderObjectId)!.role !== "sync-line" ||
            !shadow.get(command.renderObjectId)!.materialBound ||
            !isEvidenceLine(command)
          ) {
            return reject(
              "render.pixi.line-outside-r2-profile",
              "Pixi accepts only a positive-width non-degenerate ordinary R2 sync-line segment.",
            );
          }
          break;
        case "set-hud":
        case "set-threshold":
        case "play-animation":
        case "stop-animation":
          return reject(
            "render.pixi.unsupported-semantic-command",
            "Unsupported semantic commands cannot reach Pixi scene mutation.",
          );
      }
    }
    return ok(undefined);
  }

  private apply(
    command: RenderCommand,
    reservedNodes: ReadonlyMap<number, Container>,
    reservedGeometry: ReadonlyMap<number, Mesh>,
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
          spriteContent: spriteChild(node),
          materialTexture: null,
          geometryContent: null,
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
        object.ordering = Object.freeze([
          command.ordering.domainLayer,
          command.ordering.sourceDepthOrSortingOrder,
          command.ordering.sourceZ.value,
          command.ordering.creationSequence,
        ]);
        this.sortSiblings(node.parent as Container);
        return;
      }
      case "set-hud":
        this.objects.get(command.renderObjectId)!.hudState = Object.freeze({ ...command.state });
        return;
      case "set-mesh": {
        const object = this.objects.get(command.renderObjectId)!;
        if (object.geometryContent !== null) destroyMesh(object.geometryContent);
        const mesh = reservedGeometry.get(command.sequence)!;
        object.node.addChild(mesh);
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
      case "set-threshold":
      case "play-animation":
      case "stop-animation":
        throw new Error("unsupported command reached Pixi apply");
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
  ): void {
    const ownedNodes = new Set([...this.objects.values()].map((value) => value.node));
    const ownedGeometry = new Set(
      [...this.objects.values()].flatMap((value) =>
        value.geometryContent === null ? [] : [value.geometryContent]),
    );
    for (const node of reservedNodes.values()) {
      if (!ownedNodes.has(node) && !node.destroyed) {
        node.destroy({ children: true } as DestroyOptions);
      }
    }
    for (const mesh of reservedGeometry.values()) {
      if (!ownedGeometry.has(mesh) && !mesh.destroyed) destroyMesh(mesh);
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

function isEvidenceLine(command: SetLineCommand): boolean {
  return command.materialRole === "sync-line" &&
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
  if (
    command.vertices.length !== 22 ||
    command.indices.length !== 60 ||
    command.uv.length !== 22 ||
    command.colors.length !== 22 ||
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
  if (!isEvidenceMesh(command)) throw new Error("mesh outside R2 profile");
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
  if (command.kind === "set-hud") {
    return Object.freeze({ ...command, state: Object.freeze({ ...command.state }) });
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
