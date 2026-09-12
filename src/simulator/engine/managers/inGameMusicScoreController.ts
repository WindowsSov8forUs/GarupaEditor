import type {
  ChartConstructionResult,
  NoteBatchInformation,
  NoteInformation,
} from "../chart/types";
import { ButtonType } from "../chart/types";
import type { MusicPosition } from "../data/noteData";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";

export const MUSIC_BAR_DIVISION_COUNT = 192;
const JUDGE_OFFSET_STEP_SECONDS = Math.fround(1 / 60);

export interface MusicScoreControllerSnapshot {
  readonly executeFrame: number;
  readonly basicBpm: number;
  readonly basicBpmString: string;
  readonly currentBpm: number;
  readonly currentBpmString: string;
  readonly nextBpm: number;
  readonly nextBpmString: string;
  readonly bar: number;
  readonly beatProgress: number;
  readonly launcherBar: number;
  readonly launcherBeatProgress: number;
  readonly musicPosition: number;
  readonly launcherMusicPosition: number;
  readonly musicPositionCallbackCount: number;
}

export class InGameMusicScoreController {
  private executeFrameValue = 0;
  private readonly basicBpmValue: number;
  private readonly basicBpmStringValue: string;
  private currentBpmValue: number;
  private currentBpmStringValue: string;
  private nextBpmValue: number;
  private nextBpmStringValue: string;
  private musicBarProgressValue = 0;
  private musicBeatProgressValue = 0;
  private launcherMusicBarProgressValue = 0;
  private launcherMusicBeatProgressValue: number;
  private musicPositionCallbackCountValue = 0;
  private readonly tempoCommands: readonly NoteInformation[];

  constructor(chart: ChartConstructionResult, noteArrivalSeconds: number) {
    this.basicBpmValue = Math.fround(chart.startBpm);
    this.basicBpmStringValue = chart.startBpmString;
    this.currentBpmValue = this.basicBpmValue;
    this.currentBpmStringValue = this.basicBpmStringValue;
    this.nextBpmValue = this.basicBpmValue;
    this.nextBpmStringValue = this.basicBpmStringValue;
    const launcherLead = Math.fround(Math.fround(
      Math.fround(noteArrivalSeconds * this.basicBpmValue) / 240,
    ) * MUSIC_BAR_DIVISION_COUNT);
    // Carry every complete bar without an unbounded Float32 subtraction loop.
    this.launcherMusicBarProgressValue = Math.floor(launcherLead / MUSIC_BAR_DIVISION_COUNT);
    this.launcherMusicBeatProgressValue = Math.fround(launcherLead % MUSIC_BAR_DIVISION_COUNT);
    this.tempoCommands = chart.noteBatches.flatMap((batch) => {
      const command = batch.informationList.find(isBpmCommand);
      return command === undefined ? [] : [command];
    });
  }

  validateAdvanceSequence(
    deltaTimeSeconds: number,
    substepCount: number,
  ): SimulatorResult<void> {
    const delta = Math.fround(deltaTimeSeconds);
    if (
      !Number.isFinite(delta) ||
      delta < 0 ||
      !Number.isInteger(substepCount) ||
      substepCount < 1 ||
      substepCount > 4
    ) {
      return integrityFailure(
        "music-score.non-finite-advance",
        ["U03", "U04", "R04"],
        "The portable scheduler must reject an advance sequence that cannot retain finite recovered Float32 music positions.",
      );
    }
    const fastestBpm = Math.max(
      this.basicBpmValue,
      this.currentBpmValue,
      this.nextBpmValue,
      ...this.tempoCommands.map((command) => Math.fround(command.bpm)),
    );
    let musicBar = this.musicBarProgressValue;
    let musicBeat = this.musicBeatProgressValue;
    let launcherBar = this.launcherMusicBarProgressValue;
    let launcherBeat = this.launcherMusicBeatProgressValue;
    for (let index = 0; index < substepCount; index += 1) {
      const musicAdvance = advancePosition(musicBar, musicBeat, fastestBpm, delta);
      const launcherAdvance = advancePosition(
        launcherBar,
        launcherBeat,
        fastestBpm,
        delta,
      );
      if (
        !Number.isFinite(musicAdvance.beatProgress) ||
        !Number.isFinite(launcherAdvance.beatProgress) ||
        !Number.isFinite(absolutePosition(musicAdvance)) ||
        !Number.isFinite(absolutePosition(launcherAdvance))
      ) {
        return integrityFailure(
          "music-score.non-finite-advance",
          ["U03", "U04", "R04"],
          "The portable scheduler must reject an advance sequence before it writes a non-finite recovered Float32 music position.",
        );
      }
      musicBar = musicAdvance.bar;
      musicBeat = musicAdvance.beatProgress;
      launcherBar = launcherAdvance.bar;
      launcherBeat = launcherAdvance.beatProgress;
    }
    return ok(undefined);
  }

