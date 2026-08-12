import {
  evidenceRequired,
  ok,
  type EvidenceRequired,
  type SimulatorResult,
} from "../engine/evidence";
import type {
  RenderBackendFault,
  RenderAnimationRole,
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
  readonly spriteExactKey: string | null;
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
  "hud-result", "hud-life", "hud-add-score", "habahiro-flash", "fidelity-label",
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

  drainCommandSnapshot(): readonly RenderCommand[] {
    const snapshot = Object.freeze([...this.commands]);
    this.commands.length = 0;
    return snapshot;
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
          spriteExactKey: null,
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
        if (command.binding === "sprite") objects.set(command.renderObjectId, Object.freeze({
          ...objects.get(command.renderObjectId)!,
          spriteExactKey: command.exactKey,
        }));
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
      case "set-mask":
        if (
          command.mode !== "visible-inside" ||
          command.polygon.length < 3 ||
          command.polygon.some((value) => !validateVector2(value))
        ) {
          return this.latchFault(
            "render.command.invalid-mask",
            "Portable masks require one explicit visible-inside polygon with typed Float32 vertices.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      case "set-hud": {
        const object = objects.get(command.renderObjectId);
        if (object === undefined || !validateTypedHudCommand(command, object.role)) {
          return this.latchFault(
            "render.command.invalid-hud-state",
            "Each HUD route requires its exact discriminated state, object role and committed Float32 values.",
          );
        }
        return ok(undefined);
      }
      case "play-animation":
      case "stop-animation":
        if (
          typeof command.restart !== "boolean" ||
          !this.hasAnimationRole(command.animationRole) ||
          !animationRoleMatchesObject(command.animationRole, objects.get(command.renderObjectId)?.role) ||
          !animationBindingMatchesProfile(
            command.animationRole,
            objects.get(command.renderObjectId)?.spriteExactKey ?? null,
            this.profile!.ordinaryVisibleProfile,
          )
        ) {
          return this.latchFault(
            "render.command.unknown-animation",
            "Animation commands require one profile-declared exact animation role and explicit restart behavior.",
          );
        }
        return this.requireObject(objects, command.renderObjectId);
      case "sample-animation":
        if (
          !validateRenderFloat32(command.elapsedSeconds) ||
          command.elapsedSeconds.value < 0 ||
          !this.hasAnimationRole(command.animationRole) ||
          !animationRoleMatchesObject(command.animationRole, objects.get(command.renderObjectId)?.role) ||
          !animationBindingMatchesProfile(
            command.animationRole,
            objects.get(command.renderObjectId)?.spriteExactKey ?? null,
            this.profile!.ordinaryVisibleProfile,
          )
        ) {
          return this.latchFault(
            "render.command.invalid-animation-sample",
            "Animation samples require a profile-declared role and one non-negative engine-clock Float32 time.",
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

  private hasAnimationRole(role: RenderAnimationRole): boolean {
    if (this.profile!.assets.some((asset) => asset.animationRole === role)) return true;
    if (role === "score-gauge-ss") return this.profile!.scoreGaugeSsAnimation !== undefined;
    const visible = this.profile!.ordinaryVisibleProfile;
    if (visible !== undefined) {
      if (role === "note-flick") return visible.noteAnimations.clips.some((clip) => clip.clipId === "note-flick-up");
      if (role === "note-directional-flick") return visible.noteAnimations.clips.some((clip) => clip.clipId === "note-flick-left") && visible.noteAnimations.clips.some((clip) => clip.clipId === "note-flick-right");
      if (role === "note-long-flash") return visible.noteAnimations.clips.some((clip) => clip.clipId === "note-long-flash");
      if (role === "combo") return visible.combo.clips.some((clip) => clip.clipId === "combo-scale");
      if (role === "all-perfect") return visible.combo.clips.some((clip) => clip.clipId === "combo-all-perfect");
      if (role === "add-score" || role === "result") return true;
    }
    return role === "habahiro-lane-change" && this.profile!.fidelity.mode === "habahiro";
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
    if (profile.fidelity.fidelity === "current-external-complete") {
      return asset.provenance !== "current-external-portable" &&
        asset.provenance !== "current-apk" && asset.provenance !== "current-device-cache";
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
    case "set-mask":
      return Object.freeze({
        ...command,
        polygon: Object.freeze(command.polygon.map(freezeRenderVector2)),
      });
    case "set-hud":
      return Object.freeze({ ...command, state: freezeHudState(command.state) }) as RenderCommand;
    case "sample-animation":
      return Object.freeze({ ...command, elapsedSeconds: Object.freeze({ ...command.elapsedSeconds }) });
    default:
      return Object.freeze({ ...command });
  }
}

function animationBindingMatchesProfile(
  role: RenderAnimationRole,
  spriteExactKey: string | null,
  profile: RenderResourceProfile["ordinaryVisibleProfile"],
): boolean {
  if (role !== "note-flick" && role !== "note-directional-flick" && role !== "note-long-flash") {
    return true;
  }
  if (profile === undefined || spriteExactKey === null) return false;
  if (role === "note-flick") return spriteExactKey === profile.noteAnimations.directionalSpriteKeys.up;
  if (role === "note-directional-flick") {
    return spriteExactKey === profile.noteAnimations.directionalSpriteKeys.left ||
      spriteExactKey === profile.noteAnimations.directionalSpriteKeys.right;
  }
  return spriteExactKey.startsWith(profile.noteAnimations.longFlashSpritePrefix);
}

function animationRoleMatchesObject(role: RenderAnimationRole, objectRole: string | undefined): boolean {
  return (role === "note-flick" || role === "note-directional-flick") ? objectRole === "note-icon" :
    role === "note-long-flash" ? objectRole === "note-intermediate" :
    (role === "combo" || role === "all-perfect") ? objectRole === "hud-combo" :
    role === "add-score" ? objectRole === "hud-add-score" :
    role === "result" ? objectRole === "hud-result" :
    role === "score-gauge-ss" ? objectRole === "hud-score" :
    role === "habahiro-lane-change" ? objectRole === "habahiro-flash" : false;
}

function freezeHudState<T extends object>(state: T): T {
  const frozen: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    frozen[key] = value !== null && typeof value === "object"
      ? Object.freeze({ ...(value as object) })
      : value;
  }
  return Object.freeze(frozen) as T;
}

function validateTypedHudCommand(
  command: Extract<RenderCommand, { readonly kind: "set-hud" }>,
  objectRole: string,
): boolean {
  const state = command.state as unknown as Record<string, unknown>;
  switch (command.hudRole) {
    case "score":
      return objectRole === "hud-score" && exactKeys(state, ["beforeRank", "foregroundActive", "highRankEffect", "highRankEffectActive", "indicatorLocalX", "meterKey", "rank", "rankChanged", "rankMarkerALocalX", "rankMarkerBLocalX", "rankMarkerCLocalX", "rankMarkerSLocalX", "rankMarkerSSLocalX", "ratio", "score", "scoreMax", "scoreText", "sliderValue"]) &&
        isUInt32(state.score) && isUInt32(state.scoreMax) && (state.scoreMax as number) > 0 && typeof state.scoreText === "string" &&
        validateRenderFloat32(state.ratio as never) && validateRenderFloat32(state.sliderValue as never) &&
        [state.rankMarkerALocalX, state.rankMarkerBLocalX, state.rankMarkerCLocalX, state.rankMarkerSLocalX, state.rankMarkerSSLocalX].every((value) => validateRenderFloat32(value as never));
    case "combo":
      return objectRole === "hud-combo" && exactKeys(state, ["allPerfect", "combo"]) && isUInt32(state.combo) && (state.combo as number) <= 9999 && typeof state.allPerfect === "boolean";
    case "result":
      return objectRole === "hud-result" && exactKeys(state, ["judgeKey", "timingKey"]) && ["judge_auto", "judge_miss", "judge_bad", "judge_good", "judge_great", "judge_perfect"].includes(state.judgeKey as string) && (state.timingKey === null || state.timingKey === "judge_fast" || state.timingKey === "judge_slow");
    case "life":
      return objectRole === "hud-life" && exactKeys(state, ["color", "currentLife", "label", "lifeUpperLimit", "playerMaxLife", "primaryFill", "secondaryFill", "singleGameOver", "warning"]) &&
        isUInt32(state.currentLife) && isUInt32(state.playerMaxLife) && isUInt32(state.lifeUpperLimit) && typeof state.label === "string" && /^\d+\/\d+$/.test(state.label) &&
        validateRenderFloat32(state.primaryFill as never) && validateRenderFloat32(state.secondaryFill as never) && (state.color === "normal" || state.color === "danger") && typeof state.warning === "boolean" && typeof state.singleGameOver === "boolean";
    case "add-score":
      return objectRole === "hud-add-score" && exactKeys(state, ["depth", "poolIndex", "value"]) && isUInt32(state.value) && (state.value as number) > 0 && Number.isInteger(state.poolIndex) && (state.poolIndex as number) >= 0 && (state.poolIndex as number) < 4 && Number.isInteger(state.depth) && (state.depth as number) >= 0 && (state.depth as number) < 8;
    case "habahiro-flash":
      return objectRole === "habahiro-flash" && exactKeys(state, ["phase", "progress"]) && state.phase === "flash-start" && validateRenderFloat32(state.progress as never) && (state.progress as { value: number }).value === 0;
    case "fidelity-label":
      return objectRole === "fidelity-label" && state.label === "HABAHIRO" && state.visible === true && (exactKeys(state, ["label", "visible"]) || exactKeys(state, ["absolutePosition", "label", "laneChangePhase", "visible"]) && Number.isInteger(state.absolutePosition) && (state.absolutePosition as number) >= 0 && ["flash-start", "change-lane", "complete"].includes(state.laneChangePhase as string));
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isUInt32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;
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
