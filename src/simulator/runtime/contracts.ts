import type { ManualInputFrame } from "../engine/data/manualInput";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleFailure,
  SimulatorModuleLaunchRequest,
} from "../public/contracts";
import type { SimulatorAssemblyResult } from "../resources/sharedResourceAdapters";
import type { SimulatorTimelineControlState } from "../host/portableReplaySession";
import type { RehearsalControlCommand } from "../scene/rehearsalControlScene";

export interface SimulatorFrameTick {
  readonly sequence: number;
  readonly deltaTimeSeconds: number;
}

export interface SimulatorFrameSubscription {
  stop(): void;
}

export interface SimulatorFrameScheduler {
  start(
    consumer: (tick: SimulatorFrameTick) => Promise<void>,
  ): SimulatorAssemblyResult<SimulatorFrameSubscription>;
}

export type SimulatorRuntimeCommand =
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | RehearsalControlCommand
  | { readonly kind: "retry" }
  | { readonly kind: "abort" }
  | { readonly kind: "user-close" };

export interface SimulatorRuntimeInputBatch {
  readonly manualFrame: ManualInputFrame | null;
  readonly commands: readonly SimulatorRuntimeCommand[];
}

export interface SimulatorRuntimeInputSource {
  consume(
    sequence: number,
    controlState: SimulatorTimelineControlState,
  ): SimulatorAssemblyResult<SimulatorRuntimeInputBatch>;
  dispose(): void;
}

export type SimulatorOwnedSessionStepResult =
  | { readonly status: "running" }
  | { readonly status: "closed"; readonly report: SimulatorModuleCloseReport }
  | { readonly status: "rejected"; readonly failure: SimulatorModuleFailure };

export interface SimulatorOwnedSession {
  step(
    deltaTimeSeconds: number,
    manualFrame: ManualInputFrame | null,
  ): SimulatorOwnedSessionStepResult;
  pause(): SimulatorAssemblyResult<void>;
  resume(): SimulatorAssemblyResult<void>;
  moveTime(
    direction: "return-five" | "advance-five",
  ): Promise<SimulatorAssemblyResult<void>>;
  retry(): Promise<SimulatorAssemblyResult<void>>;
  getControlState(): SimulatorAssemblyResult<SimulatorTimelineControlState>;
  close(
    reason: "user-closed" | "terminal-fault",
    failure?: SimulatorModuleFailure,
  ): SimulatorModuleCloseReport;
}

export interface SimulatorOwnedSessionFactory {
  create(
    request: SimulatorModuleLaunchRequest,
  ): Promise<SimulatorAssemblyResult<SimulatorOwnedSession>>;
}

export interface AutonomousSimulatorEnvironment {
  readonly scheduler: SimulatorFrameScheduler;
  readonly input: SimulatorRuntimeInputSource;
  readonly sessions: SimulatorOwnedSessionFactory;
}
