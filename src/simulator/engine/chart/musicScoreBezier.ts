import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../evidence";
import { ChartConstructionEvidence } from "./evidence";

const MUSIC_BAR_DIVISION_COUNT = 192;
const BEZIER_SAMPLE_COUNT = 200;
const BEZIER_POSITION_QUANTUM = MUSIC_BAR_DIVISION_COUNT >> 6;
const BEZIER_LANE_KEY_CODES = [36, 31, 32, 33, 34, 35, 38] as const;
const BEZIER_CONTROL_WAV_NAMES = new Set([
  "cont_bezier_back_a",
  "cont_bezier_back_b",
  "cont_bezier_front_a",
  "cont_bezier_front_b",
  "cont_force_back_a",
  "cont_force_back_b",
  "cont_force_front_a",
  "cont_force_front_b",
]);
const BEZIER_FORCE_FRONT_WAV_NAMES = new Set([
  "cont_force_front_a",
  "cont_force_front_b",
]);
const BEZIER_FORCE_BACK_WAV_NAMES = new Set([
  "cont_force_back_a",
  "cont_force_back_b",
]);
const BEZIER_SLIDE_A_WAV_NAMES = new Set([
  "slide_a",
  "slide_end_a",
  "slide_end_dir_flick_l_a",
  "slide_end_dir_flick_r_a",
  "slide_end_flick_a",
]);
const BEZIER_SLIDE_B_WAV_NAMES = new Set([
  "slide_b",
  "slide_end_b",
  "slide_end_dir_flick_l_b",
  "slide_end_dir_flick_r_b",
  "slide_end_flick_b",
]);
const BEZIER_WAV_DECORATIONS = [
  ".wav",
  "fever_note_",
  "_fever_note",
  "lane_change_",
  "_lane_change",
  "_skill",
  "_fever",
  "skill_",
  "fever_",
] as const;
const BEZIER_CONTROL_A_WAV_NAMES = new Set(
  [...BEZIER_CONTROL_WAV_NAMES].filter((name) => name.endsWith("_a")),
);
const BEZIER_CONTROL_B_WAV_NAMES = new Set(
  [...BEZIER_CONTROL_WAV_NAMES].filter((name) => name.endsWith("_b")),
);
const BEZIER_GENERATED_WAV_RANGES = [
  ["0S", "slide_a", "LS"],
  ["27", "slide_a", "RS"],
  ["3M", "slide_b", "LS"],
  ["51", "slide_b", "RS"],
] as const;
const MUSIC_SCORE_LANE_NUMBER_BY_KEY_CODE = new Map<number, number>([
  [11, 1], [12, 2], [13, 3], [14, 4], [15, 5], [16, 0], [17, -1], [18, 6],
  [31, 1], [32, 2], [33, 3], [34, 4], [35, 5], [36, 0], [37, -1], [38, 6],
  [51, 1], [52, 2], [53, 3], [54, 4], [55, 5], [56, 0], [57, -1], [58, 6],
]);

interface BezierMusicScoreNote {
  readonly noteId: string;
  readonly wavName: string;
  readonly absolutePos: number;
  readonly barNumber: number;
  readonly laneIdStr: string;
  readonly laneId: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly multiRangeWidth: number;
}

interface BezierSourceNote {
  readonly absolutePos: number;
  readonly laneAbsolutePos: number;
  readonly multiRangeWidth: number;
}

interface BezierChartNote extends BezierSourceNote {
  readonly noteId: string;
  readonly wavName: string;
}

interface BezierExpandedNote {
  readonly absolutePos: number;
  readonly barNumber: number;
  readonly laneId: string;
  readonly lineInfo: string;
  readonly noteWavName: string;
  readonly isSlideGroupA: boolean;
  readonly laneAbsolutePos: number;
  readonly multiRangeWidth: number;
  readonly diffVolume: number;
  readonly isRightControl: boolean;
}

type SerializedEntry = readonly [number, number, string];

