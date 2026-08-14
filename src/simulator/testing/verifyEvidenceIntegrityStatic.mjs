import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const simulatorRoot = resolve(testingRoot, "..");
const matrixPath = join(simulatorRoot, "audit", "current-capability-matrix.json");
const claimsPath = join(simulatorRoot, "audit", "current-claim-ledger.json");
const integrityPath = join(simulatorRoot, "audit", "current-production-integrity-review.json");
const fieldIndexPath = join(simulatorRoot, "audit", "current-field-claim-index.json");
const mutationPath = join(simulatorRoot, "audit", "current-mutation-boundaries.json");
const attestationPath = join(simulatorRoot, "audit", "current-final-capability-attestation.json");
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
const claims = JSON.parse(readFileSync(claimsPath, "utf8"));
const integrity = JSON.parse(readFileSync(integrityPath, "utf8"));
const fieldIndex = JSON.parse(readFileSync(fieldIndexPath, "utf8"));
const mutations = JSON.parse(readFileSync(mutationPath, "utf8"));
const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
const readme = readFileSync(join(simulatorRoot, "README.md"), "utf8");
const publicContracts = readFileSync(join(simulatorRoot, "public", "contracts.ts"), "utf8");
const publicCapabilities = readFileSync(join(simulatorRoot, "public", "capabilities.ts"), "utf8");

if (matrix.schemaVersion !== 1 || !Array.isArray(matrix.rows) || matrix.rows.length === 0) {
  throw new Error("capability matrix is missing or empty");
}
if (claims.schemaVersion !== 1 || claims.rules?.forbidUnscopedCompletionClaims !== true) {
  throw new Error("claim ledger does not fail closed");
}
const productionRoots = new Set([
  "assembly", "backends", "engine", "host", "platform", "public", "resources", "runtime", "scene",
]);
const currentProductionFiles = [...walk(simulatorRoot)]
  .filter((path) => extname(path) === ".ts")
  .map((path) => path.slice(simulatorRoot.length + 1).replaceAll("\\", "/"))
  .filter((path) => path === "index.ts" || productionRoots.has(path.split("/")[0]))
  .map((path) => `src/simulator/${path}`)
  .sort();
