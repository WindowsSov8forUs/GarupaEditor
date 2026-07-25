import type {
  MusicPosition,
  FirstSliceNoteBatchFixture,
  SimulatorClockProfile,
} from "../data/noteData";
import {
  ok,
  type SimulatorResult,
} from "../evidence";

export const MUSIC_BAR_DIVISION_COUNT = 192;

export interface MusicScoreControllerSnapshot {
  readonly executeFrame: number;
  readonly currentBpm: number;
  readonly nextBpm: number;
  readonly bar: number;
  readonly beatProgress: number;
  readonly launcherBar: number;
  readonly launcherBeatProgress: number;
  readonly musicPosition: number;
  readonly launcherMusicPosition: number;
}

export class InGameMusicScoreController {
  private executeFrameValue = 0;
  private readonly currentBpmValue: number;
  private readonly nextBpmValue: number;
  private musicBarProgressValue: number;
  private musicBeatProgressValue: number;
  private launcherMusicBarProgressValue: number;
  private launcherMusicBeatProgressValue: number;

  constructor(profile: SimulatorClockProfile) {
    this.currentBpmValue = Math.fround(profile.currentBpm.value);
    this.nextBpmValue = Math.fround(profile.nextBpm.value);
    this.musicBarProgressValue = profile.initialMusicPosition.value.bar | 0;
    this.musicBeatProgressValue = Math.fround(
      profile.initialMusicPosition.value.beatProgress,
    );
    this.launcherMusicBarProgressValue =
      profile.initialLauncherMusicPosition.value.bar | 0;
    this.launcherMusicBeatProgressValue = Math.fround(
      profile.initialLauncherMusicPosition.value.beatProgress,
    );
  }

  setExecuteFrame(executeFrame: number): void {
    this.executeFrameValue = Math.fround(executeFrame);
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
    return ok(undefined);
  }

  canActivateBatch(batch: FirstSliceNoteBatchFixture): SimulatorResult<boolean> {
    if (batch.informationList.length === 0) {
      return ok(true);
    }
    if (
      batch.informationList[0].barIndex.value < this.musicBarProgressValue
    ) {
      return ok(false);
    }

    const batchPosition = batchAbsolutePosition(batch);
    const musicPosition = this.musicPosition();
    return ok(
      musicPosition < batchPosition &&
        batchPosition <= this.launcherMusicPosition(),
    );
  }

  snapshot(): MusicScoreControllerSnapshot {
    return {
      executeFrame: this.executeFrameValue,
      currentBpm: this.currentBpmValue,
      nextBpm: this.nextBpmValue,
      bar: this.musicBarProgressValue,
      beatProgress: this.musicBeatProgressValue,
      launcherBar: this.launcherMusicBarProgressValue,
      launcherBeatProgress: this.launcherMusicBeatProgressValue,
      musicPosition: this.musicPosition(),
      launcherMusicPosition: this.launcherMusicPosition(),
    };
  }

  private musicPosition(): number {
    return Math.fround(
      this.musicBeatProgressValue +
        Math.imul(MUSIC_BAR_DIVISION_COUNT, this.musicBarProgressValue),
    );
  }

  private launcherMusicPosition(): number {
    return Math.fround(
      this.launcherMusicBeatProgressValue +
        Math.imul(
          MUSIC_BAR_DIVISION_COUNT,
          this.launcherMusicBarProgressValue,
        ),
    );
  }
}

function advancePosition(
  bar: number,
  beatProgress: number,
  bpm: number,
  deltaTimeSeconds: number,
): MusicPosition {
  const barSeconds = Math.fround(240 / bpm);
  const secondsPerPosition = Math.fround(
    barSeconds / MUSIC_BAR_DIVISION_COUNT,
  );
  let nextProgress = Math.fround(
    beatProgress + Math.fround(deltaTimeSeconds / secondsPerPosition),
  );
  let nextBar = bar;
  if (nextProgress >= MUSIC_BAR_DIVISION_COUNT) {
    nextProgress = Math.fround(nextProgress - MUSIC_BAR_DIVISION_COUNT);
    nextBar = (nextBar + 1) | 0;
  }
  return { bar: nextBar, beatProgress: nextProgress };
}

function batchAbsolutePosition(batch: FirstSliceNoteBatchFixture): number {
  const fractionalPosition =
    batch.denominator.value === 0
      ? 0
      : Math.trunc(
          Math.imul(batch.numerator.value, MUSIC_BAR_DIVISION_COUNT) /
            batch.denominator.value,
        ) | 0;
  return (
    Math.imul(batch.barIndex.value, MUSIC_BAR_DIVISION_COUNT) +
    fractionalPosition
  ) | 0;
}
