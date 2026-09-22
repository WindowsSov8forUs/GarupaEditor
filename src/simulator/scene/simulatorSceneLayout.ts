import { isOriginalLongNoteLineBrightness } from "../engine/data/originalLiveSettings";
import type {
  ManualInputWorldPosition,
  SimulatorManualInputGeometryBackend,
} from "../backends/contracts";
import {
  copyAndValidateInitialSimulatorSurface,
  type SimulatorSurfaceState,
} from "../platform/surfaceContracts";
import {
  createOriginalSurfaceLayout,
  ORIGINAL_NOTE_LANE_BOTTOM_Y,
  originalBottomLeftScreenToWorld,
  originalWorldToBottomLeftScreen,
  type OriginalSurfaceLayout,
} from "./originalSurfaceLayout";
import type { ParticlePixiSceneProfile } from "../backends/particleContracts";
import { particleFloat32ToBits } from "../backends/particleValidation";
import { calculateNativeParticleSetupFactors } from "../engine/particles/particleHierarchyScale";
import type {
  RenderColor,
  RenderFloat32,
  RenderVector2,
  RenderVector3,
} from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { ButtonType, type ButtonTypeValue } from "../engine/chart/types";
import { encodeVirtualLanePosition, virtualLaneNoteX, virtualLaneUnit } from "../engine/chart/virtualLane";
import type { ManualInputPosition } from "../engine/data/manualInput";
import { integrityFailure, ok, type SimulatorResult } from "../engine/result";
import {
  advanceOrdinaryNoteMotion,
  calculateOrdinaryNoteScaleAtY,
  interpolateOrdinaryNoteX,
  calculateOrdinaryNoteStartDepth,
  getOrdinaryNoteArrivalSeconds,
  type OrdinaryNoteMotionState,
} from "../engine/rendering/ordinaryNoteGeometry";
import type {
  HabahiroSceneInput,
  OrdinaryFixedNoteSceneInput,
  RenderEngineResourceBindings,
  RenderFieldMaskPlan,
  RenderFieldObjectPlan,
} from "../engine/rendering/renderCommandProducer";

const LAUNCH_DISTANCE_RATE = Math.fround(0.05000000074505806);
const NOTE_WORLD_Z = Math.fround(-13.5);
const DEFAULT_COLLISION_SQUARED = Math.fround(0.23136097192764282);
const COLLISION_DISTANCE_RATE = Math.fround(1.1679999828338623);
const SWEET_COLLISION_RATE = Math.fround(1.0800000429153442);
const SLIDE_FRAME_SECONDS = Math.fround(1 / 60);
const SLIDE_TERMINAL_Y_DISTANCE = Math.fround(100);
// Reverse 1bff69eb: level3 Button1..Button7 and six half-button local X values.
const AUTHORED_BUTTON_X = Object.freeze([
  Math.fround(-6.599999904632568), Math.fround(-5.5),
  Math.fround(-4.400000095367432), Math.fround(-3.299999952316284),
  Math.fround(-2.200000047683716), Math.fround(-1.100000023841858),
  Math.fround(0), Math.fround(1.100000023841858),
  Math.fround(2.200000047683716), Math.fround(3.299999952316284),
  Math.fround(4.400000095367432), Math.fround(5.5),
  Math.fround(6.599999904632568),
] as const);

export interface SimulatorSceneVisualConfig {
  readonly longNoteLineBrightness: number;
  readonly suddenRate: number;
  readonly suddenLane: boolean;
  readonly specificSpeed: number;
  readonly noteSize: number;
  readonly judgementAdjustValueB: number;
  readonly displayComboPosition: number;
  readonly habahiroMeshWidthSetting: number;
  readonly syncLineEdgeMargin: number;
}

export type SimulatorSceneSurfaceProfile = SimulatorSurfaceState;

export interface GarupaProductFieldLine {
  readonly lane: number;
  readonly start: RenderVector3;
  readonly goal: RenderVector3;
}

export interface GarupaProductSceneLayout {
  readonly virtualPerfectLine: number;
  readonly visibleCurveRange: readonly [number, number];
  readonly visibleLaneRangeAtCurve: (curve: number) => readonly [number, number];
  readonly motionStateAtLane: (lane: number, width: number, absolutePosition: number) => SimulatorResult<OrdinaryNoteMotionState>;
  readonly laneSpacingWorld: RenderFloat32;
  readonly noteSettingScale: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly screenToSafeAreaRatio: RenderFloat32;
  readonly screenWidthAdjustRate: RenderFloat32;
  readonly fieldLines: readonly GarupaProductFieldLine[];
  readonly projectLaneAtCurve: (lane: number, curve: number) => SimulatorResult<RenderVector3>;
  readonly projectNoteScaleAtCurve: (curve: number, authoredWidth: number) => SimulatorResult<RenderFloat32>;
  readonly isInsideContinuousSpan: (
    position: ManualInputPosition,
    spanStart: number,
    width: number,
    isSweetCollision?: boolean,
  ) => SimulatorResult<boolean>;
}

