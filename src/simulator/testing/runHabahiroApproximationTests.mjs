import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(testingRoot, "..", "..", "..");
const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
for (const [label, command, args] of [
  ["evidence", process.execPath, [resolve(root, "tmp/simulator-habahiro-approximation-evidence/verify.mjs")]],
  ["static audit", process.execPath, [join(testingRoot, "verifyHabahiroApproximationStatic.mjs")]],
  ["isolated type check", process.execPath, [tsc, "-p", resolve(root, "src/simulator/tsconfig.json")]],
  ["contracts", process.execPath, [join(testingRoot, "runHabahiroContractTests.mjs")]],
  ["Pixi consumption", process.execPath, [join(testingRoot, "runRenderPixiTests.mjs")]],
  ["full-chart oracle", process.execPath, [join(testingRoot, "runRenderProductionChartTests.mjs")]],
]) {
  console.log(`\n=== HABAHIRO approximation: ${label} ===`);
  run(command, args);
}
console.log("HABAHIRO approximation acceptance passed: HR01-HR12");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(root, "node_modules") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
