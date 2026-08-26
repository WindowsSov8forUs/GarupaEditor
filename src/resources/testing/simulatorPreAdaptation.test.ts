import { buildSimulatorLaunchDescriptor } from "../../app/simulator/buildSimulatorLaunchDescriptor";
import { buildSimulatorLaunchRequest } from "../../app/simulator/buildSimulatorLaunchRequest";
import {
  SIMULATOR_ALL_PERFECT_DISPLAY_DEFAULT_PRODUCT_SEMANTICS_ID,
  SIMULATOR_PRE_ADAPTATION_DEFAULTS,
  buildSimulatorPreAdaptedConfig,
  resolveSimulatorAllPerfectStatusDisplayMode,
} from "../../app/simulator/preAdaptationContract";
import { calculateMobileSafeArea } from "../../app/simulator/mobileSafeArea";
import {
  decodeSimulatorLaunchTransportConfig,
  encodeSimulatorLaunchTransportConfig,
} from "../../app/simulator/transportContracts";
import { createSimulatorSessionRecipe } from "../../simulator/assembly/sessionRecipe";
import { ApplicationResourceManager } from "../applicationResourceManager";
import type { ResourceObjectUrlFactory } from "../backend";
import { MemoryApplicationResourceBackend } from "../memoryResourceBackend";

