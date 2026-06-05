import type { ChartJson, ChartJsonDirection } from "./chartCore";

type CurrentSimpleType = "Single" | "Flick" | "Skill" | "Hidden";

type CurrentSimpleNote = {
  type: CurrentSimpleType;
  beat: number;
  lane: number;
  width: number;
  timingGroup?: string;
};

type CurrentDirectionalNote = {
  type: "Directional";
  beat: number;
  lane: number;
  width: number;
  direction: ChartJsonDirection;
  timingGroup?: string;
};

type CurrentSlideConnection = CurrentSimpleNote | CurrentDirectionalNote;

type CurrentSlideItem = {
  type: "Slide";
  connections: CurrentSlideConnection[];
  timingGroup?: string;
};

type CurrentBpmItem = {
  type: "BPM";
  beat: number;
  value: number;
};

type CurrentSvItem = {
  type: "SV";
  beat: number;
  value: number;
  timingGroup?: string;
};

type CurrentTopLevelNote = Exclude<CurrentSimpleNote, { type: "Hidden" }> | CurrentDirectionalNote;

type CurrentChartItem = CurrentBpmItem | CurrentSvItem | CurrentTopLevelNote | CurrentSlideItem;
export type CurrentChartJson = CurrentChartItem[];

type BestdoriV2BpmItem = {
  type: "BPM";
  beat: number;
  bpm: number;
};

type BestdoriV2SingleItem = {
  type: "Single";
  beat: number;
  lane: number;
  flick?: boolean;
  skill?: boolean;
};

type BestdoriV2DirectionalItem = {
  type: "Directional";
  beat: number;
  lane: number;
  width: number;
  direction: ChartJsonDirection;
};

type BestdoriV2SlideConnection = {
  beat: number;
  lane: number;
  hidden?: boolean;
  flick?: boolean;
  skill?: boolean;
};

type BestdoriV2SlideItem = {
  type: "Slide";
  connections: BestdoriV2SlideConnection[];
};

type BestdoriV2ChartItem =
  | BestdoriV2BpmItem
  | BestdoriV2SingleItem
  | BestdoriV2DirectionalItem
  | BestdoriV2SlideItem;

export type BestdoriV2Chart = BestdoriV2ChartItem[];

type ChartFormatConvertOptions = {
  normalizeBpmAtZero?: boolean;
};

const BEAT_ZERO_EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFiniteNumber(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a finite number`);
  }
  return numeric;
}

function parseBooleanFlag(value: unknown): boolean {
  return value === true;
}

function parseDirection(value: unknown, label: string): ChartJsonDirection {
  if (value === "Left" || value === "Right") {
    return value;
  }
  throw new Error(`${label} must be Left or Right`);
}

function parsePositiveInteger(value: unknown, label: string): number {
  const numeric = parseFiniteNumber(value, label);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new Error(`${label} must be an integer >= 1`);
  }
  return numeric;
}

function parseTimingGroup(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === "#Global") {
      return undefined;
    }
    if (/^#[A-Za-z0-9 -]+$/.test(trimmed)) {
      return trimmed;
    }
    throw new Error(`${label} must be a valid timing group id`);
  }
  const numeric = parseFiniteNumber(value, label);
  const normalized = Math.max(0, Math.round(numeric));
  return normalized === 0 ? undefined : `#${normalized}`;
}

function shiftAndClampBeat(beat: number, offset: number): number {
  const shifted = beat - offset;
  return shifted <= BEAT_ZERO_EPSILON ? 0 : shifted;
}

function findMinBpmBeatFromCurrent(items: CurrentChartJson): number {
  const bpmItems = items.filter((item): item is CurrentBpmItem => item.type === "BPM");
  if (bpmItems.length === 0) {
    throw new Error("Current chart JSON must include at least one BPM item.");
  }
  return bpmItems.reduce((minBeat, item) => Math.min(minBeat, item.beat), bpmItems[0].beat);
}

