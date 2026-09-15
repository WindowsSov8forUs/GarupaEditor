export type NoteFamily =
  | "normal"
  | "long"
  | "slide"
  | "flick"
  | "directional-flick"
  | "multiple-directional-flick"
  | "multiple-directional-visual";

export interface MusicPosition {
  readonly bar: number;
  readonly beatProgress: number;
}
