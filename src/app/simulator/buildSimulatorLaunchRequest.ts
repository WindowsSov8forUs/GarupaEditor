import { parseGarupaChartJson } from "../../chart";
import type { ResourceConsumerLease } from "../../resources/contracts";
import type { SimulatorModuleLaunchRequest } from "../../simulator/public/contracts";
import {
  SIMULATOR_MEDIA_SLOTS,
  type SimulatorLaunchTransportDescriptor,
} from "./transportContracts";

export async function buildSimulatorLaunchRequest(
  descriptor: SimulatorLaunchTransportDescriptor,
  mediaLease: ResourceConsumerLease,
): Promise<SimulatorModuleLaunchRequest> {
  if (mediaLease.snapshotId !== descriptor.mediaSnapshotId) {
    throw new Error("Simulator media lease does not match the frozen transport snapshot.");
  }
  const chart = parseGarupaChartJson(JSON.parse(descriptor.chartJson));
  const bgm = await readSingle(mediaLease, SIMULATOR_MEDIA_SLOTS.bgm);
  const jacketSource = await readSingle(mediaLease, SIMULATOR_MEDIA_SLOTS.jacket);
  const jacketPng = await normalizeJacketPng(jacketSource);
  const stagePng = await normalizeStagePng(await readStageBackdrop(mediaLease));
  const mv = descriptor.presentation.mvEnabled
    ? Object.freeze({
        bytes: await readSingle(mediaLease, SIMULATOR_MEDIA_SLOTS.mv),
        musicStartDelayMilliseconds: descriptor.presentation.mvMusicStartDelayMilliseconds,
      })
    : null;
  return Object.freeze({
    chartData: Object.freeze({
      chart,
      bgm,
      isFullLength: descriptor.isFullLength,
    }),
    presentation: Object.freeze({
      song: Object.freeze({ ...descriptor.presentation.song }),
      difficulty: Object.freeze({ ...descriptor.presentation.difficulty }),
      jacketPng,
      stage: Object.freeze({ backdropPng: stagePng }),
      mv,
    }),
    config: descriptor.config,
  });
}

async function readSingle(lease: ResourceConsumerLease, slot: string): Promise<Uint8Array> {
  const files = lease.listFiles(slot);
  if (files.length !== 1) throw new Error(`Simulator media slot ${slot} requires exactly one file.`);
  return lease.readBytes(slot, files[0]!.logicalPath);
}

async function readStageBackdrop(lease: ResourceConsumerLease): Promise<Uint8Array> {
  const files = lease.listFiles(SIMULATOR_MEDIA_SLOTS.stage);
  if (files.length === 1 && files[0]!.mediaType.startsWith("image/")) {
    return lease.readBytes(SIMULATOR_MEDIA_SLOTS.stage, files[0]!.logicalPath);
  }
  const liveBg = files.filter((file) => {
    if (!file.mediaType.startsWith("image/")) return false;
    const name = basename(file.logicalPath).toLocaleLowerCase("en-US");
    return name === "livebg.png" || name === "livebg_normal.png";
  });
  if (liveBg.length !== 1) {
    throw new Error("Default stage package requires exactly one evidenced provider liveBG.png or original liveBG_normal.png identity; ambiguous sets, aliases and nearest-name fallback are forbidden.");
  }
  return lease.readBytes(SIMULATOR_MEDIA_SLOTS.stage, liveBg[0]!.logicalPath);
}

async function normalizeJacketPng(bytes: Uint8Array): Promise<Uint8Array> {
  return normalizeSourcePng(bytes, "jacket", Object.freeze({ width: 360, height: 360 }));
}

async function normalizeStagePng(bytes: Uint8Array): Promise<Uint8Array> {
  return normalizeSourcePng(bytes, "stage backdrop", null);
}

async function normalizeSourcePng(
  bytes: Uint8Array,
  label: string,
  fixedSize: Readonly<{ width: number; height: number }> | null,
): Promise<Uint8Array> {
  const source = inspectPng(bytes);
  const sizeMatches = fixedSize === null ||
    (source?.width === fixedSize.width && source.height === fixedSize.height);
  if (
    source !== null && sizeMatches && source.bitDepth === 8 && source.colorType === 6 && source.interlace === 0
  ) return Uint8Array.from(bytes);
  if (typeof createImageBitmap !== "function") {
    throw new Error(`Simulator ${label} conversion requires createImageBitmap; unsupported source images are not passed through.`);
  }
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }), {
    imageOrientation: "none",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  try {
    const width = fixedSize?.width ?? bitmap.width;
    const height = fixedSize?.height ?? bitmap.height;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Simulator ${label} decoded dimensions are invalid.`);
    }
    let blob: Blob;
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: true });
      if (context === null) throw new Error(`Offscreen ${label} conversion 2D context is unavailable.`);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvas.convertToBlob({ type: "image/png" });
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (context === null) throw new Error(`${label} conversion 2D context is unavailable.`);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => {
        if (value === null || value.size === 0) reject(new Error(`${label} PNG encoding failed.`));
        else resolve(value);
      }, "image/png"));
    } else {
      throw new Error(`No deterministic ${label} conversion surface is available.`);
    }
    const converted = new Uint8Array(await blob.arrayBuffer());
    requireRgbaPng(converted, `converted ${label}`, fixedSize !== null);
    return converted;
  } finally {
    bitmap.close();
  }
}

function requireRgbaPng(bytes: Uint8Array, label: string, jacket: boolean): void {
  const profile = inspectPng(bytes);
  if (
    profile === null || profile.bitDepth !== 8 || profile.colorType !== 6 || profile.interlace !== 0 ||
    (jacket && (profile.width !== 360 || profile.height !== 360))
  ) throw new Error(`Simulator ${label} must be a non-interlaced 8-bit RGBA PNG${jacket ? " at 360x360" : ""}.`);
}

function inspectPng(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly interlace: number;
} | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 29 || signature.some((value, index) => bytes[index] !== value) ||
    readU32(bytes, 8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
  const width = readU32(bytes, 16);
  const height = readU32(bytes, 20);
  return width <= 0 || height <= 0 ? null : Object.freeze({
    width,
    height,
    bitDepth: bytes[24]!,
    colorType: bytes[25]!,
    interlace: bytes[28]!,
  });
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! * 0x1000000 + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0;
}
function basename(path: string): string { return path.split("/").pop() ?? path; }
