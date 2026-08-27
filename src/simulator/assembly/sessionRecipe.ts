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
  SimulatorChartFidelity,
  SimulatorModuleCloseReport,
  SimulatorModuleFailure,
  SimulatorModuleLaunchRequest,
  SimulatorRenderingFidelity,
  SimulatorSkinFidelity,
} from "../public/contracts";
import type {
  SimulatorOwnedSession,
  SimulatorOwnedSessionFactory,
  SimulatorOwnedSessionStepResult,
} from "../runtime/contracts";
import {
  rejected,
  type SimulatorAssemblyResult,
} from "./result";
import type { ManualInputFrame } from "../engine/data/manualInput";
import type { SimulatorSurfaceState } from "../platform/surfaceContracts";
import type { OriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import type { PauseControlSceneSnapshot } from "../scene/pauseControlScene";
import { integrityFailure, ok, type SimulatorResult } from "../engine/evidence";
import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { copyAndFreezeGarupaChartJson } from "./garupaChartContract";
import { copyAndFreezeSimulatorPresentation } from "./startupPresentationContract";
import { validateAndFreezeOriginalSkinSettings } from "../engine/skin/originalSkinValidation";
import { createOriginalLiveSettings } from "../engine/data/originalLiveSettings";

export interface SimulatorSessionRecipe {
  readonly schemaVersion: 13;
  readonly request: SimulatorModuleLaunchRequest;
}

export interface SimulatorRecipeEngineBuild {
  readonly engine: SimulatorEngine;
  readonly mode: SimulatorModeIdentity;
  readonly chartFidelity: SimulatorChartFidelity;
  readonly originalLiveSettingsIdentity: string;
  readonly skinRecipeIdentity: string;
  readonly skinFidelity: SimulatorSkinFidelity;
  readonly surface: SimulatorSurfaceState;
  readonly controlLayout: OriginalSurfaceLayout;
  readSurface?(): SimulatorAssemblyResult<SimulatorSurfaceState>;
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
      "integrity-failure",
      "simulator.mv-live.unsupported-rehearsal-mode",
      "Original Practice does not select the Simple movie display; Rehearsal Manual/Auto, Retry and MoveTime MV routes are not inherited from the standard background.",
    );
  }
  return accepted(Object.freeze({ schemaVersion: 13 as const, request: copied.value }));
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
    let activeSurface = initial.value.surface;
    let pendingSurfaceBuild: SimulatorRecipeEngineBuild | null = null;
    const replay = createPortableReplaySimulatorEngine(initial.value.engine, {
      mode: initial.value.mode,
      requireVisualPublication: true,
      createFreshEngine: async (purpose) => {
        const fresh = await this.builder.createFreshEngine(recipe.value, purpose);
        if (fresh.status === "rejected") {
          return integrityFailure(fresh.failure.capability, [], fresh.failure.boundary);
        }
        const identityMatches =
          fresh.value.chartFidelity === initial.value.chartFidelity &&
          fresh.value.originalLiveSettingsIdentity === initial.value.originalLiveSettingsIdentity &&
          fresh.value.skinRecipeIdentity === initial.value.skinRecipeIdentity &&
          fresh.value.skinFidelity === initial.value.skinFidelity;
        const surfaceMatches = purpose === "surface-rebuild"
          ? !sameSurface(fresh.value.surface, activeSurface)
          : sameSurface(fresh.value.surface, activeSurface);
        if (identityMatches && surfaceMatches) {
          if (purpose === "surface-rebuild") pendingSurfaceBuild = fresh.value;
          return ok(fresh.value.engine);
        }
        const disposed = fresh.value.engine.dispose();
        return integrityFailure(
          "simulator.recipe.fresh-composition-mismatch",
          [],
          "A fresh generation must retain chart/settings/Skin identity; Retry and MoveTime retain the active surface while surface-rebuild must bind the newly observed landscape surface." +
            (disposed.status === "ok" ? "" : ` Candidate cleanup also failed: ${disposed.capability}.`),
        );
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
      initial.value.chartFidelity,
      initial.value.skinFidelity,
      initial.value.surface,
      initial.value.controlLayout,
      initial.value.readSurface ?? (() => accepted(initial.value.surface)),
      () => {
        const value = pendingSurfaceBuild;
        pendingSurfaceBuild = null;
        if (value !== null) activeSurface = value.surface;
        return value;
      },
    ));
  }
}

