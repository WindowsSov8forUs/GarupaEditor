import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import { LIVE_MANUAL_MODE } from "./modeFixtures";
import type { SimulatorManualInputGeometryBackend } from "../backends/contracts";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type AfterNoteTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../engine/chart/types";
import { InGameCalculatedData } from "../engine/data/inGameCalculatedData";
import { GameState } from "../engine/data/inGameState";
import { ManualTouchPhase, type ManualInputPosition } from "../engine/data/manualInput";
import { NoteResultType } from "../engine/data/manualJudgement";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import { GamePlayInputDispatcher, InputManager } from "../engine/managers/inputBoundaries";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { NoteManager, type NoteManagerClock } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import { NoteState } from "../engine/notes/noteBase";
import type { NoteSlide } from "../engine/notes/noteTypes";
import { chart, noteInformation } from "./firstSliceFixtures";

interface Graph {
  readonly input: InputManager;
  readonly dispatcher: GamePlayInputDispatcher;
  readonly manager: NoteManager;
  readonly oneFrame: InGameOneFrameJudgementController;
  readonly geometry: Geometry;
}
interface TestCase { readonly name: string; readonly run: () => void }
const tests: TestCase[] = [];
const manualMode = LIVE_MANUAL_MODE;
const origin = Object.freeze({ x: Math.fround(0), y: Math.fround(0) });
const delta = Math.fround(1 / 60);
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
class Clock implements NoteManagerClock {
  validateAdvanceSequence(): SimulatorResult<void> { return ok(undefined) }
  setExecuteFrame(): void {}
  advance(): SimulatorResult<void> { return ok(undefined) }
  canActivateBatch(): SimulatorResult<boolean> { return ok(true) }
}
class Geometry implements SimulatorManualInputGeometryBackend {
  inside = true;
  currentX = Math.fround(0);
  readonly sourceX = new Map<number, number>();
  resolveButton() { return evidenceRequired("test.resolver-unused", ["MJ20"], "unused") }
  screenToWorld(position: ManualInputPosition) {
    return ok(Object.freeze({ x: position.x, y: position.y, z: Math.fround(0) }));
  }
  getDistanceNormalization() {
    return ok(Object.freeze({ cameraScale: Math.fround(1), gameplayScale: Math.fround(1) }));
  }
  isInsideTargetButtons() { return ok(this.inside) }
  getGameplayButtonLocalY(buttonType: number) { return ok(Math.fround(buttonType)) }
  getSlideCurrentLocalY(source: NoteInformation) {
    return ok(this.sourceX.get(source.index) ?? this.currentX);
  }
  getSlideJudgeGeometry() {
    return ok(Object.freeze({
      positions: Object.freeze(Array.from({ length: 17 }, (_, index) => Math.fround(index - 8))),
      virtualPerfectLine: Math.fround(0.5),
    }));
  }
}
function child(
  index: number,
  absolutePos: number,
  gameNoteType: NoteInformation["gameNoteType"],
  terminal: boolean,
  invisible = false,
): NoteInformation {
  return {
    ...noteInformation(`slide-child-${index}`, index),
    fireNoteType: terminal ? FrontNoteType.None : FrontNoteType.SlideA,
    gameNoteType,
    buttonType: ButtonType.Button_02_BMS_1P_02,
    buttonTypes: [ButtonType.Button_02_BMS_1P_02],
    buttonTypesArray: [ButtonType.Button_02_BMS_1P_02],
    absolutePos,
    storedAbsolutePos: absolutePos,
    isInvisible: invisible,
    isSlideNoteHead: false,
    slideNoteList: [],
    afterNoteType: AfterNoteType.None,
  };
}
function slideRoot(
  children: readonly NoteInformation[],
  afterNoteType: AfterNoteTypeValue = AfterNoteType.None,
): NoteInformation {
  return {
    ...noteInformation("slide-root", 0),
    fireNoteType: FrontNoteType.SlideA,
    gameNoteType: GameNoteType.SlideA,
    buttonType: ButtonType.Button_02_BMS_1P_02,
    buttonTypes: [ButtonType.Button_02_BMS_1P_02],
    buttonTypesArray: [ButtonType.Button_02_BMS_1P_02],
    absolutePos: 2,
    storedAbsolutePos: 2,
    isSlideNoteHead: true,
    slideNoteList: children,
    afterNoteType,
  };
}
function createGraph(
  root: NoteInformation,
  extraRoots: readonly NoteInformation[] = [],
  judgementAdjustValueB = 0,
): Graph {
  const batch: NoteBatchInformation = {
    barIndex: 0, numerator: 0, denominator: 192, absolutePos: 1,
    informationList: [...extraRoots, root],
  };
  const runtimeChart = chart([batch]);
  const music = new InGameMusicScoreController(runtimeChart);
  const oneFrame = new InGameOneFrameJudgementController();
  requireOk(oneFrame.initialize(), "initialize OneFrame");
  const geometry = new Geometry();
  const manager = new NoteManager(
    [batch], new SlideNoteManager(), new Clock(), music, 0, judgementAdjustValueB,
    new InGameCalculatedData(manualMode, DEFAULT_ORIGINAL_LIVE_SETTINGS),
    () => oneFrame.getUsableOneFrameData(),
    () => evidenceRequired("test.auto-unused", ["MJ20"], "unused"),
    undefined,
    () => oneFrame.createManualJudgementTransaction(),
    geometry,
  );
  requireOk(oneFrame.registerManualJudgementOwner(
    (source) => manager.getManualJudgementOwnership(source),
  ), "register manual owner");
  requireOk(manager.execAwakeEnd(), "setup Slide manager");
  requireOk(manager.execUpdate(0), "activate Slide");
  const input = new InputManager(manualMode);
  const dispatcher = new GamePlayInputDispatcher(manager);
  requireOk(input.registerDispatcher(dispatcher), "register dispatcher");
  requireOk(input.initialize(), "initialize input");
  return { input, dispatcher, manager, oneFrame, geometry };
}
function state(value: Graph): NoteState {
  const pool = value.manager.snapshot().pools.find((candidate) => candidate.family === "slide");
  const object = pool?.objects[0]; assert(object !== undefined, "Slide object exists"); return object.state;
}
function currentIndex(value: Graph): number | null {
  const pool = value.manager.snapshot().pools.find((candidate) => candidate.family === "slide");
  return (pool?.objects[0] as ReturnType<NoteSlide["snapshot"]> | undefined)
    ?.currentAfterIndex ?? null;
}
function begin(value: Graph): void {
  const button = requireOk(value.dispatcher.getButtonForResolver(ButtonType.Button_02_BMS_1P_02), "button");
  const resolution = requireOk(value.input.issueButtonResolution(origin, button), "resolution");
  requireOk(value.input.prepareOuterFrame({ touches: [{
    fingerId: 0, phase: ManualTouchPhase.Began, position: origin,
    buttonResolution: resolution,
  }] }, delta), "Slide Began preflight");
  requireOk(value.input.execInput(GameState.PlayingSound), "Slide Began commit");
  const head = requireOk(value.oneFrame.reflectOneFrameData(), "reflect head");
  assert(head !== null, "Slide head exists");
  deep(head.entries.map((entry) => [entry.noteType, entry.phase]), [[8, "head"]], "Slide head");
}
function move(value: Graph, x = Math.fround(0)): void {
  requireOk(value.input.prepareOuterFrame({ touches: [{
    fingerId: 0, phase: ManualTouchPhase.Moved,
    position: Object.freeze({ x, y: Math.fround(0) }), buttonResolution: null,
  }] }, delta), "Slide Moved preflight");
  requireOk(value.input.execInput(GameState.PlayingSound), "Slide Moved commit");
}
function end(value: Graph): void {
  requireOk(value.input.prepareOuterFrame({ touches: [{
    fingerId: 0, phase: ManualTouchPhase.Ended, position: origin, buttonResolution: null,
  }] }, delta), "Slide Ended preflight");
  requireOk(value.input.execInput(GameState.PlayingSound), "Slide Ended commit");
}
function reflect(value: Graph) {
  const batch = requireOk(value.oneFrame.reflectOneFrameData(), "reflect Slide node");
  assert(batch !== null, "Slide node exists"); return batch.entries[0]!;
}

