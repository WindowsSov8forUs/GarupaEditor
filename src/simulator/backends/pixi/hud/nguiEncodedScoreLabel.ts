import { Text } from "pixi.js";
import { linearTintFromSrgbColor } from "./nguiMaterialPipeline";

// UILabel 1271 serialized spacingX; Reverse 7bb802512c7607a3740e3a9f6bb7ab9b09036043.
const SCORE_LABEL_SPACING_X = 1;

export interface NguiEncodedScoreLabelLayout {
  readonly displayed: string;
  readonly leading: string;
  readonly significant: string;
  readonly fontSize: number;
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
  metricsByFontSize?: Readonly<Record<string, Readonly<Record<string, number>>>>,
): NguiEncodedScoreLabelLayout {
  if (metricsByFontSize === undefined || typeof encodedText !== "string") {
    throw new Error("Score UILabel source-bound encoded text/CharacterInfo metrics are missing.");
  }
  const calculated = calculateNguiEncodedScoreLabelLayout(
    encodedText, maximumWidth, requestedFontSize, metricsByFontSize,
  );
  const { leading, displayed, fontSize, totalWidth, glyphAdvances } = calculated;
  if (segments.length < displayed.length) throw new Error("Score UILabel persistent glyph pool is too small.");
  let cursor = Math.fround(rightX - totalWidth);
  for (let index = 0; index < segments.length; index += 1) {
    const glyph = segments[index]!;
    const char = displayed[index];
    if (char === undefined) {
      glyph.visible = false;
      continue;
    }
    configureSegment(glyph, char, index < leading.length ? 0xbebebe : 0xff3b72, fontSize, fontFamily, depth);
    glyph.position.set(cursor, centerY);
    glyph.visible = true;
    cursor = Math.fround(cursor + glyphAdvances[index]!);
  }
  return calculated;
}

export function calculateNguiEncodedScoreLabelLayout(
  encodedText: string,
  maximumWidth: number,
  requestedFontSize: number,
  metricsByFontSize: Readonly<Record<string, Readonly<Record<string, number>>>>,
): NguiEncodedScoreLabelLayout {
  const parsed = parseEncodedScoreText(encodedText);
  let fontSize = requestedFontSize;
  while (fontSize > 0 && runWidth(parsed.displayed, fontSize, metricsByFontSize) > maximumWidth) fontSize -= 1;
  if (fontSize <= 0) throw new Error("Score UILabel source metrics cannot fit the encoded digit run.");
  const leadingWidth = parsed.leading.length === 0 ? 0
    : Math.fround(runWidth(parsed.leading, fontSize, metricsByFontSize) + SCORE_LABEL_SPACING_X);
  const significantWidth = runWidth(parsed.significant, fontSize, metricsByFontSize);
  const totalWidth = Math.ceil(runWidth(parsed.displayed, fontSize, metricsByFontSize));
  return Object.freeze({
    ...parsed,
    fontSize,
    totalWidth,
    leadingWidth,
    significantWidth,
    glyphAdvances: Object.freeze([...parsed.displayed].map((char) =>
      Math.fround(metric(char, fontSize, metricsByFontSize) + SCORE_LABEL_SPACING_X))),
  });
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

function runWidth(
  value: string,
  fontSize: number,
  metricsByFontSize: Readonly<Record<string, Readonly<Record<string, number>>>>,
): number {
  let width = Math.fround(0);
  for (const char of value) {
    const advance = Math.fround(metric(char, fontSize, metricsByFontSize) + SCORE_LABEL_SPACING_X);
    width = Math.fround(width + advance);
  }
  return value.length === 0 ? 0 : Math.fround(width - SCORE_LABEL_SPACING_X);
}

function metric(
  char: string,
  fontSize: number,
  metricsByFontSize: Readonly<Record<string, Readonly<Record<string, number>>>>,
): number {
  const value = metricsByFontSize[String(fontSize)]?.[char];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Score UILabel has no source-bound CharacterInfo advance for ${char}@${fontSize}.`);
  }
  return Math.fround(value);
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
