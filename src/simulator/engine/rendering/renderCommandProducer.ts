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
import {
  createRenderFloat32,
  validateRenderFloat32,
} from "../../backends/renderingValidation";
import {
  AfterNoteType,
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
import type { SinglePlayScoreGaugeSnapshot } from "../data/singlePlayScoreGauge";
import type { InGameRecordSnapshot } from "../managers/inGameRecord";
import type { ScoreLifeReflectPlan } from "../managers/scoreLifeStateManager";
import {
  advanceOrdinaryLongNormalChild,
  buildOrdinaryLongNormalMesh,
  createOrdinaryLongNormalChildState,
  type OrdinaryLongNormalChildFrameInput,
  type OrdinaryLongNormalChildState,
} from "./ordinaryLongChildLifecycle";
import {
  advanceOrdinaryNoteActivationAdjustment,
  advanceOrdinaryNoteMotion,
  buildOrdinaryMultipleDirectionalLine,
  buildOrdinarySyncLine,
  getHabahiroMeshWidthRate,
  type OrdinaryMultipleDirectionalLineOwnerState,
  type OrdinaryNoteMotionResult,
  type OrdinaryNoteMotionState,
  type OrdinarySyncLineOwnerState,
} from "./ordinaryNoteGeometry";
import {
  advanceOrdinarySlideChildren,
  createOrdinarySlideChildState,
  type OrdinarySlideChildState,
} from "./ordinarySlideChildLifecycle";

export interface RenderEngineResourceBindings {
  readonly noteAtlasLogicalAssetId: string;
  readonly directionalAtlasLogicalAssetId: string;
  readonly syncLineLogicalAssetId?: string;
  readonly multipleDirectionalLineLeftLogicalAssetId?: string;
  readonly multipleDirectionalLineRightLogicalAssetId?: string;
  readonly longNoteMaterialLogicalAssetId?: string;
  readonly curveNoteMaterialLogicalAssetId?: string;
  readonly productJudgementEffectLogicalAssetId?: string;
  readonly habahiroAtlasLogicalAssetIds?: {
    readonly normal: string;
    readonly normal16: string;
    readonly skill: string;
    readonly flick: string;
    readonly long: string;
    readonly longFlash: string;
    readonly slideAmong: string;
  };
  readonly comboAnimationLogicalAssetId?: string;
  readonly ordinaryVisible?: {
    readonly comboNumberLogicalAssetId: string;
    readonly judgeLogicalAssetId: string;
    readonly lifeAdditiveLogicalAssetId: string;
    readonly warningLogicalAssetId: string;
  };
  readonly scoreHud?: {
    readonly fontLogicalAssetId: string;
    readonly gaugeLogicalAssetId: string;
    readonly levelMarkLogicalAssetId: string;
    readonly rankLabelFontLogicalAssetId: string;
    readonly highRankKiraLogicalAssetId: string;
    readonly highRankLongStarLogicalAssetId: string;
    readonly highRankOverlayLogicalAssetId: string;
  };
}

export interface RenderPoolIdentityPlan {
  readonly poolObjectId: string;
  readonly family: NoteFamily;
  readonly slideChildCount?: number;
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

export interface HabahiroSceneInput {
  readonly meshWidthSetting: RenderFloat32;
  readonly flashDurationSeconds: RenderFloat32;
  readonly fieldBefore: readonly RenderFieldObjectPlan[];
  readonly fieldAfter: readonly RenderFieldObjectPlan[];
  readonly fieldMasks: readonly RenderFieldMaskPlan[];
}

export interface OriginalSkinFieldSceneInput {
  readonly objects: readonly RenderFieldObjectPlan[];
  readonly masks: readonly RenderFieldMaskPlan[];
}

export interface OrdinaryFixedNoteSceneInput {
  readonly specificSpeed: RenderFloat32;
  readonly noteSettingScale: RenderFloat32;
  readonly launcherY: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly highAspectRatio: RenderFloat32;
  readonly noteStartPositions: readonly RenderVector3[];
  readonly goalPositions: readonly RenderVector3[];
  readonly noteTint: RenderColor;
  readonly noteDomainLayer: number;
  readonly syncLineEdgeMargin?: RenderFloat32;
  readonly screenToSafeAreaRatio?: RenderFloat32;
  readonly longMeshColor?: RenderColor;
  readonly field?: OriginalSkinFieldSceneInput;
  readonly habahiro?: HabahiroSceneInput;
}

export interface PreparedOrdinaryNoteActivation {
  readonly motionState: OrdinaryNoteMotionState;
  readonly renderedTransform: OrdinaryNoteMotionResult;
  readonly longChildState: OrdinaryLongNormalChildState | null;
  readonly slideChildStates: readonly OrdinarySlideChildState[] | null;
  readonly transaction: RenderOwnerTransaction;
}

export interface PreparedOrdinaryLongChildFrame {
  readonly childState: OrdinaryLongNormalChildState;
  readonly transaction: RenderOwnerTransaction;
}

export interface PreparedOrdinarySlideChildFrame {
  readonly childStates: readonly OrdinarySlideChildState[];
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
  readonly maskObjectId: string | null;
}

export interface RenderFieldMaskPlan {
  readonly renderObjectId: string;
  readonly polygon: readonly RenderVector2[];
  readonly position: RenderVector3;
  readonly scale: RenderVector2;
  readonly rotationDegrees: RenderFloat32;
  readonly ordering: RenderOrderingKey;
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

const RENDER_ONE = Object.freeze({ value: 1, bits: "3F800000" });
const CURRENT_SUDDEN_THRESHOLD = Object.freeze({
  value: Math.fround(712.711181640625),
  bits: "44322D84",
});

const DEGRADED_HABAHIRO_LANE_OBJECT = "render:habahiro:lane-change";
const HABAHIRO_FLASH_OBJECT = "render:habahiro:flash";

const HUD_OBJECTS = Object.freeze({
  addScore: Object.freeze([
    "render:hud:add-score",
    "render:hud:add-score:1",
    "render:hud:add-score:2",
    "render:hud:add-score:3",
  ]),
  combo: "render:hud:combo",
  result: "render:hud:result",
  score: "render:hud:score",
  life: "render:hud:life",
  fidelity: "render:hud:fidelity-label",
});

type NoteVisualAnimationRole =
  | "note-flick"
  | "note-directional-flick"
  | "note-long-flash";

export class RenderCommandProducer {
  private frame = 0;
  private substep = 0;
  private readonly createdObjectIds: string[] = [];
  private readonly creationSequenceByObjectId = new Map<string, number>();
  private readonly hudAnimationElapsedSeconds = new Map<"combo" | "all-perfect", number>();
  private readonly lifeAnimationElapsedSeconds = new Map<"life-warning" | "life-game-over", number>();
  private readonly addScoreElapsedSeconds = new Map<string, number>();
  private resultElapsedSeconds: number | null = null;
  private scoreGaugeSsElapsedSeconds: number | null = null;
  private addScoreCursor = 0;
  private addScoreDepthCycle = 0;
  private lastCombo = 0;
  private lastAllPerfect = false;
  private lastLifeWarning = false;
  private lastSingleGameOver = false;
  private readonly noteAnimationElapsedSeconds = new Map<string, {
    readonly role: NoteVisualAnimationRole;
    readonly elapsed: number;
  }>();

  constructor(
    readonly sessionId: string,
    private readonly renderer: SimulatorRendererBackend,
    private readonly resources: RenderEngineResourceBindings,
  ) {}

  isCompleteHabahiro(): boolean {
    const fidelity = this.renderer.snapshot().fidelity;
    return fidelity?.mode === "habahiro" && fidelity.fidelity === "current-external-complete";
  }

  isDegradedHabahiro(): boolean {
    const fidelity = this.renderer.snapshot().fidelity;
    return fidelity?.mode === "habahiro" && fidelity.fidelity === "degraded";
  }

  isAnyHabahiro(): boolean {
    return this.isCompleteHabahiro() || this.isDegradedHabahiro();
  }

  validate(): SimulatorResult<void> {
    const snapshot = this.renderer.snapshot();
    if (
      typeof this.sessionId !== "string" ||
      this.sessionId.length === 0 ||
      snapshot.state !== "ready" ||
      snapshot.sessionId !== this.sessionId ||
      snapshot.fault !== null ||
      !isNonEmpty(this.resources.noteAtlasLogicalAssetId) ||
      !isNonEmpty(this.resources.directionalAtlasLogicalAssetId) ||
      (this.resources.comboAnimationLogicalAssetId !== undefined &&
        !isNonEmpty(this.resources.comboAnimationLogicalAssetId)) ||
      (this.renderer.snapshot().fidelity?.mode === "habahiro" &&
        this.renderer.snapshot().fidelity?.fidelity === "current-external-complete" &&
        (this.resources.habahiroAtlasLogicalAssetIds === undefined ||
          Object.values(this.resources.habahiroAtlasLogicalAssetIds).some((value) => !isNonEmpty(value))))
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
    scoreGauge: SinglePlayScoreGaugeSnapshot,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const scoreHud = this.validateScoreHudBindings();
    if (scoreHud.status !== "ok") return scoreHud;
    const ordinaryVisible = this.validateOrdinaryVisibleBindings();
    if (ordinaryVisible.status !== "ok") return ordinaryVisible;
    const base = this.commandBase(0);
    const commands: RenderCommand[] = [];
    const created: string[] = [];
    const create = (
      renderObjectId: string,
      role: "hud-score" | "hud-combo" | "hud-result" | "hud-life" | "hud-add-score",
    ) => {
      created.push(renderObjectId);
      commands.push({
        ...base(commands.length), kind: "create-object", renderObjectId,
        poolFamily: role, role, parentObjectId: null,
      });
    };
    for (const renderObjectId of HUD_OBJECTS.addScore) {
      create(renderObjectId, "hud-add-score");
      commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId });
    }
    create(HUD_OBJECTS.combo, "hud-combo");
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.combo });
    create(HUD_OBJECTS.result, "hud-result");
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.result });
    create(HUD_OBJECTS.score, "hud-score");
    commands.push({
      ...base(commands.length), kind: "set-hud", renderObjectId: HUD_OBJECTS.score,
      hudRole: "score", state: scoreHudState(record, scoreGauge),
    });
    commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: HUD_OBJECTS.score });
    create(HUD_OBJECTS.life, "hud-life");
    const initialLifeState = lifeHudState(record);
    commands.push({
      ...base(commands.length), kind: "set-hud", renderObjectId: HUD_OBJECTS.life,
      hudRole: "life", state: initialLifeState,
    });
    commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: HUD_OBJECTS.life });
    if (initialLifeState.warning) commands.push({
      ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.life,
      animationRole: "life-warning", restart: true,
    });
    if (initialLifeState.singleGameOver) commands.push({
      ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.life,
      animationRole: "life-game-over", restart: true,
    });
    return this.preflight(commands, () => {
      this.recordCreatedObjects(created);
      this.lastLifeWarning = initialLifeState.warning;
      this.lastSingleGameOver = initialLifeState.singleGameOver;
      if (initialLifeState.warning) this.lifeAnimationElapsedSeconds.set("life-warning", 0);
      if (initialLifeState.singleGameOver) this.lifeAnimationElapsedSeconds.set("life-game-over", 0);
    });
  }

  preflightHudReflect(
    plan: ScoreLifeReflectPlan,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const scoreHud = this.validateScoreHudBindings();
    if (scoreHud.status !== "ok") return scoreHud;
    const ordinaryVisible = this.validateOrdinaryVisibleBindings();
    if (ordinaryVisible.status !== "ok") return ordinaryVisible;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    const totalAddScore = plan.reflect.totalScore;
    const addScoreObjectId = HUD_OBJECTS.addScore[this.addScoreCursor]!;
    if (totalAddScore !== 0) {
      commands.push({
        ...base(commands.length), kind: "set-hud", renderObjectId: addScoreObjectId,
        hudRole: "add-score", state: Object.freeze({
          value: totalAddScore,
          poolIndex: this.addScoreCursor as 0 | 1 | 2 | 3,
          depth: this.addScoreDepthCycle as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
        }),
      });
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: addScoreObjectId });
      commands.push({
        ...base(commands.length), kind: "play-animation", renderObjectId: addScoreObjectId,
        animationRole: "add-score", restart: true,
      });
    }
    const comboChanged = plan.record.currentCombo !== this.lastCombo ||
      plan.record.allPerfect !== this.lastAllPerfect;
    const comboScalePlaying = this.hudAnimationElapsedSeconds.has("combo");
    const allPerfectPlaying = this.hudAnimationElapsedSeconds.has("all-perfect");
    if (comboChanged) {
      commands.push({
        ...base(commands.length), kind: "set-hud", renderObjectId: HUD_OBJECTS.combo,
        hudRole: "combo",
        state: Object.freeze({ combo: plan.record.currentCombo, allPerfect: plan.record.allPerfect }),
      });
      if (plan.record.currentCombo > 0) {
        commands.push({
          ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.combo,
          animationRole: "combo", restart: true,
        });
        if (plan.record.allPerfect && !allPerfectPlaying) commands.push({
          ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.combo,
          animationRole: "all-perfect", restart: true,
        });
        if (!plan.record.allPerfect && allPerfectPlaying) commands.push({
          ...base(commands.length), kind: "stop-animation", renderObjectId: HUD_OBJECTS.combo,
          animationRole: "all-perfect", restart: false,
        });
      } else {
        if (comboScalePlaying) commands.push({
          ...base(commands.length), kind: "stop-animation", renderObjectId: HUD_OBJECTS.combo,
          animationRole: "combo", restart: false,
        });
        if (allPerfectPlaying) commands.push({
          ...base(commands.length), kind: "stop-animation", renderObjectId: HUD_OBJECTS.combo,
          animationRole: "all-perfect", restart: false,
        });
      }
      commands.push({
        ...base(commands.length),
        kind: plan.record.currentCombo > 0 ? "activate-object" : "hide-object",
        renderObjectId: HUD_OBJECTS.combo,
      });
    }
    commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: HUD_OBJECTS.result });
    commands.push({
      ...base(commands.length), kind: "set-hud", renderObjectId: HUD_OBJECTS.result,
      hudRole: "result", state: Object.freeze({
        judgeKey: judgeKeyForResult(plan.reflect.representativeRawResult),
        timingKey: timingKeyForJudgeTiming(plan.reflect.representativeJudgeTiming),
      }),
    });
    commands.push({
      ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.result,
      animationRole: "result", restart: true,
    });
    commands.push({
      ...base(commands.length), kind: "set-hud", renderObjectId: HUD_OBJECTS.score,
      hudRole: "score", state: scoreHudState(plan.record, plan.scoreGauge),
    });
    if (plan.scoreGauge.highRankEffect === "ScoreGaugeSS") commands.push({
      ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.score,
      animationRole: "score-gauge-ss", restart: true,
    });
    const nextLifeState = lifeHudState(plan.record);
    commands.push({
      ...base(commands.length), kind: "set-hud", renderObjectId: HUD_OBJECTS.life,
      hudRole: "life", state: nextLifeState,
    });
    if (nextLifeState.warning && !this.lastLifeWarning) commands.push({
      ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.life,
      animationRole: "life-warning", restart: true,
    });
    if (!nextLifeState.warning && this.lastLifeWarning) commands.push({
      ...base(commands.length), kind: "stop-animation", renderObjectId: HUD_OBJECTS.life,
      animationRole: "life-warning", restart: false,
    });
    if (nextLifeState.singleGameOver && !this.lastSingleGameOver) commands.push({
      ...base(commands.length), kind: "play-animation", renderObjectId: HUD_OBJECTS.life,
      animationRole: "life-game-over", restart: true,
    });
    if (!nextLifeState.singleGameOver && this.lastSingleGameOver) commands.push({
      ...base(commands.length), kind: "stop-animation", renderObjectId: HUD_OBJECTS.life,
      animationRole: "life-game-over", restart: false,
    });
    if (plan.record.singleGameOver) {
      if (totalAddScore !== 0) commands.push({
        ...base(commands.length), kind: "stop-animation", renderObjectId: addScoreObjectId,
        animationRole: "add-score", restart: false,
      });
      for (const renderObjectId of [HUD_OBJECTS.combo, ...HUD_OBJECTS.addScore]) {
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId });
      }
    }
    return this.preflight(commands, () => {
      if (totalAddScore !== 0) {
        this.addScoreElapsedSeconds.set(addScoreObjectId, 0);
        this.addScoreCursor = (this.addScoreCursor + 1) % HUD_OBJECTS.addScore.length;
        this.addScoreDepthCycle = (this.addScoreDepthCycle + 1) % 8;
      }
      if (comboChanged) {
        this.hudAnimationElapsedSeconds.delete("combo");
        if (plan.record.currentCombo > 0) {
          this.hudAnimationElapsedSeconds.set("combo", 0);
          if (plan.record.allPerfect && !allPerfectPlaying) {
            this.hudAnimationElapsedSeconds.set("all-perfect", 0);
          } else if (!plan.record.allPerfect) {
            this.hudAnimationElapsedSeconds.delete("all-perfect");
          }
        } else {
          this.hudAnimationElapsedSeconds.delete("all-perfect");
        }
        this.lastCombo = plan.record.currentCombo;
        this.lastAllPerfect = plan.record.allPerfect;
      }
      this.resultElapsedSeconds = 0;
      if (plan.scoreGauge.highRankEffect === "ScoreGaugeSS") {
        this.scoreGaugeSsElapsedSeconds = 0;
      }
      if (nextLifeState.warning && !this.lastLifeWarning) {
        this.lifeAnimationElapsedSeconds.set("life-warning", 0);
      } else if (!nextLifeState.warning) {
        this.lifeAnimationElapsedSeconds.delete("life-warning");
      }
      if (nextLifeState.singleGameOver && !this.lastSingleGameOver) {
        this.lifeAnimationElapsedSeconds.set("life-game-over", 0);
      } else if (!nextLifeState.singleGameOver) {
        this.lifeAnimationElapsedSeconds.delete("life-game-over");
      }
      this.lastLifeWarning = nextLifeState.warning;
      this.lastSingleGameOver = nextLifeState.singleGameOver;
      if (plan.record.singleGameOver) {
        this.hudAnimationElapsedSeconds.clear();
        this.addScoreElapsedSeconds.clear();
      }
    });
  }

  preflightHudAnimationAdvance(
    deltaTimeSeconds: number,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      return evidenceRequired(
        "render.producer.invalid-hud-animation-delta",
        ["RPR-D12", "RPR-D13", "PR21", "PR24", "PR31"],
        "Portable HUD animation sampling requires one non-negative finite engine delta and never a backend ticker.",
      );
    }
    if (
      (this.hudAnimationElapsedSeconds.size === 0 &&
        this.lifeAnimationElapsedSeconds.size === 0 &&
        this.addScoreElapsedSeconds.size === 0 &&
        this.resultElapsedSeconds === null &&
        this.scoreGaugeSsElapsedSeconds === null) ||
      deltaTimeSeconds === 0
    ) {
      return ok(new RenderOwnerTransaction(this.renderer, null));
    }
    const next = new Map<"combo" | "all-perfect", number>();
    const nextLife = new Map<"life-warning" | "life-game-over", number>();
    const nextAddScore = new Map<string, number>();
    let nextResultElapsed = this.resultElapsedSeconds;
    let nextScoreGaugeSsElapsed = this.scoreGaugeSsElapsedSeconds;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    for (const [role, elapsed] of this.hudAnimationElapsedSeconds) {
      const nextElapsed = Math.fround(elapsed + deltaTimeSeconds);
      const renderObjectId = HUD_OBJECTS.combo;
      if (role === "combo" && nextElapsed >= 1) {
        commands.push({
          ...base(commands.length), kind: "stop-animation", renderObjectId,
          animationRole: role, restart: false,
        });
      } else {
        const sample = createRenderFloat32(nextElapsed);
        if (sample.status !== "ok") return sample;
        commands.push({
          ...base(commands.length), kind: "sample-animation", renderObjectId,
          animationRole: role, elapsedSeconds: sample.value,
        });
        next.set(role, nextElapsed);
      }
    }
    for (const [role, elapsed] of this.lifeAnimationElapsedSeconds) {
      const nextElapsed = Math.fround(elapsed + deltaTimeSeconds);
      const sample = createRenderFloat32(nextElapsed);
      if (sample.status !== "ok") return sample;
      commands.push({
        ...base(commands.length), kind: "sample-animation", renderObjectId: HUD_OBJECTS.life,
        animationRole: role, elapsedSeconds: sample.value,
      });
      nextLife.set(role, nextElapsed);
    }
    for (const [renderObjectId, elapsed] of this.addScoreElapsedSeconds) {
      const nextElapsed = Math.fround(elapsed + deltaTimeSeconds);
      if (nextElapsed >= Math.fround(0.42000000178813934)) {
        commands.push({
          ...base(commands.length), kind: "stop-animation", renderObjectId,
          animationRole: "add-score", restart: false,
        });
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId });
      } else {
        const sample = createRenderFloat32(nextElapsed);
        if (sample.status !== "ok") return sample;
        commands.push({
          ...base(commands.length), kind: "sample-animation", renderObjectId,
          animationRole: "add-score", elapsedSeconds: sample.value,
        });
        nextAddScore.set(renderObjectId, nextElapsed);
      }
    }
    if (this.scoreGaugeSsElapsedSeconds !== null) {
      nextScoreGaugeSsElapsed = Math.fround(this.scoreGaugeSsElapsedSeconds + deltaTimeSeconds);
      const sample = createRenderFloat32(Math.fround(nextScoreGaugeSsElapsed % 3));
      if (sample.status !== "ok") return sample;
      commands.push({
        ...base(commands.length), kind: "sample-animation", renderObjectId: HUD_OBJECTS.score,
        animationRole: "score-gauge-ss", elapsedSeconds: sample.value,
      });
    }
    if (this.resultElapsedSeconds !== null) {
      nextResultElapsed = Math.fround(this.resultElapsedSeconds + deltaTimeSeconds);
      if (nextResultElapsed >= 1) {
        commands.push({
          ...base(commands.length), kind: "stop-animation", renderObjectId: HUD_OBJECTS.result,
          animationRole: "result", restart: false,
        });
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.result });
        nextResultElapsed = null;
      } else {
        const sample = createRenderFloat32(nextResultElapsed);
        if (sample.status !== "ok") return sample;
        commands.push({
          ...base(commands.length), kind: "sample-animation", renderObjectId: HUD_OBJECTS.result,
          animationRole: "result", elapsedSeconds: sample.value,
        });
      }
    }
    return this.preflight(commands, () => {
      this.hudAnimationElapsedSeconds.clear();
      for (const [role, elapsed] of next) {
        this.hudAnimationElapsedSeconds.set(role, elapsed);
      }
      this.lifeAnimationElapsedSeconds.clear();
      for (const [role, elapsed] of nextLife) {
        this.lifeAnimationElapsedSeconds.set(role, elapsed);
      }
      this.addScoreElapsedSeconds.clear();
      for (const [renderObjectId, elapsed] of nextAddScore) {
        this.addScoreElapsedSeconds.set(renderObjectId, elapsed);
      }
      this.resultElapsedSeconds = nextResultElapsed;
      this.scoreGaugeSsElapsedSeconds = nextScoreGaugeSsElapsed;
    });
  }

  preflightFieldSetup(
    plans: readonly RenderFieldObjectPlan[],
    maskPlans: readonly RenderFieldMaskPlan[] = [],
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const maskIds = new Set(maskPlans.map((plan) => plan.renderObjectId));
    const objectIds = [...maskPlans, ...plans].map((plan) => plan.renderObjectId);
    if (
      plans.length === 0 ||
      objectIds.some((renderObjectId) => !isNonEmpty(renderObjectId)) ||
      new Set(objectIds).size !== objectIds.length ||
      maskPlans.some((plan) =>
        plan.polygon.length < 3 ||
        plan.polygon.some((point) => !validateVector2(point)) ||
        !validateVector3(plan.position) ||
        !validateVector2(plan.scale) ||
        !validateRenderFloat32(plan.rotationDegrees) ||
        !validateOrdering(plan.ordering)
      ) ||
      plans.some((plan) =>
        !isNonEmpty(plan.logicalAssetId) ||
        !isNonEmpty(plan.exactKey) ||
        (plan.role !== "field-line" && plan.role !== "judge-line") ||
        (plan.maskObjectId !== null && !maskIds.has(plan.maskObjectId))
      )
    ) {
      return evidenceRequired(
        "render.producer.invalid-field-plan",
        ["RPR-D08", "RPR-D13", "PR18", "PR39"],
        "Field setup requires unique typed field/judge identities and every visible-inside mask must be an explicit polygon referenced within the same atomic setup.",
      );
    }
    const base = this.commandBase(0);
    const commands: RenderCommand[] = [];
    const created: string[] = [];
    const white = renderWhite();
    for (const plan of maskPlans) {
      created.push(plan.renderObjectId);
      commands.push({
        ...base(commands.length),
        kind: "create-object",
        renderObjectId: plan.renderObjectId,
        poolFamily: "field-mask",
        role: "mask",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "set-mask",
        renderObjectId: plan.renderObjectId,
        mode: "visible-inside",
        polygon: plan.polygon,
      });
      commands.push({
        ...base(commands.length),
        kind: "set-transform",
        renderObjectId: plan.renderObjectId,
        position: plan.position,
        scale: plan.scale,
        rotationDegrees: plan.rotationDegrees,
        color: white,
        ordering: plan.ordering,
        maskObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "activate-object",
        renderObjectId: plan.renderObjectId,
      });
    }
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
        maskObjectId: plan.maskObjectId,
      });
      commands.push({
        ...base(commands.length),
        kind: "activate-object",
        renderObjectId: plan.renderObjectId,
      });
    }
    return this.preflight(commands, () => this.recordCreatedObjects(created));
  }

  preflightPoolSetup(
    pools: readonly RenderPoolIdentityPlan[],
    syncLinePoolLength = 0,
    multipleDirectionalLinePoolLength = 0,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const syncLineLogicalAssetId = this.resources.syncLineLogicalAssetId;
    const multipleDirectionalLineLeftLogicalAssetId =
      this.resources.multipleDirectionalLineLeftLogicalAssetId;
    const multipleDirectionalLineRightLogicalAssetId =
      this.resources.multipleDirectionalLineRightLogicalAssetId;
    if (
      !Number.isSafeInteger(syncLinePoolLength) ||
      syncLinePoolLength < 0 ||
      (syncLinePoolLength > 0 && !isNonEmpty(syncLineLogicalAssetId))
    ) {
      return evidenceRequired(
        "render.producer.invalid-sync-line-pool-setup",
        ["RPR-D06", "RPR-D13", "PR16", "PR39"],
        "The current simultaneous-line path requires the fixed non-negative pool length and one explicit local material asset ID when present.",
      );
    }
    if (
      !Number.isSafeInteger(multipleDirectionalLinePoolLength) ||
      multipleDirectionalLinePoolLength < 0 ||
      (multipleDirectionalLinePoolLength > 0 &&
        (!isNonEmpty(multipleDirectionalLineLeftLogicalAssetId) ||
          !isNonEmpty(multipleDirectionalLineRightLogicalAssetId)))
    ) {
      return evidenceRequired(
        "render.producer.invalid-multiple-directional-line-pool-setup",
        ["RPR-R4-010", "RPR-R4-013", "PR09", "PR17"],
        "The R4 MultipleDirectional path requires a fixed non-negative back-line pool and explicit left/right local material asset IDs.",
      );
    }
    if (
      !this.isAnyHabahiro() &&
      pools.length === 0 &&
      syncLinePoolLength === 0 &&
      multipleDirectionalLinePoolLength === 0
    ) {
      return ok(new RenderOwnerTransaction(this.renderer, null));
    }
    const base = this.commandBase(0);
    const commands: RenderCommand[] = [];
    const created: string[] = [];
    for (const pool of pools) {
      const slideChildCount = pool.slideChildCount ?? 0;
      if (
        !Number.isSafeInteger(slideChildCount) ||
        slideChildCount < 0 ||
        (pool.family === "slide"
          ? this.isDegradedHabahiro() ? slideChildCount !== 0 : slideChildCount < 1
          : slideChildCount !== 0)
      ) {
        return evidenceRequired(
          "render.producer.invalid-slide-child-pool-setup",
          ["RPR-R4-010", "RPR-R4-014", "PR07", "PR12", "PR15"],
          "Only a Slide pool identity may declare its positive chart-owned child count.",
        );
      }
      const renderObjectId = rootRenderObjectId(pool.poolObjectId);
      created.push(renderObjectId);
      commands.push({
        ...base(commands.length),
        kind: "create-object",
        renderObjectId,
        poolFamily: pool.family,
        role: pool.family === "multiple-directional-visual"
          ? "note-side-visual"
          : "note-root",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId,
      });
      if (!this.isAnyHabahiro()) {
        if (pool.family === "flick" || pool.family === "directional-flick" || pool.family === "multiple-directional-flick") {
          appendHiddenChild(
            commands,
            created,
            base,
            ordinaryNoteIconRenderObjectId(renderObjectId),
            `${pool.family}-icon`,
            "note-icon",
            renderObjectId,
          );
        }
        if (pool.family === "long" || pool.family === "slide") {
          appendHiddenChild(
            commands,
            created,
            base,
            ordinaryLongFlashRenderObjectId(renderObjectId),
            `${pool.family}-long-flash`,
            "note-intermediate",
            renderObjectId,
          );
        }
      }
      if (this.isCompleteHabahiro()) {
        const iconObjectId = habahiroIconRenderObjectId(pool.poolObjectId);
        created.push(iconObjectId);
        commands.push({
          ...base(commands.length), kind: "create-object", renderObjectId: iconObjectId,
          poolFamily: `${pool.family}-habahiro-icon`, role: "note-icon", parentObjectId: null,
        });
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: iconObjectId });
      }
      if (pool.family === "long" && !this.isDegradedHabahiro()) {
        const afterObjectId = longAfterRenderObjectId(pool.poolObjectId);
        const meshObjectId = longMeshRenderObjectId(pool.poolObjectId);
        created.push(afterObjectId, meshObjectId);
        commands.push({
          ...base(commands.length),
          kind: "create-object",
          renderObjectId: afterObjectId,
          poolFamily: pool.family,
          role: "note-head",
          parentObjectId: null,
        });
        commands.push({
          ...base(commands.length),
          kind: "hide-object",
          renderObjectId: afterObjectId,
        });
        if (!this.isAnyHabahiro()) appendHiddenChild(
          commands,
          created,
          base,
          ordinaryNoteIconRenderObjectId(afterObjectId),
          `${pool.family}-after-icon`,
          "note-icon",
          afterObjectId,
        );
        commands.push({
          ...base(commands.length),
          kind: "create-object",
          renderObjectId: meshObjectId,
          poolFamily: pool.family,
          role: "note-mesh",
          parentObjectId: null,
        });
        commands.push({
          ...base(commands.length),
          kind: "hide-object",
          renderObjectId: meshObjectId,
        });
        if (this.resources.longNoteMaterialLogicalAssetId !== undefined) commands.push({
          ...base(commands.length), kind: "bind-resource", renderObjectId: meshObjectId,
          binding: "material", logicalAssetId: this.resources.longNoteMaterialLogicalAssetId,
          exactKey: null,
        });
      }
      if (pool.family === "slide" && !this.isDegradedHabahiro()) {
        for (let index = 0; index < slideChildCount; index += 1) {
          const childObjectId = slideChildRenderObjectId(pool.poolObjectId, index);
          const meshObjectId = slideMeshRenderObjectId(pool.poolObjectId, index);
          created.push(childObjectId, meshObjectId);
          commands.push({
            ...base(commands.length),
            kind: "create-object",
            renderObjectId: childObjectId,
            poolFamily: pool.family,
            role: "note-intermediate",
            parentObjectId: null,
          });
          commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: childObjectId });
          if (!this.isAnyHabahiro()) {
            appendHiddenChild(
              commands,
              created,
              base,
              ordinaryNoteIconRenderObjectId(childObjectId),
              `${pool.family}-child-icon`,
              "note-icon",
              childObjectId,
            );
            appendHiddenChild(
              commands,
              created,
              base,
              ordinaryLongFlashRenderObjectId(childObjectId),
              `${pool.family}-child-long-flash`,
              "note-intermediate",
              childObjectId,
            );
          }
          commands.push({
            ...base(commands.length),
            kind: "create-object",
            renderObjectId: meshObjectId,
            poolFamily: pool.family,
            role: "note-mesh",
            parentObjectId: null,
          });
          commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: meshObjectId });
          if (this.resources.curveNoteMaterialLogicalAssetId !== undefined) commands.push({
            ...base(commands.length), kind: "bind-resource", renderObjectId: meshObjectId,
            binding: "material", logicalAssetId: this.resources.curveNoteMaterialLogicalAssetId,
            exactKey: null,
          });
        }
      }
    }
    for (let index = 0; index < syncLinePoolLength; index += 1) {
      const renderObjectId = syncLineRenderObjectId(index);
      created.push(renderObjectId);
      commands.push({
        ...base(commands.length),
        kind: "create-object",
        renderObjectId,
        poolFamily: "sync-line",
        role: "sync-line",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "bind-resource",
        renderObjectId,
        binding: "material",
        logicalAssetId: syncLineLogicalAssetId!,
        exactKey: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId,
      });
    }
    for (let index = 0; index < multipleDirectionalLinePoolLength; index += 1) {
      const renderObjectId = multipleDirectionalLineRenderObjectId(index);
      created.push(renderObjectId);
      commands.push({
        ...base(commands.length),
        kind: "create-object",
        renderObjectId,
        poolFamily: "multiple-directional-line",
        role: "multiple-directional-line",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId,
      });
    }
    if (this.isDegradedHabahiro()) {
      created.push(HUD_OBJECTS.fidelity, DEGRADED_HABAHIRO_LANE_OBJECT);
      commands.push({
        ...base(commands.length), kind: "create-object", renderObjectId: HUD_OBJECTS.fidelity,
        poolFamily: "fidelity-label", role: "fidelity-label", parentObjectId: null,
      });
      commands.push({
        ...base(commands.length), kind: "set-hud", renderObjectId: HUD_OBJECTS.fidelity,
        hudRole: "fidelity-label",
        state: Object.freeze({ label: "HABAHIRO", visible: true }),
      });
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: HUD_OBJECTS.fidelity });
      commands.push({
        ...base(commands.length), kind: "create-object",
        renderObjectId: DEGRADED_HABAHIRO_LANE_OBJECT,
        poolFamily: "degraded-habahiro-lane-change", role: "fidelity-label", parentObjectId: null,
      });
      commands.push({
        ...base(commands.length), kind: "hide-object",
        renderObjectId: DEGRADED_HABAHIRO_LANE_OBJECT,
      });
    }
    if (this.isCompleteHabahiro()) {
      created.push(HABAHIRO_FLASH_OBJECT);
      commands.push({
        ...base(commands.length), kind: "create-object",
        renderObjectId: HABAHIRO_FLASH_OBJECT,
        poolFamily: "habahiro-flash", role: "habahiro-flash", parentObjectId: null,
      });
      commands.push({
        ...base(commands.length), kind: "hide-object",
        renderObjectId: HABAHIRO_FLASH_OBJECT,
      });
    }
    return this.preflight(commands, () => this.recordCreatedObjects(created));
  }

  preflightHabahiroFlashStart(
    absolutePosition: number,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (
      !this.isCompleteHabahiro() ||
      !Number.isInteger(absolutePosition) || absolutePosition < 0 ||
      !this.creationSequenceByObjectId.has(HABAHIRO_FLASH_OBJECT)
    ) {
      return evidenceRequired(
        "render.habahiro.invalid-flash-start",
        ["HAB-A07", "HAB-A09", "HA-D07"],
        "The complete HABAHIRO route requires its committed flash owner before the chart marker phase.",
      );
    }
    const base = this.commandBase(this.substep);
    return this.preflight([{
      ...base(0), kind: "set-hud", renderObjectId: HABAHIRO_FLASH_OBJECT,
      hudRole: "habahiro-flash", state: Object.freeze({ phase: "flash-start", progress: float32State(0) }),
    }, {
      ...base(1), kind: "activate-object", renderObjectId: HABAHIRO_FLASH_OBJECT,
    }, {
      ...base(2), kind: "play-animation", renderObjectId: HABAHIRO_FLASH_OBJECT,
      animationRole: "habahiro-lane-change", restart: true,
    }]);
  }

  preflightHabahiroFlashAdvance(
    elapsedSeconds: RenderFloat32,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (!this.isCompleteHabahiro() || !validateRenderFloat32(elapsedSeconds) || elapsedSeconds.value < 0) {
      return evidenceRequired(
        "render.habahiro.invalid-flash-sample",
        ["HAB-A09", "HAB-A10", "HA-D07"],
        "HABAHIRO flash sampling requires explicit engine-clock Float32 time.",
      );
    }
    const base = this.commandBase(this.substep);
    return this.preflight([{
      ...base(0), kind: "sample-animation", renderObjectId: HABAHIRO_FLASH_OBJECT,
      animationRole: "habahiro-lane-change", elapsedSeconds,
    }]);
  }

  preflightHabahiroLaneChange(
    absolutePosition: number,
    scene: OrdinaryFixedNoteSceneInput,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const habahiroScene = scene.habahiro;
    if (
      !this.isCompleteHabahiro() || habahiroScene === undefined ||
      !Number.isInteger(absolutePosition) || absolutePosition < 0 ||
      habahiroScene.fieldAfter.some((plan) =>
        !this.creationSequenceByObjectId.has(plan.renderObjectId) ||
        !validateVector3(plan.position) || !validateVector2(plan.scale) ||
        !validateRenderFloat32(plan.rotationDegrees) || !validateColor(plan.color) ||
        !validateOrdering(plan.ordering))
    ) {
      return evidenceRequired(
        "render.habahiro.invalid-lane-change",
        ["HAB-A07", "HAB-A09", "HAB-A10", "HA-D08"],
        "The inferred HABAHIRO lane swap requires every pre-created field/judge owner and typed post-change transform.",
      );
    }
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = habahiroScene.fieldAfter.map((plan, index) => ({
      ...base(index), kind: "set-transform" as const, renderObjectId: plan.renderObjectId,
      position: plan.position, scale: plan.scale, rotationDegrees: plan.rotationDegrees,
      color: plan.color, ordering: plan.ordering, maskObjectId: plan.maskObjectId,
    }));
    commands.push({
      ...base(commands.length), kind: "stop-animation", renderObjectId: HABAHIRO_FLASH_OBJECT,
      animationRole: "habahiro-lane-change", restart: false,
    });
    commands.push({
      ...base(commands.length), kind: "hide-object", renderObjectId: HABAHIRO_FLASH_OBJECT,
    });
    return this.preflight(commands);
  }

  preflightDegradedHabahiroLaneChange(
    absolutePosition: number,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (
      !this.isDegradedHabahiro() ||
      !Number.isInteger(absolutePosition) ||
      absolutePosition < 0 ||
      !this.creationSequenceByObjectId.has(DEGRADED_HABAHIRO_LANE_OBJECT)
    ) {
      return evidenceRequired(
        "render.habahiro.invalid-degraded-lane-change",
        ["RPR-D08", "PR19", "PR40", "HA-D07", "HA-D08", "HA-D09"],
        "Only the legacy degraded HABAHIRO route with its committed diagnostic owner may emit the same-frame lane-change command.",
      );
    }
    const base = this.commandBase(this.substep);
    const states = ["flash-start", "change-lane"] as const;
    const commands: RenderCommand[] = states.map((laneChangePhase, index) => ({
      ...base(index),
      kind: "set-hud",
      renderObjectId: DEGRADED_HABAHIRO_LANE_OBJECT,
      hudRole: "fidelity-label",
      state: Object.freeze({
        label: "HABAHIRO",
        visible: true,
        laneChangePhase,
        absolutePosition,
      }),
    }));
    commands.push({
      ...base(commands.length),
      kind: "activate-object",
      renderObjectId: DEGRADED_HABAHIRO_LANE_OBJECT,
    });
    return this.preflight(commands);
  }

  preflightNoteActivation(
    poolObjectId: string,
    information: NoteInformation,
    noteColor: boolean,
    substep: number,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (typeof noteColor !== "boolean" || !Number.isSafeInteger(substep) || substep < 0) {
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
      noteColor,
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

  preflightOrdinaryNoteActivation(
    poolObjectId: string,
    information: NoteInformation,
    noteBpm: RenderFloat32,
    launcherMusicPosition: RenderFloat32,
    scene: OrdinaryFixedNoteSceneInput,
    noteColor: boolean,
    substep: number,
  ): SimulatorResult<PreparedOrdinaryNoteActivation> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const sceneValidation = validateOrdinaryFixedNoteSceneInput(scene);
    if (sceneValidation.status !== "ok") return sceneValidation;
    if (typeof noteColor !== "boolean" || !Number.isSafeInteger(substep) || substep < 0) {
      return evidenceRequired(
        "render.producer.invalid-substep",
        ["RPR-D13", "PR33", "PR39"],
        "Note activation commands require the engine-owned non-negative adaptive substep.",
      );
    }
    const completeHabahiro = this.isCompleteHabahiro();
    const legacyDegradedHabahiro = this.isDegradedHabahiro();
    const habahiro = completeHabahiro || legacyDegradedHabahiro;
    if (completeHabahiro && !validateHabahiroScene(scene.habahiro)) {
      return evidenceRequired(
        "render.habahiro.scene-required",
        ["HAB-A04", "HAB-A08", "HAB-A09", "HAB-A10"],
        "Complete HABAHIRO rendering requires explicit mesh width, flash duration and pre/post field plans.",
      );
    }
    const longTail = !legacyDegradedHabahiro &&
      information.fireNoteType === FrontNoteType.Long &&
      information.afterNoteAbsolutePos > information.absolutePos;
    const r7Front = information.fireNoteType === FrontNoteType.Flick ||
      information.fireNoteType === FrontNoteType.DirectionalFlick ||
      information.fireNoteType === FrontNoteType.MultipleDirectionalFlick ||
      information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
      information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
      information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd;
    const r7Slide = !legacyDegradedHabahiro &&
      (information.fireNoteType === FrontNoteType.SlideA ||
      information.fireNoteType === FrontNoteType.SlideB) &&
      information.slideNoteList.length > 0;
    if (
      !legacyDegradedHabahiro && information.fireNoteType !== FrontNoteType.Normal &&
      !longTail &&
      !r7Front &&
      !r7Slide
    ) {
      return evidenceRequired(
        "render.note.ordinary-child-lifecycle-unimplemented",
        ["RPR-R7-001", "PR06", "PR08", "PR09", "PR15", "PR39"],
        "The current R7 production route accepts every recovered ordinary front, Long tail, Slide terminal and MultipleDirectional side-visual family.",
      );
    }
    if (
      (longTail || r7Slide) &&
      (scene.screenToSafeAreaRatio === undefined ||
        !validateRenderFloat32(scene.screenToSafeAreaRatio) ||
        scene.screenToSafeAreaRatio.value <= 0 ||
        scene.longMeshColor === undefined ||
        !validateColor(scene.longMeshColor))
    ) {
      return evidenceRequired(
        "render.note.long-scene-unavailable",
        ["RPR-D05", "RPR-D06", "RPR-D13", "PR11", "PR13", "PR15"],
        "The ordinary Long and R4 Slide mesh paths require explicit positive safe-area ratio and typed mesh color inputs."
      );
    }
    const lane = habahiro
      ? resolveHabahiroMotionLaneIndex(information)
      : resolveOrdinaryMotionLaneIndex(information, r7Slide);
    if (lane.status !== "ok") return lane;
    const binding = habahiro
      ? resolveHabahiroFrontSpriteBinding(information, this.resources, noteColor)
      : resolveFrontSpriteBinding(information, false, this.resources, noteColor);
    if (binding.status !== "ok") return binding;
    const renderObjectId = rootRenderObjectId(poolObjectId);
    const creationSequence = this.creationSequenceByObjectId.get(renderObjectId);
    if (creationSequence === undefined) {
      return evidenceRequired(
        "render.producer.note-root-not-created",
        ["RPR-D13", "RPR-D14", "PR05", "PR39"],
        "Ordinary activation requires its committed engine-authored pool root identity.",
      );
    }
    const start = scene.noteStartPositions[lane.value]!;
    const goal = scene.goalPositions[lane.value]!;
    const zero = createRenderFloat32(Math.fround(0));
    const one = createRenderFloat32(Math.fround(1));
    if (zero.status !== "ok") return zero;
    if (one.status !== "ok") return one;
    const motionState: OrdinaryNoteMotionState = Object.freeze({
      progressRate: zero.value,
      specificSpeed: scene.specificSpeed,
      deltaTime: zero.value,
      realMoveSecond: zero.value,
      goalPosition: Object.freeze({ x: goal.x, y: goal.y }),
      noteStartPosition: Object.freeze({ x: start.x, y: start.y }),
      currentPositionZ: start.z,
      noteSettingScale: scene.noteSettingScale,
      launcherY: scene.launcherY,
      targetCenterY: scene.targetCenterY,
      highAspectRatio: scene.highAspectRatio,
      buttonCount: information.buttonTypesArray.length || information.buttonTypes.length || 1,
      virtualLaneControllerPresent: legacyDegradedHabahiro
        ? false
        : information.virtualLaneDirection !== 0,
    });
    const adjustment = advanceOrdinaryNoteActivationAdjustment(
      motionState,
      launcherMusicPosition,
      information.absolutePos,
      noteBpm,
    );
    if (adjustment.status !== "ok") return adjustment;
    const ordering: RenderOrderingKey = Object.freeze({
      domainLayer: scene.noteDomainLayer,
      sourceDepthOrSortingOrder:
        information.fireNoteType === FrontNoteType.DirectionalFlick ||
          information.fireNoteType === FrontNoteType.MultipleDirectionalFlick
          ? 71
          : 70,
      sourceZ: start.z,
      creationSequence,
    });
    const base = this.commandBase(substep);
    const commands: RenderCommand[] = [{
      ...base(0),
      kind: "set-transform",
      renderObjectId,
      position: start,
      scale: Object.freeze({ x: one.value, y: one.value }),
      rotationDegrees: zero.value,
      color: scene.noteTint,
      ordering,
      maskObjectId: null,
    }, {
      ...base(1),
      kind: "activate-object",
      renderObjectId,
    }, {
      ...base(2),
      kind: "bind-resource",
      renderObjectId,
      binding: "sprite",
      logicalAssetId: binding.value.logicalAssetId,
      exactKey: binding.value.exactKey,
    }];
    const ordinaryFrontAnimation = habahiro
      ? null
      : resolveOrdinaryAnimationBinding(information, renderObjectId, this.resources);
    if (ordinaryFrontAnimation !== null) {
      const ownerValidation = validateOrdinaryAnimationOwner(
        ordinaryFrontAnimation,
        this.creationSequenceByObjectId,
      );
      if (ownerValidation.status !== "ok") return ownerValidation;
      appendOrdinaryAnimationStart(commands, base, ordinaryFrontAnimation);
    }
    const habahiroIcon = completeHabahiro
      ? resolveHabahiroIconBinding(information, this.resources)
      : null;
    if (habahiroIcon !== null) {
      const iconObjectId = habahiroIconRenderObjectId(poolObjectId);
      const iconCreationSequence = this.creationSequenceByObjectId.get(iconObjectId);
      if (iconCreationSequence === undefined) {
        return evidenceRequired(
          "render.habahiro.icon-owner-missing",
          ["HAB-A04", "HAB-A06", "HAB-A07"],
          "Every current-external-complete HABAHIRO Flick/Long/Slide visual requires its fixed icon owner.",
        );
      }
      commands.push({
        ...base(commands.length), kind: "set-transform", renderObjectId: iconObjectId,
        position: start, scale: Object.freeze({ x: one.value, y: one.value }),
        rotationDegrees: zero.value, color: scene.noteTint,
        ordering: Object.freeze({
          domainLayer: scene.noteDomainLayer,
          sourceDepthOrSortingOrder: 72,
          sourceZ: start.z,
          creationSequence: iconCreationSequence,
        }),
        maskObjectId: null,
      });
      commands.push({
        ...base(commands.length), kind: "bind-resource", renderObjectId: iconObjectId,
        binding: "sprite", logicalAssetId: habahiroIcon.logicalAssetId,
        exactKey: habahiroIcon.exactKey,
      });
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: iconObjectId });
      commands.push({
        ...base(commands.length), kind: "play-animation", renderObjectId: iconObjectId,
        animationRole: habahiroIcon.animationRole, restart: true,
      });
    }
    for (const motion of adjustment.value.motions) {
      commands.push({
        ...base(commands.length),
        kind: "set-transform",
        renderObjectId,
        position: motion.position,
        scale: Object.freeze({ x: motion.localScale.x, y: motion.localScale.y }),
        rotationDegrees: zero.value,
        color: scene.noteTint,
        ordering,
        maskObjectId: null,
      });
      if (habahiroIcon !== null) commands.push({
        ...base(commands.length), kind: "set-transform",
        renderObjectId: habahiroIconRenderObjectId(poolObjectId),
        position: motion.position,
        scale: Object.freeze({ x: motion.localScale.x, y: motion.localScale.y }),
        rotationDegrees: zero.value, color: scene.noteTint,
        ordering: Object.freeze({
          ...ordering,
          sourceDepthOrSortingOrder: 72,
          creationSequence: this.creationSequenceByObjectId.get(
            habahiroIconRenderObjectId(poolObjectId),
          )!,
        }),
        maskObjectId: null,
      });
    }
    const renderedTransform = adjustment.value.motions[
      adjustment.value.motions.length - 1
    ] ?? Object.freeze({
      progressRate: zero.value,
      position: start,
      localScale: Object.freeze({ x: one.value, y: one.value, z: one.value }),
    });
    let longChildState: OrdinaryLongNormalChildState | null = null;
    let slideChildStates: readonly OrdinarySlideChildState[] | null = null;
    if (longTail) {
      const afterObjectId = longAfterRenderObjectId(poolObjectId);
      const meshObjectId = longMeshRenderObjectId(poolObjectId);
      const afterCreationSequence = this.creationSequenceByObjectId.get(afterObjectId);
      const meshCreationSequence = this.creationSequenceByObjectId.get(meshObjectId);
      if (afterCreationSequence === undefined || meshCreationSequence === undefined) {
        return evidenceRequired(
          "render.producer.long-child-not-created",
          ["RPR-D07", "RPR-D13", "PR15", "PR20", "PR39"],
          "Long activation requires committed after and mesh pool identities.",
        );
      }
      const createdChild = createOrdinaryLongNormalChildState(
        motionState,
        information.afterNoteAbsolutePos,
        noteBpm,
      );
      if (createdChild.status !== "ok") return createdChild;
      longChildState = createdChild.value;
      const widthRate = completeHabahiro
        ? getHabahiroMeshWidthRate(
            motionState.buttonCount,
            scene.habahiro!.meshWidthSetting,
          )
        : createRenderFloat32(Math.fround(1));
      const meshZ = createRenderFloat32(Math.fround(0.9900000095367432));
      if (widthRate.status !== "ok") return widthRate;
      if (meshZ.status !== "ok") return meshZ;
      const mesh = buildOrdinaryLongNormalMesh({
        front: renderedTransform,
        after: longChildState.renderedTransform,
        frontButtonCount: motionState.buttonCount,
        afterButtonCount: motionState.buttonCount,
        screenToSafeAreaRatio: scene.screenToSafeAreaRatio!,
        widthRate: widthRate.value,
        color: scene.longMeshColor!,
        advanced: information.virtualLaneDirection !== 0,
      });
      if (mesh.status !== "ok") return mesh;
      commands.push({
        ...base(commands.length),
        kind: "set-transform",
        renderObjectId: afterObjectId,
        position: longChildState.renderedTransform.position,
        scale: Object.freeze({ x: one.value, y: one.value }),
        rotationDegrees: zero.value,
        color: scene.noteTint,
        ordering: Object.freeze({
          domainLayer: scene.noteDomainLayer,
          sourceDepthOrSortingOrder: 70,
          sourceZ: start.z,
          creationSequence: afterCreationSequence,
        }),
        maskObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "set-transform",
        renderObjectId: meshObjectId,
        position: Object.freeze({ x: zero.value, y: zero.value, z: meshZ.value }),
        scale: Object.freeze({ x: one.value, y: one.value }),
        rotationDegrees: zero.value,
        color: scene.longMeshColor!,
        ordering: Object.freeze({
          domainLayer: scene.noteDomainLayer,
          sourceDepthOrSortingOrder: 0,
          sourceZ: meshZ.value,
          creationSequence: meshCreationSequence,
        }),
        maskObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "set-mesh",
        renderObjectId: meshObjectId,
        vertices: mesh.value.vertices,
        indices: mesh.value.indices,
        uv: mesh.value.uv,
        colors: mesh.value.colors,
        materialRole: "long-note",
      });
      commands.push({
        ...base(commands.length),
        kind: "set-threshold",
        renderObjectId: meshObjectId,
        threshold: CURRENT_SUDDEN_THRESHOLD,
      });
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: meshObjectId });
      const afterBinding = completeHabahiro
        ? resolveHabahiroAfterSpriteBinding(information, this.resources)
        : resolveAfterSpriteBinding(information, this.resources);
      if (afterBinding.status !== "ok") return afterBinding;
      commands.push({
        ...base(commands.length),
        kind: "bind-resource",
        renderObjectId: afterObjectId,
        binding: "sprite",
        logicalAssetId: afterBinding.value.logicalAssetId,
        exactKey: afterBinding.value.exactKey,
      });
      const afterAnimation = completeHabahiro
        ? null
        : resolveOrdinaryAfterAnimationBinding(
            information,
            afterObjectId,
            this.resources,
          );
      if (afterAnimation !== null) {
        const ownerValidation = validateOrdinaryAnimationOwner(
          afterAnimation,
          this.creationSequenceByObjectId,
        );
        if (ownerValidation.status !== "ok") return ownerValidation;
        appendOrdinaryAnimationStart(commands, base, afterAnimation);
      }
    }
    if (r7Slide) {
      const states: OrdinarySlideChildState[] = [];
      let previousTransform = renderedTransform;
      let previousButtonCount = motionState.buttonCount;
      for (let index = 0; index < information.slideNoteList.length; index += 1) {
        const source = information.slideNoteList[index];
        if (source === undefined) {
          return evidenceRequired(
            "render.slide.child-source-unavailable",
            ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12"],
            "Each fixed Slide child identity requires its chart-owned source at the same index.",
          );
        }
        const childLane = completeHabahiro
          ? resolveHabahiroMotionLaneIndex(source)
          : resolveOrdinaryMotionLaneIndex(source, true);
        if (childLane.status !== "ok") return childLane;
        const childStart = scene.noteStartPositions[childLane.value]!;
        const childGoal = scene.goalPositions[childLane.value]!;
        const childButtonCount = source.buttonTypesArray.length ||
          source.buttonTypes.length || 1;
        const childMotionState: OrdinaryNoteMotionState = Object.freeze({
          ...motionState,
          progressRate: zero.value,
          deltaTime: zero.value,
          realMoveSecond: zero.value,
          goalPosition: Object.freeze({ x: childGoal.x, y: childGoal.y }),
          noteStartPosition: Object.freeze({ x: childStart.x, y: childStart.y }),
          currentPositionZ: childStart.z,
          buttonCount: childButtonCount,
          virtualLaneControllerPresent: source.virtualLaneDirection !== 0,
        });
        const created = createOrdinarySlideChildState(
          index,
          childButtonCount,
          !source.isInvisible,
          childMotionState,
          source.absolutePos,
          noteBpm,
        );
        if (created.status !== "ok") return created;
        states.push(created.value);
        const childObjectId = slideChildRenderObjectId(poolObjectId, index);
        const meshObjectId = slideMeshRenderObjectId(poolObjectId, index);
        const childCreationSequence = this.creationSequenceByObjectId.get(childObjectId);
        const meshCreationSequence = this.creationSequenceByObjectId.get(meshObjectId);
        if (childCreationSequence === undefined || meshCreationSequence === undefined) {
          return evidenceRequired(
            "render.producer.slide-child-not-created",
            ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12", "PR39"],
            "Slide activation requires every chart-sized child and mesh pool identity to be committed.",
          );
        }
        const childTransform = created.value.lifecycle.renderedTransform;
        commands.push({
          ...base(commands.length),
          kind: "set-transform",
          renderObjectId: childObjectId,
          position: childTransform.position,
          scale: Object.freeze({ x: childTransform.localScale.x, y: childTransform.localScale.y }),
          rotationDegrees: zero.value,
          color: scene.noteTint,
          ordering: Object.freeze({
            domainLayer: scene.noteDomainLayer,
            sourceDepthOrSortingOrder: 70,
            sourceZ: childTransform.position.z,
            creationSequence: childCreationSequence,
          }),
          maskObjectId: null,
        });
        if (created.value.visible) {
          const childBinding = completeHabahiro
            ? resolveHabahiroSlideChildBinding(
                source,
                index === information.slideNoteList.length - 1,
                this.resources,
              )
            : resolveSlideChildSpriteBinding(source, this.resources);
          if (childBinding.status !== "ok") return childBinding;
          commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: childObjectId });
          commands.push({
            ...base(commands.length),
            kind: "bind-resource",
            renderObjectId: childObjectId,
            binding: "sprite",
            logicalAssetId: childBinding.value.logicalAssetId,
            exactKey: childBinding.value.exactKey,
          });
          const childAnimation = completeHabahiro
            ? null
            : resolveOrdinaryAnimationBinding(source, childObjectId, this.resources, true);
          if (childAnimation !== null) {
            const ownerValidation = validateOrdinaryAnimationOwner(
              childAnimation,
              this.creationSequenceByObjectId,
            );
            if (ownerValidation.status !== "ok") return ownerValidation;
            appendOrdinaryAnimationStart(commands, base, childAnimation);
          }
        }
        const segmentWidthRate = completeHabahiro
          ? getHabahiroMeshWidthRate(
              Math.max(previousButtonCount, childButtonCount),
              scene.habahiro!.meshWidthSetting,
            )
          : createRenderFloat32(Math.fround(1));
        if (segmentWidthRate.status !== "ok") return segmentWidthRate;
        const mesh = buildOrdinaryLongNormalMesh({
          front: previousTransform,
          after: childTransform,
          frontButtonCount: previousButtonCount,
          afterButtonCount: childButtonCount,
          screenToSafeAreaRatio: scene.screenToSafeAreaRatio!,
          widthRate: segmentWidthRate.value,
          color: scene.longMeshColor!,
          advanced: information.virtualLaneDirection !== 0 || source.virtualLaneDirection !== 0,
        });
        if (mesh.status !== "ok") return mesh;
        const meshZ = createRenderFloat32(Math.fround(0.9900000095367432));
        if (meshZ.status !== "ok") return meshZ;
        commands.push({
          ...base(commands.length),
          kind: "set-transform",
          renderObjectId: meshObjectId,
          position: Object.freeze({ x: zero.value, y: zero.value, z: meshZ.value }),
          scale: Object.freeze({ x: one.value, y: one.value }),
          rotationDegrees: zero.value,
          color: scene.longMeshColor!,
          ordering: Object.freeze({
            domainLayer: scene.noteDomainLayer,
            sourceDepthOrSortingOrder: 0,
            sourceZ: meshZ.value,
            creationSequence: meshCreationSequence,
          }),
          maskObjectId: null,
        });
        commands.push({
          ...base(commands.length),
          kind: "set-mesh",
          renderObjectId: meshObjectId,
          vertices: mesh.value.vertices,
          indices: mesh.value.indices,
          uv: mesh.value.uv,
          colors: mesh.value.colors,
          materialRole: "long-note",
        });
        commands.push({
          ...base(commands.length),
          kind: "set-threshold",
          renderObjectId: meshObjectId,
          threshold: CURRENT_SUDDEN_THRESHOLD,
        });
        commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: meshObjectId });
        previousTransform = childTransform;
        previousButtonCount = childButtonCount;
      }
      slideChildStates = Object.freeze(states);
    }
    const transaction = this.preflight(commands, () => {
      if (ordinaryFrontAnimation !== null) {
        this.noteAnimationElapsedSeconds.set(ordinaryFrontAnimation.ownerObjectId, Object.freeze({
          role: ordinaryFrontAnimation.animationRole,
          elapsed: 0,
        }));
      }
      if (habahiroIcon !== null) this.noteAnimationElapsedSeconds.set(
        habahiroIconRenderObjectId(poolObjectId),
        Object.freeze({ role: habahiroIcon.animationRole, elapsed: 0 }),
      );

      if (longTail) {
        const afterAnimation = completeHabahiro
          ? null
          : resolveOrdinaryAfterAnimationBinding(
              information,
              longAfterRenderObjectId(poolObjectId),
              this.resources,
            );
        if (afterAnimation !== null) this.noteAnimationElapsedSeconds.set(
          afterAnimation.ownerObjectId,
          Object.freeze({ role: afterAnimation.animationRole, elapsed: 0 }),
        );
      }
      for (let index = 0; index < information.slideNoteList.length; index += 1) {
        const source = information.slideNoteList[index]!;
        const animation = source.isInvisible || completeHabahiro
          ? null
          : resolveOrdinaryAnimationBinding(
              source,
              slideChildRenderObjectId(poolObjectId, index),
              this.resources,
              true,
            );
        if (animation !== null) this.noteAnimationElapsedSeconds.set(
          animation.ownerObjectId,
          Object.freeze({ role: animation.animationRole, elapsed: 0 }),
        );
      }
    });
    if (transaction.status !== "ok") return transaction;
    return ok(Object.freeze({
      motionState: Object.freeze({
        ...motionState,
        progressRate: adjustment.value.progressRate,
        realMoveSecond: adjustment.value.realMoveSecond,
      }),
      renderedTransform,
      longChildState,
      slideChildStates,
      transaction: transaction.value,
    }));
  }

  preflightOrdinaryMultipleDirectionalLine(
    poolIndex: number,
    ownerState: OrdinaryMultipleDirectionalLineOwnerState,
    materialDirection: "left" | "right",
    activate: boolean,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (!Number.isSafeInteger(poolIndex) || poolIndex < 0) {
      return evidenceRequired(
        "render.producer.invalid-multiple-directional-line-pool-index",
        ["RPR-R4-010", "RPR-R4-013", "PR09", "PR17"],
        "MultipleDirectional back-line updates require a non-negative engine-owned pool index.",
      );
    }
    const renderObjectId = multipleDirectionalLineRenderObjectId(poolIndex);
    if (!this.creationSequenceByObjectId.has(renderObjectId)) {
      return evidenceRequired(
        "render.producer.multiple-directional-line-not-created",
        ["RPR-R4-010", "RPR-R4-013", "PR09", "PR17"],
        "MultipleDirectional back-line updates require a committed fixed-pool identity.",
      );
    }
    const geometry = buildOrdinaryMultipleDirectionalLine(ownerState);
    if (geometry.status !== "ok") return geometry;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    if (activate) {
      commands.push({
        ...base(commands.length),
        kind: "bind-resource",
        renderObjectId,
        binding: "material",
        logicalAssetId: materialDirection === "left"
          ? this.resources.multipleDirectionalLineLeftLogicalAssetId!
          : this.resources.multipleDirectionalLineRightLogicalAssetId!,
        exactKey: null,
      });
    }
    commands.push({
      ...base(commands.length),
      kind: "set-line",
      renderObjectId,
      start: geometry.value.start,
      end: geometry.value.end,
      width: geometry.value.width,
      materialRole: "multiple-directional-line",
    });
    if (activate) {
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId });
    }
    return this.preflight(commands);
  }

  preflightOrdinarySyncLine(
    poolIndex: number,
    ownerState: OrdinarySyncLineOwnerState,
    activate: boolean,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (!Number.isSafeInteger(poolIndex) || poolIndex < 0) {
      return evidenceRequired(
        "render.producer.invalid-sync-line-pool-index",
        ["RPR-D06", "RPR-D13", "PR16", "PR39"],
        "Simultaneous-line updates require one non-negative engine-owned pool index.",
      );
    }
    const renderObjectId = syncLineRenderObjectId(poolIndex);
    if (!this.creationSequenceByObjectId.has(renderObjectId)) {
      return evidenceRequired(
        "render.producer.sync-line-not-created",
        ["RPR-D06", "RPR-D13", "PR16", "PR39"],
        "Simultaneous-line updates require a committed fixed-pool identity.",
      );
    }
    const geometry = buildOrdinarySyncLine(ownerState);
    if (geometry.status !== "ok") return geometry;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [{
      ...base(0),
      kind: "set-line",
      renderObjectId,
      start: geometry.value.start,
      end: geometry.value.end,
      width: geometry.value.width,
      materialRole: "sync-line",
    }];
    if (activate) {
      commands.push({
        ...base(1),
        kind: "activate-object",
        renderObjectId,
      });
    }
    return this.preflight(commands);
  }

  preflightOrdinaryLongChildFrame(
    poolObjectId: string,
    childState: OrdinaryLongNormalChildState,
    frontTransform: OrdinaryNoteMotionResult,
    input: OrdinaryLongNormalChildFrameInput,
    scene: OrdinaryFixedNoteSceneInput,
  ): SimulatorResult<PreparedOrdinaryLongChildFrame> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const sceneValidation = validateOrdinaryFixedNoteSceneInput(scene);
    if (sceneValidation.status !== "ok") return sceneValidation;
    if (this.isCompleteHabahiro() && !validateHabahiroScene(scene.habahiro)) {
      return evidenceRequired(
        "render.habahiro.scene-required",
        ["HAB-A04", "HAB-A08", "HAB-A09", "HAB-A10"],
        "Complete HABAHIRO Long motion requires its validated width and field profile.",
      );
    }
    if (
      scene.screenToSafeAreaRatio === undefined ||
      !validateRenderFloat32(scene.screenToSafeAreaRatio) ||
      scene.screenToSafeAreaRatio.value <= 0 ||
      scene.longMeshColor === undefined ||
      !validateColor(scene.longMeshColor)
    ) {
      return evidenceRequired(
        "render.note.long-scene-unavailable",
        ["RPR-D05", "RPR-D06", "RPR-D13", "PR11", "PR13", "PR15"],
        "Long child frames require explicit positive safe-area ratio and typed base-mesh color inputs.",
      );
    }
    const next = advanceOrdinaryLongNormalChild(childState, input);
    if (next.status !== "ok") return next;
    const widthRate = this.isCompleteHabahiro()
      ? getHabahiroMeshWidthRate(
          childState.motionState.buttonCount,
          scene.habahiro!.meshWidthSetting,
        )
      : createRenderFloat32(Math.fround(1));
    const zero = createRenderFloat32(Math.fround(0));
    if (widthRate.status !== "ok") return widthRate;
    if (zero.status !== "ok") return zero;
    const mesh = buildOrdinaryLongNormalMesh({
      front: frontTransform,
      after: next.value.renderedTransform,
      frontButtonCount: childState.motionState.buttonCount,
      afterButtonCount: childState.motionState.buttonCount,
      screenToSafeAreaRatio: scene.screenToSafeAreaRatio,
      widthRate: widthRate.value,
      color: scene.longMeshColor,
      advanced: childState.motionState.virtualLaneControllerPresent,
    });
    if (mesh.status !== "ok") return mesh;
    const afterObjectId = longAfterRenderObjectId(poolObjectId);
    const meshObjectId = longMeshRenderObjectId(poolObjectId);
    const afterCreationSequence = this.creationSequenceByObjectId.get(afterObjectId);
    if (afterCreationSequence === undefined || !this.creationSequenceByObjectId.has(meshObjectId)) {
      return evidenceRequired(
        "render.producer.long-child-not-created",
        ["RPR-D07", "RPR-D13", "PR15", "PR20", "PR39"],
        "Long child frames require committed after and mesh pool identities.",
      );
    }
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [{
      ...base(0),
      kind: "set-transform",
      renderObjectId: afterObjectId,
      position: next.value.renderedTransform.position,
      scale: Object.freeze({
        x: next.value.renderedTransform.localScale.x,
        y: next.value.renderedTransform.localScale.y,
      }),
      rotationDegrees: zero.value,
      color: scene.noteTint,
      ordering: Object.freeze({
        domainLayer: scene.noteDomainLayer,
        sourceDepthOrSortingOrder: 70,
        sourceZ: next.value.renderedTransform.position.z,
        creationSequence: afterCreationSequence,
      }),
      maskObjectId: null,
    }];
    if (childState.phase === "wait" && next.value.phase === "move") {
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: afterObjectId });
    }
    const animatedAfterObjectId = ordinaryNoteIconRenderObjectId(afterObjectId);
    const animation = this.noteAnimationElapsedSeconds.get(animatedAfterObjectId);
    let nextAnimationElapsed: number | null = null;
    if (animation !== undefined) {
      nextAnimationElapsed = Math.fround(animation.elapsed + input.deltaTime.value);
      const sample = createRenderFloat32(nextAnimationElapsed);
      if (sample.status !== "ok") return sample;
      commands.push({
        ...base(commands.length), kind: "sample-animation", renderObjectId: animatedAfterObjectId,
        animationRole: animation.role, elapsedSeconds: sample.value,
      });
    }
    commands.push({
      ...base(commands.length),
      kind: "set-mesh",
      renderObjectId: meshObjectId,
      vertices: mesh.value.vertices,
      indices: mesh.value.indices,
      uv: mesh.value.uv,
      colors: mesh.value.colors,
      materialRole: "long-note",
    });
    const transaction = this.preflight(commands, () => {
      if (animation !== undefined && nextAnimationElapsed !== null) {
        this.noteAnimationElapsedSeconds.set(animatedAfterObjectId, Object.freeze({
          role: animation.role, elapsed: nextAnimationElapsed,
        }));
      }
    });
    return transaction.status === "ok"
      ? ok(Object.freeze({ childState: next.value, transaction: transaction.value }))
      : transaction;
  }

  preflightOrdinarySlideChildFrame(
    poolObjectId: string,
    childStates: readonly OrdinarySlideChildState[],
    frontTransform: OrdinaryNoteMotionResult,
    frontButtonCount: number,
    input: OrdinaryLongNormalChildFrameInput,
    scene: OrdinaryFixedNoteSceneInput,
  ): SimulatorResult<PreparedOrdinarySlideChildFrame> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const sceneValidation = validateOrdinaryFixedNoteSceneInput(scene);
    if (sceneValidation.status !== "ok") return sceneValidation;
    if (this.isCompleteHabahiro() && !validateHabahiroScene(scene.habahiro)) {
      return evidenceRequired(
        "render.habahiro.scene-required",
        ["HAB-A04", "HAB-A08", "HAB-A09", "HAB-A10"],
        "Complete HABAHIRO Slide motion requires its validated width and field profile.",
      );
    }
    if (
      scene.screenToSafeAreaRatio === undefined ||
      scene.longMeshColor === undefined
    ) {
      return evidenceRequired(
        "render.slide.scene-unavailable",
        ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12", "PR15"],
        "R4 Slide frames require explicit safe-area ratio and typed mesh color.",
      );
    }
    const advanced = advanceOrdinarySlideChildren(
      frontTransform,
      frontButtonCount,
      childStates,
      input,
      scene.screenToSafeAreaRatio,
      scene.longMeshColor,
      this.isCompleteHabahiro()
        ? scene.habahiro!.meshWidthSetting
        : undefined,
    );
    if (advanced.status !== "ok") return advanced;
    const zero = createRenderFloat32(Math.fround(0));
    if (zero.status !== "ok") return zero;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    const animationUpdates: { readonly renderObjectId: string; readonly role: NoteVisualAnimationRole; readonly elapsed: number }[] = [];
    for (let index = 0; index < advanced.value.childStates.length; index += 1) {
      const state = advanced.value.childStates[index]!;
      const segment = advanced.value.segments[index]!;
      const childObjectId = slideChildRenderObjectId(poolObjectId, state.sourceIndex);
      const meshObjectId = slideMeshRenderObjectId(poolObjectId, segment.sourceIndex);
      const childCreationSequence = this.creationSequenceByObjectId.get(childObjectId);
      if (childCreationSequence === undefined || !this.creationSequenceByObjectId.has(meshObjectId)) {
        return evidenceRequired(
          "render.producer.slide-child-not-created",
          ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12", "PR39"],
          "Slide updates require every chart-sized child and segment identity to remain committed.",
        );
      }
      if (state.visible) {
        commands.push({
          ...base(commands.length),
          kind: "set-transform",
          renderObjectId: childObjectId,
          position: state.lifecycle.renderedTransform.position,
          scale: Object.freeze({
            x: state.lifecycle.renderedTransform.localScale.x,
            y: state.lifecycle.renderedTransform.localScale.y,
          }),
          rotationDegrees: zero.value,
          color: scene.noteTint,
          ordering: Object.freeze({
            domainLayer: scene.noteDomainLayer,
            sourceDepthOrSortingOrder: 70,
            sourceZ: state.lifecycle.renderedTransform.position.z,
            creationSequence: childCreationSequence,
          }),
          maskObjectId: null,
        });
        for (const animatedObjectId of [
          ordinaryNoteIconRenderObjectId(childObjectId),
          ordinaryLongFlashRenderObjectId(childObjectId),
        ]) {
          const animation = this.noteAnimationElapsedSeconds.get(animatedObjectId);
          if (animation === undefined) continue;
          const elapsed = Math.fround(animation.elapsed + input.deltaTime.value);
          const sample = createRenderFloat32(elapsed);
          if (sample.status !== "ok") return sample;
          commands.push({
            ...base(commands.length), kind: "sample-animation", renderObjectId: animatedObjectId,
            animationRole: animation.role, elapsedSeconds: sample.value,
          });
          animationUpdates.push(Object.freeze({ renderObjectId: animatedObjectId, role: animation.role, elapsed }));
        }
      }
      commands.push({
        ...base(commands.length),
        kind: "set-mesh",
        renderObjectId: meshObjectId,
        vertices: segment.geometry.vertices,
        indices: segment.geometry.indices,
        uv: segment.geometry.uv,
        colors: segment.geometry.colors,
        materialRole: "long-note",
      });
    }
    const transaction = this.preflight(commands, () => {
      for (const update of animationUpdates) this.noteAnimationElapsedSeconds.set(
        update.renderObjectId,
        Object.freeze({ role: update.role, elapsed: update.elapsed }),
      );
    });
    return transaction.status === "ok"
      ? ok(Object.freeze({ childStates: advanced.value.childStates, transaction: transaction.value }))
      : transaction;
  }

  preflightOrdinaryNoteSceneMotion(
    poolObjectId: string,
    motionState: OrdinaryNoteMotionState,
    scene: OrdinaryFixedNoteSceneInput,
  ): SimulatorResult<PreparedOrdinaryNoteMotion> {
    const sceneValidation = validateOrdinaryFixedNoteSceneInput(scene);
    if (sceneValidation.status !== "ok") return sceneValidation;
    const renderObjectId = rootRenderObjectId(poolObjectId);
    const creationSequence = this.creationSequenceByObjectId.get(renderObjectId);
    if (creationSequence === undefined) {
      return evidenceRequired(
        "render.producer.note-root-not-created",
        ["RPR-D13", "RPR-D14", "PR05", "PR39"],
        "Ordinary Move requires its committed engine-authored pool root identity.",
      );
    }
    return this.preflightOrdinaryNoteMotion(poolObjectId, motionState, {
      color: scene.noteTint,
      ordering: Object.freeze({
        domainLayer: scene.noteDomainLayer,
        sourceDepthOrSortingOrder: 70,
        sourceZ: motionState.currentPositionZ,
        creationSequence,
      }),
      maskObjectId: null,
    });
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
    const commands: RenderCommand[] = [{
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
    }];
    const animationUpdates: { readonly renderObjectId: string; readonly role: NoteVisualAnimationRole; readonly elapsed: number }[] = [];
    const iconObjectId = habahiroIconRenderObjectId(poolObjectId);
    const iconCreationSequence = this.creationSequenceByObjectId.get(iconObjectId);
    if (iconCreationSequence !== undefined && this.noteAnimationElapsedSeconds.has(iconObjectId)) {
      commands.push({
        ...base(commands.length), kind: "set-transform", renderObjectId: iconObjectId,
        position: motion.value.position,
        scale: Object.freeze({ x: motion.value.localScale.x, y: motion.value.localScale.y }),
        rotationDegrees: rotation.value, color: visualState.color,
        ordering: Object.freeze({
          ...visualState.ordering,
          sourceDepthOrSortingOrder: 72,
          creationSequence: iconCreationSequence,
        }),
        maskObjectId: null,
      });
    }
    for (const animatedObjectId of [
      ordinaryNoteIconRenderObjectId(renderObjectId),
      ordinaryLongFlashRenderObjectId(renderObjectId),
      iconObjectId,
    ]) {
      const animation = this.noteAnimationElapsedSeconds.get(animatedObjectId);
      if (animation === undefined) continue;
      const elapsed = Math.fround(animation.elapsed + motionState.deltaTime.value);
      const sample = createRenderFloat32(elapsed);
      if (sample.status !== "ok") return sample;
      commands.push({
        ...base(commands.length), kind: "sample-animation", renderObjectId: animatedObjectId,
        animationRole: animation.role, elapsedSeconds: sample.value,
      });
      animationUpdates.push(Object.freeze({ renderObjectId: animatedObjectId, role: animation.role, elapsed }));
    }
    const transaction = this.preflight(commands, () => {
      for (const update of animationUpdates) this.noteAnimationElapsedSeconds.set(
        update.renderObjectId,
        Object.freeze({ role: update.role, elapsed: update.elapsed }),
      );
    });
    return transaction.status === "ok"
      ? ok(Object.freeze({ motion: motion.value, transaction: transaction.value }))
      : transaction;
  }

  preflightNoteDeactivation(
    poolObjectId: string,
    syncLinePoolIndices: readonly number[] = [],
    deactivateLongChildren = false,
    multipleDirectionalLinePoolIndices: readonly number[] = [],
    deactivateSlideChildCount = 0,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const renderObjectId = rootRenderObjectId(poolObjectId);
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    for (const childObjectId of [
      ordinaryNoteIconRenderObjectId(renderObjectId),
      ordinaryLongFlashRenderObjectId(renderObjectId),
      habahiroIconRenderObjectId(poolObjectId),
    ]) appendAnimationChildTeardown(
      commands,
      base,
      childObjectId,
      this.creationSequenceByObjectId,
      this.noteAnimationElapsedSeconds,
    );
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId });
    commands.push({ ...base(commands.length), kind: "deactivate-object", renderObjectId });
    if (
      !Number.isSafeInteger(deactivateSlideChildCount) ||
      deactivateSlideChildCount < 0
    ) {
      return evidenceRequired(
        "render.producer.invalid-slide-child-teardown-count",
        ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12"],
        "Slide teardown requires the non-negative chart-sized child count committed at setup.",
      );
    }
    if (deactivateLongChildren) {
      const afterObjectId = longAfterRenderObjectId(poolObjectId);
      appendAnimationChildTeardown(
        commands,
        base,
        ordinaryNoteIconRenderObjectId(afterObjectId),
        this.creationSequenceByObjectId,
        this.noteAnimationElapsedSeconds,
      );
      for (const childObjectId of [afterObjectId, longMeshRenderObjectId(poolObjectId)]) {
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: childObjectId });
        commands.push({ ...base(commands.length), kind: "deactivate-object", renderObjectId: childObjectId });
      }
    }
    for (let index = 0; index < deactivateSlideChildCount; index += 1) {
      const slideChildObjectId = slideChildRenderObjectId(poolObjectId, index);
      for (const animationChildObjectId of [
        ordinaryNoteIconRenderObjectId(slideChildObjectId),
        ordinaryLongFlashRenderObjectId(slideChildObjectId),
      ]) appendAnimationChildTeardown(
        commands,
        base,
        animationChildObjectId,
        this.creationSequenceByObjectId,
        this.noteAnimationElapsedSeconds,
      );
      for (const childObjectId of [slideChildObjectId, slideMeshRenderObjectId(poolObjectId, index)]) {
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: childObjectId });
        commands.push({ ...base(commands.length), kind: "deactivate-object", renderObjectId: childObjectId });
      }
    }
    for (const poolIndex of syncLinePoolIndices) {
      if (!Number.isSafeInteger(poolIndex) || poolIndex < 0) {
        return evidenceRequired(
          "render.producer.invalid-sync-line-pool-index",
          ["RPR-D06", "RPR-D13", "PR16", "PR39"],
          "Simultaneous-line teardown requires only non-negative engine-owned pool indices.",
        );
      }
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId: syncLineRenderObjectId(poolIndex),
      });
      commands.push({
        ...base(commands.length),
        kind: "deactivate-object",
        renderObjectId: syncLineRenderObjectId(poolIndex),
      });
    }
    for (const poolIndex of multipleDirectionalLinePoolIndices) {
      if (!Number.isSafeInteger(poolIndex) || poolIndex < 0) {
        return evidenceRequired(
          "render.producer.invalid-multiple-directional-line-pool-index",
          ["RPR-R4-010", "RPR-R4-013", "PR09", "PR17"],
          "MultipleDirectional teardown requires only non-negative engine-owned pool indices.",
        );
      }
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId: multipleDirectionalLineRenderObjectId(poolIndex),
      });
      commands.push({
        ...base(commands.length),
        kind: "deactivate-object",
        renderObjectId: multipleDirectionalLineRenderObjectId(poolIndex),
      });
    }
    return this.preflight(commands, () => {
      for (const objectId of [
        renderObjectId,
        ordinaryNoteIconRenderObjectId(renderObjectId),
        ordinaryLongFlashRenderObjectId(renderObjectId),
        habahiroIconRenderObjectId(poolObjectId),
        longAfterRenderObjectId(poolObjectId),
        ordinaryNoteIconRenderObjectId(longAfterRenderObjectId(poolObjectId)),
      ]) this.noteAnimationElapsedSeconds.delete(objectId);
      for (let index = 0; index < deactivateSlideChildCount; index += 1) {
        const childObjectId = slideChildRenderObjectId(poolObjectId, index);
        this.noteAnimationElapsedSeconds.delete(childObjectId);
        this.noteAnimationElapsedSeconds.delete(ordinaryNoteIconRenderObjectId(childObjectId));
        this.noteAnimationElapsedSeconds.delete(ordinaryLongFlashRenderObjectId(childObjectId));
      }
    });
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
    return this.preflight(commands, () => {
      this.createdObjectIds.length = 0;
      this.creationSequenceByObjectId.clear();
      this.hudAnimationElapsedSeconds.clear();
      this.lifeAnimationElapsedSeconds.clear();
      this.addScoreElapsedSeconds.clear();
      this.noteAnimationElapsedSeconds.clear();
      this.resultElapsedSeconds = null;
      this.scoreGaugeSsElapsedSeconds = null;
    });
  }

  private validateOrdinaryVisibleBindings(): SimulatorResult<void> {
    if (this.resources.ordinaryVisible === undefined ||
      Object.values(this.resources.ordinaryVisible).some((value) => !isNonEmpty(value))) {
      return evidenceRequired(
        "render.producer.missing-ordinary-visible-bindings",
        ["PR22", "PR26", "PR27", "PR29", "PR30", "PR39"],
        "Common single-player HUD setup requires exact Combo, Judge, Life and warning resources before domain mutation.",
      );
    }
    return ok(undefined);
  }

  private validateScoreHudBindings(): SimulatorResult<void> {
    if (this.resources.scoreHud === undefined ||
      Object.values(this.resources.scoreHud).some((value) => !isNonEmpty(value))) {
      return evidenceRequired(
        "render.producer.missing-score-hud-bindings",
        [],
        "Score HUD setup requires the exact font, gauge and high-rank resource bindings prepared before domain mutation.",
      );
    }
    return ok(undefined);
  }

  private recordCreatedObjects(renderObjectIds: readonly string[]): void {
    for (const renderObjectId of renderObjectIds) {
      this.creationSequenceByObjectId.set(
        renderObjectId,
        this.creationSequenceByObjectId.size,
      );
      this.createdObjectIds.push(renderObjectId);
    }
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

export function validateHabahiroScene(
  scene: HabahiroSceneInput | undefined,
): scene is HabahiroSceneInput {
  if (
    scene === undefined ||
    !validateRenderFloat32(scene.meshWidthSetting) ||
    !validateRenderFloat32(scene.flashDurationSeconds) ||
    scene.flashDurationSeconds.value !== Math.fround(0.25) ||
    scene.fieldBefore.length === 0 ||
    scene.fieldBefore.length !== scene.fieldAfter.length
  ) return false;
  const beforeIds = scene.fieldBefore.map((plan) => plan.renderObjectId);
  const afterIds = scene.fieldAfter.map((plan) => plan.renderObjectId);
  const validateField = (plan: RenderFieldObjectPlan) =>
    isNonEmpty(plan.renderObjectId) && isNonEmpty(plan.logicalAssetId) && isNonEmpty(plan.exactKey) &&
    (plan.role === "field-line" || plan.role === "judge-line") &&
    validateVector3(plan.position) && validateVector2(plan.scale) &&
    validateRenderFloat32(plan.rotationDegrees) && validateColor(plan.color) &&
    validateOrdering(plan.ordering);
  return new Set(beforeIds).size === beforeIds.length &&
    scene.fieldBefore.every(validateField) && scene.fieldAfter.every(validateField) &&
    beforeIds.every((id, index) => id === afterIds[index]) &&
    scene.fieldMasks.every((plan) =>
      isNonEmpty(plan.renderObjectId) && plan.polygon.length >= 3 &&
      plan.polygon.every(validateVector2) && validateVector3(plan.position) &&
      validateVector2(plan.scale) && validateRenderFloat32(plan.rotationDegrees) &&
      validateOrdering(plan.ordering));
}

export function validateOrdinaryFixedNoteSceneInput(
  scene: OrdinaryFixedNoteSceneInput,
): SimulatorResult<void> {
  const vectors = [...scene.noteStartPositions, ...scene.goalPositions];
  if (
    !validateRenderFloat32(scene.specificSpeed) ||
    !validateRenderFloat32(scene.noteSettingScale) ||
    scene.noteSettingScale.value < 0 ||
    !validateRenderFloat32(scene.launcherY) ||
    !validateRenderFloat32(scene.targetCenterY) ||
    !validateRenderFloat32(scene.highAspectRatio) ||
    scene.noteStartPositions.length !== 7 ||
    scene.goalPositions.length !== 7 ||
    vectors.some((value) => !validateVector3(value)) ||
    !validateColor(scene.noteTint) ||
    !Number.isSafeInteger(scene.noteDomainLayer) ||
    (scene.syncLineEdgeMargin !== undefined &&
      (!validateRenderFloat32(scene.syncLineEdgeMargin) ||
        scene.syncLineEdgeMargin.value < 0)) ||
    (scene.screenToSafeAreaRatio !== undefined &&
      (!validateRenderFloat32(scene.screenToSafeAreaRatio) ||
        scene.screenToSafeAreaRatio.value <= 0)) ||
    (scene.longMeshColor !== undefined && !validateColor(scene.longMeshColor))
  ) {
    return evidenceRequired(
      "render.producer.invalid-ordinary-fixed-note-scene",
      ["RPR-D05", "RPR-D13", "PR10", "PR39"],
      "The fixed ordinary Note scene requires exact speed/scale/aspect values, seven typed start/goal transforms, one color and one portable domain layer.",
    );
  }
  return ok(undefined);
}

type RenderCommandBaseFactory = (offset: number) => {
  readonly sessionId: string;
  readonly sequence: number;
  readonly frame: number;
  readonly substep: number;
};

type OrdinaryAnimationBinding = Readonly<{
  ownerObjectId: string;
  logicalAssetId: string;
  exactKey: string;
  animationRole: NoteVisualAnimationRole;
}>;

function appendHiddenChild(
  commands: RenderCommand[],
  created: string[],
  base: RenderCommandBaseFactory,
  renderObjectId: string,
  poolFamily: string,
  role: "note-icon" | "note-intermediate",
  parentObjectId: string,
): void {
  created.push(renderObjectId);
  commands.push({
    ...base(commands.length),
    kind: "create-object",
    renderObjectId,
    poolFamily,
    role,
    parentObjectId,
  });
  commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId });
}

