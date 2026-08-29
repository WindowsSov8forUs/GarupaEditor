import type {
  AutoLiveJudgementOwnership,
  AutoLiveJudgementRequest,
} from "../data/autoLiveJudgement";
import type { SimulatorModeIdentity } from "../data/inGameCalculatedData";
import {
  ManualTouchPhase,
  copyManualInputPosition,
  type ManualInputFrame,
  type ManualInputPosition,
  type ManualInputTouch,
} from "../data/manualInput";
import {
  JudgeTiming,
  NoteResultType,
  judgeManualNote,
  type JudgeTimingValue,
  type ManualJudgementOwnership,
  type ManualJudgementRequest,
  type NoteResultTypeValue,
} from "../data/manualJudgement";
import type { NoteInformation } from "../chart/types";
import type { InGameMusicScoreController } from "../managers/inGameMusicScoreController";
import type { InGameOneFrameJudgementController } from "../managers/inGameOneFrameJudgementController";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import type { GarupaProductChartProfile, GarupaProductNode } from "./productChartProfile";
import type { GarupaProductRenderProducer } from "./productRenderProducer";

interface PendingGesture {
  readonly node: GarupaProductNode;
  readonly origin: ManualInputPosition;
  readonly result: Exclude<NoteResultTypeValue, -1>;
  readonly timing: JudgeTimingValue;
}

type PendingProductJudgement =
  | {
      readonly kind: "auto";
      readonly node: GarupaProductNode;
      readonly missed: false;
      readonly request: AutoLiveJudgementRequest;
    }
  | {
      readonly kind: "manual";
      readonly node: GarupaProductNode;
      readonly missed: boolean;
      readonly request: ManualJudgementRequest;
    };

interface ProductFingerOwner {
  readonly fingerId: number;
  readonly began: ManualInputPosition;
  last: ManualInputPosition;
  chainIdentity: string | null;
  pendingGesture: PendingGesture | null;
}

export interface GarupaProductTimelineSnapshot {
  readonly route: "product-extension";
  readonly visibleNodeCount: number;
  readonly judgedNodeCount: number;
  readonly missedNodeCount: number;
  readonly nextAutoIndex: number;
  readonly activeFingerCount: number;
  readonly pendingJudgementCount: number;
  readonly render: ReturnType<GarupaProductRenderProducer["snapshot"]> | null;
}

export class GarupaProductTimelineManager {
  private readonly orderedVisibleNodes: readonly GarupaProductNode[];
  private readonly judgedSources = new WeakSet<NoteInformation>();
  private readonly missedSources = new WeakSet<NoteInformation>();
  private readonly queuedSources = new WeakSet<NoteInformation>();
  private readonly fingers = new Map<number, ProductFingerOwner>();
  private readonly chainFinger = new Map<string, number>();
  private readonly nextVisibleIndexByChain = new Map<string, number>();
  private pendingManualFrame: ManualInputFrame | null = null;
  private readonly pendingJudgements: PendingProductJudgement[] = [];
  private judgedNodeCount = 0;
  private missedNodeCount = 0;
  private nextAutoIndex = 0;
  private initialized = false;
  private disposed = false;

  constructor(
    private readonly chart: GarupaProductChartProfile,
    private readonly mode: SimulatorModeIdentity,
    private readonly music: InGameMusicScoreController,
    private readonly oneFrame: InGameOneFrameJudgementController,
    private readonly render: GarupaProductRenderProducer | null,
    private readonly scene: GarupaProductSceneLayout | null = null,
    private readonly judgementAdjustValueB = 0,
  ) {
    this.orderedVisibleNodes = Object.freeze([...chart.visibleNodes].sort((left, right) =>
      left.absolutePosition - right.absolutePosition || left.authoredOrder - right.authoredOrder));
    for (const chain of chart.slideChains) this.nextVisibleIndexByChain.set(chain.identity, 0);
  }

