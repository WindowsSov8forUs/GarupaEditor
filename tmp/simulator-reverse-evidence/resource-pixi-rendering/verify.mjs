import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageRoot, "../../..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
const sourceRoot = manifest.source.repository;
const validateIndex = process.argv.includes("--index");
const prefix = "artifacts/investigations/resource-pixi-rendering-runtime-contract-10-1-4/";
const investigation = resolve(packageRoot, prefix);
const sourceCommit = "64a88a8821d20eb1cc43003a9bd959c892d40e12";

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

check(manifest.schemaVersion === 3 && manifest.stage === "resource-pixi-rendering", "Unexpected manifest schema/stage");
check(manifest.source.offlineEvidenceCommit === sourceCommit, "Unexpected source commit");
check(manifest.sample.package === "jp.co.craftegg.band" && manifest.sample.versionName === "10.1.4" && manifest.sample.versionCode === 230 && manifest.sample.abi === "arm64-v8a", "Unexpected sample");
check(manifest.sample.libil2cppSha256 === "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F", "Unexpected ELF hash");
check(manifest.sample.globalMetadataSha256 === "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F", "Unexpected metadata hash");
check(manifest.sample.assetBundleInfoSha256 === "D026CAE3740DB87AA777C2FDAE40B141FF16464BC2C839ACEF3C820E06850AC6", "Unexpected cache index hash");
check(manifest.entries.length === 826 && manifest.counts.totalEntries === 826, "Unexpected manifest entry count");
check(manifest.counts.methods === 673 && manifest.counts.layouts === 32 && manifest.counts.enums === 19 && manifest.counts.arm64Slices === 673, "Static counts differ");
check(manifest.counts.instructionEquivalent === 652 && manifest.counts.instructionChanged === 21, "Instruction migration counts differ");
check(manifest.counts.cacheRecords === 11026 && manifest.counts.ingameSkinBundles === 57 && manifest.counts.baseResources === 100, "Resource counts differ");
check(manifest.counts.hudProfiles === 8 && manifest.counts.skillAnimationClips === 4 && manifest.counts.noteAnimationClips === 4 && manifest.counts.scoreUpRoutes === 5 && manifest.counts.floatSpecialValues === 12, "Visual profile counts differ");
check(manifest.counts.runtimeHookTargets === 55 && manifest.counts.r1Scenarios === 2 && manifest.counts.frameAnchors === 13, "Runtime plan counts differ");
check(manifest.counts.renderSetterTargets === 10 && manifest.counts.ordinaryGeometryRuntimeEvents === 87037 && manifest.counts.ordinaryGeometryRuntimeFrames === 636 && manifest.counts.ordinaryGeometryMeshOwners === 510 && manifest.counts.ordinaryGeometryLineOwners === 80 && manifest.counts.currentSyncLineProfiles === 1 && manifest.counts.currentProjectionProfiles === 1 && manifest.counts.currentNoteGeometryProducerProfiles === 1 && manifest.counts.noteChildArm64Slices === 13 && manifest.counts.currentNoteChildLifecycleProfiles === 1 && manifest.counts.currentHudRuntimeProfiles === 1 && manifest.counts.hudSetterTargets === 22 && manifest.counts.hudSetterArm64Slices === 22 && manifest.counts.ordinaryHudVisibleRuntimeEvents === 19888 && manifest.counts.ordinaryHudVisibleRuntimeFrames === 631 && manifest.counts.currentHudVisibleProfiles === 1, "Geometry/child/HUD runtime profile counts differ");
check(manifest.counts.noteFamilyR4Targets === 30 && manifest.counts.noteFamilyR4Arm64Slices === 6 && manifest.counts.ordinaryNoteFamilyR4RuntimeEvents === 118152 && manifest.counts.ordinaryNoteFamilyR4AggregateFrames === 1258 && manifest.counts.currentNoteFamilyR4Profiles === 1, "Note family R4 counts differ");
check(manifest.counts.hudFieldR5Targets === 35 && manifest.counts.ordinaryHudFieldR5RuntimeEvents === 30975 && manifest.counts.ordinaryHudFieldR5AggregateFrames === 1059 && manifest.counts.currentHudFieldR5Profiles === 1 && manifest.counts.hudFieldR5AuthorizedRoutes === 5, "HUD/field R5 counts differ");
check(manifest.counts.finalR6RuntimeEvents === 190401 && manifest.counts.finalR6AggregateFrames === 2492 && manifest.counts.finalR6ObservedOwners === 26 && manifest.counts.currentFinalR6Profiles === 1 && manifest.counts.finalR6AuthorizedNewRoutes === 1, "Final R6 counts differ");
check(manifest.counts.habahiroDegradedProfiles === 2 && manifest.counts.habahiroDifferenceRows === 12 && manifest.counts.habahiroDegradedSpriteKeys === 179, "HABAHIRO degraded counts differ");
check(manifest.counts.historicalCandidates === 28 && manifest.counts.decisions === 18 && manifest.counts.fixedCases === 40, "Closure classification counts differ");
check(manifest.deliveryGate.status === "closed" && manifest.deliveryGate.profile === "ordinary-exact-habahiro-degraded" && manifest.deliveryGate.ordinaryRuntime === "closed" && manifest.deliveryGate.ordinaryFrames === "closed" && manifest.deliveryGate.habahiroPortableResource === "closed-current-external-fallback" && manifest.deliveryGate.productionAuthorization === true, "Delivery gate differs");
check(manifest.exactParityGate.status === "open-not-claimed" && manifest.exactParityGate.blocksDelivery === false && manifest.exactParityGate.remainingBlockers.length === 3, "Exact parity gate differs");
check(manifest.renderingGate.status === "closed-for-explicit-delivery-profile" && manifest.renderingGate.productionAuthorization === true && manifest.renderingGate.requiredBeforeCode.length === 0, "Production/rendering gate differs");
check(manifest.habahiroGate.exactParity === "open-not-claimed" && manifest.habahiroGate.degradedDelivery === "closed" && manifest.habahiroGate.visibleLabel === "Approximate HABAHIRO" && manifest.habahiroGate.automaticFallback === false, "Manifest HABAHIRO dual-track gate differs");
check(manifest.habahiroGate.directlyImpactedCases.join(",") === "PR01,PR04,PR19,PR40", "Manifest HABAHIRO impacted cases differ");
check(manifest.binaryExclusions.physicalFramePngCopied === false && manifest.binaryExclusions.resourceBinariesCopied === false && manifest.binaryExclusions.bestdoriBytesCopied === false, "Frozen binary exclusion differs");

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
check(sums.size === 832, "Unexpected SHA256SUMS count");
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
check(runtimeStatus.status === "ordinary-runtime-required-habahiro-degraded-delivery-accepted" && runtimeStatus.offline_plan_gate === "closed" && runtimeStatus.rendering_gate === "open" && runtimeStatus.confirmed_traces.length === 1 && runtimeStatus.confirmed_frames.length === 1 && runtimeStatus.production_authorization === false, "Runtime input status differs");
check(runtimeStatus.delivery_status.rendering_delivery_gate === "closed" && runtimeStatus.delivery_status.production_authorization === true, "Runtime delivery status differs");
check(runtimeStatus.habahiro_exact_parity_gate === "open" && runtimeStatus.habahiro_degraded_delivery_gate === "closed-authorized-by-explicit-user-request" && runtimeStatus.degraded_habahiro.automatic_fallback === false, "Runtime HABAHIRO dual-track status differs");

