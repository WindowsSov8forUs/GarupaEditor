import type {
  RenderColor,
  RenderFloat32,
  RenderVector2,
  RenderVector3,
} from "../../backends/renderingContracts";
import { virtualLaneNoteX, type VirtualLaneSource } from "../chart/virtualLane";
import { coordinate, coordinateAdd, coordinateCompare, coordinateScale, coordinateValue,
  type ExponentialCoordinate, type ExponentialLine, type ExponentialTransform } from "./exponentialCoordinates";
import {
  createRenderFloat32,
  validateRenderFloat32,
} from "../../backends/renderingValidation";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../result";

const BASE_SECTION_COUNT = 10;
const ADVANCED_SECTION_COUNT = 20;
const SYNC_LINE_WIDTH_FACTOR = Math.fround(0.2800000011920929);
const NOTE_POSITION_BASE = Math.fround(1.1);
const NOTE_POSITION_EXPONENT_SCALE = Math.fround(50);
const NOTE_SCALE_ASPECT_BASE = Math.fround(0.996);
const HABAHIRO_MESH_WIDTH_BASE = Math.fround(1.0499999523162842);
const HABAHIRO_MESH_WIDTH_COEFFICIENT = Math.fround(0.03000009059906006);
const NOTE_SCALE_MIN_RATIOS = Object.freeze([
  Math.fround(0.98),
  Math.fround(0.988),
  Math.fround(0.9898),
  Math.fround(0.9899),
  Math.fround(0.991),
  Math.fround(0.9915),
  Math.fround(0.9917),
]);

function createStripIndices(sectionCount: number): readonly number[] {
  return Object.freeze(Array.from(
    { length: sectionCount },
    (_, section) => {
      const left = section * 2;
      return [left, left + 2, left + 1, left + 1, left + 2, left + 3];
    },
  ).flat());
}

const BASE_INDICES = createStripIndices(BASE_SECTION_COUNT);
const ADVANCED_INDICES = createStripIndices(ADVANCED_SECTION_COUNT);

export interface OrdinaryNoteMeshEndpoint {
  readonly position: RenderVector2;
  readonly localScaleX: RenderFloat32;
  readonly buttonCount: number;
}

export interface OrdinaryBaseNoteMeshOwnerState {
  readonly front: OrdinaryNoteMeshEndpoint;
  readonly after: OrdinaryNoteMeshEndpoint;
  readonly screenToSafeAreaRatio: RenderFloat32;
  readonly widthRate: RenderFloat32;
  readonly color: RenderColor;
}

export interface OrdinaryBaseNoteMeshGeometry {
  readonly viewportClipped?: true;
  readonly vertices: readonly RenderVector3[];
  readonly indices: readonly number[];
  readonly uv: readonly RenderVector2[];
  readonly colors: readonly RenderColor[];
}

export interface OrdinarySyncLineTargetState {
  readonly unclipped?: { readonly x: number; readonly y: number; readonly localScaleX: number; readonly lossyScaleX: number;
    readonly exponential?: { readonly x: ExponentialCoordinate; readonly y: ExponentialCoordinate;
      readonly localScaleX: ExponentialCoordinate; readonly lossyScaleX: ExponentialCoordinate } };
  readonly position: RenderVector3;
  readonly lossyScaleX: RenderFloat32;
  readonly localScaleX: RenderFloat32;
  readonly gameNoteType: number;
}

export interface OrdinarySyncLineOwnerState {
  readonly targetA: OrdinarySyncLineTargetState;
  readonly targetB: OrdinarySyncLineTargetState;
  readonly edgeMargin: RenderFloat32;
}

export interface OrdinarySyncLineGeometry {
  readonly unclipped?: { readonly start: readonly [number, number]; readonly end: readonly [number, number]; readonly width: number;
    readonly exponential?: ExponentialLine };
  readonly start: RenderVector3;
  readonly end: RenderVector3;
  readonly width: RenderFloat32;
}

export interface OrdinaryMultipleDirectionalLineOwnerState {
  readonly targetA: OrdinaryNoteMotionResult;
  readonly targetB: OrdinaryNoteMotionResult;
}

export interface OrdinaryNoteMotionState {
  readonly progressRate: RenderFloat32;
  readonly specificSpeed: RenderFloat32;
  readonly deltaTime: RenderFloat32;
  readonly realMoveSecond: RenderFloat32;
  readonly goalPosition: RenderVector2;
  readonly noteStartPosition: RenderVector2;
  readonly currentPositionZ: RenderFloat32;
  readonly noteParentScale: RenderFloat32;
  readonly noteSettingScale: RenderFloat32;
  readonly launcherY: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly highAspectRatio: RenderFloat32;
  readonly buttonCount: number;
  readonly virtualLaneControllerPresent: boolean;
  readonly pixelsPerWorldUnit?: number;
  readonly viewportY?: readonly [number, number];
  readonly viewportX?: readonly [number, number];
  readonly virtualLane?: { readonly source: VirtualLaneSource; readonly startUnit: number; readonly endUnit: number };
}

