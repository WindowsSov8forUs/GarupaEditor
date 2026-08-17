declare const require: (id: string) => any;
const assert = require("node:assert/strict");
import { parseGarupaChartJson, type GarupaChartJson } from "../../chart";
import {
  constructChartFromGarupaChartJson,
  garupaBeatToAbsolutePosition,
} from "../assembly/garupaChartConstruction";
import { copyAndFreezeGarupaChartJson } from "../assembly/garupaChartContract";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import {
  AfterNoteType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type ChartConstructionResult,
} from "../engine/chart/types";
import { getConstructedChartRuntimeMetadata } from "../engine/runtime/chartRuntimeMetadata";
import { createConstructedChartScoringPlan } from "../engine/scoring/constructedChartScoringAdapter";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import {
  createGarupaProductTimingGroupAxisProfile,
  getGarupaProductTimingGroupAxisProfile,
} from "../engine/garupa/timingGroupAxis";
import { GarupaProductRenderProducer } from "../engine/garupa/productRenderProducer";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";

function main(): void {
  testContractCopyAndExactShape();
  testCanonicalParserBoundary();
  testPositionBridge();
  testDirectConstruction();
  testIgnoredExtensionsAndAllowedSlideMatrix();
  testProductProfileAndProxyGraph();
  testTimingGroupAxis();
  testFailureClosure();
  testCanonicalBmsDifferentialProjection();
  testAutoAndManualEngineOutcomes();
  testProductAutoEngineOutcome();
  testProductRenderCommands();
  testCapabilities();
  console.log("public Garupa JSON chart tests passed");
}

function testContractCopyAndExactShape(): void {
  const source: any[] = [
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 1, value: 1.5, timingGroup: "#2" },
    { type: "Single", beat: 2, lane: 1, width: 1, timingGroup: "#2" },
    {
      type: "Slide",
      timingGroup: "#3",
      connections: [
        { type: "Single", beat: 3, lane: 1, width: 1 },
        { type: "Hidden", beat: 4, lane: 2, width: 1, timingGroup: "#3" },
        { type: "Directional", beat: 5, lane: 3, width: 1, direction: "Right" },
      ],
    },
  ];
  const copied = requireOk(copyAndFreezeGarupaChartJson(source));
  assert.equal(copied.extensions.svItemCount, 1);
  assert.equal(copied.extensions.timingGroupFieldCount, 4);
  assert.ok(Object.isFrozen(copied.chart));
  assert.ok(Object.isFrozen(copied.chart[3]));
  assert.ok(Object.isFrozen((copied.chart[3] as any).connections));
  source[0].value = 999;
  source[3].connections[0].lane = 6;
  assert.equal((copied.chart[0] as any).value, 120);
  assert.equal((copied.chart[3] as any).connections[0].lane, 1);

  for (const invalid of [
    null,
    {},
    [{ type: "BPM", beat: 0, value: 120, extra: true }],
    [{ type: "BPM", beat: Number.NaN, value: 120 }],
    [{ type: "SV", beat: 0, value: 1, timingGroup: 2 }],
    [{ type: "Single", beat: 1, lane: 1, width: 0 }],
    [{ type: "Directional", beat: 1, lane: 1, width: 1, direction: "Up" }],
    [{ type: "Hidden", beat: 1, lane: 1, width: 1 }],
  ]) {
    assert.equal(copyAndFreezeGarupaChartJson(invalid).status, "evidence-required");
  }
}

