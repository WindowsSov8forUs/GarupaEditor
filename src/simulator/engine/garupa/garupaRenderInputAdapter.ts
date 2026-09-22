import { noteSpatialY, noteUnclippedSyncTarget, type OrdinaryNoteMotionResult } from "../rendering/ordinaryNoteGeometry";
import { projectedNodeLane } from "./productChartProfile";
import { NoteState, type NoteBase } from "../notes/noteBase";
import { NoteLong, NoteSlide, NoteMultipleDirectionalVisual } from "../notes/noteTypes";
import type { NoteInformation, NoteBatchInformation } from "../chart/types";
import { virtualLaneBaseIndex } from "../chart/virtualLane";
import type { ProjectedNoteGeometry } from "../managers/noteManager";
import { FrontNoteType, GameNoteType } from "../chart/types";
import { createPresentationConnections, type PresentationConnections, type PresentationConnectionOwner } from "./garupaSyncInputs";
import { connectionSource, directionalConnectionPresentation, type ConnectionEndpoint } from "../rendering/directionalConnectionRules";
import { createOrdinaryLongNormalChildState, type OrdinaryLongNormalChildState } from "../rendering/ordinaryLongChildLifecycle";
import { slideAxisInterval, slideRenderedCurve } from "./slideAxisMesh";
import { noteLongFlashBinding, noteSlideFlashBinding, noteSlideHeldBodyBinding, slideLineMaterialRole } from "../rendering/noteVisualBinding";
import type {
  RenderFloat32,
  RenderVector3,
} from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { advanceOrdinaryNoteMotion, type OrdinaryNoteMotionState, advanceOrdinaryNoteVerticalMotion, repositionOrdinaryNoteToJudgeLine, calculateNoteMotionCurve, calculateOrdinaryNoteWorldScaleAxis, getOrdinaryNoteArrivalSeconds, type OrdinarySyncLineTargetState } from "../rendering/ordinaryNoteGeometry";
import { resolveProjectedNoteAnimationBinding, resolveProjectedNoteBinding, RenderCommandProducer, type NotePresentation, type RenderOwnerTransaction, type RenderEngineResourceBindings, type OrdinaryFixedNoteSceneInput } from "../rendering/renderCommandProducer";
import { createExtensionSlideState, advanceExtensionSlide, advanceExtensionMotion, noteRenderInput, bpmAtNode, type ExtensionSlideState, type ExtensionRenderFrame } from "./slideRenderExtension";
import { applySlideRenderHides, type OrdinarySlideFrameResult } from "../rendering/ordinarySlideChildLifecycle";
import { integrityFailure, ok, type SimulatorResult } from "../result";
import type {
  GarupaProductChartProfile,
  GarupaProductNode,
  GarupaProductSlideChain,
} from "./productChartProfile";
import type { GarupaProductTimingGroupAxisProfile } from "./timingGroupAxis";

interface ProductNodeSample {
  readonly unclipped?: OrdinaryNoteMotionResult["unclipped"];
  readonly node: GarupaProductNode;
  readonly curve: number;
  readonly position: RenderVector3 | null;
  readonly uniformScale: RenderFloat32 | null;
  readonly visible: boolean;
  readonly moving: boolean;
  readonly syncTarget?: OrdinarySyncLineTargetState;
}

interface ProductSlideState extends ExtensionSlideState {
  readonly segments: OrdinarySlideFrameResult["segments"];
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
  private readonly sourceNodes = new WeakMap<NoteInformation, GarupaProductNode>();
  private readonly candidateNodes = new WeakMap<NoteInformation, GarupaProductNode>();
  private readonly connectionMembers = new Map<string, readonly GarupaProductNode[]>();
  private readonly authoredRoots = new Map<number, NoteInformation>();
  private readonly authoredConnectionNodes = new WeakMap<NoteInformation, GarupaProductNode[]>();
  private readonly connectionIconVisibility = new Map<string, boolean>();
  private readonly earlyConnectionItems = new Set<number>();
  private readonly activatedConnectionSources = new Set<NoteInformation>();
  private readonly pendingConnectionSources = new Set<NoteInformation>();
  private readonly initializedEarlyDirectional = new Set<string>();
  private frame = 0;
  private sharedOwner: (source: NoteInformation) => NoteBase | null = () => null;
  private sharedFrame: () => ExtensionRenderFrame = () => { throw new Error("Shared projection clock is not connected"); };

