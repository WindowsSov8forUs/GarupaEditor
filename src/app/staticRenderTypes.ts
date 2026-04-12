import type { RenderConnectionSegment, RenderSimultaneousSegment } from "./hooks/useEditorRenderModel";

export type StaticOverlayMode = "none" | "flick" | "directional";

export type StaticNoteVisual = {
  id: string;
  type: string;
  x: number;
  y: number;
  spanLanes: number;
  base: string | null;
  overlay: string | null;
  overlayMode: StaticOverlayMode;
};

export type StaticBpmVisualLine = {
  key: string;
  beat: number;
  bpm: number;
};

export type StaticBpmTimelineNode = {
  beat: number;
  bpm: number;
  timeSec: number;
};

export type StaticRuntimeSkin = {
  longLine: string | null;
  longLineSpecial: string | null;
  simultaneousLine: string | null;
};

export type StaticRenderPayload = {
  schemaVersion: 1;
  chartTitle: string;
  boardWidth: number;
  boardHeight: number;
  laneValues: number[];
  laneWidth: number;
  noteVisualScale: number;
  totalSteps: number;
  beatDivision: number;
  beatsPerMeasure: number;
  totalDurationSec: number;
  timelinePixelsPerSecond: number;
  bpmTimeline: StaticBpmTimelineNode[];
  bpmVisualLines: StaticBpmVisualLine[];
  simultaneousSegments: RenderSimultaneousSegment[];
  connectionSegments: RenderConnectionSegment[];
  noteVisuals: StaticNoteVisual[];
  runtimeSkin: StaticRuntimeSkin;
};
