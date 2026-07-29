import {
  ButtonType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../engine/chart/types";
import { InGameCalculatedData } from "../engine/data/inGameCalculatedData";
import { GameState } from "../engine/data/inGameState";
import { ManualTouchPhase, type ManualInputButtonResolution } from "../engine/data/manualInput";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import {
  GamePlayInputDispatcher,
  InputManager,
} from "../engine/managers/inputBoundaries";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import {
  NoteManager,
  type NoteManagerClock,
} from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import {
  NoteBase,
  type ManualNoteTouchInput,
} from "../engine/notes/noteBase";
import { chart, noteInformation } from "./firstSliceFixtures";

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];
const manualPlayMode = { kind: "manual" } as const;
const positionA = Object.freeze({ x: Math.fround(580), y: Math.fround(650) });
const positionB = Object.freeze({ x: Math.fround(940), y: Math.fround(650) });

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  assert(left === right, `${message}: ${left} !== ${right}`);
}

function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  assert(result.status === "ok", `${message}: ${result.status}`);
  return result.value;
}

function requireEvidence<T>(result: SimulatorResult<T>, capability: string): void {
  assert(result.status === "evidence-required", `${capability}: ${result.status}`);
  assertEqual(result.capability, capability, "failure capability");
}

class ManualDispatchClock implements NoteManagerClock {
  validateAdvanceSequence(): SimulatorResult<void> {
    return ok(undefined);
  }

  setExecuteFrame(): void {}

  advance(): SimulatorResult<void> {
    return ok(undefined);
  }

  canActivateBatch(): SimulatorResult<boolean> {
    return ok(true);
  }
}

type BeganDecision = "bind" | "none" | "reject";

class ManualDispatchNote extends NoteBase {
  readonly preflightPhases: number[] = [];
  readonly committedPhases: number[] = [];

  constructor(
    poolObjectId: string,
    private readonly beganDecision: BeganDecision,
  ) {
    super(poolObjectId);
  }

  override preflightManualTouchBegan(input: ManualNoteTouchInput) {
    this.preflightPhases.push(input.phase);
    return this.beganDecision === "reject"
      ? evidenceRequired(
          "test.manual-family-rejected",
          ["D15", "MJ26"],
          "later family rejection",
        )
      : ok(Object.freeze({
          outcome: this.beganDecision,
          judgementPlan: null,
          familyData: null,
        }));
  }

  override commitManualTouchBegan(input: ManualNoteTouchInput): void {
    this.committedPhases.push(input.phase);
  }

  override preflightManualTouchMoved(input: ManualNoteTouchInput) {
    this.preflightPhases.push(input.phase);
    return ok(Object.freeze({ judgementPlan: null, familyData: null }));
  }

  override commitManualTouchMoved(input: ManualNoteTouchInput): void {
    this.committedPhases.push(input.phase);
  }

  override preflightManualTouchEnded(input: ManualNoteTouchInput) {
    this.preflightPhases.push(input.phase);
    return ok(Object.freeze({ judgementPlan: null, familyData: null }));
  }

  override commitManualTouchEnded(input: ManualNoteTouchInput): void {
    this.committedPhases.push(input.phase);
    this.setFingerId(-1);
  }

  protected override moveState(): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override waitState(): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override stopState(): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override onUpdate(): SimulatorResult<void> {
    return ok(undefined);
  }

  override executeAfterUpdate(): SimulatorResult<void> {
    return ok(undefined);
  }
}

interface DispatchGraph {
  readonly manager: NoteManager;
  readonly input: InputManager;
  readonly dispatcher: GamePlayInputDispatcher;
  readonly notes: readonly ManualDispatchNote[];
}

function createDispatchGraph(
  sources: readonly NoteInformation[],
  decisions: readonly BeganDecision[],
): DispatchGraph {
  const batch: NoteBatchInformation = {
    barIndex: 0,
    numerator: 0,
    denominator: 192,
    absolutePos: 1,
    informationList: sources,
  };
  const runtimeChart = chart([batch]);
  const music = new InGameMusicScoreController(runtimeChart);
  const oneFrame = new InGameOneFrameJudgementController();
  requireOk(oneFrame.initialize(), "initialize dispatch OneFrame");
  const notes: ManualDispatchNote[] = [];
  const manager = new NoteManager(
    [batch],
    new SlideNoteManager(),
    new ManualDispatchClock(),
    music,
    0,
    0,
    new InGameCalculatedData(manualPlayMode),
    () => oneFrame.getUsableOneFrameData(),
    () => evidenceRequired("test.auto-live-not-used", ["D04"], "not used"),
    (_family, poolObjectId) => {
      const decision = decisions[notes.length] ?? "bind";
      const note = new ManualDispatchNote(poolObjectId, decision);
      notes.push(note);
      return note;
    },
  );
  requireOk(manager.execAwakeEnd(), "setup dispatch NoteManager");
  requireOk(manager.execUpdate(0), "activate dispatch batch");

  const input = new InputManager(manualPlayMode);
  const dispatcher = new GamePlayInputDispatcher(manager);
  requireOk(input.registerDispatcher(dispatcher), "register gameplay dispatcher");
  requireOk(input.initialize(), "initialize dispatch InputManager");
  return { manager, input, dispatcher, notes };
}

