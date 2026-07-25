import type {
  NoteBatchInformation,
  NoteBatchInformationList,
  NoteFamily,
  NoteInformationFixture,
} from "../data/noteData";
import type { OneFrameDataHandle } from "../data/oneFrameData";
import {
  evidenceRequired,
  ok,
  type EvidenceReference,
  type SimulatorResult,
} from "../evidence";
import { NoteBase, NoteState } from "../notes/noteBase";
import {
  NoteDirectionalFlick,
  NoteFlick,
  NoteLong,
  NoteMultipleDirectionalFlick,
  NoteNormal,
  NoteSlide,
} from "../notes/noteTypes";
import { SlideNoteManager } from "./slideNoteManager";

export interface NoteManagerClock {
  advance(deltaTimeSeconds: number): SimulatorResult<void>;
  canActivateBatch(batch: NoteBatchInformation): SimulatorResult<boolean>;
}

export type NotePoolObjectFactory = (
  family: NoteFamily,
  poolObjectId: string,
  evidence: readonly EvidenceReference[],
) => NoteBase;

export type NoteManagerTraceEntry =
  | {
      readonly kind: "frame";
      readonly deltaTimeSeconds: number;
      readonly substepCount: number;
    }
  | {
      readonly kind: "music-advance";
      readonly substepIndex: number;
      readonly deltaTimeSeconds: number;
    }
  | {
      readonly kind: "note-update" | "note-after-update" | "note-activate";
      readonly substepIndex: number;
      readonly fixtureId: string;
      readonly poolObjectId: string;
    };

export interface NotePoolSnapshot {
  readonly family: NoteFamily;
  readonly cursor: number;
  readonly objects: readonly ReturnType<NoteBase["snapshot"]>[];
}

export interface NoteManagerSnapshot {
  readonly batchCount: number;
  readonly nextBatchIndex: number;
  readonly activeNoteIds: readonly string[];
  readonly pools: readonly NotePoolSnapshot[];
  readonly slideNoteManagerInitialized: boolean;
  readonly schedulerTrace: readonly NoteManagerTraceEntry[];
  readonly unresolvedSchedulerGaps: readonly ["G06"];
}

interface NotePool {
  readonly family: NoteFamily;
  readonly objects: NoteBase[];
  cursor: number;
}

export class NoteManager {
  private readonly activeNotesValue: NoteBase[] = [];
  private readonly notePoolsValue = new Map<NoteFamily, NotePool>();
  private readonly schedulerTraceValue: NoteManagerTraceEntry[] = [];
  private nextBatchIndexValue = 0;
  private setupComplete = false;