export interface SimulatorSceneLayout {
  readonly surfaceLayout: OriginalSurfaceLayout;
  readonly ordinaryNoteScene: OrdinaryFixedNoteSceneInput;
  readonly particleScene: ParticlePixiSceneProfile;
  readonly manualInputGeometry: SimulatorManualInputGeometryBackend;
  readonly garupaProductScene: GarupaProductSceneLayout;
}

export function createSimulatorSceneLayout(
  surface: SimulatorSceneSurfaceProfile,
  config: SimulatorSceneVisualConfig,
  renderingKind: "ordinary" | "habahiro",
  resources: RenderEngineResourceBindings,
  fieldBindings: {
    readonly backgroundLineLogicalAssetId: string;
    readonly judgeLineLogicalAssetId: string;
  } | null = null,
): SimulatorResult<SimulatorSceneLayout> {
  const checkedSurface = copyAndValidateInitialSimulatorSurface(surface);
  if (checkedSurface.status !== "ok") return checkedSurface;
  if (
    !isOriginalLongNoteLineBrightness(config.longNoteLineBrightness) ||
    !exactPositiveFloat32(config.specificSpeed) ||
    !exactFloat32(config.noteSize) || config.noteSize < 80 || config.noteSize > 150 ||
    !Number.isInteger(config.judgementAdjustValueB) || config.judgementAdjustValueB < -5 || config.judgementAdjustValueB > 5 ||
    !exactFloat32(config.habahiroMeshWidthSetting) ||
    !exactFloat32(config.syncLineEdgeMargin)
  ) {
    return reject(
      "scene.invalid-visual-config",
      "Scene assembly requires exact Float32 speed, evidence-bounded 80..150 note size, [-5,5] judge offset and explicit HABAHIRO mesh width; HighAspectRatio is derived only from the platform surface.",
    );
  }
  const originalLayout = createOriginalSurfaceLayout(checkedSurface.value, config.noteSize, config.displayComboPosition, config.suddenRate, config.suddenLane);
  if (originalLayout.status !== "ok") return originalLayout;
  const values = createSceneValues(config, originalLayout.value);
  if (values.status !== "ok") return values;
  const arrival = getOrdinaryNoteArrivalSeconds(values.value.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  const habahiro = renderingKind === "habahiro"
    ? createPortableHabahiroScene(resources, config.habahiroMeshWidthSetting, originalLayout.value)
    : ok<HabahiroSceneInput | undefined>(undefined);
  if (habahiro.status !== "ok") return habahiro;
  const field = renderingKind === "ordinary" && fieldBindings !== null
    ? createOriginalSkinFieldScene(fieldBindings, originalLayout.value)
    : undefined;
  const ordinaryNoteScene: OrdinaryFixedNoteSceneInput = Object.freeze({
    specificSpeed: values.value.specificSpeed,
    noteSettingScale: values.value.noteSettingScale,
    noteParentScale: values.value.noteParentScale,
    launcherY: values.value.launcherY,
    targetCenterY: values.value.targetCenterY,
    highAspectRatio: values.value.highAspectRatio,
    pixelsPerWorldUnit: originalLayout.value.camera.pixelsPerWorldUnit,
    viewportX: [-originalLayout.value.camera.halfWidthWorld, originalLayout.value.camera.halfWidthWorld] as const,
    viewportY: [-originalLayout.value.camera.halfHeightWorld, originalLayout.value.camera.halfHeightWorld] as const,
    noteLineClipY: f32(originalLayout.value.gameplay.noteLineClipY),
    noteStartPositions: values.value.noteStartPositions,
    goalPositions: values.value.goalPositions,
    tapLaneEffectPositions: Object.freeze(AUTHORED_BUTTON_X.filter((_, index) => index % 2 === 0).map((authoredX) =>
      vector3(
        Math.fround(authoredX * originalLayout.value.gameplay.screenWidthAdjustRate),
        originalLayout.value.gameplay.targetCenterY,
        NOTE_WORLD_Z,
      ))),
    noteTint: white(),
    noteDomainLayer: 3,
    syncLineEdgeMargin: f32(config.syncLineEdgeMargin),
    screenToSafeAreaRatio: f32(originalLayout.value.starUi.screenToSafeAreaRatio),
    // NoteMesh.initMesh initializes alpha from the saved percentage; RGB changes preserve it.
    longMeshColor: color(1, 1, 1, config.longNoteLineBrightness / 100),
    ...(field === undefined ? {} : { field }),
    ...(habahiro.value === undefined ? {} : { habahiro: habahiro.value }),
  });
  const geometry = new CurrentSimulatorManualGeometry(
    values.value,
    config.judgementAdjustValueB,
    renderingKind,
    originalLayout.value,
  );
  const particleScene = createParticleScene(values.value.goalPositions, originalLayout.value);
  if (particleScene.status !== "ok") return particleScene;
  const slideJudge = geometry.getSlideJudgeGeometry();
  if (slideJudge.status !== "ok") return slideJudge;
  const productScene = createGarupaProductScene(values.value, slideJudge.value.virtualPerfectLine);
  if (productScene.status !== "ok") return productScene;
  return ok(Object.freeze({
    surfaceLayout: originalLayout.value,
    ordinaryNoteScene,
    particleScene: particleScene.value,
    manualInputGeometry: geometry,
    garupaProductScene: productScene.value,
  }));
}

interface SceneValues {
  readonly surfaceLayout: OriginalSurfaceLayout;
  readonly specificSpeed: RenderFloat32;
  readonly noteSettingScale: RenderFloat32;
  readonly noteParentScale: RenderFloat32;
  readonly launcherY: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly highAspectRatio: RenderFloat32;
  readonly noteStartPositions: readonly RenderVector3[];
  readonly goalPositions: readonly RenderVector3[];
}

function createSceneValues(
  config: SimulatorSceneVisualConfig,
  layout: OriginalSurfaceLayout,
): SimulatorResult<SceneValues> {
  const targetCenterY = layout.gameplay.targetCenterY;
  const launcherY = layout.gameplay.launcherY;
  const vanishingY = layout.gameplay.vanishingY;
  const noteStartPositions: RenderVector3[] = [];
  const goalPositions: RenderVector3[] = [];
  for (let lane = 0; lane < 7; lane += 1) {
    const goalX = Math.fround(Math.fround(lane - 3) * layout.gameplay.laneSpacingWorld);
    const startX = Math.fround(goalX * LAUNCH_DISTANCE_RATE);
    const startY = Math.fround(
      targetCenterY + Math.fround(
        Math.fround(Math.fround(1) - LAUNCH_DISTANCE_RATE) *
          Math.fround(vanishingY - targetCenterY),
      ),
    );
    goalPositions.push(vector3(goalX, targetCenterY, NOTE_WORLD_Z));
    // SORT-C43: initLauncher publishes Z=0; activation adds the per-note depth.
    noteStartPositions.push(vector3(startX, startY, 0));
  }
  return ok(Object.freeze({
    surfaceLayout: layout,
    specificSpeed: f32(config.specificSpeed),
    noteSettingScale: f32(layout.gameplay.noteSettingScale),
    noteParentScale: f32(layout.gameplay.noteParentScale),
    launcherY: f32(launcherY),
    targetCenterY: f32(targetCenterY),
    highAspectRatio: f32(layout.starUi.highAspectRatio),
    noteStartPositions: Object.freeze(noteStartPositions),
    goalPositions: Object.freeze(goalPositions),
  }));
}

function createGarupaProductScene(
  scene: SceneValues,
  virtualPerfectLine: number,
): SimulatorResult<GarupaProductSceneLayout> {
  const laneSpacing = Math.fround(
    scene.goalPositions[4]!.x.value - scene.goalPositions[3]!.x.value,
  );
  if (!Number.isFinite(laneSpacing) || laneSpacing <= 0) {
    return reject(
      "scene.invalid-product-lane-spacing",
      "Continuous product projection requires the unchanged positive original lane spacing.",
    );
  }
  const projectLaneAtCurve = (
    lane: number,
    curve: number,
  ): SimulatorResult<RenderVector3> => {
    const encodedLane = encodeVirtualLanePosition(lane);
    if (encodedLane === null || !Number.isFinite(curve)) {
      return reject(
        "scene.invalid-product-projection",
        "Product lane, encoded virtual-lane distance and curve coordinates must remain finite and cannot be clamped.",
      );
    }
    const originalLane = Number.isInteger(lane) && lane >= 0 && lane <= 6
      ? lane
      : null;
    const baseLane = encodedLane.baseLane;
    const goalX = scene.goalPositions[baseLane]!.x.value;
    const startX = scene.noteStartPositions[baseLane]!.x.value;
    const startY = scene.noteStartPositions[3]!.y.value;
    const goalY = scene.targetCenterY.value;
    if (curve === 0 && originalLane !== null) return ok(vector3(startX, startY, NOTE_WORLD_Z));
    if (curve === 1 && originalLane !== null) return ok(scene.goalPositions[originalLane]!);
    const projectedX = interpolateOrdinaryNoteX(
      virtualLaneNoteX(encodedLane,
        virtualLaneUnit(scene.noteStartPositions[0]!.x.value, scene.noteStartPositions[1]!.x.value), startX),
      virtualLaneNoteX(encodedLane,
        virtualLaneUnit(scene.goalPositions[0]!.x.value, scene.goalPositions[1]!.x.value), goalX),
      curve,
    );
    const projectedY = Math.fround(startY + Math.fround(curve * Math.fround(goalY - startY)));
    if (!Number.isFinite(projectedX) || !Number.isFinite(projectedY)) {
      return reject(
        "scene.invalid-product-projection",
        "A finite authored product curve that overflows portable Float32 scene coordinates cannot publish geometry or be clamped.",
      );
    }
    return ok(vector3(projectedX, projectedY, NOTE_WORLD_Z));
  };
  const scaleZero = f32(0);
  const scaleMotion = motionState(scene, 3, scaleZero, scaleZero, scaleZero);
  const scaleSources = Array.from({ length: 7 }, (_, index) =>
    Object.freeze({ ...scaleMotion, buttonCount: index + 1 }));
  const projectNoteScaleAtCurve = (
    curve: number,
    authoredWidth: number,
  ): SimulatorResult<RenderFloat32> => {
    if (!Number.isFinite(curve) || !Number.isInteger(authoredWidth) || authoredWidth <= 0 || authoredWidth > 7) {
      return reject(
        "scene.invalid-product-note-scale",
        "Product Note scale requires one finite curve and a body width from 1 to 7; Directional members use width 1.",
      );
    }
    const projected = projectLaneAtCurve(3, curve);
    if (projected.status !== "ok") return projected;
    const scaled = calculateOrdinaryNoteScaleAtY(
      scaleSources[authoredWidth - 1]!,
      projected.value.y.value,
    );
    return scaled.status === "ok"
      ? ok(scaled.value.x)
      : integrityFailure(scaled.capability, scaled.boundary);
  };
  const collisionSquared = calculateTargetCollisionSquared(scene);
  const isInsideContinuousSpan = (
    position: ManualInputPosition,
    spanStart: number,
    width: number,
    isSweetCollision = false,
  ): SimulatorResult<boolean> => {
    if (!Number.isFinite(spanStart) || !Number.isInteger(width) || width <= 0) {
      return reject("scene.invalid-product-span", "Continuous target geometry requires one finite start and positive integer width.");
    }
    if (!validPosition(position)) return reject("scene.invalid-product-input-position", "Continuous target input requires finite bottom-left screen coordinates.");
    const world = originalBottomLeftScreenToWorld(scene.surfaceLayout, position.x, position.y);
    if (world.status !== "ok") return world;
    const lane = 3 + world.value[0] / laneSpacing;
    // The targets are ordered at unit lane intervals. Only the nearest member
    // and its neighbours can minimize distance; never expand an unbounded
    // Directional width into a per-touch array or scan all of its members.
    const nearest = Math.min(width - 1, Math.max(0, Math.round(lane - spanStart)));
    let previous = -1;
    for (const offset of [-1, 0, 1]) {
      const index = Math.min(width - 1, Math.max(0, nearest + offset));
      if (index === previous) continue;
      previous = index;
      const target = projectLaneAtCurve(spanStart + index, 1);
      if (target.status !== "ok") return target;
      if (isInsideNoteTarget(world.value[0], world.value[1], target.value.x.value,
        target.value.y.value, collisionSquared, isSweetCollision)) return ok(true);
    }
    return ok(false);
  };
  const fieldLines: GarupaProductFieldLine[] = [];
  for (let lane = 0; lane < 7; lane += 1) {
    const start = projectLaneAtCurve(lane, 0);
    const goal = projectLaneAtCurve(lane, 1);
    if (start.status !== "ok") {
      return integrityFailure(start.capability, start.boundary);
    }
    if (goal.status !== "ok") {
      return integrityFailure(goal.capability, goal.boundary);
    }
    fieldLines.push(Object.freeze({ lane, start: start.value, goal: goal.value }));
  }
  const startY = scene.noteStartPositions[3]!.y.value;
  const travelY = scene.targetCenterY.value - startY;
  const topCurve = (scene.surfaceLayout.camera.halfHeightWorld - startY) / travelY;
  const bottomCurve = (-scene.surfaceLayout.camera.halfHeightWorld - startY) / travelY;
  return ok(Object.freeze({
    virtualPerfectLine,
    visibleCurveRange: [Math.min(topCurve, bottomCurve), Math.max(topCurve, bottomCurve)] as const,
    visibleLaneRangeAtCurve: (curve: number): readonly [number, number] => {
      if (!Number.isFinite(curve)) return [1, 0];
      const spacing = laneSpacing * (LAUNCH_DISTANCE_RATE + (1 - LAUNCH_DISTANCE_RATE) * curve);
      const left = originalBottomLeftScreenToWorld(scene.surfaceLayout, 0, 0);
      const right = originalBottomLeftScreenToWorld(scene.surfaceLayout, scene.surfaceLayout.surface.viewportWidth, 0);
      if (left.status !== "ok" || right.status !== "ok") throw new Error("scene.directional-viewport-unavailable");
      return [3 + left.value[0] / spacing, 3 + right.value[0] / spacing];
    },
    motionStateAtLane: (lane: number, width: number, absolutePosition: number): SimulatorResult<OrdinaryNoteMotionState> => {
      const start = projectLaneAtCurve(lane, 0);
      const goal = projectLaneAtCurve(lane, 1);
      if (start.status !== "ok") return start;
      if (goal.status !== "ok") return goal;
      return ok({ ...motionState(scene, 3, f32(0), f32(0), f32(0)),
        noteStartPosition: start.value, goalPosition: goal.value,
        currentPositionZ: f32(calculateOrdinaryNoteStartDepth(scene.noteStartPositions[3]!.z.value, absolutePosition, lane)),
        buttonCount: width });
    },
    laneSpacingWorld: f32(laneSpacing),
    noteSettingScale: scene.noteSettingScale,
    targetCenterY: scene.targetCenterY,
    screenToSafeAreaRatio: f32(scene.surfaceLayout.starUi.screenToSafeAreaRatio),
    screenWidthAdjustRate: f32(scene.surfaceLayout.gameplay.screenWidthAdjustRate),
    fieldLines: Object.freeze(fieldLines),
    projectLaneAtCurve,
    projectNoteScaleAtCurve,
    isInsideContinuousSpan,
  }));
}

class CurrentSimulatorManualGeometry implements SimulatorManualInputGeometryBackend {
  private habahiroLaneChanged = false;
  private readonly judgePositions: readonly number[];
  private readonly virtualPerfectLine: number;
  private readonly collisionSquared: number;

  constructor(
    private readonly scene: SceneValues,
    judgementAdjustValueB: number,
    private readonly renderingKind: "ordinary" | "habahiro",
    private readonly surfaceLayout: OriginalSurfaceLayout,
  ) {
    this.collisionSquared = calculateTargetCollisionSquared(scene);
    const generated = generateSlideJudgePositions(scene);
    this.judgePositions = generated;
    const goalY = scene.goalPositions[3]!.y.value;
    const overedIndex = generated.findIndex((value) => value > goalY);
    const selected = overedIndex - 1 + judgementAdjustValueB;
    if (overedIndex <= 0 || selected < 0 || selected >= generated.length) {
      throw new Error("scene.slide-judge-profile-out-of-range");
    }
    this.virtualPerfectLine = generated[selected]!;
  }

  setHabahiroLaneChanged(): void {
    if (this.renderingKind === "habahiro") this.habahiroLaneChanged = true;
  }

  resolveButton(position: ManualInputPosition): SimulatorResult<ButtonTypeValue | null> {
    const world = this.screenToWorld(position);
    if (world.status !== "ok") return world;
    let nearestLane = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let lane = 0; lane < 7; lane += 1) {
      const goal = this.scene.goalPositions[lane]!;
      const dx = Math.fround(world.value.x - goal.x.value);
      const dy = Math.fround(world.value.y - goal.y.value);
      const distance = Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLane = lane;
      }
    }
    return ok(this.renderingKind === "habahiro" && this.habahiroLaneChanged
      ? (nearestLane + ButtonType.Button_08_BMS_2P_01) as ButtonTypeValue
      : nearestLane as ButtonTypeValue);
  }

  screenToWorld(position: ManualInputPosition): SimulatorResult<ManualInputWorldPosition> {
    if (!validPosition(position)) return reject("scene.invalid-input-position", "Screen positions must contain finite x/y values.");
    const world = originalBottomLeftScreenToWorld(
      this.surfaceLayout,
      position.x,
      position.y,
    );
    if (world.status !== "ok") return world;
    return ok(Object.freeze({
      x: world.value[0],
      y: world.value[1],
      z: Math.fround(0),
    }));
  }

  getTargetCenterScreenPosition(source: import("../engine/chart/types").NoteInformation): SimulatorResult<ManualInputPosition> {
    const span = source.laneSpan;
    const lane = span === undefined ? laneIndex(source.buttonType) : 3;
    if (lane === null) return reject("scene.unsupported-target-button", "Target center requires its gameplay button.");
    const goal = this.scene.goalPositions[lane]!;
    const x = span !== undefined
      ? this.scene.goalPositions[3]!.x.value + ((span.start + span.end) / 2 - 3) *
        (this.scene.goalPositions[4]!.x.value - this.scene.goalPositions[3]!.x.value)
      : source.halfButtonIndex >= 0
        ? Math.fround(AUTHORED_BUTTON_X[source.halfButtonIndex * 2 + 1]! * this.surfaceLayout.gameplay.screenWidthAdjustRate)
        : goal.x.value;
    const screen = originalWorldToBottomLeftScreen(this.surfaceLayout, x, goal.y.value);
    return screen.status === "ok" ? ok({ x: screen.value[0], y: screen.value[1] }) : screen;
  }

  getDistanceNormalization(): SimulatorResult<{ readonly cameraScale: number; readonly gameplayScale: number }> {
    return ok(Object.freeze({ cameraScale: Math.fround(1), gameplayScale: Math.fround(1) }));
  }

  isInsideTargetButtons(
    position: ManualInputPosition,
    buttonTypes: readonly ButtonTypeValue[],
    isSweetCollision = false,
  ): SimulatorResult<boolean> {
    const world = this.screenToWorld(position);
    if (world.status !== "ok") return world;
    if (!Array.isArray(buttonTypes) || buttonTypes.length < 1 || buttonTypes.length > 16) {
      return reject("scene.invalid-target-buttons", "Target containment requires one bounded original ButtonType list.");
    }
    for (const buttonType of buttonTypes) {
      const lane = laneIndex(buttonType);
      if (lane === null) return reject("scene.unsupported-target-button", "The current scene has no gameplay geometry for Button_07_BMS_1P_07.");
      const goal = this.scene.goalPositions[lane]!;
      if (isInsideNoteTarget(world.value.x, world.value.y, goal.x.value, goal.y.value,
        this.collisionSquared, isSweetCollision)) return ok(true);
    }
    return ok(false);
  }

  projectScreenToGameplayLocalX(position: ManualInputPosition): SimulatorResult<number> {
    const world = this.screenToWorld(position);
    return world.status === "ok" ? ok(world.value.x) : world;
  }

  getGameplayButtonLocalY(buttonType: ButtonTypeValue): SimulatorResult<number> {
    const lane = laneIndex(buttonType);
    return lane === null
      ? reject("scene.unsupported-button-local-position", "The current scene does not invent a position for unsupported Button_07_BMS_1P_07.")
      : ok(this.scene.goalPositions[lane]!.y.value);
  }

  getSlideJudgeGeometry(): SimulatorResult<{
    readonly positions: readonly number[];
    readonly virtualPerfectLine: number;
  }> {
    return ok(Object.freeze({
      positions: this.judgePositions,
      virtualPerfectLine: this.virtualPerfectLine,
    }));
  }
}

