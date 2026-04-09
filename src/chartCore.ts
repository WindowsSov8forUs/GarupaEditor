import {
  DEFAULT_SKIN_SELECTION,
  normalizeSkinSelection,
  type SkinSelection,
} from "./skinLoader";

const BASE_LANE_WIDTH = 48;
const DEFAULT_PLAYFIELD_ZOOM = 1;

function resolveLaneWidth(zoom: number = DEFAULT_PLAYFIELD_ZOOM): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_PLAYFIELD_ZOOM;
  const snapped = Math.max(2, Math.round(BASE_LANE_WIDTH * safeZoom));
  return snapped % 2 === 0 ? snapped : snapped + 1;
}

export const LANE_WIDTH = resolveLaneWidth(DEFAULT_PLAYFIELD_ZOOM);
export const BEAT_HEIGHT = 500;

export const LANE_COUNT_OPTIONS = [7, 9, 11] as const;
export const DIFFICULTY_OPTIONS = ["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"] as const;

type LaneCount = (typeof LANE_COUNT_OPTIONS)[number];
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number];
export type EditorTool = NoteType | "bpm" | "copy" | "paste";

export type NoteType =
  | "single"
  | "flick"
  | "skill"
  | "directional_flick_left"
  | "directional_flick_right"
  | "slide"
  | "hidden";

export interface ChartMetadata {
  title: string;
  artist: string;
  charter: string;
  difficulty: Difficulty;
  difficultyLevel: string;
  bpm: number;
  offsetMs: number;
  coverDataUrl: string | null;
}

export interface ChartSettings {
  laneCount: LaneCount;
  timeSignatureNumerator: number;
  timeSignatureDenominator: number;
}

export interface EditorOptionSettings {
  rhythmNoteSizePercent: number;
  longLineBrightnessPercent: number;
  simultaneousLineEnabled: boolean;
  colorAssistEnabled: boolean;
  noteSeVolumePercent: number;
  verticalScalePercent: number;
  habahiro: boolean;
  spRhythmNoteEnabled: boolean;
}

export interface ChartNote {
  id: string;
  type: NoteType;
  lane: number;
  beat: number;
  width?: number;
  endBeat?: number;
  endLane?: number;
}

export interface ChartBpmEvent {
  id: string;
  beat: number;
  bpm: number;
}

interface ChartSkinInfo {
  name: string;
  assetPath: string;
  rhythmType?: string;
  directionalType?: string;
  rhythmSeType?: string;
  directionalSeType?: string;
  rhythmRipName?: string;
  directionalRipName?: string;
  rhythmSeRipName?: string;
  directionalSeRipName?: string;
}

export type ChartJsonDirection = "Left" | "Right";
type ChartJsonSimpleType = "Single" | "Flick" | "Skill" | "Hidden";

interface ChartJsonSimpleNote {
  type: ChartJsonSimpleType;
  beat: number;
  lane: number;
  width: number;
}

interface ChartJsonDirectionalNote {
  type: "Directional";
  beat: number;
  lane: number;
  width: number;
  direction: ChartJsonDirection;
}

export type ChartJsonSlideConnection = ChartJsonSimpleNote | ChartJsonDirectionalNote;

export interface ChartJsonSlideItem {
  type: "Slide";
  connections: ChartJsonSlideConnection[];
}

export interface ChartJsonBpmItem {
  type: "BPM";
  beat: number;
  value: number;
}

export type ChartJsonTopLevelNote = Exclude<ChartJsonSimpleNote, { type: "Hidden" }> | ChartJsonDirectionalNote;
type ChartJsonItem = ChartJsonTopLevelNote | ChartJsonSlideItem | ChartJsonBpmItem;
export type ChartJson = ChartJsonItem[];

export interface WindowPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

interface NoteSpec {
  label: string;
  icon: string;
  hotkey: string;
  color: string;
  hasTail: boolean;
}

interface BpmTimelineNode {
  beat: number;
  bpm: number;
  timeSec: number;
}