  connectSharedRuntime(owner: typeof this.sharedOwner, frame: typeof this.sharedFrame): ProjectedNoteGeometry {
    this.sharedOwner = owner;
    this.sharedFrame = frame;
    const nodeFor = (source: NoteInformation) => this.sourceNodes.get(source);
    const required = <T>(value: T | null | undefined): SimulatorResult<T> => value == null
      ? rejected("render.note.projected-motion-unavailable", "Shared note state requires its current source projection.") : ok(value);
    return {
      candidateY: source => {
        const node = this.candidateNodes.get(source);
        return node === undefined ? undefined : this.getInputPositionY(node) ?? undefined;
      },
      advance: (note, delta, placement, children, clock) => this.advanceShared(note, delta, placement, children, clock),
      hasConnectionOwner: source => nodeFor(source) !== undefined,
      connectionBatchActivated: sources => {
        for (const source of sources) {
          this.activatedConnectionSources.add(source);
          this.pendingConnectionSources.add(source);
        }
      },
      connectionState: (source, after) => this.connectionState(source, after),
      setConnectionPresentation: (source, after, iconVisible, updated) => {
        const node = nodeFor(source)!;
        const chain = node.chainIdentity === null ? undefined : this.chainByIdentity.get(node.chainIdentity);
        const id = after && chain !== undefined ? chain.connectionIdentities[typeof after === "number" ? after : chain.connectionIdentities.length - 1]! : node.identity;
        this.connectionIconVisibility.set(id, iconVisible);
        if (updated === undefined) return;
        if (chain === undefined) {
          this.singleStates.set(id, { ...this.singleStates.get(id)!, ...updated });
        } else {
          const state = this.slideStates.get(chain.identity)!;
          this.slideStates.set(chain.identity, after
            ? { ...state, children: state.children.map((child, index) => index + 1 === (typeof after === "number" ? after : state.children.length)
              ? { ...child, lifecycle: { ...child.lifecycle, ...updated } } : child) }
            : { ...state, root: { ...state.root, ...updated } });
        }
      },
      reflectSlideOutput: note => {
        const node = note.noteInformation === null ? undefined : nodeFor(note.noteInformation);
        const identity = node?.chainIdentity;
        const state = identity == null ? undefined : this.slideStates.get(identity);
        if (state === undefined || identity == null) return;
        this.slideStates.set(identity, { ...state,
          children: note.pendingRenderHides.size === 0 ? state.children
            : applySlideRenderHides(state.children, state.children, note.pendingRenderHides),
          rootVisible: state.rootVisible && !note.pendingRenderHides.has(-1),
          flashActive: note.flashAnimationRevision !== null && !state.playableFinished && note.state !== NoteState.Deactive,
        });
        note.commitRenderHides();
      },
      childPhase: (source, index) => {
        const node = nodeFor(source);
        return required(node?.chainIdentity == null ? null : this.slideStates.get(node.chainIdentity)?.children[index]?.lifecycle.phase);
      },
      progress: source => {
        const node = nodeFor(source);
        return required(node?.chainIdentity == null ? node == null ? null : this.singleStates.get(node.identity)?.motionState.progressRate.value
          : this.slideStates.get(node.chainIdentity)?.root.motionState.progressRate.value);
      },
      judgeY: source => { const node = nodeFor(source); return required(node == null ? null : this.getSlideJudgePosition(node)); },
      inside: (position, source, isSweetCollision = false) => {
        const node = nodeFor(source);
        const span = node == null || node.chainIdentity === null ? source.laneSpan : { start: node.spanStart, end: node.spanEnd, width: node.width };
        return span === undefined ? rejected("manual.note.projected-span-unavailable", "Continuous input requires authored span.")
          : this.scene.isInsideContinuousSpan(position, span.start, span.width ?? span.end - span.start + 1, isSweetCollision);
      },
    };
  }

  private advanceShared(note: NoteBase, delta: number, placement: "perspective" | "target-button" | "preserve" | null,
    children: boolean, controlledRealMoveSecond?: OrdinaryNoteMotionState["realMoveSecond"]): SimulatorResult<void> {
    const source = note.noteInformation;
    const authored = source === null ? undefined : this.sourceNodes.get(source);
    if (authored === undefined) return ok(undefined); // Directional side members share their authored projection.
    const frame = { ...this.sharedFrame(), deltaTimeSeconds: delta };
    const node = noteRenderInput(authored);
    const input = { deltaTime: f32(delta), launcherMusicPosition: frame.launcherMusicPosition, adjustedMusicPosition: frame.adjustedMusicPosition };
    if (node.chainIdentity === null) {
      if (children) return ok(undefined);
      let state = this.singleStates.get(node.identity);
      if (note instanceof NoteMultipleDirectionalVisual) {
        if (state === undefined) {
          const motion = this.scene.motionStateAtLane(projectedNodeLane(node), 1, node.absolutePosition);
          if (motion.status !== "ok") return motion;
          const created = createOrdinaryLongNormalChildState(motion.value, node.absolutePosition, f32(bpmAtNode(this.axis, node.absolutePosition)));
          if (created.status !== "ok") return created;
          state = created.value;
        }
        const motionState = { ...state.motionState, deltaTime: f32(delta),
          realMoveSecond: controlledRealMoveSecond ?? f32(state.motionState.realMoveSecond.value + delta) };
        // The ordinary ExecuteUpdate owns the clock; only the connected tail invokes Add.Move.
        if (controlledRealMoveSecond === undefined && placement === null) {
          this.singleStates.set(node.identity, { ...state, motionState });
          return ok(undefined);
        }
        if (placement === null && this.usesNodeAxis(node)) {
          const moved = this.advanceSingle(node, { ...state, motionState }, frame, input);
          if (moved.status !== "ok") return moved;
          this.singleStates.set(node.identity, moved.value);
          return ok(undefined);
        }
        const moved = placement === null ? advanceOrdinaryNoteMotion(motionState)
          : repositionOrdinaryNoteToJudgeLine(motionState, placement === "preserve" ? state.renderedTransform.localScale : placement);
        if (moved.status !== "ok") return moved;
        this.singleStates.set(node.identity, { ...state, phase: placement === null ? "move" : "stop",
          motionState: { ...motionState, progressRate: moved.value.progressRate, currentPositionZ: moved.value.position.z },
          renderedTransform: moved.value });
        return ok(undefined);
      }
      const advanced = this.advanceSingle(node, state, frame, input);
      if (advanced.status !== "ok") return advanced;
      this.singleStates.set(node.identity, advanced.value);
      return ok(undefined);
    }
    if (!(note instanceof NoteLong || note instanceof NoteSlide)) return ok(undefined);
    const chain = this.chainByIdentity.get(node.chainIdentity)!;
    const nodes = this.renderNodesByChain.get(chain.identity)!;
    const previous = this.slideStates.get(chain.identity);
    let state: ExtensionSlideState | undefined = previous;
    if (state === undefined) {
      const created = createExtensionSlideState(nodes, this.scene, this.axis);
      if (created.status !== "ok") return created;
      state = created.value;
    }
    if (!children) {
      const moved = placement === null ? advanceExtensionMotion(state.root, nodes[0]!, frame, input,
        this.axis, this.usesNodeAxis(nodes[0]!)) : ok(state.root);
      if (moved.status !== "ok") return moved;
      let root = placement === null && moved.value.phase === "stop" ? { ...moved.value, phase: "move" as const } : moved.value;
      const vertical = advanceOrdinaryNoteVerticalMotion({ ...root.motionState, deltaTime: f32(0) });
      if (vertical.status !== "ok") return vertical;
      const rootJudgeY = state.root.phase === "stop" ? state.rootJudgeY : Math.max(vertical.value.y, this.scene.virtualPerfectLine);
      if (placement !== null) {
        const placed = repositionOrdinaryNoteToJudgeLine(root.motionState, placement === "preserve" ? root.renderedTransform.localScale : placement);
        if (placed.status !== "ok") return placed;
        root = { ...root, phase: "stop", renderedTransform: placed.value };
      }
      const next = { ...state, root, rootJudgeY };
      if (previous === undefined) {
        // Activation follows child updates in NoteManager. Publish initial
        // geometry here without consuming another outer-frame delta.
        const initialized = advanceExtensionSlide(nodes, next, { ...frame, deltaTimeSeconds: 0 }, this.scene, this.ordinaryScene,
          this.axis, node => this.usesNodeAxis(node), note, false, true);
        if (initialized.status !== "ok") return initialized;
        this.slideStates.set(chain.identity, { ...initialized.value.state, segments: initialized.value.segments });
      } else {
        this.slideStates.set(chain.identity, { ...next, segments: previous.segments });
      }
      return ok(undefined);
    }
    const advanced = advanceExtensionSlide(nodes, state, frame, this.scene, this.ordinaryScene, this.axis,
      node => this.usesNodeAxis(node), note, false);
    if (advanced.status !== "ok") return advanced;
    this.slideStates.set(chain.identity, { ...advanced.value.state, segments: advanced.value.segments });
    if (note instanceof NoteSlide) note.commitRenderHides();
    return ok(undefined);
  }
  private advanceSingle(node: GarupaProductNode, state: OrdinaryLongNormalChildState | undefined,
    frame: ExtensionRenderFrame, input: { deltaTime: RenderFloat32; launcherMusicPosition: number; adjustedMusicPosition: number }
  ): SimulatorResult<OrdinaryLongNormalChildState> {
    if (state === undefined) {
      const motion = this.scene.motionStateAtLane(projectedNodeLane(node), node.width, node.absolutePosition);
      if (motion.status !== "ok") return motion;
      const created = createOrdinaryLongNormalChildState(motion.value, node.absolutePosition, f32(bpmAtNode(this.axis, node.absolutePosition)));
      if (created.status !== "ok") return created;
      state = created.value;
    }
    const advanced = advanceExtensionMotion(state, node, frame, input, this.axis, this.usesNodeAxis(node));
    return advanced.status !== "ok" ? advanced : ok(advanced.value.phase === "stop" ? { ...advanced.value, phase: "move" } : advanced.value);
  }

