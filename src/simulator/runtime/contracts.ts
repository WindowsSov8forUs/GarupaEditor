import type { ManualInputFrame } from "../engine/data/manualInput";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleFailure,
  SimulatorModuleLaunchRequest,
} from "../public/contracts";
import type { SimulatorAssemblyResult } from "../assembly/result";
import type { SimulatorTimelineControlState } from "../host/portableReplaySession";
import type { RehearsalControlCommand } from "../scene/rehearsalControlScene";
import type { PauseControlCommand, PauseControlSceneSnapshot } from "../scene/pauseControlScene";
import type { OriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import type { SimulatorSurfaceState } from "../platform/surfaceContracts";

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

export type SimulatorPlatformRuntimeCommand =
  | { readonly kind: "platform-pause" }
  | { readonly kind: "platform-resume" }
  | { readonly kind: "platform-abort" }
  | { readonly kind: "user-close" };

export type SimulatorRuntimeCommand =
  | PauseControlCommand
  | RehearsalControlCommand
  | SimulatorPlatformRuntimeCommand;

export interface SimulatorRuntimeInputBatch {
  readonly surfaceRevision: number;
  readonly manualFrame: ManualInputFrame | null;
  readonly hardwareBack: boolean;
  readonly commands: readonly SimulatorRuntimeCommand[];
}

export interface SimulatorRuntimeInputSource {
  consume(
    sequence: number,
    controlState: SimulatorTimelineControlState,
    surface: SimulatorSurfaceState,
  ): SimulatorAssemblyResult<SimulatorRuntimeInputBatch>;
  dispose(): void;
}

export type SimulatorOwnedSessionStepResult =
  | { readonly status: "running" }
  | { readonly status: "closed"; readonly report: SimulatorModuleCloseReport }
  | { readonly status: "rejected"; readonly failure: SimulatorModuleFailure };

export type SimulatorSurfaceSynchronizationResult =
  | { readonly status: "ready" }
  | { readonly status: "closed"; readonly report: SimulatorModuleCloseReport }
  | { readonly status: "rejected"; readonly failure: SimulatorModuleFailure };

export interface SimulatorOwnedSession {
  synchronizeSurface?(): Promise<SimulatorSurfaceSynchronizationResult>;
  step(
    deltaTimeSeconds: number,
    manualFrame: ManualInputFrame | null,
    surfaceRevision: number,
  ): SimulatorOwnedSessionStepResult;
  getSurfaceState(): SimulatorAssemblyResult<SimulatorSurfaceState>;
  getControlLayout(): SimulatorAssemblyResult<OriginalSurfaceLayout>;
  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorAssemblyResult<void>;
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
