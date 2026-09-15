import {
  parseGarupaChartJson,
  type GarupaChartJson,
  type GarupaChartJsonSlideConnection,
  type GarupaChartJsonTopLevelNote,
} from "../../chart";

export function buildSimulatorGarupaChart(
  chartJson: string,
  mirror: boolean,
): GarupaChartJson {
  if (typeof chartJson !== "string" || chartJson.trim().length === 0) {
    throw new Error("Simulator chart JSON is empty.");
  }
  const parsed = parseGarupaChartJson(JSON.parse(chartJson));
  if (typeof mirror !== "boolean") throw new Error("Simulator mirror requires one explicit boolean.");
  if (!mirror) return parsed;
  return Object.freeze(parsed.map((item) => {
    if (item.type === "BPM" || item.type === "SV") return Object.freeze({ ...item });
    if (item.type === "Slide") {
      return Object.freeze({
        type: "Slide" as const,
        connections: Object.freeze(item.connections.map(mirrorConnection)),
        ...(item.timingGroup === undefined ? {} : { timingGroup: item.timingGroup }),
      });
    }
    return mirrorTopLevel(item);
  }));
}

function mirrorTopLevel(note: GarupaChartJsonTopLevelNote): GarupaChartJsonTopLevelNote {
  const common = {
    ...note,
    lane: mirrorLane(note.lane, note.width),
  };
  return note.type === "Directional"
    ? Object.freeze({
        ...common,
        type: "Directional" as const,
        direction: opposite(note.direction),
      })
    : Object.freeze(common);
}

function mirrorConnection(connection: GarupaChartJsonSlideConnection): GarupaChartJsonSlideConnection {
  const common = {
    ...connection,
    lane: mirrorLane(connection.lane, connection.width),
  };
  return connection.type === "Directional"
    ? Object.freeze({
        ...common,
        type: "Directional" as const,
        direction: opposite(connection.direction),
      })
    : Object.freeze(common);
}

function mirrorLane(lane: number, width: number): number {
  if (!Number.isFinite(lane) || !Number.isFinite(width) || !(width > 0)) {
    throw new Error("Simulator mirror requires finite lane and positive authored span.");
  }
  const mirrored = 7 - lane - width;
  if (!Number.isFinite(mirrored)) throw new Error("Simulator mirrored lane is not finite.");
  return mirrored;
}

function opposite(direction: "Left" | "Right"): "Left" | "Right" {
  return direction === "Left" ? "Right" : "Left";
}
