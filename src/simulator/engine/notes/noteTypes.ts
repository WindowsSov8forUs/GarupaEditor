import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import {
  AfterNoteType,
  FrontNoteType,
  GameNoteType,
  type AfterNoteTypeValue,
  type NoteInformation,
} from "../chart/types";
import { NoteBase } from "./noteBase";
import { NoteState } from "./noteBase";
import type { MultipleDirectionalRuntimeGroup } from "../data/autoLiveJudgement";

export class NoteFrontBase extends NoteBase {
  override executeAfterUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    const runtime = this.autoLiveRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    if (!runtime.value.isAutoPlay()) {
      return evidenceRequired(
        "manual-note-after-update",
        ["R01", "R04"],
        "Manual Note AfterUpdate behavior is outside the Auto Live stage.",
      );
    }
    return ok(undefined);
  }
}

export class NoteAfterBase extends NoteBase {}

export interface FlickForcePerfectTraceEntry {
  readonly kind: "flick-begin" | "flick-synthetic-move";
  readonly syntheticX?: number;
}

export abstract class NoteSingleBase extends NoteFrontBase {
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
    return evidenceRequired(
      "auto-live.single-base-force-perfect-unrepresented",
      ["R02", "R04"],
      "Only recovered concrete Single/Flick/Directional owners may select an Auto Live judgement note type.",
    );
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
      multipleDirectionalFlickNoteCount: 0,
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

