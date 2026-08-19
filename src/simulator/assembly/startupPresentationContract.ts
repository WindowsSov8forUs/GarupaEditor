import type {
  SimulatorPresentationMvPackage,
  SimulatorPresentationPackage,
} from "../public/contracts";
import {
  rejected,
  type SimulatorAssemblyResult,
} from "../resources/sharedResourceAdapters";
import { currentStartupFontSupports } from "../backends/resources/currentStartupFontCmap";
export const STARTUP_JACKET_SIZE = Object.freeze({ width: 360, height: 360 });

export interface ValidatedPngStructure {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: 8;
  readonly colorType: 6;
}

export function copyAndFreezeSimulatorPresentation(
  value: unknown,
): SimulatorAssemblyResult<SimulatorPresentationPackage> {
  if (!isExactObject(value, "difficulty,jacketPng,mv,song,stage")) {
    return invalid("The presentation package requires exact song, difficulty, jacketPng, stage and nullable mv keys; startup characters and live-start voice are simulator-owned absent resources.");
  }
  const presentation = value as unknown as SimulatorPresentationPackage;
  if (!isExactObject(presentation.song, "arranger,bandName,composer,lyricist,title") ||
    !isRequiredText(presentation.song.title) || !isRequiredText(presentation.song.bandName) ||
    !isNullableText(presentation.song.lyricist) || !isNullableText(presentation.song.composer) ||
    !isNullableText(presentation.song.arranger)) {
    return invalid("Song title and bandName must be non-empty localized text; each credit is either non-empty text or null.");
  }
  const localizedText = [
    presentation.song.title,
    presentation.song.bandName,
    presentation.song.lyricist,
    presentation.song.composer,
    presentation.song.arranger,
  ].filter((text): text is string => text !== null);
  if (localizedText.some((text) => [...text].some((scalar) => !currentStartupFontSupports(scalar.codePointAt(0)!)))) {
    return rejected(
      "evidence-required",
      "simulator.presentation.missing-font-glyph",
      "Every caller-selected localized scalar must exist in the hash-locked current sgm cmap; browser or system-font fallback is forbidden.",
    );
  }
  if (!isExactObject(presentation.difficulty, "level,type") ||
    !["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"].includes(presentation.difficulty.type) ||
    !Number.isSafeInteger(presentation.difficulty.level) || presentation.difficulty.level <= 0) {
    return invalid("Difficulty requires one confirmed uppercase type and one positive integer level.");
  }
  if (!isExactObject(presentation.stage, "backdropPng")) {
    return invalid("The standard 2D stage requires exactly one backdrop; startup characters and live-start voice are absent simulator-owned resources, so caller keys or placeholders are forbidden by SDN01/SDN02/SDN03/SDN04.");
  }
  const jacket = copyPng(presentation.jacketPng, STARTUP_JACKET_SIZE.width, STARTUP_JACKET_SIZE.height, "jacket");
  if (jacket.status === "rejected") return jacket;
  const backdrop = copyPng(presentation.stage.backdropPng, null, null, "stage-backdrop");
  if (backdrop.status === "rejected") return backdrop;
  const mv = copyMvPackage(presentation.mv);
  if (mv.status === "rejected") return mv;
  return accepted(Object.freeze({
    song: Object.freeze({
      title: presentation.song.title,
      bandName: presentation.song.bandName,
      lyricist: presentation.song.lyricist,
      composer: presentation.song.composer,
      arranger: presentation.song.arranger,
    }),
    difficulty: Object.freeze({
      type: presentation.difficulty.type,
      level: presentation.difficulty.level,
    }),
    jacketPng: jacket.value,
    stage: Object.freeze({
      backdropPng: backdrop.value,
    }),
    mv: mv.value,
  }));
}

function copyMvPackage(
  value: unknown,
): SimulatorAssemblyResult<SimulatorPresentationMvPackage | null> {
  if (value === null) return accepted(null);
  if (!isExactObject(value, "bytes,musicStartDelayMilliseconds")) {
    return invalid("mv is null or one exact { bytes, musicStartDelayMilliseconds } object with no caller metadata.");
  }
  const mv = value as SimulatorPresentationMvPackage;
  if (!(mv.bytes instanceof Uint8Array) ||
    Object.getPrototypeOf(mv.bytes) !== Uint8Array.prototype ||
    mv.bytes.byteLength === 0 ||
    !Number.isInteger(mv.musicStartDelayMilliseconds) ||
    mv.musicStartDelayMilliseconds < -0x80000000 ||
    mv.musicStartDelayMilliseconds > 0x7fffffff) {
    return invalid("mv requires one non-empty direct Uint8Array and one signed Int32 musicStartDelayMilliseconds value; container, codec, duration, dimensions and identity are derived internally.");
  }
  return accepted(Object.freeze({
    bytes: Uint8Array.from(mv.bytes),
    musicStartDelayMilliseconds: mv.musicStartDelayMilliseconds,
  }));
}

