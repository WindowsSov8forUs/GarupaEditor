import type {
  RenderColor,
  RenderCommand,
  RenderCommandBatch,
  RenderFloat32,
  RenderOrderingKey,
  RenderVector2,
  RenderVector3,
  SimulatorRendererBackend,
} from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
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
import type { InGameRecordSnapshot } from "../managers/inGameRecord";
import type { ScoreLifeReflectPlan } from "../managers/scoreLifeStateManager";
import {
  advanceOrdinaryNoteMotion,
  type OrdinaryNoteMotionResult,
  type OrdinaryNoteMotionState,
} from "./ordinaryNoteGeometry";

export interface RenderEngineResourceBindings {
  readonly noteAtlasLogicalAssetId: string;
  readonly directionalAtlasLogicalAssetId: string;
}

export interface RenderPoolIdentityPlan {
  readonly poolObjectId: string;
  readonly family: NoteFamily;
}

export interface OrdinaryNoteTransformVisualState {
  readonly color: RenderColor;
  readonly ordering: RenderOrderingKey;
  readonly maskObjectId: null;
}

export interface PreparedOrdinaryNoteMotion {
  readonly motion: OrdinaryNoteMotionResult;
  readonly transaction: RenderOwnerTransaction;
}

export interface RenderFieldObjectPlan {
  readonly renderObjectId: string;
  readonly role: "field-line" | "judge-line";
  readonly logicalAssetId: string;
  readonly exactKey: string;
  readonly position: RenderVector3;
  readonly scale: RenderVector2;
  readonly rotationDegrees: RenderFloat32;
  readonly color: RenderColor;
  readonly ordering: RenderOrderingKey;
  readonly maskObjectId: null;
}

export class RenderOwnerTransaction {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    private readonly renderer: SimulatorRendererBackend,
    private readonly batch: RenderCommandBatch | null,
    private readonly onCommit: () => void = () => {},
  ) {}

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return transactionRejected("commit", this.state);
    }
    const committed = this.batch === null
      ? ok(undefined)
      : this.renderer.commit(this.batch);
    if (committed.status === "ok") {
      this.state = "committed";
      this.onCommit();
    }
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

const HUD_OBJECTS = Object.freeze({
  addScore: "render:hud:add-score",
  combo: "render:hud:combo",
  result: "render:hud:result",
  score: "render:hud:score",
  life: "render:hud:life",
  overlay: "render:hud:overlay",
  fidelity: "render:hud:fidelity-label",
});

