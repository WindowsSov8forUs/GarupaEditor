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
      const source = inspectMp3SourceFormat(bytes);
      if (source === null || source.channels !== decoded.numberOfChannels) {
        return audioRejected(
          "audio-resource-decode",
          "audio.preflight.mp3-source-format-mismatch",
          "Browser decoding must agree with the strict MPEG Layer III source sample rate and channel mode.",
        );
      }
      const sampleFrames = decoded.sampleRate === source.sampleRate
        ? decoded.length
        : Math.ceil(decoded.length * source.sampleRate / decoded.sampleRate);
      const metadata = Object.freeze({
        codec: "mp3" as const,
        sampleRate: source.sampleRate,
        channels: source.channels,
        durationSeconds: Number((sampleFrames / source.sampleRate).toFixed(6)),
        sampleFrames,
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

function inspectMp3SourceFormat(
  bytes: Uint8Array,
): { readonly sampleRate: number; readonly channels: 1 | 2 } | null {
  if (bytes.byteLength < 4) return null;
  let offset = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (bytes.byteLength < 10 ||
      (bytes[6]! | bytes[7]! | bytes[8]! | bytes[9]!) >= 0x80) return null;
    offset = 10 + ((bytes[6]! << 21) | (bytes[7]! << 14) |
      (bytes[8]! << 7) | bytes[9]!);
  }
  if (offset > bytes.byteLength - 4) return null;
  const first = bytes[offset]!;
  const second = bytes[offset + 1]!;
  const third = bytes[offset + 2]!;
  const fourth = bytes[offset + 3]!;
  const versionBits = (second >>> 3) & 0x03;
  const layerBits = (second >>> 1) & 0x03;
  const bitrateIndex = third >>> 4;
  const sampleRateIndex = (third >>> 2) & 0x03;
  if (first !== 0xff || (second & 0xe0) !== 0xe0 || versionBits === 1 ||
    layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const rates = versionBits === 3
    ? [44100, 48000, 32000]
    : versionBits === 2
      ? [22050, 24000, 16000]
      : [11025, 12000, 8000];
  return Object.freeze({
    sampleRate: rates[sampleRateIndex]!,
    channels: (fourth >>> 6) === 3 ? 1 as const : 2 as const,
  });
}
