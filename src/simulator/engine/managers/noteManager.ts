import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../chart/types";
import {
  directionalEndpointButton,
  directionalEndpointPosition,
  isSameDirectionalGroup,
} from "../chart/noteGraph";
import type { NoteFamily } from "../data/noteData";
import type { OneFrameDataHandle } from "../data/oneFrameData";
import type {
  ManualJudgementOwnership,
  ManualJudgementTransaction,
} from "../data/manualJudgement";
import type { InGameCalculatedData } from "../data/inGameCalculatedData";
import type {
  AutoLiveJudgementOwnership,
  AutoLiveJudgementRequest,
  MultipleDirectionalRuntimeGroup,
} from "../data/autoLiveJudgement";
import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import { NoteBase, NoteState } from "../notes/noteBase";
import { NoteBpmChange } from "../notes/noteBpmChange";
import {
  NoteDirectionalFlick,
  NoteFlick,
  NoteLong,
  NoteMultipleDirectionalFlick,
  NoteMultipleDirectionalVisual,
  NoteNormal,
  NoteSlide,
  validateAutoLiveActivationGraph,
  validateAutoLiveChartOwnership,
} from "../notes/noteTypes";
import { SlideNoteManager } from "./slideNoteManager";
import type { InGameMusicScoreController } from "./inGameMusicScoreController";
import type { SimulatorManualInputGeometryBackend } from "../../backends/contracts";
import type { RenderCommandProducer } from "../rendering/renderCommandProducer";

const BPM_POOL_LENGTH = 30;

export interface NoteManagerClock {
  validateAdvanceSequence(
    deltaTimeSeconds: number,
    substepCount: number,
  ): SimulatorResult<void>;
  setExecuteFrame(executeFrame: number): void;
  advance(deltaTimeSeconds: number): SimulatorResult<void>;
  canActivateBatch(batch: NoteBatchInformation): SimulatorResult<boolean>;
}

export type NotePoolObjectFactory = (
  family: NoteFamily,
  poolObjectId: string,
) => NoteBase;

export type NoteManagerTraceEntry =
  | {
      readonly kind: "frame";
      readonly deltaTimeSeconds: number;
      readonly executeFrame: number;
      readonly substepCount: number;
      readonly outerFrameIndex: number;
    }
  | {
      readonly kind: "music-advance";
      readonly substepIndex: number;
      readonly deltaTimeSeconds: number;
      readonly executeFrame: number;
    }
  | {
      readonly kind: "bpm-update" | "bpm-activate" | "note-after-update" | "note-activate";
      readonly substepIndex: number;
      readonly noteIndex: number;
      readonly poolObjectId: string;
    }
  | {
      readonly kind: "note-update";
      readonly substepIndex: number;
      readonly noteIndex: number;
      readonly poolObjectId: string;
      readonly adjustedPosition: number | null;
      readonly stateBefore: NoteState;
      readonly stateAfter: NoteState;
    }
  | {
      readonly kind: "group-activate";
      readonly substepIndex: number;
      readonly batchIndex: number;
    };

export interface NotePoolSnapshot {
  readonly family: NoteFamily;
  readonly cursor: number;
  readonly objects: readonly ReturnType<NoteBase["snapshot"]>[];
}

export interface NoteManagerSnapshot {
  readonly batchCount: number;
  readonly nextBatchIndex: number;
  readonly activeNotePoolObjectIds: readonly string[];
  readonly activeBpmPoolIndices: readonly number[];
  readonly bpmPoolCursor: number;
  readonly bpmPool: readonly ReturnType<NoteBpmChange["snapshot"]>[];
  readonly pools: readonly NotePoolSnapshot[];
  readonly slideNoteManagerInitialized: boolean;
  readonly schedulerTrace: readonly NoteManagerTraceEntry[];
  readonly bpmChangeCount: number;
  readonly performanceLevelCounters: readonly number[];
  readonly calculatedData: ReturnType<InGameCalculatedData["snapshot"]>;
}

export type PerformanceLevelCounters = [number, number, number, number];

interface NotePool {
  readonly family: NoteFamily;
  readonly objects: NoteBase[];
  cursor: number;
}

interface ManualSlideSourceOwnership {
  readonly phase: "head" | "intermediate" | "tail";
  readonly allowedNoteTypes: readonly number[];
  readonly absolutePosition: number;
  readonly buttonTypes: readonly ButtonTypeValue[];
}

interface NotePoolAcquisition {
  readonly note: NoteBase;
  readonly pool: NotePool;
  readonly nextCursor: number;
}

export class NoteManager {
  private readonly activeNotesValue: NoteBase[] = [];
  private readonly activeBpmChangesValue: NoteBpmChange[] = [];
  private readonly bpmPoolValue = Array.from(
    { length: BPM_POOL_LENGTH },
    (_, index) => new NoteBpmChange(index),
  );
  private readonly notePoolsValue = new Map<NoteFamily, NotePool>();
  private readonly schedulerTraceValue: NoteManagerTraceEntry[] = [];
  private readonly observedAdjustedPositions = new WeakMap<NoteBase, number>();
  private readonly performanceLevelCountersValue: PerformanceLevelCounters = [
    0, 0, 0, 0,
  ];
  private nextBatchIndexValue = 0;
  private bpmPoolCursorValue = 0;
  private outerFrameIndexValue = 0;
  private setupComplete = false;
  private readonly multipleDirectionalGroups = new WeakMap<
    NoteInformation,
    MultipleDirectionalGroupOwner
  >();
  private readonly longAfterMultipleGroups = new WeakMap<
    NoteInformation,
    MultipleDirectionalGroupOwner
  >();
  private readonly slideAfterMultipleGroups = new WeakMap<
    NoteInformation,
    MultipleDirectionalGroupOwner
  >();
  private readonly manualSlideSources = new WeakMap<
    NoteInformation,
    ManualSlideSourceOwnership
  >();
  private readonly autoLiveJudgementSources = new WeakSet<NoteInformation>();
  private manualNoteDeactivatedOwner: ((note: NoteBase) => void) | null = null;

