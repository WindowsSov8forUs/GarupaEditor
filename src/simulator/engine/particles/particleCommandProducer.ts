import type {
  ParticleCommand,
  ParticleInstanceIdentity,
  ParticleOwnerTransform,
  ParticlePixiSceneProfile,
  ParticleRootId,
} from "../../backends/particleContracts";
import {
  particleFloat32FromBits,
  particleFloat32ToBits,
} from "../../backends/particleValidation";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../chart/types";
import type { OneFrameJudgementBatch, OneFrameJudgementEntry } from "../data/oneFrameData";
import { NoteResultType, type NoteResultTypeValue } from "../data/manualJudgement";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import {
  getGarupaProductChartProfile,
  type GarupaProductNode,
} from "../garupa/productChartProfile";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import {
  isTapKeepStartJudgeNoteType,
  isTapKeepStopJudgeNoteType,
  resolveParticleDirectionalFingerRoot,
  resolveParticleJudgementRoot,
} from "./particleRouteResolver";

interface TapKeepOwner {
  readonly ownerKey: string;
  readonly instance: ParticleInstanceIdentity;
  readonly rangeLength: number;
}

interface SlideSemanticIdentity {
  readonly noteIndex: number;
  readonly absolutePosition: number;
}

interface MutableParticleOwnerState {
  readonly buttonTapKeep: Map<number, Map<number, TapKeepOwner>>;
  readonly slideTapKeep: Map<string, TapKeepOwner>;
  slidePoolCursor: number;
  suppressedUntilReplay: boolean;
  terminal: boolean;
  disposed: boolean;
}

export interface ParticleCommandProducerSnapshot {
  readonly suppressedUntilReplay: boolean;
  readonly terminal: boolean;
  readonly disposed: boolean;
  readonly activeButtonTapKeepOwners: readonly {
    readonly buttonType: number;
    readonly rangeLength: number;
    readonly ownerKey: string;
  }[];
  readonly slidePoolCursor: number;
  readonly activeSlideTapKeepOwners: readonly {
    readonly noteIndex: number;
    readonly absolutePosition: number;
    readonly rangeLength: number;
    readonly ownerKey: string;
  }[];
}

export class ParticleCommandOwnerTransaction {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    readonly commands: readonly ParticleCommand[],
    private readonly onCommit: () => void,
    private readonly onDiscard: () => void,
  ) {}

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return rejected(
        "particle.producer.transaction-repeated-commit",
        `A particle owner transaction cannot commit from ${this.state}.`,
      );
    }
    this.state = "committed";
    this.onCommit();
    return ok(undefined);
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return rejected(
        "particle.producer.transaction-repeated-discard",
        `A particle owner transaction cannot discard from ${this.state}.`,
      );
    }
    this.state = "discarded";
    this.onDiscard();
    return ok(undefined);
  }
}

export class ParticleCommandProducer {
  private readonly notesByIndex = new Map<number, NoteInformation>();
  private readonly ambiguousNoteIndices = new Set<number>();
  private readonly notesByJudgementKey = new Map<string, NoteInformation[]>();
  private readonly slideRootByNode = new WeakMap<NoteInformation, NoteInformation>();
  private readonly registeredNotes = new WeakSet<NoteInformation>();
  private readonly productScoringKeys = new Set<string>();
  private readonly productScoringNodes = new Map<string, GarupaProductNode>();
  private readonly productSlideNodesByIdentity = new Map<string, readonly GarupaProductNode[]>();
  private chartIdentityValid = true;
  private state = createEmptyState();
  private pending: ParticleCommandOwnerTransaction | null = null;

  constructor(
    chart: ChartConstructionResult,
    private readonly isAutoPlay = false,
    private readonly productScene: GarupaProductSceneLayout | null = null,
    private readonly particleScene: ParticlePixiSceneProfile | null = null,
  ) {
    if (chart === null || typeof chart !== "object" || !Array.isArray(chart.noteBatches)) {
      this.chartIdentityValid = false;
      return;
    }
    for (const batch of chart.noteBatches) {
      for (const note of batch.informationList) this.registerNote(note, null);
    }
    const product = getGarupaProductChartProfile(chart);
    if (product?.route === "product-extension") {
      for (const chain of product.slideChains) {
        const nodes = chain.visibleConnectionIdentities.map((identity) => product.nodeByIdentity.get(identity)!);
        for (const node of nodes) this.productSlideNodesByIdentity.set(node.identity, Object.freeze(nodes));
      }
      for (const node of product.visibleNodes) {
        if (node.scoringSource !== null) {
          const key = productScoringKey(
            node.scoringSource.index,
            node.absolutePosition,
          );
          if (this.productScoringKeys.has(key) && this.productScoringNodes.get(key) !== node) {
            this.chartIdentityValid = false;
            continue;
          }
          this.productScoringKeys.add(key);
          this.productScoringNodes.set(key, node);
        }
      }
    }
  }

  validate(): SimulatorResult<void> {
    if (!this.chartIdentityValid) {
      return rejected(
        "particle.producer.invalid-chart-identity",
        "Particle ownership requires complete chart-semantic judgement keys; source note indices are not treated as globally unique identities.",
      );
    }
    return validOwnerScene(this.particleScene)
      ? ok(undefined)
      : rejected(
          "particle.producer.native-owner-scene-required",
          "Production particle ownership requires exact GamePlayButton transforms and the current eight-slot NoteSlide pool profile; nullable renderer reconstruction is forbidden.",
        );
  }

