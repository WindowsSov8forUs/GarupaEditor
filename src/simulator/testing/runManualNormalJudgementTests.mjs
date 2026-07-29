import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-manual-normal-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const evidenceRoot = join(
  repositoryRoot,
  "tmp",
  "simulator-reverse-evidence",
  "manual-input-judgement",
  "artifacts",
  "investigations",
  "manual-input-runtime-contract-10-1-4",
);

try {
  verifyFrozenProjection();
  run(process.execPath, [
    typeScriptCli,
    "-p",
    join(testingRoot, "tsconfig.tests.json"),
    "--outDir",
    outputRoot,
  ]);
  run(process.execPath, [join(
    outputRoot,
    "src",
    "simulator",
    "testing",
    "manualNormalJudgement.test.js",
  )]);
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
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

  const hard = JSON.parse(readFileSync(join(evidenceRoot, "runtime", "hard-touch.json"), "utf8"));
  const good = hard.events.find((entry) =>
    entry.kind === "OneFrameData.Setup.leave" &&
    entry.frame.index === 6 &&
    entry.frame.result === 2 &&
    entry.frame.note_type === 4);
  assert.ok(good);
  assert.equal(good.frame.adjusted_result, 2);
  assert.equal(good.frame.add_combo, -1);
  assert.equal(good.frame.judge_timing, 2);

  const easy = JSON.parse(readFileSync(join(evidenceRoot, "runtime", "easy-play.json"), "utf8"));
  const miss = easy.events.find((entry) =>
    entry.kind === "OneFrameData.Setup.leave" && entry.frame.result === 0);
  assert.ok(miss);
  assert.equal(miss.frame.adjusted_result, 0);
  assert.equal(miss.frame.add_combo, -1);
  assert.equal(miss.frame.judge_timing, 0);
  console.log("frozen manual OneFrame projection verified: Good/Slow identity and Miss timing clear");
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