  constructor(
    private readonly batches: readonly NoteBatchInformation[],
    readonly slideNoteManager: SlideNoteManager,
    private readonly clock: NoteManagerClock,
    private readonly musicScoreController: InGameMusicScoreController,
    private readonly bpmChangeCount: number,
    private readonly judgeOffsetFrames: number,
    readonly inGameCalculatedData: InGameCalculatedData,
    private readonly getUsableOneFrameData: () => SimulatorResult<OneFrameDataHandle>,
    private readonly submitAutoLiveJudgement: (
      request: AutoLiveJudgementRequest,
    ) => SimulatorResult<void>,
    private readonly createPoolObject: NotePoolObjectFactory = createDefaultPoolObject,
    private readonly createManualJudgementTransaction: () => ManualJudgementTransaction =
      createUnavailableManualJudgementTransaction,
    private readonly manualInputGeometry: SimulatorManualInputGeometryBackend =
      unavailableManualInputGeometry,
    private readonly renderProducer: RenderCommandProducer | null = null,
  ) {}

  validateSetup(): SimulatorResult<void> {
    const ownershipValidation = validateAutoLiveChartOwnership(this.batches);
    if (ownershipValidation.status !== "ok") {
      return ownershipValidation;
    }
    for (const batch of this.batches) {
      for (const noteInformation of batch.informationList) {
        if (isNonPlayableCommand(noteInformation)) {
          const commandValidation = validateBpmCommand(noteInformation);
          if (commandValidation.status !== "ok") {
            return commandValidation;
          }
          continue;
        }
        const familyValidation = noteFamily(noteInformation);
        if (familyValidation.status !== "ok") {
          return familyValidation;
        }
        const graphValidation = validateAutoLiveActivationGraph(noteInformation);
        if (graphValidation.status !== "ok") {
          return graphValidation;
        }
      }
    }
    return ok(undefined);
  }

  execAwakeEnd(): SimulatorResult<void> {
    const setupValidation = this.validateSetup();
    if (setupValidation.status !== "ok") {
      return setupValidation;
    }
    const slideInitialization = this.slideNoteManager.initialize(this.manualInputGeometry);
    if (slideInitialization.status !== "ok") {
      return slideInitialization;
    }
    return this.setupNotes();
  }