function testCanonicalParserBoundary(): void {
  const parsed = parseGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 1, value: 0, timingGroup: "#Global" },
    { type: "Single", beat: 2, lane: 1, width: 1 },
    { type: "Slide", timingGroup: "#1", connections: [
      { type: "Hidden", beat: 3, lane: 1, width: 1, timingGroup: "#Global" },
      { type: "Flick", beat: 4, lane: 2, width: 1, timingGroup: "#1" },
    ] },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed[1]!, "timingGroup"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed[2]!, "timingGroup"), false);
  const slide = parsed[3]!;
  assert.equal(slide.type, "Slide");
  if (slide.type === "Slide") {
    assert.equal(Object.prototype.hasOwnProperty.call(slide.connections[0]!, "timingGroup"), false);
  }
  const copied = requireOk(copyAndFreezeGarupaChartJson(parsed));
  assert.equal(copied.extensions.svItemCount, 1);
  assert.equal(copied.extensions.timingGroupFieldCount, 2);
}

function testPositionBridge(): void {
  assert.equal(requireOk(garupaBeatToAbsolutePosition(0)), 0);
  assert.equal(requireOk(garupaBeatToAbsolutePosition(1 / 48)), 1);
  assert.equal(requireOk(garupaBeatToAbsolutePosition(0.1)), 4);
  assert.equal(requireOk(garupaBeatToAbsolutePosition(1)), 48);
  assert.equal(requireOk(garupaBeatToAbsolutePosition(4)), 192);
  assert.equal(requireOk(garupaBeatToAbsolutePosition(8)), 384);
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, (0x80000000 + 1) / 48]) {
    assert.equal(garupaBeatToAbsolutePosition(invalid).status, "evidence-required");
  }
}

function testDirectConstruction(): void {
  const chart = parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "BPM", beat: 12, value: 150 },
    { type: "Single", beat: 1, lane: 0, width: 1 },
    { type: "Flick", beat: 2, lane: 1, width: 2 },
    { type: "Skill", beat: 3, lane: 3, width: 1 },
    { type: "Directional", beat: 4, lane: 1, width: 2, direction: "Right" },
    { type: "Directional", beat: 5, lane: 5, width: 2, direction: "Left" },
    {
      type: "Slide",
      connections: [
        { type: "Skill", beat: 6, lane: 0, width: 2 },
        { type: "Hidden", beat: 7, lane: 2, width: 1 },
        { type: "Directional", beat: 8, lane: 4, width: 2, direction: "Right" },
      ],
    },
    {
      type: "Slide",
      connections: [
        { type: "Single", beat: 9, lane: 6, width: 1 },
        { type: "Flick", beat: 10, lane: 5, width: 1 },
      ],
    },
  ]);
  const result = requireOk(constructChartFromGarupaChartJson(chart));
  assert.equal(result.startBpm, 120);
  assert.equal(result.startBpmString, "120");
  assert.deepEqual(result.bpmChangeRealValueList, [150]);
  assert.deepEqual(result.bpmChangeStringRealValueList, ["150"]);
  assert.equal(result.habahiroChangeAbsolutePos, -1);
  assert.equal(result.isMultiRangeNotes, true);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.noteBatches));
  assert.ok(getConstructedChartRuntimeMetadata(result));
  const fresh = requireOk(constructChartFromGarupaChartJson(chart));
  assert.notEqual(fresh, result);
  assert.notEqual(getConstructedChartRuntimeMetadata(fresh), undefined);
  const clone = structuredClone(result);
  assert.equal(getConstructedChartRuntimeMetadata(clone), undefined);

  const roots = result.noteBatches.flatMap((batch) => batch.informationList)
    .filter((note) => note.buttonType >= 0);
  assert.deepEqual(roots.map((note) => note.index), [...new Set(roots.map((note) => note.index))]);
  const habFlick = roots.find((note) => note.absolutePos === 96)!;
  assert.equal(habFlick.gameNoteType, GameNoteType.Flick);
  assert.deepEqual(habFlick.buttonTypes, [1, 2]);
  assert.equal(habFlick.halfButtonIndex, 1);
  const skill = roots.find((note) => note.absolutePos === 144)!;
  assert.equal(skill.gameNoteAdditionalType, GameNoteAdditionalType.Skill);
  const multiple = roots.filter((note) => note.absolutePos === 192);
  assert.deepEqual(multiple.map((note) => note.buttonType), [1, 2]);
  assert.ok(multiple.every((note) => note.fireNoteType === FrontNoteType.MultipleDirectionalFlick));

  const firstSlide = roots.find((note) => note.absolutePos === 288)!;
  assert.equal(firstSlide.gameNoteType, GameNoteType.SlideA);
  assert.equal(firstSlide.isSlideNoteHead, true);
  assert.equal(firstSlide.gameNoteAdditionalType, GameNoteAdditionalType.Skill);
  assert.equal(firstSlide.slideNoteList.length, 2);
  assert.equal(firstSlide.slideNoteList[0]!.isInvisible, true);
  assert.equal(firstSlide.afterNoteType, AfterNoteType.SlideMultipleDirectionalFlickRight);
  assert.equal(firstSlide.slideNoteList[1]!.gameNoteType, GameNoteType.SlideADirectionalFlickRightAdd);
  const secondSlide = roots.find((note) => note.absolutePos === 432)!;
  assert.equal(secondSlide.gameNoteType, GameNoteType.SlideB);
  assert.equal(secondSlide.afterNoteType, AfterNoteType.SlideFlickEnd);
  assert.equal(secondSlide.slideNoteList[0]!.gameNoteType, GameNoteType.SlideEndFlickB);

  const command = result.noteBatches.flatMap((batch) => batch.informationList)
    .find((note) => note.ccNum === 8)!;
  assert.equal(command.absolutePos, 576);
  assert.equal(command.bpm, 150);
  assert.equal(command.bpmString, "150");
  const scoring = requireOk(createConstructedChartScoringPlan(result));
  assert.equal(scoring.scoreMaximum, 10_000_000 + scoring.totalScoringUnitCount);
  const mode = createSimulatorModeIdentity("live", "auto");
  const engine = requireOk(createSimulatorEngine({
    chart: result,
    runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, mode },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: "garupa-json-direct-test",
      mode,
      life: {
        initialLife: 1000,
        playerMaxLife: 1000,
        lifeUpperLimit: 2000,
        missDamage: -100,
        badDamage: -50,
      },
    },
  }, createRecordingSimulatorBackends()));
  requireOk(engine.initialize());
  requireOk(engine.snapshot());
  requireOk(engine.dispose());
}

