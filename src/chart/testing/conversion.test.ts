declare const require: (id: string) => any;
const assert = require("node:assert/strict");

import {
  convertBestdoriV2ToGarupaChartJson,
  convertGarupaChartJsonToBestdoriV2,
  parseBestdoriV2ChartJson,
  parseGarupaChartJson,
  type GarupaChartJson,
} from "../index";

function main(): void {
  testGarupaParsing();
  testBestdoriParsing();
  testBidirectionalConversion();
  testBpmZeroNormalization();
  testMalformedInputs();
  console.log("shared chart format tests passed: Garupa/Bestdori schemas, parsing, conversion and normalization");
}

function testGarupaParsing(): void {
  const chart = parseGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 1, value: 1.5, timingGroup: "#Fast" },
    { type: "Directional", beat: 2, lane: 3, width: 2, direction: "Right" },
    {
      type: "Slide",
      timingGroup: "#Fast",
      connections: [
        { type: "Single", beat: 3, lane: 2, width: 1 },
        { type: "Hidden", beat: 4, lane: 3, width: 1 },
        { type: "Flick", beat: 5, lane: 4, width: 1 },
      ],
    },
  ]);
  assert.equal(chart.length, 4);
  assert.equal(chart[2]?.type, "Directional");
  assert.equal(chart[3]?.type, "Slide");
  if (chart[3]?.type === "Slide") {
    assert.deepEqual(chart[3].connections.map((item) => item.type), ["Single", "Hidden", "Flick"]);
  }
}

function testBestdoriParsing(): void {
  const chart = parseBestdoriV2ChartJson([
    { type: "System", lane: 6 },
    { type: "BPM", beat: 0, bpm: 150 },
    { type: "Single", beat: 1, lane: 2, flick: true },
    { type: "Long", connections: [{ beat: 2, lane: 3 }, { beat: 4, lane: 3, flick: true }] },
  ]);
  assert.equal(chart.length, 3);
  assert.equal(chart[2]?.type, "Slide");
}

function testBidirectionalConversion(): void {
  const garupa: GarupaChartJson = [
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 1, lane: 1, width: 1 },
    { type: "Flick", beat: 2, lane: 2, width: 1 },
    { type: "Skill", beat: 3, lane: 3, width: 1 },
    { type: "Directional", beat: 4, lane: 4, width: 2, direction: "Left" },
    { type: "SV", beat: 5, value: 2 },
  ];
  const bestdori = convertGarupaChartJsonToBestdoriV2(garupa, { normalizeBpmAtZero: false });
  assert.deepEqual(bestdori.map((item) => item.type), ["BPM", "Single", "Single", "Single", "Directional"]);
  assert.equal(bestdori.some((item) => item.type === "Single" && item.flick === true), true);
  assert.equal(bestdori.some((item) => item.type === "Single" && item.skill === true), true);

  const restored = convertBestdoriV2ToGarupaChartJson(bestdori, { normalizeBpmAtZero: false });
  assert.deepEqual(restored.map((item) => item.type), ["BPM", "Single", "Flick", "Skill", "Directional"]);
}

function testBpmZeroNormalization(): void {
  const converted = convertBestdoriV2ToGarupaChartJson([
    { type: "BPM", beat: 2, bpm: 120 },
    { type: "Single", beat: 3, lane: 1 },
  ]);
  assert.deepEqual(
    converted.map((item) => item.type === "Slide" ? null : item.beat),
    [0, 1],
  );
}

function testMalformedInputs(): void {
  assert.throws(() => parseGarupaChartJson({}), /top-level must be an array/);
  assert.throws(() => parseGarupaChartJson([{ type: "Single", beat: 0, lane: 1, width: 1 }]), /at least one BPM/);
  assert.throws(() => parseBestdoriV2ChartJson([{ type: "Unknown" }]), /type is invalid/);
}

main();