  setupNotes(): SimulatorResult<void> {
    if (this.setupComplete) {
      return ok(undefined);
    }
    const setupValidation = this.validateSetup();
    if (setupValidation.status !== "ok") {
      return setupValidation;
    }

    this.setupMultipleDirectionalGroups();
    const longAfterGroups = this.setupLongAfterMultipleGroups();
    if (longAfterGroups.status !== "ok") {
      return longAfterGroups;
    }
    const slideAfterGroups = this.setupSlideAfterMultipleGroups();
    if (slideAfterGroups.status !== "ok") {
      return slideAfterGroups;
    }
    const familyNotes = new Map<NoteFamily, NoteInformation[]>();
    for (const batch of this.batches) {
      for (const noteInformation of batch.informationList) {
        if (isNonPlayableCommand(noteInformation)) {
          continue;
        }
        this.autoLiveJudgementSources.add(noteInformation);
        if (
          noteInformation.fireNoteType === FrontNoteType.SlideA ||
          noteInformation.fireNoteType === FrontNoteType.SlideB
        ) {
          const slideAfterGroup = this.slideAfterMultipleGroups.get(noteInformation);
          this.manualSlideSources.set(noteInformation, Object.freeze({
            phase: "head",
            allowedNoteTypes: Object.freeze([8]),
            absolutePosition: noteInformation.absolutePos,
            buttonTypes: Object.freeze([...noteInformation.buttonTypesArray]),
          }));
          for (let slideIndex = 0; slideIndex < noteInformation.slideNoteList.length; slideIndex += 1) {
            const source = noteInformation.slideNoteList[slideIndex];
            if (source === undefined) {
              continue;
            }
            this.autoLiveJudgementSources.add(source);
            const terminal = slideIndex === noteInformation.slideNoteList.length - 1;
            const allowedNoteTypes = terminal
              ? manualSlideTerminalNoteTypes(noteInformation.afterNoteType, source.gameNoteType)
              : [8];
            this.manualSlideSources.set(source, Object.freeze({
              phase: terminal ? "tail" : "intermediate",
              allowedNoteTypes: Object.freeze(allowedNoteTypes),
              absolutePosition: source.absolutePos,
              buttonTypes: Object.freeze([
                ...(terminal && slideAfterGroup !== undefined
                  ? slideAfterGroup.buttonTypes
                  : source.buttonTypesArray),
              ]),
            }));
          }
        }
        const familyResult = noteFamily(noteInformation);
        if (familyResult.status !== "ok") {
          return familyResult;
        }
        const family = familyResult.value;
        const notes = familyNotes.get(family) ?? [];
        notes.push(noteInformation);
        familyNotes.set(family, notes);
      }
    }

    const renderSetup = this.renderProducer?.preflightPoolSetup(
      [...familyNotes].flatMap(([family, notes]) =>
        notes.map((_, index) => Object.freeze({
          family,
          poolObjectId: `${family}:${index}`,
        }))),
    ) ?? null;
    if (renderSetup?.status === "evidence-required") return renderSetup;

    for (const [family, notes] of familyNotes) {
      const objects = notes.map((_, index) => {
        const note = this.createPoolObject(family, `${family}:${index}`);
        note.setLifecycleCallbacks({
          onActivate: (activeNote) => this.appendActiveNote(activeNote),
          onDeactivate: (inactiveNote) => {
            this.removeActiveNote(inactiveNote);
            this.manualNoteDeactivatedOwner?.(inactiveNote);
          },
        });
        note.registerCallbackGetUsableOneFrameData(this.getUsableOneFrameData);
        note.registerAutoLiveRuntime({
          isAutoPlay: () => this.inGameCalculatedData.isAutoPlay,
          getAdjustedMusicPosition: () => {
            const adjustedPosition = this.getAdjustedMusicPosition();
            this.observedAdjustedPositions.set(note, adjustedPosition);
            return adjustedPosition;
          },
          submitJudgement: this.submitAutoLiveJudgement,
        });
        note.registerManualRuntime({
          getAdjustedMusicPosition: () => this.getAdjustedMusicPosition(),
          getCurrentBpm: () => this.musicScoreController.currentBpm,
          getJudgeOffsetFrames: () => this.judgeOffsetFrames,
          judgeSlide: (source, adjustedMusicPosition) =>
            this.slideNoteManager.judge(source, adjustedMusicPosition),
          geometry: this.manualInputGeometry,
          beginJudgementTransaction: () => this.createManualJudgementTransaction(),
          submitJudgement: (request) => this.submitManualJudgement(request),
        });
        if (note instanceof NoteMultipleDirectionalFlick) {
          note.registerMultipleDirectionalGroupResolver(
            (information) => this.resolveMultipleDirectionalGroup(information),
          );
        }
        if (note instanceof NoteLong) {
          note.registerLongAfterMultipleGroupResolver(
            (information) => this.resolveLongAfterMultipleGroup(information),
          );
        }
        if (note instanceof NoteSlide) {
          note.registerSlideAfterMultipleGroupResolver(
            (information) => this.resolveSlideAfterMultipleGroup(information),
          );
        }
        return note;
      });
      this.notePoolsValue.set(family, { family, objects, cursor: 0 });
    }

    this.setupComplete = true;
    if (renderSetup?.status === "ok") {
      const committed = renderSetup.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  execUpdate(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.setupComplete) {
      return evidenceRequired(
        "note-manager.update-before-setup",
        ["E06"],
        "SetupNotes must establish pools and active-list callbacks before ExecUpdate.",
      );
    }
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      return evidenceRequired(
        "note-manager.invalid-delta-time",
        ["E03"],
        "ExecUpdate requires a finite non-negative frame delta.",
      );
    }

    const frameDelta = Math.fround(deltaTimeSeconds);
    if (!Number.isFinite(frameDelta)) {
      return evidenceRequired(
        "note-manager.delta-outside-float32",
        ["E03"],
        "ExecUpdate delta must remain finite after the original Float32 conversion.",
      );
    }
    const executeFrame = Math.min(Math.fround(frameDelta * 60), 1);
    const prospectiveCounters: PerformanceLevelCounters = [
      this.performanceLevelCountersValue[0],
      this.performanceLevelCountersValue[1],
      this.performanceLevelCountersValue[2],
      this.performanceLevelCountersValue[3],
    ];
    const substepCount = selectSubstepCount(
      frameDelta,
      this.bpmChangeCount,
      prospectiveCounters,
    );
    const substepDelta = Math.fround(frameDelta / substepCount);
    const advanceValidation = this.clock.validateAdvanceSequence(
      substepDelta,
      substepCount,
    );
    if (advanceValidation.status !== "ok") {
      return advanceValidation;
    }
    for (let index = 0; index < prospectiveCounters.length; index += 1) {
      this.performanceLevelCountersValue[index] = prospectiveCounters[index];
    }
    const substepExecuteFrame = Math.fround(executeFrame / substepCount);
    this.clock.setExecuteFrame(substepExecuteFrame);
    const renderFrame = this.renderProducer?.beginOuterFrame(this.outerFrameIndexValue);
    if (renderFrame?.status === "evidence-required") return renderFrame;
    this.schedulerTraceValue.push({
      kind: "frame",
      deltaTimeSeconds: frameDelta,
      executeFrame,
      substepCount,
      outerFrameIndex: this.outerFrameIndexValue,
    });
    this.outerFrameIndexValue += 1;

    for (let substepIndex = 0; substepIndex < substepCount; substepIndex += 1) {
      const advanceResult = this.clock.advance(substepDelta);
      if (advanceResult.status !== "ok") {
        return advanceResult;
      }
      this.schedulerTraceValue.push({
        kind: "music-advance",
        substepIndex,
        deltaTimeSeconds: substepDelta,
        executeFrame: substepExecuteFrame,
      });

      let bpmIndex = 0;
      while (bpmIndex < this.activeBpmChangesValue.length) {
        const bpmChange = this.activeBpmChangesValue[bpmIndex];
        if (bpmChange === undefined) {
          break;
        }
        const noteIndex = bpmChange.snapshot().noteIndex ?? -1;
        const updateResult = bpmChange.execUpdate(this.musicScoreController);
        if (updateResult.status !== "ok") {
          return updateResult;
        }
        this.schedulerTraceValue.push({
          kind: "bpm-update",
          substepIndex,
          noteIndex,
          poolObjectId: `bpm:${bpmChange.poolIndex}`,
        });
        if (this.activeBpmChangesValue[bpmIndex] === bpmChange) {
          bpmIndex += 1;
        }
      }

      const afterUpdateNotes: NoteBase[] = [];
      let activeIndex = this.activeNotesValue.length - 1;
      while (activeIndex >= 0) {
        const note = this.activeNotesValue[activeIndex];
        if (note === undefined) {
          return evidenceRequired(
            "note-manager.unrepresented-cross-note-mutation",
            ["E17"],
            "No recovered Update caller removes a different lower-index active Note in this stage.",
          );
        }
        const noteIndex = note.noteInformation?.index ?? -1;
        const stateBefore = note.state;
        this.observedAdjustedPositions.delete(note);
        const updateResult = note.executeUpdate(substepDelta);
        this.schedulerTraceValue.push({
          kind: "note-update",
          substepIndex,
          noteIndex,
          poolObjectId: note.poolObjectId,
          adjustedPosition: this.observedAdjustedPositions.get(note) ?? null,
          stateBefore,
          stateAfter: note.state,
        });
        if (updateResult.status !== "ok") {
          return updateResult;
        }
        if (note.state !== NoteState.Deactive) {
          afterUpdateNotes.push(note);
        }
        activeIndex -= 1;
      }

      for (const note of afterUpdateNotes) {
        this.schedulerTraceValue.push({
          kind: "note-after-update",
          substepIndex,
          noteIndex: note.noteInformation?.index ?? -1,
          poolObjectId: note.poolObjectId,
        });
        const afterUpdateResult = note.executeAfterUpdate(substepDelta);
        if (afterUpdateResult.status !== "ok") {
          return afterUpdateResult;
        }
      }

      const activationResult = this.activateCurrentBatch(substepIndex);
      if (activationResult.status !== "ok") {
        return activationResult;
      }
    }

    return ok(undefined);
  }

