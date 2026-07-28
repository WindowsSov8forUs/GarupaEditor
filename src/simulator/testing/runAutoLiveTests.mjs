import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const outputRoot = mkdtempSync(join(tmpdir(), "garupa-auto-live-"));
const require = createRequire(import.meta.url);
const typeScriptCli = require.resolve("typescript/bin/tsc");
const oraclePath = join(
  repositoryRoot,
  "tmp",
  "simulator-reverse-evidence",
  "auto-live",
  "fixtures",
  "auto-live-fixed-event-trace.json",
);
const failurePath = join(
  repositoryRoot,
  "tmp",
  "simulator-reverse-evidence",
  "auto-live",
  "fixtures",
  "auto-live-failure-cases.json",
);
const supplementOraclePath = join(
  repositoryRoot,
  "tmp",
  "simulator-reverse-evidence",
  "auto-live",
  "fixtures",
  "auto-live-supplement-fixed-event-trace.json",
);
const productionMultipleOraclePath = join(
  testingRoot,
  "autoLiveProductionMultipleOracle.json",
);
const actualReplayPath = join(
  repositoryRoot,
  "tmp",
  "simulator-reverse-evidence",
  "auto-live",
  "fixtures",
  "auto-live-actual-replay.json",
);
const actualReplayChartPath = join(
  repositoryRoot,
  "tmp",
  "simulator-reverse-evidence",
  "auto-live",
  "fixtures",
  "auto-live-actual-replay-chart.txt",
);

