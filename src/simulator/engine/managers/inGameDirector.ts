import { evidenceRequired, type SimulatorResult } from "../evidence";
import { ok } from "../evidence";
import type { SimulatorFrameRateBackend } from "../../backends/contracts";
import { InGameManager } from "./inGameManager";

export interface InGameDirectorSnapshot {
  readonly playerLoopNode: "Update.ScriptRunBehaviourUpdate";
  readonly callback: "InGameDirector.Update";
  readonly target: "InGameManager.ExecUpdate";
  readonly awakeComplete: boolean;
  readonly requestedTargetFrameRate: 60 | 120 | null;
}

export class InGameDirector {
  private awakeCompleteValue = false;
  private requestedTargetFrameRateValue: 60 | 120 | null = null;

  constructor(
    readonly inGameManager: InGameManager,
    private readonly highFrequencyMode: boolean,
    private readonly frameRateBackend: SimulatorFrameRateBackend,
  ) {}

  awake(): SimulatorResult<void> {
    if (this.awakeCompleteValue) {
      return ok(undefined);
    }
    const target = this.highFrequencyMode ? 120 : 60;
    this.frameRateBackend.requestTargetFrameRate(target);
    this.requestedTargetFrameRateValue = target;
    this.awakeCompleteValue = true;
    return ok(undefined);
  }

  update(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      return evidenceRequired(
        "director.invalid-delta-time",
        ["E22", "E25"],
        "The portable frame trigger must provide a finite non-negative delta to the recovered InGameDirector.Update boundary.",
      );
    }
    return this.inGameManager.execUpdate(deltaTimeSeconds);
  }

  snapshot(): InGameDirectorSnapshot {
    return {
      playerLoopNode: "Update.ScriptRunBehaviourUpdate",
      callback: "InGameDirector.Update",
      target: "InGameManager.ExecUpdate",
      awakeComplete: this.awakeCompleteValue,
      requestedTargetFrameRate: this.requestedTargetFrameRateValue,
    };
  }
}
