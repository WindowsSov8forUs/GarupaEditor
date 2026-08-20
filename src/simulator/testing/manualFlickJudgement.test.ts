import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import { LIVE_MANUAL_MODE } from "./modeFixtures";
import type { SimulatorManualInputGeometryBackend } from "../backends/contracts";
import {
  ButtonType,
  FrontNoteType,
  type NoteBatchInformation,
  type NoteInformation,
} from "../engine/chart/types";
import { InGameCalculatedData } from "../engine/data/inGameCalculatedData";
import { GameState } from "../engine/data/inGameState";
import { ManualTouchPhase } from "../engine/data/manualInput";
import { NoteResultType } from "../engine/data/manualJudgement";
import { ok, type SimulatorResult } from "../engine/evidence";
import { GamePlayInputDispatcher, InputManager } from "../engine/managers/inputBoundaries";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { NoteManager, type NoteManagerClock } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import { NoteState } from "../engine/notes/noteBase";
import { chart, noteInformation } from "./firstSliceFixtures";

interface TestCase { readonly name: string; readonly run: () => void }
interface FlickGraph {
  readonly input: InputManager;
  readonly dispatcher: GamePlayInputDispatcher;
  readonly manager: NoteManager;
  readonly oneFrame: InGameOneFrameJudgementController;
  readonly geometry: IdentityGeometry;
}
const tests: TestCase[] = [];
const manualMode = LIVE_MANUAL_MODE;
const beganPosition = Object.freeze({ x: Math.fround(0), y: Math.fround(0) });

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
function bits(value: number): number {
  const data = new ArrayBuffer(4); const view = new DataView(data);
  view.setUint32(0, value, true); return view.getFloat32(0, true);
}

class Clock implements NoteManagerClock {
  validateAdvanceSequence(): SimulatorResult<void> { return ok(undefined) }
  setExecuteFrame(): void {}
  advance(): SimulatorResult<void> { return ok(undefined) }
  canActivateBatch(): SimulatorResult<boolean> { return ok(true) }
}

class IdentityGeometry implements SimulatorManualInputGeometryBackend {
  screenToWorldCalls = 0;
  resolveButton() { return ok(ButtonType.Button_01_BMS_1P_01) }
  screenToWorld(position: { readonly x: number; readonly y: number }) {
    this.screenToWorldCalls += 1;
    return ok(Object.freeze({ x: position.x, y: position.y, z: Math.fround(0) }));
  }
  getDistanceNormalization() {
    return ok(Object.freeze({ cameraScale: Math.fround(1), gameplayScale: Math.fround(1) }));
  }
  isInsideTargetButtons() { return ok(true) }
}

function source(
  family: "flick" | "directional",
  gameNoteType: NoteInformation["gameNoteType"] = family === "directional" ? 10 : 2,
): NoteInformation {
  const base = noteInformation(family, 0);
  return {
    ...base,
    fireNoteType: family === "flick" ? FrontNoteType.Flick : FrontNoteType.DirectionalFlick,
    gameNoteType,
    buttonType: ButtonType.Button_01_BMS_1P_01,
    buttonTypes: [ButtonType.Button_01_BMS_1P_01],
    buttonTypesArray: [ButtonType.Button_01_BMS_1P_01],
    absolutePos: 2,
    storedAbsolutePos: 2,
  };
}

function graph(information: NoteInformation): FlickGraph {
  const batch: NoteBatchInformation = {
    barIndex: 0, numerator: 0, denominator: 192, absolutePos: 1,
    informationList: [information],
  };
  const runtimeChart = chart([batch]);
  const music = new InGameMusicScoreController(runtimeChart);
  const oneFrame = new InGameOneFrameJudgementController();
  requireOk(oneFrame.initialize(), "initialize OneFrame");
  const geometry = new IdentityGeometry();
  const manager = new NoteManager(
    [batch], new SlideNoteManager(), new Clock(), music, 0, 0,
    new InGameCalculatedData(manualMode, DEFAULT_ORIGINAL_LIVE_SETTINGS),
    () => oneFrame.getUsableOneFrameData(),
    () => { throw new Error("manual test cannot submit Auto Live") },
    undefined,
    () => oneFrame.createManualJudgementTransaction(),
    geometry,
  );
  requireOk(oneFrame.registerManualJudgementOwner(
    (candidate) => manager.getManualJudgementOwnership(candidate),
  ), "register manual owner");
  requireOk(manager.execAwakeEnd(), "setup manager");
  requireOk(manager.execUpdate(0), "activate Flick");
  const input = new InputManager(manualMode);
  const dispatcher = new GamePlayInputDispatcher(manager);
  requireOk(input.registerDispatcher(dispatcher), "register dispatcher");
  requireOk(input.initialize(), "initialize input");
  return { input, dispatcher, manager, oneFrame, geometry };
}

function dispatchBegan(value: FlickGraph): void {
  const button = requireOk(value.dispatcher.getButtonForResolver(
    ButtonType.Button_01_BMS_1P_01,
  ), "get button");
  const resolution = requireOk(value.input.issueButtonResolution(beganPosition, button), "issue button");
  requireOk(value.input.prepareOuterFrame({ touches: [{
    fingerId: 0, phase: ManualTouchPhase.Began, position: beganPosition,
    buttonResolution: resolution,
  }] }), "preflight Began");
  requireOk(value.input.execInput(GameState.PlayingSound), "commit Began");
}

