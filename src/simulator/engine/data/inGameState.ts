export const GameState = {
  Prepare: 0,
  OPFirstAnimStart: 1,
  OPFirstAnimEnd: 2,
  OPLastAnimStart: 3,
  PlayingNone: 4,
  PlayingSound: 5,
  PauseNone: 6,
  PauseSound: 7,
} as const;

export type GameStateValue = (typeof GameState)[keyof typeof GameState];

export const PauseState = {
  None: 0,
  Pause: 1,
  Resume: 2,
} as const;

export type PauseStateValue = (typeof PauseState)[keyof typeof PauseState];

export function isPausedState(
  currentGameState: GameStateValue,
  pauseState: PauseStateValue,
): boolean {
  return (
    pauseState === PauseState.Pause ||
    pauseState === PauseState.Resume ||
    currentGameState === GameState.PauseNone ||
    currentGameState === GameState.PauseSound
  );
}