const deliveryTraceEntry = manifest.entries.find((entry) => entry.copiedPath.endsWith("runtime/ordinary-rendering-r1.trace.json.gz"));
const deliveryFrames = json("runtime/resource-pixi-rendering-delivery-frame-manifest.json");
const externalHab = json("habahiro_current_external_resource_profile.json");
const deliveryOracle = json("resource_pixi_rendering_delivery_oracle.json");
const deliveryClosure = json("delivery_closure.json");
check(deliveryTraceEntry && manifest.counts.ordinaryRuntimeEvents === 87364 && manifest.counts.ordinaryRuntimeCategories === 8 && manifest.counts.ordinaryRuntimeAnchors === 8, "Ordinary R1 freeze differs");
check(deliveryFrames.status === "confirmed-physical-device-frame-manifest" && deliveryFrames.frames.length === 7 && deliveryFrames.frames.every((row) => row.scenario === "ordinary"), "Ordinary physical frame manifest differs");
check(externalHab.status === "confirmed-current-external-portable-habahiro-resource-profile" && externalHab.assets.length === 12 && externalHab.sprite_profile.sprite_count === 179 && externalHab.distribution.production_network_allowed === false && externalHab.distribution.binaries_committed === false, "Current external HABAHIRO profile differs");
check(deliveryOracle.status === "confirmed-delivery-oracle-ordinary-exact-habahiro-degraded" && deliveryOracle.ordinary_runtime.events === 87364 && deliveryOracle.ordinary_frames.count === 7 && deliveryOracle.fidelity.original_habahiro_runtime_or_frame_claim === false, "Rendering delivery oracle differs");
check(deliveryClosure.status === "delivery-rendering-gate-closed-ordinary-exact-habahiro-degraded" && deliveryClosure.rendering_delivery_gate === "closed" && deliveryClosure.production_authorization === true && deliveryClosure.habahiro_exact_parity_gate === "open-not-claimed" && Object.keys(deliveryClosure.decision_status).length === 18 && Object.keys(deliveryClosure.fixed_case_status).length === 40, "Rendering delivery closure differs");

