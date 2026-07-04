import { SIMULATOR_TIMING_FPS } from "./simulatorTiming";
import { isGrayEligibleNote, isHiddenNoSeNote, isJudgedNote } from "./score";
import { axisAtMs } from "./timingGroup";
import {
  ActiveNote,
  ActiveSlide,
  JudgeTriggerEvent,
  LifeFeedbackEvent,
  LifeFeedbackEventKind,
  ParticleTriggerEvent,
  ParsedChart,
  RuntimeNoteLifecycleState,
  RuntimeNoteSemantic,
  RuntimeSlideLifecycleState,
  RuntimeStats,
  SimulatorSettings,
} from "./types";

interface PendingSystemEvent {
  type: "music_start" | "bpm";
  startMs: number;
  bpm?: number;
}

const RUNTIME_POST_ROLL_MS = 3000;
const SIMULATOR_SCORE_BASE_VALUE = 10_000_000;
const SIMULATOR_INITIAL_LIFE = 1000;
const SIMULATOR_MAX_LIFE = 1000;

export class SimulatorRuntime {
  private readonly settings: SimulatorSettings;
  private readonly chart: ParsedChart;

  private readonly activeNotes: ActiveNote[] = [];
  private readonly activeNotesMap = new Map<number, ActiveNote>();
  private readonly activeSlides: ActiveSlide[] = [];
  private readonly activeSlidesMap = new Map<number, ActiveSlide>();
  private readonly activeIdByEvent = new Map<number, number>();
  private readonly noteLifecycleByEvent = new Map<number, RuntimeNoteLifecycleState>();
  private readonly slideLifecycleByEvent = new Map<number, RuntimeSlideLifecycleState>();
  private readonly npsExpiryMs: number[] = [];
  private readonly pendingSystemEvents: PendingSystemEvent[] = [];

  private startMs = 0;
  private started = false;
  private spawnIndex = 0;
  private nextNoteId = 1;
  private nextSlideId = 1;

  private combo = 0;
  private notes = 0;
  private readonly scoreMax: number;
  private readonly lifeMax = SIMULATOR_MAX_LIFE;
  private life = SIMULATOR_INITIAL_LIFE;
  private nps = 0;
  private npsMax = 0;
  private bpmValue = 0;
  private processedObjects = 0;

  private pendingSeNotes: RuntimeNoteSemantic[] = [];
  private pendingParticleTriggers: ParticleTriggerEvent[] = [];
  private pendingJudgeTriggers: JudgeTriggerEvent[] = [];
  private pendingLifeFeedbackEvents: LifeFeedbackEvent[] = [];
  private pendingMusicStart = false;
  private lastElapsedMs = 0;
  private finishAtMs: number | null = null;
  private static readonly COLOR_ASSIST_BEAT_MULTIPLIER = 2;

  constructor(settings: SimulatorSettings, chart: ParsedChart) {
    this.settings = settings;
    this.chart = chart;
    this.notes = chart.noteCount;
    this.scoreMax = Math.max(1, SIMULATOR_SCORE_BASE_VALUE + Math.max(0, this.notes));
    this.bpmValue = chart.initialBpm > 0 ? chart.initialBpm : 120;
  }

  start(nowMs: number): void {
    this.startMs = nowMs;
    this.started = true;
    this.lastElapsedMs = 0;
    this.finishAtMs = null;
  }

  shiftStartMs(deltaMs: number): void {
    if (!this.started || !Number.isFinite(deltaMs) || Math.abs(deltaMs) < 1e-6) {
      return;
    }
    this.startMs += deltaMs;
  }

  isStarted(): boolean {
    return this.started;
  }

  isFinished(): boolean {
    return this.finishAtMs !== null && this.lastElapsedMs >= this.finishAtMs;
  }

  consumePendingMusicStart(): boolean {
    const v = this.pendingMusicStart;
    this.pendingMusicStart = false;
    return v;
  }

  consumePendingSeNotes(): RuntimeNoteSemantic[] {
    const out = this.pendingSeNotes;
    this.pendingSeNotes = [];
    return out;
  }

  consumePendingParticleTriggers(): ParticleTriggerEvent[] {
    const out = this.pendingParticleTriggers;
    this.pendingParticleTriggers = [];
    return out;
  }