function validateAutoLive() {
  const simulatorRoot = join(outputRoot, "src", "simulator");
  const types = require(join(simulatorRoot, "engine", "chart", "types.js"));
  const construction = require(join(simulatorRoot, "engine", "chart", "construction.js"));
  const notes = require(join(simulatorRoot, "engine", "notes", "noteTypes.js"));
  const { NoteState } = require(join(simulatorRoot, "engine", "notes", "noteBase.js"));
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
  const { InGameMusicScoreController } = require(join(
    simulatorRoot,
    "engine",
    "managers",
    "inGameMusicScoreController.js",
  ));
  const { NoteManager, noteFamily, groupMultipleDirectionalInformationList } = require(join(
    simulatorRoot,
    "engine",
    "managers",
    "noteManager.js",
  ));
  const { SlideNoteManager } = require(join(
    simulatorRoot,
    "engine",
    "managers",
    "slideNoteManager.js",
  ));
  const { InGameManager } = require(join(
    simulatorRoot,
    "engine",
    "managers",
    "inGameManager.js",
  ));
  const { GamePlayButton, InputManager } = require(join(
    simulatorRoot,
    "engine",
    "managers",
    "inputBoundaries.js",
  ));
  const { createSimulatorEngine } = require(join(
    simulatorRoot,
    "host",
    "createSimulatorEngine.js",
  ));
  const { createRecordingSimulatorBackends } = require(join(
    simulatorRoot,
    "backends",
    "recordingBackend.js",
  ));
  const fixture = require(join(
    simulatorRoot,
    "testing",
    "firstSliceFixtures.js",
  ));

  const oracle = JSON.parse(readFileSync(oraclePath, "utf8"));
  const failureOracle = JSON.parse(readFileSync(failurePath, "utf8"));
  const supplementOracle = JSON.parse(readFileSync(supplementOraclePath, "utf8"));
  const productionMultipleOracle = JSON.parse(
    readFileSync(productionMultipleOraclePath, "utf8"),
  );
  assert.equal(productionMultipleOracle.status,
    "fixed-independent-source-order-production-oracle");
  const actualReplay = JSON.parse(readFileSync(actualReplayPath, "utf8"));
  assert.equal(actualReplay.status, "confirmed-committed-production-replay-input");
  assert.equal(actualReplay.production_owner,
    "InGameMusicScoreController.getAdjustedMusicPosition");
  assert.equal(oracle.status, "confirmed-static-contract-fixed-offline-oracle");
  assert.equal(failureOracle.status, "confirmed-failure-closed-matrix");
  const oracleCases = new Map(oracle.cases.map((entry) => [entry.case_id, entry]));
  const supplementCases = new Map(
    supplementOracle.cases.map((entry) => [entry.case_id, entry]),
  );
  assert.deepEqual([...oracleCases.keys()], [
    "single-normal-before-equal",
    "single-manual-does-not-force",
    "flick-base-first-single-result",
    "directional-left-synthetic",
    "directional-right-synthetic",
    "long-head-equal-tail-strict-greater",
    "slide-one-pending-node-per-update",
    "slide-invisible-support-skipped-before-visible",
    "simultaneous-reverse-update-five-slot-pool",
    "adaptive-substeps-one-outer-reflect",
    "adjustment-sign-crossing",
  ]);
  assert.deepEqual([...supplementCases.keys()], [
    "multiple-directional-left-auto-group",
    "multiple-directional-right-auto-group",
    "slide-stop-selected-visible-intermediate",
    "pause-active-long-freeze-resume",
    "pause-active-slide-pending-slot-freeze",
    "offset-plus5-cross-bpm-exact",
    "offset-minus5-cross-bar-exact",
    "offset-zero-identity-exact",
    "multiple-source-order-interleaved-break",
    "one-frame-exhaustion-long-head-terminal-fault",
    "one-frame-exhaustion-slide-head-terminal-fault",
    "one-frame-exhaustion-long-tail-terminal-fault",
    "actual-adaptive-scheduler-observation-requirements",
    "actual-offset-tempo-query-observation-requirements",
  ]);
  const tests = [];
  const test = (id, name, execute) => tests.push({ id, name, execute });

  const cloneInfo = (testingId, index, overrides = {}) => ({
    ...fixture.noteInformation(testingId, index),
    ...overrides,
  });
  const normalInfo = (index, absolutePos = 120, overrides = {}) => cloneInfo(
    `normal-${index}`,
    index,
    { absolutePos, storedAbsolutePos: absolutePos, ...overrides },
  );
  const longInfo = (index = 105) => normalInfo(index, 120, {
    gameNoteType: types.GameNoteType.Long,
    fireNoteType: types.FrontNoteType.Long,
    afterNoteType: types.AfterNoteType.Normal,
    afterNoteAbsolutePos: 240,
  });
  const multipleInfo = (index, absolutePos, buttonType, gameNoteType) => normalInfo(
    index,
    absolutePos,
    {
      buttonType,
      buttonTypes: [buttonType],
      buttonTypesArray: [buttonType],
      gameNoteType,
      fireNoteType: types.FrontNoteType.MultipleDirectionalFlick,
    },
  );
  const slideInfo = (index = 106, nodeSpecs = [
    { absolutePos: 180 },
    { absolutePos: 181 },
    { absolutePos: 240, gameNoteType: types.GameNoteType.SlideEndA },
  ], rootOverrides = {}) => {
    const children = nodeSpecs.map((spec, childIndex) => normalInfo(
      index * 10 + childIndex + 1,
      spec.absolutePos,
      {
        gameNoteType: spec.gameNoteType ?? types.GameNoteType.SlideA,
        fireNoteType: types.FrontNoteType.SlideA,
        isInvisible: spec.isInvisible ?? false,
      },
    ));
    return normalInfo(index, 120, {
      gameNoteType: types.GameNoteType.SlideA,
      fireNoteType: types.FrontNoteType.SlideA,
      isSlideNoteHead: true,
      afterNoteType: types.AfterNoteType.None,
      afterNoteAbsolutePos: children.at(-1).absolutePos,
      slideNoteList: children,
      ...rootOverrides,
    });
  };
  const controller = () => {
    const value = new InGameOneFrameJudgementController();
    ok(value.initialize(), "OneFrame initialize");
    return value;
  };
  const bindNote = (note, information, options = {}) => {
    const oneFrame = options.oneFrame ?? controller();
    const position = options.position ?? { value: 0 };
    const isAuto = options.isAuto ?? true;
    note.registerAutoLiveRuntime({
      isAutoPlay: () => isAuto,
      getAdjustedMusicPosition: () => position.value,
      submitJudgement: (request) => oneFrame.setupAutoLiveJudgement(request),
    });
    ok(note.activate(information), "note activate");
    return { note, information, oneFrame, position };
  };
  const reflect = (oneFrame) => {
    const result = ok(oneFrame.reflectOneFrameData(), "OneFrame reflect");
    assert.notEqual(result, null, "expected a non-empty judgement batch");
    return result;
  };
  const events = (oneFrame, kind) => oneFrame.snapshot().trace.filter(
    (entry) => entry.kind === kind,
  );

  test("AL01", "显式 Auto Live 判别且 manual 不走 Force Perfect", () => {
    const manualMode = new InGameCalculatedData({ kind: "manual" });
    const autoMode = new InGameCalculatedData({
      kind: "auto-live",
      resultTransform: "identity-no-active-situation-skill",
    });
    assert.equal(manualMode.isAutoPlay, false);
    assert.equal(autoMode.isAutoPlay, true);
    const manual = bindNote(new notes.NoteNormal("manual"), normalInfo(101), {
      position: { value: 120 },
      isAuto: false,
    });
    ok(manual.note.executeUpdate(0), "manual crossing");
    assert.equal(manual.note.state, NoteState.Move);
    assert.equal(manual.oneFrame.existsOneFrameData(), false);
    assert.equal(
      oracleCases.get("single-manual-does-not-force").steps[0].event,
      "manual-crossing-no-force-perfect",
    );
  });

  test("AL02", "JudgementAdjustValueB 正负号沿用时钟闭合路径", () => {
    const music = new InGameMusicScoreController(fixture.chart([], 120));
    ok(music.advance(1.25), "advance music");
    const negative = music.getAdjustedMusicPosition(-5);
    const identity = music.getAdjustedMusicPosition(0);
    const positive = music.getAdjustedMusicPosition(5);
    assert(negative < identity && identity < positive);
    const traceBeforePeek = music.snapshot().tempoQueryTrace;
    assert.equal(traceBeforePeek.length, 10);
    assert.equal(traceBeforePeek.slice(0, 5).every((entry) => entry.bpm === 120), true);
    assert.equal(traceBeforePeek.slice(5).every((entry) => entry.bpm === 120), true);
    assert.equal(music.peekAdjustedMusicPosition(5), positive);
    assert.deepEqual(music.snapshot().tempoQueryTrace, traceBeforePeek,
      "read-only adjusted-position peek must not append observation entries");
    const relations = oracleCases.get("adjustment-sign-crossing").steps.map(
      (step) => step.relation,
    );
    assert.deepEqual(relations, [
      "rewind-five-tempo-aware-steps",
      "identity",
      "advance-five-tempo-aware-steps",
    ]);
    const snapshotHost = ok(createSimulatorEngine({
      chart: fixture.chart([], 120),
      runtime: {
        highFrequencyMode: false,
        judgeOffsetFrames: 5,
        playMode: { kind: "manual" },
      },
    }, createRecordingSimulatorBackends()), "snapshot purity host create");
    ok(snapshotHost.initialize(), "snapshot purity host initialize");
    const firstSnapshot = ok(snapshotHost.snapshot(), "snapshot purity first");
    const secondSnapshot = ok(snapshotHost.snapshot(), "snapshot purity second");
    assert.deepEqual(secondSnapshot, firstSnapshot);
    assert.equal(secondSnapshot.managers.musicScore.tempoQueryTrace.length, 0);
    ok(snapshotHost.dispose(), "snapshot purity host dispose");
    assert.equal(actualReplay.offset_replays.length, 3);
    assert.equal(actualReplay.forbidden_test_inputs.includes("expected-step-bpms"), true);
  });

  test("AL03", "Normal 在 before 保持 Move、equal 同次 Update Perfect", () => {
    const source = oracleCases.get("single-normal-before-equal");
    const before = source.steps[0].adjusted_position;
    const equal = source.steps[1].adjusted_position;
    assert.equal(float32Bits(before.value), before.bits);
    assert.equal(float32Bits(equal.value), equal.bits);
    const bound = bindNote(new notes.NoteNormal("normal"), normalInfo(100), {
      position: { value: before.value },
    });
    ok(bound.note.executeUpdate(0), "before crossing");
    assert.equal(bound.note.state, NoteState.Move);
    bound.position.value = equal.value;
    ok(bound.note.executeUpdate(0), "equal crossing");
    assert.equal(bound.note.state, NoteState.Deactive);
    const batch = reflect(bound.oneFrame);
    assert.deepEqual(projectBatch(batch), {
      slots: [0], noteIndices: [100], entryCount: 1, addCombo: 1,
    });
    ok(bound.note.executeUpdate(0), "deactive update does not repeat");
    assert.equal(bound.oneFrame.existsOneFrameData(), false);
  });

  test("AL05", "普通 Flick 严格 Began→-100 Moved→一次结果", () => {
    const expected = oracleCases.get("flick-base-first-single-result");
    const bound = bindNote(new notes.NoteFlick("flick"), normalInfo(102, 120, {
      gameNoteType: types.GameNoteType.Flick,
      fireNoteType: types.FrontNoteType.Flick,
    }), { position: { value: 120 } });
    ok(bound.note.executeUpdate(0), "flick force perfect");
    assert.deepEqual(bound.note.flickTrace, [
      { kind: expected.steps[0].event },
      {
        kind: expected.steps[1].event,
        syntheticX: expected.steps[1].synthetic_x.value,
      },
    ]);
    assert.equal(float32Bits(bound.note.flickTrace[1].syntheticX),
      expected.steps[1].synthetic_x.bits);
    const batch = reflect(bound.oneFrame);
    assert.equal(batch.entries.length, 1);
    assert.equal(batch.entries[0].noteType, expected.steps[2].note_type);
    assert.deepEqual(expected.steps.map((step) => step.event), [
      "flick-begin", "flick-synthetic-move", "head-perfect", "reflect",
    ]);
  });

  test("AL06", "Directional ±500 与 Multiple group note type10/唯一结果", () => {
    for (const [sourceType, expected, bits] of [
      [10, -500, "0xC3FA0000"],
      [11, 500, "0x43FA0000"],
    ]) {
      const bound = bindNote(
        new notes.NoteDirectionalFlick(`directional-${sourceType}`),
        normalInfo(93 + sourceType, 120, {
          gameNoteType: sourceType,
          fireNoteType: types.FrontNoteType.DirectionalFlick,
        }),
        { position: { value: 120 } },
      );
      ok(bound.note.executeUpdate(0), "directional force perfect");
      const oracleCase = oracleCases.get(
        sourceType === 10 ? "directional-left-synthetic" : "directional-right-synthetic",
      );
      assert.equal(bound.note.flickTrace[1].syntheticX,
        oracleCase.steps[1].synthetic_x.value);
      assert.equal(bound.note.flickTrace[1].syntheticX, expected);
      assert.equal(float32Bits(expected), oracleCase.steps[1].synthetic_x.bits);
      assert.equal(float32Bits(expected), bits);
      assert.equal(reflect(bound.oneFrame).entries[0].noteType,
        oracleCase.steps[2].note_type);
    }

    const grouped = [0, 1, 2].map((buttonType, index) =>
      multipleInfo(700 + index, 1, buttonType, types.GameNoteType.DirectionalFlickLeft));
    assert.deepEqual(groupMultipleDirectionalInformationList(grouped).map(
      (group) => group.map((information) => information.index)), [[700, 701, 702]]);
    const sourceRunOracle = supplementCases.get(
      "multiple-source-order-interleaved-break",
    );
    const sourceRun = [
      multipleInfo(710, 1, 4, types.GameNoteType.DirectionalFlickRight),
      multipleInfo(711, 1, 5, types.GameNoteType.DirectionalFlickRight),
      normalInfo(712, 1, { buttonType: 0 }),
      multipleInfo(713, 1, 6, types.GameNoteType.DirectionalFlickRight),
    ];
    assert.deepEqual(
      groupMultipleDirectionalInformationList(sourceRun).map((group) =>
        group.map((information) => information.buttonType)),
      sourceRunOracle.source_order_runs,
    );
    const integration = schedulerIntegration({
      batches: [batch(1, grouped)],
      bpmChangeCount: 0,
      positions: [0, 2],
    });
    ok(integration.manager.initialize(), "Multiple Directional initialize");
    ok(integration.manager.execUpdate(0.001), "Multiple Directional activate");
    ok(integration.manager.execUpdate(0.001), "Multiple Directional Auto crossing");
    const multipleBatch = integration.oneFrame.getReflectOneFrameData();
    const expectedMultiple = supplementCases.get("multiple-directional-left-auto-group");
    assert.equal(multipleBatch.entryCount, 1);
    assert.equal(multipleBatch.entries[0].noteIndex, 702);
    assert.equal(multipleBatch.entries[0].noteType,
      expectedMultiple.steps.find((step) => step.event === "head-perfect").note_type);
    const setupTrace = integration.oneFrame.snapshot().trace.findLast(
      (entry) => entry.kind === "one-frame.setup-auto-live");
    assert.equal(setupTrace.multipleDirectionalFlickNoteCount, 3);
    const pool = integration.manager.snapshot().noteManager.pools.find(
      (entry) => entry.family === "multiple-directional-flick");
    assert.equal(pool.objects.every((object) => object.state === NoteState.Deactive), true);
    assert.equal(pool.objects.flatMap((object) => object.multipleDirectionalTrace)
      .filter((entry) => entry.kind === "multiple-head-perfect").length, 1);
    assert.equal(pool.objects.flatMap((object) => object.multipleDirectionalTrace)
      .filter((entry) => entry.kind === "multiple-side-used-deactivate").length, 2);
  });

  test("AL07", "Long head equal 切 Wait 并独立提交 head", () => {
    const expected = oracleCases.get("long-head-equal-tail-strict-greater").steps[0];
    const bound = bindNote(new notes.NoteLong("long-head"), longInfo(), {
      position: { value: 120 },
    });
    ok(bound.note.executeUpdate(0), "long head");
    assert.equal(expected.state_after, "Wait");
    assert.equal(bound.note.state, NoteState.Wait);
    const batch = reflect(bound.oneFrame);
    assert.equal(batch.entries[0].phase, "head");
    assert.equal(bound.note.afterNote.judged, false);
  });

  test("AL08", "Long tail strict greater 且 linked finish 在 root tail 之前", () => {
    const expected = oracleCases.get("long-head-equal-tail-strict-greater");
    const bound = bindNote(new notes.NoteLong("long-tail"), longInfo(), {
      position: { value: 120 },
    });
    ok(bound.note.executeUpdate(0), "long head");
    reflect(bound.oneFrame);
    bound.position.value = 240;
    ok(bound.note.executeUpdate(0), "tail equal");
    assert.equal(bound.note.state, NoteState.Wait);
    assert.equal(bound.oneFrame.existsOneFrameData(), false);
    bound.position.value = Math.fround(240.00001525878906);
    ok(bound.note.executeUpdate(0), "tail strict greater");
    assert.equal(bound.note.state, NoteState.Deactive);
    assert.equal(reflect(bound.oneFrame).entries[0].phase, "tail");
    assert.equal(bound.note.afterNote, null);
    assert.deepEqual(bound.note.autoLiveTrace.slice(-2).map((entry) =>
      entry.kind === "long-tail-perfect" ? "tail-perfect" : entry.kind), [
      expected.steps[3].event,
      expected.steps[4].event,
    ]);
    assert.equal(expected.steps[2].event, "tail-equal-no-crossing");
    ok(bound.note.activate(longInfo(108)), "reuse Long pool object");
    assert.equal(bound.note.afterNote.judged, false);
    assert.equal(bound.note.afterNote.absolutePosition, 240);
  });

  test("AL13", "AfterUpdate 保持父 base→Long linked/Slide current", () => {
    const bound = bindNote(new notes.NoteLong("long-after-update"), longInfo(), {
      position: { value: 120 },
    });
    ok(bound.note.executeUpdate(0), "head");
    reflect(bound.oneFrame);
    ok(bound.note.executeAfterUpdate(0), "Long AfterUpdate");
    assert.deepEqual(bound.note.autoLiveTrace.slice(-2).map((entry) => entry.kind), [
      "long-base-after-update",
      "long-linked-after-update",
    ]);
    const slide = bindNote(new notes.NoteSlide("slide-after-update"), slideInfo(), {
      position: { value: 120 },
    });
    ok(slide.note.executeUpdate(0), "slide head");
    reflect(slide.oneFrame);
    ok(slide.note.executeAfterUpdate(0), "Slide AfterUpdate");
    assert.deepEqual(slide.note.autoLiveTrace.slice(-2).map((entry) => entry.kind), [
      "slide-base-after-update",
      "slide-current-after-update",
    ]);
  });

  test("AL09", "Slide head equal 切 Wait 且 current 保持 0", () => {
    const expected = oracleCases.get("slide-one-pending-node-per-update").steps[0];
    const bound = bindNote(new notes.NoteSlide("slide-head"), slideInfo(), {
      position: { value: 120 },
    });
    ok(bound.note.executeUpdate(0), "slide head");
    assert.equal(bound.note.state, NoteState.Wait);
    assert.equal(bound.note.currentAfterIndex, 0);
    assert.equal(expected.current_after_index, 0);
    assert.equal(reflect(bound.oneFrame).entries[0].phase, "head");
  });

  test("AL10", "Slide intermediate/invisible 均先服从 current position gate", () => {
    const expected = oracleCases.get("slide-one-pending-node-per-update");
    const bound = bindNote(new notes.NoteSlide("slide-intermediate"), slideInfo(), {
      position: { value: 120 },
    });
    ok(bound.note.executeUpdate(0), "head");
    reflect(bound.oneFrame);
    bound.position.value = 180;
    ok(bound.note.executeUpdate(0), "first intermediate");
    assert.equal(bound.note.currentAfterIndex, 1);
    assert.equal(bound.note.currentAfterIndex, expected.steps[2].current_after_after);
    assert.equal(reflect(bound.oneFrame).entries[0].phase, "intermediate");
    bound.position.value = 181;
    ok(bound.note.executeUpdate(0), "second intermediate");
    assert.equal(bound.note.currentAfterIndex, 2);
    assert.equal(bound.note.currentAfterIndex, expected.steps[4].current_after_after);
    const invisibleRootPosition = 120;
    const invisibleChildPosition = 170;
    const invisible = bindNote(new notes.NoteSlide("slide-invisible"), slideInfo(107, [
      { absolutePos: invisibleChildPosition, isInvisible: true },
      { absolutePos: 180 },
      { absolutePos: 240, gameNoteType: types.GameNoteType.SlideEndA },
    ]), { position: { value: previousPositiveFloat32(invisibleRootPosition) } });
    ok(invisible.note.executeUpdate(0), "invisible root before");
    assert.equal(invisible.note.state, NoteState.Move);
    assert.equal(invisible.note.currentAfterIndex, 0);
    assert.equal(invisible.note.afterNotes[0].judged, false);
    assert.equal(invisible.oneFrame.existsOneFrameData(), false);
    invisible.position.value = invisibleRootPosition;
    ok(invisible.note.executeUpdate(0), "invisible root equal before child");
    assert.equal(invisible.note.state, NoteState.Wait);
    assert.equal(invisible.note.currentAfterIndex, 0);
    assert.equal(invisible.note.afterNotes[0].judged, false);
    assert.equal(reflect(invisible.oneFrame).entries[0].phase, "head");
    invisible.position.value = previousPositiveFloat32(invisibleChildPosition);
    ok(invisible.note.executeUpdate(0), "invisible child before");
    assert.equal(invisible.note.currentAfterIndex, 0);
    assert.equal(invisible.note.afterNotes[0].judged, false);
    assert.equal(invisible.oneFrame.existsOneFrameData(), false);
    assert.equal(invisible.note.autoLiveTrace.filter(
      (entry) => entry.kind === "slide-invisible-support-skip").length, 0);
    invisible.position.value = invisibleChildPosition;
    ok(invisible.note.executeUpdate(0), "invisible child equal");
    assert.equal(invisible.note.currentAfterIndex, 1);
    assert.equal(invisible.note.afterNotes[0].judged, true);
    assert.equal(invisible.oneFrame.existsOneFrameData(), false);
    assert.equal(invisible.note.autoLiveTrace.filter(
      (entry) => entry.kind === "slide-invisible-support-skip").length, 1);
    const invisibleExpected = oracleCases.get(
      "slide-invisible-support-skipped-before-visible",
    ).steps[0];
    assert.equal(invisibleExpected.event, "invisible-support-no-one-frame");
    assert.equal(invisibleExpected.adjusted_position.value >= invisibleChildPosition, true);
    assert.equal(invisible.note.currentAfterIndex, invisibleExpected.current_after_after);
  });

  test("AL12", "Slide 大步同一次调用最多推进一个 selected node", () => {
    const expected = oracleCases.get("slide-one-pending-node-per-update");
    const bound = bindNote(new notes.NoteSlide("slide-large-step"), slideInfo(), {
      position: { value: 120 },
    });
    ok(bound.note.executeUpdate(0), "head");
    reflect(bound.oneFrame);
    bound.position.value = 1000;
    ok(bound.note.executeUpdate(0), "large step one");
    assert.equal(bound.note.currentAfterIndex, 1);
    assert.equal(bound.note.currentAfterIndex, expected.steps[2].current_after_after);
    assert.equal(reflect(bound.oneFrame).entryCount, 1);
    ok(bound.note.executeUpdate(0), "large step two");
    assert.equal(bound.note.currentAfterIndex, 2);
  });

  test("AL17", "空帧不产生 projection 且不消耗 batch index", () => {
    const oneFrame = controller();
    assert.equal(ok(oneFrame.reflectOneFrameData(), "empty reflect"), null);
    assert.equal(events(oneFrame, "one-frame.reflect").length, 0);
    ok(oneFrame.setupAutoLiveJudgement(request(normalInfo(170), "head")), "post-empty setup");
    assert.equal(reflect(oneFrame).batchIndex, 0);
  });

  test("AL11", "Slide terminal 类型映射、回池 Reset 与 Stop selected 路由分离", () => {
    const bound = bindNote(new notes.NoteSlide("slide-terminal"), slideInfo(), {
      position: { value: 120 },
    });
    ok(bound.note.executeUpdate(0), "head");
    reflect(bound.oneFrame);
    bound.position.value = 1000;
    for (let index = 0; index < 2; index += 1) {
      ok(bound.note.executeUpdate(0), `intermediate ${index}`);
      reflect(bound.oneFrame);
    }
    ok(bound.note.executeUpdate(0), "terminal");
    const terminal = reflect(bound.oneFrame);
    assert.equal(terminal.entries[0].phase, "tail");
    assert.equal(terminal.entries[0].noteType, 8);
    assert.equal(bound.note.state, NoteState.Deactive);
    assert.equal(bound.note.currentAfterIndex, 0);
    assert.equal(bound.note.afterNotes.length, 0);
    const reusedInformation = slideInfo(109);
    ok(bound.note.activate(reusedInformation), "reuse Slide pool object");
    assert.equal(bound.note.currentAfterIndex, 0);
    assert.equal(bound.note.afterNotes.length, reusedInformation.slideNoteList.length);
    assert.equal(bound.note.afterNotes.every((after, index) =>
      after.source === reusedInformation.slideNoteList[index] && !after.judged), true);
    const stopExpected = supplementCases.get("slide-stop-selected-visible-intermediate");
    const stopped = bindNote(new notes.NoteSlide("slide-stop"), slideInfo(), {
      position: { value: stopExpected.steps[0].adjusted_position.value },
    });
    ok(stopped.note.changeState(NoteState.Stop), "enter Stop");
    ok(stopped.note.executeUpdate(0), "Stop before crossing");
    assert.equal(stopped.note.currentAfterIndex,
      stopExpected.steps[0].current_after_index);
    assert.equal(stopped.oneFrame.existsOneFrameData(), false);
    stopped.position.value = stopExpected.steps[1].adjusted_position.value;
    ok(stopped.note.executeUpdate(0), "Stop force perfect");
    assert.equal(stopped.note.currentAfterIndex,
      stopExpected.steps[2].current_after_after);
    const stopBatch = reflect(stopped.oneFrame);
    assert.equal(stopBatch.entries[0].phase, stopExpected.steps[1].phase);
    assert.equal(stopBatch.entries[0].noteType, stopExpected.steps[1].note_type);
    assert.equal(stopped.note.autoLiveTrace.some(
      (entry) => entry.kind === "slide-stop-perfect"), true);

    for (const [caseId, afterNoteType, terminalGameNoteType, expectedNoteType] of [
      [110, types.AfterNoteType.SlideFlickEnd, types.GameNoteType.SlideEndFlickA, 5],
      [111, types.AfterNoteType.SlideDirectionalFlickEndLeft,
        types.GameNoteType.SlideADirectionalFlickLeft, 6],
      [112, types.AfterNoteType.SlideMultipleDirectionalFlickLeft,
        types.GameNoteType.SlideADirectionalFlickLeftAdd, 7],
    ]) {
      const information = slideInfo(caseId, [
        { absolutePos: 180 },
        { absolutePos: 240, gameNoteType: terminalGameNoteType },
      ], { afterNoteType });
      const terminalBound = bindNote(
        new notes.NoteSlide(`slide-terminal-type-${caseId}`),
        information,
        { position: { value: 120 } },
      );
      ok(terminalBound.note.executeUpdate(0), `terminal type ${caseId} head`);
      reflect(terminalBound.oneFrame);
      terminalBound.position.value = 1000;
      ok(terminalBound.note.executeUpdate(0), `terminal type ${caseId} intermediate`);
      reflect(terminalBound.oneFrame);
      ok(terminalBound.note.executeUpdate(0), `terminal type ${caseId} tail`);
      const typedTerminal = reflect(terminalBound.oneFrame);
      assert.equal(typedTerminal.entries[0].noteType, expectedNoteType);
      assert.equal(terminalBound.note.state, NoteState.Deactive);
    }
  });

  test("AL15", "OneFrame 固定五槽、first-unused、耗尽、池序清除复用", () => {
    const oneFrame = controller();
    for (let index = 0; index < 5; index += 1) {
      ok(oneFrame.setupAutoLiveJudgement(request(normalInfo(200 + index), "head")), `setup ${index}`);
    }
    const batch = reflect(oneFrame);
    assert.deepEqual(batch.entries.map((entry) => entry.slot), [0, 1, 2, 3, 4]);
    assert.equal(batch.addCombo, 5);
    assert.equal(oneFrame.snapshot().slots.every((slot) => !slot.isUse), true);
    ok(oneFrame.setupAutoLiveJudgement(request(normalInfo(206), "head")), "reuse");
    assert.equal(reflect(oneFrame).entries[0].slot, 0);
  });

  test("AL04", "同批五 root 按 active list 反序占用 0→4", () => {
    const expected = oracleCases.get("simultaneous-reverse-update-five-slot-pool");
    const integration = schedulerIntegration({
      batches: [batch(1, [200, 201, 202, 203, 204].map((index) => normalInfo(index, 1)))],
      bpmChangeCount: 0,
      positions: [0, 2],
    });
    ok(integration.manager.initialize(), "integration initialize");
    ok(integration.manager.execUpdate(0.001), "activation outer frame");
    ok(integration.manager.execUpdate(0.001), "judgement outer frame");
    const result = integration.oneFrame.getReflectOneFrameData();
    assert.deepEqual(result.entries.map((entry) => entry.noteIndex),
      expected.steps.filter((step) => step.event === "head-perfect")
        .map((step) => step.note_index));
    assert.deepEqual(result.entries.map((entry) => entry.slot),
      expected.steps.filter((step) => step.event === "head-perfect")
        .map((step) => step.one_frame_slot));
  });

  test("AL14", "三个 adaptive 子步共享一次外层 Reflect", () => {
    const expected = oracleCases.get("adaptive-substeps-one-outer-reflect");
    const integration = schedulerIntegration({
      batches: [
        batch(1, [normalInfo(300, 1)]),
        batch(2, [normalInfo(301, 2)]),
        batch(3, [normalInfo(302, 3)]),
      ],
      bpmChangeCount: 1,
      positions: [0, 2, 3, 4],
    });
    ok(integration.manager.initialize(), "adaptive initialize");
    ok(integration.manager.execUpdate(0.001), "pre-activate");
    ok(integration.manager.execUpdate(0.04), "three-substep outer frame");
    const reflected = integration.oneFrame.getReflectOneFrameData();
    assert.deepEqual(reflected.entries.map((entry) => entry.noteIndex),
      expected.steps.filter((step) => step.event === "head-perfect")
        .map((step) => step.note_index));
    assert.equal(events(integration.oneFrame, "one-frame.reflect").length, 1);
    assert.equal(expected.steps.filter((step) => step.event === "reflect").length, 1);
  });

  test("AL16", "第六条判定失败关闭且保留前五条提交", () => {
    const oneFrame = controller();
    for (let index = 0; index < 5; index += 1) {
      ok(oneFrame.setupAutoLiveJudgement(request(normalInfo(160 + index), "head")),
        `fill ${index}`);
    }
    const before = JSON.stringify(oneFrame.snapshot().slots);
    evidence(oneFrame.setupAutoLiveJudgement(request(normalInfo(166), "head")),
      "one-frame.pool-exhausted");
    assert.equal(JSON.stringify(oneFrame.snapshot().slots), before);
    assert.equal(reflect(oneFrame).entryCount, 5);

    for (const [caseId, note] of [
      ["one-frame-exhaustion-long-head-terminal-fault", new notes.NoteLong("exhaust-long")],
      ["one-frame-exhaustion-slide-head-terminal-fault", new notes.NoteSlide("exhaust-slide")],
    ]) {
      const full = controller();
      for (let index = 0; index < 5; index += 1) {
        ok(full.setupAutoLiveJudgement(request(normalInfo(170 + index), "head")),
          `fill ${caseId}:${index}`);
      }
      const source = note instanceof notes.NoteLong ? longInfo(176) : slideInfo(177);
      const bound = bindNote(note, source, {
        oneFrame: full,
        position: { value: source.absolutePos },
      });
      evidence(bound.note.executeUpdate(0), "one-frame.pool-exhausted");
      assert.equal(NoteState[bound.note.state],
        supplementCases.get(caseId).state_at_native_failure);
      assert.equal(full.snapshot().inUseContainerIds.length, 5);
    }

    const tailFull = controller();
    const tail = bindNote(new notes.NoteLong("exhaust-long-tail"), longInfo(178), {
      oneFrame: tailFull,
      position: { value: 120 },
    });
    ok(tail.note.executeUpdate(0), "Long exhaustion head setup");
    reflect(tailFull);
    for (let index = 0; index < 5; index += 1) {
      ok(tailFull.setupAutoLiveJudgement(request(normalInfo(180 + index), "head")),
        `fill Long tail ${index}`);
    }
    tail.position.value = 241;
    evidence(tail.note.executeUpdate(0), "one-frame.pool-exhausted");
    assert.equal(NoteState[tail.note.state], supplementCases.get(
      "one-frame-exhaustion-long-tail-terminal-fault").state_at_native_failure);
    assert.equal(tail.note.afterNote.judged, false);
    assert.equal(tail.note.autoLiveTrace.at(-1).kind, "long-linked-after-finish");

    const managerLong = normalInfo(190, 1, {
      gameNoteType: types.GameNoteType.Long,
      fireNoteType: types.FrontNoteType.Long,
      afterNoteType: types.AfterNoteType.Normal,
      afterNoteAbsolutePos: 3,
    });
    const faultIntegration = schedulerIntegration({
      batches: [batch(1, [managerLong, ...Array.from({ length: 5 }, (_, index) =>
        normalInfo(191 + index, 1))])],
      bpmChangeCount: 0,
      positions: [1, 1],
    });
    ok(faultIntegration.manager.initialize(), "fault latch initialize");
    ok(faultIntegration.manager.execUpdate(0.001), "fault latch activate six roots");
    const firstFault = evidence(faultIntegration.manager.execUpdate(0.001),
      "one-frame.pool-exhausted");
    const faultSnapshot = faultIntegration.manager.snapshot();
    assert.equal(faultSnapshot.state, "faulted");
    assert.deepEqual(faultSnapshot.fault, firstFault);
    assert.equal(faultSnapshot.oneFrame.inUseContainerIds.length, 5);
    const faultedLong = faultSnapshot.noteManager.pools.find(
      (pool) => pool.family === "long",
    ).objects[0];
    assert.equal(faultedLong.state, NoteState.Wait);
    assert.equal(faultedLong.linkedAfter.judged, false);
    assert.deepEqual(faultIntegration.manager.execUpdate(0.001), firstFault);
    assert.deepEqual(faultIntegration.manager.pause(), firstFault);
    assert.deepEqual(faultIntegration.manager.resume(), firstFault);
    ok(faultIntegration.manager.dispose(), "fault latch dispose");
    assert.equal(faultIntegration.manager.snapshot().state, "disposed");

    const hostResult = createSimulatorEngine({
      chart: fixture.chart([batch(2, [
        normalInfo(210, 2, {
          gameNoteType: types.GameNoteType.Long,
          fireNoteType: types.FrontNoteType.Long,
          afterNoteType: types.AfterNoteType.Normal,
          afterNoteAbsolutePos: 4,
        }),
        ...Array.from({ length: 5 }, (_, index) => normalInfo(211 + index, 2)),
      ])], 120),
      runtime: {
        highFrequencyMode: false,
        judgeOffsetFrames: 0,
        playMode: {
          kind: "auto-live",
          resultTransform: "identity-no-active-situation-skill",
        },
      },
    }, createRecordingSimulatorBackends());
    const host = ok(hostResult, "fault host create");
    ok(host.initialize(), "fault host initialize");
    ok(host.step(1 / 60), "fault host activation frame");
    const hostFault = evidence(host.step(1 / 60), "one-frame.pool-exhausted");
    const hostSnapshot = ok(host.snapshot(), "snapshot remains allowed after fault");
    assert.equal(hostSnapshot.managers.state, "faulted");
    assert.deepEqual(hostSnapshot.managers.fault, hostFault);
    assert.equal(hostSnapshot.managers.oneFrame.inUseContainerIds.length, 5);
    const hostLong = hostSnapshot.managers.noteManager.pools.find(
      (pool) => pool.family === "long",
    ).objects[0];
    assert.equal(hostLong.state, NoteState.Wait);
    assert.equal(hostLong.linkedAfter.judged, false);
    assert.deepEqual(host.initialize(), hostFault);
    assert.deepEqual(host.step(1 / 60), hostFault);
    for (const [label, invalidDelta] of [
      ["NaN", Number.NaN],
      ["positive Infinity", Number.POSITIVE_INFINITY],
      ["negative Infinity", Number.NEGATIVE_INFINITY],
      ["negative finite", -1],
    ]) {
      assert.deepEqual(host.step(invalidDelta), hostFault,
        `terminal fault must precede ${label} delta validation`);
    }
    assert.deepEqual(host.pause(), hostFault);
    assert.deepEqual(host.resume(), hostFault);
    assert.deepEqual(host.getAdjustedMusicPosition(), hostFault);
    const repeatedFaultSnapshot = ok(host.snapshot(), "fault snapshot remains read-only");
    assert.deepEqual(repeatedFaultSnapshot, hostSnapshot);
    ok(host.dispose(), "fault host dispose");
  });

  test("AL18", "暂停冻结 Long/Slide/Multiple graph/slot/trace 并确定 dispose", () => {
    const slidePauseExpected = supplementCases.get(
      "pause-active-slide-pending-slot-freeze",
    );
    const pausedSlide = slideInfo(400, [
      { absolutePos: 2 },
      { absolutePos: 3, gameNoteType: types.GameNoteType.SlideEndA },
    ], { absolutePos: 1, storedAbsolutePos: 1, afterNoteAbsolutePos: 3 });
    const integration = schedulerIntegration({
      batches: [batch(1, [pausedSlide])],
      bpmChangeCount: 0,
      positions: [0, 1, 2],
    });
    ok(integration.manager.initialize(), "pause initialize");
    ok(integration.manager.execUpdate(0.001), "activate");
    ok(integration.manager.execUpdate(0.001), "Slide head before pause");
    const frozenNoteManager = JSON.stringify(integration.manager.snapshot().noteManager);
    ok(integration.manager.pause(), "pause");
    ok(integration.oneFrame.setupAutoLiveJudgement(
      request(normalInfo(401, 2), "head")), "stage slot before paused frame");
    const frozenOneFrame = JSON.stringify(integration.oneFrame.snapshot());
    ok(integration.manager.execUpdate(1), "paused frame");
    const paused = integration.manager.snapshot();
    assert.equal(JSON.stringify(paused.noteManager), frozenNoteManager);
    assert.equal(JSON.stringify(paused.oneFrame), frozenOneFrame);
    assert.equal(paused.noteManager.pools.find((pool) => pool.family === "slide")
      .objects[0].currentAfterIndex,
    slidePauseExpected.steps[1].current_after_after);
    assert.equal(integration.music.advanceCount, 2);
    ok(integration.manager.resume(), "resume");
    ok(integration.manager.execUpdate(0.001), "resume crossing");
    assert.deepEqual(integration.oneFrame.getReflectOneFrameData().entries.map(
      (entry) => entry.noteIndex), [401, pausedSlide.slideNoteList[0].index]);
    const traceBeforeDispose = integration.oneFrame.snapshot().trace.length;
    ok(integration.manager.dispose(), "dispose active Slide");
    const disposed = integration.manager.snapshot();
    assert.equal(disposed.state, "disposed");
    assert.equal(disposed.oneFrame.inUseContainerIds.length, 0);
    assert.equal(disposed.oneFrame.trace.length, traceBeforeDispose);
    const slidePoolObject = disposed.noteManager.pools
      .find((pool) => pool.family === "slide").objects[0];
    assert.equal(slidePoolObject.state, NoteState.Deactive);
    assert.equal(slidePoolObject.currentAfterIndex, 0);
    assert.deepEqual(slidePoolObject.afterNodes, []);

    const longPauseExpected = supplementCases.get("pause-active-long-freeze-resume");
    const pausedLong = normalInfo(410, 1, {
      gameNoteType: types.GameNoteType.Long,
      fireNoteType: types.FrontNoteType.Long,
      afterNoteType: types.AfterNoteType.Normal,
      afterNoteAbsolutePos: 3,
    });
    const longIntegration = schedulerIntegration({
      batches: [batch(1, [pausedLong])],
      bpmChangeCount: 0,
      positions: [0, 1, 3, 4],
    });
    ok(longIntegration.manager.initialize(), "Long pause initialize");
    ok(longIntegration.manager.execUpdate(0.001), "Long activate");
    ok(longIntegration.manager.execUpdate(0.001), "Long head");
    assert.equal(longIntegration.oneFrame.getReflectOneFrameData().entries[0].phase, "head");
    const frozenLong = JSON.stringify(longIntegration.manager.snapshot().noteManager);
    ok(longIntegration.manager.pause(), "Long pause");
    ok(longIntegration.manager.execUpdate(1), "Long paused frame");
    assert.equal(JSON.stringify(longIntegration.manager.snapshot().noteManager), frozenLong);
    assert.equal(longIntegration.music.advanceCount, 2);
    ok(longIntegration.manager.resume(), "Long resume");
    ok(longIntegration.manager.execUpdate(0.001), "Long tail equal");
    assert.equal(longIntegration.oneFrame.existsOneFrameData(), false);
    assert.equal(longIntegration.manager.snapshot().noteManager.pools
      .find((pool) => pool.family === "long").objects[0].state, NoteState.Wait);
    ok(longIntegration.manager.execUpdate(0.001), "Long tail strict greater");
    assert.equal(longIntegration.oneFrame.getReflectOneFrameData().entries[0].phase, "tail");
    assert.equal(longIntegration.manager.snapshot().noteManager.pools
      .find((pool) => pool.family === "long").objects[0].state, NoteState.Deactive);
    assert.deepEqual(longPauseExpected.steps.map((step) => step.event), [
      "head-perfect", "pause-enter", "paused-frame", "resume",
      "tail-equal-no-crossing", "tail-strict-greater",
    ]);

    const pausedMultipleGroup = [0, 1].map((buttonType, index) =>
      multipleInfo(420 + index, 1, buttonType,
        types.GameNoteType.DirectionalFlickRight));
    const multipleIntegration = schedulerIntegration({
      batches: [batch(1, pausedMultipleGroup)],
      bpmChangeCount: 0,
      positions: [0, 2],
    });
    ok(multipleIntegration.manager.initialize(), "Multiple pause initialize");
    ok(multipleIntegration.manager.execUpdate(0.001), "Multiple activate");
    const frozenMultiple = JSON.stringify(
      multipleIntegration.manager.snapshot().noteManager);
    ok(multipleIntegration.manager.pause(), "Multiple pause");
    ok(multipleIntegration.manager.execUpdate(1), "Multiple paused frame");
    assert.equal(JSON.stringify(multipleIntegration.manager.snapshot().noteManager),
      frozenMultiple);
    assert.equal(multipleIntegration.music.advanceCount, 1);
    ok(multipleIntegration.manager.resume(), "Multiple resume");
    ok(multipleIntegration.manager.execUpdate(0.001), "Multiple crossing after resume");
    assert.equal(multipleIntegration.oneFrame.getReflectOneFrameData().entryCount, 1);
    assert.equal(multipleIntegration.oneFrame.snapshot().trace.findLast(
      (entry) => entry.kind === "one-frame.setup-auto-live")
      .multipleDirectionalFlickNoteCount, 2);

    const disposeMultiple = schedulerIntegration({
      batches: [batch(1, pausedMultipleGroup)],
      bpmChangeCount: 0,
      positions: [0],
    });
    ok(disposeMultiple.manager.initialize(), "Multiple dispose initialize");
    ok(disposeMultiple.manager.execUpdate(0.001), "Multiple dispose activate");
    const disposeTrace = disposeMultiple.oneFrame.snapshot().trace.length;
    ok(disposeMultiple.manager.dispose(), "Multiple active dispose");
    const disposedMultiplePool = disposeMultiple.manager.snapshot().noteManager.pools
      .find((pool) => pool.family === "multiple-directional-flick");
    assert.equal(disposedMultiplePool.objects.every(
      (object) => object.state === NoteState.Deactive), true);
    assert.equal(disposeMultiple.oneFrame.snapshot().trace.length, disposeTrace);
  });

  test("AL19", "production BMS 六类 core root 与全部 Directional group 直接消费", () => {
    const fixtureRoot = join(
      repositoryRoot,
      "tmp",
      "simulator-reverse-evidence",
      "chart-construction",
      "fixtures",
    );
    const chartFiles = [
      "poppin_shuffle_special.txt",
      "786_miracle_april_habahiro_special.txt",
    ];
    const charts = chartFiles
      .map((name) => ok(construction.createNoteBatchInformationList({
        musicScoreData: readFileSync(join(fixtureRoot, name), "utf8"),
      }), `production chart ${name}`));
    const observed = [];
    for (const [chartIndex, chart] of charts.entries()) {
      const roots = chart.noteBatches.flatMap((entry) => entry.informationList);
      const familyCandidates = [
        [types.FrontNoteType.Normal, notes.NoteNormal, (candidate) =>
          candidate.fireNoteType === types.FrontNoteType.Normal],
        [types.FrontNoteType.Flick, notes.NoteFlick, (candidate) =>
          candidate.fireNoteType === types.FrontNoteType.Flick],
        [types.FrontNoteType.Long, notes.NoteLong, (candidate) =>
          candidate.fireNoteType === types.FrontNoteType.Long],
        [types.FrontNoteType.DirectionalFlick, notes.NoteDirectionalFlick, (candidate) =>
          candidate.fireNoteType === types.FrontNoteType.DirectionalFlick],
        ["slide", notes.NoteSlide, (candidate) =>
          candidate.isSlideNoteHead && candidate.slideNoteList.length > 0],
      ];
      for (const [family, Constructor, predicate] of familyCandidates) {
        const sourceNote = roots.find(predicate);
        assert(sourceNote, `production chart ${chartIndex} missing family ${family}`);
        const bound = bindNote(new Constructor(`production-${chartIndex}-${family}`), sourceNote, {
          position: { value: sourceNote.absolutePos },
        });
        if (family === "slide") {
          assert.equal(bound.note.afterNotes.every((after, index) =>
            after.source === sourceNote.slideNoteList[index]), true);
        }
        ok(bound.note.executeUpdate(0), `production chart ${chartIndex} family ${family} head`);
        const head = reflect(bound.oneFrame).entries[0];
        assert.equal(head.noteIndex, sourceNote.index);
        assert.deepEqual(head.buttonTypes, sourceNote.buttonTypesArray);
        observed.push([chartIndex, sourceNote.fireNoteType, head.noteIndex]);
      }
      const directionalRoots = roots.filter((candidate) =>
        candidate.fireNoteType === types.FrontNoteType.DirectionalFlick);
      assert.equal(directionalRoots.length, chartIndex === 0 ? 38 : 12);
      for (const [rootIndex, sourceNote] of directionalRoots.entries()) {
        const bound = bindNote(
          new notes.NoteDirectionalFlick(
            `production-directional-${chartIndex}-${rootIndex}`,
          ),
          sourceNote,
          { position: { value: sourceNote.absolutePos } },
        );
        ok(bound.note.executeUpdate(0),
          `production Directional ${chartIndex}:${rootIndex}`);
        const directionalBatch = reflect(bound.oneFrame);
        assert.equal(directionalBatch.entryCount, 1);
        assert.equal(directionalBatch.entries[0].noteIndex, sourceNote.index);
        assert.equal(directionalBatch.entries[0].noteType, 9);
        assert.equal(bound.note.state, NoteState.Deactive);
      }
      const longRoots = roots.filter((candidate) =>
        candidate.fireNoteType === types.FrontNoteType.Long);
      let flickTerminalLongCount = 0;
      for (const [rootIndex, sourceNote] of longRoots.entries()) {
        const bound = bindNote(
          new notes.NoteLong(`production-long-${chartIndex}-${rootIndex}`),
          sourceNote,
          { position: { value: sourceNote.absolutePos } },
        );
        ok(bound.note.executeUpdate(0), `production Long head ${chartIndex}:${rootIndex}`);
        assert.equal(reflect(bound.oneFrame).entries[0].phase, "head");
        bound.position.value = Number.MAX_SAFE_INTEGER;
        ok(bound.note.executeUpdate(0), `production Long tail ${chartIndex}:${rootIndex}`);
        const tail = reflect(bound.oneFrame).entries[0];
        assert.equal(tail.phase, "tail");
        assert.equal(tail.noteIndex, sourceNote.index);
        assert.equal(bound.note.state, NoteState.Deactive);
        if (tail.noteType === 3) flickTerminalLongCount += 1;
      }
      if (chartIndex === 1) {
        assert.equal(flickTerminalLongCount, 5,
          "HABAHIRO must cover all five Flick-terminal Long roots");
      }
      const slideRoots = roots.filter((candidate) =>
        candidate.isSlideNoteHead && candidate.slideNoteList.length > 0);
      for (const [rootIndex, sourceNote] of slideRoots.entries()) {
        const slide = new notes.NoteSlide(`production-graph-${chartIndex}-${rootIndex}`);
        slide.registerAutoLiveRuntime({
          isAutoPlay: () => true,
          getAdjustedMusicPosition: () => sourceNote.absolutePos,
          submitJudgement: () => ({ status: "ok", value: undefined }),
        });
        ok(slide.activate(sourceNote), `production Slide graph ${chartIndex}:${rootIndex}`);
        assert.equal(slide.afterNotes.length, sourceNote.slideNoteList.length);
      }
      const firstInvisibleSlideRoots = slideRoots.filter((candidate) =>
        candidate.slideNoteList[0].isInvisible);
      assert.equal(firstInvisibleSlideRoots.length, chartIndex === 0 ? 89 : 27,
        `production first-invisible Slide count ${chartIndex}`);
      for (const [rootIndex, sourceNote] of firstInvisibleSlideRoots.entries()) {
        const child = sourceNote.slideNoteList[0];
        const bound = bindNote(
          new notes.NoteSlide(
            `production-first-invisible-${chartIndex}-${rootIndex}`,
          ),
          sourceNote,
          { position: { value: sourceNote.absolutePos } },
        );
        ok(bound.note.executeUpdate(0),
          `production first-invisible root equal ${chartIndex}:${rootIndex}`);
        assert.equal(reflect(bound.oneFrame).entries[0].phase, "head");
        assert.equal(bound.note.currentAfterIndex, 0);
        assert.equal(bound.note.afterNotes[0].judged, false);
        bound.position.value = previousPositiveFloat32(child.absolutePos);
        ok(bound.note.executeUpdate(0),
          `production first-invisible child before ${chartIndex}:${rootIndex}`);
        assert.equal(bound.note.currentAfterIndex, 0);
        assert.equal(bound.note.afterNotes[0].judged, false);
        assert.equal(bound.oneFrame.existsOneFrameData(), false);
        bound.position.value = child.absolutePos;
        ok(bound.note.executeUpdate(0),
          `production first-invisible child equal ${chartIndex}:${rootIndex}`);
        assert.equal(bound.note.currentAfterIndex, 1);
        assert.equal(bound.note.afterNotes[0].judged, true);
        assert.equal(bound.oneFrame.existsOneFrameData(), false);
        assert.equal(bound.note.autoLiveTrace.filter(
          (entry) => entry.kind === "slide-invisible-support-skip").length, 1);
      }
      const fullSlide = roots.find((candidate) =>
        candidate.isSlideNoteHead &&
        candidate.afterNoteType === types.AfterNoteType.None &&
        candidate.slideNoteList.length > 0);
      assert(fullSlide, `production chart ${chartIndex} missing ordinary Slide`);
      const fullBound = bindNote(
        new notes.NoteSlide(`production-full-slide-${chartIndex}`),
        fullSlide,
        { position: { value: fullSlide.absolutePos } },
      );
      ok(fullBound.note.executeUpdate(0), `production Slide ${chartIndex} head`);
      reflect(fullBound.oneFrame);
      fullBound.position.value = Number.MAX_SAFE_INTEGER;
      let childCallCount = 0;
      while (fullBound.note.state !== NoteState.Deactive) {
        const current = fullBound.note.afterNotes[fullBound.note.currentAfterIndex];
        assert(current, `production Slide ${chartIndex} lost current child`);
        const sourceNode = current.source;
        ok(fullBound.note.executeUpdate(0),
          `production Slide ${chartIndex} child call ${childCallCount}`);
        if (sourceNode.isInvisible) {
          assert.equal(fullBound.oneFrame.existsOneFrameData(), false);
        } else {
          reflect(fullBound.oneFrame);
        }
        childCallCount += 1;
        assert(childCallCount <= fullSlide.slideNoteList.length,
          `production Slide ${chartIndex} exceeded one transition per child`);
      }
      assert.equal(fullBound.note.state, NoteState.Deactive);
      assert.equal(fullBound.note.afterNotes.length, 0);

      const multipleGroups = chart.noteBatches.flatMap((entry) =>
        groupMultipleDirectionalInformationList(entry.informationList));
      const expectedTopology = productionMultipleOracle.charts[chartIndex];
      assert.equal(expectedTopology.file, chartFiles[chartIndex]);
      assert.equal(
        createHash("sha256").update(readFileSync(
          join(fixtureRoot, chartFiles[chartIndex]),
        )).digest("hex").toUpperCase(),
        expectedTopology.source_sha256,
      );
      const actualTopology = chart.noteBatches.flatMap((entry, batchIndex) => {
        const groups = groupMultipleDirectionalInformationList(entry.informationList);
        if (groups.length === 0) return [];
        return [{
          batch_index: batchIndex,
          absolute_position: entry.absolutePos,
          groups: groups.map((group) => group.map((information) => ({
            source_slot: entry.informationList.indexOf(information),
            note_index: information.index,
            button_type: information.buttonType,
            game_note_type: information.gameNoteType,
          }))),
        }];
      });
      assert.deepEqual(actualTopology, expectedTopology.batches,
        `production fixed Multiple topology ${chartIndex}`);
      const expectedMultipleRootCount = chartIndex === 0 ? 195 : 220;
      assert.equal(multipleGroups.reduce((sum, group) => sum + group.length, 0),
        expectedMultipleRootCount);
      assert.equal(multipleGroups.length, expectedTopology.group_count,
        `production source-order Multiple run count ${chartIndex}`);
      for (const [groupIndex, group] of multipleGroups.entries()) {
        const oneFrame = controller();
        const runtimeGroup = {
          count: group.length,
          isUsed: false,
          markUsed() {
            if (this.isUsed) return { status: "evidence-required" };
            this.isUsed = true;
            return { status: "ok", value: undefined };
          },
        };
        const groupNotes = group.map((information, memberIndex) => {
          const note = new notes.NoteMultipleDirectionalFlick(
            `production-multiple-${chartIndex}-${groupIndex}-${memberIndex}`,
          );
          note.registerMultipleDirectionalGroupResolver(() =>
            ({ status: "ok", value: runtimeGroup }));
          note.registerAutoLiveRuntime({
            isAutoPlay: () => true,
            getAdjustedMusicPosition: () => information.absolutePos,
            submitJudgement: (judgement) => oneFrame.setupAutoLiveJudgement(judgement),
          });
          ok(note.activate(information),
            `production Multiple group ${chartIndex}:${groupIndex}:${memberIndex}`);
          return note;
        });
        for (let index = groupNotes.length - 1; index >= 0; index -= 1) {
          ok(groupNotes[index].executeUpdate(0),
            `production Multiple update ${chartIndex}:${groupIndex}:${index}`);
        }
        const groupBatch = reflect(oneFrame);
        assert.equal(groupBatch.entryCount, 1);
        assert.equal(groupBatch.entries[0].noteType, 10);
        const setup = oneFrame.snapshot().trace.findLast(
          (entry) => entry.kind === "one-frame.setup-auto-live");
        assert.equal(setup.multipleDirectionalFlickNoteCount, group.length);
        assert.equal(groupNotes.every((note) => note.state === NoteState.Deactive), true);
      }
    }
    assert.equal(observed.length, 10);
    for (const [chartIndex, chart] of charts.entries()) {
      const engineResult = createSimulatorEngine({
        chart,
        runtime: {
          highFrequencyMode: false,
          judgeOffsetFrames: 0,
          playMode: {
            kind: "auto-live",
            resultTransform: "identity-no-active-situation-skill",
          },
        },
      }, createRecordingSimulatorBackends());
      assert.equal(engineResult.status, "ok");
      if (chartIndex === 0) {
        const engine = engineResult.value;
        ok(engine.initialize(), "production ordinary engine initialize");
        for (let frame = 0; frame < 8000; frame += 1) {
          ok(engine.step(1 / 60), `production ordinary full frame ${frame}`);
        }
        const snapshot = ok(engine.snapshot(), "production ordinary final snapshot");
        assert.equal(snapshot.managers.noteManager.nextBatchIndex,
          snapshot.managers.noteManager.batchCount);
        assert.equal(snapshot.managers.noteManager.activeNotePoolObjectIds.length, 0);
      }
    }
  });

  test("AL22", "冻结 failure matrix 全部非法数据失败关闭且关键状态原子", () => {
    const knownFailureIds = new Set(failureOracle.cases.map((entry) => entry.id));
    for (const expected of [
      "invalid-play-mode", "mode14-or-debug-force-perfect", "unknown-result-transform",
      "directional-source-type-not-10-or-11", "missing-long-after",
      "missing-slide-terminal", "duplicate-slide-node-identity", "foreign-one-frame-handle",
      "one-frame-duplicate-setup", "one-frame-sixth-entry", "non-finite-position",
      "manual-touch", "score-life-skill-audio-particle-consumer",
    ]) assert(knownFailureIds.has(expected), `missing frozen failure ${expected}`);

    const chart = fixture.chart();
    const backends = createRecordingSimulatorBackends();
    const input = (playMode) => ({
      chart,
      runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, playMode },
    });
    evidence(createSimulatorEngine(input(undefined), backends), "runtime.invalid-play-mode");
    evidence(createSimulatorEngine(input({ kind: "mode14" }), backends),
      "runtime.unsupported-play-mode-or-result-transform");
    evidence(createSimulatorEngine(input({ kind: "auto-live", resultTransform: "skill" }), backends),
      "runtime.unsupported-play-mode-or-result-transform");

    const invalidDirectional = bindNote(
      new notes.NoteDirectionalFlick("bad-direction"),
      normalInfo(500, 120, {
        gameNoteType: 12,
        fireNoteType: types.FrontNoteType.DirectionalFlick,
      }),
      { position: { value: 120 } },
    );
    evidence(invalidDirectional.note.executeUpdate(0), "auto-live.directional-flick-source-type");
    assert.equal(invalidDirectional.oneFrame.existsOneFrameData(), false);

    const invalidLong = new notes.NoteLong("missing-long");
    evidence(invalidLong.activate(normalInfo(501, 120, {
      gameNoteType: types.GameNoteType.Long,
      fireNoteType: types.FrontNoteType.Long,
    })), "auto-live.invalid-long-after-graph");
    assert.equal(invalidLong.state, NoteState.Deactive);

    const missingMultipleGroup = new notes.NoteMultipleDirectionalFlick(
      "missing-multiple-group",
    );
    missingMultipleGroup.registerAutoLiveRuntime({
      isAutoPlay: () => true,
      getAdjustedMusicPosition: () => 120,
      submitJudgement: () => ({ status: "ok", value: undefined }),
    });
    evidence(missingMultipleGroup.activate(multipleInfo(
      5011, 120, 0, types.GameNoteType.DirectionalFlickLeft,
    )), "auto-live.multiple-directional-group-unregistered");
    assert.equal(missingMultipleGroup.state, NoteState.Deactive);

    const missingSlide = new notes.NoteSlide("missing-slide");
    evidence(missingSlide.activate(normalInfo(502, 120, {
      gameNoteType: types.GameNoteType.SlideA,
      fireNoteType: types.FrontNoteType.SlideA,
      isSlideNoteHead: true,
      afterNoteType: types.AfterNoteType.None,
    })), "auto-live.invalid-slide-after-graph");
    const duplicate = normalInfo(5031, 180, {
      gameNoteType: types.GameNoteType.SlideEndA,
      fireNoteType: types.FrontNoteType.SlideA,
    });
    const duplicateSlide = new notes.NoteSlide("duplicate-slide");
    evidence(duplicateSlide.activate(normalInfo(503, 120, {
      gameNoteType: types.GameNoteType.SlideA,
      fireNoteType: types.FrontNoteType.SlideA,
      isSlideNoteHead: true,
      afterNoteType: types.AfterNoteType.None,
      slideNoteList: [duplicate, duplicate],
    })), "auto-live.duplicate-or-missing-slide-node");

    const oneFrame = controller();
    evidence(oneFrame.setupAutoLiveJudgementData(
      { containerId: "foreign" }, request(normalInfo(504), "head")),
    "one-frame.foreign-container");
    const handle = ok(oneFrame.getUsableOneFrameData(), "owned handle");
    const payload = request(normalInfo(505), "head");
    ok(oneFrame.setupAutoLiveJudgementData(handle, payload), "first setup");
    const before = JSON.stringify(oneFrame.snapshot().slots);
    evidence(oneFrame.setupAutoLiveJudgementData(handle, request(normalInfo(506), "head")),
      "one-frame.container-already-staged");
    assert.equal(JSON.stringify(oneFrame.snapshot().slots), before);
    for (let index = 1; index < 5; index += 1) {
      ok(oneFrame.setupAutoLiveJudgement(request(normalInfo(506 + index), "head")), "fill pool");
    }
    evidence(oneFrame.setupAutoLiveJudgement(request(normalInfo(512), "head")),
      "one-frame.pool-exhausted");
    assert.equal(oneFrame.snapshot().inUseContainerIds.length, 5);

    const finite = bindNote(new notes.NoteNormal("nonfinite"), normalInfo(513), {
      position: { value: Number.NaN },
    });
    evidence(finite.note.executeUpdate(0), "auto-live.non-finite-adjusted-position");
    assert.equal(finite.note.state, NoteState.Move);
    const nonFiniteInvisible = bindNote(
      new notes.NoteSlide("nonfinite-invisible"),
      slideInfo(5131, [
        { absolutePos: 170, isInvisible: true },
        { absolutePos: 240, gameNoteType: types.GameNoteType.SlideEndA },
      ]),
      { position: { value: Number.NaN } },
    );
    ok(nonFiniteInvisible.note.changeState(NoteState.Wait),
      "enter non-finite invisible Wait");
    evidence(nonFiniteInvisible.note.executeUpdate(0),
      "auto-live.non-finite-adjusted-position");
    assert.equal(nonFiniteInvisible.note.currentAfterIndex, 0);
    assert.equal(nonFiniteInvisible.note.afterNotes[0].judged, false);
    assert.equal(nonFiniteInvisible.oneFrame.existsOneFrameData(), false);
    assert.equal(nonFiniteInvisible.note.autoLiveTrace.some(
      (entry) => entry.kind === "slide-invisible-support-skip"), false);
    evidence(new GamePlayButton().execTouchBegan(), "input.game-play-button.touch-began");
    evidence(oneFrame.setupBusinessData(), "one-frame.setup-business-data");
    evidence(noteFamily(normalInfo(514, 120, { fireNoteType: 99 })),
      "note-manager.unrepresented-note-family");
  });

  test("AL21", "阶段外业务字段保持 absent，消费者明确 evidence-required", () => {
    const oneFrame = controller();
    ok(oneFrame.setupAutoLiveJudgement(request(normalInfo(600), "head")), "setup projection");
    const entry = reflect(oneFrame).entries[0];
    for (const key of [
      "addScore", "addPower", "life", "skill", "fever", "crescendo",
      "audio", "particle", "rendering", "hud",
      "multipleDirectionalFlickNoteCount",
    ]) assert.equal(Object.hasOwn(entry, key), false, `${key} must remain absent`);
    evidence(oneFrame.setupBusinessData(), "one-frame.setup-business-data");
    const deterministicProjection = () => {
      const repeated = controller();
      ok(repeated.setupAutoLiveJudgement(request(normalInfo(601), "head")),
        "deterministic setup");
      return JSON.stringify({
        batch: reflect(repeated),
        snapshot: repeated.snapshot(),
      });
    };
    assert.equal(deterministicProjection(), deterministicProjection());
  });

  test("AL20", "production HABAHIRO 只消费静态构造图并保留运行边界", () => {
    const source = readFileSync(join(
      repositoryRoot,
      "tmp",
      "simulator-reverse-evidence",
      "chart-construction",
      "fixtures",
      "786_miracle_april_habahiro_special.txt",
    ), "utf8");
    const chart = ok(construction.createNoteBatchInformationList({ musicScoreData: source }),
      "HABAHIRO production construction");
    assert.equal(chart.habahiroChangeAbsolutePos >= 0, true);
    const playable = chart.noteBatches.flatMap((entry) => entry.informationList)
      .find((entry) => entry.isSlideNoteHead &&
        entry.afterNoteType === types.AfterNoteType.None &&
        entry.slideNoteList.length > 0);
    assert(playable, "HABAHIRO fixture must retain a production ordinary Slide graph");
    const bound = bindNote(new notes.NoteSlide("habahiro-static-slide"), playable, {
      position: { value: playable.absolutePos },
    });
    assert.equal(bound.note.afterNotes.every((after, index) =>
      after.source === playable.slideNoteList[index]), true);
    ok(bound.note.executeUpdate(0), "consume HABAHIRO static Slide graph identity");
    assert.equal(reflect(bound.oneFrame).entries[0].noteIndex, playable.index);
    const visual = chart.noteBatches.flatMap((entry) => entry.informationList)
      .find((entry) =>
        entry.fireNoteType === types.FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
        entry.fireNoteType === types.FrontNoteType.SlideBMultipleDirectionalFlickAdd);
    assert(visual, "HABAHIRO fixture must retain its Multiple Directional visual helper");
    assert.equal(ok(noteFamily(visual), "visual family"), "multiple-directional-visual");
    const visualNote = new notes.NoteMultipleDirectionalVisual("habahiro-visual-helper");
    ok(visualNote.activate(visual), "visual helper activate");
    evidence(visualNote.executeUpdate(0),
      "auto-live.multiple-directional-visual-presentation");
    const openGaps = readFileSync(join(
      repositoryRoot,
      "tmp",
      "simulator-reverse-evidence",
      "auto-live",
      "OPEN_GAPS.md",
    ), "utf8");
    assert.match(openGaps, /HABAHIRO.*runtime|HABAHIRO.*运行/i);
  });

  tests.sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(tests.map((entry) => entry.id), Array.from(
    { length: 22 }, (_, index) => `AL${String(index + 1).padStart(2, "0")}`,
  ));
  let passed = 0;
  for (const testCase of tests) {
    try {
      testCase.execute();
      passed += 1;
      console.log(`ok ${passed} - ${testCase.id} ${testCase.name}`);
    } catch (error) {
      console.error(`not ok ${passed + 1} - ${testCase.id} ${testCase.name}`);
      throw error;
    }
  }
  assertCanonicalFixedTraces();
  console.log("ok - fixed oracle canonical traces deep-equal actual runtime projections");
  assert.equal(passed, 22);
  console.log(`auto-live simulator tests passed: ${passed}`);

  function request(noteInformation, phase, noteType = 0) {
    return {
      noteInformation,
      phase,
      noteType,
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    };
  }

  function batch(absolutePos, informationList) {
    return {
      barIndex: Math.trunc(absolutePos / 192),
      numerator: absolutePos % 192,
      denominator: 192,
      absolutePos,
      informationList,
    };
  }

  function schedulerIntegration({ batches, bpmChangeCount, positions }) {
    const oneFrame = controller();
    const music = new FakeIntegrationMusic(positions);
    const noteManager = new NoteManager(
      batches,
      new SlideNoteManager(),
      music,
      music,
      bpmChangeCount,
      0,
      new InGameCalculatedData({
        kind: "auto-live",
        resultTransform: "identity-no-active-situation-skill",
      }),
      () => oneFrame.getUsableOneFrameData(),
      (judgement) => oneFrame.setupAutoLiveJudgement(judgement),
    );
    return {
      oneFrame,
      music,
      noteManager,
      manager: new InGameManager(
        music,
        noteManager,
        oneFrame,
        new InputManager(),
      ),
    };
  }

  function assertCanonicalFixedTraces() {
    const stateName = (state) => NoteState[state];
    const adjustedPosition = (value) => ({
      value: Math.fround(value),
      bits: float32Bits(value),
    });
    const commonStep = (
      outerFrame,
      substep,
      position,
      event,
      stateBefore,
      stateAfter,
      oneFrameSlot,
      extra = {},
    ) => ({
      outer_frame: outerFrame,
      substep,
      adjusted_position: adjustedPosition(position),
      event,
      state_before: stateBefore,
      state_after: stateAfter,
      one_frame_slot: oneFrameSlot,
      ...extra,
    });
    const judgementFields = (entry) => ({
      raw_result: entry.rawResult,
      adjusted_result: entry.adjustedResult,
      add_combo: entry.addCombo,
      judge_timing: entry.judgeTiming,
    });
    const reflectFields = (batch) => ({
      slots: batch.entries.map((entry) => entry.slot),
      entry_count: batch.entryCount,
      add_combo: batch.addCombo,
    });
    const assertSteps = (caseId, actual) => {
      assert.deepEqual(actual, oracleCases.get(caseId).steps,
        `${caseId} canonical actual trace`);
    };

    {
      const expected = oracleCases.get("single-normal-before-equal");
      const beforePosition = expected.steps[0].adjusted_position.value;
      const equalPosition = expected.steps[1].adjusted_position.value;
      const bound = bindNote(new notes.NoteNormal("canonical-normal"), normalInfo(100), {
        position: { value: beforePosition },
      });
      const beforeState = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), "canonical normal before");
      const actual = [commonStep(
        0, 0, beforePosition, "no-crossing", beforeState,
        stateName(bound.note.state), null,
      )];
      bound.position.value = equalPosition;
      const equalState = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), "canonical normal equal");
      const batchValue = reflect(bound.oneFrame);
      const entry = batchValue.entries[0];
      actual.push(commonStep(
        1, 0, equalPosition, `${entry.phase}-perfect`, equalState,
        stateName(bound.note.state), entry.slot, judgementFields(entry),
      ));
      actual.push(commonStep(
        1, 0, equalPosition, "reflect", stateName(bound.note.state),
        stateName(bound.note.state), null, reflectFields(batchValue),
      ));
      assertSteps("single-normal-before-equal", actual);
    }

    {
      const expected = oracleCases.get("single-manual-does-not-force");
      const position = expected.steps[0].adjusted_position.value;
      const bound = bindNote(new notes.NoteNormal("canonical-manual"), normalInfo(101), {
        position: { value: position },
        isAuto: false,
      });
      const beforeState = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), "canonical manual crossing");
      assertSteps("single-manual-does-not-force", [commonStep(
        0, 0, position, "manual-crossing-no-force-perfect", beforeState,
        stateName(bound.note.state), null,
      )]);
    }

    const assertFlickTrace = (caseId, note, information) => {
      const expected = oracleCases.get(caseId);
      const position = expected.steps[0].adjusted_position.value;
      const bound = bindNote(note, information, { position: { value: position } });
      const beforeState = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), `canonical ${caseId}`);
      const batchValue = reflect(bound.oneFrame);
      const entry = batchValue.entries[0];
      const actual = [
        commonStep(0, 0, position, bound.note.flickTrace[0].kind,
          beforeState, beforeState, null, { submitted_result: entry.rawResult }),
        commonStep(0, 0, position, bound.note.flickTrace[1].kind,
          beforeState, beforeState, null, {
            ...(information.fireNoteType === types.FrontNoteType.DirectionalFlick
              ? { source_note_type: information.gameNoteType }
              : {}),
            synthetic_x: adjustedPosition(bound.note.flickTrace[1].syntheticX),
          }),
        commonStep(0, 0, position, `${entry.phase}-perfect`, beforeState,
          stateName(bound.note.state), entry.slot, {
            ...judgementFields(entry),
            note_type: entry.noteType,
          }),
        commonStep(0, 0, position, "reflect", stateName(bound.note.state),
          stateName(bound.note.state), null, reflectFields(batchValue)),
      ];
      assertSteps(caseId, actual);
    };
    assertFlickTrace(
      "flick-base-first-single-result",
      new notes.NoteFlick("canonical-flick"),
      normalInfo(102, 120, {
        gameNoteType: types.GameNoteType.Flick,
        fireNoteType: types.FrontNoteType.Flick,
      }),
    );
    assertFlickTrace(
      "directional-left-synthetic",
      new notes.NoteDirectionalFlick("canonical-directional-left"),
      normalInfo(103, 120, {
        gameNoteType: types.GameNoteType.DirectionalFlickLeft,
        fireNoteType: types.FrontNoteType.DirectionalFlick,
      }),
    );
    assertFlickTrace(
      "directional-right-synthetic",
      new notes.NoteDirectionalFlick("canonical-directional-right"),
      normalInfo(104, 120, {
        gameNoteType: types.GameNoteType.DirectionalFlickRight,
        fireNoteType: types.FrontNoteType.DirectionalFlick,
      }),
    );

    {
      const expected = oracleCases.get("long-head-equal-tail-strict-greater");
      const bound = bindNote(new notes.NoteLong("canonical-long"), longInfo(), {
        position: { value: expected.steps[0].adjusted_position.value },
      });
      const actual = [];
      const headBefore = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), "canonical Long head");
      let batchValue = reflect(bound.oneFrame);
      let entry = batchValue.entries[0];
      actual.push(commonStep(0, 0, bound.position.value, `${entry.phase}-perfect`,
        headBefore, stateName(bound.note.state), entry.slot, judgementFields(entry)));
      actual.push(commonStep(0, 0, bound.position.value, "reflect",
        stateName(bound.note.state), stateName(bound.note.state), null,
        reflectFields(batchValue)));
      bound.position.value = expected.steps[2].adjusted_position.value;
      const equalBefore = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), "canonical Long tail equal");
      actual.push(commonStep(1, 0, bound.position.value, "tail-equal-no-crossing",
        equalBefore, stateName(bound.note.state), null));
      bound.position.value = expected.steps[3].adjusted_position.value;
      const tailBefore = stateName(bound.note.state);
      const traceStart = bound.note.autoLiveTrace.length;
      ok(bound.note.executeUpdate(0), "canonical Long tail crossing");
      batchValue = reflect(bound.oneFrame);
      entry = batchValue.entries[0];
      const tailTrace = bound.note.autoLiveTrace.slice(traceStart);
      actual.push(commonStep(2, 0, bound.position.value,
        tailTrace.find((trace) => trace.kind === "long-linked-after-finish").kind,
        tailBefore, tailBefore, null));
      actual.push(commonStep(2, 0, bound.position.value, `${entry.phase}-perfect`,
        tailBefore, stateName(bound.note.state), entry.slot, judgementFields(entry)));
      actual.push(commonStep(2, 0, bound.position.value, "reflect",
        stateName(bound.note.state), stateName(bound.note.state), null,
        reflectFields(batchValue)));
      assertSteps("long-head-equal-tail-strict-greater", actual);
    }

    const assertSlideTrace = () => {
      const expected = oracleCases.get("slide-one-pending-node-per-update");
      const bound = bindNote(new notes.NoteSlide("canonical-slide"), slideInfo(), {
        position: { value: expected.steps[0].adjusted_position.value },
      });
      const actual = [];
      const headBefore = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), "canonical Slide head");
      let batchValue = reflect(bound.oneFrame);
      let entry = batchValue.entries[0];
      actual.push(commonStep(0, 0, bound.position.value, `${entry.phase}-perfect`,
        headBefore, stateName(bound.note.state), entry.slot, {
          current_after_index: bound.note.currentAfterIndex,
          ...judgementFields(entry),
        }));
      actual.push(commonStep(0, 0, bound.position.value, "reflect",
        stateName(bound.note.state), stateName(bound.note.state), null,
        reflectFields(batchValue)));
      for (const [frame, stepIndex] of [[1, 2], [2, 4], [3, 6]]) {
        const expectedStep = expected.steps[stepIndex];
        bound.position.value = expectedStep.adjusted_position.value;
        const stateBefore = stateName(bound.note.state);
        const currentBefore = bound.note.currentAfterIndex;
        const nodePosition = bound.note.afterNotes[currentBefore].source.absolutePos;
        ok(bound.note.executeUpdate(0), `canonical Slide node ${frame}`);
        batchValue = reflect(bound.oneFrame);
        entry = batchValue.entries[0];
        actual.push(commonStep(frame, 0, bound.position.value,
          `${entry.phase}-perfect`, stateBefore, stateName(bound.note.state), entry.slot, {
            node_position: nodePosition,
            current_after_before: currentBefore,
            current_after_after: entry.phase === "tail"
              ? currentBefore + 1
              : bound.note.currentAfterIndex,
            ...judgementFields(entry),
          }));
        actual.push(commonStep(frame, 0, bound.position.value, "reflect",
          stateName(bound.note.state), stateName(bound.note.state), null,
          reflectFields(batchValue)));
      }
      assertSteps("slide-one-pending-node-per-update", actual);
    };
    assertSlideTrace();

    {
      const expected = oracleCases.get("slide-invisible-support-skipped-before-visible");
      const bound = bindNote(new notes.NoteSlide("canonical-slide-invisible"), slideInfo(107, [
        { absolutePos: 170, isInvisible: true },
        { absolutePos: 180 },
        { absolutePos: 240, gameNoteType: types.GameNoteType.SlideEndA },
      ]), { position: { value: expected.steps[0].adjusted_position.value } });
      ok(bound.note.changeState(NoteState.Wait), "canonical invisible Wait");
      const actual = [];
      let beforeState = stateName(bound.note.state);
      let currentBefore = bound.note.currentAfterIndex;
      ok(bound.note.executeUpdate(0), "canonical invisible skip");
      actual.push(commonStep(0, 0, bound.position.value,
        "invisible-support-no-one-frame", beforeState, stateName(bound.note.state), null, {
          current_after_before: currentBefore,
          current_after_after: bound.note.currentAfterIndex,
        }));
      bound.position.value = expected.steps[1].adjusted_position.value;
      beforeState = stateName(bound.note.state);
      currentBefore = bound.note.currentAfterIndex;
      ok(bound.note.executeUpdate(0), "canonical visible child");
      const batchValue = reflect(bound.oneFrame);
      const entry = batchValue.entries[0];
      actual.push(commonStep(1, 0, bound.position.value, `${entry.phase}-perfect`,
        beforeState, stateName(bound.note.state), entry.slot, {
          current_after_before: currentBefore,
          current_after_after: bound.note.currentAfterIndex,
          ...judgementFields(entry),
        }));
      actual.push(commonStep(1, 0, bound.position.value, "reflect",
        stateName(bound.note.state), stateName(bound.note.state), null,
        reflectFields(batchValue)));
      assertSteps("slide-invisible-support-skipped-before-visible", actual);
    }

    const assertConcurrentTrace = (caseId, sources, positions, substeps) => {
      const oneFrame = controller();
      const boundNotes = sources.map((source, index) => bindNote(
        new notes.NoteNormal(`canonical-${caseId}-${index}`), source,
        { position: { value: positions[index] }, oneFrame },
      ));
      const actual = [];
      const updateOrder = caseId === "simultaneous-reverse-update-five-slot-pool"
        ? [...boundNotes.keys()].reverse()
        : [...boundNotes.keys()];
      for (const index of updateOrder) {
        const bound = boundNotes[index];
        const beforeState = stateName(bound.note.state);
        ok(bound.note.executeUpdate(0), `canonical concurrent ${caseId}:${index}`);
        const snapshot = oneFrame.snapshot();
        const setup = snapshot.trace.findLast((trace) =>
          trace.kind === "one-frame.setup-auto-live");
        const slot = Number(setup.containerId.split(":").at(-1));
        const payload = snapshot.slots[slot].payload;
        actual.push(commonStep(0, substeps[index], positions[index],
          `${payload.phase}-perfect`, beforeState, stateName(bound.note.state), slot, {
            note_index: payload.noteIndex,
            raw_result: payload.rawResult,
            adjusted_result: payload.adjustedResult,
            add_combo: payload.addCombo,
            judge_timing: payload.judgeTiming,
          }));
      }
      const batchValue = reflect(oneFrame);
      const lastIndex = updateOrder.at(-1);
      actual.push(commonStep(0, substeps[lastIndex], positions[lastIndex], "reflect",
        "Deactive", "Deactive", null, {
          ...reflectFields(batchValue),
          note_indices: batchValue.entries.map((entry) => entry.noteIndex),
        }));
      assertSteps(caseId, actual);
    };
    assertConcurrentTrace(
      "simultaneous-reverse-update-five-slot-pool",
      [200, 201, 202, 203, 204].map((index) => normalInfo(index, 120)),
      [120, 120, 120, 120, 120],
      [0, 0, 0, 0, 0],
    );
    {
      const caseId = "adaptive-substeps-one-outer-reflect";
      const replay = actualReplay.adaptive_method_replay;
      const integration = schedulerIntegration({
        batches: [300, 301, 302].map((index) => batch(
          120 + index - 300,
          [normalInfo(index, 120 + index - 300)],
        )),
        bpmChangeCount: 1,
        positions: replay.input_adjusted_positions,
      });
      ok(integration.manager.initialize(), "canonical adaptive initialize");
      ok(integration.manager.execUpdate(float32FromBits(replay.input_delta_time_bits[0])),
        "canonical adaptive activate");
      ok(integration.manager.execUpdate(float32FromBits(replay.input_delta_time_bits[1])),
        "canonical adaptive outer frame");
      const batchValue = integration.oneFrame.getReflectOneFrameData();
      const managerSnapshot = integration.manager.snapshot();
      const scheduler = managerSnapshot.noteManager.schedulerTrace;
      const frame = scheduler.findLast((entry) => entry.kind === "frame");
      const judgedUpdates = scheduler.filter((entry) =>
        entry.kind === "note-update" &&
        entry.stateBefore === NoteState.Move &&
        entry.stateAfter === NoteState.Deactive);
      const actual = judgedUpdates.map((entry) => {
        const payload = batchValue.entries.find((candidate) =>
          candidate.noteIndex === entry.noteIndex);
        return commonStep(
          frame.outerFrameIndex,
          entry.substepIndex,
          entry.adjustedPosition,
          `${payload.phase}-perfect`,
          stateName(entry.stateBefore),
          stateName(entry.stateAfter),
          payload.slot,
          {
            note_index: payload.noteIndex,
            raw_result: payload.rawResult,
            adjusted_result: payload.adjustedResult,
            add_combo: payload.addCombo,
            judge_timing: payload.judgeTiming,
          },
        );
      });
      const last = judgedUpdates.at(-1);
      actual.push(commonStep(
        frame.outerFrameIndex,
        last.substepIndex,
        last.adjustedPosition,
        "reflect",
        stateName(last.stateAfter),
        stateName(last.stateAfter),
        null,
        {
          ...reflectFields(batchValue),
          note_indices: batchValue.entries.map((entry) => entry.noteIndex),
        },
      ));
      const expected = oracleCases.get(caseId).steps.map((entry) => ({
        ...entry,
        outer_frame: replay.judgement_outer_frame_index,
      }));
      assert.equal(frame.outerFrameIndex, replay.judgement_outer_frame_index,
        "adaptive outer frame identity must come from NoteManager trace");
      assert.deepEqual(judgedUpdates.map((entry) => entry.substepIndex),
        replay.expected_substep_indices);
      assert.deepEqual(actual, expected);
      assert.deepEqual(
        supplementCases.get("actual-adaptive-scheduler-observation-requirements")
          .must_be_observed_from_runtime,
        [
          "outer-frame-index",
          "substep-index",
          "adjusted-position-value-and-bits",
          "note-state-before-and-after",
          "one-frame-slot",
          "single-outer-reflect-batch",
        ],
      );
    }

    {
      const music = new InGameMusicScoreController(fixture.chart([], 120));
      ok(music.advance(1.25), "canonical adjustment baseline");
      const baseline = music.musicPosition;
      const values = [-5, 0, 5].map((offset) => music.getAdjustedMusicPosition(offset));
      const relations = [
        values[0] < baseline ? "rewind-five-tempo-aware-steps" : "invalid",
        values[1] === baseline ? "identity" : "invalid",
        values[2] > baseline ? "advance-five-tempo-aware-steps" : "invalid",
      ];
      const actual = [-5, 0, 5].map((offset, index) => commonStep(
        0, 0, baseline, "adjustment-sample", "Move", "Move", null, {
          judgement_adjust_value_b: offset,
          relation: relations[index],
        },
      ));
      assertSteps("adjustment-sign-crossing", actual);

      const tempoCommand = normalInfo(899, 100, {
        buttonType: types.ButtonType.None,
        buttonTypes: [types.ButtonType.None],
        buttonTypesArray: [types.ButtonType.None],
        ccNum: 8,
        bpm: 95.5,
        bpmString: "95.5",
      });
      const crossingMusic = new InGameMusicScoreController(
        fixture.chart([batch(100, [tempoCommand])], 99.5),
      );
      ok(crossingMusic.advance(Math.fround(99 / Math.fround(99.5 * 0.8))),
        "actual offset tempo-query entry cursor");
      const crossingEntry = crossingMusic.musicPosition;
      const crossingResult = crossingMusic.getAdjustedMusicPosition(5);
      const observedQueries = crossingMusic.snapshot().tempoQueryTrace;
      assert.equal(observedQueries.length, 5);
      assert.equal(observedQueries[0].bpm, 99.5);
      assert.equal(observedQueries.some((entry) => entry.bpm === 95.5), true);
      assert.equal(observedQueries.every((entry, index) =>
        index === 0 || entry.position > observedQueries[index - 1].position), true);
      assert.equal(crossingResult > crossingEntry, true);
    }

    assertCanonicalSupplementTraces({
      stateName,
      adjustedPosition,
      judgementFields,
      reflectFields,
    });
  }

  function assertCanonicalSupplementTraces({
    stateName,
    adjustedPosition,
    judgementFields,
    reflectFields,
  }) {
    const assertSteps = (caseId, actual) => {
      assert.deepEqual(actual, supplementCases.get(caseId).steps,
        `${caseId} canonical actual trace`);
    };
    const runMultiple = (caseId, gameNoteType, buttons, judgedIndex) => {
      const oneFrame = controller();
      const runtimeGroup = {
        count: buttons.length,
        isUsed: false,
        markUsed() {
          if (this.isUsed) return { status: "evidence-required" };
          this.isUsed = true;
          return { status: "ok", value: undefined };
        },
      };
      const groupNotes = buttons.map((buttonType, index) => {
        const information = multipleInfo(800 + index, 120, buttonType, gameNoteType);
        const note = new notes.NoteMultipleDirectionalFlick(
          `canonical-multiple-${caseId}-${index}`,
        );
        note.registerMultipleDirectionalGroupResolver(() =>
          ({ status: "ok", value: runtimeGroup }));
        note.registerAutoLiveRuntime({
          isAutoPlay: () => true,
          getAdjustedMusicPosition: () => 120,
          submitJudgement: (judgement) => oneFrame.setupAutoLiveJudgement(judgement),
        });
        ok(note.activate(information), `canonical Multiple activate ${caseId}:${index}`);
        return { note, information, buttonType };
      });
      const judged = groupNotes[judgedIndex];
      const beforeState = stateName(judged.note.state);
      ok(judged.note.executeUpdate(0), `canonical Multiple judged ${caseId}`);
      for (const [index, side] of groupNotes.entries()) {
        if (index !== judgedIndex) {
          ok(side.note.executeUpdate(0), `canonical Multiple side ${caseId}:${index}`);
        }
      }
      const batchValue = reflect(oneFrame);
      const entry = batchValue.entries[0];
      const setup = oneFrame.snapshot().trace.findLast(
        (trace) => trace.kind === "one-frame.setup-auto-live",
      );
      const sideTraces = groupNotes.flatMap(({ note }) => note.multipleTrace)
        .filter((trace) => trace.kind === "multiple-side-used-deactivate");
      const actual = [
        {
          event: judged.note.flickTrace[0].kind,
          state_before: beforeState,
          state_after: beforeState,
          submitted_result: entry.rawResult,
        },
        {
          event: judged.note.flickTrace[1].kind,
          synthetic_x: adjustedPosition(judged.note.flickTrace[1].syntheticX),
          source_note_type: judged.information.gameNoteType,
        },
        {
          event: `${entry.phase}-perfect`,
          state_before: beforeState,
          state_after: stateName(judged.note.state),
          note_type: entry.noteType,
          ...judgementFields(entry),
          multiple_directional_flick_note_count:
            setup.multipleDirectionalFlickNoteCount,
          one_frame_slot: entry.slot,
        },
        {
          event: "side-notes-used",
          left_count: groupNotes.filter((candidate) =>
            candidate.note.multipleTrace.some((trace) =>
              trace.kind === "multiple-side-used-deactivate") &&
            candidate.buttonType < judged.buttonType).length,
          right_count: groupNotes.filter((candidate) =>
            candidate.note.multipleTrace.some((trace) =>
              trace.kind === "multiple-side-used-deactivate") &&
            candidate.buttonType > judged.buttonType).length,
        },
        {
          event: "reflect",
          ...reflectFields(batchValue),
        },
      ];
      assert.equal(sideTraces.length, buttons.length - 1);
      assertSteps(caseId, actual);
    };
    runMultiple(
      "multiple-directional-left-auto-group",
      types.GameNoteType.DirectionalFlickLeft,
      [0, 1, 2],
      1,
    );
    runMultiple(
      "multiple-directional-right-auto-group",
      types.GameNoteType.DirectionalFlickRight,
      [0, 1],
      0,
    );

    {
      const expected = supplementCases.get("slide-stop-selected-visible-intermediate");
      const bound = bindNote(new notes.NoteSlide("canonical-slide-stop"), slideInfo(), {
        position: { value: expected.steps[0].adjusted_position.value },
      });
      ok(bound.note.changeState(NoteState.Stop), "canonical Slide Stop state");
      const actual = [];
      let beforeState = stateName(bound.note.state);
      ok(bound.note.executeUpdate(0), "canonical Slide Stop before");
      actual.push({
        event: "stop-before-crossing",
        adjusted_position: adjustedPosition(bound.position.value),
        state_before: beforeState,
        state_after: stateName(bound.note.state),
        selected_judged: bound.note.afterNotes[0].judged,
        current_after_index: bound.note.currentAfterIndex,
      });
      bound.position.value = expected.steps[1].adjusted_position.value;
      beforeState = stateName(bound.note.state);
      const currentBefore = bound.note.currentAfterIndex;
      ok(bound.note.executeUpdate(0), "canonical Slide Stop crossing");
      const batchValue = reflect(bound.oneFrame);
      const entry = batchValue.entries[0];
      actual.push({
        event: `stop-${entry.phase}-perfect`,
        adjusted_position: adjustedPosition(bound.position.value),
        state_before: beforeState,
        state_after: beforeState,
        phase: entry.phase,
        note_type: entry.noteType,
        raw_result: entry.rawResult,
        adjusted_result: entry.adjustedResult,
        one_frame_slot: entry.slot,
        selected_judged: true,
      });
      actual.push({
        event: "on-update-advance-judged-current",
        current_after_before: currentBefore,
        current_after_after: bound.note.currentAfterIndex,
      });
      actual.push({ event: "reflect", ...reflectFields(batchValue) });
      assertSteps("slide-stop-selected-visible-intermediate", actual);
    }

    {
      const source = normalInfo(810, 1, {
        gameNoteType: types.GameNoteType.Long,
        fireNoteType: types.FrontNoteType.Long,
        afterNoteType: types.AfterNoteType.Normal,
        afterNoteAbsolutePos: 3,
      });
      const integration = schedulerIntegration({
        batches: [batch(1, [source])],
        bpmChangeCount: 0,
        positions: [0, 1, 3, 4],
      });
      ok(integration.manager.initialize(), "canonical Long pause initialize");
      ok(integration.manager.execUpdate(0), "canonical Long pause activate");
      ok(integration.manager.execUpdate(0), "canonical Long pause head");
      const longObject = () => integration.manager.snapshot().noteManager.pools
        .find((pool) => pool.family === "long").objects[0];
      let object = longObject();
      const actual = [{
        event: "head-perfect",
        state_before: "Move",
        state_after: stateName(object.state),
        linked_judged: object.linkedAfter?.judged ?? false,
      }];
      const pauseBefore = stateName(object.state);
      ok(integration.manager.pause(), "canonical Long pause enter");
      object = longObject();
      actual.push({
        event: "pause-enter",
        state_before: pauseBefore,
        state_after: stateName(object.state),
        linked_judged: object.linkedAfter?.judged ?? false,
      });
      const musicBefore = integration.music.advanceCount;
      const schedulerBefore = integration.manager.snapshot().noteManager
        .schedulerTrace.length;
      const slotsBefore = JSON.stringify(integration.oneFrame.snapshot().slots);
      const pausedStateBefore = stateName(object.state);
      ok(integration.manager.execUpdate(1), "canonical Long paused frame");
      object = longObject();
      actual.push({
        event: "paused-frame",
        music_advanced: integration.music.advanceCount !== musicBefore,
        note_manager_entered: integration.manager.snapshot().noteManager
          .schedulerTrace.length !== schedulerBefore,
        state_before: pausedStateBefore,
        state_after: stateName(object.state),
        linked_judged: object.linkedAfter?.judged ?? false,
        one_frame_slots_unchanged:
          JSON.stringify(integration.oneFrame.snapshot().slots) === slotsBefore,
      });
      const advanceBeforeResume = integration.music.advanceCount;
      const resumeBefore = stateName(object.state);
      ok(integration.manager.resume(), "canonical Long resume");
      object = longObject();
      actual.push({
        event: "resume",
        catch_up_substeps: integration.music.advanceCount - advanceBeforeResume,
        state_before: resumeBefore,
        state_after: stateName(object.state),
      });
      const equalBefore = stateName(object.state);
      ok(integration.manager.execUpdate(0), "canonical Long equal tail");
      object = longObject();
      actual.push({
        event: "tail-equal-no-crossing",
        state_before: equalBefore,
        state_after: stateName(object.state),
        linked_judged: object.linkedAfter?.judged ?? false,
      });
      const strictBefore = stateName(object.state);
      ok(integration.manager.execUpdate(0), "canonical Long strict tail");
      object = longObject();
      const traceKinds = object.autoLiveTrace.map((trace) => trace.kind);
      actual.push({
        event: "tail-strict-greater",
        state_before: strictBefore,
        state_after: stateName(object.state),
        linked_finish_before_tail:
          traceKinds.indexOf("long-linked-after-finish") <
          traceKinds.indexOf("long-tail-perfect"),
      });
      assertSteps("pause-active-long-freeze-resume", actual);
    }

    {
      const source = slideInfo(820, [
        { absolutePos: 2 },
        { absolutePos: 3, gameNoteType: types.GameNoteType.SlideEndA },
      ], { absolutePos: 1, storedAbsolutePos: 1, afterNoteAbsolutePos: 3 });
      const integration = schedulerIntegration({
        batches: [batch(1, [source])],
        bpmChangeCount: 0,
        positions: [0, 1, 2],
      });
      ok(integration.manager.initialize(), "canonical Slide pause initialize");
      ok(integration.manager.execUpdate(0), "canonical Slide pause activate");
      ok(integration.manager.execUpdate(0), "canonical Slide pause head");
      ok(integration.oneFrame.setupAutoLiveJudgement(
        request(normalInfo(821, 2), "head")), "canonical Slide pending slot");
      const slideObject = () => integration.manager.snapshot().noteManager.pools
        .find((pool) => pool.family === "slide").objects[0];
      let object = slideObject();
      const occupiedBefore = integration.oneFrame.snapshot().slots
        .filter((slot) => slot.isUse).map((slot) => slot.slot);
      ok(integration.manager.pause(), "canonical Slide pause enter");
      const actual = [{
        event: "pause-enter",
        state: stateName(object.state),
        current_after_index: object.currentAfterIndex,
        occupied_slots: occupiedBefore,
      }];
      const musicBefore = integration.music.advanceCount;
      const schedulerBefore = integration.manager.snapshot().noteManager
        .schedulerTrace.length;
      const currentBefore = object.currentAfterIndex;
      const occupiedPausedBefore = integration.oneFrame.snapshot().slots
        .filter((slot) => slot.isUse).map((slot) => slot.slot);
      ok(integration.manager.execUpdate(1), "canonical Slide paused frame");
      object = slideObject();
      const occupiedAfter = integration.oneFrame.snapshot().slots
        .filter((slot) => slot.isUse).map((slot) => slot.slot);
      actual.push({
        event: "paused-frame",
        music_advanced: integration.music.advanceCount !== musicBefore,
        note_manager_entered: integration.manager.snapshot().noteManager
          .schedulerTrace.length !== schedulerBefore,
        current_after_before: currentBefore,
        current_after_after: object.currentAfterIndex,
        occupied_slots_before: occupiedPausedBefore,
        occupied_slots_after: occupiedAfter,
      });
      const advanceBeforeResume = integration.music.advanceCount;
      ok(integration.manager.resume(), "canonical Slide resume");
      actual.push({
        event: "resume",
        catch_up_substeps: integration.music.advanceCount - advanceBeforeResume,
      });
      const transitionBefore = slideObject().currentAfterIndex;
      ok(integration.manager.execUpdate(0), "canonical Slide one transition");
      actual.push({
        event: "one-normal-current-transition",
        current_after_before: transitionBefore,
        current_after_after: slideObject().currentAfterIndex,
      });
      assertSteps("pause-active-slide-pending-slot-freeze", actual);
    }

    const replayExactOffset = (caseId) => {
      const expected = supplementCases.get(caseId);
      const replay = actualReplay.offset_replays.find((entry) =>
        entry.case_id === caseId);
      assert(replay, `missing G22 replay ${caseId}`);
      assert.equal(replay.delta_time_bits.length, replay.target_frame_id);
      const chart = ok(construction.createNoteBatchInformationList({
        musicScoreData: readFileSync(actualReplayChartPath, "utf8"),
      }), `G22 replay chart ${caseId}`);
      const engine = ok(createSimulatorEngine({
        chart,
        runtime: {
          highFrequencyMode: false,
          judgeOffsetFrames: replay.judge_offset_frames,
          playMode: {
            kind: "auto-live",
            resultTransform: "identity-no-active-situation-skill",
          },
        },
      }, createRecordingSimulatorBackends()), `G22 replay engine ${caseId}`);
      ok(engine.initialize(), `G22 replay initialize ${caseId}`);
      for (const [frameIndex, deltaBits] of replay.delta_time_bits.entries()) {
        ok(engine.step(float32FromBits(deltaBits)),
          `G22 replay ${caseId} frame ${frameIndex + 1}`);
      }
      const entry = ok(engine.snapshot(), `G22 replay entry ${caseId}`);
      const traceStart = entry.managers.musicScore.tempoQueryTrace.length;
      const result = ok(engine.getAdjustedMusicPosition(),
        `G22 production owner ${caseId}`);
      const after = ok(engine.snapshot(), `G22 replay result ${caseId}`);
      const stepBpms = after.managers.musicScore.tempoQueryTrace
        .slice(traceStart)
        .map((trace) => trace.bpm);
      const actual = {
        settings: {
          judgement_adjust_value_b: replay.judge_offset_frames,
          ...(replay.judge_offset_frames === 0
            ? {}
            : { frames_argument: Math.abs(replay.judge_offset_frames) }),
        },
        entry_music_cursor: {
          bar: entry.managers.musicScore.bar,
          beat_progress: adjustedPosition(entry.managers.musicScore.beatProgress),
        },
        entry_music_absolute_position:
          adjustedPosition(entry.managers.musicScore.musicPosition),
        ...(replay.judge_offset_frames === 0 ? {} : { step_bpms: stepBpms }),
        result_adjusted_position: adjustedPosition(result),
        ...(replay.judge_offset_frames === 0
          ? { step_count: stepBpms.length }
          : {
              crossed_bar:
                Math.trunc(result / 192) !== entry.managers.musicScore.bar,
              crossed_bpm:
                stepBpms.some((bpm) => bpm !== stepBpms[0]),
            }),
      };
      const {
        case_id: _caseId,
        evidence: _evidence,
        source_note: _sourceNote,
        ...expectedProjection
      } = expected;
      assert.deepEqual(actual, expectedProjection,
        `${caseId} production-owner exact trace`);
      ok(engine.dispose(), `G22 replay dispose ${caseId}`);
    };
    replayExactOffset("offset-plus5-cross-bpm-exact");
    replayExactOffset("offset-minus5-cross-bar-exact");
    replayExactOffset("offset-zero-identity-exact");
  }
}

