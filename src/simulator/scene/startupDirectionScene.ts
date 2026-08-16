export type StartupInformationPhase = "hidden" | "revealing" | "holding" | "fading" | "complete";
export type StartupStagePhase = "dark" | "waiting" | "introducing" | "idle";
export type StartupLinePhase = "hidden" | "waiting" | "fading" | "visible";

export interface StartupDirectionSceneState {
  readonly sequence: number;
  readonly informationPhase: StartupInformationPhase;
  readonly informationAlpha: number;
  readonly hudAlpha: number;
  readonly darkCoverAlpha: number;
  readonly stagePhase: StartupStagePhase;
  readonly stageProgress: number;
  readonly characterAlpha: number;
  readonly linePhase: StartupLinePhase;
  readonly lineAlpha: number;
  readonly gameplayVisible: boolean;
  readonly rehearsalControlsVisible: boolean;
}

export interface StartupDirectionSceneBackend {
  publish(state: StartupDirectionSceneState): void;
  dispose(): void;
}

export function freezeStartupDirectionSceneState(
  value: StartupDirectionSceneState,
): StartupDirectionSceneState {
  for (const field of [
    value.informationAlpha, value.hudAlpha, value.darkCoverAlpha,
    value.stageProgress, value.characterAlpha, value.lineAlpha,
  ]) {
    if (!Number.isFinite(field) || field < 0 || field > 1 || !Object.is(field, Math.fround(field))) {
      throw new TypeError("Startup scene scalar must be an exact finite Float32 unit value.");
    }
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    throw new TypeError("Startup scene sequence must be a non-negative safe integer.");
  }
  return Object.freeze({ ...value });
}

export const INITIAL_STARTUP_DIRECTION_SCENE_STATE = freezeStartupDirectionSceneState({
  sequence: 0,
  informationPhase: "hidden",
  informationAlpha: Math.fround(0),
  hudAlpha: Math.fround(0),
  darkCoverAlpha: Math.fround(1),
  stagePhase: "dark",
  stageProgress: Math.fround(0),
  characterAlpha: Math.fround(0),
  linePhase: "hidden",
  lineAlpha: Math.fround(0),
  gameplayVisible: false,
  rehearsalControlsVisible: false,
});