export interface OrdinaryNoteMotionResult {
  readonly progressRate: RenderFloat32;
  readonly position: RenderVector3;
  readonly localScale: RenderVector3;
  /** Host coordinates retained until clipping; typed transforms remain GPU-safe. */
  readonly unclipped?: { readonly x: number; readonly y: number; readonly scale: number; readonly pixelsPerWorldUnit: number;
    readonly exponential?: ExponentialTransform;
    readonly viewportY: readonly [number, number]; readonly viewportX: readonly [number, number] };
}

export function noteMotionY(motion: OrdinaryNoteMotionResult): number {
  return motion.unclipped?.exponential ? coordinateValue(motion.unclipped.exponential.y) : motion.unclipped?.y ?? motion.position.y.value;
}
export function noteMotionX(motion: OrdinaryNoteMotionResult): number {
  return motion.unclipped?.exponential ? coordinateValue(motion.unclipped.exponential.x) : motion.unclipped?.x ?? motion.position.x.value;
}

export function noteUnclippedTransform(motion: Pick<OrdinaryNoteMotionResult, "unclipped">, parent: RenderFloat32) {
  const raw = motion.unclipped;
  return raw === undefined ? undefined : { x: raw.x, y: raw.y,
    scaleX: raw.scale * parent.value, scaleY: raw.scale * parent.value,
    ...(raw.exponential ? { exponential: { ...raw.exponential, scaleX: coordinateScale(raw.exponential.scaleX, parent.value),
      scaleY: coordinateScale(raw.exponential.scaleY, parent.value) } } : {}) };
}

export interface OrdinaryNoteActivationAdjustmentResult {
  readonly lastMotion: OrdinaryNoteMotionResult | null;
  readonly progressRate: RenderFloat32;
  readonly realMoveSecond: RenderFloat32;
}

export function getHabahiroMeshWidthRate(
  noteLength: number,
  explicitSetting: RenderFloat32,
): SimulatorResult<RenderFloat32> {
  if (
    !Number.isInteger(noteLength) || noteLength < 1 ||
    !validateRenderFloat32(explicitSetting)
  ) {
    return reject(
      "render.geometry.invalid-habahiro-mesh-width-input",
      "The current static HABAHIRO width formula requires a positive integer note length and explicit Float32 host setting.",
    );
  }
  let value = noteLength === 1 ? Math.fround(1) : HABAHIRO_MESH_WIDTH_BASE;
  if (noteLength >= 3 && explicitSetting.value >= 0) {
    value = Math.fround(
      HABAHIRO_MESH_WIDTH_BASE +
        Math.fround(Math.min(explicitSetting.value, Math.fround(1)) * HABAHIRO_MESH_WIDTH_COEFFICIENT),
    );
  }
  return createRenderFloat32(value);
}

/** SORT-C43: NoteBase.getStartPos preserves each ARM64 SCVTF/FMUL/FADD write. */
export function calculateOrdinaryNoteStartDepth(
  baseZ: number,
  absolutePos: number,
  buttonType: number,
): number {
  const coefficient = Math.fround(0.00005);
  const positionOffset = Math.fround(absolutePos * coefficient);
  const laneOffset = Math.fround(
    Math.fround(Math.fround(buttonType) * coefficient) * Math.fround(0.1),
  );
  return Math.fround(baseZ + Math.fround(Math.fround(-14 + positionOffset) + laneOffset));
}

/** SORT-C45: full native matrices and lossyScale agree for the canonical note ancestors. */
export function calculateOrdinaryNoteWorldScaleAxis(localScale: number, parentScale: number): number {
  return Math.fround(localScale * parentScale) + 0;
}

export function getOrdinaryNoteArrivalSeconds(
  specificSpeed: RenderFloat32,
): SimulatorResult<RenderFloat32> {
  if (!validateRenderFloat32(specificSpeed)) {
    return reject(
      "render.geometry.invalid-specific-speed",
      "GetNoteArrivalSeconds requires one exact Float32 specific speed.",
    );
  }
  const value = specificSpeed.value <= Math.fround(11.01)
    ? Math.fround(
      Math.fround(Math.fround(specificSpeed.value - Math.fround(1)) * Math.fround(-0.5)) +
        Math.fround(5.5),
    )
    : Math.fround(
      Math.fround(Math.fround(specificSpeed.value - Math.fround(11)) / Math.fround(-10)) +
        Math.fround(0.5),
    );
  const arrival = createRenderFloat32(value);
  return arrival.status === "ok" && arrival.value.value > 0
    ? arrival
    : reject(
      "render.geometry.non-positive-arrival-seconds",
      "The current Move path requires GetNoteArrivalSeconds to remain positive; unsupported speed inputs are not clamped.",
    );
}

