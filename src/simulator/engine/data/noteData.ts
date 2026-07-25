import type { EvidenceBound } from "../evidence";

export type NoteFamily =
  | "normal"
  | "long"
  | "slide"
  | "flick"
  | "directional-flick"
  | "multiple-directional-flick";

export interface MusicPosition {
  readonly bar: number;
  readonly beatProgress: number;
}

export interface SimulatorClockProfile {
  readonly currentBpm: EvidenceBound<number>;
  readonly nextBpm: EvidenceBound<number>;
  readonly initialMusicPosition: EvidenceBound<MusicPosition>;
  readonly initialLauncherMusicPosition: EvidenceBound<MusicPosition>;
}

export interface SimulatorNoteManagerProfile {
  readonly bpmChangeCount: EvidenceBound<number>;
}

export interface NoteInformationFixture {
  readonly fixtureId: string;
  readonly sourceOrder: number;
  readonly family: EvidenceBound<NoteFamily>;
  readonly gameNoteType: EvidenceBound<number>;
  readonly frontNoteType: EvidenceBound<number>;
  readonly afterNoteType: EvidenceBound<number>;
  readonly barIndex: EvidenceBound<number>;
  readonly absolutePosition: EvidenceBound<number>;
}

export interface NoteBatchInformation {
  readonly fixtureId: string;
  readonly barIndex: EvidenceBound<number>;
  readonly numerator: EvidenceBound<number>;
  readonly denominator: EvidenceBound<number>;
  readonly informationList: readonly NoteInformationFixture[];
}

export type NoteBatchInformationList = readonly NoteBatchInformation[];
