export type BrowserAudioContextCapabilityPhase =
  | "running"
  | "user-activation-required"
  | "activating"
  | "rejected"
  | "disposed";

export interface BrowserAudioContextFailure {
  readonly capability: string;
  readonly boundary: string;
}

export type BrowserAudioContextResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: BrowserAudioContextFailure };

export interface BrowserAudioContextCapability {
  readonly context: AudioContext;
  readonly phase: BrowserAudioContextCapabilityPhase;
  readonly requiresUserActivation: boolean;
  activateFromPointer(): Promise<BrowserAudioContextResult<void>>;
  dispose(): Promise<void>;
}

export type BrowserAudioContextFactory = () => AudioContext;

export async function createBrowserAudioContextCapability(
  factory: BrowserAudioContextFactory = () => new AudioContext({ latencyHint: "interactive" }),
): Promise<BrowserAudioContextResult<BrowserAudioContextCapability>> {
  let context: AudioContext;
  try {
    context = factory();
  } catch {
    return rejected(
      "app.simulator.audio-context-construction-failed",
      "The player host could not construct its application-owned AudioContext; no silent-media or alternate backend fallback is allowed.",
    );
  }
  if (context.state !== "running" && context.state !== "suspended") {
    await closeAfterFailure(context);
    return rejected(
      "app.simulator.audio-context-invalid-initial-state",
      `The player host created an AudioContext in unsupported state ${String(context.state)}; only running or suspended can enter the launch owner.`,
    );
  }
  return accepted(new OwnedBrowserAudioContextCapability(context));
}

class OwnedBrowserAudioContextCapability implements BrowserAudioContextCapability {
  private phaseValue: BrowserAudioContextCapabilityPhase;
  private disposePromise: Promise<void> | null = null;

  constructor(readonly context: AudioContext) {
    this.phaseValue = context.state === "running" ? "running" : "user-activation-required";
  }

  get phase(): BrowserAudioContextCapabilityPhase { return this.phaseValue; }
  get requiresUserActivation(): boolean { return this.phaseValue === "user-activation-required"; }

  activateFromPointer(): Promise<BrowserAudioContextResult<void>> {
    if (this.phaseValue !== "user-activation-required") {
      return Promise.resolve(rejected(
        "app.simulator.audio-context-activation-not-available",
        `Host audio activation is one-use and requires the exact user-activation-required phase; current phase is ${this.phaseValue}.`,
      ));
    }
    this.phaseValue = "activating";
    let pending: Promise<void>;
    try {
      pending = this.context.resume();
    } catch {
      this.phaseValue = "rejected";
      return this.rejectAndClose(
        "app.simulator.audio-context-resume-threw",
        "AudioContext.resume threw synchronously inside the pointer handler; the host must fail closed.",
      );
    }
    return pending.then(async () => {
      if (this.phaseValue === "disposed") {
        return rejected(
          "app.simulator.audio-context-activation-after-dispose",
          "The host was disposed while AudioContext activation was pending.",
        );
      }
      if (this.context.state !== "running") {
        this.phaseValue = "rejected";
        return this.rejectAndClose(
          "app.simulator.audio-context-resume-not-running",
          `AudioContext.resume completed in state ${String(this.context.state)} instead of running.`,
        );
      }
      this.phaseValue = "running";
      return accepted(undefined);
    }, async () => {
      if (this.phaseValue !== "disposed") this.phaseValue = "rejected";
      return this.rejectAndClose(
        "app.simulator.audio-context-resume-rejected",
        "AudioContext.resume rejected in the user pointer path; no retry, silent media or replacement context is substituted.",
      );
    });
  }

  async dispose(): Promise<void> {
    if (this.disposePromise !== null) return this.disposePromise;
    this.phaseValue = "disposed";
    this.disposePromise = closeAfterFailure(this.context);
    return this.disposePromise;
  }

  private async rejectAndClose(
    capability: string,
    boundary: string,
  ): Promise<BrowserAudioContextResult<void>> {
    await closeAfterFailure(this.context);
    return rejected(capability, boundary);
  }
}

async function closeAfterFailure(context: AudioContext): Promise<void> {
  if (context.state === "closed") return;
  try { await context.close(); } catch { /* terminal cleanup is best-effort after a fail-closed result */ }
}

function accepted<T>(value: T): BrowserAudioContextResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

function rejected<T>(capability: string, boundary: string): BrowserAudioContextResult<T> {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({ capability, boundary }),
  });
}
