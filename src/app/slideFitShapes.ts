/*
 * Slide shapes. A Slide has no shape of its own: a curve is fitted with Hidden nodes placed between two nodes. A
 * shape function is one fit function combined with one attachment, shape = f{fit, attachment}:
 *
 * - A fit function (SlideFitFunction) takes the two end nodes and places nodes between them: line, sine, quad,
 *   bounce, ...
 * - An attachment (SlideFitAttachment) takes the nodes the fit function placed and processes them (moves, adds or
 *   removes nodes) without seeing the fit function: none, sawtooth, round trip, pixel, ...
 *
 * Both are picked from their registries (SLIDE_FIT_FUNCTIONS, SLIDE_FIT_ATTACHMENTS) by id, so any fit function goes
 * with any attachment; a new one is an object following its protocol, added to its list. `composeSlideShape`
 * combines a pair. Applying a shape to a segment (useSlideSegmentActions) and the previews (SlideFitTrackPreview,
 * SlideFitPreview) all use `resolveSlideShape`, so a preview is exactly what applying gives.
 */

const EPSILON = 1e-6;

/** A Slide node as a shape sees it: its beat, the lane the line passes it at (its centre) and its width in lanes.
 * Both the end nodes a shape is given and the nodes it places are these. */
export type SlideShapeNode = { beat: number; lane: number; width: number };
/** The nodes placed between `start` and `end`, ordered from start to end: their beats run from start's to end's
 * without going back, and a node may share a beat with its neighbours or the end nodes (a sideways step). Every
 * attachment and shape function returns this; a fit function places its nodes strictly between the end beats. */
export type SlideShapeNodes = SlideShapeNode[];
/** A shape function. */
export type SlideShapeFunction = (start: SlideShapeNode, end: SlideShapeNode) => SlideShapeNodes;

/** shape = f{fit, attachment}: the attachment's processing of the nodes the fit function placed. */
export function composeSlideShape(
  fit: (start: SlideShapeNode, end: SlideShapeNode) => SlideShapeNodes,
  attachment: (nodes: SlideShapeNodes, start: SlideShapeNode, end: SlideShapeNode) => SlideShapeNodes,
): SlideShapeFunction {
  return (start, end) => attachment(fit(start, end), start, end);
}

// ---- Fit functions -------------------------------------------------------------------------------------------------

export type SlideFitEasing = "in" | "out" | "in_out" | "out_in";
export type SlideFitPrecision = "1" | "1/16" | "1/32" | "1/64" | "1/128";
export const EASINGS: readonly SlideFitEasing[] = ["in", "out", "in_out", "out_in"];
/** A line may place no nodes (precision 1); a curve places one every 1/16 beat or finer. */
export const LINEAR_PRECISIONS: readonly SlideFitPrecision[] = ["1", "1/16", "1/32", "1/64", "1/128"];
export const CURVED_PRECISIONS: readonly SlideFitPrecision[] = ["1/16", "1/32", "1/64", "1/128"];

/** A fit function's parameters: the easing (null when it takes none) and the beat step it places nodes at. */
export type SlideFitParams = { easing: SlideFitEasing | null; precision: SlideFitPrecision };

/** The fit function protocol. */
export interface SlideFitFunction {
  id: string;
  /** Its name in the curve tool's 预设 list. */
  label: string;
  /** Whether it takes an easing. */
  easing: boolean;
  /** The precisions it takes, the first its default. */
  precisions: readonly SlideFitPrecision[];
  /** The nodes it places (see SlideShapeNodes), strictly between the end beats. */
  place(start: SlideShapeNode, end: SlideShapeNode, params: SlideFitParams): SlideShapeNodes;
}

/** A precision's beat step. */
export function parseBeatStep(value: SlideFitPrecision): number | null {
  if (value === "1") return 1;
  const denominator = Number(value.match(/^1\/(\d+)$/)?.[1]);
  return Number.isFinite(denominator) && denominator > 0 ? 1 / denominator : null;
}

