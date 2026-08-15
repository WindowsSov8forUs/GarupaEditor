import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd(), "src", "simulator");
const audit = JSON.parse(readFileSync(join(root, "audit", "current-live-rehearsal-delta.json"), "utf8"));
const publicLife = JSON.parse(readFileSync(join(root, "audit", "current-public-life-profile-delta.json"), "utf8"));
const capability = JSON.parse(readFileSync(join(root, "audit", "current-capability-matrix.json"), "utf8"));
if (audit.status !== "closed-portable-release-attested" || audit.candidateCommit !== "8e50eb0" ||
    audit.releaseValidatedCommit !== "8e113f77820cd9fdd5cde31b7cf0369c4d6bf1bb" ||
    audit.reverseReleaseLedgerCommit !== "e055678f17f9a6c5b28838fdf7a604f96e9ff65c" ||
    audit.releaseValidation?.semanticLeaves !== 27 ||
    audit.releaseValidation?.status !== "passed-pushed-detached" ||
    audit.authority.reverseCommit !== "6c0dfb76" ||
    audit.claims?.length !== 8 || audit.files?.length !== 25 ||
    audit.blockingFindings?.length !== 0) {
  throw new Error("Live/Rehearsal candidate audit is incomplete or not bound to pushed Reverse authority");
}
const claimIds = new Set(audit.claims.map((claim) => claim.id));
const publicLifeFiles = new Set(publicLife.files.map((file) => file.path));
for (const file of audit.files) {
  const source = readFileSync(resolve(process.cwd(), file.path), "utf8").replaceAll("\r\n", "\n");
  const actual = createHash("sha256").update(source, "utf8").digest("hex").toUpperCase();
  if ((!publicLifeFiles.has(file.path) && actual !== file.sha256) || file.claims.length === 0 ||
      file.claims.some((claim) => !claimIds.has(claim))) {
    throw new Error(`Live/Rehearsal file binding mismatch: ${file.path}`);
  }
}
if (!["closed-portable-candidate", "closed-portable-release-attested"].includes(publicLife.status) ||
    publicLife.authority?.reverseCommit !== "2cbea93d19cb599d5daaeea007a63ae70fae012e" ||
    publicLife.candidateCommit !== "05037d3e38be9ccd43e8b2e40bbc30c265b1f954" ||
    publicLife.blockingFindings?.length !== 0) {
  throw new Error("latest Public Life profile delta is incomplete");
}
for (const id of ["CAP-MODE-MATRIX-01", "CAP-REHEARSAL-CONTROLS-01", "CAP-PUBLIC-LIFE-PROFILE-01"]) {
  const row = capability.rows.find((entry) => entry.id === id);
  if (row?.status !== "closed-portable") throw new Error(`${id} is not closed-portable`);
}

const productionFiles = walk(root).filter((path) =>
  !path.includes(`${join("src", "simulator", "testing")}`) &&
  !path.includes(`${join("src", "simulator", "audit")}`) &&
  !path.endsWith(".md") && /\.(?:ts|mjs)$/.test(path)
);
const forbidden = [
  ["startMilliseconds", "initial arbitrary seek"],
  ["create-replay-checkpoint", "caller checkpoint command"],
  ["kind: \"return-time\"", "legacy unbounded return command"],
  ["resultTransform", "legacy three-value Auto transform"],
  ["playMode:", "legacy playMode field"],
  ["Math.random", "ambient random"],
  ["Date.now", "wall clock"],
  ["performance.now", "wall clock"],
];
for (const file of productionFiles) {
  const source = readFileSync(file, "utf8");
  for (const [symbol, description] of forbidden) {
    if (source.includes(symbol)) throw new Error(`${description} remains in ${relative(root, file)}`);
  }
}

const calculated = readFileSync(join(root, "engine", "data", "inGameCalculatedData.ts"), "utf8");
for (const field of ["sessionMode", "inputMode", "isEnablePractice", "isDemoPlayMode", "isAutoLive", "isAutoPlay"]) {
  if (!calculated.includes(field)) throw new Error(`canonical mode field missing: ${field}`);
}
const replay = readFileSync(join(root, "host", "portableReplaySession.ts"), "utf8");
for (const symbol of ["return-five", "advance-five", "RETURN_REPLAY_LIMIT_SECONDS", "timelineRevisionValue", "moveTimeCountValue"]) {
  if (!replay.includes(symbol)) throw new Error(`MoveTime owner missing ${symbol}`);
}
const control = readFileSync(join(root, "scene", "rehearsalControlScene.ts"), "utf8");
for (const symbol of ["142", "1457.5", "912", "924", "903", "315", "issuedControlCapabilities"]) {
  if (!control.includes(symbol)) throw new Error(`control profile/capability missing ${symbol}`);
}
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
if (packageJson.scripts?.["simulator:test:live-rehearsal"] !==
    "node src/simulator/testing/runLiveRehearsalModeTests.mjs") {
  throw new Error("standalone Live/Rehearsal test script is not registered");
}
console.log(`Live/Rehearsal static audit passed: claims=${audit.claims.length} production-files=${productionFiles.length}`);

function walk(directory) {
  const values = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) values.push(...walk(path));
    else values.push(path);
  }
  return values;
}
