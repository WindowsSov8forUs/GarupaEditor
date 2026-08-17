// Simulator-owned validation and freezing for the shared Garupa chart schema.
import type {
  GarupaChartJson,
  GarupaChartJsonDirectionalNote,
  GarupaChartJsonItem,
  GarupaChartJsonSimpleNote,
  GarupaChartJsonSlideConnection,
} from "../../chart";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";

export interface GarupaChartExtensionSummary {
  readonly svItemCount: number;
  readonly timingGroupFieldCount: number;
}

export interface CopiedGarupaChartJson {
  readonly chart: GarupaChartJson;
  readonly extensions: GarupaChartExtensionSummary;
}

const SIMPLE_TYPES = new Set(["Single", "Flick", "Skill", "Hidden"]);

/**
 * Temporary fail-closed inventory used only until the product extension owner is
 * complete. It intentionally runs before media/resource preflight so a chart
 * whose authored semantics would be dropped cannot acquire any external owner.
 */
export function describeOpenGarupaProductExtension(input: unknown): string | null {
  if (!Array.isArray(input)) return null;
  for (let itemIndex = 0; itemIndex < input.length; itemIndex += 1) {
    const item = input[itemIndex];
    if (!isRecord(item) || typeof item.type !== "string") continue;
    if (item.type === "SV") return `chart[${itemIndex}] contains an authored SV event.`;
    if (hasNonGlobalTimingGroup(item)) {
      return `chart[${itemIndex}] selects a non-Global TimingGroup.`;
    }
    if (item.type === "Slide" && Array.isArray(item.connections)) {
      if (item.connections.length < 2) {
        return `chart[${itemIndex}] is a singleton or empty product Slide.`;
      }
      const connections = item.connections;
      const head = connections[0];
      const tail = connections[connections.length - 1];
      if (!isRecord(head) || (head.type !== "Single" && head.type !== "Skill") ||
        !isRecord(tail) || tail.type === "Hidden") {
        return `chart[${itemIndex}] uses a product-only Slide endpoint.`;
      }
      let previousPosition = -1;
      for (let connectionIndex = 0; connectionIndex < connections.length; connectionIndex += 1) {
        const connection = connections[connectionIndex];
        if (!isRecord(connection)) continue;
        if (hasNonGlobalTimingGroup(connection)) {
          return `chart[${itemIndex}].connections[${connectionIndex}] selects a non-Global TimingGroup.`;
        }
        const laneReason = describeProductLane(connection);
        if (laneReason !== null) return `chart[${itemIndex}].connections[${connectionIndex}] ${laneReason}`;
        if (connectionIndex > 0 && connectionIndex + 1 < connections.length &&
          connection.type !== "Single" && connection.type !== "Hidden") {
          return `chart[${itemIndex}].connections[${connectionIndex}] uses product-only interior type ${String(connection.type)}.`;
        }
        if (typeof connection.beat === "number" && Number.isFinite(connection.beat)) {
          const position = Math.floor(connection.beat * 48);
          if (position <= previousPosition) {
            return `chart[${itemIndex}] has equal or non-increasing authored connection positions.`;
          }
          previousPosition = position;
        }
      }
      if (isRecord(tail) && tail.type === "Directional" &&
        typeof tail.width === "number" && tail.width > 3) {
        return `chart[${itemIndex}] uses a product-only wide Directional tail.`;
      }
      continue;
    }
    const laneReason = describeProductLane(item);
    if (laneReason !== null) return `chart[${itemIndex}] ${laneReason}`;
  }
  return null;
}

export function copyAndFreezeGarupaChartJson(
  input: unknown,
): SimulatorResult<CopiedGarupaChartJson> {
  if (!Array.isArray(input)) return invalid("The Garupa JSON chart must be an object array.");
  const items: GarupaChartJsonItem[] = [];
  let svItemCount = 0;
  let timingGroupFieldCount = 0;
  for (let index = 0; index < input.length; index += 1) {
    const copied = copyItem(input[index], index);
    if (copied.status !== "ok") return copied;
    items.push(copied.value.item);
    svItemCount += copied.value.svItemCount;
    timingGroupFieldCount += copied.value.timingGroupFieldCount;
  }
  return ok(Object.freeze({
    chart: Object.freeze(items),
    extensions: Object.freeze({ svItemCount, timingGroupFieldCount }),
  }));
}

