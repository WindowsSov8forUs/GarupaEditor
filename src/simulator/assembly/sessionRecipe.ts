import type {
  SimulatorEngine,
  SimulatorSnapshot,
  SimulatorEngineBuildPurpose,
} from "../host/contracts";
import {
  createPortableReplaySimulatorEngine,
  type PortableReplaySimulatorEngine,
  type SimulatorTimelineControlState,
} from "../host/portableReplaySession";
import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";
import {
  appendSimulatorCleanupFailures,
  simulatorCleanupFailure,
} from "../public/failures";
import type {
  SimulatorBackgroundFidelity,
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
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import {
  copyAndFreezeGarupaChartJson,
  describeOpenGarupaProductExtension,
} from "./garupaChartContract";
import { copyAndFreezeSimulatorPresentation } from "./startupPresentationContract";

export interface SimulatorSessionRecipe {
  readonly schemaVersion: 6;
  readonly request: SimulatorModuleLaunchRequest;
}

export interface SimulatorRecipeEngineBuild {
  readonly engine: SimulatorEngine;
  readonly mode: SimulatorModeIdentity;
}

export interface SimulatorRecipeEngineBuilder {
  createFreshEngine(
    recipe: SimulatorSessionRecipe,
    purpose?: SimulatorEngineBuildPurpose,
  ): Promise<SimulatorAssemblyResult<SimulatorRecipeEngineBuild>>;
}

export function createSimulatorSessionRecipe(
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<SimulatorSessionRecipe> {
  const copied = copyLaunchRequest(request);
  if (copied.status === "rejected") return copied;
  if (copied.value.presentation.mv !== null &&
    copied.value.config.sessionMode !== "live") {
    return rejected(
      "evidence-required",
      "simulator.mv-live.unsupported-rehearsal-mode",
      "Original Practice does not select the Simple movie display; Rehearsal Manual/Auto, Retry and MoveTime MV routes are not inherited from the standard background.",
    );
  }
  return accepted(Object.freeze({ schemaVersion: 6 as const, request: copied.value }));
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
      initial = await this.builder.createFreshEngine(recipe.value, "initial");
    } catch {
      return rejected(
        "launch-failed",
        "simulator.recipe.initial-engine-builder-threw",
        "The internal recipe builder exception fails launch before engine ownership transfers and has no caller factory fallback.",
      );
    }
    if (initial.status === "rejected") return initial;
    const replay = createPortableReplaySimulatorEngine(initial.value.engine, {
      mode: initial.value.mode,
      createFreshEngine: async (purpose) => {
        const fresh = await this.builder.createFreshEngine(recipe.value, purpose);
        return fresh.status === "accepted"
          ? ok(fresh.value.engine)
          : evidenceRequired(fresh.failure.capability, [], fresh.failure.boundary);
      },
    });
    if (replay.status !== "ok") {
      initial.value.engine.dispose();
      return fromEngineFailure(replay);
    }
    return accepted(new RecipeOwnedSession(
      replay.value,
      recipe.value.request.config.sessionMode,
      recipe.value.request.presentation.mv === null
        ? "standard-current-portable"
        : "mv-live-host-supplied-portable",
    ));
  }
}

class RecipeOwnedSession implements SimulatorOwnedSession {
  private state: "running" | "closed" = "running";
  private renderingFidelity: SimulatorRenderingFidelity | null = null;

  constructor(
    private readonly engine: PortableReplaySimulatorEngine,
    private readonly sessionMode: "live" | "rehearsal",
    private readonly backgroundFidelity: SimulatorBackgroundFidelity,
  ) {}

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
    if (record?.singleGameOver === true && this.sessionMode === "live") {
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

  async moveTime(
    direction: "return-five" | "advance-five",
  ): Promise<SimulatorAssemblyResult<void>> {
    if (this.state !== "running") return closedFailure();
    if (this.sessionMode !== "rehearsal") {
      return rejected(
        "evidence-required",
        "simulator.recipe.movetime-outside-rehearsal",
        "Fixed MoveTime controls exist only in Rehearsal and never infer session identity from Manual or Auto input.",
      );
    }
    const moved = await this.engine.moveTime(direction);
    return moved.status === "ok" ? accepted(undefined) : fromEngineFailure(moved);
  }

  getControlState(): SimulatorAssemblyResult<SimulatorTimelineControlState> {
    if (this.state !== "running") return closedFailure();
    const state = this.engine.getTimelineControlState();
    return state.status === "ok" ? accepted(state.value) : fromEngineFailure(state);
  }

  async retry(): Promise<SimulatorAssemblyResult<void>> {
    if (this.state !== "running") return closedFailure();
    if (this.sessionMode !== "rehearsal") {
      return rejected(
        "evidence-required",
        "simulator.recipe.retry-outside-rehearsal",
        "The evidenced Retry owner belongs to the Rehearsal pause menu.",
      );
    }
    const retried = await this.engine.retryRehearsal();
    return retried.status === "ok" ? accepted(undefined) : fromEngineFailure(retried);
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
        capabilities: createSimulatorModuleCapabilitySummary(
          this.renderingFidelity,
          this.backgroundFidelity,
        ),
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
      capabilities: createSimulatorModuleCapabilitySummary(
        this.renderingFidelity,
        this.backgroundFidelity,
      ),
    });
  }
}

