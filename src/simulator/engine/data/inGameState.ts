export const GameState = {
  Prepare: 0,
  OPFirstAnimStart: 1,
  OPFirstAnimEnd: 2,
  OPLastAnimStart: 3,
  PlayingNone: 4,
  PlayingSound: 5,
  PauseNone: 6,
  PauseSound: 7,
  GameOverMotionFirstStart: 8,
  GameOverMotionLastStart: 9,
  GameOverMotionLastEnd: 10,
  GameClearAnimStart: 11,
  GameClearAnimEnd: 12,
  ClearMotionStart: 13,
  MoveTime: 14,
  MoveTimeWaitForPlay: 15,
  MoveTimeFinished: 16,
  MovieBeforeSound: 17,
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
