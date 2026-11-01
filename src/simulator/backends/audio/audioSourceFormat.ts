/** Source containers a chart BGM may use; the host decoder produces the PCM. */
export type AudioSourceMime = "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/mp4";
export type AudioSourceCodec = "mp3" | "pcm" | "vorbis" | "opus" | "aac";

export interface AudioSourceFormat {
  readonly mime: AudioSourceMime;
  readonly codec: AudioSourceCodec;
  /** Declared source rate; decoded frames convert back to it. */
  readonly sampleRate: number;
  /** Declared channels, or null where the container field does not bind the decoded layout (AAC). */
  readonly channels: number | null;
}

export const SESSION_BGM_SOURCE_FORMATS: readonly (readonly [AudioSourceMime, AudioSourceCodec])[] = Object.freeze([
  ["audio/mpeg", "mp3"], ["audio/wav", "pcm"], ["audio/ogg", "vorbis"], ["audio/ogg", "opus"], ["audio/mp4", "aac"],
] as const);

/** Strict first MPEG Layer III frame header after an optional ID3v2 tag. */
export function inspectMp3SourceFormat(
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

/** MP3, WAV (RIFF fmt), Ogg Vorbis/Opus or audio-only MP4/AAC; anything else is unsupported. */
export function inspectAudioSourceFormat(bytes: Uint8Array): AudioSourceFormat | null {
  const mp3 = inspectMp3SourceFormat(bytes);
  if (mp3 !== null) return Object.freeze({ mime: "audio/mpeg", codec: "mp3", ...mp3 });
  return inspectWav(bytes) ?? inspectOgg(bytes) ?? inspectMp4(bytes);
}

function inspectWav(bytes: Uint8Array): AudioSourceFormat | null {
  if (!ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WAVE")) return null;
  const view = dataView(bytes);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset + 4, true);
    if (ascii(bytes, offset, "fmt ")) {
      if (size < 16 || offset + 8 + size > bytes.byteLength) return null;
      const format = view.getUint16(offset + 8, true);
      const channels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);
      if (![1, 3, 0xfffe].includes(format) || channels <= 0 || sampleRate <= 0) return null;
      return Object.freeze({ mime: "audio/wav", codec: "pcm", sampleRate, channels });
    }
    offset += 8 + size + (size & 1);
  }
  return null;
}

function inspectOgg(bytes: Uint8Array): AudioSourceFormat | null {
  if (!ascii(bytes, 0, "OggS") || bytes.byteLength < 27) return null;
  const packet = 27 + bytes[26]!;
  const view = dataView(bytes);
  if (bytes[packet] === 1 && ascii(bytes, packet + 1, "vorbis") && packet + 16 <= bytes.byteLength) {
    const channels = bytes[packet + 11]!, sampleRate = view.getUint32(packet + 12, true);
    return channels > 0 && sampleRate > 0 ? Object.freeze({ mime: "audio/ogg", codec: "vorbis", sampleRate, channels }) : null;
  }
  if (ascii(bytes, packet, "OpusHead") && packet + 10 <= bytes.byteLength) {
    // Opus always decodes at 48 kHz; the header's input rate is informational.
    const channels = bytes[packet + 9]!;
    return channels > 0 ? Object.freeze({ mime: "audio/ogg", codec: "opus", sampleRate: 48000, channels }) : null;
  }
  return null;
}

/** Every track must be sound and the first sample entry AAC (mp4a); video tracks stay MV-only. */
function inspectMp4(bytes: Uint8Array): AudioSourceFormat | null {
  if (!ascii(bytes, 4, "ftyp")) return null;
  const moov = childBoxes(bytes, 0, bytes.byteLength, "moov")[0];
  if (moov === undefined) return null;
  const traks = childBoxes(bytes, moov.start, moov.end, "trak");
  if (traks.length === 0) return null;
  let format: AudioSourceFormat | null = null;
  const view = dataView(bytes);
  for (const trak of traks) {
    const mdia = childBoxes(bytes, trak.start, trak.end, "mdia")[0];
    const hdlr = mdia === undefined ? undefined : childBoxes(bytes, mdia.start, mdia.end, "hdlr")[0];
    if (mdia === undefined || hdlr === undefined || hdlr.start + 12 > hdlr.end || !ascii(bytes, hdlr.start + 8, "soun")) return null;
    if (format !== null) continue;
    const mdhd = childBoxes(bytes, mdia.start, mdia.end, "mdhd")[0];
    const minf = childBoxes(bytes, mdia.start, mdia.end, "minf")[0];
    const stbl = minf === undefined ? undefined : childBoxes(bytes, minf.start, minf.end, "stbl")[0];
    const stsd = stbl === undefined ? undefined : childBoxes(bytes, stbl.start, stbl.end, "stsd")[0];
    // stsd: version/flags, entry count, then the first sample entry box.
    const entry = stsd === undefined ? undefined : childBoxes(bytes, stsd.start + 8, stsd.end, "mp4a")[0];
    if (entry === undefined || entry.start + 28 > entry.end) return null;
    let sampleRate = view.getUint32(entry.start + 24) >>> 16;
    if (sampleRate === 0 && mdhd !== undefined && mdhd.start + 24 <= mdhd.end) {
      sampleRate = bytes[mdhd.start] === 1 ? view.getUint32(mdhd.start + 20) : view.getUint32(mdhd.start + 12);
    }
    if (sampleRate <= 0) return null;
    format = Object.freeze({ mime: "audio/mp4", codec: "aac", sampleRate, channels: null });
  }
  return format;
}

function childBoxes(bytes: Uint8Array, start: number, end: number, type: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  const view = dataView(bytes);
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const large = view.getBigUint64(offset + 8);
      if (large > BigInt(end - offset)) break;
      size = Number(large); header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    if (ascii(bytes, offset + 4, type)) found.push({ start: offset + header, end: offset + size });
    offset += size;
  }
  return found;
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset < 0 || bytes.byteLength < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}
