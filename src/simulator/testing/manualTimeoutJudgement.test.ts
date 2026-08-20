import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import { LIVE_MANUAL_MODE } from "./modeFixtures";
import type { SimulatorManualInputGeometryBackend } from "../backends/contracts";
import {
  AfterNoteType, ButtonType, FrontNoteType, GameNoteType,
  type NoteInformation,
} from "../engine/chart/types";
import { InGameCalculatedData } from "../engine/data/inGameCalculatedData";
import type { ManualInputPosition } from "../engine/data/manualInput";
import { JudgeTiming, NoteResultType, type ManualJudgementRequest } from "../engine/data/manualJudgement";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import { NoteState, type ManualNoteTouchInput } from "../engine/notes/noteBase";
import { NoteLong, NoteSlide } from "../engine/notes/noteTypes";
import { noteInformation } from "./firstSliceFixtures";
interface TestCase { readonly name: string; readonly run: () => void }
const tests: TestCase[] = [];
const manualMode = new InGameCalculatedData(LIVE_MANUAL_MODE, DEFAULT_ORIGINAL_LIVE_SETTINGS);
const deadlineDistance = floatFromBits(0x41a66666);
const afterDeadlineDistance = floatFromBits(0x41a66667);
const origin = Object.freeze({ x: Math.fround(0), y: Math.fround(0) });
function test(name: string, run: () => void): void { tests.push({ name, run }) }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function equal<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function deep(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
}
function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  assert(result.status === "ok", `${message}: ${JSON.stringify(result)}`); return result.value;
}
function floatFromBits(bits: number): number {
  const data = new ArrayBuffer(4); const view = new DataView(data);
  view.setUint32(0, bits, true); return view.getFloat32(0, true);
}
class Geometry implements SimulatorManualInputGeometryBackend {
  resolveButton() { return evidenceRequired("test.unused", ["MJ23"], "unused") }
  screenToWorld(position: ManualInputPosition) {
    return ok(Object.freeze({ x: position.x, y: position.y, z: Math.fround(0) }));
  }
  getDistanceNormalization() {
    return ok(Object.freeze({ cameraScale: Math.fround(1), gameplayScale: Math.fround(1) }));
  }
  isInsideTargetButtons() { return ok(true) }
  getGameplayButtonLocalY(buttonType: number) { return ok(Math.fround(buttonType)) }
  getSlideCurrentLocalY() { return ok(Math.fround(0)) }
  getSlideJudgeGeometry() {
    return ok(Object.freeze({
      positions: Object.freeze(Array.from({ length: 17 }, (_, index) => Math.fround(index - 8))),
      virtualPerfectLine: Math.fround(0.5),
    }));
  }
}
function immediate(
  controller: InGameOneFrameJudgementController,
  request: ManualJudgementRequest,
): SimulatorResult<void> {
  const transaction = controller.createManualJudgementTransaction();
  const plan = transaction.preflight(request);
  if (plan.status !== "ok") { transaction.abort(); return plan }
  transaction.commit(plan.value); transaction.finish(); return ok(undefined);
}
function longSource(): NoteInformation {
  return {
    ...noteInformation("timeout-long", 1),
    fireNoteType: FrontNoteType.Long,
    gameNoteType: GameNoteType.Long,
    buttonType: ButtonType.Button_01_BMS_1P_01,
    buttonTypes: [ButtonType.Button_01_BMS_1P_01],
    buttonTypesArray: [ButtonType.Button_01_BMS_1P_01],
    absolutePos: 2, storedAbsolutePos: 2,
    afterNoteType: AfterNoteType.Normal, afterNoteAbsolutePos: 30,
  };
}
function createLong() {
  const source = longSource(); const controller = new InGameOneFrameJudgementController();
  requireOk(controller.initialize(), "initialize Long OneFrame");
  requireOk(controller.registerManualJudgementOwner((candidate) => candidate === source
    ? Object.freeze({
        multipleDirectionalFlickNoteCount: null, multipleDirectionalFlickButtonTypes: null,
        longAfterAbsolutePosition: source.afterNoteAbsolutePos, longAfterNoteType: 2,
        longAfterButtonTypes: source.buttonTypesArray, longAfterMultipleCount: null,
        slidePhase: null, slideAllowedNoteTypes: null, slideAbsolutePosition: null,
        slideButtonTypes: null,
      }) : null), "register Long owner");
  let adjusted = Math.fround(0);
  const note = new NoteLong("timeout-long");
  note.setLifecycleCallbacks({ onActivate() {}, onDeactivate() {} });
  note.registerAutoLiveRuntime({ isAutoPlay: () => manualMode.isAutoPlay,
    getAdjustedMusicPosition: () => adjusted,
    submitJudgement: () => evidenceRequired("test.auto", ["MJ16"], "unused") });
  note.registerManualRuntime({
    getAdjustedMusicPosition: () => adjusted, getCurrentBpm: () => Math.fround(120),
    getJudgementAdjustValueB: () => 0,
    judgeSlide: () => evidenceRequired("test.slide", ["MJ16"], "unused"),
    geometry: new Geometry(), beginJudgementTransaction: () => controller.createManualJudgementTransaction(),
    submitJudgement: (request) => immediate(controller, request),
  });
  requireOk(note.activate(source), "activate Long timeout");
  return { note, source, controller, setAdjusted(value: number) { adjusted = Math.fround(value) } };
}
function slideChild(index: number, position: number, invisible: boolean, terminal: boolean): NoteInformation {
  return {
    ...noteInformation(`timeout-slide-${index}`, index),
    fireNoteType: terminal ? FrontNoteType.None : FrontNoteType.SlideA,
    gameNoteType: terminal ? GameNoteType.SlideEndA : GameNoteType.SlideA,
    buttonType: ButtonType.Button_02_BMS_1P_02,
    buttonTypes: [ButtonType.Button_02_BMS_1P_02],
    buttonTypesArray: [ButtonType.Button_02_BMS_1P_02],
    absolutePos: position, storedAbsolutePos: position,
    isInvisible: invisible, isSlideNoteHead: false,
    slideNoteList: [], afterNoteType: AfterNoteType.None,
  };
}
function createSlide() {
  const invisibleA = slideChild(2, 25, true, false);
  const invisibleB = slideChild(3, 26, true, false);
  const terminal = slideChild(4, 100, false, true);
  const source: NoteInformation = {
    ...noteInformation("timeout-slide-root", 1),
    fireNoteType: FrontNoteType.SlideA, gameNoteType: GameNoteType.SlideA,
    buttonType: ButtonType.Button_02_BMS_1P_02,
    buttonTypes: [ButtonType.Button_02_BMS_1P_02],
    buttonTypesArray: [ButtonType.Button_02_BMS_1P_02],
    absolutePos: 2, storedAbsolutePos: 2, isSlideNoteHead: true,
    slideNoteList: [invisibleA, invisibleB, terminal], afterNoteType: AfterNoteType.None,
  };
  const phases = new Map<NoteInformation, "head" | "intermediate" | "tail">([
    [source, "head"], [invisibleA, "intermediate"], [invisibleB, "intermediate"], [terminal, "tail"],
  ]);
  const controller = new InGameOneFrameJudgementController();
  requireOk(controller.initialize(), "initialize Slide OneFrame");
  requireOk(controller.registerManualJudgementOwner((candidate) => {
    const phase = phases.get(candidate); return phase === undefined ? null : Object.freeze({
      multipleDirectionalFlickNoteCount: null, multipleDirectionalFlickButtonTypes: null,
      longAfterAbsolutePosition: null, longAfterNoteType: null, longAfterButtonTypes: null,
      longAfterMultipleCount: null, slidePhase: phase,
      slideAllowedNoteTypes: Object.freeze([8]), slideAbsolutePosition: candidate.absolutePos,
      slideButtonTypes: candidate.buttonTypesArray,
    });
  }), "register Slide owner");
  let adjusted = Math.fround(0); const geometry = new Geometry();
  const slideManager = new SlideNoteManager();
  requireOk(slideManager.initialize(geometry), "setup Slide judge owner");
  const note = new NoteSlide("timeout-slide");
  note.setLifecycleCallbacks({ onActivate() {}, onDeactivate() {} });
  note.registerAutoLiveRuntime({ isAutoPlay: () => manualMode.isAutoPlay,
    getAdjustedMusicPosition: () => adjusted,
    submitJudgement: () => evidenceRequired("test.auto", ["MJ23"], "unused") });
  note.registerManualRuntime({
    getAdjustedMusicPosition: () => adjusted, getCurrentBpm: () => Math.fround(120),
    getJudgementAdjustValueB: () => 0, judgeSlide: (child, music) => slideManager.judge(child, music),
    geometry, beginJudgementTransaction: () => controller.createManualJudgementTransaction(),
    submitJudgement: (request) => immediate(controller, request),
  });
  requireOk(note.activate(source), "activate Slide timeout");
  return { note, controller, setAdjusted(value: number) { adjusted = Math.fround(value) } };
}
function reflect(controller: InGameOneFrameJudgementController) {
  const batch = requireOk(controller.reflectOneFrameData(), "reflect timeout");
  assert(batch !== null, "timeout batch exists"); return batch.entries;
}