  get autoLiveTrace(): readonly LongAutoLiveTraceEntry[] {
    return this.autoLiveTraceValue.map((entry) => ({ ...entry }));
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    this.afterNoteValue = null;
    this.autoLiveTraceValue.length = 0;
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    if (graphValidation.status !== "ok") {
      return graphValidation;
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
      multipleDirectionalFlickNoteCount: 0,
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
    const noteType = longAfterJudgeNoteType(after.afterNoteType);
    if (noteType === null) {
      return evidenceRequired(
        "auto-live.invalid-long-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Long root ${noteInformation.index} retained an unconfirmed terminal type.`,
      );
    }
    this.autoLiveTraceValue.push({ kind: "long-linked-after-finish" });
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "tail",
      noteType,
      absolutePosition: after.absolutePosition,
      multipleDirectionalFlickNoteCount: 0,
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

  override snapshot() {
    return {
      ...super.snapshot(),
      autoLiveTrace: this.autoLiveTrace,
      linkedAfter: this.afterNoteValue === null
        ? null
        : {
            absolutePosition: this.afterNoteValue.absolutePosition,
            afterNoteType: this.afterNoteValue.afterNoteType,
            judged: this.afterNoteValue.judged,
          },
    };
  }

  protected override onDeactivated(): void {
    this.afterNoteValue?.resetForParentDeactivation();
    this.afterNoteValue = null;
  }

  protected override onResetForDispose(): void {
    this.afterNoteValue = null;
    this.autoLiveTraceValue.length = 0;
  }
}

export class NoteSlide extends NoteFrontBase {
  private afterNotesValue: readonly SlideAfterRuntime[] = [];
  private currentAfterIndexValue = 0;
  private terminalJudgeNoteTypeValue: 5 | 6 | 7 | 8 | null = null;
  private readonly autoLiveTraceValue: SlideAutoLiveTraceEntry[] = [];

  get afterNotes(): readonly SlideAfterRuntime[] {
    return this.afterNotesValue;
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
    this.terminalJudgeNoteTypeValue = null;
    this.autoLiveTraceValue.length = 0;
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    if (graphValidation.status !== "ok") {
      return graphValidation;
    }
    const seen = new Set<NoteInformation>();
    const afterNotes: SlideAfterRuntime[] = [];
    const terminalSource = noteInformation.slideNoteList[
      noteInformation.slideNoteList.length - 1
    ];
    if (terminalSource === undefined) {
      return evidenceRequired(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no terminal source node.`,
      );
    }
    const terminalJudgeNoteType = resolveSlideTerminalJudgeNoteType(
      noteInformation.afterNoteType,
      terminalSource.gameNoteType,
    );
    if (terminalJudgeNoteType.status !== "ok") {
      return terminalJudgeNoteType;
    }
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
      afterNotes.push(new SlideAfterRuntime(
        source,
        index,
        isTerminal,
        isTerminal ? terminalJudgeNoteType.value : null,
      ));
    }
    this.afterNotesValue = afterNotes;
    this.currentAfterIndexValue = 0;
    this.terminalJudgeNoteTypeValue = terminalJudgeNoteType.value;
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
      multipleDirectionalFlickNoteCount: 0,
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
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return evidenceRequired(
        "auto-live.slide-stop-runtime-unavailable",
        ["R02", "R04"],
        "Slide StopState requires the activated parent-owned after graph.",
      );
    }
    if (!runtime.value.isAutoPlay()) {
      return ok(undefined);
    }
    const selected = this.afterNotesValue.find(
      (after) => !after.source.isInvisible && !after.judged,
    );
    if (selected === undefined) {
      return ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return evidenceRequired(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Slide Stop Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < selected.source.absolutePos) {
      return ok(undefined);
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: selected.source,
      phase: "intermediate",
      noteType: 8,
      absolutePosition: selected.source.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = selected.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.autoLiveTraceValue.push({
      kind: "slide-stop-perfect",
      afterIndex: selected.sourceIndex,
    });
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
    if (current.judged) {
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
    const phase = current.isTerminal ? "tail" : "intermediate";
    let noteType = 8;
    if (current.isTerminal) {
      if (
        current.terminalJudgeNoteType === null ||
        current.terminalJudgeNoteType !== this.terminalJudgeNoteTypeValue
      ) {
        return evidenceRequired(
          "auto-live.invalid-slide-terminal-graph",
          ["R02", "R03", "R04", "U01"],
          "The selected Slide terminal must retain the validated parent-owned judgement mapping.",
        );
      }
      noteType = current.terminalJudgeNoteType;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: current.source,
      phase,
      noteType,
      absolutePosition: current.source.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
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
    this.terminalJudgeNoteTypeValue = null;
    this.autoLiveTraceValue.length = 0;
  }

  override snapshot() {
    return {
      ...super.snapshot(),
      currentAfterIndex: this.currentAfterIndexValue,
      terminalJudgeNoteType: this.terminalJudgeNoteTypeValue,
      afterNodes: this.afterNotesValue.map((after) => ({
        sourceIndex: after.sourceIndex,
        noteIndex: after.source.index,
        absolutePosition: after.source.absolutePos,
        isInvisible: after.source.isInvisible,
        isTerminal: after.isTerminal,
        terminalJudgeNoteType: after.terminalJudgeNoteType,
        judged: after.judged,
      })),
    };
  }

  protected override onDeactivated(): void {
    for (const after of this.afterNotesValue) {
      after.resetForParentDeactivation();
    }
    this.afterNotesValue = [];
    this.currentAfterIndexValue = 0;
    this.terminalJudgeNoteTypeValue = null;
  }
}

export class NoteFlick extends NoteSingleBase {
  protected readonly flickTraceValue: FlickForcePerfectTraceEntry[] = [];

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

export class NoteMultipleDirectionalFlick extends NoteDirectionalFlick {
  private groupResolverValue: ((
    information: NoteInformation,
  ) => SimulatorResult<MultipleDirectionalRuntimeGroup>) | null = null;
  private groupValue: MultipleDirectionalRuntimeGroup | null = null;
  private readonly multipleTraceValue: MultipleDirectionalAutoLiveTraceEntry[] = [];

  registerMultipleDirectionalGroupResolver(
    resolver: (
      information: NoteInformation,
    ) => SimulatorResult<MultipleDirectionalRuntimeGroup>,
  ): void {
    this.groupResolverValue = resolver;
  }

  get multipleTrace(): readonly MultipleDirectionalAutoLiveTraceEntry[] {
    return this.multipleTraceValue.map((entry) => ({ ...entry }));
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    this.groupValue = null;
    this.multipleTraceValue.length = 0;
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    if (graphValidation.status !== "ok") {
      return graphValidation;
    }
    if (this.groupResolverValue === null) {
      return evidenceRequired(
        "auto-live.multiple-directional-group-unregistered",
        ["R10", "R13", "R16"],
        "NoteManager must establish the adjacent-button runtime group before activation.",
      );
    }
    const group = this.groupResolverValue(noteInformation);
    if (group.status !== "ok") {
      return group;
    }
    this.groupValue = group.value;
    return super.activate(noteInformation);
  }

  protected override forcePerfect(): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    const group = this.groupValue;
    if (noteInformation === null || runtime.status !== "ok" || group === null) {
      return evidenceRequired(
        "auto-live.multiple-directional-runtime-unavailable",
        ["R10", "R12", "R16"],
        "Multiple Directional Force Perfect requires its activated adjacent-button runtime group.",
      );
    }
    if (group.isUsed) {
      this.multipleTraceValue.push({ kind: "multiple-side-used-deactivate", groupCount: group.count });
      return this.changeState(NoteState.Deactive);
    }
    const synthetic = this.forcePerfectSyntheticX;
    if (synthetic.status !== "ok") {
      return synthetic;
    }
    this.flickTraceValue.push({ kind: "flick-begin" });
    this.flickTraceValue.push({ kind: "flick-synthetic-move", syntheticX: synthetic.value });
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType: 10,
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: group.count,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const used = group.markUsed();
    if (used.status !== "ok") {
      return used;
    }
    this.multipleTraceValue.push({ kind: "multiple-head-perfect", groupCount: group.count });
    this.multipleTraceValue.push({ kind: "multiple-side-notes-used", groupCount: group.count });
    return this.changeState(NoteState.Deactive);
  }

  override snapshot() {
    return {
      ...super.snapshot(),
      multipleDirectionalGroupCount: this.groupValue?.count ?? null,
      multipleDirectionalGroupUsed: this.groupValue?.isUsed ?? null,
      multipleDirectionalTrace: this.multipleTrace,
    };
  }

  protected override onDeactivated(): void {
    this.groupValue = null;
  }

  protected override onResetForDispose(): void {
    super.onResetForDispose();
    this.groupValue = null;
    this.multipleTraceValue.length = 0;
  }
}

export class NoteMultipleDirectionalVisual extends NoteFrontBase {
  protected override moveState(): SimulatorResult<void> {
    return evidenceRequired(
      "auto-live.multiple-directional-visual-presentation",
      ["R10", "R13", "R16.D01", "R16.D03"],
      "AddLong/AddSlide Multiple Directional Visual runs NotesCheck/connect presentation and has a native RET Force Perfect; presentation is outside Auto Live.",
    );
  }
}

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

  resetForParentDeactivation(): void {
    this.judgedValue = false;
  }
}

export class SlideAfterRuntime {
  private judgedValue = false;

  constructor(
    readonly source: NoteInformation,
    readonly sourceIndex: number,
    readonly isTerminal: boolean,
    readonly terminalJudgeNoteType: 5 | 6 | 7 | 8 | null,
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

  resetForParentDeactivation(): void {
    this.judgedValue = false;
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
        | "slide-tail-perfect"
        | "slide-stop-perfect";
      readonly afterIndex: number;
    };

export type MultipleDirectionalAutoLiveTraceEntry = {
  readonly kind:
    | "multiple-head-perfect"
    | "multiple-side-notes-used"
    | "multiple-side-used-deactivate";
  readonly groupCount: number;
};

export function validateAutoLiveActivationGraph(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  if (noteInformation.fireNoteType === FrontNoteType.Long) {
    if (
      !isInt32Position(noteInformation.absolutePos) ||
      !isLongAfterType(noteInformation.afterNoteType) ||
      !isInt32Position(noteInformation.afterNoteAbsolutePos) ||
      noteInformation.afterNoteAbsolutePos <= noteInformation.absolutePos
    ) {
      return evidenceRequired(
        "auto-live.invalid-long-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Long root ${noteInformation.index} has no confirmed terminal after node.`,
      );
    }
    return ok(undefined);
  }
  if (
    noteInformation.fireNoteType === FrontNoteType.SlideA ||
    noteInformation.fireNoteType === FrontNoteType.SlideB
  ) {
    if (
      !isInt32Position(noteInformation.absolutePos) ||
      !noteInformation.isSlideNoteHead ||
      noteInformation.slideNoteList.length === 0
    ) {
      return evidenceRequired(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no confirmed after-node list.`,
      );
    }
    const terminalSource = noteInformation.slideNoteList[
      noteInformation.slideNoteList.length - 1
    ];
    if (terminalSource === undefined) {
      return evidenceRequired(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no terminal source node.`,
      );
    }
    if (terminalSource.isInvisible) {
      return evidenceRequired(
        "auto-live.invalid-slide-terminal-graph",
        ["R02", "R03", "R04", "U01"],
        `Slide root ${noteInformation.index} has an invisible terminal outside the confirmed graph.`,
      );
    }
    const terminalValidation = resolveSlideTerminalJudgeNoteType(
      noteInformation.afterNoteType,
      terminalSource.gameNoteType,
    );
    if (terminalValidation.status !== "ok") {
      return terminalValidation;
    }
    const seen = new Set<NoteInformation>();
    let previousPosition = noteInformation.absolutePos;
    for (const source of noteInformation.slideNoteList) {
      if (
        seen.has(source) ||
        !isInt32Position(source.absolutePos) ||
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
    }
    return ok(undefined);
  }
  if (noteInformation.fireNoteType === FrontNoteType.MultipleDirectionalFlick) {
    if (
      noteInformation.gameNoteType !== GameNoteType.DirectionalFlickLeft &&
      noteInformation.gameNoteType !== GameNoteType.DirectionalFlickRight
    ) {
      return evidenceRequired(
        "auto-live.invalid-multiple-directional-root",
        ["R10", "R16", "R16.D05", "R16.D08"],
        `Core Multiple Directional requires front type 6 and source game type 10/11 (front=${noteInformation.fireNoteType}, game=${noteInformation.gameNoteType}).`,
      );
    }
  }
  return ok(undefined);
}

function isInt32Position(value: number): boolean {
  return Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff;
}

function longAfterJudgeNoteType(afterNoteType: AfterNoteTypeValue): 1 | 3 | 9 | null {
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
      return null;
  }
}

function isLongAfterType(afterNoteType: AfterNoteTypeValue): boolean {
  return afterNoteType >= AfterNoteType.Normal
    && afterNoteType <= AfterNoteType.MultipleDirectionalFlickRight;
}

function resolveSlideTerminalJudgeNoteType(
  afterNoteType: AfterNoteTypeValue,
  terminalGameNoteType: NoteInformation["gameNoteType"],
): SimulatorResult<5 | 6 | 7 | 8> {
  if (
    afterNoteType === AfterNoteType.None &&
    (terminalGameNoteType === GameNoteType.SlideEndA ||
      terminalGameNoteType === GameNoteType.SlideEndB)
  ) {
    return ok(8);
  }
  if (
    afterNoteType === AfterNoteType.SlideFlickEnd &&
    (terminalGameNoteType === GameNoteType.SlideEndFlickA ||
      terminalGameNoteType === GameNoteType.SlideEndFlickB)
  ) {
    return ok(5);
  }
  if (
    afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickLeft ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickLeft)
  ) {
    return ok(6);
  }
  if (
    afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickRight ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickRight)
  ) {
    return ok(6);
  }
  if (
    afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickLeftAdd ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickLeftAdd)
  ) {
    return ok(7);
  }
  if (
    afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickRightAdd ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickRightAdd)
  ) {
    return ok(7);
  }
  return evidenceRequired(
    "auto-live.invalid-slide-terminal-graph",
    ["R02", "R03", "R04", "U01"],
    `Slide terminal mapping is not confirmed (afterNoteType=${afterNoteType}, terminalGameNoteType=${terminalGameNoteType}).`,
  );
}
