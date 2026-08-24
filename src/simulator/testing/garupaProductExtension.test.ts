declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { Texture, TextureSource } from "pixi.js";
import { copyAndFreezeGarupaChartJson } from "../assembly/garupaChartContract";
import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import { PixiRendererBackend, type PixiTextureDecoder } from "../backends/pixi/pixiRendererBackend";
import { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import { parseCurrentOrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "./legacyCurrentOrdinaryResourceManifest";
import type { RenderResourceAssetProfile, RenderResourceProfile } from "../backends/renderingContracts";
import { ok } from "../engine/evidence";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import { GarupaProductRenderProducer } from "../engine/garupa/productRenderProducer";
import { getGarupaProductTimingGroupAxisProfile } from "../engine/garupa/timingGroupAxis";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";

const SESSION = "actual-pixi-garupa-product-extension";
const fixtureRoot = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4",
);
const decoder: PixiTextureDecoder = {
  async decodePng(asset) {
    const source = new TextureSource({
      width: asset.width!, height: asset.height!,
      resource: { width: asset.width!, height: asset.height! },
      resolution: 1, autoGarbageCollect: false,
    });
    return ok(new Texture({ source, label: asset.logicalAssetId }));
  },
};

async function main(): Promise<void> {
  const reaudit = JSON.parse(readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/production-visual-third-reaudit/artifacts/investigations/simulator-production-visual-third-reaudit-10-1-4/simulator_production_visual_third_reaudit.json",
  ), "utf8"));
  assert.equal(reaudit.product_semantics.id, "simulator.product-compatible-node-visual-routing-v1");
  assert.equal(reaudit.auto_live_caption.background.exact_key, "label_round_white");
  assert.equal(reaudit.auto_live_caption.label.text, "オートライブ");
  assert.deepEqual(
    reaudit.note_resource_contract.mesh.initial_color_f32_bits,
    ["3F800000", "3F800000", "3F800000", "3F4CCCCD"],
  );
  const baseProfile = JSON.parse(readFileSync(
    join(fixtureRoot, "ordinary_portable_profile.json"),
    "utf8",
  )) as RenderResourceProfile;
  const visibleProfile = parseCurrentOrdinaryVisibleProfile(JSON.parse(readFileSync(
    join(
      process.cwd(),
      "src/simulator/testing/fixtures/reverse-snapshots/ordinary-visible-rendering/artifacts/investigations/ordinary-visible-rendering-portable-10-1-4/ordinary_visible_rendering_profile.json",
    ),
    "utf8",
  )));
  if (visibleProfile === null) throw new Error("ordinary visible fixture is invalid");
  const profile: RenderResourceProfile = Object.freeze({
    ...baseProfile,
    ordinaryVisibleProfile: visibleProfile,
  });
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(
    profile.assets.map((asset) => Object.freeze({
      logicalAssetId: asset.logicalAssetId,
      bytes: new Uint8Array(readFileSync(resourcePath(asset))),
    })),
  ));
  const renderer = new PixiRendererBackend(decoder);
  requireOk(await renderer.prepare(
    SESSION,
    profile,
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ));
  const copied = requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 2, value: -1, timingGroup: "#1" },
    { type: "Single", beat: 1, lane: 0.5, width: 2, timingGroup: "#1" },
    { type: "Directional", beat: 1, lane: 7, width: 3, direction: "Left", timingGroup: "#1" },
    { type: "Slide", connections: [
      { type: "Single", beat: 0.25, lane: 0, width: 1 },
      { type: "Single", beat: 0.5, lane: 1, width: 1 },
      { type: "Flick", beat: 0.75, lane: 2, width: 1 },
    ] },
    { type: "Slide", timingGroup: "#1", connections: [
      { type: "Hidden", beat: 1, lane: -1, width: 1 },
      { type: "Flick", beat: 2, lane: 2.25, width: 2 },
      { type: "Hidden", beat: 3, lane: 7, width: 1 },
    ] },
    { type: "Slide", connections: [
      { type: "Hidden", beat: 4, lane: 1, width: 1 },
    ] },
  ]));
  const chart = requireOk(constructChartFromGarupaChartJson(copied.chart));
  const product = getGarupaProductChartProfile(chart)!;
  const axis = getGarupaProductTimingGroupAxisProfile(chart)!;
  const layout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: 1600, viewportHeight: 720, safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }, origin: "bottom-left" },
    {
      specificSpeed: Math.fround(11), noteSize: Math.fround(100),
      judgementAdjustValueB: 0, habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0),
    },
    "ordinary",
    CURRENT_ORDINARY_RENDER_BINDINGS,
  ));
  const overflowProjection = layout.garupaProductScene.projectLaneAtCurve(0, Number.MAX_VALUE);
  assert.equal(overflowProjection.status, "integrity-failure");
  if (overflowProjection.status === "integrity-failure") {
    assert.equal(overflowProjection.capability, "scene.invalid-product-projection");
  }
  requireOk(renderer.bindOriginalSurfaceLayout(layout.surfaceLayout));
  const producer = new GarupaProductRenderProducer(
    SESSION,
    renderer,
    CURRENT_ORDINARY_RENDER_BINDINGS,
    product,
    axis,
    layout.garupaProductScene,
    layout.ordinaryNoteScene.specificSpeed,
    true,
    true,
  );
  requireOk(producer.validate());
  const first = requireOk(producer.preflightFrame(0, [], Math.fround(1 / 60)));
  assert.ok(first);
  requireOk(first!.commit());
  const firstRows = renderer.sceneSnapshot();
  assert.equal(firstRows.some((row) => row.renderObjectId.startsWith("render:garupa:field:")), false);
  const farScale = requireOk(layout.garupaProductScene.projectNoteScaleAtCurve(0.002, 1));
  assert.ok(farScale.value > 0 && farScale.value < 0.04);
  const fractionalWide = product.visibleNodes.find((node) => node.identity === "garupa-note:2")!;
  const directionalWide = product.visibleNodes.find((node) => node.identity === "garupa-note:3")!;
  const fractionalWideRow = firstRows.find((row) =>
    row.renderObjectId === `render:garupa:node:${fractionalWide.identity}`)!;
  assert.equal(
    fractionalWideRow.spriteBindingKey?.endsWith("note_normal_1"),
    true,
    "integer center of a product-wide node retains its exact selected source lane key",
  );
  assert.equal(
    fractionalWideRow.scale[0],
    fractionalWideRow.scale[1],
    "wide product fronts keep the authored uniform Note transform instead of X-only Sprite deformation",
  );
  assert.equal(
    firstRows.find((row) => row.renderObjectId === `render:garupa:node:${directionalWide.identity}`)?.spriteBindingKey?.endsWith("note_flick_l_6"),
    true,
    "Directional product node retains its exact source center and selected left family",
  );
  const compatibleChain = product.slideChains.find((chain) => chain.chartItemIndex === 4)!;
  const [headId, interiorId, terminalId] = compatibleChain.connectionIdentities;
  const head = firstRows.find((row) => row.renderObjectId === `render:garupa:node:${headId}`);
  const interior = firstRows.find((row) => row.renderObjectId === `render:garupa:node:${interiorId}`);
  const terminal = firstRows.find((row) => row.renderObjectId === `render:garupa:node:${terminalId}`);
  if (head === undefined || interior === undefined || terminal === undefined) {
    throw new Error(`compatible product Slide rows missing: ${JSON.stringify(firstRows.map((row) => row.renderObjectId))}`);
  }
  assert.equal(head.spriteBindingKey?.endsWith("note_long_0"), true);
  assert.equal(interior.spriteBindingKey?.endsWith("note_long_1"), true);
  assert.equal(terminal.spriteBindingKey?.endsWith("note_flick_2"), true);
  assert.equal(firstRows.find((row) => row.renderObjectId === `${head.renderObjectId}:long-flash`)?.activeAnimationRole, "note-long-flash");
  assert.equal(firstRows.find((row) => row.renderObjectId === `${interior.renderObjectId}:long-flash`)?.activeAnimationRole, "note-long-flash");
  assert.equal(firstRows.find((row) => row.renderObjectId === `${terminal.renderObjectId}:icon`)?.activeAnimationRole, "note-flick");
  assert.ok(firstRows.some((row) => row.renderObjectId.startsWith("render:garupa:line:") && row.geometryVertexCount === 22));
  const sync = firstRows.find((row) => row.renderObjectId.startsWith("render:garupa:sync:") && row.visible);
  assert.ok(sync?.geometryPositions);
  const syncY = sync!.geometryPositions!.filter((_value, index) => index % 2 === 1);
  assert.ok(Math.max(...syncY) - Math.min(...syncY) < 40);
  assert.ok(firstRows.every((row) => !row.renderObjectId.startsWith("render:garupa:node:garupa-slide:5")));

  const judged = product.visibleNodes[0]!;
  const effect = requireOk(producer.preflightFrame(
    judged.absolutePosition,
    [judged],
    Math.fround(1 / 60),
  ));
  assert.ok(effect);
  requireOk(effect!.commit());
  const judgedRows = renderer.sceneSnapshot();
  assert.equal(judgedRows.some((row) =>
    row.renderObjectId.startsWith("render:garupa:effect:") ||
    row.renderObjectId.startsWith("render:garupa:tap-lane:")), false,
  "product renderer does not replace selected ParticleSystem or 13-slot lane-effect owners with sidecar geometry");
  assert.equal(
    judgedRows.find((row) => row.renderObjectId === `render:garupa:node:${judged.identity}`)?.visible,
    false,
  );
  const targetTopY = layout.surfaceLayout.surface.viewportHeight / 2 -
    layout.garupaProductScene.targetCenterY.value * layout.surfaceLayout.camera.pixelsPerWorldUnit;
  for (const row of judgedRows.filter((candidate) => candidate.renderObjectId.startsWith("render:garupa:line:"))) {
    assert.ok(row.geometryPositions);
    const y = row.geometryPositions!.filter((_value, index) => index % 2 === 1);
    assert.ok(Math.max(...y) <= targetTopY + 0.01);
  }

  const release = requireOk(producer.preflightDispose());
  assert.ok(release);
  requireOk(release!.commit());
  assert.equal(renderer.snapshot().objectCount, 0);
  assert.equal(renderer.stage.children.length, 0);
  requireOk(renderer.dispose());
  console.log("Garupa product actual Pixi passed: selected-field-only/ordinary-scale/scaled-sync/judged-hide/clipped-slide/no-fallback-effect/cleanup");
}

function resourcePath(asset: RenderResourceAssetProfile): string {
  const files = new Map([
    ["ordinary/notes/skin00/atlas", "ordinary-portable-assets/rhythm-game-sprites.png"],
    ["ordinary/notes/skin00/long-note-line", "ordinary-portable-assets/long-note-line.png"],
    ["ordinary/notes/skin00/curve-note-line", "ordinary-portable-assets/curve-note-line.png"],
    ["ordinary/notes/skin00/simultaneous-line", "ordinary-portable-assets/simultaneous-line.png"],
    ["ordinary/notes/directionalflickskin00/atlas", "ordinary-portable-assets/directional-flick-sprites.png"],
    ["ordinary/notes/directionalflickskin00/line-left", "ordinary-portable-assets/directional-line-left.png"],
    ["ordinary/notes/directionalflickskin00/line-right", "ordinary-portable-assets/directional-line-right.png"],
  ]);
  const relative = files.get(asset.logicalAssetId);
  if (relative === undefined) throw new Error(`missing Garupa product fixture mapping ${asset.logicalAssetId}`);
  return join(fixtureRoot, relative);
}

function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "integrity-failure"; readonly boundary: string }): T {
  if (result.status !== "ok") throw new Error(result.boundary);
  return result.value;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
