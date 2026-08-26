import type { SimulatorRendererBackend } from "../../backends/renderingContracts";
import type {
  RenderAnimationRole,
  RenderColor,
  RenderCommand,
  RenderFloat32,
  RenderOrderingKey,
  RenderVector2,
  RenderVector3,
} from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { getOrdinaryNoteArrivalSeconds } from "../rendering/ordinaryNoteGeometry";
import { RenderOwnerTransaction, type RenderEngineResourceBindings } from "../rendering/renderCommandProducer";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import type {
  GarupaProductChartProfile,
  GarupaProductNode,
  GarupaProductSlideChain,
} from "./productChartProfile";
import type { GarupaProductTimingGroupAxisProfile } from "./timingGroupAxis";

interface ProductNodeSample {
  readonly node: GarupaProductNode;
  readonly curve: number;
  readonly position: RenderVector3 | null;
  readonly uniformScale: RenderFloat32 | null;
  readonly visible: boolean;
}

export interface GarupaProductRenderSnapshot {
  readonly frame: number;
  readonly createdObjectCount: number;
  readonly visibleObjectCount: number;
  readonly activeEffectCount: number;
  readonly activeTapLaneEffectCount: number;
  readonly syncPairCount: number;
}

export class GarupaProductRenderProducer {
  private frame = 0;
  private readonly created = new Set<string>();
  private readonly visible = new Set<string>();
  private readonly judgedNodeIdentities = new Set<string>();
  private readonly animationElapsedSeconds = new Map<string, number>();
  private readonly chainByIdentity: ReadonlyMap<string, GarupaProductSlideChain>;

  constructor(
    private readonly sessionId: string,
    private readonly renderer: SimulatorRendererBackend,
    private readonly resources: RenderEngineResourceBindings,
    private readonly chart: GarupaProductChartProfile,
    private readonly axis: GarupaProductTimingGroupAxisProfile,
    private readonly scene: GarupaProductSceneLayout,
    private readonly specificSpeed: RenderFloat32,
    private readonly noteColor: boolean,
    private readonly syncLine: boolean,
  ) {
    this.chainByIdentity = new Map(chart.slideChains.map((chain) => [chain.identity, chain]));
  }

  validate(): SimulatorResult<void> {
    if (this.chart.route !== "product-extension") return ok(undefined);
    if (typeof this.sessionId !== "string" || this.sessionId.length === 0 ||
      this.renderer.snapshot().sessionId !== this.sessionId ||
      this.renderer.snapshot().state !== "ready" ||
      this.scene.fieldLines.length !== 7 ||
      this.scene.fieldLines.some((line, index) => line.lane !== index) ||
      this.resources.curveNoteMaterialLogicalAssetId === undefined ||
      typeof this.noteColor !== "boolean" || typeof this.syncLine !== "boolean" ||
      (this.syncLine && this.resources.syncLineLogicalAssetId === undefined)) {
      return rejected(
        "render.garupa-product.invalid-owner-binding",
        "Product rendering requires one ready matching renderer, the unchanged seven reference field lines and an explicit curve material binding.",
      );
    }
    return getOrdinaryNoteArrivalSeconds(this.specificSpeed).status === "ok"
      ? ok(undefined)
      : rejected(
          "render.garupa-product.invalid-specific-speed",
          "Product visual axis requires the already validated positive note-arrival speed.",
        );
  }

