import type { ResourceConsumerLease } from "../../resources/contracts";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleLaunchRequest,
  SimulatorModuleLaunchResult,
} from "../../simulator/public/contracts";
import type { SimulatorLaunchTransportDescriptor } from "./transportContracts";
import type {
  BrowserAudioContextCapability,
  BrowserAudioContextResult,
} from "./browserAudioContextCapability";

export type BrowserSimulatorLaunchPhase =
  | "waiting-descriptor"
  | "preparing-window"
  | "refreshing-catalog"
  | "acquiring-media"
  | "building-request"
  | "checking-audio"
  | "awaiting-host-activation"
  | "creating-platform"
  | "installing-launcher"
  | "launching"
  | "running"
  | "closing"
  | "closed"
  | "rejected"
  | "disposed";

export interface BrowserSimulatorLaunchFailure {
  readonly capability: string;
  readonly boundary: string;
}

export interface BrowserSimulatorLaunchState {
  readonly phase: BrowserSimulatorLaunchPhase;
  readonly failure: BrowserSimulatorLaunchFailure | null;
}

export interface BrowserSimulatorLaunchPlatformOwner {
  readonly platform: unknown;
  requestClose(): void;
  dispose(): void;
}

export interface BrowserSimulatorLaunchOwnerDependencies {
  lockWindow(): Promise<void>;
  refreshCatalog(): Promise<void>;
  acquireMedia(snapshotId: SimulatorLaunchTransportDescriptor["mediaSnapshotId"]): Promise<ResourceConsumerLease>;
  buildRequest(
    descriptor: SimulatorLaunchTransportDescriptor,
    media: ResourceConsumerLease,
  ): Promise<SimulatorModuleLaunchRequest>;
  createAudio(): Promise<BrowserAudioContextResult<BrowserAudioContextCapability>>;
  createPlatform(audioContext: AudioContext): Promise<BrowserSimulatorLaunchPlatformOwner>;
  validatePlatform(owner: BrowserSimulatorLaunchPlatformOwner): void;
  installPlatform(platform: unknown): void;
  launch(request: SimulatorModuleLaunchRequest): Promise<SimulatorModuleLaunchResult>;
  publishClosed(input: {
    readonly status: "closed" | "rejected";
    readonly capability: string | null;
    readonly boundary: string | null;
  }): Promise<void>;
  leaveHost(): Promise<void>;
}

export class BrowserSimulatorLaunchDependencyError extends Error {
  readonly failure: BrowserSimulatorLaunchFailure;

  constructor(capability: string, boundary: string) {
    super(`${capability}: ${boundary}`);
    this.name = "BrowserSimulatorLaunchDependencyError";
    this.failure = Object.freeze({ capability, boundary });
  }
}

export class BrowserSimulatorLaunchOwner {
  private stateValue: BrowserSimulatorLaunchState = freezeState("waiting-descriptor", null);
  private runPromise: Promise<void> | null = null;
  private activationGate: { resolve(): void; promise: Promise<void> } | null = null;
  private activationFailure: BrowserSimulatorLaunchFailure | null = null;
  private media: ResourceConsumerLease | null = null;
  private audio: BrowserAudioContextCapability | null = null;
  private platform: BrowserSimulatorLaunchPlatformOwner | null = null;
  private exitRequested = false;
  private disposed = false;
  private terminal = false;
  private closedPublished = false;
  private hostLeft = false;
  private cleanupPromise: Promise<void> | null = null;

  constructor(
    requestId: string,
    private readonly descriptor: SimulatorLaunchTransportDescriptor,
    private readonly dependencies: BrowserSimulatorLaunchOwnerDependencies,
    private readonly onStateChange: (state: BrowserSimulatorLaunchState) => void,
  ) {
    if (
      requestId.length === 0 || descriptor.schemaVersion !== 2 || descriptor.requestId !== requestId
    ) {
      throw new BrowserSimulatorLaunchDependencyError(
        "app.simulator.invalid-launch-descriptor",
        "The launch owner requires one schema-2 descriptor whose requestId exactly matches the route identity and preserves Float32 transport bits.",
      );
    }
  }

  get state(): BrowserSimulatorLaunchState { return this.stateValue; }

