import { AddScoreHudOwner } from "./addScoreHudOwner";
import { ComboHudOwner } from "./comboHudOwner";
import { LifeHudOwner } from "./lifeHudOwner";
import { ResultHudOwner } from "./resultHudOwner";
import { ScoreHudOwner } from "./scoreHudOwner";

export class InGameHudController {
  readonly score = new ScoreHudOwner();
  readonly life = new LifeHudOwner();
  readonly combo: ComboHudOwner;
  readonly result: ResultHudOwner;
  readonly addScore = new AddScoreHudOwner();

  constructor(
    isAutoPlay: boolean,
    allPerfectStatusDisplayMode: boolean,
  ) {
    this.combo = new ComboHudOwner(allPerfectStatusDisplayMode);
    this.result = new ResultHudOwner(isAutoPlay);
  }
}
