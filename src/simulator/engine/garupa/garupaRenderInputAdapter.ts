import { GameNoteType } from "../chart/types";
import { buildGarupaSyncInputs, advanceGarupaSyncInputs, garupaSyncPairs, type GarupaSyncState, type SyncInput } from "./garupaSyncInputs";
import { createOrdinaryLongNormalChildState, type OrdinaryLongNormalChildState } from "../rendering/ordinaryLongChildLifecycle";
import { slideAxisInterval } from "./slideAxisMesh";
import { noteBodyBinding, noteFlickIconBinding, noteSlideFlashBinding, slideLineMaterialRole } from "../rendering/noteVisualBinding";
import type {
  RenderAnimationRole,
  RenderFloat32,
  RenderVector3,
} from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { calculateNoteMotionCurve, calculateOrdinaryNoteWorldScaleAxis, getOrdinaryNoteArrivalSeconds, type OrdinarySyncLineTargetState } from "../rendering/ordinaryNoteGeometry";
import { RenderCommandProducer, type NotePresentation, type RenderOwnerTransaction, type RenderEngineResourceBindings, type OrdinaryFixedNoteSceneInput } from "../rendering/renderCommandProducer";
import { advanceExtensionSlide, advanceExtensionMotion, noteRenderInput, bpmAtNode, type ExtensionSlideState, type ExtensionRenderFrame } from "./slideRenderExtension";
import type { OrdinarySlideFrameResult } from "../rendering/ordinarySlideChildLifecycle";
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
  readonly moving: boolean;
  readonly syncTarget?: OrdinarySyncLineTargetState;
}

export interface GarupaProductRenderSnapshot {
  readonly frame: number;
  readonly createdObjectCount: number;
  readonly visibleObjectCount: number;
  readonly activeEffectCount: number;
  readonly activeTapLaneEffectCount: number;
  readonly syncPairCount: number;
}

export class GarupaRenderInputAdapter {
  private frame = 0;
  private syncState: GarupaSyncState | undefined;
  private readonly syncInputs: readonly SyncInput[];
  private readonly adaptedSyncPositions: ReadonlySet<number>;
  private readonly judgedNodeIdentities = new Set<string>();
  private readonly chainByIdentity: ReadonlyMap<string, GarupaProductSlideChain>;
  private readonly slideStates = new Map<string, ExtensionSlideState>();
  private readonly singleStates = new Map<string, OrdinaryLongNormalChildState>();
  private readonly axisGroups: ReadonlySet<string>;

  constructor(
    private readonly producer: RenderCommandProducer,
    private readonly resources: RenderEngineResourceBindings,
    private readonly chart: GarupaProductChartProfile,
    private readonly axis: GarupaProductTimingGroupAxisProfile,
    private readonly scene: GarupaProductSceneLayout,
    private readonly specificSpeed: RenderFloat32,
    private readonly noteColor: boolean,
    private readonly syncLine: boolean,
    private readonly syncLineEdgeMargin: RenderFloat32,
    private readonly ordinaryScene: OrdinaryFixedNoteSceneInput,
    private readonly originalPresentation: (identity: string) => SimulatorResult<{
      readonly target: OrdinarySyncLineTargetState; readonly visible: boolean;
    } | null>,
  ) {
    this.syncInputs = buildGarupaSyncInputs(chart);
    this.adaptedSyncPositions = new Set(chart.visibleNodes.map(node => node.absolutePosition));
    this.chainByIdentity = new Map(chart.slideChains.map((chain) => [chain.identity, chain]));
    this.axisGroups = new Set(axis.groups.filter(group => group.changes.some(change => change.speed !== 1)).map(group => group.id));
  }