  preflightJudgement(
    batch: OneFrameJudgementBatch,
    terminalAfter: "game-over" | null = null,
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable();
    if (available.status !== "ok") return available;
    if (!isJudgementBatchShape(batch, this.productScoringKeys)) {
      return rejected(
        "particle.producer.invalid-judgement-batch",
        `Judgement particle routing consumes one immutable owner-produced OneFrame batch. ${describeInvalidJudgementBatch(batch, this.productScoringKeys)}`,
      );
    }
    const projected = cloneState(this.state);
    const commands: ParticleCommand[] = [];
    if (!projected.suppressedUntilReplay) {
      for (const entry of batch.entries) {
        const productKey = productScoringKey(
          entry.noteIndex,
          entry.absolutePosition,
        );
        if (this.productScoringKeys.has(productKey)) {
          const node = this.productScoringNodes.get(productKey);
          if (node === undefined) {
            return rejected(
              "particle.producer.missing-product-node-owner",
              "A registered product scoring key must retain its exact immutable chart node owner.",
            );
          }
          const slideLifecycle = this.routeProductSlideTapKeep(node, entry, projected, commands);
          if (slideLifecycle.status !== "ok") return slideLifecycle;
          const routed = compatibleProductParticleRoot(node, entry.adjustedResult);
          if (routed !== null) {
            const buttonType = compatibleProductParticleButton(node)!;
            const rangeLength = routed.startsWith("directional:") ? null : node.width;
            commands.push(playRoot(
              buttonParticleOwnerKey(buttonType, routed, rangeLength),
              buttonInstance(buttonType, rangeLength, this.particleScene!),
              routed,
            ));
            const fingerRoot = compatibleProductDirectionalFingerRoot(node, entry.adjustedResult);
            if (fingerRoot !== null) {
              commands.push(playRoot(
                buttonParticleOwnerKey(buttonType, fingerRoot, null),
                buttonInstance(buttonType, null, this.particleScene!),
                fingerRoot,
              ));
            }
          }
          continue;
        }
        const resolvedNote = this.resolveJudgementNote(entry);
        if (resolvedNote.status !== "ok") return resolvedNote;
        const note = resolvedNote.value;
        const buttonType = targetCenterButtonType(note);
        if (buttonType === null || !entry.buttonTypes.includes(buttonType) ||
          entry.buttonTypes.length < 1 || entry.buttonTypes.length > 7) {
          return rejected(
            "particle.producer.invalid-button-owner",
            "The particle receiver and range must come from the judged note's target-center GamePlayButton owner and current 1..7 button span.",
          );
        }
        if (isTapKeepStopJudgeNoteType(entry.noteType)) {
          stopButtonTapKeep(buttonType, projected, commands);
        }
        if (isTapKeepStartJudgeNoteType(entry.noteType) ||
          (note.fireNoteType === FrontNoteType.Long && entry.phase === "head" && entry.adjustedResult > 0)) {
          playButtonTapKeep(buttonType, entry.buttonTypes.length, this.particleScene!, projected, commands);
        }
        const slideRoot = this.slideRootByNode.get(note);
        if (slideRoot !== undefined && entry.phase === "tail") {
          stopSlideTapKeep(slideIdentity(slideRoot), projected, commands);
        } else if (slideRoot !== undefined && entry.adjustedResult > 0) {
          const target = nextOriginalSlideTarget(slideRoot, note, entry.phase);
          if (target !== null) {
            const targetButton = targetCenterButtonType(target);
            const targetRange = target.buttonTypesArray.length;
            if (targetButton === null || !isRangeLength(targetRange)) {
              return rejected(
                "particle.producer.invalid-slide-current-node",
                "Slide tap-keep movement requires the exact current after-node target-center button and 1..7 range.",
              );
            }
            const identity = slideIdentity(slideRoot);
            const transform = originalSlideTransform(targetButton, this.particleScene!);
            if (entry.phase === "head") {
              playSlideTapKeep(
                identity, targetButton, targetRange, transform,
                "original", this.particleScene!, projected, commands,
              );
            } else {
              moveSlideTapKeep(
                identity, targetButton, targetRange, transform,
                "original", this.particleScene!, projected, commands,
              );
            }
          }
        }
        const routed = resolveParticleJudgementRoot({
          result: entry.adjustedResult,
          judgeNoteType: entry.noteType,
          gameNoteType: judgementGameNoteType(note, entry),
          isSkillNote: isSkillEntry(note, entry),
          multipleDirectionalFlickNoteCount: entry.multipleDirectionalFlickNoteCount,
          rangeLength: entry.buttonTypes.length,
        });
        if (routed.status !== "ok") return routed;
        if (routed.value !== null) {
          const rangeLength = routed.value.startsWith("directional:")
            ? null
            : entry.buttonTypes.length;
          commands.push(playRoot(
            buttonParticleOwnerKey(buttonType, routed.value, rangeLength),
            buttonInstance(buttonType, rangeLength, this.particleScene!),
            routed.value,
          ));
        }
        if (isDirectionalJudgeNoteType(entry.noteType) && entry.adjustedResult >= NoteResultType.Good) {
          const fingerRoot = resolveParticleDirectionalFingerRoot({
            afterNoteType: entry.phase === "tail" ? note.afterNoteType : AfterNoteType.None,
            gameNoteType: judgementGameNoteType(note, entry),
          });
          if (fingerRoot.status !== "ok") return fingerRoot;
          const fingerButton = directionalFingerButtonType(
            buttonType,
            entry.buttonTypes,
            fingerRoot.value,
            this.isAutoPlay,
            entry.multipleDirectionalFlickNoteCount,
          );
          commands.push(playRoot(
            buttonParticleOwnerKey(fingerButton, fingerRoot.value, null),
            buttonInstance(fingerButton, null, this.particleScene!),
            fingerRoot.value,
          ));
        }
      }
    }
    if (terminalAfter !== null) {
      commands.push(Object.freeze({ kind: "clear-all", reason: terminalAfter }));
      projected.buttonTapKeep.clear();
      projected.slideTapKeep.clear();
      projected.terminal = true;
    }
    return this.stage(commands, projected);
  }

