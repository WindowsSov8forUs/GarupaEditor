import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const stages = [
  ["fixture provenance, bytes and SHA-256", "verifyTestingFixtures.mjs"],
  ["production source/static boundaries", "verifyEvidenceIntegrityStatic.mjs"],
  ["Public full-length and internal Life profile", "runPublicLifeProfileTests.mjs"],
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
  "legacy evidence-integrity candidate matrix executed; it does not close current production gates; HAB original/fixed-device exact remain open or excluded while Stage 9 product integration is separately closed",
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
