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
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-render-contracts-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
  verifyEvidenceClosure();
  run(process.execPath, [
    typeScriptCli,
    "-p",
    join(testingRoot, "tsconfig.tests.json"),
    "--outDir",
    outputRoot,
  ]);
  run(process.execPath, [
    join(outputRoot, "src", "simulator", "testing", "renderContracts.test.js"),
  ]);
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

function verifyEvidenceClosure() {
  const closure = JSON.parse(readFileSync(join(evidenceRoot, "delivery_closure.json"), "utf8"));
  const oracle = JSON.parse(readFileSync(
    join(evidenceRoot, "resource_pixi_rendering_delivery_oracle.json"),
    "utf8",
  ));
  assert.equal(closure.rendering_delivery_gate, "closed");
  assert.equal(closure.production_authorization, true);
  assert.equal(closure.decision_status.D14, "closed-portable-contract");
  assert.equal(closure.decision_status.D17, "closed-fail-closed-contract-no-runtime-fault-claim");
  assert.equal(closure.fixed_case_status.PR35, "confirmed-delivery");
  assert.equal(closure.fixed_case_status.PR38, "confirmed-delivery");
  assert.deepEqual(closure.unknown_fields, []);
  assert.deepEqual(closure.blocking_findings, []);
  assert.equal(oracle.delivery_profile, "ordinary-exact-habahiro-degraded");
  assert.equal(oracle.fidelity.automatic_fallback, false);
  assert.equal(oracle.habahiro_resources.production_network_allowed, false);
  assert.deepEqual(oracle.unknown_fields, []);
  assert.deepEqual(oracle.blocking_findings, []);
  console.log("render contract evidence verified: D14/D17 PR35-PR38 delivery=closed");
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
