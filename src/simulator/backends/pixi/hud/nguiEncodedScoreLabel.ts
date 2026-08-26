import { Text } from "pixi.js";

export interface NguiEncodedScoreLabelLayout {
  readonly displayed: string;
  readonly leading: string;
  readonly significant: string;
  readonly fontSize: number;
  readonly totalWidth: number;
  readonly leadingWidth: number;
  readonly significantWidth: number;
}

const SCORE_ADVANCE_PER_FONT_SIZE = Math.fround(0.75);

/** Current 10.1.4 sgm UILabel component 1271: one owner with two NGUI color runs. */
export function layoutNguiEncodedScoreLabel(
  segments: readonly [Text, Text],
  score: number,
  rightX: number,
  centerY: number,
  maximumWidth: number,
  requestedFontSize: number,
  fontFamily: string,
  depth: number,
): NguiEncodedScoreLabelLayout {
  const significant = String(score);
  const leading = "0".repeat(Math.max(8 - significant.length, 0));
  const displayed = `${leading}${significant}`;
  let fontSize = requestedFontSize;
  while (fontSize > 0 && scoreRunWidth(displayed.length, fontSize) > maximumWidth) {
    fontSize -= 1;
  }
  const leadingWidth = scoreRunWidth(leading.length, fontSize);
  const significantWidth = scoreRunWidth(significant.length, fontSize);
  const totalWidth = Math.fround(leadingWidth + significantWidth);
  configureSegment(segments[0], leading, 0xbebebe, fontSize, fontFamily, depth);
  configureSegment(segments[1], significant, 0xff3b72, fontSize, fontFamily, depth);
  segments[0].position.set(Math.fround(rightX - totalWidth), centerY);
  segments[1].position.set(Math.fround(rightX - significantWidth), centerY);
  segments[0].visible = leading.length > 0;
  segments[1].visible = true;
  return Object.freeze({
    displayed,
    leading,
    significant,
    fontSize,
    totalWidth,
    leadingWidth,
    significantWidth,
  });
}

function scoreRunWidth(length: number, fontSize: number): number {
  return Math.fround(Math.fround(length * fontSize) * SCORE_ADVANCE_PER_FONT_SIZE);
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
    fill,
    fontFamily,
    fontSize,
    fontStyle: "normal",
    fontWeight: "normal",
  };
  text.anchor.set(0, 0.5);
  text.alpha = 1;
  text.tint = 0xffffff;
  text.zIndex = depth;
}
