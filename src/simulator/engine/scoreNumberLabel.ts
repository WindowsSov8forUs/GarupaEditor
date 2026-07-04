import type { NguiFontMetricApproximation } from "./nguiFontMetrics";

export type ScoreNumberLabelRunKind = "leadingZero" | "actualDigit";
export type ScoreNumberLabelAlignment = "Center" | "Right";
export type ScoreNumberLabelOverflow = "ShrinkContent";

export interface ScoreNumberLabelColorRun {
  kind: ScoreNumberLabelRunKind;
  text: string;
  color: string;
}

export interface ScoreNumberLabelNguiState {
  fontSize: number;
  effectiveFontSize: number;
  fontStyle: "Normal";
  alignment: ScoreNumberLabelAlignment;
  rectWidth: number;
  rectHeight: number;
  spacingX: number;
  spacingY: number;
  calculatedSize: {
    x: number;
    y: number;
  };
  applyOffset: {
    x: number;
    y: number;
  };
  baseline: number;
  finalLineHeight: number;
  runs: readonly ScoreNumberLabelColorRun[];
}

export interface ScoreNumberLabelModel {
  path: "GamePlay/UI_Root/Display/Score/Base/TotalScore";
  mText: string;
  mShouldBeProcessed: boolean;
  mFontSize: number;
  mFontStyle: "Normal";
  mAlignment: "Automatic";
  effectiveAlignment: ScoreNumberLabelAlignment;
  mEncoding: true;
  mOverflow: ScoreNumberLabelOverflow;
  mEffectStyle: "None";
  mSpacingX: 1;
  mSpacingY: 0;
  pivot: "Right";
  pivotOffset: {
    x: 1;
    y: 0.5;
  };
  mFont: {
    fileID: 16;
    pathID: 1799;
  };
  rectWidth: 188;
  rectHeight: 204;
  processed: ScoreNumberLabelNguiState | null;
}

interface CanvasMeasureContext {
  font: string;
  measureText(text: string): TextMetrics;
}

interface CanvasDrawContext extends CanvasMeasureContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  textBaseline: CanvasTextBaseline;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
}

export const SCORE_NUMBER_LABEL_FONT_FAMILY =
  "\"TTShinGoM\", \"ChartUI\", \"Microsoft YaHei UI\", sans-serif";
export const SCORE_NUMBER_LABEL_MAX_DIGIT = 8;
export const SCORE_NUMBER_LABEL_ZERO_BBCODE = "D2D2D2";
export const SCORE_NUMBER_LABEL_DIGIT_BBCODE = "FF3B72";
export const SCORE_NUMBER_LABEL_ZERO_COLOR = `#${SCORE_NUMBER_LABEL_ZERO_BBCODE}`;
export const SCORE_NUMBER_LABEL_DIGIT_COLOR = `#${SCORE_NUMBER_LABEL_DIGIT_BBCODE}`;

// Source: score-number-label-score1327-bindings-raw.json and
// score-number-label-uilabel1271-raw.json. Score.totalScoreLabel binds to
// UILabel 1271 (Score/Base/TotalScore). UILabel 1271 raw fields:
// mFontSize=28, mAlignment=Automatic with pivot Right -> effective Right,
// mEncoding=true, mOverflow=ShrinkContent, mEffectStyle=None, mSpacingX/Y=1/0,
// width/height 188/204, mFont fileID=16,pathID=1799. Unity native dynamic
// glyph metrics are not closed by IL2CPP decompilation and are handled below
// only as a TTF/font-data approximation.
export function createScoreNumberLabelModel(): ScoreNumberLabelModel {
  return {
    path: "GamePlay/UI_Root/Display/Score/Base/TotalScore",
    mText: "10000000",
    mShouldBeProcessed: true,
    mFontSize: 28,
    mFontStyle: "Normal",
    mAlignment: "Automatic",
    effectiveAlignment: "Right",
    mEncoding: true,
    mOverflow: "ShrinkContent",
    mEffectStyle: "None",
    mSpacingX: 1,
    mSpacingY: 0,
    pivot: "Right",
    pivotOffset: {
      x: 1,
      y: 0.5,
    },
    mFont: {
      fileID: 16,
      pathID: 1799,
    },
    rectWidth: 188,
    rectHeight: 204,
    processed: null,
  };
}

// Simulator guard only: the recovered Score display path receives the game's
// non-negative total score. IL2CPP evidence is not used here to define negative
// or non-finite display behavior.
function normalizeSimulatorScoreInput(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.floor(score));
}

// Source: score-number-label-current.md. Score.UpdateView,
// Score.UpdateTotalScore, and InGamePlayDisplay.UpdateScoreView call
// StringUtility.ZeroFilledNumberString(sb, total, 8, Gray(2), Pink(0)).
export function formatScoreNumberLabelNguiText(score: number): string {
  const normalized = normalizeSimulatorScoreInput(score);
  const actualDigits = String(normalized);
  const leadingZeroCount = Math.max(0, SCORE_NUMBER_LABEL_MAX_DIGIT - actualDigits.length);
  return `[${SCORE_NUMBER_LABEL_ZERO_BBCODE}]${"0".repeat(leadingZeroCount)}[-]`
    + `[${SCORE_NUMBER_LABEL_DIGIT_BBCODE}]${actualDigits}[-]`;
}

