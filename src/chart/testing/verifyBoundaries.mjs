import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const repositoryRoot = process.cwd();
const chartRoot = resolve(repositoryRoot, "src", "chart");
const violations = [];
const forbiddenDependencies = [
  ["React", /from\s+["']react/],
  ["Tauri", /@tauri-apps/],
  ["simulator", /(?:\.\.\/)+simulator/],
  ["editor mixed core", /chartCore/],
  ["skin resources", /skinLoader/],
  ["application controllers", /(?:\.\.\/)+app\//],
];
for (const path of walk(chartRoot)) {
  if (extname(path) !== ".ts" || path.includes(`${join("chart", "testing")}`)) continue;
  const source = readFileSync(path, "utf8");
  for (const [label, pattern] of forbiddenDependencies) {
    if (pattern.test(source)) violations.push(`${label}: ${path}`);
  }
}
const chartCore = readFileSync(resolve(repositoryRoot, "src", "chartCore.ts"), "utf8");
const legacyGenericJsonName = "Chart" + "Json";
for (const legacy of [`type ${legacyGenericJsonName}`, `interface ${legacyGenericJsonName}`, `Current${legacyGenericJsonName}`]) {
  if (chartCore.includes(legacy)) violations.push(`legacy serialized schema remains in chartCore: ${legacy}`);
}
if (violations.length > 0) {
  throw new Error(`Shared chart module boundary violations:\n${violations.join("\n")}`);
}
console.log("shared chart module boundary verified");

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