function source(
  id: string,
  index: number,
  buttonTypes: readonly ButtonTypeValue[],
  absolutePos = 0,
): NoteInformation {
  const base = noteInformation(id, index);
  const typedButtons = [...buttonTypes] as NoteInformation["buttonTypes"];
  return {
    ...base,
    buttonType: typedButtons[0] ?? ButtonType.Button_01_BMS_1P_01,
    buttonTypes: typedButtons,
    buttonTypesArray: [...typedButtons],
    absolutePos,
    storedAbsolutePos: absolutePos,
  };
}

function resolution(
  graph: DispatchGraph,
  buttonType: ButtonTypeValue,
  position = positionA,
): ManualInputButtonResolution {
  const button = requireOk(
    graph.dispatcher.getButtonForResolver(buttonType),
    "get owner button",
  );
  return requireOk(
    graph.input.issueButtonResolution(position, button),
    "issue owner button resolution",
  );
}

function began(
  fingerId: number,
  buttonResolution: ManualInputButtonResolution,
  position = positionA,
) {
  return {
    fingerId,
    phase: ManualTouchPhase.Began,
    position,
    buttonResolution,
  } as const;
}

function continuation(fingerId: number, phase: 1 | 2 | 3, position = positionA) {
  return {
    fingerId,
    phase,
    position,
    buttonResolution: null,
  } as const;
}

test("MJ03 equal distance严格小于保留首个active", () => {
  const graph = createDispatchGraph([
    source("first", 0, [ButtonType.Button_01_BMS_1P_01]),
    source("second", 1, [ButtonType.Button_01_BMS_1P_01]),
  ], ["bind", "bind"]);
  const cap = resolution(graph, ButtonType.Button_01_BMS_1P_01);
  requireOk(graph.input.prepareOuterFrame({ touches: [began(0, cap)] }), "preflight tie");
  assertEqual(graph.notes[0]?.fingerId, -1, "preflight does not bind first note");
  requireOk(graph.input.execInput(GameState.PlayingSound), "commit tie");
  assertEqual(graph.notes[0]?.fingerId, 0, "first active wins equal distance");
  assertEqual(graph.notes[1]?.fingerId, -1, "equal candidate does not replace first");
  assertDeepEqual(graph.notes.map((note) => note.committedPhases), [[0], []],
    "only first active receives Began commit");
});

test("MJ05 wide containment与MJ06同帧双指竞争保持首个owner", () => {
  const graph = createDispatchGraph([
    source("wide", 0, [
      ButtonType.Button_01_BMS_1P_01,
      ButtonType.Button_02_BMS_1P_02,
    ]),
  ], ["bind"]);
  const first = resolution(graph, ButtonType.Button_01_BMS_1P_01, positionA);
  const second = resolution(graph, ButtonType.Button_02_BMS_1P_02, positionB);
  requireOk(graph.input.prepareOuterFrame({
    touches: [began(0, first, positionA), began(1, second, positionB)],
  }), "preflight two-finger competition");
  assertEqual(graph.notes[0]?.fingerId, -1, "whole frame remains pure before dispatch");
  requireOk(graph.input.execInput(GameState.PlayingSound), "commit two-finger competition");
  assertEqual(graph.notes[0]?.fingerId, 0, "first touch owns wide note");
  assertDeepEqual(graph.notes[0]?.preflightPhases, [0, 0],
    "both contenders execute pure judgement before finger check");
  assertDeepEqual(graph.notes[0]?.committedPhases, [0], "second contender does not commit");
  const owner = graph.dispatcher.snapshot();
  assertDeepEqual(owner.buttonWithFingerId.slice(0, 2), [1, 2],
    "each finger retains its resolved button owner");
  assertEqual(owner.buttons[1]?.touchOwners[0]?.noteIndex, 0,
    "first button retains wide note owner");
  assertEqual(owner.buttons[2]?.touchOwners.length, 0,
    "second button does not retain already-owned note");
});

