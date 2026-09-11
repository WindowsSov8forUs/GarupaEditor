import { AfterNoteType, FrontNoteType, GameNoteType } from "../chart/types";
import { type DirectionalGraphSource } from "../chart/noteGraph";
import { SyncLineConnectionRules, selectDirectionalSyncEndpoints, type SyncConnection } from "../rendering/syncLineConnectionRules";
import { ok, type SimulatorResult } from "../evidence";
import type { GarupaProductChartProfile, GarupaProductNode } from "./productChartProfile";

export interface SyncInput {
  readonly front: GarupaProductNode;
  readonly tail: GarupaProductNode | null;
  readonly noteInformation: DirectionalGraphSource;
}

export interface GarupaSyncInputPair {
  readonly identity: string;
  readonly first: GarupaProductNode;
  readonly second: GarupaProductNode;
  readonly firstLane: number;
  readonly secondLane: number;
}

/** Adapt chart endpoints to the same connection decisions used by NoteManager.
 * Continuous coordinates are graph coordinates, never GamePlayButton identities. */
export function buildGarupaSyncInputs(chart: GarupaProductChartProfile): readonly SyncInput[] {
  const inputs: SyncInput[] = [];
  const chains = new Map<string, GarupaProductNode[]>();
  for (const node of chart.authoredNodes) {
    if (node.chainIdentity === null) inputs.push(input(node, null, chart));
    else {
      const nodes = chains.get(node.chainIdentity) ?? [];
      nodes.push(node);
      chains.set(node.chainIdentity, nodes);
    }
  }
  for (const nodes of chains.values()) {
    const head = nodes[0]!, tail = nodes.length > 1 ? nodes[nodes.length - 1]! : null;
    inputs.push(!head.visible && tail?.visible ? input(tail, null, chart) : input(head, tail, chart));
    // Only new intermediate node types add an endpoint. Ordinary Slide among
    // nodes retain the original root/tail connection semantics.
    for (const node of nodes.slice(1, -1)) if (node.type === "Flick" || node.type === "Directional" || node.type === "Skill")
      inputs.push(input(node, null, chart));
  }
  return inputs;
}

export interface GarupaSyncState {
  readonly lines: readonly SyncConnection<SyncInput>[];
}
/** SV may reveal future batches out of music order. Resolve their chart-owned
 * connections in source order; endpoint Move states alone control rendering. */
export function buildGarupaSyncConnections(inputs: readonly SyncInput[]): SimulatorResult<GarupaSyncState> {
  const pendingTails: SyncInput[] = [];
  const pendingDirectionalTails: SyncInput[] = [];
  const lines: SyncConnection<SyncInput>[] = [];
  let position = 0;
  const rules = new SyncLineConnectionRules<SyncInput, SyncConnection<SyncInput>>({
    pendingTails, pendingDirectionalTails, position: () => position,
    hasTail: note => note.tail !== null && note.tail.visible,
    lineFor: (note, after) => {
      const reverse = [...lines].reverse();
      return reverse.find(line => line.targetA === note && line.afterA === after) ??
        reverse.find(line => line.targetB === note && line.afterB === after) ?? null;
    },
    connect: (a, afterA, b, afterB, existing) => {
      const line = { targetA: a, afterA, targetB: b, afterB };
      if (existing !== null && existing !== undefined) lines.splice(lines.indexOf(existing), 1);
      lines.push(line);
      return ok(undefined);
    },
  });
  const byPosition = new Map<number, SyncInput[]>();
  for (const note of inputs) {
    const at = note.noteInformation.absolutePos;
    const notes = byPosition.get(at) ?? [];
    notes.push(note);
    byPosition.set(at, notes);
  }
  for (const [at, notes] of [...byPosition].sort((a, b) => a[0] - b[0])) {
    position = at;
    const connected = rules.connectOrdinarySyncLines(notes.sort((a, b) => a.front.authoredOrder - b.front.authoredOrder));
    if (connected.status !== "ok") return connected;
  }
  return ok({ lines });
}
export function garupaSyncPairs(state: GarupaSyncState): readonly GarupaSyncInputPair[] {
  return state.lines.map((line, index) => {
    const first = line.afterA ? line.targetA.tail! : line.targetA.front;
    const second = line.afterB ? line.targetB.tail! : line.targetB.front;
    const lane = (node: GarupaProductNode) => node.type === "Directional" ? node.lane : node.spanStart + (node.width - 1) / 2;
    const extremes = (node: GarupaProductNode, after: boolean) => {
      const endpoint = { node, after, lane: lane(node) };
      // The original front MultipleDirectional inherits the base self result.
      // Tail side parts extend in authored unit steps; only the extreme coordinates
      // are needed here, so an unbounded authored width needs no object expansion.
      return after && node.type === "Directional" && node.width > 1
        ? { left: { node, lane: node.spanStart, after: node.lane === node.spanStart },
            right: { node, lane: node.spanEnd, after: node.lane === node.spanEnd } }
        : { left: endpoint, right: endpoint };
    };
    const [a, b] = selectDirectionalSyncEndpoints(extremes(first, line.afterA), extremes(second, line.afterB), lane(first), lane(second));
    return { identity: `sync:${index}`, first: a.node, second: b.node, firstLane: a.lane, secondLane: b.lane };
  });
}

function input(front: GarupaProductNode, tail: GarupaProductNode | null, chart: GarupaProductChartProfile): SyncInput {
  const source = chart.originalSources.get(front.identity);
  if (source !== undefined && (front.connectionIndex === null || front.connectionIndex === 0))
    return { front, tail, noteInformation: source };
  const directional = front.type === "Directional";
  const afterNoteType = tail?.type === "Directional"
    ? tail.width > 1
      ? tail.direction === "Left" ? AfterNoteType.SlideMultipleDirectionalFlickLeft : AfterNoteType.SlideMultipleDirectionalFlickRight
      : tail.direction === "Left" ? AfterNoteType.SlideDirectionalFlickEndLeft : AfterNoteType.SlideDirectionalFlickEndRight
    : tail?.type === "Flick" ? AfterNoteType.SlideFlickEnd : AfterNoteType.None;
  const lane = (node: GarupaProductNode) => node.type === "Directional" ? node.lane : node.spanStart + (node.width - 1) / 2;
  const noteInformation: DirectionalGraphSource = {
    absolutePos: front.absolutePosition, afterNoteAbsolutePos: tail?.absolutePosition ?? front.absolutePosition,
    buttonType: lane(front), isInvisible: !front.visible,
    fireNoteType: tail !== null ? FrontNoteType.SlideA : directional
      ? front.width > 1 ? FrontNoteType.MultipleDirectionalFlick : FrontNoteType.DirectionalFlick
      : front.type === "Flick" ? FrontNoteType.Flick : FrontNoteType.Normal,
    gameNoteType: tail !== null ? GameNoteType.SlideA : directional
      ? front.direction === "Left" ? GameNoteType.DirectionalFlickLeft : GameNoteType.DirectionalFlickRight
      : front.type === "Flick" ? GameNoteType.Flick : GameNoteType.Normal,
    afterNoteType, slideNoteList: tail === null ? [] : [{ absolutePos: tail.absolutePosition, buttonType: lane(tail) }],
  };
  return { front, tail, noteInformation };
}