export function advanceOrdinaryNoteMotion(
  state: OrdinaryNoteMotionState,
): SimulatorResult<OrdinaryNoteMotionResult> {
  if (
    !validateRenderFloat32(state.currentPositionZ) ||
    !validateRenderFloat32(state.noteParentScale) ||
    state.noteParentScale.value <= 0 ||
    !validateRenderFloat32(state.noteSettingScale) ||
    state.noteSettingScale.value < 0 ||
    !validateRenderFloat32(state.launcherY) ||
    !validateRenderFloat32(state.targetCenterY) ||
    !validateRenderFloat32(state.highAspectRatio) ||
    !Number.isInteger(state.buttonCount) ||
    state.buttonCount < 1 ||
    state.buttonCount > 7 ||
    typeof state.virtualLaneControllerPresent !== "boolean"
  ) {
    return reject(
      "render.geometry.invalid-note-motion-state",
      "Note Move requires complete current Float32 timing, scene positions, scale inputs and a 1..7 button count.",
    );
  }
  const vertical = advanceOrdinaryNoteVerticalMotion(state);
  if (vertical.status !== "ok") return vertical;
  return projectOrdinaryNoteMotion(state, vertical.value.progressRate, vertical.value.curve, vertical.value.y);
}

/** Coordinate projection shared by normal motion and signed-SV displacement. */
export function projectOrdinaryNoteMotion(state: OrdinaryNoteMotionState, progressRate: RenderFloat32,
  curve: number, y = Math.fround(state.noteStartPosition.y.value - Math.abs(Math.fround(
    Math.fround(state.noteStartPosition.y.value - state.goalPosition.y.value) * curve))),
  curveExponent?: number): SimulatorResult<OrdinaryNoteMotionResult> {
  if (!Number.isFinite(curve) && state.viewportX && state.viewportY)
    return projectExponentialNoteMotion(state, progressRate, curve, curveExponent ?? noteMotionCurveExponent(progressRate.value));
  const x = calculateOrdinaryNoteXAtCurve(state, curve);
  const position = vector3(
    x,
    y,
    state.currentPositionZ.value,
  );
  const scale = calculateOrdinaryNoteScaleAtY(state, y);
  const gpuScale = state.pixelsPerWorldUnit ?? 1;
  if (position.status === "ok" && scale.status === "ok" &&
    [x, y, scale.value.x.value * state.noteParentScale.value].every(value => Number.isFinite(Math.fround(value * gpuScale)))) return ok({
    progressRate, position: position.value, localScale: scale.value,
  });
  // Preserve extrapolation until common clipping; the carrier is not a stop state.
  if (state.viewportX && state.viewportY)
    return projectExponentialNoteMotion(state, progressRate, curve, curveExponent ?? noteMotionCurveExponent(progressRate.value));
  return position.status !== "ok" ? position : scale.status !== "ok" ? scale : reject("render.geometry.non-finite-host-motion", "Motion clipping requires a viewport.");
}
export function noteSpatialX(motion: OrdinaryNoteMotionResult): number | ExponentialCoordinate {
  return motion.unclipped?.exponential?.x ?? motion.unclipped?.x ?? motion.position.x.value;
}
export function noteSpatialY(motion: OrdinaryNoteMotionResult): number | ExponentialCoordinate {
  return motion.unclipped?.exponential?.y ?? motion.unclipped?.y ?? motion.position.y.value;
}

export function noteUnclippedSyncTarget(motion: Pick<OrdinaryNoteMotionResult, "unclipped">, parent: RenderFloat32): OrdinarySyncLineTargetState["unclipped"] {
  const raw = motion.unclipped;
  return raw === undefined ? undefined : { x: raw.x, y: raw.y, localScaleX: raw.scale, lossyScaleX: raw.scale * parent.value,
    ...(raw.exponential ? { exponential: { x: raw.exponential.x, y: raw.exponential.y,
      localScaleX: raw.exponential.scaleX, lossyScaleX: coordinateScale(raw.exponential.scaleX, parent.value) } } : {}) };
}

export function noteMotionCoordinates(motion: OrdinaryNoteMotionResult): ExponentialTransform {
  const raw = motion.unclipped;
  return raw?.exponential ?? { x: coordinate(raw?.x ?? motion.position.x.value), y: coordinate(raw?.y ?? motion.position.y.value),
    scaleX: coordinate(raw?.scale ?? motion.localScale.x.value), scaleY: coordinate(raw?.scale ?? motion.localScale.y.value) };
}

