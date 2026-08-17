import type {
  ManualInputWorldPosition,
  SimulatorManualInputGeometryBackend,
} from "../backends/contracts";
import type { ParticlePixiSceneProfile } from "../backends/particleContracts";
import { particleFloat32ToBits } from "../backends/particleValidation";
import type {
  RenderColor,
  RenderFloat32,
  RenderOrderingKey,
  RenderVector2,
  RenderVector3,
} from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { ButtonType, type ButtonTypeValue, type NoteInformation } from "../engine/chart/types";
import type { ManualInputPosition } from "../engine/data/manualInput";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import {
  advanceOrdinaryNoteMotion,
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

const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 720;
const PIXELS_PER_WORLD_UNIT = Math.fround(360);
const REFERENCE_SCREEN_SIZE_X = Math.fround(9.578571319580078);
const AUTHORED_BUTTON_Y = Math.fround(-3.450000047683716);
const AUTHORED_LAUNCHER_Y = Math.fround(5.420000076293945);
const AUTHORED_BUTTON_SPACING = Math.fround(2.200000047683716);
const LAUNCH_DISTANCE_RATE = Math.fround(0.05000000074505806);
const VANISHING_SLOPE = Math.fround(-1.3439395427703857);
const NOTE_WORLD_Z = Math.fround(-13.5);
const COLLISION_SQUARED = Math.fround(0.23136097192764282);
const SLIDE_FRAME_SECONDS = Math.fround(1 / 60);
const SLIDE_TERMINAL_Y_DISTANCE = Math.fround(100);

export interface SimulatorSceneVisualConfig {
  readonly specificSpeed: number;
  readonly noteSize: number;
  readonly highAspectRatio: 0 | 1;
  readonly judgeOffsetFrames: number;
  readonly habahiroMeshWidthSetting: number;
}

export interface SimulatorSceneSurfaceProfile {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly inputOrigin: "bottom-left";
}

export interface GarupaProductFieldLine {
  readonly lane: number;
  readonly start: RenderVector3;
  readonly goal: RenderVector3;
}

export interface GarupaProductSceneLayout {
  readonly laneSpacingWorld: RenderFloat32;
  readonly noteSettingScale: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly fieldLines: readonly GarupaProductFieldLine[];
  readonly projectLaneAtCurve: (lane: number, curve: number) => SimulatorResult<RenderVector3>;
  readonly screenToContinuousLane: (position: ManualInputPosition) => SimulatorResult<number>;
  readonly isInsideContinuousSpan: (
    position: ManualInputPosition,
    spanStart: number,
    width: number,
  ) => SimulatorResult<boolean>;
}

export interface SimulatorSceneLayout {
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
): SimulatorResult<SimulatorSceneLayout> {
  if (
    surface === null || typeof surface !== "object" ||
    surface.viewportWidth !== VIEWPORT_WIDTH ||
    surface.viewportHeight !== VIEWPORT_HEIGHT ||
    surface.inputOrigin !== "bottom-left"
  ) {
    return reject(
      "scene.unsupported-surface-profile",
      "The current portable projection is fixed to one 1600x720 surface whose input positions use the original bottom-left screen origin.",
    );
  }
  if (
    !exactPositiveFloat32(config.specificSpeed) ||
    !exactFloat32(config.noteSize) || config.noteSize < 80 || config.noteSize > 150 ||
    (config.highAspectRatio !== 0 && config.highAspectRatio !== 1) ||
    !Number.isInteger(config.judgeOffsetFrames) || config.judgeOffsetFrames < -5 || config.judgeOffsetFrames > 5 ||
    !exactFloat32(config.habahiroMeshWidthSetting)
  ) {
    return reject(
      "scene.invalid-visual-config",
      "Scene assembly requires exact Float32 speed, evidence-bounded 80..150 note size, binary high-aspect mode, [-5,5] judge offset and explicit HABAHIRO mesh width.",
    );
  }
  const values = createSceneValues(config);
  if (values.status !== "ok") return values;
  const arrival = getOrdinaryNoteArrivalSeconds(values.value.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  const habahiro = renderingKind === "habahiro"
    ? createPortableHabahiroScene(resources, config.habahiroMeshWidthSetting)
    : ok<HabahiroSceneInput | undefined>(undefined);
  if (habahiro.status !== "ok") return habahiro;
  const ordinaryNoteScene: OrdinaryFixedNoteSceneInput = Object.freeze({
    specificSpeed: values.value.specificSpeed,
    noteSettingScale: values.value.noteSettingScale,
    launcherY: values.value.launcherY,
    targetCenterY: values.value.targetCenterY,
    highAspectRatio: values.value.highAspectRatio,
    noteStartPositions: values.value.noteStartPositions,
    goalPositions: values.value.goalPositions,
    noteColor: white(),
    noteDomainLayer: 3,
    syncLineEdgeMargin: f32(0.2),
    screenToSafeAreaRatio: f32(1),
    longMeshColor: color(0.8, 0.8, 0.8, 0.6),
    ...(habahiro.value === undefined ? {} : { habahiro: habahiro.value }),
  });
  const geometry = new CurrentSimulatorManualGeometry(
    values.value,
    config.judgeOffsetFrames,
    renderingKind,
  );
  const particleScene = createParticleScene(values.value.goalPositions);
  if (particleScene.status !== "ok") return particleScene;
  const productScene = createGarupaProductScene(values.value);
  if (productScene.status !== "ok") return productScene;
  return ok(Object.freeze({
    ordinaryNoteScene,
    particleScene: particleScene.value,
    manualInputGeometry: geometry,
    garupaProductScene: productScene.value,
  }));
}

interface SceneValues {
  readonly specificSpeed: RenderFloat32;
  readonly noteSettingScale: RenderFloat32;
  readonly launcherY: RenderFloat32;
  readonly targetCenterY: RenderFloat32;
  readonly highAspectRatio: RenderFloat32;
  readonly noteStartPositions: readonly RenderVector3[];
  readonly goalPositions: readonly RenderVector3[];
}

function createSceneValues(config: SimulatorSceneVisualConfig): SimulatorResult<SceneValues> {
  const screenSizeX = Math.fround(VIEWPORT_WIDTH / VIEWPORT_HEIGHT);
  const widthRate = Math.fround(screenSizeX / REFERENCE_SCREEN_SIZE_X);
  const targetCenterY = Math.fround(AUTHORED_BUTTON_Y * widthRate);
  const launcherY = Math.fround(AUTHORED_LAUNCHER_Y * widthRate);
  const firstButtonX = Math.fround(Math.fround(-3 * AUTHORED_BUTTON_SPACING) * widthRate);
  const vanishingY = Math.fround(targetCenterY + Math.fround(firstButtonX * VANISHING_SLOPE));
  const noteStartPositions: RenderVector3[] = [];
  const goalPositions: RenderVector3[] = [];
  for (let lane = 0; lane < 7; lane += 1) {
    const authoredX = Math.fround(Math.fround(lane - 3) * AUTHORED_BUTTON_SPACING);
    const goalX = Math.fround(authoredX * widthRate);
    const startX = Math.fround(goalX * LAUNCH_DISTANCE_RATE);
    const startY = Math.fround(
      targetCenterY + Math.fround(
        Math.fround(Math.fround(1) - LAUNCH_DISTANCE_RATE) *
          Math.fround(vanishingY - targetCenterY),
      ),
    );
    goalPositions.push(vector3(goalX, targetCenterY, NOTE_WORLD_Z));
    noteStartPositions.push(vector3(startX, startY, NOTE_WORLD_Z));
  }
  return ok(Object.freeze({
    specificSpeed: f32(config.specificSpeed),
    noteSettingScale: f32(Math.fround(widthRate * Math.fround(config.noteSize / 100))),
    launcherY: f32(launcherY),
    targetCenterY: f32(targetCenterY),
    highAspectRatio: f32(config.highAspectRatio),
    noteStartPositions: Object.freeze(noteStartPositions),
    goalPositions: Object.freeze(goalPositions),
  }));
}

function createGarupaProductScene(
  scene: SceneValues,
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
    if (!Number.isFinite(lane) || !Number.isFinite(curve)) {
      return reject(
        "scene.invalid-product-projection",
        "Product lane and curve coordinates must remain finite and cannot be clamped.",
      );
    }
    const originalLane = Number.isInteger(lane) && lane >= 0 && lane <= 6
      ? lane
      : null;
    const goalX = originalLane === null
      ? Math.fround(Math.fround(lane - 3) * laneSpacing)
      : scene.goalPositions[originalLane]!.x.value;
    const startX = originalLane === null
      ? Math.fround(goalX * LAUNCH_DISTANCE_RATE)
      : scene.noteStartPositions[originalLane]!.x.value;
    const startY = scene.noteStartPositions[3]!.y.value;
    const goalY = scene.targetCenterY.value;
    if (curve === 0 && originalLane !== null) return ok(scene.noteStartPositions[originalLane]!);
    if (curve === 1 && originalLane !== null) return ok(scene.goalPositions[originalLane]!);
    return ok(vector3(
      Math.fround(startX + Math.fround(curve * Math.fround(goalX - startX))),
      Math.fround(startY + Math.fround(curve * Math.fround(goalY - startY))),
      NOTE_WORLD_Z,
    ));
  };
  const screenToContinuousLane = (
    position: ManualInputPosition,
  ): SimulatorResult<number> => {
    if (!validPosition(position)) {
      return reject(
        "scene.invalid-product-input-position",
        "Continuous product input requires finite bottom-left screen coordinates.",
      );
    }
    const worldX = Math.fround(
      Math.fround(position.x - VIEWPORT_WIDTH / 2) / PIXELS_PER_WORLD_UNIT,
    );
    const lane = Math.fround(
      Math.fround(3) + Math.fround(worldX / laneSpacing),
    );
    return Number.isFinite(lane)
      ? ok(lane)
      : reject("scene.non-finite-product-lane", "Continuous input lane derivation became non-finite.");
  };
  const isInsideContinuousSpan = (
    position: ManualInputPosition,
    spanStart: number,
    width: number,
  ): SimulatorResult<boolean> => {
    if (!Number.isFinite(spanStart) || !Number.isInteger(width) || width <= 0) {
      return reject(
        "scene.invalid-product-span",
        "Continuous product collision requires one finite start and positive integer width.",
      );
    }
    const lane = screenToContinuousLane(position);
    if (lane.status !== "ok") return lane;
    const worldY = Math.fround(
      Math.fround(position.y - VIEWPORT_HEIGHT / 2) / PIXELS_PER_WORLD_UNIT,
    );
    const dy = Math.fround(worldY - scene.targetCenterY.value);
    const verticalSquared = Math.fround(dy * dy);
    return ok(
      lane.value >= Math.fround(spanStart - 0.5) &&
      lane.value <= Math.fround(spanStart + width - 0.5) &&
      verticalSquared <= COLLISION_SQUARED
    );
  };
  const fieldLines: GarupaProductFieldLine[] = [];
  for (let lane = 0; lane < 7; lane += 1) {
    const start = projectLaneAtCurve(lane, 0);
    const goal = projectLaneAtCurve(lane, 1);
    if (start.status !== "ok") {
      return evidenceRequired(start.capability, start.requiredEvidence, start.boundary);
    }
    if (goal.status !== "ok") {
      return evidenceRequired(goal.capability, goal.requiredEvidence, goal.boundary);
    }
    fieldLines.push(Object.freeze({ lane, start: start.value, goal: goal.value }));
  }
  return ok(Object.freeze({
    laneSpacingWorld: f32(laneSpacing),
    noteSettingScale: scene.noteSettingScale,
    targetCenterY: scene.targetCenterY,
    fieldLines: Object.freeze(fieldLines),
    projectLaneAtCurve,
    screenToContinuousLane,
    isInsideContinuousSpan,
  }));
}

class CurrentSimulatorManualGeometry implements SimulatorManualInputGeometryBackend {
  private habahiroLaneChanged = false;
  private readonly judgePositions: readonly number[];
  private readonly virtualPerfectLine: number;

  constructor(
    private readonly scene: SceneValues,
    judgeOffsetFrames: number,
    private readonly renderingKind: "ordinary" | "habahiro",
  ) {
    const generated = generateSlideJudgePositions(scene);
    this.judgePositions = generated;
    const goalY = scene.goalPositions[3]!.y.value;
    const overedIndex = generated.findIndex((value) => value > goalY);
    const selected = overedIndex - 1 + judgeOffsetFrames;
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
    return ok(Object.freeze({
      x: Math.fround(Math.fround(position.x - VIEWPORT_WIDTH / 2) / PIXELS_PER_WORLD_UNIT),
      y: Math.fround(Math.fround(position.y - VIEWPORT_HEIGHT / 2) / PIXELS_PER_WORLD_UNIT),
      z: Math.fround(0),
    }));
  }

  getDistanceNormalization(): SimulatorResult<{ readonly cameraScale: number; readonly gameplayScale: number }> {
    return ok(Object.freeze({ cameraScale: Math.fround(1), gameplayScale: Math.fround(1) }));
  }

  isInsideTargetButtons(
    position: ManualInputPosition,
    buttonTypes: readonly ButtonTypeValue[],
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
      const dx = Math.fround(world.value.x - goal.x.value);
      const dy = Math.fround(world.value.y - goal.y.value);
      const squared = Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy));
      if (squared <= COLLISION_SQUARED) return ok(true);
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

  getSlideCurrentLocalY(
    source: NoteInformation,
    adjustedMusicPosition: number,
  ): SimulatorResult<number> {
    if (!Number.isFinite(adjustedMusicPosition) || !exactPositiveFloat32(source.bpm)) {
      return reject("scene.invalid-slide-motion-query", "Slide geometry requires finite music position and positive source BPM.");
    }
    const lane = laneIndex(source.buttonType);
    if (lane === null) return reject("scene.unsupported-slide-button", "Slide motion requires one supported current lane.");
    const arrival = getOrdinaryNoteArrivalSeconds(this.scene.specificSpeed);
    if (arrival.status !== "ok") return arrival;
    const activationPosition = Math.fround(
      Math.fround(source.absolutePos) - Math.fround(source.bpm * arrival.value.value),
    );
    const elapsed = Math.fround(Math.max(0, Math.fround(
      Math.fround(adjustedMusicPosition - activationPosition) / source.bpm,
    )));
    const state = motionState(
      this.scene,
      lane,
      f32(0),
      f32(0),
      f32(elapsed),
    );
    const moved = advanceOrdinaryNoteMotion(state);
    return moved.status === "ok" ? ok(moved.value.position.y.value) : moved;
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
  for (let frame = 0; frame < 512; frame += 1) {
    const moved = advanceOrdinaryNoteMotion(motionState(scene, 3, progress, delta, realMove));
    if (moved.status !== "ok") throw new Error(moved.capability);
    const y = moved.value.position.y.value;
    positions.push(y);
    if (y <= Math.fround(goalY - SLIDE_TERMINAL_Y_DISTANCE)) break;
    progress = moved.value.progressRate;
    realMove = f32(Math.fround(realMove.value + SLIDE_FRAME_SECONDS));
  }
  if (positions.length < 17 || positions.length >= 512) {
    throw new Error("scene.slide-judge-generation-unbounded");
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
    currentPositionZ: start.z,
    noteSettingScale: scene.noteSettingScale,
    launcherY: scene.launcherY,
    targetCenterY: scene.targetCenterY,
    highAspectRatio: scene.highAspectRatio,
    buttonCount: 1,
    virtualLaneControllerPresent: false,
  });
}

