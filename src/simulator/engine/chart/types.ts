export const ButtonType = {
  None: -1,
  Button_00_BMS_1P_SC: 0,
  Button_01_BMS_1P_01: 1,
  Button_02_BMS_1P_02: 2,
  Button_03_BMS_1P_03: 3,
  Button_04_BMS_1P_04: 4,
  Button_05_BMS_1P_05: 5,
  Button_06_BMS_1P_06: 6,
  Button_07_BMS_1P_07: 7,
  Button_08_BMS_2P_01: 8,
  Button_09_BMS_2P_02: 9,
  Button_10_BMS_2P_03: 10,
  Button_11_BMS_2P_04: 11,
  Button_12_BMS_2P_05: 12,
  Button_13_BMS_2P_06: 13,
  Button_14_BMS_2P_07: 14,
  Button_15_BMS_2P_SC: 15,
  Pause: 16,
  AdvanceTime5Sec: 17,
  ReturnTime5Sec: 18,
} as const;

export type ButtonTypeValue = (typeof ButtonType)[keyof typeof ButtonType];

export const GameNoteType = {
  None: -1,
  Normal: 0,
  Long: 1,
  Flick: 2,
  LongEndFlick: 3,
  SlideA: 4,
  SlideB: 5,
  SlideEndA: 6,
  SlideEndB: 7,
  SlideEndFlickA: 8,
  SlideEndFlickB: 9,
  DirectionalFlickLeft: 10,
  DirectionalFlickRight: 11,
  LongDirectionalFlickLeft: 12,
  LongDirectionalFlickRight: 13,
  SlideADirectionalFlickLeft: 14,
  SlideADirectionalFlickRight: 15,
  SlideBDirectionalFlickLeft: 16,
  SlideBDirectionalFlickRight: 17,
  LongDirectionalFlickLeftAdd: 18,
  LongDirectionalFlickRightAdd: 19,
  SlideADirectionalFlickLeftAdd: 20,
  SlideADirectionalFlickRightAdd: 21,
  SlideBDirectionalFlickLeftAdd: 22,
  SlideBDirectionalFlickRightAdd: 23,
  LongAddDirectionFlick: 24,
  SlideAddDirectionalFlick: 25,
} as const;

export type GameNoteTypeValue = (typeof GameNoteType)[keyof typeof GameNoteType];

export const FrontNoteType = {
  None: -1,
  Normal: 0,
  Long: 1,
  Flick: 2,
  SlideA: 3,
  SlideB: 4,
  DirectionalFlick: 5,
  MultipleDirectionalFlick: 6,
  LongMultipleDirectionalFlickAdd: 7,
  SlideAMultipleDirectionalFlickAdd: 8,
  SlideBMultipleDirectionalFlickAdd: 9,
} as const;

export type FrontNoteTypeValue = (typeof FrontNoteType)[keyof typeof FrontNoteType];

export const AfterNoteType = {
  None: -1,
  Normal: 0,
  Flick: 1,
  DirectionalFlickLeft: 2,
  DirectionalFlickRight: 3,
  MultipleDirectionalFlickLeft: 4,
  MultipleDirectionalFlickRight: 5,
  SlideAfter: 6,
  SlideEnd: 7,
  SlideFlickEnd: 8,
  SlideDirectionalFlickEndLeft: 9,
  SlideDirectionalFlickEndRight: 10,
  SlideMultipleDirectionalFlickLeft: 11,
  SlideMultipleDirectionalFlickRight: 12,
} as const;

export type AfterNoteTypeValue = (typeof AfterNoteType)[keyof typeof AfterNoteType];

export const GameNoteAdditionalType = {
  None: 0,
  Fever: 1,
  Skill: 2,
  BpmChange: 3,
  LaneChange: 4,
} as const;

export type GameNoteAdditionalTypeValue =
  (typeof GameNoteAdditionalType)[keyof typeof GameNoteAdditionalType];

export const VirtualLaneDirection = {
  None: 0,
  Left: 1,
  Right: 2,
} as const;

export type VirtualLaneDirectionValue =
  (typeof VirtualLaneDirection)[keyof typeof VirtualLaneDirection];

export interface NoteInformation {
  readonly index: number;
  readonly isResult: boolean;
  readonly isSlideNoteHead: boolean;
  readonly isMultiRangeCombine: boolean;
  readonly isInvisible: boolean;
  readonly buttonType: ButtonTypeValue;
  readonly buttonTypes: readonly ButtonTypeValue[];
  readonly buttonTypesArray: readonly ButtonTypeValue[];
  readonly gameNoteType: GameNoteTypeValue;
  readonly fireNoteType: FrontNoteTypeValue;
  readonly afterNoteType: AfterNoteTypeValue;
  readonly halfButtonIndex: number;
  readonly soundValue: string;
  readonly ccNum: number;
  readonly barIndex: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly absolutePos: number;
  readonly afterNoteAbsolutePos: number;
  readonly shortRhythmUnder8beat: boolean;
  readonly afterNoteShortRhythmUnder8beat: boolean;
  readonly bpm: number;
  readonly bpmString: string;
  readonly storedAbsolutePos: number;
  readonly slideNoteList: readonly NoteInformation[];
  readonly soundValueList: readonly string[];
  readonly gameNoteAdditionalType: GameNoteAdditionalTypeValue;
  readonly gameNoteAdditionalTypeLongNoteEnd: GameNoteAdditionalTypeValue;
  readonly skillNoteIndex: number;
  readonly skillAfterNoteIndex: number;
  readonly virtualLaneDirection: VirtualLaneDirectionValue;
  readonly virtualLaneDistance: number;
}

export interface NoteBatchInformation {
  readonly barIndex: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly absolutePos: number;
  readonly informationList: readonly NoteInformation[];
}

export type NoteBatchInformationList = readonly NoteBatchInformation[];

export interface ChartConstructionInput {
  readonly musicScoreData: string;
  readonly isCommand?: boolean;
}

export interface ChartConstructionResult {
  readonly noteBatches: NoteBatchInformationList;
  readonly startBpm: number;
  readonly startBpmString: string;
  readonly bpmChangeRealValueList: readonly number[];
  readonly bpmChangeStringRealValueList: readonly string[];
  readonly isMultiRangeNotes: boolean;
  readonly habahiroChangeAbsolutePos: number;
}
