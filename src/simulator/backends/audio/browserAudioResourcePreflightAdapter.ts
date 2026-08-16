import type {
  AudioDecodedResourceMetadata,
  AudioOperationResult,
  AudioResourcePreflightAdapter,
} from "../audioContracts";
import { audioAccepted, audioRejected } from "../audioValidation";
import { sha256UpperHex } from "../resources/sha256";

interface CachedBrowserDecode {
  readonly buffer: AudioBuffer;
  readonly metadata: AudioDecodedResourceMetadata;
}

export class BrowserAudioResourcePreflightAdapter
  implements AudioResourcePreflightAdapter {
  private readonly decodedBySha256 = new Map<string, CachedBrowserDecode>();

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
  ): Promise<AudioOperationResult<AudioDecodedResourceMetadata>> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return audioRejected(
        "audio-resource-decode",
        "audio.preflight.invalid-inspection-input",
        "Browser audio inspection accepts only one non-empty owned byte sequence.",
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
    const digest = sha256UpperHex(bytes);
    const cached = this.decodedBySha256.get(digest);
    if (cached !== undefined) return audioAccepted(cached.metadata);
    try {
      const decoded = await this.context.decodeAudioData(Uint8Array.from(bytes).buffer);
      if (this.context.state !== "running") {
        return audioRejected(
          "audio-context-unavailable",
          "audio.preflight.context-lost-during-inspection",
          "Context loss during atomic metadata inspection fails before backend preparation.",
        );
      }
      if (
        decoded === null || typeof decoded !== "object" ||
        !Number.isSafeInteger(decoded.sampleRate) || decoded.sampleRate <= 0 ||
        !Number.isSafeInteger(decoded.numberOfChannels) || decoded.numberOfChannels <= 0 ||
        !Number.isSafeInteger(decoded.length) || decoded.length <= 0
      ) {
        return audioRejected(
          "audio-resource-decode",
          "audio.preflight.invalid-decoded-buffer",
          "Browser decoding must produce positive integral sample rate, channel count and decoded sample frames.",
        );
      }
      const metadata = Object.freeze({
        codec: "mp3" as const,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        durationSeconds: Number((decoded.length / decoded.sampleRate).toFixed(6)),
        sampleFrames: decoded.length,
      });
      this.decodedBySha256.set(digest, Object.freeze({ buffer: decoded, metadata }));
      return audioAccepted(metadata);
    } catch {
      return audioRejected(
        "audio-resource-decode",
        "audio.preflight.decode-failed",
        "MP3 decode failure is structured and has no alternate codec, network source or metadata fallback.",
      );
    }
  }

  getDecodedBuffer(bytes: Uint8Array): AudioOperationResult<AudioBuffer> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return audioRejected(
        "audio-resource-decode",
        "audio.preflight.invalid-decoded-buffer-input",
        "Decoded-buffer reuse accepts only the exact non-empty byte sequence previously inspected.",
      );
    }
    const cached = this.decodedBySha256.get(sha256UpperHex(bytes));
    return cached === undefined
      ? audioRejected(
          "audio-resource-decode",
          "audio.preflight.decoded-buffer-not-inspected",
          "A browser AudioBuffer is available only after successful inspection of the same bytes.",
        )
      : audioAccepted(cached.buffer);
  }
}
