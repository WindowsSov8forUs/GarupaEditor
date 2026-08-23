export type AudioBackendState =
  | "unprepared"
  | "preparing"
  | "ready"
  | "faulted"
  | "disposed";

export type AudioFailureCode =
  | "integrity-failure"
  | "audio-resource-unavailable"
  | "audio-resource-integrity"
  | "audio-resource-decode"
  | "audio-context-unavailable"
  | "audio-backend-fault"
  | "terminal-disposed";

export interface AudioFailure {
  readonly code: AudioFailureCode;
  readonly capability: string;
  readonly boundary: string;
}

export type AudioOperationResult<T> =
  | {
      readonly status: "accepted";
      readonly value: T;
    }
  | {
      readonly status: AudioFailureCode;
      readonly failure: AudioFailure;
    };

export interface AudioSampleIdentity {
  readonly package: "jp.co.craftegg.band";
  readonly versionName: "10.1.4";
  readonly versionCode: 230;
  readonly abi: "arm64-v8a";
  readonly libil2cppSha256: "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F";
  readonly globalMetadataSha256: "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F";
}

export interface AudioPoolProfile {
  readonly bgm: 8;
  readonly se: 12;
  readonly oneShot: 1;
  readonly exhaustion: "evidence-required";
}

export interface AudioLoopFrames {
  readonly start: number;
  readonly end: number;
}

export type AudioFixedSeLogicalId =
  | "sound/common"
  | `sound/tapseskin/${string}`;

interface AudioResourceProfileBase {
  readonly logicalId: string;
  readonly cue: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly mime: "audio/mpeg";
  readonly codec: "mp3";
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  readonly sampleFrames: number;
  readonly loop: AudioLoopFrames | null;
}

export interface AudioSessionBgmResourceProfile extends AudioResourceProfileBase {
  readonly role: "bgm";
  readonly logicalId: string;
  readonly cue: string;
  readonly loop: null;
  readonly identity: "session-explicit";
  readonly signal: "host-supplied-portable";
}

export interface AudioSessionVoiceResourceProfile extends AudioResourceProfileBase {
  readonly role: "voice";
  readonly loop: null;
  readonly identity: "session-explicit";
  readonly signal: "host-supplied-portable";
}

export interface AudioFixedSeResourceProfile extends AudioResourceProfileBase {
  readonly role: "se";
  readonly logicalId: AudioFixedSeLogicalId;
  readonly sampleRate: 8000 | 44100 | 48000;
  readonly identity: "semantic-exact";
  readonly signal: "portable-equivalent-lossy" | "semantic-exact-silence";
}

export type AudioResourceProfile =
  | AudioSessionBgmResourceProfile
  | AudioSessionVoiceResourceProfile
  | AudioFixedSeResourceProfile;

export interface AudioResourceProfileSet {
  readonly schemaVersion: 1;
  readonly profileId: "session-external-portable-v1";
  readonly sample: AudioSampleIdentity;
  readonly sourceClass: "external-reference-only-no-redistribution";
  readonly fidelity: "semantic-exact-portable-equivalent-lossy";
  readonly networkAllowed: false;
  readonly automaticFallbackAllowed: false;
  readonly pools: AudioPoolProfile;
  readonly resources: readonly AudioResourceProfile[];
}

export interface AudioResourceProvider {
  read(resource: AudioResourceProfile): Promise<AudioOperationResult<Uint8Array>>;
}

export interface AudioDecodedResourceMetadata {
  readonly codec: "mp3" | "f32le";
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSeconds: number;
  readonly sampleFrames: number;
}

export interface AudioResourcePreflightAdapter {
  sha256(bytes: Uint8Array): Promise<AudioOperationResult<string>>;
  inspect(bytes: Uint8Array): Promise<AudioOperationResult<AudioDecodedResourceMetadata>>;
  getDecodedBuffer?(
    bytes: Uint8Array,
  ): AudioOperationResult<AudioBuffer>;
}

