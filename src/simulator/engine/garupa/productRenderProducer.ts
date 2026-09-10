import { createOrdinaryLongNormalChildState, type OrdinaryLongNormalChildState } from "../rendering/ordinaryLongChildLifecycle";
import { slideAxisInterval } from "./slideAxisMesh";
import { noteBodyBinding, noteFlickIconBinding, noteLongFlashBinding, advanceNoteAnimationClock } from "../rendering/noteVisualBinding";
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
import { buildOrdinarySyncLine, buildOrdinaryMultipleDirectionalLine, calculateNoteMotionCurve, calculateOrdinaryNoteWorldScaleAxis, getOrdinaryNoteArrivalSeconds, type OrdinarySyncLineTargetState } from "../rendering/ordinaryNoteGeometry";
import { appendOrdinaryAnimationStart, RenderOwnerTransaction, type RenderEngineResourceBindings, type OrdinaryFixedNoteSceneInput } from "../rendering/renderCommandProducer";
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

export class GarupaProductRenderProducer {
  private frame = 0;
  private readonly created = new Map<string, number>();
  private readonly visible = new Set<string>();
  private readonly judgedNodeIdentities = new Set<string>();
  private readonly animationElapsedSeconds = new Map<string, number>();
  private readonly chainByIdentity: ReadonlyMap<string, GarupaProductSlideChain>;
  private readonly slideStates = new Map<string, ExtensionSlideState>();
  private readonly singleStates = new Map<string, OrdinaryLongNormalChildState>();
  private readonly axisGroups: ReadonlySet<string>;

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
    private readonly syncLineEdgeMargin: RenderFloat32,
    private readonly ordinaryScene: OrdinaryFixedNoteSceneInput,
    private readonly originalPresentation: (identity: string) => SimulatorResult<{
      readonly target: OrdinarySyncLineTargetState; readonly visible: boolean;
    } | null>,
  ) {
    this.chainByIdentity = new Map(chart.slideChains.map((chain) => [chain.identity, chain]));
    this.axisGroups = new Set(axis.groups.filter(group => group.changes.some(change => change.speed !== 1)).map(group => group.id));
  }

  validate(): SimulatorResult<void> {
    if (!this.chart.hasExtensions) return ok(undefined);
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
        uniformScale: state.renderedTransform.localScale.x,
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
          curve: stopped ? 1 : previous.curve,
          visible: !state.finished && visible && lifecycle.phase !== "wait" &&
            (stopped || !this.axisGroups.has(chain.timingGroup) || previous.curve >= 0.002 && previous.curve <= 1) });
      }
    }

    const plannedCreated = new Map(this.created);
    const plannedVisible = new Set(this.visible);
    const plannedAnimationElapsed = new Map(this.animationElapsedSeconds);
    const commands: RenderCommand[] = [];
    const command = commandFactory(this.sessionId, this.renderer, this.frame);
    const base = (offset: number) => ({ sessionId: this.sessionId,
      sequence: this.renderer.snapshot().nextSequence + offset, frame: this.frame, substep: 0 });
    const ordering = (domain: number, source: number, identity: string, sourceZ = 0): RenderOrderingKey => ({
      domainLayer: domain, sourceDepthOrSortingOrder: source, sourceZ: f32(sourceZ),
      creationSequence: plannedCreated.get(identity)!,
    });

    if (this.syncLine) {
      for (const pair of this.chart.syncPairs) {
        for (const identity of [pair.firstNodeIdentity, pair.secondNodeIdentity]) {
          if (samples.has(identity)) continue;
          const actual = this.originalPresentation(identity);
          if (actual.status !== "ok") return actual;
          const node = this.chart.nodeByIdentity.get(identity)!;
          samples.set(identity, {
            node, curve: 0,
            position: actual.value?.target.position ?? null,
            uniformScale: actual.value?.target.localScaleX ?? null,
            visible: actual.value?.visible ?? false,
            syncTarget: actual.value?.target,
          });
        }
      }
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
          plannedCreated.set(objectId, this.renderer.snapshot().nextSequence + commands.length);
        }
        commands.push(command(commands.length, {
          kind: "set-transform",
          renderObjectId: objectId,
          position: vector3(0, 0, 0),
          scale: vector2(1, 1),
          rotationDegrees: f32(0),
          color: white(),
          ordering: ordering(3, 69, objectId),
          maskObjectId: null,
        }));
        const line = buildOrdinarySyncLine({
          targetA: syncTarget(first, this.ordinaryScene.noteParentScale), targetB: syncTarget(second, this.ordinaryScene.noteParentScale), edgeMargin: this.syncLineEdgeMargin,
        });
        if (line.status !== "ok") return line;
        commands.push(command(commands.length, { kind: "set-line", renderObjectId: objectId,
          ...line.value, materialRole: "sync-line" }));
        if (!plannedVisible.has(objectId)) {
          commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
          plannedVisible.add(objectId);
        }
      }
    }

    // Stable Flash ownership follows the same committed Slide root as its body.
    for (const chain of this.chart.slideChains) {
      const headIdentity = chain.visibleConnectionIdentities[0];
      const terminalIdentity = chain.visibleConnectionIdentities[chain.visibleConnectionIdentities.length - 1];
      if (headIdentity === undefined || terminalIdentity === undefined) continue;
      const slideRootObjectId = slideOwnerObjectId(chain.identity);
      const flashObjectId = slideFlashObjectId(chain.identity);
      const slideState = plannedSlides.get(chain.identity)!;
      const active = slideState.flashActive;
      if (active) {
        if (!plannedCreated.has(slideRootObjectId)) {
          commands.push(command(commands.length, {
            kind: "create-object",
            renderObjectId: slideRootObjectId,
            poolFamily: "garupa-product-note-slide-root",
            role: "note-root",
            parentObjectId: null,
          }));
          plannedCreated.set(slideRootObjectId, this.renderer.snapshot().nextSequence + commands.length);
        }
        if (!plannedCreated.has(flashObjectId)) {
          const front = samples.get(headIdentity)!;
          commands.push(command(commands.length, {
            kind: "create-object",
            renderObjectId: flashObjectId,
            poolFamily: "garupa-product-note-long-flash",
            role: "note-intermediate",
            parentObjectId: slideRootObjectId,
          }));
          const flashBinding = resolveProductSlideFlashBinding(front.node, this.resources);
          plannedCreated.set(flashObjectId, this.renderer.snapshot().nextSequence + commands.length);
          appendOrdinaryAnimationStart(commands, base, { ...flashBinding,
            ownerObjectId: flashObjectId, animationRole: "note-long-flash" },
            this.ordinaryScene.noteDomainLayer, plannedCreated.get(flashObjectId)!);
        }
        const target = slideState.root.renderedTransform.position;
        const targetScale = slideState.root.renderedTransform.localScale;
        const parentScale = this.ordinaryScene.noteParentScale.value;
        commands.push(command(commands.length, {
          kind: "set-transform",
          renderObjectId: slideRootObjectId,
          position: target,
          scale: vector3(calculateOrdinaryNoteWorldScaleAxis(targetScale.x.value, parentScale),
            calculateOrdinaryNoteWorldScaleAxis(targetScale.y.value, parentScale),
            calculateOrdinaryNoteWorldScaleAxis(targetScale.z.value, parentScale)),
          rotationDegrees: f32(0),
          color: white(),
          ordering: ordering(3, 70, slideRootObjectId, target.z.value),
          maskObjectId: null,
        }));
        if (!plannedVisible.has(slideRootObjectId)) {
          commands.push(command(commands.length, { kind: "activate-object", renderObjectId: slideRootObjectId }));
          plannedVisible.add(slideRootObjectId);
        }
        if (!plannedVisible.has(flashObjectId)) {
          commands.push(command(commands.length, { kind: "activate-object", renderObjectId: flashObjectId }));
          plannedVisible.add(flashObjectId);
        }
        if (!plannedAnimationElapsed.has(flashObjectId)) {
          commands.push(command(commands.length, {
            kind: "play-animation",
            renderObjectId: flashObjectId,
            animationRole: "note-long-flash",
            restart: true,
          }));
          plannedAnimationElapsed.set(flashObjectId, 0);
        }
      }
      if (!active && plannedAnimationElapsed.delete(flashObjectId)) {
        commands.push(command(commands.length, {
          kind: "stop-animation",
          renderObjectId: flashObjectId,
          animationRole: "note-long-flash",
          restart: false,
        }));
        commands.push(command(commands.length, { kind: "hide-object", renderObjectId: flashObjectId }));
        commands.push(command(commands.length, { kind: "hide-object", renderObjectId: slideRootObjectId }));
        plannedVisible.delete(flashObjectId);
        plannedVisible.delete(slideRootObjectId);
      } else if (plannedAnimationElapsed.has(flashObjectId)) {
        const elapsed = advanceNoteAnimationClock(plannedAnimationElapsed.get(flashObjectId)!, deltaTimeSeconds);
        commands.push(command(commands.length, {
          kind: "sample-animation",
          renderObjectId: flashObjectId,
          animationRole: "note-long-flash",
          elapsedSeconds: f32(elapsed),
        }));
        plannedAnimationElapsed.set(flashObjectId, elapsed);
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
      const front = frontBinding(
        node,
        this.resources,
        this.noteColor,
        this.chainByIdentity,
      );
      const animation = iconOwners.has(node.identity) ? productAnimationBinding(node, objectId, this.resources) : null;
      if (sample.visible) {
        if (!plannedCreated.has(objectId)) {
          commands.push(command(commands.length, {
            kind: "create-object",
            renderObjectId: objectId,
            poolFamily: "garupa-product-front",
            role: "note-root",
            parentObjectId: null,
          }));
          if (front !== null) commands.push(command(commands.length, {
            kind: "bind-resource",
            renderObjectId: objectId,
            binding: "sprite",
            logicalAssetId: front.logicalAssetId,
            exactKey: front.exactKey,
          }));
          plannedCreated.set(objectId, this.renderer.snapshot().nextSequence + commands.length);
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
            plannedCreated.set(animation.ownerObjectId, this.renderer.snapshot().nextSequence + commands.length);
            appendOrdinaryAnimationStart(commands, base, animation, this.ordinaryScene.noteDomainLayer,
              plannedCreated.get(animation.ownerObjectId)!);
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
          this.ordinaryScene.noteParentScale,
          ordering,
        )));
      } else if (plannedVisible.delete(objectId)) {
        commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId }));
      }
      const owner = visualOwners.get(node.identity)!;
      const chain = owner.chainIdentity === null ? undefined : plannedSlides.get(owner.chainIdentity);
      const retired = chain === undefined ? plannedJudged.has(owner.identity)
        : chain.finished || (owner.connectionIndex === 0 ? !chain.rootVisible : !chain.children[owner.connectionIndex! - 1]!.visible);
      if (animation !== null && plannedAnimationElapsed.has(animation.ownerObjectId)) {
        if (retired) {
          plannedAnimationElapsed.delete(animation.ownerObjectId);
          commands.push(command(commands.length, { kind: "stop-animation", renderObjectId: animation.ownerObjectId,
            animationRole: animation.animationRole, restart: false }));
          commands.push(command(commands.length, { kind: "hide-object", renderObjectId: animation.ownerObjectId }));
        } else {
          const elapsed = advanceNoteAnimationClock(plannedAnimationElapsed.get(animation.ownerObjectId)!, deltaTimeSeconds);
          commands.push(command(commands.length, { kind: "sample-animation", renderObjectId: animation.ownerObjectId,
            animationRole: animation.animationRole, elapsedSeconds: f32(elapsed) }));
          plannedAnimationElapsed.set(animation.ownerObjectId, elapsed);
        }
      }
    }

    const currentSideNodes = new Set(visualNodes.map(node => nodeObjectId(node)));
    for (const objectId of [...plannedVisible]) if (objectId.includes(":side:") && !currentSideNodes.has(objectId)) {
      commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId })); plannedVisible.delete(objectId);
    }
    for (const [objectId, elapsed] of plannedAnimationElapsed) if (objectId.includes(":side:") &&
      !currentSideNodes.has(objectId.slice(0, -":icon".length)))
      plannedAnimationElapsed.set(objectId, advanceNoteAnimationClock(elapsed, deltaTimeSeconds));

    const activeDirectionalLines = new Set<string>();
    for (const [first, second, direction] of directionalEdges) {
      const a = samples.get(first.identity)!, b = samples.get(second.identity)!;
      const objectId = `render:garupa:directional-line:${first.identity}:${second.identity}`;
      if (!a.visible || !b.visible) continue;
      activeDirectionalLines.add(objectId);
      if (!plannedCreated.has(objectId)) {
        commands.push(command(commands.length, { kind: "create-object", renderObjectId: objectId,
          poolFamily: "multiple-directional-line", role: "multiple-directional-line", parentObjectId: null }));
        plannedCreated.set(objectId, this.renderer.snapshot().nextSequence + commands.length);
        commands.push(command(commands.length, { kind: "bind-resource", renderObjectId: objectId, binding: "material",
          logicalAssetId: direction === "Left" ? this.resources.multipleDirectionalLineLeftLogicalAssetId!
            : this.resources.multipleDirectionalLineRightLogicalAssetId!, exactKey: null }));
      }
      const target = (sample: ProductNodeSample) => ({ position: requireProjectedPosition(sample),
        localScale: vector3(requireUniformScale(sample).value, requireUniformScale(sample).value, 0), progressRate: f32(0) });
      const geometry = buildOrdinaryMultipleDirectionalLine({ targetA: target(a), targetB: target(b) });
      if (geometry.status !== "ok") return geometry;
      commands.push(command(commands.length, { kind: "set-transform", renderObjectId: objectId,
        position: vector3(0, 0, 0), scale: vector3(1, 1, 1), rotationDegrees: f32(0), color: white(),
        ordering: ordering(3, 0, objectId), maskObjectId: null }));
      commands.push(command(commands.length, { kind: "set-line", renderObjectId: objectId,
        ...geometry.value, materialRole: "multiple-directional-line" }));
      if (!plannedVisible.has(objectId)) commands.push(command(commands.length, { kind: "activate-object", renderObjectId: objectId }));
      plannedVisible.add(objectId);
    }
    for (const objectId of [...plannedVisible]) if (objectId.startsWith("render:garupa:directional-line:") && !activeDirectionalLines.has(objectId)) {
      commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId })); plannedVisible.delete(objectId);
    }

    for (const chain of this.chart.slideChains) {
      for (let index = 1; index < chain.connectionIdentities.length; index += 1) {
        const from = samples.get(chain.connectionIdentities[index - 1]!)!;
        const to = samples.get(chain.connectionIdentities[index]!)!;
        const objectId = lineObjectId(chain.identity, index - 1);
        const slideState = plannedSlides.get(chain.identity)!;
        const lineVisible = !slideState.finished && slideState.children[index - 1]!.meshVisible &&
          slideAxisInterval(from.curve, to.curve) !== null;
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
            plannedCreated.set(objectId, this.renderer.snapshot().nextSequence + commands.length);
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
            ordering: ordering(3, 60, objectId, 0.9900000095367432),
            maskObjectId: null,
          }));
          const mesh = slideSegments.get(chain.identity)![index - 1]!.geometry;
          commands.push(command(commands.length, { kind: "set-mesh", renderObjectId: objectId,
            ...mesh, materialRole: "curve-note" }));
        } else if (plannedVisible.delete(objectId)) {
          commands.push(command(commands.length, { kind: "hide-object", renderObjectId: objectId }));
        }
      }
    }

    const batch = commands.length === 0 ? ok(null) : this.renderer.preflight(commands);
    if (batch.status !== "ok") return batch;
    return ok(new RenderOwnerTransaction(this.renderer, batch.value, () => {
      this.created.clear();
      this.visible.clear();
      for (const [id, sequence] of plannedCreated) this.created.set(id, sequence);
      for (const id of plannedVisible) this.visible.add(id);
      this.judgedNodeIdentities.clear();
      for (const id of plannedJudged) this.judgedNodeIdentities.add(id);
      this.animationElapsedSeconds.clear();
      this.singleStates.clear();
      for (const [id, state] of plannedSingles) this.singleStates.set(id, state);
      this.slideStates.clear();
      for (const [id, state] of plannedSlides) this.slideStates.set(id, state);
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
    for (const objectId of [...this.created.keys()].reverse()) {
      commands.push(command(commands.length, { kind: "release-object", renderObjectId: objectId }));
    }
    const batch = this.renderer.preflight(commands);
    return batch.status === "ok"
      ? ok(new RenderOwnerTransaction(this.renderer, batch.value, () => {
          this.created.clear();
          this.visible.clear();
          this.judgedNodeIdentities.clear();
          this.animationElapsedSeconds.clear();
          this.slideStates.clear();
          this.singleStates.clear();
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

  getSlidePresentation(identity: string) {
    const state = this.slideStates.get(identity);
    return state === undefined ? null : { transform: state.root.renderedTransform, active: state.flashActive };
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
  return noteLongFlashBinding(resources, resourceSuffix(front, habahiro), habahiro);
}

function nodeTransform(
  sample: ProductNodeSample,
  renderObjectId: string,
  parentScale: RenderFloat32,
  ordering: (domain: number, source: number, identity: string, sourceZ: number) => RenderOrderingKey,
): Omit<Extract<RenderCommand, { kind: "set-transform" }>, "sessionId" | "sequence" | "frame" | "substep"> {
  const scale = calculateOrdinaryNoteWorldScaleAxis(requireUniformScale(sample).value, parentScale.value);
  return {
    kind: "set-transform",
    renderObjectId,
    position: requireProjectedPosition(sample),
    scale: vector3(scale, scale, 0),
    rotationDegrees: f32(0),
    color: white(),
    ordering: ordering(3, 70, renderObjectId, requireProjectedPosition(sample).z.value),
    maskObjectId: null,
  };
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
function slideOwnerObjectId(chainIdentity: string): string {
  return `render:garupa:slide-owner:${chainIdentity}`;
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
