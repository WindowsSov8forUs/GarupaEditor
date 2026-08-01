import type {
  RenderCommand,
  RenderCommandBatch,
  SimulatorRendererBackend,
} from "../../backends/renderingContracts";
import {
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type NoteInformation,
} from "../chart/types";
import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import type { NoteFamily } from "../data/noteData";

export interface RenderEngineResourceBindings {
  readonly noteAtlasLogicalAssetId: string;
  readonly directionalAtlasLogicalAssetId: string;
}

export interface RenderPoolIdentityPlan {
  readonly poolObjectId: string;
  readonly family: NoteFamily;
}

export class RenderOwnerTransaction {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    private readonly renderer: SimulatorRendererBackend,
    private readonly batch: RenderCommandBatch | null,
  ) {}

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return transactionRejected("commit", this.state);
    }
    const committed = this.batch === null
      ? ok(undefined)
      : this.renderer.commit(this.batch);
    if (committed.status === "ok") this.state = "committed";
    return committed;
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return transactionRejected("discard", this.state);
    }
    const discarded = this.batch === null
      ? ok(undefined)
      : this.renderer.discard(this.batch);
    if (discarded.status === "ok") this.state = "discarded";
    return discarded;
  }
}

export class RenderCommandProducer {
  private frame = 0;

  constructor(
    readonly sessionId: string,
    private readonly renderer: SimulatorRendererBackend,
    private readonly resources: RenderEngineResourceBindings,
  ) {}

  validate(): SimulatorResult<void> {
    const snapshot = this.renderer.snapshot();
    if (
      typeof this.sessionId !== "string" ||
      this.sessionId.length === 0 ||
      snapshot.state !== "ready" ||
      snapshot.sessionId !== this.sessionId ||
      snapshot.fault !== null ||
      !isNonEmpty(this.resources.noteAtlasLogicalAssetId) ||
      !isNonEmpty(this.resources.directionalAtlasLogicalAssetId)
    ) {
      return evidenceRequired(
        "render.producer.invalid-session-or-resource-bindings",
        ["RPR-D03", "RPR-D14", "PR05", "PR38"],
        "The producer requires one ready renderer session and explicit exact Note/Directional logical asset IDs.",
      );
    }
    return ok(undefined);
  }

  beginOuterFrame(frame: number): SimulatorResult<void> {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame < this.frame) {
      return evidenceRequired(
        "render.producer.invalid-frame",
        ["RPR-D13", "PR33", "PR34"],
        "Render frame identity is monotonic and authored by the engine outer-frame owner.",
      );
    }
    this.frame = frame;
    return ok(undefined);
  }

  preflightPoolSetup(
    pools: readonly RenderPoolIdentityPlan[],
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (pools.length === 0) {
      return ok(new RenderOwnerTransaction(this.renderer, null));
    }
    const base = this.commandBase(0);
    const commands: RenderCommand[] = [];
    for (const pool of pools) {
      const renderObjectId = rootRenderObjectId(pool.poolObjectId);
      commands.push({
        ...base(commands.length),
        kind: "create-object",
        renderObjectId,
        poolFamily: pool.family,
        role: "note-root",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId,
      });
    }
    return this.preflight(commands);
  }

  preflightNoteActivation(
    poolObjectId: string,
    information: NoteInformation,
    substep: number,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (!Number.isSafeInteger(substep) || substep < 0) {
      return evidenceRequired(
        "render.producer.invalid-substep",
        ["RPR-D13", "PR33", "PR39"],
        "Note activation commands require the engine-owned non-negative adaptive substep.",
      );
    }
    const binding = resolveFrontSpriteBinding(
      information,
      this.renderer.snapshot().fidelity?.mode === "habahiro",
      this.resources,
    );
    if (binding.status !== "ok") return binding;
    const renderObjectId = rootRenderObjectId(poolObjectId);
    const base = this.commandBase(substep);
    const commands: readonly RenderCommand[] = [
      {
        ...base(0),
        kind: "activate-object",
        renderObjectId,
      },
      {
        ...base(1),
        kind: "bind-resource",
        renderObjectId,
        binding: "sprite",
        logicalAssetId: binding.value.logicalAssetId,
        exactKey: binding.value.exactKey,
      },
    ];
    return this.preflight(commands);
  }

  private preflight(
    commands: readonly RenderCommand[],
  ): SimulatorResult<RenderOwnerTransaction> {
    const batch = this.renderer.preflight(commands);
    return batch.status === "ok"
      ? ok(new RenderOwnerTransaction(this.renderer, batch.value))
      : batch;
  }

  private commandBase(substep: number) {
    const firstSequence = this.renderer.snapshot().nextSequence;
    return (offset: number) => ({
      sessionId: this.sessionId,
      sequence: firstSequence + offset,
      frame: this.frame,
      substep,
    });
  }
}