test("MJ04 near-line使用current local owner选择Slide而非root absolutePos", () => {
  const terminal = child(2, 4, GameNoteType.SlideEndA, true);
  const root = slideRoot([terminal]);
  const normal = {
    ...noteInformation("near-normal", 9), absolutePos: 2, storedAbsolutePos: 2,
    buttonType: ButtonType.Button_02_BMS_1P_02,
    buttonTypes: [ButtonType.Button_02_BMS_1P_02],
    buttonTypesArray: [ButtonType.Button_02_BMS_1P_02],
  };
  const value = createGraph(root, [normal]);
  value.geometry.sourceX.set(normal.index, Math.fround(-1));
  value.geometry.sourceX.set(root.index, Math.fround(2));
  begin(value);
  equal(state(value), NoteState.Stop, "near-line selected Slide head");
  const normalPool = value.manager.snapshot().pools.find((pool) => pool.family === "normal");
  equal(normalPool?.objects[0]?.state, NoteState.Move, "ordinary candidate remains active");
});

test("MJ18/MJ20 head→visible intermediate→terminal每次只推进一个cursor", () => {
  const middle = child(1, 3, GameNoteType.SlideA, false);
  const terminal = child(2, 4, GameNoteType.SlideEndA, true);
  const value = createGraph(slideRoot([middle, terminal])); begin(value);
  move(value);
  deep([reflect(value).noteType, currentIndex(value), state(value)], [8, 1, NoteState.Stop],
    "visible intermediate type8 and one cursor advance");
  move(value);
  deep([reflect(value).noteType, currentIndex(value), state(value)], [8, 0, NoteState.Deactive],
    "terminal type8 deactivates parent");
});

