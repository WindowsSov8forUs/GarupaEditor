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

/** The original Long shape: exactly two nodes on one lane span, a Single/Skill head
 * and a later Single/Skill/Flick/one-lane Directional tail. */
export function isGarupaLongSlideShape(slide: Pick<GarupaChartJsonSlideItem, "connections">): boolean {
  if (slide.connections.length !== 2) return false;
  const head = slide.connections[0]!, tail = slide.connections[1]!;
  return (head.type === "Single" || head.type === "Skill") &&
    (tail.type === "Single" || tail.type === "Skill" || tail.type === "Flick" ||
      tail.type === "Directional" && tail.width === 1) &&
    head.lane === tail.lane && head.width === tail.width && tail.beat > head.beat;
}
