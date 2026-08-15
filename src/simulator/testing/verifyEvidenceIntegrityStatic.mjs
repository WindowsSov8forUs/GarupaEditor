import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const simulatorRoot = resolve(testingRoot, "..");
const repositoryRoot = resolve(simulatorRoot, "..", "..");
const auditRoot = join(simulatorRoot, "audit");
const matrix = json("current-capability-matrix.json");
const claims = json("current-claim-ledger.json");
const integrity = json("current-production-integrity-review.json");
const fieldIndex = json("current-field-claim-index.json");
const mutations = json("current-mutation-boundaries.json");
const attestation = json("current-final-capability-attestation.json");
const delta = json("current-product-scoring-delta.json");
const liveRehearsalDelta = json("current-live-rehearsal-delta.json");
const readme = readFileSync(join(simulatorRoot, "README.md"), "utf8");
const auditReadme = readFileSync(join(auditRoot, "README.md"), "utf8");
const scoreContract = readFileSync(join(simulatorRoot, "scoring-contract.md"), "utf8");
const publicContracts = readFileSync(join(simulatorRoot, "public", "contracts.ts"), "utf8");
const publicCapabilities = readFileSync(join(simulatorRoot, "public", "capabilities.ts"), "utf8");

const productionRoots = new Set([
  "assembly", "backends", "engine", "host", "platform", "public", "resources", "runtime", "scene",
]);
const productionFiles = [...walk(simulatorRoot)]
  .filter((path) => extname(path) === ".ts")
  .map((path) => path.slice(simulatorRoot.length + 1).replaceAll("\\", "/"))
  .filter((path) => path === "index.ts" || productionRoots.has(path.split("/")[0]))
  .map((path) => `src/simulator/${path}`)
  .sort();

if (matrix.schemaVersion !== 1 || matrix.auditStatus !== "live-rehearsal-candidate-with-cs-v1-product-score" ||
    !Array.isArray(matrix.rows) || matrix.rows.length !== 18) {
  throw new Error("mixed-authority capability matrix is missing or malformed");
}
const rows = new Map(matrix.rows.map((row) => [row.id, row]));
if (rows.get("CAP-SCORE-PRODUCT-01")?.status !== "implemented-product-contract" ||
    rows.get("CAP-SCORE-PRODUCT-01")?.productAuthority !== "src/simulator/scoring-contract.md" ||
    rows.get("CAP-HAB-EXACT-01")?.status !== "open-evidence-required" ||
    rows.get("CAP-DEVICE-01")?.status !== "open-objective-environment-blocked" ||
    rows.get("CAP-EXCLUDED-01")?.status !== "excluded" ||
    rows.get("CAP-STAGE9-01")?.status !== "unauthorized-stage-9") {
  throw new Error("product Score or unchanged non-positive capability boundary is invalid");
}
for (const id of [
  "CAP-RENDER-ORDINARY-01",
  "CAP-RENDER-PARTICLE-COMPOSITION-01",
  "CAP-MODE-MATRIX-01",
  "CAP-REHEARSAL-CONTROLS-01",
]) {
  if (rows.get(id)?.status !== "closed-portable") throw new Error(`${id} portable presentation boundary changed`);
}

if (claims.schemaVersion !== 1 || claims.auditStatus !== matrix.auditStatus ||
    claims.rules?.productScoreDoesNotClaimOriginalParity !== true ||
    claims.rules?.callerAuthoredScoreInputsForbidden !== true ||
    claims.rules?.forbidUnscopedCompletionClaims !== true) {
  throw new Error("mixed-authority claim ledger does not fail closed");
}
const scoreClaim = claims.allowedClaims.find((row) => row.id === "CLAIM-SCORE-LIFE");
if (scoreClaim?.auditDisposition !== "implemented-product-contract-with-closed-portable-presentation" ||
    scoreClaim?.productAuthority !== "src/simulator/scoring-contract.md" ||
    !scoreClaim.notClaimed.includes("original game score formula parity")) {
  throw new Error("Score claim does not separate product semantics from Reverse presentation");
}