function appendOrdinaryAnimationStart(
  commands: RenderCommand[],
  base: RenderCommandBaseFactory,
  binding: OrdinaryAnimationBinding,
): void {
  commands.push({
    ...base(commands.length),
    kind: "bind-resource",
    renderObjectId: binding.ownerObjectId,
    binding: "sprite",
    logicalAssetId: binding.logicalAssetId,
    exactKey: binding.exactKey,
  });
  commands.push({
    ...base(commands.length),
    kind: "activate-object",
    renderObjectId: binding.ownerObjectId,
  });
  commands.push({
    ...base(commands.length),
    kind: "play-animation",
    renderObjectId: binding.ownerObjectId,
    animationRole: binding.animationRole,
    restart: true,
  });
}

function validateOrdinaryAnimationOwner(
  binding: OrdinaryAnimationBinding,
  creationSequenceByObjectId: ReadonlyMap<string, number>,
): SimulatorResult<void> {
  return creationSequenceByObjectId.has(binding.ownerObjectId)
    ? ok(undefined)
    : evidenceRequired(
        "render.note.ordinary-animation-owner-missing",
        ["RPR-R7-001", "PR08", "PR09", "PR11", "PR39"],
        "Current ordinary Note animation requires its fixed independent Sprite child before activation.",
      );
}

