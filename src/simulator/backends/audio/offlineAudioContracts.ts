import type { AudioOperationResult } from "../audioContracts";

export interface OfflineAudioPcmSource {
  readonly sourceId: string;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly frameCount: number;
  readonly samples: Float32Array;
}

export interface OfflineAudioLoopPlan {
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface OfflineAudioFadePlan {
  readonly startFrame: number;
  readonly durationBits: string;
  readonly targetBits: "0x00000000";
  readonly stopAtZero: true;
}

export interface OfflineAudioVoicePlan {
  readonly sourceId: string;
  readonly startFrame: number;
  readonly gainBits: string;
  readonly loop: OfflineAudioLoopPlan | null;
  readonly fade: OfflineAudioFadePlan | null;
}

export interface OfflineAudioMixRequest {
  readonly sampleRate: number;
  readonly outputFrames: number;
  readonly sources: readonly OfflineAudioPcmSource[];
  readonly voices: readonly OfflineAudioVoicePlan[];
}

export interface OfflineAudioMixResult {
  readonly sampleFormat: "f32le-stereo-interleaved";
  readonly sampleRate: number;
  readonly channelCount: 2;
  readonly frameCount: number;
  readonly bytes: Uint8Array;
}

export interface OfflineAudioBackend {
  readonly id: string;
  render(request: OfflineAudioMixRequest): AudioOperationResult<OfflineAudioMixResult>;
}