  preflightButtonTapKeepStart(
    buttonType: number,
    rangeLength: number,
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable();
    if (available.status !== "ok") return available;
    if (!isButtonType(buttonType) || !isRangeLength(rangeLength)) {
      return rejected(
        "particle.producer.invalid-button-tap-keep-owner",
        "GamePlayButton TapKeep Play requires an engine-owned button and current 1..7 range.",
      );
    }
    const projected = cloneState(this.state);
    if (projected.suppressedUntilReplay) return this.stage([], projected);
    const commands: ParticleCommand[] = [];
    playButtonTapKeep(buttonType, rangeLength, this.particleScene!, projected, commands);
    return this.stage(commands, projected);
  }

  preflightButtonTapKeepStop(
    buttonType: number,
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable();
    if (available.status !== "ok") return available;
    if (!isButtonType(buttonType)) {
      return rejected(
        "particle.producer.invalid-button-tap-keep-stop-owner",
        "GamePlayButton TapKeep Stop requires an engine-owned button identity.",
      );
    }
    const projected = cloneState(this.state);
    const commands: ParticleCommand[] = [];
    stopButtonTapKeep(buttonType, projected, commands);
    return this.stage(commands, projected);
  }

  preflightSlideTapKeepStart(
    noteIndex: number,
    buttonType: number,
    rangeLength: number,
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable();
    if (available.status !== "ok") return available;
    const note = this.ambiguousNoteIndices.has(noteIndex) ? undefined : this.notesByIndex.get(noteIndex);
    if (note === undefined ||
      (note.fireNoteType !== FrontNoteType.SlideA && note.fireNoteType !== FrontNoteType.SlideB) ||
      !isButtonType(buttonType) || !isRangeLength(rangeLength)) {
      return rejected(
        "particle.producer.invalid-slide-tap-keep-owner",
        "Pooled Slide TapKeep Play requires a production chart note identity and current 1..7 range.",
      );
    }
    const projected = cloneState(this.state);
    if (projected.suppressedUntilReplay) return this.stage([], projected);
    const commands: ParticleCommand[] = [];
    playSlideTapKeep(
      slideIdentity(note), buttonType, rangeLength,
      originalSlideTransform(buttonType, this.particleScene!),
      "original", this.particleScene!, projected, commands,
    );
    return this.stage(commands, projected);
  }

  preflightSlideTapKeepStop(
    noteIndex: number,
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable();
    if (available.status !== "ok") return available;
    const active = [...this.state.slideTapKeep]
      .filter(([, owner]) => owner.instance.kind === "note-slide" && owner.instance.noteIndex === noteIndex);
    if (!Number.isSafeInteger(noteIndex) || noteIndex < 0 || active.length !== 1 ||
      active[0]![1].instance.kind !== "note-slide") {
      return rejected(
        "particle.producer.invalid-slide-tap-keep-stop-owner",
        "Pooled Slide TapKeep Stop requires one unambiguous active production chart identity.",
      );
    }
    const projected = cloneState(this.state);
    const commands: ParticleCommand[] = [];
    stopSlideTapKeep({
      noteIndex,
      absolutePosition: active[0]![1].instance.absolutePosition,
    }, projected, commands);
    return this.stage(commands, projected);
  }