/** Nodes one every `precision` beat from the start, strictly before the end (none at precision 1), each on
 * `nodeAt` of its progress from start (0) to end (1). */
function placeEvery(precision: SlideFitPrecision, start: SlideShapeNode, end: SlideShapeNode,
  nodeAt: (t: number) => { lane: number; width: number }): SlideShapeNodes {
  const step = parseBeatStep(precision);
  const beatDelta = end.beat - start.beat;
  if (!step || step <= EPSILON || precision === "1" || !Number.isFinite(beatDelta) || Math.abs(beatDelta) <= EPSILON) return [];
  const direction = beatDelta >= 0 ? 1 : -1;
  const nodes: SlideShapeNodes = [];
  for (let index = 1; index * step < Math.abs(beatDelta) - EPSILON; index += 1) {
    const beat = Number((start.beat + direction * index * step).toFixed(20));
    nodes.push({ beat, ...nodeAt(Math.max(0, Math.min(1, (beat - start.beat) / beatDelta))) });
  }
  return nodes;
}

/** An ease-in curve: progress 0..1 to the share of the lane change made, 0 at 0 and 1 at 1. */
type EaseInCurve = (t: number) => number;

/** The curve eased: in as it is, out mirrored, in-out and out-in as the two halves. */
function eased(curve: EaseInCurve, easing: SlideFitEasing, t: number): number {
  const out = (x: number) => 1 - curve(1 - x);
  switch (easing) {
    case "out": return out(t);
    case "in_out": return t <= 0.5 ? curve(2 * t) / 2 : 0.5 + out(2 * t - 1) / 2;
    case "out_in": return t <= 0.5 ? out(2 * t) / 2 : 0.5 + curve(2 * t - 1) / 2;
    case "in": default: return curve(t);
  }
}

/** A fit function whose lane follows an ease-in curve between the end nodes, with an easing (null `curve`: a straight
 * line), and whose width goes linearly from the start's to the end's. */
function easingFitFunction(id: string, label: string, curve: EaseInCurve | null): SlideFitFunction {
  return {
    id, label, easing: curve !== null, precisions: curve === null ? LINEAR_PRECISIONS : CURVED_PRECISIONS,
    place: (start, end, { easing, precision }) => placeEvery(precision, start, end, t => ({
      lane: start.lane + (end.lane - start.lane) * (curve === null ? t : eased(curve, easing ?? "in", t)),
      width: start.width + (end.width - start.width) * t,
    })),
  };
}

function easeOutBounce(x: number): number {
  if (x < 4 / 11) return (121 / 16) * x * x;
  if (x < 8 / 11) { const d = x - 6 / 11; return (121 / 16) * d * d + 3 / 4; }
  if (x < 10 / 11) { const d = x - 9 / 11; return (121 / 16) * d * d + 15 / 16; }
  const d = x - 21 / 22;
  return (121 / 16) * d * d + 63 / 64;
}

/** The fit functions, in the 预设 list's order; the first is the fallback for an unknown id. */
export const SLIDE_FIT_FUNCTIONS: readonly SlideFitFunction[] = [
  easingFitFunction("line", "直线", null),
  easingFitFunction("sine", "正弦", t => 1 - Math.cos((Math.PI / 2) * t)),
  easingFitFunction("quad", "二次", t => t ** 2),
  easingFitFunction("cubic", "三次", t => t ** 3),
  easingFitFunction("quart", "四次", t => t ** 4),
  easingFitFunction("quint", "五次", t => t ** 5),
  easingFitFunction("expo", "指数", t => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (10 * (t - 1)))),
  easingFitFunction("semicircle", "半圆", t => 1 - Math.sqrt(1 - t * t)),
  // Ease-in back with the standard overshoot s = 1.70158.
  easingFitFunction("back", "回拉", t => t * t * (2.70158 * t - 1.70158)),
  easingFitFunction("elastic", "弹性", t => (Math.abs(t) <= EPSILON ? 0 : Math.abs(t - 1) <= EPSILON ? 1
    : -(2 ** (10 * t - 10)) * Math.sin((10 * t - 10.75) * ((2 * Math.PI) / 3)))),
  easingFitFunction("bounce", "弹跳", t => (Math.abs(t) <= EPSILON ? 0 : Math.abs(t - 1) <= EPSILON ? 1
    : 1 - easeOutBounce(1 - t))),
];