function generateSlideJudgePositions(scene: SceneValues): readonly number[] {
  const positions: number[] = [];
  let progress = f32(0);
  let realMove = f32(0);
  const delta = f32(SLIDE_FRAME_SECONDS);
  const goalY = scene.goalPositions[3]!.y.value;
  for (;;) {
    const moved = advanceOrdinaryNoteMotion(motionState(scene, 3, progress, delta, realMove));
    if (moved.status !== "ok") throw new Error(moved.capability);
    const y = moved.value.position.y.value;
    positions.push(y);
    if (y <= Math.fround(goalY - SLIDE_TERMINAL_Y_DISTANCE)) break;
    if (positions.length > 1 && moved.value.progressRate.value <= progress.value) {
      throw new Error("scene.slide-judge-motion-not-advancing");
    }
    progress = moved.value.progressRate;
    realMove = f32(Math.fround(realMove.value + SLIDE_FRAME_SECONDS));
  }
  if (positions.length < 17) {
    throw new Error("scene.slide-judge-profile-too-short");
  }
  return Object.freeze([...positions].reverse());
}

function motionState(
  scene: SceneValues,
  lane: number,
  progressRate: RenderFloat32,
  deltaTime: RenderFloat32,
  realMoveSecond: RenderFloat32,
): OrdinaryNoteMotionState {
  const start = scene.noteStartPositions[lane]!;
  const goal = scene.goalPositions[lane]!;
  return Object.freeze({
    progressRate,
    specificSpeed: scene.specificSpeed,
    deltaTime,
    realMoveSecond,
    goalPosition: Object.freeze({ x: goal.x, y: goal.y }),
    noteStartPosition: Object.freeze({ x: start.x, y: start.y }),
    pixelsPerWorldUnit: scene.surfaceLayout.camera.pixelsPerWorldUnit,
    viewportX: [-scene.surfaceLayout.camera.halfWidthWorld, scene.surfaceLayout.camera.halfWidthWorld] as const,
    viewportY: [-scene.surfaceLayout.camera.halfHeightWorld, scene.surfaceLayout.camera.halfHeightWorld] as const,
    currentPositionZ: start.z,
    noteSettingScale: scene.noteSettingScale,
    noteParentScale: scene.noteParentScale,
    launcherY: scene.launcherY,
    targetCenterY: scene.targetCenterY,
    highAspectRatio: scene.highAspectRatio,
    buttonCount: 1,
    virtualLaneControllerPresent: false,
  });
}

