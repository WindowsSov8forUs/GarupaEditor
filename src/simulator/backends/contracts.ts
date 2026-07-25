export interface SimulatorBackendPort {
  readonly id: string;
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
}
