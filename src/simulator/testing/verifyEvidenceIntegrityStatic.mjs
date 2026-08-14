import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const simulatorRoot = resolve(testingRoot, "..");
const auditRoot = join(simulatorRoot, "audit");
const matrix = json("current-capability-matrix.json");
const claims = json("current-claim-ledger.json");
const integrity = json("current-production-integrity-review.json");
const fieldIndex = json("current-field-claim-index.json");
const mutations = json("current-mutation-boundaries.json");
const attestation = json("current-final-capability-attestation.json");
const readme = readFileSync(join(simulatorRoot, "README.md"), "utf8");
const auditReadme = readFileSync(join(auditRoot, "README.md"), "utf8");
const publicContracts = readFileSync(join(simulatorRoot, "public", "contracts.ts"), "utf8");
const publicCapabilities = readFileSync(join(simulatorRoot, "public", "capabilities.ts"), "utf8");

const productionRoots = new Set([
  "assembly", "backends", "engine", "host", "platform", "public", "resources", "runtime", "scene",
]);
const currentProductionFiles = [...walk(simulatorRoot)]
  .filter((path) => extname(path) === ".ts")
  .map((path) => path.slice(simulatorRoot.length + 1).replaceAll("\\", "/"))
  .filter((path) => path === "index.ts" || productionRoots.has(path.split("/")[0]))
  .map((path) => `src/simulator/${path}`)
  .sort();

if (matrix.schemaVersion !== 1 || matrix.auditStatus !== "ordinary-single-rendering-bounded-release" ||
    !Array.isArray(matrix.rows) || matrix.rows.length !== 15) {
  throw new Error("bounded-release capability matrix is missing or malformed");
}
if (claims.schemaVersion !== 1 || claims.auditStatus !== matrix.auditStatus ||
    claims.rules?.forbidUnscopedCompletionClaims !== true || claims.rules?.recordingOrSourceMarkersCannotClosePositiveGate !== true) {
  throw new Error("bounded-release claim ledger does not fail closed");
}
const allowedStatuses = new Set([
  "closed-portable", "closed-original-unreachable", "degraded-explicit", "excluded",
  "open-evidence-required", "open-device-exact", "open-objective-environment-blocked", "unauthorized-stage-9",
]);
const rows = new Map();
for (const row of matrix.rows) {
  if (typeof row.id !== "string" || rows.has(row.id) || !allowedStatuses.has(row.status)) {
    throw new Error(`invalid capability row: ${row.id}`);
  }
  rows.set(row.id, row);
}
const expectedClosed = [
  "CAP-AUDIO-01", "CAP-CHART-01", "CAP-HAB-01", "CAP-PARTICLE-01", "CAP-PRACTICE-01",
  "CAP-PUBLIC-01", "CAP-RENDER-BROWSER-01", "CAP-RENDER-ORDINARY-01",
  "CAP-RENDER-PARTICLE-COMPOSITION-01", "CAP-RUNTIME-01",
].sort();
const actualClosed = matrix.rows.filter((row) => row.status === "closed-portable").map((row) => row.id).sort();
if (JSON.stringify(actualClosed) !== JSON.stringify(expectedClosed) ||
    matrix.rows.some((row) => row.status === "reopened-audit")) {
  throw new Error(`bounded portable scope mismatch: ${actualClosed.join(",")}`);
}
for (const id of ["CAP-RENDER-ORDINARY-01", "CAP-RENDER-PARTICLE-COMPOSITION-01"]) {
  const row = rows.get(id);
  if (row.status !== "closed-portable" || !row.reverseEvidence.some((value) => value.includes("b5fb3dca")) ||
      typeof row.dynamicRequirement !== "string") {
    throw new Error(`${id} lacks current candidate evidence/DAG boundary`);
  }
}
if (rows.get("CAP-HAB-EXACT-01")?.status !== "open-evidence-required" ||
    rows.get("CAP-DEVICE-01")?.status !== "open-objective-environment-blocked" ||
    rows.get("CAP-EXCLUDED-01")?.status !== "excluded" ||
    rows.get("CAP-STAGE9-01")?.status !== "unauthorized-stage-9") {
  throw new Error("non-positive capability boundaries changed");
}
const claimById = new Map(claims.allowedClaims.map((row) => [row.id, row]));
for (const id of ["CLAIM-ORDINARY-COMMAND-SCENE", "CLAIM-PARTICLE-VISIBLE-COMPOSITION"]) {
  if (claimById.get(id)?.auditDisposition !== "closed-portable") {
    throw new Error(`${id} was not boundedly released`);
  }
}