  getAdjustedMusicPosition(): number {
    return this.musicScoreController.getAdjustedMusicPosition(
      this.judgeOffsetFrames,
    );
  }

  peekAdjustedMusicPosition(): number {
    return this.musicScoreController.peekAdjustedMusicPosition(
      this.judgeOffsetFrames,
    );
  }

  beginManualJudgementTransaction(): ManualJudgementTransaction {
    return this.createManualJudgementTransaction();
  }

  private submitManualJudgement(
    request: Parameters<ManualJudgementTransaction["preflight"]>[0],
  ): SimulatorResult<void> {
    const transaction = this.createManualJudgementTransaction();
    const planned = transaction.preflight(request);
    if (planned.status !== "ok") {
      transaction.abort();
      return planned;
    }
    transaction.commit(planned.value);
    transaction.finish();
    return ok(undefined);
  }

  getManualJudgementOwnership(
    noteInformation: NoteInformation,
  ): ManualJudgementOwnership | null {
    if (!this.autoLiveJudgementSources.has(noteInformation)) {
      return null;
    }
    const longAfterGroup = this.longAfterMultipleGroups.get(noteInformation);
    const slideSource = this.manualSlideSources.get(noteInformation);
    const isLong = noteInformation.fireNoteType === FrontNoteType.Long;
    return Object.freeze({
      multipleDirectionalFlickNoteCount:
        this.multipleDirectionalGroups.get(noteInformation)?.count ?? null,
      multipleDirectionalFlickButtonTypes:
        this.multipleDirectionalGroups.get(noteInformation)?.buttonTypes ?? null,
      longAfterAbsolutePosition: isLong
        ? noteInformation.afterNoteAbsolutePos
        : null,
      longAfterNoteType: isLong
        ? manualLongAfterNoteType(noteInformation.afterNoteType)
        : null,
      longAfterButtonTypes: isLong
        ? longAfterGroup?.buttonTypes ?? noteInformation.buttonTypesArray
        : null,
      longAfterMultipleCount: isLong
        ? longAfterGroup?.count ?? null
        : null,
      slidePhase: slideSource?.phase ?? null,
      slideAllowedNoteTypes: slideSource?.allowedNoteTypes ?? null,
      slideAbsolutePosition: slideSource?.absolutePosition ?? null,
      slideButtonTypes: slideSource?.buttonTypes ?? null,
    });
  }

  ownsManualJudgementSource(noteInformation: NoteInformation): boolean {
    return this.getManualJudgementOwnership(noteInformation) !== null;
  }

  registerManualNoteDeactivatedOwner(
    owner: (note: NoteBase) => void,
  ): SimulatorResult<void> {
    if (typeof owner !== "function" || this.manualNoteDeactivatedOwner !== null) {
      return evidenceRequired(
        "manual.note-deactivation-owner-invalid-or-duplicate",
        ["D12", "D14", "MJ15", "MJ22", "MJ25"],
        "NoteManager accepts exactly one dispatcher-owned manual finger cleanup callback.",
      );
    }
    this.manualNoteDeactivatedOwner = owner;
    return ok(undefined);
  }

