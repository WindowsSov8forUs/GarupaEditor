import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import type { NoteBatchInformation } from "../engine/chart/types";
import type { OneFrameDataHandle } from "../engine/data/oneFrameData";
import {
  GameState,
  isPausedState,
  PauseState,
  type GameStateValue,
} from "../engine/data/inGameState";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import { InGameDirector } from "../engine/managers/inGameDirector";
import { InGameManager } from "../engine/managers/inGameManager";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameCalculatedData } from "../engine/data/inGameCalculatedData";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { GamePlayButton, InputManager } from "../engine/managers/inputBoundaries";
import {
  NoteManager,
  selectSubstepCount,
  type NoteManagerClock,
} from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import { NoteBase, NoteState } from "../engine/notes/noteBase";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import {
  chart,
  engineInput,
  noteBatch,
  noteInformation,
  testingNoteId,
} from "./firstSliceFixtures";

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];
const autoPlayMode = {
  kind: "auto-live",
  resultTransform: "identity-no-active-situation-skill",
} as const;

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

class FakeClock implements NoteManagerClock {
  readonly advances: number[] = [];
  readonly executeFrames: number[] = [];
  activateBatch = true;

  validateAdvanceSequence(
    _deltaTimeSeconds: number,
    _substepCount: number,
  ): SimulatorResult<void> {
    return ok(undefined);
  }

  setExecuteFrame(executeFrame: number): void {
    this.executeFrames.push(executeFrame);
  }

  advance(deltaTimeSeconds: number): SimulatorResult<void> {
    this.advances.push(deltaTimeSeconds);
    return ok(undefined);
  }

  canActivateBatch(_batch: NoteBatchInformation): SimulatorResult<boolean> {
    return ok(this.activateBatch);
  }
}

class TraceInputManager extends InputManager {
  readonly states: number[] = [];

  override execInput(currentGameState: GameStateValue): SimulatorResult<void> {
    this.states.push(currentGameState);
    return ok(undefined);
  }
}

class TraceNote extends NoteBase {
  constructor(
    poolObjectId: string,
    private readonly calls: string[],
    private readonly deactivateOnUpdate: ReadonlySet<string>,
  ) {
    super(poolObjectId);
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
    const id = testingNoteId(this.noteInformation);
    this.calls.push(`update:${id}`);
    return this.deactivateOnUpdate.has(id)
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }

  override executeAfterUpdate(): SimulatorResult<void> {
    this.calls.push(`after:${testingNoteId(this.noteInformation)}`);
    return ok(undefined);
  }
}

interface TestGraph {
  readonly clock: FakeClock;
  readonly music: InGameMusicScoreController;
  readonly controller: InGameOneFrameJudgementController;
  readonly manager: NoteManager;
  readonly calls: string[];
  readonly notes: TraceNote[];
}

function createTestGraph(
  noteIds: readonly string[],
  deactivateOnUpdate: ReadonlySet<string> = new Set<string>(),
  bpmChangeCount = 1,
): TestGraph {
  const calls: string[] = [];
  const notes: TraceNote[] = [];
  const clock = new FakeClock();
  const runtimeChart = chart([]);
  const music = new InGameMusicScoreController(runtimeChart);
  const controller = new InGameOneFrameJudgementController();
  requireOk(controller.initialize(), "initialize OneFrameData controller");
  const manager = new NoteManager(
    [noteBatch(noteIds)],
    new SlideNoteManager(),
    clock,
    music,
    bpmChangeCount,
    0,
    new InGameCalculatedData({ kind: "manual" }),
    () => controller.getUsableOneFrameData(),
    () => evidenceRequired("test.auto-live-not-used", ["R04"], "not used"),
    (_family, poolObjectId) => {
      const note = new TraceNote(poolObjectId, calls, deactivateOnUpdate);
      notes.push(note);
      return note;
    },
  );
  requireOk(manager.execAwakeEnd(), "initialize NoteManager");
  return { clock, music, controller, manager, calls, notes };
}

