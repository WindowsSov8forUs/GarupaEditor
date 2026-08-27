/** Reverse 1bff69eb: exact current 10.1.4 Pause component Transform chains. */
export const CURRENT_PAUSE_SERIALIZED_SOURCE_COMMIT =
  "1bff69eb8031cf723e4081f35ece14d0f775a19f" as const;

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
  button: Object.freeze({ left: 14, right: 20, top: 22, bottom: 12 }),
  cover: Object.freeze({ left: 1, right: 1, top: 1, bottom: 1 }),
});

export const CURRENT_PAUSE_SERIALIZED_GRAPHS = Object.freeze({
  retryable: Object.freeze({
    identity: "RetryablePauseDialog",
    window: sprite([0, 0], [922, 320], 5),
    header: sprite([0, -115], [842, 40], 6),
    title: label([-391, 1], [832, 63], 7, 30, "left"),
    content: label([0, -14], [900, 114], 10, 24, "center"),
    buttons: Object.freeze([
      button("abort", [-274, 94.00001525878906], "button_gray", [234, 56], 32),
      button("retry", [0, 94.00001525878906], "button_gray", [234, 56], 32),
      button("resume", [272.0000305175781, 94.00001525878906], "button_pink", [234, 56], 34),
    ]),
  }),
  selectable: Object.freeze({
    identity: "SelectableCommonDialog",
    window: sprite([0, 0], [960, 600], 5),
    header: sprite([0, -239.64999389648438], [770, 40], 6),
    title: label([-352.260009765625, 1], [832, 63], 7, 30, "left"),
    content: label([0, 0], [940, 360], 10, 24, "center"),
    buttons: Object.freeze([
      button("cancel", [-136, 232], "button_gray", [230, 56], 32),
      button("confirm", [136, 232], "button_pink", [230, 56], 32),
    ]),
  }),
  annotated: Object.freeze({
    identity: "RhythmGameRetireAnnotatedDialog",
    window: sprite([0, 0], [640, 318], 5),
    header: sprite([0, -115], [558, 40], 6),
    title: label([-250, 0], [525, 63], 7, 29, "left"),
    content: label([5, -50], [534, 56], 10, 23, "center"),
    annotation: label([-7, 9], [534, 360], 10, 19, "center"),
    buttons: Object.freeze([
      button("cancel", [-136.00001525878906, 240.00001525878906], "button_gray", [256, 86], 32),
      button("confirm", [135, 240.00001525878906], "button_pink", [240, 86], 32),
    ]),
  }),
});
