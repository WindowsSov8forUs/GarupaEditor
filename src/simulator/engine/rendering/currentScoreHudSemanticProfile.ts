import type { RenderAtlasRow } from "../../backends/renderingContracts";

const digitGlyphs = Object.freeze([
  glyph("0", 92, 40, 40, 28, 2, 0, 36),
  glyph("1", 138, 130, 17, 28, 0, 0, 11),
  glyph("2", 43, 100, 37, 28, 2, 0, 33),
  glyph("3", 82, 100, 37, 28, 2, 0, 33),
  glyph("4", 121, 100, 37, 28, 2, 0, 33),
  glyph("5", 160, 100, 37, 28, 2, 0, 33),
  glyph("6", 199, 100, 37, 28, 2, 0, 33),
  glyph("7", 432, 100, 31, 28, 2, 0, 27),
  glyph("8", 263, 130, 37, 27, 2, 1, 33),
  glyph("9", 238, 100, 37, 28, 2, 0, 33),
]);

export interface ScoreHudBitmapGlyph {
  readonly exactKey: string;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly xAdvance: number;
}

export const CURRENT_SCORE_HUD_BITMAP_GLYPHS: readonly ScoreHudBitmapGlyph[] =
  Object.freeze(digitGlyphs.map((row) => Object.freeze({
    exactKey: row.exactKey,
    xOffset: row.xOffset,
    yOffset: row.yOffset,
    xAdvance: row.xAdvance,
  })));

export const CURRENT_SCORE_HUD_NINE_SLICE_BORDERS = Object.freeze({
  gaugeBase: pixiBorderFromUnity(216, 16, 0, 0),
  gaugeCover: pixiBorderFromUnity(8, 8, 8, 8),
  meterBlue: pixiBorderFromUnity(4, 4, 3, 3),
  meterOther: pixiBorderFromUnity(5, 5, 0, 0),
  meterS: pixiBorderFromUnity(0, 0, 0, 0),
  rehearsalTime: pixiBorderFromUnity(6, 6, 6, 6),
  autoLiveCaption: pixiBorderFromUnity(25, 25, 0, 0),
});

export const CURRENT_SCORE_HUD_SCENE_PROFILE = Object.freeze({
  rootLocalPosition: Object.freeze([-411, 309] as const),
  totalScoreLocalPosition: Object.freeze([212, -84] as const),
  totalScoreWidgetWidth: 188,
  totalScorePivot: "right" as const,
  totalScoreFontSize: 28,
  bmFontLineHeight: 36,
  scoreMinimumDigits: 8,
  scoreLeadingColor: 0xbebebe,
  scoreSignificantColor: 0xff3b72,
  totalScoreDepth: 40,
  progressLocalPosition: Object.freeze([25, -45] as const),
  gauge: Object.freeze({
    background: Object.freeze({ position: Object.freeze([0, -23] as const), width: 470, height: 82, depth: 4 }),
    cover: Object.freeze({ position: Object.freeze([38, -1] as const), width: 427, height: 33, depth: 28 }),
    foreground: Object.freeze({ position: Object.freeze([41, -1] as const), width: 421, height: 24, depth: 5 }),
    markerDepth: 29,
    indicatorMaximumX: 422,
    highRankPanel: Object.freeze({
      targetLeftX: 38,
      leftAbsolute: 4,
      bottomY: -25.5,
      topY: 13.5,
      minimumWidth: 2,
      softness: Object.freeze([20, 3] as const),
    }),
  }),
  rankRoots: Object.freeze([
    Object.freeze({ rank: "C", x: 50 }),
    Object.freeze({ rank: "B", x: 100 }),
    Object.freeze({ rank: "A", x: 150 }),
    Object.freeze({ rank: "S", x: 200 }),
    Object.freeze({ rank: "SS", x: 420 }),
  ]),
  highRankEffect: Object.freeze({ clip: "ScoreGaugeSS", durationSeconds: 3, loop: true }),
});

function glyph(
  exactKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
  xOffset: number,
  yOffset: number,
  xAdvance: number,
) {
  return Object.freeze({
    ...atlas(exactKey, x, y, width, height),
    xOffset,
    yOffset,
    xAdvance,
  });
}

function atlas(
  exactKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
  border: readonly [number, number, number, number] = [0, 0, 0, 0],
): RenderAtlasRow {
  return Object.freeze({
    exactKey, x, y, width, height, pivotX: 0, pivotY: 0, pixelsPerUnit: 100,
    borderLeft: border[0], borderRight: border[1], borderTop: border[2], borderBottom: border[3],
  });
}

function pixiBorderFromUnity(
  left: number,
  bottom: number,
  right: number,
  top: number,
) {
  return Object.freeze({ left, top, right, bottom });
}
