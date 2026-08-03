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
import { SkillActivateEffectType } from "../data/scoreLifeState";
import type { InGameRecordSnapshot } from "../managers/inGameRecord";
import type { ScoreLifeReflectPlan } from "../managers/scoreLifeStateManager";
import type { SituationSkillSnapshot } from "../managers/situationSkillManager";
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
  readonly comboAnimationLogicalAssetId?: string;
  readonly scoreSkillAnimationLogicalAssetId?: string;
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

export interface OrdinaryFixedNoteSceneInput {
  readonly specificSpeed: RenderFloat32;
  readonly noteSettingScale: RenderFloat32;
  readonly launcherY: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly highAspectRatio: RenderFloat32;
  readonly noteStartPositions: readonly RenderVector3[];
  readonly goalPositions: readonly RenderVector3[];
  readonly noteColor: RenderColor;
  readonly noteDomainLayer: number;
  readonly syncLineEdgeMargin?: RenderFloat32;
  readonly screenToSafeAreaRatio?: RenderFloat32;
  readonly longMeshColor?: RenderColor;
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

const DEGRADED_HABAHIRO_LANE_OBJECT = "render:habahiro:lane-change";

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
  private readonly creationSequenceByObjectId = new Map<string, number>();
  private readonly hudAnimationElapsedSeconds = new Map<"combo" | "life-heal", number>();
  private resultElapsedSeconds: number | null = null;
  private scoreSkillAnimationActive = false;

  constructor(
    readonly sessionId: string,
    private readonly renderer: SimulatorRendererBackend,
    private readonly resources: RenderEngineResourceBindings,
  ) {}

