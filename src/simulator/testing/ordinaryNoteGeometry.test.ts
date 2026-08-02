import type {
  RenderColor,
  RenderCommand,
  RenderCommandBatch,
  RenderFloat32,
  RenderResourcePreflightAdapter,
  RenderResourceProfile,
  RenderVector2,
  RenderVector3,
  SimulatorRendererBackend,
  SimulatorResourceProvider,
} from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import {
  advanceOrdinaryNoteActivationAdjustment,
  advanceOrdinaryNoteMotion,
  buildOrdinaryBaseNoteMesh,
  buildOrdinaryMultipleDirectionalLine,
  buildOrdinarySyncLine,
  getOrdinaryNoteArrivalSeconds,
  type OrdinaryBaseNoteMeshOwnerState,
  type OrdinaryNoteMotionState,
  type OrdinarySyncLineTargetState,
} from "../engine/rendering/ordinaryNoteGeometry";
import {
  RenderCommandProducer,
  validateOrdinaryFixedNoteSceneInput,
} from "../engine/rendering/renderCommandProducer";
import {
  advanceOrdinaryLongNormalChild,
  buildOrdinaryLongNormalMesh,
  createOrdinaryLongNormalChildState,
} from "../engine/rendering/ordinaryLongChildLifecycle";
import { FrontNoteType, VirtualLaneDirection } from "../engine/chart/types";
import { noteInformation } from "./firstSliceFixtures";

function equal<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}
function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
}
function f32(value: number): RenderFloat32 {
  return requireOk(createRenderFloat32(Math.fround(value)), "create Float32");
}
function vector2(x: number, y: number): RenderVector2 {
  return Object.freeze({ x: f32(x), y: f32(y) });
}
function vector3(x: number, y: number, z: number): RenderVector3 {
  return Object.freeze({ ...vector2(x, y), z: f32(z) });
}
function color(red: number, green: number, blue: number, alpha: number): RenderColor {
  return Object.freeze({ red: f32(red), green: f32(green), blue: f32(blue), alpha: f32(alpha) });
}
function floatBytes(value: RenderFloat32): string {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value.value, true);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function target(
  x: number,
  y: number,
  z: number,
  lossyScaleX: number,
  localScaleX: number,
  gameNoteType: number,
): OrdinarySyncLineTargetState {
  return Object.freeze({
    position: vector3(x, y, z),
    lossyScaleX: f32(lossyScaleX),
    localScaleX: f32(localScaleX),
    gameNoteType,
  });
}

class CapturingRenderer implements SimulatorRendererBackend {
  readonly id = "geometry-capture-renderer";
  readonly commands: RenderCommand[] = [];
  nextSequence = 0;
  rejectNext = false;
  private pending: RenderCommandBatch | null = null;

  async prepare(
    _sessionId: string,
    _profile: RenderResourceProfile,
    _provider: SimulatorResourceProvider,
    _preflight: RenderResourcePreflightAdapter,
  ): Promise<SimulatorResult<void>> { return ok(undefined); }
  preflight(commands: readonly RenderCommand[]): SimulatorResult<RenderCommandBatch> {
    if (this.rejectNext) {
      this.rejectNext = false;
      return evidenceRequired("test.renderer-rejection", ["PR39"], "Synthetic producer rejection.");
    }
    this.commands.push(...commands);
    this.pending = Object.freeze({
      sessionId: "geometry-session",
      firstSequence: this.nextSequence,
      commandCount: commands.length,
    });
    return ok(this.pending);
  }
  commit(batch: RenderCommandBatch): SimulatorResult<void> {
    if (batch !== this.pending) return evidenceRequired("test.invalid-batch", ["PR39"], "Unexpected batch.");
    this.nextSequence += batch.commandCount;
    this.pending = null;
    return ok(undefined);
  }
  discard(batch: RenderCommandBatch): SimulatorResult<void> {
    if (batch !== this.pending) return evidenceRequired("test.invalid-batch", ["PR39"], "Unexpected batch.");
    this.pending = null;
    return ok(undefined);
  }
  execute(command: RenderCommand): SimulatorResult<void> {
    const batch = this.preflight([command]);
    return batch.status === "ok" ? this.commit(batch.value) : batch;
  }
  snapshot() {
    return Object.freeze({
      state: "ready" as const,
      sessionId: "geometry-session",
      fidelity: { mode: "ordinary" as const, fidelity: "exact-current" as const },
      nextSequence: this.nextSequence,
      objectCount: 0,
      resourceCount: 0,
      fault: null,
    });
  }
  dispose(): SimulatorResult<void> { return ok(undefined); }
}

