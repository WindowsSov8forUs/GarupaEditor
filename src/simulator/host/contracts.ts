import type {
  SimulatorBackends,
  SimulatorBackendTraceEvent,
} from "../backends/contracts";
import type { ChartConstructionResult } from "../engine/chart/types";
import type { SimulatorPlayMode } from "../engine/data/inGameCalculatedData";
import type { SimulatorResult } from "../engine/evidence";
import type { InGameDirectorSnapshot } from "../engine/managers/inGameDirector";
import type { InGameManagerSnapshot } from "../engine/managers/inGameManager";

export interface SimulatorEngineInput {
  readonly chart: ChartConstructionResult;
  readonly runtime: {
    readonly highFrequencyMode: boolean;
    readonly judgeOffsetFrames: number;
    readonly playMode: SimulatorPlayMode;
  };
}

export interface SimulatorSnapshot {
  readonly director: InGameDirectorSnapshot;
  readonly managers: InGameManagerSnapshot;
  readonly adjustedMusicPosition: number;
  readonly backendTrace: readonly SimulatorBackendTraceEvent[];
}

export interface SimulatorEngine {
  initialize(): SimulatorResult<void>;
  step(deltaTimeSeconds: number): SimulatorResult<void>;
  pause(): SimulatorResult<void>;
  resume(): SimulatorResult<void>;
  getAdjustedMusicPosition(): SimulatorResult<number>;
  snapshot(): SimulatorResult<SimulatorSnapshot>;
  dispose(): SimulatorResult<void>;
}

export type CreateSimulatorEngine = (
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
) => SimulatorResult<SimulatorEngine>;
