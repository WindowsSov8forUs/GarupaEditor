import type { UserMediaPurpose } from "./contracts";

// Identify only formats already accepted by the workspace media validator.
export function detectUserMediaType(bytes: Uint8Array): string | null {
  const formats: readonly [UserMediaPurpose, string][] = [
    ["cover", "image/png"], ["cover", "image/jpeg"],
    ["cover", "image/webp"], ["cover", "image/gif"],
    ["bgm", "audio/mpeg"], ["bgm", "audio/wav"], ["bgm", "audio/ogg"], ["bgm", "audio/mp4"],
    ["mv", "video/mp4"], ["mv", "video/webm"],
  ];
  return formats.find(([purpose, type]) => hasCompatibleUserMediaMagic(purpose, type, bytes))?.[1] ?? null;
}

export function normalizeMediaType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.split(";", 1)[0]!.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized) ? normalized : null;
}

export function hasCompatibleUserMediaMagic(
  purpose: UserMediaPurpose,
  mediaType: string,
  bytes: Uint8Array,
): boolean {
  const type = normalizeMediaType(mediaType);
  if (type === null) return false;
  if (purpose === "cover" || purpose === "illust-background") {
    if (type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    if (type === "image/jpeg" || type === "image/jpg") return bytes[0] === 0xff && bytes[1] === 0xd8;
    if (type === "image/webp") return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
    if (type === "image/gif") return ascii(bytes, 0, "GIF8");
    return false;
  }
  if (purpose === "bgm") {
    if (type === "audio/mpeg" || type === "audio/mp3") return ascii(bytes, 0, "ID3") || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
    if (type === "audio/wav" || type === "audio/x-wav") return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE");
    if (type === "audio/ogg") return ascii(bytes, 0, "OggS");
    // An MP4/M4A container is BGM only when every track is sound; any video track stays MV-only.
    if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/m4a") return isAudioOnlyMp4(bytes);
    return false;
  }
  if (type === "video/mp4") return bytes.length >= 12 && ascii(bytes, 4, "ftyp");
  if (type === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

/** Reads the moov/trak/mdia/hdlr handler types of an ISO BMFF file. */
function isAudioOnlyMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || !ascii(bytes, 4, "ftyp")) return false;
  const moov = findBoxes(bytes, 0, bytes.length, "moov")[0];
  if (moov === undefined) return false;
  const handlers = findBoxes(bytes, moov.start, moov.end, "trak").map((trak) => {
    const mdia = findBoxes(bytes, trak.start, trak.end, "mdia")[0];
    const hdlr = mdia === undefined ? undefined : findBoxes(bytes, mdia.start, mdia.end, "hdlr")[0];
    // hdlr payload: version/flags (4), pre_defined (4), handler_type (4).
    return hdlr !== undefined && hdlr.start + 12 <= hdlr.end
      ? String.fromCharCode(...bytes.subarray(hdlr.start + 8, hdlr.start + 12))
      : null;
  });
  return handlers.length > 0 && handlers.every((handler) => handler === "soun");
}

/** Child boxes of one container range; payload ranges exclude each box header. */
function findBoxes(bytes: Uint8Array, start: number, end: number, type: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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

function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.length < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