export const NOTE_TYPES: NoteType[] = [
  "single",
  "flick",
  "skill",
  "slide",
  "directional_flick_right",
  "directional_flick_left",
];

export const NOTE_SPECS: Record<NoteType, NoteSpec> = {
  single: {
    label: "Single",
    icon: "S",
    hotkey: "1",
    color: "#53d8ff",
    hasTail: false,
  },
  flick: {
    label: "Flick",
    icon: "F",
    hotkey: "2",
    color: "#ffd166",
    hasTail: false,
  },
  skill: {
    label: "Skill",
    icon: "K",
    hotkey: "3",
    color: "#6fd0ff",
    hasTail: false,
  },
  slide: {
    label: "Slide",
    icon: "L",
    hotkey: "4",
    color: "#4af2a1",
    hasTail: true,
  },
  directional_flick_right: {
    label: "Right Flick",
    icon: "R",
    hotkey: "5",
    color: "#f7b267",
    hasTail: false,
  },
  directional_flick_left: {
    label: "Left Flick",
    icon: "L",
    hotkey: "6",
    color: "#f7b267",
    hasTail: false,
  },
  hidden: {
    label: "Hidden",
    icon: "H",
    hotkey: "-",
    color: "#5d6678",
    hasTail: false,
  },
};

const DIRECTIONAL_NOTE_TYPES: readonly NoteType[] = [
  "directional_flick_left",
  "directional_flick_right",
];

export const WINDOW_SIZE_PRESETS: WindowPreset[] = [
  { id: "hd", label: "1280 x 720 (HD)", width: 1280, height: 720 },
  { id: "wxga", label: "1366 x 768 (Laptop)", width: 1366, height: 768 },
  { id: "hdplus", label: "1600 x 900 (HD+)", width: 1600, height: 900 },
  { id: "fhd", label: "1920 x 1080 (Full HD)", width: 1920, height: 1080 },
];

const DIFFICULTY_STYLE_MAP: Record<Difficulty, { fill: string; stroke: string }> = {
  EASY: { fill: "rgb(51, 102, 255)", stroke: "rgb(12, 56, 253)" },
  NORMAL: { fill: "rgb(102, 255, 51)", stroke: "rgb(22, 197, 42)" },
  HARD: { fill: "rgb(255, 204, 50)", stroke: "rgb(255, 158, 41)" },
  EXPERT: { fill: "rgb(255, 50, 52)", stroke: "rgb(201, 5, 6)" },
  SPECIAL: { fill: "rgb(237, 34, 152)", stroke: "rgb(183, 4, 96)" },
};

export const DEFAULT_METADATA: ChartMetadata = {
  title: "Untitled",
  artist: "Unknown Artist",
  charter: "Your Name",
  difficulty: "EXPERT",
  difficultyLevel: "26",
  bpm: 120,
  offsetMs: 0,
  coverDataUrl: null,
};

export const DEFAULT_SETTINGS: ChartSettings = {
  laneCount: 7,
  timeSignatureNumerator: 4,
  timeSignatureDenominator: 4,
};