  preflightFrame(
    currentAbsolutePosition: number,
    judgedNodes: readonly GarupaProductNode[],
    deltaTimeSeconds: number,
  ): SimulatorResult<RenderOwnerTransaction | null> {
    const valid = this.validate();
    if (valid.status !== "ok") return valid;
    if (!Number.isFinite(currentAbsolutePosition) || currentAbsolutePosition < 0 ||
      !Array.isArray(judgedNodes) || !Number.isFinite(deltaTimeSeconds) ||
      deltaTimeSeconds < 0 || deltaTimeSeconds !== Math.fround(deltaTimeSeconds)) {
      return rejected(
        "render.garupa-product.invalid-frame-input",
        "Product frame projection requires finite current position, one owner-produced judgement list and an exact nonnegative Float32 outer-frame delta.",
      );
    }
    if (this.chart.route !== "product-extension") return ok(null);
    const arrival = getOrdinaryNoteArrivalSeconds(this.specificSpeed);
    if (arrival.status !== "ok") return arrival;
    const arrivalMilliseconds = arrival.value.value * 1000;
    const plannedJudged = new Set(this.judgedNodeIdentities);
    for (const node of judgedNodes) plannedJudged.add(node.identity);
    const samples = new Map<string, ProductNodeSample>();
    for (const node of this.chart.nodes) {
      const displacement = this.axis.displacementAtPosition(
        node.timingGroup,
        node.absolutePosition,
        currentAbsolutePosition,
      );
      if (displacement.status !== "ok") return displacement;
      const progress = 1 - displacement.value / arrivalMilliseconds;
      const curve = Math.pow(1.1, 50 * (progress - 1));
      let position: RenderVector3 | null = null;
      let uniformScale: RenderFloat32 | null = null;
      if (Number.isFinite(curve)) {
        const projected = this.scene.projectLaneAtCurve(
          node.spanStart + (node.width - 1) / 2,
          curve,
        );
        const scale = this.scene.projectNoteScaleAtCurve(curve, node.width);
        if (projected.status !== "ok") {
          if (curve >= 0.002 && curve <= 1) return projected;
        } else if (scale.status !== "ok") {
          if (curve >= 0.002 && curve <= 1) return scale;
        } else {
          position = projected.value;
          uniformScale = scale.value;
        }
      }
      samples.set(node.identity, Object.freeze({
        node,
        curve,
        position,
        uniformScale,
        visible: position !== null && uniformScale !== null &&
          curve >= 0.002 && curve <= 1 && !plannedJudged.has(node.identity),
      }));
    }

    const plannedCreated = new Set(this.created);
    const plannedVisible = new Set(this.visible);
    const plannedAnimationElapsed = new Map(this.animationElapsedSeconds);
    const commands: RenderCommand[] = [];
    const command = commandFactory(this.sessionId, this.renderer, this.frame);

    if (this.syncLine) {
      for (const pair of this.chart.syncPairs) {
        const first = samples.get(pair.firstNodeIdentity)!;
        const second = samples.get(pair.secondNodeIdentity)!;
        const objectId = syncPairObjectId(pair.identity);
        const pairVisible = first.visible && second.visible;
        if (!pairVisible) {
          if (plannedVisible.delete(objectId)) {
            commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId }));
          }
          continue;
        }
        if (!plannedCreated.has(objectId)) {
          commands.push(command(commands.length, {
            kind: "create-object", renderObjectId: objectId,
            poolFamily: "garupa-product-sync-line", role: "sync-line", parentObjectId: null,
          }));
          commands.push(command(commands.length, {
            kind: "bind-resource", renderObjectId: objectId, binding: "material",
            logicalAssetId: this.resources.syncLineLogicalAssetId!, exactKey: null,
          }));
          plannedCreated.add(objectId);
        }
        commands.push(command(commands.length, {
          kind: "set-transform",
          renderObjectId: objectId,
          position: vector3(0, 0, 0),
          scale: vector2(1, 1),
          rotationDegrees: f32(0),
          color: white(),
          ordering: ordering(3, 0, objectId),
          maskObjectId: null,
        }));
        commands.push(command(commands.length, productSyncLine(
          objectId,
          requireProjectedPosition(first),
          requireProjectedPosition(second),
          requireUniformScale(first),
        )));
        if (!plannedVisible.has(objectId)) {
          commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
          plannedVisible.add(objectId);
        }
      }
    }

    for (const node of this.chart.visibleNodes) {
      const sample = samples.get(node.identity)!;
      const objectId = nodeObjectId(node);
      const front = frontBinding(
        node,
        this.resources,
        this.noteColor,
        this.chainByIdentity,
      );
      const animation = productAnimationBinding(
        node,
        objectId,
        this.resources,
        this.chainByIdentity,
      );
      if (sample.visible) {
        if (!plannedCreated.has(objectId)) {
          commands.push(command(commands.length, {
            kind: "create-object",
            renderObjectId: objectId,
            poolFamily: "garupa-product-front",
            role: "note-root",
            parentObjectId: null,
          }));
          commands.push(command(commands.length, {
            kind: "bind-resource",
            renderObjectId: objectId,
            binding: "sprite",
            logicalAssetId: front.logicalAssetId,
            exactKey: front.exactKey,
          }));
          plannedCreated.add(objectId);
          if (animation !== null) {
            commands.push(command(commands.length, {
              kind: "create-object",
              renderObjectId: animation.ownerObjectId,
              poolFamily: `garupa-product-${animation.animationRole}`,
              role: animation.animationRole === "note-long-flash"
                ? "note-intermediate"
                : "note-icon",
              parentObjectId: objectId,
            }));
            commands.push(command(commands.length, {
              kind: "bind-resource",
              renderObjectId: animation.ownerObjectId,
              binding: "sprite",
              logicalAssetId: animation.logicalAssetId,
              exactKey: animation.exactKey,
            }));
            commands.push(command(commands.length, {
              kind: "activate-object",
              renderObjectId: animation.ownerObjectId,
            }));
            commands.push(command(commands.length, {
              kind: "play-animation",
              renderObjectId: animation.ownerObjectId,
              animationRole: animation.animationRole,
              restart: true,
            }));
            plannedCreated.add(animation.ownerObjectId);
            plannedAnimationElapsed.set(animation.ownerObjectId, 0);
          }
        }
        if (!plannedVisible.has(objectId)) {
          commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
          plannedVisible.add(objectId);
        }
        if (animation !== null && !plannedAnimationElapsed.has(animation.ownerObjectId)) {
          commands.push(command(commands.length, {
            kind: "activate-object",
            renderObjectId: animation.ownerObjectId,
          }));
          commands.push(command(commands.length, {
            kind: "play-animation",
            renderObjectId: animation.ownerObjectId,
            animationRole: animation.animationRole,
            restart: true,
          }));
          plannedAnimationElapsed.set(animation.ownerObjectId, 0);
        }
        commands.push(command(commands.length, nodeTransform(
          sample,
          objectId,
        )));
        if (animation !== null) {
          const elapsed = plannedAnimationElapsed.get(animation.ownerObjectId) ?? 0;
          commands.push(command(commands.length, {
            kind: "sample-animation",
            renderObjectId: animation.ownerObjectId,
            animationRole: animation.animationRole,
            elapsedSeconds: f32(elapsed),
          }));
          plannedAnimationElapsed.set(
            animation.ownerObjectId,
            Math.fround(elapsed + deltaTimeSeconds),
          );
        }
      } else if (plannedVisible.delete(objectId)) {
        commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId }));
        if (animation !== null && plannedAnimationElapsed.delete(animation.ownerObjectId)) {
          commands.push(command(commands.length, {
            kind: "stop-animation",
            renderObjectId: animation.ownerObjectId,
            animationRole: animation.animationRole,
            restart: false,
          }));
          commands.push(command(commands.length, {
            kind: "hide-object",
            renderObjectId: animation.ownerObjectId,
          }));
        }
      }
    }

    for (const chain of this.chart.slideChains) {
      for (let index = 1; index < chain.connectionIdentities.length; index += 1) {
        const from = samples.get(chain.connectionIdentities[index - 1]!)!;
        const to = samples.get(chain.connectionIdentities[index]!)!;
        const objectId = lineObjectId(chain.identity, index - 1);
        const lineVisible = from.position !== null && to.position !== null &&
          segmentVisible(from.curve, to.curve);
        if (lineVisible) {
          if (!plannedCreated.has(objectId)) {
            commands.push(command(commands.length, {
              kind: "create-object",
              renderObjectId: objectId,
              poolFamily: "garupa-product-slide-line",
              role: "note-mesh",
              parentObjectId: null,
            }));
            commands.push(command(commands.length, {
              kind: "bind-resource",
              renderObjectId: objectId,
              binding: "material",
              logicalAssetId: this.resources.curveNoteMaterialLogicalAssetId!,
              exactKey: null,
            }));
            commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
            plannedCreated.add(objectId);
            plannedVisible.add(objectId);
          } else if (!plannedVisible.has(objectId)) {
            commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
            plannedVisible.add(objectId);
          }
          commands.push(command(commands.length, {
            kind: "set-transform",
            renderObjectId: objectId,
            position: vector3(0, 0, 0.9900000095367432),
            scale: vector2(1, 1),
            rotationDegrees: f32(0),
            color: white(),
            ordering: ordering(3, 0, objectId, 0.9900000095367432),
            maskObjectId: null,
          }));
          commands.push(command(commands.length, slideMesh(
            objectId,
            from,
            to,
            this.scene.screenToSafeAreaRatio.value,
            this.scene.screenWidthAdjustRate.value,
          )));
          commands.push(command(commands.length, {
            kind: "set-threshold",
            renderObjectId: objectId,
            threshold: f32(712.711181640625),
          }));
        } else if (plannedVisible.delete(objectId)) {
          commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId }));
        }
      }
    }

    if (commands.length === 0) {
      this.frame += 1;
      return ok(null);
    }
    const batch = this.renderer.preflight(commands);
    if (batch.status !== "ok") return batch;
    return ok(new RenderOwnerTransaction(this.renderer, batch.value, () => {
      this.created.clear();
      this.visible.clear();
      for (const id of plannedCreated) this.created.add(id);
      for (const id of plannedVisible) this.visible.add(id);
      this.judgedNodeIdentities.clear();
      for (const id of plannedJudged) this.judgedNodeIdentities.add(id);
      this.animationElapsedSeconds.clear();
      for (const [id, elapsed] of plannedAnimationElapsed) {
        this.animationElapsedSeconds.set(id, elapsed);
      }
      this.frame += 1;
    }));
  }

  preflightDispose(): SimulatorResult<RenderOwnerTransaction | null> {
    if (this.created.size === 0) return ok(null);
    const commands: RenderCommand[] = [];
    const command = commandFactory(this.sessionId, this.renderer, this.frame);
    for (const objectId of [...this.created].reverse()) {
      commands.push(command(commands.length, { kind: "release-object", renderObjectId: objectId }));
    }
    const batch = this.renderer.preflight(commands);
    return batch.status === "ok"
      ? ok(new RenderOwnerTransaction(this.renderer, batch.value, () => {
          this.created.clear();
          this.visible.clear();
          this.judgedNodeIdentities.clear();
          this.animationElapsedSeconds.clear();
        }))
      : batch;
  }

  snapshot(): GarupaProductRenderSnapshot {
    return Object.freeze({
      frame: this.frame,
      createdObjectCount: this.created.size,
      visibleObjectCount: this.visible.size,
      activeEffectCount: this.animationElapsedSeconds.size,
      activeTapLaneEffectCount: 0,
      syncPairCount: this.chart.syncPairs.length,
    });
  }
}

