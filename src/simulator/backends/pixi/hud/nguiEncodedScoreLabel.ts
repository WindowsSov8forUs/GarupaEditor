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
  metricsByFontSize?: Readonly<Record<string, Readonly<Record<string, number>>>>,
): NguiEncodedScoreLabelLayout {
  if (metricsByFontSize === undefined || typeof encodedText !== "string") {
    throw new Error("Score UILabel source-bound encoded text/CharacterInfo metrics are missing.");
  }
  const calculated = calculateNguiEncodedScoreLabelLayout(
    encodedText, maximumWidth, requestedFontSize, metricsByFontSize,
  );
  const { leading, displayed, fontSize, fontScale, totalWidth, glyphAdvances } = calculated;
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
    glyph.scale.set(fontScale);
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
  const fontSize = requestedFontSize;
  let candidate = requestedFontSize;
  let fontScale = Math.fround(1);
  // Android OnDesktop is non-crisp: retain the requested glyph and scale it.
  // WrapText includes trailing spacing in its fit test; failed candidates step by two.
  // Reverse 900c6d7d979f534ba2bc19c846609aea907f2d70.
  while (candidate > 0) {
    fontScale = Math.fround(candidate / requestedFontSize);
    if (runAdvance(parsed.displayed, fontSize, fontScale, metricsByFontSize) <= maximumWidth) break;
    candidate -= 2;
  }
  if (candidate <= 0) throw new Error("Score UILabel source metrics cannot fit the encoded digit run.");
  const spacing = Math.fround(SCORE_LABEL_SPACING_X * fontScale);
  const leadingWidth = runAdvance(parsed.leading, fontSize, fontScale, metricsByFontSize);
  const significantWidth = Math.fround(runAdvance(parsed.significant, fontSize, fontScale, metricsByFontSize) - spacing);
  const totalWidth = Math.ceil(Math.fround(runAdvance(parsed.displayed, fontSize, fontScale, metricsByFontSize) - spacing));
  return Object.freeze({
    ...parsed,
    fontSize,
    fontScale,
    totalWidth,
    leadingWidth,
    significantWidth,
    glyphAdvances: Object.freeze([...parsed.displayed].map((char) =>
      glyphAdvance(char, fontSize, fontScale, metricsByFontSize))),
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

function runAdvance(
  value: string,
  fontSize: number,
  fontScale: number,
  metricsByFontSize: Readonly<Record<string, Readonly<Record<string, number>>>>,
): number {
  let width = Math.fround(0);
  for (const char of value) {
    const advance = glyphAdvance(char, fontSize, fontScale, metricsByFontSize);
    width = Math.fround(width + advance);
  }
  return width;
}

function glyphAdvance(
  char: string,
  fontSize: number,
  fontScale: number,
  metricsByFontSize: Readonly<Record<string, Readonly<Record<string, number>>>>,
): number {
  const advance = Math.fround(metric(char, fontSize, metricsByFontSize) * fontScale);
  const spacing = Math.fround(SCORE_LABEL_SPACING_X * fontScale);
  return Math.fround(advance + spacing);
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
