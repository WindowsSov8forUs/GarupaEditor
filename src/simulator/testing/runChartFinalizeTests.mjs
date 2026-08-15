import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { projectSyncConnectionCount } from "./chartSyncProjection.mjs";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-simulator-chart-finalize-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
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
    join(outputRoot, "src", "simulator", "testing", "chartFinalize.test.js"),
  ]);
  validateProductionFinalize();
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function validateProductionFinalize() {
  const { createNoteBatchInformationList } = require(join(
    outputRoot,
    "src",
    "simulator",
    "engine",
    "chart",
    "construction.js",
  ));
  const fixtures = [
    {
      file: "poppin_shuffle_special.txt",
      batches: 656,
      records: 935,
      syncConnections: 192,
    },
    {
      file: "786_miracle_april_habahiro_special.txt",
      batches: 371,
      records: 770,
      syncConnections: 266,
    },
  ];
  for (const fixture of fixtures) {
    const source = readFileSync(join(
      repositoryRoot,
      "src", "simulator", "testing", "fixtures", "reverse-snapshots",
      "chart-construction",
      "fixtures",
      fixture.file,
    ), "utf8");
    const result = createNoteBatchInformationList({ musicScoreData: source });
    assertEqual(result.status, "ok", `${fixture.file} construction status`);
    assertEqual(result.value.noteBatches.length, fixture.batches, `${fixture.file} batch count`);
    assertEqual(
      result.value.noteBatches.reduce(
        (count, batch) => count + batch.informationList.length,
        0,
      ),
      fixture.records,
      `${fixture.file} record count`,
    );
    const { getMultiRangeSourceIdentity } = require(join(
      outputRoot,
      "src",
      "simulator",
      "engine",
      "chart",
      "multiRangeSources.js",
    ));
    assertEqual(
      projectSyncConnectionCount(
        result.value.noteBatches,
        getMultiRangeSourceIdentity,
      ),
      fixture.syncConnections,
      `${fixture.file} sync connection count`,
    );
    console.log(`ok - production finalize ${fixture.file}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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
