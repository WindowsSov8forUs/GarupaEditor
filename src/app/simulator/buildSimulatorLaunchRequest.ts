import { normalizeSourcePng } from "../../resources/normalizeImagePng";
import { parseGarupaChartJson } from "../../chart";
import type { ResourceConsumerLease } from "../../resources/contracts";
import type { SimulatorModuleLaunchRequest } from "../../simulator/public/contracts";
import {
  decodeSimulatorLaunchTransportConfig,
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
    config: decodeSimulatorLaunchTransportConfig(descriptor.config),
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

function basename(path: string): string { return path.split("/").pop() ?? path; }
