import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const compiledRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
if (!compiledRoot) throw new Error("quick compiled tests require SIMULATOR_TEST_COMPILED_ROOT");

const compiledTests = [
  "firstSlice.test.js",
  "chartConstructionBoundary.test.js",
  "chartBatchConversion.test.js",
  "chartNoteGraph.test.js",
  "chartMultiRange.test.js",
  "chartCommandData.test.js",
  "chartFinalize.test.js",
  "manualInputBoundary.test.js",
  "manualInputDispatch.test.js",
  "manualNormalJudgement.test.js",
  "manualFlickJudgement.test.js",
  "manualMultipleDirectionalJudgement.test.js",
  "manualLongJudgement.test.js",
  "manualSlideJudgement.test.js",
  "manualTimeoutJudgement.test.js",
  "scoreLifeState.test.js",
  "ordinaryNoteGeometry.test.js",
  "renderContracts.test.js",
  "sessionBgmDerivation.test.js",
  "audioContracts.test.js",
  "audioWebAudio.test.js",
  "startupAudioCallgraph.test.js",
  "particleContracts.test.js",
  "habahiroComplete.test.js",
  "c07EvidenceConsumption.test.js",
  "autonomousModule.test.js",
  "sceneLayout.test.js",
  "skinSettings.test.js",
];
const staticChecks = [
  "verifyAudioStatic.mjs",
  "verifyStartupDirectionStatic.mjs",
  "verifyParticleStatic.mjs",
  "verifyAutonomousModuleStatic.mjs",
  "verifyRenderProductionStatic.mjs",
  "verifySkinSettingsStatic.mjs",
];
const compiledTestingRoot = join(compiledRoot, "src", "simulator", "testing");
for (const test of compiledTests) run(process.execPath, [join(compiledTestingRoot, test)]);
for (const check of staticChecks) run(process.execPath, [join(testingRoot, check)]);
console.log(`quick compiled simulator tests passed: unit=${compiledTests.length} static=${staticChecks.length}`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args[0]} failed with exit code ${String(result.status)}`);
}
