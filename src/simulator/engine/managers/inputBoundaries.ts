import { evidenceRequired, type SimulatorResult } from "../evidence";

export class InputManager {
  execInput(): SimulatorResult<void> {
    return evidenceRequired(
      "input.exec-input",
      ["E12"],
      "The InputManager dispatch boundary is confirmed; real input behavior is outside the first slice.",
    );
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
