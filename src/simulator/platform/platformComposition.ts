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
import { PixiParticleRendererBackend } from "../backends/pixi/pixiParticleRendererBackend";
import { PixiRendererBackend } from "../backends/pixi/pixiRendererBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { PortableParticleResourcePreflightAdapter } from "../backends/resources/localParticleResourceProvider";
import { PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { evidenceRequired, type SimulatorResult } from "../engine/evidence";
import type { ManualInputFrame, ManualInputPosition } from "../engine/data/manualInput";
import type { SimulatorEngine, SimulatorSnapshot } from "../host/contracts";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";
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
import { assembleSimulatorResources } from "../assembly/resourceAssembly";
import {
  RecipeOwnedSessionFactory,
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
    renderStage: Container,
    particleStage: Container,
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
  ): Promise<SimulatorAssemblyResult<SimulatorEngine>> {
    if (recipe.request.config.practice.startMilliseconds !== 0) {
      return rejected(
        "evidence-required",
        "simulator.composition.nonzero-initial-practice-seek",
        "Initial non-zero practice seek requires a recovered whole-engine pre-roll cadence; audio-only seek and chart-time jumps are forbidden.",
      );
    }
    const chart = createNoteBatchInformationList({
      musicScoreData: recipe.request.chartData.bmsText,
    });
    if (chart.status !== "ok") return fromEvidence(chart);
    const selection = selectSimulatorStaticResources(chart.value);
    const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
    const audio = new WebAudioSimulatorBackend(this.platform.audioContext);
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
      disposeAssembly(assembly.value);
      return gains;
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
        playMode: recipe.request.config.playMode === "manual"
          ? Object.freeze({ kind: "manual" as const })
          : Object.freeze({
              kind: "auto-live" as const,
              resultTransform: "identity" as const,
            }),
      },
      rendering: {
        sessionId,
        resources: assembly.value.renderBindings,
        ordinaryNoteScene: assembly.value.sceneLayout.ordinaryNoteScene,
      },
      audio: {
        sessionId,
        bgmCue: recipe.request.chartData.bgm.cue,
        seekMilliseconds: recipe.request.config.practice.startMilliseconds,
        masterGainBits: gains.value.master,
        bgmGainBits: gains.value.bgm,
        seGainBits: gains.value.se,
      },
      particles: { sessionId },
    }, backends);
    if (engine.status !== "ok") {
      disposeAssembly(assembly.value);
      return fromEvidence(engine);
    }
    const mounted = this.platform.graphics.mount(
      sessionId,
      renderer.stage,
      particleRenderer.stage,
    );
    if (mounted.status === "rejected") {
      engine.value.dispose();
      return mounted;
    }
    return accepted(new MountedSimulatorEngine(engine.value, mounted.value));
  }

  private sessionId(): string {
    return `simulator:${this.platformIdentity}:generation:${this.generation}`;
  }
}

class MountedSimulatorEngine implements SimulatorEngine {
  private disposed = false;

  constructor(
    private readonly engine: SimulatorEngine,
    private readonly mount: SimulatorGraphicsMount,
  ) {}

  initialize(): SimulatorResult<void> { return this.engine.initialize(); }
  step(deltaTimeSeconds: number, inputFrame?: ManualInputFrame): SimulatorResult<void> {
    return this.engine.step(deltaTimeSeconds, inputFrame);
  }
  resolveManualInputButton(position: ManualInputPosition) {
    return this.engine.resolveManualInputButton(position);
  }
  pause(): SimulatorResult<void> { return this.engine.pause(); }
  resume(): SimulatorResult<void> { return this.engine.resume(); }
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
    const result = this.engine.dispose();
    try {
      this.mount.dispose();
    } catch {
      return result.status === "ok"
        ? evidenceRequired(
            "simulator.composition.visual-unmount-threw",
            [],
            "The visual surface mount threw during terminal cleanup after all engine-owned backends were disposed.",
          )
        : result;
    }
    return result;
  }
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
}): void {
  try { assembly.particleRendererBackend.dispose(); } catch {}
  try { assembly.particleBackend.dispose(); } catch {}
  try { assembly.audioBackend.dispose(); } catch {}
  try { assembly.rendererBackend.dispose(); } catch {}
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