  private connections: PresentationConnections | undefined;
  private readonly judgedNodeIdentities = new Set<string>();
  private readonly chainByIdentity: ReadonlyMap<string, GarupaProductSlideChain>;
  private readonly renderNodesByChain = new Map<string, readonly GarupaProductNode[]>();
  private readonly slideStates = new Map<string, ProductSlideState>();
  private readonly singleStates = new Map<string, OrdinaryLongNormalChildState>();
  private readonly axisGroups: ReadonlySet<string>;
  private readonly axisChains: ReadonlySet<string>;
  private readonly firstLinearChainPosition = new Map<string, number>();
  private usesNodeAxis(node: GarupaProductNode): boolean {
    return this.axisGroups.has(node.timingGroup) || node.chainIdentity !== null &&
      this.chainByIdentity.get(node.chainIdentity)?.independentTiming === true;
  }

  constructor(
    private readonly producer: RenderCommandProducer,
    private readonly resources: RenderEngineResourceBindings,
    private readonly chart: GarupaProductChartProfile,
    private readonly batches: readonly NoteBatchInformation[],
    private readonly axis: GarupaProductTimingGroupAxisProfile,
    private readonly scene: GarupaProductSceneLayout,
    private readonly specificSpeed: RenderFloat32,
    private readonly noteColor: boolean,
    private readonly syncLine: boolean,
    private readonly syncLineEdgeMargin: RenderFloat32,
    private readonly ordinaryScene: OrdinaryFixedNoteSceneInput,
    private readonly originalPresentation: (source: NoteInformation, longAfter: boolean) => SimulatorResult<{
      readonly target: OrdinarySyncLineTargetState; readonly visible: boolean;
    } | null>,
  ) {
    this.chainByIdentity = new Map(chart.slideChains.map((chain) => [chain.identity, chain]));
    for (const chain of chart.slideChains) this.renderNodesByChain.set(chain.identity,
      Object.freeze(chain.connectionIdentities.map(id => noteRenderInput(chart.nodeByIdentity.get(id)!))));
    this.axisGroups = new Set(axis.groups.filter(group => group.changes.some(change => change.speed !== 1)).map(group => group.id));
    this.axisChains = new Set(chart.slideChains.filter(chain => chain.independentTiming || chain.connectionIdentities.some(id =>
      this.axisGroups.has(chart.nodeByIdentity.get(id)!.timingGroup))).map(chain => chain.identity));
    for (const chain of chart.slideChains) {
      if (chain.connectionIdentities.every(id => !this.axisGroups.has(chart.nodeByIdentity.get(id)!.timingGroup))) {
        this.firstLinearChainPosition.set(chain.identity, chain.connectionIdentities.reduce(
          (first, id) => Math.min(first, chart.nodeByIdentity.get(id)!.absolutePosition), Infinity));
      }
    }
    for (const node of chart.authoredNodes) {
      this.authoredRoots.set(node.chartItemIndex, node.runtimeRoot!);
      // The shared connection graph also contains ordinary Slide/Long owners.
      // Their endpoints are absent from the projected-motion chain registry.
      if (node.connectionIndex !== null) {
        let endpoints = this.authoredConnectionNodes.get(node.runtimeRoot!);
        if (endpoints === undefined) {
          endpoints = [];
          this.authoredConnectionNodes.set(node.runtimeRoot!, endpoints);
        }
        endpoints[node.connectionIndex] = node;
      }
      if (this.usesNodeAxis(node) || node.chainIdentity !== null && this.axisChains.has(node.chainIdentity)) this.earlyConnectionItems.add(node.chartItemIndex);
    }
    for (const node of chart.authoredNodes) {
      const source = node.scoringSource ?? chart.originalSources.get(node.identity);
      if (source !== undefined && source !== null && !this.sourceNodes.has(source)) {
        this.sourceNodes.set(source, node);
        this.candidateNodes.set(source, node);
      }
      if (node.chainIdentity === null) for (const member of node.runtimeMembers ?? []) this.candidateNodes.set(member, node);
      if (node.type !== "Directional" || node.width <= 1) continue;
      const parts: GarupaProductNode[] = node.chainIdentity === null ? [] : [noteRenderInput(node)];
      for (const member of node.runtimeMembers ?? []) {
        if (node.chainIdentity !== null && member === node.runtimeRoot) continue;
        const lane = member.laneSpan?.start ?? member.buttonType;
        const part: GarupaProductNode = { ...node, identity: node.chainIdentity === null && member === source
            ? node.identity : `${node.identity}:side:${member.directionalSlideConnection?.memberOffset ?? member.directionalMemberOffset ?? lane - node.spanStart}`,
          lane, width: 1, spanStart: lane, spanEnd: lane, chainIdentity: null, connectionIndex: null,
          scoringSource: member, scoringPhase: "head", runtimeRoot: member, runtimeMembers: undefined };
        this.sourceNodes.set(member, part);
        this.candidateNodes.set(member, part);
        parts.push(part);
      }
      this.connectionMembers.set(node.identity, parts);
    }
    // Only SV presentation before owner activation needs source-order lookahead.
  }

