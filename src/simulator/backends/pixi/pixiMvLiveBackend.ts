import {
  Container,
  Graphics,
  Sprite,
  Texture,
  VideoSource,
} from "pixi.js";
import type {
  MovieBackendFault,
  MovieBackendSnapshot,
  MovieBackendState,
  MovieOperationResult,
  MoviePreparedResource,
  MovieResourceProfile,
  PreparedSessionMovieResource,
  SimulatorMovieBackend,
} from "../movieContracts";
import {
  movieAccepted,
  movieRejected,
  validateMoviePreparedResource,
  validateMovieResourceProfile,
} from "../movieValidation";
import type { OriginalMovieLayout } from "../../scene/originalSurfaceLayout";

export const PIXI_MV_LIVE_STAGE_LABEL = "GarupaSimulatorMvLive";
export const PIXI_MV_LIVE_SPRITE_LABEL = "GarupaSimulatorMvLiveVideo";
export const PIXI_MV_LIVE_DARK_COVER_LABEL = "GarupaSimulatorMvLiveDarkCover";

export class PixiMvLiveBackend implements SimulatorMovieBackend {
  readonly id = "pixi-mv-live";
  readonly stage = new Container({ label: PIXI_MV_LIVE_STAGE_LABEL, sortableChildren: false });

  private state: MovieBackendState = "unprepared";
  private sessionId: string | null = null;
  private profile: MovieResourceProfile | null = null;
  private prepared: MoviePreparedResource | null = null;
  private video: HTMLVideoElement | null = null;
  private source: VideoSource | null = null;
  private texture: Texture | null = null;
  private sprite: Sprite | null = null;
  private darkCover: Graphics | null = null;
  private visible = false;
  private darkCoverVisible = false;
  private darkCoverAlpha = Math.fround(0);
  private firstFramePresented = false;
  private fault: MovieBackendFault | null = null;
  private suppressed: boolean;
  private seekReturnState: "playing" | "paused" = "paused";
  private listenersInstalled = false;

  constructor(
    outputSuppressed: boolean,
    private readonly movieLayout: OriginalMovieLayout,
  ) {
    this.suppressed = outputSuppressed;
    this.stage.sortableChildren = false;
    this.stage.eventMode = "none";
    this.stage.visible = false;
  }