  initialize(): SimulatorResult<void> {
    if (this.disposed) return rejected("simulator.garupa-extension.initialize-after-dispose", "A disposed product timeline is terminal.");
    if (this.initialized) return ok(undefined);
    if (this.chart.route !== "product-extension") {
      return rejected(
        "simulator.garupa-extension.invalid-timeline-route",
        "Only a product-extension profile may create the sibling product timeline owner.",
      );
    }
    if (this.mode.inputMode === "manual" && this.scene === null) {
      return rejected(
        "simulator.garupa-extension.manual-scene-required",
        "Product Manual requires the schema-6 continuous input scene; it cannot fall back to original buttons.",
      );
    }
    const render = this.render?.validate() ?? ok(undefined);
    if (render.status !== "ok") return render;
    this.initialized = true;
    return ok(undefined);
  }

  prepareManualFrame(
    frame: ManualInputFrame | undefined,
    deltaTimeSeconds: number,
  ): SimulatorResult<void> {
    if (this.mode.inputMode !== "manual") {
      return frame === undefined || frame.touches.length === 0
        ? ok(undefined)
        : rejected("simulator.garupa-extension.input-in-auto", "Product Auto cannot consume real touches.");
    }
    if (!Number.isFinite(deltaTimeSeconds) || Math.fround(deltaTimeSeconds) < 0 ||
      frame === undefined || !Array.isArray(frame.touches)) {
      return frame === undefined
        ? ok(undefined)
        : rejected("simulator.garupa-extension.invalid-manual-frame", "Product Manual requires one finite outer-frame delta and typed touch array.");
    }
    const touches: ManualInputTouch[] = [];
    const seen = new Set<number>();
    for (const touch of frame.touches) {
      if (!Number.isInteger(touch.fingerId) || touch.fingerId < 0 || seen.has(touch.fingerId) ||
        !Object.values(ManualTouchPhase).includes(touch.phase)) {
        return rejected("simulator.garupa-extension.invalid-manual-touch", "Product touches require unique nonnegative finger IDs and closed phases.");
      }
      const position = copyManualInputPosition(touch.position);
      if (position.status !== "ok") return position;
      seen.add(touch.fingerId);
      touches.push(Object.freeze({
        fingerId: touch.fingerId,
        phase: touch.phase,
        position: position.value,
        buttonResolution: null,
      }));
    }
    this.pendingManualFrame = Object.freeze({ touches: Object.freeze(touches) });
    return ok(undefined);
  }

  resolveContinuousInput(position: ManualInputPosition): SimulatorResult<null> {
    if (!this.initialized || this.disposed || this.mode.inputMode !== "manual" || this.scene === null) {
      return rejected(
        "simulator.garupa-extension.resolve-outside-manual",
        "Continuous input resolution exists only in an initialized product Manual session.",
      );
    }
    const lane = this.scene.screenToContinuousLane(position);
    return lane.status === "ok" ? ok(null) : lane;
  }

