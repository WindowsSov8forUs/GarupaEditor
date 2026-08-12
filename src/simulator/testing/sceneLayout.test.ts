declare function require(name: string): any;
const assert = require("node:assert/strict");

import { ButtonType } from "../engine/chart/types";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { particleFloat32FromBits } from "../backends/particleValidation";
import { noteInformation } from "./firstSliceFixtures";

const config = Object.freeze({
  specificSpeed: Math.fround(11),
  noteSize: Math.fround(100),
  highAspectRatio: 1 as const,
  judgeOffsetFrames: 0,
  habahiroMeshWidthSetting: Math.fround(1),
});
const surface = Object.freeze({
  viewportWidth: 1600,
  viewportHeight: 720,
  inputOrigin: "bottom-left" as const,
});
const resources = Object.freeze({
  noteAtlasLogicalAssetId: "ordinary",
  directionalAtlasLogicalAssetId: "directional",
  habahiroAtlasLogicalAssetIds: Object.freeze({
    normal: "hab-normal",
    normal16: "hab-normal16",
    flick: "hab-flick",
    long: "hab-long",
    longFlash: "hab-long-flash",
    slideAmong: "hab-slide",
  }),
});

const ordinary = requireOk(createSimulatorSceneLayout(surface, config, "ordinary", resources));
assert.equal(ordinary.ordinaryNoteScene.goalPositions.length, 7);
assert.equal(ordinary.ordinaryNoteScene.noteStartPositions.length, 7);
assert.equal(ordinary.particleScene.buttonAnchors.length, 15);
assert.deepEqual(ordinary.particleScene.buttonAnchors.map((row) => row.buttonType),
  [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15]);
assert.equal(ordinary.particleScene.buttonAnchors.some((row) => row.buttonType === 7), false);
const centerAnchor = ordinary.particleScene.buttonAnchors.find((row) => row.buttonType === 3)!;
assert.equal(particleFloat32FromBits(centerAnchor.position.xBits), Math.fround(0));
assert.equal(
  particleFloat32FromBits(centerAnchor.position.yBits),
  ordinary.ordinaryNoteScene.goalPositions[3]!.y.value,
);

const center = ordinary.ordinaryNoteScene.goalPositions[3]!;
const centerScreen = Object.freeze({
  x: Math.fround(800 + center.x.value * 360),
  y: Math.fround(360 + center.y.value * 360),
});
assert.equal(requireOk(ordinary.manualInputGeometry.resolveButton(centerScreen)), 3);
assert.equal(requireOk(ordinary.manualInputGeometry.isInsideTargetButtons(centerScreen, [3])), true);
assert.equal(requireOk(ordinary.manualInputGeometry.getGameplayButtonLocalY!(3)), center.y.value);
assert.equal(ordinary.manualInputGeometry.getGameplayButtonLocalY!(7).status, "evidence-required");
const slideJudge = requireOk(ordinary.manualInputGeometry.getSlideJudgeGeometry!(slideSourcePlaceholder()));
assert.ok(slideJudge.positions.length >= 17 && slideJudge.positions.length < 512);
assert.ok(slideJudge.positions.every((value, index) => index === 0 || value > slideJudge.positions[index - 1]!));
assert.ok(slideJudge.positions[0]! < slideJudge.virtualPerfectLine);
assert.ok(slideJudge.positions[slideJudge.positions.length - 1]! > slideJudge.virtualPerfectLine);
const slideSource = Object.freeze({
  ...noteInformation("scene-slide", 1),
  buttonType: ButtonType.Button_03_BMS_1P_03,
  buttonTypes: Object.freeze([ButtonType.Button_03_BMS_1P_03]),
  buttonTypesArray: Object.freeze([ButtonType.Button_03_BMS_1P_03]),
  bpm: Math.fround(120),
  absolutePos: 192,
});
const currentY = requireOk(ordinary.manualInputGeometry.getSlideCurrentLocalY!(slideSource, Math.fround(192)));
assert.ok(currentY <= center.y.value);

const habahiro = requireOk(createSimulatorSceneLayout(surface, config, "habahiro", resources));
assert.equal(habahiro.ordinaryNoteScene.habahiro?.fieldBefore.length, 2);
assert.equal(habahiro.ordinaryNoteScene.habahiro?.fieldAfter.length, 2);
assert.equal(habahiro.ordinaryNoteScene.habahiro?.fieldMasks.length, 1);
assert.equal(requireOk(habahiro.manualInputGeometry.resolveButton(centerScreen)), 3);
habahiro.manualInputGeometry.setHabahiroLaneChanged?.();
assert.equal(requireOk(habahiro.manualInputGeometry.resolveButton(centerScreen)), 11);

assert.equal(createSimulatorSceneLayout({ ...surface, viewportWidth: 1599 }, config, "ordinary", resources).status,
  "evidence-required");
assert.equal(createSimulatorSceneLayout(surface, { ...config, noteSize: Math.fround(79) }, "ordinary", resources).status,
  "evidence-required");

console.log("unified simulator scene tests passed: ordinary/particle/manual-slide/HAB layout owner");

function slideSourcePlaceholder() {
  return noteInformation("scene-slide-profile", 0);
}

function requireOk<T>(result: { status: string; value?: T; capability?: string }): T {
  if (result.status !== "ok") throw new Error(result.capability ?? result.status);
  return result.value as T;
}
