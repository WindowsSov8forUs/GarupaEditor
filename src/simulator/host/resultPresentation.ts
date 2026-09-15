import type { InGameRecordSnapshot } from "../engine/managers/inGameRecord";
import type { ManualInputFrame } from "../engine/data/manualInput";
import type { SimulatorResult } from "../engine/result";
import type { ScoreGaugeThresholdProfile } from "../engine/data/singlePlayScoreGauge";

/** Final committed statistics; the result view never calculates gameplay results. */
export interface SimulatorResultRecord {
  readonly record: InGameRecordSnapshot;
  readonly isAutoLive: boolean;
  readonly isEnablePractice: boolean;
  readonly isDemoPlayMode: boolean;
  readonly clearStatus: 1 | 2 | 3;
  readonly scoreThresholds: ScoreGaugeThresholdProfile;
}

export interface SimulatorResultPresentationEngine {
  showResult(record: SimulatorResultRecord): Promise<SimulatorResult<void>>;
  advanceResult(deltaSeconds: number, input: ManualInputFrame | null): SimulatorResult<"stay" | "exit" | "replay">;
}

/** One destination preparation, driven by completed work rather than time. */
export interface SimulatorResultPreparation {
  readonly ready: Promise<void>;
  report(completed: number, total: number): Promise<void>;
  /** Present the destination only on success; cancellation just releases Loading. */
  finish(present: boolean): void;
}