function copyLaunchRequest(
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<SimulatorModuleLaunchRequest> {
  if (
    request === null || typeof request !== "object" || Array.isArray(request) ||
    Object.keys(request).sort().join(",") !== "chartData,config,presentation" ||
    request.chartData === null || typeof request.chartData !== "object" ||
    Object.keys(request.chartData).sort().join(",") !== "bgm,chart,isFullLength,laneCount" ||
    typeof request.chartData.isFullLength !== "boolean" ||
    (request.chartData.laneCount !== 7 &&
      request.chartData.laneCount !== 9 && request.chartData.laneCount !== 11) ||
    request.config === null || typeof request.config !== "object" ||
    Object.keys(request.config).sort().join(",") !==
      "audio,highFrequencyMode,inputMode,judgeOffsetFrames,sessionMode,visual" ||
    (request.config.sessionMode !== "live" && request.config.sessionMode !== "rehearsal") ||
    (request.config.inputMode !== "manual" && request.config.inputMode !== "auto") ||
    typeof request.config.highFrequencyMode !== "boolean" ||
    !Number.isInteger(request.config.judgeOffsetFrames) ||
    request.config.judgeOffsetFrames < -5 || request.config.judgeOffsetFrames > 5 ||
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
      "The launch recipe accepts only exact chartData/presentation/config keys, one Garupa JSON object array, one explicit isFullLength boolean independent of Live/Rehearsal and Manual/Auto, confirmed presentation resources, judgement offset, evidence-bounded Float32 visual settings and finite unit gains.",
    );
  }
  const openProductExtension = describeOpenGarupaProductExtension(request.chartData.chart);
  if (openProductExtension !== null) {
    return rejected(
      "evidence-required",
      "simulator.garupa-extension.complete-product-contract-open",
      `${openProductExtension} Garupa/ExGarupa product semantics must fail before BGM/movie decode, resource acquisition, Pixi mount, scheduler creation or engine mutation until the complete product owner is installed.`,
    );
  }
  const copiedChart = copyAndFreezeGarupaChartJson(request.chartData.chart);
  if (copiedChart.status !== "ok") return fromEngineFailure(copiedChart);
  const copiedPresentation = copyAndFreezeSimulatorPresentation(request.presentation);
  if (copiedPresentation.status === "rejected") return copiedPresentation;
  const bgm = request.chartData.bgm;
  if (!(bgm instanceof Uint8Array) || bgm.byteLength === 0 ||
    Object.getPrototypeOf(bgm) !== Uint8Array.prototype) {
    return rejected(
      "evidence-required",
      "simulator.recipe.invalid-chart-bgm",
      "The immutable chart package requires one explicit non-empty owned Uint8Array BGM resource; metadata is derived only inside simulator.",
    );
  }
  return accepted(Object.freeze({
    chartData: Object.freeze({
      chart: copiedChart.value.chart,
      bgm: Uint8Array.from(bgm),
      isFullLength: request.chartData.isFullLength,
      laneCount: request.chartData.laneCount,
    }),
    presentation: copiedPresentation.value,
    config: Object.freeze({
      sessionMode: request.config.sessionMode,
      inputMode: request.config.inputMode,
      highFrequencyMode: request.config.highFrequencyMode,
      judgeOffsetFrames: request.config.judgeOffsetFrames,
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
  if (fidelity?.mode === "habahiro" && fidelity.fidelity === "current-external-complete") {
    return "habahiro-current-external-complete";
  }
  return null;
}

function clearStatusFromSnapshot(
  state: NonNullable<SimulatorSnapshot["managers"]["scoreLifeState"]>,
): 1 | 2 | 3 {
  const perfect = state.record.resultCounts[4];
  if (perfect === state.initialization.totalScoringUnitCount) return 3;
  return perfect + state.record.resultCounts[3] === state.initialization.totalScoringUnitCount ? 2 : 1;
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
