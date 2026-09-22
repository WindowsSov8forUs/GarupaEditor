import type { GarupaChartJson } from "../../../chart";
import type { ChartConstructionResult } from "../chart/types";
import { integrityFailure, ok, type SimulatorResult } from "../result";

export interface TempoSegment {
  readonly position: number;
  readonly seconds: number;
  readonly bpm: number;
  readonly sourceOrder: number;
}

/** Authored positions may fold in time; the shared runtime position never does. */
export interface SignedTempo {
  readonly segments: readonly TempoSegment[];
  readonly folded: boolean;
  readonly baseBpm: number;
  readonly originSeconds: number;
  readonly secondsAt: (authoredPosition: number) => number;
  readonly runtimePosition: (authoredPosition: number) => number;
  readonly positionAtSeconds: (seconds: number) => number;
  readonly secondsAtRuntimePosition: (position: number) => number;
  readonly stageAtSeconds: (seconds: number) => { bpm: number; position: number };
}

const tempoByChart = new WeakMap<ChartConstructionResult, SignedTempo>();
export function registerSignedTempo(chart: ChartConstructionResult, tempo: SignedTempo): void {
  tempoByChart.set(chart, tempo);
}
export function getSignedTempo(chart: ChartConstructionResult): SignedTempo | undefined {
  return tempoByChart.get(chart);
}

export function buildSignedTempo(chart: GarupaChartJson): SimulatorResult<SignedTempo> {
  const byPosition = new Map<number, { position: number; bpm: number; sourceOrder: number }>();
  for (let sourceOrder = 0; sourceOrder < chart.length; sourceOrder++) {
    const item = chart[sourceOrder]!;
    if (item.type !== "BPM") continue;
    const bpm = Math.fround(item.value), position = item.beat * 48;
    if (!Number.isFinite(bpm) || bpm === 0 || !Number.isFinite(position) || position < 0)
      return invalid("BPM must be finite and nonzero, with a finite nonnegative Beat.");
    byPosition.set(position, { position, bpm, sourceOrder });
  }
  const commands = [...byPosition.values()].sort((a, b) => a.position - b.position);
  if (commands.length === 0 || commands[0]!.position !== 0 || commands[0]!.bpm <= 0 || commands[commands.length - 1]!.bpm <= 0)
    return invalid("The initial and final effective BPM must be positive; zero BPM is illegal.");
  const segments: TempoSegment[] = [];
  let seconds = 0;
  for (const command of commands) {
    const previous = segments[segments.length - 1];
    if (previous) seconds += (command.position - previous.position) * 60 / (48 * previous.bpm);
    if (!Number.isFinite(seconds)) return invalid("BPM integration must retain finite time.");
    segments.push(Object.freeze({ ...command, seconds }));
  }
  const secondsAt = (position: number): number => {
    let low = 0, high = segments.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (segments[middle]!.position <= position) low = middle + 1;
      else high = middle - 1;
    }
    const segment = segments[Math.max(0, high)]!;
    return segment.seconds + (position - segment.position) * 60 / (48 * segment.bpm);
  };
  // This is a coordinate origin only: it never shifts the music or target times.
  let originSeconds = segments.reduce((minimum, segment) => Math.min(minimum, segment.seconds), 0);
  for (const item of chart) {
    for (const node of item.type === "Slide" ? item.connections : [item]) {
      const at = secondsAt(node.beat * 48);
      if (!Number.isFinite(at)) return invalid("Every chart event must map to finite time.");
      originSeconds = Math.min(originSeconds, at);
    }
  }
  const baseBpm = segments[0]!.bpm, unitsPerSecond = baseBpm * 48 / 60;
  const positionAtSeconds = (time: number) => (time - originSeconds) * unitsPerSecond;
  return ok(Object.freeze({
    segments: Object.freeze(segments), folded: segments.some(segment => segment.bpm < 0),
    baseBpm, originSeconds, secondsAt, positionAtSeconds,
    runtimePosition: (position: number) => positionAtSeconds(secondsAt(position)),
    secondsAtRuntimePosition: (position: number) => position / unitsPerSecond + originSeconds,
    stageAtSeconds: (time: number) => {
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index]!, next = segments[index + 1];
        if (segment.bpm > 0 && time >= segment.seconds && (next === undefined || time < next.seconds))
          return { bpm: segment.bpm, position: segment.position + (time - segment.seconds) * segment.bpm * 48 / 60 };
      }
      return { bpm: baseBpm, position: time * unitsPerSecond };
    },
  }));
}

function invalid(boundary: string): ReturnType<typeof integrityFailure> {
  return integrityFailure("simulator.garupa-json.invalid-bpm", boundary);
}
