import type { SimulatorEngine, SimulatorSnapshot } from "../host/contracts";
import {
  createPortableReplaySimulatorEngine,
  type PortableReplaySimulatorEngine,
  type SimulatorReplayCheckpoint,
} from "../host/portableReplaySession";
import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";
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

export interface SimulatorRecipeEngineBuilder {
  createFreshEngine(
    recipe: SimulatorSessionRecipe,
  ): Promise<SimulatorAssemblyResult<SimulatorEngine>>;
}

export function createSimulatorSessionRecipe(
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<SimulatorSessionRecipe> {
  const copied = copyLaunchRequest(request);
  return copied.status === "rejected"
    ? copied
    : accepted(Object.freeze({ schemaVersion: 1 as const, request: copied.value }));
}

export class RecipeOwnedSessionFactory implements SimulatorOwnedSessionFactory {
  constructor(private readonly builder: SimulatorRecipeEngineBuilder) {}

  async create(
    request: SimulatorModuleLaunchRequest,
  ): Promise<SimulatorAssemblyResult<SimulatorOwnedSession>> {
    const recipe = createSimulatorSessionRecipe(request);
    if (recipe.status === "rejected") return recipe;
    let initial;
    try {
      initial = await this.builder.createFreshEngine(recipe.value);
    } catch {
      return rejected(
        "launch-failed",
        "simulator.recipe.initial-engine-builder-threw",
        "The internal recipe builder exception fails launch before engine ownership transfers and has no caller factory fallback.",
      );
    }
    if (initial.status === "rejected") return initial;
    const replay = createPortableReplaySimulatorEngine(initial.value, {
      createFreshEngine: async () => {
        const fresh = await this.builder.createFreshEngine(recipe.value);
        return fresh.status === "accepted"
          ? ok(fresh.value)
          : evidenceRequired(fresh.failure.capability, [], fresh.failure.boundary);
      },
    });
    if (replay.status !== "ok") {
      initial.value.dispose();
      return fromEngineFailure(replay);
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
    const terminalFailure = failure ?? (snapshot.status !== "ok"
      ? fromEvidence(snapshot)
      : disposed.status !== "ok"
      ? fromEvidence(disposed)
      : null);
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
      "audio,habahiroPreview,highFrequencyMode,judgeOffsetFrames,playMode,practice,visual" ||
    (request.config.playMode !== "manual" && request.config.playMode !== "auto-live") ||
    typeof request.config.highFrequencyMode !== "boolean" ||
    !Number.isInteger(request.config.judgeOffsetFrames) ||
    request.config.judgeOffsetFrames < -5 || request.config.judgeOffsetFrames > 5 ||
    request.config.practice === null || typeof request.config.practice !== "object" ||
    Object.keys(request.config.practice).sort().join(",") !== "enabled,startMilliseconds" ||
    typeof request.config.practice.enabled !== "boolean" ||
    !Number.isSafeInteger(request.config.practice.startMilliseconds) ||
    request.config.practice.startMilliseconds < 0 ||
    request.config.habahiroPreview === null || typeof request.config.habahiroPreview !== "object" ||
    Object.keys(request.config.habahiroPreview).join(",") !== "allowExternalDegraded" ||
    typeof request.config.habahiroPreview.allowExternalDegraded !== "boolean" ||
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
      habahiroPreview: Object.freeze({ ...request.config.habahiroPreview }),
      visual: Object.freeze({ ...request.config.visual }),
      audio: Object.freeze({ ...request.config.audio }),
    }),
  }));
}

function renderingFidelityFromSnapshot(
  snapshot: SimulatorSnapshot,
): SimulatorRenderingFidelity | null {
  const fidelity = snapshot.renderingBackend?.fidelity;
  if (fidelity?.mode === "ordinary") return "ordinary-current-portable";
  if (fidelity?.mode === "habahiro" && fidelity.fidelity === "habahiro-external-degraded-preview") {
    return "habahiro-external-degraded-preview";
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
