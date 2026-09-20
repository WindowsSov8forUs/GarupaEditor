export const ORIGINAL_DIALOG_HEADER = Object.freeze({
  marginX: 31, top: 25, height: 40, labelX: 39, labelY: -2, fontSize: 28, spacingX: 1,
});

/** Reverse 5514c30b: original UILabel colors, independent of dialog actions. */
export const ORIGINAL_DIALOG_COLORS = Object.freeze({
  title: [0.3137255012989044, 0.3137255012989044, 0.3137255012989044] as const,
  content: [0.3014705777168274, 0.3014705777168274, 0.3014705777168274] as const,
  annotation: [0.3014705777168274, 0.3014705777168274, 0.3014705777168274] as const,
  button: [0.3137255012989044, 0.3137255012989044, 0.3137255012989044] as const,
  positiveButton: 0xffffff,
});
