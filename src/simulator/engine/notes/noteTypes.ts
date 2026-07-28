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
import { NoteState } from "./noteBase";

export class NoteFrontBase extends NoteBase {}

export class NoteAfterBase extends NoteBase {}

export interface FlickForcePerfectTraceEntry {
  readonly kind: "flick-begin" | "flick-synthetic-move";
  readonly syntheticX?: number;
}

export class NoteSingleBase extends NoteFrontBase {
  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    if (noteInformation === null) {
      return evidenceRequired(
        "auto-live.single-without-note-information",
        ["R02", "R04"],
        "A pooled Single note must be activated before MoveState.",
      );
    }
    const runtime = this.autoLiveRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const adjustedPosition = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjustedPosition)) {
      return evidenceRequired(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Force Perfect crossing requires a finite adjusted music position.",
      );
    }
    if (adjustedPosition < noteInformation.absolutePos) {
      return ok(undefined);
    }
    if (!runtime.value.isAutoPlay()) {
      return evidenceRequired(
        "manual-note-judgement",
        ["R01", "R04"],
        "Manual input and timing judgement are outside the Auto Live stage.",
      );
    }
    return this.forcePerfect();
  }

  protected forcePerfect(): SimulatorResult<void> {
    return this.submitHeadPerfect(this.noteInformation?.gameNoteType ?? 0);
  }

  protected submitHeadPerfect(noteType: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? evidenceRequired(
            "auto-live.single-without-note-information",
            ["R02", "R04"],
            "Force Perfect requires the activated NoteInformation.",
          )
        : runtime;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType,
      absolutePosition: noteInformation.absolutePos,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    return this.changeState(NoteState.Deactive);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }
}

export class NoteNormal extends NoteSingleBase {
  protected override forcePerfect(): SimulatorResult<void> {
    return this.submitHeadPerfect(0);
  }
}

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

export class NoteFlick extends NoteSingleBase {
  private readonly flickTraceValue: FlickForcePerfectTraceEntry[] = [];

  get flickTrace(): readonly FlickForcePerfectTraceEntry[] {
    return this.flickTraceValue.map((entry) => ({ ...entry }));
  }

  protected get forcePerfectSyntheticX(): SimulatorResult<number> {
    return ok(Math.fround(-100));
  }

  protected get forcePerfectJudgeNoteType(): number {
    return 3;
  }

  protected override forcePerfect(): SimulatorResult<void> {
    const synthetic = this.forcePerfectSyntheticX;
    if (synthetic.status !== "ok") {
      return synthetic;
    }
    this.flickTraceValue.push({ kind: "flick-begin" });
    this.flickTraceValue.push({
      kind: "flick-synthetic-move",
      syntheticX: synthetic.value,
    });
    return this.submitHeadPerfect(this.forcePerfectJudgeNoteType);
  }
}

export class NoteDirectionalFlick extends NoteFlick {
  protected override get forcePerfectSyntheticX(): SimulatorResult<number> {
    const sourceType = this.noteInformation?.gameNoteType;
    if (sourceType === 10) {
      return ok(Math.fround(-500));
    }
    if (sourceType === 11) {
      return ok(Math.fround(500));
    }
    return evidenceRequired(
      "auto-live.directional-flick-source-type",
      ["R02", "R04", "R05"],
      `Directional Force Perfect only confirms source note types 10 and 11, received ${String(sourceType)}.`,
    );
  }

  protected override get forcePerfectJudgeNoteType(): number {
    return 9;
  }
}

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
