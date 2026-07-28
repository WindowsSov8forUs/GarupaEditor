import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageRoot, "../../..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
const sourceRoot = manifest.source.repository;
const validateIndex = process.argv.includes("--index");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function git(args, cwd, encoding = "utf8") {
  return execFileSync("git", args, { cwd, encoding, maxBuffer: 128 * 1024 * 1024 });
}

function fail(message) {
  throw new Error(message);
}

function checkBytes(id, bytes, expectedBytes, expectedHash) {
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedHash) {
    fail(`${id} bytes/hash mismatch`);
  }
}

function checkCopied(entry) {
  const copied = readFileSync(resolve(packageRoot, entry.copiedPath));
  checkBytes(`${entry.id} copied`, copied, entry.bytes, entry.sha256);
  if (entry.sourcePath !== undefined) {
    const source = git(["show", `${entry.sourceCommit}:${entry.sourcePath}`], sourceRoot, null);
    checkBytes(`${entry.id} source`, source, entry.bytes, entry.sha256);
  }
  if (validateIndex) {
    const indexPath = relative(projectRoot, resolve(packageRoot, entry.copiedPath))
      .split(sep)
      .join("/");
    const indexed = git(["show", `:${indexPath}`], projectRoot, null);
    checkBytes(`${entry.id} index`, indexed, entry.bytes, entry.sha256);
  }
}

if (git(["rev-parse", "HEAD"], sourceRoot).trim() !== manifest.source.finalEvidenceCommit) {
  fail("Reverse HEAD does not equal the frozen Auto Live evidence commit");
}
const sourceStatus = git(["status", "--porcelain"], sourceRoot)
  .split(/\r?\n/)
  .filter(Boolean);
for (const line of sourceStatus) {
  if (manifest.source.excludedUntrackedPaths.some((path) => line === `?? ${path}`)) {
    continue;
  }
  if (line.startsWith("?? ")) {
    fail(`Unexpected Reverse untracked path: ${line}`);
  }
}
if (sourceStatus.some((line) => !line.startsWith("?? "))) {
  try {
    git(["diff", "--ignore-space-at-eol", "--quiet"], sourceRoot);
  } catch {
    fail("Reverse contains non-EOL tracked changes outside the frozen commit");
  }
}

if (
  manifest.autoLiveEvidenceGate.status !== "closed" ||
  manifest.autoLiveEvidenceGate.sourceClosureStatus !== "confirmed" ||
  manifest.autoLiveEvidenceGate.blockingFindings.length !== 0 ||
  manifest.autoLiveEvidenceGate.requiredBeforeTasks.length !== 0
) {
  fail("Auto Live evidence gate is not closed");
}
if (manifest.candidateEntries.length !== 30 || manifest.finalEntries.length !== 72) {
  fail("Unexpected Auto Live evidence entry count");
}

const ids = new Set();
for (const entry of [
  ...manifest.candidateEntries,
  ...manifest.finalEntries,
  ...manifest.fixtureAliases,
  ...manifest.upstreamDependencies,
]) {
  if (ids.has(entry.id)) fail(`Duplicate evidence id: ${entry.id}`);
  ids.add(entry.id);
  if (
    entry.sourcePath?.startsWith("runtime/tools/") ||
    entry.copiedPath.startsWith("runtime/tools/")
  ) {
    fail(`Forbidden runtime/tools evidence: ${entry.id}`);
  }
  checkCopied(entry);
}

const closure = JSON.parse(
  readFileSync(
    resolve(packageRoot, "artifacts/investigations/auto-live-runtime-contract/closure.json"),
    "utf8",
  ),
);
if (
  closure.overall_status !== "confirmed" ||
  closure.auto_live_gate !== "closed" ||
  closure.blocking_findings.length !== 0 ||
  Object.keys(closure.gap_resolution).length !== 10
) {
  fail("Frozen Reverse closure is not the closed G01-G10 contract");
}

const trace = JSON.parse(
  readFileSync(resolve(packageRoot, "fixtures/auto-live-fixed-event-trace.json"), "utf8"),
);
if (
  trace.status !== "confirmed-static-contract-fixed-offline-oracle" ||
  trace.cases.length < 10 ||
  !trace.excluded_by_stage.includes("score") ||
  !trace.excluded_by_stage.includes("audio")
) {
  fail("Frozen fixed event trace has an unexpected scope");
}

const supplementClosure = JSON.parse(
  readFileSync(
    resolve(
      packageRoot,
      "artifacts/investigations/auto-live-runtime-contract-supplement/closure.json",
    ),
    "utf8",
  ),
);
if (
  supplementClosure.overall_status !== "confirmed" ||
  supplementClosure.auto_live_gate !== "closed" ||
  supplementClosure.blocking_findings.length !== 0 ||
  Object.keys(supplementClosure.supplement_gap_resolution).length !== 12
) {
  fail("Frozen Reverse supplement closure is not the closed G11-G22 contract");
}

const supplementTrace = JSON.parse(
  readFileSync(
    resolve(packageRoot, "fixtures/auto-live-supplement-fixed-event-trace.json"),
    "utf8",
  ),
);
const supplementCaseIds = new Set(supplementTrace.cases.map((entry) => entry.case_id));
for (const required of [
  "multiple-directional-left-auto-group",
  "multiple-directional-right-auto-group",
  "slide-stop-selected-visible-intermediate",
  "pause-active-long-freeze-resume",
  "pause-active-slide-pending-slot-freeze",
  "offset-plus5-cross-bpm-exact",
  "offset-minus5-cross-bar-exact",
  "offset-zero-identity-exact",
  "multiple-source-order-interleaved-break",
  "one-frame-exhaustion-long-head-terminal-fault",
  "one-frame-exhaustion-slide-head-terminal-fault",
  "one-frame-exhaustion-long-tail-terminal-fault",
  "actual-adaptive-scheduler-observation-requirements",
  "actual-offset-tempo-query-observation-requirements",
]) {
  if (!supplementCaseIds.has(required)) {
    fail(`Frozen supplement trace is missing ${required}`);
  }
}

const actualReplay = JSON.parse(
  readFileSync(resolve(packageRoot, "fixtures/auto-live-actual-replay.json"), "utf8"),
);
if (
  actualReplay.status !== "confirmed-committed-production-replay-input" ||
  actualReplay.production_owner !== "InGameMusicScoreController.getAdjustedMusicPosition" ||
  actualReplay.offset_replays.length !== 3 ||
  actualReplay.adaptive_method_replay.judgement_outer_frame_index !== 1 ||
  !actualReplay.forbidden_test_inputs.includes("expected-step-bpms")
) {
  fail("Frozen G22 actual replay contract is incomplete");
}
const replayCases = new Map(
  actualReplay.offset_replays.map((entry) => [entry.case_id, entry]),
);
if (
  replayCases.get("offset-plus5-cross-bpm-exact")?.delta_time_bits.length !== 991 ||
  replayCases.get("offset-minus5-cross-bar-exact")?.delta_time_bits.length !== 317 ||
  replayCases.get("offset-zero-identity-exact")?.delta_time_bits.length !== 317
) {
  fail("Frozen G22 replay frame inputs are incomplete");
}

if (!existsSync(resolve(packageRoot, "OPEN_GAPS.md"))) {
  fail("OPEN_GAPS.md is missing");
}

console.log(
  `auto-live evidence verified: candidates=${manifest.candidateEntries.length}, ` +
    `final=${manifest.finalEntries.length}, supplement=G11-G22, cases=14, replay=4, ` +
    `gate=closed, index=${validateIndex ? "checked" : "skipped"}`,
);
