import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-manual-multiple-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const evidenceRoot = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "manual-input-judgement", "artifacts", "investigations",
  "manual-input-runtime-contract-10-1-4");
try {
  const oracle = JSON.parse(readFileSync(join(evidenceRoot,
    "manual_input_fixed_event_oracle.json"), "utf8"));
  const mj10 = oracle.cases.find((candidate) => candidate.case_id === "MJ10");
  assert.ok(mj10);
  assert.deepEqual(mj10.unknown_fields, []);
  assert.deepEqual(mj10.steps.map((step) => step.count), [1, 2, 3]);
  assert.equal(mj10.output.note_type, 10);
  assert.equal(mj10.output.count_owner, "registered-group");
  assert.equal(mj10.output.duplicate_consumption, false);
  const moved = readFileSync(join(evidenceRoot, "arm64",
    "030ec820__NoteMultipleDirectionalFlick__ExecTouchMoved.arm64.tsv"), "utf8");
  assert.match(moved, /NoteDirectionalFlick\$\$shouldJudgeDirectionalFlick/);
  assert.match(moved, /blr x9[\s\S]*sub w8, w0, #1[\s\S]*fmul s1, s1, s0[\s\S]*fadd s0, s1, s0/);
  const countOwner = readFileSync(join(evidenceRoot, "arm64",
    "030eca54__NoteMultipleDirectionalFlick__getMultipleDirectionalFlickNoteCount.arm64.tsv"), "utf8");
  assert.match(countOwner, /getRightSideNoteCount[\s\S]*getLeftSideNoteCount[\s\S]*add w0, w8, #1/);
  assert.match(moved, /mov w2, #0xa[\s\S]*NoteFrontBase\$\$judgeFrontNote[\s\S]*NoteMultipleDirectionalFlick\$\$changeSideNoteUsed/);
  console.log("frozen MJ10 and Multiple Directional operation order verified");
  if (sharedOutputRoot === undefined) {
    run(process.execPath, [typeScriptCli, "-p", join(testingRoot, "tsconfig.tests.json"),
      "--outDir", outputRoot]);
  }
  run(process.execPath, [join(outputRoot, "src", "simulator", "testing",
    "manualMultipleDirectionalJudgement.test.js")]);
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally { if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true }); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
