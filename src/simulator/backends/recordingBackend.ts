import type { SimulatorBackendPort, SimulatorBackendRequest, SimulatorBackendTraceEvent } from "./contracts";

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

/** Diagnostic ports only; production composition supplies every executable backend. */
export class SimulatorBackendTrace {
  private readonly events: SimulatorBackendTraceEvent[] = [];
  readonly renderer = new RecordingPort("renderer", this.append.bind(this));
  readonly input = new RecordingPort("input", this.append.bind(this));
  readonly resources = new RecordingPort("resources", this.append.bind(this));

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