function testIgnoredExtensionsAndAllowedSlideMatrix(): void {
  const plain = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 1, lane: 1, width: 1 },
  ])));
  const extended = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 0.5, value: 2, timingGroup: "#7" },
    { type: "Single", beat: 1, lane: 1, width: 1, timingGroup: "#7" },
  ])));
  assert.equal(getGarupaProductChartProfile(plain)?.route, "original-compatible");
  assert.equal(getGarupaProductChartProfile(extended)?.route, "product-extension");
  assert.equal(requireOk(createConstructedChartScoringPlan(extended)).totalScoringUnitCount, 1);
  assert.notDeepEqual(commonProjection(extended), commonProjection(plain));

  const allowed = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    {
      type: "Slide",
      connections: [
        { type: "Single", beat: 1, lane: 1, width: 1 },
        { type: "Single", beat: 2, lane: 2, width: 2 },
        { type: "Skill", beat: 3, lane: 3, width: 1 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { type: "Single", beat: 4, lane: 4, width: 1 },
        { type: "Single", beat: 5, lane: 5, width: 1 },
      ],
    },
  ])));
  const roots = allowed.noteBatches.flatMap((batch) => batch.informationList)
    .filter((note) => note.isSlideNoteHead);
  assert.equal(roots.length, 2);
  assert.equal(roots[0]!.gameNoteAdditionalTypeLongNoteEnd, GameNoteAdditionalType.Skill);
  assert.equal(roots[0]!.slideNoteList[0]!.isInvisible, false);
  assert.equal(roots[0]!.slideNoteList[1]!.gameNoteAdditionalType, GameNoteAdditionalType.Skill);
  assert.equal(roots[1]!.afterNoteType, AfterNoteType.None);
}

