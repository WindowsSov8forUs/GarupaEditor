export interface NguiPoint {
  x: number;
  y: number;
}

export interface HudViewportSize {
  width: number;
  height: number;
}

export interface ProjectedNguiPoint {
  x: number;
  y: number;
  scale: number;
  activeHeight: number;
}

export type NguiHorizontalAnchor = "left" | "center" | "right";
export type NguiVerticalAnchor = "top" | "center" | "bottom";

export interface NguiAnchoredPoint {
  horizontal: NguiHorizontalAnchor;
  vertical: NguiVerticalAnchor;
  offset: NguiPoint;
}

// Source: HOST________/VSCode/bangdream-apk/reverse/analysis/targets/uiroot-fields-report.*
// and UIRoot$$get_activeHeight from ghidra-decompile-ngui-starui-gap-rebuild-ranged-typed-flow-clean.
export const RHYTHM_UI_ROOT = {
  scalingStyle: 1,
  manualWidth: 1334,
  manualHeight: 750,
  minimumHeight: 320,
  maximumHeight: 1536,
  fitWidth: true,
  fitHeight: false,
} as const;

// Source: level3 Transform hierarchy under GamePlay/UI_Root/Display.
export const RHYTHM_HUD_ANCHORS = {
  pauseGroup: { x: 411, y: 309 },
  pauseLocal: { x: -42, y: -54 },
  pauseDisplay: { x: 369, y: 255 },
  // Source: level3 GamePlay/UI_Root/Display/Button StarUIAnchor h=Right(3), v=Top(1).
  // StarUIAnchor$$SetAnchor_transform_int_int maps h=3/v=1 to right/top anchors;
  // Pause child localPosition is (-42, -54).
  pauseRightTop: { x: -42, y: -54 },
  comboRoot: { x: 434.7, y: 82.8 },
  comboNumberLabel: { x: 456.7, y: 82.8 },
  comboUnit: { x: 428.7, y: 10.8 },
  judgementResult: { x: 0, y: -160 },
  judgeTiming: { x: 3.2, y: -190.4 },
  scoreRoot: { x: -411, y: 309 },
  lifeGaugeRoot: { x: 411, y: 309 },
  autoLiveLabelRoot: { x: -411, y: 309 },
} as const satisfies Record<string, NguiPoint>;

// Source: level3 NGUI UISprite/UIWidget serialized fields, parsed from raw MonoBehaviour bytes.
export const RHYTHM_HUD_WIDGETS = {
  pauseCover: { width: 67, height: 69, pivot: 4 },
  comboDigit: { width: 82, height: 116, padding: -12 },
  comboUnit: { width: 150, height: 42, pivot: 4 },
  judgementResult: { width: 288, height: 80, pivot: 4 },
  judgeTiming: { width: 80, height: 26, pivot: 4 },
} as const;

// Source: level3 Transform hierarchy and runtime-ui-binding-report.*.
// Result is the GameJudge animated root. JudgeTiming is the smaller FAST/SLOW
// child; JudgeTimingController.Show writes its own child scale when shown.
export const RHYTHM_HUD_TRANSFORM_SCALES = {
  judgementResult: 0.8,
  judgeTimingDisplay: 0.8 * 1.25,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToEven(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction > 0.5) {
    return floor + 1;
  }
  if (fraction < 0.5) {
    return floor;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

export function resolveNguiActiveHeight(viewportWidth: number, viewportHeight: number): number {
  const width = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const height = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const viewportAspect = width / height;
  const scalingStyle: number = RHYTHM_UI_ROOT.scalingStyle;

  // Current recovered UIRoot path: scalingStyle=1 with fitWidth=true/fitHeight=false.
  // The scalingStyle!=0 branch returns the fitted manual height directly and uses
  // Mathf.RoundToInt semantics, including half-to-even ties.
  if (scalingStyle !== 0 && RHYTHM_UI_ROOT.fitWidth && !RHYTHM_UI_ROOT.fitHeight) {
    return roundToEven(RHYTHM_UI_ROOT.manualWidth / Math.max(1e-6, viewportAspect));
  }

  const fittedHeight = RHYTHM_UI_ROOT.fitWidth
    ? roundToEven(RHYTHM_UI_ROOT.manualWidth / Math.max(1e-6, viewportAspect))
    : RHYTHM_UI_ROOT.manualHeight;
  return clamp(fittedHeight, RHYTHM_UI_ROOT.minimumHeight, RHYTHM_UI_ROOT.maximumHeight);
}

export function projectNguiDisplayPoint(
  point: NguiPoint,
  viewport: HudViewportSize,
): ProjectedNguiPoint {
  const width = Math.max(1, Number.isFinite(viewport.width) ? viewport.width : 1);
  const height = Math.max(1, Number.isFinite(viewport.height) ? viewport.height : 1);
  const activeHeight = resolveNguiActiveHeight(width, height);
  const scale = height / activeHeight;

  return {
    x: (width * 0.5) + (point.x * scale),
    y: (height * 0.5) - (point.y * scale),
    scale,
    activeHeight,
  };
}

export function resolveNguiActiveWidth(viewportWidth: number, viewportHeight: number): number {
  const width = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const height = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const activeHeight = resolveNguiActiveHeight(width, height);

  return activeHeight * (width / height);
}

export function projectNguiAnchoredPoint(
  point: NguiAnchoredPoint,
  viewport: HudViewportSize,
): ProjectedNguiPoint {
  const width = Math.max(1, Number.isFinite(viewport.width) ? viewport.width : 1);
  const height = Math.max(1, Number.isFinite(viewport.height) ? viewport.height : 1);
  const activeHeight = resolveNguiActiveHeight(width, height);
  const activeWidth = resolveNguiActiveWidth(width, height);
  const scale = height / activeHeight;

  const anchorX = point.horizontal === "left"
    ? -activeWidth * 0.5
    : point.horizontal === "right"
      ? activeWidth * 0.5
      : 0;
  const anchorY = point.vertical === "top"
    ? activeHeight * 0.5
    : point.vertical === "bottom"
      ? -activeHeight * 0.5
      : 0;

  return {
    x: (width * 0.5) + ((anchorX + point.offset.x) * scale),
    y: (height * 0.5) - ((anchorY + point.offset.y) * scale),
    scale,
    activeHeight,
  };
}