  preflightMoveTime(): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable();
    if (available.status !== "ok") return available;
    if (this.state.suppressedUntilReplay) {
      return rejected(
        "particle.producer.duplicate-movetime",
        "MoveTime suppression is entered once and can end only through whole-engine checkpoint/replay reconstruction.",
      );
    }
    const projected = createEmptyState();
    projected.suppressedUntilReplay = true;
    return this.stage([
      Object.freeze({ kind: "clear-all", reason: "movetime" }),
      Object.freeze({ kind: "suppress-until-replay", reason: "movetime" }),
    ], projected);
  }

  preflightReturnTime(): SimulatorResult<never> {
    return rejected(
      "particle.producer.particle-only-return-time-forbidden",
      "ReturnTime requires whole-engine checkpoint/replay and cannot mutate the particle producer alone.",
    );
  }

  preflightTerminal(
    reason: "game-over" | "natural-end",
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable(false);
    if (available.status !== "ok") return available;
    if (this.state.terminal) {
      return rejected(
        "particle.producer.duplicate-terminal",
        "A particle session publishes one terminal Clear-all and final empty sample.",
      );
    }
    const projected = createEmptyState();
    projected.terminal = true;
    return this.stage([Object.freeze({ kind: "clear-all", reason })], projected);
  }

  preflightSessionReplacement(
    reason: "retry" | "reset",
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable(false);
    if (available.status !== "ok") return available;
    if (this.state.terminal) {
      return rejected(
        "particle.producer.duplicate-session-replacement",
        "Retry/reset cleanup is authored once before a fresh producer and fixed random session are constructed.",
      );
    }
    const projected = createEmptyState();
    projected.terminal = true;
    return this.stage([Object.freeze({ kind: "clear-all", reason })], projected);
  }

  preflightDispose(): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable(false);
    if (available.status !== "ok") return available;
    const projected = cloneState(this.state);
    projected.buttonTapKeep.clear();
    projected.slideTapKeep.clear();
    projected.terminal = true;
    projected.disposed = true;
    return this.stage(this.state.disposed || this.state.terminal || this.state.suppressedUntilReplay
      ? []
      : [Object.freeze({ kind: "clear-all", reason: "dispose" })], projected);
  }

  snapshot(): ParticleCommandProducerSnapshot {
    const activeButtonTapKeepOwners = [...this.state.buttonTapKeep]
      .flatMap(([buttonType, owners]) => [...owners.values()].map((owner) => ({
        buttonType,
        rangeLength: owner.rangeLength,
        ownerKey: owner.ownerKey,
      })))
      .sort((left, right) => left.buttonType - right.buttonType || left.rangeLength - right.rangeLength)
      .map((owner) => Object.freeze(owner));
    const activeSlideTapKeepOwners = [...this.state.slideTapKeep.values()]
      .map((owner) => {
        if (owner.instance.kind !== "note-slide") {
          throw new Error("Slide TapKeep owner lost its typed NoteSlide identity");
        }
        return Object.freeze({
          noteIndex: owner.instance.noteIndex,
          absolutePosition: owner.instance.absolutePosition,
          rangeLength: owner.rangeLength,
          ownerKey: owner.ownerKey,
        });
      })
      .sort((left, right) => left.noteIndex - right.noteIndex ||
        left.absolutePosition - right.absolutePosition);
    return Object.freeze({
      slidePoolCursor: this.state.slidePoolCursor,
      suppressedUntilReplay: this.state.suppressedUntilReplay,
      terminal: this.state.terminal,
      disposed: this.state.disposed,
      activeButtonTapKeepOwners: Object.freeze(activeButtonTapKeepOwners),
      activeSlideTapKeepOwners: Object.freeze(activeSlideTapKeepOwners),
    });
  }

  private routeProductSlideTapKeep(
    node: GarupaProductNode,
    entry: OneFrameJudgementEntry,
    projected: MutableParticleOwnerState,
    commands: ParticleCommand[],
  ): SimulatorResult<void> {
    const nodes = this.productSlideNodesByIdentity.get(node.identity);
    if (nodes === undefined) return ok(undefined);
    const nodeIndex = nodes.indexOf(node);
    const head = nodes[0];
    if (nodeIndex < 0 || head?.scoringSource === null || head === undefined) {
      return rejected(
        "particle.producer.invalid-product-slide-owner",
        "A product Slide chain must retain its ordered visible nodes and one stable head owner.",
      );
    }
    const identity = slideIdentity(head.scoringSource);
    if (nodeIndex === nodes.length - 1) {
      stopSlideTapKeep(identity, projected, commands);
      return ok(undefined);
    }
    if (entry.adjustedResult <= 0) return ok(undefined);
    const target = nodes[nodeIndex + 1]!;
    if (this.productScene === null) {
      return rejected(
        "particle.producer.product-slide-scene-missing",
        "Product Slide tap-keep movement requires the same continuous scene projection used by its visible root.",
      );
    }
    const position = this.productScene.projectLaneAtCurve(
      target.spanStart + (target.width - 1) / 2,
      1,
    );
    if (position.status !== "ok") return position;
    // Product continuous X remains a product adapter, while the current
    // NoteSlide pool setup scale and outer NoteSetting scale stay original-owned.
    const transform = slideTransform(
      position.value.x.value,
      position.value.y.value,
      "product-extension-note-slide",
      this.particleScene!,
    );
    if (transform === null) {
      return rejected(
        "particle.producer.invalid-product-slide-transform",
        "The current product Slide after-node must project to one finite typed owner transform.",
      );
    }
    if (nodeIndex === 0) {
      playSlideTapKeep(
        identity, target.spanStart, target.width, transform,
        "product-extension", this.particleScene!, projected, commands,
      );
    } else {
      moveSlideTapKeep(
        identity, target.spanStart, target.width, transform,
        "product-extension", this.particleScene!, projected, commands,
      );
    }
    return ok(undefined);
  }

  private stage(
    commands: readonly ParticleCommand[],
    projected: MutableParticleOwnerState,
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const frozenCommands = Object.freeze(commands.map((command) => Object.freeze({ ...command }) as ParticleCommand));
    let transaction!: ParticleCommandOwnerTransaction;
    transaction = new ParticleCommandOwnerTransaction(
      frozenCommands,
      () => {
        if (this.pending !== transaction) throw new Error("Particle producer commit lost its pending owner capability");
        this.state = projected;
        this.pending = null;
      },
      () => {
        if (this.pending !== transaction) throw new Error("Particle producer discard lost its pending owner capability");
        this.pending = null;
      },
    );
    this.pending = transaction;
    return ok(transaction);
  }

  private validateAvailable(rejectTerminal = true): SimulatorResult<void> {
    const valid = this.validate();
    if (valid.status !== "ok") return valid;
    if (this.pending !== null) {
      return rejected(
        "particle.producer.overlapping-transaction",
        "Only one clone-preflighted particle owner transaction may be pending.",
      );
    }
    if (rejectTerminal && this.state.terminal) {
      return rejected(
        "particle.producer.after-terminal",
        "No particle route may be authored after terminal cleanup.",
      );
    }
    return ok(undefined);
  }

  private resolveJudgementNote(
    entry: OneFrameJudgementEntry,
  ): SimulatorResult<NoteInformation> {
    const candidates = this.notesByJudgementKey.get(judgementKey(
      entry.absolutePosition,
      entry.buttonTypes,
    )) ?? [];
    const indexed = candidates.filter((note) => note.index === entry.noteIndex);
    const tailOwners = entry.phase === "tail"
      ? indexed.filter((note) => note.afterNoteAbsolutePos === entry.absolutePosition)
      : [];
    const matching = tailOwners.length > 0
      ? tailOwners
      : indexed.filter((note) => note.absolutePos === entry.absolutePosition);
    if (matching.length === 0) {
      return rejected(
        "particle.producer.missing-note-owner",
        "Judgement particle routing requires the exact chart absolute-position/button-span owner authored into OneFrame.",
      );
    }
    const first = matching[0]!;
    if (matching.some((note) => !particleEquivalentNote(first, note))) {
      return rejected(
        "particle.producer.ambiguous-note-owner",
        "Semantically different chart notes cannot share one judgement owner key.",
      );
    }
    return ok(first);
  }

  private registerNote(
    note: NoteInformation,
    slideRoot: NoteInformation | null,
  ): void {
    if (note === null || typeof note !== "object" || this.registeredNotes.has(note)) return;
    if (!Number.isSafeInteger(note.index) || note.index < 0 ||
      !Number.isSafeInteger(note.absolutePos) || note.absolutePos < 0 ||
      !Array.isArray(note.buttonTypesArray) || note.buttonTypesArray.length < 1) {
      this.chartIdentityValid = false;
      return;
    }
    this.registeredNotes.add(note);
    const existing = this.notesByIndex.get(note.index);
    if (existing === undefined) this.notesByIndex.set(note.index, note);
    else if (existing !== note) this.ambiguousNoteIndices.add(note.index);
    this.registerJudgementKey(note.absolutePos, note.buttonTypesArray, note);
    if (Number.isSafeInteger(note.afterNoteAbsolutePos) && note.afterNoteAbsolutePos >= 0) {
      this.registerJudgementKey(note.afterNoteAbsolutePos, note.buttonTypesArray, note);
    }
    const ownedSlideRoot = note.fireNoteType === FrontNoteType.SlideA ||
      note.fireNoteType === FrontNoteType.SlideB
      ? note
      : slideRoot;
    if (ownedSlideRoot !== null) this.slideRootByNode.set(note, ownedSlideRoot);
    for (const child of note.slideNoteList) this.registerNote(child, ownedSlideRoot);
  }

  private registerJudgementKey(
    absolutePosition: number,
    buttonTypes: readonly number[],
    note: NoteInformation,
  ): void {
    const key = judgementKey(absolutePosition, buttonTypes);
    const candidates = this.notesByJudgementKey.get(key) ?? [];
    if (!candidates.includes(note)) candidates.push(note);
    this.notesByJudgementKey.set(key, candidates);
  }
}

