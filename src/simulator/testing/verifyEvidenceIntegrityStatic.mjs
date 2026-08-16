import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const simulatorRoot = resolve(testingRoot, "..");
const trackedAuditRoot = join(simulatorRoot, "audit");
if (existsSync(trackedAuditRoot)) {
  throw new Error("tracked simulator audit ledgers must remain outside src/simulator");
}

const scoreContract = read("scoring-contract.md");
for (const literal of [
  "10,000,000", "garupa-editor-normalized-10m-v1", "original game's score formula",
]) if (!scoreContract.includes(literal)) throw new Error(`score contract omitted: ${literal}`);

const publicContracts = read("public/contracts.ts");
const chartContract = publicContracts.match(
  /export interface SimulatorChartDataPackage \{([\s\S]*?)\n\}/m,
)?.[1] ?? "";
for (const forbidden of [
  "SimulatorSessionGameplayData", "readonly gameplay:", "readonly life:",
  "readonly initialLife:", "readonly playerMaxLife:", "readonly lifeUpperLimit:",
  "readonly missDamage:", "readonly badDamage:", "readonly score:", "scoreRuleSet",
  "totalScoringUnitCount", "autoLiveComboCoefficient", "totalParameter",
]) if (chartContract.includes(forbidden) ||
    (forbidden === "SimulatorSessionGameplayData" && publicContracts.includes(forbidden))) {
  throw new Error(`Public chart leaked caller-authored Score/Life field: ${forbidden}`);
}
if (!/export interface SimulatorChartDataPackage \{\s*readonly chart: GarupaChartJson;\s*readonly bgm: Uint8Array;\s*readonly isFullLength: boolean;\s*\}/m.test(publicContracts) ||
    publicContracts.includes("readonly bmsText:") ||
    /SimulatorChartAudioData|currentSampleFrames|durationSeconds|sampleRate|sha256/.test(chartContract)) {
  throw new Error("Public chart is not exact Garupa-JSON/BGM-bytes/isFullLength");
}

const publicCapabilities = read("public/capabilities.ts");
if (!/isTotalRevalidationOpen\(\): boolean \{\s*return false;\s*\}/m.test(publicCapabilities) ||
    !publicCapabilities.includes('mainProgramIntegration: "unauthorized-stage-9"')) {
  throw new Error("aggregate portable gate or Stage 9 boundary changed");
}

const productionRoots = new Set([
  "assembly", "backends", "engine", "host", "platform", "public", "resources", "runtime", "scene",
]);
const productionFiles = [...walk(simulatorRoot)]
  .filter((path) => extname(path) === ".ts")
  .map((path) => path.slice(simulatorRoot.length + 1).replaceAll("\\", "/"))
  .filter((path) => path === "index.ts" || productionRoots.has(path.split("/")[0]));
for (const relativePath of productionFiles) {
  const source = readFileSync(join(simulatorRoot, relativePath), "utf8");
  for (const forbidden of ["src/simulator/audit", "../audit", 'from "../../../../tmp', "GirlsBandParty-Reverse"]) {
    if (source.includes(forbidden)) throw new Error(`production source references local audit material: ${relativePath}`);
  }
}
console.log(`simulator static boundaries passed: production-files=${productionFiles.length}`);

function read(relativePath) {
  return readFileSync(join(simulatorRoot, relativePath), "utf8");
}
function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