  begin(): Promise<void> {
    if (this.runPromise !== null) return this.runPromise;
    if (this.disposed) return Promise.resolve();
    this.runPromise = this.run();
    return this.runPromise;
  }

  activateFromPointer(): Promise<void> {
    const audio = this.audio;
    if (
      this.disposed || this.terminal || this.stateValue.phase !== "awaiting-host-activation" ||
      audio === null || this.activationGate === null
    ) return Promise.resolve();
    const pending = audio.activateFromPointer();
    this.publish("checking-audio", null);
    return pending.then((result) => {
      if (result.status === "rejected") this.activationFailure = result.failure;
      this.activationGate?.resolve();
    });
  }

  async requestExit(): Promise<void> {
    if (this.hostLeft) return;
    if ((this.stateValue.phase === "launching" || this.stateValue.phase === "running") && this.platform !== null) {
      this.exitRequested = true;
      this.platform.requestClose();
      return;
    }
    if (this.stateValue.phase === "rejected" || this.stateValue.phase === "closed") {
      await this.leaveHostOnce();
      return;
    }
    this.exitRequested = true;
    this.activationGate?.resolve();
    await this.finishClosedWithoutModule();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return this.cleanup();
    this.disposed = true;
    this.activationGate?.resolve();
    this.platform?.requestClose();
    await this.cleanup();
    if (!this.terminal) this.publish("disposed", null);
  }

  private async run(): Promise<void> {
    try {
      this.publish("preparing-window", null);
      await this.dependencies.lockWindow();
      if (await this.stopIfCancelled()) return;

      this.publish("refreshing-catalog", null);
      await this.dependencies.refreshCatalog();
      if (await this.stopIfCancelled()) return;

      this.publish("acquiring-media", null);
      const media = await this.dependencies.acquireMedia(this.descriptor.mediaSnapshotId);
      if (this.disposed || this.exitRequested || this.terminal) {
        await media.release();
        await this.stopIfCancelled();
        return;
      }
      this.media = media;

      this.publish("building-request", null);
      const request = await this.dependencies.buildRequest(this.descriptor, media);
      if (await this.stopIfCancelled()) return;

      this.publish("checking-audio", null);
      const audio = await this.dependencies.createAudio();
      if (audio.status === "rejected") throwFailure(audio.failure);
      if (this.disposed || this.exitRequested || this.terminal) {
        await audio.value.dispose();
        await this.stopIfCancelled();
        return;
      }
      this.audio = audio.value;
      if (audio.value.requiresUserActivation) {
        this.activationGate = deferred();
        this.publish("awaiting-host-activation", null);
        await this.activationGate.promise;
        this.activationGate = null;
        if (this.activationFailure !== null) throwFailure(this.activationFailure);
        if (await this.stopIfCancelled()) return;
        if (audio.value.phase !== "running") {
          throw new BrowserSimulatorLaunchDependencyError(
            "app.simulator.audio-context-not-running-after-activation",
            `The activation gate completed in phase ${audio.value.phase}; platform installation remains forbidden.`,
          );
        }
      } else if (audio.value.phase !== "running") {
        throw new BrowserSimulatorLaunchDependencyError(
          "app.simulator.audio-context-not-running",
          `The automatic launch route requires a running AudioContext, got ${audio.value.phase}.`,
        );
      }

      this.publish("creating-platform", null);
      const platform = await this.dependencies.createPlatform(audio.value.context);
      if (this.disposed || this.exitRequested || this.terminal) {
        platform.dispose();
        await this.stopIfCancelled();
        return;
      }
      this.platform = platform;
      this.dependencies.validatePlatform(platform);

      this.publish("installing-launcher", null);
      this.dependencies.installPlatform(platform.platform);
      if (await this.stopIfCancelled()) return;

      this.publish("launching", null);
      const launched = await this.dependencies.launch(request);
      await this.releaseMedia();
      if (launched.status === "rejected") throwFailure(launched.failure);
      if (this.disposed || this.terminal) {
        await this.stopIfCancelled();
        return;
      }
      if (this.exitRequested) {
        this.publish("closing", null);
        const report = await launched.closed;
        await this.finishFromReport(report);
        return;
      }

      this.publish("running", null);
      const report = await launched.closed;
      await this.finishFromReport(report);
    } catch (error) {
      await this.finishRejected(error);
    }
  }

