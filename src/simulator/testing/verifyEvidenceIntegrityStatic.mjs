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
  if (row.status !== "closed-portable" || !row.reverseEvidence.some((value) => value.includes("3f9ef788")) ||
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

if (integrity.schemaVersion !== 2 || integrity.status !== "ordinary-single-rendering-bounded-release-candidate" ||
    integrity.currentDisposition !== "R11-candidate-ledger-verified-R12-bounded-gate-transition" ||
    integrity.ordinaryRenderingPositiveAuthority !== true || integrity.currentProductionFileCount !== 104 ||
    currentProductionFiles.length !== 104 || integrity.reviewPolicy?.groupMappingIsNotBlanketAuthorization !== true ||
    integrity.reviewPolicy?.exactClaimBindingRequired !== true || integrity.reverseAudit?.commit !== "3f9ef7880654fc80ce45b23e4c20de326001afb9" ||
    integrity.reverseAudit?.inventoryTargetCommit !== "5a25161cbb0fc179c877c4153dd9efeab17edcd2" ||
    integrity.reverseAudit?.productionFileCount !== 104 || integrity.reverseAudit?.occurrenceCount !== 22216 ||
    integrity.reverseAudit?.fieldClaimCount !== 14722 || integrity.reverseAudit?.mutationPointCount !== 281 ||
    integrity.reverseAudit?.completionClaimCount !== 646 || integrity.reverseAudit?.unreviewedOrSupportedUnknown !== 0) {
  throw new Error("production integrity review does not match the pushed schema-4 candidate ledger");
}
if (integrity.candidateDetachedDag?.status !== "passed" || integrity.candidateDetachedDag?.uniqueLeaves !== 26 ||
    integrity.candidateDetachedDag?.elapsedMilliseconds !== 2067351 ||
    integrity.candidateDetachedDag?.ordinaryWebView2?.productionRenderDecoder !== "BrowserPixiTextureDecoder" ||
    integrity.candidateDetachedDag?.ordinaryWebView2?.productionParticleDecoder !== "BrowserPixiParticleTextureDecoder" ||
    integrity.candidateDetachedDag?.ordinaryWebView2?.freshProcesses !== 3 ||
    integrity.candidateDetachedDag?.ordinaryWebView2?.capturesPerProcess !== 17 ||
    integrity.candidateDetachedDag?.ordinaryWebView2?.aggregateSha256 !== "100f640350d9f49b41cc94a2df47284b42f8e46f182fce7c862a8b921e791538") {
  throw new Error("candidate detached ordinary WebView2 observation changed");
}
const boundedProductionFiles = [
  "src/simulator/public/capabilities.ts",
  "src/simulator/public/contracts.ts",
];
if (integrity.releaseTransition?.status !== "bounded-R12-transition" ||
    integrity.releaseTransition?.globalGateOpenAfterTransition !== false ||
    integrity.releaseTransition?.ordinaryCommandScene !== "closed-portable" ||
    integrity.releaseTransition?.ordinaryParticleVisibleComposition !== "closed-portable" ||
    JSON.stringify(integrity.releaseTransition?.boundedProductionFiles) !== JSON.stringify(boundedProductionFiles)) {
  throw new Error("R12 release delta is not bounded");
}

if (fieldIndex.schemaVersion !== 4 || fieldIndex.status !== "ordinary-rendering-candidate-per-claim-indexed-for-bounded-release" ||
    fieldIndex.reverseCommit !== integrity.reverseAudit.commit || fieldIndex.targetGarupaCommit !== integrity.reverseAudit.inventoryTargetCommit ||
    fieldIndex.counts?.productionFiles !== 104 || fieldIndex.counts?.behaviorOccurrences !== 22216 ||
    fieldIndex.counts?.fieldClaims !== 14722 || fieldIndex.counts?.mutationPoints !== 281 ||
    fieldIndex.counts?.completionClaims !== 646 || fieldIndex.unreviewedOccurrenceCount !== 0 ||
    fieldIndex.unreviewedFieldClaimCount !== 0 || fieldIndex.unreviewedMutationCount !== 0 ||
    fieldIndex.unreviewedCompletionClaimCount !== 0 || fieldIndex.reachableSupportedUnknownCount !== 0 ||
    fieldIndex.groupMappingIsNotAuthorization !== true || fieldIndex.exactClaimBindingRequired !== true) {
  throw new Error("current field pointer does not match Reverse 3f9ef788");
}
if (mutations.schemaVersion !== 4 || mutations.reverseCommit !== fieldIndex.reverseCommit ||
    mutations.targetGarupaCommit !== fieldIndex.targetGarupaCommit || mutations.mutationPointCount !== 281 ||
    mutations.unreviewedMutationCount !== 0 || mutations.perMutationDispositionRequired !== true ||
    mutations.exactClaimBindingRequired !== true || mutations.releaseBoundary?.globalGateOpen !== false ||
    JSON.stringify(mutations.releaseBoundary?.boundedProductionDelta) !== JSON.stringify(boundedProductionFiles)) {
  throw new Error("current mutation boundary does not match bounded release");
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

if (attestation.schemaVersion !== 1 || attestation.currentDisposition !== "historical-pre-ordinary-single-rendering-total-reaudit" ||
    attestation.supersededForPositiveOrdinaryRenderingClaims !== true ||
    integrity.historicalAttestation?.positiveAuthorityForThisRelease !== false || integrity.historicalAttestation?.replacementStage !== "R14") {
  throw new Error("historical attestation was prematurely reused or upgraded before R14");
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

console.log(`evidence-integrity ordinary bounded release passed: capabilities=${matrix.rows.length} claims=${claims.allowedClaims.length} production-files=${currentProductionFiles.length} candidate-leaves=${integrity.candidateDetachedDag.uniqueLeaves}`);

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