if (
  integrity.schemaVersion !== 1 || integrity.status !== "final-evidence-bounded-capability-attestation" ||
  integrity.currentDisposition !== "historical-pre-ordinary-single-rendering-total-reaudit" ||
  integrity.ordinaryRenderingPositiveAuthority !== false ||
  integrity.reviewPolicy?.sourceOccurrenceIsNotEvidence !== true ||
  integrity.reviewPolicy?.groupMappingIsNotBlanketAuthorization !== true ||
  integrity.reviewPolicy?.currentInventoryRequired !== true ||
  typeof integrity.supersededReason !== "string"
) {
  throw new Error("production integrity review does not describe the bounded portable release candidate");
}
const ids = new Set();
const statuses = new Set([
  "closed-portable", "closed-original-unreachable", "degraded-explicit", "excluded", "open-evidence-required",
  "open-device-exact", "open-objective-environment-blocked", "unauthorized-stage-9", "reopened-audit",
]);
for (const row of matrix.rows) {
  if (typeof row.id !== "string" || ids.has(row.id)) throw new Error("capability IDs must be unique");
  ids.add(row.id);
  if (!statuses.has(row.status)) throw new Error(`${row.id} has an unclassified status: ${row.status}`);
  if (row.status === "reopened-audit" && typeof row.dynamicRequirement !== "string") {
    throw new Error(`${row.id} is reopened without a current dynamic requirement`);
  }
  if (row.status === "open-evidence-required" && typeof row.failureBoundary !== "string" && row.id !== "CAP-HAB-EXACT-01") {
    throw new Error(`${row.id} lacks an early failure boundary`);
  }
}
for (const required of ["CAP-PRACTICE-01", "CAP-SCENE-07", "CAP-HAB-01", "CAP-HAB-EXACT-01", "CAP-DEVICE-01", "CAP-STAGE9-01", "CAP-EXCLUDED-01"]) {
  if (!ids.has(required)) throw new Error(`capability matrix omitted ${required}`);
}
const closedPortableIds = matrix.rows.filter((row) => row.status === "closed-portable").map((row) => row.id).sort();
const expectedClosedPortableIds = [
  "CAP-AUDIO-01", "CAP-CHART-01", "CAP-HAB-01", "CAP-PARTICLE-01", "CAP-PRACTICE-01", "CAP-PUBLIC-01",
  "CAP-RENDER-BROWSER-01", "CAP-RUNTIME-01",
];
if (JSON.stringify(closedPortableIds) !== JSON.stringify(expectedClosedPortableIds)) {
  throw new Error(`portable scope changed while ordinary rendering is reopened: ${closedPortableIds.join(",")}`);
}
const reopenedIds = matrix.rows.filter((row) => row.status === "reopened-audit").map((row) => row.id).sort();
if (JSON.stringify(reopenedIds) !== JSON.stringify([
  "CAP-RENDER-ORDINARY-01", "CAP-RENDER-PARTICLE-COMPOSITION-01",
])) {
  throw new Error(`ordinary rendering reaudit scope changed: ${reopenedIds.join(",")}`);
}
if (matrix.auditStatus !== "ordinary-single-rendering-total-reaudit-open" ||
    claims.auditStatus !== "ordinary-single-rendering-total-reaudit-open") {
  throw new Error("machine ledgers do not identify the open ordinary rendering total reaudit");
}
const publicGateLiterals = [
  "closed-portable", "closed-original-unreachable", "reopened-audit", "degraded-explicit", "excluded", "open-evidence-required",
  "open-device-exact", "open-objective-environment-blocked", "unauthorized-stage-9",
];
for (const literal of publicGateLiterals) {
  if (!publicContracts.includes(`\"${literal}\"`) || !readme.includes(`\`${literal}\``)) {
    throw new Error(`public contract or README omitted gate literal: ${literal}`);
  }
}
for (const field of [
  "publicAutonomousCore", "ordinaryCommandScene", "habahiroCurrentExternalComplete",
  "habahiroOriginalParity", "nonzeroInitialPracticeSeek", "button07SceneMapping",
  "browserDecodeRaster", "fixedDeviceExact", "characterSkillFeverMultiplayer",
  "mainProgramIntegration", "selectedRenderingGate",
]) {
  if (!publicContracts.includes(`readonly ${field}:`) || !publicCapabilities.includes(`${field}:`)) {
    throw new Error(`public capability summary omitted or failed to populate ${field}`);
  }
}
for (const [pattern, label] of [
  [/完整单人谱面玩法/, "unscoped complete single-player claim"],
  [/已完成普通可见渲染/, "unscoped rendering completion claim"],
  [/真实PNG\/TTF.*actual Pixi/, "synthetic decoder described as real browser output"],
  [/(?:^|[\\/`])tmp[\\/]/m, "committed local-working-document reference"],
]) {
  if (pattern.test(readme)) throw new Error(`README claim violation: ${label}`);
}
for (const path of walk(simulatorRoot)) {
  if (extname(path) !== ".md") continue;
  const source = readFileSync(path, "utf8");
  if (/(?:^|[\\/`])tmp[\\/]/m.test(source)) {
    throw new Error(`committed simulator documentation cites ignored local work: ${path}`);
  }
}
if (
  attestation.schemaVersion !== 1 ||
  attestation.status !== "final-evidence-bounded-capability-attestation" ||
  attestation.currentDisposition !== "historical-pre-ordinary-single-rendering-total-reaudit" ||
  attestation.supersededForPositiveOrdinaryRenderingClaims !== true ||
  attestation.implementation?.commit !== "9ab1ff7a339fa3cfd395c5f6fe841e1f3f1585a9" ||
  attestation.reverseLedger?.commit !== "36a6941fab361c1f6bcf1eef02069d4867f565c7" ||
  attestation.reverseLedger?.counts?.productionFiles !== 102 ||
  attestation.reverseLedger?.counts?.behaviorOccurrences !== 21649 ||
  attestation.reverseLedger?.counts?.fieldClaims !== 14322 ||
  attestation.reverseLedger?.counts?.mutationPoints !== 269 ||
  attestation.reverseLedger?.counts?.completionStatusOccurrences !== 637 ||
  attestation.reverseLedger?.unreviewedOrSupportedUnknown !== 0 ||
  attestation.validation?.uniqueLeaves !== 25 ||
  attestation.validation?.worktree?.status !== "historical-pre-score-hud-reaudit-passed" ||
  attestation.validation?.worktree?.elapsedMilliseconds !== 506162 ||
  attestation.validation?.pushedDetachedImplementation?.commit !== "9ab1ff7a339fa3cfd395c5f6fe841e1f3f1585a9" ||
  attestation.validation?.pushedDetachedImplementation?.elapsedMilliseconds !== 1374768 ||
  attestation.validation?.pushedDetachedImplementation?.sourceCodeCopied !== false ||
  attestation.validation?.pushedDetachedImplementation?.nodeModulesOnlyReused !== true ||
  attestation.validation?.pushedDetachedImplementation?.networkUsed !== false ||
  attestation.validation?.productionBrowserLeaf?.executedInCurrentDetachedDag !== true ||
  attestation.validation?.productionBrowserLeaf?.scoreHudRasterSha256 !== "7ba90fba47ab94580da4285ffe6086078c7d3d4451cfcdea0139e935c86369a5" ||
  attestation.validation?.productionBrowserLeaf?.scoreHudNonTransparentPixels !== 28587 ||
  attestation.validation?.productionBrowserLeaf?.scoreHudFreshProcessRepeatCount !== 2 ||
  JSON.stringify(attestation.validation?.productionBrowserLeaf?.scoreHudMaskWorldBoundsAtSsThreshold) !== "[456,82.5,831,121.5]" ||
  JSON.stringify(attestation.validation?.productionBrowserLeaf?.scoreHudFirstDigitWorldTransform) !== "[324,135]" ||
  attestation.boundaries?.aggregateOriginalParityClaimed !== false ||
  attestation.boundaries?.positiveFixedDeviceExactClaims !== 0 ||
  attestation.boundaries?.rejectedDeviceTracesReclassified !== false ||
  attestation.boundaries?.autoLiveBudgetRemaining !== 10 ||
  attestation.boundaries?.r2Used !== false ||
  attestation.boundaries?.mainProgramIntegrationAuthorization !== false ||
  attestation.preReauditAttestationCommitValidation?.commit !== "dadf952ae2d5526b0eff92856f3e03f132e23892" ||
  attestation.preReauditAttestationCommitValidation?.pushedDetachedUniqueLeaves !== 25 ||
  attestation.preReauditAttestationCommitValidation?.pushedDetachedElapsedMilliseconds !== 526895 ||
  attestation.preReauditAttestationCommitValidation?.productionBrowserWebView2Executed !== true ||
  attestation.preReauditAttestationCommitValidation?.originEqualsHead !== true ||
  attestation.scoreHudPerformanceReaudit?.productionFixCommit !== "d274b242226e2b5eeb6a873b2c39c2765767c191" ||
  attestation.scoreHudPerformanceReaudit?.independentVerifierCommit !== "9ab1ff7a339fa3cfd395c5f6fe841e1f3f1585a9" ||
  attestation.scoreHudPerformanceReaudit?.reverseLedgerCommit !== "36a6941fab361c1f6bcf1eef02069d4867f565c7" ||
  attestation.scoreHudPerformanceReaudit?.originalUnitySoftClipShaderRasterClaimed !== false ||
  attestation.scoreHudPerformanceReaudit?.fixedDeviceFramebufferClaimed !== false
) {
  throw new Error("final capability attestation identity, DAG or non-positive boundary changed");
}
if (
  integrity.finalCapabilityContinuation?.implementationCommit !== attestation.implementation.commit ||
  integrity.finalCapabilityContinuation?.reverseLedgerCommit !== attestation.reverseLedger.commit ||
  integrity.finalCapabilityContinuation?.unreviewedOrSupportedUnknown !== 0 ||
  integrity.finalCapabilityContinuation?.worktreeDag?.uniqueLeaves !== 25 ||
  integrity.finalCapabilityContinuation?.pushedDetachedDag?.uniqueLeaves !== 25 ||
  integrity.finalCapabilityContinuation?.pushedDetachedDag?.productionBrowserWebView2Executed !== true ||
  integrity.finalCapabilityContinuation?.pushedDetachedDag?.completeScoreHudWebView2Executed !== true ||
  integrity.finalCapabilityContinuation?.pushedDetachedDag?.scoreHudRasterSha256 !== "7ba90fba47ab94580da4285ffe6086078c7d3d4451cfcdea0139e935c86369a5"
) {
  throw new Error("integrity review does not point to the final pushed ledger and DAG");
}
if (
  fieldIndex.schemaVersion !== 2 ||
  fieldIndex.status !== "final-candidate-per-claim-indexed-behind-global-gate" ||
  fieldIndex.reverseCommit !== "0ddc5fbd44ac8eb5a5d0b6667e259fbc1f7fa52a" ||
  fieldIndex.targetGarupaCommit !== "9b5fdcb9267aa1d293b34c7306cec71f5c7e8590" ||
  fieldIndex.counts?.productionFiles !== 102 || fieldIndex.counts?.behaviorOccurrences !== 21322 ||
  fieldIndex.counts?.fieldClaims !== 14158 || fieldIndex.counts?.completionClaims !== 555 ||
  fieldIndex.fieldDispositionCounts?.["field-evidence-bound"] !== 13931 ||
  fieldIndex.fieldDispositionCounts?.["early-evidence-required"] !== 225 ||
  fieldIndex.fieldDispositionCounts?.excluded !== 2 || fieldIndex.reachableSupportedUnknownCount !== 0 ||
  mutations.schemaVersion !== 2 ||
  mutations.status !== "final-candidate-mutations-indexed-behind-global-gate" ||
  mutations.reverseCommit !== fieldIndex.reverseCommit ||
  mutations.mutationPointCount !== 253 || mutations.productionAcceptedMutationPointCount !== 0 ||
  mutations.perMutationDispositionRequired !== true ||
  mutations.earliestBoundary?.capability !== "simulator.audit.total-revalidation-open"
) {
  throw new Error("current field or mutation pointer does not match the pushed Reverse schema v2 inventory");
}
const publicLaunch = readFileSync(join(simulatorRoot, "public", "launch.ts"), "utf8");
if (!publicCapabilities.includes("simulator.audit.total-revalidation-open") ||
    !publicCapabilities.includes("return true") ||
    !publicLaunch.includes("launchInstalledSimulatorModule(request)")) {
  throw new Error("public launch did not perform the bounded total-revalidation gate transition");
}
if (
  integrity.releaseTransition?.status !== "passed-pushed-detached-dag" ||
  integrity.releaseTransition?.prerequisiteCandidateCommit !== "735a040dc91c97dda8dc09ed1022d0771b8e04d2" ||
  integrity.releaseTransition?.prerequisiteDetachedDag?.status !== "passed" ||
  integrity.releaseTransition?.prerequisiteDetachedDag?.uniqueLeaves !== 23 ||
  integrity.releaseTransition?.prerequisiteDetachedDag?.scoreMaskIndependentRawRows !== 20 ||
  integrity.releaseTransition?.prerequisiteDetachedDag?.syntheticDecoderClaimsBrowserRaster !== false ||
  integrity.releaseTransition?.prerequisiteDetachedDag?.syntheticDecoderClaimsDeviceExact !== false ||
  integrity.releaseTransition?.releaseCommit !== "0d0e4459f295f2d6cbbe7f4a1f93d07a1c9980fa" ||
  integrity.releaseTransition?.releaseDetachedDag?.status !== "passed" ||
  integrity.releaseTransition?.releaseDetachedDag?.source !== "pushed-detached-head" ||
  integrity.releaseTransition?.releaseDetachedDag?.uniqueLeaves !== 23 ||
  integrity.releaseTransition?.releaseDetachedDag?.elapsedMilliseconds !== 985307 ||
  integrity.releaseTransition?.releaseDetachedDag?.scoreMaskIndependentRawRows !== 20 ||
  integrity.releaseTransition?.releaseDetachedDag?.browserDecodeRaster !== "open-evidence-required" ||
  integrity.releaseTransition?.releaseDetachedDag?.fixedDeviceExact !== "open-device-exact" ||
  integrity.releaseTransition?.releaseDetachedDag?.mainProgramIntegration !== "unauthorized-stage-9" ||
  JSON.stringify(integrity.releaseTransition?.boundedProductionFiles) !== JSON.stringify([
    "src/simulator/public/capabilities.ts",
    "src/simulator/public/contracts.ts",
    "src/simulator/public/launch.ts",
  ])
) {
  throw new Error("portable release transition lacks the exact prerequisite detached attestation and bounded delta");
}
console.log(`evidence-integrity ordinary-rendering reaudit gate passed: capabilities=${matrix.rows.length} claims=${claims.allowedClaims.length} current-production-files=${currentProductionFiles.length} historical-leaves=${attestation.validation.uniqueLeaves}`);

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
