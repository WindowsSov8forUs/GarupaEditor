import type { ChartConstructionResult, NoteBatchInformation, NoteInformation } from "../chart/types";
import { getGarupaProductChartProfile } from "./productChartProfile";

/** Extend the same launcher queue; SV does not select another Single state machine. */
export function runtimeNoteBatches(chart: ChartConstructionResult): readonly NoteBatchInformation[] {
  const profile = getGarupaProductChartProfile(chart);
  const singles = profile?.visibleNodes.filter(node => node.chainIdentity === null) ?? [];
  if (singles.length === 0) return chart.noteBatches;
  const groups = new Map<number, { source: NoteBatchInformation | NoteInformation; notes: NoteInformation[] }>();
  for (const batch of chart.noteBatches) groups.set(batch.absolutePos, { source: batch, notes: [...batch.informationList] });
  for (const node of singles) {
    const source = node.scoringSource!;
    let group = groups.get(source.absolutePos);
    if (group === undefined) {
      group = { source, notes: [] };
      groups.set(source.absolutePos, group);
    }
    group.notes.push(source);
  }
  const authoredOrder = (source: NoteInformation) => profile!.originalSourceOrder.get(source) ??
    profile!.scoringNodeBySource.get(source)!.chartItemIndex;
  return Object.freeze([...groups].sort(([a], [b]) => a - b).map(([absolutePos, { source, notes }]) =>
    Object.freeze({ absolutePos, barIndex: source.barIndex, numerator: source.numerator,
      denominator: source.denominator, informationList: Object.freeze(notes.sort((a, b) => authoredOrder(a) - authoredOrder(b))) })));
}
