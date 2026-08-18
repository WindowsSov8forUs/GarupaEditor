import type { SimulatorSurfaceRect, SimulatorSurfaceState } from "../platform/surfaceContracts";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";

export const ORIGINAL_SCREEN_WIDTH_BASE = 1334;
export const ORIGINAL_SCREEN_HEIGHT_BASE = 750;
export const ORIGINAL_UI_HALF_WIDTH_BASE = 667;
export const ORIGINAL_UI_HALF_HEIGHT_BASE = 375;
export const ORIGINAL_ASPECT_RATIO_BASE = Math.fround(1.778666615486145);
export const ORIGINAL_HIGH_ASPECT_RATIO_MAX = Math.fround(2);
export const ORIGINAL_REFERENCE_SCREEN_SIZE_X = Math.fround(9.578571319580078);
export const ORIGINAL_ANDROID_FULL_SAFE_RATIO = Math.fround(0.8999999761581421);

const AUTHORED_BUTTON_Y = Math.fround(-3.450000047683716);
const AUTHORED_LAUNCHER_Y = Math.fround(5.420000076293945);
const AUTHORED_BUTTON_SPACING = Math.fround(2.200000047683716);
const LAUNCH_DISTANCE_RATE = Math.fround(0.05000000074505806);
const VANISHING_SLOPE = Math.fround(-1.3439395427703857);
const MOVE_TIME_CHILD_OFFSET = Math.fround(72);
const MOVE_TIME_WIDGET_SIZE = Math.fround(104);
const MOVE_TIME_HIT_RADIUS_WORLD = Math.fround(0.11999999731779099);

export interface OriginalStarUiLayout {
  readonly aspectRatio: number;
  readonly isHighAspectRatioDevice: boolean;
  readonly highAspectRatio: number;
  readonly screenToWidthBaseRatio: number;
  readonly widthBaseToScreenRatio: number;
  readonly screenRatio: readonly [number, number];
  readonly horizontalRatioComparedTo16By9: number;
  readonly verticalFitScreenRatio: number;
  readonly safeArea: SimulatorSurfaceRect;
  readonly safeAreaRatio: readonly [number, number];
  readonly screenToSafeAreaRatio: number;
  readonly safeAreaToScreenRatio: number;
}

export interface OriginalCameraProjectionLayout {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly halfWidthWorld: number;
  readonly halfHeightWorld: 1;
  readonly pixelsPerWorldUnit: number;
  readonly worldCenterX: 0;
  readonly worldCenterY: 0;
  readonly positionZ: -15;
  readonly nearClip: 0;
  readonly farClip: 25;
}

export interface OriginalGameplayLayout {
  readonly screenSizeX: number;
  readonly screenWidthAdjustRate: number;
  readonly normalizedNoteSize: number;
  readonly noteSettingScale: number;
  readonly particleScaleTotal: number;
  readonly targetCenterY: number;
  readonly launcherY: number;
  readonly laneSpacingWorld: number;
  readonly vanishingY: number;
  readonly noteStartY: number;
}

export interface OriginalUiLayout {
  readonly pixelsPerAuthoredUnit: number;
  readonly screenToSafeChildScale: number;
  readonly moveTime: {
    readonly returnCenterBottomLeft: readonly [number, number];
    readonly advanceCenterBottomLeft: readonly [number, number];
    readonly widgetSize: readonly [number, number];
    readonly hitCircleRadiusPixels: number;
    readonly timeBackgroundBoundsTopLeft: readonly [number, number, number, number];
  };
  readonly autoLiveCaptionBoundsTopLeft: readonly [number, number, number, number];
}

export interface OriginalMovieLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OriginalSurfaceLayout {
  readonly surface: SimulatorSurfaceState;
  readonly starUi: OriginalStarUiLayout;
  readonly camera: OriginalCameraProjectionLayout;
  readonly gameplay: OriginalGameplayLayout;
  readonly ui: OriginalUiLayout;
  readonly movie: OriginalMovieLayout;
}

