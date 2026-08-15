import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = process.cwd();
const simulatorRoot = resolve(repositoryRoot, "src", "simulator");
const audit = json(join(simulatorRoot, "audit", "current-public-life-profile-delta.json"));
const capability = json(join(simulatorRoot, "audit", "current-capability-matrix.json"));

if (audit.schemaVersion !== 1 ||
    !["closed-portable-candidate", "closed-portable-release-attested"].includes(audit.status) ||
    audit.authority?.reverseCommit !== "2cbea93d19cb599d5daaeea007a63ae70fae012e" ||
    audit.authority?.resolvedBooleanIsOriginalPublicApi !== false ||
    audit.candidateCommit !== "05037d3e38be9ccd43e8b2e40bbc30c265b1f954" ||
    audit.claims?.length !== 5 || audit.files?.length !== 7 ||
    audit.blockingFindings?.length !== 0) {
  throw new Error("Public Life profile audit identity is incomplete");
}
if (audit.status === "closed-portable-release-attested" &&
    (typeof audit.releaseValidatedCommit !== "string" ||
      audit.authority?.reverseReleaseLedgerCommit !== "f4e56f92be55508bb6e4a0fdd6fa1b96a1fcccd0" ||
      audit.releaseValidation?.status !== "passed-pushed-detached" ||
      audit.releaseValidation?.semanticLeaves !== 28)) {
  throw new Error("Public Life profile release identity is incomplete");
}
const claimIds = new Set(audit.claims.map((claim) => claim.id));
for (const file of audit.files) {
  const source = readFileSync(resolve(repositoryRoot, file.path), "utf8").replaceAll("\r\n", "\n");
  const actual = createHash("sha256").update(source, "utf8").digest("hex").toUpperCase();
  if (actual !== file.sha256 || file.claims.length === 0 || file.claims.some((claim) => !claimIds.has(claim))) {
    throw new Error(`Public Life profile file binding mismatch: ${file.path}`);
  }
}

const publicContracts = readFileSync(join(simulatorRoot, "public", "contracts.ts"), "utf8");
for (const forbidden of audit.forbiddenPublicSymbols) {
  if (publicContracts.includes(forbidden) ||
      (["SimulatorSessionGameplayData", "chartData.gameplay"].includes(forbidden) &&
        readFileSync(join(simulatorRoot, "index.ts"), "utf8").includes(forbidden))) {
    throw new Error(`caller-authored Life remains Public: ${forbidden}`);
  }
}
for (const required of [
  "readonly bmsText: string;", "readonly bgm: SimulatorChartAudioData;", "readonly isFullLength: boolean;",
]) if (!publicContracts.includes(required)) throw new Error(`Public chart field missing: ${required}`);

const recipe = readFileSync(join(simulatorRoot, "assembly", "sessionRecipe.ts"), "utf8");
for (const required of [
  'readonly schemaVersion: 2;', 'schemaVersion: 2 as const',
  '"bgm,bmsText,isFullLength"', 'typeof request.chartData.isFullLength !== "boolean"',
  'isFullLength: request.chartData.isFullLength',
]) if (!recipe.includes(required)) throw new Error(`recipe full-length boundary missing: ${required}`);
for (const forbidden of ["isGameplayShape", "deepFreezeClone", "invalid-session-gameplay-data"]) {
  if (recipe.includes(forbidden)) throw new Error(`legacy gameplay recipe owner remains: ${forbidden}`);
}

const profile = readFileSync(join(simulatorRoot, "engine", "data", "currentSinglePlayLifeProfile.ts"), "utf8");
for (const required of [
  "ORDINARY_SINGLE_PLAY_INITIAL_LIFE = 1000",
  "ORDINARY_SINGLE_PLAY_PLAYER_MAX_LIFE = 1000",
  "ORDINARY_SINGLE_PLAY_LIFE_UPPER_LIMIT = 2000",
  "isFullLength ? -50 : -100",
  "isFullLength ? -25 : -50",
  'typeof isFullLength !== "boolean"',
  "PLP-E01/PLP-E02",
  "PLP-E03..PLP-E06",
]) if (!profile.includes(required)) throw new Error(`internal Life owner missing: ${required}`);

const platform = readFileSync(join(simulatorRoot, "platform", "platformComposition.ts"), "utf8");
if (!platform.includes("createCurrentSinglePlayLifeProfile(request.chartData.isFullLength)") ||
    platform.includes("request.chartData.gameplay")) {
  throw new Error("production composition does not exclusively consume internal Life profile");
}
const row = capability.rows?.find((entry) => entry.id === "CAP-PUBLIC-LIFE-PROFILE-01");
if (row?.status !== "closed-portable" || !row.reverseEvidence?.some((value) => value.includes("2cbea93d"))) {
  throw new Error("Public Life profile capability row is missing");
}
const packageJson = json(resolve(repositoryRoot, "package.json"));
if (packageJson.scripts?.["simulator:test:public-life-profile"] !==
    "node src/simulator/testing/runPublicLifeProfileTests.mjs") {
  throw new Error("Public Life standalone script is not registered");
}
const totalRunner = readFileSync(join(simulatorRoot, "testing", "runTotalRevalidationTests.mjs"), "utf8");
if ((totalRunner.match(/\["public-life-profile", "runPublicLifeProfileTests\.mjs"/g) ?? []).length !== 2) {
  throw new Error("Public Life leaf is not present in both quick and full DAGs");
}
console.log(`Public Life profile static audit passed: status=${audit.status} claims=${audit.claims.length} files=${audit.files.length}`);

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
