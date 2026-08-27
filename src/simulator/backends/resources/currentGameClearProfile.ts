export interface GameClearClipBinding {
  readonly channels: readonly string[];
}
export interface GameClearClipKey { readonly index: number; readonly coefficients: readonly [number, number, number, number]; }
export interface GameClearClipFrame { readonly time: number; readonly keys: readonly GameClearClipKey[]; }
export interface GameClearClipProfile {
  readonly stop_time: number;
  readonly curve_count: number;
  readonly bindings: readonly GameClearClipBinding[];
  readonly streamed_curve_count: number;
  readonly streamed_frames: readonly GameClearClipFrame[];
  readonly constants: readonly number[];
}
export interface GameClearWidgetProfile {
  readonly path: string;
  readonly color_f32_bits: readonly [string, string, string, string];
  readonly pivot: string;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly asset: string;
}
export interface GameClearGraphObject {
  readonly path: string;
  readonly active: boolean;
  readonly local_position: readonly [number, number, number];
  readonly local_rotation: readonly [number, number, number, number];
  readonly local_scale: readonly [number, number, number];
  readonly components: readonly { readonly class: string; readonly widget?: GameClearWidgetProfile }[];
}
export interface GameClearRuntimeProfile {
  readonly schemaVersion: 1;
  readonly durationSeconds: number;
  readonly exitAfterFinishedSeconds: number;
  readonly clearStatusMapping: Readonly<Record<"1" | "2" | "3", string>>;
  readonly assets: readonly { readonly logical_key: string; readonly file: string; readonly width: number; readonly height: number }[];
  readonly base: { readonly objects: readonly GameClearGraphObject[] };
  readonly fullCombo: { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile };
  readonly allPerfect: { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile };
}

export function parseCurrentGameClearProfile(value: unknown): GameClearRuntimeProfile | null {
  if (!record(value) || value.schemaVersion !== 1 || value.durationSeconds !== 3.233 ||
      value.exitAfterFinishedSeconds !== 0.015 || !Array.isArray(value.assets) || value.assets.length !== 34 ||
      !validBranch(value.fullCombo, 104, 25) || !validBranch(value.allPerfect, 129, 36) ||
      !record(value.base) || !Array.isArray(value.base.objects) || value.base.objects.length !== 43) return null;
  const keys = new Set<string>();
  for (const asset of value.assets) {
    if (!record(asset) || typeof asset.logical_key !== "string" || keys.has(asset.logical_key) ||
        typeof asset.file !== "string" || !positiveInt(asset.width) || !positiveInt(asset.height)) return null;
    keys.add(asset.logical_key);
  }
  for (const rawBranch of [value.fullCombo, value.allPerfect]) {
    if (!record(rawBranch) || !record(rawBranch.graph) || !Array.isArray(rawBranch.graph.objects)) return null;
    for (const objectValue of rawBranch.graph.objects) {
      if (!record(objectValue) || !validObject(objectValue)) return null;
      const components = objectValue.components;
      if (!Array.isArray(components)) return null;
      for (const componentValue of components) {
        if (!record(componentValue)) return null;
        if (componentValue.class === "UITexture") {
          if (!record(componentValue.widget) || typeof componentValue.widget.asset !== "string" ||
              !keys.has(componentValue.widget.asset)) return null;
        }
      }
    }
  }
  return deepFreeze(value as unknown as GameClearRuntimeProfile);
}
function validBranch(value: unknown, curves: number, objects: number): boolean {
  if (!record(value) || !record(value.graph) || !Array.isArray(value.graph.objects) || value.graph.objects.length !== objects || !record(value.clip)) return false;
  const clip = value.clip;
  return clip.stop_time === 2.2833333015441895 && clip.curve_count === curves &&
    Array.isArray(clip.bindings) && Array.isArray(clip.streamed_frames) && Array.isArray(clip.constants) &&
    clip.bindings.every((binding: unknown) => record(binding) && Array.isArray(binding.channels));
}
function validObject(value: unknown): boolean {
  return record(value) && typeof value.path === "string" && typeof value.active === "boolean" &&
    vector(value.local_position, 3) && vector(value.local_rotation, 4) && vector(value.local_scale, 3) && Array.isArray(value.components);
}
function vector(value: unknown, size: number): boolean { return Array.isArray(value) && value.length === size && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)); }
function positiveInt(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
