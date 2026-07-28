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
      return ok(undefined);
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
  private readonly autoLiveTraceValue: LongAutoLiveTraceEntry[] = [];

  get afterNote(): LongAfterRuntime | null {
    return this.afterNoteValue;
  }

  bindAfterNote(afterNote: LongAfterRuntime): void {
    this.afterNoteValue = afterNote;
  }

  get autoLiveTrace(): readonly LongAutoLiveTraceEntry[] {
    return this.autoLiveTraceValue.map((entry) => ({ ...entry }));
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    this.afterNoteValue = null;
    this.autoLiveTraceValue.length = 0;
    if (
      !isLongAfterType(noteInformation.afterNoteType) ||
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

  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? evidenceRequired(
            "auto-live.long-without-note-information",
            ["R02", "R04"],
            "Long MoveState requires an activated root.",
          )
        : runtime;
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return evidenceRequired(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Long Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < noteInformation.absolutePos) {
      return ok(undefined);
    }
    if (!runtime.value.isAutoPlay()) {
      return evidenceRequired(
        "manual-long-judgement",
        ["R01", "R04"],
        "Manual Long acquisition is outside the Auto Live stage.",
      );
    }
    const stateChange = this.changeState(NoteState.Wait);
    if (stateChange.status !== "ok") {
      return stateChange;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType: 0,
      absolutePosition: noteInformation.absolutePos,
    });
    if (submitted.status === "ok") {
      this.autoLiveTraceValue.push({ kind: "long-head-perfect" });
    }
    return submitted;
  }

  protected override waitState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    const after = this.afterNoteValue;
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (after === null || noteInformation === null || runtime.status !== "ok") {
      return evidenceRequired(
        "auto-live.long-runtime-graph-unavailable",
        ["R02", "R04"],
        "Long OnUpdate requires its parent-owned linked after runtime.",
      );
    }
    this.autoLiveTraceValue.push({ kind: "long-after-update" });
    if (!runtime.value.isAutoPlay() || after.judged) {
      return ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return evidenceRequired(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Long tail Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted <= after.absolutePosition) {
      return ok(undefined);
    }
    this.autoLiveTraceValue.push({ kind: "long-linked-after-finish" });
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "tail",
      noteType: longAfterJudgeNoteType(after.afterNoteType),
      absolutePosition: after.absolutePosition,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = after.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.autoLiveTraceValue.push({ kind: "long-tail-perfect" });
    return this.changeState(NoteState.Deactive);
  }

  override executeAfterUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.state === NoteState.Deactive) {
      return ok(undefined);
    }
    this.autoLiveTraceValue.push({ kind: "long-base-after-update" });
    this.autoLiveTraceValue.push({ kind: "long-linked-after-update" });
    return ok(undefined);
  }

  protected override onResetForDispose(): void {
    this.afterNoteValue = null;
    this.autoLiveTraceValue.length = 0;
  }
}

export class NoteSlide extends NoteFrontBase {
  private afterNotesValue: readonly SlideAfterRuntime[] = [];
  private currentAfterIndexValue = 0;
  private readonly autoLiveTraceValue: SlideAutoLiveTraceEntry[] = [];

  get afterNotes(): readonly SlideAfterRuntime[] {
    return this.afterNotesValue;
  }

  bindAfterNotes(afterNotes: readonly SlideAfterRuntime[]): void {
    this.afterNotesValue = [...afterNotes];
  }

  get currentAfterIndex(): number {
    return this.currentAfterIndexValue;
  }

