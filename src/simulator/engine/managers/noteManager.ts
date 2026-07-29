import {
  ButtonType,
  FrontNoteType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../chart/types";
import type { NoteFamily } from "../data/noteData";
import type { OneFrameDataHandle } from "../data/oneFrameData";
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
  private readonly autoLiveJudgementSources = new WeakSet<NoteInformation>();

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
    const slideInitialization = this.slideNoteManager.initialize();
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
          for (const source of noteInformation.slideNoteList) {
            this.autoLiveJudgementSources.add(source);
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

    for (const [family, notes] of familyNotes) {
      const objects = notes.map((_, index) => {
        const note = this.createPoolObject(family, `${family}:${index}`);
        note.setLifecycleCallbacks({
          onActivate: (activeNote) => this.appendActiveNote(activeNote),
          onDeactivate: (inactiveNote) => this.removeActiveNote(inactiveNote),
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
        if (note instanceof NoteMultipleDirectionalFlick) {
          note.registerMultipleDirectionalGroupResolver(
            (information) => this.resolveMultipleDirectionalGroup(information),
          );
        }
        return note;
      });
      this.notePoolsValue.set(family, { family, objects, cursor: 0 });
    }

    this.setupComplete = true;
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

  selectManualCandidateBeforeJudgement(
    buttonType: ButtonTypeValue,
  ): SimulatorResult<NoteBase | null> {
    let ordinaryCandidate: NoteBase | null = null;
    let ordinaryDistance = Number.POSITIVE_INFINITY;
    const musicPosition = Math.fround(this.musicScoreController.musicPosition);

    for (const note of this.activeNotesValue) {
      if (!note.isContainsButton(buttonType)) {
        continue;
      }
      if (note instanceof NoteSlide) {
        return evidenceRequired(
          "manual.slide-candidate-position-unimplemented",
          ["D04", "D10", "MJ04", "MJ20"],
          "Slide candidate arbitration requires its current-node and near-judge-line owner projection; absolute chart position cannot substitute for that owner state.",
        );
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
    return ok(ordinaryCandidate);
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
        const owner = new MultipleDirectionalGroupOwner(group.length);
        for (const information of group) {
          this.multipleDirectionalGroups.set(information, owner);
        }
      }
    }
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
      const activationResult = noteResult.value.note.activate(noteInformation);
      if (activationResult.status !== "ok") {
        return activationResult;
      }
      noteResult.value.pool.cursor = noteResult.value.nextCursor;
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

class MultipleDirectionalGroupOwner implements MultipleDirectionalRuntimeGroup {
  private usedValue = false;

  constructor(readonly count: number) {}

  get isUsed(): boolean {
    return this.usedValue;
  }

  markUsed(): SimulatorResult<void> {
    if (this.usedValue) {
      return evidenceRequired(
        "auto-live.multiple-directional-group-already-used",
        ["R10", "R12", "R16"],
        "A connected Multiple Directional group produces one Auto Live judgement.",
      );
    }
    this.usedValue = true;
    return ok(undefined);
  }
}
