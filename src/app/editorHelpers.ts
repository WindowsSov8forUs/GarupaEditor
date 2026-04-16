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
  timingGroup?: number;
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

const BPM_ZERO_EPSILON = 1e-9;

export function normalizeBaseBpmForWrite(value: unknown, fallback: number): number | null {
  const normalized = normalizeEditorBpm(value, fallback);
  if (!(normalized > 0)) {
    return null;
  }
  return normalized;
}

export function normalizeEventBpmForWrite(value: unknown, fallback: number): number | null {
  const normalized = normalizeEditorBpm(value, fallback);
  if (Math.abs(normalized) <= BPM_ZERO_EPSILON) {
    return null;
  }
  return normalized;
}

const BPM_BEAT_EPSILON = 1e-6;

export function isLastBeatOrderedBpmNegative(
  baseBpm: number,
  events: Array<{ beat: number; bpm: number }>,
): boolean {
  let tailBpm = normalizeEditorBpm(baseBpm, 120);
  let hasTailEvent = false;
  let tailBeat = 0;
  const ordered = [...events].sort((left, right) => {
    const leftBeat = Number(left?.beat ?? 0);
    const rightBeat = Number(right?.beat ?? 0);
    if (Math.abs(leftBeat - rightBeat) > BPM_BEAT_EPSILON) {
      return leftBeat - rightBeat;
    }
    // Keep stable order for same beat and use last one as effective layer.
    return 0;
  });

  for (const event of ordered) {
    const beat = Number(event?.beat ?? 0);
    const bpm = normalizeEditorBpm(event?.bpm ?? tailBpm, tailBpm);
    if (!Number.isFinite(beat) || beat < 0) {
      continue;
    }
    if (!hasTailEvent || Math.abs(beat - tailBeat) > BPM_BEAT_EPSILON) {
      tailBeat = beat;
      tailBpm = bpm;
      hasTailEvent = true;
      continue;
    }
    tailBpm = bpm;
  }

  return tailBpm < 0;
}
