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

check(manifest.schemaVersion === 2 && manifest.entries.length === 447, "Unexpected evidence manifest shape");
check(
  manifest.source.staticEvidenceCommit === "6c902656c72f3983fb04386038dcfe38f0d53797" &&
    manifest.source.runtimeInputCommit === "1ee976ea1de24cb0567762a74e2d091ae4c78464" &&
    manifest.source.runtimeEvidenceCommit === "72aa279fb07041b04ca649df918fa35ab0490d91" &&
    manifest.source.capturePlanCommit === "e65f3411d1a91cfa5ecf0d7b29e99605b04e8a41" &&
    manifest.source.capturePlanV2Commit === "3adf31f987830ce5b82aba0d92813b69fda3cec7" &&
    manifest.source.positiveEvidenceCommit === "5ce2a7ef325def61986a93053ad85c2f4973f25b" &&
    manifest.source.multitouchPlanCommit === "eb7aba5467569b577cd942957dd65bdce600bc9d" &&
    manifest.source.nativeMultitouchPlanCommit === "445ac26856e597fb6c12c708e7a31ecf995d06e1" &&
    manifest.source.skillEvidenceCommit === "4ac4ea186efade9091c6f4377ab7ad7dc852a2c5" &&
    manifest.source.retryLifecyclePlanCommit === "38cee0b409246323b46099e291331a78a267bcec" &&
    manifest.source.retryLifecycleEvidenceCommit === "4f0ce1a02a83747db617695cde69ad47ac8ae78f" &&
    manifest.source.fixedEventOracleCommit === "62b7954a3dc402916a4b0f1bd71d47e5e45210cd" &&
    manifest.source.chartCountOracleCommit === "c7dbaba81699adec896796167074cb85cdc94e2e" &&
    manifest.source.initializationProfilePlanCommit === "a032f8fe82d045b6d3b5c8853cb923803e0c5435" &&
    manifest.source.initializationProfileEvidenceCommit === "3c95190f4b6326da97e21c8e590f625a7582dc22" &&
    manifest.source.deckAggregatePlanCommit === "0bdb5cd59494076d92d3d5d6596608af476fec3e" &&
    manifest.source.deckAggregateEvidenceCommit === "b9b1a6deb334edf921a6f563ec0c270d49f0476f" &&
    manifest.source.masterMusicPlanCommit === "8b5d7dfb1a4b26a686b7e0a9cfcf093cb37e5386" &&
    manifest.source.masterMusicEvidenceCommit === "287cd8689a6d498fbd45c35b82d16a96c97916c1" &&
    manifest.source.ordinaryAutoPlanCommit === "3de6ba1bd192d606b742231ceb08fd1087a9974c" &&
    manifest.source.ordinaryAutoRetry2Commit === "0ff7b641049992840a53de7fd591020e1a26d276" &&
    manifest.source.ordinaryAutoRetry3Commit === "0779603e490d67310ccc4866623e37c3291b0ee3" &&
    manifest.source.ordinaryAutoRetry4Commit === "6ee113568b2b06abce524beff4a57d83290c9f8d" &&
    manifest.source.ordinaryAutoEvidenceCommit === "77fea929e1f99c1051b5211aa28836fd57c45117" &&
    manifest.source.ordinaryAutoSkillEffectPlanCommit === "9e217703c028e2f09be7fa2b30d791b6f7a4a338" &&
    manifest.source.ordinaryAutoSkillEffectEvidenceCommit === "a3c56662b979e1682340a7a47fa8553a8a95ee67" &&
    manifest.source.deckSwitchPlanCommit === "247473b2f34e4717920e13d1289e8b18955ee749" &&
    manifest.source.deckSwitchRetry2Commit === "a004e665d4fc4e59cfa37c59ebfd9bf1d1a04e28" &&
    manifest.source.deckSwitchRetry3Commit === "bbbc22d5ad48166cfa17abe651a768c1c0d1c533" &&
    manifest.source.rehearsalPlanCommit === "23b61c8b1c38e6e341e0b25504a035bb1afef586" &&
    manifest.source.rehearsalRetry2Commit === "645375cd3b52a5bca4ff8b1a715e5a663eff6872" &&
    manifest.source.rehearsalEvidenceCommit === "4bbfaa9bacc6c6db5a5097bcf4e173a532e5cd0d" &&
    manifest.source.skillPlayingPausePlanCommit === "16760726981882d16ae474c22ce9a281c0821187" &&
    manifest.source.skillPlayingPauseEvidenceCommit === "62b7954a3dc402916a4b0f1bd71d47e5e45210cd",
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
    manifest.counts.totalEntries === 447 &&
    manifest.counts.r0InputEntries === 12 &&
    manifest.counts.r1EvidenceEntries === 6 &&
    manifest.counts.capturePlanEntries === 4 &&
    manifest.counts.positiveEvidenceEntries === 5 &&
    manifest.counts.multitouchPlanBatchEntries === 6 &&
    manifest.counts.nativeMultitouchBatchEntries === 9 &&
    manifest.counts.skillEvidenceEntries === 5 &&
    manifest.counts.retryLifecyclePlanEntries === 5 &&
    manifest.counts.retryLifecycleEvidenceEntries === 5 &&
    manifest.counts.fixedEventOracleEntries === 6 &&
    manifest.counts.initializationProfilePlanEntries === 3 &&
    manifest.counts.initializationProfileEvidenceEntries === 4 &&
    manifest.counts.fixedEventConfirmedCases === 4 &&
    manifest.counts.fixedEventPartialCases === 24 &&
    manifest.counts.fixedEventBlockedCases === 8 &&
    manifest.counts.fixedEventUnknownFields === 126 &&
    manifest.counts.fixedEventBlockingFindings === 82 &&
    manifest.counts.deckAggregatePlanEntries === 3 &&
    manifest.counts.deckAggregateEvidenceEntries === 4 &&
    manifest.counts.masterMusicPlanEntries === 12 &&
    manifest.counts.masterMusicEvidenceEntries === 4 &&
    manifest.counts.ordinaryAutoPlanEntries === 12 &&
    manifest.counts.ordinaryAutoEvidenceEntries === 8 &&
    manifest.counts.deckSwitchPlanEntries === 6 &&
    manifest.counts.rehearsalPlanEntries === 6 &&
    manifest.counts.rehearsalEvidenceEntries === 4 &&
    manifest.counts.skillPlayingPausePlanEntries === 3 &&
    manifest.counts.skillPlayingPauseEvidenceEntries === 4 &&
    manifest.counts.chartCountOracleEntries === 7 &&
    manifest.counts.ordinaryMaxNoteCount === 979 &&
    manifest.counts.habahiroMaxNoteCount === 731 &&
    manifest.counts.productionBms === 2 &&
    manifest.counts.cacheRecords === 2 &&
    manifest.counts.captureTargets === 50 &&
    manifest.counts.r1Traces === 11 &&
    manifest.counts.fixedEventCases === 36,
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
      "ordinary-production-bms,habahiro-production-bms,connected-device-cache-provenance,observation-only-capture-targets,no-input-life-game-over-r1,positive-perfect-score-r1,active-skill-lifecycle-r1,skill-same-frame-freeze-r1,once-heal-r1,post-game-over-manager-gate-r1,retry-reset-r1,production-chart-count-oracle,ordinary-initialization-profile-r1,ordinary-deck-aggregate-r1,master-music-786-profile-r1,ordinary-auto-one-note-max-r1,ordinary-auto-six-skill-lifecycles-r1,ordinary-overheal-r1,ordinary-auto-anonymous-skill-effect-profile-r1,practice-pause-return-time-r1,ordinary-auto-skill-playing-pause-r1" &&
    runtimeInputGate.partialFindings.join(",") === "D18,D19,D20,D22,D23" &&
    runtimeInputGate.blockingFindings.join(",") ===
      "D18-remaining,D19-remaining,D20-remaining,D21,D22-remaining,D23-master-start-data,D24" &&
    runtimeInputGate.r1TraceCount === 11 &&
    runtimeInputGate.pendingPlans.length === 0 &&
    runtimeInputGate.abortedPlans.join(",") === "multitouch-seven-lane-positive-skill-window" &&
    runtimeInputGate.executedPlans.join(",") ===
      "positive-retry-all-lanes-early-score-skill-v2,multitouch-seven-lane-native-positive-skill-window-v2,multitouch-seven-lane-post-gameover-retry-lifecycle-v3,production-initialization-profile-retry-r1,production-deck-aggregate-profile-retry-r1,master-music-786-natural-ui-list-r1,ordinary-auto-skill-one-note-r1,ordinary-auto-skill-one-note-retry2-r1,ordinary-auto-skill-one-note-retry3-r1,ordinary-auto-skill-one-note-retry4-r1,ordinary-auto-skill-effect-profile-r1,band-deck-switch-anonymous-skill-profile-r1,band-deck-switch-anonymous-skill-profile-retry2-r1,band-deck-switch-anonymous-skill-profile-retry3-r1,ordinary-rehearsal-pause-return-time-r1,ordinary-rehearsal-pause-return-time-retry2-r1,ordinary-auto-skill-playing-pause-r1" &&
    runtimeInputGate.supersededPlans.join(",") === "positive-retry-all-lanes-score-skill" &&
    runtimeInputGate.fixedEventOracle.status === "partial-business-gate-open" &&
    runtimeInputGate.fixedEventOracle.totalCases === 36 &&
    runtimeInputGate.fixedEventOracle.confirmedCases.join(",") === "BS01,BS05,BS06,BS11" &&
    runtimeInputGate.fixedEventOracle.partialCases === 24 &&
    runtimeInputGate.fixedEventOracle.blockedCases === 8 &&
    runtimeInputGate.fixedEventOracle.unknownFields === 126 &&
    runtimeInputGate.fixedEventOracle.blockingFindings === 82 &&
    runtimeInputGate.productionAuthorization === false,
  "Runtime input gate was incorrectly closed",
);

