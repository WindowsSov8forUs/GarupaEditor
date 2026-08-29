declare const require: (id: string) => any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import { particleFloat32FromBits } from "../backends/particleValidation";
import type { OneFrameJudgementBatch } from "../engine/data/oneFrameData";
import { getGarupaProductChartProfile, type GarupaProductNode } from "../engine/garupa/productChartProfile";
import { ParticleCommandProducer } from "../engine/particles/particleCommandProducer";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";

const correctionRoot = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/particle-lane-slide-one-frame-correction/artifacts/investigations/simulator-particle-lane-slide-one-frame-correction-10-1-4",
);

function main(): void {
  const oracle = JSON.parse(readFileSync(join(correctionRoot, "correction_oracle.json"), "utf8"));
  assert.equal(oracle.status, "confirmed-current-correction-oracle");
  assert.deepEqual(Object.keys(oracle.evidence_ids), [
    "PLSO-P01", "PLSO-L01", "PLSO-L02", "PLSO-L03",
    "PLSO-S01", "PLSO-S02", "PLSO-O01", "PLSO-B01",
  ]);
  assert.deepEqual(oracle.particle_atlas.selected_raster_tile, {
    column: 3,
    row_from_top: 2,
    rgba_sha256: "C0F52F2624542475038C1E669BB56E363E8C7C9D9AD6731B93A0353FCEE9BF34",
    observed_shape: "solid five-point star with glow",
  });
  assert.equal(oracle.particle_atlas.rejected_vertical_inversion_tile.row_from_top, 1);

  const catalog = JSON.parse(readFileSync(join(
    process.cwd(), "src/simulator/engine/skin/commonRenderSemanticCatalog.json",
  ), "utf8"));
  const laneEntries = catalog.groups.ordinaryVisible
    .map((entry: any) => entry.profile)
    .filter((profile: any) => profile.role === "lane-effect");
  assert.equal(laneEntries.length, 4);
  assert.deepEqual(laneEntries.map((entry: any) => entry.textureSettings.blendMode),
    ["normal", "normal", "normal", "normal"]);
  assert.deepEqual(laneEntries.map((entry: any) => entry.atlasRows[0].pivotX), [
    0.1711825579404831,
    0.23051762580871582,
    0.3616914451122284,
    0.5,
  ]);
  assert.deepEqual(oracle.tap_lane_effect.slot_texture_sequence,
    [1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 2, 2, 1]);
  assert.equal(oracle.tap_lane_effect.shared_mask.count, 1);
  assert.equal(oracle.tap_lane_effect.shared_mask.consumer_interaction, 2);
  assert.equal(oracle.tap_lane_effect.shared_mask.portable_semantic,
    "one shared visible-outside mask owner for all thirteen consumers");

  testPersistentProductSlideTapKeep(oracle);
  console.log("particle/Lane/Slide/OneFrame correction tests passed");
}