  selectManualCandidateBeforeJudgement(
    buttonType: ButtonTypeValue,
  ): SimulatorResult<NoteBase | null> {
    let ordinaryCandidate: NoteBase | null = null;
    let ordinaryDistance = Number.POSITIVE_INFINITY;
    let slideCandidate: NoteSlide | null = null;
    let slideDistance = Number.POSITIVE_INFINITY;
    const musicPosition = Math.fround(this.musicScoreController.musicPosition);

    for (const note of this.activeNotesValue) {
      if (!note.isContainsButton(buttonType)) {
        continue;
      }
      if (note instanceof NoteSlide) {
        const source = note.manualCandidateSource;
        if (source === null) {
          continue;
        }
        const distance = Math.fround(Math.abs(
          Math.fround(source.absolutePos) - musicPosition,
        ));
        if (distance < slideDistance) {
          slideCandidate = note;
          slideDistance = distance;
        }
        continue;
      }
      const information = note.noteInformation;
      if (information === null) {
        return evidenceRequired(
          "manual.active-candidate-without-information",
          ["D04", "MJ03"],
          "Every active candidate in the owner scan must retain its activated NoteInformation.",
        );
      }
      const distance = Math.fround(Math.abs(
        Math.fround(information.absolutePos) - musicPosition,
      ));
      if (distance < ordinaryDistance) {
        ordinaryCandidate = note;
        ordinaryDistance = distance;
      }
    }
    if (ordinaryCandidate === null) {
      return ok(slideCandidate);
    }
    if (slideCandidate === null) {
      return ok(ordinaryCandidate);
    }
    const ordinarySource = ordinaryCandidate.noteInformation;
    const slideSource = slideCandidate.manualCandidateSource;
    if (ordinarySource === null || slideSource === null) {
      return evidenceRequired(
        "manual.candidate-button-owner-unavailable",
        ["D04", "D10", "MJ04"],
        "Near-line arbitration requires both candidates' owner-derived current buttons.",
      );
    }
    const near = this.slideNoteManager.selectNearJudgeLineSource(
      ordinarySource,
      slideSource,
      this.getAdjustedMusicPosition(),
    );
    if (near.status !== "ok") {
      return near;
    }
    return ok(near.value === "first" ? ordinaryCandidate : slideCandidate);
  }

  snapshot(): NoteManagerSnapshot {
    return {
      batchCount: this.batches.length,
      nextBatchIndex: this.nextBatchIndexValue,
      activeNotePoolObjectIds: this.activeNotesValue.map(
        (note) => note.poolObjectId,
      ),
      activeBpmPoolIndices: this.activeBpmChangesValue.map(
        (note) => note.poolIndex,
      ),
      bpmPoolCursor: this.bpmPoolCursorValue,
      bpmPool: this.bpmPoolValue.map((note) => note.snapshot()),
      pools: [...this.notePoolsValue.values()].map((pool) => ({
        family: pool.family,
        cursor: pool.cursor,
        objects: pool.objects.map((note) => note.snapshot()),
      })),
      slideNoteManagerInitialized: this.slideNoteManager.isInitialized,
      schedulerTrace: [...this.schedulerTraceValue],
      bpmChangeCount: this.bpmChangeCount,
      performanceLevelCounters: [...this.performanceLevelCountersValue],
      calculatedData: this.inGameCalculatedData.snapshot(),
    };
  }

  dispose(): SimulatorResult<void> {
    for (const pool of this.notePoolsValue.values()) {
      for (const note of pool.objects) {
        const reset = note.resetForDispose();
        if (reset.status !== "ok") {
          return reset;
        }
      }
      pool.cursor = 0;
    }
    for (const bpm of this.bpmPoolValue) {
      bpm.resetForDispose();
    }
    this.activeNotesValue.length = 0;
    this.activeBpmChangesValue.length = 0;
    this.bpmPoolCursorValue = 0;
    this.outerFrameIndexValue = 0;
    this.slideNoteManager.dispose();
    return ok(undefined);
  }

  private setupMultipleDirectionalGroups(): void {
    for (const batch of this.batches) {
      for (const group of groupMultipleDirectionalInformationList(batch.informationList)) {
        const owner = new MultipleDirectionalGroupOwner(group);
        for (const information of group) {
          this.multipleDirectionalGroups.set(information, owner);
        }
      }
    }
  }

  private setupLongAfterMultipleGroups(): SimulatorResult<void> {
    const allInformation = this.batches.flatMap((batch) => batch.informationList);
    for (const root of allInformation) {
      if (
        root.fireNoteType !== FrontNoteType.Long ||
        (root.afterNoteType !== AfterNoteType.MultipleDirectionalFlickLeft &&
          root.afterNoteType !== AfterNoteType.MultipleDirectionalFlickRight)
      ) {
        continue;
      }
      const members = [
        root,
        ...allInformation.filter((candidate) =>
          candidate !== root &&
          candidate.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd &&
          directionalEndpointPosition(candidate) === root.afterNoteAbsolutePos &&
          isSameDirectionalGroup(root, candidate)),
      ];
      if (members.length < 2) {
        return evidenceRequired(
          "manual.long-multiple-after-group-missing",
          ["R16.D17", "D08", "D12", "MJ13"],
          `Long root ${root.index} has a Multiple after type without its chart-owned side group.`,
        );
      }
      this.longAfterMultipleGroups.set(
        root,
        new MultipleDirectionalGroupOwner(members, directionalEndpointButton),
      );
    }
    return ok(undefined);
  }

