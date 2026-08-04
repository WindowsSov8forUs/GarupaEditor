import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-simulator-chart-graphs-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");

try {
  run(process.execPath, [
    typeScriptCli,
    "-p",
    join(testingRoot, "tsconfig.tests.json"),
    "--outDir",
    outputRoot,
  ]);
  run(process.execPath, [
    join(outputRoot, "src", "simulator", "testing", "chartNoteGraph.test.js"),
  ]);
  validateProductionGraphs();
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

function validateProductionGraphs() {
  const chartRoot = join(outputRoot, "src", "simulator", "engine", "chart");
  const { MusicScoreBezierConverter, MusicScoreHeaderParser } = require(
    join(chartRoot, "musicScoreBezier.js"),
  );
  const { NoteDataBMSBuilder } = require(join(chartRoot, "bmsBuilder.js"));
  const { convertResultDictionary } = require(join(chartRoot, "batchConversion.js"));
  const {
    setupLongAndSlideNoteGraphs,
    setupMultipleDirectionalFlickNotes,
  } = require(join(chartRoot, "noteGraph.js"));
  const fixturesRoot = join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "chart-construction",
    "fixtures",
  );
  const fixtures = [
    {
      file: "poppin_shuffle_special.txt",
      roots: 93,
      sourceNodes: 298,
      expandedNodes: 1577,
    },
    {
      file: "786_miracle_april_habahiro_special.txt",
      roots: 51,
      sourceNodes: 141,
      expandedNodes: 626,
    },
  ];

  for (const fixture of fixtures) {
    const source = readFileSync(join(fixturesRoot, fixture.file), "utf8");
    const sourceRoots = buildRoots(source, false);
    const expandedRoots = buildRoots(source, true);
    assertEqual(sourceRoots.length, fixture.roots, `${fixture.file} source roots`);
    assertEqual(expandedRoots.length, fixture.roots, `${fixture.file} expanded roots`);
    assertEqual(countPathNodes(sourceRoots), fixture.sourceNodes, `${fixture.file} source nodes`);
    assertEqual(countPathNodes(expandedRoots), fixture.expandedNodes, `${fixture.file} expanded nodes`);
    assertPathsAreSubsequences(sourceRoots, expandedRoots, fixture.file);
    console.log(
      `ok - production Slide graph ${fixture.file}: roots=${fixture.roots}, source=${fixture.sourceNodes}, expanded=${fixture.expandedNodes}`,
    );
  }

  function buildRoots(source, convertBezier) {
    let score = source;
    if (convertBezier) {
      const converted = new MusicScoreBezierConverter(
        new MusicScoreHeaderParser(),
      ).convert(source);
      assertEqual(converted.status, "ok", "production conversion status");
      score = converted.value ?? source;
    }
    const builder = new NoteDataBMSBuilder();
    const initialized = builder.initialize(score, false);
    assertEqual(initialized.status, "ok", "production builder status");
    const batches = convertResultDictionary(builder.resultDictionary);
    setupLongAndSlideNoteGraphs(batches, builder.isMultiRangeNotes);
    setupMultipleDirectionalFlickNotes(batches);
    return batches
      .flatMap((batch) => batch.informationList)
      .filter((note) => note.isSlideNoteHead);
  }
}

function countPathNodes(roots) {
  return roots.reduce((count, root) => count + 1 + root.slideNoteList.length, 0);
}

function assertPathsAreSubsequences(sourceRoots, expandedRoots, label) {
  const remaining = [...expandedRoots];
  for (const sourceRoot of sourceRoots) {
    const sourcePath = [sourceRoot, ...sourceRoot.slideNoteList].map(nodeSignature);
    const matchingIndex = remaining.findIndex((expandedRoot) => {
      const expandedPath = [expandedRoot, ...expandedRoot.slideNoteList].map(nodeSignature);
      return sourcePath[0] === expandedPath[0]
        && sourcePath[sourcePath.length - 1] === expandedPath[expandedPath.length - 1]
        && isSubsequence(sourcePath, expandedPath);
    });
    assert(matchingIndex >= 0, `${label} source Slide path is missing from expanded graph`);
    remaining.splice(matchingIndex, 1);
  }
  assertEqual(remaining.length, 0, `${label} unmatched expanded paths`);
}

function nodeSignature(note) {
  return JSON.stringify([
    note.absolutePos,
    [...note.buttonTypesArray].sort((left, right) => left - right),
    note.isInvisible,
  ]);
}

function isSubsequence(source, expanded) {
  let sourceIndex = 0;
  for (const item of expanded) {
    if (sourceIndex < source.length && source[sourceIndex] === item) {
      sourceIndex += 1;
    }
  }
  return sourceIndex === source.length;
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
