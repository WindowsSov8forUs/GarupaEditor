import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-audio-tests-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyTestingFixtures.mjs")]);
  }
  if (sharedOutputRoot === undefined) {
    run(process.execPath, [
      typeScriptCli,
      "-p",
      join(testingRoot, "tsconfig.tests.json"),
      "--outDir",
      outputRoot,
    ]);
  }
  run(process.execPath, [
    join(outputRoot, "src", "simulator", "testing", "sessionBgmDerivation.test.js"),
  ]);
  run(process.execPath, [
    join(outputRoot, "src", "simulator", "testing", "audioContracts.test.js"),
  ]);
  run(process.execPath, [
    join(outputRoot, "src", "simulator", "testing", "audioWebAudio.test.js"),
  ]);
  run(process.execPath, [join(testingRoot, "verifyAudioStatic.mjs")]);
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
