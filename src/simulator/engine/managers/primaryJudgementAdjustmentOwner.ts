import { integrityFailure, ok, type SimulatorResult } from "../result";
import type { StartupAudioPurpose } from "../audio/startupAudioOwner";

export type PrimaryJudgementAdjustmentPhase =
  | "waiting-music"
  /** After a MoveTime, PlayingSound already runs while judgeAdjustFastProcess holds PlayMusic. */
  | "move-time-waiting-music"
  | "waiting-gameplay"
  | "complete"
  | "faulted";

export interface PrimaryJudgementAdjustmentSnapshot {
  readonly judgementAdjustValue: number;
  readonly purpose: StartupAudioPurpose;
  readonly phase: PrimaryJudgementAdjustmentPhase;
  readonly fastCounter: number;
  readonly slowCounter: number;
  readonly musicStarted: boolean;
  readonly gameplayBlocked: boolean;
}

export class PrimaryJudgementAdjustmentOwner {
  private fastCounterValue = 0;
  private slowCounterValue = 0;
  private musicStartedValue = false;
  private phaseValue: PrimaryJudgementAdjustmentPhase;

  constructor(
    readonly judgementAdjustValue: number,
    readonly purpose: StartupAudioPurpose,
  ) {
    this.phaseValue = "waiting-music";
  }

  initialize(hasStartupOwner: boolean): SimulatorResult<void> {
    if (!Number.isInteger(this.judgementAdjustValue) ||
      this.judgementAdjustValue < -30 || this.judgementAdjustValue > 30) {
      return this.fault(
        "primary-adjustment.invalid-value",
        "Primary JudgementAdjustValue must remain the exact persisted integer range -30..30.",
      );
    }
    if (!hasStartupOwner) {
      if (this.judgementAdjustValue !== 0) {
        return this.fault(
          "primary-adjustment.startup-owner-missing",
          "A non-zero Primary adjustment requires the startup music owner; chart clocks and judgement windows cannot substitute for it.",
        );
      }
      this.musicStartedValue = true;
      this.phaseValue = "complete";
    }
    return ok(undefined);
  }

  /** onResetOnMovedTime stops judgeAdjustFastProcess and clears both counters, so the
   * resumed PlayingSound runs the adjustment frames again. */
  resetForMoveTime(): SimulatorResult<void> {
    if (this.phaseValue === "faulted") {
      return this.fault("primary-adjustment.reset-after-fault", "A faulted Primary adjustment owner cannot restart.");
    }
    this.fastCounterValue = 0;
    this.slowCounterValue = 0;
    this.musicStartedValue = false;
    this.phaseValue = "move-time-waiting-music";
    return ok(undefined);
  }

  preflightMusicStart(): SimulatorResult<boolean> {
    if (this.phaseValue === "faulted" || this.musicStartedValue) {
      return this.fault(
        "primary-adjustment.invalid-music-start",
        "The Primary music-start edge is requested once per start or MoveTime resume.",
      );
    }
    if (this.judgementAdjustValue > 0 &&
      this.fastCounterValue < this.judgementAdjustValue) {
      this.fastCounterValue += 1;
      return ok(false);
    }
    return ok(true);
  }

  commitMusicStarted(): SimulatorResult<void> {
    if ((this.phaseValue !== "waiting-music" && this.phaseValue !== "move-time-waiting-music") || this.musicStartedValue ||
      (this.judgementAdjustValue > 0 &&
        this.fastCounterValue < this.judgementAdjustValue)) {
      return this.fault(
        "primary-adjustment.invalid-music-commit",
        "Music may commit only after the exact positive counter has yielded, or immediately for zero/negative adjustment.",
      );
    }
    this.musicStartedValue = true;
    this.phaseValue = this.judgementAdjustValue < 0
      ? "waiting-gameplay"
      : "complete";
    return ok(undefined);
  }

  consumeGameplayGate(): SimulatorResult<boolean> {
    if (this.phaseValue === "faulted") {
      return this.fault(
        "primary-adjustment.consume-after-fault",
        "A faulted Primary adjustment owner cannot advance gameplay.",
      );
    }
    if (this.phaseValue === "complete" ||
      this.phaseValue === "move-time-waiting-music") {
      return ok(false);
    }
    if (this.phaseValue !== "waiting-gameplay" || !this.musicStartedValue ||
      this.judgementAdjustValue >= 0) {
      return this.fault(
        "primary-adjustment.gameplay-before-music",
        "The slow counter exists only after a negative Primary adjustment has started music.",
      );
    }
    const target = -this.judgementAdjustValue;
    if (this.slowCounterValue < target) {
      this.slowCounterValue += 1;
      if (this.slowCounterValue === target) this.phaseValue = "complete";
      return ok(true);
    }
    this.phaseValue = "complete";
    return ok(false);
  }

  snapshot(): PrimaryJudgementAdjustmentSnapshot {
    return Object.freeze({
      judgementAdjustValue: this.judgementAdjustValue,
      purpose: this.purpose,
      phase: this.phaseValue,
      fastCounter: this.fastCounterValue,
      slowCounter: this.slowCounterValue,
      musicStarted: this.musicStartedValue,
      gameplayBlocked: this.phaseValue === "waiting-gameplay",
    });
  }

  private fault(capability: string, boundary: string): ReturnType<typeof integrityFailure> {
    this.phaseValue = "faulted";
    return integrityFailure(capability, boundary);
  }
}