const degraded = json("habahiro_degraded_approximation.json");
const degradedScene = json("habahiro_degraded_scene_oracle.json");
check(degraded.status === "confirmed-explicit-degraded-habahiro-decision-not-original-parity" && degraded.gate_policy.habahiro_exact_parity_gate === "open" && degraded.gate_policy.habahiro_degraded_delivery_gate === "closed-authorized-by-explicit-user-request" && degraded.gate_policy.production_authorization === false, "HABAHIRO degraded decision differs");
check(degraded.profiles.length === 2 && degraded.difference_matrix.length === 12 && degraded.directly_impacted_fixed_cases.join(",") === "PR01,PR04,PR19,PR40", "HABAHIRO degraded profile/difference matrix differs");
check(degraded.historical_candidate.atlas_profile.sprite_count === 179 && degraded.historical_candidate.atlas_profile.texture_count === 9 && degraded.historical_candidate.atlas_profile.version_equivalence_to_10_1_4 === "unproven", "Historical HABAHIRO candidate boundary differs");
check(degradedScene.status === "confirmed-diagnostic-degraded-scene-oracle-not-original-frame" && degradedScene.logical_scene.historical_sprite_key_count === 179 && degradedScene.logical_scene.multiple_directional_pool_capacity === 60 && degradedScene.chart.max_note_count === 731, "HABAHIRO degraded scene differs");
check(degradedScene.frame_oracle === null && degradedScene.scene_or_command_parity_claim === false && degradedScene.production_authorization === false, "HABAHIRO degraded scene incorrectly claims parity")

