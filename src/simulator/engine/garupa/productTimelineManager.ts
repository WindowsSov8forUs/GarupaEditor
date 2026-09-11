import type {
  AutoLiveJudgementOwnership,
  AutoLiveJudgementRequest,
} from "../data/autoLiveJudgement";
import type { HoldSoundEvent } from "../audio/audioCommandProducer";
import type { SimulatorManualInputGeometryBackend } from "../../backends/contracts";
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
  isManualTimeoutOver,
  MANUAL_MISS_SECONDS,
  directionalGestureThreshold,
  getManualScreenDistanceRate,
  type JudgeTimingValue,
  type ManualJudgementOwnership,
  type ManualJudgementRequest,
  type NoteResultTypeValue,
} from "../data/manualJudgement";
import type { NoteInformation } from "../chart/types";
import type { OneFrameJudgementBatch } from "../data/oneFrameData";
import type { InGameMusicScoreController } from "../managers/inGameMusicScoreController";
import { SlideNoteManager, advanceSlideGestureContact, slideHeldNodeResult, slideHeadTimeoutDue,
  slideAfterTimeoutDue, type SlideJudgeDecision } from "../managers/slideNoteManager";
import type {
  InGameOneFrameJudgementController,
  OneFrameJudgementBatchTransaction,
} from "../managers/inGameOneFrameJudgementController";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import { FrameMutationPlan, type FrameMutationParticipant } from "../managers/frameMutationPlan";
import type { GarupaProductChartProfile, GarupaProductNode } from "./productChartProfile";
import type { GarupaRenderInputAdapter } from "./garupaRenderInputAdapter";
import { advanceSlideStopWait } from "../rendering/ordinarySlideChildLifecycle";
import type { NoteBase } from "../notes/noteBase";
import type { ManualCandidateExtensionFrame } from "../managers/noteManager";

interface ProductTimeoutState { readonly seconds: number; readonly frames: number; readonly stopWait: number; readonly boundFlick: boolean }

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

export interface ProductJudgementReflectTransaction {
  publishOwner(): SimulatorResult<void>;
  discard(): SimulatorResult<void>;
}

interface ProductJudgementSubmission {
  readonly submitted: number;
  readonly remaining: number;
  publishOwner(): SimulatorResult<void>;
  discard(): SimulatorResult<void>;
}

interface ProductManualFrame extends ManualInputFrame {
  readonly judgementPosition: number;
  readonly musicPosition: number;
  readonly currentBpm: number;
}

interface ProductTimelineMutableSnapshot {
  readonly timeouts: readonly (readonly [string, ProductTimeoutState])[];
  readonly holdSounds: readonly HoldSoundEvent[];
  readonly judgedSources: readonly NoteInformation[];
  readonly missedSources: readonly NoteInformation[];
  readonly queuedSources: readonly NoteInformation[];
  readonly fingers: readonly (readonly [number, ProductFingerOwner])[];
  readonly chainFinger: readonly (readonly [string, number])[];
  readonly nextVisibleIndexByChain: readonly (readonly [string, number])[];
  readonly pendingManualFrame: ProductManualFrame | null;
  readonly pendingJudgements: readonly PendingProductJudgement[];
  readonly inFlightJudgements: readonly PendingProductJudgement[];
  readonly judgedNodeCount: number;
  readonly missedNodeCount: number;
  readonly nextAutoIndex: number;
}

interface ProductFingerOwner {
  readonly fingerId: number;
  readonly began: ManualInputPosition;
  last: ManualInputPosition;
  chainIdentity: string | null;
  pendingGesture: PendingGesture | null;
  gestureGrace: number;
  flashActive: boolean;
}

export interface GarupaProductTimelineSnapshot {
  readonly kind: "note-extensions";
  readonly visibleNodeCount: number;
  readonly judgedNodeCount: number;
  readonly missedNodeCount: number;
  readonly nextAutoIndex: number;
  readonly activeFingerCount: number;
  readonly pendingJudgementCount: number;
  readonly render: ReturnType<GarupaRenderInputAdapter["snapshot"]> | null;
}

export class GarupaProductTimelineManager {
  private readonly slideJudge = new SlideNoteManager();
  private readonly timeouts = new Map<string, ProductTimeoutState>();
  private readonly orderedVisibleNodes: readonly GarupaProductNode[];
  private readonly judgedSources = new Set<NoteInformation>();
  private readonly missedSources = new Set<NoteInformation>();
  private readonly queuedSources = new Set<NoteInformation>();
  private readonly fingers = new Map<number, ProductFingerOwner>();
  private readonly chainFinger = new Map<string, number>();
  private readonly pendingHoldSounds: HoldSoundEvent[] = [];

