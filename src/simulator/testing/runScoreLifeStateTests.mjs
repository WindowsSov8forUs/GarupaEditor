import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const evidencePackage = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots", "score-life-state");
const evidenceRoot = join(evidencePackage, "artifacts", "investigations", "score-life-state-runtime-contract-10-1-4");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-score-life-state-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
  verifyEvidenceClosure();
  run(process.execPath, [typeScriptCli, "-p", join(testingRoot, "tsconfig.tests.json"), "--outDir", outputRoot]);
  verifyProductionCounts();
  run(process.execPath, [join(outputRoot, "src", "simulator", "testing", "scoreLifeState.test.js")]);
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

function verifyEvidenceClosure() {
  const closure = JSON.parse(readFileSync(join(evidenceRoot, "closure.json"), "utf8"));
  const oracle = JSON.parse(readFileSync(join(evidenceRoot, "score_life_state_fixed_event_oracle.json"), "utf8"));
  const portable = JSON.parse(readFileSync(join(evidenceRoot, "score_life_state_portable_contract.json"), "utf8"));
  const migrated = JSON.parse(readFileSync(join(evidenceRoot, "score_life_state_migrated_static_oracle.json"), "utf8"));
  assert.equal(closure.business_state_gate, "closed");
  assert.equal(closure.production_authorization, true);
  assert.deepEqual(Object.keys(closure.gates), ["V01", ...Array.from({ length: 24 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`)]);
  assert.equal(Object.values(closure.gates).every((entry) => entry.status === "closed"), true);
  assert.deepEqual(closure.blocking_findings, []);
  assert.equal(oracle.coverage.total_cases, 36);
  assert.equal(oracle.coverage.confirmed_cases.length, 36);
  assert.equal(oracle.coverage.unknown_field_count, 0);
  assert.equal(oracle.coverage.blocking_finding_count, 0);
  assert.equal(oracle.cases.every((entry) => entry.status === "confirmed-portable" && entry.unknown_fields.length === 0 && entry.blocking_findings.length === 0), true);
  assert.equal(portable.coverage.former_unknown_field_count, 125);
  assert.equal(portable.coverage.unknown_field_count, 0);
  assert.equal(portable.cases.find((entry) => entry.case_id === "BS36").field_dispositions["lifecycle.continue"].result, "evidence-required");
  assert.equal(Object.keys(migrated.bundles).length, 8);
  assert.equal(Object.values(migrated.bundles).reduce((sum, bundle) => sum + bundle.current_methods.length, 0), 48);
  console.log("score/life/state closure verified: V01/D01-D24, BS01-BS36, unknown=0");
}

function verifyProductionCounts() {
  const { createNoteBatchInformationList } = require(join(
    outputRoot, "src", "simulator", "engine", "chart", "construction.js",
  ));
  const { countMaximumNotes } = require(join(
    outputRoot, "src", "simulator", "engine", "managers", "scoreLifeStateManager.js",
  ));
  const fixtures = [
    ["runtime-inputs/bms/poppin_shuffle_special.bms.txt", 979],
    ["runtime-inputs/bms/786_miracle_april_habahiro_special.bms.txt", 731],
  ];
  for (const [relativePath, expected] of fixtures) {
    const musicScoreData = readFileSync(join(evidenceRoot, relativePath), "utf8");
    const result = createNoteBatchInformationList({ musicScoreData });
    assert.equal(result.status, "ok", `${relativePath} construction`);
    assert.equal(countMaximumNotes(result.value), expected, `${relativePath} maxNoteCount`);
  }
  console.log("production maxNoteCount verified: ordinary=979 HABAHIRO=731");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
