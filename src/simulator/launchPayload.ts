import type { BGSkin, FieldSkinAssets, JudgeSkin, SeSkinAssets, SkinAssets } from "../skinLoader";
import type { ChartMetadata } from "../chartCore";

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
  habahiro?: boolean;
};

type SimulatorAudioPayload = {
  seRuntimeAssets?: SeSkinAssets | null;
  bgmVolumePercent?: number;
  seVolumePercent?: number;
};

export type SimulatorMvPayload = {
  kind: "image" | "video";
  src: string;
  offsetMs?: number;
};

type SimulatorChartMetadataPayload = ChartMetadata;

type SimulatorSkinPayload = {
  noteSkin: SkinAssets;
  fieldSkin?: FieldSkinAssets | null;
  bgSkin?: BGSkin | null;
  judgeSkin?: JudgeSkin | null;
};

type SimulatorChartNoteType =
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
  timingGroup?: string;
  width?: number;
  endBeat?: number;
  endLane?: number;
};

export type SimulatorChartSlideChain = {
  id: string;
  noteIds: string[];
  timingGroup?: string;
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
  timingGroup?: string;
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
  metadata?: SimulatorChartMetadataPayload | null;
  settings?: SimulatorDisplayPayload | null;
  audio?: SimulatorAudioPayload | null;
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
