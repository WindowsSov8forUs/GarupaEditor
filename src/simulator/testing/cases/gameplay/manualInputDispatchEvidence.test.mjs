import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const caseRoot = dirname(fileURLToPath(import.meta.url));
const testingRoot = resolve(caseRoot, "..", "..");
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-manual-input-dispatch-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
  verifyFrozenOracle();
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
    join(outputRoot, "src", "simulator", "testing", "cases/gameplay/manualInputDispatch.test.js"),
  ]);
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
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
      .filter((entry) => ["MJ03", "MJ04", "MJ05", "MJ06", "MJ07"].includes(entry.case_id))
      .map((entry) => [entry.case_id, entry]),
  );
  if (
    selected.size !== 5 ||
    [...selected.values()].some((entry) => entry.unknown_fields.length !== 0) ||
    selected.get("MJ03")?.output.equal_distance_replacement !== false ||
    selected.get("MJ04")?.output.cross_family !== "no synthetic tie-break" ||
    selected.get("MJ05")?.output.button_provenance !== "resolver-capability-only" ||
    selected.get("MJ06")?.output.same_note_competition !==
      "first touch that observes NoteBase.fingerId < 0 binds; later contenders do not rebind" ||
    selected.get("MJ07")?.output.button_rebind !== false
  ) {
    throw new Error("Frozen MJ03-MJ07 dispatch contract changed");
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
