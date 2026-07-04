import type { TimingGroupDef, VisibilityWindow } from "./timingGroup";

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
  habahiro: boolean;
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
  habahiro: false,
};

export type RuntimeEventType = "music_start" | "bpm" | "note" | "slide";

export type RuntimeNoteBaseType =
  | "single"
  | "flick"
  | "skill"
  | "hidden"
  | "directional_flick_left"
  | "directional_flick_right";

export type RuntimeSlideRole = "none" | "start" | "middle" | "end" | "hidden";
export type RuntimeSlideType = "long" | "slide" | "hidden";

export interface RuntimeNoteSemantic {
  baseType: RuntimeNoteBaseType;
  slideRole: RuntimeSlideRole;
  directionalWidth: number;
  rhythmWidth: number;
}

interface ChartEventBase {
  beat: number;
  eventType: RuntimeEventType;
  startMs: number;
  hitMs: number;
  visibleEndMs: number;
}

export interface MusicStartChartEvent extends ChartEventBase {
  eventType: "music_start";
  bpm: number;
}

export interface BpmChartEvent extends ChartEventBase {
  eventType: "bpm";
  bpm: number;
}

export interface NoteChartEvent extends ChartEventBase {
  eventType: "note";
  note: RuntimeNoteSemantic;
  lane: number;
  tgId: number;
  tgPos: number;
  visibilityWindows: VisibilityWindow[];
  samelineGroup: number | null;
  prevSlideNodeEventIndex: number;
  nextSlideNodeEventIndex: number;
  slideChainEventIndex: number;
}

export interface SlideChartEvent extends ChartEventBase {
  eventType: "slide";
  lane: number;
  tgId: number;
  tgPos: number;
  nodeEventIndices: number[];
  headNodeEventIndex: number;
  tailNodeEventIndex: number;
  slideType: RuntimeSlideType;
}

export type ChartEvent =
  | MusicStartChartEvent
  | BpmChartEvent
  | NoteChartEvent
  | SlideChartEvent;

export interface SimultaneousGroup {
  groupIndex: number;
  eventIndices: number[];
}

export interface ParsedChart {
  initialBpm: number;
  events: ChartEvent[];
  noteCount: number;
  maxTimeMs: number;
  timingGroups: TimingGroupDef[];
  simultaneousGroups: SimultaneousGroup[];
}

export interface RuntimeStats {
  combo: number;
  notes: number;
  nps: number;
  npsMax: number;
  bpmValue: number;
  score: number;
  scoreMax: number;
  life: number;
  lifeMax: number;
  activeObjects: number;
  processedObjects: number;
  totalObjects: number;
  elapsedMs: number;
}

export interface RuntimeNoteLifecycleState {
  eventIndex: number;
  spawned: boolean;
  started: boolean;
  inWindow: boolean;
  consumed: boolean;
  judged: boolean;
  hidden: boolean;
}

export interface RuntimeSlideLifecycleState {
  eventIndex: number;
  spawned: boolean;
  active: boolean;
}

export interface RuntimeSlideMarkerState {
  sourceEventIndex: number;
  sourceBaseType: RuntimeNoteSemantic["baseType"];
  sourceIsHead: boolean;
  sourceRhythmWidth: number;
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

export type LifeFeedbackEventKind = "damage" | "heal" | "set";

export interface LifeFeedbackEvent {
  kind: LifeFeedbackEventKind;
  amount: number;
  delta: number;
  lifeBefore: number;
  lifeAfter: number;
  lifeMax: number;
  elapsedMs: number;
}

export interface ActiveNote {
  id: number;
  eventIndex: number;
  note: RuntimeNoteSemantic;
  lane: number;
  samelineGroup: number | null;
  startMs: number;
  hitMs: number;
  visibleEndMs: number;
  visibilityWindows: VisibilityWindow[];
  tgId: number;
  tgPos: number;
  started: boolean;
  t: number;
  gray: boolean;
  prevSlideNodeEventIndex: number;
  prevSlideNodeActiveId: number;
  nextSlideNodeEventIndex: number;
  slideChainEventIndex: number;
  activeSlide: ActiveSlide | null;
  inWindow: boolean;
  consumed: boolean;
}

export interface ActiveSlide {
  id: number;
  eventIndex: number;
  startMs: number;
  hitMs: number;
  visibleEndMs: number;
  lane: number;
  tgId: number;
  tgPos: number;
  nodeEventIndices: number[];
  headNodeEventIndex: number;
  tailNodeEventIndex: number;
  slideType: RuntimeSlideType;
  active: boolean;
  marker: RuntimeSlideMarkerState | null;
}
