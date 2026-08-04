import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-manual-flick-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const evidenceRoot = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "manual-input-judgement", "artifacts", "investigations",
  "manual-input-runtime-contract-10-1-4");

try {
  const oracle = JSON.parse(readFileSync(join(evidenceRoot,
    "manual_input_fixed_event_oracle.json"), "utf8"));
  for (const caseId of ["MJ08", "MJ09"]) {
    const entry = oracle.cases.find((candidate) => candidate.case_id === caseId);
    assert.ok(entry);
    assert.deepEqual(entry.unknown_fields, []);
    assert.deepEqual(entry.output.success, [false, false, true]);
  }
  const began = readFileSync(join(evidenceRoot, "arm64",
    "03a768c0__NoteFlickBase__ExecTouchBegan.arm64.tsv"), "utf8");
  const wait = readFileSync(join(evidenceRoot, "arm64",
    "03a76878__NoteFlickBase__WaitState.arm64.tsv"), "utf8");
  assert.match(began, /cmn w1, #1/);
  assert.match(began, /str w21, \[x20, #0x18c\]/);
  assert.match(wait, /fmov s1, #7\.00000000/);
  assert.match(wait, /b\.ge/);
  console.log("frozen MJ08/MJ09 and Flick Began/Wait ownership verified");
  run(process.execPath, [typeScriptCli, "-p", join(testingRoot, "tsconfig.tests.json"),
    "--outDir", outputRoot]);
  run(process.execPath, [join(outputRoot, "src", "simulator", "testing",
    "manualFlickJudgement.test.js")]);
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
