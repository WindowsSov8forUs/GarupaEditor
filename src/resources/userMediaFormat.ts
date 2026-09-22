import type { UserMediaPurpose } from "./contracts";

// Identify only formats already accepted by the workspace media validator.
export function detectUserMediaType(bytes: Uint8Array): string | null {
  const formats: readonly [UserMediaPurpose, string][] = [
    ["cover", "image/png"], ["cover", "image/jpeg"],
    ["cover", "image/webp"], ["cover", "image/gif"],
    ["bgm", "audio/mpeg"], ["bgm", "audio/wav"], ["bgm", "audio/ogg"],
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
  if (purpose === "cover" || purpose === "stage-backdrop") {
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
    return false;
  }
  if (type === "video/mp4") return bytes.length >= 12 && ascii(bytes, 4, "ftyp");
  if (type === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

function ascii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.length < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