function createParticleScene(
  goals: readonly RenderVector3[],
  layout: OriginalSurfaceLayout,
): SimulatorResult<ParticlePixiSceneProfile> {
  const anchors = [];
  const buttonOwners = [];
  // Controller.Init owns seven full buttons followed by six half buttons.
  for (let index = 0; index < 13; index += 1) {
    const isHalfButton = index >= 7;
    const buttonType = isHalfButton ? index - 7 : index;
    const goal = goals[buttonType]!;
    const x = isHalfButton
      ? Math.fround(AUTHORED_BUTTON_X[buttonType * 2 + 1]! * layout.gameplay.screenWidthAdjustRate)
      : goal.x.value;
    const xBits = particleFloat32ToBits(x);
    const yBits = particleFloat32ToBits(goal.y.value);
    const zBits = particleFloat32ToBits(Math.fround(0));
    if (xBits === null || yBits === null || zBits === null) {
      return reject("scene.invalid-particle-anchor", "Particle anchors require finite exact Float32 scene positions.");
    }
    const position = Object.freeze({ xBits, yBits, zBits });
    anchors.push(Object.freeze({ buttonType, isHalfButton, position }));
    buttonOwners.push(Object.freeze({
      buttonType,
      isHalfButton,
      transform: Object.freeze({
        source: "game-play-button" as const,
        position,
        rotation: Object.freeze({
          xBits: "0x00000000", yBits: "0x00000000", zBits: "0x00000000", wBits: "0x3F800000",
        }),
        scale: Object.freeze({
          xBits: "0x3F800000", yBits: "0x3F800000", zBits: "0x3F800000",
        }),
      }),
      particleSystemSetupScaleBits: "",
    }));
  }
  const pixelsPerWorldUnitBits = particleFloat32ToBits(layout.camera.pixelsPerWorldUnit);
  const gameplayTransformScaleBits = particleFloat32ToBits(layout.gameplay.particleTransformScale);
  const setupFactors = calculateNativeParticleSetupFactors(layout.gameplay.screenWidthAdjustRate,
    layout.gameplay.normalizedNoteSize, layout.starUi.screenToSafeAreaRatio);
  const firstSetupScaleBits = particleFloat32ToBits(setupFactors[0]);
  const secondSetupScaleBits = particleFloat32ToBits(setupFactors[1]);
  const slideWidthScale = layout.gameplay.screenWidthAdjustRate < 1
    ? layout.gameplay.screenWidthAdjustRate
    : Math.fround(1);
  // BND-C191: pool setup reads the width-scaled value before the note-size write.
  const slideWidthScaleBits = particleFloat32ToBits(slideWidthScale);
  const slideNoteScaleBits = particleFloat32ToBits(layout.gameplay.normalizedNoteSize);
  const slideParticleSystemSetupScaleBits = particleFloat32ToBits(Math.fround(
    slideWidthScale * layout.gameplay.normalizedNoteSize,
  ));
  const slideOuterScaleBits = particleFloat32ToBits(layout.gameplay.noteSettingScale);
  const gameClearAuthoredUiScaleBits = particleFloat32ToBits(layout.ui.screenToSafeChildScale);
  const gameClearOwnerScaleBits = particleFloat32ToBits(Math.fround(
    layout.ui.screenToSafeChildScale / layout.camera.pixelsPerWorldUnit,
  ));
  if (pixelsPerWorldUnitBits === null || gameplayTransformScaleBits === null ||
    firstSetupScaleBits === null || secondSetupScaleBits === null ||
    slideWidthScaleBits === null || slideNoteScaleBits === null ||
    slideParticleSystemSetupScaleBits === null || slideOuterScaleBits === null ||
    gameClearAuthoredUiScaleBits === null || gameClearOwnerScaleBits === null) {
    return reject("scene.invalid-particle-projection", "Current camera PPU must remain finite binary32.");
  }
  const resolvedButtonOwners = Object.freeze(buttonOwners.map((owner) => Object.freeze({
    ...owner,
    particleSystemSetupScaleBits: gameplayTransformScaleBits,
    particleSystemSetupScaleFactorsBits: Object.freeze([firstSetupScaleBits, secondSetupScaleBits] as const),
  })));
  return ok(Object.freeze({
    viewportWidth: layout.surface.viewportWidth,
    viewportHeight: layout.surface.viewportHeight,
    worldCenterXBits: "0x00000000",
    worldCenterYBits: "0x00000000",
    pixelsPerWorldUnitBits,
    roundPixels: false,
    buttonAnchors: Object.freeze(anchors),
    buttonOwners: resolvedButtonOwners,
    slidePool: Object.freeze({
      poolSize: 8 as const,
      initialCursor: 0 as const,
      firstAcquiredSlot: 1 as const,
      outerScaleBits: slideOuterScaleBits,
      particleSystemSetupScaleBits: slideParticleSystemSetupScaleBits,
      particleSystemSetupScaleFactorsBits: Object.freeze([slideWidthScaleBits, slideNoteScaleBits] as const),
      childLocalPosition: Object.freeze({ xBits: "0x00000000", yBits: "0x00000000", zBits: "0x00000000" }),
      childLocalRotation: Object.freeze({
        xBits: "0x00000000", yBits: "0x00000000", zBits: "0x00000000", wBits: "0x3F800000",
      }),
      childLocalScale: Object.freeze({ xBits: "0x3F800000", yBits: "0x3F800000", zBits: "0x3F800000" }),
    }),
    gameClearOwner: Object.freeze({
      authoredUiScaleBits: gameClearAuthoredUiScaleBits,
      transform: Object.freeze({
        source: "game-clear-ui-root" as const,
        position: Object.freeze({ xBits: "0x00000000", yBits: "0x00000000", zBits: "0x00000000" }),
        rotation: Object.freeze({
          xBits: "0x00000000", yBits: "0x00000000", zBits: "0x00000000", wBits: "0x3F800000",
        }),
        scale: Object.freeze({
          xBits: gameClearOwnerScaleBits,
          yBits: gameClearOwnerScaleBits,
          zBits: gameClearOwnerScaleBits,
        }),
      }),
      particleSystemSetupScaleBits: "0x3F800000",
    }),
  }));
}