test("管理器对象图保持单一所有者和原作帧入口", () => {
  const graph = createTestGraph(["A", "B"]);
  const input = new InputManager(autoPlayMode);
  const inGame = new InGameManager(graph.music, graph.manager, graph.controller, input);
  const backends = createRecordingSimulatorBackends();
  const director = new InGameDirector(inGame, false, backends.frameRate);
  assert(director.inGameManager === inGame, "director owner");
  assertDeepEqual(director.snapshot(), {
    playerLoopNode: "Update.ScriptRunBehaviourUpdate",
    callback: "InGameDirector.Update",
    target: "InGameManager.ExecUpdate",
    awakeComplete: false,
    requestedTargetFrameRate: null,
  }, "director snapshot");
  const poolIds = graph.manager.snapshot().pools.flatMap((pool) =>
    pool.objects.map((object) => object.poolObjectId));
  assertEqual(new Set(poolIds).size, poolIds.length, "pool object identities");
});

test("宿主生命周期幂等并只在 Awake 请求一次目标帧率", () => {
  const backends = createRecordingSimulatorBackends();
  const engine = requireOk(createSimulatorEngine(engineInput(), backends), "create engine");
  requireOk(engine.initialize(), "initialize");
  requireOk(engine.initialize(), "initialize twice");
  requireOk(engine.pause(), "pause");
  requireOk(engine.pause(), "pause twice");
  requireOk(engine.resume(), "resume");
  requireOk(engine.resume(), "resume twice");
  requireOk(engine.dispose(), "dispose");
  assertDeepEqual(requireOk(engine.snapshot(), "snapshot").backendTrace, [
    { sequence: 0, backend: "frame-rate", action: "request-target-frame-rate", detail: "60" },
    { sequence: 1, backend: "lifecycle", action: "state", detail: "paused" },
    { sequence: 2, backend: "lifecycle", action: "state", detail: "running" },
  ], "backend trace");
});

test("四档严格阈值选择 1 至 4 子步", () => {
  const counters: [number, number, number, number] = [0, 0, 0, 0];
  assertEqual(selectSubstepCount(0.017999, 1, counters), 1, "bucket 0");
  assertEqual(selectSubstepCount(0.018, 1, counters), 2, "bucket 1");
  assertEqual(selectSubstepCount(0.033, 1, counters), 3, "bucket 2");
  assertEqual(selectSubstepCount(0.05, 1, counters), 4, "bucket 3");
});

test("101 21 6 回退比较 counter 1 2 3 而 counter 0 只记录", () => {
  const bucket0: [number, number, number, number] = [0, 0, 0, 0];
  for (let index = 0; index < 150; index += 1) {
    assertEqual(selectSubstepCount(0.01, 1, bucket0), 1, "bucket 0 remains one");
  }
  assertDeepEqual(bucket0, [150, 0, 0, 0], "bucket 0 history");

  const bucket1: [number, number, number, number] = [0, 0, 0, 0];
  for (let index = 0; index < 100; index += 1) {
    assertEqual(selectSubstepCount(0.02, 1, bucket1), 2, "bucket 1 before threshold");
  }
  assertEqual(selectSubstepCount(0.02, 1, bucket1), 1, "counter 1 at 101");

  const bucket2: [number, number, number, number] = [0, 0, 0, 0];
  for (let index = 0; index < 20; index += 1) {
    assertEqual(selectSubstepCount(0.04, 1, bucket2), 3, "bucket 2 before threshold");
  }
  assertEqual(selectSubstepCount(0.04, 1, bucket2), 1, "counter 2 at 21");

  const bucket3: [number, number, number, number] = [0, 0, 0, 0];
  for (let index = 0; index < 5; index += 1) {
    assertEqual(selectSubstepCount(0.05, 1, bucket3), 4, "bucket 3 before threshold");
  }
  assertEqual(selectSubstepCount(0.05, 1, bucket3), 1, "counter 3 at 6");
});

test("无 BPM 变化时固定单步且不更新计数器", () => {
  const counters: [number, number, number, number] = [0, 0, 0, 0];
  assertEqual(selectSubstepCount(0.05, 0, counters), 1, "single step gate");
  assertDeepEqual(counters, [0, 0, 0, 0], "frozen counters");
});

