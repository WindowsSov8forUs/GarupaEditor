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
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-manual-normal-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const evidenceRoot = join(
  repositoryRoot,
  "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "manual-input-judgement",
  "artifacts",
  "investigations",
  "manual-input-runtime-contract-10-1-4",
);

try {
  verifyFrozenProjection();
  if (sharedOutputRoot === undefined) {
    run(process.execPath, [
      typeScriptCli,
      "-p",
      join(testingRoot, "tsconfig.tests.json"),
      "--outDir",
      outputRoot,
    ]);
  }
  run(process.execPath, [join(
    outputRoot,
    "src",
    "simulator",
    "testing",
    "manualNormalJudgement.test.js",
  )]);
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function verifyFrozenProjection() {
  const oracle = JSON.parse(readFileSync(join(
    evidenceRoot,
    "manual_input_fixed_event_oracle.json",
  ), "utf8"));
  const mj02 = oracle.cases.find((entry) => entry.case_id === "MJ02");
  const mj11 = oracle.cases.find((entry) => entry.case_id === "MJ11");
  assert.ok(mj02 && mj11);
  assert.deepEqual(mj02.unknown_fields, []);
  assert.deepEqual(mj11.unknown_fields, []);
  assert.equal(mj11.output.observed_long.result, 2);
  assert.equal(mj11.output.observed_long.judge_timing, 2);
  assert.equal(mj11.output.observed_long.note_type, 4);
  console.log("committed manual fixed-event oracle verified: Long Good/Slow identity and Note type");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
