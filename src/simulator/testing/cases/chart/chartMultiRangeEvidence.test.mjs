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
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-simulator-chart-multi-range-"));
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
    join(outputRoot, "src", "simulator", "testing", "cases/chart/chartMultiRange.test.js"),
  ]);
  validateProductionMultiRange();
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function validateProductionMultiRange() {
  const chartRoot = join(outputRoot, "src", "simulator", "engine", "chart");
  const { MusicScoreBezierConverter, MusicScoreHeaderParser } = require(
    join(chartRoot, "musicScoreBezier.js"),
  );
  const { NoteDataBMSBuilder } = require(join(chartRoot, "bmsBuilder.js"));
  const { convertResultDictionary } = require(join(chartRoot, "batchConversion.js"));
  const { setupLongAndSlideNoteGraphs } = require(join(chartRoot, "noteGraph.js"));
  const {
    combineMultiRangeBatches,
    findHabahiroChangeAbsolutePos,
  } = require(join(chartRoot, "multiRangeCombine.js"));
  const {
    getMultiRangeSourceIdentity,
    registerMultiRangeSources,
  } = require(join(chartRoot, "multiRangeSources.js"));
  const source = readFileSync(join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "chart-construction",
    "fixtures",
    "786_miracle_april_habahiro_special.txt",
  ), "utf8");
  const converted = new MusicScoreBezierConverter(
    new MusicScoreHeaderParser(),
  ).convert(source);
  assertEqual(converted.status, "ok", "production conversion status");
  const builder = new NoteDataBMSBuilder();
  const initialized = builder.initialize(converted.value, false);
  assertEqual(initialized.status, "ok", "production builder status");
  const batches = convertResultDictionary(builder.resultDictionary);
  registerMultiRangeSources(batches, true);
  setupLongAndSlideNoteGraphs(batches, true);
  combineMultiRangeBatches(batches, true, false);
  const allNotes = batches.flatMap((batch) => batch.informationList);
  const slideGraph = allNotes
    .filter((note) => note.isSlideNoteHead)
    .flatMap((root) => [root, ...root.slideNoteList]);
  assertEqual(slideGraph.length, 626, "production Slide graph nodes");
  assertEqual(
    slideGraph.filter((note) => getMultiRangeSourceIdentity(note).ccNums.length > 0).length,
    626,
    "production Slide nodes with source CC",
  );
  assertEqual(findHabahiroChangeAbsolutePos(batches), 1728, "production lane-change position");
  console.log("ok - production HABAHIRO source CC and lane-change oracle");
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