test("双时钟按 192 刻度推进并执行单次 carry", () => {
  const controller = new InGameMusicScoreController(chart([], 120));
  assertEqual(controller.snapshot().launcherBeatProgress, 96, "launcher lead");
  requireOk(controller.advance(1), "advance");
  let snapshot = controller.snapshot();
  assertEqual(snapshot.beatProgress, 96, "main beat");
  assertEqual(snapshot.launcherBar, 1, "launcher bar");
  assertEqual(snapshot.launcherBeatProgress, 0, "launcher remainder");
  requireOk(controller.advance(10), "large advance");
  snapshot = controller.snapshot();
  assertEqual(snapshot.bar, 1, "large delta carries only once");
  assert(snapshot.beatProgress > 192, "large delta retains overflow above one bar");
});

test("批次使用主时钟开区间与 launcher 闭区间", () => {
  const controller = new InGameMusicScoreController(chart([], 120));
  assertEqual(requireOk(controller.canActivateBatch(noteBatch(["A"], 96)), "at lead"), true, "closed launcher boundary");
  assertEqual(requireOk(controller.canActivateBatch(noteBatch(["A"], 0)), "at current"), false, "open current boundary");
});

test("最终子步数同时平分 delta 与 ExecuteFrame", () => {
  const graph = createTestGraph([]);
  requireOk(graph.manager.execUpdate(0.05), "four substeps");
  assertEqual(graph.clock.advances.length, 4, "advance count");
  assertDeepEqual(graph.clock.executeFrames, [0.25], "execute frame division");
});

test("informationList 原序激活并在下一子步反序 Update 与 AfterUpdate", () => {
  const graph = createTestGraph(["C", "A", "B"]);
  requireOk(graph.manager.execUpdate(0.01), "activation substep");
  assertDeepEqual(graph.calls, [], "activation delay");
  requireOk(graph.manager.execUpdate(0.01), "active substep");
  assertDeepEqual(graph.calls, [
    "update:B", "update:A", "update:C", "after:B", "after:A", "after:C",
  ], "two-phase order");
});

test("Update 中 Deactive 对象即时移除且不进入 AfterUpdate", () => {
  const graph = createTestGraph(["A", "B", "C"], new Set(["B"]));
  requireOk(graph.manager.execUpdate(0.01), "activation");
  requireOk(graph.manager.execUpdate(0.01), "update");
  assertDeepEqual(graph.calls, [
    "update:C", "update:B", "update:A", "after:C", "after:A",
  ], "survivor order");
  assertEqual(graph.manager.snapshot().activeNotePoolObjectIds.length, 2, "active count");
});

test("暂停冻结调度状态并在恢复后原位续跑", () => {
  const graph = createTestGraph([]);
  const inGame = new InGameManager(
    graph.music,
    graph.manager,
    graph.controller,
    new InputManager(autoPlayMode),
  );
  requireOk(inGame.initialize(), "initialize");
  requireOk(inGame.execUpdate(0.01), "before pause");
  requireOk(inGame.pause(), "pause");
  const frozen = inGame.snapshot();
  requireOk(inGame.execUpdate(0.05), "paused host frame");
  assertDeepEqual(inGame.snapshot(), frozen, "frozen state");
  requireOk(inGame.resume(), "resume");
  requireOk(inGame.execUpdate(0.01), "after resume");
  assertEqual(graph.clock.advances.length, 2, "no catch-up");
});

test("暂停门覆盖原作 GameState 与 PauseState 数值", () => {
  assert(!isPausedState(GameState.PlayingSound, PauseState.None), "playing");
  assert(isPausedState(GameState.PlayingSound, PauseState.Pause), "pause request");
  assert(isPausedState(GameState.PlayingSound, PauseState.Resume), "resume countdown");
  assert(isPausedState(GameState.PauseNone, PauseState.None), "PauseNone");
  assert(isPausedState(GameState.PauseSound, PauseState.None), "PauseSound");
});

test("PauseSound 保留输入分派但阻断 NoteManager", () => {
  const graph = createTestGraph([]);
  const input = new TraceInputManager(autoPlayMode);
  const inGame = new InGameManager(graph.music, graph.manager, graph.controller, input);
  requireOk(inGame.initialize(), "initialize");
  requireOk(inGame.execUpdate(0.01), "playing");
  requireOk(inGame.pause(), "pause");
  requireOk(inGame.execUpdate(0.01), "paused");
  assertDeepEqual(input.states, [GameState.PlayingSound, GameState.PauseSound], "input states");
  assertEqual(graph.clock.advances.length, 1, "note scheduling blocked");
});

