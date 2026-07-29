import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { GameState } from "../engine/data/inGameState";
import {
  ManualInputResolutionOwner,
  ManualTouchPhase,
  type ManualInputButtonResolution,
  type ManualInputFrame,
} from "../engine/data/manualInput";
import type { SimulatorResult } from "../engine/evidence";
import { InputManager } from "../engine/managers/inputBoundaries";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { engineInput, noteBatch } from "./firstSliceFixtures";

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];
const manualPlayMode = { kind: "manual" } as const;
const delta = Math.fround(1 / 60);
const position = Object.freeze({ x: Math.fround(580), y: Math.fround(650) });

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

function requireEvidence<T>(
  result: SimulatorResult<T>,
  capability: string,
): void {
  assert(result.status === "evidence-required", `${capability}: ${result.status}`);
  assertEqual(result.capability, capability, "failure capability");
}

function touch(
  fingerId: number,
  phase: number,
  buttonResolution: ManualInputButtonResolution | null = null,
  touchPosition = position,
): ManualInputFrame["touches"][number] {
  return {
    fingerId,
    phase: phase as ManualInputFrame["touches"][number]["phase"],
    position: touchPosition,
    buttonResolution,
  };
}

test("MJ01 manual活动外帧要求显式空touch数组且只消费一次", () => {
  const backends = createRecordingSimulatorBackends();
  const engine = requireOk(createSimulatorEngine(engineInput(), backends), "create manual engine");
  requireOk(engine.initialize(), "initialize manual engine");
  const beforeMissing = requireOk(engine.snapshot(), "snapshot before missing frame");
  requireEvidence(engine.step(delta), "input.manual-frame-required");
  assertDeepEqual(requireOk(engine.snapshot(), "snapshot after missing frame"), beforeMissing,
    "missing frame zero mutation");

  requireOk(engine.step(delta, { touches: [] }), "explicit empty frame");
  const after = requireOk(engine.snapshot(), "snapshot after empty frame");
  assertEqual(after.managers.inputManager.consumedFrameCount, 1, "one consumed frame");
  assertDeepEqual(after.managers.inputManager.lastFrame, {
    frameIndex: 0,
    touches: [],
  }, "empty frame trace");
  assertEqual(after.managers.inputManager.trace.length, 1, "one trace row");
  assertEqual(backends.snapshot().length, 1, "no input backend side effect");
});

test("MJ07 prepared copy冻结caller alias且Moved Stationary Ended不重绑", () => {
  const manager = new InputManager(manualPlayMode);
  requireOk(manager.initialize(), "initialize input manager");
  const mutablePosition = { x: Math.fround(580), y: Math.fround(650) };
  const beganResolution = requireOk(
    manager.issueButtonResolution(mutablePosition, {}),
    "issue began resolution",
  );
  const mutableTouches = [touch(0, ManualTouchPhase.Began, beganResolution, mutablePosition)];
  requireOk(manager.prepareOuterFrame({ touches: mutableTouches }), "prepare began");
  mutablePosition.x = Math.fround(100);
  mutableTouches.length = 0;
  requireOk(manager.execInput(GameState.PlayingSound), "consume began");

  for (const phase of [
    ManualTouchPhase.Moved,
    ManualTouchPhase.Stationary,
    ManualTouchPhase.Ended,
  ]) {
    requireOk(manager.prepareOuterFrame({ touches: [touch(0, phase)] }), `prepare ${phase}`);
    requireOk(manager.execInput(GameState.PlayingSound), `consume ${phase}`);
  }
  const snapshot = manager.snapshot();
  assertDeepEqual(snapshot.trace.map((frame) => frame.touches[0]?.phase), [0, 1, 2, 3],
    "phase trace preserves outer-frame order");
  assertDeepEqual(snapshot.trace[0]?.touches[0]?.position, position,
    "prepared position ignores caller alias mutation");
  assertEqual(snapshot.resolutionOwner.issuedCount, 1, "one issued capability");
  assertEqual(snapshot.resolutionOwner.consumedCount, 1, "one consumed capability");

  const illegalRebind = requireOk(
    manager.issueButtonResolution(position, {}),
    "issue illegal moved resolution",
  );
  const before = manager.snapshot();
  requireEvidence(
    manager.prepareOuterFrame({
      touches: [touch(0, ManualTouchPhase.Moved, illegalRebind)],
    }),
    "input.invalid-touch",
  );
  assertDeepEqual(manager.snapshot(), before, "Moved rebind failure has no frame mutation");
});