test("MJ16 Long start strict deadline后原子提交两个type1 Miss", () => {
  const value = createLong(); value.setAdjusted(value.source.absolutePos);
  requireOk(value.note.executeUpdate(0), "Long enters Wait"); equal(value.note.state, NoteState.Wait, "Long Wait");
  value.setAdjusted(Math.fround(value.source.absolutePos + deadlineDistance));
  requireOk(value.note.executeUpdate(0), "Long equal deadline");
  equal(value.controller.snapshot().inUseContainerIds.length, 0, "equal strict no timeout");
  value.setAdjusted(Math.fround(value.source.absolutePos + afterDeadlineDistance));
  requireOk(value.note.executeUpdate(0), "Long next Float32 timeout");
  deep(reflect(value.controller).map((entry) => [entry.noteType, entry.rawResult, entry.phase]),
    [[1, 0, "head"], [1, 0, "head"]], "Long start two ordered Miss slots");
  equal(value.note.state, NoteState.Deactive, "Long start timeout cleanup");
});

test("MJ17 Long Stop strict deadline提交单tail Miss", () => {
  const value = createLong(); value.setAdjusted(value.source.absolutePos);
  const transaction = value.controller.createManualJudgementTransaction();
  const input: ManualNoteTouchInput = Object.freeze({ deltaTimeSeconds: Math.fround(1 / 60),
    fingerId: 0, phase: 0, beganPosition: origin, currentPosition: origin,
    judgementTransaction: transaction });
  const selected = requireOk(value.note.preflightManualTouchBegan(input), "Long Began select");
  const plan = requireOk(value.note.preflightManualTouchBeganCommit(input, selected), "Long Began preflight");
  value.note.commitManualTouchBegan(input, plan); transaction.finish();
  requireOk(value.controller.reflectOneFrameData(), "clear Long head");
  value.setAdjusted(Math.fround(value.source.afterNoteAbsolutePos + deadlineDistance));
  requireOk(value.note.executeUpdate(0), "Long tail equal deadline");
  equal(value.controller.snapshot().inUseContainerIds.length, 0, "tail equal strict no timeout");
  value.setAdjusted(Math.fround(value.source.afterNoteAbsolutePos + afterDeadlineDistance));
  requireOk(value.note.executeUpdate(0), "Long tail next Float32 timeout");
  deep(reflect(value.controller).map((entry) => [entry.noteType, entry.rawResult, entry.phase]),
    [[2, 0, "tail"]], "Long tail one Miss");
  equal(value.note.state, NoteState.Deactive, "Long tail timeout cleanup");
});