  private async stopIfCancelled(): Promise<boolean> {
    if (!this.disposed && !this.exitRequested && !this.terminal) return false;
    if (this.exitRequested && !this.terminal) await this.finishClosedWithoutModule();
    return true;
  }

  private async finishFromReport(report: SimulatorModuleCloseReport): Promise<void> {
    if (this.terminal) return;
    this.terminal = true;
    this.publish("closing", null);
    if (report.failure !== null) {
      await this.publishClosedOnce({
        status: "rejected",
        capability: report.failure.capability,
        boundary: report.failure.boundary,
      });
      await this.cleanup();
      this.publish("rejected", Object.freeze({
        capability: report.failure.capability,
        boundary: report.failure.boundary,
      }));
      await this.leaveHostOnce();
      return;
    }
    await this.publishClosedOnce({ status: "closed", capability: null, boundary: null });
    await this.cleanup();
    this.publish("closed", null);
    await this.leaveHostOnce();
  }

  private async finishClosedWithoutModule(): Promise<void> {
    if (this.terminal) return;
    this.terminal = true;
    this.publish("closing", null);
    await this.publishClosedOnce({ status: "closed", capability: null, boundary: null });
    await this.cleanup();
    this.publish("closed", null);
    await this.leaveHostOnce();
  }

  private async finishRejected(error: unknown): Promise<void> {
    if (this.terminal) return;
    this.terminal = true;
    const failure = normalizeFailure(error);
    await this.publishClosedOnce({
      status: "rejected",
      capability: failure.capability,
      boundary: failure.boundary,
    });
    await this.cleanup();
    if (!this.disposed) this.publish("rejected", failure);
    await this.leaveHostOnce();
  }

  private async publishClosedOnce(input: {
    readonly status: "closed" | "rejected";
    readonly capability: string | null;
    readonly boundary: string | null;
  }): Promise<void> {
    if (this.closedPublished) return;
    this.closedPublished = true;
    try { await this.dependencies.publishClosed(input); } catch { /* terminal state remains authoritative */ }
  }

  private async leaveHostOnce(): Promise<void> {
    if (this.hostLeft) return;
    this.hostLeft = true;
    await this.dependencies.leaveHost();
  }

  private cleanup(): Promise<void> {
    if (this.cleanupPromise !== null) return this.cleanupPromise;
    this.cleanupPromise = (async () => {
      await this.releaseMedia();
      const platform = this.platform;
      this.platform = null;
      try { platform?.dispose(); } catch { /* all remaining owners still release */ }
      const audio = this.audio;
      this.audio = null;
      if (audio !== null) await audio.dispose();
    })();
    return this.cleanupPromise;
  }

  private async releaseMedia(): Promise<void> {
    const media = this.media;
    this.media = null;
    if (media !== null) await media.release();
  }

  private publish(
    phase: BrowserSimulatorLaunchPhase,
    failure: BrowserSimulatorLaunchFailure | null,
  ): void {
    if (this.disposed && phase !== "disposed" && phase !== "closed" && phase !== "rejected") return;
    this.stateValue = freezeState(phase, failure);
    this.onStateChange(this.stateValue);
  }
}

function deferred(): { resolve(): void; promise: Promise<void> } {
  let resolveValue!: () => void;
  const promise = new Promise<void>((resolve) => { resolveValue = resolve; });
  let resolved = false;
  return Object.freeze({
    resolve() {
      if (resolved) return;
      resolved = true;
      resolveValue();
    },
    promise,
  });
}

function freezeState(
  phase: BrowserSimulatorLaunchPhase,
  failure: BrowserSimulatorLaunchFailure | null,
): BrowserSimulatorLaunchState {
  return Object.freeze({ phase, failure });
}

function throwFailure(failure: BrowserSimulatorLaunchFailure): never {
  throw new BrowserSimulatorLaunchDependencyError(failure.capability, failure.boundary);
}

function normalizeFailure(error: unknown): BrowserSimulatorLaunchFailure {
  if (error instanceof BrowserSimulatorLaunchDependencyError) return error.failure;
  return Object.freeze({
    capability: "app.simulator.launch-unexpected-failure",
    boundary: error instanceof Error ? error.message : String(error),
  });
}
