import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  assertSlideSubsequences,
  assertWideSlideMainPaths,
  chartPosition,
  compareMultiset,
  countKinds,
  countValues,
  maxNoteCount,
  projectPlayableSpecs,
  slideSignature,
  sourceLanes,
} from "./chartProductionOracle.mjs";
import { projectSyncConnectionCount } from "./chartSyncProjection.mjs";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-chart-production-"));
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
  validateProductionCharts();
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

function validateProductionCharts() {
  const chartRoot = join(outputRoot, "src", "simulator", "engine", "chart");
  const construction = require(join(chartRoot, "construction.js"));
  const { NoteDataBMSBuilder } = require(join(chartRoot, "bmsBuilder.js"));
  const { convertResultDictionary } = require(join(chartRoot, "batchConversion.js"));
  const { finalizeNoteBatches } = require(join(chartRoot, "finalize.js"));
  const {
    combineMultiRangeBatches,
    findHabahiroChangeAbsolutePos,
  } = require(join(chartRoot, "multiRangeCombine.js"));
  const {
    setupLongAndSlideNoteGraphs,
    setupMultipleDirectionalFlickNotes,
  } = require(join(chartRoot, "noteGraph.js"));
  const {
    getMultiRangeSourceIdentity,
    registerMultiRangeSources,
  } = require(join(chartRoot, "multiRangeSources.js"));
  const fixturesRoot = join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "chart-construction",
    "fixtures",
  );
  const evidenceRoot = join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "chart-construction",
    "artifacts",
    "investigations",
    "runtime-integration-prototype",
  );
  const fixtures = [
    {
      name: "normal",
      bms: "poppin_shuffle_special.txt",
      chart: "poppin_shuffle_special.json",
      evidence: "production_bms_validation.json",
    },
    {
      name: "habahiro",
      bms: "786_miracle_april_habahiro_special.txt",
      chart: "786_miracle_april_habahiro_special.json",
      evidence: "production_habahiro_bms_validation.json",
    },
  ];

  for (const fixture of fixtures) {
    const source = readFileSync(join(fixturesRoot, fixture.bms), "utf8");
    const chart = JSON.parse(readFileSync(join(fixturesRoot, fixture.chart), "utf8"));
    const evidence = JSON.parse(readFileSync(
      join(evidenceRoot, fixture.evidence),
      "utf8",
    ));
    const runtimeResult = construction.createNoteBatchInformationList({
      musicScoreData: source,
    });
    assertEqual(runtimeResult.status, "ok", `${fixture.name} runtime status`);
    const repeatedResult = construction.createNoteBatchInformationList({
      musicScoreData: source,
    });
    assertEqual(repeatedResult.status, "ok", `${fixture.name} repeated status`);
    assertEqual(
      JSON.stringify(runtimeResult.value),
      JSON.stringify(repeatedResult.value),
      `${fixture.name} deterministic construction`,
    );
    const sourceResult = buildWithoutBezier(source);
    const runtimeSpecs = projectPlayableSpecs(
      runtimeResult.value.noteBatches,
      getMultiRangeSourceIdentity,
    );
    const sourceSpecs = projectPlayableSpecs(
      sourceResult.noteBatches,
      getMultiRangeSourceIdentity,
    );
    validateCommon(
      fixture,
      chart,
      evidence.runtime_result,
      runtimeResult.value,
      runtimeSpecs,
      getMultiRangeSourceIdentity,
    );
    if (fixture.name === "normal") {
      validateNormal(chart, evidence.runtime_result, sourceSpecs, runtimeSpecs);
    } else {
      validateHabahiro(
        chart,
        evidence.runtime_result,
        sourceResult,
        sourceSpecs,
        runtimeResult.value,
        runtimeSpecs,
        getMultiRangeSourceIdentity,
      );
    }
    console.log(
      `ok - chart production acceptance ${fixture.bms}: roots=${runtimeSpecs.length}`,
    );
  }

  function buildWithoutBezier(source) {
    const builder = new NoteDataBMSBuilder();
    const initialized = builder.initialize(source, false);
    assertEqual(initialized.status, "ok", "source builder status");
    const noteBatches = convertResultDictionary(builder.resultDictionary, {
      bpmChangeValueList: builder.bpmChangeValueList,
      isMultiRange: builder.isMultiRangeNotes,
    });
    registerMultiRangeSources(noteBatches, builder.isMultiRangeNotes);
    setupLongAndSlideNoteGraphs(noteBatches, builder.isMultiRangeNotes);
    combineMultiRangeBatches(
      noteBatches,
      builder.isMultiRangeNotes,
      false,
    );
    const habahiroChangeAbsolutePos = findHabahiroChangeAbsolutePos(noteBatches);
    finalizeNoteBatches(noteBatches);
    setupMultipleDirectionalFlickNotes(noteBatches);
    return {
      noteBatches,
      habahiroChangeAbsolutePos,
      startBpm: builder.startBpm,
      startBpmString: builder.startBpmString,
    };
  }
}

