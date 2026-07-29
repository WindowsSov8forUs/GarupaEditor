import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-manual-slide-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const evidenceRoot = join(repositoryRoot, "tmp", "simulator-reverse-evidence",
  "manual-input-judgement", "artifacts", "investigations",
  "manual-input-runtime-contract-10-1-4");
try {
  const oracle = JSON.parse(readFileSync(join(evidenceRoot,
    "manual_input_fixed_event_oracle.json"), "utf8"));
  for (const caseId of ["MJ18", "MJ19", "MJ20", "MJ21", "MJ22"]) {
    const entry = oracle.cases.find((candidate) => candidate.case_id === caseId);
    assert.ok(entry); assert.deepEqual(entry.unknown_fields, []);
  }
  const judge = readFileSync(join(evidenceRoot, "arm64",
    "0321d96c__SlideNoteManager__Judge.arm64.tsv"), "utf8");
  const began = readFileSync(join(evidenceRoot, "arm64",
    "0321ba8c__NoteSlide__ExecTouchBegan.arm64.tsv"), "utf8");
  const moved = readFileSync(join(evidenceRoot, "arm64",
    "0321c664__NoteSlide__ExecTouchMoved.arm64.tsv"), "utf8");
  const near = readFileSync(join(evidenceRoot, "arm64",
    "03223820__SlideNoteManager__GetNearJudgeLineNote.arm64.tsv"), "utf8");
  assert.match(judge, /fmul|fcmp/);
  assert.match(judge, /ldr w0, \[x0, #0x14\][\s\S]*str wzr, \[x19\]/);
  assert.match(began, /mov w2, #8[\s\S]*OneFrameData\$\$Setup|mov w2, #8/);
  assert.match(moved, /SlideNoteManager\$\$Judge[\s\S]*NoteSlide\$\$intermediateNoteJudge/);
  assert.match(near, /fabd s8, s8, s9[\s\S]*fabd s0, s10, s1[\s\S]*csel x0/);
  console.log("frozen MJ18-MJ22 and Slide owner order verified");
  run(process.execPath, [typeScriptCli, "-p", join(testingRoot, "tsconfig.tests.json"),
    "--outDir", outputRoot]);
  run(process.execPath, [join(outputRoot, "src", "simulator", "testing",
    "manualSlideJudgement.test.js")]);
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally { rmSync(outputRoot, { recursive: true, force: true }); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
