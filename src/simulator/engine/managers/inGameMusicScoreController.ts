import type { SimulatorClockProfile } from "../data/noteData";
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
      "The update formula is confirmed, but UnitsPerBar remains evidence-bound and scheduler integration belongs to T07.",
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