function validateCommon(
  fixture,
  chart,
  expected,
  result,
  specs,
  getSourceIdentity,
) {
  assertEqual(result.noteBatches.length, expected.batches, `${fixture.name} batches`);
  assertEqual(
    result.noteBatches.reduce(
      (count, batch) => count + batch.informationList.length,
      0,
    ),
    expected.information_records,
    `${fixture.name} records`,
  );
  assertEqual(result.startBpm, expected.start_bpm, `${fixture.name} start BPM`);
  assertEqual(
    result.startBpmString,
    expected.start_bpm_string,
    `${fixture.name} start BPM string`,
  );
  assertEqual(
    result.bpmChangeRealValueList.length,
    expected.bpm_change_commands,
    `${fixture.name} BPM change count`,
  );
  compareMultiset(
    chart.filter((event) => event.type === "BPM").map(
      (event) => [chartPosition(event.beat), Number(event.bpm)],
    ),
    [[0, result.startBpm], ...result.bpmChangeRealValueList.map(
      (bpm, index) => [index, bpm],
    )],
    `${fixture.name} BPM timeline`,
  );
  assertEqual(specs.length, expected.playable_specs, `${fixture.name} playable roots`);
  assertDeepEqual(countKinds(specs), expected.spec_kinds, `${fixture.name} spec kinds`);
  assertEqual(maxNoteCount(specs), expected.max_note_count, `${fixture.name} max note count`);
  assertEqual(
    projectSyncConnectionCount(result.noteBatches, getSourceIdentity),
    expected.sync_connections,
    `${fixture.name} sync count`,
  );
}

function validateNormal(chart, expected, sourceSpecs, runtimeSpecs) {
  compareMultiset(
    chart.filter((event) => event.type === "Single").map(singleEventSignature),
    runtimeSpecs
      .filter((spec) => spec.kind === "normal" || spec.kind === "flick")
      .map((spec) => singleSpecSignature(spec)),
    "normal Single fields",
  );
  compareMultiset(
    chart.filter((event) => event.type === "Directional").map(directionalEventSignature),
    runtimeSpecs
      .filter((spec) => spec.kind.startsWith("directional_flick_"))
      .map(directionalSpecSignature),
    "normal Directional fields",
  );
  compareMultiset(
    chart.filter((event) => event.type === "Long").map(longEventSignature),
    runtimeSpecs.filter((spec) => spec.kind === "long").map(longSpecSignature),
    "normal Long fields",
  );
  compareMultiset(
    chart.filter((event) => event.type === "Slide").map(slideEventSignature),
    sourceSpecs
      .filter((spec) => spec.kind === "slide")
      .map((spec) => slideSignature(spec).map(
        ([position, lanes, invisible]) => [position, lanes[0], invisible],
      )),
    "normal source Slide fields",
  );
  assertSlideSubsequences(
    sourceSpecs.filter((spec) => spec.kind === "slide"),
    runtimeSpecs,
    "normal runtime Slide subsequence",
  );
  assertDeepEqual(
    Object.fromEntries(countValues(
      runtimeSpecs
        .filter((spec) => spec.kind.startsWith("directional_flick_"))
        .map((spec) => spec.lanes.length),
    )),
    expected.directional_widths,
    "normal directional widths",
  );
  assertEqual(
    runtimeSpecs.every((spec) =>
      spec.rootAdditionalType !== 1 && spec.endAdditionalType !== 1),
    true,
    "Fever gameplay additional type stays unreachable while Skill-note presentation remains",
  );
  assertEqual(
    runtimeSpecs
      .filter((spec) => spec.kind === "slide")
      .reduce((count, spec) => count + spec.slideNodes.length, 0),
    expected.slide_runtime_connection_nodes,
    "normal runtime Slide nodes",
  );
}

