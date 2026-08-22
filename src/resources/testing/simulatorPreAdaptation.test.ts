import { buildSimulatorLaunchDescriptor } from "../../app/simulator/buildSimulatorLaunchDescriptor";
import { buildSimulatorLaunchRequest } from "../../app/simulator/buildSimulatorLaunchRequest";
import { buildSimulatorPreAdaptedConfig } from "../../app/simulator/preAdaptationContract";
import { calculateMobileSafeArea } from "../../app/simulator/mobileSafeArea";
import { ApplicationResourceManager } from "../applicationResourceManager";
import type { ResourceObjectUrlFactory } from "../backend";
import { MemoryApplicationResourceBackend } from "../memoryResourceBackend";

export async function runSimulatorPreAdaptationTests(): Promise<void> {
  const manager = new ApplicationResourceManager(new MemoryApplicationResourceBackend(), new NoopObjectUrls());
  equal((await manager.initialize()).status, "accepted");
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
    bgmGainPercent: 80,
    seGainPercent: 60,
    requestedWindowWidth: 1280,
    requestedWindowHeight: 720,
  });
  const descriptor = prepared.descriptor;
  equal(descriptor.schemaVersion, 1);
  equal(descriptor.isFullLength, false);
  equal(descriptor.config.sessionMode, "live");
  equal(descriptor.config.inputMode, "auto");
  equal(descriptor.config.highFrequencyMode, true);
  equal(descriptor.config.syncLine, false);
  equal(descriptor.config.noteColor, true);
  equal(descriptor.config.visibleTapLaneEffect, true);
  equal(descriptor.config.mvDarkness, 20);
  equal(Object.keys(descriptor.config).sort().join(","), "audio,highFrequencyMode,inputMode,judgementAdjustValue,judgementAdjustValueB,mvDarkness,noteColor,sessionMode,skin,syncLine,visibleTapLaneEffect,visual");
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
  await prepared.handoffLease.release();

  const safeArea = calculateMobileSafeArea({ left: 20, right: 10, top: 4, bottom: 6 }, 800, 360, 1600, 720);
  equal(safeArea.x, Math.fround(40));
  equal(safeArea.y, Math.fround(12));
  equal(safeArea.width, Math.fround(1540));
  equal(safeArea.height, Math.fround(700));
  let rejected = false;
  try {
    buildSimulatorPreAdaptedConfig({ fps: 60, noteSize: 151, noteSpeed: 9, syncLine: true, bgmGainPercent: 100, seGainPercent: 100 });
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
