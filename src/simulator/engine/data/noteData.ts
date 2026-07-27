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
