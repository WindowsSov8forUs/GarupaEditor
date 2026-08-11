import type {
  AudioDecodedResourceMetadata,
  AudioOperationResult,
  AudioResourcePreflightAdapter,
  AudioResourceProfile,
} from "../audioContracts";
import { audioAccepted, audioRejected } from "../audioValidation";
import { sha256UpperHex } from "../resources/sha256";

export class BrowserAudioResourcePreflightAdapter
  implements AudioResourcePreflightAdapter {
  constructor(private readonly context: AudioContext) {}

  async sha256(bytes: Uint8Array): Promise<AudioOperationResult<string>> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return audioRejected(
        "evidence-required",
        "audio.preflight.invalid-hash-input",
        "Audio SHA-256 accepts only one non-empty owned byte sequence.",
      );
    }
    return audioAccepted(sha256UpperHex(bytes));
  }

  async inspect(
    bytes: Uint8Array,
    resource: AudioResourceProfile,
  ): Promise<AudioOperationResult<AudioDecodedResourceMetadata>> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 ||
      resource === null || typeof resource !== "object" ||
      resource.mime !== "audio/mpeg" || resource.codec !== "mp3") {
      return audioRejected(
        "audio-resource-decode",
        "audio.preflight.invalid-inspection-input",
        "Browser audio inspection accepts only one declared MP3 resource and its non-empty bytes.",
      );
    }
    if (this.context === null || typeof this.context !== "object" ||
      this.context.state !== "running") {
      return audioRejected(
        "audio-context-unavailable",
        "audio.preflight.context-not-running",
        "Audio inspection requires the autonomous module's existing running AudioContext and never resumes or recreates it.",
      );
    }
    try {
      const decoded = await this.context.decodeAudioData(Uint8Array.from(bytes).buffer);
      if (this.context.state !== "running") {
        return audioRejected(
          "audio-context-unavailable",
          "audio.preflight.context-lost-during-inspection",
          "Context loss during atomic metadata inspection fails before backend preparation.",
        );
      }
      return audioAccepted(Object.freeze({
        codec: "mp3" as const,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        durationSeconds: Number(decoded.duration.toFixed(6)),
      }));
    } catch {
      return audioRejected(
        "audio-resource-decode",
        "audio.preflight.decode-failed",
        "MP3 decode failure is structured and has no alternate codec, network source or metadata fallback.",
      );
    }
  }
}
