import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

const observationRoot = mkdtempSync(join(tmpdir(), "garupa-render-observation-"));
const observationPath = join(observationRoot, "actual-pixi-observation.json");
process.env.SIMULATOR_RENDER_OBSERVATION_PATH = observationPath;
try {
  run(process.execPath, [join(testingRoot, "verifyRenderProductionStatic.mjs")]);
  run(process.execPath, [join(testingRoot, "verifyHabahiroStatic.mjs")]);
  run(process.execPath, [typeScriptCli, "-p", resolve(repositoryRoot, "src", "simulator", "tsconfig.json")]);
  for (const runner of [
    "runRenderContractTests.mjs",
    "runHabahiroContractTests.mjs",
    "runRenderPixiTests.mjs",
    "runRenderProductionChartTests.mjs",
  ]) run(process.execPath, [join(testingRoot, runner)]);
  run(process.execPath, [join(testingRoot, "verifyRenderProductionCases.mjs")]);
  run(process.execPath, [join(testingRoot, "verifyRenderObservationIndependence.mjs")]);
  run(process.execPath, [join(testingRoot, "verifyTotalRevalidationObservation.mjs"), observationPath]);
  console.log("actual-pixi-command-scene-routing passed: Reverse expected values + independently computed raw Note/HUD/full-chart observations");
} finally {
  rmSync(observationRoot, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