function testPersistentProductSlideTapKeep(oracle: any): void {
  const chart = requireOk(constructChartFromGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Slide", connections: [
      { type: "Single", beat: 1, lane: 0.25, width: 1 },
      { type: "Single", beat: 2, lane: 2.5, width: 2 },
      { type: "Single", beat: 3, lane: 5.75, width: 1 },
    ] },
  ]));
  const product = getGarupaProductChartProfile(chart)!;
  const chain = product.slideChains[0]!;
  const nodes = chain.visibleConnectionIdentities.map((identity) => product.nodeByIdentity.get(identity)!);
  const layout = requireOk(createSimulatorSceneLayout(
    {
      revision: 0,
      viewportWidth: 1600,
      viewportHeight: 720,
      safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
      origin: "bottom-left",
    },
    {
      specificSpeed: Math.fround(11),
      noteSize: Math.fround(100),
      judgementAdjustValueB: 0,
      habahiroMeshWidthSetting: Math.fround(1),
      syncLineEdgeMargin: Math.fround(0),
    },
    "ordinary",
    { noteAtlasLogicalAssetId: "note", directionalAtlasLogicalAssetId: "directional" },
  ));
  const producer = new ParticleCommandProducer(chart, true, layout.garupaProductScene);
  requireOk(producer.validate());

  const head = requireOk(producer.preflightJudgement(batch(nodes[0]!, 0)));
  const play = head.commands.find((command) =>
    command.kind === "play-root" && command.root === "ordinary:effect_TapKeep");
  if (play === undefined || play.kind !== "play-root" || play.instance.kind !== "note-slide") {
    throw new Error("PLSO-S01 head did not start one typed persistent Slide TapKeep owner");
  }
  const firstTarget = requireOk(layout.garupaProductScene.projectLaneAtCurve(
    nodes[1]!.spanStart + (nodes[1]!.width - 1) / 2, 1,
  ));
  assert.equal(particleFloat32FromBits(play.instance.rootPositionXBits!), firstTarget.x.value);
  assert.equal(particleFloat32FromBits(play.instance.rootPositionYBits!), firstTarget.y.value);
  const stableOwnerKey = play.ownerKey;
  requireOk(head.commit());

  const intermediate = requireOk(producer.preflightJudgement(batch(nodes[1]!, 1)));
  const move = intermediate.commands.find((command) => command.kind === "move-note-slide-root");
  if (move === undefined || move.kind !== "move-note-slide-root") {
    throw new Error("PLSO-S01 intermediate did not move the persistent Slide TapKeep owner");
  }
  assert.equal(move.ownerKey, stableOwnerKey, "PLSO-S01 moves the persistent owner without restarting it");
  const terminalTarget = requireOk(layout.garupaProductScene.projectLaneAtCurve(
    nodes[2]!.spanStart + (nodes[2]!.width - 1) / 2, 1,
  ));
  assert.equal(particleFloat32FromBits(move.instance.rootPositionXBits!), terminalTarget.x.value);
  assert.equal(intermediate.commands.some((command) =>
    command.kind === "play-root" && command.root === "ordinary:effect_TapKeep"), false);
  requireOk(intermediate.commit());

  const terminal = requireOk(producer.preflightJudgement(batch(nodes[2]!, 2)));
  const stop = terminal.commands.find((command) =>
    command.kind === "stop-clear-deactivate-root" && command.root === "ordinary:effect_TapKeep");
  if (stop === undefined || stop.kind !== "stop-clear-deactivate-root") {
    throw new Error("PLSO-S02 terminal did not Stop/Clear/deactivate the persistent Slide TapKeep owner");
  }
  assert.equal(stop.ownerKey, stableOwnerKey);
  requireOk(terminal.commit());
  assert.equal(producer.snapshot().activeSlideTapKeepOwners.length, 0);
  assert.deepEqual(oracle.slide.head_judgement_call_order.targets, [
    "NoteSlide$$changeCurrentNote", "NoteSlide$$playFlashAnimation", "NoteSlide$$playSlideNoteParticle",
  ]);
  assert.equal(oracle.slide.tap_keep.stop,
    "ParticleSystem.Stop + Clear + GameObject.SetActive(false)");
}

function batch(node: GarupaProductNode, batchIndex: number): OneFrameJudgementBatch {
  const source = node.scoringSource!;
  const entry = Object.freeze({
    slot: 0,
    containerId: "one-frame:0",
    noteIndex: source.index,
    buttonTypes: source.buttonTypesArray,
    noteType: 0,
    phase: "head" as const,
    rawResult: 4 as const,
    adjustedResult: 4 as const,
    addCombo: 1 as const,
    absolutePosition: node.absolutePosition,
    judgeTiming: 0 as const,
    multipleDirectionalFlickNoteCount: 0,
  });
  return Object.freeze({
    batchIndex,
    entries: Object.freeze([entry]),
    entryCount: 1,
    addCombo: 1,
    rawResult: 4,
    adjustedResult: 4,
    judgeTiming: 0,
  });
}

function requireOk<T>(result: { status: string; value?: T; capability?: string }): T {
  assert.equal(result.status, "ok", result.capability);
  return result.value as T;
}

main();