// Source: UILabel.set_text in score-number-label-current.md. The setter
// normalizes null to an empty string, returns early when text is unchanged,
// otherwise writes mText and marks the label for ProcessAndRequest.
export function setScoreNumberLabelText(label: ScoreNumberLabelModel, text: string | null): boolean {
  const nextText = text ?? "";
  if (label.mText === nextText) {
    return false;
  }
  label.mText = nextText;
  label.mShouldBeProcessed = true;
  return true;
}

// Browser canvas backend glue: when the TTF file or font metric approximation
// becomes available, the recovered UILabel text has not changed, but the
// simulator must re-run its ProcessText substitute against the new metric
// source. This is not a separate IL2CPP label method.
export function requestScoreNumberLabelProcess(label: ScoreNumberLabelModel): void {
  label.mShouldBeProcessed = true;
}

function runKindForColor(color: string): ScoreNumberLabelRunKind {
  return color.toUpperCase() === SCORE_NUMBER_LABEL_ZERO_COLOR ? "leadingZero" : "actualDigit";
}

function pushRun(runs: ScoreNumberLabelColorRun[], color: string, text: string): void {
  if (text.length === 0) {
    return;
  }
  const previous = runs[runs.length - 1];
  if (previous && previous.color === color) {
    previous.text += text;
    return;
  }
  runs.push({
    kind: runKindForColor(color),
    text,
    color,
  });
}

// Source: NGUIText rich-text path reached from UILabel.ProcessText with
// mEncoding=true. This minimal parser covers the recovered score string's
// [D2D2D2], [FF3B72], and [-] tags; tags are state changes, not glyphs.
export function parseScoreNumberLabelRichText(text: string): readonly ScoreNumberLabelColorRun[] {
  const runs: ScoreNumberLabelColorRun[] = [];
  let index = 0;
  let currentColor = SCORE_NUMBER_LABEL_DIGIT_COLOR;

  while (index < text.length) {
    if (text.startsWith("[-]", index)) {
      index += 3;
      continue;
    }
    const colorMatch = /^\[([0-9a-fA-F]{6})\]/.exec(text.slice(index));
    if (colorMatch) {
      currentColor = `#${colorMatch[1].toUpperCase()}`;
      index += colorMatch[0].length;
      continue;
    }
    pushRun(runs, currentColor, text[index] ?? "");
    index += 1;
  }

  return runs;
}

function setContextFont(context: CanvasMeasureContext, fontSize: number): void {
  context.font = `${fontSize}px ${SCORE_NUMBER_LABEL_FONT_FAMILY}`;
}

function glyphCount(runs: readonly ScoreNumberLabelColorRun[]): number {
  return runs.reduce((sum, run) => sum + run.text.length, 0);
}

function measureGlyph(
  context: CanvasMeasureContext,
  metrics: NguiFontMetricApproximation | null,
  char: string,
  fontSize: number,
): number {
  const metricAdvance = metrics?.resolveGlyphAdvance(char, fontSize);
  if (metricAdvance !== undefined && metricAdvance > 0) {
    return metricAdvance;
  }
  return context.measureText(char).width;
}

function measureRuns(
  context: CanvasMeasureContext,
  metrics: NguiFontMetricApproximation | null,
  runs: readonly ScoreNumberLabelColorRun[],
  fontSize: number,
  spacingX: number,
): number {
  const textWidth = runs.reduce((sum, run) => {
    let runWidth = 0;
    for (const char of run.text) {
      runWidth += measureGlyph(context, metrics, char, fontSize);
    }
    return sum + runWidth;
  }, 0);
  return textWidth + (Math.max(0, glyphCount(runs) - 1) * spacingX);
}

function roundToNearestEven(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) {
    return floor;
  }
  if (fraction > 0.5) {
    return floor + 1;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

function resolveShrinkContentFontSize(
  context: CanvasMeasureContext | null,
  metrics: NguiFontMetricApproximation | null,
  runs: readonly ScoreNumberLabelColorRun[],
  rectWidth: number,
  fontSize: number,
  spacingX: number,
): number {
  if (!context || rectWidth <= 0) {
    return fontSize;
  }

  for (let candidate = fontSize; candidate > 1; candidate -= 1) {
    setContextFont(context, candidate);
    if (measureRuns(context, metrics, runs, candidate, spacingX) <= rectWidth) {
      return candidate;
    }
  }
  return 1;
}

// Source: UILabel.ApplyOffset in
// reverse/ghidra/decompilations/ghidra-decompile-ngui-label-text/
// UILabel$$ApplyOffset__UILabel$$ApplyOffset.c. The recovered NGUI formula is
// equivalent to:
//   x = round(-pivotOffset.x * width)
//   y = round(mCalculatedSize.y * (1 - pivotOffset.y))
// The round mode matches the observed Mathf.RoundToInt half-to-even path.
function resolveScoreNumberLabelApplyOffset(
  rectWidth: number,
  calculatedHeight: number,
  pivotOffset: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: roundToNearestEven(-pivotOffset.x * rectWidth),
    y: roundToNearestEven(calculatedHeight * (1 - pivotOffset.y)),
  };
}