  isDegradedHabahiro(): boolean {
    const fidelity = this.renderer.snapshot().fidelity;
    return fidelity?.mode === "habahiro" && fidelity.fidelity === "degraded";
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
      (this.resources.scoreSkillAnimationLogicalAssetId !== undefined &&
        !isNonEmpty(this.resources.scoreSkillAnimationLogicalAssetId))
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
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.addScore });
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
    commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: HUD_OBJECTS.score });
    create(HUD_OBJECTS.life, "hud-life");
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.life,
      hudRole: "life",
      state: lifeHudState(record),
    });
    commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: HUD_OBJECTS.life });
    create(HUD_OBJECTS.overlay, "hud-overlay");
    commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.overlay });
    return this.preflight(commands, () => this.recordCreatedObjects(created));
  }

  preflightHudReflect(
    plan: ScoreLifeReflectPlan,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    if (
      !Number.isInteger(plan.reflect.representativeScoreUpType) ||
      plan.reflect.representativeScoreUpType < 0 ||
      plan.reflect.representativeScoreUpType > 5
    ) {
      return evidenceRequired(
        "render.hud.invalid-score-up-type",
        ["RPR-D10", "RPR-D13", "PR28"],
        "Result.changeSprite consumes only the current ScoreUpType enum range 0 through 5.",
      );
    }
    if (plan.reflect.representativeScoreUpType === 5) {
      return evidenceRequired(
        "render.hud.crescendo-changeable-text-evidence-required",
        ["RPR-R6-005", "RPR-D10", "RPR-D12", "PR28"],
        "R6 did not observe SkillEffectChangeableTextObject.Play, so Crescendo decimal text remains closed before HUD mutation.",
      );
    }
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
      kind: plan.reflect.totalOrdinaryScore + plan.reflect.totalFreeLiveEventBonusScore === 0
        ? "hide-object"
        : "activate-object",
      renderObjectId: HUD_OBJECTS.addScore,
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
    if (
      plan.record.currentCombo > 0 &&
      this.resources.comboAnimationLogicalAssetId !== undefined
    ) {
      commands.push({
        ...base(commands.length),
        kind: "play-animation",
        renderObjectId: HUD_OBJECTS.combo,
        animationRole: "combo",
        restart: true,
      });
    } else if (
      plan.record.currentCombo === 0 &&
      this.hudAnimationElapsedSeconds.has("combo")
    ) {
      commands.push({
        ...base(commands.length),
        kind: "stop-animation",
        renderObjectId: HUD_OBJECTS.combo,
        animationRole: "combo",
        restart: false,
      });
    }
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
        scoreUpType: plan.reflect.representativeScoreUpType,
      }),
    });
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.score,
      hudRole: "score",
      state: Object.freeze({ score: plan.record.score }),
    });
    if (plan.lifeHealAnimation) {
      commands.push({
        ...base(commands.length),
        kind: "play-animation",
        renderObjectId: HUD_OBJECTS.life,
        animationRole: "life-heal",
        restart: true,
      });
    }
    commands.push({
      ...base(commands.length),
      kind: "set-hud",
      renderObjectId: HUD_OBJECTS.life,
      hudRole: "life",
      state: lifeHudState(plan.record),
    });
    return this.preflight(commands, () => {
      if (
        plan.record.currentCombo > 0 &&
        this.resources.comboAnimationLogicalAssetId !== undefined
      ) {
        this.hudAnimationElapsedSeconds.set("combo", 0);
      } else if (plan.record.currentCombo === 0) {
        this.hudAnimationElapsedSeconds.delete("combo");
      }
      if (plan.lifeHealAnimation) {
        this.hudAnimationElapsedSeconds.set("life-heal", 0);
      }
      this.resultElapsedSeconds = 0;
    });
  }

  preflightHudSkillTransition(
    before: SituationSkillSnapshot,
    after: SituationSkillSnapshot,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const started = before.state !== 2 && after.state === 2;
    const finished = before.state === 2 && after.state !== 2;
    if (!started && !finished) return ok(new RenderOwnerTransaction(this.renderer, null));
    const scoreTypes = new Set<number>([
      SkillActivateEffectType.Score,
      SkillActivateEffectType.ScoreOverLife,
      SkillActivateEffectType.ScoreUnderLife,
      SkillActivateEffectType.ScoreContinuedNoteJudge,
      SkillActivateEffectType.ScoreRateUpWithPerfect,
      SkillActivateEffectType.ScoreOnlyPerfect,
      SkillActivateEffectType.ScoreUnderGreatHalf,
    ]);
    const scoreSkill = started && after.activeEffectTypes.some((type) => scoreTypes.has(type));
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    if (started) {
      commands.push({
        ...base(commands.length),
        kind: "set-hud",
        renderObjectId: HUD_OBJECTS.overlay,
        hudRole: "overlay",
        state: Object.freeze({
          skillActive: true,
          scoreSkill,
          scoreGaugeActive: scoreSkill,
          currentSkillNoteIndex: after.currentSkillNoteIndex,
        }),
      });
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: HUD_OBJECTS.overlay });
      if (scoreSkill && this.resources.scoreSkillAnimationLogicalAssetId !== undefined) {
        commands.push({
          ...base(commands.length),
          kind: "play-animation",
          renderObjectId: HUD_OBJECTS.overlay,
          animationRole: "score-skill",
          restart: true,
        });
      }
    } else {
      if (this.scoreSkillAnimationActive) {
        commands.push({
          ...base(commands.length),
          kind: "stop-animation",
          renderObjectId: HUD_OBJECTS.overlay,
          animationRole: "score-skill",
          restart: false,
        });
      }
      commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.overlay });
    }
    return this.preflight(commands, () => {
      this.scoreSkillAnimationActive = started && scoreSkill &&
        this.resources.scoreSkillAnimationLogicalAssetId !== undefined;
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
      (this.hudAnimationElapsedSeconds.size === 0 && this.resultElapsedSeconds === null) ||
      deltaTimeSeconds === 0
    ) {
      return ok(new RenderOwnerTransaction(this.renderer, null));
    }
    const next = new Map<"combo" | "life-heal", number>();
    let nextResultElapsed = this.resultElapsedSeconds;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
    for (const [role, elapsed] of this.hudAnimationElapsedSeconds) {
      const nextElapsed = Math.fround(elapsed + deltaTimeSeconds);
      const renderObjectId = role === "combo" ? HUD_OBJECTS.combo : HUD_OBJECTS.life;
      if (nextElapsed >= 1) {
        commands.push({
          ...base(commands.length),
          kind: "stop-animation",
          renderObjectId,
          animationRole: role,
          restart: false,
        });
        if (role === "combo") {
          commands.push({
            ...base(commands.length),
            kind: "hide-object",
            renderObjectId,
          });
        }
      } else {
        const sample = createRenderFloat32(nextElapsed);
        if (sample.status !== "ok") return sample;
        commands.push({
          ...base(commands.length),
          kind: "sample-animation",
          renderObjectId,
          animationRole: role,
          elapsedSeconds: sample.value,
        });
        next.set(role, nextElapsed);
      }
    }
    if (this.resultElapsedSeconds !== null) {
      nextResultElapsed = Math.fround(this.resultElapsedSeconds + deltaTimeSeconds);
      if (nextResultElapsed >= 1) {
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: HUD_OBJECTS.result });
        nextResultElapsed = null;
      }
    }
    return this.preflight(commands, () => {
      this.hudAnimationElapsedSeconds.clear();
      for (const [role, elapsed] of next) {
        this.hudAnimationElapsedSeconds.set(role, elapsed);
      }
      this.resultElapsedSeconds = nextResultElapsed;
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
      !this.isDegradedHabahiro() &&
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
        role: "note-root",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId,
      });
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
          commands.push({
            ...base(commands.length),
            kind: "create-object",
            renderObjectId: meshObjectId,
            poolFamily: pool.family,
            role: "note-mesh",
            parentObjectId: null,
          });
          commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId: meshObjectId });
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
        ...base(commands.length),
        kind: "create-object",
        renderObjectId: HUD_OBJECTS.fidelity,
        poolFamily: "fidelity-label",
        role: "fidelity-label",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "set-hud",
        renderObjectId: HUD_OBJECTS.fidelity,
        hudRole: "fidelity-label",
        state: Object.freeze({
          label: "Approximate HABAHIRO",
          visible: true,
        }),
      });
      commands.push({
        ...base(commands.length),
        kind: "activate-object",
        renderObjectId: HUD_OBJECTS.fidelity,
      });
      commands.push({
        ...base(commands.length),
        kind: "create-object",
        renderObjectId: DEGRADED_HABAHIRO_LANE_OBJECT,
        poolFamily: "degraded-habahiro-lane-change",
        role: "fidelity-label",
        parentObjectId: null,
      });
      commands.push({
        ...base(commands.length),
        kind: "hide-object",
        renderObjectId: DEGRADED_HABAHIRO_LANE_OBJECT,
      });
    }
    return this.preflight(commands, () => this.recordCreatedObjects(created));
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
        "Only an explicitly selected degraded HABAHIRO session with its committed diagnostic owner may emit lane-change commands.",
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
        label: "Approximate HABAHIRO",
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

  preflightOrdinaryNoteActivation(
    poolObjectId: string,
    information: NoteInformation,
    noteBpm: RenderFloat32,
    launcherMusicPosition: RenderFloat32,
    scene: OrdinaryFixedNoteSceneInput,
    substep: number,
  ): SimulatorResult<PreparedOrdinaryNoteActivation> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const sceneValidation = validateOrdinaryFixedNoteSceneInput(scene);
    if (sceneValidation.status !== "ok") return sceneValidation;
    if (!Number.isSafeInteger(substep) || substep < 0) {
      return evidenceRequired(
        "render.producer.invalid-substep",
        ["RPR-D13", "PR33", "PR39"],
        "Note activation commands require the engine-owned non-negative adaptive substep.",
      );
    }
    const degradedHabahiro = this.isDegradedHabahiro();
    const longNormalTail = !degradedHabahiro &&
      information.fireNoteType === FrontNoteType.Long &&
      information.afterNoteType === AfterNoteType.Normal &&
      information.afterNoteAbsolutePos > information.absolutePos;
    const r4Front = information.fireNoteType === FrontNoteType.Flick ||
      information.fireNoteType === FrontNoteType.DirectionalFlick ||
      information.fireNoteType === FrontNoteType.MultipleDirectionalFlick;
    const r4Slide = !degradedHabahiro &&
      (information.fireNoteType === FrontNoteType.SlideA ||
      information.fireNoteType === FrontNoteType.SlideB) &&
      information.afterNoteType === AfterNoteType.None &&
      information.slideNoteList.length > 0;
    if (
      !degradedHabahiro &&
      information.fireNoteType !== FrontNoteType.Normal &&
      !longNormalTail &&
      !r4Front &&
      !r4Slide
    ) {
      return evidenceRequired(
        "render.note.ordinary-child-lifecycle-unimplemented",
        ["RPR-D04", "RPR-D05", "RPR-D06", "RPR-D07", "RPR-R4-010", "PR06", "PR09", "PR10"],
        "The connected subset is ordinary Normal, Long+Normal tail, R4 front Flick/Directional, observed MultipleDirectional root, or ordinary SlideEnd child chain; unobserved terminal variants remain fail-closed.",
      );
    }
    if (
      (longNormalTail || r4Slide) &&
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
    const lane = degradedHabahiro
      ? resolveDegradedHabahiroMotionLaneIndex(information)
      : resolveOrdinaryMotionLaneIndex(information, r4Slide);
    if (lane.status !== "ok") return lane;
    const binding = degradedHabahiro
      ? resolveDegradedHabahiroFrontSpriteBinding(information, this.resources)
      : resolveFrontSpriteBinding(information, false, this.resources);
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
      virtualLaneControllerPresent: degradedHabahiro
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
      color: scene.noteColor,
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
    for (const motion of adjustment.value.motions) {
      commands.push({
        ...base(commands.length),
        kind: "set-transform",
        renderObjectId,
        position: motion.position,
        scale: Object.freeze({ x: motion.localScale.x, y: motion.localScale.y }),
        rotationDegrees: zero.value,
        color: scene.noteColor,
        ordering,
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
    if (longNormalTail) {
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
      const widthRate = createRenderFloat32(Math.fround(1));
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
      });
      if (mesh.status !== "ok") return mesh;
      commands.push({
        ...base(commands.length),
        kind: "set-transform",
        renderObjectId: afterObjectId,
        position: longChildState.renderedTransform.position,
        scale: Object.freeze({ x: one.value, y: one.value }),
        rotationDegrees: zero.value,
        color: scene.noteColor,
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
      commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: meshObjectId });
      commands.push({
        ...base(commands.length),
        kind: "bind-resource",
        renderObjectId: afterObjectId,
        binding: "sprite",
        logicalAssetId: binding.value.logicalAssetId,
        exactKey: binding.value.exactKey,
      });
    }
    if (r4Slide) {
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
        const childLane = resolveOrdinaryMotionLaneIndex(source, true);
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
          color: scene.noteColor,
          ordering: Object.freeze({
            domainLayer: scene.noteDomainLayer,
            sourceDepthOrSortingOrder: 70,
            sourceZ: childTransform.position.z,
            creationSequence: childCreationSequence,
          }),
          maskObjectId: null,
        });
        if (created.value.visible) {
          const childKey = resolveOrdinarySlideChildSpriteKey(source);
          if (childKey.status !== "ok") return childKey;
          commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: childObjectId });
          commands.push({
            ...base(commands.length),
            kind: "bind-resource",
            renderObjectId: childObjectId,
            binding: "sprite",
            logicalAssetId: this.resources.noteAtlasLogicalAssetId,
            exactKey: childKey.value,
          });
        }
        const mesh = buildOrdinaryLongNormalMesh({
          front: previousTransform,
          after: childTransform,
          frontButtonCount: previousButtonCount,
          afterButtonCount: childButtonCount,
          screenToSafeAreaRatio: scene.screenToSafeAreaRatio!,
          widthRate: one.value,
          color: scene.longMeshColor!,
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
        commands.push({ ...base(commands.length), kind: "activate-object", renderObjectId: meshObjectId });
        previousTransform = childTransform;
        previousButtonCount = childButtonCount;
      }
      slideChildStates = Object.freeze(states);
    }
    const transaction = this.preflight(commands);
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
    const widthRate = createRenderFloat32(Math.fround(1));
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
      color: scene.noteColor,
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
    const transaction = this.preflight(commands);
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
    );
    if (advanced.status !== "ok") return advanced;
    const zero = createRenderFloat32(Math.fround(0));
    if (zero.status !== "ok") return zero;
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [];
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
          color: scene.noteColor,
          ordering: Object.freeze({
            domainLayer: scene.noteDomainLayer,
            sourceDepthOrSortingOrder: 70,
            sourceZ: state.lifecycle.renderedTransform.position.z,
            creationSequence: childCreationSequence,
          }),
          maskObjectId: null,
        });
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
    const transaction = this.preflight(commands);
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
      color: scene.noteColor,
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
    syncLinePoolIndices: readonly number[] = [],
    deactivateLongChildren = false,
    multipleDirectionalLinePoolIndices: readonly number[] = [],
    deactivateSlideChildCount = 0,
  ): SimulatorResult<RenderOwnerTransaction> {
    const validation = this.validate();
    if (validation.status !== "ok") return validation;
    const renderObjectId = rootRenderObjectId(poolObjectId);
    const base = this.commandBase(this.substep);
    const commands: RenderCommand[] = [
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
    ];
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
      for (const renderObjectId of [
        longAfterRenderObjectId(poolObjectId),
        longMeshRenderObjectId(poolObjectId),
      ]) {
        commands.push({ ...base(commands.length), kind: "hide-object", renderObjectId });
        commands.push({ ...base(commands.length), kind: "deactivate-object", renderObjectId });
      }
    }
    for (let index = 0; index < deactivateSlideChildCount; index += 1) {
      for (const childObjectId of [
        slideChildRenderObjectId(poolObjectId, index),
        slideMeshRenderObjectId(poolObjectId, index),
      ]) {
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
    return this.preflight(commands);
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
      this.resultElapsedSeconds = null;
      this.scoreSkillAnimationActive = false;
    });
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
    !validateColor(scene.noteColor) ||
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

