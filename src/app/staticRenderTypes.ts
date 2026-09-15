import type { RenderConnectionSegment, RenderSimultaneousSegment } from "./hooks/useEditorRenderModel";

export type StaticOverlayMode = "none" | "flick" | "directional";

export type StaticNoteVisual = {
  id: string;
  type: string;
  x: number;
  y: number;
  spanLanes: number;
  baseResourceKey: string | null;
  overlayResourceKey: string | null;
  overlayMode: StaticOverlayMode;
};

export type StaticBpmVisualLine = {
  key: string;
  beat: number;
  bpm: number;
};

export type StaticSvVisualLine = {
  key: string;
  beat: number;
  value: number;
  timingGroup: string;
};

export type StaticBpmTimelineNode = {
  beat: number;
  bpm: number;
  timeSec: number;
};

export type StaticRuntimeSkin = {
  longLineResourceKey: string;
  longLineSpecialResourceKey: string;
  simultaneousLineResourceKey: string;
};

export type StaticRenderPayload = {
  schemaVersion: 2;
  resourceSnapshotId: string;
  skinIdentities: {
    rhythm: string;
    directional: string;
    judge: string;
  };
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
  svVisualLines: StaticSvVisualLine[];
  simultaneousSegments: RenderSimultaneousSegment[];
  connectionSegments: RenderConnectionSegment[];
  noteVisuals: StaticNoteVisual[];
  runtimeSkin: StaticRuntimeSkin;
};
