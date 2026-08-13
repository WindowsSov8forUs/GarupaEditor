import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const stages = [
  ["fixture provenance, bytes and SHA-256", "verifyTestingFixtures.mjs"],
  ["production reachability/claim/static integrity", "verifyEvidenceIntegrityStatic.mjs"],
  ["actual Pixi raw-observation independent oracle", "runRenderProductionTests.mjs"],
  ["ordinary and HAB early capability gates", "runRenderProductionChartTests.mjs"],
  ["public/runtime pause/replay/cleanup lifecycle", "runAutonomousModuleTests.mjs"],
  ["manual production input/judgement", "runManualInputAcceptanceTests.mjs"],
  ["Auto Live production path", "runAutoLiveTests.mjs"],
  ["score/life/GameOver state", "runScoreLifeStateTests.mjs"],
  ["audio semantic/PCM/WebAudio", "runAudioTests.mjs"],
  ["particle semantic/simulation/Pixi", "runParticleTests.mjs"],
];
for (const [label, runner] of stages) {
  console.log(`\n=== evidence-integrity: ${label} ===`);
  run(process.execPath, [join(testingRoot, runner)]);
}
console.log(
  "evidence-integrity dynamic matrix passed: ordinary portable gates observed; HAB original parity, browser raster, device exact and stage-9 remain open/excluded as classified",
);

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