function appendAnimationChildTeardown(
  commands: RenderCommand[],
  base: RenderCommandBaseFactory,
  renderObjectId: string,
  creationSequenceByObjectId: ReadonlyMap<string, number>,
  animations: ReadonlyMap<string, { readonly role: NoteVisualAnimationRole; readonly elapsed: number }>,
): void {
  if (!creationSequenceByObjectId.has(renderObjectId)) return;
  const animation = animations.get(renderObjectId);
  if (animation !== undefined) commands.push({
    ...base(commands.length),
    kind: "stop-animation",
    renderObjectId,
    animationRole: animation.role,
    restart: false,
  });
  commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId });
  commands.push({ ...base(commands.length), kind: "deactivate-object", renderObjectId });
}

export function rootRenderObjectId(poolObjectId: string): string {
  return `render:${poolObjectId}:root`;
}

export function ordinaryNoteIconRenderObjectId(parentObjectId: string): string {
  return `${parentObjectId}:ordinary-note-icon`;
}

export function ordinaryLongFlashRenderObjectId(parentObjectId: string): string {
  return `${parentObjectId}:ordinary-long-flash`;
}

export function habahiroIconRenderObjectId(poolObjectId: string): string {
  return `render:${poolObjectId}:habahiro-icon`;
}

