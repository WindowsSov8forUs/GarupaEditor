import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageRoot, "../../..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
const sourceRoot = manifest.source.repository;
const validateIndex = process.argv.includes("--index");
const prefix = "artifacts/investigations/resource-pixi-rendering-runtime-contract-10-1-4/";
const investigation = resolve(packageRoot, prefix);
const sourceCommit = "e2e66f7a15b532600a3fc53f392a4c0fa2493f22";

function fail(message) { throw new Error(message); }
function check(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex").toUpperCase(); }
function git(args, cwd, encoding = null) { return execFileSync("git", ["-c", "core.longpaths=true", ...args], { cwd, encoding, maxBuffer: 256 * 1024 * 1024 }); }
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

check(manifest.schemaVersion === 2 && manifest.stage === "resource-pixi-rendering", "Unexpected manifest schema/stage");
check(manifest.source.offlineEvidenceCommit === sourceCommit, "Unexpected source commit");
check(manifest.sample.package === "jp.co.craftegg.band" && manifest.sample.versionName === "10.1.4" && manifest.sample.versionCode === 230 && manifest.sample.abi === "arm64-v8a", "Unexpected sample");
check(manifest.sample.libil2cppSha256 === "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F", "Unexpected ELF hash");
check(manifest.sample.globalMetadataSha256 === "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F", "Unexpected metadata hash");
check(manifest.sample.assetBundleInfoSha256 === "D026CAE392A4253EF5B0E228B6AE50A49B34C8D79514CF4F93C7C91A46850AC6", "Unexpected cache index hash");
check(manifest.entries.length === 709 && manifest.counts.totalEntries === 709, "Unexpected manifest entry count");
check(manifest.counts.methods === 673 && manifest.counts.layouts === 32 && manifest.counts.enums === 19 && manifest.counts.arm64Slices === 673, "Static counts differ");
check(manifest.counts.instructionEquivalent === 652 && manifest.counts.instructionChanged === 21, "Instruction migration counts differ");
check(manifest.counts.cacheRecords === 11026 && manifest.counts.ingameSkinBundles === 57 && manifest.counts.baseResources === 100, "Resource counts differ");
check(manifest.counts.hudProfiles === 8 && manifest.counts.skillAnimationClips === 4 && manifest.counts.noteAnimationClips === 4 && manifest.counts.scoreUpRoutes === 5 && manifest.counts.floatSpecialValues === 12, "Visual profile counts differ");
check(manifest.counts.runtimeHookTargets === 55 && manifest.counts.r1Scenarios === 2 && manifest.counts.frameAnchors === 13, "Runtime plan counts differ");
check(manifest.counts.historicalCandidates === 28 && manifest.counts.decisions === 18 && manifest.counts.fixedCases === 40, "Closure classification counts differ");
check(manifest.offlineWorkGate.status === "closed" && manifest.offlineWorkGate.offlinePlanGate === "closed" && manifest.offlineWorkGate.unknownStaticWork.length === 0 && manifest.offlineWorkGate.unknownFields.length === 0, "Offline work/plan gate differs");
check(manifest.offlineWorkGate.remainingBlockersAllRequireGameServer === true && manifest.offlineWorkGate.remainingBlockers.map((row) => row.id).join(",") === "S01,S02,S03", "Server blocker set differs");
check(manifest.offlineWorkGate.productionAuthorization === false && manifest.renderingGate.status === "open" && manifest.renderingGate.productionAuthorization === false, "Production/rendering gate differs");
check(manifest.renderingGate.requiredBeforeCode.join(",") === "S01,S02,S03", "Required-before-code set differs");

git(["cat-file", "-e", `${sourceCommit}^{commit}`], sourceRoot);
const ids = new Set();
const copiedPaths = new Set();
for (const entry of manifest.entries) {
  check(!ids.has(entry.id), `Duplicate evidence id: ${entry.id}`); ids.add(entry.id);
  check(!copiedPaths.has(entry.copiedPath), `Duplicate copied path: ${entry.copiedPath}`); copiedPaths.add(entry.copiedPath);
  check(entry.sourceCommit === sourceCommit, `Unexpected entry source commit: ${entry.id}`);
  check(entry.sourcePath === entry.copiedPath && entry.sourcePath.startsWith(prefix), `Unexpected path mapping: ${entry.id}`);
  const committed = git(["show", `${sourceCommit}:${entry.sourcePath}`], sourceRoot);
  const sourceWorking = readFileSync(resolve(sourceRoot, entry.sourcePath));
  const copied = readFileSync(resolve(packageRoot, entry.copiedPath));
  checkBytes(`committed ${entry.id}`, committed, entry);
  checkBytes(`source working ${entry.id}`, sourceWorking, entry);
  checkBytes(`copied ${entry.id}`, copied, entry);
  check(committed.equals(sourceWorking) && committed.equals(copied), `Three-way bytes differ: ${entry.id}`);
  if (validateIndex) {
    const indexedPath = relative(projectRoot, resolve(packageRoot, entry.copiedPath)).split(sep).join("/");
    const indexed = git(["show", `:${indexedPath}`], projectRoot);
    checkBytes(`index ${entry.id}`, indexed, entry);
    check(indexed.equals(committed), `Index/source bytes differ: ${entry.id}`);
  }
}
const frozenFiles = filesRecursively(investigation).sort();
const manifestFiles = [...copiedPaths].map((path) => path.slice(prefix.length)).sort();
check(JSON.stringify(frozenFiles) === JSON.stringify(manifestFiles), "Frozen file set differs from manifest");

const binaryExtensions = new Set([".apk", ".so", ".dat", ".bundle", ".ab", ".assetbundle", ".png", ".jpg", ".jpeg", ".webp", ".ttf", ".otf"]);
check(frozenFiles.every((path) => !binaryExtensions.has(extname(path).toLowerCase())), "Forbidden resource/application binary is frozen");
check(frozenFiles.every((path) => !readFileSync(resolve(investigation, path)).subarray(0, 7).equals(Buffer.from("UnityFS"))), "UnityFS bundle is frozen");

const sums = new Map();
for (const line of readFileSync(resolve(investigation, "SHA256SUMS"), "utf8").trim().split("\n")) {
  const match = /^([0-9A-F]{64})  (.+)$/.exec(line);
  check(match !== null && !sums.has(match[2]), `Invalid SHA256SUMS row: ${line}`);
  sums.set(match[2], match[1]);
}
check(sums.size === 708, "Unexpected SHA256SUMS count");
for (const path of frozenFiles.filter((path) => path !== "SHA256SUMS")) {
  check(sums.get(path) === sha256(readFileSync(resolve(investigation, path))), `SHA256SUMS mismatch: ${path}`);
}

const staticContract = json("resource_pixi_rendering_static_contract.json");
check(staticContract.method_layout_rebaseline === "closed" && staticContract.methods.length === 673 && staticContract.field_layout.length === 32 && staticContract.enums.length === 19, "Static contract differs");
const migration = json("resource_pixi_rendering_instruction_migration.json");
check(migration.status === "confirmed-conservative-instruction-migration-classification" && migration.status_counts["normalized-instruction-equivalent"] === 652 && migration.status_counts["changed-semantic-instruction-shape"] === 21, "Instruction migration differs");
check(migration.unknown_fields.length === 0 && migration.blocking_findings.length === 2, "Instruction migration classification boundary differs");

const resource = json("resource_pixi_rendering_resource_contract.json");
check(resource.status === "confirmed-current-r0-resource-and-static-unity-assets-runtime-gate-open" && resource.asset_bundle_info.record_count === 11026 && resource.ingameskin_bundles.length === 57 && resource.selected_base_resources.length === 100, "Resource contract differs");
check(resource.habahiro_route.resource_bytes_status === "evidence-required-current-bundle-absent-from-cache-index", "HABAHIRO resource gate differs");
check(resource.distribution.original_binary_assets_committed === false && resource.distribution.runtime_network_allowed === false, "Resource distribution policy differs");
function findFloatSpecials(value) {
  if (Array.isArray(value)) return value.flatMap(findFloatSpecials);
  if (value && typeof value === "object") {
    if (Object.keys(value).sort().join(",") === "float_special,ieee754_binary32") return [value];
    return Object.values(value).flatMap(findFloatSpecials);
  }
  return [];
}
const floatSpecials = findFloatSpecials(resource);
check(floatSpecials.length === 12 && floatSpecials.every((row) => row.float_special === "positive-infinity" && row.ieee754_binary32 === "7F800000"), "Explicit Float special-value encoding differs");
const resourceSerialized = JSON.stringify(resource);
check(!resourceSerialized.includes("https://") && !resourceSerialized.includes("http://"), "Promoted resource evidence contains URL provenance");

const hud = json("resource_pixi_rendering_hud_asset_profiles.json");
const skill = json("resource_pixi_rendering_skill_animation_profiles.json");
const note = json("resource_pixi_rendering_note_animation_profiles.json");
const scoreUp = json("resource_pixi_rendering_score_up_profile.json");
check(hud.status === "confirmed-current-static-hud-assets-runtime-gate-open" && Object.keys(hud.profiles).length === 8, "HUD profiles differ");
check(skill.status === "confirmed-current-static-skill-animation-assets-runtime-assignment-open" && Object.keys(skill.clips).length === 4, "Skill animation profiles differ");
check(note.status === "confirmed-current-static-note-animation-assets-runtime-phase-open" && Object.keys(note.clips).length === 4, "Note animation profiles differ");
check(scoreUp.confirmed.length === 5 && scoreUp.behavior.result_change_sprite.address === "0x32AC010", "ScoreUp profile differs");

const targets = json("resource_pixi_rendering_runtime_hook_targets.json");
const r1Plan = json("runtime/resource-pixi-rendering-r1-plan.json");
const framePlan = json("runtime/resource-pixi-rendering-frame-plan.json");
const runtimeStatus = json("runtime_input_status.json");
check(targets.status === "confirmed-current-hook-target-plan-runtime-evidence-absent" && targets.target_count === 55 && targets.targets.length === 55 && targets.unknown_targets.length === 0 && targets.production_authorization === false, "Runtime hook target plan differs");
check(r1Plan.status === "confirmed-observation-only-plan-game-server-required" && r1Plan.scenarios.length === 2 && r1Plan.hook_target_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_runtime_hook_targets.json"))), "R1 capture plan differs");
check(framePlan.status === "confirmed-frame-plan-game-server-required" && Object.values(framePlan.scenarios).reduce((count, rows) => count + rows.length, 0) === 13 && framePlan.production_authorization === false, "Frame plan differs");
check(runtimeStatus.status === "runtime-and-frame-evidence-required-game-server" && runtimeStatus.offline_plan_gate === "closed" && runtimeStatus.rendering_gate === "open" && runtimeStatus.confirmed_traces.length === 0 && runtimeStatus.confirmed_frames.length === 0 && runtimeStatus.production_authorization === false, "Runtime input status differs");

const portable = json("resource_pixi_rendering_portable_contract.json");
check(portable.status === "confirmed-offline-portable-draft-runtime-order-gate-open" && portable.production_authorization === false && portable.unknown_fields.length === 0, "Portable draft differs");
check(portable.resource_profile.network_allowed === false && portable.resource_profile.fallback_alias_allowed === false && portable.resource_profile.placeholder_allowed === false, "Portable resource policy differs");
const cases = json("resource_pixi_rendering_fixed_case_status.json");
check(cases.status === "confirmed-offline-case-classification-server-gate-open" && cases.cases.length === 40 && cases.unknown_cases.length === 0 && cases.production_authorization === false, "PR case classification differs");
check(cases.cases.map((row) => row.case).join(",") === Array.from({ length: 40 }, (_, index) => `PR${String(index + 1).padStart(2, "0")}`).join(","), "PR case IDs differ");

const closure = json("offline_closure.json");
check(closure.status === "offline-work-gate-closed-server-required-gate-open" && closure.offline_work_gate === "closed" && closure.offline_plan_gate === "closed" && closure.rendering_gate === "open" && closure.production_authorization === false, "Offline closure differs");
check(closure.runtime_capture_plan.hook_target_count === 55 && closure.runtime_capture_plan.r1_scenarios.length === 2 && closure.runtime_capture_plan.physical_frame_anchors === 13, "Offline runtime plan summary differs");
check(Object.keys(closure.historical_candidate_status).length === 28 && Object.keys(closure.decision_status).length === 18, "H/D closure counts differ");
check(closure.unknown_static_work.length === 0 && closure.unknown_fields.length === 0 && closure.remaining_blockers_all_require_game_server === true, "Offline closure retains non-server work");
check(closure.remaining_blockers.map((row) => row.id).join(",") === "S01,S02,S03", "Offline closure blocker IDs differ");

console.log(`verified resource/Pixi offline evidence: entries=709 methods=673 layouts=32 enums=19 resources=11026/57/100 profiles=8+4+4+5 plans=55/2/13 H=28 D=18 PR=40 offline=closed rendering=open production=false blockers=S01,S02,S03${validateIndex ? " index=checked" : ""}`);