test("MJ25 pause不解析输入且fault dispose优先于delta和shape", () => {
  const pausedEngine = requireOk(
    createSimulatorEngine(engineInput(), createRecordingSimulatorBackends()),
    "create paused engine",
  );
  requireOk(pausedEngine.initialize(), "initialize paused engine");
  requireOk(pausedEngine.pause(), "pause");
  const pausedBefore = requireOk(pausedEngine.snapshot(), "paused before");
  requireOk(
    pausedEngine.step(delta, null as unknown as ManualInputFrame),
    "paused malformed frame ignored",
  );
  assertDeepEqual(requireOk(pausedEngine.snapshot(), "paused after"), pausedBefore,
    "pause consumes no input and mutates no clock");
  requireOk(pausedEngine.resume(), "resume");
  requireEvidence(pausedEngine.step(delta), "input.manual-frame-required");

  const autoInput = engineInput();
  const autoEngine = requireOk(createSimulatorEngine({
    ...autoInput,
    runtime: {
      ...autoInput.runtime,
      playMode: {
        kind: "auto-live",
        resultTransform: "identity-no-active-situation-skill",
      },
    },
  }, createRecordingSimulatorBackends()), "create Auto Live input boundary engine");
  requireOk(autoEngine.initialize(), "initialize Auto Live input boundary engine");
  const autoBefore = requireOk(autoEngine.snapshot(), "Auto Live before touch");
  requireEvidence(autoEngine.step(delta, {
    touches: [touch(0, ManualTouchPhase.Began)],
  }), "input.touch-in-auto-live");
  assertDeepEqual(requireOk(autoEngine.snapshot(), "Auto Live after touch"), autoBefore,
    "real touch cannot switch Auto Live or mutate its synthetic owner");

  const disposedEngine = requireOk(
    createSimulatorEngine(engineInput(), createRecordingSimulatorBackends()),
    "create disposed engine",
  );
  requireOk(disposedEngine.initialize(), "initialize disposed engine");
  requireOk(disposedEngine.dispose(), "dispose");
  requireEvidence(
    disposedEngine.step(Number.NaN, null as unknown as ManualInputFrame),
    "ingame.update-outside-initialized-lifecycle",
  );

  const faultedEngine = requireOk(
    createSimulatorEngine(
      engineInput([noteBatch(["manual-fault"], 1)]),
      createRecordingSimulatorBackends(),
    ),
    "create fault engine",
  );
  requireOk(faultedEngine.initialize(), "initialize fault engine");
  requireOk(faultedEngine.step(0.01, { touches: [] }), "activate fault note");
  const fault = faultedEngine.step(0.01, { touches: [] });
  assert(fault.status === "evidence-required", "fault must latch");
  assertDeepEqual(
    faultedEngine.step(Number.NaN, null as unknown as ManualInputFrame),
    fault,
    "latched fault precedes delta and input shape",
  );
});