export class RenderCommandProducer {
  private frame = 0;
  private substep = 0;
  private readonly createdObjectIds: string[] = [];

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
    this.substep = 0;
    return ok(undefined);
  }

  beginSubstep(substep: number): SimulatorResult<void> {
    if (!Number.isSafeInteger(substep) || substep < 0) {
      return evidenceRequired(
        "render.producer.invalid-substep",
        ["RPR-D13", "PR33", "PR39"],
        "Render substep identity is a non-negative integer authored by NoteManager.",
      );
    }
    this.substep = substep;
    return ok(undefined);
  }

  preflightHudSetup(
    record: InGameRecordSnapshot,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const base = this.commandBase(0);
    const commands: RenderCommand[] = [];
    const created: string[] = [];
    const create = (
      renderObjectId: string,
      role: "hud-score" | "hud-combo" | "hud-result" | "hud-life" | "hud-overlay" | "fidelity-label",
    ) => {
      created.push(renderObjectId);
      commands.push({
      ...base(commands.length),
      kind: "create-object",
      renderObjectId,
      poolFamily: role,
      role,
      parentObjectId: null,
      });
    };
    create(HUD_OBJECTS.addScore, "hud-overlay");
    create(HUD_OBJECTS.combo, "hud-combo");
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.combo });
    create(HUD_OBJECTS.result, "hud-result");
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.result });
    create(HUD_OBJECTS.score, "hud-score");
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.score,
      hudRole: "score",
      state: Object.freeze({ score: record.score }),
    });
    create(HUD_OBJECTS.life, "hud-life");
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.life,
      hudRole: "life",
      state: lifeHudState(record),
    });
    create(HUD_OBJECTS.overlay, "hud-overlay");
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.overlay });
    const fidelity = this.renderer.snapshot().fidelity;
    if (fidelity?.mode === "habahiro" && fidelity.fidelity === "degraded") {
      create(HUD_OBJECTS.fidelity, "fidelity-label");
      commands.push({
        ...base(commands.length),
        kind: "set-hud",
        renderObjectId: HUD_OBJECTS.fidelity,
        hudRole: "fidelity-label",
        state: Object.freeze({ label: fidelity.visibleLabel, visible: true }),
      });
    }
    return this.preflight(commands, () => this.createdObjectIds.push(...created));
  }

  preflightHudReflect(
    plan: ScoreLifeReflectPlan,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.addScore,
      hudRole: "overlay",
      state: Object.freeze({
        addScore: plan.reflect.totalOrdinaryScore,
        freeLiveEventBonusAddScore: plan.reflect.totalFreeLiveEventBonusScore,
      }),
    });
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.combo,
      hudRole: "combo",
      state: Object.freeze({
        combo: plan.record.currentCombo,
        allPerfect: plan.record.allPerfect,
      }),
    });
    commands.push({
      ...base(commands.length),
      kind: plan.record.currentCombo > 0 ? "activate-object" : "hide-object",
      renderObjectId: HUD_OBJECTS.combo,
    });
    commands.push({
      ...base(commands.length),
      kind: "activate-object",
      renderObjectId: HUD_OBJECTS.result,
    });
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.result,
      hudRole: "result",
      state: Object.freeze({
        representativeSlot: plan.reflect.representativeSlot,
        representativeResult: plan.reflect.representativeRawResult,
      }),
    });
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.score,
      hudRole: "score",
      state: Object.freeze({ score: plan.record.score }),
    });
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.life,
      hudRole: "life",
      state: lifeHudState(plan.record),
    });
    return this.preflight(commands);
  }

  preflightFieldSetup(
    plans: readonly RenderFieldObjectPlan[],
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (
      plans.length === 0 ||
      plans.some((plan) =>
        !isNonEmpty(plan.renderObjectId) ||
        !isNonEmpty(plan.logicalAssetId) ||
        !isNonEmpty(plan.exactKey) ||
        (plan.role !== "field-line" && plan.role !== "judge-line") ||
        plan.maskObjectId !== null
      ) ||
      new Set(plans.map((plan) => plan.renderObjectId)).size !== plans.length
    ) {
      return evidenceRequired(
        "render.producer.invalid-field-plan",
        ["RPR-D08", "RPR-D13", "PR18", "PR39"],
        "Field setup requires non-empty unique identities, exact local resource/key routes and the confirmed unmasked field/judge roles.",
      );
    }
    const base = this.commandBase(0);
    const commands: RenderCommand[] = [];
    const created: string[] = [];
    for (const plan of plans) {
      created.push(plan.renderObjectId);
      commands.push({
        ...base(commands.length),
        kind: "create-object",
        renderObjectId: plan.renderObjectId,
        poolFamily: "field",
        role: plan.role,
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "bind-resource",
        renderObjectId: plan.renderObjectId,
        binding: "sprite",
        logicalAssetId: plan.logicalAssetId,
        exactKey: plan.exactKey,
      });
      commands.push({
        ...base(commands.length),
        kind: "set-transform",
        renderObjectId: plan.renderObjectId,
        position: plan.position,
        scale: plan.scale,
        rotationDegrees: plan.rotationDegrees,
        color: plan.color,
        ordering: plan.ordering,
        maskObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "activate-object",
        renderObjectId: plan.renderObjectId,
      });
    }
    return this.preflight(commands, () => this.createdObjectIds.push(...created));
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
    const created: string[] = [];
    for (const pool of pools) {
      const renderObjectId = rootRenderObjectId(pool.poolObjectId);
      created.push(renderObjectId);
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
    return this.preflight(commands, () => this.createdObjectIds.push(...created));
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

  preflightOrdinaryNoteMotion(
    poolObjectId: string,
    motionState: OrdinaryNoteMotionState,
    visualState: OrdinaryNoteTransformVisualState,
  ): SimulatorResult<PreparedOrdinaryNoteMotion> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (!isNonEmpty(poolObjectId) || visualState.maskObjectId !== null) {
      return evidenceRequired(
        "render.producer.invalid-ordinary-note-transform-owner",
        ["RPR-D05", "RPR-D13", "PR10", "PR39"],
        "Ordinary Note Move requires one pool identity and the confirmed unmasked root Sprite path.",
      );
    }
    const motion = advanceOrdinaryNoteMotion(motionState);
    if (motion.status !== "ok") return motion;
    const rotation = createRenderFloat32(Math.fround(0));
    if (rotation.status !== "ok") return rotation;
    const renderObjectId = rootRenderObjectId(poolObjectId);
    const base = this.commandBase(this.substep);
    const transaction = this.preflight([{
      ...base(0),
      kind: "set-transform",
      renderObjectId,
      position: motion.value.position,
      scale: Object.freeze({
        x: motion.value.localScale.x,
        y: motion.value.localScale.y,
      }),
      rotationDegrees: rotation.value,
      color: visualState.color,
      ordering: visualState.ordering,
      maskObjectId: null,
    }]);
    return transaction.status === "ok"
      ? ok(Object.freeze({ motion: motion.value, transaction: transaction.value }))
      : transaction;
  }

  preflightNoteDeactivation(
    poolObjectId: string,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const renderObjectId = rootRenderObjectId(poolObjectId);
    const base = this.commandBase(this.substep);
    return this.preflight([
      {
        ...base(0),
        kind: "hide-object",
        renderObjectId,
      },
      {
        ...base(1),
        kind: "deactivate-object",
        renderObjectId,
      },
    ]);
  }

  preflightSessionRelease(): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (this.createdObjectIds.length === 0) {
      return ok(new RenderOwnerTransaction(this.renderer, null));
    }
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [...this.createdObjectIds]
      .reverse()
      .map((renderObjectId, index) => ({
        ...base(index),
        kind: "release-object" as const,
        renderObjectId,
      }));
    return this.preflight(commands, () => { this.createdObjectIds.length = 0; });
  }

  private preflight(
    commands: readonly RenderCommand[],
    onCommit: () => void = () => {},
  ): SimulatorResult<RenderOwnerTransaction> {
    const batch = this.renderer.preflight(commands);
    return batch.status === "ok"
      ? ok(new RenderOwnerTransaction(this.renderer, batch.value, onCommit))
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

function lifeHudState(
  record: InGameRecordSnapshot,
): Readonly<Record<string, string | number | boolean | null>> {
  return Object.freeze({
    currentLife: record.currentLife,
    playerMaxLife: record.playerMaxLife,
    lifeUpperLimit: record.lifeUpperLimit,
    singleGameOver: record.singleGameOver,
  });
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
