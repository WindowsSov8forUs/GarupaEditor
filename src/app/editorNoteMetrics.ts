import { LANE_WIDTH as BASE_LANE_WIDTH } from "../chartCore";

// Preserve the editor's existing note proportions when the viewport changes lane width.
// Timeline zoom changes note spacing, not the shape of the note sprite.
export function editorNoteHeight(laneWidth: number, noteScale: number): number {
  return 24 * (laneWidth / BASE_LANE_WIDTH) * noteScale;
}

export function editorDirectionalSegmentWidth(laneWidth: number, noteScale: number): number {
  return Math.max(BASE_LANE_WIDTH * 1.34, 60) * (laneWidth / BASE_LANE_WIDTH) * noteScale;
}
