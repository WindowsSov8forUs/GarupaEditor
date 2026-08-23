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

export type SimulatorTransportFloat32Bits = `0x${string}`;

export type SimulatorLaunchTransportConfig = Omit<SimulatorLaunchConfig, "visual" | "audio"> & {
  readonly visual: {
    readonly specificSpeed: SimulatorTransportFloat32Bits;
    readonly noteSize: SimulatorTransportFloat32Bits;
    readonly habahiroMeshWidthSetting: SimulatorTransportFloat32Bits;
  };
  readonly audio: {
    readonly masterGain: SimulatorTransportFloat32Bits;
    readonly bgmGain: SimulatorTransportFloat32Bits;
    readonly seGain: SimulatorTransportFloat32Bits;
  };
};

export interface SimulatorLaunchTransportDescriptor {
  readonly schemaVersion: 2;
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
  readonly config: SimulatorLaunchTransportConfig;
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

export function encodeSimulatorLaunchTransportConfig(
  config: SimulatorLaunchConfig,
): SimulatorLaunchTransportConfig {
  return Object.freeze({
    sessionMode: config.sessionMode,
    inputMode: config.inputMode,
    highFrequencyMode: config.highFrequencyMode,
    judgementAdjustValue: config.judgementAdjustValue,
    judgementAdjustValueB: config.judgementAdjustValueB,
    syncLine: config.syncLine,
    noteColor: config.noteColor,
    visibleTapLaneEffect: config.visibleTapLaneEffect,
    mvDarkness: config.mvDarkness,
    skin: config.skin,
    visual: Object.freeze({
      specificSpeed: encodeFloat32(config.visual.specificSpeed, "specificSpeed"),
      noteSize: encodeFloat32(config.visual.noteSize, "noteSize"),
      habahiroMeshWidthSetting: encodeFloat32(
        config.visual.habahiroMeshWidthSetting,
        "habahiroMeshWidthSetting",
      ),
    }),
    audio: Object.freeze({
      masterGain: encodeFloat32(config.audio.masterGain, "masterGain"),
      bgmGain: encodeFloat32(config.audio.bgmGain, "bgmGain"),
      seGain: encodeFloat32(config.audio.seGain, "seGain"),
    }),
  });
}

export function decodeSimulatorLaunchTransportConfig(
  config: SimulatorLaunchTransportConfig,
): SimulatorLaunchConfig {
  if (
    config === null || typeof config !== "object" || Array.isArray(config) ||
    Object.keys(config).sort().join(",") !==
      "audio,highFrequencyMode,inputMode,judgementAdjustValue,judgementAdjustValueB,mvDarkness,noteColor,sessionMode,skin,syncLine,visibleTapLaneEffect,visual" ||
    config.visual === null || typeof config.visual !== "object" || Array.isArray(config.visual) ||
    Object.keys(config.visual).sort().join(",") !==
      "habahiroMeshWidthSetting,noteSize,specificSpeed" ||
    config.audio === null || typeof config.audio !== "object" || Array.isArray(config.audio) ||
    Object.keys(config.audio).sort().join(",") !== "bgmGain,masterGain,seGain"
  ) throw new Error("Simulator transport config requires the exact Schema 12 projection and six Float32 bit strings.");
  return Object.freeze({
    sessionMode: config.sessionMode,
    inputMode: config.inputMode,
    highFrequencyMode: config.highFrequencyMode,
    judgementAdjustValue: config.judgementAdjustValue,
    judgementAdjustValueB: config.judgementAdjustValueB,
    syncLine: config.syncLine,
    noteColor: config.noteColor,
    visibleTapLaneEffect: config.visibleTapLaneEffect,
    mvDarkness: config.mvDarkness,
    skin: config.skin,
    visual: Object.freeze({
      specificSpeed: decodeFloat32(config.visual.specificSpeed, "specificSpeed"),
      noteSize: decodeFloat32(config.visual.noteSize, "noteSize"),
      habahiroMeshWidthSetting: decodeFloat32(
        config.visual.habahiroMeshWidthSetting,
        "habahiroMeshWidthSetting",
      ),
    }),
    audio: Object.freeze({
      masterGain: decodeFloat32(config.audio.masterGain, "masterGain"),
      bgmGain: decodeFloat32(config.audio.bgmGain, "bgmGain"),
      seGain: decodeFloat32(config.audio.seGain, "seGain"),
    }),
  });
}

function encodeFloat32(value: number, label: string): SimulatorTransportFloat32Bits {
  if (typeof value !== "number" || !Number.isFinite(value) || !Object.is(value, Math.fround(value))) {
    throw new Error(`Simulator transport ${label} must already be one exact finite Float32; rounding repair is forbidden.`);
  }
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  return `0x${view.getUint32(0, false).toString(16).padStart(8, "0").toUpperCase()}`;
}

function decodeFloat32(value: SimulatorTransportFloat32Bits, label: string): number {
  if (typeof value !== "string" || !/^0x[0-9A-F]{8}$/.test(value)) {
    throw new Error(`Simulator transport ${label} requires one uppercase 32-bit hexadecimal payload.`);
  }
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, Number.parseInt(value.slice(2), 16), false);
  const decoded = view.getFloat32(0, false);
  if (!Number.isFinite(decoded)) {
    throw new Error(`Simulator transport ${label} cannot decode NaN or infinity.`);
  }
  return decoded;
}