if (delta.schemaVersion !== 1 || delta.status !== "cs-v1-product-scoring-exact-delta" ||
    delta.ruleSetId !== "garupa-editor-normalized-10m-v1" || delta.implementationCommit !== "5539a0b" ||
    delta.rules?.unclassifiedChangedProductionFiles !== 0 ||
    delta.rules?.originalScoreParityClaimed !== false ||
    delta.claims.length !== 9 || delta.files.length !== 17 || delta.deletedFiles.length !== 1) {
  throw new Error("CS-V1 exact product delta is incomplete");
}
if (liveRehearsalDelta.status !== "candidate-audited-pushed" ||
    liveRehearsalDelta.candidateCommit !== "8398a5a" ||
    liveRehearsalDelta.authority?.reverseCommit !== "6c0dfb76" ||
    liveRehearsalDelta.claims?.length !== 8 || liveRehearsalDelta.files?.length !== 25 ||
    liveRehearsalDelta.blockingFindings?.length !== 0) {
  throw new Error("Live/Rehearsal exact candidate delta is incomplete");
}
const liveClaimIds = new Set(liveRehearsalDelta.claims.map((claim) => claim.id));
const liveChangedFiles = new Set(liveRehearsalDelta.files.map((row) => row.path));
for (const row of liveRehearsalDelta.files) {
  const path = resolve(repositoryRoot, row.path);
  if (!existsSync(path) || sha256Raw(path) !== row.sha256 || !Array.isArray(row.claims) ||
      row.claims.length === 0 || row.claims.some((id) => !liveClaimIds.has(id))) {
    throw new Error(`Live/Rehearsal exact file binding mismatch: ${row.path}`);
  }
}
const claimIds = new Set(delta.claims.map((claim) => claim.id));
for (const row of delta.files) {
  const path = resolve(repositoryRoot, row.path);
  if (!existsSync(path) || (!liveChangedFiles.has(row.path) && sha256(path) !== row.sha256) ||
      !Array.isArray(row.claims) || row.claims.length === 0 ||
      row.claims.some((id) => !claimIds.has(id)) ||
      !Array.isArray(row.mutations) || !Array.isArray(row.reverseRetained)) {
    throw new Error(`CS-V1 exact file binding mismatch: ${row.path}`);
  }
}
for (const row of delta.deletedFiles) {
  if (existsSync(resolve(repositoryRoot, row.path)) || row.disposition !== "removed-original-master-score-input-owner") {
    throw new Error(`deleted Score owner boundary mismatch: ${row.path}`);
  }
}
if (new Set(delta.files.map((row) => row.path)).size !== delta.files.length) {
  throw new Error("duplicate CS-V1 product file binding");
}