function findMinBpmBeatFromBestdori(items: BestdoriV2Chart): number {
  const bpmItems = items.filter((item): item is BestdoriV2BpmItem => item.type === "BPM");
  if (bpmItems.length === 0) {
    throw new Error("Bestdori V2 chart must include at least one BPM item.");
  }
  return bpmItems.reduce((minBeat, item) => Math.min(minBeat, item.beat), bpmItems[0].beat);
}

function normalizeCurrentBpmAtZero(items: CurrentChartJson): CurrentChartJson {
  const minBpmBeat = findMinBpmBeatFromCurrent(items);
  if (Math.abs(minBpmBeat) <= BEAT_ZERO_EPSILON) {
    return items.map((item) => {
      if (item.type === "Slide") {
        return {
          type: "Slide",
          connections: item.connections.map((connection) => ({ ...connection })),
        };
      }
      return { ...item };
    });
  }

  return items.map((item) => {
    if (item.type === "Slide") {
      return {
        type: "Slide",
        connections: item.connections.map((connection) => ({
          ...connection,
          beat: shiftAndClampBeat(connection.beat, minBpmBeat),
        })),
      };
    }
    return {
      ...item,
      beat: shiftAndClampBeat(item.beat, minBpmBeat),
    };
  });
}

function normalizeBestdoriBpmAtZero(items: BestdoriV2Chart): BestdoriV2Chart {
  const minBpmBeat = findMinBpmBeatFromBestdori(items);
  if (Math.abs(minBpmBeat) <= BEAT_ZERO_EPSILON) {
    return items.map((item) => {
      if (item.type === "Slide") {
        return {
          type: "Slide",
          connections: item.connections.map((connection) => ({ ...connection })),
        };
      }
      return { ...item };
    });
  }

  return items.map((item) => {
    if (item.type === "Slide") {
      return {
        type: "Slide",
        connections: item.connections.map((connection) => ({
          ...connection,
          beat: shiftAndClampBeat(connection.beat, minBpmBeat),
        })),
      };
    }
    return {
      ...item,
      beat: shiftAndClampBeat(item.beat, minBpmBeat),
    };
  });
}

function parseCurrentSimpleNote(
  source: Record<string, unknown>,
  label: string,
  type: CurrentSimpleType,
): CurrentSimpleNote {
  const width =
    source.width === undefined
      ? 1
      : parsePositiveInteger(source.width, `${label}.width`);
  return {
    type,
    beat: parseFiniteNumber(source.beat, `${label}.beat`),
    lane: parseFiniteNumber(source.lane, `${label}.lane`),
    width,
    timingGroup: parseTimingGroup(source.timingGroup, `${label}.timingGroup`),
  };
}

function parseCurrentDirectionalNote(
  source: Record<string, unknown>,
  label: string,
): CurrentDirectionalNote {
  return {
    type: "Directional",
    beat: parseFiniteNumber(source.beat, `${label}.beat`),
    lane: parseFiniteNumber(source.lane, `${label}.lane`),
    width: parsePositiveInteger(source.width, `${label}.width`),
    direction: parseDirection(source.direction, `${label}.direction`),
    timingGroup: parseTimingGroup(source.timingGroup, `${label}.timingGroup`),
  };
}