function projectExponentialNoteMotion(state: OrdinaryNoteMotionState, progressRate: RenderFloat32,
  curve: number, exponent: number): SimulatorResult<OrdinaryNoteMotionResult> {
  const power = Math.floor(exponent);
  const c = Number.isFinite(curve) ? coordinate(curve) : coordinate(2 ** (exponent - power), power);
  const startX = calculateOrdinaryNoteXAtCurve(state, 0, true), goalX = calculateOrdinaryNoteXAtCurve(state, 1, true);
  const x = coordinateAdd(coordinate(startX), coordinateScale(c, goalX - startX));
  const y = coordinateAdd(coordinate(state.noteStartPosition.y.value),
    coordinateScale(c, -Math.abs(state.noteStartPosition.y.value - state.goalPosition.y.value)));
  const distance = coordinateAdd(coordinate(state.launcherY.value), coordinateScale(y, -1));
  const denominator = Math.abs(state.launcherY.value - state.targetCenterY.value);
  if (denominator === 0) return reject("render.geometry.degenerate-note-scale-range", "Note scaling requires distinct launcher and target positions.");
  const aspect = Math.fround(Math.min(1, Math.max(0, state.highAspectRatio.value)));
  const ratio = Math.fround(Math.fround(aspect * Math.fround(NOTE_SCALE_MIN_RATIOS[state.buttonCount - 1]! - NOTE_SCALE_ASPECT_BASE)) + NOTE_SCALE_ASPECT_BASE);
  const scale = coordinateAdd(coordinate(Math.fround(1 - ratio)),
    coordinateScale(distance, (coordinateCompare(distance, []) < 0 ? -1 : 1) * state.noteSettingScale.value * ratio / denominator));
  const bounded = (value: ExponentialCoordinate, range: readonly [number, number]) => coordinateCompare(value, coordinate(range[0])) < 0 ? range[0]
    : coordinateCompare(value, coordinate(range[1])) > 0 ? range[1] : coordinateValue(value);
  const safeY = bounded(y, state.viewportY!), safeX = bounded(x, state.viewportX!);
  const position = vector3(safeX, safeY, state.currentPositionZ.value), carrierScale = calculateOrdinaryNoteScaleAtY(state, safeY);
  if (position.status !== "ok") return position;
  if (carrierScale.status !== "ok") return carrierScale;
  return ok({ progressRate, position: position.value, localScale: carrierScale.value, unclipped: {
    x: safeX, y: safeY, scale: carrierScale.value.x.value, pixelsPerWorldUnit: state.pixelsPerWorldUnit ?? 1,
    viewportX: state.viewportX!, viewportY: state.viewportY!, exponential: { x, y, scaleX: scale, scaleY: scale } } });
}

export function calculateOrdinaryNoteXAtCurve(
  state: Pick<OrdinaryNoteMotionState, "noteStartPosition" | "goalPosition" | "virtualLane">,
  curve: number,
  hostPrecision = false,
): number {
  const lane = state.virtualLane;
  const start = lane === undefined ? state.noteStartPosition.x.value
    : virtualLaneNoteX(lane.source, lane.startUnit, state.noteStartPosition.x.value);
  const goal = lane === undefined ? state.goalPosition.x.value
    : virtualLaneNoteX(lane.source, lane.endUnit, state.goalPosition.x.value);
  return hostPrecision ? start + curve * (goal - start) : interpolateOrdinaryNoteX(start, goal, curve);
}

export function interpolateOrdinaryNoteX(start: number, goal: number, curve: number): number {
  return Math.fround(start + Math.fround(curve * Math.fround(goal - start)));
}