  private setupSlideAfterMultipleGroups(): SimulatorResult<void> {
    const allInformation = this.batches.flatMap((batch) => batch.informationList);
    for (const root of allInformation) {
      if (
        (root.fireNoteType !== FrontNoteType.SlideA && root.fireNoteType !== FrontNoteType.SlideB) ||
        (root.afterNoteType !== AfterNoteType.SlideMultipleDirectionalFlickLeft &&
          root.afterNoteType !== AfterNoteType.SlideMultipleDirectionalFlickRight)
      ) {
        continue;
      }
      const visualType = root.fireNoteType === FrontNoteType.SlideA
        ? FrontNoteType.SlideAMultipleDirectionalFlickAdd
        : FrontNoteType.SlideBMultipleDirectionalFlickAdd;
      const members = [
        root,
        ...allInformation.filter((candidate) =>
          candidate !== root &&
          candidate.fireNoteType === visualType &&
          directionalEndpointPosition(candidate) === directionalEndpointPosition(root) &&
          isSameDirectionalGroup(root, candidate)),
      ];
      if (members.length < 2) {
        return evidenceRequired(
          "manual.slide-multiple-after-group-missing",
          ["R16.D17", "D08", "D12", "MJ21"],
          `Slide root ${root.index} has a Multiple terminal without its chart-owned side group.`,
        );
      }
      this.slideAfterMultipleGroups.set(
        root,
        new MultipleDirectionalGroupOwner(members, directionalEndpointButton),
      );
    }
    return ok(undefined);
  }

  getAutoLiveJudgementOwnership(
    information: NoteInformation,
  ): AutoLiveJudgementOwnership | null {
    if (!this.autoLiveJudgementSources.has(information)) {
      return null;
    }
    return {
      multipleDirectionalFlickNoteCount:
        this.multipleDirectionalGroups.get(information)?.count ?? null,
    };
  }

  private resolveLongAfterMultipleGroup(
    information: NoteInformation,
  ): SimulatorResult<MultipleDirectionalRuntimeGroup | null> {
    return ok(this.longAfterMultipleGroups.get(information) ?? null);
  }

  private resolveSlideAfterMultipleGroup(
    information: NoteInformation,
  ): SimulatorResult<MultipleDirectionalRuntimeGroup | null> {
    return ok(this.slideAfterMultipleGroups.get(information) ?? null);
  }

  private resolveMultipleDirectionalGroup(
    information: NoteInformation,
  ): SimulatorResult<MultipleDirectionalRuntimeGroup> {
    const group = this.multipleDirectionalGroups.get(information);
    if (group === undefined) {
      return evidenceRequired(
        "auto-live.multiple-directional-group-missing",
        ["R10", "R13", "R16"],
        `Multiple Directional note ${information.index} has no confirmed adjacent-button runtime group.`,
      );
    }
    return ok(group);
  }

  private activateCurrentBatch(substepIndex: number): SimulatorResult<void> {
    const batch = this.batches[this.nextBatchIndexValue];
    if (batch === undefined) {
      return ok(undefined);
    }

    const activationDecision = this.clock.canActivateBatch(batch);
    if (activationDecision.status !== "ok") {
      return activationDecision;
    }
    if (!activationDecision.value) {
      return ok(undefined);
    }

    const bpmCommand = batch.informationList.find(isBpmCommand);
    if (bpmCommand !== undefined) {
      const bpmObject = this.acquireBpmObject();
      if (bpmObject.status !== "ok") {
        return bpmObject;
      }
      this.musicScoreController.updateNextBpm(
        bpmCommand.bpm,
        bpmCommand.bpmString,
      );
      bpmObject.value.setup(
        bpmCommand,
        (completed) => this.removeActiveBpmChange(completed),
      );
      this.activeBpmChangesValue.push(bpmObject.value);
      this.schedulerTraceValue.push({
        kind: "bpm-activate",
        substepIndex,
        noteIndex: bpmCommand.index,
        poolObjectId: `bpm:${bpmObject.value.poolIndex}`,
      });
    }

    for (const noteInformation of batch.informationList) {
      if (isNonPlayableCommand(noteInformation)) {
        continue;
      }
      const noteResult = this.acquirePoolObject(noteInformation);
      if (noteResult.status !== "ok") {
        return noteResult;
      }
      const renderActivation = this.renderProducer?.preflightNoteActivation(
        noteResult.value.note.poolObjectId,
        noteInformation,
        substepIndex,
      ) ?? null;
      if (renderActivation?.status === "evidence-required") return renderActivation;
      const activationResult = noteResult.value.note.activate(noteInformation);
      if (activationResult.status !== "ok") {
        if (renderActivation?.status === "ok") renderActivation.value.discard();
        return activationResult;
      }
      noteResult.value.pool.cursor = noteResult.value.nextCursor;
      if (renderActivation?.status === "ok") {
        const committed = renderActivation.value.commit();
        if (committed.status !== "ok") return committed;
      }
      this.schedulerTraceValue.push({
        kind: "note-activate",
        substepIndex,
        noteIndex: noteInformation.index,
        poolObjectId: noteResult.value.note.poolObjectId,
      });
    }

    this.schedulerTraceValue.push({
      kind: "group-activate",
      substepIndex,
      batchIndex: this.nextBatchIndexValue,
    });
    this.nextBatchIndexValue += 1;
    return ok(undefined);
  }

  private acquireBpmObject(): SimulatorResult<NoteBpmChange> {
    for (let offset = 0; offset < this.bpmPoolValue.length; offset += 1) {
      const index = (this.bpmPoolCursorValue + offset) % this.bpmPoolValue.length;
      const object = this.bpmPoolValue[index];
      if (object === undefined || object.isActive) {
        continue;
      }
      this.bpmPoolCursorValue = (index + 1) % this.bpmPoolValue.length;
      return ok(object);
    }
    return evidenceRequired(
      "note-manager.bpm-pool-exhausted",
      ["E07", "E10"],
      "The recovered 30-slot BPM pool has no inactive object.",
    );
  }

