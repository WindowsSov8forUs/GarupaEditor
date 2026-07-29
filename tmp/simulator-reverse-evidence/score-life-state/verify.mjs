import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageRoot, "../../..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
const sourceRoot = manifest.source.repository;
const validateIndex = process.argv.includes("--index");
const investigation = resolve(
  packageRoot,
  "artifacts/investigations/score-life-state-runtime-contract-10-1-4",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
function git(args, cwd, encoding = "utf8") {
  return execFileSync("git", args, { cwd, encoding, maxBuffer: 256 * 1024 * 1024 });
}
function fail(message) {
  throw new Error(message);
}
function check(condition, message) {
  if (!condition) fail(message);
}
function checkBytes(label, bytes, entry) {
  check(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${label} bytes/hash mismatch`);
}
function json(path) {
  return JSON.parse(readFileSync(resolve(investigation, path), "utf8"));
}
function filesRecursively(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...filesRecursively(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

check(manifest.schemaVersion === 2 && manifest.entries.length === 349, "Unexpected evidence manifest shape");
check(
  manifest.source.staticEvidenceCommit === "6c902656c72f3983fb04386038dcfe38f0d53797" &&
    manifest.source.runtimeInputCommit === "1ee976ea1de24cb0567762a74e2d091ae4c78464" &&
    manifest.source.runtimeEvidenceCommit === "72aa279fb07041b04ca649df918fa35ab0490d91",
  "Unexpected Reverse evidence commits",
);
check(
  manifest.sample.package === "jp.co.craftegg.band" &&
    manifest.sample.versionName === "10.1.4" &&
    manifest.sample.versionCode === 230 &&
    manifest.sample.abi === "arm64-v8a" &&
    manifest.sample.libil2cppSha256 ===
      "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F" &&
    manifest.sample.globalMetadataSha256 ===
      "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F",
  "Unexpected score/life/state sample identity",
);
check(
  manifest.counts.methods === 326 &&
    manifest.counts.layouts === 25 &&
    manifest.counts.enums === 19 &&
    manifest.counts.arm64Slices === 326 &&
    manifest.counts.staticEntries === 335 &&
    manifest.counts.totalEntries === 349 &&
    manifest.counts.r0InputEntries === 12 &&
    manifest.counts.r1EvidenceEntries === 6 &&
    manifest.counts.productionBms === 2 &&
    manifest.counts.cacheRecords === 2 &&
    manifest.counts.captureTargets === 50 &&
    manifest.counts.r1Traces === 1 &&
    manifest.counts.fixedEventCases === 0,
  "Evidence counts changed",
);
const versionGate = manifest.versionRebaselineGate;
const businessGate = manifest.businessStateGate;
check(
  versionGate.status === "closed" &&
    versionGate.unknownMethods.length === 0 &&
    versionGate.unknownLayouts.length === 0 &&
    versionGate.unknownFields.length === 0,
  "Version rebaseline is not closed",
);
check(
  businessGate.status === "open" &&
    businessGate.blockingFindings.join(",") === "D18,D19,D20,D21,D22,D23,D24" &&
    businessGate.productionAuthorization === false &&
    businessGate.requiredBeforeTasks.includes("B02") &&
    businessGate.requiredBeforeTasks.includes("B12"),
  "Business gate was incorrectly closed",
);
const runtimeInputGate = manifest.runtimeInputGate;
check(
  runtimeInputGate.status === "partial-required-before-code" &&
    runtimeInputGate.closedSubscope.join(",") ===
      "ordinary-production-bms,habahiro-production-bms,connected-device-cache-provenance,observation-only-capture-targets,no-input-life-game-over-r1" &&
    runtimeInputGate.partialFindings.join(",") === "D18,D22,D23" &&
    runtimeInputGate.blockingFindings.join(",") ===
      "D18-remaining,D19,D20,D21,D22-remaining,D23-master-start-data,D24" &&
    runtimeInputGate.r1TraceCount === 1 &&
    runtimeInputGate.productionAuthorization === false,
  "Runtime input gate was incorrectly closed",
);

git(["cat-file", "-e", `${manifest.source.staticEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.runtimeInputCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.runtimeEvidenceCommit}^{commit}`], sourceRoot);
const evidenceCommits = [
  manifest.source.staticEvidenceCommit,
  manifest.source.runtimeInputCommit,
  manifest.source.runtimeEvidenceCommit,
];
const ids = new Set();
const copiedPaths = new Set();
for (const entry of manifest.entries) {
  check(!ids.has(entry.id), `Duplicate evidence id: ${entry.id}`);
  check(!copiedPaths.has(entry.copiedPath), `Duplicate copied path: ${entry.copiedPath}`);
  ids.add(entry.id);
  copiedPaths.add(entry.copiedPath);
  check(
    evidenceCommits.includes(entry.sourceCommit) &&
      entry.sourcePath === entry.copiedPath &&
      !entry.sourcePath.startsWith("runtime/tools/") &&
      entry.sourcePath.startsWith(
        "artifacts/investigations/score-life-state-runtime-contract-10-1-4/",
      ),
    `Forbidden, foreign, or mismatched evidence path: ${entry.id}`,
  );
  const copied = readFileSync(resolve(packageRoot, entry.copiedPath));
  checkBytes(`${entry.id} copied`, copied, entry);
  const source = git(["show", `${entry.sourceCommit}:${entry.sourcePath}`], sourceRoot, null);
  checkBytes(`${entry.id} source`, source, entry);
  if (validateIndex) {
    const indexPath = relative(projectRoot, resolve(packageRoot, entry.copiedPath))
      .split(sep)
      .join("/");
    const indexed = git(["show", `:${indexPath}`], projectRoot, null);
    checkBytes(`${entry.id} index`, indexed, entry);
  }
}

const actualCopiedPaths = new Set(
  filesRecursively(investigation).map(
    (path) => `artifacts/investigations/score-life-state-runtime-contract-10-1-4/${path}`,
  ),
);
check(
  actualCopiedPaths.size === copiedPaths.size &&
    [...actualCopiedPaths].every((path) => copiedPaths.has(path)),
  "Manifest does not exactly cover the frozen investigation",
);

const sums = new Map();
for (const rawLine of readFileSync(resolve(investigation, "SHA256SUMS"), "utf8").trimEnd().split("\n")) {
  const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
  const match = /^([0-9A-F]{64})  (.+)$/.exec(line);
  check(match, `Malformed frozen SHA256SUMS row: ${line}`);
  check(!sums.has(match[2]), `Duplicate frozen SHA256SUMS path: ${match[2]}`);
  sums.set(match[2], match[1]);
}
const hashedFiles = filesRecursively(investigation).filter((path) => path !== "SHA256SUMS");
check(
  sums.size === hashedFiles.length && hashedFiles.every((path) => sums.get(path) === sha256(readFileSync(resolve(investigation, path)))),
  "Frozen SHA256SUMS is stale or incomplete",
);

const contract = json("score_life_state_static_contract.json");
check(
  contract.method_status_counts.mapped === 326 &&
    Object.keys(contract.method_status_counts).length === 1 &&
    contract.layout_status_counts.unchanged === 25 &&
    Object.keys(contract.layout_status_counts).length === 1 &&
    contract.enum_status_counts.unchanged === 19 &&
    Object.keys(contract.enum_status_counts).length === 1,
  "Frozen static contract is not fully mapped",
);
check(
  contract.methods.length === 326 &&
    contract.methods.every((entry) => entry.status === "mapped" && entry.evidence.startsWith("arm64/") && entry.target_size > 0) &&
    contract.field_layout.length === 25 &&
    contract.field_layout.every(
      (entry) => entry.status === "unchanged" &&
        Object.keys(entry.changed).length === 0 &&
        entry.added.length === 0 &&
        entry.removed.length === 0,
    ) &&
    contract.enums.length === 19 &&
    contract.enums.every((entry) => entry.status === "unchanged"),
  "Frozen migration rows are incomplete",
);
check(
  contract.named_constants.BMSDefine.DefaultLifeValue === 1000 &&
    contract.named_constants.BMSDefine.MaxLifeValue === 2000 &&
    contract.named_constants.BMSDefine.LeaderIndex === 2 &&
    contract.named_constants.BMSDefine.LifeWhenNeverDieEffect === 5 &&
    contract.named_constants.FeverTimeManager.FEVER_LEVEL_1_POINT === 80 &&
    contract.named_constants.FeverTimeManager.FEVER_LEVEL_1_SCORE_RATE === 2,
  "Frozen named constants changed",
);

const findings = json("score_life_state_static_findings.json");
check(
  findings.status === "confirmed-static-10.1.4-business-gate-open" &&
    findings.scope.mapped_methods === 326 &&
    findings.scope.unchanged_layouts === 25 &&
    findings.scope.unchanged_enums === 19 &&
    findings.unknown_fields.length === 0 &&
    findings.findings.length === 12 &&
    findings.runtime_required_before_code.length > 0 &&
    findings.blocking_findings.length > 0,
  "Frozen static findings are incomplete or overclaim closure",
);
const findingById = new Map(findings.findings.map((entry) => [entry.id, entry]));
check(
  findingById.get("SLS-S03")?.conclusion.Perfect.bits_le === "CDCC8C3F" &&
    findingById.get("SLS-S04")?.conclusion.at(-1)?.bits_le === "7B148E3F" &&
    findingById.get("SLS-S06")?.conclusion.initialize.business_upper_limit.includes("+0x28") &&
    findingById.get("SLS-S08")?.conclusion.resulting_life === 5 &&
    findingById.get("SLS-S11")?.conclusion.level_1_bits_le === "00000040",
  "Frozen critical findings changed",
);

const provenance = json("runtime-inputs/cache-index/cache_index_provenance.json");
check(
  provenance.status === "confirmed-r0-connected-device-cache-input-provenance" &&
    provenance.capability.level === "R0" &&
    provenance.capability.memory_writes === false &&
    provenance.privacy.account_fields_included === false &&
    provenance.records.length === 2 &&
    provenance.bms.length === 2 &&
    provenance.unknown_fields.length === 0 &&
    provenance.blocking_findings.length === 0,
  "Frozen R0 cache provenance changed",
);
const expectedBms = new Map([
  ["poppin_shuffle_special", [17882, "418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC"]],
  ["786_miracle_april_habahiro_special", [38700, "43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159"]],
]);
for (const row of provenance.bms) {
  const expected = expectedBms.get(row.asset_name);
  const bytes = readFileSync(resolve(investigation, row.path));
  check(
    expected && bytes.length === expected[0] && row.bytes === expected[0] &&
      sha256(bytes) === expected[1] && row.sha256 === expected[1],
    `Frozen production BMS changed: ${row.asset_name}`,
  );
}
for (const row of provenance.records) {
  const bytes = readFileSync(resolve(investigation, "runtime-inputs/cache-index", row.raw_record_path));
  check(
    bytes.length === row.raw_record_bytes && sha256(bytes) === row.raw_record_sha256 &&
      row.cache_file.length === 64 && row.bundle_bytes > 0,
    `Frozen cache record changed: ${row.bundle_name}`,
  );
}
const captureSource = readFileSync(resolve(investigation, "capture_score_life_state_runtime.py"), "utf8");
check(
  captureSource.includes("Interceptor.attach") &&
    captureSource.includes("user_ids_omitted:true") &&
    !captureSource.includes("Interceptor.replace") &&
    !captureSource.includes("retval.replace") &&
    !captureSource.includes("Memory.patchCode") &&
    !captureSource.includes("writePointer") &&
    !captureSource.includes("writeByteArray"),
  "Frozen capture is not observation-only",
);
const runtimeStatus = json("runtime_input_status.json");
check(
  runtimeStatus.status === "runtime-inputs-and-r1-partial-locked-business-gate-open" &&
    runtimeStatus.runtime.r1_trace_count === 1 &&
    runtimeStatus.gates.D18 === "partial-required-before-code" &&
    runtimeStatus.gates.D22 === "partial-required-before-code" &&
    runtimeStatus.gates.D23 === "partial-required-before-code" &&
    runtimeStatus.closed.r1_no_input_life_game_over.events === 1863 &&
    runtimeStatus.closed.r1_no_input_life_game_over.one_frame_setup === 11 &&
    runtimeStatus.closed.r1_no_input_life_game_over.reflect === 210 &&
    runtimeStatus.closed.r1_no_input_life_game_over.final_life === 0 &&
    runtimeStatus.closed.r1_no_input_life_game_over.single_game_over.join(",") === "0,1" &&
    runtimeStatus.business_state_gate === "open" &&
    runtimeStatus.production_authorization === false &&
    runtimeStatus.blocking_findings.length > 0,
  "Frozen runtime input status overclaims closure",
);

const traceBytes = gunzipSync(
  readFileSync(resolve(investigation, "runtime/no-input-retry-life-gameover.trace.json.gz")),
);
const trace = JSON.parse(traceBytes.toString("utf8"));
check(
  trace.schema_version === 1 &&
    trace.status === "confirmed-r1-observation-only" &&
    trace.capture_error === null &&
    trace.events.length === 1863 &&
    trace.events.every((event, index) => event.sequence === index) &&
    trace.capability.level === "R1" &&
    trace.capability.return_replacement === false &&
    trace.capability.memory_writes === false &&
    trace.capability.apk_modification === false &&
    trace.capability.transport.kind === "explicit-remote" &&
    trace.capability.transport.address === "127.0.0.1:47913" &&
    trace.sample.package === "jp.co.craftegg.band" &&
    trace.sample.version_name === "10.1.4" &&
    trace.sample.version_code === 230 &&
    trace.sample.abi === "arm64-v8a" &&
    trace.capture_script_sha256 === sha256(readFileSync(resolve(investigation, "capture_score_life_state_runtime.py"))) &&
    trace.plan_sha256 === sha256(readFileSync(resolve(investigation, "runtime/no-input-retry-plan.json"))) &&
    trace.summary.queued === 0,
  "Frozen no-input R1 identity, capability, or sequence changed",
);
const eventsOf = (kind) => trace.events.filter((event) => event.kind === kind);
const initializeLife = eventsOf("InGameRecord.InitializeLife.leave");
const setupFrames = eventsOf("OneFrameData.Setup.leave").map((event) => event.frame);
const gameOverEnter = eventsOf("InGameRecord.updateGameOverState.enter");
const gameOverLeave = eventsOf("InGameRecord.updateGameOverState.leave");
check(
  initializeLife.length === 1 &&
    initializeLife[0].record.current_life === 1000 &&
    initializeLife[0].record.displayed_or_skill_base_life === 1000 &&
    initializeLife[0].record.business_life_upper_limit === 2000 &&
    initializeLife[0].record.max_note_count === 540 &&
    setupFrames.length === 11 &&
    setupFrames.every(
      (frame) =>
        frame.is_using === 1 &&
        frame.add_power === -100 &&
        frame.add_combo === -1 &&
        frame.result === 0 &&
        frame.adjusted_result === 0 &&
        frame.damage_guard_type === 0 &&
        frame.judge_timing === 0,
    ) &&
    setupFrames.filter((frame) => frame.note_type === 0).length === 9 &&
    setupFrames.filter((frame) => frame.note_type === 8).length === 2 &&
    eventsOf("OneFrameController.Reflect.enter").length === 210 &&
    gameOverEnter.length === 1 &&
    gameOverLeave.length === 1 &&
    gameOverEnter[0].before.current_life === 0 &&
    gameOverEnter[0].before.miss_count === 11 &&
    gameOverEnter[0].before.is_single_game_over === 0 &&
    gameOverLeave[0].after.current_life === 0 &&
    gameOverLeave[0].after.miss_count === 11 &&
    gameOverLeave[0].after.is_single_game_over === 1,
  "Frozen no-input R1 Life/OneFrame/Game Over trajectory changed",
);

const closure = json("static_closure.json");
check(
  closure.version_rebaseline === "closed" &&
    closure.business_state_gate === "open" &&
    closure.production_authorization === false &&
    closure.unknown_methods.length === 0 &&
    closure.unknown_layouts.length === 0 &&
    closure.unknown_fields.length === 0 &&
    closure.blocking_findings.length === 7 &&
    closure.gates.V01.status === "closed" &&
    ["D18", "D19", "D20", "D21", "D22", "D23", "D24"].every(
      (id) => closure.gates[id].status === "required-before-code",
    ),
  "Frozen static closure gate changed",
);

const criticalText = [
  ["arm64/032f262c__InGameRecord__AddIPower.arm64.tsv", "0x32F269C\t04000094\tbl #0x32f26ac\tInGameRecord$$updateGameOverState"],
  ["arm64/0331ea00__ScoreUtility__GetComboCorrectionRate.arm64.tsv", "0x331EA54\t1FF00A71\tcmp w0, #0x2bc"],
  ["arm64/03321a08__SituationSkillManager__executePlayingSkillProcess.arm64.tsv", "0x3321A50\t08E8A7D2\tmov x8, #0x3f400000"],
  ["arm64/033daddc__SkillUtility__CalcAddDamageWithNeverDieSkill.arm64.tsv", "0x33DADE0\tA9008052\tmov w9, #5"],
  ["arm64/032f3bf8__FeverTimeManager__GetFeverTimeScoreRate.arm64.tsv", "0x32F3C00\t0110201E\tfmov s1, #2.00000000"],
];
for (const [path, fragment] of criticalText) {
  check(readFileSync(resolve(investigation, path), "utf8").includes(fragment), `Critical ARM64 fragment changed: ${path}`);
}

console.log(
  `score-life-state evidence verified: methods=326 layouts=25 enums=19 BMS=2 R1=1(partial D18/D22) ` +
    `V01=closed business=blocked(D18-D24) entries=${manifest.entries.length} ` +
    `index=${validateIndex ? "checked" : "skipped"}`,
);
