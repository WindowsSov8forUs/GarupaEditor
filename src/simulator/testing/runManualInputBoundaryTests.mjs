import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-manual-input-boundary-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
  verifyFrozenOracle();
  run(process.execPath, [
    typeScriptCli,
    "-p",
    join(testingRoot, "tsconfig.tests.json"),
    "--outDir",
    outputRoot,
  ]);
  run(process.execPath, [
    join(
      outputRoot,
      "src",
      "simulator",
      "testing",
      "manualInputBoundary.test.js",
    ),
  ]);
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

function verifyFrozenOracle() {
  const oracle = JSON.parse(readFileSync(join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "manual-input-judgement",
    "artifacts",
    "investigations",
    "manual-input-runtime-contract-10-1-4",
    "manual_input_fixed_event_oracle.json",
  ), "utf8"));
  const selected = new Map(
    oracle.cases
      .filter((entry) => ["MJ01", "MJ07", "MJ25", "MJ26"].includes(entry.case_id))
      .map((entry) => [entry.case_id, entry]),
  );
  if (
    selected.size !== 4 ||
    [...selected.values()].some((entry) => entry.unknown_fields.length !== 0) ||
    oracle.portable_input_contract.finger_id.minimum !== 0 ||
    oracle.portable_input_contract.finger_id.maximum !== 14 ||
    oracle.portable_input_contract.phase.accepted.Began !== 0 ||
    oracle.portable_input_contract.phase.accepted.Ended !== 3 ||
    oracle.portable_input_contract.phase.rejected.Canceled !== 4 ||
    oracle.portable_input_contract.transaction !==
      "preflight entire frame before clock/scheduler/finger/note/OneFrame/backend mutation"
  ) {
    throw new Error("Frozen MJ01/MJ07/MJ25/MJ26 contract changed");
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
