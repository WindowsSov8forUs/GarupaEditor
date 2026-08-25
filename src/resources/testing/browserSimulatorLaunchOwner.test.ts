declare function require(name: string): any;
const assert = require("node:assert/strict");
import type { ResourceConsumerLease, ResourceSnapshotId } from "../contracts";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleLaunchRequest,
  SimulatorModuleLaunchResult,
} from "../../simulator/public/contracts";
import {
  createBrowserAudioContextCapability,
} from "../../app/simulator/browserAudioContextCapability";
import {
  BrowserSimulatorLaunchOwner,
  type BrowserSimulatorLaunchOwnerDependencies,
  type BrowserSimulatorLaunchPhase,
  type BrowserSimulatorLaunchPlatformOwner,
} from "../../app/simulator/browserSimulatorLaunchOwner";
import type { SimulatorLaunchTransportDescriptor } from "../../app/simulator/transportContracts";

export async function runBrowserSimulatorLaunchOwnerTests(): Promise<void> {
  await testAutomaticRunningRouteAndDuplicateBegin();
  await testSuspendedRouteWaitsForOneSynchronousActivation();
  await testRejectedLaunchAndTerminalFailureReturnHost();
  await testCancellationBeforeAndDuringAcquisition();
}

async function testAutomaticRunningRouteAndDuplicateBegin(): Promise<void> {
  const harness = createHarness("running");
  const owner = harness.owner;
  const first = owner.begin();
  const duplicate = owner.begin();
  assert.equal(first, duplicate);
  await waitFor(() => owner.state.phase === "running");
  assert.equal(harness.audio.resumeCalls, 0);
  assert.deepEqual(harness.events.slice(0, 9), [
    "lock-window", "refresh-catalog", "acquire-media", "build-request", "create-audio",
    "create-platform", "validate-platform", "install-platform", "launch",
  ]);
  harness.closed.resolve(closeReport(null));
  await first;
  assert.equal(owner.state.phase, "closed");
  assert.equal(harness.media.releaseCalls, 1);
  assert.equal(harness.platform.disposeCalls, 1);
  assert.equal(harness.audio.closeCalls, 1);
  assert.equal(harness.published.length, 1);
  assert.deepEqual(harness.published[0], { status: "closed", capability: null, boundary: null });
  assert.equal(harness.leaveCalls, 1);
}

async function testSuspendedRouteWaitsForOneSynchronousActivation(): Promise<void> {
  const resume = deferred<void>();
  const sequence: string[] = [];
  const harness = createHarness("suspended", () => {
    sequence.push("resume-called");
    return resume.promise;
  });
  const running = harness.owner.begin();
  await waitFor(() => harness.owner.state.phase === "awaiting-host-activation");
  assert.equal(harness.platformCreateCalls, 0);
  const activation = harness.owner.activateFromPointer();
  sequence.push("pointer-returned");
  assert.deepEqual(sequence, ["resume-called", "pointer-returned"]);
  const duplicate = harness.owner.activateFromPointer();
  harness.audio.state = "running";
  resume.resolve(undefined);
  await Promise.all([activation, duplicate]);
  await waitFor(() => harness.owner.state.phase === "running");
  assert.equal(harness.audio.resumeCalls, 1);
  assert.equal(harness.platformCreateCalls, 1);
  harness.closed.resolve(closeReport(null));
  await running;
}

async function testRejectedLaunchAndTerminalFailureReturnHost(): Promise<void> {
  const rejected = createHarness("running", undefined, "launch-rejected");
  await rejected.owner.begin();
  assert.equal(rejected.owner.state.phase, "rejected");
  assert.equal(rejected.owner.state.failure?.capability, "simulator.test.launch-rejected");
  assert.equal(rejected.published.length, 1);
  assert.equal(rejected.published[0]?.status, "rejected");
  assert.equal(rejected.leaveCalls, 1);
  assert.equal(rejected.media.releaseCalls, 1);
  assert.equal(rejected.platform.disposeCalls, 1);
  assert.equal(rejected.audio.closeCalls, 1);
  await rejected.owner.requestExit();
  assert.equal(rejected.leaveCalls, 1);

  const terminal = createHarness("running");
  const pending = terminal.owner.begin();
  await waitFor(() => terminal.owner.state.phase === "running");
  terminal.closed.resolve(closeReport({
    code: "launch-failed",
    capability: "simulator.test.runtime-terminal",
    boundary: "terminal test failure",
  }));
  await pending;
  assert.equal(terminal.owner.state.phase, "rejected");
  assert.equal(terminal.leaveCalls, 1);
  await terminal.owner.requestExit();
  assert.equal(terminal.leaveCalls, 1);
}

async function testCancellationBeforeAndDuringAcquisition(): Promise<void> {
  const lock = deferred<void>();
  const before = createHarness("running", undefined, "accepted", { lock });
  const pendingBefore = before.owner.begin();
  await waitFor(() => before.owner.state.phase === "preparing-window");
  const exitBefore = before.owner.requestExit();
  lock.resolve(undefined);
  await Promise.all([pendingBefore, exitBefore]);
  assert.equal(before.owner.state.phase, "closed");
  assert.equal(before.events.includes("create-audio"), false);
  assert.equal(before.published.length, 1);
  assert.equal(before.leaveCalls, 1);

  const acquisition = deferred<ResourceConsumerLease>();
  const during = createHarness("running", undefined, "accepted", { acquisition });
  const pendingDuring = during.owner.begin();
  await waitFor(() => during.owner.state.phase === "acquiring-media");
  const exitDuring = during.owner.requestExit();
  acquisition.resolve(during.media);
  await Promise.all([pendingDuring, exitDuring]);
  assert.equal(during.media.releaseCalls, 1);
  assert.equal(during.events.includes("build-request"), false);
  assert.equal(during.published.length, 1);
  assert.equal(during.leaveCalls, 1);
}