  consumePendingJudgeTriggers(): JudgeTriggerEvent[] {
    const out = this.pendingJudgeTriggers;
    this.pendingJudgeTriggers = [];
    return out;
  }

  consumePendingLifeFeedbackEvents(): LifeFeedbackEvent[] {
    const out = this.pendingLifeFeedbackEvents;
    this.pendingLifeFeedbackEvents = [];
    return out;
  }

  applyLifeDamage(amount: number, elapsedMs?: number): void {
    const normalizedAmount = this.normalizeLifeAmount(amount);
    if (normalizedAmount <= 0) {
      return;
    }
    this.applyLifeValue(this.life - normalizedAmount, "damage", elapsedMs);
  }

  applyLifeHeal(amount: number, elapsedMs?: number): void {
    const normalizedAmount = this.normalizeLifeAmount(amount);
    if (normalizedAmount <= 0) {
      return;
    }
    this.applyLifeValue(this.life + normalizedAmount, "heal", elapsedMs);
  }

  setLife(value: number, elapsedMs?: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    this.applyLifeValue(Math.floor(value), "set", elapsedMs);
  }

  getActiveNotes(): readonly ActiveNote[] {
    return this.activeNotes;
  }

  getActiveNotesMap(): ReadonlyMap<number, ActiveNote> {
    return this.activeNotesMap;
  }

  getActiveSlides(): readonly ActiveSlide[] {
    return this.activeSlides;
  }

  getActiveSlidesMap(): ReadonlyMap<number, ActiveSlide> {
    return this.activeSlidesMap;
  }

  getNoteLifecycleStates(): ReadonlyMap<number, RuntimeNoteLifecycleState> {
    return this.noteLifecycleByEvent;
  }

  getSlideLifecycleStates(): ReadonlyMap<number, RuntimeSlideLifecycleState> {
    return this.slideLifecycleByEvent;
  }

  getProgress(elapsedMs: number): number {
    return Math.max(0, Math.min(1, elapsedMs / Math.max(1, this.chart.maxTimeMs)));
  }

  update(nowMs: number): RuntimeStats {
    if (!this.started) {
      return this.stats(0);
    }

    const elapsed = nowMs - this.startMs;
    this.lastElapsedMs = elapsed;
    this.spawnDueEvents(elapsed);
    this.flushPendingSystemEvents(elapsed);

    while (this.npsExpiryMs.length > 0 && elapsed >= this.npsExpiryMs[0]) {
      this.npsExpiryMs.shift();
      this.nps = Math.max(0, this.nps - 1);
    }

    for (let i = this.activeNotes.length - 1; i >= 0; i -= 1) {
      const note = this.activeNotes[i];
      this.updateNote(note, elapsed);

      if (note.note.baseType === "hidden") {
        this.handleHiddenNoteIfDue(note, i, elapsed);
        continue;
      }

      if (this.consumeNoteIfDue(note, elapsed)) {
        this.removeActiveNoteAt(i);
        this.processedObjects += 1;
        continue;
      }
    }

    for (let i = this.activeSlides.length - 1; i >= 0; i -= 1) {
      const slide = this.activeSlides[i];
      this.updateSlide(slide, elapsed);
      if (elapsed >= slide.visibleEndMs - 1e-6) {
        this.removeActiveSlideAt(i);
        this.processedObjects += 1;
      }
    }

    const coreFinished = this.combo >= this.notes
      && this.activeNotes.length === 0
      && this.activeSlides.length === 0
      && this.pendingSystemEvents.length === 0
      && this.spawnIndex >= this.chart.events.length;
    if (coreFinished) {
      if (this.finishAtMs === null) {
        this.finishAtMs = elapsed + RUNTIME_POST_ROLL_MS;
      }
    } else {
      this.finishAtMs = null;
    }

    return this.stats(elapsed);
  }

  private normalizeLifeAmount(amount: number): number {
    if (!Number.isFinite(amount)) {
      return 0;
    }
    return Math.max(0, Math.floor(amount));
  }

  private normalizeLifeElapsedMs(elapsedMs: number | undefined): number {
    if (elapsedMs !== undefined && Number.isFinite(elapsedMs)) {
      return elapsedMs;
    }
    return this.lastElapsedMs;
  }

