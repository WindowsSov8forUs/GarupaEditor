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
