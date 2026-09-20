import { DIFFICULTY_LABEL_STYLE } from "./components/text/difficultyLabelStyle";

export type DifficultyStyle = {
  fill: string;
  stroke: string;
};

type DifficultyKey = "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";

export const DIFFICULTY_STYLE_MAP: Record<DifficultyKey, DifficultyStyle> = Object.fromEntries(
  Object.entries(DIFFICULTY_LABEL_STYLE).map(([key, style]) => [key, {
    fill: `#${style.background.toString(16).padStart(6, "0")}`,
    stroke: `#${style.outline.toString(16).padStart(6, "0")}`,
  }]),
) as Record<DifficultyKey, DifficultyStyle>;

const FALLBACK_DIFFICULTY: DifficultyKey = "EXPERT";
const FALLBACK_STYLE = DIFFICULTY_STYLE_MAP[FALLBACK_DIFFICULTY];

export function getDifficultyStyle(value: unknown): DifficultyStyle {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return DIFFICULTY_STYLE_MAP[normalized as DifficultyKey] ?? FALLBACK_STYLE;
}
