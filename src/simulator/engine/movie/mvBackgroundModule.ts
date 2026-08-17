import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import {
  InGameMovieManager,
  InGameMusicVideoState,
  type InGameMovieManagerSnapshot,
} from "./inGameMovieManager";

export interface MvBackgroundModuleSnapshot {
  readonly musicStartDelayMilliseconds: number;
  readonly delaySign: "negative" | "zero" | "positive";
  readonly beforeSoundStarted: boolean;
  readonly beforeSoundElapsedSeconds: number;
  readonly beforeSoundDone: boolean;
  readonly afterSoundStarted: boolean;
  readonly manager: InGameMovieManagerSnapshot;
}

export class MvBackgroundModule {
  private beforeStarted = false;
  private beforeElapsed = Math.fround(0);
  private beforeDone = false;
  private afterStarted = false;
  private initialized = false;
  private disposed = false;

  constructor(
    private readonly manager: InGameMovieManager,
    readonly musicStartDelayMilliseconds: number,
  ) {}

  initialize(): SimulatorResult<void> {
    if (this.disposed || !Number.isInteger(this.musicStartDelayMilliseconds) ||
      this.musicStartDelayMilliseconds < -0x80000000 ||
      this.musicStartDelayMilliseconds > 0x7fffffff) {
      return rejected("movie.background.invalid-initialize", "MV background requires one live manager and the exact signed Int32 master delay.");
    }
    if (this.initialized) return ok(undefined);
    const initialized = this.manager.initialize();
    if (initialized.status === "ok") this.initialized = true;
    return initialized;
  }

  startBeforeSound(): SimulatorResult<void> {
    if (!this.available() || this.beforeStarted) {
      return rejected("movie.background.repeated-before-sound", "MovieBeforeSound enters the signed pre-sound owner exactly once.");
    }
    this.beforeStarted = true;
    if (this.musicStartDelayMilliseconds < 0) {
      this.beforeDone = true;
      return ok(undefined);
    }
    const played = this.manager.play();
    if (played.status !== "ok") return played;
    this.beforeDone = this.musicStartDelayMilliseconds === 0;
    return ok(undefined);
  }

  stepBeforeSound(deltaTimeSeconds: number): SimulatorResult<boolean> {
    if (!this.available() || !this.beforeStarted ||
      !Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0 ||
      !Object.is(deltaTimeSeconds, Math.fround(deltaTimeSeconds))) {
      return rejected("movie.background.invalid-before-sound-step", "The pre-sound MV wait consumes exact non-negative Float32 engine delta after MovieBeforeSound starts.");
    }
    const observed = this.manager.observeAndPublishFirstFrame();
    if (observed.status !== "ok") return observed;
    if (this.beforeDone) return ok(true);
    const target = Math.fround(this.musicStartDelayMilliseconds / 1000);
    this.beforeElapsed = Math.fround(this.beforeElapsed + deltaTimeSeconds);
    if (this.beforeElapsed >= target) this.beforeDone = true;
    return ok(this.beforeDone);
  }

  startAfterSound(): SimulatorResult<void> {
    if (!this.available() || this.afterStarted || !this.beforeDone) {
      return rejected("movie.background.invalid-after-sound-start", "The post-sound MV owner starts exactly once after the signed pre-sound branch and BGM publication.");
    }
    this.afterStarted = true;
    return this.musicStartDelayMilliseconds < 0
      ? this.manager.enterWaitingPlay()
      : ok(undefined);
  }

  step(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.available() || !Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0 ||
      !Object.is(deltaTimeSeconds, Math.fround(deltaTimeSeconds))) {
      return rejected("movie.background.invalid-step", "MV background consumes only initialized exact non-negative Float32 engine delta.");
    }
    if (this.afterStarted && this.musicStartDelayMilliseconds < 0 &&
      (this.manager.snapshot().state === InGameMusicVideoState.WaitingPlay ||
        this.manager.snapshot().state === InGameMusicVideoState.PauseOfWaitingPlay)) {
      const target = Math.fround(-this.musicStartDelayMilliseconds / 1000);
      const delayed = this.manager.stepNegativeDelay(deltaTimeSeconds, target);
      return delayed.status === "ok" ? ok(undefined) : delayed;
    }
    const observed = this.manager.observeAndPublishFirstFrame();
    return observed.status === "ok" ? ok(undefined) : observed;
  }

  pause(): SimulatorResult<void> {
    return this.manager.pause();
  }

  resume(): SimulatorResult<void> {
    return this.manager.resume();
  }

  stop(): SimulatorResult<void> {
    return this.manager.stop();
  }

  snapshot(): MvBackgroundModuleSnapshot {
    return Object.freeze({
      musicStartDelayMilliseconds: this.musicStartDelayMilliseconds,
      delaySign: this.musicStartDelayMilliseconds < 0
        ? "negative" as const
        : this.musicStartDelayMilliseconds === 0
          ? "zero" as const
          : "positive" as const,
      beforeSoundStarted: this.beforeStarted,
      beforeSoundElapsedSeconds: this.beforeElapsed,
      beforeSoundDone: this.beforeDone,
      afterSoundStarted: this.afterStarted,
      manager: this.manager.snapshot(),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.manager.dispose();
  }

  private available(): boolean {
    return this.initialized && !this.disposed;
  }
}

function rejected(capability: string, boundary: string): ReturnType<typeof evidenceRequired> {
  return evidenceRequired(
    capability,
    ["MVL-E41", "MVL-E42", "MVL-R01", "MVL-R02", "MVL-R07"],
    boundary,
  );
}