export function longAfterRenderObjectId(poolObjectId: string): string {
  return `render:${poolObjectId}:after`;
}

export function longMeshRenderObjectId(poolObjectId: string): string {
  return `render:${poolObjectId}:mesh`;
}

export function slideChildRenderObjectId(poolObjectId: string, index: number): string {
  return `render:${poolObjectId}:slide-child:${index}`;
}

export function slideMeshRenderObjectId(poolObjectId: string, index: number): string {
  return `render:${poolObjectId}:slide-mesh:${index}`;
}

export function syncLineRenderObjectId(poolIndex: number): string {
  return `render:sync-line:${poolIndex}`;
}

export function multipleDirectionalLineRenderObjectId(poolIndex: number): string {
  return `render:multiple-directional-line:${poolIndex}`;
}

export function resolveFrontSpriteBinding(
  information: NoteInformation,
  habahiro: boolean,
  resources: RenderEngineResourceBindings,
  noteColor: boolean,
): SimulatorResult<{
  readonly logicalAssetId: string;
  readonly exactKey: string;
}> {
  const laneSuffix = resolveFrontLaneSuffix(information, habahiro);
  if (laneSuffix.status !== "ok") return laneSuffix;
  if (
    information.fireNoteType === FrontNoteType.DirectionalFlick ||
    information.fireNoteType === FrontNoteType.MultipleDirectionalFlick ||
    information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
    information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
    information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd ||
    gameTypeIsDirectional(information.gameNoteType)
  ) {
    if (habahiro) {
      return evidenceRequired(
        "render.note.habahiro-directional-root-unrepresented",
        ["RPR-D03", "RPR-D04", "PR04", "PR09", "HA-D04"],
        "The degraded HABAHIRO directional side-visual route is separate from the front Sprite binding and is not inferred here.",
      );
    }
    const direction = gameTypeIsDirectional(information.gameNoteType)
      ? gameTypeIsLeft(information.gameNoteType) ? "l" : "r"
      : information.afterNoteType !== AfterNoteType.None && afterTypeIsDirectional(information.afterNoteType)
      ? afterTypeIsLeft(information.afterNoteType) ? "l" : "r"
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
        family = noteColor && information.shortRhythmUnder8beat ? "note_normal_16" : "note_normal";
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

function resolveHabahiroFrontSpriteBinding(
  information: NoteInformation,
  resources: RenderEngineResourceBindings,
  noteColor: boolean,
): SimulatorResult<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const laneSuffix = resolveLaneSuffix(information, true);
  if (laneSuffix.status !== "ok") return laneSuffix;
  const atlases = resolveHabahiroAtlasLogicalIds(resources);
  if (information.gameNoteAdditionalType === GameNoteAdditionalType.Skill) {
    return ok(Object.freeze({ logicalAssetId: atlases.skill, exactKey: `note_skill_${laneSuffix.value}` }));
  }
  if (information.fireNoteType === FrontNoteType.Normal) {
    return noteColor && information.shortRhythmUnder8beat
      ? ok(Object.freeze({ logicalAssetId: atlases.normal16, exactKey: `note_normal_16_${laneSuffix.value}` }))
      : ok(Object.freeze({ logicalAssetId: atlases.normal, exactKey: `note_normal_${laneSuffix.value}` }));
  }
  if (
    information.fireNoteType === FrontNoteType.Flick ||
    information.fireNoteType === FrontNoteType.DirectionalFlick ||
    information.fireNoteType === FrontNoteType.MultipleDirectionalFlick ||
    information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
    information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
    information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd
  ) {
    return ok(Object.freeze({ logicalAssetId: atlases.flick, exactKey: `note_flick_${laneSuffix.value}` }));
  }
  return ok(Object.freeze({ logicalAssetId: atlases.long, exactKey: `note_long_${laneSuffix.value}` }));
}

function resolveHabahiroIconBinding(
  information: NoteInformation,
  resources: RenderEngineResourceBindings,
): {
  readonly logicalAssetId: string;
  readonly exactKey: string;
  readonly animationRole: NoteVisualAnimationRole;
} | null {
  const atlases = resolveHabahiroAtlasLogicalIds(resources);
  const buttonCount = information.buttonTypesArray.length || information.buttonTypes.length || 1;
  if (information.fireNoteType === FrontNoteType.Flick) {
    const topWidth = Math.min(buttonCount, 3);
    return Object.freeze({
      logicalAssetId: atlases.flick,
      exactKey: topWidth === 1 ? "note_flick_top" : `note_flick_top_${topWidth}`,
      animationRole: "note-flick",
    });
  }
  if (
    information.fireNoteType === FrontNoteType.DirectionalFlick ||
    information.fireNoteType === FrontNoteType.MultipleDirectionalFlick ||
    information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
    information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
    information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd
  ) {
    const direction = gameTypeIsDirectional(information.gameNoteType)
      ? gameTypeIsLeft(information.gameNoteType) ? "l" : "r"
      : afterTypeIsDirectional(information.afterNoteType)
      ? afterTypeIsLeft(information.afterNoteType) ? "l" : "r"
      : null;
    const lane = resolveLaneIndex(information.buttonType, true);
    if (direction === null || !Number.isInteger(lane) || lane < 0 || lane > 6) return null;
    return Object.freeze({
      logicalAssetId: atlases.flick,
      exactKey: `note_flick_${direction}_${lane}`,
      animationRole: "note-directional-flick",
    });
  }
  if (
    information.fireNoteType === FrontNoteType.Long ||
    information.fireNoteType === FrontNoteType.SlideA ||
    information.fireNoteType === FrontNoteType.SlideB
  ) {
    const suffix = resolveLaneSuffix(information, true);
    if (suffix.status !== "ok") return null;
    return Object.freeze({
      logicalAssetId: atlases.longFlash,
      exactKey: `note_long_flash_${suffix.value}`,
      animationRole: "note-long-flash",
    });
  }
  return null;
}

function resolveHabahiroAfterSpriteBinding(
  information: NoteInformation,
  resources: RenderEngineResourceBindings,
): SimulatorResult<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const laneSuffix = resolveLaneSuffix(information, true);
  if (laneSuffix.status !== "ok") return laneSuffix;
  const flick = information.afterNoteType === AfterNoteType.Flick ||
    information.afterNoteType === AfterNoteType.SlideFlickEnd ||
    afterTypeIsDirectional(information.afterNoteType);
  return ok(Object.freeze({
    logicalAssetId: flick
      ? resolveHabahiroAtlasLogicalIds(resources).flick
      : resolveHabahiroAtlasLogicalIds(resources).long,
    exactKey: `${flick ? "note_flick" : "note_long"}_${laneSuffix.value}`,
  }));
}

