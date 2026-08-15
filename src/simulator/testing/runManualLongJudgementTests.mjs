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
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-manual-long-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const evidenceRoot = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "manual-input-judgement", "artifacts", "investigations",
  "manual-input-runtime-contract-10-1-4");
try {
  const oracle = JSON.parse(readFileSync(join(evidenceRoot,
    "manual_input_fixed_event_oracle.json"), "utf8"));
  for (const caseId of ["MJ11", "MJ12", "MJ13", "MJ14", "MJ15"]) {
    const entry = oracle.cases.find((candidate) => candidate.case_id === caseId);
    assert.ok(entry); assert.deepEqual(entry.unknown_fields, []);
  }
  const began = readFileSync(join(evidenceRoot, "arm64",
    "030eaedc__NoteLong__ExecTouchBegan.arm64.tsv"), "utf8");
  const moved = readFileSync(join(evidenceRoot, "arm64",
    "030eb210__NoteLong__ExecTouchMoved.arm64.tsv"), "utf8");
  const ended = readFileSync(join(evidenceRoot, "arm64",
    "030eb8d0__NoteLong__judgeAfterNote.arm64.tsv"), "utf8");
  assert.match(began, /cmn w21, #1[\s\S]*cbnz w21[\s\S]*mov w2, #4[\s\S]*NoteBase\$\$ChangeState/);
  assert.match(moved, /fmov s2, #8\.00000000[\s\S]*fsub s2, s0, s1/);
  assert.match(moved, /ldr s1, \[x8, #0x460\][\s\S]*b\.le/);
  assert.match(moved, /ldr s0, \[x8, #0x580\][\s\S]*b\.gt/);
  assert.match(ended, /mov w23, #5[\s\S]*mov w23, #6[\s\S]*mov w23, #7/);
  assert.match(ended, /OneFrameData\$\$Setup[\s\S]*NoteBase\$\$judgeAfterNote[\s\S]*NoteLong\$\$Deactivate/);
  console.log("frozen MJ11-MJ15 and Long ARM64 order verified");
  if (sharedOutputRoot === undefined) {
    run(process.execPath, [typeScriptCli, "-p", join(testingRoot, "tsconfig.tests.json"),
      "--outDir", outputRoot]);
  }
  run(process.execPath, [join(outputRoot, "src", "simulator", "testing",
    "manualLongJudgement.test.js")]);
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally { if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true }); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