  get autoLiveTrace(): readonly SlideAutoLiveTraceEntry[] {
    return this.autoLiveTraceValue.map((entry) => ({ ...entry }));
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    this.afterNotesValue = [];
    this.currentAfterIndexValue = 0;
    this.autoLiveTraceValue.length = 0;
    if (
      !noteInformation.isSlideNoteHead ||
      !isSlideTerminalAfterType(noteInformation.afterNoteType) ||
      noteInformation.slideNoteList.length === 0
    ) {
      return evidenceRequired(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no confirmed after-node list.`,
      );
    }
    const seen = new Set<NoteInformation>();
    const afterNotes: SlideAfterRuntime[] = [];
    let previousPosition = noteInformation.absolutePos;
    for (let index = 0; index < noteInformation.slideNoteList.length; index += 1) {
      const source = noteInformation.slideNoteList[index];
      if (
        source === undefined ||
        seen.has(source) ||
        source.absolutePos <= previousPosition
      ) {
        return evidenceRequired(
          "auto-live.duplicate-or-missing-slide-node",
          ["R01", "R02", "R04", "U01"],
          `Slide root ${noteInformation.index} contains an invalid shared after-node identity.`,
        );
      }
      seen.add(source);
      previousPosition = source.absolutePos;
      const isTerminal = index === noteInformation.slideNoteList.length - 1;
      afterNotes.push(new SlideAfterRuntime(source, index, isTerminal));
    }
    this.afterNotesValue = afterNotes;
    this.currentAfterIndexValue = 0;
    return super.activate(noteInformation);
  }

  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return evidenceRequired(
        "auto-live.slide-without-note-information",
        ["R02", "R04"],
        "Slide MoveState requires an activated root and Auto Live runtime.",
      );
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return evidenceRequired(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Slide Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < noteInformation.absolutePos) {
      return ok(undefined);
    }
    if (!runtime.value.isAutoPlay()) {
      return evidenceRequired(
        "manual-slide-judgement",
        ["R01", "R04"],
        "Manual Slide acquisition is outside the Auto Live stage.",
      );
    }
    const changed = this.changeState(NoteState.Wait);
    if (changed.status !== "ok") {
      return changed;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType: 0,
      absolutePosition: noteInformation.absolutePos,
    });
    if (submitted.status === "ok") {
      this.autoLiveTraceValue.push({ kind: "slide-head-perfect" });
    }
    return submitted;
  }

  protected override waitState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    for (const after of this.afterNotesValue) {
      if (!after.judged) {
        this.autoLiveTraceValue.push({
          kind: "slide-after-update",
          afterIndex: after.sourceIndex,
        });
      }
    }
    return this.forcePerfectPendingAfter();
  }

  override executeAfterUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.state === NoteState.Deactive) {
      return ok(undefined);
    }
    this.autoLiveTraceValue.push({ kind: "slide-base-after-update" });
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    if (current !== undefined) {
      this.autoLiveTraceValue.push({
        kind: "slide-current-after-update",
        afterIndex: current.sourceIndex,
      });
    }
    return ok(undefined);
  }

  private forcePerfectPendingAfter(): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return evidenceRequired(
        "auto-live.slide-runtime-graph-unavailable",
        ["R02", "R04"],
        "Slide pending-node Force Perfect requires the parent-owned runtime graph.",
      );
    }
    if (!runtime.value.isAutoPlay()) {
      return ok(undefined);
    }
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    if (current === undefined) {
      return evidenceRequired(
        "auto-live.slide-current-after-missing",
        ["R02", "R04"],
        "An active Slide must retain one selected pending after node.",
      );
    }
    if (current.source.isInvisible) {
      const marked = current.markJudged();
      if (marked.status !== "ok") {
        return marked;
      }
      this.autoLiveTraceValue.push({
        kind: "slide-invisible-support-skip",
        afterIndex: current.sourceIndex,
      });
      this.currentAfterIndexValue += 1;
      return ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return evidenceRequired(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Slide after Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < current.source.absolutePos) {
      return ok(undefined);
    }
    const phase = current.isTerminal ? "tail" : "intermediate";
    const submitted = runtime.value.submitJudgement({
      noteInformation: current.source,
      phase,
      noteType: current.isTerminal
        ? slideTerminalJudgeNoteType(noteInformation.afterNoteType)
        : 8,
      absolutePosition: current.source.absolutePos,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = current.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.autoLiveTraceValue.push({
      kind: current.isTerminal
        ? "slide-tail-perfect"
        : "slide-intermediate-perfect",
      afterIndex: current.sourceIndex,
    });
    this.currentAfterIndexValue += 1;
    return current.isTerminal
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }

  protected override onResetForDispose(): void {
    this.afterNotesValue = [];
    this.currentAfterIndexValue = 0;
    this.autoLiveTraceValue.length = 0;
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

  protected override onResetForDispose(): void {
    this.flickTraceValue.length = 0;
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

export type LongAutoLiveTraceEntry = {
  readonly kind:
    | "long-head-perfect"
    | "long-after-update"
    | "long-linked-after-finish"
    | "long-tail-perfect"
    | "long-base-after-update"
    | "long-linked-after-update";
};

export type SlideAutoLiveTraceEntry =
  | {
      readonly kind:
        | "slide-head-perfect"
        | "slide-base-after-update";
    }
  | {
      readonly kind:
        | "slide-after-update"
        | "slide-current-after-update"
        | "slide-invisible-support-skip"
        | "slide-intermediate-perfect"
        | "slide-tail-perfect";
      readonly afterIndex: number;
    };

function longAfterJudgeNoteType(afterNoteType: AfterNoteTypeValue): number {
  switch (afterNoteType) {
    case AfterNoteType.Normal:
      return 1;
    case AfterNoteType.Flick:
      return 3;
    case AfterNoteType.DirectionalFlickLeft:
    case AfterNoteType.DirectionalFlickRight:
    case AfterNoteType.MultipleDirectionalFlickLeft:
    case AfterNoteType.MultipleDirectionalFlickRight:
      return 9;
    default:
      return 1;
  }
}

function slideTerminalJudgeNoteType(afterNoteType: AfterNoteTypeValue): number {
  switch (afterNoteType) {
    case AfterNoteType.SlideFlickEnd:
      return 5;
    case AfterNoteType.SlideDirectionalFlickEndLeft:
    case AfterNoteType.SlideDirectionalFlickEndRight:
    case AfterNoteType.SlideMultipleDirectionalFlickLeft:
    case AfterNoteType.SlideMultipleDirectionalFlickRight:
      return 7;
    default:
      return 8;
  }
}

function isLongAfterType(afterNoteType: AfterNoteTypeValue): boolean {
  return afterNoteType >= AfterNoteType.Normal
    && afterNoteType <= AfterNoteType.MultipleDirectionalFlickRight;
}

function isSlideTerminalAfterType(afterNoteType: AfterNoteTypeValue): boolean {
  return afterNoteType >= AfterNoteType.SlideEnd
    && afterNoteType <= AfterNoteType.SlideMultipleDirectionalFlickRight;
}