function testProductProfileAndProxyGraph(): void {
  const copied = requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 1, value: -2.1234567 },
    { type: "Single", beat: 2, lane: 0.5, width: 2, timingGroup: "#1" },
    { type: "Directional", beat: 2, lane: 7, width: 3, direction: "Left" },
    { type: "Slide", timingGroup: "#2", connections: [
      { type: "Hidden", beat: 3, lane: -1, width: 1 },
      { type: "Flick", beat: 3, lane: 1.25, width: 2 },
      { type: "Skill", beat: 4, lane: 2, width: 1, timingGroup: "#3" },
      { type: "Hidden", beat: 5, lane: 3, width: 1 },
    ] },
    { type: "Slide", connections: [
      { type: "Hidden", beat: 6, lane: 1, width: 1 },
    ] },
  ]));
  const chart = requireOk(constructChartFromGarupaChartJson(copied.chart, 9));
  const profile = getGarupaProductChartProfile(chart)!;
  assert.ok(profile);
  assert.equal(profile.route, "product-extension");
  assert.deepEqual(profile.laneDomain, { laneCount: 9, minimumLane: -1, maximumLane: 7 });
  assert.equal(profile.svEvents.length, 1);
  assert.equal(profile.svEvents[0]!.value, -2.123457);
  assert.equal(profile.nodes.length, 7);
  assert.equal(profile.visibleNodes.length, 4);
  assert.equal(profile.slideChains.length, 2);
  assert.deepEqual(profile.slideChains[0]!.visibleConnectionIdentities, [
    "garupa-slide:4:connection:1",
    "garupa-slide:4:connection:2",
  ]);
  assert.equal(profile.slideChains[0]!.containsHidden, true);
  assert.equal(profile.slideChains[1]!.allHidden, true);
  assert.equal(profile.nodes[1]!.spanStart, 5);
  assert.equal(profile.nodes[3]!.timingGroup, "#2");
  assert.equal(profile.nodes[5]!.timingGroup, "#2");
  assert.equal(profile.nodes[4]!.timingGroup, "#3");
  assert.equal(profile.visibleNodes.every((node) => node.scoringSource?.buttonType === -1), true);
  assert.equal(profile.nodes.filter((node) => !node.visible).every((node) => node.scoringSource === null), true);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.nodes), true);
  assert.equal(Object.isFrozen(profile.nodes[0]!.scoringSource), true);
  assert.equal(chart.noteBatches.flatMap((batch) => batch.informationList).filter((note) => note.buttonType >= 0).length, 0);
  const scoring = requireOk(createConstructedChartScoringPlan(chart));
  assert.equal(scoring.totalScoringUnitCount, 4);
  assert.equal(scoring.scoreMaximum, 10_000_004);

  const standard = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 1, lane: 1, width: 1 },
  ]), 7));
  assert.equal(getGarupaProductChartProfile(standard)?.route, "original-compatible");
  assert.equal(standard.noteBatches.flatMap((batch) => batch.informationList).filter((note) => note.buttonType >= 0).length, 1);
}

