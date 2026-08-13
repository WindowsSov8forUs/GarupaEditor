import type { SimulatorEngine, SimulatorSnapshot } from "../host/contracts";
import {
  createPortableReplaySimulatorEngine,
  type PortableReplaySimulatorEngine,
  type SimulatorReplayCheckpoint,
} from "../host/portableReplaySession";
import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";
import {
  appendSimulatorCleanupFailures,
  simulatorCleanupFailure,
} from "../public/failures";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleFailure,
  SimulatorModuleLaunchRequest,
  SimulatorRenderingFidelity,
} from "../public/contracts";
import type {
  SimulatorOwnedSession,
  SimulatorOwnedSessionFactory,
  SimulatorOwnedSessionStepResult,
} from "../runtime/contracts";
import {
  rejected,
  type SimulatorAssemblyResult,
} from "../resources/sharedResourceAdapters";
import type { ManualInputFrame } from "../engine/data/manualInput";
import { isSinglePlayScoreGaugeMasterProfile } from "../engine/data/singlePlayScoreGauge";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";

export interface SimulatorSessionRecipe {
  readonly schemaVersion: 1;
  readonly request: SimulatorModuleLaunchRequest;
}

export type SimulatorRecipeEngineOutputMode =
  | "immediate"
  | "deferred-initial-seek";

export interface SimulatorRecipeEngineBuild {
  readonly engine: SimulatorEngine;
  publishInitialSeekOutputs(): SimulatorAssemblyResult<void>;
}

export interface SimulatorRecipeEngineBuilder {
  createFreshEngine(
    recipe: SimulatorSessionRecipe,
    outputMode: SimulatorRecipeEngineOutputMode,
  ): Promise<SimulatorAssemblyResult<SimulatorRecipeEngineBuild>>;
}

