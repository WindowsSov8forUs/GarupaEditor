import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageRoot, "../../..");
const manifestPath = resolve(packageRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sourceRoot = manifest.source.repository;
const validateIndex = process.argv.includes("--index");
const investigationPrefix = "artifacts/investigations/score-life-state-runtime-contract-10-1-4/";
const investigation = resolve(packageRoot, investigationPrefix);
const closureCommit = "44d2f20bf4cf19eb4c91e5b025101ec154f31e60";

function fail(message) { throw new Error(message); }
function check(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex").toUpperCase(); }
function git(args, cwd, encoding = null) { return execFileSync("git", args, { cwd, encoding, maxBuffer: 256 * 1024 * 1024 }); }
function json(name) { return JSON.parse(readFileSync(resolve(investigation, name), "utf8")); }
function filesRecursively(root, current = root) {
  const result = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) result.push(...filesRecursively(root, path));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join("/"));
  }
  return result;
}
function checkBytes(label, bytes, entry) {
  check(bytes.length === entry.bytes, `${label} byte count differs`);
  check(sha256(bytes) === entry.sha256, `${label} SHA-256 differs`);
}

check(manifest.schemaVersion === 2, "Unexpected manifest schema");
check(manifest.entries.length === 464 && manifest.counts.totalEntries === 464, "Unexpected manifest entry count");
check(manifest.sample.package === "jp.co.craftegg.band" && manifest.sample.versionName === "10.1.4" && manifest.sample.versionCode === 230 && manifest.sample.abi === "arm64-v8a", "Unexpected sample");
check(manifest.sample.libil2cppSha256 === "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F", "Unexpected ELF hash");
check(manifest.sample.globalMetadataSha256 === "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F", "Unexpected metadata hash");
check(manifest.source.portableClosureCommit === closureCommit && manifest.source.fixedEventOracleCommit === closureCommit, "Closure commit differs");
check(manifest.source.skillPlayingRetryResetPlanCommit === "f87e578b86b7640cad2358e54d5e9236862590f1", "Retry reset plan commit differs");
check(manifest.source.skillPlayingRetryResetEvidenceCommit === "9c3f96b402efc8350cff4530de32fd3654c16a5b", "Retry reset evidence commit differs");
check(manifest.counts.methods === 326 && manifest.counts.layouts === 25 && manifest.counts.enums === 19 && manifest.counts.arm64Slices === 326, "Static counts differ");
check(manifest.counts.r1Traces === 12 && manifest.counts.fixedEventCases === 36 && manifest.counts.fixedEventConfirmedCases === 36 && manifest.counts.fixedEventPartialCases === 0 && manifest.counts.fixedEventBlockedCases === 0, "Runtime/fixed-event counts differ");
check(manifest.counts.fixedEventUnknownFields === 0 && manifest.counts.fixedEventBlockingFindings === 0, "Fixed-event gate remains open");
check(manifest.counts.retryResetPlanEntries === 3 && manifest.counts.retryResetEvidenceEntries === 4 && manifest.counts.portableClosureEntries === 10, "Closure batch counts differ");
check(manifest.businessStateGate.status === "closed" && manifest.businessStateGate.blockingFindings.length === 0 && manifest.businessStateGate.requiredBeforeTasks.length === 0 && manifest.businessStateGate.productionAuthorization === true, "Business gate differs");
check(manifest.runtimeInputGate.status === "closed-portable-contract" && manifest.runtimeInputGate.r1TraceCount === 12 && manifest.runtimeInputGate.partialFindings.length === 0 && manifest.runtimeInputGate.blockingFindings.length === 0 && manifest.runtimeInputGate.productionAuthorization === true, "Runtime gate differs");
check(manifest.runtimeInputGate.fixedEventOracle.status === "closed-portable-contract" && manifest.runtimeInputGate.fixedEventOracle.confirmedCases.length === 36 && manifest.runtimeInputGate.fixedEventOracle.unknownFields === 0 && manifest.runtimeInputGate.fixedEventOracle.blockingFindings === 0, "Runtime fixed-event gate differs");

