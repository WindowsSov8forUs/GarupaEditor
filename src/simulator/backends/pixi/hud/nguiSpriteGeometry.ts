import type { Sprite } from "pixi.js";
import { nguiAlpha, nguiRgbTint } from "./nguiMaterialPipeline";

export interface NguiSpriteWidgetProfile {
  readonly width: number;
  readonly height: number;
  readonly pivot: "center" | "left";
  readonly colorF32Bits: readonly [string, string, string, string];
  readonly blendMode: "normal";
}

export function applyNguiSpriteWidget(
  sprite: Sprite,
  profile: NguiSpriteWidgetProfile,
): readonly [number, number] {
  sprite.anchor.set(profile.pivot === "left" ? 0 : 0.5, 0.5);
  sprite.width = profile.width;
  sprite.height = profile.height;
  const baseScale = Object.freeze([sprite.scale.x, sprite.scale.y] as const);
  sprite.tint = nguiRgbTint(profile.colorF32Bits);
  sprite.alpha = nguiAlpha(profile.colorF32Bits);
  sprite.blendMode = profile.blendMode;
  return baseScale;
}