function createHarness(
  audioState: AudioContextState,
  resumeImplementation?: () => Promise<void>,
  launchDisposition: "accepted" | "launch-rejected" = "accepted",
  gates: {
    readonly lock?: ReturnType<typeof deferred<void>>;
    readonly acquisition?: ReturnType<typeof deferred<ResourceConsumerLease>>;
  } = {},
) {
  const events: string[] = [];
  const states: BrowserSimulatorLaunchPhase[] = [];
  const published: Array<{
    status: "closed" | "rejected";
    capability: string | null;
    boundary: string | null;
  }> = [];
  const audio = new FakeAudioContext(audioState, resumeImplementation);
  const media = new FakeMediaLease();
  const platform = new FakePlatformOwner();
  const closed = deferred<SimulatorModuleCloseReport>();
  let leaveCalls = 0;
  let platformCreateCalls = 0;
  const descriptor = createDescriptor();
  const dependencies: BrowserSimulatorLaunchOwnerDependencies = {
    async lockWindow() {
      events.push("lock-window");
      if (gates.lock !== undefined) await gates.lock.promise;
    },
    async refreshCatalog() { events.push("refresh-catalog"); },
    async acquireMedia() {
      events.push("acquire-media");
      return gates.acquisition === undefined ? media : gates.acquisition.promise;
    },
    async buildRequest() {
      events.push("build-request");
      return Object.freeze({}) as SimulatorModuleLaunchRequest;
    },
    async createAudio() {
      events.push("create-audio");
      return createBrowserAudioContextCapability(() => audio as unknown as AudioContext);
    },
    async createPlatform() {
      events.push("create-platform");
      platformCreateCalls += 1;
      return platform;
    },
    validatePlatform() { events.push("validate-platform"); },
    installPlatform() { events.push("install-platform"); },
    async launch(): Promise<SimulatorModuleLaunchResult> {
      events.push("launch");
      return launchDisposition === "launch-rejected"
        ? Object.freeze({
            status: "rejected" as const,
            failure: Object.freeze({
              code: "launch-failed" as const,
              capability: "simulator.test.launch-rejected",
              boundary: "injected launch rejection",
            }),
          })
        : Object.freeze({ status: "accepted" as const, closed: closed.promise });
    },
    async publishClosed(input) { published.push({ ...input }); },
    async leaveHost() { leaveCalls += 1; },
  };
  const owner = new BrowserSimulatorLaunchOwner(
    descriptor.requestId,
    descriptor,
    dependencies,
    (state) => states.push(state.phase),
  );
  return {
    owner, events, states, published, audio, media, platform, closed,
    get leaveCalls() { return leaveCalls; },
    get platformCreateCalls() { return platformCreateCalls; },
  };
}

class FakeAudioContext {
  resumeCalls = 0;
  closeCalls = 0;

  constructor(
    public state: AudioContextState,
    private readonly resumeImplementation: () => Promise<void> = () => Promise.resolve(),
  ) {}
  resume(): Promise<void> {
    this.resumeCalls += 1;
    return this.resumeImplementation();
  }
  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
    return Promise.resolve();
  }
}

class FakeMediaLease implements ResourceConsumerLease {
  readonly leaseId = "lease/test-launch" as ResourceConsumerLease["leaseId"];
  readonly snapshotId = "snapshot/test-launch" as ResourceSnapshotId;
  readonly slots = Object.freeze({});
  readonly revisions = Object.freeze({});
  releaseCalls = 0;
  listFiles() { return Object.freeze([]); }
  readBytes(): Promise<Uint8Array> { return Promise.resolve(new Uint8Array([1])); }
  openObjectUrl(): Promise<string> { return Promise.resolve("blob:test"); }
  release(): Promise<void> { this.releaseCalls += 1; return Promise.resolve(); }
}

class FakePlatformOwner implements BrowserSimulatorLaunchPlatformOwner {
  readonly platform = Object.freeze({ identity: "test-platform" });
  requestCloseCalls = 0;
  disposeCalls = 0;
  requestClose(): void { this.requestCloseCalls += 1; }
  dispose(): void { this.disposeCalls += 1; }
}

function createDescriptor(): SimulatorLaunchTransportDescriptor {
  return Object.freeze({
    schemaVersion: 3,
    requestId: "request:test-launch",
    mediaSnapshotId: "snapshot/test-launch" as ResourceSnapshotId,
    chartJson: "[]",
    isFullLength: false,
    presentation: Object.freeze({}),
    config: Object.freeze({}),
    requestedWindow: Object.freeze({ width: 1600, height: 720 }),
  }) as unknown as SimulatorLaunchTransportDescriptor;
}

function closeReport(failure: null | { code: "launch-failed"; capability: string; boundary: string }): SimulatorModuleCloseReport {
  return Object.freeze({
    reason: failure === null ? "natural-completion" : "terminal-fault",
    result: null,
    failure,
    capabilities: Object.freeze({}),
  }) as unknown as SimulatorModuleCloseReport;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("launch owner test did not reach the expected state");
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolveValue!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolveValue = resolve; });
  return { promise, resolve: resolveValue };
}

void (null as SimulatorModuleLaunchResult | null);