function copyItem(
  input: unknown,
  index: number,
): SimulatorResult<{
  readonly item: GarupaChartJsonItem;
  readonly svItemCount: number;
  readonly timingGroupFieldCount: number;
}> {
  const label = `chart[${index}]`;
  if (!isRecord(input) || typeof input.type !== "string") {
    return invalid(`${label} must be an object with one string type.`);
  }
  if (input.type === "BPM") {
    if (!hasExactKeys(input, ["beat", "type", "value"]) ||
      !isFiniteNonnegative(input.beat) || !isFiniteNumber(input.value)) {
      return invalid(`${label} BPM requires exact type/beat/value finite fields.`);
    }
    return copied(Object.freeze({ type: "BPM", beat: input.beat, value: input.value }), 0, 0);
  }
  if (input.type === "SV") {
    const timing = copyTimingGroup(input, label);
    if (timing.status !== "ok" || !hasExactOptionalTimingKeys(input, ["beat", "type", "value"]) ||
      !isFiniteNonnegative(input.beat) || !isFiniteNumber(input.value)) {
      return invalid(`${label} SV requires exact finite beat/value and optional string timingGroup.`);
    }
    return copied(Object.freeze({
      type: "SV",
      beat: input.beat,
      value: input.value,
      ...(timing.value === undefined ? {} : { timingGroup: timing.value }),
    }), 1, timing.value === undefined ? 0 : 1);
  }
  if (input.type === "Slide") {
    const timing = copyTimingGroup(input, label);
    if (timing.status !== "ok" || !hasExactOptionalTimingKeys(input, ["connections", "type"]) ||
      !Array.isArray(input.connections)) {
      return invalid(`${label} Slide requires exact connections and optional string timingGroup.`);
    }
    const connections: GarupaChartJsonSlideConnection[] = [];
    let timingCount = timing.value === undefined ? 0 : 1;
    for (let connectionIndex = 0; connectionIndex < input.connections.length; connectionIndex += 1) {
      const connection = copyConnection(
        input.connections[connectionIndex],
        `${label}.connections[${connectionIndex}]`,
      );
      if (connection.status !== "ok") return connection;
      connections.push(connection.value.connection);
      timingCount += connection.value.hasTimingGroup ? 1 : 0;
    }
    return copied(Object.freeze({
      type: "Slide",
      connections: Object.freeze(connections),
      ...(timing.value === undefined ? {} : { timingGroup: timing.value }),
    }), 0, timingCount);
  }
  const note = copyConnection(input, label);
  if (note.status !== "ok") return note;
  if (note.value.connection.type === "Hidden") {
    return invalid(`${label} Hidden is allowed only inside Slide.connections.`);
  }
  return copied(
    note.value.connection as Exclude<GarupaChartJsonItem, { readonly type: "Slide" | "BPM" | "SV" }>,
    0,
    note.value.hasTimingGroup ? 1 : 0,
  );
}

function copyConnection(
  input: unknown,
  label: string,
): SimulatorResult<{
  readonly connection: GarupaChartJsonSlideConnection;
  readonly hasTimingGroup: boolean;
}> {
  if (!isRecord(input) || typeof input.type !== "string") {
    return invalid(`${label} must be one Garupa JSON note object.`);
  }
  const timing = copyTimingGroup(input, label);
  if (timing.status !== "ok") return timing;
  const baseValid = isFiniteNonnegative(input.beat) && Number.isInteger(input.lane) &&
    Number.isInteger(input.width) && (input.width as number) > 0;
  if (input.type === "Directional") {
    if (!hasExactOptionalTimingKeys(input, ["beat", "direction", "lane", "type", "width"]) ||
      !baseValid || (input.direction !== "Left" && input.direction !== "Right")) {
      return invalid(`${label} Directional requires exact finite beat, integer lane/width, direction and optional timingGroup.`);
    }
    const connection: GarupaChartJsonDirectionalNote = Object.freeze({
      type: "Directional",
      beat: input.beat as number,
      lane: input.lane as number,
      width: input.width as number,
      direction: input.direction,
      ...(timing.value === undefined ? {} : { timingGroup: timing.value }),
    });
    return ok(Object.freeze({ connection, hasTimingGroup: timing.value !== undefined }));
  }
  if (!SIMPLE_TYPES.has(input.type) ||
    !hasExactOptionalTimingKeys(input, ["beat", "lane", "type", "width"]) || !baseValid) {
    return invalid(`${label} simple note requires an exact supported type, finite beat, integer lane/width and optional timingGroup.`);
  }
  const connection: GarupaChartJsonSimpleNote = Object.freeze({
    type: input.type as GarupaChartJsonSimpleNote["type"],
    beat: input.beat as number,
    lane: input.lane as number,
    width: input.width as number,
    ...(timing.value === undefined ? {} : { timingGroup: timing.value }),
  });
  return ok(Object.freeze({ connection, hasTimingGroup: timing.value !== undefined }));
}

function copyTimingGroup(
  input: Record<string, unknown>,
  label: string,
): SimulatorResult<string | undefined> {
  if (!("timingGroup" in input)) return ok(undefined);
  return typeof input.timingGroup === "string"
    ? ok(input.timingGroup)
    : invalid(`${label}.timingGroup must be a string when present.`);
}

function copied(
  item: GarupaChartJsonItem,
  svItemCount: number,
  timingGroupFieldCount: number,
): SimulatorResult<{
  readonly item: GarupaChartJsonItem;
  readonly svItemCount: number;
  readonly timingGroupFieldCount: number;
}> {
  return ok(Object.freeze({ item, svItemCount, timingGroupFieldCount }));
}

function hasExactKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(input).sort().join(",") === [...keys].sort().join(",");
}

function hasExactOptionalTimingKeys(
  input: Record<string, unknown>,
  required: readonly string[],
): boolean {
  const expected = "timingGroup" in input ? [...required, "timingGroup"] : [...required];
  return hasExactKeys(input, expected);
}

function hasNonGlobalTimingGroup(input: Record<string, unknown>): boolean {
  if (!("timingGroup" in input) || input.timingGroup === undefined) return false;
  if (typeof input.timingGroup !== "string") return false;
  const normalized = input.timingGroup.trim().toLowerCase();
  return normalized !== "" && normalized !== "#global" && normalized !== "global";
}

function describeProductLane(input: Record<string, unknown>): string | null {
  if (typeof input.lane !== "number" || !Number.isFinite(input.lane) ||
    typeof input.width !== "number" || !Number.isInteger(input.width) || input.width <= 0) {
    return null;
  }
  if (!Number.isInteger(input.lane)) return "uses a continuous lane coordinate.";
  const start = input.type === "Directional" && input.direction === "Left"
    ? input.lane - input.width + 1
    : input.lane;
  return start < 0 || start + input.width > 7
    ? "extends outside the original seven-lane span."
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNonnegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function invalid<T>(boundary: string): SimulatorResult<T> {
  return evidenceRequired(
    "simulator.garupa-json.invalid-chart",
    ["GJP-D01"],
    boundary,
  );
}
