import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const stages = [
  ["resource/Pixi production", "runRenderProductionTests.mjs"],
  ["first slice", "runFirstSliceTests.mjs"],
  ["chart boundary", "runChartConstructionBoundaryTests.mjs"],
  ["chart parsing", "runChartConstructionParsingTests.mjs"],
  ["chart batches", "runChartBatchConversionTests.mjs"],
  ["chart graphs", "runChartNoteGraphTests.mjs"],
  ["chart multi-range", "runChartMultiRangeTests.mjs"],
  ["chart command data", "runChartCommandDataTests.mjs"],
  ["chart finalize", "runChartFinalizeTests.mjs"],
  ["chart production", "runChartProductionAcceptanceTests.mjs"],
  ["clock scheduling", "runClockSchedulingTests.mjs"],
  ["Auto Live", "runAutoLiveTests.mjs"],
  ["manual input", "runManualInputAcceptanceTests.mjs"],
  ["Score/Life/State", "runScoreLifeStateTests.mjs"],
];
for (const [label, runner] of stages) {
  console.log(`\n=== resource/Pixi regression: ${label} ===`);
  run(process.execPath, [join(testingRoot, runner)]);
}
console.log(`resource/Pixi total regression passed: stages=${stages.length}`);

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