export async function runSimulatorPreAdaptationTests(): Promise<void> {
  const manager = new ApplicationResourceManager(new MemoryApplicationResourceBackend(), new NoopObjectUrls());
  equal((await manager.initialize()).status, "accepted");
  equal(SIMULATOR_ALL_PERFECT_DISPLAY_DEFAULT_PRODUCT_SEMANTICS_ID,
    "app.simulator.all-perfect-status-display-default-on-v1");
  equal(SIMULATOR_PRE_ADAPTATION_DEFAULTS.allPerfectStatusDisplayMode, true);
  equal(resolveSimulatorAllPerfectStatusDisplayMode(undefined), true);
  equal(resolveSimulatorAllPerfectStatusDisplayMode(null), true);
  equal(resolveSimulatorAllPerfectStatusDisplayMode(false), false);
  equal(resolveSimulatorAllPerfectStatusDisplayMode(true), true);
  const bgm = await manager.importWorkspaceMedia({ purpose: "bgm", fileName: "song.mp3", mediaType: "audio/mpeg", bytes: id3() });
  const cover = await manager.importWorkspaceMedia({ purpose: "cover", fileName: "cover.png", mediaType: "image/png", bytes: png(360, 360) });
  const stage = await manager.importWorkspaceMedia({ purpose: "stage-backdrop", fileName: "stage.png", mediaType: "image/png", bytes: png(1600, 720) });
  if (bgm.status === "rejected" || cover.status === "rejected" || stage.status === "rejected") throw new Error("test media import failed");
  const prepared = await buildSimulatorLaunchDescriptor({
    manager,
    chartJson: JSON.stringify([
      { type: "BPM", beat: 0, value: 120 },
      { type: "Directional", beat: 1, lane: 1.5, width: 2, direction: "Left" },
      { type: "Slide", connections: [
        { type: "Single", beat: 2, lane: -1, width: 3 },
        { type: "Directional", beat: 3, lane: 5, width: 1, direction: "Right" },
      ] },
    ]),
    media: Object.freeze({ bgm: bgm.value.ref, cover: cover.value.ref, mv: null, stageBackdrop: stage.value.ref }),
    metadata: {
      title: "Song", artist: "Band", charter: "Charter", difficulty: "EXPERT", difficultyLevel: "27",
      bpm: 120, offsetMs: 1234, mvOffsetMs: -321,
    },
    mirror: true,
    mvEnabled: false,
    fps: 120,
    noteSize: 100,
    noteSpeed: 9.7,
    syncLine: false,
    allPerfectStatusDisplayMode: false,
    bgmGainPercent: 80,
    seGainPercent: 60,
    requestedWindowWidth: 1280,
    requestedWindowHeight: 720,
  });
  const descriptor = prepared.descriptor;
  equal(descriptor.schemaVersion, 3);
  equal(descriptor.isFullLength, false);
  equal(descriptor.config.sessionMode, "live");
  equal(descriptor.config.inputMode, "auto");
  equal(descriptor.config.highFrequencyMode, true);
  equal(descriptor.config.syncLine, false);
  equal(descriptor.config.noteColor, true);
  equal(descriptor.config.visibleTapLaneEffect, true);
  equal(descriptor.config.allPerfectStatusDisplayMode, false);
  equal(descriptor.config.mvDarkness, 20);
  equal(Object.keys(descriptor.config).sort().join(","), "allPerfectStatusDisplayMode,audio,highFrequencyMode,inputMode,judgementAdjustValue,judgementAdjustValueB,mvDarkness,noteColor,sessionMode,skin,syncLine,visibleTapLaneEffect,visual");
  equal(descriptor.config.visual.specificSpeed, "0x411B3333");
  equal(descriptor.config.visual.noteSize, "0x42C80000");
  equal(descriptor.config.visual.habahiroMeshWidthSetting, "0x3F800000");
  equal(descriptor.config.audio.masterGain, "0x3F800000");
  equal(descriptor.config.audio.bgmGain, "0x3F4CCCCD");
  equal(descriptor.config.audio.seGain, "0x3F19999A");
  const serialized = JSON.stringify(descriptor);
  for (const forbidden of ["http://", "https://", "DataURL", "sha256", "offsetMs", "mvAlphaPercent", "effectEnable", "colorAssist", "autoStart"]) {
    equal(serialized.includes(forbidden), false);
  }
  const chart = JSON.parse(descriptor.chartJson);
  equal(chart[1].lane, 3.5);
  equal(chart[1].direction, "Right");
  equal(chart[2].connections[0].lane, 5);
  equal(chart[2].connections[1].lane, 1);
  equal(chart[2].connections[1].direction, "Left");
  const request = await buildSimulatorLaunchRequest(descriptor, prepared.handoffLease);
  equal(request.chartData.bgm.byteLength, id3().byteLength);
  equal(request.presentation.jacketPng.byteLength, 29);
  equal(request.presentation.stage.backdropPng.byteLength, 29);
  equal(request.presentation.mv, null);
  equal(request.config.visual.specificSpeed, Math.fround(9.7));
  equal(request.config.audio.bgmGain, Math.fround(0.8));
  equal(request.config.audio.seGain, Math.fround(0.6));
  const tolerantTransport = decodeSimulatorLaunchTransportConfig({
    ...descriptor.config,
    transportMetadata: "ignored",
    visual: { ...descriptor.config.visual, specificSpeed: descriptor.config.visual.specificSpeed.toLowerCase(), extra: true },
    audio: { ...descriptor.config.audio, extra: true },
  } as any);
  equal(tolerantTransport.visual.specificSpeed, Math.fround(9.7));
  equal("transportMetadata" in tolerantTransport, false);
  equal("extra" in tolerantTransport.visual, false);
  const normalizedTransport = encodeSimulatorLaunchTransportConfig({
    ...request.config,
    visual: { ...request.config.visual, specificSpeed: 9.7 },
  });
  equal(normalizedTransport.visual.specificSpeed, "0x411B3333");
  const recipe = createSimulatorSessionRecipe(request);
  equal(recipe.status, "rejected");
  if (recipe.status === "rejected") equal(recipe.failure.capability, "simulator.presentation.invalid-png");
  await prepared.handoffLease.release();

  const originalStage = await manager.registerBuiltin({
    id: "builtin/test/stage-original",
    kind: "package",
    title: "Original stage package",
    sourceUrl: "memory:stage-original",
    files: [
      { logicalPath: "ingameskin-bgskin-skin00.bundle", mediaType: "application/json", bytes: Uint8Array.of(1) },
      { logicalPath: "liveBG_fever.png", mediaType: "image/png", bytes: png(1600, 720) },
      { logicalPath: "liveBG_normal.png", mediaType: "image/png", bytes: png(1600, 720) },
    ],
  });
  if (originalStage.status === "rejected") throw new Error(originalStage.failure.capability);
  const originalSnapshot = await manager.createSnapshotFromRefs(Object.freeze({
    "simulator.media.bgm": bgm.value.ref,
    "simulator.media.jacket": cover.value.ref,
    "simulator.media.stage": originalStage.value.ref,
  }));
  if (originalSnapshot.status === "rejected") throw new Error(originalSnapshot.failure.capability);
  const originalLease = await manager.acquireSnapshot(originalSnapshot.value.snapshotId);
  if (originalLease.status === "rejected") throw new Error(originalLease.failure.capability);
  const originalRequest = await buildSimulatorLaunchRequest(Object.freeze({
    ...descriptor,
    mediaSnapshotId: originalSnapshot.value.snapshotId,
  }), originalLease.value);
  equal(originalRequest.presentation.stage.backdropPng.byteLength, 29);
  await originalLease.value.release();

  const ambiguousStage = await manager.registerBuiltin({
    id: "builtin/test/stage-ambiguous",
    kind: "package",
    title: "Ambiguous stage package",
    sourceUrl: "memory:stage-ambiguous",
    files: [
      { logicalPath: "liveBG.png", mediaType: "image/png", bytes: png(1600, 720) },
      { logicalPath: "liveBG_normal.png", mediaType: "image/png", bytes: png(1600, 720) },
    ],
  });
  if (ambiguousStage.status === "rejected") throw new Error(ambiguousStage.failure.capability);
  const ambiguousSnapshot = await manager.createSnapshotFromRefs(Object.freeze({
    "simulator.media.bgm": bgm.value.ref,
    "simulator.media.jacket": cover.value.ref,
    "simulator.media.stage": ambiguousStage.value.ref,
  }));
  if (ambiguousSnapshot.status === "rejected") throw new Error(ambiguousSnapshot.failure.capability);
  const ambiguousLease = await manager.acquireSnapshot(ambiguousSnapshot.value.snapshotId);
  if (ambiguousLease.status === "rejected") throw new Error(ambiguousLease.failure.capability);
  let ambiguousRejected = false;
  try {
    await buildSimulatorLaunchRequest(Object.freeze({
      ...descriptor,
      mediaSnapshotId: ambiguousSnapshot.value.snapshotId,
    }), ambiguousLease.value);
  } catch { ambiguousRejected = true; }
  equal(ambiguousRejected, true);
  await ambiguousLease.value.release();

  const safeArea = calculateMobileSafeArea({ left: 20, right: 10, top: 4, bottom: 6 }, 800, 360, 1600, 720);
  equal(safeArea.x, Math.fround(40));
  equal(safeArea.y, Math.fround(12));
  equal(safeArea.width, Math.fround(1540));
  equal(safeArea.height, Math.fround(700));
  let rejected = false;
  try {
    buildSimulatorPreAdaptedConfig({ fps: 60, noteSize: 151, noteSpeed: 9, syncLine: true, allPerfectStatusDisplayMode: true, bgmGainPercent: 100, seGainPercent: 100 });
  } catch { rejected = true; }
  equal(rejected, true);
}

class NoopObjectUrls implements ResourceObjectUrlFactory {
  create(): string { return "noop"; }
  revoke(): void {}
}
function id3(): Uint8Array { return Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]); }
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(29);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes[28] = 0;
  return bytes;
}
function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
}
