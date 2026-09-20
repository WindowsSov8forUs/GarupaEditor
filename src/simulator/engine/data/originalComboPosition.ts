import positions from "../../../data/simulator/originalComboPositions.json";

const KEYS = ["leftTop", "leftCenter", "leftBottom", "rightTop", "rightCenter", "rightBottom"] as const;
export const ORIGINAL_COMBO_POSITION_DEFAULT = 4;
export function isOriginalComboPosition(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < KEYS.length;
}

/** DisplayComboPositionData.GetDisplayComboPosition, in the authored UI coordinate space. */
export function originalComboPosition(value: number, highAspectRatio: number): readonly [number, number] {
  if (!isOriginalComboPosition(value) || !Number.isFinite(highAspectRatio))
    throw new Error("Original Combo position requires a valid selection and finite aspect ratio.");
  const key = KEYS[value]!;
  const from = positions.positions16x9[key], to = positions.positions2x1[key];
  const ratio = Math.min(1, Math.max(0, highAspectRatio));
  return Object.freeze([Math.fround(from.x + (to.x - from.x) * ratio),
    Math.fround(from.y + (to.y - from.y) * ratio)] as const);
}