class FakeIntegrationMusic {
  constructor(positions) {
    this.positions = [...positions];
    this.position = 0;
    this.advanceCount = 0;
    this.executeFrame = 0;
  }

  setExecuteFrame(value) {
    this.executeFrame = value;
  }

  advance() {
    this.advanceCount += 1;
    const next = this.positions.shift();
    if (next !== undefined) this.position = next;
    return { status: "ok", value: undefined };
  }

  canActivateBatch() {
    return { status: "ok", value: true };
  }

  getAdjustedMusicPosition() {
    return this.position;
  }

  snapshot() {
    return {
      executeFrame: this.executeFrame,
      musicPosition: this.position,
      advanceCount: this.advanceCount,
    };
  }
}

function projectBatch(batch) {
  return {
    slots: batch.entries.map((entry) => entry.slot),
    noteIndices: batch.entries.map((entry) => entry.noteIndex),
    entryCount: batch.entryCount,
    addCombo: batch.addCombo,
  };
}

function float32Bits(value) {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, false);
  return `0x${new DataView(buffer).getUint32(0, false).toString(16).toUpperCase().padStart(8, "0")}`;
}

function float32FromBits(bits) {
  assert.match(bits, /^0x[0-9A-F]{8}$/);
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, Number.parseInt(bits.slice(2), 16), false);
  return new DataView(buffer).getFloat32(0, false);
}

function previousPositiveFloat32(value) {
  const bits = float32Bits(value);
  assert.match(bits, /^0x[0-9A-F]{8}$/);
  const encoded = Number.parseInt(bits.slice(2), 16);
  assert(encoded > 0 && encoded < 0x7F800000,
    `expected positive finite Float32, received ${value}`);
  return float32FromBits(`0x${(encoded - 1).toString(16).toUpperCase().padStart(8, "0")}`);
}

function ok(result, label) {
  assert.equal(result.status, "ok", `${label}: ${JSON.stringify(result)}`);
  return result.value;
}

function evidence(result, capability) {
  assert.equal(result.status, "evidence-required", JSON.stringify(result));
  assert.equal(result.capability, capability, JSON.stringify(result));
  return result;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${String(result.status)}`);
  }
}

try {
  run(process.execPath, [
    typeScriptCli,
    "-p",
    join(testingRoot, "tsconfig.tests.json"),
    "--outDir",
    outputRoot,
  ]);
  validateAutoLive();
  run(process.execPath, [join(testingRoot, "verifyDependencies.mjs")]);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
