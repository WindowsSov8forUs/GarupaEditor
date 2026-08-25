export interface ControlHudIdentity {
  readonly pause: "GamePlay/UI_Root/Display/Button/Pause";
  readonly rehearsal: "InGameMoveTime";
}

export const CONTROL_HUD_IDENTITY: ControlHudIdentity = Object.freeze({
  pause: "GamePlay/UI_Root/Display/Button/Pause",
  rehearsal: "InGameMoveTime",
});