git(["cat-file", "-e", `${manifest.source.staticEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.runtimeInputCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.runtimeEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.capturePlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.capturePlanV2Commit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.positiveEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.multitouchPlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.nativeMultitouchPlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.skillEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.retryLifecyclePlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.retryLifecycleEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.fixedEventOracleCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.chartCountOracleCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.initializationProfilePlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.initializationProfileEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.deckAggregatePlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.deckAggregateEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.masterMusicPlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.masterMusicEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.ordinaryAutoPlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.ordinaryAutoRetry2Commit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.ordinaryAutoRetry3Commit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.ordinaryAutoRetry4Commit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.ordinaryAutoEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.ordinaryAutoSkillEffectPlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.ordinaryAutoSkillEffectEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.deckSwitchPlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.deckSwitchRetry2Commit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.deckSwitchRetry3Commit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.rehearsalPlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.rehearsalRetry2Commit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.rehearsalEvidenceCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.skillPlayingPausePlanCommit}^{commit}`], sourceRoot);
git(["cat-file", "-e", `${manifest.source.skillPlayingPauseEvidenceCommit}^{commit}`], sourceRoot);
const evidenceCommits = [
  manifest.source.staticEvidenceCommit,
  manifest.source.runtimeInputCommit,
  manifest.source.runtimeEvidenceCommit,
  manifest.source.capturePlanCommit,
  manifest.source.capturePlanV2Commit,
  manifest.source.positiveEvidenceCommit,
  manifest.source.multitouchPlanCommit,
  manifest.source.nativeMultitouchPlanCommit,
  manifest.source.skillEvidenceCommit,
  manifest.source.retryLifecyclePlanCommit,
  manifest.source.retryLifecycleEvidenceCommit,
  manifest.source.fixedEventOracleCommit,
  manifest.source.chartCountOracleCommit,
  manifest.source.initializationProfilePlanCommit,
  manifest.source.initializationProfileEvidenceCommit,
  manifest.source.deckAggregatePlanCommit,
  manifest.source.deckAggregateEvidenceCommit,
  manifest.source.masterMusicPlanCommit,
  manifest.source.masterMusicEvidenceCommit,
  manifest.source.ordinaryAutoPlanCommit,
  manifest.source.ordinaryAutoRetry2Commit,
  manifest.source.ordinaryAutoRetry3Commit,
  manifest.source.ordinaryAutoRetry4Commit,
  manifest.source.ordinaryAutoEvidenceCommit,
  manifest.source.ordinaryAutoSkillEffectPlanCommit,
  manifest.source.ordinaryAutoSkillEffectEvidenceCommit,
  manifest.source.deckSwitchPlanCommit,
  manifest.source.deckSwitchRetry2Commit,
  manifest.source.deckSwitchRetry3Commit,
  manifest.source.rehearsalPlanCommit,
  manifest.source.rehearsalRetry2Commit,
  manifest.source.rehearsalEvidenceCommit,
  manifest.source.skillPlayingPausePlanCommit,
  manifest.source.skillPlayingPauseEvidenceCommit,
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
    runtimeStatus.runtime.r1_trace_count === 11 &&
    runtimeStatus.runtime.pending_capture_plans.length === 19 &&
    runtimeStatus.runtime.pending_capture_plans[0].scenario_id ===
      "positive-retry-all-lanes-score-skill" &&
    runtimeStatus.runtime.pending_capture_plans[0].status ===
      "superseded-control-plan-no-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[1].scenario_id ===
      "positive-retry-all-lanes-early-score-skill-v2" &&
    runtimeStatus.runtime.pending_capture_plans[1].status ===
      "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[2].scenario_id ===
      "multitouch-seven-lane-positive-skill-window" &&
    runtimeStatus.runtime.pending_capture_plans[2].status ===
      "aborted-time-bound-no-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[3].scenario_id ===
      "multitouch-seven-lane-native-positive-skill-window-v2" &&
    runtimeStatus.runtime.pending_capture_plans[3].status ===
      "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[3].observed_scope.join(",") ===
      "D18-active-skill,D20-skill-start-end-freeze,D14-once-heal" &&
    runtimeStatus.runtime.pending_capture_plans[4].scenario_id ===
      "multitouch-seven-lane-post-gameover-retry-lifecycle-v3" &&
    runtimeStatus.runtime.pending_capture_plans[4].status ===
      "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[4].observed_scope.join(",") ===
      "D22-post-Game-Over-manager-gate,D22-Retry-reset" &&
    runtimeStatus.runtime.pending_capture_plans[5].scenario_id ===
      "production-initialization-profile-retry-r1" &&
    runtimeStatus.runtime.pending_capture_plans[5].status ===
      "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[5].observed_scope.join(",") ===
      "D03-ordinary-max-note,D06-ordinary-base-score,D18-initialization-identity,D23-ordinary-start-data-partial" &&
    runtimeStatus.runtime.pending_capture_plans[6].scenario_id === "production-deck-aggregate-profile-retry-r1" &&
    runtimeStatus.runtime.pending_capture_plans[7].scenario_id === "master-music-786-natural-ui-list-r1" &&
    runtimeStatus.runtime.pending_capture_plans[11].scenario_id === "ordinary-auto-skill-one-note-retry4-r1" &&
    runtimeStatus.runtime.pending_capture_plans[11].status === "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[12].scenario_id === "ordinary-auto-skill-effect-profile-r1" &&
    runtimeStatus.runtime.pending_capture_plans[12].status === "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[15].scenario_id === "band-deck-switch-anonymous-skill-profile-retry3-r1" &&
    runtimeStatus.runtime.pending_capture_plans[15].status === "executed-no-initialize-events-no-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[16].scenario_id === "ordinary-rehearsal-pause-return-time-r1" &&
    runtimeStatus.runtime.pending_capture_plans[16].status === "executed-pause-observed-return-time-missing-no-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[17].scenario_id === "ordinary-rehearsal-pause-return-time-retry2-r1" &&
    runtimeStatus.runtime.pending_capture_plans[17].status === "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.pending_capture_plans[18].scenario_id === "ordinary-auto-skill-playing-pause-r1" &&
    runtimeStatus.runtime.pending_capture_plans[18].status === "executed-confirmed-trace-promoted" &&
    runtimeStatus.runtime.capture_fields_not_consumed.length === 5 &&
    runtimeStatus.gates.D18 === "partial-required-before-code" &&
    runtimeStatus.gates.D19 === "partial-required-before-code" &&
    runtimeStatus.gates.D20 === "partial-required-before-code" &&
    runtimeStatus.gates.D21 === "partial-required-before-code" &&
    runtimeStatus.gates.D22 === "partial-required-before-code" &&
    runtimeStatus.gates.D23 === "partial-required-before-code" &&
    runtimeStatus.closed.r1_no_input_life_game_over.events === 1863 &&
    runtimeStatus.closed.r1_no_input_life_game_over.one_frame_setup === 11 &&
    runtimeStatus.closed.r1_no_input_life_game_over.reflect === 210 &&
    runtimeStatus.closed.r1_no_input_life_game_over.final_life === 0 &&
    runtimeStatus.closed.r1_no_input_life_game_over.single_game_over.join(",") === "0,1" &&
    runtimeStatus.closed.r1_positive_judgement_score.events === 2166 &&
    runtimeStatus.closed.r1_positive_judgement_score.perfect === 1 &&
    runtimeStatus.closed.r1_positive_judgement_score.miss === 10 &&
    runtimeStatus.closed.r1_positive_judgement_score.add_score_float_bits === "0x44AF8052" &&
    runtimeStatus.closed.r1_positive_judgement_score.reflected_score === 1404 &&
    runtimeStatus.closed.r1_positive_judgement_score.max_combo === 1 &&
    runtimeStatus.closed.r1_positive_judgement_score.active_skill_observed === false &&
    runtimeStatus.closed.r1_active_skill_lifecycle.events === 7122 &&
    runtimeStatus.closed.r1_active_skill_lifecycle.one_frame_setup === 53 &&
    runtimeStatus.closed.r1_active_skill_lifecycle.skill_states.join(",") === "0,1,2,3,0" &&
    runtimeStatus.closed.r1_active_skill_lifecycle.skill_timer_bits === "0x40A00000" &&
    runtimeStatus.closed.r1_active_skill_lifecycle.finishing_timer_bits === "0x3F400000" &&
    runtimeStatus.closed.r1_active_skill_lifecycle.once_heal.before === 800 &&
    runtimeStatus.closed.r1_active_skill_lifecycle.once_heal.add === 300 &&
    runtimeStatus.closed.r1_active_skill_lifecycle.once_heal.after === 1100 &&
    runtimeStatus.closed.r1_active_skill_lifecycle.active_skill_rate_bits === "0x3F99999A" &&
    runtimeStatus.closed.r1_active_skill_lifecycle.active_skill_entries === 18 &&
    runtimeStatus.closed.r1_active_skill_lifecycle.same_frame_pre_begin_entries.join(",") === "13,14" &&
    runtimeStatus.closed.r1_active_skill_lifecycle.same_frame_pre_begin_rate_bits === "0x3F800000" &&
    runtimeStatus.closed.r1_active_skill_lifecycle.final_score === 38358 &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.events === 6375 &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.post_gameover_observation_ms === 11875 &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.hooked_business_events_during_observation === 0 &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.record_identity === "stable" &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.game_over.join(",") === "0,1" &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.retry_reset_game_over.join(",") === "1,0" &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.retry_reset_score.join(",") === "44403,0" &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.retry_reset_life.join(",") === "0,1000" &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.retry_reset_max_combo.join(",") === "6,0" &&
    runtimeStatus.closed.r1_post_gameover_retry_reset.retry_reset_max_note_count === 540 &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.events === 11 &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.asset === "poppin_shuffle_special" &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.difficulty === "special" &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.score_level === 27 &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.max_note_count === 979 &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.total_parameter_bits === "0x483C8A31" &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.score_level_rate_bits === "0x3F9C28F6" &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.event_parameter_bits === "0x00000000" &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.base_score_bits === "0x4434718E" &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.bonus_base_score_bits === "0x00000000" &&
    runtimeStatus.closed.r1_ordinary_initialization_profile.account_fields_included === false &&
    runtimeStatus.closed.r1_ordinary_deck_aggregate_profile.events === 31 &&
    runtimeStatus.closed.r1_ordinary_deck_aggregate_profile.member_count === 5 &&
    runtimeStatus.closed.r1_ordinary_deck_aggregate_profile.total_parameter_bits === "0x483C8A31" &&
    runtimeStatus.closed.r1_ordinary_deck_aggregate_profile.member_rows_omitted === true &&
    runtimeStatus.closed.r1_master_music_786_profile.events === 7 &&
    runtimeStatus.closed.r1_master_music_786_profile.music_id === 786 &&
    runtimeStatus.closed.r1_master_music_786_profile.resolved_free_live_score_level === 26 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_one_note.events === 5501 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_one_note.one_note_calls === 979 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_one_note.skill_lifecycles === 6 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_one_note.anonymous_skill_count === 5 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_one_note.overheal_life_values.join(",") === "1000,1200,1500" &&
    runtimeStatus.closed.r1_ordinary_auto_skill_one_note.member_identity_included === false &&
    runtimeStatus.closed.r1_ordinary_auto_skill_effect_profile.events === 5497 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_effect_profile.skill_lifecycles === 6 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_effect_profile.anonymous_skill_count === 5 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_effect_profile.active_effect_rows === 7 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_effect_profile.once_heal_rows.join(",") === "400,300,200" &&
    runtimeStatus.closed.r1_ordinary_auto_skill_effect_profile.skill_master_ids_included === false &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.events === 6826 &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.exec_updates === 1223 &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.initial_paused_quiet_ms === 5016 &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.second_paused_settled_quiet_ms === 4878 &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.practice_mode === 10 &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.life_zero_game_over_one_continued_updates === 1216 &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.return_time_back_second === 5 &&
    runtimeStatus.closed.r1_rehearsal_pause_return_time.member_identity_included === false &&
    runtimeStatus.closed.r1_ordinary_auto_skill_playing_pause.events === 13248 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_playing_pause.settled_pause_quiet_ms === 4878 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_playing_pause.wall_gap_ms === 8048 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_playing_pause.game_frame_delta === 1 &&
    runtimeStatus.closed.r1_ordinary_auto_skill_playing_pause.member_identity_included === false &&
    runtimeStatus.runtime.r1_trace_count === 11 &&
    runtimeStatus.runtime.fixed_event_oracle.cases === 36 &&
    runtimeStatus.runtime.fixed_event_oracle.confirmed_cases.join(",") === "BS01,BS05,BS06,BS11" &&
    runtimeStatus.runtime.fixed_event_oracle.partial_cases.length === 24 &&
    runtimeStatus.runtime.fixed_event_oracle.partial_cases.includes("BS02") &&
    runtimeStatus.runtime.fixed_event_oracle.blocked_cases.length === 8 &&
    !runtimeStatus.runtime.fixed_event_oracle.blocked_cases.includes("BS02") &&
    !runtimeStatus.runtime.fixed_event_oracle.blocked_cases.includes("BS14") &&
    runtimeStatus.runtime.fixed_event_oracle.unknown_fields === 126 &&
    runtimeStatus.runtime.fixed_event_oracle.blocking_findings === 82 &&
    runtimeStatus.runtime.fixed_event_oracle.status === "partial-business-gate-open" &&
    runtimeStatus.business_state_gate === "open" &&
    runtimeStatus.production_authorization === false &&
    runtimeStatus.blocking_findings.length > 0,
  "Frozen runtime input status overclaims closure",
);

