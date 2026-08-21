import type { ResourceSnapshotId } from "../../resources/contracts";
import type { SimulatorLaunchConfig } from "../../simulator/public/contracts";

export const SIMULATOR_WINDOW_READY_EVENT = "simulator:ready";
export const SIMULATOR_WINDOW_PAYLOAD_EVENT = "simulator:payload";
export const SIMULATOR_WINDOW_CLOSED_EVENT = "simulator:closed";

export const SIMULATOR_MEDIA_SLOTS = Object.freeze({
  bgm: "simulator.media.bgm",
  jacket: "simulator.media.jacket",
  stage: "simulator.media.stage",
  mv: "simulator.media.mv",
} as const);

export interface SimulatorLaunchTransportDescriptor {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly mediaSnapshotId: ResourceSnapshotId;
  readonly chartJson: string;
  readonly isFullLength: false;
  readonly presentation: {
    readonly song: {
      readonly title: string;
      readonly bandName: string;
      readonly lyricist: string | null;
      readonly composer: string | null;
      readonly arranger: string | null;
    };
    readonly difficulty: {
      readonly type: "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";
      readonly level: number;
    };
    readonly mvEnabled: boolean;
    readonly mvMusicStartDelayMilliseconds: number;
  };
  readonly config: SimulatorLaunchConfig;
  readonly requestedWindow: {
    readonly width: number;
    readonly height: number;
  };
}

export interface SimulatorWindowReadyPayload {
  readonly requestId: string;
  readonly label: string;
}

export interface SimulatorWindowPayloadEnvelope {
  readonly requestId: string;
  readonly descriptor: SimulatorLaunchTransportDescriptor;
}

export interface SimulatorWindowClosedPayload {
  readonly requestId: string;
  readonly status: "closed" | "rejected";
  readonly capability: string | null;
}
