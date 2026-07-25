import type { NoteBatchInformationList } from "../data/noteData";
import {
  evidenceRequired,
  type SimulatorResult,
} from "../evidence";
import type { NoteBase } from "../notes/noteBase";
import { SlideNoteManager } from "./slideNoteManager";

export interface NoteManagerSnapshot {
  readonly batchCount: number;
  readonly activeNoteIds: readonly string[];
  readonly poolFamilies: readonly string[];
  readonly slideNoteManagerInitialized: boolean;
}

export class NoteManager {
  private readonly activeNotesValue: NoteBase[] = [];
  private readonly notePoolsValue = new Map<string, readonly NoteBase[]>();

  constructor(
    private readonly batches: NoteBatchInformationList,
    readonly slideNoteManager: SlideNoteManager,
  ) {}

  execAwakeEnd(): SimulatorResult<void> {
    return this.slideNoteManager.initialize();
  }

  setupNotes(): SimulatorResult<void> {
    return evidenceRequired(
      "note-manager.setup-notes",
      ["E04", "E06", "E07", "E10"],
      "The first framework batch owns the containers; pool population and active-list callbacks belong to T06.",
    );
  }

  execUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    return evidenceRequired(
      "note-manager.exec-update",
      ["E03", "E04", "E05", "E07"],
      "The scheduler boundary is frozen but is implemented in T07.",
    );
  }

  snapshot(): NoteManagerSnapshot {
    return {
      batchCount: this.batches.length,
      activeNoteIds: this.activeNotesValue.map((note) => note.fixtureId),
      poolFamilies: [...this.notePoolsValue.keys()],
      slideNoteManagerInitialized: this.slideNoteManager.isInitialized,
    };
  }
}