export function parseCurrentChartJson(input: unknown): CurrentChartJson {
  if (!Array.isArray(input)) {
    throw new Error("Current chart JSON top-level must be an array.");
  }

  const items: CurrentChartJson = [];

  input.forEach((rawItem, itemIndex) => {
    if (!isRecord(rawItem)) {
      throw new Error(`item[${itemIndex}] must be an object`);
    }

    const rawType = rawItem.type;
    if (typeof rawType !== "string") {
      throw new Error(`item[${itemIndex}].type is required`);
    }

    const label = `item[${itemIndex}]`;
    if (rawType === "BPM") {
      items.push({
        type: "BPM",
        beat: parseFiniteNumber(rawItem.beat, `${label}.beat`),
        value: parseFiniteNumber(rawItem.value, `${label}.value`),
      });
      return;
    }

    if (rawType === "SV") {
      items.push({
        type: "SV",
        beat: parseFiniteNumber(rawItem.beat, `${label}.beat`),
        value: parseFiniteNumber(rawItem.value, `${label}.value`),
        timingGroup: parseTimingGroup(rawItem.timingGroup, `${label}.timingGroup`),
      });
      return;
    }

    if (rawType === "Slide") {
      const rawConnections = rawItem.connections;
      if (!Array.isArray(rawConnections)) {
        throw new Error(`${label}.connections must be an array`);
      }
      if (rawConnections.length === 0) {
        throw new Error(`${label}.connections cannot be empty`);
      }

      const connections: CurrentSlideConnection[] = rawConnections.map((rawConnection, connectionIndex) => {
        if (!isRecord(rawConnection)) {
          throw new Error(`${label}.connections[${connectionIndex}] must be an object`);
        }
        const connectionLabel = `${label}.connections[${connectionIndex}]`;
        const connectionType = rawConnection.type;
        if (connectionType === "Single" || connectionType === "Flick" || connectionType === "Skill" || connectionType === "Hidden") {
          return parseCurrentSimpleNote(rawConnection, connectionLabel, connectionType);
        }
        if (connectionType === "Directional") {
          return parseCurrentDirectionalNote(rawConnection, connectionLabel);
        }
        throw new Error(`${connectionLabel}.type is invalid: ${String(connectionType)}`);
      });

      items.push({
        type: "Slide",
        connections,
        timingGroup: parseTimingGroup(rawItem.timingGroup, `${label}.timingGroup`),
      });
      return;
    }

    if (rawType === "Hidden") {
      throw new Error(`${label}: Hidden is only allowed inside Slide.connections`);
    }

    if (rawType === "Single" || rawType === "Flick" || rawType === "Skill") {
      items.push(parseCurrentSimpleNote(rawItem, label, rawType));
      return;
    }

    if (rawType === "Directional") {
      items.push(parseCurrentDirectionalNote(rawItem, label));
      return;
    }

    throw new Error(`${label}.type is invalid: ${rawType}`);
  });

  const bpmCount = items.filter((item) => item.type === "BPM").length;
  if (bpmCount === 0) {
    throw new Error("Current chart JSON must include at least one BPM item.");
  }

  return items;
}

export function parseBestdoriV2Chart(input: unknown): BestdoriV2Chart {
  if (!Array.isArray(input)) {
    throw new Error("Bestdori V2 JSON top-level must be an array.");
  }

  const items: BestdoriV2Chart = [];

  input.forEach((rawItem, itemIndex) => {
    if (!isRecord(rawItem)) {
      throw new Error(`item[${itemIndex}] must be an object`);
    }

    const rawType = rawItem.type;
    if (typeof rawType !== "string") {
      throw new Error(`item[${itemIndex}].type is required`);
    }

    const type = rawType.trim();
    const label = `item[${itemIndex}]`;
    if (type === "System") {
      return;
    }

    if (type === "BPM") {
      items.push({
        type: "BPM",
        beat: parseFiniteNumber(rawItem.beat, `${label}.beat`),
        bpm: parseFiniteNumber(rawItem.bpm, `${label}.bpm`),
      });
      return;
    }

    if (type === "Single") {
      const beat = parseFiniteNumber(rawItem.beat, `${label}.beat`);
      const lane = parseFiniteNumber(rawItem.lane, `${label}.lane`);
      const flick = parseBooleanFlag(rawItem.flick);
      const skill = parseBooleanFlag(rawItem.skill);
      items.push({
        type: "Single",
        beat,
        lane,
        ...(flick ? { flick: true } : {}),
        ...(skill ? { skill: true } : {}),
      });
      return;
    }

    if (type === "Directional") {
      items.push({
        type: "Directional",
        beat: parseFiniteNumber(rawItem.beat, `${label}.beat`),
        lane: parseFiniteNumber(rawItem.lane, `${label}.lane`),
        width: parsePositiveInteger(rawItem.width, `${label}.width`),
        direction: parseDirection(rawItem.direction, `${label}.direction`),
      });
      return;
    }

    if (type === "Slide" || type === "Long") {
      const rawConnections = rawItem.connections;
      if (!Array.isArray(rawConnections)) {
        throw new Error(`${label}.connections must be an array`);
      }
      if (rawConnections.length === 0) {
        throw new Error(`${label}.connections cannot be empty`);
      }
      const connections = rawConnections.map((rawConnection, connectionIndex) => {
        if (!isRecord(rawConnection)) {
          throw new Error(`${label}.connections[${connectionIndex}] must be an object`);
        }
        const connectionLabel = `${label}.connections[${connectionIndex}]`;
        const beat = parseFiniteNumber(rawConnection.beat, `${connectionLabel}.beat`);
        const lane = parseFiniteNumber(rawConnection.lane, `${connectionLabel}.lane`);
        const hidden = parseBooleanFlag(rawConnection.hidden);
        const flick = parseBooleanFlag(rawConnection.flick);
        const skill = parseBooleanFlag(rawConnection.skill);
        return {
          beat,
          lane,
          ...(hidden ? { hidden: true } : {}),
          ...(flick ? { flick: true } : {}),
          ...(skill ? { skill: true } : {}),
        } as BestdoriV2SlideConnection;
      });
      items.push({
        type: "Slide",
        connections,
      });
      return;
    }

    throw new Error(`${label}.type is invalid: ${rawType}`);
  });

  const bpmCount = items.filter((item) => item.type === "BPM").length;
  if (bpmCount === 0) {
    throw new Error("Bestdori V2 chart must include at least one BPM item.");
  }

  return items;
}