function commandFactory(sessionId: string, renderer: SimulatorRendererBackend, frame: number) {
  const firstSequence = renderer.snapshot().nextSequence;
  return <T extends Omit<RenderCommand, "sessionId" | "sequence" | "frame" | "substep">>(
    offset: number,
    value: T,
  ): RenderCommand => Object.freeze({
    ...value,
    sessionId,
    sequence: firstSequence + offset,
    frame,
    substep: 0,
  }) as RenderCommand;
}

interface ProductAnimationBinding {
  readonly ownerObjectId: string;
  readonly logicalAssetId: string;
  readonly exactKey: string;
  readonly animationRole: Extract<
    RenderAnimationRole,
    "note-flick" | "note-directional-flick" | "note-long-flash"
  >;
}

function frontBinding(
  node: GarupaProductNode,
  resources: RenderEngineResourceBindings,
  noteColor: boolean,
  chains: ReadonlyMap<string, GarupaProductSlideChain>,
) {
  const lane = productResourceLane(node);
  if (node.type === "Directional") {
    return Object.freeze({
      logicalAssetId: resources.directionalAtlasLogicalAssetId,
      exactKey: `note_flick_${node.direction === "Left" ? "l" : "r"}_${lane}`,
    });
  }
  const chain = node.chainIdentity === null ? undefined : chains.get(node.chainIdentity);
  const chainHead = chain !== undefined && node.connectionIndex === 0;
  const chainTerminal = chain !== undefined &&
    node.connectionIndex === chain.connectionIdentities.length - 1;
  if (chain !== undefined && !chainHead && !chainTerminal) {
    return Object.freeze({
      logicalAssetId: resources.noteAtlasLogicalAssetId,
      exactKey: "note_slide_among",
    });
  }
  const family = node.type === "Flick"
    ? "note_flick"
    : chain !== undefined
      ? chainHead && node.type === "Skill"
        ? "note_skill"
        : "note_long"
      : node.type === "Skill"
        ? "note_skill"
        : noteColor && node.shortRhythmUnder8beat
          ? "note_normal_16"
          : "note_normal";
  return Object.freeze({
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `${family}_${lane}`,
  });
}