function createOriginalSkinFieldScene(
  bindings: {
    readonly backgroundLineLogicalAssetId: string;
    readonly judgeLineLogicalAssetId: string;
  },
  layout: OriginalSurfaceLayout,
) {
  const judgeScale = Math.fround(
    layout.gameplay.noteSettingScale * Math.fround(0.9900000095367432),
  );
  return Object.freeze({
    objects: Object.freeze([
      fieldObject(
        "render:skin-field:lines",
        "field-line",
        bindings.backgroundLineLogicalAssetId,
        "bg_line_rhythm",
        0,
        ORIGINAL_NOTE_LANE_BOTTOM_Y,
        null,
        1,
        0,
      ),
      fieldObject(
        "render:skin-field:judge-line",
        "judge-line",
        bindings.judgeLineLogicalAssetId,
        "game_play_line",
        0,
        layout.gameplay.targetCenterY,
        null,
        judgeScale,
        1,
        judgeScale,
        2,
        20,
      ),
    ]),
    masks: Object.freeze([] as RenderFieldMaskPlan[]),
  });
}

function createPortableHabahiroScene(
  resources: RenderEngineResourceBindings,
  meshWidthSetting: number,
  layout: OriginalSurfaceLayout,
): SimulatorResult<HabahiroSceneInput> {
  const bindings = resources.habahiroPackage;
  if (bindings === undefined) {
    return reject("scene.habahiro-resource-binding-missing", "HABAHIRO requires its exact flash, field-before and field-after package bindings.");
  }
  const judgeScale = Math.fround(
    layout.gameplay.noteSettingScale * Math.fround(0.9900000095367432),
  );
  const plans = (field: typeof bindings.fieldBefore): readonly RenderFieldObjectPlan[] => Object.freeze([
    fieldObject(
      "render:habahiro:rhythm-lines", "field-line",
      field.backgroundLineLogicalAssetId, "bg_line_rhythm", 0, ORIGINAL_NOTE_LANE_BOTTOM_Y, null, 1, 0,
    ),
    fieldObject(
      "render:habahiro:sudden-area-lines", "field-line",
      field.backgroundLineLogicalAssetId, "bg_line_rhythm", 0, ORIGINAL_NOTE_LANE_BOTTOM_Y, null, 1, 1,
      1, 1, 1, false,
    ),
    fieldObject(
      "render:habahiro:judge-line", "judge-line",
      field.judgeLineLogicalAssetId, "game_play_line", 0, layout.gameplay.targetCenterY,
      null, judgeScale, 2, judgeScale, 2, 20,
    ),
    fieldObject(
      "render:habahiro:judge-skill-line", "judge-line",
      field.judgeSkillLineLogicalAssetId, "game_play_line_skill_adjust_effect", 0,
      layout.gameplay.targetCenterY, null, judgeScale, 3, judgeScale, 2, 21, false,
    ),
  ]);
  return ok(Object.freeze({
    meshWidthSetting: f32(meshWidthSetting),
    suddenLane: false as const,
    changeLaneSeconds: f32(Math.fround(0.4166666567325592)),
    animationCompleteSeconds: f32(Math.fround(1)),
    fieldBefore: plans(bindings.fieldBefore),
    fieldAfter: plans(bindings.fieldAfter),
    fieldMasks: Object.freeze([] as RenderFieldMaskPlan[]),
  }));
}

