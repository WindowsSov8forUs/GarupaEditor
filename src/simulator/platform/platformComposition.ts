import type { Container } from "pixi.js";
import { BrowserAudioResourcePreflightAdapter } from "../backends/audio/browserAudioResourcePreflightAdapter";
import { WebAudioSimulatorBackend } from "../backends/audio/webAudioBackend";
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
import {
  PixiRendererBackend,
  type PixiRehearsalControlOverlay,
} from "../backends/pixi/pixiRendererBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { PortableParticleResourcePreflightAdapter } from "../backends/resources/localParticleResourceProvider";
import { PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import type { ScoreLifeStateProfile } from "../engine/data/scoreLifeState";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
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
import { validateConstructedChartCapabilities } from "../assembly/chartCapabilityValidation";
import { assembleSimulatorResources } from "../assembly/resourceAssembly";
import {
  RecipeOwnedSessionFactory,
  type SimulatorRecipeEngineBuild,
  type SimulatorRecipeEngineBuilder,
  type SimulatorSessionRecipe,
} from "../assembly/sessionRecipe";

export interface SimulatorGraphicsMount {
  dispose(): void;
}

export interface SimulatorGraphicsSurface {
  readonly viewportWidth: 1600;
  readonly viewportHeight: 720;
  readonly inputOrigin: "bottom-left";
  mount(
    sessionId: string,
    sceneRoot: Container,
  ): SimulatorAssemblyResult<SimulatorGraphicsMount>;
}

export interface AutonomousSimulatorPlatformCapabilities {
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

  constructor(
    private readonly platform: AutonomousSimulatorPlatformCapabilities,
    private readonly platformIdentity: number,
  ) {}

  async createFreshEngine(
    recipe: SimulatorSessionRecipe,
  ): Promise<SimulatorAssemblyResult<SimulatorRecipeEngineBuild>> {
    if (isTotalRevalidationOpen()) {
      return rejected(
        "evidence-required",
        TOTAL_REVALIDATION_CAPABILITY,
        TOTAL_REVALIDATION_BOUNDARY,
      );
    }
    const chart = createNoteBatchInformationList({
      musicScoreData: recipe.request.chartData.bmsText,
    });
    if (chart.status !== "ok") return fromEvidence(chart);
    const chartCapabilities = validateConstructedChartCapabilities(chart.value, recipe.request);
    if (chartCapabilities.status === "rejected") return chartCapabilities;
    const score = mapScoreLifeProfile(recipe.request, this.sessionId());
    if (score.status === "rejected") return score;
    const moveTimeCandidate = this.generation > 0;
    const selection = selectSimulatorStaticResources(chart.value);
    const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
    const audio = new WebAudioSimulatorBackend(this.platform.audioContext, moveTimeCandidate);
    const particles = new DeterministicSimulatorParticleBackend();
    const particleRenderer = new PixiParticleRendererBackend(
      new BrowserPixiParticleTextureDecoder(),
    );
    const sessionId = this.sessionId();
    this.generation += 1;
    const assembly = await assembleSimulatorResources(
      recipe.request.chartData.bgm,
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
          preflight: new BrowserAudioResourcePreflightAdapter(this.platform.audioContext),
        },
        particles: {
          backend: particles,
          renderer: particleRenderer,
          preflight: new PortableParticleResourcePreflightAdapter(),
        },
        createSceneLayout: (kind, resources) => {
          const scene = createSimulatorSceneLayout(
            this.platform.graphics,
            {
              ...recipe.request.config.visual,
              judgeOffsetFrames: recipe.request.config.judgeOffsetFrames,
            },
            kind,
            resources,
          );
          return scene.status === "ok" ? accepted(scene.value) : fromEvidence(scene);
        },
      },
    );
    if (assembly.status === "rejected") return assembly;
    const gains = gainBits(recipe.request);
    if (gains.status === "rejected") {
      return rejectedWithCleanup(gains, disposeAssembly(assembly.value));
    }
    const tracing = createRecordingSimulatorBackends();
    const backends: SimulatorBackends = Object.freeze({
      renderer: tracing.renderer,
      rendering: assembly.value.rendererBackend,
      audio: assembly.value.audioBackend,
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
        highFrequencyMode: recipe.request.config.highFrequencyMode,
        judgeOffsetFrames: recipe.request.config.judgeOffsetFrames,
        mode: score.value.mode,
      },
      scoreLifeState: score.value,
      rendering: {
        sessionId,
        resources: assembly.value.renderBindings,
        ordinaryNoteScene: assembly.value.sceneLayout.ordinaryNoteScene,
      },
      audio: {
        sessionId,
        bgmCue: recipe.request.chartData.bgm.cue,
        seekMilliseconds: 0,
        masterGainBits: gains.value.master,
        bgmGainBits: gains.value.bgm,
        seGainBits: gains.value.se,
      },
      particles: { sessionId },
    }, backends);
    if (engine.status !== "ok") {
      return rejectedWithCleanup(fromEvidence(engine), disposeAssembly(assembly.value));
    }
    const controlOverlay = renderer.createRehearsalControlOverlay(
      score.value.mode,
      recipe.request.chartData.bgm.durationSeconds,
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
    const combinedScene = createPixiCombinedScene(particleRenderer.stage, renderer.stage);
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
    return accepted(Object.freeze({ engine: mountedEngine, mode: score.value.mode }));
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
    return this.controlOverlay?.updateTimeline(0) ?? initialized;
  }
  step(deltaTimeSeconds: number, inputFrame?: ManualInputFrame): SimulatorResult<void> {
    const stepped = this.engine.step(deltaTimeSeconds, inputFrame);
    if (stepped.status !== "ok" || this.paused) return stepped;
    this.timelineSeconds = Math.fround(this.timelineSeconds + deltaTimeSeconds);
    return this.controlOverlay?.updateTimeline(this.timelineSeconds) ?? stepped;
  }
  resolveManualInputButton(position: ManualInputPosition) {
    return this.engine.resolveManualInputButton(position);
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
  const gameplay = request.chartData.gameplay;
  const mode = createSimulatorModeIdentity(
    request.config.sessionMode,
    request.config.inputMode,
  );
  return accepted(Object.freeze({
    schemaVersion: 3 as const,
    sessionId,
    life: Object.freeze({ ...gameplay.life }),
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
    platform.staticResources == null || typeof platform.staticResources.read !== "function" ||
    platform.audioContext == null || typeof platform.audioContext !== "object" ||
    platform.graphics == null || typeof platform.graphics.mount !== "function" ||
    platform.graphics.viewportWidth !== 1600 || platform.graphics.viewportHeight !== 720 ||
    platform.graphics.inputOrigin !== "bottom-left" ||
    platform.scheduler == null || typeof platform.scheduler.start !== "function" ||
    platform.input == null || typeof platform.input.consume !== "function" || typeof platform.input.dispose !== "function" ||
    typeof platform.requestTargetFrameRate !== "function" ||
    typeof platform.publishLifecycleState !== "function"
  ) {
    return rejected(
      "platform-unavailable",
      "simulator.composition.invalid-platform-capabilities",
      "Production composition requires one neutral shared store, AudioContext, fixed graphics surface, scheduler, input source and lifecycle/frame-rate sinks.",
    );
  }
  return accepted(undefined);
}

function disposeAssembly(assembly: {
  readonly rendererBackend: { dispose(): unknown };
  readonly audioBackend: { dispose(): unknown };
  readonly particleBackend: { dispose(): unknown };
  readonly particleRendererBackend: { dispose(): unknown };
}): readonly SimulatorModuleCleanupFailure[] {
  const rollbackOwners = [
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
