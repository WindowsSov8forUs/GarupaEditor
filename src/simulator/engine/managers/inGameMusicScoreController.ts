import type {
  NoteBatchInformation,
  SimulatorClockProfile,
} from "../data/noteData";
import {
  evidenceRequired,
  type SimulatorResult,
} from "../evidence";

export interface MusicScoreControllerSnapshot {
  readonly currentBpm: number;
  readonly bar: number;
  readonly beatProgress: number;
}

export class InGameMusicScoreController {
  constructor(private readonly profile: SimulatorClockProfile) {}

  advance(_deltaTimeSeconds: number): SimulatorResult<void> {
    return evidenceRequired(
      "music-score.advance",
      ["E03"],
      "The update formula and scheduler position are confirmed, but G01 UnitsPerBar remains evidence-required.",
    );
  }

  canActivateBatch(_batch: NoteBatchInformation): SimulatorResult<boolean> {
    return evidenceRequired(
      "music-score.note-group-activation",
      ["E03", "E04"],
      "The activation order is confirmed, but comparing the absolute group position requires unresolved G01 UnitsPerBar.",
    );
  }

  snapshot(): MusicScoreControllerSnapshot {
    return {
      currentBpm: this.profile.currentBpm.value,
      bar: this.profile.initialMusicPosition.value.bar,
      beatProgress: this.profile.initialMusicPosition.value.beatProgress,
    };
  }
}