const positivePlan = json("runtime/positive-retry-all-lanes-r1-plan.json");
const positiveActions = positivePlan.actions;
const laneX = [380, 520, 660, 800, 940, 1080, 1220];
check(
  positivePlan.schema_version === 1 &&
    positivePlan.scenario_id === "positive-retry-all-lanes-score-skill" &&
    positivePlan.control_provenance.source_commit ===
      "72aa279fb07041b04ca649df918fa35ab0490d91" &&
    positivePlan.control_provenance.source_path ===
      "artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/hard-touch-plan.json" &&
    positivePlan.control_provenance.source_sha256 ===
      "E5B48E6D9D46CDD600CB0A8B024D9B10CFF437D0555526AE8E93D9EB0F74EADD" &&
    positiveActions.length === 220 &&
    positivePlan.tail_seconds === 5 &&
    positiveActions[0].kind === "tap" &&
    positiveActions[0].x === 800 &&
    positiveActions[0].y === 440 &&
    positiveActions[1].kind === "tap" &&
    positiveActions[1].x === 920 &&
    positiveActions[1].y === 440 &&
    positiveActions[1].delay_ms === 750 &&
    positiveActions[2].kind === "wait" &&
    positiveActions[2].delay_ms === 7000 &&
    positiveActions.slice(3, 213).every(
      (action, index) =>
        action.kind === "tap" &&
        action.x === laneX[index % 7] &&
        action.y === 650 &&
        action.delay_ms === (index % 7 === 0 ? 120 : 0),
    ) &&
    positiveActions.slice(213).every(
      (action, index) =>
        action.kind === "swipe" &&
        action.x1 === laneX[index] &&
        action.x2 === laneX[index] &&
        action.y1 === 650 &&
        action.y2 === 650 &&
        action.duration_ms === 450,
    ),
  "Frozen positive-input plan or committed control provenance changed",
);

const positiveEarlyPlan = json("runtime/positive-retry-all-lanes-early-r1-plan.json");
const expectedEarlyActions = structuredClone(positiveActions);
expectedEarlyActions[2].delay_ms = 500;
expectedEarlyActions[2].marker = "positive-v2-early-gameplay-window";
check(
  positiveEarlyPlan.schema_version === 1 &&
    positiveEarlyPlan.scenario_id === "positive-retry-all-lanes-early-score-skill-v2" &&
    positiveEarlyPlan.control_provenance.source_commit ===
      "e65f3411d1a91cfa5ecf0d7b29e99605b04e8a41" &&
    positiveEarlyPlan.control_provenance.source_path ===
      "artifacts/investigations/score-life-state-runtime-contract-10-1-4/runtime/positive-retry-all-lanes-r1-plan.json" &&
    positiveEarlyPlan.control_provenance.source_sha256 ===
      "2EBB8033430D2A343EAB163DDDB176D5F182634C59EC5EF21AEBBE908D68C228" &&
    JSON.stringify(positiveEarlyPlan.actions) === JSON.stringify(expectedEarlyActions) &&
    positiveEarlyPlan.tail_seconds === 5,
  "Frozen early positive-input plan differs beyond the committed wait adjustment",
);

const multitouchCaptureSource = readFileSync(
  resolve(investigation, "capture_score_life_state_multitouch_runtime.py"),
  "utf8",
);
function targetLiteral(source) {
  const start = source.indexOf("TARGETS = {");
  const end = source.indexOf("\n}\n\n\ndef adb", start);
  check(start >= 0 && end > start, "Capture TARGETS literal missing");
  return source.slice(start, end + 2);
}
const shellMultitouchPlan = json("runtime/multitouch-seven-lane-skill-r1-plan.json");
const nativeMultitouchPlan = json("runtime/multitouch-seven-lane-native-skill-r1-plan.json");
const controlSourceBytes = readFileSync(
  resolve(investigation, "runtime-control/multitouch_seven_lane_control.c"),
);
const controlSource = controlSourceBytes.toString("utf8");
const controlBinary = readFileSync(
  resolve(investigation, "runtime-control/multitouch_seven_lane_control.arm64"),
);
const controlBuild = json("runtime-control/multitouch_seven_lane_control.build.json");
check(
  targetLiteral(multitouchCaptureSource) === targetLiteral(captureSource) &&
    multitouchCaptureSource.includes(
      'CONTROL_BINARY_SHA256 = "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249"',
    ) &&
    multitouchCaptureSource.includes('if kind == "multitap_native":') &&
    multitouchCaptureSource.includes('adb("push", str(CONTROL_BINARY), CONTROL_REMOTE_PATH') &&
    multitouchCaptureSource.includes('adb("shell", "su", "-c", "setenforce 0"') &&
    multitouchCaptureSource.includes("finally:") &&
    multitouchCaptureSource.includes('adb("shell", "su", "-c", "setenforce 1"') &&
    multitouchCaptureSource.includes(
      'adb("shell", "su", "-c", f"rm -f {CONTROL_REMOTE_PATH}"',
    ) &&
    !multitouchCaptureSource.includes("Interceptor.replace") &&
    !multitouchCaptureSource.includes("retval.replace") &&
    !multitouchCaptureSource.includes("Memory.patchCode") &&
    shellMultitouchPlan.scenario_id === "multitouch-seven-lane-positive-skill-window" &&
    shellMultitouchPlan.actions[3].kind === "multitap_burst" &&
    sha256(readFileSync(resolve(investigation, "runtime/multitouch-seven-lane-skill-r1-plan.json"))) ===
      "AC9D59776EBE4913E27993DE6FBC5964BD91B7200EC0F7F5379DC5EF4E6A4D5E" &&
    controlSourceBytes.length === 2937 &&
    sha256(controlSourceBytes) ===
      "4845E1F487782E9A167AC03D8F1B133AC557643B39EF08BC5A1E7620117FBC60" &&
    controlSource.includes('kEventDevice = "/dev/input/event2"') &&
    controlSource.includes("kRawY[7] = {380, 520, 660, 800, 940, 1080, 1220}") &&
    controlSource.includes("kRepeat = 250") &&
    controlSource.includes("kTouchNanoseconds = 20000000L") &&
    controlSource.includes("kReleaseNanoseconds = 60000000L") &&
    !controlSource.includes("ptrace") &&
    !controlSource.includes("process_vm_writev") &&
    controlBinary.length === 6304 &&
    sha256(controlBinary) ===
      "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249" &&
    controlBinary.subarray(0, 6).toString("hex") === "7f454c460201" &&
    controlBinary.readUInt16LE(18) === 183 &&
    controlBuild.status === "confirmed-capture-control-not-runtime-evidence" &&
    controlBuild.ndk_revision === "27.2.12479018" &&
    controlBuild.target === "aarch64-unknown-linux-android24" &&
    controlBuild.capability.target_process_memory_writes === false &&
    controlBuild.capability.input_device_writes_only === true &&
    nativeMultitouchPlan.schema_version === 1 &&
    nativeMultitouchPlan.scenario_id ===
      "multitouch-seven-lane-native-positive-skill-window-v2" &&
    nativeMultitouchPlan.control_provenance.source_commit ===
      "eb7aba5467569b577cd942957dd65bdce600bc9d" &&
    nativeMultitouchPlan.control_provenance.source_plan_sha256 ===
      "AC9D59776EBE4913E27993DE6FBC5964BD91B7200EC0F7F5379DC5EF4E6A4D5E" &&
    nativeMultitouchPlan.control_provenance.control_binary_sha256 ===
      "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249" &&
    nativeMultitouchPlan.actions.length === 4 &&
    nativeMultitouchPlan.actions[3].kind === "multitap_native" &&
    nativeMultitouchPlan.actions[3].screen_xs.join(",") ===
      "380,520,660,800,940,1080,1220" &&
    nativeMultitouchPlan.actions[3].repeat === 250 &&
    nativeMultitouchPlan.actions[3].interval_ms === 80 &&
    nativeMultitouchPlan.actions[3].touch_ms === 20 &&
    nativeMultitouchPlan.tail_seconds === 5,
  "Frozen native Linux MT capture, ELF/build provenance, safety boundary, or plan changed",
);