export function createOriginalSurfaceLayout(
  surface: SimulatorSurfaceState,
  noteSize: number,
): SimulatorResult<OriginalSurfaceLayout> {
  if (!exactFloat32(noteSize) || noteSize < 80 || noteSize > 150) {
    return reject(
      "layout.invalid-note-size",
      "Original multiresolution layout requires the already evidenced exact binary32 note-size range 80..150.",
    );
  }
  const width = surface.viewportWidth;
  const height = surface.viewportHeight;
  const aspectRatio = div(width, height);
  const isHigh = aspectRatio > ORIGINAL_ASPECT_RATIO_BASE;
  const highAspectRatio = clamp01(div(
    sub(aspectRatio, ORIGINAL_ASPECT_RATIO_BASE),
    sub(ORIGINAL_HIGH_ASPECT_RATIO_MAX, ORIGINAL_ASPECT_RATIO_BASE),
  ));
  const screenRatioX = div(width, ORIGINAL_SCREEN_WIDTH_BASE);
  const screenRatioY = div(height, ORIGINAL_SCREEN_HEIGHT_BASE);
  const verticalFit = div(height, mul(screenRatioX, ORIGINAL_SCREEN_HEIGHT_BASE));
  const safeArea = normalizeOriginalSafeArea(surface, isHigh);
  if (safeArea.status !== "ok") return safeArea;
  const safeRatioX = div(safeArea.value.width, width);
  const safeRatioY = div(safeArea.value.height, height);
  let screenToSafeAreaRatio: number;
  if (
    toInt32LikeArm64(safeArea.value.width) === width &&
    toInt32LikeArm64(safeArea.value.height) === height
  ) {
    screenToSafeAreaRatio = isHigh ? verticalFit : Math.fround(1);
  } else {
    screenToSafeAreaRatio = Math.fround(Math.min(safeRatioX, safeRatioY));
    if (screenRatioX >= screenRatioY) {
      screenToSafeAreaRatio = mul(screenToSafeAreaRatio, verticalFit);
    }
  }
  if (!Number.isFinite(screenToSafeAreaRatio) || screenToSafeAreaRatio <= 0) {
    return reject(
      "layout.invalid-safe-area-ratio",
      "The original StarUI safe-area pipeline produced a non-positive ratio and cannot be repaired.",
    );
  }
  const widthRate = div(aspectRatio, ORIGINAL_REFERENCE_SCREEN_SIZE_X);
  const normalizedNoteSize = div(noteSize, 100);
  const noteSettingScale = mul(widthRate, normalizedNoteSize);
  const targetCenterY = mul(AUTHORED_BUTTON_Y, widthRate);
  const launcherY = mul(AUTHORED_LAUNCHER_Y, widthRate);
  const laneSpacingWorld = mul(AUTHORED_BUTTON_SPACING, widthRate);
  const firstButtonX = mul(Math.fround(-3), laneSpacingWorld);
  const vanishingY = add(targetCenterY, mul(firstButtonX, VANISHING_SLOPE));
  const noteStartY = add(
    targetCenterY,
    mul(sub(1, LAUNCH_DISTANCE_RATE), sub(vanishingY, targetCenterY)),
  );
  const pixelsPerWorldUnit = div(height, 2);
  const pixelsPerAuthoredUnit = div(width, ORIGINAL_SCREEN_WIDTH_BASE);
  const screenToSafeChildScale = mul(pixelsPerAuthoredUnit, screenToSafeAreaRatio);
  const moveOffset = mul(MOVE_TIME_CHILD_OFFSET, screenToSafeChildScale);
  const centerY = div(height, 2);
  const safeRight = add(safeArea.value.x, safeArea.value.width);
  const safeTop = add(safeArea.value.y, safeArea.value.height);
  const timeCenterX = add(safeRight, mul(-16, screenToSafeChildScale));
  const timeCenterY = add(safeTop, mul(-104, screenToSafeChildScale));
  const timeWidth = mul(172, screenToSafeChildScale);
  const timeHeight = mul(32, screenToSafeChildScale);
  const captionCenterX = add(safeArea.value.x, mul(130, screenToSafeChildScale));
  const captionCenterY = add(safeTop, mul(-134, screenToSafeChildScale));
  const captionWidth = mul(206, screenToSafeChildScale);
  const captionHeight = mul(38, screenToSafeChildScale);
  const movieScale = isHigh ? verticalFit : Math.fround(1);
  const movieWidth = mul(mul(ORIGINAL_SCREEN_WIDTH_BASE, pixelsPerAuthoredUnit), movieScale);
  const movieHeight = mul(mul(ORIGINAL_SCREEN_HEIGHT_BASE, pixelsPerAuthoredUnit), movieScale);
  const starUi: OriginalStarUiLayout = Object.freeze({
    aspectRatio,
    isHighAspectRatioDevice: isHigh,
    highAspectRatio,
    screenToWidthBaseRatio: div(ORIGINAL_SCREEN_WIDTH_BASE, width),
    widthBaseToScreenRatio: screenRatioX,
    screenRatio: Object.freeze([screenRatioX, screenRatioY] as const),
    horizontalRatioComparedTo16By9: mul(aspectRatio, Math.fround(9 / 16)),
    verticalFitScreenRatio: verticalFit,
    safeArea: safeArea.value,
    safeAreaRatio: Object.freeze([safeRatioX, safeRatioY] as const),
    screenToSafeAreaRatio,
    safeAreaToScreenRatio: div(1, screenToSafeAreaRatio),
  });
  return ok(Object.freeze({
    surface,
    starUi,
    camera: Object.freeze({
      viewportWidth: width,
      viewportHeight: height,
      halfWidthWorld: aspectRatio,
      halfHeightWorld: 1 as const,
      pixelsPerWorldUnit,
      worldCenterX: 0 as const,
      worldCenterY: 0 as const,
      positionZ: -15 as const,
      nearClip: 0 as const,
      farClip: 25 as const,
    }),
    gameplay: Object.freeze({
      screenSizeX: aspectRatio,
      screenWidthAdjustRate: widthRate,
      normalizedNoteSize,
      noteSettingScale,
      particleScaleTotal: mul(noteSettingScale, screenToSafeAreaRatio),
      targetCenterY,
      launcherY,
      laneSpacingWorld,
      vanishingY,
      noteStartY,
    }),
    ui: Object.freeze({
      pixelsPerAuthoredUnit,
      screenToSafeChildScale,
      moveTime: Object.freeze({
        returnCenterBottomLeft: Object.freeze([
          add(safeArea.value.x, moveOffset), centerY,
        ] as const),
        advanceCenterBottomLeft: Object.freeze([
          sub(add(safeArea.value.x, safeArea.value.width), moveOffset), centerY,
        ] as const),
        widgetSize: Object.freeze([
          mul(MOVE_TIME_WIDGET_SIZE, screenToSafeChildScale),
          mul(MOVE_TIME_WIDGET_SIZE, screenToSafeChildScale),
        ] as const),
        hitCircleRadiusPixels: mul(MOVE_TIME_HIT_RADIUS_WORLD, pixelsPerWorldUnit),
        timeBackgroundBoundsTopLeft: Object.freeze([
          sub(timeCenterX, div(timeWidth, 2)),
          sub(height, add(timeCenterY, div(timeHeight, 2))),
          timeWidth,
          timeHeight,
        ] as const),
      }),
      autoLiveCaptionBoundsTopLeft: Object.freeze([
        sub(captionCenterX, div(captionWidth, 2)),
        sub(height, add(captionCenterY, div(captionHeight, 2))),
        captionWidth,
        captionHeight,
      ] as const),
    }),
    movie: Object.freeze({
      x: div(sub(width, movieWidth), 2),
      y: div(sub(height, movieHeight), 2),
      width: movieWidth,
      height: movieHeight,
    }),
  }));
}