export function advanceOrdinaryNoteVerticalMotion(
  state: Pick<OrdinaryNoteMotionState, "specificSpeed" | "progressRate" | "deltaTime" |
    "realMoveSecond" | "goalPosition" | "noteStartPosition">,
): SimulatorResult<{ readonly progressRate: RenderFloat32; readonly curve: number; readonly y: number }> {
  if (!validateRenderFloat32(state.progressRate) || !validateRenderFloat32(state.deltaTime) ||
    state.deltaTime.value < 0 || !validateRenderFloat32(state.realMoveSecond) || state.realMoveSecond.value < 0 ||
    !validateVector2(state.goalPosition) || !validateVector2(state.noteStartPosition)) {
    return reject("render.geometry.invalid-note-vertical-motion",
      "Note vertical motion requires finite timing, start and goal positions.");
  }
  const arrival = getOrdinaryNoteArrivalSeconds(state.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  const progress = createRenderFloat32(state.progressRate.value === 0
    ? Math.fround(state.realMoveSecond.value / arrival.value.value)
    : Math.fround(state.progressRate.value + Math.fround(state.deltaTime.value / arrival.value.value)));
  if (progress.status !== "ok") return progress;
  const curve = calculateNoteMotionCurve(progress.value.value, true);
  const y = Math.fround(state.noteStartPosition.y.value - Math.abs(Math.fround(
    Math.fround(state.noteStartPosition.y.value - state.goalPosition.y.value) * curve,
  )));
  return ok({ progressRate: progress.value, curve, y });
}

/** Original projection, also used after an extension transforms the time axis. */
export function calculateNoteMotionCurve(progress: number, preserveClippingRange = false): number {
  const exponent = Math.fround(Math.fround(progress - 1) * NOTE_POSITION_EXPONENT_SCALE);
  const value = Math.pow(NOTE_POSITION_BASE, exponent);
  const packed = Math.fround(value);
  // Extended SV can place an endpoint outside Float32 world coordinates while
  // its segment still intersects the field. Keep that value only for clipping.
  return preserveClippingRange && !Number.isFinite(packed) ? value : packed;
}

export function noteMotionCurveExponent(progress: number): number {
  const raw = (progress - 1) * NOTE_POSITION_EXPONENT_SCALE;
  const packed = Math.fround(Math.fround(progress - 1) * NOTE_POSITION_EXPONENT_SCALE);
  return (Number.isFinite(packed) ? packed : raw) * Math.log2(NOTE_POSITION_BASE);
}

export type OrdinaryNoteGoalScale = "perspective" | "target-button" | RenderVector3;

export function repositionOrdinaryNoteToJudgeLine(
  state: OrdinaryNoteMotionState,
  goalScale: OrdinaryNoteGoalScale = "perspective",
): SimulatorResult<OrdinaryNoteMotionResult> {
  const position = vector3(state.goalPosition.x.value, state.goalPosition.y.value, state.currentPositionZ.value);
  if (position.status !== "ok") return position;
  // The scene's thirteen gameplay target transforms have unit local scale.
  const scale = typeof goalScale === "object" ? ok(goalScale) : goalScale === "target-button"
    ? vector3(state.noteSettingScale.value, state.noteSettingScale.value, state.noteSettingScale.value)
    : calculateOrdinaryNoteScaleAtY(state, state.goalPosition.y.value);
  return scale.status === "ok" ? ok(Object.freeze({
    progressRate: state.progressRate,
    position: position.value,
    localScale: scale.value,
  })) : scale;
}

export function advanceOrdinaryNoteActivationAdjustment(
  state: OrdinaryNoteMotionState,
  launcherMusicPosition: number,
  noteAbsolutePosition: number,
  noteBpm: RenderFloat32,
): SimulatorResult<OrdinaryNoteActivationAdjustmentResult> {
  if (
    !Number.isFinite(launcherMusicPosition) ||
    !Number.isFinite(noteAbsolutePosition) ||
    !validateRenderFloat32(noteBpm) ||
    noteBpm.value <= 0
  ) {
    return reject(
      "render.geometry.invalid-activation-adjustment-owner-state",
      "activateAdjust requires finite launcher and note positions and one positive Float32 note BPM.",
    );
  }
  const arrival = getOrdinaryNoteArrivalSeconds(state.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  if (launcherMusicPosition <= noteAbsolutePosition) {
    return ok(Object.freeze({
      lastMotion: null,
      progressRate: state.progressRate,
      realMoveSecond: state.realMoveSecond,
    }));
  }
  const arrivalPositionSpan = Math.fround(
    Math.fround(
      Math.fround(arrival.value.value * noteBpm.value) / Math.fround(240),
    ) * Math.fround(192),
  );
  if (arrivalPositionSpan <= 0) {
    return reject(
      "render.geometry.invalid-activation-arrival-span",
      "activateAdjust requires a positive Float32 arrival span in music-position units.",
    );
  }
  const targetProgress = Math.fround(
    (launcherMusicPosition - noteAbsolutePosition) /
      arrivalPositionSpan,
  );
  const stepDenominator = Math.fround(
    Math.fround(
      Math.fround(
        Math.fround(noteBpm.value * Math.fround(192)) / Math.fround(14400),
      ) * Math.fround(60),
    ) + Math.fround(120),
  );
  const stepValue = Math.fround(Math.fround(1) / stepDenominator);
  const step = createRenderFloat32(stepValue);
  if (step.status !== "ok" || step.value.value <= 0) {
    return reject(
      "render.geometry.invalid-activation-adjustment-step",
      "activateAdjust requires its recovered positive Float32 synthetic Move step.",
    );
  }
  if (targetProgress <= state.progressRate.value) return ok({
    lastMotion: null, progressRate: state.progressRate, realMoveSecond: state.realMoveSecond,
  });
  // The first native Move uses elapsed/arrival when progress is zero; later
  // steps add delta/arrival. Solve that recurrence in host precision, without
  // simulating every Float32 store or calculating invisible intermediate meshes.
  const increment = step.value.value / arrival.value.value;
  const firstElapsed = state.realMoveSecond.value + step.value.value;
  const firstProgress = state.progressRate.value === 0
    ? firstElapsed / arrival.value.value : state.progressRate.value + increment;
  const remaining = Math.max(0, Math.ceil((targetProgress - firstProgress) / increment));
  const finalProgress = createRenderFloat32(Math.fround(firstProgress + remaining * increment));
  const finalElapsed = createRenderFloat32(Math.fround(firstElapsed + remaining * step.value.value));
  if (finalProgress.status !== "ok") return finalProgress;
  if (finalElapsed.status !== "ok") return finalElapsed;
  if (finalProgress.value.value < targetProgress) return reject(
    "render.geometry.non-progressing-activation-adjustment",
    "The host recurrence must reach its requested progress before publishing motion.",
  );
  const zero = createRenderFloat32(0);
  if (zero.status !== "ok") return zero;
  const motion = advanceOrdinaryNoteMotion({ ...state, progressRate: finalProgress.value,
    realMoveSecond: finalElapsed.value, deltaTime: zero.value });
  return motion.status === "ok" ? ok({ lastMotion: motion.value,
    progressRate: finalProgress.value, realMoveSecond: finalElapsed.value }) : motion;
}

export function buildOrdinaryBaseNoteMesh(
  state: OrdinaryBaseNoteMeshOwnerState,
): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  return buildOrdinaryNoteMeshStrip(state, BASE_SECTION_COUNT, BASE_INDICES);
}

export function buildOrdinaryAdvancedNoteMesh(
  state: OrdinaryBaseNoteMeshOwnerState,
): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  return buildOrdinaryNoteMeshStrip(state, ADVANCED_SECTION_COUNT, ADVANCED_INDICES);
}