  private acquirePoolObject(
    noteInformation: NoteInformation,
  ): SimulatorResult<NotePoolAcquisition> {
    const familyResult = noteFamily(noteInformation);
    if (familyResult.status !== "ok") {
      return familyResult;
    }
    const family = familyResult.value;
    const pool = this.notePoolsValue.get(family);
    if (pool === undefined || pool.objects.length === 0) {
      return evidenceRequired(
        "note-manager.pool-missing",
        ["E06", "E10"],
        `No ${family} pool exists for note ${noteInformation.index}.`,
      );
    }

    for (let offset = 0; offset < pool.objects.length; offset += 1) {
      const index = (pool.cursor + offset) % pool.objects.length;
      const note = pool.objects[index];
      if (note === undefined || note.state !== NoteState.Deactive) {
        continue;
      }
      return ok({
        note,
        pool,
        nextCursor: (index + 1) % pool.objects.length,
      });
    }

    return evidenceRequired(
      "note-manager.pool-exhausted",
      ["E04", "E06"],
      `No deactive ${family} pool object is available for note ${noteInformation.index}.`,
    );
  }

  private appendActiveNote(note: NoteBase): void {
    if (!this.activeNotesValue.includes(note)) {
      this.activeNotesValue.push(note);
    }
  }

  private removeActiveNote(note: NoteBase): void {
    const index = this.activeNotesValue.indexOf(note);
    if (index >= 0) {
      this.activeNotesValue.splice(index, 1);
    }
  }

  private removeActiveBpmChange(note: NoteBpmChange): void {
    const index = this.activeBpmChangesValue.indexOf(note);
    if (index >= 0) {
      this.activeBpmChangesValue.splice(index, 1);
    }
  }
}

export function selectSubstepCount(
  deltaTimeSeconds: number,
  bpmChangeCount: number,
  counters: PerformanceLevelCounters,
): 1 | 2 | 3 | 4 {
  if (bpmChangeCount < 1) {
    return 1;
  }

  const delta = Math.fround(deltaTimeSeconds);
  let bucketIndex: 0 | 1 | 2 | 3;
  let substepCount: 1 | 2 | 3 | 4;
  if (delta < 0.0179999992) {
    bucketIndex = 0;
    substepCount = 1;
  } else if (delta < 0.0329999998) {
    bucketIndex = 1;
    substepCount = 2;
  } else if (delta < 0.0500000007) {
    bucketIndex = 2;
    substepCount = 3;
  } else {
    bucketIndex = 3;
    substepCount = 4;
  }

  counters[bucketIndex] = (counters[bucketIndex] + 1) >>> 0;
  if (counters[1] > 100 || counters[2] > 20 || counters[3] > 5) {
    return 1;
  }
  return substepCount;
}

export function noteFamily(
  noteInformation: NoteInformation,
): SimulatorResult<NoteFamily> {
  switch (noteInformation.fireNoteType) {
    case FrontNoteType.Normal:
      return ok("normal");
    case FrontNoteType.Long:
      return ok("long");
    case FrontNoteType.Flick:
      return ok("flick");
    case FrontNoteType.SlideA:
    case FrontNoteType.SlideB:
      return ok("slide");
    case FrontNoteType.DirectionalFlick:
      return ok("directional-flick");
    case FrontNoteType.MultipleDirectionalFlick:
      return ok("multiple-directional-flick");
    case FrontNoteType.LongMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideAMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideBMultipleDirectionalFlickAdd:
      return ok("multiple-directional-visual");
    default:
      return evidenceRequired(
        "note-manager.unrepresented-note-family",
        ["E11", "E13"],
        `FrontNoteType ${noteInformation.fireNoteType} has no recovered playable-root pool mapping.`,
      );
  }
}