export function slideFitFunctionOf(id: string): SlideFitFunction {
  return SLIDE_FIT_FUNCTIONS.find(fit => fit.id === id) ?? SLIDE_FIT_FUNCTIONS[0]!;
}

// ---- Attachments ---------------------------------------------------------------------------------------------------

/** The attachment protocol, with its parameters P. */
export interface SlideFitAttachment<P> {
  id: string;
  /** Its name in the curve tool's 附加 list. */
  label: string;
  /** Its parameters from a stored value (absent or malformed: its defaults). */
  normalize(raw: unknown): P;
  /** The nodes to place instead of the fit function's (see SlideShapeNodes). */
  process(nodes: SlideShapeNodes, start: SlideShapeNode, end: SlideShapeNode, params: P): SlideShapeNodes;
}

/** No attachment: the fit function's nodes as they are. */
export const NO_ATTACHMENT: SlideFitAttachment<null> = {
  id: "none",
  label: "无",
  normalize: () => null,
  process: nodes => nodes,
};

/** The sawtooth and round trip attachments' parameters: how far a node moves (lanes, ≥ 0) and which way the first
 * one moves (right: to higher lanes). */
export type ZigzagParams = { amplitude: number; direction: "left" | "right" };
function normalizeZigzag(raw: unknown): ZigzagParams {
  const { amplitude, direction } = (raw ?? {}) as { amplitude?: unknown; direction?: unknown };
  return {
    amplitude: typeof amplitude === "number" && Number.isFinite(amplitude) ? Math.max(0, amplitude) : 0.5,
    direction: direction === "left" ? "left" : "right",
  };
}

/** Sawtooth: from the start, the first node moves `amplitude` lanes towards `direction`, the second away from it, and
 * so on, alternating, up to the last node before the end. */
export const SAWTOOTH_ATTACHMENT: SlideFitAttachment<ZigzagParams> = {
  id: "sawtooth",
  label: "锯齿",
  normalize: normalizeZigzag,
  process(nodes, _start, _end, { amplitude, direction }) {
    const offset = direction === "right" ? amplitude : -amplitude;
    return nodes.map((node, index) => ({ ...node, lane: node.lane + (index % 2 === 0 ? offset : -offset) }));
  },
};

/** Round trip: as the sawtooth, with one node left in place between every two moved ones (the 1st node moves towards
 * `direction`, the 3rd away from it, the 5th towards it, ...). */
export const ROUND_TRIP_ATTACHMENT: SlideFitAttachment<ZigzagParams> = {
  id: "roundTrip",
  label: "往返",
  normalize: normalizeZigzag,
  process(nodes, _start, _end, { amplitude, direction }) {
    const offset = direction === "right" ? amplitude : -amplitude;
    return nodes.map((node, index) => index % 4 === 0 ? { ...node, lane: node.lane + offset }
      : index % 4 === 2 ? { ...node, lane: node.lane - offset } : node);
  },
};

/** The pixel attachment's parameter: whether the step at each node comes after its beat ("hold": the line keeps the
 * node's lane up to the next node's beat, then steps across) or at it ("break": it steps across to the next node's
 * lane at once, then holds it). */
export type PixelParams = { start: "hold" | "break" };

/** Pixel: from the start node (included) to the last node before the end, a node is added after each: on the node's
 * lane at the next node's beat (hold), or on the next node's lane at the node's beat (break), with the width of the
 * node whose lane it takes. A node that would fall on the node or the next one is left out. */