function buildOrdinaryNoteMeshStrip(
  state: OrdinaryBaseNoteMeshOwnerState,
  sectionCount: number,
  indices: readonly number[],
): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  const validation = validateBaseMeshState(state);
  if (validation.status !== "ok") return validation;
  const front = projectBoundary(
    state.front,
    state.screenToSafeAreaRatio.value,
    state.widthRate.value,
  );
  if (front.status !== "ok") return front;
  const after = projectBoundary(
    state.after,
    state.screenToSafeAreaRatio.value,
    state.widthRate.value,
  );
  if (after.status !== "ok") return after;
  return buildNoteMeshStrip(sectionCount, (rate) => {
    const point = (side: 0 | 1) => vector2(
      interpolate(front.value[side].x.value, after.value[side].x.value, rate),
      interpolate(front.value[side].y.value, after.value[side].y.value, rate),
    );
    const left = point(0);
    if (left.status !== "ok") return left;
    const right = point(1);
    return right.status === "ok" ? ok([left.value, right.value] as const) : right;
  }, state.color, indices);
}

/** Extensions may supply clipped boundaries; topology, UV and colour stay original. */
export function buildNoteMeshStrip(
  sectionCount: number,
  boundaryAt: (rate: number) => SimulatorResult<readonly [RenderVector2, RenderVector2]>,
  color: RenderColor,
  indices: readonly number[] = sectionCount === BASE_SECTION_COUNT ? BASE_INDICES : ADVANCED_INDICES,
  uvRateAt?: (rate: number) => number,
): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  if ((sectionCount !== BASE_SECTION_COUNT && sectionCount !== ADVANCED_SECTION_COUNT) || !validateColor(color)) {
    return reject("render.geometry.invalid-base-mesh-owner-state", "Note strips retain original section counts and finite colour.");
  }
  const vertices: RenderVector3[] = [];
  const uv: RenderVector2[] = [];
  const colors: RenderColor[] = [];
  for (let section = 0; section <= sectionCount; section += 1) {
    const rate = Math.fround(section / sectionCount);
    const boundary = boundaryAt(rate);
    if (boundary.status !== "ok") return boundary;
    for (const side of [0, 1] as const) {
      const x = boundary.value[side].x.value;
      const y = boundary.value[side].y.value;
      const vertex = vector3(x, y, Math.fround(0));
      if (vertex.status !== "ok") return vertex;
      vertices.push(vertex.value);
      const coordinate = vector2(Math.fround(side), uvRateAt === undefined ? rate : Math.fround(uvRateAt(rate)));
      if (coordinate.status !== "ok") return coordinate;
      uv.push(coordinate.value);
      colors.push(copyColor(color));
    }
  }
  return ok(Object.freeze({
    vertices: Object.freeze(vertices),
    indices,
    uv: Object.freeze(uv),
    colors: Object.freeze(colors),
  }));
}

export function buildOrdinaryMultipleDirectionalLine(
  state: OrdinaryMultipleDirectionalLineOwnerState,
): SimulatorResult<OrdinarySyncLineGeometry> {
  if (
    !validateVector3(state.targetA.position) ||
    !validateVector3(state.targetB.position) ||
    !validateRenderFloat32(state.targetA.localScale.x) ||
    state.targetA.localScale.x.value <= 0
  ) {
    return reject(
      "render.geometry.invalid-multiple-directional-line-owner-state",
      "MultipleDirectional back-line geometry requires two committed root positions and one positive owner-local Float32 scale.",
    );
  }
  const extended = state.targetA.unclipped !== undefined || state.targetB.unclipped !== undefined;
  const a = extended ? noteMotionCoordinates(state.targetA) : undefined, b = extended ? noteMotionCoordinates(state.targetB) : undefined;
  const targetAFirst = extended ? coordinateCompare(a!.x, b!.x) <= 0 : state.targetA.position.x.value <= state.targetB.position.x.value;
  const width = createRenderFloat32(Math.fround(
    state.targetA.localScale.x.value * Math.fround(0.75),
  ));
  if (width.status !== "ok") return width;
  return ok(Object.freeze({
    start: targetAFirst ? state.targetA.position : state.targetB.position,
    end: targetAFirst ? state.targetB.position : state.targetA.position,
    width: width.value,
    ...(state.targetA.unclipped || state.targetB.unclipped ? { unclipped: {
      start: [(targetAFirst ? state.targetA : state.targetB).position.x.value, (targetAFirst ? state.targetA : state.targetB).position.y.value] as const,
      end: [(targetAFirst ? state.targetB : state.targetA).position.x.value, (targetAFirst ? state.targetB : state.targetA).position.y.value] as const,
      width: (state.targetA.unclipped?.scale ?? state.targetA.localScale.x.value) * 0.75,
      exponential: { start: targetAFirst ? [a!.x, a!.y] as const : [b!.x, b!.y] as const,
        end: targetAFirst ? [b!.x, b!.y] as const : [a!.x, a!.y] as const, width: coordinateScale(a!.scaleX, 0.75) },
    } } : {}),
  }));
}

