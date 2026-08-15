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
const publicLifeDelta = json("current-public-life-profile-delta.json");
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

if (matrix.schemaVersion !== 1 || matrix.auditStatus !== "public-life-profile-release-with-live-rehearsal-and-cs-v1" ||
    !Array.isArray(matrix.rows) || matrix.rows.length !== 19) {
  throw new Error("mixed-authority capability matrix is missing or malformed");
}
const rows = new Map(matrix.rows.map((row) => [row.id, row]));
if (rows.get("CAP-SCORE-PRODUCT-01")?.status !== "implemented-product-contract" ||
    rows.get("CAP-SCORE-PRODUCT-01")?.productAuthority !== "src/simulator/scoring-contract.md" ||
    rows.get("CAP-PUBLIC-LIFE-PROFILE-01")?.status !== "closed-portable" ||
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
    claims.rules?.callerAuthoredLifeInputsForbidden !== true ||
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
if (liveRehearsalDelta.status !== "closed-portable-release-attested" ||
    liveRehearsalDelta.candidateCommit !== "8e50eb0" ||
    liveRehearsalDelta.releaseValidatedCommit !== "8e113f77820cd9fdd5cde31b7cf0369c4d6bf1bb" ||
    liveRehearsalDelta.reverseReleaseLedgerCommit !== "e055678f17f9a6c5b28838fdf7a604f96e9ff65c" ||
    liveRehearsalDelta.releaseValidation?.semanticLeaves !== 27 ||
    liveRehearsalDelta.releaseValidation?.status !== "passed-pushed-detached" ||
    liveRehearsalDelta.authority?.reverseCommit !== "6c0dfb76" ||
    liveRehearsalDelta.claims?.length !== 8 || liveRehearsalDelta.files?.length !== 25 ||
    liveRehearsalDelta.blockingFindings?.length !== 0) {
  throw new Error("Live/Rehearsal exact candidate delta is incomplete");
}
if (publicLifeDelta.schemaVersion !== 1 ||
    !["closed-portable-candidate", "closed-portable-release-attested"].includes(publicLifeDelta.status) ||
    publicLifeDelta.authority?.reverseCommit !== "2cbea93d19cb599d5daaeea007a63ae70fae012e" ||
    publicLifeDelta.authority?.reverseReleaseLedgerCommit !== "f4e56f92be55508bb6e4a0fdd6fa1b96a1fcccd0" ||
    publicLifeDelta.candidateCommit !== "05037d3e38be9ccd43e8b2e40bbc30c265b1f954" ||
    publicLifeDelta.claims?.length !== 5 || publicLifeDelta.files?.length !== 7 ||
    publicLifeDelta.blockingFindings?.length !== 0) {
  throw new Error("Public Life profile exact delta is incomplete");
}
const publicLifeClaimIds = new Set(publicLifeDelta.claims.map((claim) => claim.id));
const publicLifeChangedFiles = new Set(publicLifeDelta.files.map((row) => row.path));
for (const row of publicLifeDelta.files) {
  const path = resolve(repositoryRoot, row.path);
  if (!existsSync(path) || sha256(path) !== row.sha256 || !Array.isArray(row.claims) ||
      row.claims.length === 0 || row.claims.some((id) => !publicLifeClaimIds.has(id))) {
    throw new Error(`Public Life profile exact file binding mismatch: ${row.path}`);
  }
}
const liveClaimIds = new Set(liveRehearsalDelta.claims.map((claim) => claim.id));
const liveChangedFiles = new Set(liveRehearsalDelta.files.map((row) => row.path));
for (const row of liveRehearsalDelta.files) {
  const path = resolve(repositoryRoot, row.path);
  if (!existsSync(path) || (!publicLifeChangedFiles.has(row.path) && sha256(path) !== row.sha256) ||
      !Array.isArray(row.claims) || row.claims.length === 0 ||
      row.claims.some((id) => !liveClaimIds.has(id))) {
    throw new Error(`Live/Rehearsal exact file binding mismatch: ${row.path}`);
  }
}
const claimIds = new Set(delta.claims.map((claim) => claim.id));
for (const row of delta.files) {
  const path = resolve(repositoryRoot, row.path);
  if (!existsSync(path) || (!liveChangedFiles.has(row.path) && !publicLifeChangedFiles.has(row.path) && sha256(path) !== row.sha256) ||
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

if (integrity.schemaVersion !== 4 ||
    integrity.status !== "public-life-profile-release-attested-with-live-rehearsal-cs-v1-and-reverse-authority" ||
    integrity.authorityModel?.reverseBaseline?.coversCurrentProductScore !== false ||
    integrity.authorityModel?.productScore?.contract !== "src/simulator/scoring-contract.md" ||
    integrity.currentProductionFileCount !== 108 || productionFiles.length !== 108 ||
    integrity.productChangedProductionFiles !== 17 || integrity.productDeletedProductionFiles !== 1 ||
    integrity.liveRehearsalChangedProductionFiles !== 25 ||
    integrity.publicLifeProfileChangedProductionFiles !== 7 ||
    integrity.unclassifiedPublicLifeProfileChangedFiles !== 0 ||
    integrity.authorityModel?.liveRehearsal?.candidateCommit !== "8e50eb0" ||
    integrity.authorityModel?.publicLifeProfile?.reverseCommit !== "2cbea93d19cb599d5daaeea007a63ae70fae012e" ||
    integrity.authorityModel?.publicLifeProfile?.candidateCommit !== "05037d3e38be9ccd43e8b2e40bbc30c265b1f954" ||
    integrity.authorityModel?.publicLifeProfile?.releaseValidatedCommit !== "86ea07376e5079c67e0fad80c15020178fa334a6" ||
    integrity.authorityModel?.publicLifeProfile?.reverseReleaseLedgerCommit !== "f4e56f92be55508bb6e4a0fdd6fa1b96a1fcccd0" ||
    integrity.validation?.publicLifeProfileCandidate?.standaloneProfile !== "passed" ||
    integrity.validation?.liveRehearsalCandidate?.standaloneMatrix !== "passed" ||
    integrity.validation?.liveRehearsalWebView2?.capturesPerProcess !== 21 ||
    integrity.validation?.liveRehearsalWebView2?.aggregateSha256 !==
      "e968d7900bca1ea0e96e9864479207ed3af00db7aada31c1b70370d68b23e8e0" ||
    integrity.unclassifiedProductChangedFiles !== 0 ||
    integrity.validation?.scoreFullChart?.totalScoringUnitCount !== 1007 ||
    integrity.validation?.scoreFullChart?.autoScore !== 10001007 ||
    integrity.validation?.ordinaryWebView2?.aggregateSha256 !==
      "ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c" ||
    integrity.validation?.ordinaryWebView2?.originalUnityFramebufferOracle !== false ||
    integrity.validation?.fullReleaseDag?.commit !== "86ea07376e5079c67e0fad80c15020178fa334a6" ||
    integrity.validation?.fullReleaseDag?.status !== "passed-pushed-detached" ||
    integrity.validation?.fullReleaseDag?.semanticLeaves !== 28 ||
    integrity.validation?.fullReleaseDag?.elapsedMilliseconds !== 1706763 ||
    integrity.unchangedBoundaries?.mainProgramIntegration !== "unauthorized-stage-9") {
  throw new Error("current mixed-authority production review is inconsistent");
}
if (fieldIndex.schemaVersion !== 6 || fieldIndex.status !== "reverse-baseline-plus-cs-v1-plus-live-rehearsal-plus-public-life-release" ||
    fieldIndex.productDelta?.unclassifiedChangedProductionFiles !== 0 ||
    fieldIndex.liveRehearsalDelta?.candidateCommit !== "8e50eb0" ||
    fieldIndex.liveRehearsalDelta?.unclassifiedChangedProductionFiles !== 0 ||
    fieldIndex.publicLifeProfileDelta?.candidateCommit !== "05037d3e38be9ccd43e8b2e40bbc30c265b1f954" ||
    fieldIndex.publicLifeProfileDelta?.unclassifiedChangedProductionFiles !== 0 ||
    fieldIndex.publicLifeProfileDelta?.releaseValidatedCommit !== "86ea07376e5079c67e0fad80c15020178fa334a6" ||
    fieldIndex.currentProductionFiles !== 108 || fieldIndex.originalScoreParityClaimed !== false ||
    fieldIndex.groupMappingIsNotAuthorization !== true || fieldIndex.exactClaimBindingRequired !== true) {
  throw new Error("current field claim pointer is inconsistent");
}
if (mutations.schemaVersion !== 6 || mutations.status !== "reverse-baseline-plus-cs-v1-plus-live-rehearsal-plus-public-life-release-mutations-dispositioned" ||
    mutations.productDelta?.unreviewedMutationCount !== 0 ||
    mutations.liveRehearsalDelta?.candidateCommit !== "8e50eb0" ||
    mutations.liveRehearsalDelta?.unreviewedMutationCount !== 0 ||
    mutations.publicLifeProfileDelta?.candidateCommit !== "05037d3e38be9ccd43e8b2e40bbc30c265b1f954" ||
    mutations.publicLifeProfileDelta?.unreviewedMutationCount !== 0 ||
    mutations.publicLifeProfileDelta?.releaseValidatedCommit !== "86ea07376e5079c67e0fad80c15020178fa334a6" ||
    mutations.perMutationDispositionRequired !== true || mutations.exactClaimBindingRequired !== true ||
    !mutations.productDelta.preflightBoundaries.includes("duplicate/foreign scoring unit before Record/Gauge mutation")) {
  throw new Error("current mutation boundary is inconsistent");
}
if (attestation.schemaVersion !== 5 || attestation.status !== "public-life-profile-release-attestation" ||
    attestation.authority?.publicLifeOriginalBehavior?.reverseCommit !== "2cbea93d19cb599d5daaeea007a63ae70fae012e" ||
    attestation.authority?.publicLifeOriginalBehavior?.resolvedBooleanIsOriginalPublicApi !== false ||
    attestation.authority?.publicLifeReleaseLedger?.reverseCommit !== "f4e56f92be55508bb6e4a0fdd6fa1b96a1fcccd0" ||
    attestation.authority?.productScore?.ruleSetId !== "garupa-editor-normalized-10m-v1" ||
    attestation.authority?.productScore?.publicRuleSelectionAllowed !== false ||
    attestation.authority?.productScore?.originalScoreParityClaimed !== false ||
    attestation.publicContract?.callerAuthoredLifeAllowed !== false ||
    attestation.publicContract?.callerAuthoredDamageAllowed !== false ||
    JSON.stringify(attestation.publicContract?.chartExactKeys) !== JSON.stringify(["bmsText", "bgm", "isFullLength"]) ||
    attestation.validation?.scoreFullChart?.autoScore !== 10001007 ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.aggregateSha256 !==
      "e968d7900bca1ea0e96e9864479207ed3af00db7aada31c1b70370d68b23e8e0" ||
    attestation.implementation?.publicLifeReleaseAuditCommit !== "079b5df53de453cfec017333e9f2e089edfece7d" ||
    attestation.implementation?.reverseReleaseLedgerCommit !== "f4e56f92be55508bb6e4a0fdd6fa1b96a1fcccd0" ||
    attestation.validation?.fullReleaseDag?.commit !== "86ea07376e5079c67e0fad80c15020178fa334a6" ||
    attestation.validation?.fullReleaseDag?.status !== "passed-pushed-detached" ||
    attestation.validation?.fullReleaseDag?.semanticLeaves !== 28 ||
    attestation.validation?.fullReleaseDag?.elapsedMilliseconds !== 1706763 ||
    attestation.boundaries?.resolvedFullBooleanIsOriginalPublicApi !== false ||
    attestation.boundaries?.aggregateOriginalParityClaimed !== false ||
    attestation.boundaries?.mainProgramIntegrationAuthorization !== false) {
  throw new Error("Public Life/CS-V1 attestation identity or boundary is invalid");
}

for (const literal of [
  "10,000,000", "garupa-editor-normalized-10m-v1", "original game's score formula",
]) if (!scoreContract.includes(literal)) throw new Error(`score contract omitted: ${literal}`);
const chartContract = publicContracts.match(
  /export interface SimulatorChartDataPackage \{([\s\S]*?)\n\}/m,
)?.[1] ?? "";
for (const forbidden of [
  "SimulatorSessionGameplayData", "readonly gameplay:", "readonly life:",
  "readonly initialLife:", "readonly playerMaxLife:", "readonly lifeUpperLimit:",
  "readonly missDamage:", "readonly badDamage:", "readonly score:", "scoreRuleSet",
  "totalScoringUnitCount", "autoLiveComboCoefficient", "totalParameter",
]) if (chartContract.includes(forbidden) || forbidden === "SimulatorSessionGameplayData" && publicContracts.includes(forbidden)) {
  throw new Error(`Public chart leaked caller-authored Score/Life field: ${forbidden}`);
}
if (!/export interface SimulatorChartDataPackage \{\s*readonly bmsText: string;\s*readonly bgm: SimulatorChartAudioData;\s*readonly isFullLength: boolean;\s*\}/m.test(publicContracts)) {
  throw new Error("Public chart is not exact BMS/BGM/isFullLength");
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