const retryLifecyclePlan = json(
  "runtime/multitouch-seven-lane-post-gameover-retry-r1-plan.json",
);
const retryActions = retryLifecyclePlan.actions;
check(
  retryLifecyclePlan.schema_version === 1 &&
    retryLifecyclePlan.scenario_id ===
      "multitouch-seven-lane-post-gameover-retry-lifecycle-v3" &&
    retryLifecyclePlan.control_provenance.source_commit ===
      "4ac4ea186efade9091c6f4377ab7ad7dc852a2c5" &&
    retryLifecyclePlan.control_provenance.source_plan_sha256 ===
      "0A345C27D75B83047CD2FE4771B1426DD6772155DD1F9D495A06FC9722B114D4" &&
    retryLifecyclePlan.control_provenance.control_binary_sha256 ===
      "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249" &&
    retryLifecyclePlan.safety.retry_only === true &&
    retryLifecyclePlan.safety.continue_allowed === false &&
    retryLifecyclePlan.safety.premium_currency_actions.length === 0 &&
    retryLifecyclePlan.safety.target_process_memory_writes === false &&
    retryLifecyclePlan.safety.return_replacement === false &&
    retryLifecyclePlan.safety.apk_modification === false &&
    retryLifecyclePlan.safety.selinux_restore_required === true &&
    retryActions.length === 8 &&
    JSON.stringify(retryActions.slice(0, 4)) ===
      JSON.stringify(nativeMultitouchPlan.actions) &&
    JSON.stringify(retryActions[4]) ===
      JSON.stringify({
        kind: "wait",
        delay_ms: 12000,
        marker: "post-game-over-observation-window",
      }) &&
    JSON.stringify(retryActions[5]) ===
      JSON.stringify({
        kind: "tap",
        x: 800,
        y: 440,
        marker: "post-game-over-open-retry-confirmation",
      }) &&
    JSON.stringify(retryActions[6]) ===
      JSON.stringify({
        kind: "tap",
        x: 920,
        y: 440,
        delay_ms: 750,
        marker: "post-game-over-confirm-retry",
      }) &&
    JSON.stringify(retryActions[7]) ===
      JSON.stringify({
        kind: "wait",
        delay_ms: 1500,
        marker: "post-retry-reset-observation",
      }) &&
    retryLifecyclePlan.tail_seconds === 5 &&
    retryActions.every((action) => ["wait", "tap", "multitap_native"].includes(action.kind)),
  "Frozen post-Game-Over Retry-only lifecycle plan or safety boundary changed",
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

const positiveTraceBytes = gunzipSync(
  readFileSync(resolve(investigation, "runtime/positive-retry-all-lanes-early.trace.json.gz")),
);
const positiveTrace = JSON.parse(positiveTraceBytes.toString("utf8"));
const positiveEventsOf = (kind) =>
  positiveTrace.events.filter((event) => event.kind === kind);
const positiveSetups = positiveEventsOf("OneFrameData.Setup.leave").map(
  (event) => event.frame,
);
const positiveEntries = positiveSetups.filter((frame) => frame.result !== 0);
const positiveScoreAdds = positiveEventsOf("InGameRecord.AddScore.enter").filter(
  (event) => event.arg1 !== 0,
);
const positiveGameOverEnter = positiveEventsOf("InGameRecord.updateGameOverState.enter");
const positiveGameOverLeave = positiveEventsOf("InGameRecord.updateGameOverState.leave");
const positiveSkillUpdates = positiveEventsOf("SituationSkillManager.ExecUpdate.enter");
check(
  positiveTrace.schema_version === 1 &&
    positiveTrace.status === "confirmed-r1-observation-only" &&
    positiveTrace.capture_error === null &&
    positiveTrace.events.length === 2166 &&
    positiveTrace.events.every((event, index) => event.sequence === index) &&
    positiveTrace.capability.level === "R1" &&
    positiveTrace.capability.return_replacement === false &&
    positiveTrace.capability.memory_writes === false &&
    positiveTrace.capability.apk_modification === false &&
    positiveTrace.capability.transport.kind === "explicit-remote" &&
    positiveTrace.capture_script_sha256 ===
      sha256(readFileSync(resolve(investigation, "capture_score_life_state_runtime.py"))) &&
    positiveTrace.plan_sha256 ===
      sha256(readFileSync(resolve(investigation, "runtime/positive-retry-all-lanes-early-r1-plan.json"))) &&
    positiveTrace.summary.queued === 0 &&
    positiveSetups.length === 11 &&
    positiveEntries.length === 1 &&
    positiveEntries[0].index === 6 &&
    positiveEntries[0].add_score.bits === "0x44AF8052" &&
    positiveEntries[0].add_power === 0 &&
    positiveEntries[0].add_combo === 1 &&
    positiveEntries[0].note_type === 0 &&
    positiveEntries[0].result === 4 &&
    positiveEntries[0].adjusted_result === 4 &&
    positiveEntries[0].fever_rate.bits === "0x3F800000" &&
    positiveEntries[0].skill_rate.bits === "0x3F800000" &&
    positiveEntries[0].score_up_rate.bits === "0x3F800000" &&
    positiveSetups.filter((frame) => frame.result === 0).length === 10 &&
    positiveScoreAdds.length === 1 &&
    positiveScoreAdds[0].arg1 === 1404 &&
    positiveGameOverEnter.length === 1 &&
    positiveGameOverEnter[0].before.score === 1404 &&
    positiveGameOverEnter[0].before.current_life === 0 &&
    positiveGameOverEnter[0].before.max_combo === 1 &&
    positiveGameOverEnter[0].before.perfect_count === 1 &&
    positiveGameOverEnter[0].before.miss_count === 10 &&
    positiveGameOverEnter[0].before.is_single_game_over === 0 &&
    positiveGameOverLeave.length === 1 &&
    positiveGameOverLeave[0].after.is_single_game_over === 1 &&
    positiveSkillUpdates.length === 220 &&
    positiveSkillUpdates.every(
      (event) =>
        event.skill.state === 0 &&
        event.skill.current === null &&
        event.skill.playlist.size === 0,
    ) &&
    positiveEventsOf("SituationSkillManager.AddSituationSkillToPlayList.enter").length === 0 &&
    positiveEventsOf("SituationSkillManager.executeBeginSkillProcess.enter").length === 0,
  "Frozen positive R1 Perfect/Score/Life trajectory changed or overclaims active Skill",
);
const skillTraceBytes = gunzipSync(
  readFileSync(resolve(investigation, "runtime/multitouch-seven-lane-native-skill.trace.json.gz")),
);
const skillTrace = JSON.parse(skillTraceBytes.toString("utf8"));
const skillEventsOf = (kind) => skillTrace.events.filter((event) => event.kind === kind);
const skillSetups = skillEventsOf("OneFrameData.Setup.leave");
const skillSetupBySequence = new Map(skillSetups.map((event) => [event.sequence, event.frame]));
const activeRateEntries = skillSetups.filter(
  (event) => event.frame.skill_rate.bits === "0x3F99999A",
);
const skillAddEnter = skillEventsOf("SituationSkillManager.AddSituationSkillToPlayList.enter");
const skillAddLeave = skillEventsOf("SituationSkillManager.AddSituationSkillToPlayList.leave");
const skillBeginEnter = skillEventsOf("SituationSkillManager.executeBeginSkillProcess.enter");
const skillBeginLeave = skillEventsOf("SituationSkillManager.executeBeginSkillProcess.leave");
const skillFinishedEnter = skillEventsOf("SituationSkillManager.processOfSkillFinished.enter");
const skillFinishedLeave = skillEventsOf("SituationSkillManager.processOfSkillFinished.leave");
const skillFinishingEnter = skillEventsOf(
  "SituationSkillManager.executeFinishingSkillProcess.enter",
);
const skillFinishingLeave = skillEventsOf(
  "SituationSkillManager.executeFinishingSkillProcess.leave",
);
const healEnter = skillEventsOf("InGameRecord.AddIPower.enter").find(
  (event) => event.arg1 === 300,
);
const healLeave = skillEventsOf("InGameRecord.AddIPower.leave").find(
  (event) => event.arg1 === 300,
);
const frozenReflect = skillTrace.events[2210];
const frozenReflectFrames = frozenReflect.controller.slots.values.filter(
  (frame) => frame.is_using,
);
const skillGameOver = skillEventsOf("InGameRecord.updateGameOverState.leave");
check(
  skillTrace.schema_version === 1 &&
    skillTrace.status === "confirmed-r1-observation-only" &&
    skillTrace.capture_error === null &&
    skillTrace.scenario.scenario_id ===
      "multitouch-seven-lane-native-positive-skill-window-v2" &&
    skillTrace.events.length === 7122 &&
    skillTrace.events.every((event, index) => event.sequence === index) &&
    skillTrace.capability.level === "R1" &&
    skillTrace.capability.return_replacement === false &&
    skillTrace.capability.memory_writes === false &&
    skillTrace.capability.apk_modification === false &&
    skillTrace.capability.temporary_selinux_permissive === true &&
    skillTrace.capability.selinux_restore_required === true &&
    skillTrace.sample.package === "jp.co.craftegg.band" &&
    skillTrace.sample.version_name === "10.1.4" &&
    skillTrace.sample.version_code === 230 &&
    skillTrace.sample.abi === "arm64-v8a" &&
    skillTrace.capture_script_sha256 === sha256(readFileSync(
      resolve(investigation, "capture_score_life_state_multitouch_runtime.py"),
    )) &&
    skillTrace.plan_sha256 === sha256(readFileSync(
      resolve(investigation, "runtime/multitouch-seven-lane-native-skill-r1-plan.json"),
    )) &&
    skillTrace.summary.queued === 0 &&
    skillSetups.length === 53 &&
    skillAddEnter.length === 1 &&
    skillAddEnter[0].sequence === 2186 &&
    skillAddEnter[0].skill.state === 0 &&
    skillAddEnter[0].skill.playlist.size === 0 &&
    skillAddLeave.length === 1 &&
    skillAddLeave[0].sequence === 2187 &&
    skillAddLeave[0].skill.state === 1 &&
    skillAddLeave[0].skill.playlist.size === 1 &&
    skillBeginEnter.length === 1 &&
    skillBeginEnter[0].sequence === 2201 &&
    skillBeginEnter[0].skill.state === 1 &&
    skillBeginEnter[0].skill.current === null &&
    skillBeginLeave.length === 1 &&
    skillBeginLeave[0].sequence === 2208 &&
    skillBeginLeave[0].skill.state === 2 &&
    skillBeginLeave[0].skill.skill_timer.bits === "0x40A00000" &&
    skillBeginLeave[0].skill.current.chara_index === 4 &&
    skillBeginLeave[0].skill.current.skill_note_index === 1 &&
    skillBeginLeave[0].skill.current.absolute_pos === 384 &&
    skillSetupBySequence.get(2189).skill_rate.bits === "0x3F800000" &&
    skillSetupBySequence.get(2189).score_up_type === 0 &&
    skillSetupBySequence.get(2199).skill_rate.bits === "0x3F800000" &&
    skillSetupBySequence.get(2199).score_up_type === 0 &&
    frozenReflect.kind === "OneFrameController.Reflect.enter" &&
    frozenReflect.controller.skill.state === 2 &&
    frozenReflectFrames.map((frame) => frame.index).join(",") === "13,14" &&
    frozenReflectFrames.every((frame) => frame.skill_rate.bits === "0x3F800000") &&
    healEnter.sequence === 2204 &&
    healEnter.before.current_life === 800 &&
    healEnter.before.displayed_or_skill_base_life === 1000 &&
    healEnter.before.business_life_upper_limit === 2000 &&
    healEnter.before.cached_life_when_skill_played === 800 &&
    healLeave.sequence === 2205 &&
    healLeave.after.current_life === 1100 &&
    healLeave.after.displayed_or_skill_base_life === 1000 &&
    healLeave.after.business_life_upper_limit === 2000 &&
    activeRateEntries.length === 18 &&
    activeRateEntries[0].sequence === 2682 &&
    activeRateEntries.at(-1).sequence === 5247 &&
    activeRateEntries.every(
      (event) =>
        event.frame.score_up_rate.bits === "0x3F99999A" &&
        event.frame.score_up_type === 1,
    ) &&
    skillFinishedEnter.length === 1 &&
    skillFinishedEnter[0].sequence === 5302 &&
    skillFinishedEnter[0].skill.state === 2 &&
    skillFinishedEnter[0].skill.skill_timer.bits === "0xBBA60800" &&
    skillFinishedLeave.length === 1 &&
    skillFinishedLeave[0].sequence === 5303 &&
    skillFinishedLeave[0].skill.current === null &&
    skillFinishedLeave[0].skill.playlist.size === 0 &&
    skillSetupBySequence.get(5341).skill_rate.bits === "0x3F800000" &&
    skillSetupBySequence.get(5341).score_up_type === 0 &&
    skillFinishingEnter.length === 44 &&
    skillFinishingEnter[0].skill.finishing_timer.bits === "0x3F400000" &&
    skillFinishingLeave.length === 44 &&
    skillFinishingLeave.at(-1).skill.state === 0 &&
    skillGameOver.length === 1 &&
    skillGameOver[0].after.score === 38358 &&
    skillGameOver[0].after.current_life === 0 &&
    skillGameOver[0].after.max_combo === 5 &&
    skillGameOver[0].after.perfect_count === 3 &&
    skillGameOver[0].after.great_count === 25 &&
    skillGameOver[0].after.good_count === 8 &&
    skillGameOver[0].after.bad_count === 7 &&
    skillGameOver[0].after.miss_count === 10 &&
    skillGameOver[0].after.cached_life_when_skill_played === 800 &&
    skillGameOver[0].after.is_single_game_over === 1,
  "Frozen active-Skill R1 lifecycle, same-frame rate freeze, heal, or final record changed",
);

const retryTraceBytes = gunzipSync(
  readFileSync(resolve(
    investigation,
    "runtime/multitouch-seven-lane-post-gameover-retry.trace.json.gz",
  )),
);
const retryTrace = JSON.parse(retryTraceBytes.toString("utf8"));
const retryEventsOf = (kind) => retryTrace.events.filter((event) => event.kind === kind);
const retryMarkers = retryEventsOf("capture.marker");
const retryInitializeEnter = retryEventsOf("InGameRecord.InitializeLife.enter");
const retryInitializeLeave = retryEventsOf("InGameRecord.InitializeLife.leave");
const retryBaseScore = retryEventsOf("ScoreUtility.InitBaseScore.enter");
const retryGameOverEnter = retryEventsOf("InGameRecord.updateGameOverState.enter");
const retryGameOverLeave = retryEventsOf("InGameRecord.updateGameOverState.leave");
const retryInitializedKeys = [
  "is_multi_game_over",
  "is_single_game_over",
  "score",
  "free_live_bonus_score",
  "reserve_total_score",
  "current_life",
  "displayed_or_skill_base_life",
  "business_life_upper_limit",
  "max_note_count",
  "max_combo",
  "current_combo",
  "current_live_combo",
  "current_live_max_combo",
  "perfect_combo",
  "perfect_count",
  "great_count",
  "good_count",
  "bad_count",
  "miss_count",
  "tap_count",
  "cached_life_when_skill_played",
  "fast_count",
  "slow_count",
];
const retryInitializedProjection = [
  0, 0, 0, 0, 0, 1000, 1000, 2000, 540, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0,
];
const projectRetryRecord = (record) => retryInitializedKeys.map((key) => record[key]);
check(
  retryTrace.schema_version === 1 &&
    retryTrace.status === "confirmed-r1-observation-only" &&
    retryTrace.capture_error === null &&
    retryTrace.scenario.scenario_id ===
      "multitouch-seven-lane-post-gameover-retry-lifecycle-v3" &&
    JSON.stringify(retryTrace.scenario.actions) === JSON.stringify(retryLifecyclePlan.actions) &&
    retryTrace.events.length === 6375 &&
    retryTrace.events.every((event, index) => event.sequence === index) &&
    retryTrace.capability.level === "R1" &&
    retryTrace.capability.return_replacement === false &&
    retryTrace.capability.memory_writes === false &&
    retryTrace.capability.apk_modification === false &&
    retryTrace.capability.temporary_selinux_permissive === true &&
    retryTrace.capability.selinux_restore_required === true &&
    retryTrace.sample.package === "jp.co.craftegg.band" &&
    retryTrace.sample.version_name === "10.1.4" &&
    retryTrace.sample.version_code === 230 &&
    retryTrace.sample.abi === "arm64-v8a" &&
    retryTrace.capture_script_sha256 === sha256(readFileSync(
      resolve(investigation, "capture_score_life_state_multitouch_runtime.py"),
    )) &&
    retryTrace.plan_sha256 === sha256(readFileSync(
      resolve(investigation, "runtime/multitouch-seven-lane-post-gameover-retry-r1-plan.json"),
    )) &&
    retryTrace.summary.queued === 0 &&
    retryTrace.summary.marker === "post-retry-reset-observation" &&
    retryEventsOf("SituationSkillManager.ExecUpdate.enter").length === 590 &&
    retryEventsOf("OneFrameController.Reflect.enter").length === 590 &&
    retryEventsOf("OneFrameData.Setup.leave").length === 47 &&
    retryMarkers.map((event) => event.sequence).join(",") ===
      "0,1,2,3,4,6368,6369,6370,6371" &&
    retryMarkers.map((event) => event.value).join(",") ===
      "multitouch-seven-lane-post-gameover-retry-lifecycle-v3,multitouch-open-retry-confirmation,multitouch-confirm-retry,multitouch-pre-burst,multitouch-native-seven-lane-burst,post-game-over-observation-window,post-game-over-open-retry-confirmation,post-game-over-confirm-retry,post-retry-reset-observation" &&
    retryInitializeEnter.map((event) => event.sequence).join(",") === "5,6372" &&
    retryInitializeLeave.map((event) => event.sequence).join(",") === "6,6373" &&
    retryBaseScore.map((event) => event.sequence).join(",") === "7,6374" &&
    retryInitializeEnter.every(
      (event) =>
        event.default_life === 1000 &&
        event.max_life === 2000 &&
        event.initial_life === 1000,
    ) &&
    retryBaseScore.every((event) => event.max_note_count === 540) &&
    retryInitializeEnter[0].self === retryInitializeEnter[1].self &&
    retryInitializeEnter[0].self === retryInitializeLeave[0].record.pointer &&
    retryInitializeEnter[0].self === retryInitializeLeave[1].record.pointer &&
    JSON.stringify(projectRetryRecord(retryInitializeLeave[0].record)) ===
      JSON.stringify(retryInitializedProjection) &&
    JSON.stringify(projectRetryRecord(retryInitializeLeave[1].record)) ===
      JSON.stringify(retryInitializedProjection) &&
    retryGameOverEnter.length === 1 &&
    retryGameOverEnter[0].sequence === 6365 &&
    retryGameOverEnter[0].before.is_single_game_over === 0 &&
    retryGameOverEnter[0].before.score === 44403 &&
    retryGameOverEnter[0].before.current_life === 0 &&
    retryGameOverEnter[0].before.max_combo === 6 &&
    retryGameOverLeave.length === 1 &&
    retryGameOverLeave[0].sequence === 6366 &&
    retryGameOverLeave[0].after.is_single_game_over === 1 &&
    retryGameOverLeave[0].after.pointer === retryInitializeLeave[1].record.pointer &&
    retryTrace.events[6367].kind === "InGameRecord.AddIPower.leave" &&
    retryTrace.events[6367].after.is_single_game_over === 1 &&
    retryMarkers[5].timestamp_ms - retryGameOverLeave[0].timestamp_ms === 11875 &&
    retryTrace.events.slice(6368, 6372).every((event) => event.kind === "capture.marker") &&
    retryInitializeLeave[1].record.is_single_game_over === 0 &&
    retryInitializeLeave[1].record.score === 0 &&
    retryInitializeLeave[1].record.current_life === 1000 &&
    retryInitializeLeave[1].record.max_combo === 0,
  "Frozen post-Game-Over gate or in-place Retry/reset R1 trajectory changed",
);

const chartCountOracle = json("score_life_state_chart_count_oracle.json");
const ordinaryChartCount = chartCountOracle.charts.ordinary;
const habahiroChartCount = chartCountOracle.charts.habahiro;
check(
  chartCountOracle.schema_version === 1 &&
    chartCountOracle.status === "confirmed-production-chart-max-note-count-10.1.4-rule" &&
    chartCountOracle.sample.package === "jp.co.craftegg.band" &&
    chartCountOracle.sample.version_name === "10.1.4" &&
    chartCountOracle.sample.version_code === 230 &&
    chartCountOracle.sample.abi === "arm64-v8a" &&
    chartCountOracle.provenance.chart_construction_commit ===
      "74ab76f6838847d98aae1a15741a5f024e3774ff" &&
    chartCountOracle.provenance.score_life_static_commit ===
      "6c902656c72f3983fb04386038dcfe38f0d53797" &&
    chartCountOracle.provenance.production_bms_commit ===
      "1ee976ea1de24cb0567762a74e2d091ae4c78464" &&
    chartCountOracle.provenance.arm64_sha256 ===
      "F2D61C63D285A4B6997183F51161FD0C4CEC848BE92D66D015432EC329F77F04" &&
    ordinaryChartCount.inputs.playable_roots === 825 &&
    ordinaryChartCount.inputs.long_roots === 29 &&
    ordinaryChartCount.inputs.slide_roots === 93 &&
    ordinaryChartCount.inputs.source_slide_nodes_including_roots === 298 &&
    ordinaryChartCount.inputs.source_hidden_slide_nodes === 80 &&
    ordinaryChartCount.derived.visible_slide_after_entries === 125 &&
    ordinaryChartCount.derived.max_note_count === 979 &&
    habahiroChartCount.inputs.playable_roots === 598 &&
    habahiroChartCount.inputs.long_roots === 58 &&
    habahiroChartCount.inputs.slide_roots === 51 &&
    habahiroChartCount.inputs.source_slide_nodes_including_roots === 141 &&
    habahiroChartCount.inputs.source_hidden_slide_nodes === 15 &&
    habahiroChartCount.derived.visible_slide_after_entries === 75 &&
    habahiroChartCount.derived.max_note_count === 731 &&
    [ordinaryChartCount, habahiroChartCount].every(
      (entry) => entry.unknown_fields.length === 0 && entry.blocking_findings.length === 0,
    ) &&
    chartCountOracle.unknown_fields.length === 0 &&
    chartCountOracle.blocking_findings.length === 0,
  "Frozen production chart count oracle changed",
);

const initializationProfilePlan = json("runtime/initialization-profile-retry-r1-plan.json");
const initializationProfileOracle = json("score_life_initialization_profile_oracle.json");
const initializationProfileTrace = JSON.parse(
  gunzipSync(readFileSync(resolve(investigation, "runtime/initialization-profile-retry.trace.json.gz"))).toString("utf8"),
);
const initializationEvents = new Map(
  initializationProfileTrace.events.map((entry) => [entry.kind, entry]),
);
check(
  initializationProfilePlan.production_chart.asset === "poppin_shuffle_special" &&
    initializationProfilePlan.production_chart.difficulty === "special" &&
    initializationProfilePlan.production_chart.score_level === 27 &&
    initializationProfilePlan.production_chart.bms_sha256 ===
      "418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC" &&
    initializationProfilePlan.safety.continue_allowed === false &&
    initializationProfilePlan.safety.premium_currency_actions.length === 0 &&
    initializationProfilePlan.privacy.account_fields_allowed === false &&
    initializationProfileTrace.status === "confirmed-r1-observation-only" &&
    initializationProfileTrace.capture_error === null &&
    initializationProfileTrace.events.length === 11 &&
    initializationProfileTrace.events.every((entry, index) => entry.sequence === index) &&
    initializationProfileTrace.privacy.account_fields_included === false &&
    initializationEvents.get("InGameCalculatedData.ctor.leave").calculated.bms_file_name ===
      "poppin_shuffle_special.bms" &&
    initializationEvents.get("InGameCalculatedData.ctor.leave").calculated.difficulty === "special" &&
    initializationEvents.get("InGameRecord.InitializeLife.leave").record.max_note_count === 979 &&
    initializationEvents.get("ScoreUtility.InitBaseScore.start_data").start_data.score_level === 27 &&
    initializationEvents.get("ScoreUtility.InitBaseScore.start_data").score_utility.total_parameter.bits ===
      "0x483C8A31" &&
    initializationEvents.get("ScoreUtility.InitBaseScore.start_data").score_utility.score_level_rate.bits ===
      "0x3F9C28F6" &&
    initializationEvents.get("ScoreUtility.InitBaseScore.leave").score_utility.base_score.bits ===
      "0x4434718E" &&
    initializationProfileOracle.status === "confirmed-r1-ordinary-initialization-profile-partial-D23" &&
    initializationProfileOracle.privacy.account_fields_included === false &&
    initializationProfileOracle.production_chart.max_note_count === 979 &&
    initializationProfileOracle.production_chart.score_level === 27 &&
    initializationProfileOracle.score_initialization.event_parameter.bits === "0x00000000" &&
    initializationProfileOracle.score_initialization.bonus_base_score.bits === "0x00000000" &&
    initializationProfileOracle.unknown_fields.join(",") ===
      "deck.member_rows,deck.member_parameter_accumulation,HABAHIRO.initialization_profile,event.master_parameter" &&
    initializationProfileOracle.business_state_gate === "open" &&
    initializationProfileOracle.production_authorization === false,
  "Frozen ordinary initialization profile R1 or privacy boundary changed",
);

const deckAggregateOracle = json("score_life_deck_aggregate_profile_oracle.json");
const masterMusicOracle = json("score_life_master_music_786_profile_oracle.json");
const ordinaryAutoOracle = json("score_life_ordinary_auto_skill_one_note_oracle.json");
const ordinaryAutoPlan = json("runtime/ordinary-auto-skill-one-note-retry4-r1-plan.json");
const ordinaryAutoTrace = JSON.parse(
  gunzipSync(readFileSync(resolve(investigation, "runtime/ordinary-auto-skill-one-note-retry4-r1.trace.json.gz"))),
);
const skillEffectPlan = json("runtime/ordinary-auto-skill-effect-profile-r1-plan.json");
const skillEffectOracle = json("score_life_ordinary_auto_skill_effect_profile_oracle.json");
const skillEffectTrace = JSON.parse(
  gunzipSync(readFileSync(resolve(investigation, "runtime/ordinary-auto-skill-effect-profile-r1.trace.json.gz"))),
);
check(
  deckAggregateOracle.status === "confirmed-r1-ordinary-deck-aggregate-partial-member-rows" &&
    deckAggregateOracle.deck_aggregate.array_identity.length === 5 &&
    deckAggregateOracle.deck_aggregate.component_2c.bits === "0x47617330" &&
    deckAggregateOracle.deck_aggregate.component_30.bits === "0x478A9AE2" &&
    deckAggregateOracle.deck_aggregate.component_34.bits === "0x477B7FCF" &&
    deckAggregateOracle.deck_aggregate.first_addition.bits === "0x47FB547A" &&
    deckAggregateOracle.deck_aggregate.total_parameter.bits === "0x483C8A31" &&
    deckAggregateOracle.unknown_fields.join(",") === "deck.member_rows" &&
    deckAggregateOracle.privacy.account_fields_included === false &&
    deckAggregateOracle.privacy.omitted.includes("deck_member_rows"),
  "Frozen deck aggregate profile or privacy boundary changed",
);
check(
  masterMusicOracle.status === "confirmed-r1-master-music-786-profile-partial-runtime-availability" &&
    masterMusicOracle.music.target.music_id === 786 &&
    masterMusicOracle.music.list_length === 796 &&
    masterMusicOracle.difficulty_profile.rows.length === 5 &&
    masterMusicOracle.difficulty_profile.special.play_level === 26 &&
    masterMusicOracle.free_live_score_level.resolved_score_level === 26 &&
    masterMusicOracle.blocking_findings.join(",") === "D23-HABAHIRO-runtime-availability" &&
    masterMusicOracle.privacy.account_fields_included === false,
  "Frozen master music 786 profile or privacy boundary changed",
);
const ordinaryAutoCounts = new Map();
for (const event of ordinaryAutoTrace.events) {
  ordinaryAutoCounts.set(event.kind, (ordinaryAutoCounts.get(event.kind) ?? 0) + 1);
}
check(
  ordinaryAutoPlan.scenario_id === "ordinary-auto-skill-one-note-retry4-r1" &&
    ordinaryAutoPlan.tail_seconds === 0 &&
    ordinaryAutoPlan.declared_account_resource_effects.premium_currency === 0 &&
    ordinaryAutoPlan.declared_account_resource_effects.continue === false &&
    ordinaryAutoTrace.status === "confirmed-r1-observation-only" &&
    ordinaryAutoTrace.capture_error === null &&
    ordinaryAutoTrace.events.length === 5501 &&
    ordinaryAutoTrace.events.every((event, index) => event.sequence === index) &&
    ordinaryAutoCounts.get("InGameRecord.CalcOneNotesMaxScoreInfo.leave") === 979 &&
    ordinaryAutoCounts.get("SituationSkillManager.processOfSkillFinished.leave") === 6 &&
    ordinaryAutoTrace.summary.anonymous_skill_count === 5 &&
    ordinaryAutoTrace.privacy.member_identity_included === false &&
    ordinaryAutoTrace.privacy.skill_master_ids_included === false &&
    ordinaryAutoOracle.continuity.capture_error === null &&
    ordinaryAutoOracle.continuity.contiguous === true &&
    ordinaryAutoOracle.one_note.transitions.map((row) => row.value.score).join(",") === "541,703,1136" &&
    ordinaryAutoOracle.one_note.equal_score_retention_witnesses[0].retained.combo === 1 &&
    ordinaryAutoOracle.skill_lifecycles.map((row) => row.alias).join(",") === "skill-01,skill-02,skill-03,skill-04,skill-05,skill-04" &&
    ordinaryAutoOracle.overheal.observed_life_values.join(",") === "1000,1200,1500" &&
    ordinaryAutoOracle.privacy.member_identity_included === false,
  "Frozen ordinary Auto Skill/one-note R1 or privacy boundary changed",
);
const skillEffectCounts = new Map();
for (const event of skillEffectTrace.events) {
  skillEffectCounts.set(event.kind, (skillEffectCounts.get(event.kind) ?? 0) + 1);
}
check(
  skillEffectPlan.scenario_id === "ordinary-auto-skill-effect-profile-r1" &&
    skillEffectPlan.tail_seconds === 0 &&
    skillEffectPlan.declared_account_resource_effects.auto_live_uses === -1 &&
    skillEffectPlan.declared_account_resource_effects.live_boost === -1 &&
    skillEffectPlan.declared_account_resource_effects.premium_currency === 0 &&
    skillEffectPlan.declared_account_resource_effects.continue === false &&
    skillEffectTrace.status === "confirmed-r1-observation-only" &&
    skillEffectTrace.capture_error === null &&
    skillEffectTrace.events.length === 5497 &&
    skillEffectTrace.events.every((event, index) => event.sequence === index) &&
    skillEffectCounts.get("InGameRecord.CalcOneNotesMaxScoreInfo.leave") === 979 &&
    skillEffectCounts.get("SituationSkillManager.processOfSkillTriggered.enter") === 6 &&
    skillEffectCounts.get("SituationSkillManager.processOfSkillFinished.leave") === 6 &&
    skillEffectTrace.summary.anonymous_skill_count === 5 &&
    skillEffectTrace.privacy.member_identity_included === false &&
    skillEffectTrace.privacy.skill_master_ids_included === false &&
    skillEffectOracle.continuity.event_count === 5497 &&
    skillEffectOracle.continuity.contiguous === true &&
    skillEffectOracle.profiles.length === 5 &&
    skillEffectOracle.profile_alias_sequence.join(",") === "skill-01,skill-02,skill-03,skill-04,skill-05,skill-03" &&
    skillEffectOracle.profiles.map((profile) => profile.active_effects.size).join(",") === "2,1,2,1,1" &&
    skillEffectOracle.once_effect_observations.map((row) => `${row.before}->${row.after}`).join(",") === "1000->1000,1000->1000,1000->1000,1000->1300,1300->1500,1500->1500" &&
    skillEffectOracle.privacy.member_identity_included === false &&
    skillEffectOracle.privacy.skill_master_ids_included === false,
  "Frozen anonymous Skill effect profile R1 or privacy boundary changed",
);

const rehearsalPlan = json("runtime/rehearsal-pause-return-time-retry2-r1-plan.json");
const rehearsalOracle = json("score_life_rehearsal_pause_return_time_oracle.json");
const rehearsalTrace = JSON.parse(
  gunzipSync(readFileSync(resolve(investigation, "runtime/rehearsal-pause-return-time-retry2-r1.trace.json.gz"))),
);
const rehearsalReturnKinds = rehearsalTrace.events.filter((event) => /returntime/i.test(event.kind)).map((event) => event.kind);
check(
  rehearsalPlan.scenario_id === "ordinary-rehearsal-pause-return-time-retry2-r1" &&
    rehearsalPlan.sample.mode === "rehearsal" &&
    rehearsalPlan.declared_account_resource_effects.auto_live_uses === 0 &&
    rehearsalPlan.declared_account_resource_effects.live_boost === 0 &&
    rehearsalPlan.declared_account_resource_effects.premium_currency === 0 &&
    rehearsalPlan.declared_account_resource_effects.continue === false &&
    rehearsalTrace.status === "confirmed-r1-observation-only" &&
    rehearsalTrace.capture_error === null &&
    rehearsalTrace.events.length === 6826 &&
    rehearsalTrace.events.every((event, index) => event.sequence === index) &&
    rehearsalTrace.privacy.member_identity_included === false &&
    rehearsalReturnKinds.join(",") === "InGameMoveTimeController.returnTime.enter,NoteManager.ReturnTime.enter,NoteManager.ReturnTime.leave,CommandNoteManager.ReturnTime.enter,CommandNoteManager.ReturnTime.leave,InGameMoveTimeController.returnTime.leave" &&
    rehearsalOracle.continuity.event_count === 6826 &&
    rehearsalOracle.pause_resume.exec_update_count === 1223 &&
    rehearsalOracle.pause_resume.initial_paused_window.exec_update_count === 0 &&
    rehearsalOracle.pause_resume.initial_paused_window.settled_quiet_ms === 5016 &&
    rehearsalOracle.pause_resume.second_pause_window.settled_quiet_ms === 4878 &&
    rehearsalOracle.practice_game_over.in_game_mode === 10 &&
    rehearsalOracle.practice_game_over.game_over_leave_states.join(",") === "0/0/1" &&
    rehearsalOracle.practice_game_over.continued_exec_update_with_life_zero_single_game_over === 1216 &&
    rehearsalOracle.return_time.back_second === 5 &&
    rehearsalOracle.return_time.pre_update.record.life === 0 &&
    rehearsalOracle.return_time.pre_update.record.is_single_game_over === 1 &&
    rehearsalOracle.return_time.post_update.record.life === 1000 &&
    rehearsalOracle.return_time.post_update.record.is_single_game_over === 0 &&
    rehearsalOracle.privacy.member_identity_included === false,
  "Frozen rehearsal pause/Practice/ReturnTime R1 or privacy boundary changed",
);

const skillPauseOracle = json("score_life_ordinary_auto_skill_playing_pause_oracle.json");
const skillPauseTrace = JSON.parse(gunzipSync(readFileSync(resolve(investigation, "runtime/ordinary-auto-skill-playing-pause-r1.trace.json.gz"))));
check(
  skillPauseTrace.status === "confirmed-r1-observation-only" && skillPauseTrace.capture_error === null &&
  skillPauseTrace.events.length === 13248 && skillPauseTrace.events.every((event,index)=>event.sequence===index) &&
  skillPauseTrace.privacy.member_identity_included === false &&
  skillPauseOracle.continuity.event_count === 13248 && skillPauseOracle.continuity.summary_queued_exec_update_tail === 2 &&
  skillPauseOracle.business_completion.one_note_leave_count === 979 && skillPauseOracle.business_completion.skill_finished_leave_count === 6 &&
  skillPauseOracle.playing_pause.settled_quiet_ms === 4878 && skillPauseOracle.playing_pause.wall_gap_ms === 8048 &&
  skillPauseOracle.playing_pause.game_frame_delta === 1 &&
  skillPauseOracle.playing_pause.before.skill.state === 2 && skillPauseOracle.playing_pause.after.skill.state === 2 &&
  skillPauseOracle.playing_pause.before.skill.current.master_alias === "skill-01" &&
  skillPauseOracle.playing_pause.after.skill.current.master_alias === "skill-01" &&
  skillPauseOracle.privacy.member_identity_included === false,
  "Frozen Skill-Playing pause R1 or privacy boundary changed",
);

const fixedEventOracle = json("score_life_state_fixed_event_oracle.json");
const fixedEventCases = fixedEventOracle.cases;
const fixedEventById = new Map(fixedEventCases.map((entry) => [entry.case_id, entry]));
const confirmedFixedCases = fixedEventCases
  .filter((entry) => entry.status.startsWith("confirmed"))
  .map((entry) => entry.case_id);
const partialFixedCases = fixedEventCases
  .filter((entry) => entry.status === "partial")
  .map((entry) => entry.case_id);
const blockedFixedCases = fixedEventCases
  .filter((entry) => entry.status === "blocked")
  .map((entry) => entry.case_id);
const expectedPartialFixedCases = [
  "BS02", "BS03", "BS07", "BS10", "BS12", "BS13", "BS14", "BS15", "BS16", "BS18",
  "BS19", "BS20", "BS21", "BS22", "BS23", "BS24", "BS25", "BS26", "BS27", "BS29", "BS30", "BS32",
  "BS35", "BS36",
];
const expectedBlockedFixedCases = [
  "BS04", "BS08", "BS09", "BS17", "BS28", "BS31", "BS33", "BS34",
];
const fixedEventEvidencePaths = new Map([
  ["static_contract", "score_life_state_static_contract.json"],
  ["static_findings", "score_life_state_static_findings.json"],
  ["ordinary_bms", "runtime-inputs/bms/poppin_shuffle_special.bms.txt"],
  ["habahiro_bms", "runtime-inputs/bms/786_miracle_april_habahiro_special.bms.txt"],
  ["no_input_r1", "runtime/no-input-retry-life-gameover.trace.json.gz"],
  ["positive_r1", "runtime/positive-retry-all-lanes-early.trace.json.gz"],
  ["skill_r1", "runtime/multitouch-seven-lane-native-skill.trace.json.gz"],
  ["retry_r1", "runtime/multitouch-seven-lane-post-gameover-retry.trace.json.gz"],
  ["chart_count", "score_life_state_chart_count_oracle.json"],
  ["initialization_profile", "score_life_initialization_profile_oracle.json"],
  ["deck_aggregate_profile", "score_life_deck_aggregate_profile_oracle.json"],
  ["master_music_786_profile", "score_life_master_music_786_profile_oracle.json"],
  ["ordinary_auto_skill_one_note", "score_life_ordinary_auto_skill_one_note_oracle.json"],
  ["ordinary_auto_skill_effect_profile", "score_life_ordinary_auto_skill_effect_profile_oracle.json"],
  ["rehearsal_pause_return_time", "score_life_rehearsal_pause_return_time_oracle.json"],
  ["ordinary_auto_skill_playing_pause", "score_life_ordinary_auto_skill_playing_pause_oracle.json"],
]);
check(
  fixedEventOracle.schema_version === 1 &&
    fixedEventOracle.status === "partial-10.1.4-fixed-event-oracle-business-gate-open" &&
    fixedEventOracle.source_commit === "16760726981882d16ae474c22ce9a281c0821187" &&
    fixedEventOracle.generator === "build_score_life_state_fixed_event_oracle.py" &&
    fixedEventOracle.sample.package === "jp.co.craftegg.band" &&
    fixedEventOracle.sample.version_name === "10.1.4" &&
    fixedEventOracle.sample.version_code === 230 &&
    fixedEventOracle.sample.abi === "arm64-v8a" &&
    fixedEventOracle.sample.libil2cpp_sha256 ===
      "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F" &&
    fixedEventOracle.business_state_gate === "open" &&
    fixedEventOracle.production_authorization === false &&
    fixedEventCases.length === 36 &&
    fixedEventCases.map((entry) => entry.case_id).join(",") ===
      Array.from({ length: 36 }, (_, index) => `BS${String(index + 1).padStart(2, "0")}`).join(",") &&
    confirmedFixedCases.join(",") === "BS01,BS05,BS06,BS11" &&
    partialFixedCases.join(",") === expectedPartialFixedCases.join(",") &&
    blockedFixedCases.join(",") === expectedBlockedFixedCases.join(",") &&
    fixedEventOracle.coverage.unknown_field_count === 126 &&
    fixedEventOracle.coverage.blocking_finding_count === 82 &&
    fixedEventCases.every((entry) =>
      entry.requirement &&
      entry.evidence_ids.length > 0 &&
      entry.input_provenance.length > 0 &&
      entry.expected_source.length > 0 &&
      (entry.status.startsWith("confirmed")
        ? entry.unknown_fields.length === 0 &&
          entry.blocking_findings.length === 0 &&
          Object.keys(entry.expected_projection).length > 0
        : entry.status === "partial"
          ? (entry.unknown_fields.length > 0 || entry.blocking_findings.length > 0) &&
            Object.keys(entry.expected_projection).length > 0
          : entry.unknown_fields.length > 0 &&
            entry.blocking_findings.length > 0 &&
            Object.keys(entry.expected_projection).length === 0),
    ) &&
    [...fixedEventEvidencePaths].every(([sourceId, path]) => {
      const bytes = readFileSync(resolve(investigation, path));
      const source = fixedEventOracle.evidence_catalog[sourceId];
      return source.path === path &&
        source.bytes === bytes.length &&
        source.sha256 === sha256(bytes) &&
        source.source_commit === "16760726981882d16ae474c22ce9a281c0821187";
    }),
  "Frozen BS01-BS36 partial oracle identity, provenance, or fail-closed coverage changed",
);
check(
  JSON.stringify(fixedEventById.get("BS05").expected_projection.result_correction) ===
    JSON.stringify(findingById.get("SLS-S03").conclusion) &&
    JSON.stringify(fixedEventById.get("BS06").expected_projection.combo_correction_ranges) ===
      JSON.stringify(findingById.get("SLS-S04").conclusion) &&
    fixedEventById.get("BS11").expected_projection.slot_capacity === 5 &&
    fixedEventById.get("BS11").expected_projection.representative ===
      findingById.get("SLS-S02").conclusion.representative &&
    fixedEventById.get("BS01").expected_projection.production_chart_count.derived.max_note_count === 979 &&
    fixedEventById.get("BS01").unknown_fields.length === 0 &&
    fixedEventById.get("BS01").blocking_findings.length === 0 &&
    fixedEventById.get("BS01").expected_projection.observed_initialization_profile.score_level === 27 &&
    fixedEventById.get("BS01").expected_projection.observed_initialization_profile.max_note_count === 979 &&
    fixedEventById.get("BS01").expected_projection.observed_initialization_profile.score.total_parameter.bits ===
      "0x483C8A31" &&
    fixedEventById.get("BS01").expected_projection.observed_initialization_profile.score.base_score.bits ===
      "0x4434718E" &&
    fixedEventById.get("BS02").status === "partial" &&
    fixedEventById.get("BS02").expected_projection.production_chart_count.derived.max_note_count === 731 &&
    fixedEventById.get("BS02").unknown_fields.join(",") === "initialization.start_data_runtime,initialization.event_parameter,initialization.base_score_bits" &&
    fixedEventById.get("BS02").blocking_findings.join(",") === "D23-HABAHIRO-runtime-availability" &&
    fixedEventById.get("BS02").expected_projection.master_music_profile.free_live_score_level.resolved_score_level === 26 &&
    fixedEventById.get("BS07").expected_projection.frame.index === 6 &&
    fixedEventById.get("BS07").expected_projection.frame.add_score.bits === "0x44AF8052" &&
    fixedEventById.get("BS07").expected_projection.reflected_add_score === 1404 &&
    fixedEventById.get("BS19").expected_projection.observed_heal.before === 800 &&
    fixedEventById.get("BS19").expected_projection.observed_heal.delta === 300 &&
    fixedEventById.get("BS19").expected_projection.observed_heal.after === 1100 &&
    fixedEventById.get("BS19").expected_projection.observed_once_effect_profiles.length === 6 &&
    fixedEventById.get("BS19").unknown_fields.join(",") === "runtime.condition_equal_boundary,runtime.heal_callback_identity" &&
    fixedEventById.get("BS23").status === "partial" &&
    fixedEventById.get("BS23").expected_projection.observed_skill_playing_pause.game_frame_delta === 1 &&
    fixedEventById.get("BS23").unknown_fields.join(",") === "runtime.game_over_playing_freeze,runtime.stop_drain,runtime.multiple_queue,runtime.callback_order" &&
    fixedEventById.get("BS24").expected_projection.observed_ordered_effect_rows.length === 5 &&
    fixedEventById.get("BS24").unknown_fields.join(",") === "runtime.judge_correction,runtime.first_eligible_effect,runtime.ineligible_predecessor" &&
    fixedEventById.get("BS25").status === "partial" &&
    fixedEventById.get("BS25").expected_projection.observed_over_life_score_effect.type === 4 &&
    fixedEventById.get("BS26").status === "partial" &&
    fixedEventById.get("BS26").expected_projection.observed_continuous_effect.type === 6 &&
    fixedEventById.get("BS13").unknown_fields.join(",") === "record.all_perfect_status" &&
    fixedEventById.get("BS14").status === "partial" &&
    fixedEventById.get("BS14").expected_projection.ordinary.call_count === 979 &&
    fixedEventById.get("BS14").expected_projection.ordinary.transitions.length === 3 &&
    fixedEventById.get("BS20").expected_projection.observed_overheal.observed_life_values.join(",") === "1000,1200,1500" &&
    fixedEventById.get("BS21").expected_projection.observed_successful_auto_lifecycles.length === 6 &&
    fixedEventById.get("BS22").expected_projection.states.none === 0 &&
    fixedEventById.get("BS22").expected_projection.states.begin === 1 &&
    fixedEventById.get("BS22").expected_projection.states.playing === 2 &&
    fixedEventById.get("BS22").expected_projection.states.finishing === 3 &&
    fixedEventById.get("BS22").expected_projection.states.final_none === 0 &&
    fixedEventById.get("BS22").expected_projection.playing_timer_bits === "0x40A00000" &&
    fixedEventById.get("BS22").expected_projection.finishing_timer_bits === "0x3F400000" &&
    fixedEventById.get("BS22").expected_projection.observed_auto_lifecycles.length === 6 &&
    fixedEventById.get("BS36").expected_projection.post_game_over_hook_quiet_ms === 11875 &&
    fixedEventById.get("BS36").expected_projection.record_identity_stable === true &&
    fixedEventById.get("BS36").expected_projection.retry_reset.score.join(",") === "44403,0" &&
    fixedEventById.get("BS35").status === "partial" &&
    fixedEventById.get("BS35").expected_projection.observed_practice_mode.in_game_mode === 10 &&
    fixedEventById.get("BS35").expected_projection.observed_practice_mode.continued_exec_update_with_life_zero_single_game_over === 1216 &&
    fixedEventById.get("BS36").expected_projection.retry_reset.life.join(",") === "0,1000" &&
    fixedEventById.get("BS36").expected_projection.observed_pause_resume.exec_update_count === 1223 &&
    fixedEventById.get("BS36").expected_projection.observed_return_time.back_second === 5 &&
    fixedEventById.get("BS36").unknown_fields.join(",") === "failure.invalid_profile_atomicity,lifecycle.fault_dispose,lifecycle.duplicate_consume,lifecycle.continue",
  "Frozen BS01/BS02/BS05/BS06/BS07/BS11/BS13/BS14/BS19-BS22/BS36 direct projections changed",
);

const unconsumedCaptureFields = [
  "ScoreUtility.GetResultTypeCorrectionRate.rate_bits",
  "FeverTimeManager.GetFeverTimeScoreRate.result_bits",
  "NoteFrontBase.calcSkillScoreUpRate.returned",
  "NoteFrontBase.judgeFrontNote.note_type",
  "NoteFrontBase.judgeFrontNote.absolute_pos",
];
check(
  runtimeStatus.runtime.capture_fields_not_consumed.join(",") ===
    unconsumedCaptureFields.join(","),
  "ABI-unsafe positive R1 fields were not excluded",
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
  `score-life-state evidence verified: methods=326 layouts=25 enums=19 BMS=2 counts=979/731 R1=11(partial D18/D19/D20/D21/D22/D23) BS=36(4/24/8,unknown=126,blockers=82) plans=19(pending=0) ` +
    `V01=closed business=blocked(D18-D24) entries=${manifest.entries.length} ` +
    `index=${validateIndex ? "checked" : "skipped"}`,
);
