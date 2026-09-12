/** Reverse 72ad372f: serialized inputs plus DialogHeader.Setup and confirmation sizing. */
export const CURRENT_PAUSE_SERIALIZED_SOURCE_COMMIT =
  "72ad372f" as const;

const sprite = (
  position: readonly [number, number],
  size: readonly [number, number],
  depth: number,
) => Object.freeze({ position: Object.freeze(position), size: Object.freeze(size), depth });
const label = (
  position: readonly [number, number],
  size: readonly [number, number],
  depth: number,
  fontSize: number,
  pivot: "left" | "center",
) => Object.freeze({
  position: Object.freeze(position), size: Object.freeze(size), depth, fontSize, pivot,
});
const button = (
  identity: string,
  position: readonly [number, number],
  spriteName: "button_gray" | "button_pink",
  labelSize: readonly [number, number],
  fontSize: number,
) => Object.freeze({
  identity,
  position: Object.freeze(position),
  spriteName,
  spriteSize: Object.freeze([248, 72] as const),
  spriteDepth: 10,
  labelSize: Object.freeze(labelSize),
  labelPosition: Object.freeze([0, 0] as const),
  labelDepth: 15,
  fontSize,
});

export const CURRENT_PAUSE_ATLAS_BORDERS = Object.freeze({
  window: Object.freeze({ left: 12, right: 12, top: 12, bottom: 12 }),
  header: Object.freeze({ left: 28, right: 4, top: 0, bottom: 0 }),
  // UIAtlas serializes UISpriteData as left, right, top, bottom.
  button: Object.freeze({ left: 14, right: 20, top: 12, bottom: 22 }),
  cover: Object.freeze({ left: 1, right: 1, top: 1, bottom: 1 }),
});

// Application DialogHeader.Setup writes these values for every dialog instance.
const dialogHeader = (width: number, height: number, titleSize: readonly [number, number]) => ({
  header: sprite([0, -(height / 2 - 45)], [width - 62, 40], 6),
  title: Object.freeze({ ...label([-(width - 62) / 2 + 39, -2], titleSize, 7, 28, "left"), spacingX: 1 }),
});

export const CURRENT_PAUSE_SERIALIZED_GRAPHS = Object.freeze({
  retryable: Object.freeze({
    identity: "RetryablePauseDialog",
    window: sprite([0, 0], [922, 320], 5),
    ...dialogHeader(922, 320, [832, 63]),
    content: label([0, -14], [900, 114], 10, 24, "center"),
    buttons: Object.freeze([
      button("abort", [-274, 94.00001525878906], "button_gray", [234, 56], 32),
      button("retry", [0, 94.00001525878906], "button_gray", [234, 56], 32),
      button("resume", [272.0000305175781, 94.00001525878906], "button_pink", [234, 56], 34),
    ]),
  }),
  selectable: Object.freeze({
    identity: "SelectableCommonDialog",
    window: sprite([0, 0], [640, 320], 5),
    ...dialogHeader(640, 320, [832, 63]),
    content: label([0, -18], [940, 360], 10, 24, "center"),
    buttons: Object.freeze([
      button("cancel", [-136, 232 - 140], "button_gray", [230, 56], 32),
      button("confirm", [136, 232 - 140], "button_pink", [230, 56], 32),
    ]),
  }),
  annotated: Object.freeze({
    identity: "RhythmGameRetireAnnotatedDialog",
    window: sprite([0, 0], [640, 318], 5),
    ...dialogHeader(640, 318, [525, 63]),
    content: label([5, -50], [534, 56], 10, 23, "center"),
    annotation: label([-7, 9], [534, 360], 10, 19, "center"),
    buttons: Object.freeze([
      button("cancel", [-136.00001525878906, 240.00001525878906 - 146], "button_gray", [256, 86], 32),
      button("confirm", [135, 240.00001525878906 - 146], "button_pink", [240, 86], 32),
    ]),
  }),
});

/** Reverse 5514c30b: original UILabel colors, independent of dialog actions. */
export const CURRENT_PAUSE_DIALOG_COLORS = Object.freeze({
  title: [0.3137255012989044, 0.3137255012989044, 0.3137255012989044] as const,
  content: [0.3014705777168274, 0.3014705777168274, 0.3014705777168274] as const,
  annotation: [0.3014705777168274, 0.3014705777168274, 0.3014705777168274] as const,
  button: [0.3137255012989044, 0.3137255012989044, 0.3137255012989044] as const,
  positiveButton: 0xffffff,
});
