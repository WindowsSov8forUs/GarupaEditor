import type {
  MovieBackendSnapshot,
  MovieOperationResult,
  SimulatorMovieBackend,
} from "../../backends/movieContracts";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

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

  constructor(
    private readonly sessionId: string,
    private readonly backend: SimulatorMovieBackend,
  ) {}

  initialize(): SimulatorResult<void> {
    if (this.disposed) return rejected("movie.manager.initialize-after-dispose", "A disposed movie manager cannot be reconstructed.");
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

  observeAndPublishFirstFrame(): SimulatorResult<MovieBackendSnapshot> {
    if (!this.available()) return rejected("movie.manager.observe-unavailable", "Movie observation requires one initialized live owner.");
    const observed = mapMovieResult(this.backend.observe());
    if (observed.status !== "ok") return observed;
    const snapshot = observed.value;
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
    const stopped = mapMovieResult(this.backend.stop());
    return stopped.status === "ok" ? stopped : stopped;
  }

  snapshot(): InGameMovieManagerSnapshot {
    const backend = this.backend.snapshot();
    return Object.freeze({
      state: this.stateValue,
      delayTimerSeconds: this.timerValue,
      firstFramePresented: backend.firstFramePresented,
      visible: backend.visible,
      finished: backend.ended,
      backend,
    });
  }

  dispose(): void {
    this.disposed = true;
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
    : evidenceRequired(
        result.failure.capability,
        ["MVL-E41", "MVL-E42", "MVL-R01", "MVL-R02", "MVL-P01", "MVL-P02"],
        result.failure.boundary,
      );
}

function isExactNonNegativeFloat32(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Object.is(value, Math.fround(value));
}

function rejected(capability: string, boundary: string): ReturnType<typeof evidenceRequired> {
  return evidenceRequired(
    capability,
    ["MVL-E41", "MVL-E42", "MVL-E65", "MVL-E66", "MVL-R01", "MVL-R03", "MVL-R04"],
    boundary,
  );
}