  private connectionState(source: NoteInformation, after: boolean | number): OrdinaryLongNormalChildState | undefined {
    const node = this.sourceNodes.get(source);
    if (node === undefined) return undefined;
    if (node.chainIdentity === null) return this.singleStates.get(node.identity);
    const state = this.slideStates.get(node.chainIdentity);
    return after ? state?.children[typeof after === "number" ? after - 1 : state.children.length - 1]?.lifecycle : state?.root;
  }

  private endpointNode(owner: PresentationConnectionOwner, after: ConnectionEndpoint): GarupaProductNode {
    const root = this.sourceNodes.get(owner.noteInformation)!;
    if (!after || root.chainIdentity === null) return root;
    const endpoints = this.authoredConnectionNodes.get(owner.noteInformation)!;
    return endpoints[typeof after === "number" ? after : endpoints.length - 1]!;
  }

  private earlyConnection(line: PresentationConnections["sync"][number] | PresentationConnections["directional"][number]): boolean {
    return this.earlyConnectionItems.has(this.sourceNodes.get(line.targetA.noteInformation)!.chartItemIndex) ||
      this.earlyConnectionItems.has(this.sourceNodes.get(line.targetB.noteInformation)!.chartItemIndex);
  }

  private connectionHandedOff(line: PresentationConnections["sync"][number] | PresentationConnections["directional"][number]): boolean {
    return [line.targetA, line.targetB].every(owner => {
      const node = this.sourceNodes.get(owner.noteInformation)!;
      return this.activatedConnectionSources.has(owner.noteInformation) &&
        this.activatedConnectionSources.has(this.authoredRoots.get(node.chartItemIndex)!);
    });
  }

  validate(): SimulatorResult<void> {
    if (!this.chart.hasExtensions) return ok(undefined);
    if (this.connections === undefined) {
      this.connections = createPresentationConnections(this.earlyConnectionItems.size === 0 ? [] : this.batches, this.syncLine);
    }
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
      deltaTimeSeconds < 0) {
      return rejected(
        "render.garupa-product.invalid-frame-input",
        "Product frame projection requires finite current position, one owner-produced judgement list and a finite nonnegative outer-frame delta.",
      );
    }
    if (!this.chart.hasExtensions) return ok(null);
    const arrival = getOrdinaryNoteArrivalSeconds(this.specificSpeed);
    if (arrival.status !== "ok") return arrival;
    const arrivalMilliseconds = arrival.value.value * 1000;
    const entryCurve = calculateNoteMotionCurve(0, true);
    const plannedJudged = new Set(this.judgedNodeIdentities);
    for (const node of judgedNodes) plannedJudged.add(node.identity);
    for (const id of frameInput.missed) plannedJudged.add(id);
    const renderChains = this.chart.slideChains.filter(chain =>
      this.slideStates.get(chain.identity)?.finished !== true &&
      (this.slideStates.has(chain.identity) || this.axisChains.has(chain.identity) &&
        (this.firstLinearChainPosition.get(chain.identity) ?? -Infinity) <= frameInput.launcherMusicPosition));
    const scheduledChains = new Set(renderChains.map(chain => chain.identity));
    const samples = new Map<string, ProductNodeSample>();
    for (const authored of this.chart.nodes) {
      const node = this.connectionMembers.get(authored.identity)?.find(member => member.identity === authored.identity) ?? noteRenderInput(authored);
      const retired = node.chainIdentity === null ? plannedJudged.has(node.identity)
        : this.slideStates.get(node.chainIdentity)?.finished === true ||
          this.activatedConnectionSources.has(node.runtimeRoot!) && this.sharedOwner(node.runtimeRoot!) === null;
      if (retired || !this.usesNodeAxis(node) || node.chainIdentity !== null && !scheduledChains.has(node.chainIdentity)) {
        // Shared geometry is reflected below. Retired notes need no new SV projection.
        samples.set(node.identity, { node, curve: 0, position: null, uniformScale: null, moving: false, visible: false });
        continue;
      }
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
      // Slide transforms come from the shared lifecycle below. Only its signed
      // curve is needed here; projecting again would immediately be overwritten.
      if (node.chainIdentity === null && Number.isFinite(curve)) {
        const projected = this.scene.projectLaneAtCurve(
          projectedNodeLane(node),
          curve,
        );
        const scale = this.scene.projectNoteScaleAtCurve(curve, node.width);
        if (projected.status !== "ok") {
          if (curve >= this.scene.visibleCurveRange[0] && curve <= this.scene.visibleCurveRange[1]) return projected;
        } else {
          position = projected.value;
          if (scale.status !== "ok") {
            if (curve >= this.scene.visibleCurveRange[0] && curve <= this.scene.visibleCurveRange[1]) return scale;
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
          curve >= entryCurve && !plannedJudged.has(node.identity),
      }));
    }

