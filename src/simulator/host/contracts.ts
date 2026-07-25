import type { SimulatorBackends } from "../backends/contracts";
import type {
  NoteBatchInformationList,
  SimulatorClockProfile,
} from "../engine/data/noteData";
import type { SimulatorResult } from "../engine/evidence";
import type { InGameManagerSnapshot } from "../engine/managers/inGameManager";

export interface SimulatorEngineInput {
  readonly noteBatches: NoteBatchInformationList;
  readonly clock: SimulatorClockProfile;
}

export interface SimulatorEngine {
  initialize(): SimulatorResult<void>;
  step(deltaTimeSeconds: number): SimulatorResult<void>;
  pause(): SimulatorResult<void>;
  resume(): SimulatorResult<void>;
  snapshot(): SimulatorResult<InGameManagerSnapshot>;
  dispose(): SimulatorResult<void>;
}

export type CreateSimulatorEngine = (
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
) => SimulatorResult<SimulatorEngine>;
