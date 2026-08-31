import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const caseRoot = dirname(fileURLToPath(import.meta.url));
const testingRoot = resolve(caseRoot, "..", "..");
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-manual-judgement-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const oracle = JSON.parse(readFileSync(join(
  repositoryRoot,
  "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "manual-input-judgement",
  "artifacts",
  "investigations",
  "manual-input-runtime-contract-10-1-4",
  "manual_input_fixed_event_oracle.json",
), "utf8"));

try {
  if (sharedOutputRoot === undefined) {
    run(process.execPath, [
      typeScriptCli,
      "-p",
      join(testingRoot, "tsconfig.tests.json"),
      "--outDir",
      outputRoot,
    ]);
  }
  validateJudgement(require(join(
    outputRoot,
    "src",
    "simulator",
    "engine",
    "data",
    "manualJudgement.js",
  )));
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function validateJudgement(judgement) {
  const mj02 = oracle.cases.find((entry) => entry.case_id === "MJ02");
  assert.ok(mj02);
  assert.deepEqual(mj02.unknown_fields, []);
  assert.equal(
    mj02.output.algorithm,
    "Float32 diff / Float32(1/60), ARM Math.Round tie-away-from-zero, exclusive +3/+6/+7/+8",
  );
  for (const [index, step] of mj02.steps.entries()) {
    const result = ok(judgement.getManualNoteResult(
      step.sweet_frame,
      float32FromBits(Number.parseInt(step.diff_second.bits.slice(2), 16)),
    ));
    assert.equal(result.result, step.raw_result, `MJ02 raw result ${index}`);
    assert.equal(result.roundedFrame, step.rounded_frame, `MJ02 rounded frame ${index}`);
  }

  const bpm = Math.fround(120);
  for (const [index, step] of mj02.steps.entries()) {
    const difference = float32FromBits(Number.parseInt(step.diff_second.bits.slice(2), 16));
    const notePosition = Math.fround(difference * 96);
    const result = ok(judgement.judgeManualNote(0, notePosition, Math.fround(0), bpm));
    assert.equal(result.result, step.raw_result, `MJ02 JudgeNote result ${index}`);
    assert.equal(result.timing, step.judge_timing, `MJ02 JudgeNote timing ${index}`);
  }

  const perfect = ok(judgement.judgeManualNote(
    0,
    Math.fround(2),
    Math.fround(0),
    bpm,
  ));
  assert.equal(perfect.result, judgement.NoteResultType.Perfect);
  assert.equal(perfect.timing, judgement.JudgeTiming.None);
  const slow = ok(judgement.judgeManualNote(
    0,
    Math.fround(0),
    Math.fround(7),
    bpm,
  ));
  assert.equal(slow.timing, judgement.JudgeTiming.Slow);

  for (const invalid of [
    judgement.getManualNoteResult(0, 0.1),
    judgement.getSecondsWithDistance(Math.fround(1), Math.fround(0)),
    judgement.judgeManualNote(0, Number.NaN, Math.fround(0), bpm),
  ]) {
    assert.equal(invalid.status, "integrity-failure");
  }
  console.log(`manual judgement tests passed: MJ02=${mj02.steps.length} invalid=3`);
}

function ok(result) {
  assert.equal(result.status, "ok", JSON.stringify(result));
  return result.value;
}

function float32FromBits(bits) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
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