class RecipeOwnedSession implements SimulatorOwnedSession {
  private state: "running" | "closed" = "running";
  private renderingFidelity: SimulatorRenderingFidelity | null = null;
  private closeReport: SimulatorModuleCloseReport | null = null;
  private naturalCompletionPresentationRemainingSeconds: number | null = null;

  constructor(
    private readonly engine: PortableReplaySimulatorEngine,
    private readonly sessionMode: "live" | "rehearsal",
    private readonly backgroundFidelity: SimulatorBackgroundFidelity,
    private readonly chartFidelity: SimulatorChartFidelity,
    private readonly skinFidelity: SimulatorSkinFidelity,
    private surface: SimulatorSurfaceState,
    private controlLayout: OriginalSurfaceLayout,
    private readonly readSurface: () => SimulatorAssemblyResult<SimulatorSurfaceState>,
    private readonly consumeSurfaceBuild: () => SimulatorRecipeEngineBuild | null,
  ) {}

  async synchronizeSurface() {
    if (this.state !== "running") {
      return Object.freeze({
        status: "closed" as const,
        report: this.closeReport ?? this.finish("user-closed", null),
      });
    }
    const observed = this.readSurface();
    if (observed.status === "rejected") {
      return Object.freeze({ status: "closed" as const, report: this.finish("user-closed", null) });
    }
    if (sameSurface(observed.value, this.surface)) {
      return Object.freeze({ status: "ready" as const });
    }
    const rebuilt = await this.engine.rebuildSurface();
    if (rebuilt.status !== "ok") {
      return Object.freeze({ status: "closed" as const, report: this.finish("user-closed", null) });
    }
    const build = this.consumeSurfaceBuild();
    if (build === null || !sameSurface(build.surface, observed.value)) {
      return Object.freeze({
        status: "rejected" as const,
        failure: moduleFailure(
          "integrity-failure",
          "simulator.recipe.surface-rebuild-publication-mismatch",
          "A successful atomic surface replay must publish the exact observed surface and matching control layout before the next input frame.",
        ),
      });
    }
    this.surface = build.surface;
    this.controlLayout = build.controlLayout;
    return Object.freeze({ status: "ready" as const });
  }

