import type { ResolvedOriginalSkinRecipe } from "../simulator/public/settings";
import type { RenderConnectionSegment, RenderSimultaneousSegment } from "./hooks/useEditorRenderModel";

/*
 * What the editor hands the preview window (StaticChartRenderWindow): the chart placed in time, not on the editor's
 * board. Every y is a time in seconds (no SV transform: every timing group on one axis); every x is in lanes (1 a lane,
 * 0 at the board's left edge). The preview lays the chart out on its own scale.
 */

export type StaticOverlayMode = "none" | "flick" | "directional";

export type StaticNoteVisual = {
  id: string;
  type: string;
  /** The note's centre, in lanes. */
  x: number;
  timeSec: number;
  spanLanes: number;
  baseResourceKey: string | null;
  overlayResourceKey: string | null;
  overlayMode: StaticOverlayMode;
  /** As CanvasNoteVisual's: how far down the base sprite is drawn, as a fraction of the note's height. */
  baseShiftY?: number;
};

export type StaticBpmVisualLine = { key: string; beat: number; bpm: number };

export type StaticSvVisualLine = { key: string; beat: number; value: number; timingGroup: string };

/** A HABAHIRO `#LANE_CHANGE`; `effective` is the latest one, the only one the original applies. */
export type StaticLaneChangeVisualLine = { key: string; beat: number; effective: boolean };

export type StaticBpmTimelineNode = { beat: number; bpm: number; timeSec: number };

export type StaticRuntimeSkin = {
  longLineResourceKey: string;
  curveSlideLineResourceKey: string;
  simultaneousLineResourceKey: string;
  directionalBackLineLeftResourceKey: string;
  directionalBackLineRightResourceKey: string;
};

export type StaticRenderPayload = {
  schemaVersion: 3;
  resourceSnapshotId: string;
  skinIdentities: {
    rhythm: string;
    directional: string;
    judge: string;
  };
  /**
   * The simulator skin settings, resolved by the editor (the period-limited skins are known only there): the preview's
   * background and lane art are the ones they pick, as the editor's track and the skin settings preview show them.
   */
  skinRecipe: ResolvedOriginalSkinRecipe;
  /**
   * A HABAHIRO chart's lane art, as the live forces it whatever the skin settings: the skin00 field until the lane
   * change (the latest #LANE_CHANGE, `swapTimeSec` being when the field changes: its time plus ChangeLane's 0.41667 s;
   * null without one), the HABAHIRO field after. Absent for an ordinary chart, whose lane art is skinRecipe's field.
   */
  habahiroLane?: { beforeField: string; afterField: string; swapTimeSec: number | null };
  chartTitle: string;
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";
  difficultyLevel: string;
  laneCount: number;
  noteVisualScale: number;
  beatsPerMeasure: number;
  totalBeats: number;
  totalDurationSec: number;
  bpmTimeline: StaticBpmTimelineNode[];
  bpmVisualLines: StaticBpmVisualLine[];
  svVisualLines: StaticSvVisualLine[];
  laneChangeVisualLines: StaticLaneChangeVisualLine[];
  /** y, toY in seconds; fromX, toX, width in lanes. */
  simultaneousSegments: RenderSimultaneousSegment[];
  /** fromY, toY, deltaY, minY, maxY in seconds; fromX, toX, deltaX in lanes. */
  connectionSegments: RenderConnectionSegment[];
  noteVisuals: StaticNoteVisual[];
  /** Every note's (Hidden ones too) time and lane: the lane it sits on (its centre, a Directional's root), lanes 0-6
   * the standard track. */
  noteLanes: { timeSec: number; lane: number }[];
  runtimeSkin: StaticRuntimeSkin;
};