const meshState: OrdinaryBaseNoteMeshOwnerState = Object.freeze({
  front: Object.freeze({ position: vector2(-1, 0.5), localScaleX: f32(0.25), buttonCount: 1 }),
  after: Object.freeze({ position: vector2(1, 2.5), localScaleX: f32(0.5), buttonCount: 2 }),
  screenToSafeAreaRatio: f32(0.9),
  widthRate: f32(0.8),
  color: color(0.9, 0.8, 0.7, 0.6),
});

const expectedVertexBytes = [
  "3D0A97BF", "0000003F", "00000000", "85EB51BF", "0000003F", "00000000",
  "1C5A84BF", "3333333F", "00000000", "60E510BF", "3333333F", "00000000",
  "F75363BF", "6666663F", "00000000", "77BE9FBE", "6666663F", "00000000",
  "B6F33DBF", "CDCC8C3F", "00000000", "60916DBD", "CDCC8C3F", "00000000",
  "759318BF", "6666A63F", "00000000", "3AB4483E", "6666A63F", "00000000",
  "6566E6BE", "0000C03F", "00000000", "6766E63E", "0000C03F", "00000000",
  "E0A59BBE", "9A99D93F", "00000000", "5A39343F", "9A99D93F", "00000000",
  "BFCA21BE", "3333F33F", "00000000", "7D3F753F", "3333F33F", "00000000",
  "709B44BC", "66660640", "00000000", "D1229B3F", "66660640", "00000000",
  "4C37093E", "33331340", "00000000", "E3A5BB3F", "33331340", "00000000",
  "2A5C8F3E", "00002040", "00000000", "F628DC3F", "00002040", "00000000",
];
const expectedIndices = [
  0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 4, 6, 5, 5, 6, 7,
  6, 8, 7, 7, 8, 9, 8, 10, 9, 9, 10, 11, 10, 12, 11, 11, 12, 13,
  12, 14, 13, 13, 14, 15, 14, 16, 15, 15, 16, 17, 16, 18, 17, 17, 18, 19,
  18, 20, 19, 19, 20, 21,
];

