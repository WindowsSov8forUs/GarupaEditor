import type {
  SimulatorBackendPort,
  SimulatorBackendRequest,
  SimulatorBackends,
  SimulatorBackendTraceEvent,
  SimulatorLifecycleBackend,
  SimulatorLifecycleBackendState,
  SimulatorFrameRateBackend,
} from "./contracts";

type RecordedBackend = SimulatorBackendTraceEvent["backend"];

class RecordingPort implements SimulatorBackendPort {
  constructor(
    readonly id: RecordedBackend,
    private readonly append: (
      backend: RecordedBackend,
      request: SimulatorBackendRequest,
    ) => void,
  ) {}

  record(request: SimulatorBackendRequest): void {
    this.append(this.id, request);
  }
}

class RecordingLifecyclePort implements SimulatorLifecycleBackend {
  constructor(
    private readonly append: (
      backend: RecordedBackend,
      request: SimulatorBackendRequest,
    ) => void,
  ) {}

  recordState(state: SimulatorLifecycleBackendState): void {
    this.append("lifecycle", { action: "state", detail: state });
  }
}

class RecordingFrameRatePort implements SimulatorFrameRateBackend {
  constructor(
    private readonly append: (
      backend: RecordedBackend,
      request: SimulatorBackendRequest,
    ) => void,
  ) {}

  requestTargetFrameRate(value: 60 | 120): void {
    this.append("frame-rate", {
      action: "request-target-frame-rate",
      detail: String(value),
    });
  }
}

export class RecordingSimulatorBackends implements SimulatorBackends {
  private readonly events: SimulatorBackendTraceEvent[] = [];

  readonly renderer = new RecordingPort("renderer", this.append.bind(this));
  readonly audio = new RecordingPort("audio", this.append.bind(this));
  readonly input = new RecordingPort("input", this.append.bind(this));
  readonly resources = new RecordingPort("resources", this.append.bind(this));
  readonly lifecycle = new RecordingLifecyclePort(this.append.bind(this));
  readonly frameRate = new RecordingFrameRatePort(this.append.bind(this));

  snapshot(): readonly SimulatorBackendTraceEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  private append(
    backend: RecordedBackend,
    request: SimulatorBackendRequest,
  ): void {
    this.events.push({
      sequence: this.events.length,
      backend,
      action: request.action,
      ...(request.detail === undefined ? {} : { detail: request.detail }),
    });
  }
}

export function createRecordingSimulatorBackends(): RecordingSimulatorBackends {
  return new RecordingSimulatorBackends();
}