function productAnimationBinding(
  node: GarupaProductNode,
  parentObjectId: string,
  resources: RenderEngineResourceBindings,
  chains: ReadonlyMap<string, GarupaProductSlideChain>,
): ProductAnimationBinding | null {
  if (node.type === "Directional") {
    return Object.freeze({
      ownerObjectId: `${parentObjectId}:icon`,
      logicalAssetId: resources.directionalAtlasLogicalAssetId,
      exactKey: node.direction === "Left" ? "note_flick_top_l" : "note_flick_top_r",
      animationRole: "note-directional-flick",
    });
  }
  if (node.type === "Flick") {
    return Object.freeze({
      ownerObjectId: `${parentObjectId}:icon`,
      logicalAssetId: resources.noteAtlasLogicalAssetId,
      exactKey: "note_flick_top",
      animationRole: "note-flick",
    });
  }
  if (node.chainIdentity === null || !chains.has(node.chainIdentity) || node.connectionIndex !== 0) {
    return null;
  }
  return Object.freeze({
    ownerObjectId: `${parentObjectId}:long-flash`,
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `note_long_flash_${productResourceLane(node)}`,
    animationRole: "note-long-flash",
  });
}

function productResourceLane(node: GarupaProductNode): number {
  const center = node.spanStart + (node.width - 1) / 2;
  if (Number.isInteger(center) && center >= 0 && center <= 6) return center;
  // Product semantics: fractional/outside nodes use one fixed center glyph of
  // the selected family. This is neither a nearest-lane lookup nor an
  // original-equivalence claim; integer source owners always retain their key.
  return 3;
}

