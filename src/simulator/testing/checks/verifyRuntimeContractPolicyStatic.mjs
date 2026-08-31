import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const production = walk(root).filter((path) =>
  /\.(?:ts|tsx|mjs)$/.test(path) &&
  !path.includes(`${join("simulator", "testing")}`) &&
  !path.includes(`${join("resources", "testing")}`));
const blockingEvidencePatterns = [
  /status\s*:\s*["']evidence-required["']/,
  /code\s*:\s*["']evidence-required["']/,
  /rejected\(\s*["']evidence-required["']/,
  /closeTerminal\([^)]*evidence-required/,
  /\bevidenceRequired\s*\(/,
];
for (const path of production) {
  const source = readFileSync(path, "utf8");
  for (const pattern of blockingEvidencePatterns) {
    if (pattern.test(source)) throw new Error(`blocking evidence gate remains in ${relative(root, path)}: ${pattern}`);
  }
  if (/Object\.getPrototypeOf/.test(source) || /Object\.keys\([^\n]*\.sort\(\)\.join/.test(source)) {
    throw new Error(`prototype/key-order exact gate remains in ${relative(root, path)}`);
  }
}
const publicContracts = readFileSync(join(root, "simulator", "public", "contracts.ts"), "utf8");
if (publicContracts.includes('"evidence-required"')) throw new Error("Public failure taxonomy exposes evidence-required");
const audit = JSON.parse(readFileSync(join(root, "runtime-contract-audit.json"), "utf8"));
if (audit.status !== "classified" || audit.summary?.pendingClassificationCount !== 0 ||
  !Array.isArray(audit.entries) || audit.entries.some((entry) =>
    !["continue-product", "action-unavailable", "integrity-failure", "terminal-fault", "test-only-assertion"].includes(entry.disposition))) {
  throw new Error("runtime contract audit contains unclassified production blockers");
}
for (const id of [
  "GE-PS-SURFACE-ATOMIC-REBUILD",
  "GE-PS-BACK-PLAYING-OPENS-PAUSE",
  "GE-PS-BACK-CONFIRM-TO-PAUSE",
]) {
  if (!production.some((path) => readFileSync(path, "utf8").includes(id))) {
    throw new Error(`registered product semantic is missing from production: ${id}`);
  }
}
console.log(`runtime contract policy static verified: production=${production.length} audit=${audit.entries.length} pending=0`);

function walk(directory) {
  const values = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) values.push(...walk(path));
    else values.push(path);
  }
  return values;
}