export function splitMusicScoreLines(musicScoreData: string): readonly string[] {
  const withoutBom = musicScoreData.startsWith("\uFEFF")
    ? musicScoreData.slice(1)
    : musicScoreData;
  const lines = withoutBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export class MusicScoreHeaderParser {
  private readonly wavFileNamesValue = new Map<string, string>();
  private readonly additiveWavFileNamesValue = new Map<string, string>();
  private isMultiRangeValue = false;

  get wavFileNames(): ReadonlyMap<string, string> {
    return this.wavFileNamesValue;
  }

  get additiveWavFileNames(): ReadonlyMap<string, string> {
    return this.additiveWavFileNamesValue;
  }

  get isMultiRange(): boolean {
    return this.isMultiRangeValue;
  }

  getFileName(key: string): string {
    return this.wavFileNamesValue.get(key)
      ?? this.additiveWavFileNamesValue.get(key)
      ?? "";
  }

  addWav(key: number, wavName: string): void {
    const wavKey = convertIntToBase36Pair(key);
    if (this.additiveWavFileNamesValue.has(wavKey)) {
      throw new Error(`duplicate additive WAV key ${wavKey}`);
    }
    this.additiveWavFileNamesValue.set(wavKey, wavName);
  }

  parse(musicScoreData: string): SimulatorResult<readonly string[]> {
    this.wavFileNamesValue.clear();
    this.additiveWavFileNamesValue.clear();
    this.isMultiRangeValue = false;
    const lines = splitMusicScoreLines(musicScoreData);
    const result: string[] = [];
    try {
      for (const line of lines) {
        if (
          line.length >= 2
          && line.startsWith("#")
          && tryParseInt32(line.slice(1)) !== null
        ) {
          continue;
        }
        if (line.length >= 8) {
          if (line.includes("#HABAHIRO")) {
            this.isMultiRangeValue = true;
          }
          if (line.startsWith("#WAV")) {
            const key = line.slice(4, 6);
            const wavName = line.slice(7).trim();
            if (this.wavFileNamesValue.has(key)) {
              throw new Error(`duplicate primary WAV key ${key}`);
            }
            this.wavFileNamesValue.set(key, wavName);
          }
        }
        result.push(line);
      }
      return ok(result);
    } catch (error) {
      return headerFailure("chart-construction.invalid-header", error);
    }
  }

  hasControlKey(): boolean {
    for (const wavName of this.wavFileNamesValue.values()) {
      for (const controlName of BEZIER_CONTROL_WAV_NAMES) {
        if (wavName.includes(controlName)) {
          return true;
        }
      }
    }
    return false;
  }

  reParse(lines: readonly string[]): SimulatorResult<readonly string[]> {
    this.wavFileNamesValue.clear();
    const result: string[] = [];
    let insideWavBlock = false;
    try {
      for (const line of lines) {
        if (
          line.length >= 2
          && line.startsWith("#")
          && tryParseInt32(line.slice(1)) !== null
        ) {
          continue;
        }
        if (line.length >= 8 && line.startsWith("#WAV")) {
          const key = line.slice(4, 6);
          const wavName = line.slice(7).trim();
          if (this.wavFileNamesValue.has(key)) {
            throw new Error(`duplicate primary WAV key ${key}`);
          }
          this.wavFileNamesValue.set(key, wavName);
          insideWavBlock = true;
        } else if (insideWavBlock) {
          for (const [key, wavName] of this.additiveWavFileNamesValue) {
            result.push(`#WAV${key} ${wavName}`);
          }
          insideWavBlock = false;
        }
        if ([...BEZIER_CONTROL_WAV_NAMES].some((name) => line.includes(name))) {
          continue;
        }
        result.push(line);
      }
      return ok(result);
    } catch (error) {
      return headerFailure("chart-construction.invalid-header-reparse", error);
    }
  }
}

export class MusicScoreBezierConverter {
  constructor(readonly headerParser: MusicScoreHeaderParser) {}

  convert(musicScoreData: string): SimulatorResult<string | null> {
    const parseResult = this.headerParser.parse(musicScoreData);
    if (parseResult.status !== "ok") {
      return parseResult;
    }
    if (!this.headerParser.hasControlKey()) {
      return ok(null);
    }
    try {
      registerGeneratedBezierWavs(this.headerParser);
      const notes = parseBezierMusicScoreNotes(
        parseResult.value,
        this.headerParser,
      );
      const [defaultNotes, groupA, groupB] = partitionBezierMusicScoreNotes(
        notes,
        this.headerParser,
      );
      const generatedA = convertBezierChartNotes(
        groupA.map(toChartNote),
        this.headerParser.isMultiRange,
      );
      const generatedB = convertBezierChartNotes(
        groupB.map(toChartNote),
        this.headerParser.isMultiRange,
      );
      const convertedLines = [
        ...serializeBezierMusicScoreGroup(defaultNotes, [], this.headerParser),
        ...serializeBezierMusicScoreGroup(groupA, generatedA, this.headerParser),
        ...serializeBezierMusicScoreGroup(groupB, generatedB, this.headerParser),
      ];
      const reparseResult = this.headerParser.reParse(parseResult.value);
      if (reparseResult.status !== "ok") {
        return reparseResult;
      }
      return ok([...reparseResult.value, ...convertedLines].join("\n") + "\n");
    } catch (error) {
      return integrityFailure(
        "chart-construction.invalid-bezier-score",
        [
          ChartConstructionEvidence.E05,
          ChartConstructionEvidence.E06,
          ChartConstructionEvidence.E07,
          ChartConstructionEvidence.E08,
        ],
        errorMessage(error),
      );
    }
  }
}

function headerFailure(
  capability: string,
  error: unknown,
): ReturnType<typeof integrityFailure> {
  return integrityFailure(
    capability,
    [
      ChartConstructionEvidence.E05,
      ChartConstructionEvidence.E06,
      ChartConstructionEvidence.E08,
    ],
    errorMessage(error),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tryParseInt32(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < -0x80000000 || parsed > 0x7fffffff) {
    return null;
  }
  return parsed;
}

function convertBase36ToInt(value: string): number {
  if (!/^[0-9A-Z]+$/i.test(value)) {
    throw new Error(`invalid base-36 value ${value}`);
  }
  return Number.parseInt(value, 36);
}

function convertIntToBase36Pair(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 36 * 36) {
    throw new Error("native WAV keys require a two-digit base-36 value");
  }
  const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return `${digits[Math.floor(value / 36)]}${digits[value % 36]}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let currentLeft = Math.abs(left);
  let currentRight = Math.abs(right);
  while (currentRight !== 0) {
    const remainder = currentLeft % currentRight;
    currentLeft = currentRight;
    currentRight = remainder;
  }
  return currentLeft;
}

function quadraticBezier(
  start: number,
  control: number,
  end: number,
  t: number,
): number {
  const first = start + t * (control - start);
  const second = control + t * (end - control);
  return first + t * (second - first);
}

function quantizeBezierPosition(position: number): number {
  const quotient = Math.trunc(position / BEZIER_POSITION_QUANTUM);
  let base = quotient * BEZIER_POSITION_QUANTUM;
  const integerRemainder = Math.trunc(position - base);
  if (integerRemainder >= BEZIER_POSITION_QUANTUM * 0.5) {
    base += BEZIER_POSITION_QUANTUM;
  }
  return base;
}

function roundMidpointToEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) {
    return lower;
  }
  if (fraction > 0.5) {
    return lower + 1;
  }
  return lower % 2 === 0 ? lower : lower + 1;
}

function bezierNoteWavName(
  isSlideGroupA: boolean,
  diffVolume: number,
): string {
  const group = isSlideGroupA ? "slide_a" : "slide_b";
  if (diffVolume === 0) {
    return `${group}.wav`;
  }
  const side = diffVolume > 0 ? "RS" : "LS";
  return `${group}_${side}${String(Math.abs(diffVolume)).padStart(2, "0")}.wav`;
}

function buildBezierExpandedNote(
  absolutePos: number,
  laneAbsolutePos: number,
  isSlideGroupA: boolean,
  multiRangeWidth: number,
  isRightControl: boolean,
): BezierExpandedNote {
  const roundedLane = roundMidpointToEven(laneAbsolutePos);
  if (roundedLane < 0 || roundedLane >= BEZIER_LANE_KEY_CODES.length) {
    throw new Error(`Bezier lane ${roundedLane} is outside the native 0..6 key table`);
  }
  const diffVolume = Math.trunc((laneAbsolutePos - roundedLane) * 100);
  const laneId = String(BEZIER_LANE_KEY_CODES[roundedLane]);
  const barNumber = Math.floor(absolutePos / MUSIC_BAR_DIVISION_COUNT);
  return {
    absolutePos,
    barNumber,
    laneId,
    lineInfo: `#${String(barNumber).padStart(3, "0")}${laneId}:`,
    noteWavName: bezierNoteWavName(isSlideGroupA, diffVolume),
    isSlideGroupA,
    laneAbsolutePos,
    multiRangeWidth,
    diffVolume,
    isRightControl,
  };
}