  private applyLifeValue(value: number, kind: LifeFeedbackEventKind, elapsedMs: number | undefined): void {
    const lifeBefore = this.life;
    const lifeAfter = Math.max(0, Math.min(this.lifeMax, Math.floor(value)));
    if (lifeAfter === lifeBefore) {
      return;
    }
    this.life = lifeAfter;
    const delta = lifeAfter - lifeBefore;
    this.pendingLifeFeedbackEvents.push({
      kind,
      amount: Math.abs(delta),
      delta,
      lifeBefore,
      lifeAfter,
      lifeMax: this.lifeMax,
      elapsedMs: this.normalizeLifeElapsedMs(elapsedMs),
    });
  }

  private tgPosAt(tgId: number, elapsedMs: number): number {
    if (tgId < 0 || tgId >= this.chart.timingGroups.length) {
      return 0;
    }
    const x = elapsedMs - this.settings.offsetMs;
    return axisAtMs(this.chart.timingGroups[tgId], x);
  }

  private spawnDueEvents(elapsedMs: number): void {
    while (this.spawnIndex < this.chart.events.length) {
      const ev = this.chart.events[this.spawnIndex];
      if (elapsedMs + 100 < ev.startMs) {
        break;
      }

      switch (ev.eventType) {
        case "bpm":
          this.pendingSystemEvents.push({
            type: "bpm",
            startMs: ev.startMs,
            bpm: ev.bpm,
          });
          break;
        case "music_start":
          this.pendingSystemEvents.push({
            type: "music_start",
            startMs: ev.startMs,
          });
          break;
        case "note": {
          if (!ev.note) {
            this.processedObjects += 1;
            break;
          }
          const id = this.nextNoteId++;
          const prevSlideNodeActiveId = ev.prevSlideNodeEventIndex >= 0 ? this.activeIdByEvent.get(ev.prevSlideNodeEventIndex) ?? -1 : -1;
          const activeSlide = ev.slideChainEventIndex >= 0 ? this.activeSlidesMap.get(ev.slideChainEventIndex) ?? null : null;
          const n: ActiveNote = {
            id,
            eventIndex: this.spawnIndex,
            note: ev.note,
            lane: ev.lane,
            samelineGroup: ev.samelineGroup,
            startMs: ev.startMs,
            hitMs: ev.hitMs,
            visibleEndMs: ev.visibleEndMs,
            visibilityWindows: ev.visibilityWindows,
            tgId: ev.tgId,
            tgPos: ev.tgPos,
            started: false,
            t: 0,
            gray: this.isGrayNote(ev.beat, ev.note),
            prevSlideNodeEventIndex: ev.prevSlideNodeEventIndex,
            prevSlideNodeActiveId,
            nextSlideNodeEventIndex: ev.nextSlideNodeEventIndex,
            slideChainEventIndex: ev.slideChainEventIndex,
            activeSlide,
            inWindow: false,
            consumed: false,
          };
          this.addActiveNote(n);
          this.noteLifecycleByEvent.set(this.spawnIndex, {
            eventIndex: this.spawnIndex,
            spawned: true,
            started: false,
            inWindow: false,
            consumed: false,
            judged: false,
            hidden: ev.note.baseType === "hidden",
          });
          break;
        }
        case "slide": {
          const id = this.nextSlideId++;
          const slide: ActiveSlide = {
            id,
            eventIndex: this.spawnIndex,
            startMs: ev.startMs,
            hitMs: ev.hitMs,
            visibleEndMs: ev.visibleEndMs,
            lane: ev.lane,
            tgId: ev.tgId,
            tgPos: ev.tgPos,
            nodeEventIndices: ev.nodeEventIndices,
            headNodeEventIndex: ev.headNodeEventIndex,
            tailNodeEventIndex: ev.tailNodeEventIndex,
            slideType: ev.slideType,
            active: false,
            marker: null,
          };
          this.addActiveSlide(slide);
          this.bindActiveSlideNotes(slide);
          this.slideLifecycleByEvent.set(this.spawnIndex, {
            eventIndex: this.spawnIndex,
            spawned: true,
            active: false,
          });
          break;
        }
        default:
          this.processedObjects += 1;
          break;
      }

      this.spawnIndex += 1;
    }
  }

  private addActiveNote(note: ActiveNote): void {
    this.activeNotes.push(note);
    this.activeNotesMap.set(note.eventIndex, note);
    this.activeIdByEvent.set(note.eventIndex, note.id);
  }

