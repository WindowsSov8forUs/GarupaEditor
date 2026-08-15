import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const evidencePackage = join(
  repositoryRoot,
  "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "resource-pixi-rendering",
);
const evidenceRoot = join(
  evidencePackage,
  "artifacts",
  "investigations",
  "resource-pixi-rendering-runtime-contract-10-1-4",
);
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-render-contracts-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
  verifyEvidenceFacts();
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
    join(outputRoot, "src", "simulator", "testing", "renderContracts.test.js"),
  ]);
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function verifyEvidenceFacts() {
  const oracle = JSON.parse(readFileSync(
    join(evidenceRoot, "resource_pixi_rendering_delivery_oracle.json"),
    "utf8",
  ));
  assert.equal(oracle.delivery_profile, "ordinary-exact-habahiro-degraded");
  assert.equal(oracle.fidelity.automatic_fallback, false);
  assert.equal(oracle.habahiro_resources.production_network_allowed, false);
  assert.deepEqual(oracle.unknown_fields, []);
  assert.deepEqual(oracle.blocking_findings, []);
  console.log("render contract raw facts verified independently (legacy closure/authorization fields ignored)");
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
