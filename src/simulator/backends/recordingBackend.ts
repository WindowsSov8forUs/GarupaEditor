import { evidenceRequired, type SimulatorResult } from "../engine/evidence";
import type { ButtonTypeValue } from "../engine/chart/types";
import type { ManualInputPosition } from "../engine/data/manualInput";
import type { SimulatorRendererBackend } from "./renderingContracts";
import { RecordingSimulatorAudioBackend } from "./recordingAudioBackend";
import type {
  ManualInputWorldPosition,
  SimulatorBackendPort,
  SimulatorBackendRequest,
  SimulatorBackends,
  SimulatorBackendTraceEvent,
  SimulatorLifecycleBackend,
  SimulatorLifecycleBackendState,
  SimulatorFrameRateBackend,
  SimulatorManualInputGeometryBackend,
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

class UnavailableManualInputGeometryPort implements SimulatorManualInputGeometryBackend {
  resolveButton(
    _position: ManualInputPosition,
  ): SimulatorResult<ButtonTypeValue | null> {
    return evidenceRequired(
      "manual-input.geometry-resolver-unavailable",
      ["D03", "D04", "D15", "MJ03", "MJ26"],
      "The recording backend does not invent a lane from a raw screen position.",
    );
  }

  screenToWorld(
    _position: ManualInputPosition,
  ): SimulatorResult<ManualInputWorldPosition> {
    return evidenceRequired(
      "manual-input.screen-to-world-unavailable",
      ["D07", "MJ08", "MJ09"],
      "The recording backend does not invent a Unity Camera projection.",
    );
  }

  getDistanceNormalization(): SimulatorResult<{
    readonly cameraScale: number;
    readonly gameplayScale: number;
  }> {
    return evidenceRequired(
      "manual-input.distance-normalization-unavailable",
      ["D07", "MJ08", "MJ09"],
      "The recording backend does not invent the original camera and gameplay scales.",
    );
  }

  isInsideTargetButtons(
    _position: ManualInputPosition,
    _buttonTypes: readonly ButtonTypeValue[],
  ): SimulatorResult<boolean> {
    return evidenceRequired(
      "manual-input.target-containment-unavailable",
      ["D09", "D10", "MJ14", "MJ20"],
      "The recording backend does not invent target-button collision geometry.",
    );
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
  readonly audio = new RecordingSimulatorAudioBackend();
  readonly input = new RecordingPort("input", this.append.bind(this));
  readonly resources = new RecordingPort("resources", this.append.bind(this));
  readonly lifecycle = new RecordingLifecyclePort(this.append.bind(this));
  readonly frameRate = new RecordingFrameRatePort(this.append.bind(this));
  readonly manualInputGeometry = new UnavailableManualInputGeometryPort();

  constructor(readonly rendering?: SimulatorRendererBackend) {}

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

export function createRecordingSimulatorBackends(
  rendering?: SimulatorRendererBackend,
): RecordingSimulatorBackends {
  return new RecordingSimulatorBackends(rendering);
}