function main(): void {
  equal(floatBytes(requireOk(getOrdinaryNoteArrivalSeconds(f32(1)), "arrival speed 1")), "0000B040", "slow arrival branch");
  equal(floatBytes(requireOk(getOrdinaryNoteArrivalSeconds(f32(11)), "arrival speed 11")), "0000003F", "fast edge arrival branch");
  equal(floatBytes(requireOk(getOrdinaryNoteArrivalSeconds(f32(12)), "arrival speed 12")), "CDCCCC3E", "speed greater than 11.01 branch");
  equal(getOrdinaryNoteArrivalSeconds(f32(16)).status, "evidence-required", "non-positive arrival fails closed");

  const motionState: OrdinaryNoteMotionState = Object.freeze({
    progressRate: f32(0),
    specificSpeed: f32(11),
    deltaTime: f32(0.1),
    realMoveSecond: f32(0.25),
    goalPosition: vector2(2, -3.450000047683716),
    noteStartPosition: vector2(0.1, 4.976500511169434),
    currentPositionZ: f32(-13.5),
    noteSettingScale: f32(0.8),
    launcherY: f32(5.420000076293945),
    targetCenterY: f32(-3.450000047683716),
    highAspectRatio: f32(0.75),
    buttonCount: 1,
    virtualLaneControllerPresent: false,
  });
  const motion = requireOk(advanceOrdinaryNoteMotion(motionState), "first ordinary Note Move");
  equal(floatBytes(motion.progressRate), "0000003F", "zero progress uses realMoveSecond branch");
  equal(floatBytes(motion.position.x), "49FC8C3E", "X uses current powf curve");
  equal(floatBytes(motion.position.y), "505C8640", "Y uses start minus absolute powf distance");
  equal(floatBytes(motion.position.z), "000058C1", "Move preserves current transform Z");
  equal(floatBytes(motion.localScale.x), "47BCFE3D", "perspective/aspect scale Float32 pipeline");
  equal(floatBytes(motion.localScale.y), "47BCFE3D", "perspective scale is uniform XY");
  equal(floatBytes(motion.localScale.z), "00000000", "current Move writes local scale Z zero");
  const nextMotion = requireOk(advanceOrdinaryNoteMotion({
    ...motionState,
    progressRate: motion.progressRate,
  }), "next ordinary Note Move");
  equal(floatBytes(nextMotion.progressRate), "3333333F", "nonzero progress uses deltaTime branch");
  const adjustmentState: OrdinaryNoteMotionState = Object.freeze({
    ...motionState,
    progressRate: f32(0),
    realMoveSecond: f32(0),
  });
  const adjustment = requireOk(advanceOrdinaryNoteActivationAdjustment(
    adjustmentState,
    f32(97),
    96,
    f32(120),
  ), "ordinary ActivateAdjust");
  equal(adjustment.motions.length, 3, "one-position launcher overshoot takes three synthetic Move steps");
  equal(floatBytes(adjustment.motions[0]!.progressRate), "26B4173C", "first adjustment uses accumulated RealMoveSecond");
  equal(floatBytes(adjustment.motions[1]!.progressRate), "26B4973C", "second adjustment uses deltaTime branch");
  equal(floatBytes(adjustment.progressRate), "398EE33C", "adjustment stops after first progress at or beyond target");
  equal(floatBytes(adjustment.realMoveSecond), "398E633C", "synthetic Move step accumulates in RealMoveSecond");
  equal(
    requireOk(advanceOrdinaryNoteActivationAdjustment(
      adjustmentState,
      f32(96),
      96,
      f32(120),
    ), "no activation adjustment").motions.length,
    0,
    "equal LauncherMusicPos performs no synthetic Move",
  );
  equal(advanceOrdinaryNoteMotion({ ...motionState, virtualLaneControllerPresent: true }).status, "evidence-required", "virtual-lane branch stays closed");
  equal(advanceOrdinaryNoteMotion({ ...motionState, targetCenterY: motionState.launcherY }).status, "evidence-required", "degenerate scale range fails closed");

  const fixedScene = Object.freeze({
    specificSpeed: f32(11),
    noteSettingScale: f32(0.8),
    launcherY: motionState.launcherY,
    targetCenterY: motionState.targetCenterY,
    highAspectRatio: motionState.highAspectRatio,
    noteStartPositions: Object.freeze(Array.from(
      { length: 7 },
      (_, lane) => vector3(Math.fround((lane - 3) * 0.11), 4.976500511169434, -13.5),
    )),
    goalPositions: Object.freeze(Array.from(
      { length: 7 },
      (_, lane) => vector3(Math.fround((lane - 3) * 2.2), -3.450000047683716, -13.5),
    )),
    noteColor: color(1, 1, 1, 1),
    noteDomainLayer: 3,
  });
  requireOk(validateOrdinaryFixedNoteSceneInput(fixedScene), "validate fixed ordinary scene");
  equal(
    validateOrdinaryFixedNoteSceneInput({ ...fixedScene, goalPositions: fixedScene.goalPositions.slice(0, 6) }).status,
    "evidence-required",
    "fixed ordinary scene requires all seven goal transforms",
  );
  const activationRenderer = new CapturingRenderer();
  const activationProducer = new RenderCommandProducer("geometry-session", activationRenderer, {
    noteAtlasLogicalAssetId: "asset.note",
    directionalAtlasLogicalAssetId: "asset.directional",
  });
  requireOk(activationProducer.beginOuterFrame(8), "begin activation frame");
  requireOk(activationProducer.beginSubstep(1), "begin activation substep");
  const activationPool = requireOk(
    activationProducer.preflightPoolSetup([{ poolObjectId: "normal:0", family: "normal" }]),
    "preflight activation pool",
  );
  requireOk(activationPool.commit(), "commit activation pool");
  const activationInformation = Object.freeze({
    ...noteInformation("activation-normal", 0),
    absolutePos: 96,
    storedAbsolutePos: 96,
    bpm: 120,
    bpmString: "120",
  });
  const preparedActivation = requireOk(activationProducer.preflightOrdinaryNoteActivation(
    "normal:0",
    activationInformation,
    f32(120),
    f32(97),
    fixedScene,
    1,
  ), "preflight ordinary activation");
  equal(
    activationRenderer.commands.slice(-6).map((command) => command.kind).join(","),
    "set-transform,activate-object,bind-resource,set-transform,set-transform,set-transform",
    "Activate preserves initial transform, visibility, setupNoteType and three adjustment writes",
  );
  equal(floatBytes(preparedActivation.motionState.progressRate), "398EE33C", "activation returns committed future progress");
  equal(activationRenderer.nextSequence, 2, "activation preflight consumes no sequence");
  requireOk(preparedActivation.transaction.commit(), "commit ordinary activation");
  equal(activationRenderer.nextSequence, 8, "activation commits all six ordered commands");
  const flickPrepared = requireOk(activationProducer.preflightOrdinaryNoteActivation(
    "normal:0",
    { ...activationInformation, fireNoteType: FrontNoteType.Flick },
    f32(120),
    f32(97),
    fixedScene,
    1,
  ), "R4 front Flick activation preflight");
  flickPrepared.transaction.discard();
  equal(flickPrepared.slideChildStates, null, "R4 Flick has no synthetic Slide child state");
  for (const unsupportedFront of [
    FrontNoteType.DirectionalFlick,
    FrontNoteType.Long,
    FrontNoteType.SlideA,
    FrontNoteType.MultipleDirectionalFlick,
  ]) {
    const childRejected = activationProducer.preflightOrdinaryNoteActivation(
      "normal:0",
      { ...activationInformation, fireNoteType: unsupportedFront },
      f32(120),
      f32(97),
      fixedScene,
      1,
    );
    equal(childRejected.status, "evidence-required", `front family ${unsupportedFront} child route remains fail-closed`);
  }
  const virtualRejected = activationProducer.preflightOrdinaryNoteActivation(
    "normal:0",
    { ...activationInformation, virtualLaneDirection: VirtualLaneDirection.Left },
    f32(120),
    f32(97),
    fixedScene,
    1,
  );
  equal(virtualRejected.status, "evidence-required", "virtual-lane activation remains fail-closed");
  equal(activationRenderer.nextSequence, 8, "unsupported activation routes consume no sequence");

  const longPoolRenderer = new CapturingRenderer();
  const longPoolProducer = new RenderCommandProducer("geometry-session", longPoolRenderer, {
    noteAtlasLogicalAssetId: "asset.note",
    directionalAtlasLogicalAssetId: "asset.directional",
  });
  const longPoolSetup = requireOk(longPoolProducer.preflightPoolSetup([
    { poolObjectId: "long:0", family: "long" },
  ]), "preflight Long child pool");
  equal(
    longPoolRenderer.commands.map((command) => `${command.kind}:${command.renderObjectId}`).join(","),
    "create-object:render:long:0:root,hide-object:render:long:0:root," +
      "create-object:render:long:0:after,hide-object:render:long:0:after," +
      "create-object:render:long:0:mesh,hide-object:render:long:0:mesh",
    "Long pool establishes root, after and mesh stable identities in owner order",
  );
  requireOk(longPoolSetup.commit(), "commit Long child pool");
  const longPoolRelease = requireOk(longPoolProducer.preflightSessionRelease(), "preflight Long child release");
  equal(
    longPoolRenderer.commands.slice(-3).map((command) => command.renderObjectId).join(","),
    "render:long:0:mesh,render:long:0:after,render:long:0:root",
    "Long session release remains child-first",
  );
  requireOk(longPoolRelease.commit(), "commit Long child release");

  const renderer = new CapturingRenderer();
  const producer = new RenderCommandProducer("geometry-session", renderer, {
    noteAtlasLogicalAssetId: "asset.note",
    directionalAtlasLogicalAssetId: "asset.directional",
  });
  requireOk(producer.beginOuterFrame(4), "begin transform frame");
  requireOk(producer.beginSubstep(2), "begin transform substep");
  const poolSetup = requireOk(producer.preflightPoolSetup([{ poolObjectId: "normal:0", family: "normal" }]), "preflight transform pool");
  requireOk(poolSetup.commit(), "commit transform pool");
  const prepared = requireOk(producer.preflightOrdinaryNoteMotion(
    "normal:0",
    motionState,
    {
      color: color(1, 1, 1, 1),
      ordering: {
        domainLayer: 3,
        sourceDepthOrSortingOrder: 70,
        sourceZ: f32(-13.5),
        creationSequence: 9,
      },
      maskObjectId: null,
    },
  ), "preflight ordinary Note transform");
  equal(renderer.nextSequence, 2, "motion preflight does not consume renderer sequence");
  equal(floatBytes(prepared.motion.progressRate), "0000003F", "prepared transaction returns owner progress");
  const transform = renderer.commands[renderer.commands.length - 1];
  equal(transform?.kind, "set-transform", "motion producer emits one root transform");
  if (transform?.kind !== "set-transform") throw new Error("missing set-transform command");
  equal(transform.renderObjectId, "render:normal:0:root", "motion targets pool root identity");
  equal(transform.frame, 4, "motion preserves outer frame");
  equal(transform.substep, 2, "motion preserves adaptive substep");
  equal(floatBytes(transform.position.x), "49FC8C3E", "command preserves motion X bits");
  equal(floatBytes(transform.scale.x), "47BCFE3D", "command preserves scale bits");
  equal(transform.ordering.sourceDepthOrSortingOrder, 70, "command preserves explicit source sorting order");
  requireOk(prepared.transaction.commit(), "commit ordinary Note transform");
  equal(renderer.nextSequence, 3, "motion commit consumes exactly one sequence");
  equal(prepared.transaction.commit().status, "evidence-required", "motion transaction is one-use");
  renderer.rejectNext = true;
  const rejectedMotion = producer.preflightOrdinaryNoteMotion(
    "normal:0",
    { ...motionState, progressRate: motion.progressRate },
    {
      color: color(1, 1, 1, 1),
      ordering: { domainLayer: 3, sourceDepthOrSortingOrder: 70, sourceZ: f32(-13.5), creationSequence: 9 },
      maskObjectId: null,
    },
  );
  equal(rejectedMotion.status, "evidence-required", "renderer rejection returns before owner can advance progress");
  equal(renderer.nextSequence, 3, "renderer rejection consumes no sequence");

  const fieldTransform = Object.freeze({
    position: vector3(0, 0, 0),
    scale: vector2(1, 1),
    rotationDegrees: f32(0),
    color: color(1, 1, 1, 1),
    ordering: Object.freeze({
      domainLayer: 1,
      sourceDepthOrSortingOrder: 0,
      sourceZ: f32(0),
      creationSequence: 0,
    }),
    maskObjectId: null,
  });
  const fieldSetup = requireOk(producer.preflightFieldSetup([
    {
      renderObjectId: "render:field:rhythm",
      role: "field-line",
      logicalAssetId: "asset.field",
      exactKey: "bg_line_rhythm",
      ...fieldTransform,
    },
    {
      renderObjectId: "render:field:judge",
      role: "judge-line",
      logicalAssetId: "asset.judge",
      exactKey: "game_play_line",
      ...fieldTransform,
      ordering: { ...fieldTransform.ordering, sourceDepthOrSortingOrder: 1, creationSequence: 1 },
    },
  ]), "preflight field setup");
  equal(renderer.nextSequence, 3, "field preflight consumes no sequence");
  const fieldCommands = renderer.commands.slice(-8);
  equal(
    fieldCommands.map((command) => command.kind).join(","),
    "create-object,bind-resource,set-transform,activate-object,create-object,bind-resource,set-transform,activate-object",
    "each field owner preserves create-bind-transform-activate order",
  );
  const fieldBinding = fieldCommands[1];
  if (fieldBinding?.kind !== "bind-resource") throw new Error("missing field resource binding");
  equal(fieldBinding.logicalAssetId, "asset.field", "field logical resource is caller-authored");
  equal(fieldBinding.exactKey, "bg_line_rhythm", "field exact key is caller-authored");
  requireOk(fieldSetup.commit(), "commit field setup");
  equal(renderer.nextSequence, 11, "two field owners consume eight commands");
  const invalidField = producer.preflightFieldSetup([
    {
      renderObjectId: "duplicate",
      role: "field-line",
      logicalAssetId: "asset.field",
      exactKey: "bg_line_rhythm",
      ...fieldTransform,
    },
    {
      renderObjectId: "duplicate",
      role: "judge-line",
      logicalAssetId: "asset.judge",
      exactKey: "game_play_line",
      ...fieldTransform,
    },
  ]);
  equal(invalidField.status, "evidence-required", "duplicate field identity fails before backend");
  equal(renderer.nextSequence, 11, "invalid field plan consumes no sequence");
  const release = requireOk(producer.preflightSessionRelease(), "preflight reverse session release");
  const releaseCommands = renderer.commands.slice(-3);
  equal(
    releaseCommands.map((command) => command.renderObjectId).join(","),
    "render:field:judge,render:field:rhythm,render:normal:0:root",
    "session release reverses committed field and pool creation order",
  );
  equal(renderer.nextSequence, 11, "release preflight consumes no sequence");
  requireOk(release.commit(), "commit reverse session release");
  equal(renderer.nextSequence, 14, "release consumes one command per committed owner");

  const mesh = requireOk(buildOrdinaryBaseNoteMesh(meshState), "build ordinary base mesh");
  equal(mesh.vertices.length, 22, "base mesh vertex count");
  equal(mesh.indices.length, 60, "base mesh index count");
  equal(mesh.uv.length, 22, "base mesh UV count");
  equal(mesh.colors.length, 22, "base mesh color count");
  equal(
    JSON.stringify(mesh.vertices.flatMap((vertex) => [
      floatBytes(vertex.x), floatBytes(vertex.y), floatBytes(vertex.z),
    ])),
    JSON.stringify(expectedVertexBytes),
    "all 22 vertices preserve frozen Float32 arithmetic",
  );
  equal(JSON.stringify(mesh.indices), JSON.stringify(expectedIndices), "all ten strips preserve R2 winding");
  equal(floatBytes(mesh.uv[0]!.x), "00000000", "left U");
  equal(floatBytes(mesh.uv[1]!.x), "0000803F", "right U");
  equal(floatBytes(mesh.uv[20]!.y), "0000803F", "final V");
  equal(floatBytes(mesh.colors[0]!.red), "6666663F", "uniform color bits");
  equal(floatBytes(mesh.colors[21]!.alpha), "9A99193F", "uniform alpha bits");
  equal(Object.isFrozen(mesh), true, "mesh result frozen");
  equal(Object.isFrozen(mesh.vertices), true, "vertex array frozen");
  equal(Object.isFrozen(mesh.vertices[0]), true, "vertex frozen");
  equal(Object.isFrozen(mesh.colors[0]), true, "copied color frozen");
  equal(mesh.colors[0] === meshState.color, false, "owner color is not aliased");

  const line = requireOk(buildOrdinarySyncLine({
    targetA: target(-2, 1, -13.5, 0.4, 0.7, 1),
    targetB: target(2, 1.25, -13, 0.6, 0.9, 10),
    edgeMargin: f32(0.2),
  }), "build ordinary sync line");
  equal(floatBytes(line.start.x), "8FC2F5BF", "ordinary target A margin applied");
  equal(floatBytes(line.end.x), "00000040", "GameNoteType 10 target B margin excluded");
  equal(floatBytes(line.start.z), "000058C1", "target A Z preserved");
  equal(floatBytes(line.end.z), "000050C1", "target B Z preserved");
  equal(floatBytes(line.width), "39B4483E", "width uses target A localScaleX times Float32 0.28");

  const reverse = requireOk(buildOrdinarySyncLine({
    targetA: target(2, 1.25, -13, 0.6, 0.9, 10),
    targetB: target(-2, 1, -13.5, 0.4, 0.7, 1),
    edgeMargin: f32(0.2),
  }), "build reverse ordinary sync line");
  equal(floatBytes(reverse.start.x), "00000040", "reverse direction excluded A margin");
  equal(floatBytes(reverse.end.x), "8FC2F5BF", "reverse direction applies B margin inward");
  equal(floatBytes(reverse.width), "2506813E", "reverse width still uses target A local scale");

  const multipleLine = requireOk(buildOrdinaryMultipleDirectionalLine({
    targetA: Object.freeze({
      progressRate: f32(0.5),
      position: vector3(2, 1.25, -13),
      localScale: vector3(1.2, 1.2, 0),
    }),
    targetB: Object.freeze({
      progressRate: f32(0.5),
      position: vector3(-2, 1, -13.5),
      localScale: vector3(0.8, 0.8, 0),
    }),
  }), "build R4 MultipleDirectional back line");
  equal(floatBytes(multipleLine.start.x), "000000C0",
    "R4 back line sorts the lower-X target first");
  equal(floatBytes(multipleLine.end.x), "00000040",
    "R4 back line sorts the higher-X target second");
  equal(floatBytes(multipleLine.start.z), "000058C1",
    "R4 back line preserves complete lower-X target XYZ");
  equal(floatBytes(multipleLine.end.z), "000050C1",
    "R4 back line preserves complete higher-X target XYZ");
  equal(floatBytes(multipleLine.width), "6766663F",
    "R4 back line width uses target A localScale.x times Float32 0.75");

  const badButton = buildOrdinaryBaseNoteMesh({
    ...meshState,
    front: { ...meshState.front, buttonCount: 8 },
  });
  equal(badButton.status, "evidence-required", "button count outside current 1..7 fails closed");
  const zeroRate = buildOrdinaryBaseNoteMesh({ ...meshState, widthRate: f32(0) });
  equal(zeroRate.status, "evidence-required", "zero width rate fails closed");
  const overflow = buildOrdinaryBaseNoteMesh({
    ...meshState,
    front: { ...meshState.front, position: vector2(3.4028234663852886e38, 0), localScaleX: f32(3.4028234663852886e38) },
    widthRate: f32(3.4028234663852886e38),
  });
  equal(overflow.status, "evidence-required", "Float32 overflow fails closed without throwing");
  const degenerate = buildOrdinarySyncLine({
    targetA: target(0, 0, -13, 1, 1, 10),
    targetB: target(0, 0, -12, 1, 1, 10),
    edgeMargin: f32(0),
  });
  equal(degenerate.status, "evidence-required", "degenerate projected line fails closed");
  const malformed = buildOrdinarySyncLine({
    targetA: { ...target(0, 0, -13, 1, 1, 1), lossyScaleX: { value: Number.NaN } as RenderFloat32 },
    targetB: target(1, 0, -13, 1, 1, 1),
    edgeMargin: f32(0.1),
  });
  equal(malformed.status, "evidence-required", "non-Float32 owner value fails closed");

  const longChild = requireOk(createOrdinaryLongNormalChildState(
    { ...motionState, progressRate: f32(0.75), realMoveSecond: f32(0.25) },
    96,
    f32(120),
  ), "create ordinary Long normal child");
  equal(longChild.phase, "wait", "Long after activates in Wait");
  equal(floatBytes(longChild.renderedTransform.position.y), "7E3F9F40", "Long after waits at launcher start Y");
  equal(floatBytes(longChild.motionState.progressRate), "00000000", "Long after activation resets inherited progress");
  const beforeTailLaunch = requireOk(advanceOrdinaryLongNormalChild(longChild, {
    deltaTime: f32(1 / 60),
    launcherMusicPosition: f32(95.999),
    musicPosition: f32(0),
  }), "Long after before launch");
  equal(beforeTailLaunch, longChild, "strict-before LauncherMusicPos preserves exact Wait owner");
  const equalTailLaunch = requireOk(advanceOrdinaryLongNormalChild(longChild, {
    deltaTime: f32(1 / 60),
    launcherMusicPosition: f32(96),
    musicPosition: f32(96),
  }), "Long after equal launch");
  equal(equalTailLaunch.phase, "move", "LauncherMusicPos equality changes Wait to Move");
  equal(floatBytes(equalTailLaunch.renderedTransform.position.y), "7E3F9F40", "equal launch does not synthesize an overshoot Move");
  const stopFrame = requireOk(advanceOrdinaryLongNormalChild(equalTailLaunch, {
    deltaTime: f32(1 / 60),
    launcherMusicPosition: f32(97),
    musicPosition: f32(96),
  }), "Long after stop frame");
  equal(stopFrame.phase, "stop", "Move executes once before non-negative MusicPos tail stop");
  equal(floatBytes(stopFrame.motionState.progressRate), "00000000", "first Move uses zero RealMoveSecond before entering Stop");
  const longMesh = requireOk(buildOrdinaryLongNormalMesh({
    front: motion,
    after: stopFrame.renderedTransform,
    frontButtonCount: 1,
    afterButtonCount: 1,
    screenToSafeAreaRatio: f32(1),
    widthRate: f32(1),
    color: color(0.8, 0.8, 0.8, 0.6),
  }), "build ordinary Long normal mesh");
  equal(longMesh.vertices.length, 22, "Long child base mesh keeps 22 vertices");
  equal(longMesh.indices.length, 60, "Long child base mesh keeps 60 indices");
  equal(createOrdinaryLongNormalChildState(
    { ...motionState, virtualLaneControllerPresent: true }, 96, f32(120),
  ).status, "evidence-required", "Long child virtual lane remains fail-closed");
  equal(createOrdinaryLongNormalChildState(motionState, -1, f32(120)).status,
    "evidence-required", "Long child invalid tail position remains fail-closed");

  console.log("ordinary Note geometry producer tests passed: motion=powf/scale mesh=22/60 line=margin/width long=wait/move/stop failures=closed");
}

main();
