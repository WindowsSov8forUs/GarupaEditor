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

export type GarupaChartJsonTopLevelNote =
  | Omit<GarupaChartJsonSimpleNote, "type"> & {
      readonly type: Exclude<GarupaChartJsonSimpleNoteType, "Hidden">;
    }
  | GarupaChartJsonDirectionalNote;

export type GarupaChartJsonItem =
  | GarupaChartJsonTopLevelNote
  | GarupaChartJsonSlideItem
  | GarupaChartJsonBpmItem
  | GarupaChartJsonSvItem;

export type GarupaChartJson = readonly GarupaChartJsonItem[];