function normalizeBezierWavName(wavName: string): string {
  let result = wavName;
  for (const decoration of BEZIER_WAV_DECORATIONS) {
    result = result.split(decoration).join("");
  }
  return result;
}

function bezierSlideGroup(wavName: string): boolean | null {
  const normalized = normalizeBezierWavName(wavName);
  if (BEZIER_SLIDE_A_WAV_NAMES.has(normalized)) {
    return true;
  }
  if (BEZIER_SLIDE_B_WAV_NAMES.has(normalized)) {
    return false;
  }
  return null;
}

function expandBezierSegment(
  start: BezierSourceNote,
  control: BezierSourceNote,
  end: BezierSourceNote,
  isSlideGroupA: boolean,
  isMultiRange: boolean,
): readonly BezierExpandedNote[] {
  if (Math.min(start.absolutePos, control.absolutePos, end.absolutePos) < 0) {
    throw new Error("Bezier positions must be non-negative");
  }
  if (start.multiRangeWidth < 1 || end.multiRangeWidth < 1) {
    throw new Error("Bezier multi-range widths must be positive");
  }
  let startLane = start.laneAbsolutePos;
  const controlLane = control.laneAbsolutePos;
  let endLane = end.laneAbsolutePos;
  const isRightControl = startLane < controlLane && endLane < controlLane;
  if (isMultiRange && isRightControl) {
    startLane += start.multiRangeWidth - 1;
    endLane += end.multiRangeWidth - 1;
  }
  const expanded: BezierExpandedNote[] = [];
  for (let sampleIndex = 1; sampleIndex < BEZIER_SAMPLE_COUNT; sampleIndex += 1) {
    const t = Math.min(Math.max(sampleIndex / BEZIER_SAMPLE_COUNT, 0), 1);
    const absolutePos = quantizeBezierPosition(
      quadraticBezier(start.absolutePos, control.absolutePos, end.absolutePos, t),
    );
    if (absolutePos === start.absolutePos || absolutePos === end.absolutePos) {
      continue;
    }
    const laneAbsolutePos = quadraticBezier(
      startLane,
      controlLane,
      endLane,
      t,
    );
    expanded.push(buildBezierExpandedNote(
      absolutePos,
      laneAbsolutePos,
      isSlideGroupA,
      start.multiRangeWidth,
      isRightControl,
    ));
  }
  return expanded;
}