export function buildOrdinarySyncLine(
  state: OrdinarySyncLineOwnerState,
): SimulatorResult<OrdinarySyncLineGeometry> {
  if (
    !validateVector3(state.targetA.position) ||
    !validateVector3(state.targetB.position) ||
    !validateRenderFloat32(state.targetA.lossyScaleX) ||
    !validateRenderFloat32(state.targetB.lossyScaleX) ||
    !validateRenderFloat32(state.targetA.localScaleX) ||
    !validateRenderFloat32(state.targetB.localScaleX) ||
    !validateRenderFloat32(state.edgeMargin) ||
    state.edgeMargin.value < 0 ||
    !Number.isInteger(state.targetA.gameNoteType) ||
    !Number.isInteger(state.targetB.gameNoteType)
  ) {
    return reject(
      "render.geometry.invalid-sync-line-owner-state",
      "Sync-line geometry requires two complete Float32 target transforms, non-negative edge margin and exact GameNoteType values.",
    );
  }
  const direction = state.targetA.position.x.value <= state.targetB.position.x.value
    ? Math.fround(1)
    : Math.fround(-1);
  const marginA = syncMargin(state.edgeMargin.value, state.targetA);
  const marginB = syncMargin(state.edgeMargin.value, state.targetB);
  const startX = Math.fround(
    state.targetA.position.x.value + Math.fround(marginA * direction),
  );
  const endX = Math.fround(
    state.targetB.position.x.value - Math.fround(marginB * direction),
  );
  const start = vector3(
    startX,
    state.targetA.position.y.value,
    state.targetA.position.z.value,
  );
  if (start.status !== "ok") return start;
  const end = vector3(
    endX,
    state.targetB.position.y.value,
    state.targetB.position.z.value,
  );
  if (end.status !== "ok") return end;
  const width = createRenderFloat32(Math.fround(
    state.targetA.localScaleX.value * SYNC_LINE_WIDTH_FACTOR,
  ));
  if (width.status !== "ok") return width;
  if (width.value.value <= 0) {
    return reject(
      "render.geometry.degenerate-sync-line",
      "The current portable quad requires a positive width.",
    );
  }
  return ok(Object.freeze({
    start: start.value,
    end: end.value,
    width: width.value,
    ...(state.targetA.unclipped || state.targetB.unclipped ? { unclipped: (() => {
      const a = state.targetA, b = state.targetB;
      const xA = a.unclipped?.x ?? a.position.x.value, xB = b.unclipped?.x ?? b.position.x.value;
      const direction = xA <= xB ? 1 : -1;
      const margin = (target: OrdinarySyncLineTargetState) => target.gameNoteType >= 10 && target.gameNoteType <= 19 ? 0
        : state.edgeMargin.value * (target.unclipped?.lossyScaleX ?? target.lossyScaleX.value);
      const wide = (target: OrdinarySyncLineTargetState) => target.unclipped?.exponential ?? {
        x: coordinate(target.unclipped?.x ?? target.position.x.value), y: coordinate(target.unclipped?.y ?? target.position.y.value),
        localScaleX: coordinate(target.unclipped?.localScaleX ?? target.localScaleX.value),
        lossyScaleX: coordinate(target.unclipped?.lossyScaleX ?? target.lossyScaleX.value) };
      const ea = wide(a), eb = wide(b), sign = coordinateCompare(ea.x, eb.x) <= 0 ? 1 : -1;
      const offset = (target: OrdinarySyncLineTargetState, scale: ExponentialCoordinate) =>
        coordinateScale(scale, target.gameNoteType >= 10 && target.gameNoteType <= 19 ? 0 : state.edgeMargin.value * sign);
      return { start: [xA + margin(a) * direction, a.unclipped?.y ?? a.position.y.value] as const,
        end: [xB - margin(b) * direction, b.unclipped?.y ?? b.position.y.value] as const,
        width: (a.unclipped?.localScaleX ?? a.localScaleX.value) * SYNC_LINE_WIDTH_FACTOR,
        exponential: { start: [coordinateAdd(ea.x, offset(a, ea.lossyScaleX)), ea.y] as const,
          end: [coordinateAdd(eb.x, coordinateScale(offset(b, eb.lossyScaleX), -1)), eb.y] as const,
          width: coordinateScale(ea.localScaleX, SYNC_LINE_WIDTH_FACTOR) } };
    })() } : {}),
  }));
}

export function calculateOrdinaryNoteScaleAtY(
  state: OrdinaryNoteMotionState,
  currentY: number,
): SimulatorResult<RenderVector3> {
  const denominator = Math.abs(Math.fround(
    state.launcherY.value - state.targetCenterY.value,
  ));
  if (denominator === 0) {
    return reject(
      "render.geometry.degenerate-note-scale-range",
      "calcNoteScale requires distinct Launcher and target-center Y positions.",
    );
  }
  const scale = ordinaryNoteScaleValue(state, currentY);
  return vector3(scale, scale, 0);
}

