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

export interface FirstSliceNoteInformationFixture {
  readonly fixtureId: string;
  readonly family: EvidenceBound<NoteFamily>;
  readonly gameNoteType: EvidenceBound<number>;
  readonly frontNoteType: EvidenceBound<number>;
  readonly afterNoteType: EvidenceBound<number>;
  readonly barIndex: EvidenceBound<number>;
  readonly absolutePosition: EvidenceBound<number>;
}

export interface FirstSliceNoteBatchFixture {
  readonly fixtureId: string;
  readonly barIndex: EvidenceBound<number>;
  readonly numerator: EvidenceBound<number>;
  readonly denominator: EvidenceBound<number>;
  readonly informationList: readonly FirstSliceNoteInformationFixture[];
}

export type FirstSliceNoteBatchListFixture = readonly FirstSliceNoteBatchFixture[];
