import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const sharedOutputRoot = process.env.SIMULATOR_TEST_COMPILED_ROOT;
const outputRoot = sharedOutputRoot ?? mkdtempSync(join(tmpdir(), "garupa-clock-scheduling-"));
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
  validateClockScheduling();
  if (process.env.SIMULATOR_TEST_SHARED_PREFLIGHT !== "1") {
    run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
  }
} finally {
  if (sharedOutputRoot === undefined) rmSync(outputRoot, { recursive: true, force: true });
}

function validateClockScheduling() {
  const simulatorRoot = join(outputRoot, "src", "simulator");
  const construction = require(join(simulatorRoot, "engine", "chart", "construction.js"));
  const types = require(join(simulatorRoot, "engine", "chart", "types.js"));
  const { createSimulatorEngine } = require(join(simulatorRoot, "host", "createSimulatorEngine.js"));
  const { createRecordingSimulatorBackends } = require(join(simulatorRoot, "backends", "recordingBackend.js"));
  const {
    InGameMusicScoreController,
    advancePosition,
  } = require(join(simulatorRoot, "engine", "managers", "inGameMusicScoreController.js"));
  const {
    NoteManager,
    selectSubstepCount,
  } = require(join(simulatorRoot, "engine", "managers", "noteManager.js"));
  const { SlideNoteManager } = require(join(simulatorRoot, "engine", "managers", "slideNoteManager.js"));
  const { InGameCalculatedData } = require(join(
    simulatorRoot,
    "engine",
    "data",
    "inGameCalculatedData.js",
  ));
  const { InGameOneFrameJudgementController } = require(join(
    simulatorRoot,
    "engine",
    "managers",
    "inGameOneFrameJudgementController.js",
  ));

  const inputFor = (chart, highFrequencyMode = false, judgeOffsetFrames = 0) => ({
    chart,
    runtime: { highFrequencyMode, judgeOffsetFrames, playMode: { kind: "manual" } },
  });
  const chartFixtures = join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "chart-construction",
    "fixtures",
  );
  const runtimeOracle = join(
    repositoryRoot,
    "src", "simulator", "testing", "fixtures", "reverse-snapshots",
    "clock-scheduling",
    "artifacts",
    "investigations",
    "clock-scheduling-runtime-oracle",
  );
  const construct = (source, name) => {
    const result = construction.createNoteBatchInformationList({ musicScoreData: source });
    assertEqual(result.status, "ok", `${name} construction`);
    return result.value;
  };

  const normal = construct(
    readFileSync(join(chartFixtures, "poppin_shuffle_special.txt"), "utf8"),
    "normal production chart",
  );
  const wide = construct(
    readFileSync(join(chartFixtures, "786_miracle_april_habahiro_special.txt"), "utf8"),
    "HABAHIRO production chart",
  );
  assertEqual(normal.bpmChangeRealValueList.length, 0, "normal zero BPM-change");
  assertEqual(wide.bpmChangeRealValueList.length, 0, "HABAHIRO zero BPM-change");

  for (const [name, chart, expectedBpm] of [
    ["normal", normal, 220],
    ["HABAHIRO", wide, 180],
  ]) {
    const backends = createRecordingSimulatorBackends();
    const engineResult = createSimulatorEngine(inputFor(chart), backends);
    assertEqual(engineResult.status, "ok", `${name} engine construction ${JSON.stringify(engineResult)}`);
    const engine = engineResult.value;
    assertEqual(engine.initialize().status, "ok", `${name} initialize`);
    const snapshot = requireOk(engine.snapshot(), `${name} snapshot`);
    assertEqual(snapshot.managers.musicScore.currentBpm, expectedBpm, `${name} current BPM`);
    assertEqual(snapshot.managers.musicScore.currentBpmString, String(expectedBpm), `${name} BPM string`);
    assertEqual(snapshot.managers.musicScore.nextBpm, expectedBpm, `${name} next BPM`);
    assertEqual(snapshot.managers.noteManager.bpmChangeCount, 0, `${name} single-step gate`);
    assertDeepEqual(snapshot.managers.noteManager.performanceLevelCounters, [0, 0, 0, 0], `${name} counters`);
    assertDeepEqual(snapshot.backendTrace, [
      { sequence: 0, backend: "frame-rate", action: "request-target-frame-rate", detail: "60" },
    ], `${name} target frame rate`);
  }

  const cc03 = construct(
    readFileSync(join(runtimeOracle, "sources", "087_thesis_easy.bms.txt"), "utf8"),
    "CC03 production source",
  );
  const cc08 = construct(
    readFileSync(join(runtimeOracle, "sources", "653_ikuoku_easy.bms.txt"), "utf8"),
    "CC08 production source",
  );
  assertBpmCommand(cc03, 3, 7, 1344, 140, "140", "CC03");
  assertBpmCommand(cc08, 8, 16, 3072, 95.5, "95.5", "CC08");

  const cc08Controller = new InGameMusicScoreController(cc08);
  const initial = cc08Controller.snapshot();
  assertEqual(initial.currentBpm, 99.5, "CC08 initial current BPM");
  assertEqual(initial.currentBpmString, "99.5", "CC08 initial string");
  assertEqual(initial.launcherBeatProgress, 79.5999984741211, "CC08 launcher lead Float32");

  const traceStep = advancePosition(
    15,
    109.47891998291016,
    99.5,
    Math.fround(0.9936854839324951 / 60),
  );
  assertDeepEqual(traceStep, {
    bar: 15,
    beatProgress: 110.79721069335938,
  }, "entity trace Float32 clock step");

  const cc08Lifecycle = createCommandOnlyManager(cc08, 0, 1);
  let activation = null;
  let commit = null;
  let positiveCross = null;
  for (let frame = 1; frame <= 4000; frame += 1) {
    const before = cc08Lifecycle.controller.snapshot();
    if (
      positiveCross === null &&
      before.bar === 15 &&
      before.beatProgress > 187
    ) {
      positiveCross = {
        start: { bar: before.bar, beatProgress: before.beatProgress },
        value: cc08Lifecycle.controller.getAdjustedMusicPosition(5),
      };
    }
    assertEqual(cc08Lifecycle.manager.execUpdate(Math.fround(1 / 60)).status, "ok", `CC08 frame ${frame}`);
    const snapshot = cc08Lifecycle.manager.snapshot();
    const clock = cc08Lifecycle.controller.snapshot();
    if (activation === null && snapshot.activeBpmPoolIndices.length === 1) {
      activation = { frame, snapshot, clock };
    }
    if (clock.currentBpm === 95.5) {
      commit = { frame, snapshot, clock };
      break;
    }
  }
  assert(activation !== null, "CC08 command must activate in launcher window");
  assertEqual(activation.clock.nextBpm, 95.5, "CC08 next BPM at activation");
  assertEqual(activation.clock.currentBpm, 99.5, "CC08 current BPM before threshold");
  assertEqual(activation.snapshot.bpmPoolCursor, 1, "CC08 BPM pool acquire cursor");
  assert(commit !== null, "CC08 command must commit");
  assertEqual(commit.clock.currentBpmString, "95.5", "CC08 committed original string");
  assertDeepEqual(commit.snapshot.activeBpmPoolIndices, [], "CC08 immediate callback removal");
  assert(positiveCross !== null && positiveCross.value >= 3072, "Fast +5 must cross CC08 boundary");
  const fixedOldTempo = advanceRepeated(
    positiveCross.start,
    99.5,
    5,
    advancePosition,
  );
  const switchedTempo = advanceWithTempoBoundary(
    positiveCross.start,
    5,
    advancePosition,
  );
  assertEqual(positiveCross.value, switchedTempo, "Fast +5 per-step tempo lookup");
  assert(!Object.is(positiveCross.value, fixedOldTempo), "Fast +5 must re-query tempo after crossing");

  const negative = cc08Lifecycle.controller.getAdjustedMusicPosition(-5);
  assert(negative < 3072, "Slow -5 must borrow from bar 16 to bar 15");
  const negativeExpected = rewindRepeated(
    { bar: commit.clock.bar, beatProgress: commit.clock.beatProgress },
    95.5,
    5,
  );
  assertEqual(negative, negativeExpected, "Slow -5 retains committed CurrentBPM");

  const cc03Lifecycle = createCommandOnlyManager(cc03, 0, 1);
  let cc03Committed = false;
  for (let frame = 1; frame <= 3000; frame += 1) {
    assertEqual(cc03Lifecycle.manager.execUpdate(Math.fround(1 / 60)).status, "ok", `CC03 frame ${frame}`);
    if (cc03Lifecycle.controller.snapshot().currentBpm === 140) {
      cc03Committed = true;
      break;
    }
  }
  assert(cc03Committed, "CC03 command lifecycle");
  assertEqual(cc03Lifecycle.controller.snapshot().currentBpmString, "140", "CC03 string");

  const firstCc08 = findCommands(cc08)[0];
  const secondCc08 = { ...firstCc08, index: firstCc08.index + 1000, bpm: 123, bpmString: "123" };
  const sameBatch = [{
    ...findCommandBatches(cc08)[0],
    informationList: [firstCc08, secondCc08],
  }];
  const sameBatchManager = createManager(cc08, sameBatch, 0, 1);
  while (sameBatchManager.manager.snapshot().nextBatchIndex === 0) {
    assertEqual(sameBatchManager.manager.execUpdate(Math.fround(1 / 60)).status, "ok", "same-batch activation");
  }
  assertEqual(sameBatchManager.controller.snapshot().nextBpm, 95.5, "same batch consumes first BPM only");
  assertEqual(sameBatchManager.manager.snapshot().activeBpmPoolIndices.length, 1, "one BPM object per batch");

  const earlyOne = commandAt(firstCc08, 1, 111, "111");
  const earlyTwo = commandAt(firstCc08, 2, 112, "112");
  const crossed = createManager(cc08, [batchAt(earlyOne), batchAt(earlyTwo)], 0, 1);
  assertEqual(crossed.manager.execUpdate(0).status, "ok", "first overdue group");
  assertEqual(crossed.manager.snapshot().nextBatchIndex, 1, "one group first substep");
  assertEqual(crossed.manager.execUpdate(0).status, "ok", "second overdue group");
  assertEqual(crossed.manager.snapshot().nextBatchIndex, 2, "one group second substep");

  assertAdaptiveFallbacks(selectSubstepCount);

  const warmNormal = construct(
    readFileSync(join(chartFixtures, "poppin_shuffle_special.txt"), "utf8"),
    "warm-process normal chart",
  );
  const processPersistentEngine = requireOk(
    createSimulatorEngine(inputFor(warmNormal), createRecordingSimulatorBackends()),
    "warm-process zero chart engine",
  );
  assertEqual(processPersistentEngine.initialize().status, "ok", "warm-process initialize");
  assert(
    requireOk(processPersistentEngine.snapshot(), "warm-process snapshot")
      .managers.noteManager.bpmChangeCount >= 2,
    "process BPM count must retain earlier CC03/CC08 construction",
  );

  const backends120 = createRecordingSimulatorBackends();
  const engine120 = requireOk(createSimulatorEngine(inputFor(cc08, true), backends120), "120 engine");
  assertEqual(engine120.initialize().status, "ok", "120 initialize");
  assertDeepEqual(backends120.snapshot(), [
    { sequence: 0, backend: "frame-rate", action: "request-target-frame-rate", detail: "120" },
  ], "120 request exactly once");

  assertEqual(
    createSimulatorEngine(inputFor(cc08, false, -6), createRecordingSimulatorBackends()).status,
    "evidence-required",
    "judge offset outside observed UI range",
  );

  const productionNoteEngine = requireOk(
    createSimulatorEngine(inputFor(normal), createRecordingSimulatorBackends()),
    "production Note failure-close engine",
  );
  assertEqual(productionNoteEngine.initialize().status, "ok", "production Note initialize");
  let failedClosed = false;
  for (let frame = 0; frame < 4000; frame += 1) {
    const result = productionNoteEngine.step(Math.fround(1 / 60), { touches: [] });
    if (result.status === "evidence-required") {
      failedClosed = true;
      break;
    }
  }
  assert(failedClosed, "unrecovered production Note behavior must fail closed");

  console.log("clock scheduling simulator tests passed: 15");

  function createCommandOnlyManager(chart, judgeOffsetFrames, bpmChangeCount) {
    return createManager(chart, findCommandBatches(chart), judgeOffsetFrames, bpmChangeCount);
  }

  function createManager(chart, batches, judgeOffsetFrames, bpmChangeCount) {
    const controller = new InGameMusicScoreController(chart);
    const oneFrame = new InGameOneFrameJudgementController();
    assertEqual(oneFrame.initialize().status, "ok", "command manager OneFrame initialize");
    const manager = new NoteManager(
      batches,
      new SlideNoteManager(),
      controller,
      controller,
      bpmChangeCount,
      judgeOffsetFrames,
      new InGameCalculatedData({ kind: "manual" }),
      () => oneFrame.getUsableOneFrameData(),
      () => ({ status: "evidence-required", capability: "unused", requiredEvidence: [], boundary: "unused" }),
    );
    assertEqual(manager.execAwakeEnd().status, "ok", "command manager initialize");
    return { controller, manager };
  }
}