function ordinaryNoteScaleValue(state: OrdinaryNoteMotionState, currentY: number, hostPrecision = false): number {
  const pack = hostPrecision ? (value: number) => value : Math.fround;
  const denominator = Math.abs(pack(state.launcherY.value - state.targetCenterY.value));
  const verticalRate = pack(state.noteSettingScale.value * pack(
    Math.abs(pack(state.launcherY.value - currentY)) / denominator));
  const aspect = Math.fround(Math.min(1, Math.max(0, state.highAspectRatio.value)));
  const aspectRatio = Math.fround(Math.fround(aspect * Math.fround(
    NOTE_SCALE_MIN_RATIOS[state.buttonCount - 1]! - NOTE_SCALE_ASPECT_BASE)) + NOTE_SCALE_ASPECT_BASE);
  return pack(pack(verticalRate * aspectRatio) + Math.fround(1 - aspectRatio));
}

function validateBaseMeshState(
  state: OrdinaryBaseNoteMeshOwnerState,
): SimulatorResult<void> {
  if (
    !validateEndpoint(state.front) ||
    !validateEndpoint(state.after) ||
    !validateRenderFloat32(state.screenToSafeAreaRatio) ||
    state.screenToSafeAreaRatio.value <= 0 ||
    !validateRenderFloat32(state.widthRate) ||
    state.widthRate.value <= 0 ||
    !validateColor(state.color)
  ) {
    return reject(
      "render.geometry.invalid-base-mesh-owner-state",
      "The base NoteMesh requires two complete endpoint owners, positive Float32 safe-area/width rates and one uniform evidence color.",
    );
  }
  return ok(undefined);
}

function validateEndpoint(value: OrdinaryNoteMeshEndpoint): boolean {
  return validateVector2(value.position) &&
    validateRenderFloat32(value.localScaleX) &&
    value.localScaleX.value > 0 &&
    Number.isInteger(value.buttonCount) &&
    value.buttonCount >= 1;
}

function projectBoundary(
  endpoint: OrdinaryNoteMeshEndpoint,
  safeAreaRatio: number,
  widthRate: number,
): SimulatorResult<readonly [RenderVector2, RenderVector2]> {
  const halfWidth = calculateNoteMeshHalfWidth(endpoint.localScaleX.value, endpoint.buttonCount, safeAreaRatio, widthRate);
  const left = vector2(
    Math.fround(endpoint.position.x.value - halfWidth),
    endpoint.position.y.value,
  );
  if (left.status !== "ok") return left;
  const right = vector2(
    Math.fround(endpoint.position.x.value + halfWidth),
    endpoint.position.y.value,
  );
  return right.status === "ok"
    ? ok(Object.freeze([left.value, right.value]))
    : right;
}

export function calculateNoteMeshHalfWidth(scale: number, width: number, safeAreaRatio: number, widthRate = 1): number {
  return Math.fround(Math.fround(Math.fround(scale * width) * safeAreaRatio) * widthRate);
}

function syncMargin(
  edgeMargin: number,
  target: OrdinarySyncLineTargetState,
): number {
  if (target.gameNoteType >= 10 && target.gameNoteType <= 19) return Math.fround(0);
  return Math.fround(edgeMargin * target.lossyScaleX.value);
}

function interpolate(start: number, end: number, rate: number): number {
  return Math.fround(
    Math.fround(start * Math.fround(1 - rate)) + Math.fround(end * rate),
  );
}

function vector2(x: number, y: number): SimulatorResult<RenderVector2> {
  const frozenX = createRenderFloat32(x);
  if (frozenX.status !== "ok") return frozenX;
  const frozenY = createRenderFloat32(y);
  return frozenY.status === "ok"
    ? ok(Object.freeze({ x: frozenX.value, y: frozenY.value }))
    : frozenY;
}

function vector3(x: number, y: number, z: number): SimulatorResult<RenderVector3> {
  const xy = vector2(x, y);
  if (xy.status !== "ok") return xy;
  const frozenZ = createRenderFloat32(z);
  return frozenZ.status === "ok"
    ? ok(Object.freeze({ ...xy.value, z: frozenZ.value }))
    : frozenZ;
}

function validateVector2(value: RenderVector2): boolean {
  return value !== null && typeof value === "object" &&
    validateRenderFloat32(value.x) && validateRenderFloat32(value.y);
}

function validateVector3(value: RenderVector3): boolean {
  return validateVector2(value) && validateRenderFloat32(value.z);
}

function validateColor(value: RenderColor): boolean {
  return value !== null && typeof value === "object" &&
    validateRenderFloat32(value.red) &&
    validateRenderFloat32(value.green) &&
    validateRenderFloat32(value.blue) &&
    validateRenderFloat32(value.alpha);
}

function copyColor(value: RenderColor): RenderColor {
  return Object.freeze({
    red: Object.freeze({ ...value.red }),
    green: Object.freeze({ ...value.green }),
    blue: Object.freeze({ ...value.blue }),
    alpha: Object.freeze({ ...value.alpha }),
  });
}

function reject(capability: string, boundary: string) {
  return integrityFailure(
    capability,
    boundary,
  );
}
