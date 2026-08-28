import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";
import {
  appendSimulatorCleanupFailures,
  freezeSimulatorFailure,
  simulatorCleanupFailure,
} from "../public/failures";
import type {
  LaunchSimulatorModule,
  SimulatorModuleCloseReport,
  SimulatorModuleFailure,
  SimulatorModuleLaunchRequest,
  SimulatorModuleLaunchResult,
} from "../public/contracts";
import { rejected, type SimulatorAssemblyResult } from "../assembly/result";
import { consumeRehearsalControlCommand } from "../scene/rehearsalControlScene";
import {
  consumePauseControlCommand,
  createPauseControlLayout,
  PauseControlSceneOwner,
} from "../scene/pauseControlScene";
import type { SimulatorSurfaceState } from "../platform/surfaceContracts";
import type { SimulatorTimelineControlState } from "../host/portableReplaySession";
import type {
  AutonomousSimulatorEnvironment,
  SimulatorFrameSubscription,
  SimulatorOwnedSession,
  SimulatorRuntimeCommand,
} from "./contracts";

export class AutonomousSimulatorModule {
  private state: "idle" | "launching" | "running" | "closing" | "closed" = "idle";
  private session: SimulatorOwnedSession | null = null;
  private frameSubscription: SimulatorFrameSubscription | null = null;
  private expectedFrame = 0;
  private processingFrame = false;
  private resolveClosed: ((report: SimulatorModuleCloseReport) => void) | null = null;
  private closedPromise: Promise<SimulatorModuleCloseReport> | null = null;
  private readonly pauseControl = new PauseControlSceneOwner();

  constructor(private readonly environment: AutonomousSimulatorEnvironment) {}

  readonly launch: LaunchSimulatorModule = async (
    request: SimulatorModuleLaunchRequest,
  ): Promise<SimulatorModuleLaunchResult> => {
    if (this.state !== "idle") {
      return launchRejected(
        "launch-failed",
        "simulator.runtime.launch-not-idle",
        "An autonomous simulator module instance accepts exactly one launch and is never reused after ownership transfer or failure.",
      );
    }
    if (!validEnvironment(this.environment)) {
      this.state = "closed";
      return launchRejected(
        "platform-unavailable",
        "simulator.runtime.invalid-environment",
        "Autonomous launch requires internal scheduler, input and session-factory capabilities before ownership transfer.",
      );
    }
    this.state = "launching";
    let created;
    try {
      created = await this.environment.sessions.create(request);
    } catch {
      this.state = "closed";
      const cleanupFailure = this.disposeInput();
      const primary = moduleFailure(
        "launch-failed",
        "simulator.runtime.session-factory-threw",
        "An internal session-factory exception fails launch before lifecycle ownership transfers and has no fallback.",
      );
      return Object.freeze({
        status: "rejected" as const,
        failure: appendSimulatorCleanupFailures(primary, [cleanupFailure]),
      });
    }
    if (created.status === "rejected") {
      this.state = "closed";
      const cleanupFailure = this.disposeInput();
      return Object.freeze({
        status: "rejected" as const,
        failure: appendSimulatorCleanupFailures(created.failure, [cleanupFailure]),
      });
    }
    this.session = created.value;
    this.closedPromise = new Promise<SimulatorModuleCloseReport>((resolve) => {
      this.resolveClosed = resolve;
    });
    let scheduled: SimulatorAssemblyResult<SimulatorFrameSubscription>;
    try {
      scheduled = this.environment.scheduler.start((tick) => this.consumeFrame(tick));
    } catch {
      const failure = moduleFailure(
        "platform-unavailable",
        "simulator.runtime.scheduler-start-threw",
        "The internal frame scheduler threw before launch publication; the prepared session is closed without ownership transfer.",
      );
      const rejectedFailure = this.closeBeforeTransfer(failure);
      return Object.freeze({ status: "rejected" as const, failure: rejectedFailure });
    }
    if (scheduled.status === "rejected") {
      const rejectedFailure = this.closeBeforeTransfer(scheduled.failure);
      return Object.freeze({ status: "rejected" as const, failure: rejectedFailure });
    }
    this.frameSubscription = scheduled.value;
    this.state = "running";
    return Object.freeze({
      status: "accepted" as const,
      closed: this.closedPromise,
    });
  };

