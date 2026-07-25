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
  readonly backend: "renderer" | "audio" | "input" | "resources" | "lifecycle";
  readonly action: string;
  readonly detail?: string;
}

export type SimulatorLifecycleBackendState = "running" | "paused";

export interface SimulatorLifecycleBackend {
  recordState(state: SimulatorLifecycleBackendState): void;
}

export interface SimulatorBackends {
  readonly renderer: SimulatorBackendPort;
  readonly audio: SimulatorBackendPort;
  readonly input: SimulatorBackendPort;
  readonly resources: SimulatorBackendPort;
  readonly lifecycle: SimulatorLifecycleBackend;
  snapshot(): readonly SimulatorBackendTraceEvent[];
}