export function rootRenderObjectId(poolObjectId: string): string {
  return `render:${poolObjectId}:root`;
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
): SimulatorResult<{
  readonly logicalAssetId: string;
  readonly exactKey: string;
}> {
  const laneSuffix = resolveFrontLaneSuffix(information, habahiro);
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

function resolveDegradedHabahiroFrontSpriteBinding(
  information: NoteInformation,
  resources: RenderEngineResourceBindings,
): SimulatorResult<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const laneSuffix = resolveLaneSuffix(information, true);
  if (laneSuffix.status !== "ok") return laneSuffix;
  let family: "note_normal" | "note_normal_16" | "note_skill" | "note_long" | "note_flick";
  if (information.gameNoteAdditionalType === GameNoteAdditionalType.Skill) {
    family = "note_skill";
  } else if (information.fireNoteType === FrontNoteType.Normal) {
    family = information.shortRhythmUnder8beat ? "note_normal_16" : "note_normal";
  } else if (
    information.fireNoteType === FrontNoteType.Flick ||
    information.fireNoteType === FrontNoteType.DirectionalFlick ||
    information.fireNoteType === FrontNoteType.MultipleDirectionalFlick
  ) {
    family = "note_flick";
  } else {
    family = "note_long";
  }
  return ok(Object.freeze({
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `${family}_${laneSuffix.value}`,
  }));
}