function playSlideTapKeep(
  identity: SlideSemanticIdentity,
  buttonType: number,
  rangeLength: number,
  transform: ParticleOwnerTransform,
  route: "original" | "product-extension",
  scene: ParticlePixiSceneProfile,
  state: MutableParticleOwnerState,
  commands: ParticleCommand[],
): void {
  const pool = scene.slidePool!;
  state.slidePoolCursor = (state.slidePoolCursor + 1) % pool.poolSize;
  const poolSlot = state.slidePoolCursor;
  const semanticKey = slideSemanticKey(identity);
  const ownerKey = slideTapKeepOwnerKey(identity, poolSlot);
  const instance = slideInstance(identity, buttonType, rangeLength, transform, route, poolSlot, scene);
  const before = state.slideTapKeep.get(semanticKey);
  if (before !== undefined) {
    commands.push(stopRoot(before.ownerKey, before.instance, "ordinary:effect_TapKeep"));
  }
  commands.push(playRoot(ownerKey, instance, "ordinary:effect_TapKeep"));
  state.slideTapKeep.set(semanticKey, Object.freeze({ ownerKey, instance, rangeLength }));
}

function moveSlideTapKeep(
  identity: SlideSemanticIdentity,
  buttonType: number,
  rangeLength: number,
  transform: ParticleOwnerTransform,
  route: "original" | "product-extension",
  scene: ParticlePixiSceneProfile,
  state: MutableParticleOwnerState,
  commands: ParticleCommand[],
): void {
  const semanticKey = slideSemanticKey(identity);
  const active = state.slideTapKeep.get(semanticKey);
  if (active === undefined || active.instance.kind !== "note-slide" || active.instance.poolSlot === undefined) return;
  const instance = slideInstance(
    identity, buttonType, rangeLength, transform, route, active.instance.poolSlot, scene,
  );
  commands.push(Object.freeze({
    kind: "move-note-slide-root",
    ownerKey: active.ownerKey,
    instance,
  }));
  state.slideTapKeep.set(semanticKey, Object.freeze({
    ownerKey: active.ownerKey,
    instance,
    rangeLength,
  }));
}

function stopSlideTapKeep(
  identity: SlideSemanticIdentity,
  state: MutableParticleOwnerState,
  commands: ParticleCommand[],
): void {
  const semanticKey = slideSemanticKey(identity);
  const active = state.slideTapKeep.get(semanticKey);
  if (active === undefined) return;
  state.slideTapKeep.delete(semanticKey);
  commands.push(stopRoot(active.ownerKey, active.instance, "ordinary:effect_TapKeep"));
}

function playButtonTapKeep(
  buttonType: number,
  rangeLength: number,
  scene: ParticlePixiSceneProfile,
  state: MutableParticleOwnerState,
  commands: ParticleCommand[],
): void {
  const owners = state.buttonTapKeep.get(buttonType) ?? new Map<number, TapKeepOwner>();
  const ownerKey = buttonTapKeepOwnerKey(buttonType, rangeLength);
  const instance = buttonInstance(buttonType, rangeLength, scene);
  commands.push(playRoot(ownerKey, instance, "ordinary:effect_TapKeep"));
  owners.set(rangeLength, Object.freeze({ ownerKey, instance, rangeLength }));
  state.buttonTapKeep.set(buttonType, owners);
}

function stopButtonTapKeep(
  buttonType: number,
  state: MutableParticleOwnerState,
  commands: ParticleCommand[],
): void {
  const owners = state.buttonTapKeep.get(buttonType);
  if (owners === undefined) return;
  for (const owner of [...owners.values()].sort((left, right) => left.rangeLength - right.rangeLength)) {
    commands.push(stopRoot(owner.ownerKey, owner.instance, "ordinary:effect_TapKeep"));
  }
  state.buttonTapKeep.delete(buttonType);
}

function playRoot(
  ownerKey: string,
  instance: ParticleInstanceIdentity,
  root: ParticleRootId,
): ParticleCommand {
  return Object.freeze({
    kind: "play-root",
    ownerKey,
    instance,
    root,
    restartIfActive: true,
  });
}

function stopRoot(
  ownerKey: string,
  instance: ParticleInstanceIdentity,
  root: ParticleRootId,
): ParticleCommand {
  return Object.freeze({
    kind: "stop-clear-deactivate-root",
    ownerKey,
    instance,
    root,
  });
}

