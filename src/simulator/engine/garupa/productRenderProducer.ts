import type { SimulatorRendererBackend } from "../../backends/renderingContracts";
import type {
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
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type { GarupaProductChartProfile, GarupaProductNode } from "./productChartProfile";
import type { GarupaProductTimingGroupAxisProfile } from "./timingGroupAxis";

interface ProductNodeSample {
  readonly node: GarupaProductNode;
  readonly curve: number;
  readonly position: RenderVector3 | null;
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
  private readonly effectFrames = new Map<string, number>();
  private readonly tapLaneEffectFrames = new Map<string, number>();

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
    private readonly visibleTapLaneEffect: boolean,
  ) {}

  validate(): SimulatorResult<void> {
    if (this.chart.route !== "product-extension") return ok(undefined);
    if (typeof this.sessionId !== "string" || this.sessionId.length === 0 ||
      this.renderer.snapshot().sessionId !== this.sessionId ||
      this.renderer.snapshot().state !== "ready" ||
      this.scene.fieldLines.length !== 7 ||
      this.scene.fieldLines.some((line, index) => line.lane !== index) ||
      this.resources.curveNoteMaterialLogicalAssetId === undefined ||
      typeof this.noteColor !== "boolean" || typeof this.syncLine !== "boolean" ||
      typeof this.visibleTapLaneEffect !== "boolean" ||
      (this.syncLine && this.resources.syncLineLogicalAssetId === undefined) ||
      (this.visibleTapLaneEffect &&
        this.resources.ordinaryVisible?.tapLaneEffectLogicalAssetIds.length !== 4)) {
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
  ): SimulatorResult<RenderOwnerTransaction | null> {
    const valid = this.validate();
    if (valid.status !== "ok") return valid;
    if (!Number.isFinite(currentAbsolutePosition) || currentAbsolutePosition < 0 ||
      !Array.isArray(judgedNodes)) {
      return rejected(
        "render.garupa-product.invalid-frame-input",
        "Product frame projection requires finite current position and one owner-produced judgement list.",
      );
    }
    if (this.chart.route !== "product-extension") return ok(null);
    const arrival = getOrdinaryNoteArrivalSeconds(this.specificSpeed);
    if (arrival.status !== "ok") return arrival;
    const arrivalMilliseconds = arrival.value.value * 1000;
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
      if (Number.isFinite(curve)) {
        const projected = this.scene.projectLaneAtCurve(
          node.spanStart + (node.width - 1) / 2,
          curve,
        );
        if (projected.status !== "ok") {
          if (curve >= 0.002 && curve <= 1.55) return projected;
        } else position = projected.value;
      }
      samples.set(node.identity, Object.freeze({
        node,
        curve,
        position,
        visible: position !== null && curve >= 0.002 && curve <= 1.55,
      }));
    }

    const plannedCreated = new Set(this.created);
    const plannedVisible = new Set(this.visible);
    const plannedEffects = new Map(this.effectFrames);
    const plannedTapLaneEffects = new Map(this.tapLaneEffectFrames);
    for (const node of judgedNodes) {
      plannedEffects.set(effectObjectId(node), 12);
      if (this.visibleTapLaneEffect) plannedTapLaneEffects.set(tapLaneEffectObjectId(node), 12);
    }
    const commands: RenderCommand[] = [];
    const command = commandFactory(this.sessionId, this.renderer, this.frame);

    for (const fieldLine of this.scene.fieldLines) {
      const objectId = `render:garupa:field:${fieldLine.lane}`;
      if (plannedCreated.has(objectId)) continue;
      commands.push(command(commands.length, {
        kind: "create-object",
        renderObjectId: objectId,
        poolFamily: "garupa-product-field",
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
      commands.push(command(commands.length, productFieldMesh(objectId, fieldLine.start, fieldLine.goal)));
      plannedCreated.add(objectId);
      plannedVisible.add(objectId);
    }

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
        commands.push(command(commands.length, productSyncLine(
          objectId,
          requireProjectedPosition(first),
          requireProjectedPosition(second),
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
      if (sample.visible) {
        if (!plannedCreated.has(objectId)) {
          commands.push(command(commands.length, {
            kind: "create-object",
            renderObjectId: objectId,
            poolFamily: "garupa-product-front",
            role: "note-root",
            parentObjectId: null,
          }));
          const binding = frontBinding(node, this.resources, this.noteColor);
          commands.push(command(commands.length, {
            kind: "bind-resource",
            renderObjectId: objectId,
            binding: "sprite",
            logicalAssetId: binding.logicalAssetId,
            exactKey: binding.exactKey,
          }));
          plannedCreated.add(objectId);
        }
        if (!plannedVisible.has(objectId)) {
          commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
          plannedVisible.add(objectId);
        }
        commands.push(command(commands.length, nodeTransform(
          node,
          sample,
          objectId,
          this.scene.noteSettingScale.value,
        )));
      } else if (plannedVisible.delete(objectId)) {
        commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId }));
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
          commands.push(command(commands.length, slideMesh(
            objectId,
            from,
            to,
            this.scene.laneSpacingWorld.value,
            chain.allHidden ? 0.5 : chain.containsHidden ? 0.72 : 0.9,
          )));
        } else if (plannedVisible.delete(objectId)) {
          commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId }));
        }
      }
    }

    for (const [objectId, frames] of plannedEffects) {
      const node = this.chart.nodeByIdentity.get(objectId.slice("render:garupa:effect:".length));
      if (node === undefined || frames <= 0) {
        if (plannedCreated.has(objectId)) {
          commands.push(command(commands.length, { kind: "release-object", renderObjectId: objectId }));
          plannedCreated.delete(objectId);
          plannedVisible.delete(objectId);
        }
        plannedEffects.delete(objectId);
        continue;
      }
      if (!plannedCreated.has(objectId)) {
        commands.push(command(commands.length, {
          kind: "create-object",
          renderObjectId: objectId,
          poolFamily: "garupa-product-particle",
          role: "note-mesh",
          parentObjectId: null,
        }));
        commands.push(command(commands.length, {
          kind: "bind-resource",
          renderObjectId: objectId,
          binding: "material",
          logicalAssetId: this.resources.productJudgementEffectLogicalAssetId ??
            this.resources.curveNoteMaterialLogicalAssetId!,
          exactKey: null,
        }));
        commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
        plannedCreated.add(objectId);
        plannedVisible.add(objectId);
      }
      commands.push(command(commands.length, judgementFlashMesh(
        objectId,
        node,
        this.scene,
        frames,
      )));
      plannedEffects.set(objectId, frames - 1);
    }

    for (const [objectId, frames] of plannedTapLaneEffects) {
      const node = this.chart.nodeByIdentity.get(objectId.slice("render:garupa:tap-lane:".length));
      if (node === undefined || frames <= 0) {
        if (plannedCreated.has(objectId)) {
          commands.push(command(commands.length, { kind: "release-object", renderObjectId: objectId }));
          plannedCreated.delete(objectId);
          plannedVisible.delete(objectId);
        }
        plannedTapLaneEffects.delete(objectId);
        continue;
      }
      const center = node.spanStart + (node.width - 1) / 2;
      const projected = this.scene.projectLaneAtCurve(center, 1);
      if (projected.status !== "ok") return projected;
      if (!plannedCreated.has(objectId)) {
        commands.push(command(commands.length, {
          kind: "create-object", renderObjectId: objectId,
          poolFamily: "garupa-product-tap-lane-effect", role: "tap-lane-effect", parentObjectId: null,
        }));
        commands.push(command(commands.length, {
          kind: "bind-resource", renderObjectId: objectId, binding: "sprite",
          logicalAssetId: this.resources.ordinaryVisible!.tapLaneEffectLogicalAssetIds[3],
          exactKey: "NoteLaneEffect_4",
        }));
        plannedCreated.add(objectId);
      }
      commands.push(command(commands.length, productTapLaneTransform(
        objectId, node, projected.value, frames,
      )));
      if (!plannedVisible.has(objectId)) {
        commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
        plannedVisible.add(objectId);
      }
      plannedTapLaneEffects.set(objectId, frames - 1);
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
      this.effectFrames.clear();
      this.tapLaneEffectFrames.clear();
      for (const id of plannedCreated) this.created.add(id);
      for (const id of plannedVisible) this.visible.add(id);
      for (const [id, frames] of plannedEffects) this.effectFrames.set(id, frames);
      for (const [id, frames] of plannedTapLaneEffects) this.tapLaneEffectFrames.set(id, frames);
      this.frame += 1;
    }));
  }

  preflightDispose(): SimulatorResult<RenderOwnerTransaction | null> {
    if (this.created.size === 0) return ok(null);
    const commands: RenderCommand[] = [];
    const command = commandFactory(this.sessionId, this.renderer, this.frame);
    for (const objectId of this.created) {
      commands.push(command(commands.length, { kind: "release-object", renderObjectId: objectId }));
    }
    const batch = this.renderer.preflight(commands);
    return batch.status === "ok"
      ? ok(new RenderOwnerTransaction(this.renderer, batch.value, () => {
          this.created.clear();
          this.visible.clear();
          this.effectFrames.clear();
          this.tapLaneEffectFrames.clear();
        }))
      : batch;
  }

  snapshot(): GarupaProductRenderSnapshot {
    return Object.freeze({
      frame: this.frame,
      createdObjectCount: this.created.size,
      visibleObjectCount: this.visible.size,
      activeEffectCount: this.effectFrames.size,
      activeTapLaneEffectCount: this.tapLaneEffectFrames.size,
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

function frontBinding(
  node: GarupaProductNode,
  resources: RenderEngineResourceBindings,
  noteColor: boolean,
) {
  if (node.type === "Directional") {
    return Object.freeze({
      logicalAssetId: resources.directionalAtlasLogicalAssetId,
      exactKey: `note_flick_${node.direction === "Left" ? "l" : "r"}_3`,
    });
  }
  const family = node.type === "Skill"
    ? "note_skill"
    : node.type === "Flick"
      ? "note_flick"
      : noteColor && node.shortRhythmUnder8beat
        ? "note_normal_16"
        : "note_normal";
  return Object.freeze({
    logicalAssetId: resources.noteAtlasLogicalAssetId,
    exactKey: `${family}_3`,
  });
}

function nodeTransform(
  node: GarupaProductNode,
  sample: ProductNodeSample,
  renderObjectId: string,
  noteSettingScale: number,
): Omit<Extract<RenderCommand, { kind: "set-transform" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const scale = noteSettingScale * Math.max(0.03, Math.min(2.5, sample.curve));
  const width = node.type === "Directional" ? node.width : node.width;
  return {
    kind: "set-transform",
    renderObjectId,
    position: requireProjectedPosition(sample),
    scale: vector2(scale * width, scale),
    rotationDegrees: f32(0),
    color: white(),
    ordering: ordering(3, node.authoredOrder, renderObjectId),
    maskObjectId: null,
  };
}

function slideMesh(
  renderObjectId: string,
  from: ProductNodeSample,
  to: ProductNodeSample,
  laneSpacing: number,
  alpha: number,
): Omit<Extract<RenderCommand, { kind: "set-mesh" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const vertices: RenderVector3[] = [];
  const uv: RenderVector2[] = [];
  const colors: RenderColor[] = [];
  const indices: number[] = [];
  const fromPosition = requireProjectedPosition(from);
  const toPosition = requireProjectedPosition(to);
  for (let section = 0; section <= 10; section += 1) {
    const ratio = section / 10;
    const x = fromPosition.x.value + (toPosition.x.value - fromPosition.x.value) * ratio;
    const y = fromPosition.y.value + (toPosition.y.value - fromPosition.y.value) * ratio;
    const curve = from.curve + (to.curve - from.curve) * ratio;
    const width = Math.max(0.008, laneSpacing * Math.max(from.node.width, to.node.width) * 0.48 * Math.max(0.02, curve));
    vertices.push(vector3(x - width, y, 0), vector3(x + width, y, 0));
    uv.push(vector2(0, ratio), vector2(1, ratio));
    colors.push(color(0.38, 0.9, 0.57, alpha), color(0.38, 0.9, 0.57, alpha));
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
): Omit<Extract<RenderCommand, { kind: "set-line" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  return {
    kind: "set-line",
    renderObjectId,
    start,
    end,
    width: f32(0.28),
    materialRole: "sync-line",
  };
}

function productFieldMesh(
  renderObjectId: string,
  start: RenderVector3,
  goal: RenderVector3,
): Omit<Extract<RenderCommand, { kind: "set-mesh" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const vertices: RenderVector3[] = [];
  const uv: RenderVector2[] = [];
  const colors: RenderColor[] = [];
  const indices: number[] = [];
  for (let section = 0; section <= 10; section += 1) {
    const ratio = section / 10;
    const x = start.x.value + (goal.x.value - start.x.value) * ratio;
    const y = start.y.value + (goal.y.value - start.y.value) * ratio;
    const halfWidth = 0.004 + ratio * 0.006;
    vertices.push(vector3(x - halfWidth, y, 0), vector3(x + halfWidth, y, 0));
    uv.push(vector2(0, ratio), vector2(1, ratio));
    colors.push(color(0.32, 0.48, 0.82, 0.38), color(0.32, 0.48, 0.82, 0.38));
    if (section < 10) {
      const offset = section * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
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

function judgementFlashMesh(
  renderObjectId: string,
  node: GarupaProductNode,
  scene: GarupaProductSceneLayout,
  frames: number,
): Omit<Extract<RenderCommand, { kind: "set-mesh" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const centerResult = scene.projectLaneAtCurve(node.spanStart + (node.width - 1) / 2, 1);
  if (centerResult.status !== "ok") throw new Error(`${centerResult.capability}: ${centerResult.boundary}: node=${node.identity} spanStart=${String(node.spanStart)} width=${String(node.width)}`);
  const center = centerResult.value;
  const life = frames / 12;
  const radius = scene.laneSpacingWorld.value * node.width * (0.35 + (1 - life) * 0.35);
  const left = Object.freeze({ ...center, x: f32(center.x.value - radius), z: f32(0) });
  const right = Object.freeze({ ...center, x: f32(center.x.value + radius), z: f32(0) });
  const vertices: RenderVector3[] = [];
  const uv: RenderVector2[] = [];
  const colors: RenderColor[] = [];
  const indices: number[] = [];
  for (let section = 0; section <= 10; section += 1) {
    const ratio = section / 10;
    const y = center.y.value - radius + radius * 2 * ratio;
    vertices.push(vector3(left.x.value, y, 0), vector3(right.x.value, y, 0));
    uv.push(vector2(0, ratio), vector2(1, ratio));
    colors.push(color(1, 0.86, 0.3, life), color(1, 0.86, 0.3, life));
    if (section < 10) {
      const offset = section * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
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

function productTapLaneTransform(
  renderObjectId: string,
  node: GarupaProductNode,
  position: RenderVector3,
  frames: number,
): Omit<Extract<RenderCommand, { kind: "set-transform" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const elapsed = 12 - frames;
  const progress = elapsed < 2 ? 0 : Math.min(1, (elapsed - 2) / 10);
  const scale = 1 - 0.3 * progress;
  const channel = 1 - progress;
  return {
    kind: "set-transform",
    renderObjectId,
    position,
    scale: vector2(scale * node.width, scale),
    rotationDegrees: f32(0),
    color: color(channel, channel, 1, 1),
    ordering: ordering(3, node.authoredOrder, renderObjectId),
    maskObjectId: null,
  };
}

function requireProjectedPosition(sample: ProductNodeSample): RenderVector3 {
  if (sample.position === null) {
    throw new Error(`Non-finite product curve ${String(sample.curve)} for ${sample.node.identity} cannot publish render geometry.`);
  }
  return sample.position;
}

function segmentVisible(first: number, second: number): boolean {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
  const minimum = Math.min(first, second);
  const maximum = Math.max(first, second);
  return maximum >= 0.002 && minimum <= 1.55;
}

function nodeObjectId(node: GarupaProductNode): string {
  return `render:garupa:node:${node.identity}`;
}
function lineObjectId(chainIdentity: string, segmentIndex: number): string {
  return `render:garupa:line:${chainIdentity}:${segmentIndex}`;
}
function effectObjectId(node: GarupaProductNode): string {
  return `render:garupa:effect:${node.identity}`;
}
function tapLaneEffectObjectId(node: GarupaProductNode): string {
  return `render:garupa:tap-lane:${node.identity}`;
}
function syncPairObjectId(identity: string): string {
  return `render:garupa:sync:${identity}`;
}
function ordering(domain: number, source: number, identity: string): RenderOrderingKey {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) hash = (Math.imul(hash, 31) + identity.charCodeAt(index)) | 0;
  return Object.freeze({
    domainLayer: domain,
    sourceDepthOrSortingOrder: source,
    sourceZ: f32(0),
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
  return evidenceRequired(capability, [], boundary);
}