  validate(): SimulatorResult<void> {
    if (!this.chart.hasExtensions) return ok(undefined);
    const owner = this.producer.validate();
    if (owner.status !== "ok") return owner;
    if (this.scene.fieldLines.length !== 7 ||
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
    frameInput: Omit<ExtensionRenderFrame, "absolutePosition" | "deltaTimeSeconds" | "judged">,
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
    if (!this.chart.hasExtensions) return ok(null);
    const arrival = getOrdinaryNoteArrivalSeconds(this.specificSpeed);
    if (arrival.status !== "ok") return arrival;
    const arrivalMilliseconds = arrival.value.value * 1000;
    const plannedJudged = new Set(this.judgedNodeIdentities);
    for (const node of judgedNodes) plannedJudged.add(node.identity);
    for (const id of frameInput.missed) plannedJudged.add(id);
    const samples = new Map<string, ProductNodeSample>();
    for (const authored of this.chart.nodes) {
      const node = noteRenderInput(authored);
      const displacement = this.axis.displacementAtPosition(
        node.timingGroup,
        node.absolutePosition,
        currentAbsolutePosition,
      );
      if (displacement.status !== "ok") return displacement;
      const progress = 1 - displacement.value / arrivalMilliseconds;
      const curve = calculateNoteMotionCurve(progress, true);
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
        } else {
          position = projected.value;
          if (scale.status !== "ok") {
            if (curve >= 0.002 && curve <= 1) return scale;
          } else {
            uniformScale = scale.value;
          }
        }
      }
      samples.set(node.identity, Object.freeze({
        node,
        curve,
        position,
        uniformScale,
        moving: false,
        visible: position !== null && uniformScale !== null &&
          curve >= 0.002 && curve <= 1 && !plannedJudged.has(node.identity),
      }));
    }

    const frame: ExtensionRenderFrame = { ...frameInput, absolutePosition: currentAbsolutePosition,
      deltaTimeSeconds, judged: new Set(judgedNodes.map(node => node.identity)) };
    const motionInput = { deltaTime: f32(deltaTimeSeconds), launcherMusicPosition: f32(frame.launcherMusicPosition),
      adjustedMusicPosition: f32(frame.adjustedMusicPosition) };
    const plannedSingles = new Map(this.singleStates);
    for (const authored of this.chart.nodes) {
      const node = noteRenderInput(authored);
      if (node.chainIdentity !== null || plannedJudged.has(node.identity)) continue;
      let state = plannedSingles.get(node.identity);
      if (state === undefined) {
        const motion = this.scene.motionStateAtLane(node.spanStart + (node.width - 1) / 2, node.width, node.absolutePosition);
        if (motion.status !== "ok") return motion;
        const created = createOrdinaryLongNormalChildState(motion.value, node.absolutePosition, f32(bpmAtNode(this.axis, node.absolutePosition)));
        if (created.status !== "ok") return created;
        state = created.value;
      }
      const advanced = advanceExtensionMotion(state, node, frame, motionInput, this.scene, this.axis, this.axisGroups.has(node.timingGroup));
      if (advanced.status !== "ok") return advanced;
      // Single notes keep moving until the judgement/timeout consumer retires them.
      state = advanced.value.phase === "stop" ? { ...advanced.value, phase: "move" } : advanced.value;
      plannedSingles.set(node.identity, state);
      const previous = samples.get(node.identity)!;
      samples.set(node.identity, { ...previous, position: state.renderedTransform.position,
        uniformScale: state.renderedTransform.localScale.x, moving: state.phase === "move",
        visible: state.phase !== "wait" && (!this.axisGroups.has(node.timingGroup) || previous.visible) });
    }
    const plannedSlides = new Map(this.slideStates);
    const slideSegments = new Map<string, OrdinarySlideFrameResult["segments"]>();
    for (const chain of this.chart.slideChains) {
      const nodes = chain.connectionIdentities.map(id => noteRenderInput(this.chart.nodeByIdentity.get(id)!));
      const advanced = advanceExtensionSlide(nodes, this.slideStates.get(chain.identity), frame, this.scene, this.ordinaryScene, this.axis,
      this.axisGroups.has(chain.timingGroup));
      if (advanced.status !== "ok") return advanced;
      const state = advanced.value.state;
      plannedSlides.set(chain.identity, state);
      slideSegments.set(chain.identity, advanced.value.segments);
      for (const [index, node] of nodes.entries()) {
        const previous = samples.get(node.identity)!;
        const lifecycle = index === 0 ? state.root : state.children[index - 1]!.lifecycle;
        const transform = lifecycle.renderedTransform;
        const visible = index === 0 ? state.rootVisible : state.children[index - 1]!.visible;
        const stopped = lifecycle.phase === "stop";
        samples.set(node.identity, { ...previous, position: transform.position,
          uniformScale: transform.localScale.x,
          curve: stopped ? 1 : previous.curve, moving: lifecycle.phase === "move",
          visible: !state.finished && visible && lifecycle.phase !== "wait" &&
            (stopped || !this.axisGroups.has(chain.timingGroup) || previous.curve >= 0.002 && previous.curve <= 1) });
      }
    }