function nodeTransform(
  sample: ProductNodeSample,
  renderObjectId: string,
): Omit<Extract<RenderCommand, { kind: "set-transform" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const scale = requireUniformScale(sample).value;
  return {
    kind: "set-transform",
    renderObjectId,
    position: requireProjectedPosition(sample),
    scale: vector2(scale, scale),
    rotationDegrees: f32(0),
    color: white(),
    ordering: ordering(3, 70, renderObjectId, requireProjectedPosition(sample).z.value),
    maskObjectId: null,
  };
}

function slideMesh(
  renderObjectId: string,
  from: ProductNodeSample,
  to: ProductNodeSample,
  screenToSafeAreaRatio: number,
  screenWidthAdjustRate: number,
): Omit<Extract<RenderCommand, { kind: "set-mesh" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const vertices: RenderVector3[] = [];
  const uv: RenderVector2[] = [];
  const colors: RenderColor[] = [];
  const indices: number[] = [];
  const fromPosition = requireProjectedPosition(from);
  const toPosition = requireProjectedPosition(to);
  const interval = visibleSegmentInterval(from.curve, to.curve);
  if (interval === null) throw new Error(`Invisible product segment reached mesh publication: ${renderObjectId}`);
  const fromScale = requireUniformScale(from).value;
  const toScale = requireUniformScale(to).value;
  for (let section = 0; section <= 10; section += 1) {
    const sectionRatio = Math.fround(section / 10);
    const ratio = Math.fround(
      Math.fround(interval[0]) + Math.fround(
        Math.fround(Math.fround(interval[1]) - Math.fround(interval[0])) * sectionRatio,
      ),
    );
    const x = Math.fround(
      fromPosition.x.value + Math.fround(
        Math.fround(toPosition.x.value - fromPosition.x.value) * ratio,
      ),
    );
    const y = Math.fround(
      fromPosition.y.value + Math.fround(
        Math.fround(toPosition.y.value - fromPosition.y.value) * ratio,
      ),
    );
    const uniformScale = Math.fround(
      fromScale + Math.fround(Math.fround(toScale - fromScale) * ratio),
    );
    const authoredWidth = Math.fround(
      from.node.width + Math.fround(Math.fround(to.node.width - from.node.width) * ratio),
    );
    const halfWidth = Math.fround(
      Math.fround(
        Math.fround(uniformScale * authoredWidth) * Math.fround(screenToSafeAreaRatio),
      ) * Math.fround(screenWidthAdjustRate),
    );
    vertices.push(
      vector3(Math.fround(x - halfWidth), y, 0),
      vector3(Math.fround(x + halfWidth), y, 0),
    );
    uv.push(vector2(0, sectionRatio), vector2(1, sectionRatio));
    colors.push(
      color(1, 1, 1, 0.8),
      color(1, 1, 1, 0.8),
    );
    if (section < 10) {
      const left = section * 2;
      indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
    }
  }
  return {
    kind: "set-mesh",
    renderObjectId,
    vertices: Object.freeze(vertices),
    indices: Object.freeze(indices),
    uv: Object.freeze(uv),
    colors: Object.freeze(colors),
    materialRole: "curve-note",
  };
}