function resolveHabahiroSlideChildBinding(
  information: NoteInformation,
  terminal: boolean,
  resources: RenderEngineResourceBindings,
): SimulatorResult<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const atlases = resolveHabahiroAtlasLogicalIds(resources);
  const buttonCount = information.buttonTypesArray.length || information.buttonTypes.length || 1;
  if (!terminal) {
    return ok(Object.freeze({
      logicalAssetId: atlases.slideAmong,
      exactKey: buttonCount === 1 ? "note_slide_among" : `note_slide_among_${buttonCount}`,
    }));
  }
  const laneSuffix = resolveLaneSuffix(information, true);
  if (laneSuffix.status !== "ok") return laneSuffix;
  const flick = information.gameNoteType === GameNoteType.Flick ||
    information.gameNoteType === GameNoteType.LongEndFlick ||
    information.gameNoteType === GameNoteType.SlideEndFlickA ||
    information.gameNoteType === GameNoteType.SlideEndFlickB ||
    gameTypeIsDirectional(information.gameNoteType);
  return ok(Object.freeze({
    logicalAssetId: flick ? atlases.flick : atlases.long,
    exactKey: `${flick ? "note_flick" : "note_long"}_${laneSuffix.value}`,
  }));
}

function resolveHabahiroAtlasLogicalIds(
  resources: RenderEngineResourceBindings,
): NonNullable<RenderEngineResourceBindings["habahiroAtlasLogicalAssetIds"]> {
  const atlases = resources.habahiroAtlasLogicalAssetIds;
  if (atlases === undefined || Object.values(atlases).some((value) => !isNonEmpty(value))) {
    throw new Error("complete HABAHIRO atlas bindings were not preflighted");
  }
  return atlases;
}

