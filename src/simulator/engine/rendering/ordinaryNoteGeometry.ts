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
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";

const BASE_SECTION_COUNT = 10;
const SYNC_LINE_WIDTH_FACTOR = Math.fround(0.2800000011920929);

const BASE_INDICES = Object.freeze(Array.from(
  { length: BASE_SECTION_COUNT },
  (_, section) => {
    const left = section * 2;
    return [left, left + 2, left + 1, left + 1, left + 2, left + 3];
  },
).flat());

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

export function buildOrdinaryBaseNoteMesh(
  state: OrdinaryBaseNoteMeshOwnerState,
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
  for (let section = 0; section <= BASE_SECTION_COUNT; section += 1) {
    const rate = Math.fround(section / BASE_SECTION_COUNT);
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
    indices: BASE_INDICES,
    uv: Object.freeze(uv),
    colors: Object.freeze(colors),
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
  return evidenceRequired(
    capability,
    ["RPR-D05", "RPR-D06", "RPR-D07", "RPR-D14", "PR11", "PR13", "PR16"],
    boundary,
  );
}