export function rootRenderObjectId(poolObjectId: string): string {
  return `render:${poolObjectId}:root`;
}

export function resolveFrontSpriteBinding(
  information: NoteInformation,
  habahiro: boolean,
  resources: RenderEngineResourceBindings,
): SimulatorResult<{
  readonly logicalAssetId: string;
  readonly exactKey: string;
}> {
  const laneSuffix = resolveLaneSuffix(information, habahiro);
  if (laneSuffix.status !== "ok") return laneSuffix;
  if (
    information.fireNoteType === FrontNoteType.DirectionalFlick ||
    information.gameNoteType === GameNoteType.DirectionalFlickLeft ||
    information.gameNoteType === GameNoteType.DirectionalFlickRight
  ) {
    if (habahiro) {
      return evidenceRequired(
        "render.note.habahiro-directional-root-unrepresented",
        ["RPR-D03", "RPR-D04", "PR04", "PR09", "HA-D04"],
        "The degraded HABAHIRO directional side-visual route is separate from the front Sprite binding and is not inferred here.",
      );
    }
    const direction = information.gameNoteType === GameNoteType.DirectionalFlickLeft
      ? "l"
      : information.gameNoteType === GameNoteType.DirectionalFlickRight
      ? "r"
      : null;
    if (direction === null) {
      return evidenceRequired(
        "render.note.directional-side-unresolved",
        ["RPR-D03", "RPR-D04", "PR03", "PR09"],
        "A Directional front owner must expose its exact left/right GameNoteType before Sprite lookup.",
      );
    }
    return ok(Object.freeze({
      logicalAssetId: resources.directionalAtlasLogicalAssetId,
      exactKey: `note_flick_${direction}_${laneSuffix.value}`,
    }));
  }

  let family: "note_normal" | "note_normal_16" | "note_skill" | "note_long" | "note_flick";
  if (information.gameNoteAdditionalType === GameNoteAdditionalType.Skill) {
    family = "note_skill";
  } else {
    switch (information.fireNoteType) {
      case FrontNoteType.Normal:
        family = information.shortRhythmUnder8beat ? "note_normal_16" : "note_normal";
        break;
      case FrontNoteType.Long:
      case FrontNoteType.SlideA:
      case FrontNoteType.SlideB:
        family = "note_long";
        break;
      case FrontNoteType.Flick:
        family = "note_flick";
        break;
      default:
        return evidenceRequired(
          "render.note.front-sprite-route-unrepresented",
          ["RPR-D03", "RPR-D04", "PR06", "PR09"],
          "Multiple Directional and add-visual families require their dedicated owner route rather than a guessed front Sprite.",
        );
    }
  }
  return ok(Object.freeze({
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `${family}_${laneSuffix.value}`,
  }));
}

function resolveLaneSuffix(
  information: NoteInformation,
  habahiro: boolean,
): SimulatorResult<string> {
  const buttons = information.buttonTypesArray.length > 0
    ? information.buttonTypesArray
    : information.buttonTypes.length > 0
    ? information.buttonTypes
    : [information.buttonType];
  const lanes = buttons.map((button) => button - ButtonType.Button_01_BMS_1P_01);
  if (
    lanes.length === 0 ||
    lanes.some((lane) => !Number.isInteger(lane) || lane < 0 || lane > 6) ||
    lanes.some((lane, index) => index > 0 && lane !== lanes[index - 1]! + 1)
  ) {
    return evidenceRequired(
      "render.note.invalid-lane-range",
      ["RPR-D03", "RPR-D04", "PR04", "PR05", "PR07"],
      "Sprite lookup requires one confirmed lane or one ascending contiguous HABAHIRO lane range within 0-6.",
    );
  }
  if (!habahiro && lanes.length !== 1) {
    return evidenceRequired(
      "render.note.ordinary-multi-lane-key-unavailable",
      ["RPR-D03", "PR02", "PR05"],
      "The ordinary 45-Sprite atlas has only single-lane exact keys and cannot alias a multi-lane range.",
    );
  }
  return ok(lanes.join("_"));
}

function transactionRejected(
  operation: string,
  state: "committed" | "discarded",
) {
  return evidenceRequired(
    `render.producer.transaction-${operation}-after-${state}`,
    ["RPR-D13", "RPR-D17", "PR36", "PR38"],
    "A renderer owner transaction is one-use and cannot be replayed after commit or discard.",
  );
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
