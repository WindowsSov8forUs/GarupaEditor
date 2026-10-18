import type { GarupaChartJson } from "../../../chart";
import type { ChartConstructionResult } from "../chart/types";
import { integrityFailure, ok, type SimulatorResult } from "../result";

export interface TempoSegment {
  readonly position: number;
  readonly seconds: number;
  readonly bpm: number;
  readonly sourceOrder: number;
}

/** One positive tempo segment while it advances the latest time reached. */
export interface TempoFrontierPiece {
  readonly seconds: number;
  readonly authored: number;
  /** Authored minus runtime position; constant inside one piece. */
  readonly offset: number;
  readonly bpm: number;
  readonly sourceOrder: number;
  readonly segmentIndex: number;
}

/** Authored positions may fold in time; the shared runtime position never does.
 * The runtime clock follows the tempo frontier, the latest time reached by the
 * authored tempo sequence. Positions on that frontier keep their authored value
 * shifted by the frontier offset; folded-back positions use their time. */
export interface SignedTempo {
  readonly segments: readonly TempoSegment[];
  readonly frontier: readonly TempoFrontierPiece[];
  readonly folded: boolean;
  readonly baseBpm: number;
  /** Runtime position at music start; whole bars that keep pre-start events nonnegative. */
  readonly startPosition: number;
  readonly secondsAt: (authoredPosition: number) => number;
  readonly runtimePosition: (authoredPosition: number) => number;
  /** Authored frontier position for a runtime position, used by stage beats. */
  readonly frontierAuthoredPosition: (runtimePosition: number) => number;
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
  const segmentIndexAt = (position: number): number => {
    let low = 0, high = segments.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (segments[middle]!.position <= position) low = middle + 1;
      else high = middle - 1;
    }
    return Math.max(0, high);
  };
  const secondsAt = (position: number): number => {
    const segment = segments[segmentIndexAt(position)]!;
    return segment.seconds + (position - segment.position) * 60 / (48 * segment.bpm);
  };
  let earliestSeconds = 0;
  for (const item of chart) {
    if (item.type === "Header") continue;
    for (const node of item.type === "Slide" ? item.connections : [item]) {
      const at = secondsAt(node.beat * 48);
      if (!Number.isFinite(at)) return invalid("Every chart event must map to finite time.");
      earliestSeconds = Math.min(earliestSeconds, at);
    }
  }
  const frontier: TempoFrontierPiece[] = [];
  let latest = 0;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!, next = segments[index + 1];
    if (segment.bpm < 0) continue;
    const end = next === undefined ? Infinity : next.seconds;
    if (frontier.length > 0 && end <= latest) continue;
    const previous = frontier[frontier.length - 1];
    if (previous === undefined || segment.seconds >= latest) {
      // Contiguous continuation keeps the authored coordinate and its offset.
      frontier.push(Object.freeze({ seconds: segment.seconds, authored: segment.position, offset: previous?.offset ?? 0,
        bpm: segment.bpm, sourceOrder: segment.sourceOrder, segmentIndex: index }));
    } else {
      // The sequence returns to the frontier inside this segment.
      const authored = segment.position + (latest - segment.seconds) * 48 * segment.bpm / 60;
      const runtime = previous.authored - previous.offset + (latest - previous.seconds) * 48 * previous.bpm / 60;
      frontier.push(Object.freeze({ seconds: latest, authored, offset: authored - runtime,
        bpm: segment.bpm, sourceOrder: segment.sourceOrder, segmentIndex: index }));
    }
    latest = end;
  }
  // Folding can place events before music start. Shift the runtime axis by whole
  // bars so every runtime position stays nonnegative and keeps its bar phase.
  const earliestRuntime = earliestSeconds * 48 * frontier[0]!.bpm / 60;
  const startPosition = earliestRuntime < 0 ? Math.ceil(-earliestRuntime / 192) * 192 : 0;
  if (startPosition > 0) {
    for (let index = 0; index < frontier.length; index++)
      frontier[index] = Object.freeze({ ...frontier[index]!, offset: frontier[index]!.offset - startPosition });
  }
  const pieceAtSeconds = (time: number): TempoFrontierPiece => {
    let low = 0, high = frontier.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (frontier[middle]!.seconds <= time) low = middle + 1;
      else high = middle - 1;
    }
    return frontier[Math.max(0, high)]!;
  };
  const runtimeAtSeconds = (time: number): number => {
    const piece = pieceAtSeconds(time);
    return piece.authored - piece.offset + (time - piece.seconds) * 48 * piece.bpm / 60;
  };
  const runtimePosition = (position: number): number => {
    const time = secondsAt(position);
    const piece = pieceAtSeconds(time);
    // Positions on the frontier stay exact; folded ones are placed by time.
    return piece.segmentIndex === segmentIndexAt(position) && time >= piece.seconds
      ? position - piece.offset : runtimeAtSeconds(time);
  };
  const frontierAuthoredPosition = (runtime: number): number => {
    let low = 0, high = frontier.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (frontier[middle]!.authored - frontier[middle]!.offset <= runtime) low = middle + 1;
      else high = middle - 1;
    }
    return runtime + frontier[Math.max(0, high)]!.offset;
  };
  return ok(Object.freeze({
    segments: Object.freeze(segments), frontier: Object.freeze(frontier),
    folded: segments.some(segment => segment.bpm < 0), baseBpm: segments[0]!.bpm, startPosition,
    secondsAt, runtimePosition, frontierAuthoredPosition,
  }));
}

function invalid(boundary: string): ReturnType<typeof integrityFailure> {
  return integrityFailure("simulator.garupa-json.invalid-bpm", boundary);
}
