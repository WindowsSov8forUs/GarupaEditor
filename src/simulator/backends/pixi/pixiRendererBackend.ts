import {
  Container,
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
}

interface PixiObjectRecord {
  readonly role: string;
  readonly node: Container;
  ordering: readonly [number, number, number, number];
  hudState: Readonly<Record<string, string | number | boolean | null>> | null;
  spriteBindingKey: string | null;
}

interface PixiShadowObject {
  readonly role: string;
  readonly parentObjectId: string | null;
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
    if (recordingBatch.status !== "ok") return recordingBatch;
    const supported = this.validatePixiBatch(commands);
    if (supported.status !== "ok") {
      this.recording.discard(recordingBatch.value);
      return supported;
    }
    const reservedNodes = new Map<number, Container>();
    try {
      for (const command of commands) {
        if (command.kind !== "create-object" && command.kind !== "acquire-object") continue;
        const node = this.objectFactory.create(
          command.role,
          command.renderObjectId,
          this.profile!.scene.roundPixels,
        );
        if (
          node.destroyed ||
          node.parent !== null ||
          (spriteRole(command.role) && !(node instanceof Sprite))
        ) {
          node.destroy({ children: true } as DestroyOptions);
          throw new Error("invalid reserved Pixi node");
        }
        node.label = command.renderObjectId;
        node.visible = false;
        reservedNodes.set(command.sequence, node);
      }
    } catch {
      for (const node of reservedNodes.values()) {
        node.destroy({ children: true } as DestroyOptions);
      }
      this.recording.discard(recordingBatch.value);
      return reject(
        "render.pixi.preflight-object-create-threw",
        "Pixi object allocation is reserved during preflight so allocation failure precedes domain mutation.",
      );
    }
    const capability = Object.freeze({ ...recordingBatch.value });
    this.pending.set(capability, Object.freeze({
      recordingBatch: recordingBatch.value,
      commands: Object.freeze(commands.map(copyPixiCommand)),
      reservedNodes,
    }));
    return ok(capability);
  }

  commit(batch: RenderCommandBatch): SimulatorResult<void> {
    const pending = this.pending.get(batch);
    if (pending === undefined) {
      return this.recording.recordTerminalFault(
        "render.pixi.invalid-batch-capability",
        "Pixi accepts only its own one-use preflight capability.",
      );
    }
    try {
      for (const command of pending.commands) this.apply(command, pending.reservedNodes);
    } catch {
      this.pending.delete(batch);
      this.destroyUnownedReservedNodes(pending.reservedNodes);
      this.recording.discard(pending.recordingBatch);
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
      return this.recording.recordTerminalFault(
        "render.pixi.invalid-discard-capability",
        "Pixi discards only its exact pending batch capability.",
      );
    }
    this.pending.delete(batch);
    for (const node of pending.reservedNodes.values()) {
      node.destroy({ children: true } as DestroyOptions);
    }
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
    for (const pending of this.pending.values()) {
      this.destroyUnownedReservedNodes(pending.reservedNodes);
      this.recording.discard(pending.recordingBatch);
    }
    this.pending.clear();
    return this.recording.recordTerminalFault(
      "render.pixi.context-lost",
      "WebGL/WebGPU context loss is terminal for the current renderer session and never auto-reloads resources.",
    );
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
    })));
  }

  dispose(): SimulatorResult<void> {
    for (const value of [...this.objects.values()].reverse()) {
      value.node.removeFromParent();
      value.node.destroy({ children: true } as DestroyOptions);
    }
    this.objects.clear();
    for (const pending of this.pending.values()) {
      for (const node of pending.reservedNodes.values()) {
        node.destroy({ children: true } as DestroyOptions);
      }
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
        return command.binding === "sprite" && command.exactKey !== null &&
          this.spriteTextures.has(spriteKey(command.logicalAssetId, command.exactKey));
      case "set-mesh":
      case "set-line":
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
        case "bind-resource":
          if (!spriteRole(shadow.get(command.renderObjectId)!.role)) {
            return reject(
              "render.pixi.sprite-binding-role-mismatch",
              "A Sprite resource binding requires an engine-authored Sprite-compatible object role.",
            );
          }
          break;
        case "activate-object":
        case "hide-object":
        case "deactivate-object":
        case "set-transform":
          break;
        case "set-hud":
        case "set-mesh":
        case "set-line":
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
        object.node.removeFromParent();
        object.node.destroy({ children: true } as DestroyOptions);
        this.objects.delete(command.renderObjectId);
        return;
      }
      case "bind-resource": {
        const object = this.objects.get(command.renderObjectId)!;
        const node = object.node as Sprite;
        const bindingKey = spriteKey(command.logicalAssetId, command.exactKey!);
        node.texture = this.spriteTextures.get(bindingKey)!;
        node.anchor.copyFrom(node.texture.defaultAnchor ?? { x: 0, y: 0 });
        const asset = this.profile!.assets.find(
          (candidate) => candidate.logicalAssetId === command.logicalAssetId,
        )!;
        node.blendMode = asset.textureSettings!.blendMode;
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
      case "set-mesh":
      case "set-line":
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

  private destroyUnownedReservedNodes(
    reservedNodes: ReadonlyMap<number, Container>,
  ): void {
    const ownedNodes = new Set([...this.objects.values()].map((value) => value.node));
    for (const node of reservedNodes.values()) {
      if (!ownedNodes.has(node) && !node.destroyed) {
        node.destroy({ children: true } as DestroyOptions);
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

const defaultObjectFactory: PixiSceneObjectFactory = Object.freeze({
  create(role: string, renderObjectId: string, roundPixels: boolean): Container {
    return spriteRole(role)
      ? new Sprite({ texture: Texture.EMPTY, roundPixels, label: renderObjectId })
      : new Container({ label: renderObjectId, sortableChildren: true });
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

function spriteRole(role: string): boolean {
  return role === "note-root" || role === "note-head" || role === "note-icon" ||
    role === "note-intermediate" || role === "note-side-visual" ||
    role === "field-line" || role === "judge-line";
}

function spriteKey(logicalAssetId: string, exactKey: string): string {
  return `${logicalAssetId}\u0000${exactKey}`;
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
