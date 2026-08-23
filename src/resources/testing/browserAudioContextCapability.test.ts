declare function require(name: string): any;
const assert = require("node:assert/strict");
import {
  createBrowserAudioContextCapability,
  type BrowserAudioContextCapability,
} from "../../app/simulator/browserAudioContextCapability";

export async function runBrowserAudioContextCapabilityTests(): Promise<void> {
  await testRunningRouteDoesNotResume();
  await testSuspendedRouteResumesSynchronouslyExactlyOnce();
  await testResumeRejectionAndNonRunningCompletionFailClosed();
  await testClosedConstructionAndDisposeWhileActivating();
}

async function testRunningRouteDoesNotResume(): Promise<void> {
  const context = new FakeAudioContext("running");
  const created = await createBrowserAudioContextCapability(() => context as unknown as AudioContext);
  assert.equal(created.status, "accepted");
  if (created.status !== "accepted") return;
  assert.equal(created.value.phase, "running");
  assert.equal(created.value.requiresUserActivation, false);
  assert.equal(context.resumeCalls, 0);
  const unavailable = await created.value.activateFromPointer();
  assert.equal(unavailable.status, "rejected");
  assert.equal(context.resumeCalls, 0);
  await created.value.dispose();
  await created.value.dispose();
  assert.equal(context.closeCalls, 1);
}

async function testSuspendedRouteResumesSynchronouslyExactlyOnce(): Promise<void> {
  const resume = deferred<void>();
  const sequence: string[] = [];
  const context = new FakeAudioContext("suspended", () => {
    sequence.push("resume-called");
    return resume.promise;
  });
  const created = await createBrowserAudioContextCapability(() => context as unknown as AudioContext);
  assert.equal(created.status, "accepted");
  if (created.status !== "accepted") return;
  assert.equal(created.value.phase, "user-activation-required");
  const pending = created.value.activateFromPointer();
  sequence.push("handler-returned");
  assert.deepEqual(sequence, ["resume-called", "handler-returned"]);
  assert.equal(created.value.phase, "activating");
  const duplicate = await created.value.activateFromPointer();
  assert.equal(duplicate.status, "rejected");
  assert.equal(context.resumeCalls, 1);
  context.state = "running";
  resume.resolve(undefined);
  assert.equal((await pending).status, "accepted");
  assert.equal(created.value.phase, "running");
  await created.value.dispose();
  assert.equal(context.closeCalls, 1);
}

async function testResumeRejectionAndNonRunningCompletionFailClosed(): Promise<void> {
  const rejectedContext = new FakeAudioContext("suspended", () => Promise.reject(new Error("blocked")));
  const rejectedCapability = requireAccepted(await createBrowserAudioContextCapability(
    () => rejectedContext as unknown as AudioContext,
  ));
  const rejectedResult = await rejectedCapability.activateFromPointer();
  assert.equal(rejectedResult.status, "rejected");
  if (rejectedResult.status === "rejected") {
    assert.equal(rejectedResult.failure.capability, "app.simulator.audio-context-resume-rejected");
  }
  assert.equal(rejectedContext.closeCalls, 1);

  const unchangedContext = new FakeAudioContext("suspended", () => Promise.resolve());
  const unchangedCapability = requireAccepted(await createBrowserAudioContextCapability(
    () => unchangedContext as unknown as AudioContext,
  ));
  const unchangedResult = await unchangedCapability.activateFromPointer();
  assert.equal(unchangedResult.status, "rejected");
  if (unchangedResult.status === "rejected") {
    assert.equal(unchangedResult.failure.capability, "app.simulator.audio-context-resume-not-running");
  }
  assert.equal(unchangedContext.closeCalls, 1);
}

async function testClosedConstructionAndDisposeWhileActivating(): Promise<void> {
  const closed = new FakeAudioContext("closed");
  const closedResult = await createBrowserAudioContextCapability(() => closed as unknown as AudioContext);
  assert.equal(closedResult.status, "rejected");
  if (closedResult.status === "rejected") {
    assert.equal(closedResult.failure.capability, "app.simulator.audio-context-invalid-initial-state");
  }
  const constructionFailure = await createBrowserAudioContextCapability(() => { throw new Error("no audio"); });
  assert.equal(constructionFailure.status, "rejected");

  const resume = deferred<void>();
  const pendingContext = new FakeAudioContext("suspended", () => resume.promise);
  const capability = requireAccepted(await createBrowserAudioContextCapability(
    () => pendingContext as unknown as AudioContext,
  ));
  const activation = capability.activateFromPointer();
  await capability.dispose();
  resume.resolve(undefined);
  const result = await activation;
  assert.equal(result.status, "rejected");
  assert.equal(capability.phase, "disposed");
  assert.equal(pendingContext.closeCalls, 1);
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

function requireAccepted(result: Awaited<ReturnType<typeof createBrowserAudioContextCapability>>): BrowserAudioContextCapability {
  assert.equal(result.status, "accepted");
  if (result.status !== "accepted") throw new Error(result.failure.capability);
  return result.value;
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolveValue!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolveValue = resolve; });
  return { promise, resolve: resolveValue };
}