function testTimingGroupAxis(): void {
  const productChart = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "BPM", beat: 4, value: 60 },
    { type: "SV", beat: 1, value: 2 },
    { type: "SV", beat: 1, value: 3, timingGroup: "#1" },
    { type: "SV", beat: 2, value: -1, timingGroup: "#1" },
    { type: "SV", beat: 3, value: 0 },
    { type: "Single", beat: 4, lane: 1, width: 1, timingGroup: "#1" },
  ]), 7));
  const profile = getGarupaProductChartProfile(productChart)!;
  const axis = requireOk(createGarupaProductTimingGroupAxisProfile(productChart, profile));
  assert.equal(getGarupaProductTimingGroupAxisProfile(productChart)?.groups.length, 2);
  assert.deepEqual(axis.groups.map((group) => group.id), ["#Global", "#1"]);
  assert.equal(requireOk(axis.positionToMilliseconds(48)), 500);
  assert.equal(requireOk(axis.positionToMilliseconds(192)), 2000);
  assert.equal(requireOk(axis.positionToMilliseconds(288)), 4000);
  assert.equal(requireOk(axis.axisAtMilliseconds("#Global", 1000)), 1500);
  assert.equal(requireOk(axis.axisAtMilliseconds("#Global", 2000)), 2500);
  assert.equal(requireOk(axis.axisAtMilliseconds("#1", 500)), 500);
  assert.equal(requireOk(axis.axisAtMilliseconds("#1", 1000)), 1500);
  assert.equal(requireOk(axis.axisAtMilliseconds("#1", 1500)), 1000);
  assert.equal(requireOk(axis.axisAtMilliseconds("#1", 2000)), 1000);
  assert.equal(requireOk(axis.displacementAtPosition("#1", 192, 96)), -500);
  assert.equal(requireOk(axis.displacementAtPosition("#Global", 192, 96)), 1000);
  const windows = requireOk(axis.findVisibilityWindows("#1", 192, 600, 200, 0, 3000));
  assert.ok(windows.length >= 1);
  assert.ok(windows.some((window) => window.fromMilliseconds <= 1500 && window.toMilliseconds >= 1500));
  assert.equal(axis.axisAtMilliseconds("#missing", 0).status, "evidence-required");
  assert.equal(axis.positionToMilliseconds(Number.NaN).status, "evidence-required");
}

function testFailureClosure(): void {
  const constructFailures: readonly unknown[][] = [
    [{ type: "Single", beat: 1, lane: 1, width: 1 }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "BPM", beat: 0.01, value: 130 }, { type: "Single", beat: 1, lane: 1, width: 1 }],
    [{ type: "BPM", beat: 0, value: 0 }, { type: "Single", beat: 1, lane: 1, width: 1 }],
  ];
  for (const candidate of constructFailures) {
    const copied = copyAndFreezeGarupaChartJson(candidate);
    if (copied.status !== "ok") continue;
    assert.equal(constructChartFromGarupaChartJson(copied.value.chart).status, "evidence-required");
  }
  assert.equal(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Slide", connections: [] },
  ]).status, "evidence-required");
}

function testCanonicalBmsDifferentialProjection(): void {
  const direct = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 4, lane: 1, width: 1 },
    { type: "Flick", beat: 4, lane: 2, width: 1 },
  ])));
  const bms = requireOk(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#WAV02 flick.wav\n#00111:01\n#00112:02\n",
  }));
  assert.deepEqual(commonProjection(direct), commonProjection(bms));

  const directSlide = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Slide", connections: [
      { type: "Single", beat: 0, lane: 1, width: 1 },
      { type: "Single", beat: 4, lane: 2, width: 1 },
    ] },
  ])));
  const bmsSlide = requireOk(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 slide_a.wav\n#WAV02 slide_end_a.wav\n#00011:01\n#00112:02\n",
  }));
  assert.deepEqual(commonProjection(directSlide), commonProjection(bmsSlide));
}

