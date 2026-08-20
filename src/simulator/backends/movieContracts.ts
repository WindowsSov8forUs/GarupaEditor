export type MovieContainer = "mp4" | "webm";
export type MovieMime = "video/mp4" | "video/webm";

export type MovieOperationStatus =
  | "accepted"
  | "evidence-required"
  | "movie-resource-integrity"
  | "movie-resource-decode"
  | "movie-platform-unavailable"
  | "movie-backend-fault"
  | "terminal-disposed";

export interface MovieOperationFailure {
  readonly capability: string;
  readonly boundary: string;
}

export type MovieOperationResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | {
      readonly status: Exclude<MovieOperationStatus, "accepted">;
      readonly failure: MovieOperationFailure;
    };

export interface MovieDecodedResourceMetadata {
  readonly container: MovieContainer;
  readonly mime: MovieMime;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
}

export interface MoviePreparedResource {
  readonly metadata: MovieDecodedResourceMetadata;
  readonly resource: unknown;
  release(): void;
}

export interface MovieResourcePreflightAdapter {
  sha256(bytes: Uint8Array): Promise<MovieOperationResult<string>>;
  prepare(
    bytes: Uint8Array,
    container: MovieContainer,
  ): Promise<MovieOperationResult<MoviePreparedResource>>;
}

export interface MovieResourceProfile {
  readonly role: "mv-live";
  readonly logicalId: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly container: MovieContainer;
  readonly mime: MovieMime;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly musicStartDelayMilliseconds: number;
  readonly fit: "contain-center-no-crop";
  readonly muted: true;
  readonly loop: false;
  readonly identity: "session-explicit";
  readonly signal: "host-supplied-portable";
}

export interface PreparedSessionMovieResource {
  readonly profile: MovieResourceProfile;
  readonly bytes: Uint8Array;
  readonly prepared: MoviePreparedResource;
}

export type MovieBackendState =
  | "unprepared"
  | "ready"
  | "play-pending"
  | "playing"
  | "paused"
  | "seeking"
  | "ended"
  | "faulted"
  | "disposed";

export interface MovieBackendFault {
  readonly capability: string;
  readonly boundary: string;
}

export interface MovieBackendSnapshot {
  readonly state: MovieBackendState;
  readonly sessionId: string | null;
  readonly logicalId: string | null;
  readonly resourceCount: 0 | 1;
  readonly currentTimeSeconds: number | null;
  readonly visible: boolean;
  readonly outputSuppressed: boolean;
  readonly firstFramePresented: boolean;
  readonly ended: boolean;
  readonly muted: boolean | null;
  readonly loop: boolean | null;
  readonly stageParentAttached: boolean | null;
  readonly movieSpriteAlpha: number | null;
  readonly darkCoverVisible: boolean | null;
  readonly darkCoverAlpha: number | null;
  readonly fault: MovieBackendFault | null;
}

export interface SimulatorMovieBackend {
  readonly id: string;
  prepare(
    sessionId: string,
    resource: PreparedSessionMovieResource,
  ): Promise<MovieOperationResult<void>>;
  play(): MovieOperationResult<void>;
  pause(): MovieOperationResult<void>;
  resume(): MovieOperationResult<void>;
  stop(): MovieOperationResult<void>;
  seek(seconds: number): MovieOperationResult<void>;
  setVisible(visible: boolean): MovieOperationResult<void>;
  setDarkCover(alpha: number, visible: boolean): MovieOperationResult<void>;
  publishSuppressedOutput(seconds: number, playing: boolean): MovieOperationResult<void>;
  observe(): MovieOperationResult<MovieBackendSnapshot>;
  recordTerminalFault(capability: string, boundary: string): MovieOperationResult<never>;
  snapshot(): MovieBackendSnapshot;
  dispose(): MovieOperationResult<void>;
}
