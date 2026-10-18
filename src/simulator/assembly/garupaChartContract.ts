// Simulator-owned validation and freezing for the shared Garupa chart schema.
import { GARUPA_HEADER_HABAHIRO, GARUPA_SYSTEM_LANE_CHANGE, isGarupaLongSlideShape } from "../../chart";
import type {
  GarupaChartJson,
  GarupaChartJsonDirectionalNote,
  GarupaChartJsonItem,
  GarupaChartJsonSimpleNote,
  GarupaChartJsonSlideConnection,
} from "../../chart";
import { integrityFailure, ok, type SimulatorResult } from "../engine/result";

export interface GarupaChartExtensionSummary {
  readonly svItemCount: number;
  readonly timingGroupFieldCount: number;
}

export interface CopiedGarupaChartJson {
  readonly chart: GarupaChartJson;
  readonly extensions: GarupaChartExtensionSummary;
}

const SIMPLE_TYPES = new Set(["Single", "Flick", "Skill", "Hidden"]);

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
  const headers = validateHabahiroItems(items);
  if (headers.status !== "ok") return headers;
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
  if (input.type === "Header") {
    if ("beat" in input || input.data !== GARUPA_HEADER_HABAHIRO) {
      return invalid(`${label} Header requires data ${GARUPA_HEADER_HABAHIRO} and no beat.`);
    }
    return copied(Object.freeze({ type: "Header", data: GARUPA_HEADER_HABAHIRO }), 0, 0);
  }
  if (input.type === "System") {
    if (!isFiniteNonnegative(input.beat) || input.data !== GARUPA_SYSTEM_LANE_CHANGE) {
      return invalid(`${label} System requires a finite beat and data ${GARUPA_SYSTEM_LANE_CHANGE}.`);
    }
    return copied(Object.freeze({ type: "System", beat: input.beat, data: GARUPA_SYSTEM_LANE_CHANGE }), 0, 0);
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
      !Array.isArray(input.connections) || input.connections.length < 2) {
      return invalid(`${label} Slide requires an exact connections array with at least two nodes and optional string timingGroup.`);
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
    if (input.long !== undefined && (input.long !== true || !isGarupaLongSlideShape({ connections }))) {
      return invalid(`${label} Slide long is only true on two nodes of one lane span with a Single/Skill head and a later Single/Skill/Flick/one-lane Directional tail.`);
    }
    return copied(Object.freeze({
      type: "Slide",
      connections: Object.freeze(connections),
      ...(input.long === true ? { long: true as const } : {}),
      ...(timing.value === undefined ? {} : { timingGroup: timing.value }),
    }), 0, timingCount);
  }
  const note = copyConnection(input, label);
  if (note.status !== "ok") return note;
  if (note.value.connection.type === "Hidden") {
    return invalid(`${label} Hidden is allowed only inside Slide.connections.`);
  }
  return copied(
    note.value.connection as Exclude<GarupaChartJsonItem, { readonly type: "Slide" | "BPM" | "SV" | "Header" | "System" }>,
    0,
    note.value.hasTimingGroup ? 1 : 0,
  );
}

/** The original merges wide notes only under #HABAHIRO; a lane change also requires it. */
function validateHabahiroItems(items: readonly GarupaChartJsonItem[]): SimulatorResult<void> {
  const headers = items.filter((item) => item.type === "Header").length;
  const laneChanges = items.filter((item) => item.type === "System").length;
  if (headers > 1) {
    return invalid(`At most one ${GARUPA_HEADER_HABAHIRO} Header is allowed.`);
  }
  if (headers === 1) return ok(undefined);
  if (laneChanges > 0) return invalid(`${GARUPA_SYSTEM_LANE_CHANGE} requires the ${GARUPA_HEADER_HABAHIRO} Header.`);
  const wide = items.some((item) => item.type === "Slide"
    ? item.connections.some((node) => node.type !== "Directional" && node.width > 1)
    : (item.type === "Single" || item.type === "Flick" || item.type === "Skill") && item.width > 1);
  return wide
    ? invalid(`Notes wider than one lane, except Directional, require the ${GARUPA_HEADER_HABAHIRO} Header.`)
    : ok(undefined);
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
  const baseValid = isFiniteNonnegative(input.beat) && isFiniteNumber(input.lane) &&
    Number.isInteger(input.width) && (input.width as number) > 0;
  if (input.type === "Directional") {
    if (!hasExactOptionalTimingKeys(input, ["beat", "direction", "lane", "type", "width"]) ||
      !baseValid || (input.direction !== "Left" && input.direction !== "Right")) {
      return invalid(`${label} Directional requires exact finite beat/lane, positive integer width, direction and optional timingGroup.`);
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
    return invalid(`${label} simple note requires an exact supported type, finite beat/lane, positive integer width and optional timingGroup.`);
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
  return keys.every((key) => Object.prototype.hasOwnProperty.call(input, key));
}

function hasExactOptionalTimingKeys(
  input: Record<string, unknown>,
  required: readonly string[],
): boolean {
  const expected = "timingGroup" in input ? [...required, "timingGroup"] : [...required];
  return hasExactKeys(input, expected);
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
  return integrityFailure(
    "simulator.garupa-json.invalid-chart",
    boundary,
  );
}