  private addActiveSlide(slide: ActiveSlide): void {
    this.activeSlides.push(slide);
    this.activeSlidesMap.set(slide.eventIndex, slide);
  }

  private bindActiveSlideNotes(slide: ActiveSlide): void {
    for (const note of this.activeNotes) {
      if (note.slideChainEventIndex !== slide.eventIndex) {
        continue;
      }
      note.activeSlide = slide;
    }
  }

  private removeActiveNoteAt(index: number): ActiveNote | null {
    const note = this.activeNotes[index] ?? null;
    if (!note) {
      return null;
    }
    const state = this.noteLifecycleByEvent.get(note.eventIndex);
    if (state) {
      state.inWindow = false;
    }
    this.activeNotesMap.delete(note.eventIndex);
    this.activeIdByEvent.delete(note.eventIndex);
    this.activeNotes.splice(index, 1);
    return note;
  }

  private removeActiveSlideAt(index: number): ActiveSlide | null {
    const slide = this.activeSlides[index] ?? null;
    if (!slide) {
      return null;
    }
    const state = this.slideLifecycleByEvent.get(slide.eventIndex);
    if (state) {
      state.active = false;
    }
    slide.active = false;
    this.activeSlidesMap.delete(slide.eventIndex);
    this.activeSlides.splice(index, 1);
    return slide;
  }

  private flushPendingSystemEvents(elapsedMs: number): void {
    while (this.pendingSystemEvents.length > 0) {
      const event = this.pendingSystemEvents[0];
      if (elapsedMs < event.startMs) {
        break;
      }
      this.pendingSystemEvents.shift();
      if (event.type === "bpm") {
        const bpm = event.bpm;
        if (typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0) {
          this.bpmValue = bpm;
        }
      } else {
        this.pendingMusicStart = true;
      }
      this.processedObjects += 1;
    }
  }

  private updateNote(note: ActiveNote, elapsedMs: number): void {
    if (note.tgId >= 0) {
      const tRaw = (this.tgPosAt(note.tgId, elapsedMs) * SIMULATOR_TIMING_FPS) / 1000
        + this.settings.noteSpeedFrames
        - (note.tgPos * SIMULATOR_TIMING_FPS) / 1000;
      if (elapsedMs >= note.startMs) {
        note.started = true;
        note.t = Math.floor(tRaw);
      } else {
        note.started = false;
        note.t = 0;
      }
    } else if (elapsedMs >= note.startMs) {
      note.started = true;
      note.t = Math.floor((elapsedMs - note.startMs) * SIMULATOR_TIMING_FPS / 1000);
    } else {
      note.started = false;
      note.t = 0;
    }
    this.markNoteStarted(note.eventIndex, note.started);
  }

  private updateSlide(slide: ActiveSlide, elapsedMs: number): void {
    const active = elapsedMs >= slide.startMs - 1e-6 && elapsedMs < slide.visibleEndMs - 1e-6;
    slide.active = active;
    const state = this.slideLifecycleByEvent.get(slide.eventIndex);
    if (state) {
      state.active = active;
    }
  }

  private handleHiddenNoteIfDue(note: ActiveNote, activeIndex: number, elapsedMs: number): void {
    if (elapsedMs < note.hitMs) {
      return;
    }

    const isHeadNode = note.activeSlide?.headNodeEventIndex === note.eventIndex;
    if (isHeadNode || this.isNoteConsumed(note.prevSlideNodeEventIndex)) {
      note.consumed = true;
      this.markNoteConsumed(note.eventIndex);
      if (isHeadNode) {
        this.updateSlideMarkerForHiddenHeadNote(note);
      }
    }
    this.removeActiveNoteAt(activeIndex);
    this.processedObjects += 1;
  }

  private consumeNoteIfDue(note: ActiveNote, elapsedMs: number): boolean {
    if (!this.isNoteConsumed(note.eventIndex) && elapsedMs >= note.hitMs) {
      this.consumeNote(note, elapsedMs);
    }

    if (!this.isNoteConsumed(note.eventIndex) || elapsedMs < Math.max(note.hitMs, note.visibleEndMs) - 1e-6) {
      return false;
    }

    return true;
  }

