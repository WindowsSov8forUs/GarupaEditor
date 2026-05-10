export interface SimulatorSettings {
  windowX: number;
  windowY: number;
  fps: number;
  noteSize: number;
  // Display.Notespeed uses GBP note-speed semantics in modern mode.
  noteSpeedRaw: number;
  noteSpeedFrames: number;
  noteSpeedSeconds: number;
  effectEnable: boolean;
  effectSize: number;
  effectNormalX: number;
  effectNormalY: number;
  effectFlickX: number;
  effectFlickY: number;
  effectSlideX: number;
  effectSlideY: number;
  sameline: boolean;
  grayEnabled: boolean;
  mirror: boolean;
  offsetMs: number;
  mvmode: boolean;
  mvAlpha: number;
}

export const DEFAULT_SETTINGS: SimulatorSettings = {
  windowX: 1280,
  windowY: 720,
  fps: 60,
  noteSize: 1,
  noteSpeedRaw: 9.7,
  noteSpeedFrames: 0,
  noteSpeedSeconds: 0,
  effectEnable: true,
  effectSize: 0.71,
  effectNormalX: 300,
  effectNormalY: 589,
  effectFlickX: 300,
  effectFlickY: 589,
  effectSlideX: 200,
  effectSlideY: 589,
  sameline: true,
  grayEnabled: true,
  mirror: false,
  offsetMs: 276,
  mvmode: false,
  mvAlpha: 0.3,
};

interface TimingGroupChange {
  atMs: number;
  speed: number;
  pos: number;
}

export interface TimingGroupDef {
  id: number;
  changes: TimingGroupChange[];
}

type RuntimeEventType = "music_start" | "bpm" | "note";

export type RuntimeNoteBaseType =
  | "single"
  | "flick"
  | "skill"
  | "hidden"
  | "directional_flick_left"
  | "directional_flick_right";

export type RuntimeSlideRole = "none" | "start" | "middle" | "end" | "hidden";

export interface RuntimeNoteSemantic {
  baseType: RuntimeNoteBaseType;
  slideRole: RuntimeSlideRole;
  directionalWidth: number;
}

export interface ChartEvent {
  beat: number;
  eventType: RuntimeEventType;
  note: RuntimeNoteSemantic | null;
  lane: number;
  tgId: number;
  tgPos: number;
  startMs: number;
  samelineLane: number | null;
  bpm: number;
  parentEventIndex: number;
}

export interface ParsedChart {
  initialBpm: number;
  events: ChartEvent[];
  noteCount: number;
  maxTimeMs: number;
  timingGroups: TimingGroupDef[];
}

export interface RuntimeStats {
  combo: number;
  notes: number;
  nps: number;
  npsMax: number;
  bpmValue: number;
  score: number;
  activeObjects: number;
  processedObjects: number;
  totalObjects: number;
  elapsedMs: number;
}

export interface ParticleTriggerEvent {
  note: RuntimeNoteSemantic;
  lane: number;
  elapsedMs: number;
  eventIndex: number;
}

export type RuntimeJudgeKind =
  | "perfect"
  | "great"
  | "good"
  | "bad"
  | "miss"
  | "auto"
  | "fast"
  | "slow";

export interface JudgeTriggerEvent {
  kind: RuntimeJudgeKind;
  lane: number;
  elapsedMs: number;
  eventIndex: number;
}

export interface ActiveNote {
  id: number;
  eventIndex: number;
  note: RuntimeNoteSemantic;
  lane: number;
  issameline: number | null;
  startMs: number;
  tgId: number;
  tgPos: number;
  started: boolean;
  sePlayed: boolean;
  t: number;
  gray: boolean;
  parentEventIndex: number;
  parentActiveId: number;
}

