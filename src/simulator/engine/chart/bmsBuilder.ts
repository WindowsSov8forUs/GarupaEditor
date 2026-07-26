import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import { ChartConstructionEvidence } from "./evidence";
import { splitMusicScoreLines } from "./musicScoreBezier";
import {
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  VirtualLaneDirection,
  type ButtonTypeValue,
  type FrontNoteTypeValue,
  type GameNoteAdditionalTypeValue,
  type GameNoteTypeValue,
  type VirtualLaneDirectionValue,
} from "./types";

const MUSIC_BAR_DIVISION_COUNT = 192;
const NORMAL_BUTTON_TYPES = [
  1, 2, 3, 4, 5, 0, -1, 6, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 3, 4, 5, 0, -1, 6, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 3, 4, 5, 0, -1, 6,
] as const;
const MULTI_RANGE_BUTTON_TYPES = [
  0, 1, 2, 3, 4, 0, -1, 5, 6, -1,
  8, 9, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 2, 3, 4, 0, -1, 5, 6, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 2, 3, 4, 0, -1, 5, 6, -1,
  8, 9,
] as const;

export interface BMSNoteMaterial {
  readonly barIndex: number;
  readonly numerator_: number;
  readonly denominator_: number;
  readonly playMusicList_: readonly string[];
  readonly fireNoteType_: FrontNoteTypeValue;
  readonly gameNoteType_: GameNoteTypeValue;
  readonly gameNoteAdditionalType_: GameNoteAdditionalTypeValue;
  readonly soundValue: string;
  readonly ccNum: number;
  readonly Bpm: number;
  readonly BpmString: string;
  readonly IsInvisible: boolean;
  readonly soundValueList: readonly string[];
  readonly VirtualLaneDirection: VirtualLaneDirectionValue;
  readonly VirtualLaneDistance: number;
}

export interface BMSBarDataWithButton {
  readonly noteList_: readonly BMSNoteMaterial[];
  readonly buttonType_: ButtonTypeValue;
}

export interface BMSBarData {
  readonly bmsNoteList_: readonly BMSBarDataWithButton[];
  readonly magnification_: number;
}

interface MutableBMSBarDataWithButton {
  readonly noteList_: BMSNoteMaterial[];
  readonly buttonType_: ButtonTypeValue;
}

interface MutableBMSBarData {
  readonly bmsNoteList_: MutableBMSBarDataWithButton[];
  magnification_: number;
}

export function bmsNoteMaterialAbsolutePos(material: BMSNoteMaterial): number {
  return Math.floor(
    MUSIC_BAR_DIVISION_COUNT * material.numerator_ / material.denominator_,
  ) + MUSIC_BAR_DIVISION_COUNT * material.barIndex;
}

export class NoteDataBMSBuilder {
  private readonly resultDictionaryValue = new Map<number, MutableBMSBarData>();
  private readonly bpmChangeRealValueListValue: number[] = [];
  private readonly bpmChangeStringRealValueListValue: string[] = [];
  private readonly bpmChangeValueListValue: BMSNoteMaterial[] = [];
  private readonly wavFileNames = new Map<string, string>();
  private readonly specificBpms = new Map<string, readonly [number, string]>();
  private isCommandValue = false;
  private startBpmValue = 0;
  private startBpmStringValue = "";
  private isMultiRangeNotesValue = false;

  get resultDictionary(): ReadonlyMap<number, BMSBarData> {
    return this.resultDictionaryValue;
  }

  get bpmChangeRealValueList(): readonly number[] {
    return this.bpmChangeRealValueListValue;
  }

  get bpmChangeStringRealValueList(): readonly string[] {
    return this.bpmChangeStringRealValueListValue;
  }

  get bpmChangeValueList(): readonly BMSNoteMaterial[] {
    return this.bpmChangeValueListValue;
  }

  get startBpm(): number {
    return this.startBpmValue;
  }

  get startBpmString(): string {
    return this.startBpmStringValue;
  }

  get isMultiRangeNotes(): boolean {
    return this.isMultiRangeNotesValue;
  }

