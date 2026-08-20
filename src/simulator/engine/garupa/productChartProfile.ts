import type { GarupaChartJsonDirection, GarupaChartJsonSlideConnection } from "../../../chart";
import type { ChartConstructionResult, NoteInformation } from "../chart/types";

export type GarupaProductChartRoute = "original-compatible" | "product-extension";
export type GarupaProductTimingGroupId = "#Global" | `#${string}`;

export interface GarupaProductSvEvent {
  readonly sourceOrder: number;
  readonly absolutePosition: number;
  readonly value: number;
  readonly timingGroup: GarupaProductTimingGroupId;
}

export interface GarupaProductNode {
  readonly identity: string;
  readonly chartItemIndex: number;
  readonly connectionIndex: number | null;
  readonly chainIdentity: string | null;
  readonly authoredOrder: number;
  readonly type: GarupaChartJsonSlideConnection["type"];
  readonly beat: number;
  readonly absolutePosition: number;
  readonly shortRhythmUnder8beat: boolean;
  readonly lane: number;
  readonly width: number;
  readonly spanStart: number;
  readonly spanEnd: number;
  readonly direction: GarupaChartJsonDirection | null;
  readonly timingGroup: GarupaProductTimingGroupId;
  readonly visible: boolean;
  /**
   * Private CS-V1/transaction identity. ButtonType.None deliberately means the
   * product geometry is not an original button and must never enter NoteManager.
   */
  readonly scoringSource: NoteInformation | null;
}

export interface GarupaProductSyncPair {
  readonly identity: string;
  readonly absolutePosition: number;
  readonly firstNodeIdentity: string;
  readonly secondNodeIdentity: string;
  readonly authoredOrder: number;
}

export interface GarupaProductSlideChain {
  readonly identity: string;
  readonly chartItemIndex: number;
  readonly timingGroup: GarupaProductTimingGroupId;
  readonly connectionIdentities: readonly string[];
  readonly visibleConnectionIdentities: readonly string[];
  readonly allHidden: boolean;
  readonly containsHidden: boolean;
}

export interface GarupaProductChartProfile {
  readonly route: GarupaProductChartRoute;
  readonly svEvents: readonly GarupaProductSvEvent[];
  readonly nodes: readonly GarupaProductNode[];
  readonly visibleNodes: readonly GarupaProductNode[];
  readonly syncPairs: readonly GarupaProductSyncPair[];
  readonly slideChains: readonly GarupaProductSlideChain[];
  readonly nodeByIdentity: ReadonlyMap<string, GarupaProductNode>;
  readonly scoringNodeBySource: WeakMap<NoteInformation, GarupaProductNode>;
}

const profileByChart = new WeakMap<ChartConstructionResult, GarupaProductChartProfile>();

export function registerGarupaProductChartProfile(
  chart: ChartConstructionResult,
  profile: GarupaProductChartProfile,
): void {
  profileByChart.set(chart, profile);
}

export function getGarupaProductChartProfile(
  chart: ChartConstructionResult,
): GarupaProductChartProfile | undefined {
  return profileByChart.get(chart);
}

export function freezeGarupaProductChartProfile(input: {
  readonly route: GarupaProductChartRoute;
  readonly svEvents: GarupaProductSvEvent[];
  readonly nodes: GarupaProductNode[];
  readonly slideChains: GarupaProductSlideChain[];
}): GarupaProductChartProfile {
  const nodes = Object.freeze(input.nodes.map((node) => {
    if (node.scoringSource !== null) freezeProductScoringSource(node.scoringSource);
    return Object.freeze(node);
  }));
  const visibleNodes = Object.freeze(nodes.filter((node) => node.visible));
  const syncPairs = freezeProductSyncPairs(nodes);
  const nodeByIdentity = new Map<string, GarupaProductNode>();
  const scoringNodeBySource = new WeakMap<NoteInformation, GarupaProductNode>();
  for (const node of nodes) {
    nodeByIdentity.set(node.identity, node);
    if (node.scoringSource !== null) scoringNodeBySource.set(node.scoringSource, node);
  }
  const slideChains = Object.freeze(input.slideChains.map((chain) => Object.freeze({
    ...chain,
    connectionIdentities: Object.freeze([...chain.connectionIdentities]),
    visibleConnectionIdentities: Object.freeze([...chain.visibleConnectionIdentities]),
  })));
  return Object.freeze({
    route: input.route,
    svEvents: Object.freeze(input.svEvents.map((event) => Object.freeze(event))),
    nodes,
    visibleNodes,
    syncPairs,
    slideChains,
    nodeByIdentity,
    scoringNodeBySource,
  });
}

function freezeProductSyncPairs(
  nodes: readonly GarupaProductNode[],
): readonly GarupaProductSyncPair[] {
  const byPosition = new Map<number, GarupaProductNode[]>();
  for (const node of nodes) {
    if (!node.visible) continue;
    const rows = byPosition.get(node.absolutePosition) ?? [];
    rows.push(node);
    byPosition.set(node.absolutePosition, rows);
  }
  const pairs: GarupaProductSyncPair[] = [];
  for (const [absolutePosition, rows] of [...byPosition.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((left, right) => left.authoredOrder - right.authoredOrder);
    for (let index = 1; index < rows.length; index += 1) {
      const first = rows[index - 1]!;
      const second = rows[index]!;
      if (first.spanStart + (first.width - 1) / 2 === second.spanStart + (second.width - 1) / 2) continue;
      pairs.push(Object.freeze({
        identity: `garupa-sync:${absolutePosition}:${first.identity}:${second.identity}`,
        absolutePosition,
        firstNodeIdentity: first.identity,
        secondNodeIdentity: second.identity,
        authoredOrder: second.authoredOrder,
      }));
    }
  }
  return Object.freeze(pairs);
}

function freezeProductScoringSource(source: NoteInformation): void {
  Object.freeze(source.buttonTypes);
  Object.freeze(source.buttonTypesArray);
  Object.freeze(source.slideNoteList);
  Object.freeze(source.soundValueList);
  Object.freeze(source);
}
