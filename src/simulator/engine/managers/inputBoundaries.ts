import type { GameStateValue } from "../data/inGameState";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export class InputManager {
  execInput(_currentGameState: GameStateValue): SimulatorResult<void> {
    return ok(undefined);
  }
}

export class GamePlayButton {
  execTouchBegan(): SimulatorResult<void> {
    return evidenceRequired(
      "input.game-play-button.touch-began",
      ["E12", "E13"],
      "GamePlayButton ownership is represented, but touch arbitration and judgement are excluded.",
    );
  }
}