  initialize(musicScoreData: string, isCommand: boolean): SimulatorResult<void> {
    this.reset(isCommand);
    try {
      for (const line of splitMusicScoreLines(musicScoreData)) {
        this.executeParseLineForNoteDataManager(line);
      }
      this.sortResultDictionary();
      return ok(undefined);
    } catch (error) {
      return evidenceRequired(
        "chart-construction.invalid-bms",
        [
          ChartConstructionEvidence.E01,
          ChartConstructionEvidence.E02,
          ChartConstructionEvidence.E03,
          ChartConstructionEvidence.E04,
          ChartConstructionEvidence.E13,
          ChartConstructionEvidence.E16,
          ChartConstructionEvidence.E17,
          ChartConstructionEvidence.E18,
        ],
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private reset(isCommand: boolean): void {
    this.resultDictionaryValue.clear();
    this.bpmChangeRealValueListValue.length = 0;
    this.bpmChangeStringRealValueListValue.length = 0;
    this.bpmChangeValueListValue.length = 0;
    this.wavFileNames.clear();
    this.specificBpms.clear();
    this.isCommandValue = isCommand;
    this.startBpmValue = 0;
    this.startBpmStringValue = "";
    this.isMultiRangeNotesValue = false;
  }

  private executeParseLineForNoteDataManager(line: string): void {
    if (line.startsWith("*") || line.startsWith("%") || line.startsWith(";")) {
      return;
    }
    if (this.parseHeaderData(line)) {
      return;
    }
    this.parseBarData(line);
  }

  private parseHeaderData(line: string): boolean {
    if (!line.startsWith("#")) {
      return false;
    }
    if (line.includes("#HABAHIRO")) {
      this.isMultiRangeNotesValue = true;
      return true;
    }
    if (line.startsWith("#WAV")) {
      if (line.length < 8) {
        throw new Error(`invalid WAV header: ${line}`);
      }
      const key = line.slice(4, 6);
      if (!/^[0-9A-Z]{2}$/i.test(key) || this.wavFileNames.has(key)) {
        throw new Error(`invalid or duplicate WAV key ${key}`);
      }
      this.wavFileNames.set(key, line.slice(7).trim());
      return true;
    }
    if (line.startsWith("#BPM ")) {
      const bpmString = line.slice(5).trim();
      const bpm = parseFiniteNumber(bpmString, "start BPM");
      this.startBpmValue = bpm;
      this.startBpmStringValue = bpmString;
      return true;
    }
    if (line.startsWith("#BPM")) {
      if (line.length < 8) {
        throw new Error(`invalid specific BPM header: ${line}`);
      }
      const key = line.slice(4, 6);
      if (!/^[0-9A-Z]{2}$/i.test(key) || this.specificBpms.has(key)) {
        throw new Error(`invalid or duplicate specific BPM key ${key}`);
      }
      const bpmString = line.slice(7).trim();
      this.specificBpms.set(key, [
        parseFiniteNumber(bpmString, `BPM ${key}`),
        bpmString,
      ]);
      return true;
    }
    return /^#[A-Za-z]/.test(line);
  }

  private parseBarData(line: string): void {
    if (line.length === 0) {
      return;
    }
    const match = /^#(\d{3})(\d{2}):(.*)$/.exec(line);
    if (match === null) {
      if (line.startsWith("#") && /^#\d/.test(line)) {
        throw new Error(`invalid BMS bar line: ${line}`);
      }
      return;
    }
    const barIndex = Number(match[1]);
    const ccNum = Number(match[2]);
    const value = match[3] ?? "";
    if (ccNum === 2) {
      this.barData(barIndex).magnification_ = parseFiniteNumber(
        value,
        `bar ${barIndex} magnification`,
      );
      return;
    }
    if (ccNum === 3 || ccNum === 8) {
      this.createBpmChangeList(value, barIndex, ccNum);
      return;
    }
    if (ccNum === 4 || ccNum === 5 || ccNum === 6 || ccNum === 7 || ccNum === 9) {
      return;
    }
    this.createBarData(this.barData(barIndex), ccNum, value, barIndex);
  }

  private barData(barIndex: number): MutableBMSBarData {
    const existing = this.resultDictionaryValue.get(barIndex);
    if (existing !== undefined) {
      return existing;
    }
    const created: MutableBMSBarData = {
      bmsNoteList_: [],
      magnification_: 1,
    };
    this.resultDictionaryValue.set(barIndex, created);
    return created;
  }

  private createBarData(
    barData: MutableBMSBarData,
    ccNum: number,
    value: string,
    barIndex: number,
  ): void {
    const buttonType = getButtonType(ccNum, this.isMultiRangeNotesValue);
    let buttonGroup = barData.bmsNoteList_.find(
      (candidate) => candidate.buttonType_ === buttonType,
    );
    if (buttonGroup === undefined) {
      buttonGroup = { buttonType_: buttonType, noteList_: [] };
      barData.bmsNoteList_.push(buttonGroup);
    }
    const frontNoteType = ccNum === 1
      ? FrontNoteType.None
      : ccNum >= 50 && ccNum < 62
        ? FrontNoteType.Long
        : FrontNoteType.Normal;
    this.createNoteData(
      buttonGroup.noteList_,
      value,
      frontNoteType,
      barIndex,
      ccNum,
    );
  }

  private createNoteData(
    materials: BMSNoteMaterial[],
    value: string,
    frontNoteType: FrontNoteTypeValue,
    barIndex: number,
    ccNum: number,
  ): void {
    if (value.length % 2 !== 0) {
      throw new Error(`bar ${barIndex} CC${ccNum} has an incomplete cell`);
    }
    const denominator = value.length / 2;
    for (let numerator = 0; numerator < denominator; numerator += 1) {
      const noteId = value.slice(numerator * 2, numerator * 2 + 2);
      if (noteId === "00") {
        continue;
      }
      const wavName = this.wavFileNames.get(noteId) ?? "";
      const soundValue = removeWavSuffix(wavName);
      const gameNoteType = getGameNoteTypeWithSoundValue(
        soundValue,
        frontNoteType,
      );
      const [virtualLaneDirection, virtualLaneDistance] = getVirtualLane(
        soundValue,
        gameNoteType,
      );
      const material: BMSNoteMaterial = {
        barIndex,
        numerator_: numerator,
        denominator_: denominator,
        playMusicList_: [noteId],
        fireNoteType_: getFireNoteTypeWithSoundValue(soundValue, frontNoteType),
        gameNoteType_: gameNoteType,
        gameNoteAdditionalType_: getGameNoteAdditionalType(soundValue),
        soundValue,
        ccNum,
        Bpm: 0,
        BpmString: "",
        IsInvisible: (ccNum >= 31 && ccNum < 37) || (ccNum & ~1) === 38,
        soundValueList: [soundValue],
        VirtualLaneDirection: virtualLaneDirection,
        VirtualLaneDistance: virtualLaneDistance,
      };
      insertOrMergeMaterial(
        materials,
        material,
        this.isMultiRangeNotesValue,
      );
    }
  }

  private createBpmChangeList(value: string, barIndex: number, ccNum: number): void {
    if (value.length % 2 !== 0) {
      throw new Error(`bar ${barIndex} CC${ccNum} has an incomplete BPM cell`);
    }
    const denominator = value.length / 2;
    for (let numerator = 0; numerator < denominator; numerator += 1) {
      const noteId = value.slice(numerator * 2, numerator * 2 + 2);
      if (noteId === "00") {
        continue;
      }
      let bpm: number;
      let bpmString: string;
      if (ccNum === 3) {
        if (!/^[0-9A-F]{2}$/i.test(noteId)) {
          throw new Error(`invalid hexadecimal BPM cell ${noteId}`);
        }
        bpm = Number.parseInt(noteId, 16);
        bpmString = String(bpm);
      } else {
        const specificBpm = this.specificBpms.get(noteId);
        if (specificBpm === undefined) {
          throw new Error(`missing #BPM${noteId} header`);
        }
        [bpm, bpmString] = specificBpm;
      }
      const material: BMSNoteMaterial = {
        barIndex,
        numerator_: numerator,
        denominator_: denominator,
        playMusicList_: [],
        fireNoteType_: FrontNoteType.None,
        gameNoteType_: GameNoteType.None,
        gameNoteAdditionalType_: GameNoteAdditionalType.BpmChange,
        soundValue: "",
        ccNum,
        Bpm: bpm,
        BpmString: bpmString,
        IsInvisible: false,
        soundValueList: [],
        VirtualLaneDirection: VirtualLaneDirection.None,
        VirtualLaneDistance: 0,
      };
      this.bpmChangeValueListValue.push(material);
      this.bpmChangeRealValueListValue.push(bpm);
      this.bpmChangeStringRealValueListValue.push(bpmString);
    }
  }

  private sortResultDictionary(): void {
    const entries = [...this.resultDictionaryValue.entries()]
      .sort(([left], [right]) => left - right);
    this.resultDictionaryValue.clear();
    for (const [barIndex, barData] of entries) {
      this.resultDictionaryValue.set(barIndex, barData);
    }
    this.bpmChangeValueListValue.sort(
      (left, right) => bmsNoteMaterialAbsolutePos(left) - bmsNoteMaterialAbsolutePos(right),
    );
    void this.isCommandValue;
  }
}

function parseFiniteNumber(value: string, field: string): number {
  if (value.trim() === "") {
    throw new Error(`${field} is empty`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} is not finite: ${value}`);
  }
  return parsed;
}

function getButtonType(ccNum: number, isMultiRange: boolean): ButtonTypeValue {
  const table = isMultiRange ? MULTI_RANGE_BUTTON_TYPES : NORMAL_BUTTON_TYPES;
  const value = table[ccNum - 11] ?? ButtonType.None;
  return value as ButtonTypeValue;
}

function removeWavSuffix(wavName: string): string {
  return wavName.endsWith(".wav") ? wavName.slice(0, -4) : wavName;
}

function getFireNoteTypeWithSoundValue(
  soundValue: string,
  frontNoteType: FrontNoteTypeValue,
): FrontNoteTypeValue {
  if (soundValue === "flick" || soundValue === "fever_note_flick") {
    return frontNoteType === FrontNoteType.Long
      ? FrontNoteType.None
      : FrontNoteType.Flick;
  }
  if (soundValue.includes("directional_fl_l") || soundValue.includes("directional_fl_r")) {
    return FrontNoteType.DirectionalFlick;
  }
  if (soundValue.includes("slide_a")) {
    return FrontNoteType.SlideA;
  }
  if (
    soundValue.includes("slide_end_a")
    || soundValue.includes("slide_end_flick_a")
    || soundValue === "long_end_dir_flick_l"
    || soundValue === "long_end_dir_flick_r"
    || soundValue === "slide_end_dir_flick_l_a"
    || soundValue === "slide_end_dir_flick_r_a"
  ) {
    return FrontNoteType.None;
  }
  if (soundValue.includes("slide_b")) {
    return FrontNoteType.SlideB;
  }
  if (
    soundValue.includes("slide_end_b")
    || soundValue.includes("slide_end_flick_b")
    || soundValue === "slide_end_dir_flick_l_b"
    || soundValue === "slide_end_dir_flick_r_b"
  ) {
    return FrontNoteType.None;
  }
  if (soundValue === "add_long_dir_flick") {
    return FrontNoteType.LongMultipleDirectionalFlickAdd;
  }
  if (soundValue === "add_slide_dir_flick") {
    return FrontNoteType.SlideAMultipleDirectionalFlickAdd;
  }
  return frontNoteType;
}

function getGameNoteTypeWithSoundValue(
  soundValue: string,
  frontNoteType: FrontNoteTypeValue,
): GameNoteTypeValue {
  if (soundValue === "flick" || soundValue === "fever_note_flick") {
    return frontNoteType === FrontNoteType.Long
      ? GameNoteType.LongEndFlick
      : GameNoteType.Flick;
  }
  const exactTypes = new Map<string, GameNoteTypeValue>([
    ["slide_end_dir_flick_l_a", GameNoteType.SlideADirectionalFlickLeft],
    ["slide_end_dir_flick_r_a", GameNoteType.SlideADirectionalFlickRight],
    ["slide_end_dir_flick_l_b", GameNoteType.SlideBDirectionalFlickLeft],
    ["slide_end_dir_flick_r_b", GameNoteType.SlideBDirectionalFlickRight],
    ["long_end_dir_flick_l", GameNoteType.LongDirectionalFlickLeft],
    ["long_end_dir_flick_r", GameNoteType.LongDirectionalFlickRight],
    ["add_long_dir_flick", GameNoteType.LongAddDirectionFlick],
    ["add_slide_dir_flick", GameNoteType.SlideAddDirectionalFlick],
  ]);
  const exact = exactTypes.get(soundValue);
  if (exact !== undefined) {
    return exact;
  }
  if (soundValue.includes("slide_end_flick_a")) return GameNoteType.SlideEndFlickA;
  if (soundValue.includes("slide_end_flick_b")) return GameNoteType.SlideEndFlickB;
  if (soundValue.includes("slide_end_a")) return GameNoteType.SlideEndA;
  if (soundValue.includes("slide_end_b")) return GameNoteType.SlideEndB;
  if (soundValue.includes("slide_a")) return GameNoteType.SlideA;
  if (soundValue.includes("slide_b")) return GameNoteType.SlideB;
  if (soundValue.includes("directional_fl_l")) return GameNoteType.DirectionalFlickLeft;
  if (soundValue.includes("directional_fl_r")) return GameNoteType.DirectionalFlickRight;
  if (frontNoteType === FrontNoteType.Long) return GameNoteType.Long;
  if (frontNoteType === FrontNoteType.Normal) return GameNoteType.Normal;
  return GameNoteType.None;
}

function getGameNoteAdditionalType(soundValue: string): GameNoteAdditionalTypeValue {
  if (soundValue.includes("fever")) return GameNoteAdditionalType.Fever;
  if (soundValue.includes("skill")) return GameNoteAdditionalType.Skill;
  if (soundValue.includes("lane_change")) return GameNoteAdditionalType.LaneChange;
  return GameNoteAdditionalType.None;
}

function getVirtualLane(
  soundValue: string,
  gameNoteType: GameNoteTypeValue,
): readonly [VirtualLaneDirectionValue, number] {
  if (gameNoteType !== GameNoteType.SlideA && gameNoteType !== GameNoteType.SlideB) {
    return [VirtualLaneDirection.None, 0];
  }
  const direction = soundValue.includes("LS")
    ? VirtualLaneDirection.Left
    : soundValue.includes("RS")
      ? VirtualLaneDirection.Right
      : VirtualLaneDirection.None;
  if (direction === VirtualLaneDirection.None) {
    return [direction, 0];
  }
  const distance = Number.parseInt(soundValue.slice(10), 10);
  return [direction, Number.isNaN(distance) ? 0 : distance];
}

function insertOrMergeMaterial(
  materials: BMSNoteMaterial[],
  material: BMSNoteMaterial,
  isMultiRange: boolean,
): void {
  const absolutePos = bmsNoteMaterialAbsolutePos(material);
  let insertionIndex = 0;
  while (
    insertionIndex < materials.length
    && bmsNoteMaterialAbsolutePos(materials[insertionIndex]!) < absolutePos
  ) {
    insertionIndex += 1;
  }
  let equalEnd = insertionIndex;
  while (
    equalEnd < materials.length
    && bmsNoteMaterialAbsolutePos(materials[equalEnd]!) === absolutePos
  ) {
    equalEnd += 1;
  }
  const existingIndex = materials.findIndex((candidate, index) =>
    index >= insertionIndex
    && index < equalEnd
    && (!isMultiRange || candidate.ccNum === material.ccNum));
  if (existingIndex < 0) {
    materials.splice(equalEnd, 0, material);
    return;
  }
  if (material.ccNum !== 1) {
    return;
  }
  const existing = materials[existingIndex]!;
  materials[existingIndex] = {
    ...existing,
    playMusicList_: [...existing.playMusicList_, ...material.playMusicList_],
    soundValueList: [...existing.soundValueList, ...material.soundValueList],
  };
}
