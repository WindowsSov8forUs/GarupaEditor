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
const expectedCases = Array.from({ length: 26 }, (_, index) =>
  `MJ${String(index + 1).padStart(2, "0")}`);
assert.deepEqual(oracle.cases.map((entry) => entry.case_id), expectedCases);
assert.equal(oracle.cases.every((entry) => Array.isArray(entry.unknown_fields) &&
  entry.unknown_fields.length === 0), true);
assert.deepEqual(oracle.sample, {
  package: "jp.co.craftegg.band", version_name: "10.1.4", version_code: 230,
  abi: "arm64-v8a",
  libil2cpp_sha256: "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F",
});
assert.equal(oracle.cases.every((entry) => entry.evidence.length > 0 && entry.output !== null), true);
console.log("manual raw oracle facts verified independently: MJ01-MJ26 (closure status ignored)");
const manualRunners = [
  "runManualInputBoundaryTests.mjs", "runManualInputDispatchTests.mjs",
  "runManualJudgementTests.mjs", "runManualNormalJudgementTests.mjs",
  "runManualFlickJudgementTests.mjs", "runManualMultipleDirectionalJudgementTests.mjs",
  "runManualLongJudgementTests.mjs", "runManualSlideJudgementTests.mjs",
  "runManualTimeoutJudgementTests.mjs",
];
for (const runner of manualRunners) run(process.execPath, [join(testingRoot, runner)]);
console.log("manual input M00-M11 candidate-path suite passed behind the global production gate");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