if (integrity.schemaVersion !== 2 || integrity.status !== "final-ordinary-single-rendering-evidence-bounded-release" ||
    integrity.currentDisposition !== "R14-final-release-attested" ||
    integrity.ordinaryRenderingPositiveAuthority !== true || integrity.currentProductionFileCount !== 104 ||
    currentProductionFiles.length !== 104 || integrity.reviewPolicy?.groupMappingIsNotBlanketAuthorization !== true ||
    integrity.reviewPolicy?.exactClaimBindingRequired !== true || integrity.reverseAudit?.commit !== "b5fb3dca34b26511355879d62839661c5cf505d3" ||
    integrity.reverseAudit?.inventoryTargetCommit !== "2b758eb6c40632c8c658e97772b9cb7afb5785fd" ||
    integrity.reverseAudit?.productionFileCount !== 104 || integrity.reverseAudit?.occurrenceCount !== 22210 ||
    integrity.reverseAudit?.fieldClaimCount !== 14721 || integrity.reverseAudit?.mutationPointCount !== 281 ||
    integrity.reverseAudit?.completionClaimCount !== 647 || integrity.reverseAudit?.unreviewedOrSupportedUnknown !== 0) {
  throw new Error("production integrity review does not match the pushed final schema-4 release ledger");
}
if (integrity.candidateDetachedDag?.status !== "passed" || integrity.candidateDetachedDag?.uniqueLeaves !== 26 ||
    integrity.candidateDetachedDag?.commit !== "5a25161cbb0fc179c877c4153dd9efeab17edcd2" ||
    integrity.candidateDetachedDag?.elapsedMilliseconds !== 2067351) {
  throw new Error("candidate detached DAG identity changed");
}
const boundedProductionFiles = [
  "src/simulator/public/capabilities.ts",
  "src/simulator/public/contracts.ts",
];
if (integrity.releaseTransition?.status !== "passed-pushed-detached-release" ||
    integrity.releaseTransition?.commit !== "2b758eb6c40632c8c658e97772b9cb7afb5785fd" ||
    integrity.releaseTransition?.finalReverseLedgerCommit !== integrity.reverseAudit.commit ||
    integrity.releaseTransition?.globalGateOpenAfterTransition !== false ||
    integrity.releaseTransition?.ordinaryCommandScene !== "closed-portable" ||
    integrity.releaseTransition?.ordinaryParticleVisibleComposition !== "closed-portable" ||
    integrity.releaseTransition?.uniqueLeaves !== 26 || integrity.releaseTransition?.elapsedMilliseconds !== 1153047 ||
    integrity.releaseTransition?.sourceCodeCopied !== false || integrity.releaseTransition?.nodeModulesOnlyReused !== true ||
    integrity.releaseTransition?.networkUsed !== false || integrity.releaseTransition?.reverseWorktreeRead !== false ||
    JSON.stringify(integrity.releaseTransition?.boundedProductionFiles) !== JSON.stringify(boundedProductionFiles)) {
  throw new Error("final release transition or detached DAG is not bounded");
}
if (integrity.ordinaryWebView2?.productionRenderDecoder !== "BrowserPixiTextureDecoder" ||
    integrity.ordinaryWebView2?.productionParticleDecoder !== "BrowserPixiParticleTextureDecoder" ||
    integrity.ordinaryWebView2?.combinedRoot !== true || integrity.ordinaryWebView2?.freshProcesses !== 3 ||
    integrity.ordinaryWebView2?.capturesPerProcess !== 17 ||
    integrity.ordinaryWebView2?.aggregateSha256 !== "100f640350d9f49b41cc94a2df47284b42f8e46f182fce7c862a8b921e791538" ||
    integrity.ordinaryWebView2?.originalUnityFramebufferOracle !== false) {
  throw new Error("final ordinary WebView2 observation changed scope");
}

if (fieldIndex.schemaVersion !== 4 || fieldIndex.status !== "final-release-per-claim-indexed-and-attested" ||
    fieldIndex.reverseCommit !== integrity.reverseAudit.commit || fieldIndex.targetGarupaCommit !== integrity.reverseAudit.inventoryTargetCommit ||
    fieldIndex.counts?.productionFiles !== 104 || fieldIndex.counts?.behaviorOccurrences !== 22210 ||
    fieldIndex.counts?.fieldClaims !== 14721 || fieldIndex.counts?.mutationPoints !== 281 ||
    fieldIndex.counts?.completionClaims !== 647 || fieldIndex.unreviewedOccurrenceCount !== 0 ||
    fieldIndex.unreviewedFieldClaimCount !== 0 || fieldIndex.unreviewedMutationCount !== 0 ||
    fieldIndex.unreviewedCompletionClaimCount !== 0 || fieldIndex.reachableSupportedUnknownCount !== 0 ||
    fieldIndex.groupMappingIsNotAuthorization !== true || fieldIndex.exactClaimBindingRequired !== true ||
    fieldIndex.globalGateOpen !== false || fieldIndex.releaseDetachedDag?.elapsedMilliseconds !== 1153047) {
  throw new Error("current field pointer does not match final Reverse release ledger");
}
if (mutations.schemaVersion !== 4 || mutations.status !== "final-release-mutations-dispositioned-and-attested" ||
    mutations.reverseCommit !== fieldIndex.reverseCommit || mutations.targetGarupaCommit !== fieldIndex.targetGarupaCommit ||
    mutations.mutationPointCount !== 281 || mutations.unreviewedMutationCount !== 0 ||
    mutations.perMutationDispositionRequired !== true || mutations.exactClaimBindingRequired !== true ||
    mutations.releaseBoundary?.globalGateOpen !== false || mutations.releaseBoundary?.releaseDetachedDagPassed !== true ||
    JSON.stringify(mutations.releaseBoundary?.boundedProductionDelta) !== JSON.stringify(boundedProductionFiles)) {
  throw new Error("current mutation boundary does not match final release");
}

