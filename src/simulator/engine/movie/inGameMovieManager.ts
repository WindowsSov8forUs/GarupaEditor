import type {
  MovieBackendSnapshot,
  MovieOperationResult,
  SimulatorMovieBackend,
} from "../../backends/movieContracts";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";

export const InGameMusicVideoState = {
  None: 0,
  WaitingPlay: 1,
  PauseOfWaitingPlay: 2,
  Playing: 3,
  Pause: 4,
} as const;

export type InGameMusicVideoStateValue =
  (typeof InGameMusicVideoState)[keyof typeof InGameMusicVideoState];

export interface InGameMovieManagerSnapshot {
  readonly state: InGameMusicVideoStateValue;
  readonly delayTimerSeconds: number;
  readonly mvDarkness: number;
  readonly darkCoverPhase: "hidden" | "fading" | "steady";
  readonly darkCoverAlpha: number;
  readonly darkCoverElapsedSeconds: number;
  readonly firstFramePresented: boolean;
  readonly visible: boolean;
  readonly finished: boolean;
  readonly backend: MovieBackendSnapshot;
}

export class InGameMovieManager {
  private stateValue: InGameMusicVideoStateValue = InGameMusicVideoState.None;
  private timerValue = Math.fround(0);
  private initialized = false;
  private disposed = false;
  private darkCoverPhaseValue: "hidden" | "fading" | "steady" = "hidden";
  private darkCoverAlphaValue = Math.fround(0);
  private darkCoverElapsedValue = Math.fround(0);

  constructor(
    private readonly sessionId: string,
    private readonly backend: SimulatorMovieBackend,
    private readonly mvDarkness: number,
  ) {}

  initialize(): SimulatorResult<void> {
    if (this.disposed) return rejected("movie.manager.initialize-after-dispose", "A disposed movie manager cannot be reconstructed.");
    if (!Number.isInteger(this.mvDarkness) || this.mvDarkness < 0 || this.mvDarkness > 70 || this.mvDarkness % 10 !== 0) {
      return rejected("movie.manager.invalid-mv-darkness", "MvDarkness must remain one persisted setting value 0..70 in steps of ten.");
    }
    if (this.initialized) return ok(undefined);
    const observed = mapMovieResult(this.backend.observe());
    if (observed.status !== "ok") return observed;
    if (observed.value.state !== "ready" || observed.value.sessionId !== this.sessionId ||
      observed.value.resourceCount !== 1 || observed.value.fault !== null ||
      observed.value.muted !== true || observed.value.loop !== false) {
      return rejected(
        "movie.manager.backend-not-ready",
        "MV engine ownership requires the exact prepared session, one muted non-looping resource and no backend fault before startup mutation.",
      );
    }
    this.initialized = true;
    return ok(undefined);
  }

  enterWaitingPlay(): SimulatorResult<void> {
    if (!this.available() || this.stateValue !== InGameMusicVideoState.None) {
      return rejected("movie.manager.invalid-waiting-transition", "Negative MV delay enters WaitingPlay exactly once from None after BGM resume.");
    }
    this.stateValue = InGameMusicVideoState.WaitingPlay;
    this.timerValue = Math.fround(0);
    return ok(undefined);
  }

  play(): SimulatorResult<void> {
    if (!this.available() ||
      (this.stateValue !== InGameMusicVideoState.None &&
        this.stateValue !== InGameMusicVideoState.WaitingPlay)) {
      return rejected("movie.manager.invalid-play-transition", "MV Play is reached exactly from None for non-negative delay or WaitingPlay after a negative delay timer.");
    }
    const cover = this.fadeInDarkCover();
    if (cover.status !== "ok") return cover;
    const played = mapMovieResult(this.backend.play());
    if (played.status !== "ok") return played;
    this.stateValue = InGameMusicVideoState.Playing;
    return ok(undefined);
  }

  stepNegativeDelay(deltaTimeSeconds: number, targetSeconds: number): SimulatorResult<boolean> {
    if (!this.available() || !isExactNonNegativeFloat32(deltaTimeSeconds) ||
      !isExactNonNegativeFloat32(targetSeconds)) {
      return rejected("movie.manager.invalid-delay-step", "Negative MV delay consumes only exact non-negative Float32 engine delta and target values.");
    }
    const observed = this.observeAndPublishFirstFrame();
    if (observed.status !== "ok") return observed;
    if (this.stateValue === InGameMusicVideoState.PauseOfWaitingPlay) return ok(false);
    if (this.stateValue !== InGameMusicVideoState.WaitingPlay) {
      return ok(this.stateValue === InGameMusicVideoState.Playing || observed.value.ended);
    }
    const next = Math.fround(this.timerValue + deltaTimeSeconds);
    this.timerValue = next;
    if (next < targetSeconds) return ok(false);
    const played = this.play();
    return played.status === "ok" ? ok(true) : played;
  }