    const frame: ExtensionRenderFrame = { ...frameInput, absolutePosition: currentAbsolutePosition,
      deltaTimeSeconds, judged: new Set(judgedNodes.map(node => node.identity)) };
    const motionInput = { deltaTime: f32(deltaTimeSeconds), launcherMusicPosition: frame.launcherMusicPosition,
      adjustedMusicPosition: frame.adjustedMusicPosition };
    const plannedSingles = new Map(this.singleStates);
    for (const authored of this.chart.nodes) {
      const node = this.connectionMembers.get(authored.identity)?.find(member => member.identity === authored.identity) ?? noteRenderInput(authored);
      if (node.chainIdentity !== null || plannedJudged.has(node.identity)) continue;
      let state = plannedSingles.get(node.identity);
      const hasOwner = this.sharedOwner(node.runtimeRoot!) !== null;
      if (!hasOwner && !this.usesNodeAxis(node)) continue;
      if (!hasOwner) {
        const advanced = this.advanceSingle(node, state, frame, motionInput);
        if (advanced.status !== "ok") return advanced;
        state = advanced.value;
        plannedSingles.set(node.identity, state);
      }
      if (state === undefined) continue;
      const previous = samples.get(node.identity)!;
      samples.set(node.identity, { ...previous, curve: this.usesNodeAxis(node) ? previous.curve
          : calculateNoteMotionCurve(state.motionState.progressRate.value, true), position: state.renderedTransform.position, unclipped: state.renderedTransform.unclipped,
        uniformScale: state.renderedTransform.localScale.x, moving: state.phase === "move",
        visible: state.phase !== "wait" && (!this.usesNodeAxis(node) || previous.curve >= entryCurve) });
    }
    const plannedSlides = new Map(this.slideStates);
    // Non-SV chains start only when NoteManager activates their actual owner.
    // Signed displacement alone may require presentation before that activation.

    for (const chain of renderChains) {
      const nodes = this.renderNodesByChain.get(chain.identity)!;
      const root = nodes[0]!.runtimeRoot;
      const owner = root === undefined ? null : this.sharedOwner(root);
      let cached = this.slideStates.get(chain.identity);
      // SV permits presentation before activation, never after the shared owner retires.
      // Reuse its last geometry for cleanup instead of advancing an already judged tail.
      const retiredOwner = root !== undefined && this.activatedConnectionSources.has(root) && owner === null;
      const terminal = nodes[nodes.length - 1]!;
      const complete = cached?.finished === true || retiredOwner || owner?.state === NoteState.Deactive ||
        (!root?.hiddenSlideEndpoints && root !== undefined && plannedJudged.has(terminal.identity));
      if (complete && cached === undefined) {
        const created = createExtensionSlideState(nodes, this.scene, this.axis);
        if (created.status !== "ok") return created;
        cached = { ...created.value, segments: [] };
      }
      const advanced = cached !== undefined && (owner !== null || complete)
        ? ok({ state: cached, segments: cached.segments })
        : advanceExtensionSlide(nodes, cached, frame, this.scene, this.ordinaryScene, this.axis,
          node => this.usesNodeAxis(node), null);
      if (advanced.status !== "ok") return advanced;
      const state: ProductSlideState = { ...advanced.value.state, segments: advanced.value.segments,
        ...(complete ? { finished: true, playableFinished: true, flashActive: false, rootVisible: false } : {}) };
      plannedSlides.set(chain.identity, state);
      for (const [index, node] of nodes.entries()) {
        const previous = samples.get(node.identity)!;
        const lifecycle = index === 0 ? state.root : state.children[index - 1]!.lifecycle;
        const transform = lifecycle.renderedTransform;
        const visible = index === 0 ? state.rootVisible : state.children[index - 1]!.visible &&
          !(node.scoringSource?.slideGesture && owner instanceof NoteSlide && owner.afterNotes[index - 1]?.judged);
        const stopped = lifecycle.phase === "stop";
        samples.set(node.identity, { ...previous, position: transform.position, unclipped: transform.unclipped,
          uniformScale: transform.localScale.x,
          curve: this.axisChains.has(chain.identity) ? slideRenderedCurve(lifecycle, node, previous.curve, this.scene)
            : stopped ? 1 : lifecycle.phase === "wait" ? 0 : calculateNoteMotionCurve(lifecycle.motionState.progressRate.value, true), moving: lifecycle.phase === "move",
          visible: !state.finished && visible && lifecycle.phase !== "wait" &&
            (stopped || !this.usesNodeAxis(node) || previous.curve >= entryCurve) });
      }
    }

