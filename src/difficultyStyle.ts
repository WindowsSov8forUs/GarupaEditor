import difficultyStyleMapJson from "./data/difficulty-style-map.json";

export type DifficultyStyle = {
  fill: string;
  stroke: string;
};

type DifficultyKey = "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";

export const DIFFICULTY_STYLE_MAP: Record<DifficultyKey, DifficultyStyle> = difficultyStyleMapJson;

const FALLBACK_DIFFICULTY: DifficultyKey = "EXPERT";
const FALLBACK_STYLE = DIFFICULTY_STYLE_MAP[FALLBACK_DIFFICULTY];

export function getDifficultyStyle(value: unknown): DifficultyStyle {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return DIFFICULTY_STYLE_MAP[normalized as DifficultyKey] ?? FALLBACK_STYLE;
}
