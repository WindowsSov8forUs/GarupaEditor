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
  assert.equal(reaudit.score_total_label.overflow, "ShrinkContent");
  assert.equal(reaudit.score_total_label.bmfont_default_size, 32);
  assert.deepEqual(
    reaudit.score_total_label.oracles.map((row: any) => row.final_font_size),
    [20, 22, 26, 22],
  );
  const noteHierarchy = JSON.parse(readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/note-hierarchy-fourth-reaudit/artifacts/investigations/simulator-note-hierarchy-fourth-reaudit-10-1-4/note_hierarchy_fourth_reaudit_contract.json",
  ), "utf8"));
  assert.equal(noteHierarchy.slide_scene_ownership.visible_nonterminal_replacement_family, "note_slide_among");
  assert.equal(noteHierarchy.slide_scene_ownership.root_flash_owner_count, 1);
  assert.equal(noteHierarchy.slide_scene_ownership.intermediate_long_flash_owner_count, 0);
  assert.equal(noteHierarchy.portable_acceptance.must_preserve_front_70_icon_71_and_mesh_before_front, true);
  const visualFifth = JSON.parse(readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/visual-fifth-reaudit/artifacts/investigations/simulator-visual-fifth-reaudit-10-1-4/visual_fifth_correction_contract.json",
  ), "utf8"));
  assert.equal(visualFifth.note_mesh.vertex_count, 22);
  assert.equal(visualFifth.note_mesh.index_count, 60);
  const bbkkRoot = join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/full-visible-lifecycle/artifacts/investigations/simulator-full-visible-lifecycle-reaudit-10-1-4",
  );
  const bbkkOracle = JSON.parse(readFileSync(join(bbkkRoot, "bbkk_slide_full_timeline_oracle.json"), "utf8"));
  const slideLogicOracle = JSON.parse(readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/slide-connection-logic/artifacts/investigations/simulator-slide-connection-logic-reaudit-10-1-4/slide_connection_logic_reaudit.json",
  ), "utf8"));
  const bbkkChart = JSON.parse(readFileSync(join(bbkkRoot, "product-inputs/B.B.K.K.B.K.K..json"), "utf8"));
  assert.equal(slideLogicOracle.original.pixelOffsetAllowed, false);
  const variableWidthMiddle = slideLogicOracle.variableWidthOracle.sections[5];
  assert.notEqual(variableWidthMiddle.halfWidth, variableWidthMiddle.rejectedFactorInterpolationHalfWidth,
    "independent oracle distinguishes boundary-first edges from factor interpolation");
  assert.equal(bbkkOracle.authority.rejectedProductionFactor,
    "screenWidthAdjustRate must not be multiplied a second time after localScale already consumed it");
  const baseProfile = JSON.parse(readFileSync(
    join(fixtureRoot, "ordinary_portable_profile.json"),
    "utf8",
  )) as RenderResourceProfile;
  const visibleFixture = JSON.parse(readFileSync(
    join(
      process.cwd(),
      "src/simulator/testing/fixtures/reverse-snapshots/ordinary-visible-rendering/artifacts/investigations/ordinary-visible-rendering-portable-10-1-4/ordinary_visible_rendering_profile.json",
    ),
    "utf8",
  ));
  visibleFixture.addScore.start = { alpha: visibleFixture.addScore.start.alpha, localX: -50 };
  visibleFixture.addScore.phases = [
    "alpha=0.2+0.8*progress,x+=8", "alpha=1,x+=1", "alpha=1-progress,x+=1",
  ];
  const visibleProfile = parseCurrentOrdinaryVisibleProfile(visibleFixture);
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
    { type: "Slide", connections: [
      { type: "Single", beat: 1, lane: 0, width: 1 },
      { type: "Single", beat: 1.25, lane: 2, width: 4 },
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
  assert.equal("slideMeshThresholdBottomLeft" in layout.garupaProductScene, false,
    "product semantic simulator.garupa-slide-note-visible-domain-v1 forbids a second screenshot-derived Slide mask");
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
  assert.equal(interior.spriteBindingKey?.endsWith("note_slide_among"), true);
  assert.equal(terminal.spriteBindingKey?.endsWith("note_flick_2"), true);
  assert.equal(firstRows.some((row) => row.renderObjectId.startsWith(`render:garupa:slide-flash:${compatibleChain.identity}`)), false,
    "Slide flash is not created while the head is merely approaching");
  assert.equal(firstRows.some((row) => row.renderObjectId === `${interior.renderObjectId}:long-flash`), false);
  assert.equal(firstRows.find((row) => row.renderObjectId === `${terminal.renderObjectId}:icon`)?.activeAnimationRole, "note-flick");
  const compatibleNodes = compatibleChain.connectionIdentities.map((identity) =>
    product.visibleNodes.find((node) => node.identity === identity)!);
  const compatibleSamples = compatibleNodes.map((node) => {
    const displacement = requireOk(axis.displacementAtPosition(
      node.timingGroup,
      node.absolutePosition,
      0,
    ));
    const progress = 1 - displacement / 500;
    const curve = Math.pow(1.1, 50 * (progress - 1));
    const scale = requireOk(layout.garupaProductScene.projectNoteScaleAtCurve(curve, 1)).value;
    return { curve, scale };
  });
  for (let segment = 0; segment < compatibleSamples.length - 1; segment += 1) {
    const mesh = firstRows.find((row) =>
      row.renderObjectId === `render:garupa:line:${compatibleChain.identity}:${segment}`)!;
    assert.ok(mesh.geometryPositions, `compatible segment ${segment} publishes geometry`);
    for (let section = 0; section <= 10; section += 1) {
      const ratio = section / 10;
      const uniformScale = compatibleSamples[segment]!.scale +
        (compatibleSamples[segment + 1]!.scale - compatibleSamples[segment]!.scale) * ratio;
      const expectedWidthPixels = 2 * uniformScale *
        layout.garupaProductScene.screenToSafeAreaRatio.value *
        layout.surfaceLayout.camera.pixelsPerWorldUnit;
      const offset = section * 4;
      const actualWidthPixels = Math.abs(
        mesh.geometryPositions![offset + 2]! - mesh.geometryPositions![offset]!,
      );
      assert.ok(Math.abs(actualWidthPixels - expectedWidthPixels) < 0.02,
        `compatible Slide width section ${segment}:${section} preserves Reverse widthRate: ${actualWidthPixels} vs ${expectedWidthPixels}`);
    }
  }
  const variableWidthChain = product.slideChains.find((chain) => chain.chartItemIndex === 7)!;
  const variableWidthNodes = variableWidthChain.connectionIdentities.map((identity) => product.nodeByIdentity.get(identity)!);
  const variableWidthSamples = variableWidthNodes.map((node) => {
    const displacement = requireOk(axis.displacementAtPosition(node.timingGroup, node.absolutePosition, 0));
    const curve = Math.pow(1.1, -50 * displacement / 500);
    const position = requireOk(layout.garupaProductScene.projectLaneAtCurve(
      node.spanStart + (node.width - 1) / 2, curve,
    ));
    const scale = requireOk(layout.garupaProductScene.projectNoteScaleAtCurve(curve, node.width)).value;
    return { node, curve, position, halfWidth: Math.fround(Math.fround(scale * node.width) * layout.garupaProductScene.screenToSafeAreaRatio.value) };
  });
  const variableWidthMesh = firstRows.find((row) =>
    row.renderObjectId === `render:garupa:line:${variableWidthChain.identity}:0`)!;
  assert.ok(variableWidthMesh.geometryPositions, "variable-width Slide publishes its complete connection");
  for (let section = 0; section <= 10; section += 1) {
    const ratio = Math.fround(section / 10);
    const center = Math.fround(variableWidthSamples[0]!.position.x.value + Math.fround(
      Math.fround(variableWidthSamples[1]!.position.x.value - variableWidthSamples[0]!.position.x.value) * ratio,
    ));
    const halfWidth = Math.fround(
      Math.fround(variableWidthSamples[0]!.halfWidth * Math.fround(1 - ratio)) +
      Math.fround(variableWidthSamples[1]!.halfWidth * ratio),
    );
    const offset = section * 4;
    const expected = [
      Math.fround(layout.surfaceLayout.surface.viewportWidth / 2 + Math.fround(center - halfWidth) * layout.surfaceLayout.camera.pixelsPerWorldUnit),
      Math.fround(layout.surfaceLayout.surface.viewportWidth / 2 + Math.fround(center + halfWidth) * layout.surfaceLayout.camera.pixelsPerWorldUnit),
    ];
    const actual = [variableWidthMesh.geometryPositions![offset]!, variableWidthMesh.geometryPositions![offset + 2]!];
    assert.ok(actual.every((value, side) => Math.abs(value - expected[side]!) < 0.001),
      `variable-width section ${section} interpolates complete endpoint boundaries: ${actual} vs ${expected}`);
  }
  assert.ok(firstRows.filter((row) => row.role === "note-root" &&
    row.renderObjectId.startsWith("render:garupa:node:")).every((row) =>
      row.ordering[0] === 3 && row.ordering[1] === 70));
  assert.ok(firstRows.filter((row) => row.renderObjectId.startsWith("render:garupa:line:")).every((row) =>
    row.geometryVertexCount === 22 && row.geometryMaterialLogicalAssetId === "ordinary/notes/skin00/curve-note-line" &&
    row.ordering[0] === 3 && row.ordering[1] === 0 && row.threshold === null));
  const sync = firstRows.find((row) => row.renderObjectId.startsWith("render:garupa:sync:") && row.visible);
  assert.ok(sync?.geometryPositions);
  const syncY = sync!.geometryPositions!.filter((_value, index) => index % 2 === 1);
  assert.ok(Math.max(...syncY) - Math.min(...syncY) < 40);
  assert.ok(firstRows.every((row) => !row.renderObjectId.startsWith("render:garupa:node:garupa-slide:5")));
  const signedSvTimingGroupChain = product.slideChains.find((chain) => chain.chartItemIndex === 5)!;
  const signedSvLines = firstRows.filter((row) =>
    row.renderObjectId.startsWith(`render:garupa:line:${signedSvTimingGroupChain.identity}:`) && row.visible);
  assert.ok(signedSvLines.length > 0,
    "a signed-SV TimingGroup segment that intersects [0.002,1] renders even while its endpoint fronts are outside the domain");
  assert.ok(signedSvLines.every((row) => row.threshold === null),
    "signed-SV TimingGroup connections do not receive a second near-judgment-line threshold mask");

  const compatibleHead = product.visibleNodes.find((node) => node.identity === headId)!;
  const flashStarted = requireOk(producer.preflightFrame(
    compatibleHead.absolutePosition,
    [compatibleHead],
    Math.fround(1 / 60),
  ));
  assert.ok(flashStarted);
  requireOk(flashStarted!.commit());
  const flashRows = renderer.sceneSnapshot();
  const flashId = `render:garupa:slide-flash:${compatibleChain.identity}`;
  const flash = flashRows.find((row) => row.renderObjectId === flashId)!;
  assert.equal(flash.visible, true);
  assert.equal(flash.activeAnimationRole, "note-long-flash");
  const compatibleIntermediate = product.visibleNodes.find((node) => node.identity === interiorId)!;
  const target = requireOk(layout.garupaProductScene.projectLaneAtCurve(
    compatibleIntermediate.spanStart + (compatibleIntermediate.width - 1) / 2,
    1,
  ));
  const expectedFlashPosition = [
    Math.fround(layout.surfaceLayout.surface.viewportWidth / 2 + target.x.value * layout.surfaceLayout.camera.pixelsPerWorldUnit),
    Math.fround(layout.surfaceLayout.surface.viewportHeight / 2 - target.y.value * layout.surfaceLayout.camera.pixelsPerWorldUnit),
  ];
  assert.ok(Math.abs(flash.position[0] - expectedFlashPosition[0]!) < 0.0001 &&
    Math.abs(flash.position[1] - expectedFlashPosition[1]!) < 0.0001,
  `PLSO-S01 selects the first after-node before Slide Flash starts: ${flash.position} vs ${expectedFlashPosition}`);
  const moved = requireOk(producer.preflightFrame(
    compatibleIntermediate.absolutePosition,
    [compatibleIntermediate],
    Math.fround(1 / 60),
  ));
  assert.ok(moved);
  requireOk(moved!.commit());
  const compatibleTerminal = product.visibleNodes.find((node) => node.identity === terminalId)!;
  const terminalTarget = requireOk(layout.garupaProductScene.projectLaneAtCurve(
    compatibleTerminal.spanStart + (compatibleTerminal.width - 1) / 2,
    1,
  ));
  const movedFlash = renderer.sceneSnapshot().find((row) => row.renderObjectId === flashId)!;
  const expectedMovedX = Math.fround(layout.surfaceLayout.surface.viewportWidth / 2 +
    terminalTarget.x.value * layout.surfaceLayout.camera.pixelsPerWorldUnit);
  assert.ok(Math.abs(movedFlash.position[0] - expectedMovedX) < 0.0001,
    `PLSO-S01 slidingMove follows the next current after-node without restarting the root: ${movedFlash.position[0]} vs ${expectedMovedX}`);
  const flashStopped = requireOk(producer.preflightFrame(
    compatibleTerminal.absolutePosition,
    [compatibleTerminal],
    Math.fround(1 / 60),
  ));
  assert.ok(flashStopped);
  requireOk(flashStopped!.commit());
  assert.equal(renderer.sceneSnapshot().find((row) => row.renderObjectId === flashId)?.visible, false);

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

  const bbkkCopied = requireOk(copyAndFreezeGarupaChartJson(bbkkChart));
  const bbkkConstructed = requireOk(constructChartFromGarupaChartJson(bbkkCopied.chart));
  const bbkkProduct = getGarupaProductChartProfile(bbkkConstructed)!;
  const bbkkAxis = getGarupaProductTimingGroupAxisProfile(bbkkConstructed)!;
  assert.equal(bbkkProduct.slideChains.length, 83);
  const bbkkProducer = new GarupaProductRenderProducer(
    SESSION, renderer, CURRENT_ORDINARY_RENDER_BINDINGS, bbkkProduct, bbkkAxis,
    layout.garupaProductScene, layout.ordinaryNoteScene.specificSpeed, true, true,
  );
  const upperHalfBoundary = layout.surfaceLayout.surface.viewportHeight / 2 -
    ((layout.garupaProductScene.fieldLines[3]!.start.y.value + layout.garupaProductScene.targetCenterY.value) / 2) *
      layout.surfaceLayout.camera.pixelsPerWorldUnit;
  const selectedByTime = new Map<number, any>((bbkkOracle.timeline.selectedUpperHalfCases as readonly any[])
    .map((sample) => [sample.timeMs, sample]));
  const completeSegmentsByTime = new Map<number, readonly any[]>(
    slideLogicOracle.productInput.visibleTimeline.map((frame: any) => [frame.timeMs, frame.segments]),
  );
  const lastSlideBeat = Math.max(...bbkkChart
    .filter((item: any) => item.type === "Slide")
    .flatMap((item: any) => item.connections.map((connection: any) => connection.beat)));
  const lastTickMs = Math.ceil(lastSlideBeat * 60_000 / bbkkOracle.chart.bpm);
  let visibleFrames = 0;
  let upperHalfFrames = 0;
  const visibleTicks: number[] = [];
  const upperTicks: number[] = [];
  let maxVisibleSegments = 0;
  for (let timeMs = 0; timeMs <= lastTickMs; timeMs += bbkkOracle.timeline.stepMs) {
    const currentPosition = timeMs * bbkkOracle.chart.bpm * 48 / 60_000;
    const transaction = requireOk(bbkkProducer.preflightFrame(currentPosition, [], Math.fround(1 / 60)));
    if (transaction !== null) requireOk(transaction.commit());
    const rows = renderer.sceneSnapshot().filter((candidate) =>
      candidate.visible && candidate.renderObjectId.startsWith("render:garupa:line:") && candidate.geometryPositions !== null);
    const expectedSegmentIds = (completeSegmentsByTime.get(timeMs) ?? []).map((segment: any) => {
      const [slideIndex, segmentIndex] = segment.identity.split(":").map(Number);
      const chain = bbkkProduct.slideChains.find((candidate) => candidate.chartItemIndex === slideIndex)!;
      return `render:garupa:line:${chain.identity}:${segmentIndex}`;
    }).sort();
    assert.deepEqual(rows.map((row) => row.renderObjectId).sort(), expectedSegmentIds,
      `B.B.K ${timeMs}ms publishes the exact independent adjacent-segment identity set`);
    if (rows.length > 0) {
      visibleFrames += 1;
      visibleTicks.push(timeMs);
      maxVisibleSegments = Math.max(maxVisibleSegments, rows.length);
      if (rows.some((row) => Math.min(...row.geometryPositions!.filter((_value, index) => index % 2 === 1)) < upperHalfBoundary)) {
        upperHalfFrames += 1;
        upperTicks.push(timeMs);
      }
    }
    for (const row of rows) {
      assert.equal(row.geometryPositions!.length, 44, `B.B.K ${timeMs}ms publishes all 22 vertices`);
      assert.equal(row.geometryIndexCount, 60, `B.B.K ${timeMs}ms publishes all 60 indices`);
      assert.equal(row.threshold, null,
        `B.B.K ${timeMs}ms uses the same projected curve visibility domain as notes without a second mask`);
    }
    const sample = selectedByTime.get(timeMs);
    if (sample !== undefined) {
      const chain = bbkkProduct.slideChains.find((candidate) => candidate.chartItemIndex === sample.slideIndex)!;
      const row = rows.find((candidate) =>
        candidate.renderObjectId === `render:garupa:line:${chain.identity}:${sample.segment}`);
      assert.ok(row?.geometryPositions, `B.B.K Slide ${sample.slideIndex}:${sample.segment} publishes its evidenced segment`);
      const ys = row!.geometryPositions!.filter((_value, index) => index % 2 === 1);
      assert.ok(Math.min(...ys) < upperHalfBoundary,
        `B.B.K Slide ${sample.slideIndex}:${sample.segment} reaches the upper half at ${sample.timeMs}ms`);
      const widths = Array.from({ length: 11 }, (_, section) => Math.abs(
        row!.geometryPositions![section * 4 + 2]! - row!.geometryPositions![section * 4]!,
      ));
      const requiredWidth = sample.visibleCurve[1] >= 0.5 ? 50 : 5;
      assert.ok(Math.max(...widths) > requiredWidth,
        `corrected width-one Slide rejects the former double-scale result at curve ${sample.visibleCurve}`);
    }
  }
  const actualTickSet = new Set(visibleTicks);
  const expectedTickSet = new Set<number>(bbkkOracle.timeline.visibleTicksMs);
  const missingTicks = bbkkOracle.timeline.visibleTicksMs.filter((tick: number) => !actualTickSet.has(tick));
  const extraTicks = visibleTicks.filter((tick) => !expectedTickSet.has(tick));
  const actualUpperSet = new Set(upperTicks);
  const missingUpperTicks = bbkkOracle.timeline.upperHalfTicksMs.filter((tick: number) => !actualUpperSet.has(tick));
  assert.deepEqual({ visibleFrames, upperHalfFrames, maxVisibleSegments, missingTicks, extraTicks, missingUpperTicks }, {
    visibleFrames: bbkkOracle.timeline.visibleFrames,
    upperHalfFrames: bbkkOracle.timeline.upperHalfFrames,
    maxVisibleSegments: bbkkOracle.timeline.maxVisibleSegments,
    missingTicks: [], extraTicks: [], missingUpperTicks: [],
  }, `B.B.K all 83 Slides/141 segments match the independent 50ms full-timeline oracle; first=${visibleTicks.slice(0, 4)} last=${visibleTicks.slice(-4)}`);
  const bbkkRelease = requireOk(bbkkProducer.preflightDispose());
  if (bbkkRelease !== null) requireOk(bbkkRelease.commit());
  assert.equal(renderer.snapshot().objectCount, 0);
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