function buttonInstance(
  buttonType: number,
  rangeLength: number | null,
  scene: ParticlePixiSceneProfile,
): ParticleInstanceIdentity {
  const owner = scene.buttonOwners!.find((candidate) => candidate.buttonType === buttonType)!;
  return Object.freeze({
    kind: "game-play-button",
    buttonType,
    rangeLength,
    ownerTransform: owner.transform,
    particleSystemSetupScaleBits: owner.particleSystemSetupScaleBits,
  });
}

function slideInstance(
  identity: SlideSemanticIdentity,
  buttonType: number,
  rangeLength: number,
  transform: ParticleOwnerTransform,
  route: "original" | "product-extension",
  poolSlot: number,
  scene: ParticlePixiSceneProfile,
): Extract<ParticleInstanceIdentity, { readonly kind: "note-slide" }> {
  return Object.freeze({
    kind: "note-slide",
    noteIndex: identity.noteIndex,
    absolutePosition: identity.absolutePosition,
    buttonType,
    rangeLength,
    ownerTransform: transform,
    particleSystemSetupScaleBits: scene.slidePool!.particleSystemSetupScaleBits,
    poolSlot,
    route,
    rootPositionXBits: transform.position.xBits,
    rootPositionYBits: transform.position.yBits,
    rootScaleBits: transform.scale.xBits,
  });
}

function buttonParticleOwnerKey(
  buttonType: number,
  root: ParticleRootId,
  rangeLength: number | null,
): string {
  return rangeLength === null
    ? `game-play-button:${buttonType}/particle:${root}`
    : `game-play-button:${buttonType}/particle:${root}/range:${rangeLength}`;
}

function buttonTapKeepOwnerKey(buttonType: number, rangeLength: number): string {
  return buttonParticleOwnerKey(buttonType, "ordinary:effect_TapKeep", rangeLength);
}

function slideTapKeepOwnerKey(
  identity: SlideSemanticIdentity,
  poolSlot: number,
): string {
  return `note-slide-pool:${poolSlot}/note:${identity.noteIndex}@${identity.absolutePosition}/particle:ordinary:effect_TapKeep`;
}

function slideSemanticKey(identity: SlideSemanticIdentity): string {
  return `${identity.noteIndex}@${identity.absolutePosition}`;
}

function originalSlideTransform(
  buttonType: number,
  scene: ParticlePixiSceneProfile,
): ParticleOwnerTransform {
  const owner = scene.buttonOwners!.find((candidate) => candidate.buttonType === buttonType)!;
  return Object.freeze({
    source: "original-note-slide" as const,
    position: owner.transform.position,
    rotation: Object.freeze({
      xBits: "0x00000000", yBits: "0x00000000", zBits: "0x00000000", wBits: "0x3F800000",
    }),
    scale: Object.freeze({
      xBits: scene.slidePool!.outerScaleBits,
      yBits: scene.slidePool!.outerScaleBits,
      zBits: scene.slidePool!.outerScaleBits,
    }),
  });
}

function slideTransform(
  x: number,
  y: number,
  source: "original-note-slide" | "product-extension-note-slide",
  scene: ParticlePixiSceneProfile,
): ParticleOwnerTransform | null {
  const xBits = particleFloat32ToBits(x);
  const yBits = particleFloat32ToBits(y);
  const scaleBits = scene.slidePool?.outerScaleBits ?? null;
  if (xBits === null || yBits === null || scaleBits === null || particleFloat32FromBits(scaleBits) === null) return null;
  return Object.freeze({
    source,
    position: Object.freeze({ xBits, yBits, zBits: "0x00000000" }),
    rotation: Object.freeze({
      xBits: "0x00000000", yBits: "0x00000000", zBits: "0x00000000", wBits: "0x3F800000",
    }),
    scale: Object.freeze({ xBits: scaleBits, yBits: scaleBits, zBits: scaleBits }),
  });
}

function validOwnerScene(scene: ParticlePixiSceneProfile | null): scene is ParticlePixiSceneProfile {
  if (scene === null || !Array.isArray(scene.buttonOwners) || scene.buttonOwners.length !== 15 ||
    !Array.isArray(scene.buttonAnchors) || scene.buttonAnchors.length !== 15 || scene.slidePool === undefined ||
    scene.slidePool.poolSize !== 8 || scene.slidePool.initialCursor !== 0 || scene.slidePool.firstAcquiredSlot !== 1 ||
    positiveBits(scene.slidePool.outerScaleBits) === null || positiveBits(scene.slidePool.particleSystemSetupScaleBits) === null ||
    !zeroVector(scene.slidePool.childLocalPosition) || !identityQuaternion(scene.slidePool.childLocalRotation) ||
    !oneVector(scene.slidePool.childLocalScale)) return false;
  const seen = new Set<number>();
  for (const owner of scene.buttonOwners) {
    const anchor = scene.buttonAnchors.find((candidate) => candidate.buttonType === owner.buttonType);
    if (seen.has(owner.buttonType) || anchor === undefined || owner.transform.source !== "game-play-button" ||
      !validOwnerTransform(owner.transform) || positiveBits(owner.particleSystemSetupScaleBits) === null ||
      owner.transform.position.xBits !== anchor.position.xBits ||
      owner.transform.position.yBits !== anchor.position.yBits ||
      owner.transform.position.zBits !== anchor.position.zBits ||
      !identityQuaternion(owner.transform.rotation) || !oneVector(owner.transform.scale)) return false;
    seen.add(owner.buttonType);
  }
  return true;
}

function validOwnerTransform(transform: ParticleOwnerTransform): boolean {
  return [transform.position.xBits, transform.position.yBits, transform.position.zBits,
    transform.rotation.xBits, transform.rotation.yBits, transform.rotation.zBits, transform.rotation.wBits,
    transform.scale.xBits, transform.scale.yBits, transform.scale.zBits]
    .every((bits) => particleFloat32FromBits(bits) !== null);
}

