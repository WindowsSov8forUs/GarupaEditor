import type { ChartConstructionResult } from "../chart/types";

export interface ChartRuntimeMetadata {
  readonly processBpmChangeCount: number;
}

const metadataByChart = new WeakMap<ChartConstructionResult, ChartRuntimeMetadata>();
let processBpmChangeCount = 0;

export function registerConstructedChartRuntimeMetadata(
  chart: ChartConstructionResult,
): void {
  const chartBpmChangeCount = chart.bpmChangeRealValueList.length;
  processBpmChangeCount = (processBpmChangeCount + chartBpmChangeCount) | 0;
  metadataByChart.set(chart, {
    processBpmChangeCount,
  });
}

export function getConstructedChartRuntimeMetadata(
  chart: ChartConstructionResult,
): ChartRuntimeMetadata | undefined {
  return metadataByChart.get(chart);
}
