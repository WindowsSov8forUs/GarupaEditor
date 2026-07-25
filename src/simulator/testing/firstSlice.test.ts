import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import type { OneFrameDataHandle } from "../engine/data/oneFrameData";
import {
  ok,
  type EvidenceReference,
  type SimulatorResult,
} from "../engine/evidence";
import { InGameManager } from "../engine/managers/inGameManager";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
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
  bound,
  engineInput,
  evidence,
  noteBatch,
} from "./firstSliceFixtures";

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(actualJson === expectedJson, `${message}: ${actualJson} !== ${expectedJson}`);
}

function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  assert(result.status === "ok", `${message}: ${result.status}`);
  return result.value;
}

class FakeClock implements NoteManagerClock {
  readonly advances: number[] = [];
  activateBatch = true;

  advance(deltaTimeSeconds: number): SimulatorResult<void> {
    this.advances.push(deltaTimeSeconds);
    return ok(undefined);
  }

  canActivateBatch(): SimulatorResult<boolean> {
    return ok(this.activateBatch);
  }
}

class TraceNote extends NoteBase {
  constructor(
    poolObjectId: string,
    noteEvidence: readonly EvidenceReference[],
    private readonly calls: string[],
    private readonly deactivateOnUpdate: ReadonlySet<string>,
  ) {
    super(poolObjectId, noteEvidence);
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
    this.calls.push(`update:${this.fixtureId}`);
    if (this.deactivateOnUpdate.has(this.fixtureId)) {
      return this.changeState(NoteState.Deactive);
    }
    return ok(undefined);
  }

  override executeAfterUpdate(): SimulatorResult<void> {
    this.calls.push(`after:${this.fixtureId}`);
    return ok(undefined);
  }
}

interface TestGraph {
  readonly clock: FakeClock;
  readonly controller: InGameOneFrameJudgementController;
  readonly manager: NoteManager;
  readonly calls: string[];
  readonly notes: TraceNote[];
}

function createTestGraph(
  noteIds: readonly string[],
  deactivateOnUpdate: ReadonlySet<string> = new Set<string>(),
): TestGraph {
  const calls: string[] = [];
  const notes: TraceNote[] = [];
  const clock = new FakeClock();
  const oneFrameEvidence = evidence("E08", "test OneFrameData pool");
  const controller = new InGameOneFrameJudgementController({
    capacity: bound(4, oneFrameEvidence),
  });
  requireOk(controller.initialize(), "initialize OneFrameData controller");
  const manager = new NoteManager(
    [noteBatch("group", noteIds)],
    new SlideNoteManager(),
    clock,
    () => controller.getUsableOneFrameData(),
    (_family, poolObjectId, noteEvidence) => {
      const note = new TraceNote(
        poolObjectId,
        noteEvidence,
        calls,
        deactivateOnUpdate,
      );
      notes.push(note);
      return note;
    },
  );
  requireOk(manager.execAwakeEnd(), "initialize NoteManager");
  return { clock, controller, manager, calls, notes };
}

test("管理器对象图保持单一所有者和确定构造顺序", () => {
  const graph = createTestGraph(["A", "B"]);
  const music = new InGameMusicScoreController(engineInput().clock);
  const input = new InputManager();
  const inGame = new InGameManager(
    music,
    graph.manager,
    graph.controller,
    input,
  );
  assert(inGame.musicScoreController === music, "music controller owner mismatch");
  assert(inGame.noteManager === graph.manager, "NoteManager owner mismatch");
  assert(
    inGame.oneFrameJudgementController === graph.controller,
    "OneFrame controller owner mismatch",
  );
  assert(inGame.inputManager === input, "InputManager owner mismatch");
  const poolIds = graph.manager.snapshot().pools.flatMap((pool) =>
    pool.objects.map((object) => object.poolObjectId),
  );
  assertEqual(new Set(poolIds).size, poolIds.length, "pool object IDs must be unique");
});

test("宿主生命周期按 initialize pause resume dispose 分发", () => {
  const backends = createRecordingSimulatorBackends();
  const engine = requireOk(
    createSimulatorEngine(engineInput(), backends),
    "create engine",
  );
  requireOk(engine.initialize(), "initialize");
  requireOk(engine.initialize(), "initialize idempotently");
  requireOk(engine.pause(), "pause");
  requireOk(engine.pause(), "pause idempotently");
  requireOk(engine.resume(), "resume");
  requireOk(engine.resume(), "resume idempotently");
  requireOk(engine.dispose(), "dispose");
  const snapshot = requireOk(engine.snapshot(), "snapshot");
  assertEqual(snapshot.managers.state, "disposed", "disposed state");
  assertDeepEqual(
    snapshot.backendTrace,
    [
      { sequence: 0, backend: "lifecycle", action: "state", detail: "paused" },
      { sequence: 1, backend: "lifecycle", action: "state", detail: "running" },
    ],
    "lifecycle backend trace",
  );
});

