import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-manual-timeout-"));
const require = createRequire(import.meta.url); const typeScriptCli = require.resolve("typescript/bin/tsc");
const evidenceRoot = join(repositoryRoot, "src", "simulator", "testing", "fixtures", "reverse-snapshots", "manual-input-judgement",
  "artifacts", "investigations", "manual-input-runtime-contract-10-1-4");
try {
  const oracle = JSON.parse(readFileSync(join(evidenceRoot, "manual_input_fixed_event_oracle.json"), "utf8"));
  for (const caseId of ["MJ16", "MJ17", "MJ23", "MJ24"]) {
    const entry = oracle.cases.find((candidate) => candidate.case_id === caseId);
    assert.ok(entry); assert.deepEqual(entry.unknown_fields, []);
  }
  const files = [
    "030eab88__NoteLong__WaitState.arm64.tsv", "030eac6c__NoteLong__execOverWaitState.arm64.tsv",
    "030eacd8__NoteLong__StopState.arm64.tsv", "030eae08__NoteLong__execOverStopState.arm64.tsv",
    "0321b414__NoteSlide__WaitState.arm64.tsv", "0321b628__NoteSlide__execOverWaitState.arm64.tsv",
    "0321b69c__NoteSlide__StopState.arm64.tsv", "0321ab5c__NoteSlide__OnUpdate.arm64.tsv",
    "0321ec88__NoteSlide__onMiss.arm64.tsv", "0321ee48__NoteSlide__killFromInvisibleNotesToVisibleNote.arm64.tsv",
    "0321f47c__NoteSlide__onMissAfterNote.arm64.tsv",
  ].map((name) => readFileSync(join(evidenceRoot, "arm64", name), "utf8"));
  assert.match(files[0], /GetSecWithDistance[\s\S]*fcmp[\s\S]*b\.le/);
  assert.match(files[1], /NoteLong\$\$onMiss[\s\S]*NoteLong\$\$onMiss[\s\S]*NoteLong\$\$Deactivate/);
  assert.match(files[2], /GetSecWithDistance[\s\S]*fcmp[\s\S]*b\.le/);
  assert.match(files[4], /GetSecWithDistance[\s\S]*fcmp[\s\S]*b\.gt/);
  assert.match(files[8], /mov w1, #8[\s\S]*NoteBase\$\$Miss/);
  assert.match(files[9], /isInvisible|ldrb[\s\S]*ChangeState[\s\S]*changeCurrentNote/);
  console.log("frozen MJ16/MJ17/MJ23/MJ24 timeout order verified");
  run(process.execPath, [typeScriptCli, "-p", join(testingRoot, "tsconfig.tests.json"), "--outDir", outputRoot]);
  run(process.execPath, [join(outputRoot, "src", "simulator", "testing", "manualTimeoutJudgement.test.js")]);
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally { rmSync(outputRoot, { recursive: true, force: true }); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
