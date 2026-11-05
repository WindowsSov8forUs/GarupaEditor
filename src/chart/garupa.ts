/** Canonical application-wide schema for Garupa-format chart JSON. */
export type GarupaChartJsonDirection = "Left" | "Right";
export type GarupaChartJsonSimpleNoteType = "Single" | "Flick" | "Skill" | "Hidden";

export interface GarupaChartJsonSimpleNote {
  readonly type: GarupaChartJsonSimpleNoteType;
  readonly beat: number;
  readonly lane: number;
  readonly width: number;
  readonly timingGroup?: string;
}

export interface GarupaChartJsonDirectionalNote {
  readonly type: "Directional";
  readonly beat: number;
  readonly lane: number;
  readonly width: number;
  readonly direction: GarupaChartJsonDirection;
  readonly timingGroup?: string;
}

export type GarupaChartJsonSlideConnection =
  | GarupaChartJsonSimpleNote
  | GarupaChartJsonDirectionalNote;

export interface GarupaChartJsonSlideItem {
  readonly type: "Slide";
  /** At least two total nodes, including Hidden; singleton Slides are invalid. */
  readonly connections: readonly GarupaChartJsonSlideConnection[];
  /** The original Long. Only valid on the Long shape (see isGarupaLongSlideShape);
   * without it every Slide, including a straight two-node one, is an original Slide. */
  readonly long?: true;
  readonly timingGroup?: string;
}

export interface GarupaChartJsonBpmItem {
  readonly type: "BPM";
  readonly beat: number;
  readonly value: number;
}

export interface GarupaChartJsonSvItem {
  readonly type: "SV";
  readonly beat: number;
  readonly value: number;
  readonly timingGroup?: string;
}

/** Chart header switch, the counterpart of the original BMS `#HABAHIRO` header. */
export const GARUPA_HEADER_HABAHIRO = "#HABAHIRO" as const;
/** Timed lane-change command of a HABAHIRO chart; it requires the HABAHIRO header. */
export const GARUPA_SYSTEM_LANE_CHANGE = "#LANE_CHANGE" as const;

/** Chart-wide header; at most one item per value and no beat. */
export interface GarupaChartJsonHeaderItem {
  readonly type: "Header";
  readonly data: typeof GARUPA_HEADER_HABAHIRO;
}

/** Timed non-note command. Several lane changes may appear; as in the original
 * converter, the last one traversed (the latest beat) sets the change position. */
export interface GarupaChartJsonSystemItem {
  readonly type: "System";
  readonly beat: number;
  readonly data: typeof GARUPA_SYSTEM_LANE_CHANGE;
}

export type GarupaChartJsonTopLevelNote =
  | Omit<GarupaChartJsonSimpleNote, "type"> & {
      readonly type: Exclude<GarupaChartJsonSimpleNoteType, "Hidden">;
    }
  | GarupaChartJsonDirectionalNote;

export type GarupaChartJsonItem =
  | GarupaChartJsonTopLevelNote
  | GarupaChartJsonSlideItem
  | GarupaChartJsonBpmItem
  | GarupaChartJsonSvItem
  | GarupaChartJsonHeaderItem
  | GarupaChartJsonSystemItem;

export type GarupaChartJson = readonly GarupaChartJsonItem[];

/** combineNotes keeps the root at ⌊(first + last) / 2⌋ of a merged range: the left middle
 * lane of an even width. */
export function garupaLongCenterLane(head: Pick<GarupaChartJsonSimpleNote, "lane" | "width">): number {
  return head.lane + Math.floor((head.width - 1) / 2);
}

/**
 * Why a Single/Skill-headed two-node Slide marked long cannot end in its Directional tail.
 * The original merges a wide Long into its center root, which keeps its own tail, and its
 * multiple directional Adds extend from that root toward the arrow: the tail's `lane` is the
 * head's center lane, and the tail spans `width` lanes from there toward its direction.
 */
export function invalidLongDirectionalTail(
  slide: Pick<GarupaChartJsonSlideItem, "connections">,
): "off-center" | null {
  if (slide.connections.length !== 2) return null;
  const head = slide.connections[0]!, tail = slide.connections[1]!;
  if ((head.type !== "Single" && head.type !== "Skill") || tail.type !== "Directional" || tail.beat <= head.beat) return null;
  return tail.lane === garupaLongCenterLane(head) ? null : "off-center";
}

/** The original Long shape: exactly two nodes, a Single/Skill head and a later
 * Single/Skill/Flick tail on its lane span, or a Directional tail as invalidLongDirectionalTail allows. */
export function isGarupaLongSlideShape(slide: Pick<GarupaChartJsonSlideItem, "connections">): boolean {
  if (slide.connections.length !== 2) return false;
  const head = slide.connections[0]!, tail = slide.connections[1]!;
  if ((head.type !== "Single" && head.type !== "Skill") || tail.beat <= head.beat) return false;
  if (tail.type === "Directional") return invalidLongDirectionalTail(slide) === null;
  return head.lane === tail.lane &&
    (tail.type === "Single" || tail.type === "Skill" || tail.type === "Flick") && head.width === tail.width;
}
