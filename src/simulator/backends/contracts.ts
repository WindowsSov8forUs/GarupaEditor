import type { ButtonTypeValue } from "../engine/chart/types";
import type { ManualInputPosition } from "../engine/data/manualInput";
import type { SimulatorResult } from "../engine/evidence";
import type { SimulatorRendererBackend } from "./renderingContracts";
import type { SimulatorAudioBackend } from "./audioContracts";
import type {
  SimulatorParticleBackend,
  SimulatorParticleRendererBackend,
} from "./particleContracts";

export interface SimulatorBackendPort {
  readonly id: string;
  record(request: SimulatorBackendRequest): void;
}

export interface SimulatorBackendRequest {
  readonly action: string;
  readonly detail?: string;
}

export interface SimulatorBackendTraceEvent {
  readonly sequence: number;
  readonly backend: "renderer" | "audio" | "input" | "resources" | "lifecycle" | "frame-rate";
  readonly action: string;
  readonly detail?: string;
}

export type SimulatorLifecycleBackendState = "running" | "paused";

export interface SimulatorLifecycleBackend {
  recordState(state: SimulatorLifecycleBackendState): void;
}

export interface SimulatorFrameRateBackend {
  requestTargetFrameRate(value: 60 | 120): void;
}

export interface ManualInputWorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SimulatorManualInputGeometryBackend {
  resolveButton(
    position: ManualInputPosition,
  ): SimulatorResult<ButtonTypeValue | null>;
  screenToWorld(
    position: ManualInputPosition,
  ): SimulatorResult<ManualInputWorldPosition>;
  getDistanceNormalization(): SimulatorResult<{
    readonly cameraScale: number;
    readonly gameplayScale: number;
  }>;
  isInsideTargetButtons(
    position: ManualInputPosition,
    buttonTypes: readonly ButtonTypeValue[],
  ): SimulatorResult<boolean>;
  projectScreenToGameplayLocalX?(
    position: ManualInputPosition,
  ): SimulatorResult<number>;
  getGameplayButtonLocalY?(
    buttonType: ButtonTypeValue,
  ): SimulatorResult<number>;
  getSlideCurrentLocalY?(
    source: import("../engine/chart/types").NoteInformation,
    adjustedMusicPosition: number,
  ): SimulatorResult<number>;
  setHabahiroLaneChanged?(): void;
  getSlideJudgeGeometry?(
    source: import("../engine/chart/types").NoteInformation,
  ): SimulatorResult<{
    readonly positions: readonly number[];
    readonly virtualPerfectLine: number;
  }>;
}

export interface SimulatorBackends {
  readonly renderer: SimulatorBackendPort;
  readonly rendering?: SimulatorRendererBackend;
  readonly audio: SimulatorAudioBackend;
  readonly particles?: SimulatorParticleBackend;
  readonly particleRendering?: SimulatorParticleRendererBackend;
  readonly input: SimulatorBackendPort;
  readonly resources: SimulatorBackendPort;
  readonly lifecycle: SimulatorLifecycleBackend;
  readonly frameRate: SimulatorFrameRateBackend;
  readonly manualInputGeometry: SimulatorManualInputGeometryBackend;
  snapshot(): readonly SimulatorBackendTraceEvent[];
}