    const plans: NotePresentation[] = [];
    const retired = new Set<string>();
    for (const node of this.chart.nodes) {
      const state = node.chainIdentity === null ? undefined : plannedSlides.get(node.chainIdentity);
      if (state === undefined ? plannedJudged.has(node.identity) : state.finished ||
        (node.connectionIndex === 0 ? !state.rootVisible : !state.children[node.connectionIndex! - 1]!.visible)) retired.add(node.identity);
    }
    const sync = advanceGarupaSyncInputs(this.syncInputs, this.syncState, currentAbsolutePosition, frame.launcherMusicPosition);
    if (sync.status !== "ok") return sync;
    if (this.syncLine) {
      for (const pair of garupaSyncPairs(sync.value)) {
        if (!this.adaptedSyncPositions.has(pair.first.absolutePosition)) continue;
        for (const node of [pair.first, pair.second]) {
          if (samples.has(node.identity)) continue;
          const actual = this.originalPresentation(node.identity);
          if (actual.status !== "ok") return actual;
          samples.set(node.identity, { node, curve: 0, position: actual.value?.target.position ?? null,
            uniformScale: actual.value?.target.localScaleX ?? null, visible: actual.value?.visible ?? false, moving: actual.value?.visible ?? false,
            syncTarget: actual.value?.target });
        }
        const first = samples.get(pair.first.identity)!, second = samples.get(pair.second.identity)!;
        const visible = first.visible && second.visible && first.moving && second.moving;
        plans.push({ id: syncPairObjectId(pair.identity), lifetime: pair.identity, kind: "sync-line", visible,
          state: visible ? { targetA: this.syncTargetAtLane(first, pair.firstLane),
            targetB: this.syncTargetAtLane(second, pair.secondLane), edgeMargin: this.syncLineEdgeMargin } : null });
      }
    }

