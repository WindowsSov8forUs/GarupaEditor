import type { NoteInformation } from "../chart/types";
import { ok, type SimulatorResult } from "../evidence";
import type { InGameMusicScoreController } from "../managers/inGameMusicScoreController";

export interface NoteBpmChangeSnapshot {
  readonly poolIndex: number;
  readonly active: boolean;
  readonly noteIndex: number | null;
  readonly ccNum: number | null;
  readonly bpm: number | null;
  readonly bpmString: string | null;
}

export class NoteBpmChange {
  private activeValue = false;
  private noteInformationValue: NoteInformation | null = null;
  private onBpmChanged: ((note: NoteBpmChange) => void) | null = null;

  constructor(readonly poolIndex: number) {}

  get isActive(): boolean {
    return this.activeValue;
  }

  setup(
    noteInformation: NoteInformation,
    onBpmChanged: (note: NoteBpmChange) => void,
  ): void {
    this.noteInformationValue = noteInformation;
    this.onBpmChanged = onBpmChanged;
    this.activeValue = true;
  }

  execUpdate(
    musicScoreController: InGameMusicScoreController,
  ): SimulatorResult<boolean> {
    const noteInformation = this.noteInformationValue;
    if (!this.activeValue || noteInformation === null) {
      return ok(false);
    }

    const threshold = Math.trunc(
      Math.imul(192, noteInformation.numerator) / noteInformation.denominator,
    ) | 0;
    const reached =
      musicScoreController.currentBar > noteInformation.barIndex ||
      (musicScoreController.currentBar === noteInformation.barIndex &&
        musicScoreController.currentBeatProgress >= threshold);
    if (!reached) {
      return ok(false);
    }

    musicScoreController.updateBpm(
      noteInformation.bpm,
      noteInformation.bpmString,
    );
    this.activeValue = false;
    this.onBpmChanged?.(this);
    return ok(true);
  }

  snapshot(): NoteBpmChangeSnapshot {
    return {
      poolIndex: this.poolIndex,
      active: this.activeValue,
      noteIndex: this.noteInformationValue?.index ?? null,
      ccNum: this.noteInformationValue?.ccNum ?? null,
      bpm: this.noteInformationValue?.bpm ?? null,
      bpmString: this.noteInformationValue?.bpmString ?? null,
    };
  }
}