const ids = new Set();
const copiedPaths = new Set();
const sourceCommits = new Set();
for (const entry of manifest.entries) {
  check(!ids.has(entry.id), `Duplicate evidence id: ${entry.id}`); ids.add(entry.id);
  check(!copiedPaths.has(entry.copiedPath), `Duplicate copied path: ${entry.copiedPath}`); copiedPaths.add(entry.copiedPath);
  check(entry.sourcePath === entry.copiedPath && entry.sourcePath.startsWith(investigationPrefix), `Unexpected path mapping: ${entry.id}`);
  sourceCommits.add(entry.sourceCommit);
  git(["cat-file", "-e", `${entry.sourceCommit}^{commit}`], sourceRoot);
  git(["merge-base", "--is-ancestor", entry.sourceCommit, closureCommit], sourceRoot);
  const committed = git(["show", `${entry.sourceCommit}:${entry.sourcePath}`], sourceRoot);
  const sourceWorking = readFileSync(resolve(sourceRoot, entry.sourcePath));
  const copied = readFileSync(resolve(packageRoot, entry.copiedPath));
  checkBytes(`committed ${entry.id}`, committed, entry);
  checkBytes(`source working ${entry.id}`, sourceWorking, entry);
  checkBytes(`copied ${entry.id}`, copied, entry);
  check(committed.equals(sourceWorking) && committed.equals(copied), `Three-way bytes differ: ${entry.id}`);
  if (validateIndex) {
    const indexed = git(["show", `:${relative(projectRoot, resolve(packageRoot, entry.copiedPath)).split(sep).join("/")}`], projectRoot);
    checkBytes(`index ${entry.id}`, indexed, entry);
    check(indexed.equals(committed), `Index/source bytes differ: ${entry.id}`);
  }
}
const frozenFiles = filesRecursively(investigation).sort();
const manifestFiles = [...copiedPaths].map((path) => path.slice(investigationPrefix.length)).sort();
check(JSON.stringify(frozenFiles) === JSON.stringify(manifestFiles), "Frozen file set differs from manifest");

const migrated = json("score_life_state_migrated_static_oracle.json");
check(migrated.status === "confirmed-current-arm64-semantic-bundles" && Object.keys(migrated.bundles).length === 8, "Migrated static oracle differs");
check(Object.values(migrated.bundles).reduce((count, bundle) => count + bundle.current_methods.length, 0) === 48, "Migrated method count differs");
check(migrated.conclusions.active_effects.activate_effect_types["10"] === "score_under_great_half", "Active-effect closure differs");
check(migrated.conclusions.skill_playback.states["3"] === "Finishing" && migrated.conclusions.fever_command.member_pass.minimum_point === 80 && migrated.conclusions.fever_command.score_rate.FeverLevel_1 === 2, "Skill/Fever closure differs");

const portable = json("score_life_state_portable_contract.json");
check(portable.status === "closed-portable-contract-current-arm64-and-r1" && portable.cases.length === 36 && portable.coverage.unknown_field_count === 0 && portable.coverage.blocking_finding_count === 0, "Portable contract differs");
check(portable.coverage.former_unknown_field_count === 125 && portable.coverage.former_blocking_finding_count === 82 && portable.coverage.fail_closed_cases.join(",") === "BS36", "Portable disposition coverage differs");
const continueRow = portable.cases.find((row) => row.case_id === "BS36").field_dispositions["lifecycle.continue"];
check(continueRow.result === "evidence-required" && continueRow.mutation === "none", "Continue policy differs");

const fixed = json("score_life_state_fixed_event_oracle.json");
check(fixed.status === "closed-10.1.4-fixed-event-oracle-portable-contract" && fixed.business_state_gate === "closed" && fixed.production_authorization === true, "Fixed-event gate differs");
check(fixed.coverage.total_cases === 36 && fixed.coverage.confirmed_cases.length === 36 && fixed.coverage.partial_cases.length === 0 && fixed.coverage.blocked_cases.length === 0 && fixed.coverage.unknown_field_count === 0 && fixed.coverage.blocking_finding_count === 0, "Fixed-event coverage differs");
check(fixed.cases.every((row) => row.status === "confirmed-portable" && row.unknown_fields.length === 0 && row.blocking_findings.length === 0), "Fixed-event case remains open");

const closure = json("closure.json");
check(closure.status === "closed-score-life-state-evidence-and-portable-contract" && closure.business_state_gate === "closed" && closure.production_authorization === true, "Final closure differs");
check(Object.keys(closure.gates).join(",") === ["V01", ...Array.from({ length: 24 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`)].join(","), "Closure gate set differs");
check(Object.values(closure.gates).every((row) => row.status === "closed"), "Closure gate remains open");
check(closure.unknown_methods.length === 0 && closure.unknown_layouts.length === 0 && closure.unknown_fields.length === 0 && closure.blocking_findings.length === 0, "Closure unknowns remain");

const trace = JSON.parse(gunzipSync(readFileSync(resolve(investigation, "runtime/ordinary-auto-skill-playing-retry-reset-r1.trace.json.gz"))));
check(trace.status === "confirmed-r1-observation-only" && trace.capture_error === null && trace.events.length === 1471 && trace.events.every((event, index) => event.sequence === index), "Retry reset trace differs");
check(trace.summary.counts["SituationSkillManager.ExecAwakeStart.enter"] === 2 && trace.summary.counts["SituationSkillManager.ExecAwakeStart.leave"] === 2 && !trace.summary.counts["SituationSkillManager.Stop.enter"], "Retry reset lifecycle differs");
check(trace.privacy.account_fields_included === false && trace.privacy.raw_pointers_included === false && trace.privacy.display_strings_included === false && trace.privacy.skill_master_ids_included === false && trace.privacy.member_identity_included === false, "Retry reset privacy differs");

console.log(`verified score/life/state evidence: entries=${manifest.entries.length} methods=326 layouts=25 enums=19 R1=12 BS=36(36/0/0) unknown=0 blockers=0 V01+D01-D24=closed gate=closed production=true${validateIndex ? " index=checked" : ""}`);