    const visualNodes: GarupaProductNode[] = [];
    const visualOwners = new Map<string, GarupaProductNode>();
    const directionalEdges: Array<readonly [GarupaProductNode, GarupaProductNode, "Left" | "Right"]> = [];
    const iconOwners = new Set<string>();
    for (const authored of this.chart.visibleNodes) {
      const node = noteRenderInput(authored);
      visualNodes.push(node);
      visualOwners.set(node.identity, authored);
      if (node.type !== "Directional" || authored.width === 1) { iconOwners.add(node.identity); continue; }
      const baseSample = samples.get(node.identity)!;
      const parts: GarupaProductNode[] = [];
      const bounds = this.scene.visibleLaneRangeAtCurve(baseSample.curve);
      const first = Math.max(0, Math.floor(bounds[0] - authored.spanStart) - 1);
      const last = Math.min(authored.width - 1, Math.ceil(bounds[1] - authored.spanStart) + 1);
      for (let index = first; index <= last; index = index + 1 > index ? index + 1 : Infinity) {
        const lane = authored.spanStart + index;
        const part = lane === authored.lane ? node : { ...node, identity: `${node.identity}:side:${index}`,
          lane, spanStart: lane, spanEnd: lane, chainIdentity: null, connectionIndex: null };
        parts.push(part);
        if (lane === (authored.direction === "Left" ? authored.spanStart : authored.spanEnd)) iconOwners.add(part.identity);
        if (part === node) continue;
        const position = this.scene.projectLaneAtCurve(lane, baseSample.curve);
        const anchor = this.scene.projectLaneAtCurve(authored.lane, baseSample.curve);
        if (position.status !== "ok" && baseSample.visible) return position;
        samples.set(part.identity, { ...baseSample, node: part,
          position: position.status === "ok" && anchor.status === "ok" && baseSample.position !== null
            ? vector3(baseSample.position.x.value + position.value.x.value - anchor.value.x.value,
                baseSample.position.y.value, baseSample.position.z.value) : null });
        visualNodes.push(part); visualOwners.set(part.identity, authored);
      }
      for (let index = 1; index < parts.length; index += 1)
        directionalEdges.push([parts[index - 1]!, parts[index]!, authored.direction!]);
    }
    for (const node of visualNodes) {
      const sample = samples.get(node.identity)!;
      const objectId = nodeObjectId(node);
      const animation = iconOwners.has(node.identity) ? productAnimationBinding(node, objectId, this.resources) : null;
      plans.push({ id: objectId, lifetime: visualOwners.get(node.identity)!.identity, kind: "body", visible: sample.visible,
        position: sample.position, localScale: sample.uniformScale === null ? null : vector3(sample.uniformScale.value, sample.uniformScale.value, 0),
        binding: frontBinding(node, this.resources, this.noteColor, this.chainByIdentity),
        animations: animation === null ? [] : [{ ...animation, lifetime: visualOwners.get(node.identity)!.identity }] });
    }
    // Flash is a child of the actual Slide root, including an invisible authored head.
    for (const chain of this.chart.slideChains) {
      const state = plannedSlides.get(chain.identity)!;
      if (state.finished) retired.add(chain.identity);
      const rootNode = this.chart.nodeByIdentity.get(chain.connectionIdentities[0]!)!;
      const id = nodeObjectId(rootNode);
      const index = plans.findIndex(plan => plan.id === id);
      const body = index < 0 ? undefined : plans[index];
      const existing = body?.kind === "body" ? body : undefined;
      const plan: NotePresentation = { id, lifetime: rootNode.identity, kind: "body",
        visible: (existing?.visible ?? false) || state.flashActive,
        contentVisible: existing?.visible ?? false,
        position: state.root.renderedTransform.position, localScale: state.root.renderedTransform.localScale,
        binding: existing?.binding ?? null,
        animations: [...existing?.animations ?? [], { ownerObjectId: slideFlashObjectId(chain.identity),
          ...resolveProductSlideFlashBinding(rootNode, this.resources), animationRole: "note-long-flash",
          lifetime: chain.identity, revision: state.flashActive ? 1 : null }] };
      if (index < 0) plans.push(plan); else plans[index] = plan;
    }
    for (const [first, second, direction] of directionalEdges) {
      const a = samples.get(first.identity)!, b = samples.get(second.identity)!;
      const visible = a.visible && b.visible && a.moving && b.moving;
      const target = (sample: ProductNodeSample) => ({ position: requireProjectedPosition(sample),
        localScale: vector3(requireUniformScale(sample).value, requireUniformScale(sample).value, 0), progressRate: f32(0) });
      plans.push({ id: `render:garupa:directional-line:${first.identity}:${second.identity}`,
        lifetime: visualOwners.get(first.identity)!.identity, kind: "multiple-directional-line",
        direction: direction === "Left" ? "left" : "right", visible,
        state: visible ? { targetA: target(a), targetB: target(b) } : null });
    }

