import type {
  MovieBackendFault,
  MovieBackendSnapshot,
  MovieBackendState,
  MovieOperationResult,
  MoviePreparedResource,
  MovieResourceProfile,
  PreparedSessionMovieResource,
  SimulatorMovieBackend,
} from "./movieContracts";
import {
  movieAccepted,
  movieRejected,
  validateMoviePreparedResource,
  validateMovieResourceProfile,
} from "./movieValidation";

export class RecordingSimulatorMovieBackend implements SimulatorMovieBackend {
  readonly id = "recording-movie";

  private state: MovieBackendState = "unprepared";
  private sessionId: string | null = null;
  private profile: MovieResourceProfile | null = null;
  private prepared: MoviePreparedResource | null = null;
  private currentTimeSeconds: number | null = null;
  private visible = false;
  private firstFramePresented = false;
  private darkCoverVisible = false;
  private darkCoverAlpha = Math.fround(0);
  private fault: MovieBackendFault | null = null;
  private suppressed: boolean;

  constructor(outputSuppressed = false) {
    this.suppressed = outputSuppressed;
  }

  async prepare(
    sessionId: string,
    resource: PreparedSessionMovieResource,
  ): Promise<MovieOperationResult<void>> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "unprepared" || typeof sessionId !== "string" || sessionId.length === 0 ||
      resource === null || typeof resource !== "object" ||
      !(resource.bytes instanceof Uint8Array)) {
      return this.reject("movie.recording.invalid-prepare", "Recording movie preparation requires one fresh session, owned bytes and exact derived resource.");
    }
    const profile = validateMovieResourceProfile(resource.profile);
    if (profile.status !== "accepted") return profile;
    const prepared = validateMoviePreparedResource(resource.prepared, profile.value.container);
    if (prepared.status !== "accepted") return prepared;
    if (resource.bytes.byteLength !== profile.value.byteLength ||
      prepared.value.metadata.durationSeconds !== profile.value.durationSeconds ||
      prepared.value.metadata.width !== profile.value.width ||
      prepared.value.metadata.height !== profile.value.height) {
      return movieRejected(
        "movie-resource-integrity",
        "movie.recording.resource-profile-mismatch",
        "Prepared browser metadata and byte length must match the immutable derived movie profile.",
      );
    }
    this.sessionId = sessionId;
    this.profile = profile.value;
    this.prepared = prepared.value;
    this.currentTimeSeconds = 0;
    this.state = "ready";
    return movieAccepted(undefined);
  }

  play(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "ready") return this.invalid("play", "ready");
    this.state = "playing";
    this.firstFramePresented = true;
    return movieAccepted(undefined);
  }

  pause(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "playing") return this.invalid("pause", "playing");
    this.state = "paused";
    return movieAccepted(undefined);
  }

  resume(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "paused") return this.invalid("resume", "paused");
    this.state = "playing";
    return movieAccepted(undefined);
  }

  stop(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (!["ready", "play-pending", "playing", "paused", "seeking", "ended"].includes(this.state)) {
      return this.invalid("stop", "prepared");
    }
    this.state = "ended";
    this.visible = false;
    return movieAccepted(undefined);
  }

  seek(seconds: number): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.profile === null || this.currentTimeSeconds === null ||
      typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 ||
      seconds > this.profile.durationSeconds || this.state === "unprepared") {
      return this.reject("movie.recording.invalid-seek", "Movie seek requires one prepared owner and an unclamped finite target inside its decoded duration.");
    }
    this.currentTimeSeconds = seconds;
    if (this.state === "ended") this.state = "paused";
    return movieAccepted(undefined);
  }

  setVisible(visible: boolean): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (typeof visible !== "boolean" || this.profile === null ||
      (visible && (!this.firstFramePresented || this.suppressed || this.state === "ended"))) {
      return this.reject("movie.recording.invalid-visibility", "Movie visibility requires a decoded presented frame, a live owner and unsuppressed physical output.");
    }
    this.visible = visible;
    return movieAccepted(undefined);
  }

  setDarkCover(alpha: number, visible: boolean): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.profile === null || typeof visible !== "boolean" ||
      !Number.isFinite(alpha) || alpha < 0 || alpha > 1 ||
      !Object.is(alpha, Math.fround(alpha))) {
      return this.reject(
        "movie.recording.invalid-dark-cover",
        "Gameplay MV dark cover requires one prepared owner, exact Float32 unit alpha and explicit visibility.",
      );
    }
    this.darkCoverAlpha = alpha;
    this.darkCoverVisible = visible;
    return movieAccepted(undefined);
  }

  publishSuppressedOutput(seconds: number, playing: boolean): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (!this.suppressed || typeof playing !== "boolean") {
      return this.reject("movie.recording.invalid-suppressed-publication", "Only one move-time candidate movie may publish one explicit target state.");
    }
    const sought = this.seek(seconds);
    if (sought.status !== "accepted") return sought;
    this.suppressed = false;
    this.state = playing ? "playing" : "paused";
    this.firstFramePresented = true;
    this.visible = playing;
    return movieAccepted(undefined);
  }

  observe(): MovieOperationResult<MovieBackendSnapshot> {
    const terminal = this.terminal<MovieBackendSnapshot>();
    return terminal ?? movieAccepted(this.snapshot());
  }

  notifyNaturalEnd(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "playing") return this.invalid("natural-end", "playing");
    this.state = "ended";
    this.visible = false;
    if (this.profile !== null) this.currentTimeSeconds = this.profile.durationSeconds;
    return movieAccepted(undefined);
  }

  recordTerminalFault(capability: string, boundary: string): MovieOperationResult<never> {
    if (this.state === "disposed") return this.disposed();
    if (this.fault === null) {
      this.fault = Object.freeze({ capability, boundary });
      this.state = "faulted";
      this.visible = false;
    }
    return movieRejected("movie-backend-fault", this.fault.capability, this.fault.boundary);
  }

  snapshot(): MovieBackendSnapshot {
    return Object.freeze({
      state: this.state,
      sessionId: this.sessionId,
      logicalId: this.profile?.logicalId ?? null,
      resourceCount: this.prepared === null ? 0 as const : 1 as const,
      currentTimeSeconds: this.currentTimeSeconds,
      visible: this.visible,
      outputSuppressed: this.suppressed,
      firstFramePresented: this.firstFramePresented,
      ended: this.state === "ended",
      muted: this.profile?.muted ?? null,
      loop: this.profile?.loop ?? null,
      stageParentAttached: null,
      movieSpriteAlpha: 1,
      darkCoverVisible: this.darkCoverVisible,
      darkCoverAlpha: this.darkCoverAlpha,
      fault: this.fault === null ? null : Object.freeze({ ...this.fault }),
    });
  }

  dispose(): MovieOperationResult<void> {
    if (this.state === "disposed") return this.disposed();
    let failure: MovieOperationResult<void> | null = null;
    try { this.prepared?.release(); } catch {
      failure = movieRejected(
        "movie-backend-fault",
        "movie.recording.release-threw",
        "Recording movie resource release threw after terminal ownership was cleared.",
      );
    }
    this.prepared = null;
    this.profile = null;
    this.sessionId = null;
    this.currentTimeSeconds = null;
    this.visible = false;
    this.darkCoverVisible = false;
    this.darkCoverAlpha = Math.fround(0);
    this.state = "disposed";
    return failure ?? movieAccepted(undefined);
  }

  private terminal<T>(): MovieOperationResult<T> | null {
    if (this.state === "disposed") return this.disposed();
    if (this.fault !== null) return movieRejected("movie-backend-fault", this.fault.capability, this.fault.boundary);
    return null;
  }
  private disposed<T = never>(): MovieOperationResult<T> {
    return movieRejected("terminal-disposed", "movie.lifecycle.terminal-disposed", "Disposed movie sessions reject before argument validation and are never reused.");
  }
  private invalid(operation: string, expected: string): MovieOperationResult<never> {
    return this.reject(`movie.recording.invalid-${operation}-state`, `Movie ${operation} requires ${expected} state and has no implicit correction.`);
  }
  private reject(capability: string, boundary: string): MovieOperationResult<never> {
    return movieRejected("integrity-failure", capability, boundary);
  }
}