function testAutoAndManualEngineOutcomes(): void {
  const chart = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 1, lane: 3, width: 1 },
  ])));
  const autoMode = createSimulatorModeIdentity("live", "auto");
  const auto = requireOk(createSimulatorEngine({
    chart,
    runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, mode: autoMode },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: "garupa-json-auto-quota",
      mode: autoMode,
      life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
    },
  }, createRecordingSimulatorBackends()));
  requireOk(auto.initialize());
  for (let frame = 0; frame < 180; frame += 1) requireOk(auto.step(Math.fround(1 / 60)));
  const autoRecord = requireOk(auto.snapshot()).managers.scoreLifeState!.record;
  assert.equal(autoRecord.score, 10_000_001);
  assert.equal(autoRecord.currentCombo, 1);
  assert.equal(autoRecord.resultCounts[4], 1);
  requireOk(auto.dispose());

  const manualMode = createSimulatorModeIdentity("live", "manual");
  const manual = requireOk(createSimulatorEngine({
    chart,
    runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, mode: manualMode },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: "garupa-json-manual-miss",
      mode: manualMode,
      life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
    },
  }, createRecordingSimulatorBackends()));
  requireOk(manual.initialize());
  for (let frame = 0; frame < 180; frame += 1) {
    requireOk(manual.step(Math.fround(1 / 60), { touches: [] }));
  }
  const manualRecord = requireOk(manual.snapshot()).managers.scoreLifeState!.record;
  assert.equal(manualRecord.score, 0);
  assert.equal(manualRecord.currentLife, 900);
  assert.equal(manualRecord.resultCounts[0], 1);
  requireOk(manual.dispose());
}

function testProductAutoEngineOutcome(): void {
  const chart = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 1.5, value: -1 },
    { type: "SV", beat: 2, value: 1 },
    { type: "Single", beat: 1, lane: 0.5, width: 2 },
    { type: "Slide", connections: [
      { type: "Hidden", beat: 2, lane: 1, width: 1 },
      { type: "Flick", beat: 2, lane: 2.5, width: 1 },
      { type: "Skill", beat: 3, lane: 3, width: 1 },
      { type: "Directional", beat: 4, lane: 5, width: 2, direction: "Left" },
      { type: "Hidden", beat: 5, lane: 4, width: 1 },
    ] },
  ]), 9));
  const mode = createSimulatorModeIdentity("live", "auto");
  const engine = requireOk(createSimulatorEngine({
    chart,
    runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, mode },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: "garupa-product-auto",
      mode,
      life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
    },
  }, createRecordingSimulatorBackends()));
  requireOk(engine.initialize());
  for (let frame = 0; frame < 360; frame += 1) requireOk(engine.step(Math.fround(1 / 60)));
  const snapshot = requireOk(engine.snapshot());
  const record = snapshot.managers.scoreLifeState!.record;
  assert.equal(record.score, 10_000_004);
  assert.equal(record.currentCombo, 4);
  assert.equal(record.resultCounts[4], 4);
  assert.equal(snapshot.managers.garupaProduct?.visibleNodeCount, 4);
  assert.equal(snapshot.managers.garupaProduct?.judgedNodeCount, 4);
  requireOk(engine.dispose());
}

function testProductRenderCommands(): void {
  const chart = requireOk(constructChartFromGarupaChartJson(parse([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 3, value: 0 },
    { type: "Single", beat: 1, lane: 0.5, width: 2 },
    { type: "Slide", connections: [
      { type: "Hidden", beat: 1, lane: -1, width: 1 },
      { type: "Flick", beat: 2, lane: 2.25, width: 2 },
      { type: "Hidden", beat: 3, lane: 7, width: 1 },
    ] },
  ]), 9));
  const product = getGarupaProductChartProfile(chart)!;
  const axis = getGarupaProductTimingGroupAxisProfile(chart)!;
  const resources = Object.freeze({
    noteAtlasLogicalAssetId: "note-atlas",
    directionalAtlasLogicalAssetId: "directional-atlas",
    curveNoteMaterialLogicalAssetId: "curve-material",
  });
  const scene = requireOk(createSimulatorSceneLayout(
    { viewportWidth: 1600, viewportHeight: 720, inputOrigin: "bottom-left" },
    {
      specificSpeed: Math.fround(11), noteSize: Math.fround(100), highAspectRatio: 1,
      judgeOffsetFrames: 0, habahiroMeshWidthSetting: Math.fround(1),
    },
    "ordinary",
    resources,
    9,
  ));
  const backend = productRendererBackend();
  const producer = new GarupaProductRenderProducer(
    "garupa-product-render",
    backend,
    resources,
    product,
    axis,
    scene.garupaProductScene,
    scene.ordinaryNoteScene.specificSpeed,
  );
  assert.equal(producer.validate().status, "ok");
  const first = requireOk(producer.preflightFrame(0, []));
  assert.ok(first);
  requireOk(first!.commit());
  const commands = (backend as any).commands as any[];
  assert.ok(commands.some((command) => command.kind === "set-transform" &&
    command.renderObjectId === "render:garupa:node:garupa-note:2"));
  const meshes = commands.filter((command) => command.kind === "set-mesh");
  assert.ok(meshes.length >= 1);
  assert.ok(meshes.every((command) => command.vertices.length === 22 && command.indices.length === 60));
  const judgedNode = product.visibleNodes[0]!;
  const effect = requireOk(producer.preflightFrame(judgedNode.absolutePosition, [judgedNode]));
  assert.ok(effect);
  requireOk(effect!.commit());
  assert.ok((backend as any).commands.some((command: any) =>
    command.renderObjectId === `render:garupa:effect:${judgedNode.identity}` && command.kind === "set-mesh"));
  const disposed = requireOk(producer.preflightDispose());
  assert.ok(disposed);
  requireOk(disposed!.commit());
  assert.equal(producer.snapshot().createdObjectCount, 0);
}