test("MJ23 Slide front/current timeout与连续invisible parent cursor skip", () => {
  const value = createSlide(); value.setAdjusted(2);
  requireOk(value.note.executeUpdate(0), "Slide enters Wait"); equal(value.note.state, NoteState.Wait, "Slide Wait");
  value.setAdjusted(Math.fround(2 + deadlineDistance));
  requireOk(value.note.executeUpdate(0), "Slide front equal deadline");
  equal(value.controller.snapshot().inUseContainerIds.length, 0, "Slide front equal no timeout");
  value.setAdjusted(Math.fround(2 + afterDeadlineDistance));
  requireOk(value.note.executeUpdate(0), "Slide front next timeout");
  deep(reflect(value.controller).map((entry) => [entry.noteType, entry.phase, entry.rawResult]),
    [[8, "head", 0]], "Slide front type8 Miss");
  equal(value.note.state, NoteState.Stop, "Slide timeout enters Stop");
  equal(value.note.snapshot().currentAfterIndex, 2, "two invisible nodes skipped by parent cursor");
  value.setAdjusted(Math.fround(100 + afterDeadlineDistance));
  requireOk(value.note.executeUpdate(0), "Slide terminal timeout");
  deep(reflect(value.controller).map((entry) => [entry.noteType, entry.phase, entry.rawResult]),
    [[8, "tail", 0]], "Slide terminal type8 Miss");
  equal(value.note.state, NoteState.Deactive, "Slide terminal timeout cleanup");
});

test("MJ24 transaction最多五槽且第六preflight不留下partial mutation", () => {
  const controller = new InGameOneFrameJudgementController(); requireOk(controller.initialize(), "initialize capacity");
  const sources = Array.from({ length: 6 }, (_, index) => ({
    ...noteInformation(`capacity-${index}`, index), absolutePos: index + 1, storedAbsolutePos: index + 1,
  }));
  requireOk(controller.registerManualJudgementOwner((source) => sources.includes(source) ? Object.freeze({
    multipleDirectionalFlickNoteCount: null, multipleDirectionalFlickButtonTypes: null,
    longAfterAbsolutePosition: null, longAfterNoteType: null, longAfterButtonTypes: null,
    longAfterMultipleCount: null, slidePhase: null, slideAllowedNoteTypes: null,
    slideAbsolutePosition: null, slideButtonTypes: null,
  }) : null), "register capacity owner");
  const transaction = controller.createManualJudgementTransaction(); const plans = [];
  for (const source of sources.slice(0, 5)) plans.push(requireOk(transaction.preflight({
    noteInformation: source, noteType: 0, rawResult: NoteResultType.Perfect,
    rawTiming: JudgeTiming.None, absolutePosition: source.absolutePos,
  }), "reserve manual slot"));
  const sixth = transaction.preflight({ noteInformation: sources[5]!, noteType: 0,
    rawResult: NoteResultType.Perfect, rawTiming: JudgeTiming.None,
    absolutePosition: sources[5]!.absolutePos });
  assert(sixth.status === "evidence-required" && sixth.capability === "one-frame.pool-exhausted",
    "sixth manual reservation fails closed");
  equal(controller.snapshot().inUseContainerIds.length, 0, "all reservations remain mutation-free");
  transaction.abort();
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`ok ${passed} - ${item.name}`); }
  catch (error) { console.error(`not ok ${passed + 1} - ${item.name}`); throw error; }
}
console.log(`manual timeout judgement tests passed: ${passed}`);