  constructor(
    private readonly batches: NoteBatchInformationList,
    readonly slideNoteManager: SlideNoteManager,
    private readonly clock: NoteManagerClock,
    private readonly getUsableOneFrameData: () => SimulatorResult<OneFrameDataHandle>,
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

    const familyFixtures = new Map<NoteFamily, NoteInformationFixture[]>();
    for (const batch of this.batches) {
      for (const fixture of batch.informationList) {
        const fixtures = familyFixtures.get(fixture.family.value) ?? [];
        fixtures.push(fixture);
        familyFixtures.set(fixture.family.value, fixtures);
      }
    }

    for (const [family, fixtures] of familyFixtures) {
      const objects = fixtures.map((fixture, index) => {
        const note = this.createPoolObject(
          family,
          `${family}:${index}`,
          fixture.family.evidence,
        );
        note.setLifecycleCallbacks({
          onActivate: (activeNote) => this.appendActiveNote(activeNote),
          onDeactivate: (inactiveNote) => this.removeActiveNote(inactiveNote),
        });
        note.registerCallbackGetUsableOneFrameData(this.getUsableOneFrameData);
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

    const substepCount = selectSubstepCount(deltaTimeSeconds);
    const substepDelta = deltaTimeSeconds / substepCount;
    this.schedulerTraceValue.push({
      kind: "frame",
      deltaTimeSeconds,
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
      });

      const afterUpdateNotes: NoteBase[] = [];
      let activeIndex = this.activeNotesValue.length - 1;
      while (activeIndex >= 0) {
        const note = this.activeNotesValue[activeIndex];
        if (note === undefined) {
          return evidenceRequired(
            "note-manager.cross-note-list-mutation",
            ["E07"],
            "The fixed reverse index became invalid after a cross-Note removal; G03 has no confirmed original caller for this path.",
          );
        }

        const fixtureId = note.fixtureId;
        this.schedulerTraceValue.push({
          kind: "note-update",
          substepIndex,
          fixtureId,
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
          fixtureId: note.fixtureId,
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

  snapshot(): NoteManagerSnapshot {
    return {
      batchCount: this.batches.length,
      nextBatchIndex: this.nextBatchIndexValue,
      activeNoteIds: this.activeNotesValue.map((note) => note.fixtureId),
      pools: [...this.notePoolsValue.values()].map((pool) => ({
        family: pool.family,
        cursor: pool.cursor,
        objects: pool.objects.map((note) => note.snapshot()),
      })),
      slideNoteManagerInitialized: this.slideNoteManager.isInitialized,
      schedulerTrace: [...this.schedulerTraceValue],
      unresolvedSchedulerGaps: ["G06"],
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

    for (const fixture of batch.informationList) {
      const noteResult = this.acquirePoolObject(fixture);
      if (noteResult.status !== "ok") {
        return noteResult;
      }
      const activationResult = noteResult.value.activate(fixture);
      if (activationResult.status !== "ok") {
        return activationResult;
      }
      this.schedulerTraceValue.push({
        kind: "note-activate",
        substepIndex,
        fixtureId: fixture.fixtureId,
        poolObjectId: noteResult.value.poolObjectId,
      });
    }

    this.nextBatchIndexValue += 1;
    return ok(undefined);
  }

  private acquirePoolObject(
    fixture: NoteInformationFixture,
  ): SimulatorResult<NoteBase> {
    const pool = this.notePoolsValue.get(fixture.family.value);
    if (pool === undefined || pool.objects.length === 0) {
      return evidenceRequired(
        "note-manager.pool-missing",
        ["E06", "E10"],
        `No ${fixture.family.value} pool exists for ${fixture.fixtureId}.`,
      );
    }

    for (let offset = 0; offset < pool.objects.length; offset += 1) {
      const index = (pool.cursor + offset) % pool.objects.length;
      const note = pool.objects[index];
      if (note.state !== NoteState.Deactive) {
        continue;
      }
      pool.cursor = (index + 1) % pool.objects.length;
      return ok(note);
    }

    return evidenceRequired(
      "note-manager.pool-exhausted",
      ["E04", "E06"],
      `No deactive ${fixture.family.value} pool object is available for ${fixture.fixtureId}.`,
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
}

export function selectSubstepCount(deltaTimeSeconds: number): 1 | 2 | 3 | 4 {
  if (deltaTimeSeconds < 0.018) {
    return 1;
  }
  if (deltaTimeSeconds < 0.033) {
    return 2;
  }
  if (deltaTimeSeconds < 0.05) {
    return 3;
  }
  return 4;
}

function createDefaultPoolObject(
  family: NoteFamily,
  poolObjectId: string,
  evidence: readonly EvidenceReference[],
): NoteBase {
  switch (family) {
    case "normal":
      return new NoteNormal(poolObjectId, evidence);
    case "long":
      return new NoteLong(poolObjectId, evidence);
    case "slide":
      return new NoteSlide(poolObjectId, evidence);
    case "flick":
      return new NoteFlick(poolObjectId, evidence);
    case "directional-flick":
      return new NoteDirectionalFlick(poolObjectId, evidence);
    case "multiple-directional-flick":
      return new NoteMultipleDirectionalFlick(poolObjectId, evidence);
  }
}