  update(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.initialized || this.disposed) {
      return rejected(
        "simulator.garupa-extension.update-outside-lifecycle",
        "Product timeline updates require one initialized non-disposed owner.",
      );
    }
    if (this.pendingJudgements.length !== 0) {
      return rejected(
        "simulator.garupa-extension.undrained-product-batch",
        "Every product-only due set must be fully drained through bounded OneFrame batches before the next host update.",
      );
    }
    const visualPosition = this.music.musicPosition;
    const judgementPosition = this.music.getAdjustedMusicPosition(this.judgementAdjustValueB);
    if (!Number.isFinite(visualPosition) || visualPosition < 0 || !Number.isFinite(judgementPosition) ||
      !Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0 ||
      deltaTimeSeconds !== Math.fround(deltaTimeSeconds)) {
      return rejected(
        "simulator.garupa-extension.non-finite-current-position",
        "Product visual and judgement sampling requires finite BPM-clock positions and one exact nonnegative Float32 outer-frame delta.",
      );
    }
    const judgedThisFrame: GarupaProductNode[] = [];
    if (this.mode.inputMode === "auto") {
      while (this.nextAutoIndex < this.orderedVisibleNodes.length) {
        const node = this.orderedVisibleNodes[this.nextAutoIndex]!;
        if (judgementPosition < node.absolutePosition) break;
        judgedThisFrame.push(node);
        this.nextAutoIndex += 1;
      }
    } else {
      const manual = this.processManualFrame(judgementPosition);
      if (manual.status !== "ok") return manual;
      judgedThisFrame.push(...manual.value);
    }
    const render = this.render?.preflightFrame(
      visualPosition,
      judgedThisFrame,
      deltaTimeSeconds,
    ) ?? ok(null);
    if (render.status !== "ok") return render;
    if (this.mode.inputMode === "auto") {
      for (const node of judgedThisFrame) {
        const submitted = this.submitAuto(node);
        if (submitted.status !== "ok") {
          if (render.value !== null) render.value.discard();
          return submitted;
        }
      }
    }
    if (render.value !== null) {
      const committed = render.value.commit();
      if (committed.status !== "ok") return committed;
    }
    this.pendingManualFrame = null;
    const submitted = this.submitPendingJudgementBatch();
    return submitted.status === "ok" ? ok(undefined) : submitted;
  }

  submitPendingJudgementBatch(): SimulatorResult<{
    readonly submitted: number;
    readonly remaining: number;
  }> {
    if (!this.initialized || this.disposed) {
      return rejected(
        "simulator.garupa-extension.batch-outside-lifecycle",
        "Product OneFrame batches require one initialized non-disposed timeline owner.",
      );
    }
    if (this.pendingJudgements.length === 0) {
      return ok(Object.freeze({ submitted: 0, remaining: 0 }));
    }
    const capacity = this.oneFrame.availableCapacity();
    if (capacity === 0) {
      return ok(Object.freeze({ submitted: 0, remaining: this.pendingJudgements.length }));
    }
    const count = Math.min(capacity, 5, this.pendingJudgements.length);
    const entries = this.pendingJudgements.slice(0, count);
    if (entries.some((entry) => entry.kind !== (this.mode.inputMode === "auto" ? "auto" : "manual"))) {
      return rejected(
        "simulator.garupa-extension.mixed-product-batch",
        "One product session cannot mix Auto and Manual judgement requests in a bounded batch.",
      );
    }
    if (this.mode.inputMode === "auto") {
      const requests = entries.map((entry) => (entry as Extract<PendingProductJudgement, { kind: "auto" }>).request);
      const transaction = this.oneFrame.preflightAutoLiveJudgementBatch(requests);
      if (transaction.status !== "ok") return transaction;
      const committed = transaction.value.commit();
      if (committed.status !== "ok") return committed;
    } else {
      const requests = entries.map((entry) =>
        (entry as Extract<PendingProductJudgement, { kind: "manual" }>).request);
      const transaction = this.oneFrame.preflightManualJudgementBatch(requests);
      if (transaction.status !== "ok") return transaction;
      const committed = transaction.value.commit();
      if (committed.status !== "ok") return committed;
    }
    for (const entry of entries) this.markJudged(entry.node, entry.missed);
    this.pendingJudgements.splice(0, count);
    return ok(Object.freeze({ submitted: count, remaining: this.pendingJudgements.length }));
  }

  private processManualFrame(
    judgementPosition: number,
  ): SimulatorResult<readonly GarupaProductNode[]> {
    const judged: GarupaProductNode[] = [];
    const frame = this.pendingManualFrame;
    if (frame !== null) {
      for (const touch of frame.touches) {
        const processed = this.processTouch(touch, judgementPosition, judged);
        if (processed.status !== "ok") return processed;
      }
    }
    for (const node of this.orderedVisibleNodes) {
      const source = node.scoringSource!;
      if (this.judgedSources.has(source) || this.missedSources.has(source) || this.queuedSources.has(source) ||
        judgementPosition <= node.absolutePosition) continue;
      const timing = this.judgeNode(node, judgementPosition);
      if (timing.status !== "ok") return timing;
      if (timing.value.result !== NoteResultType.None) continue;
      const missed = this.submitManual(node, NoteResultType.Miss, JudgeTiming.None);
      if (missed.status !== "ok") return missed;
      this.advanceChain(node);
      this.clearPendingGesture(node);
    }
    return ok(Object.freeze(judged));
  }

  private processTouch(
    touch: ManualInputTouch,
    judgementPosition: number,
    judged: GarupaProductNode[],
  ): SimulatorResult<void> {
    if (touch.phase === ManualTouchPhase.Began) {
      if (this.fingers.has(touch.fingerId)) {
        return rejected("simulator.garupa-extension.duplicate-finger-began", "One product finger cannot Begin twice before Ended.");
      }
      const candidate = this.selectCandidate(touch.position, judgementPosition, null);
      if (candidate.status !== "ok") return candidate;
      if (candidate.value === null) return ok(undefined);
      const owner: ProductFingerOwner = {
        fingerId: touch.fingerId,
        began: touch.position,
        last: touch.position,
        chainIdentity: candidate.value.chainIdentity,
        pendingGesture: null,
      };
      if (owner.chainIdentity !== null) {
        const existing = this.chainFinger.get(owner.chainIdentity);
        if (existing !== undefined) return ok(undefined);
        this.chainFinger.set(owner.chainIdentity, touch.fingerId);
      }
      this.fingers.set(touch.fingerId, owner);
      return this.consumeCandidate(owner, candidate.value, touch.position, judgementPosition, judged);
    }

    const owner = this.fingers.get(touch.fingerId);
    if (owner === undefined) return ok(undefined);
    owner.last = touch.position;
    if (touch.phase === ManualTouchPhase.Ended) {
      this.releaseFinger(owner);
      return ok(undefined);
    }
    if (owner.pendingGesture !== null) {
      if (gestureSucceeded(owner.pendingGesture, touch.position)) {
        const pending = owner.pendingGesture;
        const submitted = this.submitManual(pending.node, pending.result, pending.timing);
        if (submitted.status !== "ok") return submitted;
        judged.push(pending.node);
        owner.pendingGesture = null;
        this.advanceChain(pending.node);
        if (owner.chainIdentity === null) this.releaseFinger(owner);
      }
      return ok(undefined);
    }
    if (owner.chainIdentity === null) return ok(undefined);
    const candidate = this.currentChainNode(owner.chainIdentity);
    if (candidate === null) {
      this.releaseFinger(owner);
      return ok(undefined);
    }
    const inside = this.scene!.isInsideContinuousSpan(touch.position, candidate.spanStart, candidate.width);
    if (inside.status !== "ok" || !inside.value) return inside.status === "ok" ? ok(undefined) : inside;
    return this.consumeCandidate(owner, candidate, touch.position, judgementPosition, judged);
  }

  private consumeCandidate(
    owner: ProductFingerOwner,
    node: GarupaProductNode,
    position: ManualInputPosition,
    judgementPosition: number,
    judged: GarupaProductNode[],
  ): SimulatorResult<void> {
    const timing = this.judgeNode(node, judgementPosition);
    if (timing.status !== "ok" || timing.value.result === NoteResultType.None) {
      return timing.status === "ok" ? ok(undefined) : timing;
    }
    if (node.type === "Flick" || node.type === "Directional") {
      owner.pendingGesture = Object.freeze({
        node,
        origin: position,
        result: timing.value.result as Exclude<NoteResultTypeValue, -1>,
        timing: timing.value.timing,
      });
      return ok(undefined);
    }
    const submitted = this.submitManual(
      node,
      timing.value.result as Exclude<NoteResultTypeValue, -1>,
      timing.value.timing,
    );
    if (submitted.status !== "ok") return submitted;
    judged.push(node);
    this.advanceChain(node);
    if (owner.chainIdentity === null) {
      this.releaseFinger(owner);
      return ok(undefined);
    }
    return this.consumeEqualPositionChainNodes(owner, position, judgementPosition, judged);
  }

  private consumeEqualPositionChainNodes(
    owner: ProductFingerOwner,
    position: ManualInputPosition,
    judgementPosition: number,
    judged: GarupaProductNode[],
  ): SimulatorResult<void> {
    while (owner.chainIdentity !== null) {
      const next = this.currentChainNode(owner.chainIdentity);
      if (next === null) {
        this.releaseFinger(owner);
        return ok(undefined);
      }
      const previous = judged[judged.length - 1];
      if (previous === undefined || next.absolutePosition !== previous.absolutePosition) return ok(undefined);
      const inside = this.scene!.isInsideContinuousSpan(position, next.spanStart, next.width);
      if (inside.status !== "ok" || !inside.value) return inside.status === "ok" ? ok(undefined) : inside;
      if (next.type === "Flick" || next.type === "Directional") {
        const timing = this.judgeNode(next, judgementPosition);
        if (timing.status !== "ok" || timing.value.result === NoteResultType.None) {
          return timing.status === "ok" ? ok(undefined) : timing;
        }
        owner.pendingGesture = Object.freeze({
          node: next,
          origin: position,
          result: timing.value.result as Exclude<NoteResultTypeValue, -1>,
          timing: timing.value.timing,
        });
        return ok(undefined);
      }
      const consumed = this.consumeCandidate(owner, next, position, judgementPosition, judged);
      return consumed;
    }
    return ok(undefined);
  }

  private selectCandidate(
    position: ManualInputPosition,
    judgementPosition: number,
    chainIdentity: string | null,
  ): SimulatorResult<GarupaProductNode | null> {
    const candidates: GarupaProductNode[] = [];
    for (const node of this.orderedVisibleNodes) {
      const source = node.scoringSource!;
      if (this.judgedSources.has(source) || this.missedSources.has(source) || this.queuedSources.has(source)) continue;
      if (chainIdentity === null) {
        if (node.chainIdentity !== null && this.currentChainNode(node.chainIdentity) !== node) continue;
        if (node.chainIdentity !== null && this.chainFinger.has(node.chainIdentity)) continue;
      } else if (node.chainIdentity !== chainIdentity || this.currentChainNode(chainIdentity) !== node) continue;
      const inside = this.scene!.isInsideContinuousSpan(position, node.spanStart, node.width);
      if (inside.status !== "ok") return inside;
      if (!inside.value) continue;
      const judgement = this.judgeNode(node, judgementPosition);
      if (judgement.status !== "ok") return judgement;
      if (judgement.value.result !== NoteResultType.None) candidates.push(node);
    }
    candidates.sort((left, right) =>
      Math.abs(left.absolutePosition - judgementPosition) - Math.abs(right.absolutePosition - judgementPosition) ||
      left.chartItemIndex - right.chartItemIndex ||
      (left.connectionIndex ?? -1) - (right.connectionIndex ?? -1));
    return ok(candidates[0] ?? null);
  }

  private judgeNode(node: GarupaProductNode, currentPosition: number) {
    return judgeManualNote(
      0,
      Math.fround(node.absolutePosition),
      Math.fround(currentPosition),
      this.music.currentBpm,
    );
  }

  private submitAuto(node: GarupaProductNode): SimulatorResult<void> {
    const source = node.scoringSource;
    if (source === null || this.judgedSources.has(source) || this.missedSources.has(source) ||
      this.queuedSources.has(source)) {
      return rejected(
        "simulator.garupa-extension.invalid-auto-source",
        "Every due non-Hidden product node must own one unconsumed CS-V1 source.",
      );
    }
    this.pendingJudgements.push(Object.freeze({
      kind: "auto",
      node,
      missed: false,
      request: Object.freeze({
        noteInformation: source,
        phase: "head",
        noteType: productJudgeNoteType(node),
        absolutePosition: node.absolutePosition,
        multipleDirectionalFlickNoteCount: 0,
      }),
    }));
    this.queuedSources.add(source);
    return ok(undefined);
  }

  private submitManual(
    node: GarupaProductNode,
    result: Exclude<NoteResultTypeValue, -1>,
    timing: JudgeTimingValue,
  ): SimulatorResult<void> {
    const source = node.scoringSource;
    if (source === null || this.judgedSources.has(source) || this.missedSources.has(source) ||
      this.queuedSources.has(source)) {
      return rejected("simulator.garupa-extension.hidden-or-consumed-manual-source", "Product Manual requires one visible unconsumed scoring source.");
    }
    this.pendingJudgements.push(Object.freeze({
      kind: "manual",
      node,
      missed: result === NoteResultType.Miss,
      request: Object.freeze({
        noteInformation: source,
        phase: "head",
        noteType: result === NoteResultType.Miss ? 0 : productJudgeNoteType(node),
        rawResult: result,
        rawTiming: timing,
        absolutePosition: node.absolutePosition,
      }),
    }));
    this.queuedSources.add(source);
    return ok(undefined);
  }

  private markJudged(node: GarupaProductNode, missed: boolean): void {
    const source = node.scoringSource!;
    if (missed) {
      this.missedSources.add(source);
      this.missedNodeCount += 1;
    } else {
      this.judgedSources.add(source);
      this.judgedNodeCount += 1;
    }
  }

  private currentChainNode(chainIdentity: string): GarupaProductNode | null {
    const chain = this.chart.slideChains.find((candidate) => candidate.identity === chainIdentity);
    const index = this.nextVisibleIndexByChain.get(chainIdentity) ?? 0;
    const identity = chain?.visibleConnectionIdentities[index];
    return identity === undefined ? null : this.chart.nodeByIdentity.get(identity) ?? null;
  }

  private advanceChain(node: GarupaProductNode): void {
    if (node.chainIdentity === null) return;
    const current = this.currentChainNode(node.chainIdentity);
    if (current === node) {
      this.nextVisibleIndexByChain.set(
        node.chainIdentity,
        (this.nextVisibleIndexByChain.get(node.chainIdentity) ?? 0) + 1,
      );
    }
    if (this.currentChainNode(node.chainIdentity) === null) {
      const fingerId = this.chainFinger.get(node.chainIdentity);
      if (fingerId !== undefined) {
        const owner = this.fingers.get(fingerId);
        if (owner !== undefined) this.releaseFinger(owner);
      }
    }
  }

  private clearPendingGesture(node: GarupaProductNode): void {
    for (const owner of this.fingers.values()) {
      if (owner.pendingGesture?.node === node) owner.pendingGesture = null;
    }
  }

  private releaseFinger(owner: ProductFingerOwner): void {
    this.fingers.delete(owner.fingerId);
    if (owner.chainIdentity !== null && this.chainFinger.get(owner.chainIdentity) === owner.fingerId) {
      this.chainFinger.delete(owner.chainIdentity);
    }
  }

  getAutoLiveJudgementOwnership(source: NoteInformation): AutoLiveJudgementOwnership | null {
    return this.chart.scoringNodeBySource.has(source)
      ? Object.freeze({ multipleDirectionalFlickNoteCount: null, productExtension: "garupa-visible-node" as const })
      : null;
  }

  getManualJudgementOwnership(source: NoteInformation): ManualJudgementOwnership | null {
    if (!this.chart.scoringNodeBySource.has(source)) return null;
    return Object.freeze({
      multipleDirectionalFlickNoteCount: null,
      multipleDirectionalFlickButtonTypes: null,
      longAfterAbsolutePosition: null,
      longAfterNoteType: null,
      longAfterButtonTypes: null,
      longAfterMultipleCount: null,
      slidePhase: null,
      slideAllowedNoteTypes: null,
      slideAbsolutePosition: null,
      slideButtonTypes: null,
      productExtension: "garupa-visible-node" as const,
    });
  }

  ownsScoringSource(source: NoteInformation): boolean {
    return this.chart.scoringNodeBySource.has(source);
  }

  preflightDispose() {
    return this.render?.preflightDispose() ?? ok(null);
  }

  commitDispose(): void {
    this.pendingManualFrame = null;
    this.pendingJudgements.length = 0;
    this.fingers.clear();
    this.chainFinger.clear();
    this.initialized = false;
    this.disposed = true;
  }

  snapshot(): GarupaProductTimelineSnapshot {
    return Object.freeze({
      route: "product-extension" as const,
      visibleNodeCount: this.orderedVisibleNodes.length,
      judgedNodeCount: this.judgedNodeCount,
      missedNodeCount: this.missedNodeCount,
      nextAutoIndex: this.nextAutoIndex,
      activeFingerCount: this.fingers.size,
      pendingJudgementCount: this.pendingJudgements.length,
      render: this.render?.snapshot() ?? null,
    });
  }
}

function productJudgeNoteType(node: GarupaProductNode): number {
  if (node.type === "Flick") return 3;
  if (node.type === "Directional") return 9;
  return 0;
}

function gestureSucceeded(pending: PendingGesture, current: ManualInputPosition): boolean {
  const dx = Math.fround(current.x - pending.origin.x);
  const dy = Math.fround(current.y - pending.origin.y);
  if (pending.node.type === "Flick") {
    return Math.fround(Math.hypot(dx, dy) / 360) > Math.fround(0.04);
  }
  const correct = pending.node.direction === "Left" ? dx < 0 : dx > 0;
  return correct && Math.fround(Math.abs(dx) / 360) > Math.fround(0.01);
}

function rejected<T>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}