  get executeFrame(): number {
    return this.executeFrameValue;
  }

  setExecuteFrame(executeFrame: number): void {
    this.executeFrameValue = Math.fround(executeFrame);
  }

  updateNextBpm(bpm: number, bpmString: string): void {
    this.nextBpmValue = Math.fround(bpm);
    this.nextBpmStringValue = bpmString;
  }

  updateBpm(bpm: number, bpmString: string): void {
    this.currentBpmValue = Math.fround(bpm);
    this.currentBpmStringValue = bpmString;
  }

  advance(deltaTimeSeconds: number): SimulatorResult<void> {
    const validation = this.validateAdvanceSequence(deltaTimeSeconds, 1);
    if (validation.status !== "ok") {
      return validation;
    }
    const delta = Math.fround(deltaTimeSeconds);
    const musicAdvance = advancePosition(
      this.musicBarProgressValue,
      this.musicBeatProgressValue,
      this.currentBpmValue,
      delta,
    );
    this.musicBarProgressValue = musicAdvance.bar;
    this.musicBeatProgressValue = musicAdvance.beatProgress;

    const launcherAdvance = advancePosition(
      this.launcherMusicBarProgressValue,
      this.launcherMusicBeatProgressValue,
      this.nextBpmValue,
      delta,
    );
    this.launcherMusicBarProgressValue = launcherAdvance.bar;
    this.launcherMusicBeatProgressValue = launcherAdvance.beatProgress;
    this.musicPositionCallbackCountValue += 1;
    return ok(undefined);
  }

  canActivateBatch(batch: NoteBatchInformation): SimulatorResult<boolean> {
    if (batch.informationList.every(note => note.laneSpan !== undefined)) {
      return ok(batch.absolutePos <= this.launcherMusicPosition);
    }
    const first = batch.informationList.find(
      (note) => note.buttonType !== ButtonType.None || isBpmCommand(note),
    );
    if (first === undefined) {
      return ok(true);
    }
    if (first.barIndex < this.musicBarProgressValue) {
      return ok(false);
    }
    return ok(
      this.musicPosition < batch.absolutePos &&
        batch.absolutePos <= this.launcherMusicPosition,
    );
  }

  getAdjustedMusicPosition(offsetFrames: number): number {
    return this.calculateAdjustedMusicPosition(offsetFrames);
  }

  peekAdjustedMusicPosition(offsetFrames: number): number {
    return this.calculateAdjustedMusicPosition(offsetFrames);
  }

  private calculateAdjustedMusicPosition(
    offsetFrames: number,
  ): number {
    if (offsetFrames === 0) {
      return this.musicPosition;
    }
    let cursor: MusicPosition = {
      bar: this.musicBarProgressValue,
      beatProgress: this.musicBeatProgressValue,
    };
    if (offsetFrames > 0) {
      for (let index = 0; index < offsetFrames; index += 1) {
        cursor = advancePosition(
          cursor.bar,
          cursor.beatProgress,
          this.bpmAtPosition(absolutePosition(cursor)),
          JUDGE_OFFSET_STEP_SECONDS,
        );
      }
    } else {
      const committedBpm = this.currentBpmValue;
      for (let index = 0; index < -offsetFrames; index += 1) {
        cursor = rewindPosition(
          cursor.bar,
          cursor.beatProgress,
          committedBpm,
          JUDGE_OFFSET_STEP_SECONDS,
        );
      }
    }
    return absolutePosition(cursor);
  }