function positiveBits(bits: string): number | null {
  const value = particleFloat32FromBits(bits);
  return value !== null && value > 0 ? value : null;
}

function zeroVector(value: { readonly xBits: string; readonly yBits: string; readonly zBits: string }): boolean {
  return value.xBits === "0x00000000" && value.yBits === "0x00000000" && value.zBits === "0x00000000";
}

function oneVector(value: { readonly xBits: string; readonly yBits: string; readonly zBits: string }): boolean {
  return value.xBits === "0x3F800000" && value.yBits === "0x3F800000" && value.zBits === "0x3F800000";
}

function identityQuaternion(value: { readonly xBits: string; readonly yBits: string; readonly zBits: string; readonly wBits: string }): boolean {
  return value.xBits === "0x00000000" && value.yBits === "0x00000000" &&
    value.zBits === "0x00000000" && value.wBits === "0x3F800000";
}

function slideIdentity(note: NoteInformation): SlideSemanticIdentity {
  return Object.freeze({ noteIndex: note.index, absolutePosition: note.absolutePos });
}

function nextOriginalSlideTarget(
  slideRoot: NoteInformation,
  judgedNote: NoteInformation,
  phase: OneFrameJudgementEntry["phase"],
): NoteInformation | null {
  if (phase === "head") return slideRoot.slideNoteList[0] ?? null;
  if (phase !== "intermediate") return null;
  const index = slideRoot.slideNoteList.indexOf(judgedNote);
  return index < 0 ? null : slideRoot.slideNoteList[index + 1] ?? null;
}

function targetCenterButtonType(note: NoteInformation): number | null {
  const buttonType = note.halfButtonIndex >= 0 ? note.halfButtonIndex : note.buttonType;
  return isButtonType(buttonType) ? buttonType : null;
}

function judgementGameNoteType(
  note: NoteInformation,
  entry: OneFrameJudgementEntry,
): NoteInformation["gameNoteType"] {
  if (entry.phase !== "tail") return note.gameNoteType;
  if (note.fireNoteType === FrontNoteType.Long) {
    if (note.afterNoteType === AfterNoteType.DirectionalFlickLeft ||
      note.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft) {
      return GameNoteType.LongDirectionalFlickLeft;
    }
    if (note.afterNoteType === AfterNoteType.DirectionalFlickRight ||
      note.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight) {
      return GameNoteType.LongDirectionalFlickRight;
    }
  }
  if (note.fireNoteType === FrontNoteType.SlideA || note.fireNoteType === FrontNoteType.SlideB) {
    if (note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft ||
      note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft) {
      return note.fireNoteType === FrontNoteType.SlideA
        ? GameNoteType.SlideADirectionalFlickLeft
        : GameNoteType.SlideBDirectionalFlickLeft;
    }
    if (note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight ||
      note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight) {
      return note.fireNoteType === FrontNoteType.SlideA
        ? GameNoteType.SlideADirectionalFlickRight
        : GameNoteType.SlideBDirectionalFlickRight;
    }
  }
  return note.gameNoteType;
}

function isSkillEntry(note: NoteInformation, entry: OneFrameJudgementEntry): boolean {
  return entry.phase === "tail"
    ? note.gameNoteAdditionalTypeLongNoteEnd === GameNoteAdditionalType.Skill
    : note.gameNoteAdditionalType === GameNoteAdditionalType.Skill;
}

function judgementKey(
  absolutePosition: number,
  buttonTypes: readonly number[],
): string {
  return `${absolutePosition}|${buttonTypes.join(",")}`;
}

function compatibleProductParticleButton(node: GarupaProductNode): number | null {
  const center = node.spanStart + (node.width - 1) / 2;
  return node.width >= 1 && node.width <= 7 && Number.isInteger(center) && center >= 0 && center <= 6
    ? center
    : null;
}

function compatibleProductParticleRoot(
  node: GarupaProductNode,
  result: NoteResultTypeValue,
): ParticleRootId | null {
  if (compatibleProductParticleButton(node) === null || result < NoteResultType.Good) return null;
  if (node.type === "Skill") {
    return result === NoteResultType.Perfect
      ? "ordinary:effect_tap_skill_perfect"
      : result === NoteResultType.Great
      ? "ordinary:effect_tap_skill_great"
      : "ordinary:effect_tap_skill_good";
  }
  if (node.type === "Flick") return "ordinary:effect_tap_swipe";
  if (node.type === "Directional") {
    return node.direction === "Left"
      ? "directional:effect_tap_directional_flick_l"
      : node.direction === "Right"
      ? "directional:effect_tap_directional_flick_r"
      : null;
  }
  if (node.type !== "Single") return null;
  return result === NoteResultType.Perfect
    ? "ordinary:effect_tap_perfect"
    : result === NoteResultType.Great
    ? "ordinary:effect_tap_great"
    : "ordinary:effect_tap_good";
}

function compatibleProductDirectionalFingerRoot(
  node: GarupaProductNode,
  result: NoteResultTypeValue,
): ParticleRootId | null {
  if (compatibleProductParticleButton(node) === null ||
    node.type !== "Directional" || result < NoteResultType.Good) return null;
  return node.direction === "Left"
    ? "directional:effect_tap_directional_flick_l_finger"
    : node.direction === "Right"
      ? "directional:effect_tap_directional_flick_r_finger"
      : null;
}

function isDirectionalJudgeNoteType(noteType: number): boolean {
  return noteType === 6 || noteType === 7 || noteType === 9 || noteType === 10;
}

function directionalFingerButtonType(
  targetCenterButton: number,
  buttonTypes: readonly number[],
  root: ParticleRootId,
  isAutoPlay: boolean,
  multipleDirectionalFlickNoteCount: number,
): number {
  if (!isAutoPlay || multipleDirectionalFlickNoteCount <= 1) return targetCenterButton;
  return root === "directional:effect_tap_directional_flick_l_finger"
    ? Math.max(...buttonTypes)
    : Math.min(...buttonTypes);
}