test("MJ20 invisible intermediate跳过containment且Great correction由owner promotion", () => {
  const middle = child(1, 3, GameNoteType.SlideA, false, true);
  const terminal = child(2, 4, GameNoteType.SlideEndA, true);
  const value = createGraph(slideRoot([middle, terminal]), [], 1); begin(value);
  value.geometry.inside = false;
  value.geometry.currentX = Math.fround(4);
  move(value);
  const entry = reflect(value);
  deep([entry.noteType, entry.rawResult, currentIndex(value)], [8, 4, 1],
    "Great band promotes to Perfect only with nonzero owner offset and signed correction");
});

test("MJ21 Flick terminal strict threshold与MJ22 early release Miss cleanup", () => {
  const flickTerminal = child(1, 3, GameNoteType.SlideEndFlickA, true);
  const flick = createGraph(slideRoot([flickTerminal], AfterNoteType.SlideFlickEnd)); begin(flick);
  move(flick, floatFromBits(0x3d23d70a));
  equal(flick.oneFrame.snapshot().inUseContainerIds.length, 0, "equal terminal threshold no result");
  move(flick, floatFromBits(0x3d23d70b));
  deep([reflect(flick).noteType, state(flick)], [8, NoteState.Deactive], "next Float32 terminal success");

  const middle = child(1, 3, GameNoteType.SlideA, false);
  const terminal = child(2, 4, GameNoteType.SlideEndA, true);
  const released = createGraph(slideRoot([middle, terminal])); begin(released); end(released);
  const missed = reflect(released);
  deep([missed.noteType, missed.rawResult, missed.judgeTiming, state(released)],
    [8, NoteResultType.Miss, 0, NoteState.Deactive], "early release current Miss cleanup");
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`ok ${passed} - ${item.name}`); }
  catch (error) { console.error(`not ok ${passed + 1} - ${item.name}`); throw error; }
}
console.log(`manual Slide judgement tests passed: ${passed}`);
