import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const simulatorRoot = resolve(testingRoot, "..");
const matrixPath = join(simulatorRoot, "audit", "current-capability-matrix.json");
const claimsPath = join(simulatorRoot, "audit", "current-claim-ledger.json");
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
const claims = JSON.parse(readFileSync(claimsPath, "utf8"));
const readme = readFileSync(join(simulatorRoot, "README.md"), "utf8");

if (matrix.schemaVersion !== 1 || !Array.isArray(matrix.rows) || matrix.rows.length === 0) {
  throw new Error("capability matrix is missing or empty");
}
if (claims.schemaVersion !== 1 || claims.rules?.forbidUnscopedCompletionClaims !== true) {
  throw new Error("claim ledger does not fail closed");
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
  if (row.status === "closed-portable" && (!Array.isArray(row.reverseEvidence) || row.reverseEvidence.length === 0 || typeof row.dynamicRequirement !== "string")) {
    throw new Error(`${row.id} claims portable closure without evidence and a dynamic requirement`);
  }
  if (row.status === "open-evidence-required" && typeof row.failureBoundary !== "string" && row.id !== "CAP-HAB-EXACT-01") {
    throw new Error(`${row.id} lacks an early failure boundary`);
  }
}
for (const required of ["CAP-PRACTICE-01", "CAP-SCENE-07", "CAP-HAB-01", "CAP-HAB-EXACT-01", "CAP-DEVICE-01", "CAP-STAGE9-01", "CAP-EXCLUDED-01"]) {
  if (!ids.has(required)) throw new Error(`capability matrix omitted ${required}`);
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
console.log(`evidence-integrity static baseline passed: capabilities=${matrix.rows.length} claims=${claims.allowedClaims.length}`);

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