function resolveHabahiroMotionLaneIndex(
  information: NoteInformation,
): SimulatorResult<number> {
  const lane = resolveLaneIndex(information.buttonType, true);
  return Number.isInteger(lane) && lane >= 0 && lane < 7
    ? ok(lane)
    : evidenceRequired(
        "render.note.habahiro-invalid-center-lane",
        ["PR04", "PR40", "HA-D04"],
        "HABAHIRO projects the chart-authored range representative through the current 0..6 viewport without clamp.",
      );
}

function resolveFrontLaneSuffix(
  information: NoteInformation,
  habahiro: boolean,
): SimulatorResult<string> {
  if (
    !habahiro &&
    (information.fireNoteType === FrontNoteType.SlideA ||
      information.fireNoteType === FrontNoteType.SlideB)
  ) {
    const lane = resolveOrdinarySlideCenterLane(information);
    return lane.status === "ok" ? ok(String(lane.value)) : lane;
  }
  return resolveLaneSuffix(information, habahiro);
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
  const lanes = buttons.map((button) => resolveLaneIndex(button, habahiro));
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

function resolveLaneIndex(button: number, habahiro: boolean): number {
  if (habahiro) {
    if (button === ButtonType.Button_00_BMS_1P_SC) return 0;
    if (button === ButtonType.Button_15_BMS_2P_SC) return 6;
    if (
      button >= ButtonType.Button_08_BMS_2P_01 &&
      button <= ButtonType.Button_14_BMS_2P_07
    ) {
      return button - ButtonType.Button_08_BMS_2P_01;
    }
  }
  return button >= ButtonType.Button_00_BMS_1P_SC && button <= ButtonType.Button_06_BMS_1P_06
    ? button
    : -1;
}

function scoreHudState(
  record: InGameRecordSnapshot,
  gauge: SinglePlayScoreGaugeSnapshot,
) {
  const scoreText = zeroFilledScoreText(record.score);
  return Object.freeze({
    ruleSetId: gauge.ruleSetId,
    totalScoringUnitCount: gauge.totalScoringUnitCount,
    score: record.score,
    scoreText,
    scoreMax: gauge.scoreMax,
    rank: gauge.currentGaugeColorRank,
    beforeRank: gauge.beforeGaugeColorRank,
    rankChanged: gauge.rankChanged,
    meterKey: gauge.meterKey,
    ratio: Object.freeze({ value: gauge.ratio, bits: gauge.ratioBits }),
    sliderValue: Object.freeze({ value: gauge.sliderValue, bits: gauge.sliderValueBits }),
    foregroundActive: gauge.foregroundActive,
    indicatorLocalX: gauge.indicatorLocalX,
    rankMarkerCLocalX: float32State(gauge.rankMarkerCLocalX),
    rankMarkerBLocalX: float32State(gauge.rankMarkerBLocalX),
    rankMarkerALocalX: float32State(gauge.rankMarkerALocalX),
    rankMarkerSLocalX: float32State(gauge.rankMarkerSLocalX),
    rankMarkerSSLocalX: float32State(gauge.rankMarkerSSLocalX),
    highRankEffect: gauge.highRankEffect,
    highRankEffectActive: gauge.highRankEffectActive,
  });
}

function zeroFilledScoreText(score: number): string {
  const digits = String(score);
  const zeroCount = Math.max(8 - Math.max(1, digits.length), 0);
  return `[BEBEBE]${"0".repeat(zeroCount)}[-][FF3B72]${digits}[-]`;
}

function lifeHudState(record: InGameRecordSnapshot) {
  const ratio = Math.fround(record.currentLife / 1000);
  const primaryFill = Math.fround(Math.min(ratio, 1));
  const secondaryFill = Math.fround(Math.max(ratio - 1, 0));
  return Object.freeze({
    currentLife: record.currentLife,
    playerMaxLife: record.playerMaxLife,
    lifeUpperLimit: record.lifeUpperLimit,
    singleGameOver: record.singleGameOver,
    primaryFill: float32State(primaryFill),
    secondaryFill: float32State(secondaryFill),
    color: primaryFill <= Math.fround(0.2) ? "danger" as const : "normal" as const,
    warning: primaryFill <= Math.fround(0.25),
    label: `${record.currentLife}/${record.playerMaxLife}`,
  });
}

function float32State(value: number): RenderFloat32 {
  const result = createRenderFloat32(value);
  if (result.status !== "ok") throw new Error("internal HUD Float32 invariant failed");
  return result.value;
}

function judgeKeyForResult(result: 0 | 1 | 2 | 3 | 4) {
  return (["judge_miss", "judge_bad", "judge_good", "judge_great", "judge_perfect"] as const)[result];
}

function timingKeyForJudgeTiming(timing: 0 | 1 | 2): "judge_fast" | "judge_slow" | null {
  return timing === 1 ? "judge_fast" : timing === 2 ? "judge_slow" : null;
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

function resolveOrdinaryMotionLaneIndex(
  information: NoteInformation,
  allowSlideRange = false,
): SimulatorResult<number> {
  if (allowSlideRange) return resolveOrdinarySlideCenterLane(information);
  const buttons = information.buttonTypesArray.length > 0
    ? information.buttonTypesArray
    : information.buttonTypes.length > 0
    ? information.buttonTypes
    : [information.buttonType];
  if (buttons.length !== 1) {
    return evidenceRequired(
      "render.note.ordinary-motion-multi-lane-unavailable",
      ["RPR-D05", "PR04", "PR10"],
      "The fixed ordinary motion profile accepts exactly one authored lane per front Note.",
    );
  }
  const lane = resolveLaneIndex(buttons[0]!, false);
  return Number.isInteger(lane) && lane >= 0 && lane < 7
    ? ok(lane)
    : evidenceRequired(
        "render.note.ordinary-motion-invalid-lane",
        ["RPR-D05", "PR05", "PR10"],
        "The fixed ordinary motion profile requires one lane in the current 0..6 playfield.",
      );
}

function resolveOrdinarySlideCenterLane(
  information: NoteInformation,
): SimulatorResult<number> {
  const buttons = information.buttonTypesArray.length > 0
    ? information.buttonTypesArray
    : information.buttonTypes.length > 0
    ? information.buttonTypes
    : [information.buttonType];
  const lanes = buttons.map((button) => resolveLaneIndex(button, false));
  const centerLane = resolveLaneIndex(information.buttonType, false);
  if (
    lanes.length < 1 ||
    lanes.length > 7 ||
    lanes.some((lane) => !Number.isInteger(lane) || lane < 0 || lane > 6) ||
    lanes.some((lane, index) => index > 0 && lane !== lanes[index - 1]! + 1) ||
    !Number.isInteger(centerLane) ||
    centerLane < lanes[0]! ||
    centerLane > lanes[lanes.length - 1]!
  ) {
    return evidenceRequired(
      "render.slide.invalid-lane-range",
      ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12"],
      "R4 Slide roots and children require one contiguous 1..7-button range and its authored center button.",
    );
  }
  return ok(centerLane);
}

function resolveAfterSpriteBinding(
  information: NoteInformation,
  resources: RenderEngineResourceBindings,
): SimulatorResult<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const lane = resolveOrdinarySlideCenterLane(information);
  if (lane.status !== "ok") return lane;
  if (afterTypeIsDirectional(information.afterNoteType)) {
    return ok(Object.freeze({
      logicalAssetId: resources.directionalAtlasLogicalAssetId,
      exactKey: `note_flick_${afterTypeIsLeft(information.afterNoteType) ? "l" : "r"}_${lane.value}`,
    }));
  }
  const flick = information.afterNoteType === AfterNoteType.Flick ||
    information.afterNoteType === AfterNoteType.SlideFlickEnd;
  return ok(Object.freeze({
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `${flick ? "note_flick" : "note_long"}_${lane.value}`,
  }));
}

function resolveSlideChildSpriteBinding(
  information: NoteInformation,
  resources: RenderEngineResourceBindings,
): SimulatorResult<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const lane = resolveOrdinarySlideCenterLane(information);
  if (lane.status !== "ok") return lane;
  if (gameTypeIsDirectional(information.gameNoteType)) {
    return ok(Object.freeze({
      logicalAssetId: resources.directionalAtlasLogicalAssetId,
      exactKey: `note_flick_${gameTypeIsLeft(information.gameNoteType) ? "l" : "r"}_${lane.value}`,
    }));
  }
  const flick = information.gameNoteType === GameNoteType.Flick ||
    information.gameNoteType === GameNoteType.LongEndFlick ||
    information.gameNoteType === GameNoteType.SlideEndFlickA ||
    information.gameNoteType === GameNoteType.SlideEndFlickB;
  return ok(Object.freeze({
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `${flick ? "note_flick" : "note_long"}_${lane.value}`,
  }));
}