export function originalWorldToBottomLeftScreen(
  layout: OriginalSurfaceLayout,
  x: number,
  y: number,
): SimulatorResult<readonly [number, number]> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return reject("layout.invalid-world-position", "World projection requires finite coordinates.");
  }
  return ok(Object.freeze([
    Math.fround(layout.surface.viewportWidth / 2 + Math.fround(x * layout.camera.pixelsPerWorldUnit)),
    Math.fround(layout.surface.viewportHeight / 2 + Math.fround(y * layout.camera.pixelsPerWorldUnit)),
  ]));
}

export function originalBottomLeftScreenToWorld(
  layout: OriginalSurfaceLayout,
  x: number,
  y: number,
): SimulatorResult<readonly [number, number]> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return reject("layout.invalid-screen-position", "Screen inverse projection requires finite coordinates.");
  }
  return ok(Object.freeze([
    Math.fround(Math.fround(x - layout.surface.viewportWidth / 2) / layout.camera.pixelsPerWorldUnit),
    Math.fround(Math.fround(y - layout.surface.viewportHeight / 2) / layout.camera.pixelsPerWorldUnit),
  ]));
}

function normalizeOriginalSafeArea(
  surface: SimulatorSurfaceState,
  isHigh: boolean,
): SimulatorResult<SimulatorSurfaceRect> {
  const width = surface.viewportWidth;
  const height = surface.viewportHeight;
  let x = Math.fround(surface.safeArea.x);
  let y = Math.fround(surface.safeArea.y);
  let safeWidth = Math.fround(surface.safeArea.width);
  let safeHeight = Math.fround(surface.safeArea.height);
  if (
    toInt32LikeArm64(x) === 0 && toInt32LikeArm64(y) === 0 &&
    toInt32LikeArm64(safeWidth) === width &&
    toInt32LikeArm64(safeHeight) === height && isHigh
  ) {
    safeWidth = mul(width, ORIGINAL_ANDROID_FULL_SAFE_RATIO);
    x = mul(sub(width, safeWidth), Math.fround(0.5));
  }
  const horizontalInset = Math.fround(Math.max(
    x,
    sub(width, add(x, safeWidth)),
  ));
  if (horizontalInset > 0) {
    x = horizontalInset;
    safeWidth = sub(width, add(horizontalInset, horizontalInset));
  }
  const verticalInset = Math.fround(Math.max(
    y,
    sub(height, add(y, safeHeight)),
  ));
  if (verticalInset > 0) {
    y = verticalInset;
    safeHeight = sub(height, add(verticalInset, verticalInset));
  }
  if (safeWidth <= 0 || safeHeight <= 0) {
    return reject(
      "layout.safe-area-collapsed",
      "Original calcNotch symmetrization collapsed the supplied base safe area; the result cannot be clamped or replaced.",
    );
  }
  return ok(Object.freeze({ x, y, width: safeWidth, height: safeHeight }));
}

function toInt32LikeArm64(value: number): number {
  return value >= 0 ? Math.trunc(value) : Math.ceil(value);
}

function clamp01(value: number): number {
  return Math.fround(Math.min(1, Math.max(0, value)));
}

function add(a: number, b: number): number {
  return Math.fround(Math.fround(a) + Math.fround(b));
}

function sub(a: number, b: number): number {
  return Math.fround(Math.fround(a) - Math.fround(b));
}

function mul(a: number, b: number): number {
  return Math.fround(Math.fround(a) * Math.fround(b));
}

function div(a: number, b: number): number {
  return Math.fround(Math.fround(a) / Math.fround(b));
}

function exactFloat32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    Object.is(value, Math.fround(value));
}

function reject(capability: string, boundary: string) {
  return evidenceRequired(capability, ["ML-E01", "ML-E02", "ML-E03", "ML-E04"], boundary);
}
