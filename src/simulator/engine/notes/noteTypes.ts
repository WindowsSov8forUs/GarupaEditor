import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import {
  AfterNoteType,
  type AfterNoteTypeValue,
  type NoteInformation,
} from "../chart/types";
import { NoteBase } from "./noteBase";

export class NoteFrontBase extends NoteBase {}

export class NoteAfterBase extends NoteBase {}

export class NoteNormal extends NoteFrontBase {}

export class NoteLong extends NoteFrontBase {
  private afterNoteValue: LongAfterRuntime | null = null;

  get afterNote(): LongAfterRuntime | null {
    return this.afterNoteValue;
  }

  bindAfterNote(afterNote: LongAfterRuntime): void {
    this.afterNoteValue = afterNote;
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    if (
      noteInformation.afterNoteType === AfterNoteType.None ||
      noteInformation.afterNoteAbsolutePos <= noteInformation.absolutePos
    ) {
      return evidenceRequired(
        "auto-live.invalid-long-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Long root ${noteInformation.index} has no confirmed terminal after node.`,
      );
    }
    this.afterNoteValue = new LongAfterRuntime(
      noteInformation.afterNoteAbsolutePos,
      noteInformation.afterNoteType,
      noteInformation.afterNoteShortRhythmUnder8beat,
    );
    return super.activate(noteInformation);
  }
}

export class NoteSlide extends NoteFrontBase {
  private afterNotesValue: readonly SlideAfterRuntime[] = [];

  get afterNotes(): readonly SlideAfterRuntime[] {
    return this.afterNotesValue;
  }

  bindAfterNotes(afterNotes: readonly SlideAfterRuntime[]): void {
    this.afterNotesValue = [...afterNotes];
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    if (!noteInformation.isSlideNoteHead || noteInformation.slideNoteList.length === 0) {
      return evidenceRequired(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no confirmed after-node list.`,
      );
    }
    const seen = new Set<NoteInformation>();
    const afterNotes: SlideAfterRuntime[] = [];
    for (let index = 0; index < noteInformation.slideNoteList.length; index += 1) {
      const source = noteInformation.slideNoteList[index];
      if (source === undefined || seen.has(source)) {
        return evidenceRequired(
          "auto-live.duplicate-or-missing-slide-node",
          ["R01", "R02", "R04", "U01"],
          `Slide root ${noteInformation.index} contains an invalid shared after-node identity.`,
        );
      }
      seen.add(source);
      const isTerminal = index === noteInformation.slideNoteList.length - 1;
      afterNotes.push(new SlideAfterRuntime(source, index, isTerminal));
    }
    this.afterNotesValue = afterNotes;
    return super.activate(noteInformation);
  }
}

export class NoteFlick extends NoteFrontBase {}

export class NoteDirectionalFlick extends NoteFrontBase {}

export class NoteMultipleDirectionalFlick extends NoteFrontBase {}

export class NoteFlickAfter extends NoteAfterBase {}

export class NoteDirectionalFlickAfter extends NoteAfterBase {}

export class NoteMultipleDirectionalFlickAfter extends NoteAfterBase {}

export class NoteSlideAfter extends NoteAfterBase {}

export class NoteSlideFlickAfter extends NoteAfterBase {}

export class NoteSlideDirectionalFlickAfter extends NoteAfterBase {}

export class NoteSlideMultipleDirectionalFlickAfter extends NoteAfterBase {}

export class LongAfterRuntime {
  private judgedValue = false;

  constructor(
    readonly absolutePosition: number,
    readonly afterNoteType: AfterNoteTypeValue,
    readonly shortRhythmUnder8beat: boolean,
  ) {}

  get judged(): boolean {
    return this.judgedValue;
  }

  markJudged(): SimulatorResult<void> {
    if (this.judgedValue) {
      return evidenceRequired(
        "auto-live.long-after-already-judged",
        ["R02", "R04"],
        "The linked Long after node cannot produce a second Auto Live result.",
      );
    }
    this.judgedValue = true;
    return ok(undefined);
  }
}

export class SlideAfterRuntime {
  private judgedValue = false;

  constructor(
    readonly source: NoteInformation,
    readonly sourceIndex: number,
    readonly isTerminal: boolean,
  ) {}

  get judged(): boolean {
    return this.judgedValue;
  }

  markJudged(): SimulatorResult<void> {
    if (this.judgedValue) {
      return evidenceRequired(
        "auto-live.slide-after-already-judged",
        ["R02", "R04"],
        `Slide after node ${this.sourceIndex} cannot produce a second Auto Live result.`,
      );
    }
    this.judgedValue = true;
    return ok(undefined);
  }
}