test("四档 deltaTime 阈值选择 1 至 4 子步", () => {
  assertEqual(selectSubstepCount(0), 1, "zero delta");
  assertEqual(selectSubstepCount(0.017999), 1, "below first threshold");
  assertEqual(selectSubstepCount(0.018), 2, "first threshold");
  assertEqual(selectSubstepCount(0.032999), 2, "below second threshold");
  assertEqual(selectSubstepCount(0.033), 3, "second threshold");
  assertEqual(selectSubstepCount(0.049999), 3, "below third threshold");
  assertEqual(selectSubstepCount(0.05), 4, "third threshold");
});

test("同时音符组激活后延迟一个子步更新", () => {
  const graph = createTestGraph(["A", "B", "C"]);
  requireOk(graph.manager.execUpdate(0.01), "activation step");
  assertDeepEqual(graph.calls, [], "new notes must not update immediately");
  assertDeepEqual(
    graph.manager.snapshot().activeNoteIds,
    ["A", "B", "C"],
    "source-order activation",
  );
  requireOk(graph.manager.execUpdate(0.01), "first active step");
  assertDeepEqual(
    graph.calls,
    ["update:C", "update:B", "update:A", "after:C", "after:B", "after:A"],
    "next-substep execution",
  );
});

test("活跃列表按反向 Update 和存活收集顺序 AfterUpdate", () => {
  const graph = createTestGraph(["A", "B", "C"]);
  requireOk(graph.manager.execUpdate(0.01), "activation step");
  requireOk(graph.manager.execUpdate(0.01), "active step");
  const trace = graph.manager.snapshot().schedulerTrace.flatMap((entry) => {
    if (entry.kind === "note-update" || entry.kind === "note-after-update") {
      return [`${entry.kind}:${entry.fixtureId}`];
    }
    return [];
  });
  assertDeepEqual(
    trace,
    [
      "note-update:C",
      "note-update:B",
      "note-update:A",
      "note-after-update:C",
      "note-after-update:B",
      "note-after-update:A",
    ],
    "two-phase trace order",
  );
});

test("Update 中 Deactive 的对象不进入 AfterUpdate", () => {
  const graph = createTestGraph(["A", "B", "C"], new Set(["B"]));
  requireOk(graph.manager.execUpdate(0.01), "activation step");
  requireOk(graph.manager.execUpdate(0.01), "deactivation step");
  assertDeepEqual(
    graph.calls,
    ["update:C", "update:B", "update:A", "after:C", "after:A"],
    "deactive filter",
  );
  assertDeepEqual(
    graph.manager.snapshot().activeNoteIds,
    ["A", "C"],
    "immediate active-list removal",
  );
  requireOk(graph.notes[0].changeState(NoteState.Move), "repeat active state");
  assertDeepEqual(
    graph.manager.snapshot().activeNoteIds,
    ["A", "C"],
    "repeat activation must not append a duplicate",
  );
  const inactivePoolObject = graph.manager
    .snapshot()
    .pools.flatMap((pool) => pool.objects)
    .find((object) => object.fixtureId === "B");
  assert(inactivePoolObject !== undefined, "deactivated object must remain pool-owned");
  assertEqual(inactivePoolObject.state, NoteState.Deactive, "pool occupancy state");
});

test("列表自移除在当前遍历生效且下一子步刷新 Count", () => {
  const graph = createTestGraph(["A", "B"], new Set(["B"]));
  requireOk(graph.manager.execUpdate(0.02), "two-substep frame");
  assertDeepEqual(
    graph.calls,
    ["update:B", "update:A", "after:A"],
    "self-removal in second substep",
  );
  graph.calls.length = 0;
  requireOk(graph.manager.execUpdate(0.01), "following frame");
  assertDeepEqual(
    graph.calls,
    ["update:A", "after:A"],
    "removed note absent on refreshed Count",
  );
});

test("暂停冻结时钟、游标、列表、池和 OneFrame 状态", () => {
  const graph = createTestGraph([]);
  const inGame = new InGameManager(
    new InGameMusicScoreController(engineInput().clock),
    graph.manager,
    graph.controller,
    new InputManager(),
  );
  requireOk(inGame.initialize(), "initialize manager");
  requireOk(inGame.step(0.01), "step before pause");
  requireOk(inGame.pause(), "pause manager");
  const frozen = inGame.snapshot();
  requireOk(inGame.step(0.05), "paused step");
  assertDeepEqual(inGame.snapshot(), frozen, "paused state must be byte-stable as JSON");
  requireOk(inGame.resume(), "resume manager");
  requireOk(inGame.step(0.01), "step after resume");
  assertEqual(graph.clock.advances.length, 2, "clock resumes from retained state");
});