if (integrity.schemaVersion !== 3 ||
    integrity.status !== "live-rehearsal-candidate-audited-with-cs-v1-and-reverse-baseline" ||
    integrity.authorityModel?.reverseBaseline?.coversCurrentProductScore !== false ||
    integrity.authorityModel?.productScore?.contract !== "src/simulator/scoring-contract.md" ||
    integrity.currentProductionFileCount !== 107 || productionFiles.length !== 107 ||
    integrity.productChangedProductionFiles !== 17 || integrity.productDeletedProductionFiles !== 1 ||
    integrity.liveRehearsalChangedProductionFiles !== 25 ||
    integrity.authorityModel?.liveRehearsal?.candidateCommit !== "8398a5a" ||
    integrity.validation?.liveRehearsalCandidate?.standaloneMatrix !== "passed" ||
    integrity.unclassifiedProductChangedFiles !== 0 ||
    integrity.validation?.scoreFullChart?.totalScoringUnitCount !== 1007 ||
    integrity.validation?.scoreFullChart?.autoScore !== 10001007 ||
    integrity.validation?.ordinaryWebView2?.aggregateSha256 !==
      "ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c" ||
    integrity.validation?.ordinaryWebView2?.originalUnityFramebufferOracle !== false ||
    integrity.validation?.fullReleaseDag?.commit !== "b4a3432" ||
    integrity.validation?.fullReleaseDag?.status !== "passed-pushed-detached" ||
    integrity.validation?.fullReleaseDag?.semanticLeaves !== 26 ||
    integrity.validation?.fullReleaseDag?.elapsedMilliseconds !== 1853406 ||
    integrity.unchangedBoundaries?.mainProgramIntegration !== "unauthorized-stage-9") {
  throw new Error("current mixed-authority production review is inconsistent");
}
if (fieldIndex.schemaVersion !== 5 || fieldIndex.status !== "reverse-baseline-plus-cs-v1-plus-live-rehearsal-candidate" ||
    fieldIndex.productDelta?.unclassifiedChangedProductionFiles !== 0 ||
    fieldIndex.liveRehearsalDelta?.candidateCommit !== "8398a5a" ||
    fieldIndex.liveRehearsalDelta?.unclassifiedChangedProductionFiles !== 0 ||
    fieldIndex.currentProductionFiles !== 107 || fieldIndex.originalScoreParityClaimed !== false ||
    fieldIndex.groupMappingIsNotAuthorization !== true || fieldIndex.exactClaimBindingRequired !== true) {
  throw new Error("current field claim pointer is inconsistent");
}
if (mutations.schemaVersion !== 5 || mutations.status !== "reverse-baseline-plus-cs-v1-plus-live-rehearsal-mutations-dispositioned" ||
    mutations.productDelta?.unreviewedMutationCount !== 0 ||
    mutations.liveRehearsalDelta?.candidateCommit !== "8398a5a" ||
    mutations.liveRehearsalDelta?.unreviewedMutationCount !== 0 ||
    mutations.perMutationDispositionRequired !== true || mutations.exactClaimBindingRequired !== true ||
    !mutations.productDelta.preflightBoundaries.includes("duplicate/foreign scoring unit before Record/Gauge mutation")) {
  throw new Error("current mutation boundary is inconsistent");
}
if (attestation.schemaVersion !== 3 || attestation.status !== "cs-v1-product-score-release-attestation" ||
    attestation.authority?.productScore?.ruleSetId !== "garupa-editor-normalized-10m-v1" ||
    attestation.authority?.productScore?.publicRuleSelectionAllowed !== false ||
    attestation.authority?.productScore?.originalScoreParityClaimed !== false ||
    attestation.validation?.scoreFullChart?.autoScore !== 10001007 ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.aggregateSha256 !==
      "ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c" ||
    attestation.implementation?.releaseCommit !== "b4a3432" ||
    attestation.validation?.fullReleaseDag?.status !== "passed-pushed-detached" ||
    attestation.validation?.fullReleaseDag?.elapsedMilliseconds !== 1853406 ||
    attestation.boundaries?.aggregateOriginalParityClaimed !== false ||
    attestation.boundaries?.mainProgramIntegrationAuthorization !== false) {
  throw new Error("CS-V1 attestation identity or boundary is invalid");
}

for (const literal of [
  "10,000,000", "garupa-editor-normalized-10m-v1", "original game's score formula",
]) if (!scoreContract.includes(literal)) throw new Error(`score contract omitted: ${literal}`);
const gameplayContract = publicContracts.match(
  /export interface SimulatorSessionGameplayData \{([\s\S]*?)\n\}/m,
)?.[1] ?? "";
for (const forbidden of [
  "readonly score:", "scoreRuleSet", "totalScoringUnitCount", "autoLiveComboCoefficient", "totalParameter",
]) if (gameplayContract.includes(forbidden) ||
  (forbidden !== "readonly score:" && publicContracts.includes(forbidden))) {
  throw new Error(`Public contract leaked caller-authored Score field: ${forbidden}`);
}
if (!/export interface SimulatorSessionGameplayData \{\s*readonly life:/m.test(publicContracts)) {
  throw new Error("Public gameplay is not Life-only");
}
if (!/isTotalRevalidationOpen\(\): boolean \{\s*return false;\s*\}/m.test(publicCapabilities) ||
    !publicCapabilities.includes('mainProgramIntegration: "unauthorized-stage-9"')) {
  throw new Error("aggregate portable gate or Stage 9 boundary changed");
}
for (const source of [readme, auditReadme, scoreContract]) {
  if (/(?:^|[\\/`])tmp[\\/]/m.test(source)) throw new Error("tracked documentation cites ignored tmp material");
}
for (const path of walk(simulatorRoot)) {
  if (extname(path) === ".md" && /(?:^|[\\/`])tmp[\\/]/m.test(readFileSync(path, "utf8"))) {
    throw new Error(`tracked simulator documentation cites ignored tmp material: ${path}`);
  }
}

console.log(`mixed Reverse/product integrity passed: capabilities=${matrix.rows.length} productClaims=${delta.claims.length} productFiles=${delta.files.length} productionFiles=${productionFiles.length}`);

function json(name) {
  return JSON.parse(readFileSync(join(auditRoot, name), "utf8"));
}

function sha256Raw(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

function sha256(path) {
  const canonicalSource = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(canonicalSource, "utf8").digest("hex").toUpperCase();
}

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