function resolveOrdinaryAnimationBinding(
  information: NoteInformation,
  parentObjectId: string,
  resources: RenderEngineResourceBindings,
  allowLongFlash = true,
): OrdinaryAnimationBinding | null {
  const role = resolveNoteAnimationRole(information);
  if (role !== null) {
    const directional = role === "note-directional-flick";
    const direction = gameTypeIsDirectional(information.gameNoteType)
      ? gameTypeIsLeft(information.gameNoteType) ? "left" : "right"
      : afterTypeIsDirectional(information.afterNoteType)
      ? afterTypeIsLeft(information.afterNoteType) ? "left" : "right"
      : "up";
    return Object.freeze({
      ownerObjectId: ordinaryNoteIconRenderObjectId(parentObjectId),
      logicalAssetId: directional
        ? resources.directionalAtlasLogicalAssetId
        : resources.noteAtlasLogicalAssetId,
      exactKey: direction === "up"
        ? "note_flick_top"
        : direction === "left" ? "note_flick_top_l" : "note_flick_top_r",
      animationRole: role,
    });
  }
  if (!allowLongFlash || (
    information.fireNoteType !== FrontNoteType.Long &&
    information.fireNoteType !== FrontNoteType.SlideA &&
    information.fireNoteType !== FrontNoteType.SlideB &&
    information.gameNoteType !== GameNoteType.Long &&
    information.gameNoteType !== GameNoteType.SlideA &&
    information.gameNoteType !== GameNoteType.SlideB &&
    information.gameNoteType !== GameNoteType.SlideEndA &&
    information.gameNoteType !== GameNoteType.SlideEndB
  )) return null;
  const lane = resolveOrdinarySlideCenterLane(information);
  if (lane.status !== "ok") return null;
  return Object.freeze({
    ownerObjectId: ordinaryLongFlashRenderObjectId(parentObjectId),
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `note_long_flash_${lane.value}`,
    animationRole: "note-long-flash",
  });
}