  takeHoldSounds(): readonly HoldSoundEvent[] { return this.pendingHoldSounds.splice(0); }
  private readonly nextVisibleIndexByChain = new Map<string, number>();
  private pendingManualFrame: ProductManualFrame | null = null;
  private readonly pendingJudgements: PendingProductJudgement[] = [];
  private readonly inFlightJudgements: PendingProductJudgement[] = [];
  private pendingReflectTransaction: ProductJudgementReflectTransaction | null = null;
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
    private readonly render: GarupaRenderInputAdapter | null,
    private readonly scene: GarupaProductSceneLayout | null = null,
    private readonly judgementAdjustValueB = 0,
    private readonly isMoveTime: () => boolean = () => false,
    private readonly originalHandledTouch: (fingerId: number) => boolean = () => false,
    private readonly manualGeometry: SimulatorManualInputGeometryBackend | null = null,
    private readonly selectedCandidate?: (fingerId: number) => string | null | undefined,
  ) {
    this.orderedVisibleNodes = Object.freeze([...chart.visibleNodes].sort((left, right) =>
      left.absolutePosition - right.absolutePosition || left.authoredOrder - right.authoredOrder));
    for (const chain of chart.slideChains) this.nextVisibleIndexByChain.set(chain.identity, 0);
  }

  private get shouldForcePerfect(): boolean {
    return this.mode.inputMode === "auto" || this.isMoveTime();
  }

  getSlidePresentation(identity: string) { return this.render?.getSlidePresentation(identity) ?? null; }

  initialize(): SimulatorResult<void> {
    if (this.disposed) return rejected("simulator.garupa-extension.initialize-after-dispose", "A disposed product timeline is terminal.");
    if (this.initialized) return ok(undefined);
    if (!this.chart.hasExtensions) {
      return rejected(
        "simulator.garupa-extension.invalid-timeline-route",
        "Note extension handling requires at least one note that cannot use the unextended original behaviour.",
      );
    }
    if (this.mode.inputMode === "manual" && (this.scene === null || this.manualGeometry === null)) {
      return rejected(
        "simulator.garupa-extension.manual-scene-required",
        "Product Manual requires the schema-6 continuous input scene; it cannot fall back to original buttons.",
      );
    }
    const render = this.render?.validate() ?? ok(undefined);
    if (render.status !== "ok") return render;
    const slide = this.slideJudge.initialize(this.manualGeometry ?? undefined);
    if (slide.status !== "ok") return slide;
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
    this.pendingManualFrame = Object.freeze({ touches: Object.freeze(touches),
      musicPosition: this.music.musicPosition,
      judgementPosition: this.music.getAdjustedMusicPosition(this.judgementAdjustValueB),
      currentBpm: this.music.currentBpm });
    return ok(undefined);
  }

  update(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.initialized || this.disposed) {
      return rejected(
        "simulator.garupa-extension.update-outside-lifecycle",
        "Product timeline updates require one initialized non-disposed owner.",
      );
    }
    if (this.pendingJudgements.length !== 0 || this.inFlightJudgements.length !== 0 ||
      this.pendingReflectTransaction !== null) {
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
    const before = this.captureMutableState();
    const rollback = <T>(result: SimulatorResult<T>): SimulatorResult<T> => {
      this.restoreMutableState(before);
      return result;
    };
    const judgedThisFrame: GarupaProductNode[] = [];
    if (this.shouldForcePerfect) {
      while (this.nextAutoIndex < this.orderedVisibleNodes.length) {
        const node = this.orderedVisibleNodes[this.nextAutoIndex]!;
        if (judgementPosition < node.absolutePosition) break;
        this.nextAutoIndex += 1;
        const source = node.scoringSource!;
        if (this.judgedSources.has(source) || this.missedSources.has(source)) continue;
        judgedThisFrame.push(node);
        this.advanceChain(node);
      }
    } else {
      const manual = this.processManualFrame(judgementPosition, deltaTimeSeconds);
      if (manual.status !== "ok") return rollback(manual);
      judgedThisFrame.push(...manual.value);
    }
    const render = this.render?.preflightFrame(
      visualPosition,
      judgedThisFrame,
      deltaTimeSeconds,
      { currentBpm: this.music.currentBpm, launcherMusicPosition: this.music.launcherMusicPosition,
        adjustedMusicPosition: judgementPosition, adjustment: this.judgementAdjustValueB,
        forcePerfect: this.shouldForcePerfect, heldChains: new Set([...this.chainFinger]
          .filter(([, finger]) => this.fingers.get(finger)?.flashActive === true).map(([chain]) => chain)),
        missed: new Set(this.pendingJudgements.filter(entry => entry.missed).map(entry => entry.node.identity)) },
    ) ?? ok(null);
    if (render.status !== "ok") return rollback(render);
    if (this.shouldForcePerfect) {
      for (const node of judgedThisFrame) {
        const submitted = this.submitAuto(node);
        if (submitted.status !== "ok") {
          render.value?.discard();
          return rollback(submitted);
        }
      }
    }
    const submission = this.preflightPendingJudgementBatch();
    if (submission.status !== "ok") {
      render.value?.discard();
      return rollback(submission);
    }
    const participants: FrameMutationParticipant[] = [];
    if (submission.value !== null) participants.push(Object.freeze({
      identity: "product-one-frame",
      publishOwner: () => submission.value!.publishOwner(),
      discard: () => submission.value!.discard(),
    }));
    if (render.value !== null) participants.push(Object.freeze({
      identity: "product-render",
      commitExternal: () => render.value!.commitBackend(),
      publishOwner: () => render.value!.publishOwner(),
      discard: () => render.value!.discard(),
    }));
    participants.push(Object.freeze({
      identity: "product-timeline",
      publishOwner: () => {
        this.pendingManualFrame = null;
        return ok(undefined);
      },
      discard: () => {
        this.restoreMutableState(before);
        return ok(undefined);
      },
    }));
    const plan = FrameMutationPlan.create(
      participants,
      render.value === null ? [] : ["product-render"],
      ["product-one-frame", "product-render", "product-timeline"]
        .filter((identity) => participants.some((participant) => participant.identity === identity)),
    );
    if (plan.status !== "ok") {
      for (const participant of [...participants].reverse()) participant.discard();
      return rollback(plan);
    }
    const committed = plan.value.commit();
    return committed.status === "ok" ? committed : rollback(committed);
  }

  submitPendingJudgementBatch(): SimulatorResult<{
    readonly submitted: number;
    readonly remaining: number;
  }> {
    const planned = this.preflightPendingJudgementBatch();
    if (planned.status !== "ok") return planned;
    if (planned.value === null) {
      return ok(Object.freeze({
        submitted: 0,
        remaining: this.pendingJudgements.length,
      }));
    }
    const committed = planned.value.publishOwner();
    return committed.status === "ok"
      ? ok(Object.freeze({
          submitted: planned.value.submitted,
          remaining: planned.value.remaining,
        }))
      : committed;
  }

  preflightReflectJudgementBatch(
    batch: OneFrameJudgementBatch,
  ): SimulatorResult<ProductJudgementReflectTransaction | null> {
    if (!this.initialized || this.disposed || this.pendingReflectTransaction !== null ||
      batch === null || !Array.isArray(batch.entries)) {
      return rejected(
        "simulator.garupa-extension.invalid-reflect-preflight",
        "Product reflection requires one initialized owner, one OneFrame batch and no overlapping final-state transaction.",
      );
    }
    const reflected = this.inFlightJudgements.filter((pending) => batch.entries.some((entry) =>
      entry.noteIndex === pending.request.noteInformation.index &&
      entry.absolutePosition === pending.node.absolutePosition && entry.phase === "head"));
    if (reflected.length === 0) return ok(null);
    if (reflected.length !== this.inFlightJudgements.length || reflected.some((pending) =>
      batch.entries.filter((entry) => entry.noteIndex === pending.request.noteInformation.index &&
        entry.absolutePosition === pending.node.absolutePosition && entry.phase === "head").length !== 1)) {
      return rejected(
        "simulator.garupa-extension.reflect-source-mismatch",
        "Every in-flight product judgement must map exactly once into the same immutable OneFrame reflection batch.",
      );
    }
    let state: "pending" | "committed" | "discarded" = "pending";
    let transaction!: ProductJudgementReflectTransaction;
    transaction = Object.freeze({
      publishOwner: (): SimulatorResult<void> => {
        if (state !== "pending" || this.pendingReflectTransaction !== transaction) {
          return rejected("simulator.garupa-extension.repeated-reflect-publish", `Product reflection cannot publish from ${state}.`);
        }
        for (const entry of reflected) {
          const index = this.inFlightJudgements.indexOf(entry);
          if (index < 0) throw new Error("Product reflected source left its in-flight owner");
          this.inFlightJudgements.splice(index, 1);
          this.markJudged(entry.node, entry.missed);
        }
        state = "committed";
        this.pendingReflectTransaction = null;
        return ok(undefined);
      },
      discard: (): SimulatorResult<void> => {
        if (state !== "pending" || this.pendingReflectTransaction !== transaction) {
          return rejected("simulator.garupa-extension.repeated-reflect-discard", `Product reflection cannot discard from ${state}.`);
        }
        state = "discarded";
        this.pendingReflectTransaction = null;
        return ok(undefined);
      },
    });
    this.pendingReflectTransaction = transaction;
    return ok(transaction);
  }

  private preflightPendingJudgementBatch(): SimulatorResult<ProductJudgementSubmission | null> {
    if (!this.initialized || this.disposed) {
      return rejected(
        "simulator.garupa-extension.batch-outside-lifecycle",
        "Product OneFrame batches require one initialized non-disposed timeline owner.",
      );
    }
    if (this.pendingJudgements.length === 0) return ok(null);
    const capacity = this.oneFrame.availableCapacity();
    if (capacity === 0) return ok(null);
    const count = Math.min(capacity, 5, this.pendingJudgements.length);
    const entries = Object.freeze(this.pendingJudgements.slice(0, count));
    if (entries.some((entry) => entry.kind !== (this.shouldForcePerfect ? "auto" : "manual"))) {
      return rejected(
        "simulator.garupa-extension.mixed-product-batch",
        "One product session cannot mix Auto and Manual judgement requests in a bounded batch.",
      );
    }
    let transaction: OneFrameJudgementBatchTransaction;
    if (this.shouldForcePerfect) {
      const requests = entries.map((entry) =>
        (entry as Extract<PendingProductJudgement, { kind: "auto" }>).request);
      const planned = this.oneFrame.preflightAutoLiveJudgementBatch(requests);
      if (planned.status !== "ok") return planned;
      transaction = planned.value;
    } else {
      const requests = entries.map((entry) =>
        (entry as Extract<PendingProductJudgement, { kind: "manual" }>).request);
      const planned = this.oneFrame.preflightManualJudgementBatch(requests);
      if (planned.status !== "ok") return planned;
      transaction = planned.value;
    }
    let state: "pending" | "committed" | "discarded" = "pending";
    return ok(Object.freeze({
      submitted: count,
      remaining: this.pendingJudgements.length - count,
      publishOwner: (): SimulatorResult<void> => {
        if (state !== "pending") return rejected("simulator.garupa-extension.repeated-batch-publish", `Product batch cannot publish from ${state}.`);
        const committed = transaction.commit();
        if (committed.status !== "ok") return committed;
        const removed = this.pendingJudgements.splice(0, count);
        if (removed.some((entry, index) => entry !== entries[index])) {
          throw new Error("Product OneFrame publication lost its staged source order");
        }
        this.inFlightJudgements.push(...entries);
        state = "committed";
        return ok(undefined);
      },
      discard: (): SimulatorResult<void> => {
        if (state !== "pending") return rejected("simulator.garupa-extension.repeated-batch-discard", `Product batch cannot discard from ${state}.`);
        const discarded = transaction.discard();
        if (discarded.status === "ok") state = "discarded";
        return discarded;
      },
    }));
  }

  private processManualFrame(
    judgementPosition: number,
    deltaTimeSeconds: number,
  ): SimulatorResult<readonly GarupaProductNode[]> {
    const judged: GarupaProductNode[] = [];
    const frame = this.pendingManualFrame;
    if (frame !== null) {
      for (const touch of frame.touches) {
        const processed = this.processTouch(touch, frame.judgementPosition, frame.currentBpm, judged);
        if (processed.status !== "ok") return processed;
      }
    }
    for (const node of this.orderedVisibleNodes) {
      const source = node.scoringSource!;
      if (this.judgedSources.has(source) || this.missedSources.has(source) || this.queuedSources.has(source)) continue;
      const expired = this.advanceTimeout(node, judgementPosition, deltaTimeSeconds);
      if (expired.status !== "ok") return expired;
      if (expired.value === null) continue;
      const missed = this.submitManual(node, expired.value, JudgeTiming.None);
      if (missed.status !== "ok") return missed;
      if (expired.value === NoteResultType.Perfect) judged.push(node);
      if (node.chainIdentity !== null && expired.value === NoteResultType.Miss) {
        this.pendingHoldSounds.push({ ownerKey: `slide:${node.chainIdentity}`, action: "fade" });
        const finger = this.chainFinger.get(node.chainIdentity);
        const owner = finger === undefined ? undefined : this.fingers.get(finger);
        if (owner !== undefined) owner.flashActive = false;
      }
      this.advanceChain(node);
      this.clearPendingGesture(node);
    }
    return ok(Object.freeze(judged));
  }

  private advanceTimeout(node: GarupaProductNode, position: number, delta: number): SimulatorResult<0 | 4 | null> {
    const existing = this.timeouts.get(node.identity);
    if (position < node.absolutePosition && existing?.boundFlick !== true) {
      this.timeouts.delete(node.identity);
      return ok(null);
    }
    let state = existing ?? { seconds: 0, frames: 0, stopWait: 0, boundFlick: false };
    if (node.chainIdentity === null) {
      if (state.boundFlick) {
        state = { ...state, frames: Math.fround(state.frames + this.music.executeFrame) };
        this.timeouts.set(node.identity, state);
        return ok(state.frames >= 7 ? NoteResultType.Perfect : null);
      }
      state = { ...state, seconds: Math.fround(state.seconds + delta) };
      this.timeouts.set(node.identity, state);
      return ok(state.seconds > MANUAL_MISS_SECONDS ? NoteResultType.Miss : null);
    }
    const chain = this.chart.slideChains.find(chain => chain.identity === node.chainIdentity)!;
    const visibleIndex = chain.visibleConnectionIdentities.indexOf(node.identity);
    const nextId = chain.visibleConnectionIdentities[visibleIndex + 1];
    const next = nextId === undefined ? undefined : this.chart.nodeByIdentity.get(nextId)!;
    const head = visibleIndex === 0;
    const phase = this.render?.getSlideNodePhase(node) ?? null;
    if (!head && (phase !== "stop" || this.currentChainNode(node.chainIdentity) ===
        this.chart.nodeByIdentity.get(chain.visibleConnectionIdentities[0]!))) return ok(null);
    if (!head) {
      const wait = advanceSlideStopWait(state.stopWait, next !== undefined, this.judgementAdjustValueB);
      state = { ...state, stopWait: wait.counter };
      this.timeouts.set(node.identity, state);
      if (wait.waited) return ok(null);
      if (next === undefined && node.type === "Flick") {
        state = { ...state, frames: Math.fround(state.frames + this.music.executeFrame) };
        this.timeouts.set(node.identity, state);
        return ok(state.frames >= 7 ? NoteResultType.Miss : null);
      }
    }
    const over = isManualTimeoutOver(node.absolutePosition, position, this.music.currentBpm);
    if (over.status !== "ok") return over;
    const due = head ? slideHeadTimeoutDue(over.value, position, node.absolutePosition, next?.absolutePosition)
      : slideAfterTimeoutDue(over.value, position, node.absolutePosition, next === undefined, next?.absolutePosition,
        next !== undefined && this.render?.getSlideNodePhase(next) === "stop");
    return ok(due ? NoteResultType.Miss : null);
  }

  private processTouch(
    touch: ManualInputTouch,
    judgementPosition: number,
    currentBpm: number,
    judged: GarupaProductNode[],
  ): SimulatorResult<void> {
    if (this.originalHandledTouch(touch.fingerId) && !this.fingers.has(touch.fingerId)) return ok(undefined);
    if (touch.phase === ManualTouchPhase.Began) {
      if (this.fingers.has(touch.fingerId)) {
        return rejected("simulator.garupa-extension.duplicate-finger-began", "One product finger cannot Begin twice before Ended.");
      }
      const prepared = this.selectedCandidate?.(touch.fingerId);
      const candidate = prepared === undefined ? this.selectCandidate(touch.position, null)
        : ok(prepared === null ? null : this.chart.nodeByIdentity.get(prepared)!);
      if (candidate.status !== "ok") return candidate;
      if (candidate.value === null) return ok(undefined);
      const contact = this.judgeContact(candidate.value, judgementPosition, currentBpm);
      if (contact.status !== "ok") return contact;
      if (contact.value.result === NoteResultType.None) return ok(undefined);
      const owner: ProductFingerOwner = {
        fingerId: touch.fingerId,
        began: touch.position,
        last: touch.position,
        chainIdentity: candidate.value.chainIdentity,
        pendingGesture: null,
        gestureGrace: Math.fround(0),
        flashActive: true,
      };
      if (owner.chainIdentity !== null) {
        const existing = this.chainFinger.get(owner.chainIdentity);
        if (existing !== undefined) return ok(undefined);
        this.chainFinger.set(owner.chainIdentity, touch.fingerId);
      }
      this.fingers.set(touch.fingerId, owner);
      const consumed = this.consumeCandidate(owner, candidate.value, touch.position, judgementPosition, currentBpm, judged, true);
      if (consumed.status === "ok" && owner.chainIdentity !== null &&
          this.chainFinger.get(owner.chainIdentity) === owner.fingerId) {
        this.pendingHoldSounds.push({ ownerKey: `slide:${owner.chainIdentity}`, action: "start" });
      }
      return consumed;
    }

    const owner = this.fingers.get(touch.fingerId);
    if (owner === undefined) return ok(undefined);
    owner.last = touch.position;
    if (touch.phase === ManualTouchPhase.Ended) {
      if (owner.chainIdentity !== null) {
        const node = this.currentChainNode(owner.chainIdentity);
        if (node !== null) {
          let result: Exclude<NoteResultTypeValue, -1> = NoteResultType.Miss;
          let timing: JudgeTimingValue = JudgeTiming.None;
          const chain = this.chart.slideChains.find(chain => chain.identity === owner.chainIdentity)!;
          if (node.identity === chain.visibleConnectionIdentities[chain.visibleConnectionIdentities.length - 1] &&
              (node.type === "Single" || node.type === "Skill")) {
            const inside = this.scene!.isInsideContinuousSpan(touch.position, node.spanStart, node.width);
            if (inside.status !== "ok") return inside;
            if (inside.value) {
              const contact = this.judgeContact(node, judgementPosition, currentBpm);
              if (contact.status !== "ok") return contact;
              if (contact.value.result !== NoteResultType.None) {
                result = contact.value.result;
                timing = contact.value.timing;
              }
            }
          }
          const submitted = this.submitManual(node, result, timing);
          if (submitted.status !== "ok") return submitted;
          if (result !== NoteResultType.Miss) judged.push(node);
          this.advanceChain(node);
        }
      }
      this.releaseFinger(owner);
      return ok(undefined);
    }
    if (owner.pendingGesture !== null) {
      return this.consumeGesture(owner, touch.position, judgementPosition, currentBpm, judged);
    }
    if (owner.chainIdentity === null) return ok(undefined);
    const candidate = this.currentChainNode(owner.chainIdentity);
    if (candidate === null) {
      this.releaseFinger(owner);
      return ok(undefined);
    }
    const inside = this.scene!.isInsideContinuousSpan(touch.position, candidate.spanStart, candidate.width);
    if (inside.status !== "ok") return inside;
    if (!inside.value && candidate.type !== "Flick" && candidate.type !== "Directional") return ok(undefined);
    return this.consumeCandidate(owner, candidate, touch.position, judgementPosition, currentBpm, judged);
  }

  private consumeCandidate(
    owner: ProductFingerOwner,
    node: GarupaProductNode,
    position: ManualInputPosition,
    judgementPosition: number,
    currentBpm: number,
    judged: GarupaProductNode[],
    began = false,
  ): SimulatorResult<void> {
    const timing = this.judgeContact(node, judgementPosition, currentBpm);
    if (timing.status !== "ok" || timing.value.result === NoteResultType.None) {
      return timing.status === "ok" ? ok(undefined) : timing;
    }
    if (node.type === "Flick" || node.type === "Directional") {
      if (node.chainIdentity === null) this.timeouts.set(node.identity,
        { seconds: 0, frames: 0, stopWait: 0, boundFlick: true });
      owner.pendingGesture = Object.freeze({
        node,
        origin: began ? position : owner.began,
        result: timing.value.result as Exclude<NoteResultTypeValue, -1>,
        timing: timing.value.timing,
      });
      return began ? ok(undefined) : this.consumeGesture(owner, position, judgementPosition, currentBpm, judged);
    }
    if (!began && timing.value.slide !== null &&
        slideHeldNodeResult(timing.value.slide, this.judgementAdjustValueB) === NoteResultType.None) {
      return ok(undefined);
    }
    const submitted = this.submitManual(
      node,
      !began && timing.value.slide !== null ? NoteResultType.Perfect : timing.value.result,
      !began && timing.value.slide !== null ? JudgeTiming.None : timing.value.timing,
    );
    if (submitted.status !== "ok") return submitted;
    judged.push(node);
    this.advanceChain(node);
    if (owner.chainIdentity === null) {
      this.releaseFinger(owner);
      return ok(undefined);
    }
    return this.consumeEqualPositionChainNodes(owner, position, judgementPosition, currentBpm, judged);
  }

  private consumeGesture(owner: ProductFingerOwner, position: ManualInputPosition,
    judgementPosition: number, currentBpm: number, judged: GarupaProductNode[]): SimulatorResult<void> {
    let pending = owner.pendingGesture!;
    if (owner.chainIdentity !== null) {
      const contact = this.judgeContact(pending.node, judgementPosition, currentBpm);
      if (contact.status !== "ok") return contact;
      const inside = this.scene!.isInsideContinuousSpan(position, pending.node.spanStart, pending.node.width);
      if (inside.status !== "ok") return inside;
      const decision = contact.value.slide;
      if (decision === null) return ok(undefined);
      const next = advanceSlideGestureContact(decision, inside.value, owner.gestureGrace,
        this.music.executeFrame, pending.origin, position);
      owner.gestureGrace = next.grace;
      owner.pendingGesture = Object.freeze({ ...pending, origin: next.origin! });
      if (!next.ready || decision.result === NoteResultType.None) return ok(undefined);
      pending = Object.freeze({ ...pending,
        result: this.judgementAdjustValueB >= 1 ? NoteResultType.Perfect : decision.result,
        timing: JudgeTiming.None,
      });
      owner.pendingGesture = pending;
      if (owner.gestureGrace <= 0) return ok(undefined);
    }
    const gesture = gestureSucceeded(this.manualGeometry!, pending, position);
    if (gesture.status !== "ok" || !gesture.value) return gesture.status === "ok" ? ok(undefined) : gesture;
    const submitted = this.submitManual(pending.node, pending.result, pending.timing);
    if (submitted.status !== "ok") return submitted;
    judged.push(pending.node);
    owner.pendingGesture = null;
    owner.gestureGrace = Math.fround(0);
    this.advanceChain(pending.node);
    if (owner.chainIdentity === null) this.releaseFinger(owner);
    return ok(undefined);
  }

  private consumeEqualPositionChainNodes(
    owner: ProductFingerOwner,
    position: ManualInputPosition,
    judgementPosition: number,
    currentBpm: number,
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
        const timing = this.judgeContact(next, judgementPosition, currentBpm);
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
      const consumed = this.consumeCandidate(owner, next, position, judgementPosition, currentBpm, judged);
      return consumed;
    }
    return ok(undefined);
  }

  private selectCandidate(
    position: ManualInputPosition,
    chainIdentity: string | null,
  ): SimulatorResult<GarupaProductNode | null> {
    const domains = this.selectCandidateDomains(position, chainIdentity);
    if (domains.status !== "ok") return domains;
    const { ordinary, slide } = domains.value;
    if (ordinary === null) return ok(slide);
    if (slide === null) return ok(ordinary);
    const selected = this.slideJudge.selectNearJudgeLineSource(
      this.render!.getInputPositionY(ordinary)!, this.render!.getInputPositionY(slide)!);
    return selected.status === "ok" ? ok(selected.value === "first" ? ordinary : slide) : selected;
  }

  private selectCandidateDomains(position: ManualInputPosition, chainIdentity: string | null,
    reserved?: ReadonlySet<string>): SimulatorResult<{ ordinary: GarupaProductNode | null; slide: GarupaProductNode | null }> {
    let ordinary: GarupaProductNode | null = null;
    let slide: GarupaProductNode | null = null;
    const musicPosition = this.pendingManualFrame?.musicPosition ?? this.music.musicPosition;
    const nearest = (first: GarupaProductNode, second: GarupaProductNode) =>
      this.slideJudge.selectNearJudgeLineSource(this.render!.getInputPositionY(first)!, this.render!.getInputPositionY(second)!);
    for (const node of this.orderedVisibleNodes) {
      const source = node.scoringSource!;
      if (this.judgedSources.has(source) || this.missedSources.has(source) || this.queuedSources.has(source)) continue;
      if (reserved?.has(node.chainIdentity ?? node.identity)) continue;
      if (this.timeouts.get(node.identity)?.boundFlick === true || this.render?.getInputPositionY(node) == null) continue;
      if (chainIdentity === null) {
        if (node.chainIdentity !== null && this.currentChainNode(node.chainIdentity) !== node) continue;
        if (node.chainIdentity !== null && this.chainFinger.has(node.chainIdentity)) continue;
      } else if (node.chainIdentity !== chainIdentity || this.currentChainNode(chainIdentity) !== node) continue;
      const inside = this.scene!.isInsideContinuousSpan(position, node.spanStart, node.width);
      if (inside.status !== "ok") return inside;
      if (!inside.value) continue;
      if (node.chainIdentity === null) {
        if (ordinary === null || Math.abs(Math.fround(node.absolutePosition - musicPosition)) <
            Math.abs(Math.fround(ordinary.absolutePosition - musicPosition))) ordinary = node;
      } else if (slide === null) slide = node;
      else {
        const selected = nearest(slide, node);
        if (selected.status !== "ok") return selected;
        if (selected.value === "second") slide = node;
      }
    }
    return ok({ ordinary, slide });
  }

  arbitrateBegan(ordinary: NoteBase | null, slide: NoteBase | null, position: ManualInputPosition,
    projection: ManualCandidateExtensionFrame, fingerId: number,
    readOriginal: (note: NoteBase) => { source: NoteInformation; y: number | undefined } | null
  ): SimulatorResult<NoteBase | null> {
    projection.selected.set(fingerId, null);
    const product = this.selectCandidateDomains(position, null, projection.reserved);
    if (product.status !== "ok") return product;
    type Candidate = { original: NoteBase | null; node: GarupaProductNode | null; absolutePosition: number; y: number | undefined };
    const native = (note: NoteBase | null): Candidate | null => {
      if (note === null) return null;
      const view = readOriginal(note);
      return view === null ? null : { original: note, node: null, absolutePosition: view.source.absolutePos, y: view.y };
    };
    const extended = (node: GarupaProductNode | null): Candidate | null => node === null ? null
      : { original: null, node, absolutePosition: node.absolutePosition, y: this.render!.getInputPositionY(node)! };
    const originalNormal = native(ordinary), originalSlide = native(slide);
    if (ordinary !== null && originalNormal === null || slide !== null && originalSlide === null) {
      return rejected("manual.candidate-button-owner-unavailable",
        "Unified input arbitration requires each original candidate's committed presentation.");
    }
    const extendedNormal = extended(product.value.ordinary), extendedSlide = extended(product.value.slide);
    const nearest = (first: Candidate | null, second: Candidate | null): SimulatorResult<Candidate | null> => {
      if (first === null) return ok(second);
      if (second === null) return ok(first);
      if (first.y === undefined || second.y === undefined) return rejected("manual.candidate-button-owner-unavailable",
        "Near-line arbitration requires both candidates' committed local positions.");
      const selected = this.slideJudge.selectNearJudgeLineSource(first.y, second.y);
      return selected.status === "ok" ? ok(selected.value === "first" ? first : second) : selected;
    };
    const music = this.pendingManualFrame?.musicPosition ?? this.music.musicPosition;
    const normal = originalNormal === null ? extendedNormal : extendedNormal === null ? originalNormal
      : Math.abs(Math.fround(extendedNormal.absolutePosition - music)) < Math.abs(Math.fround(originalNormal.absolutePosition - music))
        ? extendedNormal : originalNormal;
    const selectedSlide = nearest(originalSlide, extendedSlide);
    if (selectedSlide.status !== "ok") return selectedSlide;
    const selected = nearest(normal, selectedSlide.value);
    if (selected.status !== "ok") return selected;
    if (selected.value === null || selected.value.original !== null) return ok(selected.value?.original ?? null);
    const node = selected.value.node!;
    projection.selected.set(fingerId, node.identity);
    const contact = this.judgeContact(node, this.pendingManualFrame?.judgementPosition ??
      this.music.getAdjustedMusicPosition(this.judgementAdjustValueB), this.pendingManualFrame?.currentBpm ?? this.music.currentBpm);
    if (contact.status !== "ok") return contact;
    if (contact.value.result !== NoteResultType.None) projection.reserved.add(node.chainIdentity ?? node.identity);
    return ok(null);
  }

  private judgeNode(node: GarupaProductNode, currentPosition: number, currentBpm = this.music.currentBpm) {
    return judgeManualNote(
      0,
      Math.fround(node.absolutePosition),
      Math.fround(currentPosition),
      currentBpm,
    );
  }

  private judgeContact(node: GarupaProductNode, currentPosition: number, currentBpm: number): SimulatorResult<{
    readonly result: NoteResultTypeValue;
    readonly timing: JudgeTimingValue;
    readonly slide: SlideJudgeDecision | null;
  }> {
    if (node.chainIdentity === null) {
      const judged = this.judgeNode(node, currentPosition, currentBpm);
      return judged.status === "ok" ? ok({ ...judged.value, slide: null }) : judged;
    }
    const position = this.render?.getSlideJudgePosition(node) ?? null;
    if (position === null) return ok({ result: NoteResultType.None, timing: JudgeTiming.None, slide: null });
    const judged = this.slideJudge.judge(node.scoringSource!, position);
    return judged.status === "ok" ? ok({
      result: judged.value.result,
      timing: judged.value.result === NoteResultType.Perfect || judged.value.correction <= 0
        ? JudgeTiming.None : JudgeTiming.Fast,
      slide: judged.value,
    }) : judged;
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
    this.timeouts.delete(node.identity);
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
      if (owner.pendingGesture?.node === node) {
        owner.pendingGesture = null;
        if (owner.chainIdentity === null) this.releaseFinger(owner);
      }
    }
  }

  private releaseFinger(owner: ProductFingerOwner): void {
    this.fingers.delete(owner.fingerId);
    if (owner.chainIdentity !== null && this.chainFinger.get(owner.chainIdentity) === owner.fingerId) {
      this.pendingHoldSounds.push({ ownerKey: `slide:${owner.chainIdentity}`, action: "fade" });
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

  commitDispose(): void {
    this.timeouts.clear();
    this.slideJudge.dispose();
    this.render?.releaseInputs();
    this.pendingManualFrame = null;
    this.pendingJudgements.length = 0;
    this.pendingHoldSounds.length = 0;
    this.inFlightJudgements.length = 0;
    this.pendingReflectTransaction = null;
    this.judgedSources.clear();
    this.missedSources.clear();
    this.queuedSources.clear();
    this.fingers.clear();
    this.chainFinger.clear();
    this.initialized = false;
    this.disposed = true;
  }

  private captureMutableState(): ProductTimelineMutableSnapshot {
    return Object.freeze({
      timeouts: Object.freeze([...this.timeouts]),
      holdSounds: [...this.pendingHoldSounds],
      judgedSources: Object.freeze([...this.judgedSources]),
      missedSources: Object.freeze([...this.missedSources]),
      queuedSources: Object.freeze([...this.queuedSources]),
      fingers: Object.freeze([...this.fingers].map(([fingerId, owner]) => Object.freeze([
        fingerId,
        cloneFingerOwner(owner),
      ] as const))),
      chainFinger: Object.freeze([...this.chainFinger].map((entry) => Object.freeze([...entry] as const))),
      nextVisibleIndexByChain: Object.freeze([...this.nextVisibleIndexByChain].map((entry) => Object.freeze([...entry] as const))),
      pendingManualFrame: this.pendingManualFrame,
      pendingJudgements: Object.freeze([...this.pendingJudgements]),
      inFlightJudgements: Object.freeze([...this.inFlightJudgements]),
      judgedNodeCount: this.judgedNodeCount,
      missedNodeCount: this.missedNodeCount,
      nextAutoIndex: this.nextAutoIndex,
    });
  }

  private restoreMutableState(snapshot: ProductTimelineMutableSnapshot): void {
    this.timeouts.clear();
    for (const [identity, state] of snapshot.timeouts) this.timeouts.set(identity, state);
    this.pendingHoldSounds.splice(0, this.pendingHoldSounds.length, ...snapshot.holdSounds);
    replaceSet(this.judgedSources, snapshot.judgedSources);
    replaceSet(this.missedSources, snapshot.missedSources);
    replaceSet(this.queuedSources, snapshot.queuedSources);
    this.fingers.clear();
    for (const [fingerId, owner] of snapshot.fingers) this.fingers.set(fingerId, cloneFingerOwner(owner));
    this.chainFinger.clear();
    for (const [identity, fingerId] of snapshot.chainFinger) this.chainFinger.set(identity, fingerId);
    this.nextVisibleIndexByChain.clear();
    for (const [identity, index] of snapshot.nextVisibleIndexByChain) this.nextVisibleIndexByChain.set(identity, index);
    this.pendingManualFrame = snapshot.pendingManualFrame;
    this.pendingJudgements.splice(0, this.pendingJudgements.length, ...snapshot.pendingJudgements);
    this.inFlightJudgements.splice(0, this.inFlightJudgements.length, ...snapshot.inFlightJudgements);
    this.pendingReflectTransaction = null;
    this.judgedNodeCount = snapshot.judgedNodeCount;
    this.missedNodeCount = snapshot.missedNodeCount;
    this.nextAutoIndex = snapshot.nextAutoIndex;
  }

  snapshot(): GarupaProductTimelineSnapshot {
    return Object.freeze({
      kind: "note-extensions" as const,
      visibleNodeCount: this.orderedVisibleNodes.length,
      judgedNodeCount: this.judgedNodeCount,
      missedNodeCount: this.missedNodeCount,
      nextAutoIndex: this.nextAutoIndex,
      activeFingerCount: this.fingers.size,
      pendingJudgementCount: this.pendingJudgements.length + this.inFlightJudgements.length,
      render: this.render?.snapshot() ?? null,
    });
  }
}

function cloneFingerOwner(owner: ProductFingerOwner): ProductFingerOwner {
  return {
    fingerId: owner.fingerId,
    began: Object.freeze({ ...owner.began }),
    last: Object.freeze({ ...owner.last }),
    chainIdentity: owner.chainIdentity,
    gestureGrace: owner.gestureGrace,
    flashActive: owner.flashActive,
    pendingGesture: owner.pendingGesture === null
      ? null
      : Object.freeze({
          ...owner.pendingGesture,
          origin: Object.freeze({ ...owner.pendingGesture.origin }),
        }),
  };
}

function replaceSet<T>(target: Set<T>, values: readonly T[]): void {
  target.clear();
  for (const value of values) target.add(value);
}

function productJudgeNoteType(node: GarupaProductNode): number {
  if (node.type === "Flick") return 3;
  if (node.type === "Directional") return 9;
  return 0;
}

function gestureSucceeded(
  geometry: SimulatorManualInputGeometryBackend,
  pending: PendingGesture,
  current: ManualInputPosition,
): SimulatorResult<boolean> {
  const directional = pending.node.type === "Directional";
  if (directional && !(pending.node.direction === "Left" ? current.x < pending.origin.x : current.x > pending.origin.x)) {
    return ok(false);
  }

  const rate = getManualScreenDistanceRate(geometry, {
    beganPosition: pending.origin, currentPosition: current, horizontalOnly: directional,
  });
  if (rate.status !== "ok") return rate;
  if (rate.value <= Math.fround(directional ? 0.01 : 0.04)) return ok(false);
  if (!directional || pending.node.width <= 1) return ok(true);
  const full = getManualScreenDistanceRate(geometry, {
    beganPosition: pending.origin, currentPosition: current, horizontalOnly: false,
  });
  return full.status === "ok" ? ok(full.value > directionalGestureThreshold(pending.node.width)) : full;
}

function rejected<T>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}
