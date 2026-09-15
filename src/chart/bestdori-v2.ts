import type { GarupaChartJsonDirection } from "./garupa";

export interface BestdoriV2ChartJsonBpmItem {
  readonly type: "BPM";
  readonly beat: number;
  readonly bpm: number;
}

export interface BestdoriV2ChartJsonSingleNote {
  readonly type: "Single";
  readonly beat: number;
  readonly lane: number;
  readonly flick?: boolean;
  readonly skill?: boolean;
}

export interface BestdoriV2ChartJsonDirectionalNote {
  readonly type: "Directional";
  readonly beat: number;
  readonly lane: number;
  readonly width: number;
  readonly direction: GarupaChartJsonDirection;
}

export interface BestdoriV2ChartJsonSlideConnection {
  readonly beat: number;
  readonly lane: number;
  readonly hidden?: boolean;
  readonly flick?: boolean;
  readonly skill?: boolean;
}

export interface BestdoriV2ChartJsonSlideItem {
  readonly type: "Slide";
  readonly connections: readonly BestdoriV2ChartJsonSlideConnection[];
}

export type BestdoriV2ChartJsonItem =
  | BestdoriV2ChartJsonBpmItem
  | BestdoriV2ChartJsonSingleNote
  | BestdoriV2ChartJsonDirectionalNote
  | BestdoriV2ChartJsonSlideItem;

export type BestdoriV2ChartJson = readonly BestdoriV2ChartJsonItem[];
