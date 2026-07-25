import type { SimulatorBackends } from "../backends/contracts";
import type {
  NoteBatchInformationList,
  SimulatorClockProfile,
  SimulatorNoteManagerProfile,
} from "../engine/data/noteData";
import type { OneFrameDataPoolProfile } from "../engine/data/oneFrameData";
import type { SimulatorResult } from "../engine/evidence";
import type { InGameManagerSnapshot } from "../engine/managers/inGameManager";
import type { SimulatorBackendTraceEvent } from "../backends/contracts";

export interface SimulatorEngineInput {
  readonly noteBatches: NoteBatchInformationList;
  readonly clock: SimulatorClockProfile;
  readonly noteManager: SimulatorNoteManagerProfile;
  readonly oneFrameData: OneFrameDataPoolProfile;
}

export type FirstSliceEvidenceGap =
  | "G04"
  | "G05";

export interface SimulatorSnapshot {
  readonly managers: InGameManagerSnapshot;
  readonly backendTrace: readonly SimulatorBackendTraceEvent[];
  readonly evidenceGaps: readonly FirstSliceEvidenceGap[];
}

export interface SimulatorEngine {
  initialize(): SimulatorResult<void>;
  step(deltaTimeSeconds: number): SimulatorResult<void>;
  pause(): SimulatorResult<void>;
  resume(): SimulatorResult<void>;
  snapshot(): SimulatorResult<SimulatorSnapshot>;
  dispose(): SimulatorResult<void>;
}

export type CreateSimulatorEngine = (
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
) => SimulatorResult<SimulatorEngine>;
