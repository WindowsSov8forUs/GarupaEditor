export interface SimulatorBackendPort {
  readonly id: string;
}

export interface SimulatorBackends {
  readonly renderer: SimulatorBackendPort;
  readonly audio: SimulatorBackendPort;
  readonly input: SimulatorBackendPort;
  readonly resources: SimulatorBackendPort;
}
