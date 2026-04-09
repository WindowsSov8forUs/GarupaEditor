import { toFinite } from "../chartCore";

export const BASE_BPM_LINE_ID = "__base_bpm_line__";
export const DEFAULT_SPRITE_ASPECT_RATIO = 2.6;
export const SIDEBAR_MIN_WIDTH = 404;
export const SIDEBAR_MAX_WIDTH = 640;
export const EDITOR_MIN_WIDTH = 640;
export const WORKSPACE_DIVIDER_WIDTH = 12;

export interface SlideChain {
  id: string;
  noteIds: string[];
}

export interface SlideBuildState {
  noteIds: string[];
  createdHeadId: string | null;
  mode: "drag" | "append";
  persistUntilRightClick: boolean;
}

export function formatEditorNumeric(value: number, digits = 6): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = Number(value.toFixed(digits));
  return String(rounded);
}

export function parseNumericExpression(raw: string): number | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  const fraction = text.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
      return null;
    }
    return numerator / denominator;
  }

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

export function normalizeEditorBpm(value: unknown, fallback: number): number {
  const numeric = toFinite(value, fallback);
  return Number(numeric.toFixed(6));
}
