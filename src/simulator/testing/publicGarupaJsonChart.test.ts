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

function main(): void {
  testContractCopyAndExactShape();
  testCanonicalParserBoundary();
  testPositionBridge();
  testDirectConstruction();
  testIgnoredExtensionsAndAllowedSlideMatrix();
  testFailureClosure();
  testCanonicalBmsDifferentialProjection();
  testAutoAndManualEngineOutcomes();
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
    [{ type: "Single", beat: 1, lane: 1.5, width: 1 }],
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
    { type: "SV", beat: 1, value: 2, timingGroup: "#1" },
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
  assert.deepEqual(commonProjection(extended), commonProjection(plain));

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

function testFailureClosure(): void {
  const cases: readonly unknown[][] = [
    [{ type: "Single", beat: 1, lane: 1, width: 1 }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "BPM", beat: 0.01, value: 130 }, { type: "Single", beat: 1, lane: 1, width: 1 }],
    [{ type: "BPM", beat: 0, value: 0 }, { type: "Single", beat: 1, lane: 1, width: 1 }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Single", beat: 1, lane: 6, width: 2 }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Directional", beat: 1, lane: 0, width: 2, direction: "Left" }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Flick", beat: 1, lane: 1, width: 1 }, { type: "Single", beat: 2, lane: 2, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Directional", beat: 1, lane: 1, width: 1, direction: "Right" }, { type: "Single", beat: 2, lane: 2, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Hidden", beat: 1, lane: 1, width: 1 }, { type: "Single", beat: 2, lane: 2, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }, { type: "Skill", beat: 2, lane: 2, width: 1 }, { type: "Single", beat: 3, lane: 3, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }, { type: "Flick", beat: 2, lane: 2, width: 1 }, { type: "Single", beat: 3, lane: 3, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }, { type: "Directional", beat: 2, lane: 2, width: 1, direction: "Right" }, { type: "Single", beat: 3, lane: 3, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }, { type: "Hidden", beat: 2, lane: 2, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }, { type: "Single", beat: 1.001, lane: 2, width: 1 }] }],
    [{ type: "BPM", beat: 0, value: 120 }, { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }, { type: "Directional", beat: 2, lane: 3, width: 4, direction: "Right" }] }],
  ];
  for (const candidate of cases) {
    const copied = copyAndFreezeGarupaChartJson(candidate);
    if (copied.status !== "ok") continue;
    assert.equal(constructChartFromGarupaChartJson(copied.value.chart).status, "evidence-required");
  }
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