test("OneFrame 容器统一获取、占用、Reflect 和回收", () => {
  const oneFrameEvidence = evidence("E08", "OneFrameData container lifecycle");
  const controller = new InGameOneFrameJudgementController({
    capacity: bound(2, oneFrameEvidence),
  });
  requireOk(controller.initialize(), "initialize controller");
  const first = requireOk(controller.getUsableOneFrameData(), "get first container");
  requireOk(controller.stageFixture(first, [oneFrameEvidence]), "stage first container");
  const second = requireOk(controller.getUsableOneFrameData(), "get second container");
  requireOk(controller.stageFixture(second, [oneFrameEvidence]), "stage second container");
  assert(controller.existsOneFrameData(), "existsOneFrameData must observe staged entries");
  assertEqual(
    controller.getUsableOneFrameData().status,
    "evidence-required",
    "exhausted pool must fail closed",
  );
  const reflected = requireOk(controller.reflectOneFrameData(), "reflect frame data");
  assertDeepEqual(
    reflected.containerIds,
    ["one-frame:0", "one-frame:1"],
    "controller pool collection order",
  );
  assert(!controller.existsOneFrameData(), "Reflect must recycle every staged entry");
  assertDeepEqual(controller.collectOneFrameData(), [], "collection after recycle");
});

test("Note 只能通过 SetupNotes 安装的回调请求 OneFrame 容器", () => {
  const graph = createTestGraph(["A"]);
  const handle: OneFrameDataHandle = requireOk(
    graph.notes[0].requestUsableOneFrameData(),
    "Note callback acquisition",
  );
  assertEqual(handle.containerId, "one-frame:0", "callback-owned container");
  const detached = new TraceNote("detached", [], [], new Set<string>());
  assertEqual(
    detached.requestUsableOneFrameData().status,
    "evidence-required",
    "unregistered Note callback",
  );
});

test("未闭合输入、判定和数值时钟统一失败关闭", () => {
  const missingClockEvidence = engineInput();
  const invalidInput = {
    ...missingClockEvidence,
    clock: {
      ...missingClockEvidence.clock,
      currentBpm: { value: 120, evidence: [] },
    },
  };
  assertEqual(
    createSimulatorEngine(invalidInput, createRecordingSimulatorBackends()).status,
    "evidence-required",
    "missing clock evidence",
  );
  const engine = requireOk(
    createSimulatorEngine(engineInput(), createRecordingSimulatorBackends()),
    "create evidence-bound engine",
  );
  requireOk(engine.initialize(), "initialize evidence-bound engine");
  assertEqual(engine.step(0.01).status, "evidence-required", "G01 clock gate");
  assertEqual(new InputManager().execInput().status, "evidence-required", "input gate");
  assertEqual(
    new GamePlayButton().execTouchBegan().status,
    "evidence-required",
    "touch gate",
  );
  const controller = new InGameOneFrameJudgementController(
    engineInput().oneFrameData,
  );
  assertEqual(
    controller.setupBusinessData().status,
    "evidence-required",
    "OneFrameData business gate",
  );
});

test("快照确定且序列化不触发后端事件", () => {
  const backends = createRecordingSimulatorBackends();
  backends.renderer.record({ action: "frame", detail: "fixture" });
  const engine = requireOk(createSimulatorEngine(engineInput(), backends), "create engine");
  requireOk(engine.initialize(), "initialize engine");
  const first = requireOk(engine.snapshot(), "first snapshot");
  const second = requireOk(engine.snapshot(), "second snapshot");
  assertDeepEqual(first, second, "repeated snapshots");
  assertEqual(first.backendTrace.length, 1, "snapshot must not record events");
  assertDeepEqual(
    first.evidenceGaps,
    ["G01", "G02", "G03", "G04", "G05", "G06"],
    "open evidence gaps",
  );
});

test("dispose 幂等且不产生额外事件", () => {
  const backends = createRecordingSimulatorBackends();
  const engine = requireOk(createSimulatorEngine(engineInput(), backends), "create engine");
  requireOk(engine.initialize(), "initialize engine");
  requireOk(engine.pause(), "pause engine");
  requireOk(engine.dispose(), "first dispose");
  const first = requireOk(engine.snapshot(), "snapshot after first dispose");
  requireOk(engine.dispose(), "second dispose");
  const second = requireOk(engine.snapshot(), "snapshot after second dispose");
  assertDeepEqual(first, second, "idempotent dispose snapshot");
  assertEqual(second.backendTrace.length, 1, "dispose must not emit backend events");
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