function createParticleScene(
  goals: readonly RenderVector3[],
): SimulatorResult<ParticlePixiSceneProfile> {
  const anchors = [];
  for (let buttonType = 0; buttonType < 16; buttonType += 1) {
    const lane = laneIndex(buttonType);
    if (lane === null) continue;
    const goal = goals[lane]!;
    const xBits = particleFloat32ToBits(goal.x.value);
    const yBits = particleFloat32ToBits(goal.y.value);
    const zBits = particleFloat32ToBits(Math.fround(0));
    if (xBits === null || yBits === null || zBits === null) {
      return reject("scene.invalid-particle-anchor", "Particle anchors require finite exact Float32 scene positions.");
    }
    anchors.push(Object.freeze({
      buttonType,
      position: Object.freeze({ xBits, yBits, zBits }),
    }));
  }
  return ok(Object.freeze({
    viewportWidth: VIEWPORT_WIDTH,
    viewportHeight: VIEWPORT_HEIGHT,
    worldCenterXBits: "0x00000000",
    worldCenterYBits: "0x00000000",
    pixelsPerWorldUnitBits: "0x43B40000",
    roundPixels: false,
    buttonAnchors: Object.freeze(anchors),
  }));
}

function createPortableHabahiroScene(
  resources: RenderEngineResourceBindings,
  meshWidthSetting: number,
): SimulatorResult<HabahiroSceneInput> {
  const atlas = resources.habahiroAtlasLogicalAssetIds?.normal;
  if (atlas === undefined) {
    return reject("scene.habahiro-resource-binding-missing", "HABAHIRO field assembly requires the internally selected normal source atlas.");
  }
  const beforeField = fieldObject("render:habahiro:field", "field-line", atlas, 0, 0, "render:habahiro:field-mask", 1, 0);
  const beforeJudge = fieldObject("render:habahiro:judge-line", "judge-line", atlas, 0, -3.45, null, 1, 1);
  const afterField = fieldObject("render:habahiro:field", "field-line", atlas, 0, -0.25, "render:habahiro:field-mask", 1.05, 0);
  const afterJudge = fieldObject("render:habahiro:judge-line", "judge-line", atlas, 0, -3.2, null, 1.05, 1);
  const mask: RenderFieldMaskPlan = Object.freeze({
    renderObjectId: "render:habahiro:field-mask",
    polygon: Object.freeze([vector2(-4, -5), vector2(4, -5), vector2(4, 5), vector2(-4, 5)]),
    position: vector3(0, 0, 0),
    scale: vector2(1, 1),
    rotationDegrees: f32(0),
    ordering: ordering(0, -1),
  });
  return ok(Object.freeze({
    meshWidthSetting: f32(meshWidthSetting),
    flashDurationSeconds: f32(0.25),
    fieldBefore: Object.freeze([beforeField, beforeJudge]),
    fieldAfter: Object.freeze([afterField, afterJudge]),
    fieldMasks: Object.freeze([mask]),
  }));
}

function fieldObject(
  renderObjectId: string,
  role: "field-line" | "judge-line",
  logicalAssetId: string,
  x: number,
  y: number,
  maskObjectId: string | null,
  scale: number,
  depth: number,
): RenderFieldObjectPlan {
  return Object.freeze({
    renderObjectId,
    role,
    logicalAssetId,
    exactKey: "note_normal_0",
    position: vector3(x, y, 0),
    scale: vector2(scale, 1),
    rotationDegrees: f32(0),
    color: white(),
    ordering: ordering(depth + 1, depth),
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

function ordering(sequence: number, depth: number): RenderOrderingKey {
  return Object.freeze({
    domainLayer: 1,
    sourceDepthOrSortingOrder: depth,
    sourceZ: f32(0),
    creationSequence: sequence,
  });
}

function reject(capability: string, boundary: string) {
  return evidenceRequired(
    capability,
    ["R04", "RPR-D05", "MJ03", "MJ04", "MJ20"],
    boundary,
  );
}