function fieldObject(
  renderObjectId: string,
  role: "field-line" | "judge-line",
  logicalAssetId: string,
  exactKey: string,
  x: number,
  y: number,
  maskObjectId: string | null,
  scale: number,
  depth: number,
  scaleY = 1,
  domainLayer = depth + 1,
  sourceSortingOrder = depth,
  initiallyActive = true,
): RenderFieldObjectPlan {
  return Object.freeze({
    renderObjectId,
    initiallyActive,
    role,
    logicalAssetId,
    exactKey,
    position: vector3(x, y, 0),
    scale: vector2(scale, scaleY),
    rotationDegrees: f32(0),
    color: white(),
    ordering: Object.freeze({
      domainLayer,
      sourceDepthOrSortingOrder: sourceSortingOrder,
      sourceZ: f32(0),
      creationSequence: depth + 1,
    }),
    maskObjectId,
  });
}

function laneIndex(buttonType: number): number | null {
  if (buttonType >= 0 && buttonType <= 6) return buttonType;
  if (buttonType >= 8 && buttonType <= 14) return buttonType - 8;
  if (buttonType === 15) return 6;
  return null;
}

function validPosition(value: ManualInputPosition): boolean {
  return value !== null && typeof value === "object" &&
    Number.isFinite(value.x) && Number.isFinite(value.y);
}