  get currentBpm(): number {
    return this.currentBpmValue;
  }

  get nextBpm(): number {
    return this.nextBpmValue;
  }

  getBpmAtNotePosition(position: number): number {
    return this.bpmAtPosition(position);
  }

  get currentBar(): number {
    return this.musicBarProgressValue;
  }

  get currentBeatProgress(): number {
    return this.musicBeatProgressValue;
  }

  get musicPosition(): number {
    return absolutePosition({
      bar: this.musicBarProgressValue,
      beatProgress: this.musicBeatProgressValue,
    });
  }

  get launcherMusicPosition(): number {
    return absolutePosition({
      bar: this.launcherMusicBarProgressValue,
      beatProgress: this.launcherMusicBeatProgressValue,
    });
  }

  snapshot(): MusicScoreControllerSnapshot {
    return {
      executeFrame: this.executeFrameValue,
      basicBpm: this.basicBpmValue,
      basicBpmString: this.basicBpmStringValue,
      currentBpm: this.currentBpmValue,
      currentBpmString: this.currentBpmStringValue,
      nextBpm: this.nextBpmValue,
      nextBpmString: this.nextBpmStringValue,
      bar: this.musicBarProgressValue,
      beatProgress: this.musicBeatProgressValue,
      launcherBar: this.launcherMusicBarProgressValue,
      launcherBeatProgress: this.launcherMusicBeatProgressValue,
      musicPosition: this.musicPosition,
      launcherMusicPosition: this.launcherMusicPosition,
      musicPositionCallbackCount: this.musicPositionCallbackCountValue,
    };
  }

  private bpmAtPosition(position: number): number {
    let bpm = this.basicBpmValue;
    let latestPosition = 0;
    for (const command of this.tempoCommands) {
      if (command.absolutePos === position) {
        bpm = Math.fround(command.bpm);
        break;
      }
      if (command.absolutePos < position && command.absolutePos > latestPosition) {
        latestPosition = command.absolutePos;
        bpm = Math.fround(command.bpm);
      }
    }
    return bpm;
  }
}

export function advancePosition(
  bar: number,
  beatProgress: number,
  bpm: number,
  deltaTimeSeconds: number,
): MusicPosition {
  const barSeconds = Math.fround(240 / Math.fround(bpm));
  const secondsPerPosition = Math.fround(
    barSeconds / MUSIC_BAR_DIVISION_COUNT,
  );
  let nextProgress = Math.fround(
    Math.fround(beatProgress) +
      Math.fround(Math.fround(deltaTimeSeconds) / secondsPerPosition),
  );
  let nextBar = bar | 0;
  if (nextProgress >= MUSIC_BAR_DIVISION_COUNT) {
    nextProgress = Math.fround(nextProgress - MUSIC_BAR_DIVISION_COUNT);
    nextBar = (nextBar + 1) | 0;
  }
  return { bar: nextBar, beatProgress: nextProgress };
}

export function rewindPosition(
  bar: number,
  beatProgress: number,
  bpm: number,
  deltaTimeSeconds: number,
): MusicPosition {
  const barSeconds = Math.fround(240 / Math.fround(bpm));
  const secondsPerPosition = Math.fround(
    barSeconds / MUSIC_BAR_DIVISION_COUNT,
  );
  let nextProgress = Math.fround(
    Math.fround(beatProgress) -
      Math.fround(Math.fround(deltaTimeSeconds) / secondsPerPosition),
  );
  let nextBar = bar | 0;
  if (nextProgress < 0) {
    nextProgress = Math.fround(nextProgress + MUSIC_BAR_DIVISION_COUNT);
    nextBar = (nextBar - 1) | 0;
  }
  return { bar: nextBar, beatProgress: nextProgress };
}

function absolutePosition(position: MusicPosition): number {
  return Math.fround(
    Math.fround(position.beatProgress) +
      Math.imul(MUSIC_BAR_DIVISION_COUNT, position.bar),
  );
}

function isBpmCommand(note: NoteInformation): boolean {
  return note.ccNum === 3 || note.ccNum === 8;
}
