import type {
  ChartConstructionResult,
  NoteBatchInformation,
  NoteInformation,
} from "../chart/types";
import { ButtonType } from "../chart/types";
import type { MusicPosition } from "../data/noteData";
import { ok, type SimulatorResult } from "../evidence";

export const MUSIC_BAR_DIVISION_COUNT = 192;
const LAUNCHER_LEAD_SECONDS = Math.fround(0.8);
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
  readonly tempoQueryTrace: readonly TempoQueryTraceEntry[];
}

export interface TempoQueryTraceEntry {
  readonly queryIndex: number;
  readonly position: number;
  readonly bpm: number;
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
  private readonly tempoQueryTraceValue: TempoQueryTraceEntry[] = [];
  private readonly tempoCommands: readonly NoteInformation[];

  constructor(chart: ChartConstructionResult) {
    this.basicBpmValue = Math.fround(chart.startBpm);
    this.basicBpmStringValue = chart.startBpmString;
    this.currentBpmValue = this.basicBpmValue;
    this.currentBpmStringValue = this.basicBpmStringValue;
    this.nextBpmValue = this.basicBpmValue;
    this.nextBpmStringValue = this.basicBpmStringValue;
    let launcherLead = Math.fround(
      this.basicBpmValue * LAUNCHER_LEAD_SECONDS,
    );
    if (launcherLead >= MUSIC_BAR_DIVISION_COUNT) {
      launcherLead = Math.fround(launcherLead - MUSIC_BAR_DIVISION_COUNT);
      this.launcherMusicBarProgressValue = 1;
    }
    this.launcherMusicBeatProgressValue = launcherLead;
    this.tempoCommands = chart.noteBatches.flatMap((batch) => {
      const command = batch.informationList.find(isBpmCommand);
      return command === undefined ? [] : [command];
    });
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
    return this.calculateAdjustedMusicPosition(offsetFrames, true);
  }

  peekAdjustedMusicPosition(offsetFrames: number): number {
    return this.calculateAdjustedMusicPosition(offsetFrames, false);
  }

  private calculateAdjustedMusicPosition(
    offsetFrames: number,
    recordTempoQueries: boolean,
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
          this.bpmAtPosition(absolutePosition(cursor), recordTempoQueries),
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
      tempoQueryTrace: this.tempoQueryTraceValue.map((entry) => ({ ...entry })),
    };
  }

  private bpmAtPosition(position: number, recordQuery = true): number {
    let bpm = this.basicBpmValue;
    for (const command of this.tempoCommands) {
      if (command.absolutePos > position) {
        break;
      }
      bpm = Math.fround(command.bpm);
    }
    if (recordQuery) {
      this.tempoQueryTraceValue.push({
        queryIndex: this.tempoQueryTraceValue.length,
        position,
        bpm,
      });
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
