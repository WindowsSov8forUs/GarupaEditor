import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const evidencePackage = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "manual-input-judgement");
const evidenceRoot = join(evidencePackage, "artifacts", "investigations",
  "manual-input-runtime-contract-10-1-4");
const oracle = JSON.parse(readFileSync(join(evidenceRoot,
  "manual_input_fixed_event_oracle.json"), "utf8"));
const closure = JSON.parse(readFileSync(join(evidenceRoot, "closure.json"), "utf8"));
const expectedCases = Array.from({ length: 26 }, (_, index) =>
  `MJ${String(index + 1).padStart(2, "0")}`);
assert.deepEqual(oracle.cases.map((entry) => entry.case_id), expectedCases);
assert.equal(oracle.cases.every((entry) => Array.isArray(entry.unknown_fields) &&
  entry.unknown_fields.length === 0), true);
assert.deepEqual(closure.sample, {
  package: "jp.co.craftegg.band", version_name: "10.1.4", version_code: 230,
  abi: "arm64-v8a",
  libil2cpp_sha256: "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F",
  global_metadata_sha256: "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F",
});
assert.equal(closure.gates.manual_input_gate, "closed");
assert.deepEqual(closure.static_counts,
  { methods_mapped: 118, layouts_unchanged: 14, enums_unchanged: 13 });
assert.equal(closure.runtime_counts.confirmed_r1_traces, 5);
assert.equal(closure.runtime_counts.fixed_event_cases, 26);
assert.deepEqual(closure.blocking_findings, []);
assert.deepEqual(Object.keys(closure.gap_resolution), [
  "V01", ...Array.from({ length: 15 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`),
]);
console.log("manual acceptance oracle verified: MJ01-MJ26, V01/D01-D15, gate closed");
const manualRunners = [
  "runManualInputBoundaryTests.mjs", "runManualInputDispatchTests.mjs",
  "runManualJudgementTests.mjs", "runManualNormalJudgementTests.mjs",
  "runManualFlickJudgementTests.mjs", "runManualMultipleDirectionalJudgementTests.mjs",
  "runManualLongJudgementTests.mjs", "runManualSlideJudgementTests.mjs",
  "runManualTimeoutJudgementTests.mjs",
];
for (const runner of manualRunners) run(process.execPath, [join(testingRoot, runner)]);
const upstreamRunners = [
  "runFirstSliceTests.mjs", "runChartConstructionBoundaryTests.mjs",
  "runChartConstructionParsingTests.mjs", "runChartBatchConversionTests.mjs",
  "runChartNoteGraphTests.mjs", "runChartMultiRangeTests.mjs",
  "runChartCommandDataTests.mjs", "runChartFinalizeTests.mjs",
  "runChartProductionAcceptanceTests.mjs", "runClockSchedulingTests.mjs",
  "runAutoLiveTests.mjs",
];
for (const runner of upstreamRunners) run(process.execPath, [join(testingRoot, runner)]);
console.log("manual input M00-M11 acceptance suite passed");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
