import {
  evidenceRequired,
  ok,
  type EvidenceRequired,
  type SimulatorResult,
} from "../engine/evidence";
import type {
  RenderBackendFault,
  RenderBackendSnapshot,
  RenderCommand,
  RenderCommandBatch,
  RenderFidelitySelection,
  RenderResourcePreflightAdapter,
  RenderResourceProfile,
  SimulatorRendererBackend,
  SimulatorResourceProvider,
} from "./renderingContracts";
import {
  freezeRenderColor,
  freezeRenderVector2,
  freezeRenderVector3,
  validateAndFreezeRenderProfile,
  validateRenderFloat32,
} from "./renderingValidation";

interface RecordingRenderObject {
  readonly role: string;
  readonly poolFamily: string;
}

interface PendingRenderBatch {
  readonly capability: RenderCommandBatch;
  readonly commands: readonly RenderCommand[];
  readonly objects: ReadonlyMap<string, RecordingRenderObject>;
}

const RENDER_OBJECT_ROLES = new Set([
  "note-root", "note-head", "note-icon", "note-intermediate",
  "note-side-visual", "note-mesh", "sync-line", "multiple-directional-line",
  "field-line", "judge-line", "mask", "hud-score", "hud-combo",
  "hud-result", "hud-life", "hud-overlay", "fidelity-label",
]);
const HUD_ROLES = new Set([
  "score", "combo", "result", "life", "overlay", "fidelity-label",
]);

export class RecordingSimulatorRendererBackend implements SimulatorRendererBackend {
  readonly id = "recording-renderer";

  private state: RenderBackendSnapshot["state"] = "unprepared";
  private sessionId: string | null = null;
  private fidelity: RenderFidelitySelection | null = null;
  private nextSequence = 0;
  private resourceCount = 0;
  private fault: RenderBackendFault | null = null;
  private readonly objects = new Map<string, RecordingRenderObject>();
  private readonly commands: RenderCommand[] = [];
  private profile: RenderResourceProfile | null = null;
  private pendingBatch: PendingRenderBatch | null = null;

  async prepare(
    sessionId: string,
    profile: RenderResourceProfile,
    provider: SimulatorResourceProvider,
    preflight: RenderResourcePreflightAdapter,
  ): Promise<SimulatorResult<void>> {
    if (this.state !== "unprepared") {
      return this.reject(
        "render.prepare.invalid-state",
        "A renderer session can be prepared exactly once and cannot recover from fault or disposal.",
      );
    }
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return this.reject(
        "render.prepare.invalid-session",
        "Prepare requires one non-empty host-authored renderer session identity.",
      );
    }
    const validated = validateAndFreezeRenderProfile(profile);
    if (validated.status !== "ok") return validated;
    const fidelity = validateResourceProvenance(validated.value);
    if (fidelity.status !== "ok") return fidelity;

    this.state = "preparing";
    try {
      for (const asset of validated.value.assets) {
        const read = await provider.read(asset.logicalAssetId);
        if (read.status !== "ok") return this.abortPrepare(read);
        if (!(read.value instanceof Uint8Array)) {
          return this.abortPrepare(this.reject(
            "render.prepare.invalid-provider-bytes",
            "The provider must return bytes, not URLs, decoded objects or backend handles.",
          ));
        }
        const bytes = Uint8Array.from(read.value);
        if (bytes.byteLength !== asset.byteLength) {
          return this.abortPrepare(this.reject(
            "render.prepare.byte-length-mismatch",
            "Every declared resource byte length must match before any renderer object is created.",
          ));
        }
        const digest = await preflight.sha256(bytes);
        if (digest.status !== "ok") return this.abortPrepare(digest);
        if (digest.value !== asset.sha256) {
          return this.abortPrepare(this.reject(
            "render.prepare.sha256-mismatch",
            "Every resource must match its uppercase SHA-256 before decode or scene creation.",
          ));
        }
        const metadata = await preflight.inspect(bytes, asset.mime);
        if (metadata.status !== "ok") return this.abortPrepare(metadata);
        if (
          asset.mime === "image/png" &&
          (metadata.value === null ||
            metadata.value.width !== asset.width ||
            metadata.value.height !== asset.height)
        ) {
          return this.abortPrepare(this.reject(
            "render.prepare.dimension-mismatch",
            "Decoded image dimensions must match the profile before scene creation.",
          ));
        }
        if (asset.mime !== "image/png" && metadata.value !== null) {
          return this.abortPrepare(this.reject(
            "render.prepare.unexpected-decoded-metadata",
            "Non-image resources cannot acquire implicit dimensions during preflight.",
          ));
        }
      }
    } catch {
      return this.abortPrepare(this.reject(
        "render.prepare.provider-or-preflight-threw",
        "Provider and preflight exceptions fail atomically without retaining bytes or renderer objects.",
      ));
    }