function validateHabahiro(
  chart,
  expected,
  sourceResult,
  sourceSpecs,
  runtimeResult,
  runtimeSpecs,
  getSourceIdentity,
) {
  compareMultiset(
    chart.filter((event) => event.type === "Single").map(singleEventSignature),
    runtimeSpecs
      .filter((spec) => spec.kind === "normal" || spec.kind === "flick")
      .flatMap((spec) => spec.lanes.map(
        (lane) => singleSpecSignature(spec, lane),
      )),
    "HABAHIRO Single lane fields",
  );
  compareMultiset(
    chart.filter((event) => event.type === "Directional").map(directionalEventSignature),
    runtimeSpecs
      .filter((spec) => spec.kind.startsWith("directional_flick_"))
      .map(directionalSpecSignature),
    "HABAHIRO Directional fields",
  );
  compareMultiset(
    chart.filter((event) => event.type === "Long").map(longEventSignature),
    runtimeSpecs
      .filter((spec) => spec.kind === "long")
      .flatMap(longSpecLaneSignatures),
    "HABAHIRO Long lane paths",
  );
  const chartSlides = chart.filter((event) => event.type === "Slide");
  compareMultiset(
    chartSlides.flatMap((event) => event.connections.map(slideConnectionSignature)),
    sourceSpecs
      .filter((spec) => spec.kind === "slide")
      .flatMap((spec) => slideSignature(spec).flatMap(
        ([position, lanes, invisible]) => lanes.map(
          (lane) => [position, lane, invisible],
        ),
      )),
    "HABAHIRO Slide lane nodes",
  );
  assertWideSlideMainPaths(chartSlides, sourceSpecs);
  assertSlideSubsequences(sourceSpecs, runtimeSpecs, "HABAHIRO runtime Slide subsequence");
  assertEqual(sourceSpecs.length, 637, "HABAHIRO source playable roots");
  assertEqual(
    sourceResult.noteBatches.reduce(
      (count, batch) => count + batch.informationList.length,
      0,
    ),
    809,
    "HABAHIRO source records",
  );
  assertEqual(
    chartSlides.filter(
      (event) => new Set(event.connections.map((connection) => connection.beat)).size > 1,
    ).length,
    51,
    "HABAHIRO chart Slide main paths",
  );
  assertEqual(
    chartSlides.filter(
      (event) => new Set(event.connections.map((connection) => connection.beat)).size === 1,
    ).length,
    52,
    "HABAHIRO chart Slide support events",
  );
  assertEqual(
    runtimeSpecs.filter((spec) => spec.kind === "slide").length,
    51,
    "HABAHIRO runtime Slide roots",
  );
  assertEqual(
    runtimeSpecs
      .filter((spec) => spec.kind === "slide")
      .reduce((count, spec) => count + spec.slideNodes.length, 0),
    expected.runtime_slide_connection_nodes,
    "HABAHIRO runtime Slide nodes",
  );
  const allRecords = runtimeResult.noteBatches.flatMap((batch) => batch.informationList);
  assertEqual(
    allRecords.filter(
      (record) => getSourceIdentity(record).ccNums.length > 0,
    ).length,
    expected.records_with_cc_nums,
    "HABAHIRO records with CC identity",
  );
  assertEqual(
    allRecords.filter(
      (record) => getSourceIdentity(record).ccNums.length > 1,
    ).length,
    expected.records_with_combined_cc_nums,
    "HABAHIRO combined CC identities",
  );
  const laneChanges = allRecords.filter(
    (record) => record.gameNoteAdditionalType === 4,
  );
  assertEqual(laneChanges.length, expected.lane_change_commands, "lane-change count");
  assertDeepEqual(
    laneChanges.map((record) => record.absolutePos),
    expected.lane_change_positions,
    "lane-change positions",
  );
  assertDeepEqual(
    laneChanges.map((record) => sourceLanes(record, getSourceIdentity)[0]),
    expected.lane_change_source_lanes,
    "lane-change source lanes",
  );
  assertDeepEqual(
    laneChanges.map((record) => getSourceIdentity(record).ccNums),
    expected.lane_change_cc_nums,
    "lane-change source CC values",
  );
  assertEqual(
    runtimeResult.habahiroChangeAbsolutePos,
    1728,
    "HABAHIRO change absolute position",
  );
}

function singleEventSignature(event) {
  return [
    chartPosition(event.beat),
    event.lane,
    Boolean(event.flick),
    false,
    false,
  ];
}

function singleSpecSignature(spec, lane = spec.lanes[0]) {
  return [
    spec.position,
    lane,
    spec.kind === "flick",
    false,
    false,
  ];
}

function directionalEventSignature(event) {
  return [
    chartPosition(event.beat),
    event.lane,
    event.width,
    event.direction.toLowerCase(),
  ];
}

function directionalSpecSignature(spec) {
  return [
    spec.position,
    spec.directionalAnchorLane,
    spec.lanes.length,
    spec.kind.replace("directional_flick_", ""),
  ];
}

function longEventSignature(event) {
  return event.connections.map((connection) => [
    chartPosition(connection.beat),
    connection.lane,
    false,
  ]);
}

function longSpecSignature(spec) {
  return [
    [spec.position, spec.lanes[0], false],
    [spec.endPosition, spec.endLanes[0], false],
  ];
}

function longSpecLaneSignatures(spec) {
  assertEqual(spec.lanes.length, spec.endLanes.length, "Long source lane width");
  return spec.lanes.map((lane, index) => [
    [spec.position, lane, false],
    [spec.endPosition, spec.endLanes[index], false],
  ]);
}

function slideEventSignature(event) {
  return event.connections.map(slideConnectionSignature);
}

function slideConnectionSignature(connection) {
  return [
    chartPosition(connection.beat),
    connection.lane,
    Boolean(connection.hidden),
  ];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual, expected, message) {
  assert(
    isDeepStrictEqual(actual, expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
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