    for (const chain of this.chart.slideChains) {
      const materialRole = slideLineMaterialRole(chain.connectionIdentities.slice(1)
        .some(id => !this.chart.nodeByIdentity.get(id)!.visible));
      for (let index = 1; index < chain.connectionIdentities.length; index += 1) {
        const from = samples.get(chain.connectionIdentities[index - 1]!)!;
        const to = samples.get(chain.connectionIdentities[index]!)!;
        const objectId = lineObjectId(chain.identity, index - 1);
        const slideState = plannedSlides.get(chain.identity)!;
        const lineVisible = !slideState.finished && slideState.children[index - 1]!.meshVisible &&
          slideAxisInterval(from.curve, to.curve) !== null;
        plans.push({ id: objectId, lifetime: chain.identity, kind: "curve-note", visible: lineVisible,
          materialRole,
          geometry: lineVisible ? slideSegments.get(chain.identity)![index - 1]!.geometry : null });
      }
    }
    return this.producer.preflightNotePresentation(plans, retired, this.ordinaryScene, deltaTimeSeconds, () => {
      this.syncState = sync.value;
      this.judgedNodeIdentities.clear();
      for (const id of plannedJudged) this.judgedNodeIdentities.add(id);
      this.singleStates.clear();
      for (const [id, state] of plannedSingles) this.singleStates.set(id, state);
      this.slideStates.clear();
      for (const [id, state] of plannedSlides) this.slideStates.set(id, state);
      this.frame += 1;
    });
  }

  snapshot(): GarupaProductRenderSnapshot {
    return Object.freeze({ ...this.producer.notePresentationSnapshot(), frame: this.frame,
      activeTapLaneEffectCount: 0, syncPairCount: this.syncState?.lines.filter(line => this.adaptedSyncPositions.has((line.afterA ? line.targetA.tail! : line.targetA.front).absolutePosition)).length ?? 0 });
  }

  private syncTargetAtLane(sample: ProductNodeSample, lane: number): OrdinarySyncLineTargetState {
    const node = sample.node;
    const original = syncTarget(sample, this.ordinaryScene.noteParentScale);
    const chain = node.chainIdentity === null ? undefined : this.chainByIdentity.get(node.chainIdentity);
    const target = chain !== undefined && node.connectionIndex === chain.connectionIdentities.length - 1 &&
      node.type === "Directional" && node.width > 1
      ? { ...original, gameNoteType: node.direction === "Left" ? GameNoteType.SlideADirectionalFlickLeftAdd : GameNoteType.SlideADirectionalFlickRightAdd }
      : original;
    const anchor = node.type === "Directional" ? node.lane : node.spanStart + (node.width - 1) / 2;
    if (anchor === lane) return target;
    // Recover the curve from the committed root Y for original endpoints too.
    const startY = this.ordinaryScene.noteStartPositions[3]!.y.value;
    const goalY = this.ordinaryScene.goalPositions[3]!.y.value;
    const curve = (target.position.y.value - startY) / (goalY - startY);
    const projected = this.scene.projectLaneAtCurve(lane, curve);
    const origin = this.scene.projectLaneAtCurve(anchor, curve);
    if (projected.status !== "ok" || origin.status !== "ok") throw new Error("SyncLine endpoint projection is not finite.");
    return { ...target, position: vector3(target.position.x.value + projected.value.x.value - origin.value.x.value,
      target.position.y.value, target.position.z.value) };
  }

  releaseInputs(): void {
    this.syncState = undefined;
    this.judgedNodeIdentities.clear();
    this.singleStates.clear();
    this.slideStates.clear();
  }

  getSlidePresentation(identity: string) {
    const state = this.slideStates.get(identity);
    return state === undefined ? null : { transform: state.root.renderedTransform, active: state.flashActive };
  }

  getSlideJudgePosition(node: GarupaProductNode): number | null {
    if (node.chainIdentity === null || node.connectionIndex === null) return null;
    const state = this.slideStates.get(node.chainIdentity);
    return state === undefined ? null : node.connectionIndex === 0
      ? state.rootJudgeY : state.children[node.connectionIndex - 1]?.judgeY ?? null;
  }

  getSlideNodePhase(node: GarupaProductNode): "wait" | "move" | "stop" | null {
    if (node.chainIdentity === null || node.connectionIndex === null) return null;
    const state = this.slideStates.get(node.chainIdentity);
    return state === undefined ? null : node.connectionIndex === 0
      ? state.root.phase : state.children[node.connectionIndex - 1]?.lifecycle.phase ?? null;
  }

  getInputPositionY(node: GarupaProductNode): number | null {
    if (node.chainIdentity === null) {
      const state = this.singleStates.get(node.identity);
      return state === undefined || state.phase === "wait" ? null : state.renderedTransform.position.y.value;
    }
    const state = this.slideStates.get(node.chainIdentity);
    if (state === undefined || state.root.phase === "wait" || state.playableFinished) return null;
    return node.connectionIndex === 0 ? state.root.renderedTransform.position.y.value
      : state.children[node.connectionIndex! - 1]?.lifecycle.renderedTransform.position.y.value ?? null;
  }
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
  const chain = node.chainIdentity === null ? undefined : chains.get(node.chainIdentity);
  const chainHead = chain !== undefined && node.connectionIndex === 0;
  const intermediate = chain !== undefined && !chainHead &&
    node.connectionIndex !== chain.connectionIdentities.length - 1;
  const family = intermediate && node.type !== "Directional" ? "note_slide_among"
    : node.type === "Flick" || node.type === "Directional" ? "note_flick"
    : chain !== undefined ? chainHead && node.type === "Skill" ? "note_skill" : "note_long"
    : node.type === "Skill" ? "note_skill"
    : noteColor && node.shortRhythmUnder8beat ? "note_normal_16" : "note_normal";
  const habahiro = resources.habahiroAtlasLogicalAssetIds !== undefined && node.width <= 7;
  return noteBodyBinding(resources, family, resourceSuffix(node, habahiro), node.width, habahiro,
    node.type === "Directional" ? node.direction === "Left" ? "l" : "r" : null);
}