function collapseBezierSamples(
  notes: readonly BezierExpandedNote[],
): readonly BezierExpandedNote[] {
  const groups = new Map<string, BezierExpandedNote[]>();
  for (const note of notes) {
    const key = `${note.absolutePos}:${note.isSlideGroupA}`;
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    if (first === undefined) {
      throw new Error("Bezier collapse received an empty group");
    }
    const averageLane = compensatedSum(
      group.map((note) => note.laneAbsolutePos),
    ) / group.length;
    return buildBezierExpandedNote(
      first.absolutePos,
      averageLane,
      first.isSlideGroupA,
      first.multiRangeWidth,
      first.isRightControl,
    );
  });
}

function compensatedSum(values: readonly number[]): number {
  let high = 0;
  let low = 0;
  for (const value of values) {
    const next = high + value;
    low += Math.abs(high) >= Math.abs(value)
      ? high - next + value
      : value - next + high;
    high = next;
  }
  return high + low;
}

function reduceBezierSamples(
  notes: readonly BezierExpandedNote[],
): readonly BezierExpandedNote[] {
  const reductionIndices = new Set<number>();
  let consecutiveReductions = 0;
  if (notes.length >= 4) {
    let currentIndex = 1;
    while (currentIndex < notes.length - 2) {
      const previousIndex = currentIndex - consecutiveReductions - 1;
      const previous = notes[previousIndex];
      const current = notes[currentIndex];
      const following = notes[currentIndex + 1];
      if (previous === undefined || current === undefined || following === undefined) {
        throw new Error("Bezier reduction index escaped the recovered sequence");
      }
      let shouldReduce = previous.diffVolume === current.diffVolume
        && current.diffVolume === following.diffVolume;
      if (!shouldReduce) {
        const previousAngle = Math.atan2(
          current.absolutePos - previous.absolutePos,
          current.diffVolume - previous.diffVolume,
        );
        const followingAngle = Math.atan2(
          following.absolutePos - current.absolutePos,
          following.diffVolume - current.diffVolume,
        );
        shouldReduce = Math.abs(
          followingAngle * 57.296 - previousAngle * 57.296,
        ) < 2;
      }
      if (shouldReduce) {
        reductionIndices.add(currentIndex);
        consecutiveReductions += 1;
      } else {
        consecutiveReductions = 0;
      }
      currentIndex += 1;
    }
  }
  return notes
    .filter((_note, index) => !reductionIndices.has(index))
    .sort((left, right) => left.diffVolume - right.diffVolume);
}