function productScoringKey(
  noteIndex: number,
  absolutePosition: number,
): string {
  // Garupa product scoring sources intentionally retain an internal sentinel
  // button span because Public lanes are finite continuous positions rather
  // than an original seven-button domain. The runtime OneFrame owner publishes
  // its projected button span. Match the immutable source index+absolute
  // position pair and fail constructor validation on collision instead of
  // accidentally routing the product node through the legacy BMS Slide path.
  return `${noteIndex}|${absolutePosition}`;
}

function particleEquivalentNote(
  left: NoteInformation,
  right: NoteInformation,
): boolean {
  return left.index === right.index &&
    left.absolutePos === right.absolutePos &&
    left.fireNoteType === right.fireNoteType &&
    left.afterNoteType === right.afterNoteType &&
    left.gameNoteType === right.gameNoteType &&
    left.gameNoteAdditionalType === right.gameNoteAdditionalType &&
    left.gameNoteAdditionalTypeLongNoteEnd === right.gameNoteAdditionalTypeLongNoteEnd &&
    left.buttonType === right.buttonType &&
    left.halfButtonIndex === right.halfButtonIndex &&
    left.buttonTypesArray.length === right.buttonTypesArray.length &&
    left.buttonTypesArray.every((button, index) => button === right.buttonTypesArray[index]);
}

function isButtonType(value: number): boolean {
  return Number.isInteger(value) &&
    value >= ButtonType.Button_00_BMS_1P_SC && value <= ButtonType.Button_15_BMS_2P_SC;
}

function isRangeLength(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function isJudgementBatchShape(
  batch: OneFrameJudgementBatch,
  productScoringKeys: ReadonlySet<string>,
): boolean {
  return batch !== null && typeof batch === "object" &&
    Number.isSafeInteger(batch.batchIndex) && batch.batchIndex >= 0 &&
    Array.isArray(batch.entries) && batch.entries.length >= 1 && batch.entries.length <= 5 &&
    batch.entryCount === batch.entries.length &&
    batch.entries.every((entry) => entry !== null && typeof entry === "object" &&
      Number.isSafeInteger(entry.noteIndex) && entry.noteIndex >= 0 &&
      Number.isInteger(entry.noteType) && entry.noteType >= 0 && entry.noteType <= 10 &&
      Number.isInteger(entry.adjustedResult) && entry.adjustedResult >= 0 && entry.adjustedResult <= 4 &&
      Number.isSafeInteger(entry.absolutePosition) && entry.absolutePosition >= 0 &&
      (entry.phase === "head" || entry.phase === "intermediate" || entry.phase === "tail") &&
      isJudgementButtonSpan(entry, productScoringKeys) &&
      Number.isSafeInteger(entry.multipleDirectionalFlickNoteCount) &&
      entry.multipleDirectionalFlickNoteCount >= 0);
}

function isJudgementButtonSpan(
  entry: OneFrameJudgementBatch["entries"][number],
  productScoringKeys: ReadonlySet<string>,
): boolean {
  if (!Array.isArray(entry.buttonTypes) || entry.buttonTypes.length === 0 ||
    !entry.buttonTypes.every(Number.isSafeInteger)) return false;
  return entry.buttonTypes.every(isButtonType) || productScoringKeys.has(productScoringKey(
    entry.noteIndex,
    entry.absolutePosition,
  ));
}

function describeInvalidJudgementBatch(
  batch: OneFrameJudgementBatch,
  productScoringKeys: ReadonlySet<string>,
): string {
  if (batch === null || typeof batch !== "object") return "The batch root is null or non-object.";
  if (!Number.isSafeInteger(batch.batchIndex) || batch.batchIndex < 0) {
    return `batchIndex=${String(batch.batchIndex)} is not a non-negative safe integer.`;
  }
  if (!Array.isArray(batch.entries) || batch.entries.length < 1 || batch.entries.length > 5 ||
    batch.entryCount !== batch.entries.length) {
    return `entryCount=${String(batch.entryCount)} entries=${Array.isArray(batch.entries) ? batch.entries.length : "non-array"}.`;
  }
  const index = batch.entries.findIndex((entry) => !(entry !== null && typeof entry === "object" &&
    Number.isSafeInteger(entry.noteIndex) && entry.noteIndex >= 0 &&
    Number.isInteger(entry.noteType) && entry.noteType >= 0 && entry.noteType <= 10 &&
    Number.isInteger(entry.adjustedResult) && entry.adjustedResult >= 0 && entry.adjustedResult <= 4 &&
    Number.isSafeInteger(entry.absolutePosition) && entry.absolutePosition >= 0 &&
    (entry.phase === "head" || entry.phase === "intermediate" || entry.phase === "tail") &&
    isJudgementButtonSpan(entry, productScoringKeys) &&
    Number.isSafeInteger(entry.multipleDirectionalFlickNoteCount) &&
    entry.multipleDirectionalFlickNoteCount >= 0));
  const entry = batch.entries[index];
  return `Invalid entry ${index}: ${JSON.stringify(entry)}.`;
}

function createEmptyState(): MutableParticleOwnerState {
  return {
    buttonTapKeep: new Map(),
    slideTapKeep: new Map(),
    slidePoolCursor: 0,
    suppressedUntilReplay: false,
    terminal: false,
    disposed: false,
  };
}

function cloneState(source: MutableParticleOwnerState): MutableParticleOwnerState {
  return {
    buttonTapKeep: new Map([...source.buttonTapKeep].map(([button, owners]) => [button, new Map(owners)])),
    slideTapKeep: new Map(source.slideTapKeep),
    slidePoolCursor: source.slidePoolCursor,
    suppressedUntilReplay: source.suppressedUntilReplay,
    terminal: source.terminal,
    disposed: source.disposed,
  };
}

function rejected<T = never>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}