export type AudioCommand =
  | {
      readonly kind: "session.open";
      readonly bgm_pool: 8;
      readonly se_pool: 12;
      readonly one_shot_pool: 1;
    }
  | {
      readonly kind: "bgm.load" | "bgm.move-time-load";
      readonly cue: string;
      readonly seek_ms: number;
      readonly priority: 255;
      readonly fade_bits: "0x00000000";
    }
  | {
      readonly kind: "bgm.pause" | "bgm.resume" | "se.pause" | "se.resume";
    }
  | {
      readonly kind: "audio.pause-all";
      readonly paused: boolean;
      readonly delay_seconds_bits?: string;
    }
  | {
      readonly kind: "se.play-one-shot";
      readonly cue: string;
      readonly voice_key: string;
      readonly volume_bits: string;
      readonly pitch_bits: "0x00000000";
      readonly pan_distance_bits: "0x00000000";
      readonly pan_angle_bits: "0x00000000";
    }
  | {
      readonly kind: "voice.release-live-start";
      readonly cue: string;
      readonly voice_key: "live-start";
    }
  | {
      readonly kind: "se.start-owned-loop";
      readonly cue: "SE_RHYTHM_GAYA";
      readonly owner_key: string;
      readonly volume_bits: "0x3F800000";
      readonly fade_in_bits: "0x3F000000";
    }
  | {
      readonly kind: "se.fade-owned-loop";
      readonly owner_key: string;
      readonly target_bits: "0x00000000";
      readonly duration_bits: "0x3FC00000";
      readonly stop_at_zero: true;
    }
  | {
      readonly kind: "hold.start-loop";
      readonly cue: "SE_RHYTHM_TAP_LONG";
      readonly owner_key: string;
      readonly volume_bits: string;
      readonly fade_in_bits: "0x00000000";
    }
  | {
      readonly kind: "hold.fade";
      readonly owner_key: string;
      readonly target_bits: string;
      readonly duration_bits: string;
      readonly stop_at_zero: boolean;
    }
  | {
      readonly kind: "hold.pause" | "hold.resume";
      readonly owner_key: string;
    }
  | {
      readonly kind: "gain.set";
      readonly bgm_bits: string;
      readonly se_bits: string;
    }
  | {
      readonly kind: "pool.profile";
      readonly bgm: 8;
      readonly se: 12;
      readonly one_shot: 1;
      readonly exhaustion: "evidence-required";
    };

export interface AudioCommandBatch {
  readonly sessionId: string;
  readonly firstSequence: number;
  readonly commandCount: number;
}

export interface AudioBackendFault {
  readonly code: "audio-backend-fault";
  readonly capability: string;
  readonly boundary: string;
}

export interface AudioVoiceSnapshot {
  readonly ownerKey: string;
  readonly cue: "SE_RHYTHM_TAP_LONG";
  readonly paused: boolean;
}

export interface AudioStartupLoopSnapshot {
  readonly ownerKey: string;
  readonly cue: "SE_RHYTHM_GAYA";
  readonly paused: boolean;
}

export type AudioBgmPlaybackState = "not-loaded" | "playing" | "paused" | "ended";
export type AudioOneShotPlaybackState = "not-started" | "playing" | "ended";

export interface AudioSemanticStateSnapshot {
  readonly sessionOpened: boolean;
  readonly bgmCue: string | null;
  readonly bgmPaused: boolean;
  readonly sePaused: boolean;
  readonly allPaused: boolean;
  readonly holds: readonly AudioVoiceSnapshot[];
  readonly startupLoops: readonly AudioStartupLoopSnapshot[];
  readonly gain: {
    readonly bgmBits: string;
    readonly seBits: string;
  } | null;
}

export interface AudioBackendSnapshot {
  readonly state: AudioBackendState;
  readonly sessionId: string | null;
  readonly profileId: AudioResourceProfileSet["profileId"] | null;
  readonly fidelity: AudioResourceProfileSet["fidelity"] | null;
  readonly preparedBgmCue: string | null;
  readonly nextSequence: number;
  readonly resourceCount: number;
  readonly semantic: AudioSemanticStateSnapshot;
  readonly commands: readonly AudioCommand[];
  readonly fault: AudioBackendFault | null;
}

export interface SimulatorAudioBackend {
  readonly id: string;
  prepare(
    sessionId: string,
    profile: AudioResourceProfileSet,
    provider: AudioResourceProvider,
    preflight: AudioResourcePreflightAdapter,
  ): Promise<AudioOperationResult<void>>;
  preflight(commands: readonly AudioCommand[]): AudioOperationResult<AudioCommandBatch>;
  commit(batch: AudioCommandBatch): AudioOperationResult<void>;
  discard(batch: AudioCommandBatch): AudioOperationResult<void>;
  execute(command: AudioCommand): AudioOperationResult<void>;
  getBgmPlaybackState?(): AudioOperationResult<AudioBgmPlaybackState>;
  getOneShotPlaybackState?(voiceKey: string): AudioOperationResult<AudioOneShotPlaybackState>;
  publishMoveTimeOutput?(seekMilliseconds: number): AudioOperationResult<void>;
  recordTerminalFault(capability: string, boundary: string): AudioOperationResult<never>;
  snapshot(): AudioBackendSnapshot;
  dispose(): AudioOperationResult<void>;
}
