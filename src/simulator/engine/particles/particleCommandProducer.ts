import type {
  ParticleCommand,
  ParticleInstanceIdentity,
  ParticleRootId,
} from "../../backends/particleContracts";
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
import { getGarupaProductChartProfile } from "../garupa/productChartProfile";
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
  private chartIdentityValid = true;
  private state = createEmptyState();
  private pending: ParticleCommandOwnerTransaction | null = null;

  constructor(chart: ChartConstructionResult) {
    if (chart === null || typeof chart !== "object" || !Array.isArray(chart.noteBatches)) {
      this.chartIdentityValid = false;
      return;
    }
    for (const batch of chart.noteBatches) {
      for (const note of batch.informationList) this.registerNote(note, null);
    }
    const product = getGarupaProductChartProfile(chart);
    if (product?.route === "product-extension") {
      for (const node of product.visibleNodes) {
        if (node.scoringSource !== null) {
          this.productScoringKeys.add(productScoringKey(
            node.scoringSource.index,
            node.absolutePosition,
            node.scoringSource.buttonTypesArray,
          ));
        }
      }
    }
  }

  validate(): SimulatorResult<void> {
    return this.chartIdentityValid
      ? ok(undefined)
      : rejected(
          "particle.producer.invalid-chart-identity",
          "Particle ownership requires complete chart-semantic judgement keys; source note indices are not treated as globally unique identities.",
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
        if (this.productScoringKeys.has(productScoringKey(
          entry.noteIndex,
          entry.absolutePosition,
          entry.buttonTypes,
        ))) continue;
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
          playButtonTapKeep(buttonType, entry.buttonTypes.length, projected, commands);
        }
        const slideRoot = this.slideRootByNode.get(note);
        if (slideRoot !== undefined && entry.phase === "tail") {
          stopSlideTapKeep(slideIdentity(slideRoot), projected, commands);
        }
        if (slideRoot !== undefined && entry.phase === "head" && entry.adjustedResult > 0) {
          playSlideTapKeep(
            slideIdentity(slideRoot),
            buttonType,
            entry.buttonTypes.length,
            projected,
            commands,
          );
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
            buttonInstance(buttonType, rangeLength),
            routed.value,
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

  preflightDirectionalFingerEffect(
    buttonType: number,
    result: NoteResultTypeValue,
    source: Parameters<typeof resolveParticleDirectionalFingerRoot>[0],
  ): SimulatorResult<ParticleCommandOwnerTransaction> {
    const available = this.validateAvailable();
    if (available.status !== "ok") return available;
    if (!isButtonType(buttonType) || !Number.isInteger(result) ||
      result < NoteResultType.None || result > NoteResultType.Perfect) {
      return rejected(
        "particle.producer.invalid-directional-finger-owner-or-result",
        "A directional finger particle requires an engine-owned GamePlayButton and closed owner-authored result.",
      );
    }
    const projected = cloneState(this.state);
    if (projected.suppressedUntilReplay || result < NoteResultType.Good) {
      return this.stage([], projected);
    }
    const root = resolveParticleDirectionalFingerRoot(source);
    return root.status !== "ok"
      ? root
      : this.stage([playRoot(
          buttonParticleOwnerKey(buttonType, root.value, null),
          buttonInstance(buttonType, null),
          root.value,
        )], projected);
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
    playButtonTapKeep(buttonType, rangeLength, projected, commands);
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
    playSlideTapKeep(slideIdentity(note), buttonType, rangeLength, projected, commands);
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
      suppressedUntilReplay: this.state.suppressedUntilReplay,
      terminal: this.state.terminal,
      disposed: this.state.disposed,
      activeButtonTapKeepOwners: Object.freeze(activeButtonTapKeepOwners),
      activeSlideTapKeepOwners: Object.freeze(activeSlideTapKeepOwners),
    });
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
  state: MutableParticleOwnerState,
  commands: ParticleCommand[],
): void {
  const semanticKey = slideSemanticKey(identity);
  const ownerKey = slideTapKeepOwnerKey(identity, buttonType, rangeLength);
  const instance = slideInstance(identity, buttonType, rangeLength);
  const before = state.slideTapKeep.get(semanticKey);
  if (before !== undefined && before.ownerKey !== ownerKey) {
    commands.push(stopRoot(before.ownerKey, before.instance, "ordinary:effect_TapKeep"));
  }
  commands.push(playRoot(ownerKey, instance, "ordinary:effect_TapKeep"));
  state.slideTapKeep.set(semanticKey, Object.freeze({ ownerKey, instance, rangeLength }));
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
  state: MutableParticleOwnerState,
  commands: ParticleCommand[],
): void {
  const owners = state.buttonTapKeep.get(buttonType) ?? new Map<number, TapKeepOwner>();
  const ownerKey = buttonTapKeepOwnerKey(buttonType, rangeLength);
  const instance = buttonInstance(buttonType, rangeLength);
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
    instance: Object.freeze({ ...instance }),
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
    instance: Object.freeze({ ...instance }),
    root,
  });
}

function buttonInstance(
  buttonType: number,
  rangeLength: number | null,
): ParticleInstanceIdentity {
  return Object.freeze({ kind: "game-play-button", buttonType, rangeLength });
}

function slideInstance(
  identity: SlideSemanticIdentity,
  buttonType: number,
  rangeLength: number,
): ParticleInstanceIdentity {
  return Object.freeze({
    kind: "note-slide",
    noteIndex: identity.noteIndex,
    absolutePosition: identity.absolutePosition,
    buttonType,
    rangeLength,
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
  buttonType: number,
  rangeLength: number,
): string {
  return `note-slide:${identity.noteIndex}@${identity.absolutePosition}/button:${buttonType}/particle:ordinary:effect_TapKeep/range:${rangeLength}`;
}

function slideSemanticKey(identity: SlideSemanticIdentity): string {
  return `${identity.noteIndex}@${identity.absolutePosition}`;
}

function slideIdentity(note: NoteInformation): SlideSemanticIdentity {
  return Object.freeze({ noteIndex: note.index, absolutePosition: note.absolutePos });
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

function productScoringKey(
  noteIndex: number,
  absolutePosition: number,
  buttonTypes: readonly number[],
): string {
  return `${noteIndex}|${judgementKey(absolutePosition, buttonTypes)}`;
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
    entry.buttonTypes,
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
    suppressedUntilReplay: false,
    terminal: false,
    disposed: false,
  };
}

function cloneState(source: MutableParticleOwnerState): MutableParticleOwnerState {
  return {
    buttonTapKeep: new Map([...source.buttonTapKeep].map(([button, owners]) => [button, new Map(owners)])),
    slideTapKeep: new Map(source.slideTapKeep),
    suppressedUntilReplay: source.suppressedUntilReplay,
    terminal: source.terminal,
    disposed: source.disposed,
  };
}

function rejected<T = never>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}