test("OneFrame 容器统一获取 Reflect 与回收", () => {
  const controller = new InGameOneFrameJudgementController();
  requireOk(controller.registerAutoLiveJudgementOwner(() => ({
    multipleDirectionalFlickNoteCount: null,
  })), "register judgement owner");
  requireOk(controller.initialize(), "initialize");
  for (let index = 0; index < 5; index += 1) {
    const handle = requireOk(controller.getUsableOneFrameData(), `slot ${index}`);
    const source = {
      ...noteInformation(`one-frame-${index}`, index),
      absolutePos: index,
      storedAbsolutePos: index,
    };
    requireOk(controller.setupAutoLiveJudgementData(handle, {
      noteInformation: source,
      phase: "head",
      noteType: 0,
      absolutePosition: source.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    }), `setup ${index}`);
  }
  assertEqual(controller.getUsableOneFrameData().status, "evidence-required", "pool exhaustion");
  const batch = requireOk(controller.reflectOneFrameData(), "reflect");
  assert(batch !== null, "non-empty reflect batch");
  assertDeepEqual(batch.entries.map((entry) => entry.containerId),
    ["one-frame:0", "one-frame:1", "one-frame:2", "one-frame:3", "one-frame:4"],
    "reflect order");
});

test("Note 只通过 SetupNotes 安装的回调请求 OneFrame 容器", () => {
  const graph = createTestGraph(["A"]);
  const handle: OneFrameDataHandle = requireOk(graph.notes[0]!.requestUsableOneFrameData(), "callback");
  assertEqual(handle.containerId, "one-frame:0", "container");
  assertEqual(new TraceNote("detached", [], new Set()).requestUsableOneFrameData().status,
    "evidence-required", "unregistered callback");
});

test("未登记 chart、越界 offset 与触摸失败关闭且 manual 不强制判定", () => {
  const valid = engineInput();
  const cloned = { ...valid, chart: { ...valid.chart } };
  assertEqual(createSimulatorEngine(cloned, createRecordingSimulatorBackends()).status,
    "evidence-required", "cloned chart");
  const invalidOffset = { ...valid, runtime: { ...valid.runtime, judgeOffsetFrames: 6 } };
  assertEqual(createSimulatorEngine(invalidOffset, createRecordingSimulatorBackends()).status,
    "evidence-required", "offset range");
  assertEqual(new GamePlayButton().execTouchBegan().status, "evidence-required", "touch boundary");

  const noteEngine = requireOk(createSimulatorEngine(engineInput([noteBatch(["A"], 1)]),
    createRecordingSimulatorBackends()), "note engine");
  requireOk(noteEngine.initialize(), "initialize note engine");
  requireOk(noteEngine.step(0.01, { touches: [] }), "activation frame");
  assertEqual(noteEngine.step(0.01, { touches: [] }).status, "evidence-required",
    "manual AfterUpdate remains outside Auto Live");
  const manualSnapshot = requireOk(noteEngine.snapshot(), "manual snapshot");
  assertEqual(manualSnapshot.managers.oneFrame.inUseContainerIds.length, 0,
    "manual creates no Auto Live OneFrame payload");
});

test("120 模式请求、快照与 dispose 保持确定", () => {
  const backends = createRecordingSimulatorBackends();
  const input = engineInput();
  const engine = requireOk(createSimulatorEngine({
    ...input,
    runtime: { ...input.runtime, highFrequencyMode: true },
  }, backends), "create 120 engine");
  requireOk(engine.initialize(), "initialize");
  const first = requireOk(engine.snapshot(), "first snapshot");
  const second = requireOk(engine.snapshot(), "second snapshot");
  assertDeepEqual(first, second, "snapshot determinism");
  assertEqual(first.director.requestedTargetFrameRate, 120, "120 request");
  requireOk(engine.dispose(), "dispose");
  requireOk(engine.dispose(), "dispose twice");
  assertEqual(requireOk(engine.snapshot(), "disposed snapshot").backendTrace.length, 1,
    "dispose emits no backend request");
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
console.log(`first-slice simulator tests passed: ${passed}`);