// Source: UILabel.ProcessAndRequest -> ProcessText -> UpdateNGUIText /
// NGUIText.Update. The state fields mirror the recovered UILabel 1271 fields.
// Boundary: glyph widths and baseline use browser/TTF font data as a documented
// approximation to Unity native Font.RequestCharactersInTexture/GetCharacterInfo.
export function processScoreNumberLabel(
  label: ScoreNumberLabelModel,
  metrics: NguiFontMetricApproximation | null,
  measureContext: CanvasMeasureContext | null = null,
): ScoreNumberLabelNguiState {
  if (!label.mShouldBeProcessed && label.processed) {
    return label.processed;
  }

  const runs = label.mEncoding
    ? parseScoreNumberLabelRichText(label.mText)
    : [{ kind: "actualDigit" as const, text: label.mText, color: SCORE_NUMBER_LABEL_DIGIT_COLOR }];
  const effectiveFontSize = label.mOverflow === "ShrinkContent"
    ? resolveShrinkContentFontSize(measureContext, metrics, runs, label.rectWidth, label.mFontSize, label.mSpacingX)
    : label.mFontSize;
  const finalLineHeight = (metrics?.resolvePrintedLineHeight(effectiveFontSize) ?? effectiveFontSize) + label.mSpacingY;
  const calculatedSize = {
    x: measureContext ? measureRuns(measureContext, metrics, runs, effectiveFontSize, label.mSpacingX) : 0,
    y: finalLineHeight,
  };
  const applyOffset = resolveScoreNumberLabelApplyOffset(label.rectWidth, calculatedSize.y, label.pivotOffset);
  const nguiBaseline = metrics?.resolveBaseline(effectiveFontSize) ?? roundToNearestEven(effectiveFontSize * 0.75);
  const baseline = (label.rectHeight * 0.5) - applyOffset.y + nguiBaseline;

  label.processed = {
    fontSize: label.mFontSize,
    effectiveFontSize,
    fontStyle: label.mFontStyle,
    alignment: label.effectiveAlignment,
    rectWidth: label.rectWidth,
    rectHeight: label.rectHeight,
    spacingX: label.mSpacingX,
    spacingY: label.mSpacingY,
    calculatedSize,
    applyOffset,
    baseline,
    finalLineHeight,
    runs,
  };
  label.mShouldBeProcessed = false;
  return label.processed;
}

// Source: NGUIText.Print emits glyph geometry and NGUIText.Align applies the
// recovered UILabel alignment. Canvas text drawing is the substitute backend;
// it consumes processed runs rather than DOM/CSS layout.
export function renderScoreNumberLabelCanvas(
  canvas: HTMLCanvasElement,
  label: ScoreNumberLabelModel,
  metrics: NguiFontMetricApproximation | null,
  devicePixelRatio = window.devicePixelRatio || 1,
): void {
  const dpr = Math.max(1, devicePixelRatio);
  const pixelWidth = Math.max(1, Math.round(label.rectWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(label.rectHeight * dpr));
  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d") as CanvasDrawContext | null;
  if (!context) {
    return;
  }

  const processed = processScoreNumberLabel(label, metrics, context);
  setContextFont(context, processed.effectiveFontSize);
  const totalWidth = processed.calculatedSize.x
    || measureRuns(context, metrics, processed.runs, processed.effectiveFontSize, processed.spacingX);
  const alignedX = processed.alignment === "Right"
    ? roundToNearestEven(processed.rectWidth - totalWidth)
    : processed.alignment === "Center"
      ? roundToNearestEven((processed.rectWidth - totalWidth) * 0.5)
      : 0;
  // Source-backed coordinate conversion: NGUIText.Align writes vertices in
  // widget-local coordinates, UILabel.ApplyOffset shifts them around the
  // UIWidget pivot, and the canvas origin is the top-left corner of the same
  // widget rect. Adding rectWidth*pivotOffset.x maps NGUI local vertices into
  // canvas coordinates for the recovered widget pivot.
  let x = (processed.rectWidth * label.pivotOffset.x) + processed.applyOffset.x + alignedX;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, processed.rectWidth, processed.rectHeight);
  context.textBaseline = "alphabetic";
  for (const run of processed.runs) {
    context.fillStyle = run.color;
    for (const char of run.text) {
      context.fillText(char, x, processed.baseline);
      x += measureGlyph(context, metrics, char, processed.effectiveFontSize) + processed.spacingX;
    }
  }
}
