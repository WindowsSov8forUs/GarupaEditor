import { evidenceRequired, type SimulatorResult } from "../evidence";
import { InGameManager } from "./inGameManager";

export interface InGameDirectorSnapshot {
  readonly playerLoopNode: "Update.ScriptRunBehaviourUpdate";
  readonly callback: "InGameDirector.Update";
  readonly target: "InGameManager.ExecUpdate";
}

export class InGameDirector {
  constructor(readonly inGameManager: InGameManager) {}

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
    };
  }
}
