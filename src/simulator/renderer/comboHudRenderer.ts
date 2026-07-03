import type { Sprite } from "pixi.js";
import type { NoteSkinTextureBundle } from "../engine/assets";
import { evaluateRuntimeAnimationCurve, getRuntimeAnimationClipDurationMs } from "../engine/runtimeAnimationClip";
import {
  getLevel3NguiSpriteMetrics,
  getLevel3WidgetMetrics,
  projectNguiDisplayPoint,
  resolveNguiDrawingCenterOffset,
  resolveNguiDrawingRect,
  RHYTHM_UI_PATHS,
  sumLevel3LocalPositionBetween,
} from "../engine/uiHudLayout";

interface ComboHudDrawContext {
  viewportWidth: number;
  viewportHeight: number;
  elapsedMs: number;
  combo: number;
  lastComboHitMs: number;
  textures: NoteSkinTextureBundle["hud"] | null;
  allocSprite: () => Sprite | null;
}

const COMBO_NUMBER_CLIP_NAME = "combo_number";
const COMBO_NUMBER_CLIP_END_MS = getRuntimeAnimationClipDurationMs(COMBO_NUMBER_CLIP_NAME, 1000);
const COMBO_NUMBER_SCALE_X_CURVE_INDEX = 0;
const COMBO_DIGIT_SAMPLE_WIDGET = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.comboDigitSample);
const COMBO_UNIT_WIDGET = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.comboUnit);
const COMBO_UNIT_SPRITE = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.comboUnit);

function comboNumberClipScale(ageMs: number): number {
  if (!(ageMs >= 0) || ageMs > COMBO_NUMBER_CLIP_END_MS) {
    return 1;
  }
  return evaluateRuntimeAnimationCurve(COMBO_NUMBER_CLIP_NAME, COMBO_NUMBER_SCALE_X_CURVE_INDEX, ageMs, 1);
}

function resolveComboChildDisplayPoint(
  rootX: number,
  rootY: number,
  nodeScale: number,
  childOffset: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: rootX + (childOffset.x * nodeScale),
    y: rootY - (childOffset.y * nodeScale),
  };
}

function resolveComboDigitLocalX(
  index: number,
  digitCount: number,
  labelOffsetX: number,
  digitAdvanceNgui: number,
): number {
  const rightToLeftIndex = digitCount - 1 - index;
  return labelOffsetX
    + (((digitCount - 2) * digitAdvanceNgui) * 0.5)
    - (rightToLeftIndex * digitAdvanceNgui);
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
  const viewport = {
    width: context.viewportWidth,
    height: context.viewportHeight,
  };
  const comboNumberRootProjected = projectNguiDisplayPoint(
    sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.informationRoot, RHYTHM_UI_PATHS.comboNumberRoot),
    viewport,
  );
  const comboNumberLabelOffset = sumLevel3LocalPositionBetween(
    RHYTHM_UI_PATHS.comboNumberRoot,
    RHYTHM_UI_PATHS.comboNumberLabel,
  );
  const comboUnitOffset = sumLevel3LocalPositionBetween(
    RHYTHM_UI_PATHS.comboNumberRoot,
    RHYTHM_UI_PATHS.comboUnit,
  );
  const comboDigitSampleOffsets = RHYTHM_UI_PATHS.comboDigitSamples
    .slice(0, 2)
    .map((path) => sumLevel3LocalPositionBetween(RHYTHM_UI_PATHS.comboNumberLabel, path));
  const sampleDigitAdvance = Math.abs((comboDigitSampleOffsets[0]?.x ?? 0) - (comboDigitSampleOffsets[1]?.x ?? 0));
  const nguiScale = comboNumberRootProjected.scale;
  if (!Number.isFinite(nguiScale) || nguiScale <= 0) {
    return;
  }
  const nodeScale = nguiScale * clipScale;
  const rootX = comboNumberRootProjected.x;
  const rootY = comboNumberRootProjected.y;

  const labelTexture = textures.comboLabel;
  if (labelTexture) {
    const labelSprite = context.allocSprite();
    if (labelSprite) {
      const comboUnitDrawingRect = resolveNguiDrawingRect(
        COMBO_UNIT_WIDGET,
        COMBO_UNIT_SPRITE,
        { width: labelTexture.width, height: labelTexture.height },
      );
      const comboUnitDrawOffset = resolveNguiDrawingCenterOffset(COMBO_UNIT_WIDGET, comboUnitDrawingRect);
      const labelPoint = resolveComboChildDisplayPoint(rootX, rootY, nodeScale, {
        x: comboUnitOffset.x + comboUnitDrawOffset.x,
        y: comboUnitOffset.y + comboUnitDrawOffset.y,
      });
      labelSprite.texture = labelTexture;
      labelSprite.anchor.set(0.5, 0.5);
      labelSprite.x = labelPoint.x;
      labelSprite.y = labelPoint.y;
      labelSprite.alpha = 1;
      labelSprite.rotation = 0;
      labelSprite.width = comboUnitDrawingRect.width * nodeScale;
      labelSprite.height = comboUnitDrawingRect.height * nodeScale;
    }
  }

  const comboText = String(combo);
  const comboAtlas = textures.comboAtlas;
  const digitSourceHeight = Math.max(1, comboAtlas.digitHeight);
  const digitScale = (COMBO_DIGIT_SAMPLE_WIDGET.height * nodeScale) / digitSourceHeight;
  const digitWidth = comboAtlas.digitWidth * digitScale;
  const digitHeight = COMBO_DIGIT_SAMPLE_WIDGET.height * nodeScale;
  const digitAdvanceNgui = sampleDigitAdvance > 0 ? sampleDigitAdvance : comboAtlas.digitWidth + comboAtlas.padding;

  for (let index = 0; index < comboText.length; index += 1) {
    const ch = comboText[index];
    const digit = ch.charCodeAt(0) - 48;
    if (digit < 0 || digit > 9) {
      continue;
    }
    const digitTexture = comboAtlas.normalDigits[digit] ?? textures.comboDigits[digit] ?? null;
    if (!digitTexture) {
      continue;
    }
    const digitSprite = context.allocSprite();
    if (!digitSprite) {
      return;
    }
    // UISpriteNumber stores prefab children from low digit to high digit
    // (`num` is the rightmost digit in the serialized 456 sample). Runtime
    // text is drawn left to right here, so use align=Center plus padding=-12
    // instead of applying the prefab child order directly.
    const digitLocalX = resolveComboDigitLocalX(
      index,
      comboText.length,
      comboNumberLabelOffset.x,
      digitAdvanceNgui,
    );
    const digitLocalY = comboNumberLabelOffset.y;
    const digitPoint = resolveComboChildDisplayPoint(rootX, rootY, nodeScale, { x: digitLocalX, y: digitLocalY });
    digitSprite.texture = digitTexture;
    digitSprite.anchor.set(0.5, 0.5);
    digitSprite.x = digitPoint.x;
    digitSprite.y = digitPoint.y;
    digitSprite.alpha = 1;
    digitSprite.rotation = 0;
    digitSprite.width = digitWidth;
    digitSprite.height = digitHeight;
  }
}
