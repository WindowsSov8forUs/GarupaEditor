import { SIMULATOR_TIMING_FPS } from "./simulatorTiming";
import { isGrayEligibleNote, isHiddenNoSeNote, isJudgedNote } from "./score";
import { axisAtMs } from "./timingGroup";
import {
  ActiveNote,
  JudgeTriggerEvent,
  ParticleTriggerEvent,
  ParsedChart,
  RuntimeNoteLifecycleState,
  RuntimeNoteSemantic,
  RuntimeStats,
  SimulatorSettings,
} from "./types";

interface PendingSystemEvent {
  type: "music_start" | "bpm";
  startMs: number;
  bpm?: number;
}

const RUNTIME_POST_ROLL_MS = 3000;

export class SimulatorRuntime {
  private readonly settings: SimulatorSettings;
  private readonly chart: ParsedChart;

  private readonly activeNotes: ActiveNote[] = [];
  private readonly activeNotesMap = new Map<number, ActiveNote>();
  private readonly activeIdByEvent = new Map<number, number>();
  private readonly noteLifecycleByEvent = new Map<number, RuntimeNoteLifecycleState>();
  private readonly npsExpiryMs: number[] = [];
  private readonly pendingSystemEvents: PendingSystemEvent[] = [];

  private startMs = 0;
  private started = false;
  private spawnIndex = 0;
  private nextNoteId = 1;

  private combo = 0;
  private notes = 0;
  private nps = 0;
  private npsMax = 0;
  private bpmValue = 0;
  private processedObjects = 0;

  private pendingSeNotes: RuntimeNoteSemantic[] = [];
  private pendingParticleTriggers: ParticleTriggerEvent[] = [];
  private pendingJudgeTriggers: JudgeTriggerEvent[] = [];
  private pendingMusicStart = false;
  private lastElapsedMs = 0;
  private finishAtMs: number | null = null;
  private static readonly COLOR_ASSIST_BEAT_MULTIPLIER = 2;

  constructor(settings: SimulatorSettings, chart: ParsedChart) {
    this.settings = settings;
    this.chart = chart;
    this.notes = chart.noteCount;
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

  getActiveNotes(): readonly ActiveNote[] {
    return this.activeNotes;
  }

  getActiveNotesMap(): ReadonlyMap<number, ActiveNote> {
    return this.activeNotesMap;
  }

  getNoteLifecycleStates(): ReadonlyMap<number, RuntimeNoteLifecycleState> {
    return this.noteLifecycleByEvent;
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

      if (!note.sePlayed && elapsed >= note.hitMs) {
        if (!note.sePlayed) {
          note.sePlayed = true;
          this.pushSe(note.note);
        }

        this.markNoteHitProcessed(note.eventIndex);
        this.resolveHit(note.note, note.lane, elapsed, note.eventIndex);
      }

      if (note.sePlayed && elapsed >= Math.max(note.hitMs, note.visibleEndMs) - 1e-6) {
        this.markNoteRemoved(note.eventIndex);
        this.removeActiveNoteAt(i);
        this.processedObjects += 1;
        continue;
      }
      if (!note.started && elapsed > note.visibleEndMs + 1e-6) {
        this.markNoteRemoved(note.eventIndex);
        this.removeActiveNoteAt(i);
      }
    }

    const coreFinished = this.combo >= this.notes
      && this.activeNotes.length === 0
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

      if (ev.eventType === "bpm") {
        this.pendingSystemEvents.push({
          type: "bpm",
          startMs: ev.startMs,
          bpm: ev.bpm,
        });
      } else if (ev.eventType === "music_start") {
        this.pendingSystemEvents.push({
          type: "music_start",
          startMs: ev.startMs,
        });
      } else {
        if (!ev.note) {
          this.spawnIndex += 1;
          continue;
        }
        const id = this.nextNoteId++;
        const parentActiveId = ev.parentEventIndex >= 0 ? this.activeIdByEvent.get(ev.parentEventIndex) ?? -1 : -1;
        const n: ActiveNote = {
          id,
          eventIndex: this.spawnIndex,
          note: ev.note,
          lane: ev.lane,
          issameline: ev.samelineLane,
          startMs: ev.startMs,
          hitMs: ev.hitMs,
          visibleEndMs: ev.visibleEndMs,
          visibilityWindows: ev.visibilityWindows,
          tgId: ev.tgId,
          tgPos: ev.tgPos,
          started: false,
          sePlayed: false,
          t: 0,
          gray: this.isGrayNote(ev.beat, ev.note),
          parentEventIndex: ev.parentEventIndex,
          parentActiveId
        };
        this.addActiveNote(n);
        this.noteLifecycleByEvent.set(this.spawnIndex, {
          eventIndex: this.spawnIndex,
          spawned: true,
          started: false,
          hitProcessed: false,
          judged: false,
          removed: false,
          hidden: ev.note.baseType === "hidden",
        });
      }

      this.spawnIndex += 1;
    }
  }

  private addActiveNote(note: ActiveNote): void {
    this.activeNotes.push(note);
    this.activeNotesMap.set(note.eventIndex, note);
    this.activeIdByEvent.set(note.eventIndex, note.id);
  }

  private removeActiveNoteAt(index: number): ActiveNote | null {
    const note = this.activeNotes[index] ?? null;
    if (!note) {
      return null;
    }
    this.activeNotesMap.delete(note.eventIndex);
    this.activeIdByEvent.delete(note.eventIndex);
    this.activeNotes.splice(index, 1);
    return note;
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

  private markNoteHitProcessed(eventIndex: number): void {
    const state = this.noteLifecycleByEvent.get(eventIndex);
    if (state) {
      state.hitProcessed = true;
    }
  }

  private markNoteJudged(eventIndex: number): void {
    const state = this.noteLifecycleByEvent.get(eventIndex);
    if (state) {
      state.judged = true;
    }
  }

  private markNoteRemoved(eventIndex: number): void {
    const state = this.noteLifecycleByEvent.get(eventIndex);
    if (state) {
      state.removed = true;
    }
  }

  private displayScore(): number {
    const notes = Math.max(1, this.notes);
    return Math.max(0, Math.floor(this.combo / notes * 10000000 + this.combo));
  }

  private stats(elapsedMs: number): RuntimeStats {
    return {
      combo: this.combo,
      notes: this.notes,
      nps: this.nps,
      npsMax: this.npsMax,
      bpmValue: this.bpmValue,
      score: this.displayScore(),
      activeObjects: this.activeNotes.length,
      processedObjects: this.processedObjects,
      totalObjects: this.chart.events.length,
      elapsedMs
    };
  }
}

