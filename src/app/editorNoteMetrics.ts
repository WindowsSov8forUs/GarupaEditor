/*
 * Note and line sizes, as the original draws a note stopped on the judge line (the simulator's reconstruction: a
 * stopped note's scale is the note setting scale, one lane is 2.2 note-local units, a sprite is its atlas px / 100
 * note-local units, a note's icon sits at its clip's first key in note-local units). In lanes, these are times the
 * lane width and the note size option; the editor has no perspective.
 */

/** Atlas px per lane: 100 px per note-local unit, 2.2 note-local units per lane. */
const SPRITE_PX_PER_LANE = 220;
/** Note body sprites are 120 px tall; one lane wide is 308 px, a HABAHIRO body n lanes wide is this many px. */
const NOTE_BODY_HEIGHT_PX = 120;
const NOTE_BODY_WIDTH_PX = [308, 524, 736, 952, 1164, 1380, 1596];
/** A line (NoteMesh) is 2 note-local units per button wide, times GetMeshWidthRate: 1.05 for HABAHIRO widths 2..7
 * (the high aspect ratio term is 0 on the editor's surface). */
const LINE_LANES_PER_BUTTON = 2 / 2.2;
const HABAHIRO_LINE_WIDTH_RATE = 1.05;
/** The flick arrow (note-flick-up) starts 0.7 note-local units above its note; a Directional's arrow head
 * (note-flick-left/right) 1.6 units out from its lane's centre. Both are drawn there, without their loop. */
const FLICK_ARROW_OFFSET_LANES = 0.7 / 2.2;
const DIRECTIONAL_HEAD_OFFSET_LANES = 1.6 / 2.2;
/** The arrow sprites' heights: note_flick_top 138 px, note_flick_top_l/r 171 px. */
const FLICK_ARROW_HEIGHT_PX = 138;
const DIRECTIONAL_HEAD_HEIGHT_PX = 171;
/** The line joining a multi-lane Directional's lanes (MultipleDirectional back line) is 0.75 note-local units wide. */
const DIRECTIONAL_BACK_LINE_WIDTH_LANES = 0.75 / 2.2;

const lanesOf = (px: number) => px / SPRITE_PX_PER_LANE;

export function editorNoteHeight(laneWidth: number, noteScale: number): number {
  return laneWidth * lanesOf(NOTE_BODY_HEIGHT_PX) * noteScale;
}

/** A Directional's body for one of its lanes, centred on that lane. */
export function editorDirectionalSegmentWidth(laneWidth: number, noteScale: number): number {
  return laneWidth * lanesOf(NOTE_BODY_WIDTH_PX[0]!) * noteScale;
}

/** Width of a placed note's button, which its sprite also fills: a Directional spans its lanes (each drawn with its
 * own body, editorDirectionalSegmentWidth); any other note is its body sprite's width. Its height is
 * editorNoteHeight. */
export function editorNoteTokenWidth(spanLanes: number, directional: boolean, laneWidth: number, noteScale: number): number {
  if (directional) return spanLanes * laneWidth;
  const span = Math.min(NOTE_BODY_WIDTH_PX.length, Math.max(1, Math.round(spanLanes)));
  return Math.max(1, laneWidth * lanesOf(NOTE_BODY_WIDTH_PX[span - 1]!) * noteScale);
}

/** Width of a Slide or Long line `spanLanes` lanes wide (a Directional end counts as 1). */
export function editorSlideLineWidth(spanLanes: number, laneWidth: number, noteScale: number): number {
  const span = Math.max(1, spanLanes);
  return laneWidth * LINE_LANES_PER_BUTTON * span * (span >= 2 ? HABAHIRO_LINE_WIDTH_RATE : 1) * noteScale;
}

/** The flick arrow: its height, and how far its centre is above the note's centre. */
export function editorFlickArrowGeometry(laneWidth: number, noteScale: number) {
  return {
    height: laneWidth * lanesOf(FLICK_ARROW_HEIGHT_PX) * noteScale,
    offset: laneWidth * FLICK_ARROW_OFFSET_LANES * noteScale,
  };
}

/** A Directional's arrow head: its height, and how far its centre is out from its lane's centre. */
export function editorDirectionalHeadGeometry(laneWidth: number, noteScale: number) {
  return {
    height: laneWidth * lanesOf(DIRECTIONAL_HEAD_HEIGHT_PX) * noteScale,
    offset: laneWidth * DIRECTIONAL_HEAD_OFFSET_LANES * noteScale,
  };
}

/** The simultaneous (sync) line is 0.28 note-local units thick. */
const SIMULTANEOUS_LINE_WIDTH_LANES = 0.28 / 2.2;

/** Thickness of the simultaneous (sync) line between notes on one beat. */
export function editorSimultaneousLineWidth(laneWidth: number, noteScale: number): number {
  return laneWidth * SIMULTANEOUS_LINE_WIDTH_LANES * noteScale;
}

/** Thickness of the line joining a multi-lane Directional's first and last lane centres, behind its bodies. */
export function editorDirectionalBackLineWidth(laneWidth: number, noteScale: number): number {
  return laneWidth * DIRECTIONAL_BACK_LINE_WIDTH_LANES * noteScale;
}
