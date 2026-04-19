import type { BGSkin, FieldSkinAssets, SeSkinAssets, SkinAssets } from "../skinLoader";

export const SIMULATOR_WINDOW_READY_EVENT = "simulator:ready";
export const SIMULATOR_WINDOW_PAYLOAD_EVENT = "simulator:payload";

export type SimulatorDisplayPayload = {
  windowWidth?: number;
  windowHeight?: number;
  fps?: number;
  noteSizePercent?: number;
  noteSpeed?: number;
  offsetMs?: number;
  sameline?: boolean;
  colorAssist?: boolean;
  mirror?: boolean;
  effectEnable?: boolean;
  mvMode?: boolean;
  mvAlphaPercent?: number;
};

export type SimulatorAudioPayload = {
  bgmDataUrl?: string | null;
  seRuntimeAssets?: SeSkinAssets | null;
};

export type SimulatorMvPayload = {
  kind: "image" | "video";
  src: string;
  offsetMs?: number;
};

export type SimulatorSkinPayload = {
  noteSkin: SkinAssets;
  fieldSkin?: FieldSkinAssets | null;
  bgSkin?: BGSkin | null;
};

export type SimulatorChartNoteType =
  | "single"
  | "flick"
  | "skill"
  | "directional_flick_left"
  | "directional_flick_right"
  | "slide"
  | "hidden";

export type SimulatorChartNote = {
  id: string;
  type: SimulatorChartNoteType;
  lane: number;
  beat: number;
  timingGroup?: number;
  width?: number;
  endBeat?: number;
  endLane?: number;
};

export type SimulatorChartSlideChain = {
  id: string;
  noteIds: string[];
  timingGroup?: number;
};

export type SimulatorChartBpmEvent = {
  id?: string;
  beat: number;
  bpm: number;
};

export type SimulatorChartSvEvent = {
  id?: string;
  beat: number;
  value: number;
  timingGroup?: number;
};

export type SimulatorChartPayload = {
  baseBpm: number;
  notes: SimulatorChartNote[];
  slideChains: SimulatorChartSlideChain[];
  bpmEvents: SimulatorChartBpmEvent[];
  svEvents?: SimulatorChartSvEvent[];
};

export type SimulatorLaunchPayload = {
  requestId: string;
  chartData: SimulatorChartPayload;
  settings?: SimulatorDisplayPayload | null;
  audio?: SimulatorAudioPayload | null;
  mv?: SimulatorMvPayload | null;
  skin?: SimulatorSkinPayload | null;
  autoStart?: boolean;
};

export type SimulatorWindowReadyPayload = {
  requestId?: string;
  label?: string;
};

export type SimulatorWindowPayloadEnvelope = {
  requestId: string;
  payload: SimulatorLaunchPayload;
};