function productSyncLine(
  renderObjectId: string,
  start: RenderVector3,
  end: RenderVector3,
  uniformScale: RenderFloat32,
): Omit<Extract<RenderCommand, { kind: "set-line" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  return {
    kind: "set-line",
    renderObjectId,
    start,
    end,
    width: f32(Math.fround(uniformScale.value * Math.fround(0.2800000011920929))),
    materialRole: "sync-line",
  };
}

function requireProjectedPosition(sample: ProductNodeSample): RenderVector3 {
  if (sample.position === null) {
    throw new Error(`Non-finite product curve ${String(sample.curve)} for ${sample.node.identity} cannot publish render geometry.`);
  }
  return sample.position;
}

function requireUniformScale(sample: ProductNodeSample): RenderFloat32 {
  if (sample.uniformScale === null) {
    throw new Error(`Product Note scale is unavailable for ${sample.node.identity}.`);
  }
  return sample.uniformScale;
}

function visibleSegmentInterval(first: number, second: number): readonly [number, number] | null {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  if (first === second) return first >= 0.002 && first <= 1
    ? Object.freeze([0, 1] as const)
    : null;
  const lower = (0.002 - first) / (second - first);
  const upper = (1 - first) / (second - first);
  const from = Math.max(0, Math.min(lower, upper));
  const to = Math.min(1, Math.max(lower, upper));
  return to >= from ? Object.freeze([from, to] as const) : null;
}

function segmentVisible(first: number, second: number): boolean {
  return visibleSegmentInterval(first, second) !== null;
}

function nodeObjectId(node: GarupaProductNode): string {
  return `render:garupa:node:${node.identity}`;
}
function lineObjectId(chainIdentity: string, segmentIndex: number): string {
  return `render:garupa:line:${chainIdentity}:${segmentIndex}`;
}
function syncPairObjectId(identity: string): string {
  return `render:garupa:sync:${identity}`;
}
function ordering(
  domain: number,
  source: number,
  identity: string,
  sourceZ = 0,
): RenderOrderingKey {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) hash = (Math.imul(hash, 31) + identity.charCodeAt(index)) | 0;
  return Object.freeze({
    domainLayer: domain,
    sourceDepthOrSortingOrder: source,
    sourceZ: f32(sourceZ),
    creationSequence: hash >>> 0,
  });
}
function f32(value: number): RenderFloat32 {
  const created = createRenderFloat32(Math.fround(value));
  if (created.status !== "ok") throw new Error(`${created.capability}: value=${String(value)} rounded=${String(Math.fround(value))}`);
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
function rejected<T>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}