const setterTargets = json("resource_pixi_rendering_setter_targets.json");
const lineProfile = json("resource_pixi_rendering_line_profile.json");
const projectionProfile = json("resource_pixi_rendering_projection_profile.json");
const noteGeometryProfile = json("resource_pixi_rendering_note_geometry_profile.json");
const noteChildLifecycleProfile = json("resource_pixi_rendering_note_child_lifecycle_profile.json");
const noteFamilyR4Targets = json("resource_pixi_rendering_note_family_r4_targets.json");
const noteFamilyR4Profile = json("resource_pixi_rendering_note_family_r4_profile.json");
const noteFamilyR4Traces = ["flick", "slide", "multiple"].map((group) => JSON.parse(gunzipSync(readFileSync(resolve(investigation, `runtime/ordinary-rendering-note-family-r4-${group}.trace.json.gz`))).toString("utf8")));
const hudRuntimeProfile = json("resource_pixi_rendering_hud_runtime_profile.json");
const hudSetterTargets = json("resource_pixi_rendering_hud_setter_targets.json");
const hudVisibleProfile = json("resource_pixi_rendering_hud_visible_profile.json");
const hudVisibleTrace = JSON.parse(gunzipSync(readFileSync(resolve(investigation, "runtime/ordinary-rendering-hud-r3.trace.json.gz"))).toString("utf8"));
const hudFieldR5Targets = json("resource_pixi_rendering_hud_field_r5_targets.json");
const hudFieldR5Profile = json("resource_pixi_rendering_hud_field_r5_profile.json");
const hudFieldR5Traces = ["core", "overlay"].map((group) => JSON.parse(gunzipSync(readFileSync(resolve(investigation, `runtime/ordinary-rendering-hud-field-r5-${group}.trace.json.gz`))).toString("utf8")));
const finalR6Profile = json("resource_pixi_rendering_final_r6_profile.json");
const finalR6Traces = ["flick", "slide", "multiple", "hud-core", "hud-overlay"].map((group) => JSON.parse(gunzipSync(readFileSync(resolve(investigation, `runtime/ordinary-rendering-final-r6-${group}-full.trace.json.gz`))).toString("utf8")));
const geometryOracle = json("resource_pixi_rendering_geometry_oracle.json");
const geometryTrace = JSON.parse(gunzipSync(readFileSync(resolve(investigation, "runtime/ordinary-rendering-geometry-r2.trace.json.gz"))).toString("utf8"));
check(setterTargets.status === "confirmed-10.1.4-render-setter-targets" && setterTargets.targets.length === 10 && setterTargets.unknown_targets.length === 0 && setterTargets.observation_policy.memory_writes === false && setterTargets.observation_policy.managed_invocation === false, "Render setter target evidence differs");
check(geometryTrace.status === "confirmed-render-setter-r2-observation-only" && geometryTrace.events.length === 87037 && geometryTrace.summary.relative_frame_count === 636 && Object.keys(geometryTrace.summary.setter_event_counts).length === 10 && geometryTrace.capture.hook_failures.length === 0 && geometryTrace.capture.memory_writes === false && geometryTrace.capture.managed_invocation === false, "Geometry R2 trace differs");
check(geometryOracle.status === "confirmed-ordinary-render-geometry-oracle" && geometryOracle.coverage.events === 87037 && geometryOracle.coverage.mesh_lifecycle_owners === 510 && geometryOracle.coverage.line_owners === 80 && geometryOracle.mesh.runtime_vertex_count === 22 && geometryOracle.mesh.runtime_vertex_z_bits === "00000000" && geometryOracle.line.start_end_width_equal === true && geometryOracle.unknown_fields.length === 0, "Geometry R2 compact oracle differs");
check(geometryOracle.source.trace_sha256 === sha256(readFileSync(resolve(investigation, geometryOracle.source.trace_path))) && geometryOracle.source.setter_targets_sha256 === sha256(readFileSync(resolve(investigation, geometryOracle.source.setter_targets_path))), "Geometry R2 source hashes differ");
check(lineProfile.status === "confirmed-current-note-sync-line-portable-profile" && lineProfile.serialized_line.position_count === 2 && lineProfile.serialized_line.num_corner_vertices === 0 && lineProfile.serialized_line.num_cap_vertices === 0 && lineProfile.serialized_line.alignment_name === "View" && lineProfile.serialized_line.texture_mode_name === "Stretch" && lineProfile.serialized_line.mask_interaction === 0 && lineProfile.runtime_r2.endpoint_writes === 24470 && lineProfile.runtime_r2.width_writes === 12235 && lineProfile.runtime_r2.equal_start_end_width === true && lineProfile.portable_mapping.primitive === "camera-facing textured quad" && lineProfile.portable_mapping.gpu_raster_parity === false && lineProfile.unknown_fields.length === 0, "Current sync-line portable profile differs");
check(lineProfile.source.geometry_r2_sha256 === sha256(readFileSync(resolve(investigation, lineProfile.source.geometry_r2_path))), "Current sync-line R2 source hash differs");
check(projectionProfile.status === "confirmed-current-ordinary-rhythmgame-orthographic-projection" && projectionProfile.scene.build_index === 3 && projectionProfile.camera.orthographic === true && projectionProfile.camera.orthographic_size === 1 && projectionProfile.portable_viewport.width === 1600 && projectionProfile.portable_viewport.height === 720 && projectionProfile.portable_viewport.pixi_origin === "top-left" && projectionProfile.mapping.pixels_per_world_unit === 360 && projectionProfile.r2_validation.endpoint_writes === 24470 && projectionProfile.r2_validation.width_writes === 12235 && projectionProfile.r2_validation.outside_view_or_clip_count === 0 && projectionProfile.unknown_fields.length === 0, "Current ordinary orthographic projection profile differs");
check(projectionProfile.source.geometry_r2_sha256 === sha256(readFileSync(resolve(investigation, projectionProfile.source.geometry_r2_path))), "Current projection R2 source hash differs");
check(noteGeometryProfile.status === "confirmed-current-ordinary-note-geometry-producer-profile" && noteGeometryProfile.methods.length === 17 && noteGeometryProfile.scene.buttons.length === 13 && noteGeometryProfile.base_mesh.vertex_count === 22 && noteGeometryProfile.base_mesh.index_count === 60 && noteGeometryProfile.sync_line.width_factor === 0.2800000011920929 && noteGeometryProfile.runtime_corroboration.geometry_events === 87037 && noteGeometryProfile.runtime_corroboration.line_endpoint_writes === 24470 && noteGeometryProfile.authorization.ordinary_fixed_1600x720_note_motion === true && noteGeometryProfile.authorization.ordinary_base_note_mesh_producer === true && noteGeometryProfile.authorization.ordinary_sync_line_producer === true && noteGeometryProfile.authorization.advanced_mesh === false && noteGeometryProfile.authorization.threshold_shader === false && noteGeometryProfile.unknown_fields.length === 0, "Current ordinary Note geometry producer profile differs");
check(noteGeometryProfile.source.geometry_oracle_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_geometry_oracle.json"))) && noteGeometryProfile.source.line_profile_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_line_profile.json"))) && noteGeometryProfile.source.projection_profile_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_projection_profile.json"))), "Current Note geometry producer source hashes differ");
check(noteChildLifecycleProfile.status === "confirmed-current-ordinary-long-normal-after-base-mesh-lifecycle-profile" && noteChildLifecycleProfile.methods.length === 30 && noteChildLifecycleProfile.base_mesh_lifecycle.runtime_corroboration.mesh_owners === 510 && noteChildLifecycleProfile.authorization.ordinary_long_normal_after_motion === true && noteChildLifecycleProfile.authorization.ordinary_long_normal_base_mesh_lifecycle === true && noteChildLifecycleProfile.authorization.ordinary_long_flick_after_icon === false && noteChildLifecycleProfile.authorization.ordinary_slide_child_chain === false && noteChildLifecycleProfile.authorization.multiple_directional_lifecycle === false && noteChildLifecycleProfile.authorization.advanced_mesh === false && noteChildLifecycleProfile.authorization.threshold_shader === false && noteChildLifecycleProfile.unknown_fields.length === 0, "Current Note child lifecycle profile differs");
check(noteChildLifecycleProfile.source.static_contract_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_static_contract.json"))) && noteChildLifecycleProfile.source.note_geometry_profile_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_note_geometry_profile.json"))), "Current Note child lifecycle source hashes differ");
check(noteFamilyR4Targets.status === "confirmed-current-note-family-r4-observation-targets" && noteFamilyR4Targets.target_count === 30 && noteFamilyR4Targets.targets.length === 30 && noteFamilyR4Targets.observation_policy.memory_writes === false && noteFamilyR4Targets.observation_policy.managed_invocation === false, "Current Note family R4 targets differ");
check(noteFamilyR4Traces.map((trace) => trace.status).join(",") === "confirmed-current-note-family-r4-flick-observation-only,confirmed-current-note-family-r4-slide-observation-only,confirmed-current-note-family-r4-multiple-observation-only" && noteFamilyR4Traces.reduce((count, trace) => count + trace.events.length, 0) === 118152 && noteFamilyR4Traces.reduce((count, trace) => count + trace.summary.relative_frame_count, 0) === 1258 && noteFamilyR4Traces.every((trace) => trace.summary.completion_requirements_met === true && trace.capture.capture_error === null && trace.capture.hook_failures.length === 0 && trace.capture.loopback_transport_only === true && trace.capture.memory_writes === false && trace.capture.managed_invocation === false), "Current Note family R4 traces differ");
check(noteFamilyR4Profile.status === "confirmed-current-note-family-r4-runtime-profile" && noteFamilyR4Profile.coverage.trace_count === 3 && noteFamilyR4Profile.coverage.event_count === 118152 && noteFamilyR4Profile.coverage.aggregate_relative_frame_count === 1258 && noteFamilyR4Profile.coverage.observed_owner_ids.length === 16 && noteFamilyR4Profile.authorization.ordinary_front_flick_icon === true && noteFamilyR4Profile.authorization.ordinary_front_directional_flick_icon === true && noteFamilyR4Profile.authorization.ordinary_slide_child_chain_mesh === true && noteFamilyR4Profile.authorization.ordinary_slide_child_chain_line === true && noteFamilyR4Profile.authorization.ordinary_multiple_directional_connect_next === true && noteFamilyR4Profile.authorization.ordinary_multiple_directional_back_line === true && noteFamilyR4Profile.authorization.ordinary_long_after_flick_icon === false && noteFamilyR4Profile.authorization.ordinary_slide_wait_state_runtime === false && noteFamilyR4Profile.authorization.advanced_mesh === false && noteFamilyR4Profile.authorization.threshold_shader === false && noteFamilyR4Profile.unknown_fields.length === 0, "Current Note family R4 profile differs");
check(noteFamilyR4Profile.source.targets_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_note_family_r4_targets.json"))) && noteFamilyR4Profile.source.traces.flick === sha256(readFileSync(resolve(investigation, "runtime/ordinary-rendering-note-family-r4-flick.trace.json.gz"))) && noteFamilyR4Profile.source.traces.slide === sha256(readFileSync(resolve(investigation, "runtime/ordinary-rendering-note-family-r4-slide.trace.json.gz"))) && noteFamilyR4Profile.source.traces.multiple === sha256(readFileSync(resolve(investigation, "runtime/ordinary-rendering-note-family-r4-multiple.trace.json.gz"))), "Current Note family R4 source hashes differ");
check(hudRuntimeProfile.status === "confirmed-current-ordinary-hud-runtime-semantic-profile" && hudRuntimeProfile.targets.length === 23 && hudRuntimeProfile.coverage.events === 87364 && hudRuntimeProfile.coverage.hud_caller_entries === 14084 && hudRuntimeProfile.coverage.hud_animation_caller_entries === 1452 && hudRuntimeProfile.life_heal_order.length === 2 && hudRuntimeProfile.life_heal_order.every((row) => row.play_sequence < row.update_view_sequence && row.update_view_sequence < row.update_life_text_sequence) && hudRuntimeProfile.authorization.score_combo_result_life_semantic_commands === true && hudRuntimeProfile.authorization.life_heal_restart_before_life_update === true && hudRuntimeProfile.authorization.damage_guard_animation === false && hudRuntimeProfile.authorization.mask_runtime_ordering === false && hudRuntimeProfile.authorization.pixi_animation_curve_sampling === false && hudRuntimeProfile.unknown_fields.length === 0, "Current ordinary HUD runtime profile differs");
check(hudRuntimeProfile.source.trace_sha256 === deliveryOracle.evidence.ordinary_trace.sha256 && hudRuntimeProfile.source.trace_bytes === deliveryOracle.evidence.ordinary_trace.bytes && hudRuntimeProfile.source.hud_asset_profiles_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_hud_asset_profiles.json"))) && hudRuntimeProfile.source.skill_animation_profiles_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_skill_animation_profiles.json"))), "Current HUD runtime source profile hashes differ");
check(hudSetterTargets.status === "confirmed-current-hud-mask-animation-observation-targets" && hudSetterTargets.targets.length === 22 && hudSetterTargets.unknown_fields.length === 0 && hudSetterTargets.observation_policy.memory_writes === false && hudSetterTargets.observation_policy.managed_invocation === false, "Current HUD setter targets differ");
check(hudVisibleTrace.status === "captured-current-ordinary-hud-r3-observation-only" && hudVisibleTrace.events.length === 19888 && hudVisibleTrace.summary.relative_frame_count === 631 && hudVisibleTrace.capture.hook_failures.length === 0 && hudVisibleTrace.capture.memory_writes === false && hudVisibleTrace.capture.managed_invocation === false, "Current HUD R3 trace differs");
check(hudVisibleProfile.status === "confirmed-current-ordinary-visible-hud-mask-animation-portable-profile" && hudVisibleProfile.coverage.events === 19888 && hudVisibleProfile.bitmap_hud.combo.digit_keys.length === 10 && hudVisibleProfile.bitmap_hud.combo.widget_width === 82 && hudVisibleProfile.bitmap_hud.combo.widget_height === 116 && hudVisibleProfile.animations.combo_number.runtime_restart_count === 631 && hudVisibleProfile.authorization.bitmap_combo_score_life === true && hudVisibleProfile.authorization.ordinary_field_sudden_mask === true && hudVisibleProfile.authorization.combo_animation_sampling === true && hudVisibleProfile.authorization.life_heal_animation_sampling === true && hudVisibleProfile.authorization.damage_guard_animation === false && hudVisibleProfile.authorization.multiple_directional_visual === false && hudVisibleProfile.unknown_fields.length === 0, "Current visible HUD/mask/animation profile differs");
check(hudVisibleProfile.source.trace_sha256 === sha256(readFileSync(resolve(investigation, hudVisibleProfile.source.trace_path))) && hudVisibleProfile.source.setter_targets_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_hud_setter_targets.json"))), "Current visible HUD source hashes differ");
check(hudFieldR5Targets.status === "confirmed-current-hud-field-r5-observation-targets" && hudFieldR5Targets.target_count === 35 && hudFieldR5Targets.targets.length === 35 && Object.values(hudFieldR5Targets.observation_policy).every((value) => value === false), "Current HUD/field R5 targets differ");
check(hudFieldR5Traces.every((trace) => trace.status === "confirmed-current-hud-field-r5-observation-only" && trace.capture.error === null && trace.capture.hook_failures.length === 0 && trace.summary.completion_requirements_met === true) && hudFieldR5Traces.reduce((count, trace) => count + trace.events.length, 0) === 30975 && hudFieldR5Traces.reduce((count, trace) => count + trace.summary.relative_frame_count, 0) === 1059, "Current HUD/field R5 traces differ");
check(hudFieldR5Profile.status === "confirmed-current-hud-field-r5-runtime-profile" && Object.values(hudFieldR5Profile.authorization).filter(Boolean).length === 5 && hudFieldR5Profile.authorization.result_show_change_hide_lifetime === true && hudFieldR5Profile.authorization.score_skill_animation === true && hudFieldR5Profile.authorization.score_gauge_effect === true && hudFieldR5Profile.authorization.life_skill_start_finish === true && hudFieldR5Profile.authorization.generic_skill_display === true && hudFieldR5Profile.authorization.add_score_round_robin_lifecycle === false && hudFieldR5Profile.authorization.judge_timing_sprite_lifetime === false && hudFieldR5Profile.authorization.damage_guard_animation === false && hudFieldR5Profile.authorization.never_die_animation === false && hudFieldR5Profile.authorization.ordinary_field_setup_sudden_lane === false && hudFieldR5Profile.unknown_fields.length === 0, "Current HUD/field R5 profile differs");
check(hudFieldR5Profile.source.targets_sha256 === sha256(readFileSync(resolve(investigation, "resource_pixi_rendering_hud_field_r5_targets.json"))) && hudFieldR5Profile.coverage.core.trace_sha256 === sha256(readFileSync(resolve(investigation, "runtime/ordinary-rendering-hud-field-r5-core.trace.json.gz"))) && hudFieldR5Profile.coverage.overlay.trace_sha256 === sha256(readFileSync(resolve(investigation, "runtime/ordinary-rendering-hud-field-r5-overlay.trace.json.gz"))), "Current HUD/field R5 source hashes differ");
check(finalR6Traces.every((trace) => trace.status.startsWith("confirmed-current-") && trace.summary.completion_requirements_met === true) && finalR6Traces.reduce((count, trace) => count + trace.events.length, 0) === 190401 && finalR6Traces.reduce((count, trace) => count + trace.summary.relative_frame_count, 0) === 2492, "Final R6 traces differ");
check(finalR6Profile.status === "confirmed-current-final-r6-conservative-profile" && finalR6Profile.coverage.event_count === 190401 && finalR6Profile.coverage.aggregate_relative_frame_count === 2492 && finalR6Profile.coverage.observed_owner_target_count === 26 && finalR6Profile.authorization.all_perfect_exec_update_active_gate === true && finalR6Profile.authorization.add_score_coroutine === false && finalR6Profile.authorization.field_early_setup === false && finalR6Profile.authorization.advanced_mesh === false && finalR6Profile.authorization.threshold_shader_mapping === false && finalR6Profile.authorization.habahiro_exact === false && finalR6Profile.unknown_fields.length === 0, "Final R6 conservative profile differs");

const portable = json("resource_pixi_rendering_portable_contract.json");
check(portable.status === "confirmed-offline-portable-draft-runtime-order-gate-open" && portable.production_authorization === false && portable.unknown_fields.length === 0, "Portable draft differs");
check(portable.resource_profile.network_allowed === false && portable.resource_profile.fallback_alias_allowed === false && portable.resource_profile.placeholder_allowed === false, "Portable resource policy differs");
check(portable.resource_profile.habahiro_exact_status === "evidence-required-current-bundle-absent-from-cache-index" && portable.resource_profile.habahiro_degraded_status === "explicit-profile-allowed-not-original-parity" && portable.resource_profile.automatic_degraded_fallback_allowed === false, "Portable HABAHIRO dual-track resource policy differs");
const cases = json("resource_pixi_rendering_fixed_case_status.json");
check(cases.status === "confirmed-offline-case-classification-server-gate-open" && cases.cases.length === 40 && cases.unknown_cases.length === 0 && cases.production_authorization === false, "PR case classification differs");
check(cases.cases.map((row) => row.case).join(",") === Array.from({ length: 40 }, (_, index) => `PR${String(index + 1).padStart(2, "0")}`).join(","), "PR case IDs differ");
check(cases.degraded_habahiro_disposition.status === "accepted-for-explicit-preview-not-original-parity" && Object.keys(cases.degraded_habahiro_disposition.cases).join(",") === "PR01,PR04,PR19,PR40" && cases.degraded_habahiro_disposition.exact_case_statuses_unchanged === true, "PR degraded HABAHIRO disposition differs");

const closure = json("offline_closure.json");
check(closure.status === "offline-work-gate-closed-server-required-gate-open" && closure.offline_work_gate === "closed" && closure.offline_plan_gate === "closed" && closure.rendering_gate === "open" && closure.production_authorization === false, "Offline closure differs");
check(closure.habahiro_exact_parity_gate === "open" && closure.habahiro_degraded_delivery_gate === "closed-authorized-by-explicit-user-request" && closure.degraded_habahiro.automatic_fallback === false && closure.degraded_habahiro.difference_count === 12, "Offline HABAHIRO dual-track closure differs");
check(closure.runtime_capture_plan.hook_target_count === 55 && closure.runtime_capture_plan.r1_scenarios.length === 2 && closure.runtime_capture_plan.physical_frame_anchors === 13, "Offline runtime plan summary differs");
check(Object.keys(closure.historical_candidate_status).length === 28 && Object.keys(closure.decision_status).length === 18, "H/D closure counts differ");
check(closure.unknown_static_work.length === 0 && closure.unknown_fields.length === 0 && closure.remaining_blockers_all_require_game_server === true, "Offline closure retains non-server work");
check(closure.remaining_blockers.map((row) => row.id).join(",") === "S01,S02,S03", "Offline closure blocker IDs differ");

console.log(`verified resource/Pixi delivery evidence: entries=826 methods=673 layouts=32 enums=19 resources=11026/57/100 profiles=8+4+4+5 plans=55/2/13 geometry=87037 line=1 projection=1 producer=1 child=1/13 R4=118152/1258/30 R5=30975/1059/35/5 R6=190401/2492/26/1 hud-runtime=1 visible-hud=19888/631/22 HAB=2/12/179 exact=open degraded=authorized H=28 D=18 PR=40 offline=closed delivery=closed exact-HAB=open production=true${validateIndex ? " index=checked" : ""}`);
