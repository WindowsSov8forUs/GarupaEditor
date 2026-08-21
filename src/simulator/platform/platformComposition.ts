import type { Container } from "pixi.js";
import { BrowserAudioResourcePreflightAdapter } from "../backends/audio/browserAudioResourcePreflightAdapter";
import { WebAudioSimulatorBackend } from "../backends/audio/webAudioBackend";
import { BrowserMovieResourcePreflightAdapter } from "../backends/movie/browserMovieResourcePreflightAdapter";
import { audioFloat32ToBits } from "../backends/audioValidation";
import type {
  SimulatorBackends,
  SimulatorLifecycleBackendState,
} from "../backends/contracts";
import { DeterministicSimulatorParticleBackend } from "../backends/particles/deterministicParticleBackend";
import { BrowserPixiParticleTextureDecoder } from "../backends/pixi/browserPixiParticleTextureDecoder";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import {
  createPixiCombinedScene,
  type PixiCombinedScene,
} from "../backends/pixi/pixiCombinedScene";
import { PixiParticleRendererBackend } from "../backends/pixi/pixiParticleRendererBackend";
import { PixiMvLiveBackend } from "../backends/pixi/pixiMvLiveBackend";
import {
  PixiRendererBackend,
  type PixiRehearsalControlOverlay,
} from "../backends/pixi/pixiRendererBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { PortableParticleResourcePreflightAdapter } from "../backends/resources/localParticleResourceProvider";
import { PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import { createCurrentSinglePlayLifeProfile } from "../engine/data/currentSinglePlayLifeProfile";
import type { ScoreLifeStateProfile } from "../engine/data/scoreLifeState";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import {
  createOriginalLiveSettings,
  originalLiveSettingsIdentity,
} from "../engine/data/originalLiveSettings";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import type { ManualInputFrame, ManualInputPosition } from "../engine/data/manualInput";
import type { SimulatorEngine, SimulatorSnapshot } from "../host/contracts";
import {
  createSimulatorEngine,
  registerSimulatorEngineMoveTimeWrapper,
} from "../host/createSimulatorEngine";
import {
  isTotalRevalidationOpen,
  TOTAL_REVALIDATION_BOUNDARY,
  TOTAL_REVALIDATION_CAPABILITY,
} from "../public/capabilities";
import {
  appendSimulatorCleanupFailures,
  simulatorCleanupFailure,
  simulatorCleanupFailureFromResult,
} from "../public/failures";
import type {
  SimulatorModuleCleanupFailure,
  SimulatorModuleLaunchRequest,
} from "../public/contracts";
import {
  rejected,
  type SimulatorAssemblyResult,
} from "../resources/sharedResourceAdapters";
import type { SharedStaticResourceStore } from "../resources/sharedStaticResourceStore";
import { selectSimulatorStaticResources } from "../resources/staticResourceSelector";
import { AutonomousSimulatorModule } from "../runtime/autonomousSimulatorRuntime";
import type {
  AutonomousSimulatorEnvironment,
  SimulatorFrameScheduler,
  SimulatorRuntimeInputSource,
} from "../runtime/contracts";
import { installSimulatorModuleLauncher } from "../runtime/moduleEntryBinding";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import { validateConstructedChartCapabilities } from "../assembly/chartCapabilityValidation";
import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import { assembleSimulatorResources } from "../assembly/resourceAssembly";
import { deriveSessionMvResource } from "../assembly/sessionMvDerivation";
import type {
  MovieOperationResult,
  PreparedSessionMovieResource,
} from "../backends/movieContracts";
import {
  deriveSessionBgmResource,
  type PreparedSessionBgmResource,
} from "../assembly/sessionBgmDerivation";
import {
  RecipeOwnedSessionFactory,
  type SimulatorRecipeEngineBuild,
  type SimulatorRecipeEngineBuilder,
  type SimulatorSessionRecipe,
} from "../assembly/sessionRecipe";
import type { SimulatorEngineBuildPurpose } from "../host/contracts";
import {
  deriveSessionPresentation,
  replacePreparedSessionStageBackdrop,
  type PreparedSessionPresentation,
} from "../assembly/sessionPresentationDerivation";
import { deriveSessionSkinRecipe } from "../assembly/sessionSkinDerivation";
import type { ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import type { ChartConstructionResult } from "../engine/chart/types";
import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { createPixiStartupDirectionScene } from "../backends/pixi/pixiStartupDirectionScene";
import type { SimulatorResourceCapability } from "./resourceContracts";
import {
  copyAndValidateInitialSimulatorSurface,
  validateUnchangedSimulatorSurface,
  type SimulatorSurfaceState,
} from "./surfaceContracts";

export interface SimulatorGraphicsMount {
  dispose(): void;
}

export interface SimulatorGraphicsSurface {
  readSurfaceState(): SimulatorSurfaceState;
  mount(
    sessionId: string,
    sceneRoot: Container,
  ): SimulatorAssemblyResult<SimulatorGraphicsMount>;
}

export interface AutonomousSimulatorPlatformCapabilities {
  readonly resources: SimulatorResourceCapability;
  readonly staticResources: SharedStaticResourceStore;
  readonly audioContext: AudioContext;
  readonly graphics: SimulatorGraphicsSurface;
  readonly scheduler: SimulatorFrameScheduler;
  readonly input: SimulatorRuntimeInputSource;
  requestTargetFrameRate(value: 60 | 120): void;
  publishLifecycleState(state: SimulatorLifecycleBackendState): void;
}

let nextPlatformIdentity = 1;

export function createProductionAutonomousSimulatorModule(
  platform: AutonomousSimulatorPlatformCapabilities,
): SimulatorAssemblyResult<AutonomousSimulatorModule> {
  const validated = validatePlatform(platform);
  if (validated.status === "rejected") return validated;
  const platformIdentity = nextPlatformIdentity++;
  const builder = new ProductionRecipeEngineBuilder(platform, platformIdentity);
  const environment: AutonomousSimulatorEnvironment = Object.freeze({
    scheduler: platform.scheduler,
    input: platform.input,
    sessions: new RecipeOwnedSessionFactory(builder),
  });
  return accepted(new AutonomousSimulatorModule(environment));
}

export function installProductionAutonomousSimulatorPlatform(
  platform: AutonomousSimulatorPlatformCapabilities,
): SimulatorAssemblyResult<void> {
  const module = createProductionAutonomousSimulatorModule(platform);
  return module.status === "rejected"
    ? module
    : installSimulatorModuleLauncher(module.value.launch);
}

class ProductionRecipeEngineBuilder implements SimulatorRecipeEngineBuilder {
  private generation = 0;
  private readonly audioPreflight: BrowserAudioResourcePreflightAdapter;
  private readonly moviePreflight = new BrowserMovieResourcePreflightAdapter();
  private readonly bgmByRecipe = new WeakMap<
    SimulatorSessionRecipe,
    Promise<SimulatorAssemblyResult<PreparedSessionBgmResource>>
  >();
  private readonly presentationByRecipe = new WeakMap<
    SimulatorSessionRecipe,
    Promise<SimulatorAssemblyResult<PreparedSessionPresentation>>
  >();
  private readonly skinByRecipe = new WeakMap<
    SimulatorSessionRecipe,
    Promise<SimulatorAssemblyResult<ResolvedOriginalSkinRecipe>>
  >();

  constructor(
    private readonly platform: AutonomousSimulatorPlatformCapabilities,
    private readonly platformIdentity: number,
  ) {
    this.audioPreflight = new BrowserAudioResourcePreflightAdapter(platform.audioContext);
  }

  async createFreshEngine(
    recipe: SimulatorSessionRecipe,
    purpose: SimulatorEngineBuildPurpose = "initial",
  ): Promise<SimulatorAssemblyResult<SimulatorRecipeEngineBuild>> {
    if (isTotalRevalidationOpen()) {
      return rejected(
        "evidence-required",
        TOTAL_REVALIDATION_CAPABILITY,
        TOTAL_REVALIDATION_BOUNDARY,
      );
    }
    const surface = readPlatformSurface(this.platform.graphics);
    if (surface.status === "rejected") return surface;
    const originalLayout = createOriginalSurfaceLayout(
      surface.value,
      recipe.request.config.visual.noteSize,
    );
    if (originalLayout.status !== "ok") return fromEvidence(originalLayout);
    const moveTimeCandidate = purpose === "move-time-reconstruction";
    const mvPackage = recipe.request.presentation.mv;
    if (mvPackage !== null &&
      (recipe.request.config.sessionMode !== "live" || moveTimeCandidate)) {
      return rejected(
        "evidence-required",
        "simulator.mv-live.unsupported-mode-or-purpose",
        "Current MV Live is supported only for fresh Live Manual/Auto; Practice, Retry and MoveTime cannot inherit the standard route.",
      );
    }
    const sessionId = this.sessionId();
    this.generation += 1;
    const mvResource = mvPackage === null
      ? accepted<PreparedSessionMovieResource | null>(null)
      : await deriveSessionMvResource(mvPackage, this.moviePreflight);
    if (mvResource.status === "rejected") return mvResource;
    let pendingMovieOwned = mvResource.value !== null;
    const releasePendingMovie = (): readonly SimulatorModuleCleanupFailure[] => {
      if (!pendingMovieOwned || mvResource.value === null) return Object.freeze([]);
      pendingMovieOwned = false;
      try {
        mvResource.value.prepared.release();
        return Object.freeze([]);
      } catch {
        return Object.freeze([simulatorCleanupFailure(
          "simulator.mv-live.prepared-resource-release-threw",
          "The preflight video/Blob owner threw during early rollback; no chart, shared store, backend, mount, scheduler or domain owner had started.",
        )]);
      }
    };
    const chart = constructChartFromGarupaChartJson(
      recipe.request.chartData.chart,
    );
    if (chart.status !== "ok") {
      return rejectedWithCleanup(fromEvidence(chart), releasePendingMovie());
    }
    const chartCapabilities = validateConstructedChartCapabilities(chart.value, recipe.request);
    if (chartCapabilities.status === "rejected") {
      return rejectedWithCleanup(chartCapabilities, releasePendingMovie());
    }
    const bgm = await this.deriveBgm(recipe);
    if (bgm.status === "rejected") {
      return rejectedWithCleanup(bgm, releasePendingMovie());
    }
    const presentation = await this.derivePresentation(recipe);
    if (presentation.status === "rejected") {
      return rejectedWithCleanup(presentation, releasePendingMovie());
    }
    const score = mapScoreLifeProfile(recipe.request, sessionId);
    if (score.status === "rejected") {
      return rejectedWithCleanup(score, releasePendingMovie());
    }
    const originalLiveSettings = createOriginalLiveSettings({
      highFrequencyMode: recipe.request.config.highFrequencyMode,
      judgementAdjustValue: recipe.request.config.judgementAdjustValue,
      judgementAdjustValueB: recipe.request.config.judgementAdjustValueB,
      mvDarkness: recipe.request.config.mvDarkness,
      syncLine: recipe.request.config.syncLine,
      noteColor: recipe.request.config.noteColor,
      visibleTapLaneEffect: recipe.request.config.visibleTapLaneEffect,
    });
    if (originalLiveSettings.status !== "ok") {
      return rejectedWithCleanup(fromEvidence(originalLiveSettings), releasePendingMovie());
    }
    const skin = await this.deriveSkin(recipe, score.value.mode, chart.value);
    if (skin.status === "rejected") {
      return rejectedWithCleanup(skin, releasePendingMovie());
    }
    const selection = selectSimulatorStaticResources(chart.value, skin.value);
    const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
    const audio = new WebAudioSimulatorBackend(this.platform.audioContext, moveTimeCandidate);
    const particles = new DeterministicSimulatorParticleBackend();
    const particleRenderer = new PixiParticleRendererBackend(
      new BrowserPixiParticleTextureDecoder(),
    );
    const assembly = await assembleSimulatorResources(
      bgm.value,
      selection,
      this.platform.staticResources,
      {
        sessionId,
        rendering: {
          backend: renderer,
          preflight: new PortableRenderResourcePreflightAdapter(),
        },
        audio: {
          backend: audio,
          preflight: this.audioPreflight,
        },
        particles: {
          backend: particles,
          renderer: particleRenderer,
          preflight: new PortableParticleResourcePreflightAdapter(),
        },
        createSceneLayout: (kind, resources, fieldBindings) => {
          const scene = createSimulatorSceneLayout(
            surface.value,
            {
              ...recipe.request.config.visual,
              judgementAdjustValueB: originalLiveSettings.value.core.judgementAdjustValueB,
              syncLineEdgeMargin: selection.skin.resolved.note.noteSyncEdgeMargin,
            },
            kind,
            resources,
            fieldBindings,
          );
          return scene.status === "ok" ? accepted(scene.value) : fromEvidence(scene);
        },
      },
    );
    if (assembly.status === "rejected") {
      return rejectedWithCleanup(assembly, releasePendingMovie());
    }
    const movie = mvResource.value === null
      ? null
      : new PixiMvLiveBackend(false, originalLayout.value.movie);
    if (movie !== null) {
      const prepared = await movie.prepare(sessionId, mvResource.value!);
      if (prepared.status !== "accepted") {
        return rejectedWithCleanup(
          fromMovieOperation(prepared),
          Object.freeze([
            ...disposeAssembly(assembly.value, movie),
            ...releasePendingMovie(),
          ]),
        );
      }
      pendingMovieOwned = false;
    }
    const surfaceBound = renderer.bindOriginalSurfaceLayout(
      assembly.value.sceneLayout.surfaceLayout,
    );
    if (surfaceBound.status !== "ok") {
      return rejectedWithCleanup(
        fromEvidence(surfaceBound),
        disposeAssembly(assembly.value, movie),
      );
    }
    const effectivePresentation = replacePreparedSessionStageBackdrop(
      presentation.value,
      assembly.value.backgroundImage,
    );
    if (effectivePresentation.status === "rejected") {
      return rejectedWithCleanup(
        effectivePresentation,
        disposeAssembly(assembly.value, movie),
      );
    }
    const commonStartup = renderer.getStartupDirectionCommonResources();
    if (commonStartup.status !== "ok") {
      return rejectedWithCleanup(
        fromEvidence(commonStartup),
        disposeAssembly(assembly.value, movie),
      );
    }
    const startupScene = await createPixiStartupDirectionScene(
      effectivePresentation.value,
      commonStartup.value,
      new BrowserPixiTextureDecoder(),
      recipe.request.chartData.isFullLength,
      assembly.value.sceneLayout.surfaceLayout,
      movie === null,
    );
    if (startupScene.status !== "ok") {
      return rejectedWithCleanup(
        fromEvidence(startupScene),
        disposeAssembly(assembly.value, movie),
      );
    }
    const gains = gainBits(recipe.request);
    if (gains.status === "rejected") {
      startupScene.value.dispose();
      return rejectedWithCleanup(gains, disposeAssembly(assembly.value, movie));
    }
    const tracing = createRecordingSimulatorBackends();
    const backends: SimulatorBackends = Object.freeze({
      renderer: tracing.renderer,
      rendering: assembly.value.rendererBackend,
      audio: assembly.value.audioBackend,
      ...(movie === null ? {} : { movie }),
      particles: assembly.value.particleBackend,
      particleRendering: assembly.value.particleRendererBackend,
      input: tracing.input,
      resources: tracing.resources,
      lifecycle: Object.freeze({
        recordState: (state: SimulatorLifecycleBackendState) => {
          this.platform.publishLifecycleState(state);
        },
      }),
      frameRate: Object.freeze({
        requestTargetFrameRate: (value: 60 | 120) => {
          this.platform.requestTargetFrameRate(value);
        },
      }),
      manualInputGeometry: assembly.value.sceneLayout.manualInputGeometry,
      snapshot: () => tracing.snapshot(),
    });
    const engine = createSimulatorEngine({
      chart: chart.value,
      runtime: {
        originalLiveSettings: originalLiveSettings.value,
        mode: score.value.mode,
      },
      scoreLifeState: score.value,
      rendering: {
        sessionId,
        resources: assembly.value.renderBindings,
        ordinaryNoteScene: assembly.value.sceneLayout.ordinaryNoteScene,
        garupaProductScene: assembly.value.sceneLayout.garupaProductScene,
      },
      audio: {
        sessionId,
        bgmCue: bgm.value.profile.cue,
        seekMilliseconds: 0,
        masterGainBits: gains.value.master,
        bgmGainBits: gains.value.bgm,
        seGainBits: gains.value.se,
      },
      particles: { sessionId },
      ...(movie === null || mvResource.value === null
        ? {}
        : {
            movie: {
              sessionId,
              musicStartDelayMilliseconds:
                mvResource.value.profile.musicStartDelayMilliseconds,
            },
          }),
      startupDirection: {
        scene: startupScene.value,
        liveStartVoiceCue: null,
        purpose,
      },
    }, backends);
    if (engine.status !== "ok") {
      startupScene.value.dispose();
      return rejectedWithCleanup(
        fromEvidence(engine),
        disposeAssembly(assembly.value, movie),
      );
    }
    const controlOverlay = renderer.createRehearsalControlOverlay(
      score.value.mode,
      bgm.value.profile.durationSeconds,
      assembly.value.sceneLayout.surfaceLayout,
    );
    if (controlOverlay.status !== "ok") {
      const cleanup = simulatorCleanupFailureFromResult(
        "engine-after-control-overlay-failure",
        engine.value.dispose(),
      );
      return rejectedWithCleanup(
        fromEvidence(controlOverlay),
        cleanup === null ? [] : [cleanup],
      );
    }
    renderer.stage.visible = false;
    renderer.stage.alpha = 0;
    const combinedScene = createPixiCombinedScene(
      particleRenderer.stage,
      renderer.stage,
      startupScene.value,
      movie?.stage,
    );
    if (combinedScene.status !== "ok") {
      const cleanups = [
        simulatorCleanupFailureFromResult("control-overlay-after-combined-scene-failure", controlOverlay.value?.dispose() ?? ok(undefined)),
        simulatorCleanupFailureFromResult("engine-after-combined-scene-failure", engine.value.dispose()),
      ].filter((failure): failure is SimulatorModuleCleanupFailure => failure !== null);
      return rejectedWithCleanup(fromEvidence(combinedScene), cleanups);
    }
    combinedScene.value.root.visible = !moveTimeCandidate;
    const mounted = this.platform.graphics.mount(sessionId, combinedScene.value.root);
    if (mounted.status === "rejected") {
      const cleanups = [
        simulatorCleanupFailureFromResult("control-overlay-after-mount-failure", controlOverlay.value?.dispose() ?? ok(undefined)),
        simulatorCleanupFailureFromResult("engine-after-mount-failure", engine.value.dispose()),
        simulatorCleanupFailureFromResult("combined-scene-after-mount-failure", combinedScene.value.dispose()),
      ].filter((failure): failure is SimulatorModuleCleanupFailure => failure !== null);
      return rejectedWithCleanup(mounted, cleanups);
    }
    const mountedEngine = new MountedSimulatorEngine(
      engine.value,
      mounted.value,
      combinedScene.value,
      controlOverlay.value,
    );
    const registered = registerSimulatorEngineMoveTimeWrapper(
      mountedEngine,
      engine.value,
      () => {
        combinedScene.value.root.visible = true;
        return ok(undefined);
      },
      (active) => controlOverlay.value?.setMoveTimeInProgress(active) ?? ok(undefined),
    );
    if (registered.status !== "ok") {
      return rejectedWithCleanup(fromEvidence(registered), [
        simulatorCleanupFailureFromResult("engine-after-wrapper-registration-failure", mountedEngine.dispose()),
      ].filter((failure): failure is SimulatorModuleCleanupFailure => failure !== null));
    }
    return accepted(Object.freeze({
      engine: mountedEngine,
      mode: score.value.mode,
      chartFidelity: getGarupaProductChartProfile(chart.value)?.route === "product-extension"
        ? "garupa-product-extension" as const
        : "standard-original-compatible" as const,
      originalLiveSettingsIdentity: originalLiveSettingsIdentity(originalLiveSettings.value),
      skinRecipeIdentity: assembly.value.skinRecipeIdentity,
      skinFidelity: skin.value.fidelity,
      surface: surface.value,
      validateSurface: () => validateCurrentPlatformSurface(
        this.platform.graphics,
        surface.value,
      ),
    }));
  }

  private deriveSkin(
    recipe: SimulatorSessionRecipe,
    mode: SimulatorModeIdentity,
    chart: ChartConstructionResult,
  ): Promise<SimulatorAssemblyResult<ResolvedOriginalSkinRecipe>> {
    const existing = this.skinByRecipe.get(recipe);
    if (existing !== undefined) return existing;
    const derived = deriveSessionSkinRecipe(recipe.request, mode, chart);
    const pending = Promise.resolve(
      derived.status === "ok"
        ? accepted<ResolvedOriginalSkinRecipe>(derived.value)
        : fromEvidence<ResolvedOriginalSkinRecipe>(derived),
    );
    this.skinByRecipe.set(recipe, pending);
    return pending;
  }

  private derivePresentation(
    recipe: SimulatorSessionRecipe,
  ): Promise<SimulatorAssemblyResult<PreparedSessionPresentation>> {
    const existing = this.presentationByRecipe.get(recipe);
    if (existing !== undefined) return existing;
    const pending = deriveSessionPresentation(
      recipe.request.presentation,
    );
    this.presentationByRecipe.set(recipe, pending);
    return pending;
  }

  private deriveBgm(
    recipe: SimulatorSessionRecipe,
  ): Promise<SimulatorAssemblyResult<PreparedSessionBgmResource>> {
    const existing = this.bgmByRecipe.get(recipe);
    if (existing !== undefined) return existing;
    const pending = deriveSessionBgmResource(
      recipe.request.chartData.bgm,
      this.audioPreflight,
    );
    this.bgmByRecipe.set(recipe, pending);
    return pending;
  }

  private sessionId(): string {
    return `simulator:${this.platformIdentity}:generation:${this.generation}`;
  }
}

class MountedSimulatorEngine implements SimulatorEngine {
  private disposed = false;
  private paused = false;
  private timelineSeconds = Math.fround(0);
  private mount: SimulatorGraphicsMount | null;

  constructor(
    private readonly engine: SimulatorEngine,
    mount: SimulatorGraphicsMount | null,
    private readonly combinedScene: PixiCombinedScene,
    private readonly controlOverlay: PixiRehearsalControlOverlay | null,
  ) {
    this.mount = mount;
  }

  initialize(): SimulatorResult<void> {
    const initialized = this.engine.initialize();
    if (initialized.status !== "ok") return initialized;
    const startup = this.applyStartupSnapshot();
    if (startup.status !== "ok") return startup;
    return this.controlOverlay?.updateTimeline(0) ?? initialized;
  }
  step(deltaTimeSeconds: number, inputFrame?: ManualInputFrame): SimulatorResult<void> {
    const before = this.engine.snapshot();
    if (before.status !== "ok") return before;
    const wasPlayable = before.value.managers.playable;
    const stepped = this.engine.step(deltaTimeSeconds, inputFrame);
    if (stepped.status !== "ok") return stepped;
    const startup = this.applyStartupSnapshot();
    if (startup.status !== "ok" || this.paused) return startup;
    if (wasPlayable) {
      this.timelineSeconds = Math.fround(this.timelineSeconds + deltaTimeSeconds);
      return this.controlOverlay?.updateTimeline(this.timelineSeconds) ?? stepped;
    }
    return stepped;
  }
  resolveManualInputButton(position: ManualInputPosition) {
    return this.engine.resolveManualInputButton(position);
  }
  private applyStartupSnapshot(): SimulatorResult<void> {
    const snapshot = this.engine.snapshot();
    if (snapshot.status !== "ok") return snapshot;
    const startup = snapshot.value.managers.startupDirection;
    return startup === null ? ok(undefined) : this.combinedScene.applyStartupState(startup.scene);
  }
  pause(): SimulatorResult<void> {
    const paused = this.engine.pause();
    if (paused.status === "ok") this.paused = true;
    return paused;
  }
  resume(): SimulatorResult<void> {
    const resumed = this.engine.resume();
    if (resumed.status === "ok") this.paused = false;
    return resumed;
  }
  continueLive(): SimulatorResult<void> { return this.engine.continueLive(); }
  completeLiveAudio(clearStatus: 1 | 2 | 3): SimulatorResult<void> {
    return this.engine.completeLiveAudio(clearStatus);
  }
  getNaturalCompletionClearStatus(): 1 | 2 | 3 | null {
    return this.engine.getNaturalCompletionClearStatus();
  }
  getAdjustedMusicPosition(): SimulatorResult<number> {
    return this.engine.getAdjustedMusicPosition();
  }
  snapshot(): SimulatorResult<SimulatorSnapshot> { return this.engine.snapshot(); }
  dispose(): SimulatorResult<void> {
    if (this.disposed) return this.engine.dispose();
    this.disposed = true;
    let result = this.engine.dispose();
    const overlayDisposed = this.controlOverlay?.dispose() ?? ok(undefined);
    if (result.status === "ok" && overlayDisposed.status !== "ok") result = overlayDisposed;
    const mount = this.mount;
    this.mount = null;
    try {
      mount?.dispose();
    } catch {
      result = result.status === "ok"
        ? evidenceRequired(
            "simulator.composition.visual-unmount-threw",
            ["OSR-GAP-01"],
            "The visual surface mount threw during terminal cleanup after all engine-owned backends were disposed.",
          )
        : evidenceRequired(
            result.capability,
            result.requiredEvidence,
            `${result.boundary} Secondary cleanup failure: simulator.composition.visual-unmount-threw.`,
          );
    }
    const combinedDisposed = this.combinedScene.dispose();
    if (combinedDisposed.status === "evidence-required") {
      return result.status === "ok"
        ? combinedDisposed
        : evidenceRequired(
            result.capability,
            result.requiredEvidence,
            `${result.boundary} Secondary cleanup failure: ${combinedDisposed.capability}.`,
          );
    }
    return result;
  }
}

function mapScoreLifeProfile(
  request: SimulatorModuleLaunchRequest,
  sessionId: string,
): SimulatorAssemblyResult<ScoreLifeStateProfile> {
  const life = createCurrentSinglePlayLifeProfile(request.chartData.isFullLength);
  if (life.status !== "ok") return fromEvidence(life);
  const mode = createSimulatorModeIdentity(
    request.config.sessionMode,
    request.config.inputMode,
  );
  return accepted(Object.freeze({
    schemaVersion: 3 as const,
    sessionId,
    life: life.value,
    mode,
  }));
}

function gainBits(request: SimulatorModuleLaunchRequest): SimulatorAssemblyResult<{
  readonly master: string;
  readonly bgm: string;
  readonly se: string;
}> {
  const master = audioFloat32ToBits(Math.fround(request.config.audio.masterGain));
  const bgm = audioFloat32ToBits(Math.fround(request.config.audio.bgmGain));
  const se = audioFloat32ToBits(Math.fround(request.config.audio.seGain));
  return master === null || bgm === null || se === null
    ? rejected(
        "evidence-required",
        "simulator.composition.invalid-audio-gain",
        "Public master, BGM and SE unit gains must convert to finite binary32 values without fallback.",
      )
    : accepted(Object.freeze({ master, bgm, se }));
}

function validatePlatform(
  platform: AutonomousSimulatorPlatformCapabilities,
): SimulatorAssemblyResult<void> {
  if (
    platform === null || typeof platform !== "object" ||
    platform.resources == null || typeof platform.resources.acquire !== "function" ||
    platform.staticResources == null || typeof platform.staticResources.read !== "function" ||
    platform.audioContext == null || typeof platform.audioContext !== "object" ||
    platform.graphics == null || typeof platform.graphics.mount !== "function" ||
    typeof platform.graphics.readSurfaceState !== "function" ||
    platform.scheduler == null || typeof platform.scheduler.start !== "function" ||
    platform.input == null || typeof platform.input.consume !== "function" || typeof platform.input.dispose !== "function" ||
    typeof platform.requestTargetFrameRate !== "function" ||
    typeof platform.publishLifecycleState !== "function"
  ) {
    return rejected(
      "platform-unavailable",
      "simulator.composition.invalid-platform-capabilities",
      "Production composition requires one application-owned neutral resource capability, the transitional shared store, AudioContext, revisioned graphics surface reader, scheduler, input source and lifecycle/frame-rate sinks.",
    );
  }
  return accepted(undefined);
}

function readPlatformSurface(
  graphics: SimulatorGraphicsSurface,
): SimulatorAssemblyResult<SimulatorSurfaceState> {
  try {
    const checked = copyAndValidateInitialSimulatorSurface(graphics.readSurfaceState());
    return checked.status === "ok" ? accepted(checked.value) : fromEvidence(checked);
  } catch {
    return rejected(
      "platform-unavailable",
      "simulator.composition.surface-read-threw",
      "The platform surface reader threw before resource/backend/engine ownership; no default viewport is substituted.",
    );
  }
}

function validateCurrentPlatformSurface(
  graphics: SimulatorGraphicsSurface,
  initial: SimulatorSurfaceState,
): SimulatorAssemblyResult<void> {
  try {
    const checked = validateUnchangedSimulatorSurface(initial, graphics.readSurfaceState());
    return checked.status === "ok" ? accepted(undefined) : fromEvidence(checked);
  } catch {
    return rejected(
      "platform-unavailable",
      "simulator.composition.surface-reread-threw",
      "The platform surface reader threw before command/input consumption; the session terminates without continuing stale geometry.",
    );
  }
}

function disposeAssembly(assembly: {
  readonly rendererBackend: { dispose(): unknown };
  readonly audioBackend: { dispose(): unknown };
  readonly particleBackend: { dispose(): unknown };
  readonly particleRendererBackend: { dispose(): unknown };
}, movieBackend: { dispose(): unknown } | null = null): readonly SimulatorModuleCleanupFailure[] {
  const rollbackOwners = [
    ...(movieBackend === null ? [] : [{ identity: "movie-backend", owner: movieBackend }]),
    { identity: "particle-renderer", owner: assembly.particleRendererBackend },
    { identity: "particle-backend", owner: assembly.particleBackend },
    { identity: "audio-backend", owner: assembly.audioBackend },
    { identity: "renderer-backend", owner: assembly.rendererBackend },
  ];
  const failures: SimulatorModuleCleanupFailure[] = [];
  for (const { identity, owner } of rollbackOwners) {
    try {
      const failure = simulatorCleanupFailureFromResult(identity, owner.dispose());
      if (failure !== null) failures.push(failure);
    } catch {
      failures.push(simulatorCleanupFailure(
        `simulator.composition.rollback-${identity}-threw`,
        `The ${identity} owner threw during composition rollback; every remaining owner was still released.`,
      ));
    }
  }
  return Object.freeze(failures);
}

function rejectedWithCleanup<T>(
  primary: SimulatorAssemblyResult<T>,
  cleanupFailures: readonly SimulatorModuleCleanupFailure[],
): SimulatorAssemblyResult<T> {
  if (primary.status === "accepted" || cleanupFailures.length === 0) return primary;
  return Object.freeze({
    status: "rejected" as const,
    failure: appendSimulatorCleanupFailures(primary.failure, cleanupFailures),
  });
}

function fromMovieOperation<T>(
  result: Exclude<MovieOperationResult<T>, { status: "accepted" }>,
): SimulatorAssemblyResult<never> {
  const code = result.status === "movie-resource-integrity"
    ? "resource-integrity"
    : result.status === "movie-resource-decode"
      ? "resource-decode"
      : result.status === "movie-platform-unavailable"
        ? "platform-unavailable"
        : result.status === "evidence-required"
          ? "evidence-required"
          : "launch-failed";
  return rejected(code, result.failure.capability, result.failure.boundary);
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

function fromEvidence<T>(result: {
  readonly status: "evidence-required";
  readonly capability: string;
  readonly boundary: string;
}): SimulatorAssemblyResult<T> {
  return rejected("evidence-required", result.capability, result.boundary);
}