function findCommands(chart) {
  return chart.noteBatches.flatMap((batch) =>
    batch.informationList.filter((note) => note.ccNum === 3 || note.ccNum === 8));
}

function findCommandBatches(chart) {
  return chart.noteBatches.flatMap((batch) => {
    const command = batch.informationList.find((note) => note.ccNum === 3 || note.ccNum === 8);
    return command === undefined ? [] : [{ ...batch, informationList: [command] }];
  });
}

function assertBpmCommand(chart, ccNum, bar, absolutePos, bpm, bpmString, name) {
  const commands = findCommands(chart);
  assertEqual(commands.length, 1, `${name} command count`);
  assertEqual(commands[0].ccNum, ccNum, `${name} ccNum`);
  assertEqual(commands[0].barIndex, bar, `${name} bar`);
  assertEqual(commands[0].absolutePos, absolutePos, `${name} position`);
  assertEqual(commands[0].bpm, bpm, `${name} BPM`);
  assertEqual(commands[0].bpmString, bpmString, `${name} BPM string`);
}

function commandAt(source, absolutePos, bpm, bpmString) {
  return {
    ...source,
    index: source.index + absolutePos,
    barIndex: 0,
    numerator: absolutePos,
    denominator: 192,
    absolutePos,
    storedAbsolutePos: absolutePos,
    bpm,
    bpmString,
  };
}