  step(
    deltaTimeSeconds: number,
    manualFrame: ManualInputFrame | null,
    surfaceRevision: number,
  ): SimulatorOwnedSessionStepResult {
    const available = this.available();
    if (available !== null) return available;
    const surface = this.checkSurface(surfaceRevision);
    if (surface.status === "rejected") {
      return Object.freeze({ status: "rejected" as const, failure: surface.failure });
    }
    const stepped = this.engine.step(
      deltaTimeSeconds,
      manualFrame ?? undefined,
    );
    if (stepped.status !== "ok") return rejectedStep(stepped);
    if (this.engine.getNaturalCompletionClearStatus() !== null) {
      if (this.naturalCompletionPresentationRemainingSeconds === null) {
        this.naturalCompletionPresentationRemainingSeconds = Math.fround(3.233);
        return Object.freeze({ status: "running" as const });
      }
      this.naturalCompletionPresentationRemainingSeconds = Math.fround(
        this.naturalCompletionPresentationRemainingSeconds - Math.fround(deltaTimeSeconds),
      );
      if (this.naturalCompletionPresentationRemainingSeconds <= 0) {
        const report = this.finish("completed", null);
        return Object.freeze({ status: "closed" as const, report });
      }
      return Object.freeze({ status: "running" as const });
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

  getSurfaceState(): SimulatorAssemblyResult<SimulatorSurfaceState> {
    return this.state === "running" ? accepted(this.surface) : closedFailure();
  }

  getControlLayout(): SimulatorAssemblyResult<OriginalSurfaceLayout> {
    return this.state === "running" ? accepted(this.controlLayout) : closedFailure();
  }

  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorAssemblyResult<void> {
    if (this.state !== "running") return closedFailure();
    const checked = this.checkSurface(snapshot.surfaceRevision);
    if (checked.status === "rejected") return checked;
    const published = this.engine.publishPauseControlState(snapshot);
    return published.status === "ok" ? accepted(undefined) : fromEngineFailure(published);
  }

  async moveTime(
    direction: "return-five" | "advance-five",
  ): Promise<SimulatorAssemblyResult<void>> {
    if (this.state !== "running") return closedFailure();
    const surface = this.checkSurface(this.surface.revision);
    if (surface.status === "rejected") return surface;
    if (this.sessionMode !== "rehearsal") {
      return rejected(
        "integrity-failure",
        "simulator.recipe.movetime-outside-rehearsal",
        "Fixed MoveTime controls exist only in Rehearsal and never infer session identity from Manual or Auto input.",
      );
    }
    const moved = await this.engine.moveTime(direction);
    return moved.status === "ok" ? accepted(undefined) : fromEngineFailure(moved);
  }

  getControlState(): SimulatorAssemblyResult<SimulatorTimelineControlState> {
    if (this.state !== "running") return closedFailure();
    const surface = this.checkSurface(this.surface.revision);
    if (surface.status === "rejected") return surface;
    const state = this.engine.getTimelineControlState();
    if (state.status !== "ok") return fromEngineFailure(state);
    return accepted(this.naturalCompletionPresentationRemainingSeconds === null
      ? state.value
      : Object.freeze({ ...state.value, playable: false }));
  }

  async retry(): Promise<SimulatorAssemblyResult<void>> {
    if (this.state !== "running") return closedFailure();
    const surface = this.checkSurface(this.surface.revision);
    if (surface.status === "rejected") return surface;
    const retried = await this.engine.retrySession();
    return retried.status === "ok" ? accepted(undefined) : fromEngineFailure(retried);
  }

  close(
    reason: "user-closed" | "terminal-fault",
    failure?: SimulatorModuleFailure,
  ): SimulatorModuleCloseReport {
    if (this.state === "closed" && this.closeReport !== null) return this.closeReport;
    return this.finish(reason, failure ?? null);
  }

  private apply(operation: () => SimulatorResult<void>): SimulatorAssemblyResult<void> {
    if (this.state !== "running") return closedFailure();
    const surface = this.checkSurface(this.surface.revision);
    if (surface.status === "rejected") return surface;
    const result = operation();
    return result.status === "ok" ? accepted(undefined) : fromEngineFailure(result);
  }

  private checkSurface(revision: number): SimulatorAssemblyResult<void> {
    if (revision !== this.surface.revision) {
      return rejected(
        "integrity-failure",
        "simulator.surface.input-revision-mismatch",
        "Input must carry the exact single initial surface revision; stale, future and repaired revisions are forbidden.",
      );
    }
    return accepted(undefined);
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
        "integrity-failure",
        snapshot.capability,
        snapshot.boundary,
      );
      else secondaryFailures.push(simulatorCleanupFailure(snapshot.capability, snapshot.boundary));
    }
    if (disposed.status !== "ok") {
      if (terminalFailure === null) terminalFailure = moduleFailure(
        "integrity-failure",
        disposed.capability,
        disposed.boundary,
      );
      else secondaryFailures.push(simulatorCleanupFailure(disposed.capability, disposed.boundary));
    }
    if (terminalFailure !== null) {
      terminalFailure = appendSimulatorCleanupFailures(terminalFailure, secondaryFailures);
    }
    const report = Object.freeze({
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
        this.chartFidelity,
        this.skinFidelity,
      ),
    });
    this.closeReport = report;
    return report;
  }
}