function resolveDegradedHabahiroMotionLaneIndex(
  information: NoteInformation,
): SimulatorResult<number> {
  const lane = resolveLaneIndex(information.buttonType, true);
  return Number.isInteger(lane) && lane >= 0 && lane < 7
    ? ok(lane)
    : evidenceRequired(
        "render.note.degraded-habahiro-invalid-center-lane",
        ["PR04", "PR40", "HA-D04"],
        "The explicit degraded proxy projects the chart-authored center button through the ordinary 0..6 viewport without clamp.",
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

function lifeHudState(
  record: InGameRecordSnapshot,
): Readonly<Record<string, string | number | boolean | null>> {
  const ratio = Math.fround(record.currentLife / 1000);
  return Object.freeze({
    currentLife: record.currentLife,
    playerMaxLife: record.playerMaxLife,
    lifeUpperLimit: record.lifeUpperLimit,
    singleGameOver: record.singleGameOver,
    primaryFill: Math.fround(Math.min(ratio, 1)),
    secondaryFill: Math.fround(Math.max(ratio - 1, 0)),
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

function resolveOrdinarySlideChildSpriteKey(
  information: NoteInformation,
): SimulatorResult<string> {
  const lane = resolveOrdinarySlideCenterLane(information);
  return lane.status === "ok"
    ? ok(`note_long_${lane.value}`)
    : lane;
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
