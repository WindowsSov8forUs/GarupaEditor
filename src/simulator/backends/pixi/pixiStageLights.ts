import { Container, Sprite, type Texture } from "pixi.js";
import layout from "../../engine/skin/stageLightLayout.json";
import { StageLightAnimation } from "../../engine/rendering/stageLightAnimation";
import { linearTintFromSrgbChannels } from "./hud/nguiMaterialPipeline";
import { pixiFlashBlendMode } from "./pixiFlashBlend";

/** The Stage/TRSRoot child; layout is in original authored stage units. */
export class PixiStageLights {
  readonly root = new Container({ label: "StageBottomLights" });
  private readonly lights: readonly { sprite: Sprite; animation: StageLightAnimation }[];

  constructor(texture: Texture) {
    const sprite = (entry: (typeof layout.lights)[number]["color"], label: string) => {
      const value = new Sprite({ texture, label });
      value.anchor.set(0.5);
      value.position.set(entry.x, -entry.y);
      value.width = entry.width;
      value.height = entry.height;
      value.tint = linearTintFromSrgbChannels(entry.color[0]!, entry.color[1]!, entry.color[2]!);
      value.alpha = entry.color[3]!;
      value.blendMode = pixiFlashBlendMode(false);
      this.root.addChild(value);
      return value;
    };
    this.lights = layout.lights.map((entry) => {
      const color = sprite(entry.color, entry.path);
      sprite(entry.white, entry.path.replace("light_color", "light_white"));
      return { sprite: color, animation: new StageLightAnimation(entry) };
    });
  }

  advance(deltaSeconds: number): void {
    for (const light of this.lights) {
      light.animation.advance(deltaSeconds);
      const color = light.animation.color;
      light.sprite.tint = linearTintFromSrgbChannels(color[0]!, color[1]!, color[2]!);
      light.sprite.alpha = color[3]!;
    }
  }
}