function copyLaunchRequest(
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<SimulatorModuleLaunchRequest> {
  const configRecord = request !== null && typeof request === "object" && !Array.isArray(request) &&
    request.config !== null && typeof request.config === "object" && !Array.isArray(request.config)
    ? request.config
    : null;
  const skin = configRecord === null
    ? null
    : validateAndFreezeOriginalSkinSettings(configRecord.skin);
  const originalLiveSettings = configRecord === null
    ? null
    : createOriginalLiveSettings({
        highFrequencyMode: configRecord.highFrequencyMode,
        judgementAdjustValue: configRecord.judgementAdjustValue,
        judgementAdjustValueB: configRecord.judgementAdjustValueB,
        mvDarkness: configRecord.mvDarkness,
        syncLine: configRecord.syncLine,
        noteColor: configRecord.noteColor,
        visibleTapLaneEffect: configRecord.visibleTapLaneEffect,
        allPerfectStatusDisplayMode: configRecord.allPerfectStatusDisplayMode,
      });
  if (
    request === null || typeof request !== "object" || Array.isArray(request) ||
    request.chartData === null || typeof request.chartData !== "object" || Array.isArray(request.chartData) ||
    typeof request.chartData.isFullLength !== "boolean" ||
    request.config === null || typeof request.config !== "object" || Array.isArray(request.config) ||
    (request.config.sessionMode !== "live" && request.config.sessionMode !== "rehearsal") ||
    (request.config.inputMode !== "manual" && request.config.inputMode !== "auto") ||
    originalLiveSettings === null || originalLiveSettings.status !== "ok" ||
    skin === null || skin.status !== "ok" ||
    request.config.visual === null || typeof request.config.visual !== "object" || Array.isArray(request.config.visual) ||
    !isPositiveFinite(request.config.visual.specificSpeed) ||
    !isFiniteNumber(request.config.visual.noteSize) ||
    request.config.visual.noteSize < 80 || request.config.visual.noteSize > 150 ||
    !isFiniteNumber(request.config.visual.habahiroMeshWidthSetting) ||
    request.config.audio === null || typeof request.config.audio !== "object" || Array.isArray(request.config.audio) ||
    ![request.config.audio.masterGain, request.config.audio.bgmGain, request.config.audio.seGain].every(isUnitGain)
  ) {
    return rejected(
      "integrity-failure",
      "simulator.recipe.invalid-public-request",
      "The launch recipe accepts only exact chartData/presentation/config keys, one Garupa JSON object array, one explicit isFullLength boolean independent of Live/Rehearsal and Manual/Auto, confirmed presentation resources, judgement offset, evidence-bounded Float32 visual settings and finite unit gains.",
    );
  }
  const copiedChart = copyAndFreezeGarupaChartJson(request.chartData.chart);
  if (copiedChart.status !== "ok") return fromEngineFailure(copiedChart);
  const copiedPresentation = copyAndFreezeSimulatorPresentation(request.presentation);
  if (copiedPresentation.status === "rejected") return copiedPresentation;
  const bgm = request.chartData.bgm;
  if (!(bgm instanceof Uint8Array) || bgm.byteLength === 0) {
    return rejected(
      "integrity-failure",
      "simulator.recipe.invalid-chart-bgm",
      "The immutable chart package requires one explicit non-empty owned Uint8Array BGM resource; metadata is derived only inside simulator.",
    );
  }
  return accepted(Object.freeze({
    chartData: Object.freeze({
      chart: copiedChart.value.chart,
      bgm: Uint8Array.from(bgm),
      isFullLength: request.chartData.isFullLength,
    }),
    presentation: copiedPresentation.value,
    config: Object.freeze({
      sessionMode: request.config.sessionMode,
      inputMode: request.config.inputMode,
      highFrequencyMode: originalLiveSettings.value.core.highFrequencyMode,
      judgementAdjustValue: originalLiveSettings.value.core.judgementAdjustValue,
      judgementAdjustValueB: originalLiveSettings.value.core.judgementAdjustValueB,
      mvDarkness: originalLiveSettings.value.core.mvDarkness,
      syncLine: originalLiveSettings.value.syncLine,
      noteColor: originalLiveSettings.value.noteColor,
      visibleTapLaneEffect: originalLiveSettings.value.visibleTapLaneEffect,
      allPerfectStatusDisplayMode: originalLiveSettings.value.allPerfectStatusDisplayMode,
      skin: skin.value,
      visual: Object.freeze({
        specificSpeed: Math.fround(request.config.visual.specificSpeed),
        noteSize: Math.fround(request.config.visual.noteSize),
        habahiroMeshWidthSetting: Math.fround(request.config.visual.habahiroMeshWidthSetting),
      }),
      audio: Object.freeze({
        masterGain: Math.fround(request.config.audio.masterGain),
        bgmGain: Math.fround(request.config.audio.bgmGain),
        seGain: Math.fround(request.config.audio.seGain),
      }),
    }),
  }));
}

function sameSurface(left: SimulatorSurfaceState, right: SimulatorSurfaceState): boolean {
  return left.revision === right.revision &&
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight &&
    left.origin === right.origin &&
    Object.is(left.safeArea.x, right.safeArea.x) &&
    Object.is(left.safeArea.y, right.safeArea.y) &&
    Object.is(left.safeArea.width, right.safeArea.width) &&
    Object.is(left.safeArea.height, right.safeArea.height);
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isUnitGain(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function rejectedStep(result: { readonly status: "integrity-failure"; readonly capability: string; readonly boundary: string }): SimulatorOwnedSessionStepResult {
  return Object.freeze({ status: "rejected" as const, failure: fromIntegrity(result) });
}

function fromEngineFailure<T>(
  result: Extract<SimulatorResult<T>, { status: "integrity-failure" }>,
): SimulatorAssemblyResult<T> {
  return rejected("integrity-failure", result.capability, result.boundary);
}

function fromIntegrity(result: { readonly capability: string; readonly boundary: string }): SimulatorModuleFailure {
  return moduleFailure("integrity-failure", result.capability, result.boundary);
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
