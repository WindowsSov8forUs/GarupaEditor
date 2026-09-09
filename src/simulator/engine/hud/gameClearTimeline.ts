/** Application coroutine and AnimationEvent rules, Reverse 2c7bc211. */
export interface GameClearTimeline {
  readonly elapsedSeconds: number;
  readonly waitElapsedSeconds: number;
  readonly baseStartedAtSeconds: number | null;
}

export function startGameClearTimeline(deltaTimeSeconds: number): GameClearTimeline {
  // StartCoroutine immediately resumes WaitForSeconds in the triggering frame.
  return Object.freeze({
    elapsedSeconds: 0,
    waitElapsedSeconds: Math.fround(deltaTimeSeconds),
    baseStartedAtSeconds: null,
  });
}

export function advanceGameClearTimeline(
  before: GameClearTimeline,
  deltaTimeSeconds: number,
): GameClearTimeline {
  const elapsedSeconds = Math.fround(before.elapsedSeconds + deltaTimeSeconds);
  if (before.baseStartedAtSeconds !== null) return Object.freeze({ ...before, elapsedSeconds });
  // The coroutine compares its previous elapsed time before adding this frame.
  // Animator starts at zero on resume; waiting-time overshoot is not carried.
  return before.waitElapsedSeconds >= Math.fround(0.2)
    ? Object.freeze({ ...before, elapsedSeconds, baseStartedAtSeconds: elapsedSeconds })
    : Object.freeze({
      ...before,
      elapsedSeconds,
      waitElapsedSeconds: Math.fround(before.waitElapsedSeconds + deltaTimeSeconds),
    });
}

export function isGameClearAnimationFinished(timeline: GameClearTimeline): boolean {
  return timeline.baseStartedAtSeconds !== null &&
    Math.fround(timeline.elapsedSeconds - timeline.baseStartedAtSeconds) >= 3;
}
