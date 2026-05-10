import type { Sprite } from "pixi.js";
import type { NoteSkinTextureBundle } from "../engine/assets";

interface ComboHudDrawContext {
  viewportWidth: number;
  viewportHeight: number;
  elapsedMs: number;
  combo: number;
  lastComboHitMs: number;
  textures: NoteSkinTextureBundle["hud"] | null;
  allocSprite: () => Sprite | null;
}

const COMBO_ORIGIN_X_RATIO = 0.85;
const COMBO_ORIGIN_Y_RATIO = 0.4375;
const COMBO_LABEL_HEIGHT_UNIT = 0.05;
const COMBO_LABEL_WIDTH_UNIT = (150 * COMBO_LABEL_HEIGHT_UNIT) / 41;
const COMBO_DIGIT_HEIGHT_UNIT = 0.125;
const COMBO_DIGIT_WIDTH_UNIT = 9 / 96;
const COMBO_LABEL_CENTER_Y_OFFSET_UNIT = (COMBO_DIGIT_HEIGHT_UNIT + COMBO_LABEL_HEIGHT_UNIT) * 0.5;

function comboPulseScale(elapsedSecSinceHit: number): number {
  if (!(elapsedSecSinceHit >= 0)) {
    return 1;
  }
  const we = -elapsedSecSinceHit;
  if (we < -0.2) {
    return 1;
  }
  if (we < -0.1) {
    return we + 1.2;
  }
  return 1.1 - 3 * (we + 0.1);
}

export function drawComboHud(context: ComboHudDrawContext): void {
  const combo = Math.max(0, Math.floor(context.combo));
  if (combo <= 0) {
    return;
  }

  const textures = context.textures;
  if (!textures) {
    return;
  }

  const pulseScale = comboPulseScale((context.elapsedMs - context.lastComboHitMs) / 1000);
  const unit = context.viewportHeight * pulseScale;
  if (!Number.isFinite(unit) || unit <= 0) {
    return;
  }

  const originX = context.viewportWidth * COMBO_ORIGIN_X_RATIO;
  const originY = context.viewportHeight * COMBO_ORIGIN_Y_RATIO;

  const labelTexture = textures.comboLabel;
  if (labelTexture) {
    const labelSprite = context.allocSprite();
    if (labelSprite) {
      labelSprite.texture = labelTexture;
      labelSprite.anchor.set(0.5, 0.5);
      labelSprite.x = originX;
      labelSprite.y = originY + unit * COMBO_LABEL_CENTER_Y_OFFSET_UNIT;
      labelSprite.alpha = 1;
      labelSprite.rotation = 0;
      labelSprite.width = unit * COMBO_LABEL_WIDTH_UNIT;
      labelSprite.height = unit * COMBO_LABEL_HEIGHT_UNIT;
    }
  }

  const comboText = String(combo);
  let slot = -comboText.length / 2;
  const digitWidth = unit * COMBO_DIGIT_WIDTH_UNIT;
  const digitHeight = unit * COMBO_DIGIT_HEIGHT_UNIT;

  for (const ch of comboText) {
    const digit = ch.charCodeAt(0) - 48;
    if (digit < 0 || digit > 9) {
      slot += 1;
      continue;
    }
    const digitTexture = textures.comboDigits[digit] ?? null;
    if (!digitTexture) {
      slot += 1;
      continue;
    }
    const digitSprite = context.allocSprite();
    if (!digitSprite) {
      return;
    }
    digitSprite.texture = digitTexture;
    digitSprite.anchor.set(0.5, 0.5);
    digitSprite.x = originX + (slot + 0.5) * digitWidth;
    digitSprite.y = originY;
    digitSprite.alpha = 1;
    digitSprite.rotation = 0;
    digitSprite.width = digitWidth;
    digitSprite.height = digitHeight;
    slot += 1;
  }
}