function convertBestdoriSlideConnectionToCurrent(connection: BestdoriV2SlideConnection): CurrentSimpleNote {
  if (connection.hidden === true) {
    return {
      type: "Hidden",
      beat: connection.beat,
      lane: connection.lane,
      width: 1,
    };
  }
  if (connection.skill === true) {
    return {
      type: "Skill",
      beat: connection.beat,
      lane: connection.lane,
      width: 1,
    };
  }
  if (connection.flick === true) {
    return {
      type: "Flick",
      beat: connection.beat,
      lane: connection.lane,
      width: 1,
    };
  }
  return {
    type: "Single",
    beat: connection.beat,
    lane: connection.lane,
    width: 1,
  };
}

function convertBestdoriItemToCurrent(item: BestdoriV2ChartItem): CurrentChartItem {
  if (item.type === "BPM") {
    return {
      type: "BPM",
      beat: item.beat,
      value: item.bpm,
    };
  }

  if (item.type === "Directional") {
    return {
      type: "Directional",
      beat: item.beat,
      lane: item.lane,
      width: item.width,
      direction: item.direction,
    };
  }

  if (item.type === "Single") {
    if (item.skill === true) {
      return {
        type: "Skill",
        beat: item.beat,
        lane: item.lane,
        width: 1,
      };
    }
    if (item.flick === true) {
      return {
        type: "Flick",
        beat: item.beat,
        lane: item.lane,
        width: 1,
      };
    }
    return {
      type: "Single",
      beat: item.beat,
      lane: item.lane,
      width: 1,
    };
  }

  return {
    type: "Slide",
    connections: item.connections.map((connection) => convertBestdoriSlideConnectionToCurrent(connection)),
  };
}

function convertCurrentTopLevelToBestdori(item: CurrentTopLevelNote): BestdoriV2SingleItem | BestdoriV2DirectionalItem {
  if (item.type === "Directional") {
    return {
      type: "Directional",
      beat: item.beat,
      lane: item.lane,
      width: item.width,
      direction: item.direction,
    };
  }
  if (item.type === "Flick") {
    return {
      type: "Single",
      beat: item.beat,
      lane: item.lane,
      flick: true,
    };
  }
  if (item.type === "Skill") {
    return {
      type: "Single",
      beat: item.beat,
      lane: item.lane,
      skill: true,
    };
  }
  return {
    type: "Single",
    beat: item.beat,
    lane: item.lane,
  };
}

