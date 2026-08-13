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
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
const claims = JSON.parse(readFileSync(claimsPath, "utf8"));
const integrity = JSON.parse(readFileSync(integrityPath, "utf8"));
const fieldIndex = JSON.parse(readFileSync(fieldIndexPath, "utf8"));
const mutations = JSON.parse(readFileSync(mutationPath, "utf8"));
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
  integrity.schemaVersion !== 1 || integrity.status !== "reopened-audit" ||
  integrity.reviewPolicy?.sourceOccurrenceIsNotEvidence !== true ||
  integrity.reviewPolicy?.groupMappingIsNotBlanketAuthorization !== true ||
  integrity.reviewPolicy?.currentInventoryRequired !== true ||
  typeof integrity.supersededReason !== "string"
) {
  throw new Error("production integrity review did not explicitly reopen the superseded grouped audit");
}
const ids = new Set();
const statuses = new Set([
  "closed-portable", "degraded-explicit", "excluded", "open-evidence-required",
  "open-device-exact", "unauthorized-stage-9", "reopened-audit",
]);
for (const row of matrix.rows) {
  if (typeof row.id !== "string" || ids.has(row.id)) throw new Error("capability IDs must be unique");
  ids.add(row.id);
  if (!statuses.has(row.status)) throw new Error(`${row.id} has an unclassified status: ${row.status}`);
  if (row.status === "closed-portable") {
    throw new Error(`${row.id} retains a portable closure while total revalidation is open`);
  }
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
const publicGateLiterals = [
  "closed-portable", "reopened-audit", "degraded-explicit", "excluded", "open-evidence-required",
  "open-device-exact", "unauthorized-stage-9",
];
for (const literal of publicGateLiterals) {
  if (!publicContracts.includes(`\"${literal}\"`) || !readme.includes(`\`${literal}\``)) {
    throw new Error(`public contract or README omitted gate literal: ${literal}`);
  }
}
for (const field of [
  "publicAutonomousCore", "ordinaryCommandScene", "habahiroExternalPreview",
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
  fieldIndex.schemaVersion !== 2 ||
  fieldIndex.status !== "candidate-per-claim-indexed-behind-global-gate" ||
  fieldIndex.reverseCommit !== "76b673f8d110ae8ed43357ffcbc0231eb77c0aad" ||
  fieldIndex.targetGarupaCommit !== "c66e4d94bd248e8e0decd5a7430358f96d787599" ||
  fieldIndex.counts?.productionFiles !== 102 || fieldIndex.counts?.behaviorOccurrences !== 21287 ||
  fieldIndex.counts?.fieldClaims !== 14120 || fieldIndex.counts?.completionClaims !== 555 ||
  fieldIndex.fieldDispositionCounts?.["field-evidence-bound"] !== 13893 ||
  fieldIndex.fieldDispositionCounts?.["early-evidence-required"] !== 225 ||
  fieldIndex.fieldDispositionCounts?.excluded !== 2 || fieldIndex.reachableSupportedUnknownCount !== 0 ||
  mutations.schemaVersion !== 2 ||
  mutations.status !== "candidate-mutations-indexed-behind-global-gate" ||
  mutations.reverseCommit !== fieldIndex.reverseCommit ||
  mutations.mutationPointCount !== 252 || mutations.productionAcceptedMutationPointCount !== 0 ||
  mutations.perMutationDispositionRequired !== true ||
  mutations.earliestBoundary?.capability !== "simulator.audit.total-revalidation-open"
) {
  throw new Error("current field or mutation pointer does not match the pushed Reverse schema v2 inventory");
}
if (!publicCapabilities.includes("simulator.audit.total-revalidation-open") ||
    !readFileSync(join(simulatorRoot, "public", "launch.ts"), "utf8").includes("totalRevalidationFailure")) {
  throw new Error("public launch is not isolated by the total revalidation gate");
}
console.log(`evidence-integrity reopened baseline passed: capabilities=${matrix.rows.length} claims=${claims.allowedClaims.length} current-production-files=${currentProductionFiles.length}`);

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
