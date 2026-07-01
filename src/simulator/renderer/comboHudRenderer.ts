import type { Sprite } from "pixi.js";
import type { NoteSkinTextureBundle } from "../engine/assets";
import { projectNguiDisplayPoint, RHYTHM_HUD_ANCHORS, RHYTHM_HUD_WIDGETS } from "../engine/uiHudLayout";

interface ComboHudDrawContext {
  viewportWidth: number;
  viewportHeight: number;
  elapsedMs: number;
  combo: number;
  lastComboHitMs: number;
  textures: NoteSkinTextureBundle["hud"] | null;
  allocSprite: () => Sprite | null;
}

const COMBO_NUMBER_CLIP_END_MS = 1000;
// Source: AnimationClip combo_number streamed keyframes in
// HOST________/VSCode/bangdream-apk/reverse/analysis/targets/runtime-ui-binding-report.*.
const COMBO_NUMBER_CLIP_POP_MS = 1000 / 12;
const COMBO_NUMBER_CLIP_SETTLE_MS = 1000 / 6;
function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, t));
}

function comboNumberClipScale(ageMs: number): number {
  if (!(ageMs >= 0) || ageMs > COMBO_NUMBER_CLIP_END_MS) {
    return 1;
  }
  if (ageMs <= COMBO_NUMBER_CLIP_POP_MS) {
    return lerp(0.8, 1.1, ageMs / COMBO_NUMBER_CLIP_POP_MS);
  }
  if (ageMs <= COMBO_NUMBER_CLIP_SETTLE_MS) {
    return lerp(1.1, 1.0, (ageMs - COMBO_NUMBER_CLIP_POP_MS) / (COMBO_NUMBER_CLIP_SETTLE_MS - COMBO_NUMBER_CLIP_POP_MS));
  }
  return 1;
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

  const clipScale = comboNumberClipScale(context.elapsedMs - context.lastComboHitMs);
  const numberProjected = projectNguiDisplayPoint(RHYTHM_HUD_ANCHORS.comboNumberLabel, {
    width: context.viewportWidth,
    height: context.viewportHeight,
  });
  const unitProjected = projectNguiDisplayPoint(RHYTHM_HUD_ANCHORS.comboUnit, {
    width: context.viewportWidth,
    height: context.viewportHeight,
  });
  const nguiScale = numberProjected.scale;
  if (!Number.isFinite(nguiScale) || nguiScale <= 0) {
    return;
  }

  const originX = numberProjected.x;
  const originY = numberProjected.y;

  const labelTexture = textures.comboLabel;
  if (labelTexture) {
    const labelSprite = context.allocSprite();
    if (labelSprite) {
      labelSprite.texture = labelTexture;
      labelSprite.anchor.set(0.5, 0.5);
      labelSprite.x = unitProjected.x;
      labelSprite.y = unitProjected.y;
      labelSprite.alpha = 1;
      labelSprite.rotation = 0;
      labelSprite.width = RHYTHM_HUD_WIDGETS.comboUnit.width * nguiScale * clipScale;
      labelSprite.height = RHYTHM_HUD_WIDGETS.comboUnit.height * nguiScale * clipScale;
    }
  }

  const comboText = String(combo);
  const comboAtlas = textures.comboAtlas;
  const digitSourceHeight = Math.max(1, comboAtlas.digitHeight);
  const digitScale = (RHYTHM_HUD_WIDGETS.comboDigit.height * nguiScale * clipScale) / digitSourceHeight;
  const digitWidth = comboAtlas.digitWidth * digitScale;
  const digitHeight = RHYTHM_HUD_WIDGETS.comboDigit.height * nguiScale * clipScale;
  const digitAdvanceNgui = comboAtlas.digitWidth + comboAtlas.padding;
  const digitAdvance = digitAdvanceNgui * nguiScale * clipScale;
  // UISpriteNumber.SetNumber arrangeType=0 lays out digits from the ones place
  // leftward, then align=1 shifts all populated digits by totalWidth * 0.5.
  const totalWidth = comboText.length * digitAdvance;
  let digitX = originX - (totalWidth * 0.5);

  for (const ch of comboText) {
    const digit = ch.charCodeAt(0) - 48;
    if (digit < 0 || digit > 9) {
      digitX += digitAdvance;
      continue;
    }
    const digitTexture = comboAtlas.normalDigits[digit] ?? textures.comboDigits[digit] ?? null;
    if (!digitTexture) {
      digitX += digitAdvance;
      continue;
    }
    const digitSprite = context.allocSprite();
    if (!digitSprite) {
      return;
    }
    digitSprite.texture = digitTexture;
    digitSprite.anchor.set(0.5, 0.5);
    digitSprite.x = digitX;
    digitSprite.y = originY;
    digitSprite.alpha = 1;
    digitSprite.rotation = 0;
    digitSprite.width = digitWidth;
    digitSprite.height = digitHeight;
    digitX += digitAdvance;
  }
}