export const DEFAULT_EDITOR_OPTION_SETTINGS: EditorOptionSettings = {
  rhythmNoteSizePercent: 100,
  longLineBrightnessPercent: 100,
  simultaneousLineEnabled: true,
  colorAssistEnabled: true,
  noteSeVolumePercent: 100,
  verticalScalePercent: 100,
  habahiro: false,
  spRhythmNoteEnabled: true,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toFinite(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function quantizeBeat(value: number, snap: number): number {
  const scaled = Math.round(value * snap);
  return Number((scaled / snap).toFixed(6));
}

export function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

export function normalizeLaneCount(value: number): LaneCount {
  if (value <= 7) {
    return 7;
  }
  if (value <= 9) {
    return 9;
  }
  return 11;
}

function normalizeDifficulty(value: unknown): Difficulty {
  if (typeof value !== "string") {
    return DEFAULT_METADATA.difficulty;
  }
  const normalized = value.trim().toUpperCase();
  return (DIFFICULTY_OPTIONS as readonly string[]).includes(normalized)
    ? (normalized as Difficulty)
    : DEFAULT_METADATA.difficulty;
}

export function normalizeDifficultyLevel(value: unknown): string {
  const fallback = Math.max(1, Math.round(toFinite(DEFAULT_METADATA.difficultyLevel, 1)));
  const normalized = Math.round(toFinite(value, fallback));
  return String(Math.max(1, normalized));
}

export function normalizePositiveInt(value: unknown, fallback: number): number {
  const normalized = Math.round(toFinite(value, fallback));
  return Math.max(1, normalized);
}

function normalizeBpmValue(value: unknown, fallback: number): number {
  const numeric = toFinite(value, fallback);
  return Number(numeric.toFixed(6));
}

function toTimingBpm(value: number, fallback: number): number {
  const fallbackAbs = Math.max(0.001, Math.abs(toFinite(fallback, DEFAULT_METADATA.bpm)));
  const numeric = Math.abs(toFinite(value, fallbackAbs));
  if (numeric < 0.001) {
    return fallbackAbs;
  }
  return numeric;
}

export function isDirectionalNoteType(type: NoteType): boolean {
  return DIRECTIONAL_NOTE_TYPES.includes(type);
}

export function isNoteTool(tool: EditorTool): tool is NoteType {
  return tool !== "bpm" && tool !== "copy" && tool !== "paste";
}

function normalizeIncomingNoteType(raw: unknown): NoteType {
  if (typeof raw !== "string") {
    return "single";
  }

  const normalized = raw.trim().toLowerCase();
  if ((NOTE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as NoteType;
  }

  const compact = normalized.replace(/[^a-z]/g, "");

  if (compact === "single") {
    return "single";
  }
  if (compact === "flick") {
    return "flick";
  }
  if (compact === "skill") {
    return "skill";
  }
  if (compact === "slide" || compact === "slidelong" || compact === "directionalslide") {
    return "slide";
  }
  if (compact === "long") {
    return "slide";
  }
  if (compact === "rightdirectionalflick" || compact === "directionalflickright") {
    return "directional_flick_right";
  }
  if (compact === "leftdirectionalflick" || compact === "directionalflickleft") {
    return "directional_flick_left";
  }
  if (compact === "hidden") {
    return "hidden";
  }

  return "single";
}

export function normalizeDirectionalWidth(raw: unknown): number {
  return normalizePositiveInt(raw, 1);
}

export function normalizeRhythmWidth(raw: unknown): number {
  return clamp(normalizePositiveInt(raw, 1), 1, 7);
}

export function isRhythmWidthEditableType(type: NoteType): boolean {
  return type === "single" || type === "flick" || type === "skill";
}

export function sortBpmEvents(events: ChartBpmEvent[]): ChartBpmEvent[] {
  return [...events].sort((a, b) => {
    if (!approxEq(a.beat, b.beat)) {
      return a.beat - b.beat;
    }
    return a.id.localeCompare(b.id);
  });
}

export function normalizeBpmEvent(
  input: Partial<ChartBpmEvent> & { tick?: number },
  beatDivision: number,
  fallbackBpm: number,
): ChartBpmEvent | null {
  const fallbackBeat = toFinite(input.tick, 0) / beatDivision;
  const rawBeat = toFinite(input.beat, fallbackBeat);
  const beat = Math.max(0, Number(rawBeat.toFixed(6)));
  const bpm = normalizeBpmValue(input.bpm, fallbackBpm);

  return {
    id: typeof input.id === "string" && input.id.length > 0 ? input.id : createId(),
    beat,
    bpm,
  };
}

export function buildBpmTimeline(baseBpm: number, events: ChartBpmEvent[]): BpmTimelineNode[] {
  const normalizedBase = normalizeBpmValue(baseBpm, DEFAULT_METADATA.bpm);
  const sorted = sortBpmEvents(events);
  const collapsed: BpmTimelineNode[] = [];

  for (const event of sorted) {
    if (collapsed.length > 0 && approxEq(collapsed[collapsed.length - 1].beat, event.beat)) {
      collapsed[collapsed.length - 1] = {
        beat: event.beat,
        bpm: normalizeBpmValue(event.bpm, normalizedBase),
        timeSec: 0,
      };
      continue;
    }
    collapsed.push({
      beat: event.beat,
      bpm: normalizeBpmValue(event.bpm, normalizedBase),
      timeSec: 0,
    });
  }

  if (collapsed.length === 0 || !approxEq(collapsed[0].beat, 0)) {
    collapsed.unshift({ beat: 0, bpm: normalizedBase, timeSec: 0 });
  } else {
    collapsed[0].bpm = normalizeBpmValue(collapsed[0].bpm, normalizedBase);
  }

  for (let index = 1; index < collapsed.length; index += 1) {
    const previous = collapsed[index - 1];
    const current = collapsed[index];
    const deltaBeat = Math.max(0, current.beat - previous.beat);
    const deltaSec = (deltaBeat * 60) / toTimingBpm(previous.bpm, normalizedBase);
    current.timeSec = previous.timeSec + deltaSec;
  }

  return collapsed;
}

export function beatToSeconds(beat: number, timeline: BpmTimelineNode[]): number {
  const normalizedBeat = Math.max(0, beat);
  let segment = timeline[0];
  for (let index = 1; index < timeline.length; index += 1) {
    if (timeline[index].beat > normalizedBeat) {
      break;
    }
    segment = timeline[index];
  }
  return segment.timeSec + ((normalizedBeat - segment.beat) * 60) / toTimingBpm(segment.bpm, DEFAULT_METADATA.bpm);
}

export function secondsToBeat(seconds: number, timeline: BpmTimelineNode[]): number {
  const normalizedSec = Math.max(0, seconds);
  let segment = timeline[0];
  let next: BpmTimelineNode | null = null;

  for (let index = 1; index < timeline.length; index += 1) {
    if (timeline[index].timeSec > normalizedSec) {
      next = timeline[index];
      break;
    }
    segment = timeline[index];
  }

  const bpmForTiming = toTimingBpm(segment.bpm, DEFAULT_METADATA.bpm);
  if (!next) {
    return segment.beat + (normalizedSec - segment.timeSec) * (bpmForTiming / 60);
  }

  return segment.beat + (normalizedSec - segment.timeSec) * (bpmForTiming / 60);
}

export function parseSkinSelectionFromDocument(
  skin: Partial<ChartSkinInfo> | undefined,
): SkinSelection | null {
  if (!skin) {
    return null;
  }

  const hasRhythmType = typeof skin.rhythmType === "string";
  const hasDirectionalType = typeof skin.directionalType === "string";
  const hasRhythmSeType = typeof skin.rhythmSeType === "string";
  const hasDirectionalSeType = typeof skin.directionalSeType === "string";
  const hasRhythmRipName = typeof skin.rhythmRipName === "string" && skin.rhythmRipName.trim().length > 0;
  const hasDirectionalRipName =
    typeof skin.directionalRipName === "string" && skin.directionalRipName.trim().length > 0;
  const hasRhythmSeRipName = typeof skin.rhythmSeRipName === "string" && skin.rhythmSeRipName.trim().length > 0;
  const hasDirectionalSeRipName =
    typeof skin.directionalSeRipName === "string" && skin.directionalSeRipName.trim().length > 0;

  let rhythmType: string | undefined = hasRhythmType ? skin.rhythmType : undefined;
  let directionalType: string | undefined = hasDirectionalType ? skin.directionalType : undefined;
  let rhythmSeType: string | undefined = hasRhythmSeType ? skin.rhythmSeType : undefined;
  let directionalSeType: string | undefined = hasDirectionalSeType ? skin.directionalSeType : undefined;
  if (typeof skin.name === "string") {
    const rhythmMatch = /rhythm-type(\d+)/i.exec(skin.name);
    const directionalMatch = /directional-type(\d+)/i.exec(skin.name);
    if (rhythmType === undefined && rhythmMatch) {
      rhythmType = rhythmMatch[1];
    }
    if (directionalType === undefined && directionalMatch) {
      directionalType = directionalMatch[1];
    }
    if (rhythmSeType === undefined && rhythmMatch) {
      rhythmSeType = rhythmMatch[1];
    }
    if (directionalSeType === undefined && directionalMatch) {
      directionalSeType = directionalMatch[1];
    }
  }

  if (
    rhythmType === undefined &&
    directionalType === undefined &&
    rhythmSeType === undefined &&
    directionalSeType === undefined &&
    !hasRhythmRipName &&
    !hasDirectionalRipName &&
    !hasRhythmSeRipName &&
    !hasDirectionalSeRipName
  ) {
    return null;
  }

  return normalizeSkinSelection({
    rhythmType: rhythmType ?? DEFAULT_SKIN_SELECTION.rhythmType,
    directionalType: directionalType ?? DEFAULT_SKIN_SELECTION.directionalType,
    rhythmSeType: rhythmSeType ?? DEFAULT_SKIN_SELECTION.rhythmSeType,
    directionalSeType: directionalSeType ?? DEFAULT_SKIN_SELECTION.directionalSeType,
    rhythmRipName: skin.rhythmRipName,
    directionalRipName: skin.directionalRipName,
    rhythmSeRipName: skin.rhythmSeRipName,
    directionalSeRipName: skin.directionalSeRipName,
  });
}

export function getDifficultyStyle(value: unknown): { fill: string; stroke: string } {
  const normalized = normalizeDifficulty(value);
  return DIFFICULTY_STYLE_MAP[normalized];
}

export function getLaneValues(laneCount: LaneCount): number[] {
  const offset = (laneCount - 7) / 2;
  const start = -offset;
  return Array.from({ length: laneCount }, (_, index) => start + index);
}

export function formatBeat(value: number): string {
  const text = value.toFixed(3);
  return text.replace(/\.?0+$/, "");
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) {
    return "0:00";
  }
  const total = Math.round(sec);
  const minute = Math.floor(total / 60).toString();
  const second = (total % 60).toString().padStart(2, "0");
  return `${minute}:${second}`;
}

export function sanitizeFileName(input: string): string {
  const safe = input.trim().replace(/[\\/:*?"<>|]/g, "_");
  return safe.length > 0 ? safe : "chart";
}

export function sortNotes(notes: ChartNote[]): ChartNote[] {
  return [...notes].sort((a, b) => {
    if (!approxEq(a.beat, b.beat)) {
      return a.beat - b.beat;
    }
    if (a.lane !== b.lane) {
      return a.lane - b.lane;
    }
    return a.id.localeCompare(b.id);
  });
}

export function normalizeMetadata(input: Partial<ChartMetadata>): ChartMetadata {
  return {
    title:
      typeof input.title === "string" && input.title.trim() !== ""
        ? input.title
        : DEFAULT_METADATA.title,
    artist:
      typeof input.artist === "string" && input.artist.trim() !== ""
        ? input.artist
        : DEFAULT_METADATA.artist,
    charter:
      typeof input.charter === "string" && input.charter.trim() !== ""
        ? input.charter
        : DEFAULT_METADATA.charter,
    difficulty: normalizeDifficulty(input.difficulty),
    difficultyLevel: normalizeDifficultyLevel(input.difficultyLevel),
    bpm: clamp(toFinite(input.bpm, DEFAULT_METADATA.bpm), 40, 300),
    offsetMs: Math.round(clamp(toFinite(input.offsetMs, DEFAULT_METADATA.offsetMs), -5000, 5000)),
    coverDataUrl:
      typeof input.coverDataUrl === "string" && input.coverDataUrl.trim() !== ""
        ? input.coverDataUrl
        : null,
  };
}

export function normalizeSettings(
  input: Partial<ChartSettings> & {
    lanes?: number;
    subdivision?: number;
    beatsPerMeasure?: number;
    beatSnap?: number;
  },
): ChartSettings {
  const laneCount = normalizeLaneCount(
    Math.round(toFinite(input.laneCount ?? input.lanes, DEFAULT_SETTINGS.laneCount)),
  );

  const numerator = normalizePositiveInt(
    input.timeSignatureNumerator ?? input.beatsPerMeasure,
    DEFAULT_SETTINGS.timeSignatureNumerator,
  );

  const denominator = normalizePositiveInt(
    input.timeSignatureDenominator ?? input.subdivision ?? input.beatSnap,
    DEFAULT_SETTINGS.timeSignatureDenominator,
  );

  return {
    laneCount,
    timeSignatureNumerator: numerator,
    timeSignatureDenominator: denominator,
  };
}

export function normalizeEditorOptionSettings(
  input: Partial<EditorOptionSettings>,
): EditorOptionSettings {
  const rhythmNoteSizePercent = Math.round(
    clamp(toFinite(input.rhythmNoteSizePercent, DEFAULT_EDITOR_OPTION_SETTINGS.rhythmNoteSizePercent), 10, 200),
  );
  const longLineBrightnessPercent = Math.round(
    clamp(
      toFinite(input.longLineBrightnessPercent, DEFAULT_EDITOR_OPTION_SETTINGS.longLineBrightnessPercent),
      10,
      100,
    ),
  );
  const noteSeVolumePercent = Math.round(
    clamp(toFinite(input.noteSeVolumePercent, DEFAULT_EDITOR_OPTION_SETTINGS.noteSeVolumePercent), 0, 100),
  );
  const verticalScalePercent = Math.round(
    clamp(toFinite(input.verticalScalePercent, DEFAULT_EDITOR_OPTION_SETTINGS.verticalScalePercent), 50, 200),
  );

  return {
    rhythmNoteSizePercent,
    longLineBrightnessPercent,
    simultaneousLineEnabled:
      typeof input.simultaneousLineEnabled === "boolean"
        ? input.simultaneousLineEnabled
        : DEFAULT_EDITOR_OPTION_SETTINGS.simultaneousLineEnabled,
    colorAssistEnabled:
      typeof input.colorAssistEnabled === "boolean"
        ? input.colorAssistEnabled
        : DEFAULT_EDITOR_OPTION_SETTINGS.colorAssistEnabled,
    noteSeVolumePercent,
    verticalScalePercent,
    habahiro:
      typeof input.habahiro === "boolean"
        ? input.habahiro
        : DEFAULT_EDITOR_OPTION_SETTINGS.habahiro,
    spRhythmNoteEnabled:
      typeof input.spRhythmNoteEnabled === "boolean"
        ? input.spRhythmNoteEnabled
        : DEFAULT_EDITOR_OPTION_SETTINGS.spRhythmNoteEnabled,
  };
}

export function normalizeNote(
  input: Partial<ChartNote> & { tick?: number; endTick?: number },
  settings: ChartSettings,
): ChartNote | null {
  const type = normalizeIncomingNoteType(input.type);
  const lane = Number(toFinite(input.lane, 0).toFixed(6));

  const beatDivision = normalizePositiveInt(settings.timeSignatureDenominator, 1);
  const fallbackBeat = toFinite(input.tick, 0) / beatDivision;
  const beatCandidate = toFinite(input.beat, fallbackBeat);
  const beat = Math.max(0, Number(beatCandidate.toFixed(6)));

  const normalized: ChartNote = {
    id: typeof input.id === "string" && input.id.length > 0 ? input.id : createId(),
    type,
    lane,
    beat,
  };

  if (isDirectionalNoteType(type)) {
    normalized.width = normalizeDirectionalWidth(input.width);
  } else {
    normalized.width = normalizeRhythmWidth(input.width);
  }

  if (NOTE_SPECS[type].hasTail) {
    const beatStep = 1 / beatDivision;
    const fallbackEndBeat = toFinite(input.endTick, (beat + 1) * beatDivision) / beatDivision;
    const rawEndBeat = toFinite(input.endBeat, fallbackEndBeat);
    const endBeat = Math.max(beat + beatStep, Number(rawEndBeat.toFixed(6)));

    const endLane = Number(toFinite(input.endLane, lane).toFixed(6));

    normalized.endBeat = endBeat;
    normalized.endLane = endLane;
  }

  return normalized;
}