test("MJ26 malformed foreign forged和later-invalid整帧零mutation", () => {
  const backends = createRecordingSimulatorBackends();
  const engine = requireOk(createSimulatorEngine(engineInput(), backends), "create atomic engine");
  requireOk(engine.initialize(), "initialize atomic engine");
  const before = requireOk(engine.snapshot(), "atomic before");
  const forged = Object.freeze({}) as ManualInputButtonResolution;
  requireEvidence(engine.step(delta, {
    touches: [touch(0, ManualTouchPhase.Began, forged)],
  }), "input.foreign-or-invalid-button-resolution");
  assertDeepEqual(requireOk(engine.snapshot(), "atomic after"), before,
    "forged host frame changes no domain");
  assertEqual(backends.snapshot().length, 1, "forged frame emits no backend event");

  const owner = new ManualInputResolutionOwner();
  const foreignOwner = new ManualInputResolutionOwner();
  requireOk(owner.initialize(), "initialize owner");
  requireOk(foreignOwner.initialize(), "initialize foreign owner");
  const resolution = requireOk(owner.issue(position, {}), "issue owner resolution");
  const validTouch = touch(0, ManualTouchPhase.Began, resolution);
  const ownerBefore = owner.snapshot();

  requireEvidence(foreignOwner.preflight({ touches: [validTouch] }),
    "input.foreign-or-invalid-button-resolution");
  requireEvidence(owner.preflight({
    touches: [validTouch, touch(0, ManualTouchPhase.Began)],
  }), "input.invalid-touch");
  requireEvidence(owner.preflight({
    touches: [validTouch, touch(15, ManualTouchPhase.Moved)],
  }), "input.invalid-touch");
  requireEvidence(owner.preflight({
    touches: [touch(0, ManualTouchPhase.Began, resolution, {
      x: Math.fround(581),
      y: position.y,
    })],
  }), "input.foreign-or-invalid-button-resolution");
  assertDeepEqual(owner.snapshot(), ownerBefore,
    "foreign duplicate later-invalid and position mismatch do not consume capability");

  const prepared = requireOk(owner.preflight({ touches: [validTouch] }),
    "capability remains usable after rejected frames");
  assertEqual(prepared.touches[0]?.resolvedButton, true, "prepared owner projection");
  const afterConsume = owner.snapshot();
  assertEqual(afterConsume.consumedCount, 1, "valid frame consumes once");
  requireEvidence(owner.preflight({ touches: [validTouch] }),
    "input.foreign-or-invalid-button-resolution");
  assertDeepEqual(owner.snapshot(), afterConsume, "duplicate cross-frame consumption is stable");

  for (const invalidFrame of [
    { touches: [touch(-1, ManualTouchPhase.Began)] },
    { touches: [touch(0, 4)] },
    { touches: [touch(0, ManualTouchPhase.Began, null, { x: Number.NaN, y: 0 })] },
    { touches: [touch(0, ManualTouchPhase.Began, null, { x: 0.1, y: 0 })] },
  ]) {
    const invalidOwner = new ManualInputResolutionOwner();
    requireOk(invalidOwner.initialize(), "initialize invalid owner");
    const invalidBefore = invalidOwner.snapshot();
    assert(invalidOwner.preflight(invalidFrame).status === "evidence-required",
      "invalid frame fails closed");
    assertDeepEqual(invalidOwner.snapshot(), invalidBefore, "invalid frame owner zero mutation");
  }
});

test("snapshot只读且不暴露capability或button owner", () => {
  const manager = new InputManager(manualPlayMode);
  requireOk(manager.initialize(), "initialize snapshot manager");
  const resolution = requireOk(manager.issueButtonResolution(position, {}), "issue snapshot cap");
  requireOk(manager.prepareOuterFrame({
    touches: [touch(0, ManualTouchPhase.Began, resolution)],
  }), "prepare snapshot frame");
  requireOk(manager.execInput(GameState.PlayingSound), "consume snapshot frame");
  const first = manager.snapshot();
  const second = manager.snapshot();
  assertDeepEqual(second, first, "snapshot read-only");
  const encoded = JSON.stringify(first);
  assert(!encoded.includes("buttonResolution"), "snapshot omits capability");
  assert(!encoded.includes("buttonOwner"), "snapshot omits button owner");
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
console.log(`manual input boundary tests passed: ${passed}`);