  async prepare(
    sessionId: string,
    resource: PreparedSessionMovieResource,
  ): Promise<MovieOperationResult<void>> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "unprepared" || typeof sessionId !== "string" || sessionId.length === 0 ||
      resource === null || typeof resource !== "object" ||
      !(resource.bytes instanceof Uint8Array) ||
      !Number.isFinite(this.movieLayout.x) || !Number.isFinite(this.movieLayout.y) ||
      !Number.isFinite(this.movieLayout.width) || this.movieLayout.width <= 0 ||
      !Number.isFinite(this.movieLayout.height) || this.movieLayout.height <= 0) {
      return this.reject("movie.pixi.invalid-prepare", "Pixi MV preparation requires one fresh session, one exact simulator-derived browser resource and one original serialized movie-widget layout.");
    }
    const profile = validateMovieResourceProfile(resource.profile);
    if (profile.status !== "accepted") return profile;
    const prepared = validateMoviePreparedResource(resource.prepared, profile.value.container);
    if (prepared.status !== "accepted") return prepared;
    if (typeof HTMLVideoElement !== "function" || !(prepared.value.resource instanceof HTMLVideoElement)) {
      return movieRejected(
        "movie-platform-unavailable",
        "movie.pixi.invalid-browser-resource",
        "Production Pixi MV requires the exact HTMLVideoElement created by local browser preflight.",
      );
    }
    if (resource.bytes.byteLength !== profile.value.byteLength ||
      prepared.value.metadata.durationSeconds !== profile.value.durationSeconds ||
      prepared.value.metadata.width !== profile.value.width ||
      prepared.value.metadata.height !== profile.value.height) {
      return movieRejected(
        "movie-resource-integrity",
        "movie.pixi.resource-profile-mismatch",
        "Prepared video metadata and owned byte length must match the immutable movie profile before Pixi source creation.",
      );
    }
    const video = prepared.value.resource;
    if (!video.muted || !video.defaultMuted || !video.playsInline || video.loop || video.autoplay) {
      return movieRejected(
        "integrity-failure",
        "movie.pixi.invalid-media-flags",
        "Portable MV video is permanently muted, inline, non-looping and explicitly started; browser defaults are not accepted.",
      );
    }
    let source: VideoSource | null = null;
    let texture: Texture | null = null;
    let sprite: Sprite | null = null;
    let darkCover: Graphics | null = null;
    try {
      source = new VideoSource({
        resource: video,
        autoLoad: false,
        autoPlay: false,
        updateFPS: 0,
        loop: false,
        muted: true,
        playsinline: true,
        preload: true,
      });
      await source.load();
      texture = new Texture({ source, label: `${profile.value.logicalId}:texture` });
      sprite = new Sprite({ texture, label: PIXI_MV_LIVE_SPRITE_LABEL });
      sprite.position.set(this.movieLayout.x, this.movieLayout.y);
      sprite.width = this.movieLayout.width;
      sprite.height = this.movieLayout.height;
      sprite.eventMode = "none";
      sprite.visible = false;
      sprite.alpha = 1;
      darkCover = new Graphics({ label: PIXI_MV_LIVE_DARK_COVER_LABEL })
        .rect(this.movieLayout.x, this.movieLayout.y, this.movieLayout.width, this.movieLayout.height)
        .fill({ color: 0x000000 });
      darkCover.eventMode = "none";
      darkCover.visible = false;
      darkCover.alpha = 0;
      this.stage.addChild(sprite, darkCover);
    } catch {
      try { darkCover?.destroy({ children: false }); } catch { /* prepare failure stays primary */ }
      try { sprite?.destroy({ children: false }); } catch { /* prepare failure stays primary */ }
      try { texture?.destroy(false); } catch { /* prepare failure stays primary */ }
      try { source?.destroy(); } catch { /* prepare failure stays primary */ }
      return this.latchFault(
        "movie.pixi.source-or-texture-creation-failed",
        "Pixi video source, texture and center-contained sprite construction is atomic and has no static-image or stage fallback.",
      );
    }
    this.sessionId = sessionId;
    this.profile = profile.value;
    this.prepared = prepared.value;
    this.video = video;
    this.source = source;
    this.texture = texture;
    this.sprite = sprite;
    this.darkCover = darkCover;
    this.installListeners(video);
    this.state = "ready";
    return movieAccepted(undefined);
  }

  play(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "ready" || this.video === null) return this.invalid("play", "ready");
    return this.beginPlay("play");
  }

  pause(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if ((this.state !== "playing" && this.state !== "play-pending") || this.video === null) {
      return this.invalid("pause", "playing or play-pending");
    }
    try {
      this.video.pause();
      this.state = "paused";
      return movieAccepted(undefined);
    } catch {
      return this.latchFault("movie.pixi.pause-threw", "Browser movie pause threw and cannot be replaced by semantic-only state.");
    }
  }

  resume(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "paused" || this.video === null) return this.invalid("resume", "paused");
    return this.beginPlay("resume");
  }

  stop(): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.video === null || this.profile === null || this.state === "unprepared") {
      return this.invalid("stop", "prepared");
    }
    try {
      this.video.pause();
      this.state = "ended";
      this.applyVisibility(false);
      return movieAccepted(undefined);
    } catch {
      return this.latchFault("movie.pixi.stop-threw", "Browser movie stop threw; terminal disposal must still release every media and Pixi owner.");
    }
  }

  seek(seconds: number): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.video === null || this.profile === null ||
      typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 ||
      seconds > this.profile.durationSeconds || this.state === "unprepared") {
      return this.reject("movie.pixi.invalid-seek", "Movie seek requires one prepared owner and an unclamped finite target inside decoded duration.");
    }
    try {
      this.seekReturnState = this.state === "playing" || this.state === "play-pending" ? "playing" : "paused";
      this.video.currentTime = seconds;
      this.state = "seeking";
      return movieAccepted(undefined);
    } catch {
      return this.latchFault("movie.pixi.seek-threw", "Browser movie seek threw and cannot clamp or retain a different physical frame.");
    }
  }

  setVisible(visible: boolean): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (typeof visible !== "boolean" || this.sprite === null ||
      (visible && (!this.firstFramePresented || this.suppressed || this.state === "ended"))) {
      return this.reject("movie.pixi.invalid-visibility", "Movie visibility requires an observed first frame, live owner and unsuppressed physical output.");
    }
    this.applyVisibility(visible);
    return movieAccepted(undefined);
  }

  setDarkCover(alpha: number, visible: boolean): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (this.darkCover === null || typeof visible !== "boolean" ||
      !Number.isFinite(alpha) || alpha < 0 || alpha > 1 ||
      !Object.is(alpha, Math.fround(alpha)) || this.state === "unprepared") {
      return this.reject(
        "movie.pixi.invalid-dark-cover",
        "Gameplay MV dark cover requires its prepared Graphics owner, exact Float32 unit alpha and explicit visibility.",
      );
    }
    this.darkCoverAlpha = alpha;
    this.darkCoverVisible = visible;
    this.darkCover.alpha = alpha;
    this.darkCover.visible = visible;
    this.refreshStageVisibility();
    return movieAccepted(undefined);
  }

  publishSuppressedOutput(seconds: number, playing: boolean): MovieOperationResult<void> {
    const terminal = this.terminal<void>();
    if (terminal !== null) return terminal;
    if (!this.suppressed || this.video === null || this.profile === null ||
      typeof playing !== "boolean" || !Number.isFinite(seconds) || seconds < 0 ||
      seconds > this.profile.durationSeconds) {
      return this.reject("movie.pixi.invalid-suppressed-publication", "Only one suppressed candidate may publish one exact in-duration target without intermediate physical frames.");
    }
    try {
      this.video.currentTime = seconds;
      this.suppressed = false;
      this.firstFramePresented = true;
      if (playing) return this.beginPlay("suppressed-publication");
      this.video.pause();
      this.state = "paused";
      this.applyVisibility(true);
      return movieAccepted(undefined);
    } catch {
      return this.latchFault("movie.pixi.suppressed-publication-threw", "Atomic movie target publication threw and cannot expose candidate intermediate output.");
    }
  }

  observe(): MovieOperationResult<MovieBackendSnapshot> {
    const terminal = this.terminal<MovieBackendSnapshot>();
    return terminal ?? movieAccepted(this.snapshot());
  }

  recordTerminalFault(capability: string, boundary: string): MovieOperationResult<never> {
    if (this.state === "disposed") return this.disposed();
    return this.latchFault(capability, boundary);
  }

  snapshot(): MovieBackendSnapshot {
    let currentTimeSeconds: number | null = null;
    try { currentTimeSeconds = this.video?.currentTime ?? null; } catch { currentTimeSeconds = null; }
    return Object.freeze({
      state: this.state,
      sessionId: this.sessionId,
      logicalId: this.profile?.logicalId ?? null,
      resourceCount: this.prepared === null ? 0 as const : 1 as const,
      currentTimeSeconds,
      visible: this.visible,
      outputSuppressed: this.suppressed,
      firstFramePresented: this.firstFramePresented,
      ended: this.state === "ended",
      muted: this.video?.muted ?? null,
      loop: this.video?.loop ?? null,
      stageParentAttached: this.stage.parent !== null,
      movieSpriteAlpha: this.sprite?.alpha ?? null,
      darkCoverVisible: this.darkCoverVisible,
      darkCoverAlpha: this.darkCoverAlpha,
      fault: this.fault === null ? null : Object.freeze({ ...this.fault }),
    });
  }

  dispose(): MovieOperationResult<void> {
    if (this.state === "disposed") return this.disposed();
    let firstFailure: MovieOperationResult<void> | null = null;
    const capture = (capability: string, boundary: string, operation: () => void): void => {
      try { operation(); } catch {
        if (firstFailure === null) firstFailure = movieRejected("movie-backend-fault", capability, boundary);
      }
    };
    const video = this.video;
    if (video !== null) {
      this.removeListeners(video);
      capture("movie.pixi.dispose-pause-threw", "Video pause threw during cleanup; remaining owners were still released.", () => video.pause());
    }
    capture("movie.pixi.dispose-stage-threw", "MV stage detach threw during cleanup; remaining owners were still released.", () => {
      this.stage.removeFromParent();
      this.darkCover?.removeFromParent();
      this.sprite?.removeFromParent();
    });
    capture("movie.pixi.dispose-dark-cover-threw", "MV dark-cover destroy threw during cleanup; remaining owners were still released.", () => this.darkCover?.destroy({ children: false }));
    capture("movie.pixi.dispose-sprite-threw", "MV sprite destroy threw during cleanup; remaining owners were still released.", () => this.sprite?.destroy({ children: false }));
    capture("movie.pixi.dispose-texture-threw", "MV texture destroy threw during cleanup; remaining owners were still released.", () => this.texture?.destroy(false));
    capture("movie.pixi.dispose-source-threw", "MV VideoSource destroy threw during cleanup; remaining owners were still released.", () => this.source?.destroy());
    capture("movie.pixi.dispose-resource-threw", "MV Blob/video release threw during cleanup after Pixi owners were released.", () => this.prepared?.release());
    this.video = null;
    this.source = null;
    this.texture = null;
    this.sprite = null;
    this.darkCover = null;
    this.prepared = null;
    this.profile = null;
    this.sessionId = null;
    this.visible = false;
    this.darkCoverVisible = false;
    this.darkCoverAlpha = Math.fround(0);
    this.stage.visible = false;
    this.state = "disposed";
    return firstFailure ?? movieAccepted(undefined);
  }

  private beginPlay(operation: string): MovieOperationResult<void> {
    const video = this.video!;
    try {
      const pending = video.play();
      this.state = "play-pending";
      pending.catch(() => {
        this.latchFault(
          `movie.pixi.${operation}-promise-rejected`,
          "HTMLMediaElement.play rejection is terminal and has no autoplay, static-frame or stage fallback.",
        );
      });
      return movieAccepted(undefined);
    } catch {
      return this.latchFault(`movie.pixi.${operation}-threw`, "HTMLMediaElement.play threw synchronously and cannot be replaced by semantic-only playback.");
    }
  }

  private installListeners(video: HTMLVideoElement): void {
    video.addEventListener("playing", this.onPlaying);
    video.addEventListener("pause", this.onPause);
    video.addEventListener("seeked", this.onSeeked);
    video.addEventListener("ended", this.onEnded);
    video.addEventListener("error", this.onError);
    video.addEventListener("abort", this.onError);
    this.listenersInstalled = true;
  }
  private removeListeners(video: HTMLVideoElement): void {
    if (!this.listenersInstalled) return;
    video.removeEventListener("playing", this.onPlaying);
    video.removeEventListener("pause", this.onPause);
    video.removeEventListener("seeked", this.onSeeked);
    video.removeEventListener("ended", this.onEnded);
    video.removeEventListener("error", this.onError);
    video.removeEventListener("abort", this.onError);
    this.listenersInstalled = false;
  }
  private readonly onPlaying = (): void => {
    if (this.state === "faulted" || this.state === "disposed") return;
    this.state = "playing";
    this.firstFramePresented = true;
  };
  private readonly onPause = (): void => {
    if (this.state === "playing" || this.state === "play-pending") this.state = "paused";
  };
  private readonly onSeeked = (): void => {
    if (this.state !== "seeking") return;
    this.state = this.seekReturnState;
    this.firstFramePresented = true;
  };
  private readonly onEnded = (): void => {
    if (this.state === "faulted" || this.state === "disposed") return;
    this.state = "ended";
    this.applyVisibility(false);
  };
  private readonly onError = (): void => {
    this.latchFault("movie.pixi.media-error", "Browser media error/abort is terminal and cleanup continues without stage fallback.");
  };

  private applyVisibility(value: boolean): void {
    this.visible = value;
    if (this.sprite !== null) this.sprite.visible = value;
    this.refreshStageVisibility();
  }
  private refreshStageVisibility(): void {
    this.stage.visible = this.visible || this.darkCoverVisible;
  }
  private terminal<T>(): MovieOperationResult<T> | null {
    if (this.state === "disposed") return this.disposed();
    if (this.fault !== null) return movieRejected("movie-backend-fault", this.fault.capability, this.fault.boundary);
    return null;
  }
  private latchFault(capability: string, boundary: string): MovieOperationResult<never> {
    if (this.fault === null) {
      this.fault = Object.freeze({ capability, boundary });
      this.state = "faulted";
      this.darkCoverVisible = false;
      if (this.darkCover !== null) this.darkCover.visible = false;
      this.applyVisibility(false);
    }
    return movieRejected("movie-backend-fault", this.fault.capability, this.fault.boundary);
  }
  private disposed<T = never>(): MovieOperationResult<T> {
    return movieRejected("terminal-disposed", "movie.lifecycle.terminal-disposed", "Disposed movie sessions reject before argument validation and are never reused.");
  }
  private invalid(operation: string, expected: string): MovieOperationResult<never> {
    return this.reject(`movie.pixi.invalid-${operation}-state`, `Movie ${operation} requires ${expected} state and has no implicit correction.`);
  }
  private reject(capability: string, boundary: string): MovieOperationResult<never> {
    return movieRejected("integrity-failure", capability, boundary);
  }
}