export function createSimulatorSessionRecipe(
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<SimulatorSessionRecipe> {
  const copied = copyLaunchRequest(request);
  if (copied.status === "rejected") return copied;
  const startMilliseconds = copied.value.config.practice.startMilliseconds;
  if (
    startMilliseconds !== 0 &&
    (!copied.value.config.practice.enabled ||
      !(startMilliseconds / 1000 < copied.value.chartData.bgm.durationSeconds))
  ) {
    return rejected(
      "evidence-required",
      "simulator.composition.initial-practice-seek-out-of-range",
      "IPS-P01 accepts a non-zero explicit millisecond target only for enabled practice and strictly inside the explicit chart BGM duration; the recipe never clamps or repairs it.",
    );
  }
  return accepted(Object.freeze({ schemaVersion: 1 as const, request: copied.value }));
}

export class RecipeOwnedSessionFactory implements SimulatorOwnedSessionFactory {
  constructor(private readonly builder: SimulatorRecipeEngineBuilder) {}

  async create(
    request: SimulatorModuleLaunchRequest,
  ): Promise<SimulatorAssemblyResult<SimulatorOwnedSession>> {
    const recipe = createSimulatorSessionRecipe(request);
    if (recipe.status === "rejected") return recipe;
    const targetMilliseconds = recipe.value.request.config.practice.startMilliseconds;
    let initial;
    try {
      initial = await this.builder.createFreshEngine(
        recipe.value,
        targetMilliseconds === 0 ? "immediate" : "deferred-initial-seek",
      );
    } catch {
      return rejected(
        "launch-failed",
        "simulator.recipe.initial-engine-builder-threw",
        "The internal recipe builder exception fails launch before engine ownership transfers and has no caller factory fallback.",
      );
    }
    if (initial.status === "rejected") return initial;
    const replay = createPortableReplaySimulatorEngine(initial.value.engine, {
      createFreshEngine: async () => {
        const fresh = await this.builder.createFreshEngine(recipe.value, "immediate");
        return fresh.status === "accepted"
          ? ok(fresh.value.engine)
          : evidenceRequired(fresh.failure.capability, [], fresh.failure.boundary);
      },
    });
    if (replay.status !== "ok") {
      initial.value.engine.dispose();
      return fromEngineFailure(replay);
    }
    if (targetMilliseconds !== 0) {
      const reconstructed = preRollInitialPracticeSeek(replay.value, targetMilliseconds);
      if (reconstructed.status !== "ok") {
        replay.value.dispose();
        return fromEngineFailure(reconstructed);
      }
      const published = initial.value.publishInitialSeekOutputs();
      if (published.status === "rejected") {
        replay.value.dispose();
        return published;
      }
    }
    return accepted(new RecipeOwnedSession(replay.value));
  }
}

class RecipeOwnedSession implements SimulatorOwnedSession {
  private checkpoint: SimulatorReplayCheckpoint | null = null;
  private state: "running" | "closed" = "running";
  private renderingFidelity: SimulatorRenderingFidelity | null = null;

  constructor(private readonly engine: PortableReplaySimulatorEngine) {}

  step(
    deltaTimeSeconds: number,
    manualFrame: ManualInputFrame | null,
  ): SimulatorOwnedSessionStepResult {
    const available = this.available();
    if (available !== null) return available;
    const stepped = this.engine.step(
      deltaTimeSeconds,
      manualFrame ?? undefined,
    );
    if (stepped.status !== "ok") return rejectedStep(stepped);
    if (this.engine.getNaturalCompletionClearStatus() !== null) {
      const report = this.finish("completed", null);
      return Object.freeze({ status: "closed" as const, report });
    }
    const snapshot = this.engine.snapshot();
    if (snapshot.status !== "ok") return rejectedStep(snapshot);
    const record = snapshot.value.managers.scoreLifeState?.record ?? null;
    if (record?.singleGameOver === true) {
      const report = this.finish("game-over", null);
      return Object.freeze({ status: "closed" as const, report });
    }
    return Object.freeze({ status: "running" as const });
  }

  pause(): SimulatorAssemblyResult<void> {
    return this.apply(() => this.engine.pause());
  }

  resume(): SimulatorAssemblyResult<void> {
    return this.apply(() => this.engine.resume());
  }

  createReplayCheckpoint(): SimulatorAssemblyResult<void> {
    if (this.state !== "running") return closedFailure();
    const checkpoint = this.engine.createReplayCheckpoint();
    if (checkpoint.status !== "ok") return fromEngineFailure(checkpoint);
    this.checkpoint = checkpoint.value;
    return accepted(undefined);
  }

  async returnTime(): Promise<SimulatorAssemblyResult<void>> {
    if (this.state !== "running") return closedFailure();
    if (this.checkpoint === null) {
      return rejected(
        "evidence-required",
        "simulator.recipe.return-time-without-checkpoint",
        "The autonomous practice controller must create one internal opaque checkpoint before ReturnTime; no synthetic five-second target is inferred.",
      );
    }
    const checkpoint = this.checkpoint;
    const returned = await this.engine.returnTime(checkpoint);
    if (returned.status !== "ok") return fromEngineFailure(returned);
    this.checkpoint = null;
    return accepted(undefined);
  }

  close(
    reason: "user-closed" | "terminal-fault",
    failure?: SimulatorModuleFailure,
  ): SimulatorModuleCloseReport {
    if (this.state === "closed") {
      return Object.freeze({
        reason: "terminal-fault" as const,
        result: null,
        failure: failure ?? moduleFailure(
          "launch-failed",
          "simulator.recipe.repeated-close",
          "A closed owned session is terminal and cannot publish another mutable result.",
        ),
        capabilities: createSimulatorModuleCapabilitySummary(this.renderingFidelity),
      });
    }
    return this.finish(reason, failure ?? null);
  }

  private apply(operation: () => SimulatorResult<void>): SimulatorAssemblyResult<void> {
    if (this.state !== "running") return closedFailure();
    const result = operation();
    return result.status === "ok" ? accepted(undefined) : fromEngineFailure(result);
  }

  private available(): SimulatorOwnedSessionStepResult | null {
    return this.state === "running"
      ? null
      : Object.freeze({
          status: "rejected" as const,
          failure: moduleFailure(
            "launch-failed",
            "simulator.recipe.step-after-close",
            "A closed autonomous engine session cannot consume another frame.",
          ),
        });
  }

  private finish(
    reason: "completed" | "game-over" | "user-closed" | "terminal-fault",
    failure: SimulatorModuleFailure | null,
  ): SimulatorModuleCloseReport {
    const snapshot = this.engine.snapshot();
    const value = snapshot.status === "ok" ? snapshot.value : null;
    const record = value?.managers.scoreLifeState?.record ?? null;
    const observedFidelity = value === null ? null : renderingFidelityFromSnapshot(value);
    if (observedFidelity !== null) this.renderingFidelity = observedFidelity;
    const clearStatus = value === null || record === null
      ? null
      : this.engine.getNaturalCompletionClearStatus() ?? clearStatusFromSnapshot(value.managers.scoreLifeState!);
    const disposed = this.engine.dispose();
    this.checkpoint = null;
    this.state = "closed";
    let terminalFailure = failure;
    const secondaryFailures = [];
    if (snapshot.status !== "ok") {
      if (terminalFailure === null) terminalFailure = moduleFailure(
        "evidence-required",
        snapshot.capability,
        snapshot.boundary,
      );
      else secondaryFailures.push(simulatorCleanupFailure(snapshot.capability, snapshot.boundary));
    }
    if (disposed.status !== "ok") {
      if (terminalFailure === null) terminalFailure = moduleFailure(
        "evidence-required",
        disposed.capability,
        disposed.boundary,
      );
      else secondaryFailures.push(simulatorCleanupFailure(disposed.capability, disposed.boundary));
    }
    if (terminalFailure !== null) {
      terminalFailure = appendSimulatorCleanupFailures(terminalFailure, secondaryFailures);
    }
    return Object.freeze({
      reason: terminalFailure === null ? reason : "terminal-fault" as const,
      result: value === null || record === null ? null : Object.freeze({
        adjustedMusicPosition: value.adjustedMusicPosition,
        score: record.score,
        life: record.currentLife,
        combo: record.currentCombo,
        clearStatus: clearStatus === null
          ? clearStatusFromSnapshot(value.managers.scoreLifeState!)
          : clearStatus,
      }),
      failure: terminalFailure,
      capabilities: createSimulatorModuleCapabilitySummary(this.renderingFidelity),
    });
  }
}

function copyLaunchRequest(
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<SimulatorModuleLaunchRequest> {
  if (
    request === null || typeof request !== "object" || Array.isArray(request) ||
    Object.keys(request).sort().join(",") !== "chartData,config" ||
    request.chartData === null || typeof request.chartData !== "object" ||
    Object.keys(request.chartData).sort().join(",") !== "bgm,bmsText,gameplay" ||
    !isGameplayShape(request.chartData.gameplay) ||
    typeof request.chartData.bmsText !== "string" || request.chartData.bmsText.length === 0 ||
    request.config === null || typeof request.config !== "object" ||
    Object.keys(request.config).sort().join(",") !==
      "audio,highFrequencyMode,judgeOffsetFrames,playMode,practice,visual" ||
    (request.config.playMode !== "manual" && request.config.playMode !== "auto-live") ||
    typeof request.config.highFrequencyMode !== "boolean" ||
    !Number.isInteger(request.config.judgeOffsetFrames) ||
    request.config.judgeOffsetFrames < -5 || request.config.judgeOffsetFrames > 5 ||
    request.config.practice === null || typeof request.config.practice !== "object" ||
    Object.keys(request.config.practice).sort().join(",") !== "enabled,startMilliseconds" ||
    typeof request.config.practice.enabled !== "boolean" ||
    !Number.isSafeInteger(request.config.practice.startMilliseconds) ||
    request.config.practice.startMilliseconds < 0 ||
    request.config.visual === null || typeof request.config.visual !== "object" ||
    Object.keys(request.config.visual).sort().join(",") !==
      "habahiroMeshWidthSetting,highAspectRatio,noteSize,specificSpeed" ||
    !isExactPositiveFloat32(request.config.visual.specificSpeed) ||
    !isExactFloat32(request.config.visual.noteSize) ||
    request.config.visual.noteSize < 80 || request.config.visual.noteSize > 150 ||
    (request.config.visual.highAspectRatio !== 0 && request.config.visual.highAspectRatio !== 1) ||
    !isExactFloat32(request.config.visual.habahiroMeshWidthSetting) ||
    request.config.audio === null || typeof request.config.audio !== "object" ||
    Object.keys(request.config.audio).sort().join(",") !==
      "bgmGain,masterGain,seGain" ||
    !Object.values(request.config.audio).every(isUnitGain)
  ) {
    return rejected(
      "evidence-required",
      "simulator.recipe.invalid-public-request",
      "The launch recipe accepts only exact chart/config/gameplay keys, explicit modes, confirmed judgement offset, non-negative practice seek, evidence-bounded Float32 visual settings and finite unit gains.",
    );
  }
  const bgm = request.chartData.bgm;
  if (bgm === null || typeof bgm !== "object" || !(bgm.bytes instanceof Uint8Array)) {
    return rejected(
      "evidence-required",
      "simulator.recipe.invalid-chart-bgm",
      "The immutable chart package requires one explicit owned BGM byte sequence.",
    );
  }
  let gameplay: typeof request.chartData.gameplay;
  try {
    gameplay = deepFreezeClone(request.chartData.gameplay) as typeof request.chartData.gameplay;
  } catch {
    return rejected(
      "evidence-required",
      "simulator.recipe.invalid-session-gameplay-data",
      "Session gameplay data must be one finite JSON-like immutable value graph without capabilities or cyclic aliases.",
    );
  }
  return accepted(Object.freeze({
    chartData: Object.freeze({
      bmsText: request.chartData.bmsText,
      bgm: Object.freeze({ ...bgm, bytes: Uint8Array.from(bgm.bytes) }),
      gameplay,
    }),
    config: Object.freeze({
      playMode: request.config.playMode,
      highFrequencyMode: request.config.highFrequencyMode,
      judgeOffsetFrames: request.config.judgeOffsetFrames,
      practice: Object.freeze({ ...request.config.practice }),
      visual: Object.freeze({ ...request.config.visual }),
      audio: Object.freeze({ ...request.config.audio }),
    }),
  }));
}

const INITIAL_SEEK_MAX_DELTA_SECONDS = Math.fround(0.01666666753590107);

export function preRollInitialPracticeSeek(
  engine: SimulatorEngine,
  targetMilliseconds: number,
): SimulatorResult<void> {
  if (!Number.isSafeInteger(targetMilliseconds) || targetMilliseconds <= 0) {
    return evidenceRequired(
      "simulator.recipe.invalid-initial-seek-target",
      ["IPS-P01", "IPS-P02"],
      "The non-zero pre-roll owner accepts one positive safe-integer millisecond target already validated strictly inside the explicit BGM duration.",
    );
  }
  const targetSeconds = Math.fround(targetMilliseconds / 1000);
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
    return evidenceRequired(
      "simulator.recipe.initial-seek-target-float32-overflow",
      ["IPS-P01", "IPS-P02"],
      "The explicit millisecond target must have one finite positive Float32 seconds representation; no alternate precision route is available.",
    );
  }
  let currentSeconds = Math.fround(0);
  while (currentSeconds < targetSeconds) {
    const remaining = Math.fround(targetSeconds - currentSeconds);
    const deltaTimeSeconds = Math.fround(Math.min(
      remaining,
      INITIAL_SEEK_MAX_DELTA_SECONDS,
    ));
    if (!(deltaTimeSeconds > 0) || deltaTimeSeconds > INITIAL_SEEK_MAX_DELTA_SECONDS) {
      return evidenceRequired(
        "simulator.recipe.initial-seek-cadence-did-not-converge",
        ["IPS-F02", "IPS-P02"],
        "Initial practice reconstruction must converge through positive Float32 deltas no larger than 0x3C888889 and never jumps or clamps the clock.",
      );
    }
    const stepped = engine.step(deltaTimeSeconds);
    if (stepped.status !== "ok") return stepped;
    const nextSeconds = Math.fround(currentSeconds + deltaTimeSeconds);
    if (!(nextSeconds > currentSeconds)) {
      return evidenceRequired(
        "simulator.recipe.initial-seek-float32-progress-stalled",
        ["IPS-F02", "IPS-P02"],
        "Every bounded pre-roll step must advance the Float32 reconstruction cursor; stalled precision is not repaired with a direct clock mutation.",
      );
    }
    currentSeconds = nextSeconds;
  }
  return Object.is(currentSeconds, targetSeconds)
    ? ok(undefined)
    : evidenceRequired(
        "simulator.recipe.initial-seek-final-remainder-mismatch",
        ["IPS-P02"],
        "The exact final Float32 remainder must land on the requested target representation without overshoot or clamp.",
      );
}

function renderingFidelityFromSnapshot(
  snapshot: SimulatorSnapshot,
): SimulatorRenderingFidelity | null {
  const fidelity = snapshot.renderingBackend?.fidelity;
  if (fidelity?.mode === "ordinary") return "ordinary-current-portable";
  if (fidelity?.mode === "habahiro" && fidelity.fidelity === "current-external-complete") {
    return "habahiro-current-external-complete";
  }
  return null;
}

function clearStatusFromSnapshot(
  state: NonNullable<SimulatorSnapshot["managers"]["scoreLifeState"]>,
): 1 | 2 | 3 {
  const perfect = state.record.resultCounts[4];
  if (perfect === state.initialization.maxNoteCount) return 3;
  return perfect + state.record.resultCounts[3] === state.initialization.maxNoteCount ? 2 : 1;
}

function isGameplayShape(value: unknown): value is SimulatorModuleLaunchRequest["chartData"]["gameplay"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const gameplay = value as Record<string, unknown>;
  if (Object.keys(gameplay).sort().join(",") !== "life,score") return false;
  const score = gameplay.score;
  const life = gameplay.life;
  return score !== null && typeof score === "object" && !Array.isArray(score) &&
    Object.keys(score).sort().join(",") === "autoLiveComboCoefficient,level,master,totalParameter" &&
    typeof (score as Record<string, unknown>).level === "number" &&
    Number.isFinite((score as Record<string, number>).level) &&
    typeof (score as Record<string, unknown>).totalParameter === "number" &&
    Number.isFinite((score as Record<string, number>).totalParameter) &&
    typeof (score as Record<string, unknown>).autoLiveComboCoefficient === "number" &&
    Number.isFinite((score as Record<string, number>).autoLiveComboCoefficient) &&
    isScoreGaugeMasterShape((score as Record<string, unknown>).master) &&
    life !== null && typeof life === "object" && !Array.isArray(life) &&
    Object.keys(life).sort().join(",") ===
      "badDamage,initialLife,lifeUpperLimit,missDamage,playerMaxLife" &&
    Object.values(life).every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isScoreGaugeMasterShape(value: unknown): boolean {
  return isSinglePlayScoreGaugeMasterProfile(value);
}

function deepFreezeClone(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite");
    return value;
  }
  if (typeof value !== "object" || seen.has(value)) throw new Error("invalid graph");
  seen.add(value);
  if (Array.isArray(value)) {
    const output = Object.freeze(value.map((entry) => deepFreezeClone(entry, seen)));
    seen.delete(value);
    return output;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("invalid prototype");
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) output[key] = deepFreezeClone(entry, seen);
  seen.delete(value);
  return Object.freeze(output);
}

function isExactFloat32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Object.is(value, Math.fround(value));
}

function isExactPositiveFloat32(value: unknown): value is number {
  return isExactFloat32(value) && value > 0;
}

function isUnitGain(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function rejectedStep(result: { readonly status: "evidence-required"; readonly capability: string; readonly boundary: string }): SimulatorOwnedSessionStepResult {
  return Object.freeze({ status: "rejected" as const, failure: fromEvidence(result) });
}

function fromEngineFailure<T>(
  result: Extract<SimulatorResult<T>, { status: "evidence-required" }>,
): SimulatorAssemblyResult<T> {
  return rejected("evidence-required", result.capability, result.boundary);
}

function fromEvidence(result: { readonly capability: string; readonly boundary: string }): SimulatorModuleFailure {
  return moduleFailure("evidence-required", result.capability, result.boundary);
}

function closedFailure<T>(): SimulatorAssemblyResult<T> {
  return rejected(
    "launch-failed",
    "simulator.recipe.session-closed",
    "The internally owned whole-engine session is terminal after close.",
  );
}

function moduleFailure(
  code: SimulatorModuleFailure["code"],
  capability: string,
  boundary: string,
): SimulatorModuleFailure {
  return Object.freeze({ code, capability, boundary });
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
