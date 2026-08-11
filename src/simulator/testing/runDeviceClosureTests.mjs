import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const stages = [
  ["particle contracts/oracles/production", "runParticleTests.mjs"],
  ["audio", "runAudioTests.mjs"],
  ["resource/Pixi and all upstream simulator blocks", "runResourcePixiRenderingTests.mjs"],
];

for (const [label, runner] of stages) {
  console.log(`\n=== device closure: ${label} ===`);
  run(process.execPath, [join(testingRoot, runner)]);
}
console.log(`device closure portable regression passed: stages=${stages.length}; original exact gate remains open-not-claimed`);

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
