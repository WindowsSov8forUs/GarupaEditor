import type {
  SimulatorBackends,
  SimulatorBackendTraceEvent,
} from "../backends/contracts";
import type { ChartConstructionResult } from "../engine/chart/types";
import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import type {
  ManualInputButtonResolution,
  ManualInputFrame,
  ManualInputPosition,
} from "../engine/data/manualInput";
import type { ScoreLifeStateProfile } from "../engine/data/scoreLifeState";
import type { SimulatorResult } from "../engine/evidence";
import type { AudioBackendSnapshot } from "../backends/audioContracts";
import type { MovieBackendSnapshot } from "../backends/movieContracts";
import type { RenderBackendSnapshot } from "../backends/renderingContracts";
import type {
  ParticleBackendSnapshot,
  ParticleRendererBackendSnapshot,
} from "../backends/particleContracts";
import type { SimulatorAudioSessionInput } from "../engine/audio/audioCommandProducer";
import type {
  OrdinaryFixedNoteSceneInput,
  RenderEngineResourceBindings,
} from "../engine/rendering/renderCommandProducer";
import type { InGameDirectorSnapshot } from "../engine/managers/inGameDirector";
import type { InGameManagerSnapshot } from "../engine/managers/inGameManager";
import type { StartupDirectionSceneBackend } from "../scene/startupDirectionScene";
import type { StartupDirectionPurpose } from "../engine/managers/startupDirectionController";

export type SimulatorEngineBuildPurpose = "initial" | "retry" | "move-time-reconstruction";

export interface SimulatorRenderingSessionInput {
  readonly sessionId: string;
  readonly resources: RenderEngineResourceBindings;
  readonly ordinaryNoteScene: OrdinaryFixedNoteSceneInput;
}

export interface SimulatorParticleSessionInput {
  readonly sessionId: string;
}

export interface SimulatorEngineInput {
  readonly chart: ChartConstructionResult;
  readonly runtime: {
    readonly highFrequencyMode: boolean;
    readonly judgeOffsetFrames: number;
    readonly mode: SimulatorModeIdentity;
  };
  readonly scoreLifeState?: ScoreLifeStateProfile;
  readonly rendering?: SimulatorRenderingSessionInput;
  readonly audio?: SimulatorAudioSessionInput;
  readonly particles?: SimulatorParticleSessionInput;
  readonly movie?: {
    readonly sessionId: string;
    readonly musicStartDelayMilliseconds: number;
  };
  readonly startupDirection?: {
    readonly scene: StartupDirectionSceneBackend | null;
    readonly liveStartVoiceCue: string | null;
    readonly purpose: StartupDirectionPurpose;
  };
}

export interface SimulatorSnapshot {
  readonly director: InGameDirectorSnapshot;
  readonly managers: InGameManagerSnapshot;
  readonly adjustedMusicPosition: number;
  readonly backendTrace: readonly SimulatorBackendTraceEvent[];
  readonly renderingBackend: RenderBackendSnapshot | null;
  readonly audioBackend: AudioBackendSnapshot;
  readonly movieBackend: MovieBackendSnapshot | null;
  readonly particleBackend: ParticleBackendSnapshot | null;
  readonly particleRendererBackend: ParticleRendererBackendSnapshot | null;
}

export interface SimulatorEngine {
  initialize(): SimulatorResult<void>;
  step(
    deltaTimeSeconds: number,
    inputFrame?: ManualInputFrame,
  ): SimulatorResult<void>;
  resolveManualInputButton(
    position: ManualInputPosition,
  ): SimulatorResult<ManualInputButtonResolution | null>;
  pause(): SimulatorResult<void>;
  resume(): SimulatorResult<void>;
  continueLive(): SimulatorResult<void>;
  completeLiveAudio(clearStatus: 1 | 2 | 3): SimulatorResult<void>;
  getNaturalCompletionClearStatus(): 1 | 2 | 3 | null;
  getAdjustedMusicPosition(): SimulatorResult<number>;
  snapshot(): SimulatorResult<SimulatorSnapshot>;
  dispose(): SimulatorResult<void>;
}

export type CreateSimulatorEngine = (
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
) => SimulatorResult<SimulatorEngine>;