function convertCurrentHeadOrTailVisibleToBestdori(
  note: Exclude<CurrentSlideConnection, { type: "Hidden" }>,
  allowSkill: boolean,
  allowFlick: boolean,
): BestdoriV2SlideConnection {
  if (note.type === "Skill" && allowSkill) {
    return {
      beat: note.beat,
      lane: note.lane,
      skill: true,
    };
  }
  if (note.type === "Directional" && allowFlick) {
    return {
      beat: note.beat,
      lane: note.lane,
      flick: true,
    };
  }
  if (note.type === "Flick" && allowFlick) {
    return {
      beat: note.beat,
      lane: note.lane,
      flick: true,
    };
  }
  return {
    beat: note.beat,
    lane: note.lane,
  };
}

function convertCurrentSlideToBestdori(item: CurrentSlideItem): BestdoriV2ChartItem | null {
  const original = item.connections;
  if (original.length === 0) {
    return null;
  }

  const visibleConnections = original.filter((connection) => connection.type !== "Hidden");
  if (visibleConnections.length === 0) {
    return null;
  }

  if (visibleConnections.length === 1) {
    const connection = visibleConnections[0];
    if (connection.type === "Skill") {
      return {
        type: "Single",
        beat: connection.beat,
        lane: connection.lane,
        skill: true,
      };
    }
    if (connection.type === "Flick") {
      return {
        type: "Single",
        beat: connection.beat,
        lane: connection.lane,
        flick: true,
      };
    }
    if (connection.type === "Directional") {
      return {
        type: "Single",
        beat: connection.beat,
        lane: connection.lane,
        flick: true,
      };
    }
    return {
      type: "Single",
      beat: connection.beat,
      lane: connection.lane,
    };
  }

  const connections = [...original].sort((left, right) => left.beat - right.beat);

  while (connections.length > 0 && connections[0]?.type === "Hidden") {
    connections.shift();
  }
  while (connections.length > 0 && connections[connections.length - 1]?.type === "Hidden") {
    connections.pop();
  }

  if (connections.length === 0) {
    return null;
  }

  const mappedConnections: BestdoriV2SlideConnection[] = connections.map((connection, index) => {
    if (connection.type === "Hidden") {
      return {
        beat: connection.beat,
        lane: connection.lane,
        hidden: true,
      };
    }

    const isHead = index === 0;
    const isTail = index === connections.length - 1;
    if (isHead) {
      return convertCurrentHeadOrTailVisibleToBestdori(connection, true, false);
    }
    if (isTail) {
      return convertCurrentHeadOrTailVisibleToBestdori(connection, false, true);
    }

    return {
      beat: connection.beat,
      lane: connection.lane,
    };
  });

  return {
    type: "Slide",
    connections: mappedConnections,
  };
}

export function convertBestdoriV2ToCurrentChartJson(
  input: unknown,
  options: ChartFormatConvertOptions = {},
): ChartJson {
  const parsed = parseBestdoriV2Chart(input);
  const converted = parsed.map((item) => convertBestdoriItemToCurrent(item));
  const normalized = options.normalizeBpmAtZero === false ? converted : normalizeCurrentBpmAtZero(converted);
  return normalized as ChartJson;
}

export function convertCurrentChartJsonToBestdoriV2(
  input: unknown,
  options: ChartFormatConvertOptions = {},
): BestdoriV2Chart {
  const parsed = parseCurrentChartJson(input);

  const converted: BestdoriV2Chart = [];
  for (const item of parsed) {
    if (item.type === "BPM") {
      converted.push({
        type: "BPM",
        beat: item.beat,
        bpm: item.value,
      });
      continue;
    }
    if (item.type === "SV") {
      continue;
    }
    if (item.type === "Slide") {
      const mappedSlide = convertCurrentSlideToBestdori(item);
      if (mappedSlide) {
        converted.push(mappedSlide);
      }
      continue;
    }
    if (item.type === "Hidden") {
      continue;
    }
    converted.push(convertCurrentTopLevelToBestdori(item));
  }

  return options.normalizeBpmAtZero === false ? converted : normalizeBestdoriBpmAtZero(converted);
}

