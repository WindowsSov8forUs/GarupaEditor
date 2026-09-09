import { Text } from "pixi.js";
import { linearTintFromSrgbColor } from "./nguiMaterialPipeline";

// UILabel 1271 serialized spacingX; Reverse 7bb802512c7607a3740e3a9f6bb7ab9b09036043.
const SCORE_LABEL_SPACING_X = 1;

export interface NguiEncodedScoreLabelLayout {
  readonly displayed: string;
  readonly leading: string;
  readonly significant: string;
  readonly fontSize: number;
  readonly fontScale: number;
  readonly totalWidth: number;
  readonly leadingWidth: number;
  readonly significantWidth: number;
  readonly glyphAdvances: readonly number[];
}

/** Current UILabel 1271: color boundaries preserve the continuous glyph-spacing run. */
export function layoutNguiEncodedScoreLabel(
  segments: readonly Text[],
  encodedText: string | number,
  rightX: number,
  centerY: number,
  maximumWidth: number,
  requestedFontSize: number,
  fontFamily: string,
  depth: number,
): NguiEncodedScoreLabelLayout {
  if (typeof encodedText !== "string") throw new Error("Score label requires encoded text.");
  const parsed = parseEncodedScoreText(encodedText);
  if (segments.length < parsed.displayed.length) throw new Error("Score glyph pool is too small.");
  const advances: Record<string, number> = {};
  for (let index = 0; index < parsed.displayed.length; index += 1) {
    const glyph = segments[index]!;
    const char = parsed.displayed[index]!;
    configureSegment(glyph, char, index < parsed.leading.length ? 0xbebebe : 0xff3b72,
      requestedFontSize, fontFamily, depth);
    glyph.scale.set(1);
    advances[char] = glyph.width;
  }
  const calculated = calculateNguiEncodedScoreLabelLayout(
    encodedText, maximumWidth, requestedFontSize, advances,
  );
  const { displayed, fontScale, totalWidth, glyphAdvances } = calculated;
  let cursor = rightX - totalWidth;
  for (let index = 0; index < segments.length; index += 1) {
    const glyph = segments[index]!;
    const char = displayed[index];
    if (char === undefined) {
      glyph.visible = false;
      continue;
    }
    glyph.scale.set(fontScale);
    glyph.position.set(cursor, centerY);
    glyph.visible = true;
    cursor += glyphAdvances[index]!;
  }
  return calculated;
}

/** Fit the measured host glyph run; no original font-cache or platform crispness policy. */
export function calculateNguiEncodedScoreLabelLayout(
  encodedText: string,
  maximumWidth: number,
  fontSize: number,
  measuredAdvances: Readonly<Record<string, number>>,
): NguiEncodedScoreLabelLayout {
  const parsed = parseEncodedScoreText(encodedText);
  const advances = [...parsed.displayed].map((char) => {
    const value = measuredAdvances[char];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Score label has no measured font advance for ${char}.`);
    }
    return value + SCORE_LABEL_SPACING_X;
  });
  const unscaledWidth = advances.reduce((sum, value) => sum + value, 0) - SCORE_LABEL_SPACING_X;
  if (!(maximumWidth > 0) || !Number.isFinite(maximumWidth)) throw new Error("Score label requires positive finite width.");
  const fontScale = Math.min(1, maximumWidth / unscaledWidth);
  const glyphAdvances = advances.map((value) => value * fontScale);
  const totalWidth = unscaledWidth * fontScale;
  const leadingWidth = glyphAdvances.slice(0, parsed.leading.length).reduce((sum, value) => sum + value, 0);
  return Object.freeze({ ...parsed, fontSize, fontScale, totalWidth, leadingWidth,
    significantWidth: totalWidth - leadingWidth, glyphAdvances: Object.freeze(glyphAdvances) });
}

export function parseEncodedScoreText(encodedText: string): {
  readonly displayed: string;
  readonly leading: string;
  readonly significant: string;
} {
  const match = /^\[BEBEBE\](0*)\[-\]\[FF3B72\]([0-9]+)\[-\]$/.exec(encodedText);
  if (match === null) throw new Error("Score UILabel requires the exact two-run encoded score string.");
  return Object.freeze({ leading: match[1]!, significant: match[2]!, displayed: `${match[1]}${match[2]}` });
}

function configureSegment(
  text: Text,
  value: string,
  fill: number,
  fontSize: number,
  fontFamily: string,
  depth: number,
): void {
  text.text = value;
  text.style = {
    fill: linearTintFromSrgbColor(fill),
    fontFamily,
    fontSize,
    fontStyle: "normal",
    fontWeight: "normal",
    letterSpacing: 0,
  };
  text.anchor.set(0, 0.5);
  text.alpha = 1;
  text.tint = 0xffffff;
  text.zIndex = depth;
}
