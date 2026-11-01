import type {
  AudioDecodedResourceMetadata,
  AudioOperationResult,
  AudioResourcePreflightAdapter,
} from "../audioContracts";
import { audioAccepted, audioRejected } from "../audioValidation";
import { sha256UpperHexAsync } from "../resources/sha256";
import { inspectAudioSourceFormat } from "./audioSourceFormat";

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
        "integrity-failure",
        "audio.preflight.invalid-hash-input",
        "Audio SHA-256 accepts only one non-empty owned byte sequence.",
      );
    }
    return audioAccepted(await sha256UpperHexAsync(bytes));
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
    const digest = await sha256UpperHexAsync(bytes);
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
      const source = inspectAudioSourceFormat(bytes);
      if (source === null || (source.channels !== null && source.channels !== decoded.numberOfChannels)) {
        return audioRejected(
          "audio-resource-decode",
          "audio.preflight.source-format-mismatch",
          "Browser decoding must agree with the declared source container, sample rate and channel layout.",
        );
      }
      const sampleFrames = decoded.sampleRate === source.sampleRate
        ? decoded.length
        : Math.ceil(decoded.length * source.sampleRate / decoded.sampleRate);
      const metadata = Object.freeze({
        codec: source.codec,
        sampleRate: source.sampleRate,
        channels: decoded.numberOfChannels,
        durationSeconds: Number((sampleFrames / source.sampleRate).toFixed(6)),
        sampleFrames,
      });
      this.decodedBySha256.set(digest, Object.freeze({ buffer: decoded, metadata }));
      return audioAccepted(metadata);
    } catch {
      return audioRejected(
        "audio-resource-decode",
        "audio.preflight.decode-failed",
        "Decode failure is structured and has no alternate codec, network source or metadata fallback.",
      );
    }
  }

  async getDecodedBuffer(bytes: Uint8Array): Promise<AudioOperationResult<AudioBuffer>> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return audioRejected(
        "audio-resource-decode",
        "audio.preflight.invalid-decoded-buffer-input",
        "Decoded-buffer reuse accepts only the exact non-empty byte sequence previously inspected.",
      );
    }
    const cached = this.decodedBySha256.get(await sha256UpperHexAsync(bytes));
    return cached === undefined
      ? audioRejected(
          "audio-resource-decode",
          "audio.preflight.decoded-buffer-not-inspected",
          "A browser AudioBuffer is available only after successful inspection of the same bytes.",
        )
      : audioAccepted(cached.buffer);
  }
}
