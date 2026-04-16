export interface SimulatorSettings {
  windowX: number;
  windowY: number;
  fps: number;
  topX: number;
  topY: number;
  topDistance: number;
  bottomX: number;
  bottomY: number;
  bottomDistance: number;
  noteSize: number;
  // Display.Notespeed uses GBP note-speed semantics in modern mode.
  noteSpeedRaw: number;
  noteSpeed: number;
  noteSpeedFrames: number;
  noteSpeedSeconds: number;
  laneHeight: number;
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
  grayMultiplier: number;
  mirror: boolean;
  offset: number;
  mvmode: boolean;
  mvAlpha: number;
  displayHiddenSlideAmong: boolean;
}

export const DEFAULT_SETTINGS: SimulatorSettings = {
  windowX: 1280,
  windowY: 720,
  fps: 60,
  topX: 622,
  topY: 20,
  topDistance: 6,
  bottomX: 197,
  bottomY: 589,
  bottomDistance: 147,
  noteSize: 0.71,
  noteSpeedRaw: 9.7,
  noteSpeed: 0,
  noteSpeedFrames: 0,
  noteSpeedSeconds: 0,
  laneHeight: 569,
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
  grayMultiplier: 2,
  mirror: false,
  offset: 46,
  mvmode: false,
  mvAlpha: 0.3,
  displayHiddenSlideAmong: false
};

export interface PrecomputedLut {
  y: Float32Array;
  noteMovePercent: Float32Array;
  realNoteSize: Float32Array;
  widthPercent: Float32Array;
  x: Float32Array;
  flickArrowMove: Float32Array;
  flickFps: number;
  maxT: number;
}

export interface TimingGroupChange {
  atMs: number;
  speed: number;
  pos: number;
}

export interface TimingGroupDef {
  id: number;
  changes: TimingGroupChange[];
}

export interface ChartEvent {
  beat: number;
  type: number;
  lane: number;
  slideId: number;
  tgId: number;
  tgPos: number;
  startMs: number;
  samelineLane: number;
  bpm: number;
  parentEventIndex: number;
}

export interface ParsedChart {
  musicOffset: number;
  initialBpm: number;
  events: ChartEvent[];
  noteCount: number;
  maxTimeMs: number;
  musicStartMs: number;
  hasTimingGroup: boolean;
  timingGroups: TimingGroupDef[];
}

export interface RuntimeStats {
  combo: number;
  notes: number;
  nps: number;
  npsMax: number;
  bpmText: number;
  score: number;
  activeObjects: number;
  processedObjects: number;
  totalObjects: number;
  elapsedMs: number;
}

export type HitEffectKind = "normal" | "flick";

export interface HitEffectEvent {
  kind: HitEffectKind;
  lane: number;
}

export interface ActiveNote {
  id: number;
  eventIndex: number;
  type: number;
  lane: number;
  issameline: number;
  startMs: number;
  tgId: number;
  tgPos: number;
  visible: boolean;
  started: boolean;
  isFlick: boolean;
  sePlayed: boolean;
  t: number;
  renderT: number;
  x: number;
  y: number;
  percent: number;
  scale: number;
  gray: boolean;
  width: number;
  parentEventIndex: number;
  parentActiveId: number;
}

export interface MvConfig {
  id: string;
  rootDir: string;
  fps: number;
  frames: number;
  offset: number;
  alpha: number;
  width: number;
  height: number;
}