  private async consumeFrame(
    tick: { readonly sequence: number; readonly deltaTimeSeconds: number },
  ): Promise<void> {
    if (this.state !== "running") return;
    if (this.processingFrame) {
      this.closeTerminal(moduleFailure(
        "launch-failed",
        "simulator.runtime.overlapping-frame",
        "The autonomous scheduler must await each outer-frame consumer; overlapping ticks are terminal and are never merged or dropped.",
      ));
      return;
    }
    this.processingFrame = true;
    try {
      if (
        tick === null || typeof tick !== "object" ||
        tick.sequence !== this.expectedFrame ||
        !Number.isFinite(tick.deltaTimeSeconds) ||
        Math.fround(tick.deltaTimeSeconds) < 0
      ) {
        this.closeTerminal(moduleFailure(
          "integrity-failure",
          "simulator.runtime.invalid-frame-tick",
          "Outer-frame identities are contiguous and deltas must remain finite non-negative Float32 values; runtime never clamps or repairs them.",
        ));
        return;
      }
      const synchronized = this.session!.synchronizeSurface === undefined
        ? Object.freeze({ status: "ready" as const })
        : await this.session!.synchronizeSurface();
      if (synchronized.status === "closed") {
        this.closePublished(synchronized.report);
        return;
      }
      if (synchronized.status === "rejected") {
        this.closeTerminal(synchronized.failure);
        return;
      }
      const surface = this.session!.getSurfaceState();
      if (surface.status === "rejected") {
        this.closeTerminal(surface.failure);
        return;
      }
      const controlState = this.session!.getControlState();
      if (controlState.status === "rejected") {
        this.closeTerminal(controlState.failure);
        return;
      }
      const input = this.environment.input.consume(
        tick.sequence,
        controlState.value,
        surface.value,
      );
      if (input.status === "rejected") {
        this.closeTerminal(input.failure);
        return;
      }
      if (input.value.surfaceRevision !== surface.value.revision) {
        this.closeTerminal(moduleFailure(
          "integrity-failure",
          "simulator.runtime.input-surface-revision-mismatch",
          "The input batch must be produced against the exact surface revision validated before command consumption.",
        ));
        return;
      }
      let manualFrame = input.value.manualFrame;
      if (input.value.commands.length > 0) {
        manualFrame = null;
        for (const command of input.value.commands) {
          const applied = await this.applyCommand(command, controlState.value, surface.value);
          if (applied.status === "rejected") {
            this.closeTerminal(applied.failure);
            return;
          }
          if (this.state !== "running") return;
        }
      } else {
        const controlLayout = this.session!.getControlLayout();
        if (controlLayout.status === "rejected") {
          this.closeTerminal(controlLayout.failure);
          return;
        }
        const pauseLayout = createPauseControlLayout(controlLayout.value);
        if (pauseLayout.status !== "ok") {
          this.closeTerminal(moduleFailure("integrity-failure", pauseLayout.capability, pauseLayout.boundary));
          return;
        }
        const routed = this.pauseControl.route(
          tick.deltaTimeSeconds,
          manualFrame,
          controlState.value,
          pauseLayout.value,
          input.value.hardwareBack,
        );
        if (routed.status !== "ok") {
          this.closeTerminal(moduleFailure("integrity-failure", routed.capability, routed.boundary));
          return;
        }
        manualFrame = routed.value.manualFrame;
        for (const command of routed.value.commands) {
          const applied = await this.applyCommand(command, controlState.value, surface.value);
          if (applied.status === "rejected") {
            this.closeTerminal(applied.failure);
            return;
          }
          if (this.state !== "running") return;
        }
        let visualSnapshot = routed.value.snapshot;
        if (routed.value.commands.length > 0) {
          const refreshed = this.session!.getControlState();
          if (refreshed.status === "rejected") {
            this.closeTerminal(refreshed.failure);
            return;
          }
          visualSnapshot = this.pauseControl.snapshot(
            refreshed.value.mode,
            pauseLayout.value,
            refreshed.value.playable,
            refreshed.value.terminalPresentationActive === true,
            refreshed.value.hudAlpha,
          );
        }
        const published = this.session!.publishPauseControlState(visualSnapshot);
        if (published.status === "rejected") {
          this.closeTerminal(published.failure);
          return;
        }
      }
      const stepped = this.session!.step(
        tick.deltaTimeSeconds,
        manualFrame,
        input.value.surfaceRevision,
      );
      if (stepped.status === "rejected") {
        this.closeTerminal(stepped.failure);
        return;
      }
      this.expectedFrame += 1;
      if (stepped.status === "closed") this.closePublished(stepped.report);
    } catch (error) {
      this.closeTerminal(moduleFailure(
        "launch-failed",
        "simulator.runtime.frame-consumer-threw",
        `The first internal input, command or engine frame exception is terminal and closes the autonomous module exactly once. ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      ));
    } finally {
      this.processingFrame = false;
    }
  }

  private async applyCommand(
    command: SimulatorRuntimeCommand,
    controlState: SimulatorTimelineControlState,
    surface: SimulatorSurfaceState,
  ): Promise<SimulatorAssemblyResult<void>> {
    if (command === null || typeof command !== "object") {
      return rejected(
        "integrity-failure",
        "simulator.runtime.invalid-command",
        "The internal UI/input owner emits only platform lifecycle, opaque Pause UI or fixed Rehearsal MoveTime commands.",
      );
    }
    if (command.kind === "user-close") {
      const report = this.session!.close("user-closed");
      this.closePublished(report);
      return accepted(undefined);
    }
    if (command.kind === "platform-abort") {
      const report = this.session!.close("user-closed");
      this.closePublished(report);
      return accepted(undefined);
    }
    if (command.kind === "platform-pause") {
      return controlState.paused ? accepted(undefined) : this.session!.pause();
    }
    if (command.kind === "platform-resume") {
      return controlState.paused ? this.session!.resume() : accepted(undefined);
    }
    if (command.kind === "pause" || command.kind === "resume" || command.kind === "retry" || command.kind === "abort") {
      const consumed = consumePauseControlCommand(command, controlState, surface);
      if (consumed.status !== "ok") {
        return rejected("integrity-failure", consumed.capability, consumed.boundary);
      }
      if (consumed.value === "pause") return this.session!.pause();
      if (consumed.value === "resume") return this.session!.resume();
      if (consumed.value === "retry") return this.session!.retry();
      const report = this.session!.close("user-closed");
      this.closePublished(report);
      return accepted(undefined);
    }
    if (command.kind === "return-five-seconds" || command.kind === "advance-five-seconds") {
      const controlState = this.session!.getControlState();
      if (controlState.status === "rejected") return controlState;
      const surface = this.session!.getSurfaceState();
      if (surface.status === "rejected") return surface;
      const consumed = consumeRehearsalControlCommand(command, {
        ...controlState.value,
        surfaceRevision: surface.value.revision,
      });
      if (consumed.status !== "ok") {
        return rejected("integrity-failure", consumed.capability, consumed.boundary);
      }
      return this.session!.moveTime(
        consumed.value === "return-five-seconds" ? "return-five" : "advance-five",
      );
    }
    return rejected(
      "integrity-failure",
      "simulator.runtime.unknown-command",
      "Unknown internal runtime commands fail closed and are never treated as no-op.",
    );
  }

  private closeBeforeTransfer(failure: SimulatorModuleFailure): SimulatorModuleFailure {
    let sessionFailure = null;
    try {
      const report = this.session?.close("terminal-fault", failure);
      sessionFailure = report?.failure?.cleanupFailures === undefined
        ? null
        : report.failure.cleanupFailures;
    } catch {
      sessionFailure = [simulatorCleanupFailure(
        "simulator.runtime.prepublication-session-close-threw",
        "The prepared session close threw during pre-publication rollback; scheduler and input cleanup still ran.",
      )];
    }
    this.session = null;
    const schedulerFailure = this.stopScheduler();
    const inputFailure = this.disposeInput();
    this.resolveClosed = null;
    this.closedPromise = null;
    this.state = "closed";
    return appendSimulatorCleanupFailures(failure, [
      ...(sessionFailure ?? []),
      schedulerFailure,
      inputFailure,
    ]);
  }

  private closeTerminal(failure: SimulatorModuleFailure): void {
    if (this.state !== "running") return;
    let report: SimulatorModuleCloseReport;
    try {
      report = this.session!.close("terminal-fault", failure);
    } catch {
      report = Object.freeze({
        reason: "terminal-fault" as const,
        result: null,
        failure: appendSimulatorCleanupFailures(failure, [simulatorCleanupFailure(
          "simulator.runtime.terminal-session-close-threw",
          "The owned session close threw after the terminal primary failure; scheduler and input cleanup still ran.",
        )]),
        capabilities: createSimulatorModuleCapabilitySummary(null, null),
      });
    }
    this.closePublished(report);
  }

  private closePublished(report: SimulatorModuleCloseReport): void {
    if (this.state === "closing" || this.state === "closed") return;
    this.state = "closing";
    const schedulerFailure = this.stopScheduler();
    const inputFailure = this.disposeInput();
    this.session = null;
    const cleanupFailures = [schedulerFailure, inputFailure];
    const firstCleanupFailure = cleanupFailures.find(
      (failure): failure is SimulatorModuleFailure => failure !== null,
    ) ?? null;
    const published = report.failure !== null
      ? Object.freeze({
          ...report,
          failure: appendSimulatorCleanupFailures(report.failure, cleanupFailures),
        })
      : firstCleanupFailure === null
      ? report
      : Object.freeze({
          reason: "terminal-fault" as const,
          result: null,
          failure: appendSimulatorCleanupFailures(
            firstCleanupFailure,
            cleanupFailures.filter((failure) => failure !== firstCleanupFailure),
          ),
          capabilities: report.capabilities,
        });
    const frozen = freezeCloseReport(published);
    const resolve = this.resolveClosed;
    this.resolveClosed = null;
    this.state = "closed";
    resolve?.(frozen);
  }

  private stopScheduler(): SimulatorModuleFailure | null {
    const subscription = this.frameSubscription;
    this.frameSubscription = null;
    try {
      subscription?.stop();
      return null;
    } catch {
      return moduleFailure(
        "launch-failed",
        "simulator.runtime.scheduler-stop-threw",
        "An independently observable scheduler stop failure is terminal; cleanup still proceeds to the input owner.",
      );
    }
  }

  private disposeInput(): SimulatorModuleFailure | null {
    try {
      this.environment.input.dispose();
      this.pauseControl.dispose();
      return null;
    } catch {
      return moduleFailure(
        "launch-failed",
        "simulator.runtime.input-dispose-threw",
        "An independently observable input disposal failure is terminal and is never silently swallowed.",
      );
    }
  }
}

function validEnvironment(environment: AutonomousSimulatorEnvironment): boolean {
  return environment !== null && typeof environment === "object" &&
    environment.scheduler !== null && typeof environment.scheduler === "object" &&
    typeof environment.scheduler.start === "function" &&
    environment.input !== null && typeof environment.input === "object" &&
    typeof environment.input.consume === "function" && typeof environment.input.dispose === "function" &&
    environment.sessions !== null && typeof environment.sessions === "object" &&
    typeof environment.sessions.create === "function";
}

function freezeCloseReport(report: SimulatorModuleCloseReport): SimulatorModuleCloseReport {
  return Object.freeze({
    reason: report.reason,
    result: report.result === null ? null : Object.freeze({ ...report.result }),
    failure: report.failure === null ? null : freezeSimulatorFailure(report.failure),
    capabilities: Object.freeze({ ...report.capabilities }),
  });
}

function moduleFailure(
  code: SimulatorModuleFailure["code"],
  capability: string,
  boundary: string,
): SimulatorModuleFailure {
  return Object.freeze({ code, capability, boundary });
}

function launchRejected(
  code: SimulatorModuleFailure["code"],
  capability: string,
  boundary: string,
): SimulatorModuleLaunchResult {
  return Object.freeze({
    status: "rejected" as const,
    failure: moduleFailure(code, capability, boundary),
  });
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
