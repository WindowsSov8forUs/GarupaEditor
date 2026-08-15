import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-simulator-chart-command-data-"));
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
    join(outputRoot, "src", "simulator", "testing", "chartCommandData.test.js"),
  ]);
  validateProductionCommandData();
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function validateProductionCommandData() {
  const chartRoot = join(outputRoot, "src", "simulator", "engine", "chart");
  const { MusicScoreBezierConverter, MusicScoreHeaderParser } = require(
    join(chartRoot, "musicScoreBezier.js"),
  );
  const { NoteDataBMSBuilder } = require(join(chartRoot, "bmsBuilder.js"));
  const { convertResultDictionary } = require(join(chartRoot, "batchConversion.js"));
  const { setupLongAndSlideNoteGraphs } = require(join(chartRoot, "noteGraph.js"));
  const fixtures = [
    {
      file: "poppin_shuffle_special.txt",
      startBpm: 220,
      startBpmString: "220",
    },
    {
      file: "786_miracle_april_habahiro_special.txt",
      startBpm: 180,
      startBpmString: "180",
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
    const converted = new MusicScoreBezierConverter(
      new MusicScoreHeaderParser(),
    ).convert(source);
    assertEqual(converted.status, "ok", `${fixture.file} conversion status`);
    const builder = new NoteDataBMSBuilder();
    const initialized = builder.initialize(converted.value, false);
    assertEqual(initialized.status, "ok", `${fixture.file} builder status`);
    assertEqual(builder.startBpm, fixture.startBpm, `${fixture.file} start BPM`);
    assertEqual(builder.startBpmString, fixture.startBpmString, `${fixture.file} start BPM string`);
    assertEqual(builder.bpmChangeValueList.length, 0, `${fixture.file} BPM change count`);
    const batches = convertResultDictionary(builder.resultDictionary, {
      bpmChangeValueList: builder.bpmChangeValueList,
      isMultiRange: builder.isMultiRangeNotes,
    });
    setupLongAndSlideNoteGraphs(batches, builder.isMultiRangeNotes);
    const allNotes = batches
      .flatMap((batch) => batch.informationList)
      .filter(isPlayableRootOracle);
    assertEqual(
      allNotes.every((note) => note.gameNoteAdditionalType !== 1),
      true,
      `${fixture.file} Fever markers normalize while Skill-note presentation remains`,
    );
    assertEqual(
      allNotes.every((note) =>
        note.gameNoteAdditionalTypeLongNoteEnd !== 1),
      true,
      `${fixture.file} Fever terminal markers normalize while Skill remains`,
    );
    console.log(`ok - production command data ${fixture.file}`);
  }
}

function isPlayableRootOracle(note) {
  if (note.gameNoteType === 4 || note.gameNoteType === 5) {
    return note.isSlideNoteHead;
  }
  return note.gameNoteType === 0
    || note.gameNoteType === 1
    || note.gameNoteType === 2
    || note.gameNoteType === 10
    || note.gameNoteType === 11;
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