function productRendererBackend(): any {
  let nextSequence = 0;
  let pending: any = null;
  const commands: any[] = [];
  return {
    id: "garupa-product-test-renderer",
    commands,
    snapshot() {
      return { state: "ready", sessionId: "garupa-product-render", fidelity: { mode: "ordinary", fidelity: "exact-current" }, nextSequence, objectCount: 0, resourceCount: 3, fault: null };
    },
    preflight(batch: any[]) {
      assert.equal(pending, null);
      assert.equal(batch[0]?.sequence, nextSequence);
      pending = { sessionId: "garupa-product-render", firstSequence: nextSequence, commandCount: batch.length, commands: batch };
      return { status: "ok", value: pending };
    },
    commit(capability: any) {
      assert.equal(capability, pending);
      commands.push(...pending.commands);
      nextSequence += pending.commandCount;
      pending = null;
      return { status: "ok", value: undefined };
    },
    discard(capability: any) { assert.equal(capability, pending); pending = null; return { status: "ok", value: undefined }; },
    execute() { throw new Error("not used"); },
    async prepare() { return { status: "ok", value: undefined }; },
    dispose() { return { status: "ok", value: undefined }; },
  };
}

function testCapabilities(): void {
  const capabilities = createSimulatorModuleCapabilitySummary(null, "standard-current-portable");
  assert.equal(capabilities.garupaJsonDirectChartAdapter, "closed-portable");
  assert.equal(capabilities.garupaJsonSvAndTimingGroup, "ignored-product-extension");
  assert.equal(capabilities.unsupportedExGarupaSlide, "open-evidence-required");
}

function commonProjection(chart: ChartConstructionResult): unknown {
  return chart.noteBatches.flatMap((batch) => batch.informationList)
    .filter((note) => note.buttonType >= 0)
    .map((note) => ({
      absolutePos: note.absolutePos,
      buttonType: note.buttonType,
      gameNoteType: note.gameNoteType,
      fireNoteType: note.fireNoteType,
      afterNoteType: note.afterNoteType,
      additional: note.gameNoteAdditionalType,
      slide: note.slideNoteList.map((child) => ({
        absolutePos: child.absolutePos,
        buttonType: child.buttonType,
        gameNoteType: child.gameNoteType,
        fireNoteType: child.fireNoteType,
        invisible: child.isInvisible,
      })),
    }));
}

function parse(input: unknown): GarupaChartJson {
  return requireOk(copyAndFreezeGarupaChartJson(input)).chart;
}

function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "evidence-required"; readonly boundary: string }): T {
  if (result.status !== "ok") throw new Error(result.boundary);
  return result.value;
}

main();
