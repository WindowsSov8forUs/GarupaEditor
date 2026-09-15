import type {
  RenderAddScoreHudState,
  RenderComboHudState,
  RenderLifeHudState,
  RenderResultHudState,
  RenderScoreHudState,
} from "../../backends/renderingContracts";

export const HUD_PREFAB_OBJECT_IDS = Object.freeze({
  score: "render:hud:score",
  life: "render:hud:life",
  combo: "render:hud:combo",
  comboAllPerfect: "render:hud:combo:all-perfect",
  result: "render:hud:result",
  gameClear: "render:hud:game-clear",
  addScore: Object.freeze([
    "render:hud:add-score",
    "render:hud:add-score:1",
    "render:hud:add-score:2",
    "render:hud:add-score:3",
  ] as const),
});

export interface InGameHudPersistentState {
  readonly score: RenderScoreHudState;
  readonly life: RenderLifeHudState;
  readonly normalCombo: RenderComboHudState;
  readonly allPerfectCombo: RenderComboHudState;
  readonly result: RenderResultHudState | null;
  readonly addScore: readonly (RenderAddScoreHudState | null)[];
}