export function groupMultipleDirectionalInformationList(
  informationList: readonly NoteInformation[],
): readonly (readonly NoteInformation[])[] {
  const groups: NoteInformation[][] = [];
  let currentGroup: NoteInformation[] = [];
  for (const information of informationList) {
    if (isNonPlayableCommand(information)) {
      continue;
    }
    if (information.fireNoteType !== FrontNoteType.MultipleDirectionalFlick) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }
    const previous = currentGroup[currentGroup.length - 1];
    if (
      previous !== undefined &&
      previous.gameNoteType === information.gameNoteType &&
      Math.abs(previous.buttonType - information.buttonType) === 1
    ) {
      currentGroup.push(information);
      continue;
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    currentGroup = [information];
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}

function isBpmCommand(noteInformation: NoteInformation): boolean {
  return noteInformation.ccNum === 3 || noteInformation.ccNum === 8;
}

function validateBpmCommand(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  if (!isBpmCommand(noteInformation)) {
    return ok(undefined);
  }
  const bpm = Math.fround(noteInformation.bpm);
  if (
    noteInformation.denominator === 0 ||
    !Number.isFinite(noteInformation.bpm) ||
    !Number.isFinite(bpm) ||
    bpm <= 0 ||
    noteInformation.bpmString.length === 0
  ) {
    return evidenceRequired(
      "runtime.invalid-bpm-command",
      ["E07", "E10", "U03"],
      "CC03/CC08 commands require a nonzero denominator, positive finite BPM and original string before scheduler mutation.",
    );
  }
  return ok(undefined);
}

function isNonPlayableCommand(noteInformation: NoteInformation): boolean {
  return noteInformation.buttonType === ButtonType.None;
}

const unavailableManualInputGeometry: SimulatorManualInputGeometryBackend = {
  resolveButton: () => evidenceRequired(
    "manual-input.geometry-resolver-unavailable",
    ["D03", "D04", "D15", "MJ03", "MJ26"],
    "A direct NoteManager without a host geometry owner cannot resolve screen input.",
  ),
  screenToWorld: () => evidenceRequired(
    "manual-input.screen-to-world-unavailable",
    ["D07", "MJ08", "MJ09"],
    "A direct NoteManager without a host geometry owner cannot project screen positions.",
  ),
  getDistanceNormalization: () => evidenceRequired(
    "manual-input.distance-normalization-unavailable",
    ["D07", "MJ08", "MJ09"],
    "A direct NoteManager without a host geometry owner cannot provide native distance scales.",
  ),
  isInsideTargetButtons: () => evidenceRequired(
    "manual-input.target-containment-unavailable",
    ["D09", "D10", "MJ14", "MJ20"],
    "A direct NoteManager without a host geometry owner cannot test target containment.",
  ),
};

function createUnavailableManualJudgementTransaction(): ManualJudgementTransaction {
  return {
    preflight: () => evidenceRequired(
      "one-frame.manual-transaction-owner-unregistered",
      ["D05", "D14", "D15", "MJ26"],
      "Production manual judgement requires the engine OneFrame controller transaction owner.",
    ),
    commit: () => {
      throw new Error("Unavailable manual judgement transaction cannot commit");
    },
    abort: () => {},
    finish: () => {},
  };
}

function createDefaultPoolObject(
  family: NoteFamily,
  poolObjectId: string,
): NoteBase {
  switch (family) {
    case "normal":
      return new NoteNormal(poolObjectId);
    case "long":
      return new NoteLong(poolObjectId);
    case "slide":
      return new NoteSlide(poolObjectId);
    case "flick":
      return new NoteFlick(poolObjectId);
    case "directional-flick":
      return new NoteDirectionalFlick(poolObjectId);
    case "multiple-directional-flick":
      return new NoteMultipleDirectionalFlick(poolObjectId);
    case "multiple-directional-visual":
      return new NoteMultipleDirectionalVisual(poolObjectId);
  }
}

function manualSlideTerminalNoteTypes(
  afterNoteType: number,
  gameNoteType: number,
): readonly number[] {
  const movementType = gameNoteType >= 4 && gameNoteType <= 8
    ? 8
    : gameNoteType === 9 || gameNoteType === 10
    ? 9
    : gameNoteType === 11 || gameNoteType === 12
    ? 10
    : 8;
  const finalType = afterNoteType === AfterNoteType.SlideFlickEnd
    ? 6
    : afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft ||
      afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight
    ? 7
    : afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft ||
      afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight
    ? 8
    : 5;
  return movementType === finalType
    ? [movementType]
    : [movementType, finalType];
}

function manualLongAfterNoteType(afterNoteType: number): 2 | 5 | 6 | 7 | null {
  switch (afterNoteType) {
    case AfterNoteType.Normal:
      return 2;
    case AfterNoteType.Flick:
      return 5;
    case AfterNoteType.DirectionalFlickLeft:
    case AfterNoteType.DirectionalFlickRight:
      return 6;
    case AfterNoteType.MultipleDirectionalFlickLeft:
    case AfterNoteType.MultipleDirectionalFlickRight:
      return 7;
    default:
      return null;
  }
}

class MultipleDirectionalGroupOwner implements MultipleDirectionalRuntimeGroup {
  private usedValue = false;
  private activeManualFingerId = -1;
  private readonly projectedManualFingers = new WeakMap<object, number>();
  readonly count: number;
  readonly buttonTypes: readonly ButtonTypeValue[];

  constructor(
    group: readonly NoteInformation[],
    getButtonType: (information: NoteInformation) => ButtonTypeValue =
      (information) => information.buttonType,
  ) {
    this.count = group.length;
    this.buttonTypes = Object.freeze(group.map(getButtonType));
  }

  get isUsed(): boolean {
    return this.usedValue;
  }

  preflightManualFinger(transaction: object, fingerId: number): SimulatorResult<void> {
    const projectedFinger = this.projectedManualFingers.get(transaction) ?? -1;
    if (
      this.usedValue ||
      (this.activeManualFingerId >= 0 && this.activeManualFingerId !== fingerId) ||
      (projectedFinger >= 0 && projectedFinger !== fingerId)
    ) {
      return evidenceRequired(
        "manual.multiple-directional-finger-owner-conflict",
        ["D06", "D08", "D15", "MJ06", "MJ10", "MJ26"],
        "A Multiple Directional group accepts one owner finger before side consumption.",
      );
    }
    this.projectedManualFingers.set(transaction, fingerId);
    return ok(undefined);
  }

  commitManualFinger(transaction: object, fingerId: number): void {
    if (
      this.projectedManualFingers.get(transaction) !== fingerId ||
      (this.activeManualFingerId >= 0 && this.activeManualFingerId !== fingerId) ||
      this.usedValue
    ) {
      throw new Error("Multiple Directional manual finger owner changed after preflight");
    }
    this.activeManualFingerId = fingerId;
    this.projectedManualFingers.delete(transaction);
  }

  clearManualFinger(fingerId: number): void {
    if (this.activeManualFingerId === fingerId) {
      this.activeManualFingerId = -1;
    }
  }

  markUsed(): SimulatorResult<void> {
    if (this.usedValue) {
      return evidenceRequired(
        "multiple-directional.group-already-used",
        ["R10", "R12", "R16", "D08", "MJ10"],
        "A connected Multiple Directional group produces one judgement before its side owner is consumed.",
      );
    }
    this.usedValue = true;
    return ok(undefined);
  }
}