function productAnimationBinding(
  node: GarupaProductNode,
  parentObjectId: string,
  resources: RenderEngineResourceBindings,
): ProductAnimationBinding | null {
  if (node.type !== "Directional" && node.type !== "Flick") return null;
  return { ownerObjectId: `${parentObjectId}:icon`,
    ...noteFlickIconBinding(resources, node.type === "Flick" ? "up" : node.direction === "Left" ? "left" : "right",
      node.width, resources.habahiroAtlasLogicalAssetIds !== undefined && node.width <= 7),
    animationRole: node.type === "Flick" ? "note-flick" : "note-directional-flick" };
}

function productResourceLane(node: GarupaProductNode): number {
  const center = node.spanStart + (node.width - 1) / 2;
  if (Number.isInteger(center) && center >= 0 && center <= 6) return center;
  // Product semantics: fractional/outside nodes use one fixed center glyph of
  // the selected family. This is neither a nearest-lane lookup nor an
  // original-equivalence claim; integer source owners always retain their key.
  return 3;
}

function resourceSuffix(front: GarupaProductNode, habahiro: boolean): string {
  if (!habahiro) return String(productResourceLane(front));
  if (Number.isInteger(front.spanStart) && front.spanStart >= 0 && front.spanEnd <= 6)
    return Array.from({ length: front.width }, (_, index) => front.spanStart + index).join("_");
  const center = front.spanStart + (front.width - 1) / 2;
  const suffix = front.width === 1 ? "3"
    : front.width === 2 ? center <= 3 ? "2_3" : "3_4"
    : front.width === 3 ? "2_3_4"
    : front.width === 4 ? center <= 3 ? "1_2_3_4" : "2_3_4_5"
    : front.width === 5 ? "1_2_3_4_5"
    : front.width === 6 ? center <= 3 ? "0_1_2_3_4_5" : "1_2_3_4_5_6"
    : front.width === 7 ? "0_1_2_3_4_5_6"
    : "3";
  return suffix;
}

export function resolveProductSlideFlashBinding(
  front: GarupaProductNode,
  resources: RenderEngineResourceBindings,
): Readonly<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const habahiro = resources.habahiroAtlasLogicalAssetIds !== undefined && front.width <= 7;
  return noteSlideFlashBinding(resources, front.width, front.spanStart + (front.width - 1) / 2, habahiro);
}

function syncTarget(sample: ProductNodeSample, parentScale: RenderFloat32): OrdinarySyncLineTargetState {
  return sample.syncTarget ?? {
    position: requireProjectedPosition(sample),
    localScaleX: requireUniformScale(sample),
    lossyScaleX: f32(calculateOrdinaryNoteWorldScaleAxis(requireUniformScale(sample).value, parentScale.value)),
    gameNoteType: sample.node.scoringSource!.gameNoteType,
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

function nodeObjectId(node: GarupaProductNode): string {
  return `render:garupa:node:${node.identity}`;
}
function lineObjectId(chainIdentity: string, segmentIndex: number): string {
  return `render:garupa:line:${chainIdentity}:${segmentIndex}`;
}
function slideFlashObjectId(chainIdentity: string): string {
  return `render:garupa:slide-flash:${chainIdentity}`;
}
function syncPairObjectId(identity: string): string {
  return `render:garupa:sync:${identity}`;
}
function f32(value: number): RenderFloat32 {
  const created = createRenderFloat32(Math.fround(value));
  if (created.status !== "ok") throw new Error(`${created.capability}: value=${String(value)} rounded=${String(Math.fround(value))}`);
  return created.value;
}
function vector3(x: number, y: number, z: number): RenderVector3 {
  return Object.freeze({ x: f32(x), y: f32(y), z: f32(z) });
}
function rejected<T>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}