    const plans: NotePresentation[] = [];
    const retired = new Set<string>();
    for (const node of this.chart.nodes) {
      if (plannedJudged.has(node.identity) && node.scoringSource?.slideGesture && this.connectionMembers.has(node.identity))
        retired.add(node.identity);
      const state = node.chainIdentity === null ? undefined : plannedSlides.get(node.chainIdentity);
      if (state === undefined ? plannedJudged.has(node.identity) : state.finished ||
        (node.connectionIndex === 0 ? !state.rootVisible : !state.children[node.connectionIndex! - 1]!.visible)) retired.add(node.identity);
    }
    const visualNodes: GarupaProductNode[] = [];
    const visualOwners = new Map<string, GarupaProductNode>();
    const initializedEarly = new Set(this.initializedEarlyDirectional);
    const iconOwners = new Set<string>();
    for (const authored of this.chart.visibleNodes) {
      const node = this.connectionMembers.get(authored.identity)?.find(member => member.identity === authored.identity)
        ?? noteRenderInput(authored);
      visualNodes.push(node);
      visualOwners.set(node.identity, authored);
      if (node.connectionIndex === 0 && node.scoringSource?.slideGesture && plannedSlides.get(node.chainIdentity!)?.headCompleted &&
          !this.connectionMembers.has(node.identity)) continue;
      if (node.type !== "Directional" || authored.width === 1) { iconOwners.add(node.identity); continue; }
      const baseSample = samples.get(node.identity)!;
      const sharedMembers = this.connectionMembers.get(authored.identity)!;
      for (const part of sharedMembers) {
        if (!plannedJudged.has(authored.identity) && this.connectionIconVisibility.get(part.identity) !== false) iconOwners.add(part.identity);
        if (part.identity === node.identity) continue;
        const owner = this.sharedOwner(part.runtimeRoot!);
        let state = plannedSingles.get(part.identity);
        const handedOff = this.activatedConnectionSources.has(part.runtimeRoot!) &&
          this.activatedConnectionSources.has(authored.runtimeRoot!);
        if (!handedOff && this.earlyConnectionItems.has(authored.chartItemIndex) && !plannedJudged.has(authored.identity)) {
          // An Add can activate before its Slide root in an authored reverse-time
          // chain. Keep early presentation until their actual connection can own it.
          const delta = owner === null ? frame.deltaTimeSeconds : 0;
          const advanced = this.advanceSingle(part, state, { ...frame, deltaTimeSeconds: delta }, { ...motionInput, deltaTime: f32(delta) });
          if (advanced.status !== "ok") return advanced;
          state = advanced.value;
          plannedSingles.set(part.identity, state);
        }
        const visible = state !== undefined && !plannedJudged.has(authored.identity) &&
          (!handedOff ? baseSample.visible
            : owner !== null && owner.state !== NoteState.Deactive && owner.state !== NoteState.Wait && state.phase !== "wait");
        samples.set(part.identity, { ...baseSample, node: part,
          position: state?.renderedTransform.position ?? null, unclipped: state?.renderedTransform.unclipped,
          uniformScale: state?.renderedTransform.localScale.x ?? null,
          visible, moving: visible && (!handedOff ? baseSample.moving : owner?.state === NoteState.Move && state?.phase === "move") });
        visualNodes.push(part); visualOwners.set(part.identity, authored);
      }
    }
    const presentedSources = new Set(this.pendingConnectionSources);
    for (const sample of samples.values()) if (sample.visible) presentedSources.add(sample.node.runtimeRoot!);
    const connected = this.connections!.advance(currentAbsolutePosition, presentedSources);
    if (connected.status !== "ok") return connected;
    const stateFor = (node: GarupaProductNode) => node.chainIdentity === null ? plannedSingles.get(node.identity)
      : node.connectionIndex === 0 ? plannedSlides.get(node.chainIdentity)?.root
      : plannedSlides.get(node.chainIdentity)?.children[node.connectionIndex! - 1]?.lifecycle;
    for (const line of this.connections!.directional) {
      if (!this.earlyConnection(line)) continue;
      if (this.connectionHandedOff(line)) { retired.add(line.identity); continue; }
      const first = this.endpointNode(line.targetA, line.afterA), second = this.endpointNode(line.targetB, line.afterB);
      if (retired.has(first.identity) || retired.has(second.identity)) { retired.add(line.identity); continue; }
      const a = stateFor(first), b = stateFor(second);
      if (a === undefined || b === undefined) continue;
      const presentation = directionalConnectionPresentation(line, this.connections!.neighbors(line), a.renderedTransform, b.renderedTransform);
      if (presentation.status !== "ok") return presentation;
      for (const [node, visible] of [[first, presentation.value.iconA], [second, presentation.value.iconB]] as const)
        if (visible && !plannedJudged.has(node.identity)) iconOwners.add(node.identity); else iconOwners.delete(node.identity);
      const sampleA = samples.get(first.identity)!, sampleB = samples.get(second.identity)!;
      if (!sampleA.visible || !sampleB.visible) { initializedEarly.delete(line.identity); continue; }
      if (initializedEarly.has(line.identity)) continue;
      initializedEarly.add(line.identity);
      const motion = presentation.value.motion;
      // The early setup changes presentation only. Preserve XY/phase used by
      // the input projection; subsequent motion consumes the shared depth offset.
      const updated = { ...a, motionState: { ...a.motionState, currentPositionZ: motion.position.z },
        renderedTransform: { ...a.renderedTransform, position: { ...a.renderedTransform.position, z: motion.position.z } } };
      if (first.chainIdentity === null) plannedSingles.set(first.identity, updated);
      else {
        const state = plannedSlides.get(first.chainIdentity)!;
        plannedSlides.set(first.chainIdentity, first.connectionIndex === 0 ? { ...state, root: updated }
          : { ...state, children: state.children.map((child, index) => index + 1 === first.connectionIndex
            ? { ...child, lifecycle: updated } : child) });
      }
      samples.set(first.identity, { ...sampleA, position: motion.position, unclipped: motion.unclipped, uniformScale: motion.localScale.x });
    }
    if (this.syncLine) for (const line of this.connections!.sync) {
      if (!this.earlyConnection(line)) continue;
      if (this.connectionHandedOff(line)) { retired.add(line.identity); continue; }
      for (const [owner, after] of [[line.targetA, line.afterA], [line.targetB, line.afterB]] as const) {
        const node = this.endpointNode(owner, after);
        if (samples.has(node.identity)) continue;
        const actual = this.originalPresentation(connectionSource(owner, after), after === true && owner.noteInformation.fireNoteType === FrontNoteType.Long);
        if (actual.status !== "ok") return actual;
        samples.set(node.identity, { node, curve: 0, position: actual.value?.target.position ?? null,
          uniformScale: actual.value?.target.localScaleX ?? null, visible: actual.value?.visible ?? false,
          moving: actual.value?.visible ?? false, syncTarget: actual.value?.target });
      }
      const first = this.endpointNode(line.targetA, line.afterA), second = this.endpointNode(line.targetB, line.afterB);
      const a = samples.get(first.identity)!, b = samples.get(second.identity)!;
      if (retired.has(first.identity) || retired.has(second.identity)) retired.add(line.identity);
      const visible = a.visible && b.visible && a.moving && b.moving;
      const target = (sample: ProductNodeSample, owner: PresentationConnectionOwner, after: ConnectionEndpoint) => ({
        ...syncTarget(sample, this.ordinaryScene.noteParentScale), gameNoteType: after
          ? owner.noteInformation.slideNoteList[typeof after === "number" ? after - 1 : owner.noteInformation.slideNoteList.length - 1]?.gameNoteType ?? GameNoteType.None
          : owner.noteInformation.gameNoteType });
      plans.push({ id: syncPairObjectId(line.identity), lifetime: line.identity, kind: "sync-line", visible,
        state: visible ? { targetA: target(a, line.targetA, line.afterA), targetB: target(b, line.targetB, line.afterB), edgeMargin: this.syncLineEdgeMargin } : null });
    }
    for (const node of visualNodes) {
      const sample = samples.get(node.identity)!;
      const objectId = nodeObjectId(node);
      const animation = resolveProjectedNoteAnimationBinding(node.runtimeRoot!, node.scoringSource!, node.scoringPhase!, objectId,
        this.resources, node.width, this.resources.habahiroAtlasLogicalAssetIds !== undefined);
      const binding = frontBinding(node, this.resources, this.noteColor, this.chainByIdentity,
        node.connectionIndex === 0 && plannedSlides.get(node.chainIdentity!)?.root.phase === "stop" &&
          (!node.scoringSource?.slideGesture || plannedSlides.get(node.chainIdentity!)?.headCompleted === true),
        visualOwners.get(node.identity)!);
      if (binding.status !== "ok") return binding;
      plans.push({ id: objectId, lifetime: visualOwners.get(node.identity)!.identity, kind: "body", visible: sample.visible,
        position: sample.position, unclipped: sample.unclipped, localScale: sample.uniformScale === null ? null : vector3(sample.uniformScale.value, sample.uniformScale.value, 0),
        binding: binding.value,
        animations: animation === null ? [] : [{ ...animation, lifetime: visualOwners.get(node.identity)!.identity, visible: iconOwners.has(node.identity) }] });
    }
    // Flash is a child of the actual Slide root, including an invisible authored head.
    for (const chain of renderChains) {
      const state = plannedSlides.get(chain.identity)!;
      if (state.finished) retired.add(chain.identity);
      if (chain.allHidden) continue;
      const rootNode = this.chart.nodeByIdentity.get(chain.connectionIdentities[0]!)!;
      const id = nodeObjectId(rootNode);
      const index = plans.findIndex(plan => plan.id === id);
      const body = index < 0 ? undefined : plans[index];
      const existing = body?.kind === "body" ? body : undefined;
      const plan: NotePresentation = { id, lifetime: rootNode.identity, kind: "body",
        visible: (existing?.visible ?? false) || state.flashActive,
        contentVisible: existing?.visible ?? false,
        position: state.root.renderedTransform.position, unclipped: state.root.renderedTransform.unclipped, localScale: state.root.renderedTransform.localScale,
        binding: existing?.binding ?? null,
        animations: [...existing?.animations ?? [], { ownerObjectId: slideFlashObjectId(chain.identity),
          ...resolveProductSlideFlashBinding(rootNode, this.resources), animationRole: "note-long-flash",
          lifetime: chain.identity, revision: state.flashActive ? ((this.sharedOwner(rootNode.runtimeRoot!) as NoteLong | NoteSlide | null)?.flashAnimationRevision ?? null) : null }] };
      if (index < 0) plans.push(plan); else plans[index] = plan;
    }
    for (const line of this.connections!.directional) {
      if (!this.earlyConnection(line) || this.connectionHandedOff(line)) continue;
      const first = this.endpointNode(line.targetA, line.afterA), second = this.endpointNode(line.targetB, line.afterB);
      const a = samples.get(first.identity), b = samples.get(second.identity);
      const visible = a !== undefined && b !== undefined && a.visible && b.visible && a.moving && b.moving;
      const target = (sample: ProductNodeSample) => ({ position: requireProjectedPosition(sample), unclipped: sample.unclipped,
        localScale: vector3(requireUniformScale(sample).value, requireUniformScale(sample).value, 0), progressRate: f32(0) });
      if (retired.has(first.identity) || retired.has(second.identity)) retired.add(line.identity);
      plans.push({ id: `render:garupa:${line.identity}`, lifetime: line.identity, kind: "multiple-directional-line",
        direction: line.materialDirection, visible, state: visible ? { targetA: target(a), targetB: target(b) } : null });
    }
    for (const chain of renderChains) {
      const materialRole = slideLineMaterialRole(chain.connectionIdentities
        .some(id => !this.chart.nodeByIdentity.get(id)!.visible));
      for (let index = 1; index < chain.connectionIdentities.length; index += 1) {
        const from = samples.get(chain.connectionIdentities[index - 1]!)!;
        const to = samples.get(chain.connectionIdentities[index]!)!;
        const objectId = lineObjectId(chain.identity, index - 1);
        const slideState = plannedSlides.get(chain.identity)!;
        const frontPhase = index === 1 ? slideState.root.phase : slideState.children[index - 2]!.lifecycle.phase;
        const lineVisible = !slideState.finished && slideState.children[index - 1]!.meshVisible &&
          (frontPhase !== "wait" || slideState.children[index - 1]!.lifecycle.phase !== "wait") &&
          (!this.axisChains.has(chain.identity) || slideAxisInterval(from.curve, to.curve, this.scene.visibleCurveRange) !== null);
        const geometry = lineVisible ? slideState.segments[index - 1]!.geometry : null;
        plans.push({ id: objectId, lifetime: chain.identity, kind: "curve-note", visible: lineVisible,
          materialRole,
          geometry: geometry === null || !chain.allHidden ? geometry : { ...geometry,
            colors: geometry.colors.map(color => ({ ...color, alpha: f32(color.alpha.value * 0.5) })) } });
      }
    }
    return this.producer.preflightNotePresentation(plans, retired, this.ordinaryScene, () => {
      this.judgedNodeIdentities.clear();
      for (const id of plannedJudged) this.judgedNodeIdentities.add(id);
      this.singleStates.clear();
      for (const [id, state] of plannedSingles) this.singleStates.set(id, state);
      this.slideStates.clear();
      for (const [id, state] of plannedSlides) this.slideStates.set(id, state);
      this.pendingConnectionSources.clear();
      this.initializedEarlyDirectional.clear();
      for (const id of initializedEarly) this.initializedEarlyDirectional.add(id);
      this.frame += 1;
    });
  }

  snapshot(): GarupaProductRenderSnapshot {
    return Object.freeze({ ...this.producer.notePresentationSnapshot(), frame: this.frame,
      activeTapLaneEffectCount: 0, syncPairCount: this.connections?.sync.filter(line => this.earlyConnection(line) && !this.connectionHandedOff(line)).length ?? 0 });
  }

  releaseInputs(): void {
    this.connections = undefined;
    this.activatedConnectionSources.clear();
    this.pendingConnectionSources.clear();
    this.initializedEarlyDirectional.clear();
    this.judgedNodeIdentities.clear();
    this.singleStates.clear();
    this.slideStates.clear();
    this.connectionIconVisibility.clear();
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

  getInputPositionY(node: GarupaProductNode): ReturnType<typeof noteSpatialY> | null {
    if (node.chainIdentity === null) {
      const state = this.singleStates.get(node.identity);
      return state === undefined || state.phase === "wait" ? null : noteSpatialY(state.renderedTransform);
    }
    const state = this.slideStates.get(node.chainIdentity);
    if (state === undefined || state.root.phase === "wait" || state.playableFinished) return null;
    const motion = node.connectionIndex === 0 ? state.root.renderedTransform
      : state.children[node.connectionIndex! - 1]?.lifecycle.renderedTransform;
    return motion === undefined ? null : noteSpatialY(motion);
  }
}