function postprocessBezierSamples(
  notes: readonly BezierExpandedNote[],
  isMultiRange: boolean,
): readonly BezierExpandedNote[] {
  const reduced = reduceBezierSamples(collapseBezierSamples(notes));
  if (!isMultiRange) {
    return reduced;
  }
  const expanded: BezierExpandedNote[] = [];
  const seen = new Set<string>();
  for (const note of reduced) {
    const candidates = [note];
    for (let widthIndex = 2; widthIndex <= note.multiRangeWidth; widthIndex += 1) {
      let offset = widthIndex - 1;
      if (note.isRightControl) {
        offset = -offset;
      }
      candidates.push(buildBezierExpandedNote(
        note.absolutePos,
        note.laneAbsolutePos + offset,
        note.isSlideGroupA,
        note.multiRangeWidth,
        note.isRightControl,
      ));
    }
    for (const candidate of candidates) {
      const key = `${candidate.lineInfo}:${candidate.absolutePos}:${candidate.barNumber}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      expanded.push(candidate);
    }
  }
  return expanded;
}

function sortForceControlNotes(
  notes: readonly BezierChartNote[],
): readonly BezierChartNote[] {
  const result = [...notes];
  const forceControls = result.filter((note) =>
    BEZIER_FORCE_FRONT_WAV_NAMES.has(note.wavName)
    || BEZIER_FORCE_BACK_WAV_NAMES.has(note.wavName));
  for (const forceControl of forceControls) {
    const forceIndex = result.findIndex((note) => note === forceControl);
    if (BEZIER_FORCE_FRONT_WAV_NAMES.has(forceControl.wavName)) {
      let targetIndex = result.findIndex((note) =>
        note.absolutePos < forceControl.absolutePos
        && bezierSlideGroup(note.wavName) !== null);
      if (targetIndex < 0) {
        throw new Error(`${forceControl.noteId}: force-front control has no earlier Slide`);
      }
      result.splice(forceIndex, 1);
      if (forceIndex < targetIndex) {
        targetIndex -= 1;
      }
      result.splice(targetIndex, 0, forceControl);
    } else {
      let targetIndex = -1;
      for (let index = result.length - 1; index >= 0; index -= 1) {
        const note = result[index];
        if (
          note !== undefined
          && note.absolutePos > forceControl.absolutePos
          && bezierSlideGroup(note.wavName) !== null
        ) {
          targetIndex = index;
          break;
        }
      }
      if (targetIndex < 0) {
        throw new Error(`${forceControl.noteId}: force-back control has no later Slide`);
      }
      result.splice(forceIndex, 1);
      if (forceIndex < targetIndex) {
        targetIndex -= 1;
      }
      result.splice(targetIndex + 1, 0, forceControl);
    }
  }
  return result;
}

function convertBezierChartNotes(
  notes: readonly BezierChartNote[],
  isMultiRange: boolean,
): readonly BezierExpandedNote[] {
  const ordered = sortForceControlNotes(notes);
  const raw: BezierExpandedNote[] = [];
  for (let startIndex = 0; startIndex < Math.max(ordered.length - 2, 0); startIndex += 1) {
    const start = ordered[startIndex];
    const control = ordered[startIndex + 1];
    const end = ordered[startIndex + 2];
    if (start === undefined || control === undefined || end === undefined) {
      continue;
    }
    const startGroup = bezierSlideGroup(start.wavName);
    if (
      startGroup === null
      || !BEZIER_CONTROL_WAV_NAMES.has(control.wavName)
      || bezierSlideGroup(end.wavName) !== startGroup
    ) {
      continue;
    }
    raw.push(...expandBezierSegment(
      start,
      control,
      end,
      startGroup,
      isMultiRange,
    ));
  }
  return postprocessBezierSamples(raw, isMultiRange);
}

function parseBezierMusicScoreNotes(
  lines: readonly string[],
  header: MusicScoreHeaderParser,
): readonly BezierMusicScoreNote[] {
  const notes: BezierMusicScoreNote[] = [];
  for (const line of lines) {
    if (
      line.length < 6
      || !line.startsWith("#")
      || tryParseInt32(line.slice(1, 6)) === null
      || line.length < 7
    ) {
      continue;
    }
    const lineInfo = line.slice(0, 7);
    const barNumber = tryParseInt32(lineInfo.slice(1, 4));
    if (barNumber === null || barNumber < 0) {
      throw new Error(`invalid music-score bar number in ${lineInfo}`);
    }
    const laneIdStr = lineInfo.slice(4, 6);
    const laneKeyCode = tryParseInt32(laneIdStr);
    if (laneKeyCode === null) {
      throw new Error(`invalid music-score lane id ${laneIdStr}`);
    }
    const laneId = MUSIC_SCORE_LANE_NUMBER_BY_KEY_CODE.get(laneKeyCode) ?? -1;
    const noteData = line.slice(7);
    const denominator = Math.floor(noteData.length / 2);
    if (denominator === 0) {
      continue;
    }
    for (let numerator = 0; numerator < denominator; numerator += 1) {
      const noteId = noteData.slice(numerator * 2, numerator * 2 + 2);
      if (noteId === "00") {
        continue;
      }
      const absolutePos = Math.floor(
        MUSIC_BAR_DIVISION_COUNT * numerator / denominator,
      ) + MUSIC_BAR_DIVISION_COUNT * barNumber;
      const relativePosition = absolutePos - MUSIC_BAR_DIVISION_COUNT * barNumber;
      const divisor = greatestCommonDivisor(relativePosition, MUSIC_BAR_DIVISION_COUNT);
      notes.push({
        noteId,
        wavName: normalizeBezierWavName(header.getFileName(noteId)),
        absolutePos,
        barNumber,
        laneIdStr,
        laneId,
        numerator: relativePosition / divisor,
        denominator: MUSIC_BAR_DIVISION_COUNT / divisor,
        multiRangeWidth: 1,
      });
    }
  }
  return notes;
}

function registerGeneratedBezierWavs(header: MusicScoreHeaderParser): void {
  if ([...header.wavFileNames.values()].includes("slide_a_LS01.wav")) {
    return;
  }
  for (let index = 1; index <= 50; index += 1) {
    for (const [startKey, groupName, side] of BEZIER_GENERATED_WAV_RANGES) {
      header.addWav(
        convertBase36ToInt(startKey) + index - 1,
        `${groupName}_${side}${String(index).padStart(2, "0")}.wav`,
      );
    }
  }
}

function firstControlKey(
  header: MusicScoreHeaderParser,
  controlName: string,
): number {
  for (const [key, wavName] of header.wavFileNames) {
    if (wavName.includes(controlName)) {
      return convertBase36ToInt(key);
    }
  }
  return 0;
}

function compareMusicScoreNotes(
  left: BezierMusicScoreNote,
  right: BezierMusicScoreNote,
  frontControlKey: number,
  backControlKey: number,
): number {
  const positionDifference = left.absolutePos - right.absolutePos;
  if (positionDifference !== 0) {
    return positionDifference;
  }
  const leftKey = convertBase36ToInt(left.noteId);
  const rightKey = convertBase36ToInt(right.noteId);
  if (leftKey === backControlKey) {
    return 1;
  }
  if (rightKey === backControlKey) {
    return -1;
  }
  if (leftKey !== frontControlKey) {
    return rightKey === frontControlKey ? 1 : 0;
  }
  return -1;
}

function sortForceMusicScoreNotes(
  notes: readonly BezierMusicScoreNote[],
): readonly BezierMusicScoreNote[] {
  const result = [...notes];
  const forceControls = result.filter((note) =>
    BEZIER_FORCE_FRONT_WAV_NAMES.has(note.wavName)
    || BEZIER_FORCE_BACK_WAV_NAMES.has(note.wavName));
  for (const forceControl of forceControls) {
    const forceIndex = result.findIndex((note) => note === forceControl);
    if (BEZIER_FORCE_FRONT_WAV_NAMES.has(forceControl.wavName)) {
      let targetIndex = result.findIndex((note) =>
        note.absolutePos < forceControl.absolutePos
        && bezierSlideGroup(note.wavName) !== null);
      if (targetIndex < 0) {
        throw new Error(`${forceControl.noteId}: force-front control has no earlier Slide`);
      }
      result.splice(forceIndex, 1);
      if (forceIndex < targetIndex) {
        targetIndex -= 1;
      }
      result.splice(targetIndex, 0, forceControl);
    } else {
      let targetIndex = -1;
      for (let index = result.length - 1; index >= 0; index -= 1) {
        const note = result[index];
        if (
          note !== undefined
          && note.absolutePos > forceControl.absolutePos
          && bezierSlideGroup(note.wavName) !== null
        ) {
          targetIndex = index;
          break;
        }
      }
      if (targetIndex < 0) {
        throw new Error(`${forceControl.noteId}: force-back control has no later Slide`);
      }
      result.splice(forceIndex, 1);
      if (forceIndex < targetIndex) {
        targetIndex -= 1;
      }
      result.splice(targetIndex + 1, 0, forceControl);
    }
  }
  return result;
}

function sortBezierMusicScoreGroup(
  notes: readonly BezierMusicScoreNote[],
  frontControlKey: number,
  backControlKey: number,
): readonly BezierMusicScoreNote[] {
  return sortForceMusicScoreNotes(
    [...notes].sort((left, right) => compareMusicScoreNotes(
      left,
      right,
      frontControlKey,
      backControlKey,
    )),
  );
}

function mergeMultiRangeSlideNotes(
  notes: readonly BezierMusicScoreNote[],
): readonly BezierMusicScoreNote[] {
  const ordered = [...notes].sort((left, right) =>
    left.absolutePos - right.absolutePos || left.laneId - right.laneId);
  const merged: BezierMusicScoreNote[] = [];
  for (const note of ordered) {
    const previous = merged[merged.length - 1];
    if (
      previous !== undefined
      && previous.absolutePos === note.absolutePos
      && previous.laneId + previous.multiRangeWidth === note.laneId
    ) {
      merged[merged.length - 1] = {
        ...previous,
        multiRangeWidth: previous.multiRangeWidth + 1,
      };
      continue;
    }
    merged.push(note);
  }
  return merged;
}

function partitionBezierMusicScoreNotes(
  notes: readonly BezierMusicScoreNote[],
  header: MusicScoreHeaderParser,
): readonly [
  readonly BezierMusicScoreNote[],
  readonly BezierMusicScoreNote[],
  readonly BezierMusicScoreNote[],
] {
  const defaultNotes: BezierMusicScoreNote[] = [];
  const groupA: BezierMusicScoreNote[] = [];
  const groupB: BezierMusicScoreNote[] = [];
  if (header.isMultiRange) {
    const slideA: BezierMusicScoreNote[] = [];
    const slideB: BezierMusicScoreNote[] = [];
    const controlA: BezierMusicScoreNote[] = [];
    const controlB: BezierMusicScoreNote[] = [];
    for (const note of notes) {
      if (bezierSlideGroup(note.wavName) === true) {
        slideA.push(note);
      } else if (BEZIER_CONTROL_A_WAV_NAMES.has(note.wavName)) {
        controlA.push(note);
      } else if (bezierSlideGroup(note.wavName) === false) {
        slideB.push(note);
      } else if (BEZIER_CONTROL_B_WAV_NAMES.has(note.wavName)) {
        controlB.push(note);
      } else {
        defaultNotes.push(note);
      }
    }
    groupA.push(...mergeMultiRangeSlideNotes(slideA), ...controlA);
    groupB.push(...mergeMultiRangeSlideNotes(slideB), ...controlB);
  } else {
    for (const note of notes) {
      if (
        bezierSlideGroup(note.wavName) === true
        || BEZIER_CONTROL_A_WAV_NAMES.has(note.wavName)
      ) {
        groupA.push(note);
      } else if (
        bezierSlideGroup(note.wavName) === false
        || BEZIER_CONTROL_B_WAV_NAMES.has(note.wavName)
      ) {
        groupB.push(note);
      } else {
        defaultNotes.push(note);
      }
    }
  }
  return [
    defaultNotes,
    sortBezierMusicScoreGroup(
      groupA,
      firstControlKey(header, "cont_bezier_front_a"),
      firstControlKey(header, "cont_bezier_back_a"),
    ),
    sortBezierMusicScoreGroup(
      groupB,
      firstControlKey(header, "cont_bezier_front_b"),
      firstControlKey(header, "cont_bezier_back_b"),
    ),
  ];
}

function findWavKey(
  header: MusicScoreHeaderParser,
  wavName: string,
): string | null {
  for (const [key, candidate] of header.wavFileNames) {
    if (candidate === wavName) {
      return key;
    }
  }
  for (const [key, candidate] of header.additiveWavFileNames) {
    if (candidate === wavName) {
      return key;
    }
  }
  return null;
}

function serializeBezierMusicScoreGroup(
  sourceNotes: readonly BezierMusicScoreNote[],
  generatedNotes: readonly BezierExpandedNote[],
  header: MusicScoreHeaderParser,
): readonly string[] {
  const grouped = new Map<string, SerializedEntry[]>();
  for (const note of sourceNotes) {
    const entries = grouped.get(lineInfo(note)) ?? [];
    entries.push([note.numerator, note.denominator, note.noteId]);
    grouped.set(lineInfo(note), entries);
  }
  for (const note of generatedNotes) {
    const relativePosition = note.absolutePos % MUSIC_BAR_DIVISION_COUNT;
    const divisor = greatestCommonDivisor(relativePosition, MUSIC_BAR_DIVISION_COUNT);
    const numerator = relativePosition / divisor;
    const denominator = MUSIC_BAR_DIVISION_COUNT / divisor;
    const wavKey = findWavKey(header, note.noteWavName);
    if (wavKey === null) {
      throw new Error(`missing WAV key for ${note.noteWavName}`);
    }
    const entries = grouped.get(note.lineInfo) ?? [];
    const exists = entries.some(([existingNumerator, existingDenominator]) =>
      Math.floor(MUSIC_BAR_DIVISION_COUNT / existingDenominator) * existingNumerator
      === Math.floor(MUSIC_BAR_DIVISION_COUNT / denominator) * numerator);
    if (!exists) {
      entries.push([numerator, denominator, wavKey]);
      grouped.set(note.lineInfo, entries);
    }
  }
  const result: string[] = [];
  for (const [currentLineInfo, entries] of grouped) {
    const maxDenominator = Math.max(...entries.map((entry) => entry[1]));
    const values: string[] = [];
    for (let slotIndex = 0; slotIndex < maxDenominator; slotIndex += 1) {
      const matching = entries.find(([numerator, denominator]) =>
        Math.floor(MUSIC_BAR_DIVISION_COUNT / maxDenominator) * slotIndex
        === Math.floor(MUSIC_BAR_DIVISION_COUNT / denominator) * numerator);
      values.push(matching === undefined ? "00" : matching[2]);
    }
    result.push(currentLineInfo + values.join(""));
  }
  return result;
}

function lineInfo(note: BezierMusicScoreNote): string {
  return `#${String(note.barNumber).padStart(3, "0")}${note.laneIdStr}:`;
}

function toChartNote(note: BezierMusicScoreNote): BezierChartNote {
  return {
    noteId: note.noteId,
    wavName: note.wavName,
    absolutePos: note.absolutePos,
    laneAbsolutePos: note.laneId,
    multiRangeWidth: note.multiRangeWidth,
  };
}