test("MJ07 Moved Stationary Ended复用Began button和note", () => {
  const graph = createDispatchGraph([
    source("continuation", 0, [ButtonType.Button_01_BMS_1P_01]),
  ], ["bind"]);
  const cap = resolution(graph, ButtonType.Button_01_BMS_1P_01);
  requireOk(graph.input.prepareOuterFrame({ touches: [began(0, cap)] }), "prepare Began");
  requireOk(graph.input.execInput(GameState.PlayingSound), "commit Began");
  for (const phase of [
    ManualTouchPhase.Moved,
    ManualTouchPhase.Stationary,
    ManualTouchPhase.Ended,
  ] as const) {
    requireOk(graph.input.prepareOuterFrame({ touches: [continuation(0, phase)] }),
      `prepare continuation ${phase}`);
    requireOk(graph.input.execInput(GameState.PlayingSound), `commit continuation ${phase}`);
  }
  assertDeepEqual(graph.notes[0]?.committedPhases, [0, 1, 3],
    "Stationary preserves ownership without calling the concrete Moved virtual");
  assertEqual(graph.notes[0]?.fingerId, -1, "Ended concrete owner clears note finger");
  assertDeepEqual(graph.dispatcher.snapshot().buttonWithFingerId.slice(0, 1), [1],
    "InputManager button owner is reused rather than rebound");
});

test("None judgement不绑定note但保留Began button owner", () => {
  const graph = createDispatchGraph([
    source("none", 0, [ButtonType.Button_01_BMS_1P_01]),
  ], ["none"]);
  const cap = resolution(graph, ButtonType.Button_01_BMS_1P_01);
  requireOk(graph.input.prepareOuterFrame({ touches: [began(0, cap)] }), "prepare None");
  requireOk(graph.input.execInput(GameState.PlayingSound), "commit None");
  assertEqual(graph.notes[0]?.fingerId, -1, "None does not bind note finger");
  assertDeepEqual(graph.notes[0]?.committedPhases, [], "None does not call family commit");
  assertDeepEqual(graph.dispatcher.snapshot().buttonWithFingerId.slice(0, 1), [1],
    "resolved button remains finger owner");
});

test("foreign button与later family failure保持全帧零mutation", () => {
  const graph = createDispatchGraph([
    source("first", 0, [ButtonType.Button_01_BMS_1P_01]),
    source("later", 1, [ButtonType.Button_02_BMS_1P_02]),
  ], ["bind", "reject"]);
  const first = resolution(graph, ButtonType.Button_01_BMS_1P_01, positionA);
  const second = resolution(graph, ButtonType.Button_02_BMS_1P_02, positionB);
  const before = graph.input.snapshot();
  requireEvidence(graph.input.prepareOuterFrame({
    touches: [began(0, first, positionA), began(1, second, positionB)],
  }), "test.manual-family-rejected");
  assertDeepEqual(graph.input.snapshot(), before, "later family failure consumes no resolution");
  assertDeepEqual(graph.dispatcher.snapshot().buttonWithFingerId.slice(0, 2), [null, null],
    "later family failure writes no finger button owner");
  assertDeepEqual(graph.notes.map((note) => note.fingerId), [-1, -1],
    "later family failure writes no note owner");

  const otherGraph = createDispatchGraph([], []);
  const foreignButton = requireOk(
    otherGraph.dispatcher.getButtonForResolver(ButtonType.Button_01_BMS_1P_01),
    "get foreign button",
  );
  const foreignCap = requireOk(
    graph.input.issueButtonResolution(positionA, foreignButton),
    "issue structurally valid foreign button",
  );
  const foreignBefore = graph.input.snapshot();
  requireEvidence(graph.input.prepareOuterFrame({ touches: [began(2, foreignCap)] }),
    "input.foreign-game-play-button");
  assertDeepEqual(graph.input.snapshot(), foreignBefore, "foreign button zero mutation");
});

let passed = 0;
for (const testCase of tests) {
  try {
    testCase.run();
    passed += 1;
    console.log(`ok ${passed} - ${testCase.name}`);
  } catch (error) {
    console.error(`not ok ${passed + 1} - ${testCase.name}`);
    throw error;
  }
}
console.log(`manual input dispatch tests passed: ${passed}`);
