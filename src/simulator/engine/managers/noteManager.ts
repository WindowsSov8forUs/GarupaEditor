import {
  ButtonType,
  FrontNoteType,
  type NoteBatchInformation,
  type NoteInformation,
} from "../chart/types";
import type { NoteFamily } from "../data/noteData";
import type { OneFrameDataHandle } from "../data/oneFrameData";
import type { InGameCalculatedData } from "../data/inGameCalculatedData";
import type { AutoLiveJudgementRequest } from "../data/autoLiveJudgement";
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
  NoteNormal,
  NoteSlide,
} from "../notes/noteTypes";
import { SlideNoteManager } from "./slideNoteManager";
import type { InGameMusicScoreController } from "./inGameMusicScoreController";

const BPM_POOL_LENGTH = 30;

export interface NoteManagerClock {
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
    }
  | {
      readonly kind: "music-advance";
      readonly substepIndex: number;
      readonly deltaTimeSeconds: number;
      readonly executeFrame: number;
    }
  | {
      readonly kind:
        | "bpm-update"
        | "bpm-activate"
        | "note-update"
        | "note-after-update"
        | "note-activate";
      readonly substepIndex: number;
      readonly noteIndex: number;
      readonly poolObjectId: string;
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
}

export type PerformanceLevelCounters = [number, number, number, number];

interface NotePool {
  readonly family: NoteFamily;
  readonly objects: NoteBase[];
  cursor: number;
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
  private readonly performanceLevelCountersValue: PerformanceLevelCounters = [
    0, 0, 0, 0,
  ];
  private nextBatchIndexValue = 0;
  private bpmPoolCursorValue = 0;
  private setupComplete = false;

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

  execAwakeEnd(): SimulatorResult<void> {
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

    const familyNotes = new Map<NoteFamily, NoteInformation[]>();
    for (const batch of this.batches) {
      for (const noteInformation of batch.informationList) {
        if (isNonPlayableCommand(noteInformation)) {
          continue;
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
          getAdjustedMusicPosition: () => this.getAdjustedMusicPosition(),
          submitJudgement: this.submitAutoLiveJudgement,
        });
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
    const substepCount = selectSubstepCount(
      frameDelta,
      this.bpmChangeCount,
      this.performanceLevelCountersValue,
    );
    const substepDelta = Math.fround(frameDelta / substepCount);
    const substepExecuteFrame = Math.fround(executeFrame / substepCount);
    this.clock.setExecuteFrame(substepExecuteFrame);
    this.schedulerTraceValue.push({
      kind: "frame",
      deltaTimeSeconds: frameDelta,
      executeFrame,
      substepCount,
    });

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
        this.schedulerTraceValue.push({
          kind: "note-update",
          substepIndex,
          noteIndex,
          poolObjectId: note.poolObjectId,
        });
        const updateResult = note.executeUpdate(substepDelta);
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
    };
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
      const activationResult = noteResult.value.activate(noteInformation);
      if (activationResult.status !== "ok") {
        return activationResult;
      }
      this.schedulerTraceValue.push({
        kind: "note-activate",
        substepIndex,
        noteIndex: noteInformation.index,
        poolObjectId: noteResult.value.poolObjectId,
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
  ): SimulatorResult<NoteBase> {
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
      pool.cursor = (index + 1) % pool.objects.length;
      return ok(note);
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
    case FrontNoteType.LongMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideAMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideBMultipleDirectionalFlickAdd:
      return ok("multiple-directional-flick");
    default:
      return evidenceRequired(
        "note-manager.unrepresented-note-family",
        ["E11", "E13"],
        `FrontNoteType ${noteInformation.fireNoteType} has no recovered playable-root pool mapping.`,
      );
  }
}

function isBpmCommand(noteInformation: NoteInformation): boolean {
  return noteInformation.ccNum === 3 || noteInformation.ccNum === 8;
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
  }
}
