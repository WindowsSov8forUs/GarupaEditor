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

if (matrix.schemaVersion !== 1 || matrix.auditStatus !== "ordinary-release-with-cs-v1-product-score" ||
    !Array.isArray(matrix.rows) || matrix.rows.length !== 16) {
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
for (const id of ["CAP-RENDER-ORDINARY-01", "CAP-RENDER-PARTICLE-COMPOSITION-01"]) {
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
const claimIds = new Set(delta.claims.map((claim) => claim.id));
for (const row of delta.files) {
  const path = resolve(repositoryRoot, row.path);
  if (!existsSync(path) || sha256(path) !== row.sha256 ||
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
    !integrity.status.startsWith("cs-v1-product-score-") ||
    integrity.authorityModel?.reverseBaseline?.coversCurrentProductScore !== false ||
    integrity.authorityModel?.productScore?.contract !== "src/simulator/scoring-contract.md" ||
    integrity.currentProductionFileCount !== 106 || productionFiles.length !== 106 ||
    integrity.productChangedProductionFiles !== 17 || integrity.productDeletedProductionFiles !== 1 ||
    integrity.unclassifiedProductChangedFiles !== 0 ||
    integrity.validation?.scoreFullChart?.totalScoringUnitCount !== 1007 ||
    integrity.validation?.scoreFullChart?.autoScore !== 10001007 ||
    integrity.validation?.ordinaryWebView2?.aggregateSha256 !==
      "ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c" ||
    integrity.validation?.ordinaryWebView2?.originalUnityFramebufferOracle !== false ||
    integrity.unchangedBoundaries?.mainProgramIntegration !== "unauthorized-stage-9") {
  throw new Error("current mixed-authority production review is inconsistent");
}
if (fieldIndex.schemaVersion !== 5 || fieldIndex.status !== "reverse-baseline-plus-cs-v1-exact-product-delta" ||
    fieldIndex.productDelta?.unclassifiedChangedProductionFiles !== 0 ||
    fieldIndex.currentProductionFiles !== 106 || fieldIndex.originalScoreParityClaimed !== false ||
    fieldIndex.groupMappingIsNotAuthorization !== true || fieldIndex.exactClaimBindingRequired !== true) {
  throw new Error("current field claim pointer is inconsistent");
}
if (mutations.schemaVersion !== 5 || mutations.status !== "reverse-baseline-plus-cs-v1-mutations-dispositioned" ||
    mutations.productDelta?.unreviewedMutationCount !== 0 ||
    mutations.perMutationDispositionRequired !== true || mutations.exactClaimBindingRequired !== true ||
    !mutations.productDelta.preflightBoundaries.includes("duplicate/foreign scoring unit before Record/Gauge mutation")) {
  throw new Error("current mutation boundary is inconsistent");
}
if (attestation.schemaVersion !== 3 || !attestation.status.startsWith("cs-v1-product-score-") ||
    attestation.authority?.productScore?.ruleSetId !== "garupa-editor-normalized-10m-v1" ||
    attestation.authority?.productScore?.publicRuleSelectionAllowed !== false ||
    attestation.authority?.productScore?.originalScoreParityClaimed !== false ||
    attestation.validation?.scoreFullChart?.autoScore !== 10001007 ||
    attestation.validation?.ordinaryProductionBrowserLeaf?.aggregateSha256 !==
      "ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c" ||
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