  advanceDarkCover(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.available() || !isExactNonNegativeFloat32(deltaTimeSeconds)) {
      return rejected("movie.manager.invalid-dark-cover-step", "MV dark-cover tween consumes only initialized exact non-negative Float32 engine delta.");
    }
    if (this.darkCoverPhaseValue !== "fading") return ok(undefined);
    const duration = Math.fround(0.8);
    this.darkCoverElapsedValue = Math.fround(this.darkCoverElapsedValue + deltaTimeSeconds);
    const ratio = Math.fround(Math.min(1, this.darkCoverElapsedValue / duration));
    const target = Math.fround(this.mvDarkness / 100);
    this.darkCoverAlphaValue = Math.fround(1 + (target - 1) * ratio);
    const published = mapMovieResult(this.backend.setDarkCover(this.darkCoverAlphaValue, true));
    if (published.status !== "ok") return published;
    if (ratio === 1) this.darkCoverPhaseValue = "steady";
    return ok(undefined);
  }

  observeAndPublishFirstFrame(): SimulatorResult<MovieBackendSnapshot> {
    if (!this.available()) return rejected("movie.manager.observe-unavailable", "Movie observation requires one initialized live owner.");
    const observed = mapMovieResult(this.backend.observe());
    if (observed.status !== "ok") return observed;
    const snapshot = observed.value;
    if (snapshot.ended && this.darkCoverPhaseValue !== "hidden") {
      const hidden = this.hideDarkCover();
      if (hidden.status !== "ok") return hidden;
    }
    if (snapshot.firstFramePresented && !snapshot.visible && !snapshot.outputSuppressed &&
      this.stateValue === InGameMusicVideoState.Playing && !snapshot.ended) {
      const visible = mapMovieResult(this.backend.setVisible(true));
      if (visible.status !== "ok") return visible;
      const published = mapMovieResult(this.backend.observe());
      if (published.status !== "ok") return published;
      return published;
    }
    return ok(snapshot);
  }

  pause(): SimulatorResult<void> {
    if (!this.available()) return rejected("movie.manager.pause-unavailable", "Movie pause requires one initialized owner.");
    if (this.stateValue === InGameMusicVideoState.WaitingPlay) {
      this.stateValue = InGameMusicVideoState.PauseOfWaitingPlay;
      return ok(undefined);
    }
    if (this.stateValue !== InGameMusicVideoState.Playing) {
      return rejected("movie.manager.invalid-pause-transition", "Sound pause maps only WaitingPlay→PauseOfWaitingPlay or Playing→Pause.");
    }
    const paused = mapMovieResult(this.backend.pause());
    if (paused.status !== "ok") return paused;
    this.stateValue = InGameMusicVideoState.Pause;
    return ok(undefined);
  }

  resume(): SimulatorResult<void> {
    if (!this.available()) return rejected("movie.manager.resume-unavailable", "Movie resume requires one initialized owner.");
    if (this.stateValue === InGameMusicVideoState.PauseOfWaitingPlay) {
      this.stateValue = InGameMusicVideoState.WaitingPlay;
      return ok(undefined);
    }
    if (this.stateValue !== InGameMusicVideoState.Pause) {
      return rejected("movie.manager.invalid-resume-transition", "Sound resume maps only PauseOfWaitingPlay→WaitingPlay or Pause→Playing.");
    }
    const resumed = mapMovieResult(this.backend.resume());
    if (resumed.status !== "ok") return resumed;
    this.stateValue = InGameMusicVideoState.Playing;
    return ok(undefined);
  }

  stop(): SimulatorResult<void> {
    if (this.disposed) return ok(undefined);
    const hidden = this.darkCoverPhaseValue === "hidden" ? ok(undefined) : this.hideDarkCover();
    if (hidden.status !== "ok") return hidden;
    const stopped = mapMovieResult(this.backend.stop());
    return stopped.status === "ok" ? stopped : stopped;
  }

  snapshot(): InGameMovieManagerSnapshot {
    const backend = this.backend.snapshot();
    return Object.freeze({
      state: this.stateValue,
      delayTimerSeconds: this.timerValue,
      mvDarkness: this.mvDarkness,
      darkCoverPhase: this.darkCoverPhaseValue,
      darkCoverAlpha: this.darkCoverAlphaValue,
      darkCoverElapsedSeconds: this.darkCoverElapsedValue,
      firstFramePresented: backend.firstFramePresented,
      visible: backend.visible,
      finished: backend.ended,
      backend,
    });
  }

  dispose(): void {
    this.disposed = true;
  }

  private fadeInDarkCover(): SimulatorResult<void> {
    if (!this.available() || this.darkCoverPhaseValue !== "hidden") {
      return rejected("movie.manager.invalid-dark-cover-fade", "Gameplay MV starts its dark-cover tween exactly once before Movie Play.");
    }
    this.darkCoverPhaseValue = "fading";
    this.darkCoverElapsedValue = Math.fround(0);
    this.darkCoverAlphaValue = Math.fround(1);
    return mapMovieResult(this.backend.setDarkCover(this.darkCoverAlphaValue, true));
  }

  private hideDarkCover(): SimulatorResult<void> {
    const hidden = mapMovieResult(this.backend.setDarkCover(Math.fround(0), false));
    if (hidden.status !== "ok") return hidden;
    this.darkCoverPhaseValue = "hidden";
    this.darkCoverElapsedValue = Math.fround(0);
    this.darkCoverAlphaValue = Math.fround(0);
    return ok(undefined);
  }

  private available(): boolean {
    return this.initialized && !this.disposed;
  }
}

export function mapMovieResult<T>(
  result: MovieOperationResult<T>,
): SimulatorResult<T> {
  return result.status === "accepted"
    ? ok(result.value)
    : integrityFailure(
        result.failure.capability,
        ["MVL-E41", "MVL-E42", "MVL-R01", "MVL-R02", "MVL-P01", "MVL-P02"],
        result.failure.boundary,
      );
}

function isExactNonNegativeFloat32(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Object.is(value, Math.fround(value));
}

function rejected(capability: string, boundary: string): ReturnType<typeof integrityFailure> {
  return integrityFailure(
    capability,
    ["MVL-E41", "MVL-E42", "MVL-E65", "MVL-E66", "MVL-R01", "MVL-R03", "MVL-R04"],
    boundary,
  );
}