function batchAt(command) {
  return {
    barIndex: command.barIndex,
    numerator: command.numerator,
    denominator: command.denominator,
    absolutePos: command.absolutePos,
    informationList: [command],
  };
}

function advanceRepeated(start, bpm, count, advancePosition) {
  let cursor = start;
  for (let index = 0; index < count; index += 1) {
    cursor = advancePosition(cursor.bar, cursor.beatProgress, bpm, Math.fround(1 / 60));
  }
  return Math.fround(cursor.beatProgress + 192 * cursor.bar);
}

function advanceWithTempoBoundary(start, count, advancePosition) {
  let cursor = start;
  for (let index = 0; index < count; index += 1) {
    const absolute = Math.fround(cursor.beatProgress + 192 * cursor.bar);
    cursor = advancePosition(
      cursor.bar,
      cursor.beatProgress,
      absolute >= 3072 ? 95.5 : 99.5,
      Math.fround(1 / 60),
    );
  }
  return Math.fround(cursor.beatProgress + 192 * cursor.bar);
}

function rewindRepeated(start, bpm, count) {
  const barSeconds = Math.fround(240 / Math.fround(bpm));
  const secondsPerPosition = Math.fround(barSeconds / 192);
  const amount = Math.fround(Math.fround(1 / 60) / secondsPerPosition);
  let bar = start.bar;
  let beat = start.beatProgress;
  for (let index = 0; index < count; index += 1) {
    beat = Math.fround(Math.fround(beat) - amount);
    if (beat < 0) {
      beat = Math.fround(beat + 192);
      bar -= 1;
    }
  }
  return Math.fround(beat + 192 * bar);
}

function assertAdaptiveFallbacks(selectSubstepCount) {
  const counter1 = [0, 0, 0, 0];
  for (let index = 0; index < 100; index += 1) {
    assertEqual(selectSubstepCount(0.02, 1, counter1), 2, `counter1 ${index}`);
  }
  assertEqual(selectSubstepCount(0.02, 1, counter1), 1, "counter1 101 fallback");
  const counter2 = [0, 0, 0, 0];
  for (let index = 0; index < 20; index += 1) {
    assertEqual(selectSubstepCount(0.04, 1, counter2), 3, `counter2 ${index}`);
  }
  assertEqual(selectSubstepCount(0.04, 1, counter2), 1, "counter2 21 fallback");
  const counter3 = [0, 0, 0, 0];
  for (let index = 0; index < 5; index += 1) {
    assertEqual(selectSubstepCount(0.05, 1, counter3), 4, `counter3 ${index}`);
  }
  assertEqual(selectSubstepCount(0.05, 1, counter3), 1, "counter3 6 fallback");
}

function requireOk(result, message) {
  assertEqual(result.status, "ok", message);
  return result.value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}: ${left} !== ${right}`);
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