  private consumeNote(note: ActiveNote, elapsedMs: number): void {
    if (this.isNoteConsumed(note.eventIndex)) {
      return;
    }

    this.pushSe(note.note);
    note.consumed = true;
    this.markNoteConsumed(note.eventIndex);
    this.updateSlideMarkerForConsumedNote(note);
    this.resolveHit(note.note, note.lane, elapsedMs, note.eventIndex);
  }

  private updateSlideMarkerForConsumedNote(note: ActiveNote): void {
    const slide = note.activeSlide;
    if (!slide || note.note.baseType === "hidden") {
      return;
    }

    if (note.note.slideRole === "start" || note.note.slideRole === "middle") {
      slide.marker = {
        sourceEventIndex: note.eventIndex,
        sourceBaseType: note.note.baseType,
        sourceIsHead: note.eventIndex === slide.headNodeEventIndex,
        sourceRhythmWidth: Math.max(1, Number.isFinite(note.note.rhythmWidth) ? note.note.rhythmWidth : 1),
      };
      return;
    }

    if (note.note.slideRole === "end") {
      slide.marker = null;
    }
  }

  private updateSlideMarkerForHiddenHeadNote(note: ActiveNote): void {
    const slide = note.activeSlide;
    if (!slide || slide.slideType === "hidden") {
      return;
    }

    slide.marker = {
      sourceEventIndex: note.eventIndex,
      sourceBaseType: "single",
      sourceIsHead: true,
      sourceRhythmWidth: Math.max(1, Number.isFinite(note.note.rhythmWidth) ? note.note.rhythmWidth : 1),
    };
  }

  private isNoteConsumed(eventIndex: number): boolean {
    return this.noteLifecycleByEvent.get(eventIndex)?.consumed === true;
  }

  private isGrayNote(beat: number, note: RuntimeNoteSemantic): boolean {
    if (!this.settings.grayEnabled || !isGrayEligibleNote(note)) {
      return false;
    }
    const p = beat * SimulatorRuntime.COLOR_ASSIST_BEAT_MULTIPLIER;
    return p - Math.floor(p) >= 0.0001;
  }

  private resolveHit(note: RuntimeNoteSemantic, lane: number, elapsedMs: number, eventIndex: number): void {
    if (!isJudgedNote(note)) {
      return;
    }

    this.markNoteJudged(eventIndex);
    this.combo += 1;
    this.nps += 1;
    if (this.nps > this.npsMax) {
      this.npsMax = this.nps;
    }
    this.npsExpiryMs.push(elapsedMs + 1000);

    // Current runtime uses auto-judge semantics. Keep full judge kind interface for future expansion.
    this.pendingJudgeTriggers.push({
      kind: "auto",
      lane,
      elapsedMs,
      eventIndex,
    });

    if (this.settings.effectEnable) {
      this.pendingParticleTriggers.push({ note, lane, elapsedMs, eventIndex });
    }
  }

  private pushSe(note: RuntimeNoteSemantic): void {
    if (isHiddenNoSeNote(note)) {
      return;
    }
    this.pendingSeNotes.push(note);
  }

  private markNoteStarted(eventIndex: number, started: boolean): void {
    const state = this.noteLifecycleByEvent.get(eventIndex);
    if (state) {
      state.started = started;
    }
  }

  private markNoteConsumed(eventIndex: number): void {
    const state = this.noteLifecycleByEvent.get(eventIndex);
    if (state) {
      state.consumed = true;
    }
  }

  private markNoteJudged(eventIndex: number): void {
    const state = this.noteLifecycleByEvent.get(eventIndex);
    if (state) {
      state.judged = true;
    }
  }

  private displayScore(): number {
    const notes = Math.max(1, this.notes);
    return Math.max(0, Math.floor(this.combo / notes * SIMULATOR_SCORE_BASE_VALUE + this.combo));
  }

  private stats(elapsedMs: number): RuntimeStats {
    return {
      combo: this.combo,
      notes: this.notes,
      nps: this.nps,
      npsMax: this.npsMax,
      bpmValue: this.bpmValue,
      score: this.displayScore(),
      scoreMax: this.scoreMax,
      life: this.life,
      lifeMax: this.lifeMax,
      activeObjects: this.activeNotes.length + this.activeSlides.length,
      processedObjects: this.processedObjects,
      totalObjects: this.chart.events.length,
      elapsedMs
    };
  }
}

