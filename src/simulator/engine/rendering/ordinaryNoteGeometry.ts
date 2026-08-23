import type {
  RenderColor,
  RenderFloat32,
  RenderVector2,
  RenderVector3,
} from "../../backends/renderingContracts";
import {
  createRenderFloat32,
  validateRenderFloat32,
} from "../../backends/renderingValidation";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../evidence";

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
  readonly vertices: readonly RenderVector3[];
  readonly indices: readonly number[];
  readonly uv: readonly RenderVector2[];
  readonly colors: readonly RenderColor[];
}

export interface OrdinarySyncLineTargetState {
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
  readonly noteSettingScale: RenderFloat32;
  readonly launcherY: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly highAspectRatio: RenderFloat32;
  readonly buttonCount: number;
  readonly virtualLaneControllerPresent: boolean;
}

export interface OrdinaryNoteMotionResult {
  readonly progressRate: RenderFloat32;
  readonly position: RenderVector3;
  readonly localScale: RenderVector3;
}

export interface OrdinaryNoteActivationAdjustmentResult {
  readonly motions: readonly OrdinaryNoteMotionResult[];
  readonly progressRate: RenderFloat32;
  readonly realMoveSecond: RenderFloat32;
}

export function getHabahiroMeshWidthRate(
  noteLength: number,
  explicitSetting: RenderFloat32,
): SimulatorResult<RenderFloat32> {
  if (
    !Number.isInteger(noteLength) || noteLength < 1 || noteLength > 7 ||
    !validateRenderFloat32(explicitSetting)
  ) {
    return reject(
      "render.geometry.invalid-habahiro-mesh-width-input",
      "The current static HABAHIRO width formula requires a 1..7 note length and explicit Float32 host setting.",
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
    !validateRenderFloat32(state.progressRate) ||
    !validateRenderFloat32(state.deltaTime) ||
    state.deltaTime.value < 0 ||
    !validateRenderFloat32(state.realMoveSecond) ||
    state.realMoveSecond.value < 0 ||
    !validateVector2(state.goalPosition) ||
    !validateVector2(state.noteStartPosition) ||
    !validateRenderFloat32(state.currentPositionZ) ||
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
  const arrival = getOrdinaryNoteArrivalSeconds(state.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  const progressValue = state.progressRate.value === 0
    ? Math.fround(state.realMoveSecond.value / arrival.value.value)
    : Math.fround(
      state.progressRate.value + Math.fround(state.deltaTime.value / arrival.value.value),
    );
  const progress = createRenderFloat32(progressValue);
  if (progress.status !== "ok") return progress;
  const exponent = Math.fround(
    Math.fround(progress.value.value - Math.fround(1)) * NOTE_POSITION_EXPONENT_SCALE,
  );
  const curve = Math.fround(Math.pow(NOTE_POSITION_BASE, exponent));
  const x = Math.fround(
    state.noteStartPosition.x.value + Math.fround(
      curve * Math.fround(
        state.goalPosition.x.value - state.noteStartPosition.x.value,
      ),
    ),
  );
  const y = Math.fround(
    state.noteStartPosition.y.value - Math.abs(Math.fround(
      Math.fround(state.noteStartPosition.y.value - state.goalPosition.y.value) * curve,
    )),
  );
  const position = vector3(x, y, state.currentPositionZ.value);
  if (position.status !== "ok") return position;
  const scale = calculateOrdinaryNoteScale(state, y);
  if (scale.status !== "ok") return scale;
  return ok(Object.freeze({
    progressRate: progress.value,
    position: position.value,
    localScale: scale.value,
  }));
}

export function advanceOrdinaryNoteActivationAdjustment(
  state: OrdinaryNoteMotionState,
  launcherMusicPosition: RenderFloat32,
  noteAbsolutePosition: number,
  noteBpm: RenderFloat32,
): SimulatorResult<OrdinaryNoteActivationAdjustmentResult> {
  if (
    !validateRenderFloat32(launcherMusicPosition) ||
    !Number.isSafeInteger(noteAbsolutePosition) ||
    !validateRenderFloat32(noteBpm) ||
    noteBpm.value <= 0
  ) {
    return reject(
      "render.geometry.invalid-activation-adjustment-owner-state",
      "activateAdjust requires one Float32 LauncherMusicPos, one Int32 note position and one positive Float32 note BPM.",
    );
  }
  const arrival = getOrdinaryNoteArrivalSeconds(state.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  if (launcherMusicPosition.value <= noteAbsolutePosition) {
    return ok(Object.freeze({
      motions: Object.freeze([]),
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
    Math.fround(launcherMusicPosition.value - noteAbsolutePosition) /
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
  let progress = state.progressRate;
  let realMoveSecond = state.realMoveSecond;
  const motions: OrdinaryNoteMotionResult[] = [];
  while (targetProgress > progress.value) {
    const nextRealMoveSecond = createRenderFloat32(Math.fround(
      realMoveSecond.value + step.value.value,
    ));
    if (nextRealMoveSecond.status !== "ok") return nextRealMoveSecond;
    const motion = advanceOrdinaryNoteMotion({
      ...state,
      progressRate: progress,
      deltaTime: step.value,
      realMoveSecond: nextRealMoveSecond.value,
    });
    if (motion.status !== "ok") return motion;
    if (motion.value.progressRate.value <= progress.value) {
      return reject(
        "render.geometry.non-progressing-activation-adjustment",
        "activateAdjust must advance progress on every recovered synthetic Move iteration.",
      );
    }
    motions.push(motion.value);
    progress = motion.value.progressRate;
    realMoveSecond = nextRealMoveSecond.value;
  }
  return ok(Object.freeze({
    motions: Object.freeze(motions),
    progressRate: progress,
    realMoveSecond,
  }));
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
  const vertices: RenderVector3[] = [];
  const uv: RenderVector2[] = [];
  const colors: RenderColor[] = [];
  for (let section = 0; section <= sectionCount; section += 1) {
    const rate = Math.fround(section / sectionCount);
    for (const side of [0, 1] as const) {
      const x = interpolate(front.value[side].x.value, after.value[side].x.value, rate);
      const y = interpolate(front.value[side].y.value, after.value[side].y.value, rate);
      const vertex = vector3(x, y, Math.fround(0));
      if (vertex.status !== "ok") return vertex;
      vertices.push(vertex.value);
      const coordinate = vector2(Math.fround(side), rate);
      if (coordinate.status !== "ok") return coordinate;
      uv.push(coordinate.value);
      colors.push(copyColor(state.color));
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
  if (
    Math.hypot(
      state.targetB.position.x.value - state.targetA.position.x.value,
      state.targetB.position.y.value - state.targetA.position.y.value,
    ) === 0
  ) {
    return reject(
      "render.geometry.degenerate-multiple-directional-line",
      "The observed MultipleDirectional back line requires distinct root positions.",
    );
  }
  const targetAFirst = state.targetA.position.x.value <= state.targetB.position.x.value;
  const width = createRenderFloat32(Math.fround(
    state.targetA.localScale.x.value * Math.fround(0.75),
  ));
  if (width.status !== "ok") return width;
  return ok(Object.freeze({
    start: targetAFirst ? state.targetA.position : state.targetB.position,
    end: targetAFirst ? state.targetB.position : state.targetA.position,
    width: width.value,
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
  if (
    width.value.value <= 0 ||
    Math.hypot(
      end.value.x.value - start.value.x.value,
      end.value.y.value - start.value.y.value,
    ) === 0
  ) {
    return reject(
      "render.geometry.degenerate-sync-line",
      "The current portable quad requires a positive width and distinct projected XY endpoints.",
    );
  }
  return ok(Object.freeze({
    start: start.value,
    end: end.value,
    width: width.value,
  }));
}

function calculateOrdinaryNoteScale(
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
  const verticalRate = Math.fround(
    state.noteSettingScale.value * Math.fround(
      Math.abs(Math.fround(state.launcherY.value - currentY)) / denominator,
    ),
  );
  const aspect = Math.fround(Math.min(1, Math.max(0, state.highAspectRatio.value)));
  const aspectRatio = Math.fround(
    Math.fround(aspect * Math.fround(
      NOTE_SCALE_MIN_RATIOS[state.buttonCount - 1]! - NOTE_SCALE_ASPECT_BASE,
    )) + NOTE_SCALE_ASPECT_BASE,
  );
  const uniform = Math.fround(
    Math.fround(verticalRate * aspectRatio) + Math.fround(Math.fround(1) - aspectRatio),
  );
  return vector3(uniform, uniform, Math.fround(0));
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
    value.buttonCount >= 1 &&
    value.buttonCount <= 7;
}

function projectBoundary(
  endpoint: OrdinaryNoteMeshEndpoint,
  safeAreaRatio: number,
  widthRate: number,
): SimulatorResult<readonly [RenderVector2, RenderVector2]> {
  const halfWidth = Math.fround(Math.fround(Math.fround(
    endpoint.localScaleX.value * endpoint.buttonCount,
  ) * safeAreaRatio) * widthRate);
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
    ["RPR-D05", "RPR-D06", "RPR-D07", "RPR-D14", "RPR-R4-010", "RPR-R4-013", "PR09", "PR11", "PR13", "PR16", "PR17"],
    boundary,
  );
}
