import type { ChartMetadata } from "../../chartCore";
import type { ApplicationResourceManager } from "../../resources/applicationResourceManager";
import {
  createResourceRef,
  type ResourceConsumerLease,
  type ResourceRef,
} from "../../resources/contracts";
import type { ChartMediaResources } from "../../resources/selections";
import { buildSimulatorGarupaChart } from "./chartAdapter";
import { buildSimulatorPreAdaptedConfig } from "./preAdaptationContract";
import {
  SIMULATOR_MEDIA_SLOTS,
  type SimulatorLaunchTransportDescriptor,
} from "./transportContracts";

export interface BuildSimulatorLaunchDescriptorInput {
  readonly manager: ApplicationResourceManager;
  readonly chartJson: string;
  readonly media: ChartMediaResources;
  readonly metadata: ChartMetadata;
  readonly mirror: boolean;
  readonly mvEnabled: boolean;
  readonly fps: 60 | 120;
  readonly noteSize: number;
  readonly noteSpeed: number;
  readonly syncLine: boolean;
  readonly bgmGainPercent: number;
  readonly seGainPercent: number;
  readonly requestedWindowWidth: number;
  readonly requestedWindowHeight: number;
}

export interface PreparedSimulatorLaunchDescriptor {
  readonly descriptor: SimulatorLaunchTransportDescriptor;
  readonly handoffLease: ResourceConsumerLease;
}

export async function buildSimulatorLaunchDescriptor(
  input: BuildSimulatorLaunchDescriptorInput,
): Promise<PreparedSimulatorLaunchDescriptor> {
  if (input.media.bgm === null) throw new Error("Simulator requires one selected BGM resource.");
  const title = strictText(input.metadata.title, "song title");
  const bandName = strictText(input.metadata.artist, "artist/band name");
  const level = strictPositiveInteger(input.metadata.difficultyLevel, "difficulty level");
  const mvDelay = strictInt32(input.metadata.mvOffsetMs, "MV delay");
  const width = strictPositiveInteger(input.requestedWindowWidth, "window width");
  const height = strictPositiveInteger(input.requestedWindowHeight, "window height");
  const chart = buildSimulatorGarupaChart(input.chartJson, input.mirror);
  const config = buildSimulatorPreAdaptedConfig({
    fps: input.fps,
    noteSize: input.noteSize,
    noteSpeed: input.noteSpeed,
    syncLine: input.syncLine,
    bgmGainPercent: input.bgmGainPercent,
    seGainPercent: input.seGainPercent,
  });
  const cover = input.media.cover ?? requireRef("builtin/ui/default-cover");
  let stage = input.media.stageBackdrop;
  if (stage === null) {
    const refreshed = await input.manager.refreshCatalog("bestdori");
    if (refreshed.status === "rejected") {
      throw new Error(`${refreshed.failure.capability}: ${refreshed.failure.boundary}`);
    }
    stage = requireRef("bestdori/jp/ingameskin/bgskin/skin00");
  }
  if (input.mvEnabled && input.media.mv === null) {
    throw new Error("Simulator MV mode requires one explicit video resource.");
  }
  const bindings: Record<string, ResourceRef> = {
    [SIMULATOR_MEDIA_SLOTS.bgm]: input.media.bgm,
    [SIMULATOR_MEDIA_SLOTS.jacket]: cover,
    [SIMULATOR_MEDIA_SLOTS.stage]: stage,
    ...(input.mvEnabled ? { [SIMULATOR_MEDIA_SLOTS.mv]: input.media.mv! } : {}),
  };
  const snapshot = await input.manager.createSnapshotFromRefs(Object.freeze(bindings));
  if (snapshot.status === "rejected") {
    throw new Error(`${snapshot.failure.capability}: ${snapshot.failure.boundary}`);
  }
  const handoff = await input.manager.acquireSnapshot(snapshot.value.snapshotId);
  if (handoff.status === "rejected") {
    throw new Error(`${handoff.failure.capability}: ${handoff.failure.boundary}`);
  }
  const descriptor: SimulatorLaunchTransportDescriptor = Object.freeze({
    schemaVersion: 1,
    requestId: requestIdentity(),
    mediaSnapshotId: snapshot.value.snapshotId,
    chartJson: JSON.stringify(chart),
    isFullLength: false,
    presentation: Object.freeze({
      song: Object.freeze({
        title,
        bandName,
        lyricist: null,
        composer: null,
        arranger: null,
      }),
      difficulty: Object.freeze({ type: input.metadata.difficulty, level }),
      mvEnabled: input.mvEnabled,
      mvMusicStartDelayMilliseconds: mvDelay,
    }),
    config,
    requestedWindow: Object.freeze({ width, height }),
  });
  return Object.freeze({ descriptor, handoffLease: handoff.value });
}

function requireRef(id: string): ResourceRef {
  const reference = createResourceRef(id);
  if (reference.status === "rejected") throw new Error(reference.failure.boundary);
  return reference.value;
}

function requestIdentity(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Simulator transport requires crypto.randomUUID; time/random fallback is forbidden.");
  }
  return `simulator-launch-${crypto.randomUUID()}`;
}

function strictText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`Simulator ${label} requires one non-empty text without trim repair.`);
  }
  return value;
}

function strictPositiveInteger(value: unknown, label: string): number {
  const text = typeof value === "string" ? value : String(value);
  if (!/^[1-9][0-9]*$/.test(text)) throw new Error(`Simulator ${label} must be a positive integer.`);
  const numeric = Number(text);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error(`Simulator ${label} exceeds the safe integer domain.`);
  return numeric;
}

function strictInt32(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < -2147483648 || numeric > 2147483647) {
    throw new Error(`Simulator ${label} must be a signed Int32 without clamping.`);
  }
  return numeric;
}
