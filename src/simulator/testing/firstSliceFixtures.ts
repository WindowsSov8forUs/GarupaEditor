import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  VirtualLaneDirection,
  type ChartConstructionResult,
  type NoteBatchInformation,
  type NoteInformation,
} from "../engine/chart/types";
import { registerConstructedChartRuntimeMetadata } from "../engine/runtime/chartRuntimeMetadata";
import type {
  EvidenceBound,
  EvidenceId,
  EvidenceReference,
} from "../engine/evidence";
import type { SimulatorEngineInput } from "../host/contracts";

const testingIds = new WeakMap<NoteInformation, string>();

export function evidence(
  id: EvidenceId,
  assertion: string,
): EvidenceReference {
  return { id, assertion };
}

export function bound<T>(
  value: T,
  ...references: readonly EvidenceReference[]
): EvidenceBound<T> {
  return { value, evidence: references };
}

export function testingNoteId(noteInformation: NoteInformation | null): string {
  if (noteInformation === null) {
    return "unbound";
  }
  return testingIds.get(noteInformation) ?? `note:${noteInformation.index}`;
}

export function noteInformation(
  testingId: string,
  index: number,
): NoteInformation {
  const note: NoteInformation = {
    index,
    isResult: false,
    isSlideNoteHead: false,
    isMultiRangeCombine: false,
    isInvisible: false,
    buttonType: ButtonType.Button_01_BMS_1P_01,
    buttonTypes: [ButtonType.Button_01_BMS_1P_01],
    buttonTypesArray: [ButtonType.Button_01_BMS_1P_01],
    gameNoteType: GameNoteType.Normal,
    fireNoteType: FrontNoteType.Normal,
    afterNoteType: AfterNoteType.None,
    halfButtonIndex: -1,
    soundValue: "01",
    ccNum: 11,
    barIndex: 0,
    numerator: 0,
    denominator: 1,
    absolutePos: 0,
    afterNoteAbsolutePos: -1,
    shortRhythmUnder8beat: false,
    afterNoteShortRhythmUnder8beat: false,
    bpm: 0,
    bpmString: "",
    storedAbsolutePos: 0,
    slideNoteList: [],
    soundValueList: ["01"],
    gameNoteAdditionalType: GameNoteAdditionalType.None,
    gameNoteAdditionalTypeLongNoteEnd: GameNoteAdditionalType.None,
    skillNoteIndex: 0,
    skillAfterNoteIndex: 0,
    virtualLaneDirection: VirtualLaneDirection.None,
    virtualLaneDistance: 0,
  };
  testingIds.set(note, testingId);
  return note;
}

export function noteBatch(
  noteIds: readonly string[],
  absolutePos = 1,
): NoteBatchInformation {
  return {
    barIndex: Math.trunc(absolutePos / 192),
    numerator: absolutePos % 192,
    denominator: 192,
    absolutePos,
    informationList: noteIds.map((id, index) => noteInformation(id, index)),
  };
}

export function chart(
  noteBatches: readonly NoteBatchInformation[] = [],
  startBpm = 120,
): ChartConstructionResult {
  const result: ChartConstructionResult = {
    noteBatches,
    startBpm,
    startBpmString: String(startBpm),
    bpmChangeRealValueList: noteBatches.flatMap((batch) =>
      batch.informationList
        .filter((note) => note.ccNum === 3 || note.ccNum === 8)
        .map((note) => note.bpm),
    ),
    bpmChangeStringRealValueList: noteBatches.flatMap((batch) =>
      batch.informationList
        .filter((note) => note.ccNum === 3 || note.ccNum === 8)
        .map((note) => note.bpmString),
    ),
    isMultiRangeNotes: false,
    habahiroChangeAbsolutePos: -1,
  };
  registerConstructedChartRuntimeMetadata(result);
  return result;
}

export function engineInput(
  noteBatches: readonly NoteBatchInformation[] = [],
): SimulatorEngineInput {
  return {
    chart: chart(noteBatches),
    runtime: {
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      playMode: { kind: "manual" },
    },
    oneFrameData: {
      capacity: bound(4, evidence("E08", "testing OneFrameData capacity")),
    },
  };
}