    this.sessionId = sessionId;
    this.fidelity = validated.value.fidelity;
    this.profile = validated.value;
    this.resourceCount = validated.value.assets.length;
    this.state = "ready";
    return ok(undefined);
  }

  preflight(commands: readonly RenderCommand[]): SimulatorResult<RenderCommandBatch> {
    if (this.state !== "ready" || this.profile === null || this.sessionId === null) {
      return this.latchFault(
        "render.command.renderer-not-ready",
        "Commands require a prepared, non-faulted, non-disposed renderer session.",
      );
    }
    if (this.pendingBatch !== null || !Array.isArray(commands) || commands.length === 0) {
      return this.latchFault(
        "render.command.invalid-or-overlapping-batch",
        "Exactly one non-empty command batch may be preflighted for the current renderer state.",
      );
    }
    const simulatedObjects = new Map(this.objects);
    const frozenCommands: RenderCommand[] = [];
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      if (
        command === null ||
        typeof command !== "object" ||
        command.sessionId !== this.sessionId ||
        command.sequence !== this.nextSequence + index ||
        !isNonNegativeInteger(command.frame) ||
        !isNonNegativeInteger(command.substep) ||
        typeof command.renderObjectId !== "string" ||
        command.renderObjectId.length === 0
      ) {
        return this.latchFault(
          "render.command.invalid-session-or-sequence",
          "Commands must preserve one session, contiguous sequence and non-negative frame/substep identity.",
        );
      }
      const validation = this.validateCommand(command, simulatedObjects);
      if (validation.status !== "ok") return validation;
      frozenCommands.push(freezeCommand(command));
    }
    const capability = Object.freeze({
      sessionId: this.sessionId,
      firstSequence: this.nextSequence,
      commandCount: frozenCommands.length,
    });
    this.pendingBatch = Object.freeze({
      capability,
      commands: Object.freeze(frozenCommands),
      objects: simulatedObjects,
    });
    return ok(capability);
  }

  commit(batch: RenderCommandBatch): SimulatorResult<void> {
    const pending = this.pendingBatch;
    if (
      this.state !== "ready" ||
      pending === null ||
      pending.capability !== batch ||
      batch.sessionId !== this.sessionId ||
      batch.firstSequence !== this.nextSequence
    ) {
      return this.latchFault(
        "render.command.invalid-batch-capability",
        "Only the exact one-use batch capability issued for the current session and sequence may commit.",
      );
    }
    this.objects.clear();
    for (const [objectId, object] of pending.objects) {
      this.objects.set(objectId, object);
    }
    this.commands.push(...pending.commands);
    this.nextSequence += pending.commands.length;
    this.pendingBatch = null;
    return ok(undefined);
  }

  discard(batch: RenderCommandBatch): SimulatorResult<void> {
    if (this.pendingBatch?.capability !== batch) {
      return this.latchFault(
        "render.command.invalid-discard-capability",
        "Only the exact pending batch may be discarded after an owner mutation fails.",
      );
    }
    this.pendingBatch = null;
    return ok(undefined);
  }

  execute(command: RenderCommand): SimulatorResult<void> {
    const batch = this.preflight([command]);
    return batch.status === "ok" ? this.commit(batch.value) : batch;
  }

  snapshot(): RenderBackendSnapshot {
    return Object.freeze({
      state: this.state,
      sessionId: this.sessionId,
      fidelity: this.fidelity === null ? null : Object.freeze({ ...this.fidelity }),
      nextSequence: this.nextSequence,
      objectCount: this.objects.size,
      resourceCount: this.resourceCount,
      fault: this.fault === null ? null : Object.freeze({ ...this.fault }),
    });
  }

  commandSnapshot(): readonly RenderCommand[] {
    return Object.freeze([...this.commands]);
  }

  recordTerminalFault(capability: string, boundary: string): EvidenceRequired {
    return this.latchFault(capability, boundary);
  }

  resetObjectsAfterTerminalRendererMutation(): void {
    this.objects.clear();
    this.pendingBatch = null;
  }

  dispose(): SimulatorResult<void> {
    if (this.state === "disposed") return ok(undefined);
    this.objects.clear();
    this.profile = null;
    this.sessionId = null;
    this.fidelity = null;
    this.nextSequence = 0;
    this.resourceCount = 0;
    this.fault = null;
    this.pendingBatch = null;
    this.state = "disposed";
    return ok(undefined);
  }

  private validateCommand(
    command: RenderCommand,
    objects: Map<string, RecordingRenderObject>,
  ): SimulatorResult<void> {
    switch (command.kind) {
      case "create-object":
      case "acquire-object": {
        if (
          objects.has(command.renderObjectId) ||
          typeof command.poolFamily !== "string" ||
          command.poolFamily.length === 0 ||
          !RENDER_OBJECT_ROLES.has(command.role) ||
          (command.parentObjectId !== null &&
            (typeof command.parentObjectId !== "string" ||
              !objects.has(command.parentObjectId)))
        ) {
          return this.latchFault(
            "render.command.invalid-object-acquire",
            "Object identities are unique within one session and parent identities must already exist.",
          );
        }
        objects.set(command.renderObjectId, Object.freeze({
          role: command.role,
          poolFamily: command.poolFamily,
        }));
        return ok(undefined);
      }
      case "release-object":
        if (!objects.has(command.renderObjectId)) {
          return this.latchFault(
            "render.command.release-missing-object",
            "Release cannot infer or ignore a missing render identity.",
          );
        }
        objects.delete(command.renderObjectId);
        return ok(undefined);
      case "activate-object":
      case "hide-object":
      case "deactivate-object":
        return this.requireObject(objects, command.renderObjectId);
      case "bind-resource": {
        const object = this.requireObject(objects, command.renderObjectId);
        if (object.status !== "ok") return object;
        const asset = this.profile!.assets.find(
          (candidate) => candidate.logicalAssetId === command.logicalAssetId,
        );
        if (
          asset === undefined ||
          (command.binding !== "sprite" &&
            command.binding !== "material" &&
            command.binding !== "animation") ||
          (command.binding === "sprite" &&
            (command.exactKey === null ||
              !asset.atlasRows.some((row) => row.exactKey === command.exactKey))) ||
          (command.binding !== "sprite" && command.exactKey !== null)
        ) {
          return this.latchFault(
            "render.command.unknown-resource-binding",
            "Resource bindings use exact logical IDs and Sprite keys without aliases or fallback.",
          );
        }
        return ok(undefined);
      }
      case "set-transform":
        if (
          !validateVector3(command.position) ||
          !validateVector2(command.scale) ||
          !validateRenderFloat32(command.rotationDegrees) ||
          !validateColor(command.color) ||
          !validateOrdering(command.ordering) ||
          (command.maskObjectId !== null && !objects.has(command.maskObjectId))
        ) {
          return this.latchFault(
            "render.command.invalid-transform",
            "Transform, color, ordering and mask references must preserve validated Float32 values and identities.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      case "set-mesh":
        if (
          command.vertices.length === 0 ||
          command.indices.length === 0 ||
          command.uv.length !== command.vertices.length ||
          command.colors.length !== command.vertices.length ||
          command.vertices.some((value) => !validateVector3(value)) ||
          command.uv.some((value) => !validateVector2(value)) ||
          command.colors.some((value) => !validateColor(value)) ||
          command.indices.some((value) =>
            !isNonNegativeInteger(value) || value >= command.vertices.length)
        ) {
          return this.latchFault(
            "render.command.invalid-mesh",
            "Mesh topology, UV, colors and indices must be complete and in bounds.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      case "set-line":
        if (
          !validateVector3(command.start) ||
          !validateVector3(command.end) ||
          !validateRenderFloat32(command.width) ||
          command.width.value <= 0
        ) {
          return this.latchFault(
            "render.command.invalid-line",
            "Line endpoints and positive width must preserve confirmed Float32 values.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      case "set-threshold":
        if (!validateRenderFloat32(command.threshold)) {
          return this.latchFault(
            "render.command.invalid-threshold",
            "Shader threshold must preserve its confirmed Float32 value without clamping.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      case "set-hud":
        if (
          !HUD_ROLES.has(command.hudRole) ||
          command.state === null ||
          typeof command.state !== "object" ||
          Array.isArray(command.state) ||
          Object.values(command.state).some((value) =>
            value !== null &&
            typeof value !== "string" &&
            typeof value !== "boolean" &&
            (typeof value !== "number" || !Number.isFinite(value)))
        ) {
          return this.latchFault(
            "render.command.invalid-hud-state",
            "HUD state must be an immutable scalar record authored by the engine owner.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      case "play-animation":
      case "stop-animation":
        if (
          typeof command.restart !== "boolean" ||
          !this.profile!.assets.some((asset) =>
            asset.animationRole === command.animationRole &&
            asset.animationRole !== "none")
        ) {
          return this.latchFault(
            "render.command.unknown-animation",
            "Animation commands require one profile-declared exact animation role and explicit restart behavior.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      default:
        return this.latchFault(
          "render.command.unknown-command",
          "Unknown command kinds cannot be ignored or treated as no-op renderer mutations.",
        );
    }
  }

  private requireObject(
    objects: ReadonlyMap<string, RecordingRenderObject>,
    renderObjectId: string,
  ): SimulatorResult<void> {
    return objects.has(renderObjectId)
      ? ok(undefined)
      : this.latchFault(
          "render.command.missing-object",
          "Commands cannot infer an object from note index, Sprite name or array position.",
        );
  }

  private abortPrepare<T>(result: SimulatorResult<T>): SimulatorResult<void> {
    this.state = "unprepared";
    return result.status === "ok" ? ok(undefined) : result;
  }

  private latchFault(capability: string, boundary: string): EvidenceRequired {
    if (this.fault !== null) {
      return this.reject(this.fault.capability, this.fault.boundary);
    }
    const rejected = this.reject(capability, boundary);
    this.fault = Object.freeze({ capability, boundary });
    this.state = "faulted";
    return rejected;
  }

  private reject(capability: string, boundary: string): EvidenceRequired {
    return evidenceRequired(
      capability,
      ["RPR-D14", "RPR-D17", "PR35", "PR36", "PR37", "PR38"],
      boundary,
    );
  }
}

function validateResourceProvenance(
  profile: RenderResourceProfile,
): SimulatorResult<void> {
  const invalid = profile.assets.some((asset) => {
    if (profile.fidelity.mode === "ordinary") {
      return asset.provenance !== "current-apk" &&
        asset.provenance !== "current-device-cache";
    }
    if (profile.fidelity.fidelity === "exact-current-unityfs") {
      return asset.provenance !== "current-apk" &&
        asset.provenance !== "current-device-cache";
    }
    switch (profile.fidelity.profile) {
      case "current-external-portable-atlas":
        return asset.provenance !== "current-external-portable";
      case "historical-atlas-proxy":
        return asset.provenance !== "historical-proxy";
      case "current-ordinary-stretch-proxy":
        return asset.provenance !== "generated-current-ordinary-proxy" &&
          asset.provenance !== "current-apk" &&
          asset.provenance !== "current-device-cache";
    }
  });
  return invalid
    ? evidenceRequired(
        "render.profile.provenance-fidelity-mismatch",
        ["RPR-D02", "RPR-D14", "PR01", "PR04"],
        "Resource provenance must match the explicitly selected fidelity and cannot upgrade external or proxy bytes to exact parity.",
      )
    : ok(undefined);
}

function freezeCommand(command: RenderCommand): RenderCommand {
  switch (command.kind) {
    case "set-transform":
      return Object.freeze({
        ...command,
        position: freezeRenderVector3(command.position),
        scale: freezeRenderVector2(command.scale),
        rotationDegrees: Object.freeze({ ...command.rotationDegrees }),
        color: freezeRenderColor(command.color),
        ordering: Object.freeze({
          ...command.ordering,
          sourceZ: Object.freeze({ ...command.ordering.sourceZ }),
        }),
      });
    case "set-mesh":
      return Object.freeze({
        ...command,
        vertices: Object.freeze(command.vertices.map(freezeRenderVector3)),
        indices: Object.freeze([...command.indices]),
        uv: Object.freeze(command.uv.map(freezeRenderVector2)),
        colors: Object.freeze(command.colors.map(freezeRenderColor)),
      });
    case "set-line":
      return Object.freeze({
        ...command,
        start: freezeRenderVector3(command.start),
        end: freezeRenderVector3(command.end),
        width: Object.freeze({ ...command.width }),
      });
    case "set-threshold":
      return Object.freeze({
        ...command,
        threshold: Object.freeze({ ...command.threshold }),
      });
    case "set-hud":
      return Object.freeze({
        ...command,
        state: Object.freeze({ ...command.state }),
      });
    default:
      return Object.freeze({ ...command });
  }
}

function validateVector2(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const vector = value as { readonly x?: unknown; readonly y?: unknown };
  return validateRenderFloat32(vector.x as never) &&
    validateRenderFloat32(vector.y as never);
}

function validateVector3(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const vector = value as { readonly z?: unknown };
  return validateVector2(value) && validateRenderFloat32(vector.z as never);
}

function validateColor(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const color = value as {
    readonly red?: unknown;
    readonly green?: unknown;
    readonly blue?: unknown;
    readonly alpha?: unknown;
  };
  return validateRenderFloat32(color.red as never) &&
    validateRenderFloat32(color.green as never) &&
    validateRenderFloat32(color.blue as never) &&
    validateRenderFloat32(color.alpha as never);
}

function validateOrdering(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const ordering = value as {
    readonly domainLayer?: unknown;
    readonly sourceDepthOrSortingOrder?: unknown;
    readonly sourceZ?: unknown;
    readonly creationSequence?: unknown;
  };
  return Number.isSafeInteger(ordering.domainLayer) &&
    Number.isSafeInteger(ordering.sourceDepthOrSortingOrder) &&
    validateRenderFloat32(ordering.sourceZ as never) &&
    isNonNegativeInteger(ordering.creationSequence);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