export function inspectStrictRgbaPng(
  bytes: Uint8Array,
  expectedWidth: number | null,
  expectedHeight: number | null,
): SimulatorAssemblyResult<ValidatedPngStructure> {
  if (!(bytes instanceof Uint8Array) || Object.getPrototypeOf(bytes) !== Uint8Array.prototype || bytes.byteLength < 57 ||
    !equalsAt(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) {
    return invalidPng("A presentation visual must begin with the complete PNG signature and contain IHDR, IDAT and IEND chunks.");
  }
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  let width = 0;
  let height = 0;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) return invalidPng("Every PNG chunk must include length, type, payload and CRC.");
    const length = readU32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const end = dataOffset + length;
    if (!Number.isSafeInteger(length) || end + 4 > bytes.byteLength) return invalidPng("PNG chunk length exceeds the supplied byte resource.");
    const type = String.fromCharCode(bytes[typeOffset]!, bytes[typeOffset + 1]!, bytes[typeOffset + 2]!, bytes[typeOffset + 3]!);
    if (crc32(bytes.subarray(typeOffset, end)) !== readU32(bytes, end)) return invalidPng(`PNG ${type} chunk CRC does not match its bytes.`);
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return invalidPng("IHDR must be the first PNG chunk and have the exact 13-byte payload.");
      width = readU32(bytes, dataOffset);
      height = readU32(bytes, dataOffset + 4);
      if (width <= 0 || height <= 0 ||
        (expectedWidth !== null && width !== expectedWidth) ||
        (expectedHeight !== null && height !== expectedHeight) ||
        bytes[dataOffset + 8] !== 8 || bytes[dataOffset + 9] !== 6 ||
        bytes[dataOffset + 10] !== 0 || bytes[dataOffset + 11] !== 0 ||
        bytes[dataOffset + 12] !== 0) {
        const dimensions = expectedWidth === null || expectedHeight === null
          ? "positive intrinsic dimensions"
          : `exactly ${expectedWidth}x${expectedHeight}`;
        return invalidPng(`PNG must be non-interlaced 8-bit RGBA with ${dimensions}.`);
      }
      sawHeader = true;
    } else if (type === "IHDR") {
      return invalidPng("A PNG contains exactly one leading IHDR chunk.");
    } else if (type === "IDAT") {
      if (sawEnd || length === 0) return invalidPng("IDAT must be non-empty and precede IEND.");
      sawData = true;
    } else if (type === "IEND") {
      if (length !== 0 || !sawData || end + 4 !== bytes.byteLength) return invalidPng("IEND must be empty, terminal and follow at least one IDAT chunk.");
      sawEnd = true;
    } else if (sawEnd || (bytes[typeOffset]! & 0x20) === 0) {
      return invalidPng("Unknown critical chunks and chunks after IEND are rejected rather than interpreted by fallback.");
    }
    offset = end + 4;
  }
  if (!sawHeader || !sawData || !sawEnd) return invalidPng("The strict PNG structure is incomplete.");
  return accepted(Object.freeze({ width, height, bitDepth: 8 as const, colorType: 6 as const }));
}

function copyPng(
  value: unknown,
  width: number | null,
  height: number | null,
  role: string,
): SimulatorAssemblyResult<Uint8Array> {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype || value.byteLength === 0) {
    return invalid(`${role} must be one direct non-empty Uint8Array PNG resource.`);
  }
  const copied = Uint8Array.from(value);
  const inspected = inspectStrictRgbaPng(copied, width, height);
  return inspected.status === "rejected" ? inspected : accepted(copied);
}

function isExactObject(value: unknown, keys: string): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join(",") === keys.split(",").sort().join(",");
}
function isRequiredText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && isScalarText(value);
}
function isNullableText(value: unknown): value is string | null { return value === null || isRequiredText(value); }
function isScalarText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit < 0x20 || unit === 0x7f || (unit >= 0xd800 && unit <= 0xdbff &&
      (index + 1 >= value.length || value.charCodeAt(++index) < 0xdc00 || value.charCodeAt(index) > 0xdfff)) ||
      (unit >= 0xdc00 && unit <= 0xdfff)) return false;
  }
  return true;
}
function equalsAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}
function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function invalid(boundary: string): SimulatorAssemblyResult<never> {
  return rejected("evidence-required", "simulator.presentation.invalid-public-package", boundary);
}
function invalidPng(boundary: string): SimulatorAssemblyResult<never> {
  return rejected("resource-decode", "simulator.presentation.invalid-png", boundary);
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> { return Object.freeze({ status: "accepted" as const, value }); }