export const PIXEL_ATTACHMENT: SlideFitAttachment<PixelParams> = {
  id: "pixel",
  label: "像素",
  normalize: raw => ({ start: (raw as { start?: unknown } | undefined)?.start === "break" ? "break" : "hold" }),
  process(nodes, start, end, { start: mode }) {
    const sequence = [start, ...nodes, end];
    const same = (a: SlideShapeNode, b: SlideShapeNode) =>
      Math.abs(a.beat - b.beat) <= EPSILON && Math.abs(a.lane - b.lane) <= EPSILON;
    const result: SlideShapeNodes = [];
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const node = sequence[index]!, next = sequence[index + 1]!;
      if (index > 0) result.push(node);
      const corner = mode === "hold" ? { beat: next.beat, lane: node.lane, width: node.width }
        : { beat: node.beat, lane: next.lane, width: next.width };
      if (!same(corner, node) && !same(corner, next)) result.push(corner);
    }
    return result;
  },
};

/** An attachment with its parameter type erased: its processing with the parameters read from a stored value. */
type RegisteredAttachment = {
  id: string; label: string;
  bind(raw: unknown): (nodes: SlideShapeNodes, start: SlideShapeNode, end: SlideShapeNode) => SlideShapeNodes;
};
function registerAttachment<P>(attachment: SlideFitAttachment<P>): RegisteredAttachment {
  return { id: attachment.id, label: attachment.label,
    bind: raw => (nodes, start, end) => attachment.process(nodes, start, end, attachment.normalize(raw)) };
}

/** The attachments, in the 附加 list's order; the first is the fallback for an unknown id. */
export const SLIDE_FIT_ATTACHMENTS: readonly RegisteredAttachment[] = [
  registerAttachment(NO_ATTACHMENT),
  registerAttachment(SAWTOOTH_ATTACHMENT),
  registerAttachment(ROUND_TRIP_ATTACHMENT),
  registerAttachment(PIXEL_ATTACHMENT),
];

export function slideFitAttachmentOf(id: string): RegisteredAttachment {
  return SLIDE_FIT_ATTACHMENTS.find(attachment => attachment.id === id) ?? SLIDE_FIT_ATTACHMENTS[0]!;
}

// ---- Settings ------------------------------------------------------------------------------------------------------

/** A shape's setting: its fit function (by id) with its parameters, and its attachment (by id) with its parameters. */
export type SlideFitSettings = {
  fit: { id: string } & SlideFitParams;
  attachment: { id: string; params?: unknown };
};

/** The curve tool's setting when the editor starts: sine, easing in, no attachment. */
export const DEFAULT_SLIDE_FIT_SETTINGS: SlideFitSettings = {
  fit: { id: "sine", easing: "in", precision: "1/16" },
  attachment: { id: NO_ATTACHMENT.id },
};

/** The setting made consistent: known ids, an easing only when the fit function takes one (in by default), a
 * precision it takes (its first by default). */
export function normalizeSlideFitSettings(input: SlideFitSettings): SlideFitSettings {
  const fit = slideFitFunctionOf(input.fit.id);
  const easing = !fit.easing ? null : input.fit.easing !== null && EASINGS.includes(input.fit.easing) ? input.fit.easing : "in";
  const precision = fit.precisions.includes(input.fit.precision) ? input.fit.precision : fit.precisions[0]!;
  return { fit: { id: fit.id, easing, precision },
    attachment: { ...input.attachment, id: slideFitAttachmentOf(input.attachment.id).id } };
}

/** The shape function a setting names: its fit function combined with its attachment. */
export function slideShapeOf(settings: SlideFitSettings): SlideShapeFunction {
  const fit = slideFitFunctionOf(settings.fit.id);
  return composeSlideShape((start, end) => fit.place(start, end, settings.fit),
    slideFitAttachmentOf(settings.attachment.id).bind(settings.attachment.params));
}

/** The nodes the shape a setting names places between `start` and `end`. */
export function resolveSlideShape(settings: SlideFitSettings, start: SlideShapeNode, end: SlideShapeNode): SlideShapeNodes {
  return slideShapeOf(settings)(start, end);
}
