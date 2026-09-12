import type { OneFrameJudgementBatch } from "../engine/data/oneFrameData";
import type { StagePsylliumCommand } from "../engine/data/stageCommand";

export type StartupInformationPhase = "hidden" | "revealing" | "holding" | "fading" | "complete";
export type StartupStagePhase = "dark" | "waiting" | "introducing" | "idle" | "leaving";
export type StartupLinePhase = "hidden" | "waiting" | "fading" | "visible";

export interface StartupDirectionSceneState {
  readonly sequence: number;
  readonly informationPhase: StartupInformationPhase;
  readonly informationAlpha: number;
  readonly hudAlpha: number;
  readonly darkCoverAlpha: number;
  readonly stagePhase: StartupStagePhase;
  /** Transform interpolation between the authored start and playing poses, after easing. */
  readonly stageProgress: number;
  readonly stageColorProgress: number;
  readonly stagePsylliumFading: boolean;
  readonly stagePsylliumSpeed: number;
  readonly characterAlpha: number;
  readonly linePhase: StartupLinePhase;
  readonly lineAlpha: number;
  readonly gameplayVisible: boolean;
  readonly rehearsalControlsVisible: boolean;
}

export interface StartupDirectionSceneBackend {
  publish(state: StartupDirectionSceneState): void;
  advanceStageEffects(deltaSeconds: number): void;
  reflectStageJudgements(batch: OneFrameJudgementBatch): void;
  /** null is the original bar-wrap replay of the currently selected motion. */
  reflectStageCommand(command: StagePsylliumCommand | null, speed: number): void;
  dispose(): void;
}

export function freezeStartupDirectionSceneState(
  value: StartupDirectionSceneState,
): StartupDirectionSceneState {
  for (const field of [
    value.informationAlpha, value.hudAlpha, value.darkCoverAlpha,
    value.stageProgress, value.stageColorProgress, value.characterAlpha, value.lineAlpha,
  ]) {
    if (!Number.isFinite(field) || field < 0 || field > 1 || !Object.is(field, Math.fround(field))) {
      throw new TypeError("Startup scene scalar must be an exact finite Float32 unit value.");
    }
  }
  if (!Number.isFinite(value.stagePsylliumSpeed) || value.stagePsylliumSpeed <= 0) {
    throw new TypeError("Stage psyllium speed must be finite and positive.");
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
  stageColorProgress: Math.fround(0),
  stagePsylliumFading: false,
  stagePsylliumSpeed: 1,
  characterAlpha: Math.fround(0),
  linePhase: "hidden",
  lineAlpha: Math.fround(0),
  gameplayVisible: false,
  rehearsalControlsVisible: false,
});