if (!publicCapabilities.includes("simulator.audit.total-revalidation-open") ||
    !/isTotalRevalidationOpen\(\): boolean \{\s*return false;\s*\}/m.test(publicCapabilities) ||
    !publicCapabilities.includes('ordinaryCommandScene: "closed-portable"') ||
    publicCapabilities.includes('? "reopened-audit"') || publicContracts.includes('| "reopened-audit"')) {
  throw new Error("public total gate or ordinary summary was not boundedly closed");
}
for (const field of [
  "publicAutonomousCore", "ordinaryCommandScene", "habahiroCurrentExternalComplete", "habahiroOriginalParity",
  "nonzeroInitialPracticeSeek", "button07SceneMapping", "browserDecodeRaster", "fixedDeviceExact",
  "characterSkillFeverMultiplayer", "mainProgramIntegration", "selectedRenderingGate",
]) {
  if (!publicContracts.includes(`readonly ${field}:`) || !publicCapabilities.includes(`${field}:`)) {
    throw new Error(`public capability summary omitted ${field}`);
  }
}

if (attestation.schemaVersion !== 2 ||
    attestation.status !== "final-ordinary-single-rendering-evidence-bounded-release-attestation" ||
    attestation.implementation?.releaseCommit !== integrity.releaseTransition.commit ||
    attestation.reverseLedger?.commit !== integrity.reverseAudit.commit ||
    attestation.reverseLedger?.targetReleaseCommit !== integrity.reverseAudit.inventoryTargetCommit ||
    attestation.reverseLedger?.counts?.productionFiles !== 104 ||
    attestation.reverseLedger?.counts?.behaviorOccurrences !== 22210 ||
    attestation.reverseLedger?.counts?.fieldClaims !== 14721 ||
    attestation.reverseLedger?.counts?.mutationPoints !== 281 ||
    attestation.reverseLedger?.counts?.completionStatusOccurrences !== 647 ||
    attestation.reverseLedger?.unreviewedOrSupportedUnknown !== 0 ||
    attestation.reverseLedger?.groupMappingIsNotAuthorization !== true ||
    attestation.reverseLedger?.exactClaimBindingRequired !== true ||
    attestation.validation?.candidate?.elapsedMilliseconds !== 2067351 ||
    attestation.validation?.release?.elapsedMilliseconds !== 1153047 ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.renderDecoder !== "BrowserPixiTextureDecoder" ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.particleDecoder !== "BrowserPixiParticleTextureDecoder" ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.freshProcessRepeatCount !== 3 ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.capturesPerProcess !== 17 ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.aggregateSha256 !== "100f640350d9f49b41cc94a2df47284b42f8e46f182fce7c862a8b921e791538" ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.candidateDigestClaimedAsOriginalUnityOracle !== false ||
    attestation.boundaries?.aggregateOriginalParityClaimed !== false ||
    attestation.boundaries?.positiveFixedDeviceExactClaims !== 0 ||
    attestation.boundaries?.mainProgramIntegrationAuthorization !== false ||
    attestation.boundaries?.audioPhysicalPerformanceClaimedByVisualHarness !== false ||
    integrity.finalAttestation?.positiveAuthorityForBoundedOrdinaryPortableRelease !== true) {
  throw new Error("final ordinary release attestation identity or boundary changed");
}
for (const source of [readme, auditReadme]) {
  if (/(?:^|[\\/`])tmp[\\/]/m.test(source)) throw new Error("committed documentation cites ignored local work");
}
for (const path of walk(simulatorRoot)) {
  if (extname(path) !== ".md") continue;
  if (/(?:^|[\\/`])tmp[\\/]/m.test(readFileSync(path, "utf8"))) {
    throw new Error(`committed simulator documentation cites ignored local work: ${path}`);
  }
}
for (const literal of [
  "closed-portable", "closed-original-unreachable", "excluded", "open-evidence-required",
  "open-objective-environment-blocked", "unauthorized-stage-9",
]) {
  if (!publicContracts.includes(`"${literal}"`) || !readme.includes(`\`${literal}\``)) {
    throw new Error(`public contract or README omitted gate literal: ${literal}`);
  }
}

console.log(`evidence-integrity final ordinary release passed: capabilities=${matrix.rows.length} claims=${claims.allowedClaims.length} production-files=${currentProductionFiles.length} candidate/release-leaves=${integrity.candidateDetachedDag.uniqueLeaves}/${integrity.releaseTransition.uniqueLeaves}`);

function json(name) {
  return JSON.parse(readFileSync(join(auditRoot, name), "utf8"));
}

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
