import profile from "../skin/stagePsyllium.json";
import { StageClipAnimation } from "./stageClipAnimation";

/** Ordinary entry with no authored psyllium command, team or character inputs. */
export class StagePsylliumAnimation {
  readonly animation = new StageClipAnimation({ entry: profile.clip }, "entry");
  colorFactor = 1;
  alpha = 1;
  private fadeStep = 0;

  beginFade(): boolean {
    if (this.fadeStep !== 0) return false;
    // StartCoroutine executes the first RGB increment before its first yield.
    this.fadeStep = 1;
    this.colorFactor = 1 - 1 / profile.fadeFrames;
    return true;
  }

  advance(deltaSeconds: number): boolean {
    if (this.alpha === 0) return false;
    this.animation.advance(deltaSeconds);
    if (this.fadeStep > 0) {
      this.fadeStep++;
      this.colorFactor = Math.max(0, 1 - this.fadeStep / profile.fadeFrames);
      if (this.fadeStep > profile.fadeFrames) this.alpha = 0;
    }
    return true;
  }
}