function exactFloat32(value: number): boolean {
  return Number.isFinite(value) && Object.is(value, Math.fround(value));
}

function exactPositiveFloat32(value: number): boolean {
  return exactFloat32(value) && value > 0;
}

function f32(value: number): RenderFloat32 {
  const created = createRenderFloat32(Math.fround(value));
  if (created.status !== "ok") throw new Error(created.capability);
  return created.value;
}

function vector2(x: number, y: number): RenderVector2 {
  return Object.freeze({ x: f32(x), y: f32(y) });
}

function vector3(x: number, y: number, z: number): RenderVector3 {
  return Object.freeze({ x: f32(x), y: f32(y), z: f32(z) });
}

function color(red: number, green: number, blue: number, alpha: number): RenderColor {
  return Object.freeze({ red: f32(red), green: f32(green), blue: f32(blue), alpha: f32(alpha) });
}

function white(): RenderColor {
  return color(1, 1, 1, 1);
}

function reject(capability: string, boundary: string) {
  return integrityFailure(
    capability,
    boundary,
  );
}

// Reverse a8ed391d: InGamePlayButtonController / NoteUtility / BMSDefine.
function calculateTargetCollisionSquared(scene: SceneValues): number {
  if (!scene.surfaceLayout.starUi.isHighAspectRatioDevice) return DEFAULT_COLLISION_SQUARED;
  const distance = Math.fround(scene.goalPositions[1]!.x.value - scene.goalPositions[0]!.x.value);
  const radius = Math.fround(distance * COLLISION_DISTANCE_RATE);
  return Math.fround(radius * radius);
}

function isInsideNoteTarget(x: number, y: number, targetX: number, targetY: number,
  collisionSquared: number, isSweetCollision: boolean): boolean {
  const dx = Math.fround(x - targetX), dy = Math.fround(y - targetY);
  const squared = Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy));
  const threshold = isSweetCollision ? Math.fround(collisionSquared * SWEET_COLLISION_RATE) : collisionSquared;
  return squared < threshold;
}