function resolveOrdinaryAfterAnimationBinding(
  information: NoteInformation,
  parentObjectId: string,
  resources: RenderEngineResourceBindings,
): OrdinaryAnimationBinding | null {
  const role = resolveAfterAnimationRole(information.afterNoteType);
  if (role === null) return null;
  const direction = afterTypeIsDirectional(information.afterNoteType)
    ? afterTypeIsLeft(information.afterNoteType) ? "left" : "right"
    : "up";
  return Object.freeze({
    ownerObjectId: ordinaryNoteIconRenderObjectId(parentObjectId),
    logicalAssetId: role === "note-directional-flick"
      ? resources.directionalAtlasLogicalAssetId
      : resources.noteAtlasLogicalAssetId,
    exactKey: direction === "up"
      ? "note_flick_top"
      : direction === "left" ? "note_flick_top_l" : "note_flick_top_r",
    animationRole: role,
  });
}

function resolveAfterAnimationRole(
  afterNoteType: number,
): "note-flick" | "note-directional-flick" | null {
  if (afterNoteType === AfterNoteType.Flick || afterNoteType === AfterNoteType.SlideFlickEnd) {
    return "note-flick";
  }
  return afterTypeIsDirectional(afterNoteType) ? "note-directional-flick" : null;
}

function resolveNoteAnimationRole(
  information: NoteInformation,
): "note-flick" | "note-directional-flick" | null {
  if (
    information.fireNoteType === FrontNoteType.Flick ||
    information.gameNoteType === GameNoteType.Flick ||
    information.gameNoteType === GameNoteType.LongEndFlick ||
    information.gameNoteType === GameNoteType.SlideEndFlickA ||
    information.gameNoteType === GameNoteType.SlideEndFlickB
  ) return "note-flick";
  return information.fireNoteType === FrontNoteType.DirectionalFlick ||
      information.fireNoteType === FrontNoteType.MultipleDirectionalFlick ||
      information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
      information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
      information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd ||
      gameTypeIsDirectional(information.gameNoteType)
    ? "note-directional-flick"
    : null;
}

function afterTypeIsDirectional(value: number): boolean {
  return value >= AfterNoteType.DirectionalFlickLeft &&
    value <= AfterNoteType.MultipleDirectionalFlickRight ||
    value >= AfterNoteType.SlideDirectionalFlickEndLeft &&
    value <= AfterNoteType.SlideMultipleDirectionalFlickRight;
}

function afterTypeIsLeft(value: number): boolean {
  return value === AfterNoteType.DirectionalFlickLeft ||
    value === AfterNoteType.MultipleDirectionalFlickLeft ||
    value === AfterNoteType.SlideDirectionalFlickEndLeft ||
    value === AfterNoteType.SlideMultipleDirectionalFlickLeft;
}

function gameTypeIsDirectional(value: number): boolean {
  return value >= GameNoteType.DirectionalFlickLeft &&
    value <= GameNoteType.SlideBDirectionalFlickRightAdd;
}

function gameTypeIsLeft(value: number): boolean {
  return value === GameNoteType.DirectionalFlickLeft ||
    value === GameNoteType.LongDirectionalFlickLeft ||
    value === GameNoteType.SlideADirectionalFlickLeft ||
    value === GameNoteType.SlideBDirectionalFlickLeft ||
    value === GameNoteType.LongDirectionalFlickLeftAdd ||
    value === GameNoteType.SlideADirectionalFlickLeftAdd ||
    value === GameNoteType.SlideBDirectionalFlickLeftAdd;
}

function validateVector2(value: RenderVector2): boolean {
  return value !== null && typeof value === "object" &&
    validateRenderFloat32(value.x) &&
    validateRenderFloat32(value.y);
}

function validateVector3(value: RenderVector3): boolean {
  return value !== null && typeof value === "object" &&
    validateVector2(value) &&
    validateRenderFloat32(value.z);
}

function validateOrdering(value: RenderOrderingKey): boolean {
  return Number.isSafeInteger(value.domainLayer) &&
    Number.isSafeInteger(value.sourceDepthOrSortingOrder) &&
    validateRenderFloat32(value.sourceZ) &&
    Number.isSafeInteger(value.creationSequence) &&
    value.creationSequence >= 0;
}

function renderWhite(): RenderColor {
  return Object.freeze({
    red: RENDER_ONE,
    green: RENDER_ONE,
    blue: RENDER_ONE,
    alpha: RENDER_ONE,
  });
}

function validateColor(value: RenderColor): boolean {
  return value !== null && typeof value === "object" &&
    validateRenderFloat32(value.red) &&
    validateRenderFloat32(value.green) &&
    validateRenderFloat32(value.blue) &&
    validateRenderFloat32(value.alpha);
}
