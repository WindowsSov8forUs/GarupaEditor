/** DifficultyUtility colors and DifficultyLabelObject.Setup offsets/spacing. */
export const DIFFICULTY_LABEL_STYLE = {
  EASY: { background: 0x3366ff, outline: 0x0033ff, offsetX: 1, spacing: 1 },
  NORMAL: { background: 0x66ff33, outline: 0x00cc33, offsetX: -1, spacing: 1 },
  HARD: { background: 0xffcc33, outline: 0xff9933, offsetX: 1, spacing: 1 },
  EXPERT: { background: 0xff3333, outline: 0xcc0000, offsetX: 1, spacing: 0 },
  SPECIAL: { background: 0xee2299, outline: 0xbb0066, offsetX: 0, spacing: 0 },
} as const;