function dispatchContinuation(
  value: FlickGraph,
  phase: typeof ManualTouchPhase.Moved | typeof ManualTouchPhase.Stationary | typeof ManualTouchPhase.Ended,
  x: number,
): void {
  requireOk(value.input.prepareOuterFrame({ touches: [{
    fingerId: 0, phase, position: Object.freeze({ x, y: Math.fround(0) }),
    buttonResolution: null,
  }] }), `preflight continuation ${phase}`);
  requireOk(value.input.execInput(GameState.PlayingSound), `commit continuation ${phase}`);
}

function noteState(value: FlickGraph): NoteState {
  const object = value.manager.snapshot().pools.flatMap((pool) => pool.objects)[0];
  assert(object !== undefined, "pooled Flick exists"); return object.state;
}

for (const [name, rate, complete] of [
  ["before", bits(0x3d23d709), false],
  ["equal", bits(0x3d23d70a), false],
  ["after", bits(0x3d23d70b), true],
] as const) {
  test(`MJ08 Flick ${name} strict > 0.04`, () => {
    const value = graph(source("flick")); dispatchBegan(value);
    equal(noteState(value), NoteState.Wait, "Began caches and enters Wait");
    equal(value.oneFrame.snapshot().inUseContainerIds.length, 0, "Began emits no OneFrame");
    dispatchContinuation(value, ManualTouchPhase.Moved, rate);
    equal(noteState(value), complete ? NoteState.Deactive : NoteState.Wait, "Flick threshold state");
    equal(value.oneFrame.snapshot().inUseContainerIds.length, complete ? 1 : 0, "Flick threshold slot");
    if (complete) {
      const reflected = requireOk(value.oneFrame.reflectOneFrameData(), "reflect Flick");
      assert(reflected !== null, "Flick reflection exists");
      equal(reflected.entries[0]?.noteType, 3, "Flick note type");
      equal(reflected.entries[0]?.rawResult, NoteResultType.Perfect, "cached Began result");
    }
  });
}

test("MJ09 Directional先方向再strict horizontal > 0.01", () => {
  const wrong = graph(source("directional", 10)); dispatchBegan(wrong);
  dispatchContinuation(wrong, ManualTouchPhase.Moved, bits(0x3c23d70b));
  equal(noteState(wrong), NoteState.Wait, "left source rejects right movement");
  equal(wrong.geometry.screenToWorldCalls, 2, "wrong direction still computes first full rate only");

  for (const [rate, complete] of [
    [Math.fround(-bits(0x3c23d70a)), false], [Math.fround(-bits(0x3c23d70b)), true],
  ] as const) {
    const value = graph(source("directional", 10)); dispatchBegan(value);
    dispatchContinuation(value, ManualTouchPhase.Moved, rate);
    equal(noteState(value), complete ? NoteState.Deactive : NoteState.Wait,
      "Directional horizontal threshold state");
    equal(value.geometry.screenToWorldCalls, 4,
      "correct direction computes full then horizontal rate");
    if (complete) {
      const reflected = requireOk(value.oneFrame.reflectOneFrameData(), "reflect Directional");
      assert(reflected !== null, "Directional reflection exists");
      equal(reflected.entries[0]?.noteType, 9, "Directional note type");
    }
  }
});

test("Stationary不调用note且Ended确认空virtual保留Wait owner", () => {
  const value = graph(source("flick")); dispatchBegan(value);
  dispatchContinuation(value, ManualTouchPhase.Stationary, Math.fround(1));
  equal(value.geometry.screenToWorldCalls, 0, "Stationary jump-table branch calls no movement geometry");
  dispatchContinuation(value, ManualTouchPhase.Ended, Math.fround(1));
  equal(noteState(value), NoteState.Wait, "base Ended direct ret leaves Flick Wait");
  equal(value.oneFrame.snapshot().inUseContainerIds.length, 0, "Stationary/Ended emit no result");
});

test("Flick Wait >=7 execute frames走owner synthetic Perfect", () => {
  const value = graph(source("flick")); dispatchBegan(value);
  const poolObject = value.manager.snapshot().activeNotePoolObjectIds[0];
  assert(poolObject !== undefined, "Flick active before Wait update");
  requireOk(value.manager.execUpdate(Math.fround(6 / 60)), "six execute frames");
  equal(noteState(value), NoteState.Wait, "six frames remain Wait");
  requireOk(value.manager.execUpdate(Math.fround(1 / 60)), "seventh execute frame");
  equal(noteState(value), NoteState.Deactive, "seventh frame synthetic completes");
  const reflected = requireOk(value.oneFrame.reflectOneFrameData(), "reflect synthetic Flick");
  assert(reflected !== null, "synthetic Flick reflection exists");
  deep(reflected.entries.map((entry) => [entry.noteType, entry.rawResult]), [[3, 4]],
    "synthetic owner emits type3 Perfect");
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`ok ${passed} - ${item.name}`); }
  catch (error) { console.error(`not ok ${passed + 1} - ${item.name}`); throw error; }
}
console.log(`manual Flick judgement tests passed: ${passed}`);