function frontBinding(
  node: GarupaProductNode,
  resources: RenderEngineResourceBindings,
  noteColor: boolean,
  chains: ReadonlyMap<string, GarupaProductSlideChain>,
  heldSlideHead: boolean,
  authored: GarupaProductNode,
) {
  const chain = node.chainIdentity === null ? undefined : chains.get(node.chainIdentity);
  const chainHead = chain !== undefined && node.connectionIndex === 0;
  const habahiro = resources.habahiroAtlasLogicalAssetIds !== undefined;
  if (chainHead && heldSlideHead && node.runtimeRoot?.fireNoteType !== FrontNoteType.Long) return ok(noteSlideHeldBodyBinding(resources, node.width,
    projectedNodeLane(node), habahiro));
  const geometry = resourceGeometry(node, authored, habahiro);
  if (node.runtimeRoot?.directionalSlideConnection !== undefined) return resolveProjectedNoteBinding(
    authored.runtimeRoot!, authored.scoringSource!, authored.scoringPhase!, resources, noteColor, geometry, habahiro);
  return resolveProjectedNoteBinding(node.runtimeRoot!, node.scoringSource!, node.scoringPhase!, resources, noteColor,
    geometry, habahiro);
}

function resourceGeometry(node: GarupaProductNode, authored: GarupaProductNode, habahiro: boolean) {
  if (authored.type === "Directional" && authored.width > 7) {
    const lane = virtualLaneBaseIndex(node.lane);
    return { lane, suffix: String(lane), width: node.width };
  }
  const start = virtualLaneBaseIndex(authored.spanStart, 7 - authored.width);
  // Directional members were emitted at integer offsets within this authored
  // span. They share its base; do not choose/clamp a new base for each member.
  const lane = start + (node.type === "Directional"
    ? Math.round(node.lane - authored.spanStart) : Math.floor((authored.width - 1) / 2));
  const suffix = habahiro && node.type !== "Directional"
    ? Array.from({ length: authored.width }, (_, index) => start + index).join("_") : String(lane);
  return { lane, suffix, width: node.width };
}

export function resolveProductSlideFlashBinding(
  front: GarupaProductNode,
  resources: RenderEngineResourceBindings,
): Readonly<{ readonly logicalAssetId: string; readonly exactKey: string }> {
  const habahiro = resources.habahiroAtlasLogicalAssetIds !== undefined && front.width <= 7;
  if (front.runtimeRoot?.fireNoteType === FrontNoteType.Long) return noteLongFlashBinding(resources,
    resourceGeometry(front, front, habahiro).suffix, habahiro);
  return noteSlideFlashBinding(resources, front.width, projectedNodeLane(front), habahiro);
}

function syncTarget(sample: ProductNodeSample, parentScale: RenderFloat32): OrdinarySyncLineTargetState {
  return sample.syncTarget ?? {
    position: requireProjectedPosition(sample),
    unclipped: noteUnclippedSyncTarget(sample, parentScale),
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
  return integrityFailure(capability, boundary);
}
