import { LEGACY_TIMING_FPS, legacyOffsetToMs } from "./legacyMath";
import { hitEffectKind, isHiddenNoSeType, isJudgedType } from "./score";
import { ActiveNote, HitEffectEvent, ParsedChart, RuntimeStats, SimulatorSettings } from "./types";

interface TimingGroupRuntime {
  speed: number;
  pos: number;
  cursor: number;
}

interface PendingSystemEvent {
  type: 0 | 20;
  startMs: number;
  bpm?: number;
}

function isGrayEligibleType(type: number): boolean {
  return type === 1 || type === 10 || type === 101;
}

export class LegacyRuntime {
  private readonly settings: SimulatorSettings;
  private readonly chart: ParsedChart;

  private readonly activeNotes: ActiveNote[] = [];
  private readonly activeIdByEvent = new Map<number, number>();
  private readonly npsExpiryMs: number[] = [];
  private readonly pendingSystemEvents: PendingSystemEvent[] = [];

  private readonly tgState: TimingGroupRuntime[];

  private startMs = 0;
  private started = false;
  private spawnIndex = 0;
  private nextNoteId = 1;

  private combo = 0;
  private notes = 0;
  private nps = 0;
  private npsMax = 0;
  private bpmText = 0;
  private processedObjects = 0;

  private pendingSeTypes: number[] = [];
  private pendingHitEffects: HitEffectEvent[] = [];
  private pendingMusicStart = false;

  constructor(settings: SimulatorSettings, chart: ParsedChart) {
    this.settings = settings;
    this.chart = chart;
    this.notes = chart.noteCount;
    this.bpmText = chart.initialBpm;
    this.tgState = chart.timingGroups.map(() => ({ speed: 1, pos: 0, cursor: 0 }));
  }

  start(nowMs: number): void {
    this.startMs = nowMs;
    this.started = true;
  }

  isStarted(): boolean {
    return this.started;
  }

  isFinished(): boolean {
    return this.combo >= this.notes
      && this.activeNotes.length === 0
      && this.pendingSystemEvents.length === 0
      && this.spawnIndex >= this.chart.events.length;
  }

  consumePendingMusicStart(): boolean {
    const v = this.pendingMusicStart;
    this.pendingMusicStart = false;
    return v;
  }

  consumePendingSeTypes(): number[] {
    const out = this.pendingSeTypes;
    this.pendingSeTypes = [];
    return out;
  }

  consumePendingHitEffects(): HitEffectEvent[] {
    const out = this.pendingHitEffects;
    this.pendingHitEffects = [];
    return out;
  }

  getActiveNotes(): readonly ActiveNote[] {
    return this.activeNotes;
  }

  getProgress(elapsedMs: number): number {
    return Math.max(0, Math.min(1, elapsedMs / Math.max(1, this.chart.maxTimeMs)));
  }

  update(nowMs: number): RuntimeStats {
    if (!this.started) {
      return this.stats(0);
    }

    const elapsed = nowMs - this.startMs;
    this.updateTimingGroups(elapsed);
    this.spawnDueEvents(elapsed);
    this.flushPendingSystemEvents(elapsed);

    while (this.npsExpiryMs.length > 0 && elapsed >= this.npsExpiryMs[0]) {
      this.npsExpiryMs.shift();
      this.nps = Math.max(0, this.nps - 1);
    }

    for (let i = this.activeNotes.length - 1; i >= 0; i -= 1) {
      const note = this.activeNotes[i];
      this.updateNote(note, elapsed);

      if (!note.started) {
        continue;
      }

      if (note.t >= this.settings.noteSpeedFrames) {
        if (!note.sePlayed) {
          note.sePlayed = true;
          this.pushSe(note.type);
        }

        this.resolveHit(note.type, note.lane, elapsed);
        this.activeIdByEvent.delete(note.eventIndex);
        this.activeNotes.splice(i, 1);
        this.processedObjects += 1;
      }
    }

    return this.stats(elapsed);
  }

  private updateTimingGroups(elapsedMs: number): void {
    const x = elapsedMs - legacyOffsetToMs(this.settings.offset);
    for (let tg = 0; tg < this.chart.timingGroups.length; tg += 1) {
      const def = this.chart.timingGroups[tg];
      const state = this.tgState[tg];
      while (state.cursor < def.changes.length && x >= def.changes[state.cursor].atMs) {
        const ch = def.changes[state.cursor];
        state.speed = ch.speed;
        state.pos = ch.pos;
        state.cursor += 1;
      }
    }
  }

  private tgPosAt(tgId: number, elapsedMs: number): number {
    if (tgId < 0 || tgId >= this.tgState.length) {
      return 0;
    }
    const state = this.tgState[tgId];
    const x = elapsedMs - legacyOffsetToMs(this.settings.offset);
    return state.pos + state.speed * x;
  }

  private spawnDueEvents(elapsedMs: number): void {
    while (this.spawnIndex < this.chart.events.length) {
      const ev = this.chart.events[this.spawnIndex];
      if (elapsedMs + 100 < ev.startMs) {
        break;
      }

      if (ev.type === 20) {
        this.pendingSystemEvents.push({
          type: 20,
          startMs: ev.startMs,
          bpm: ev.bpm,
        });
      } else if (ev.type === 0) {
        this.pendingSystemEvents.push({
          type: 0,
          startMs: ev.startMs,
        });
      } else {
        const id = this.nextNoteId++;
        const parentActiveId = ev.parentEventIndex >= 0 ? this.activeIdByEvent.get(ev.parentEventIndex) ?? -1 : -1;
        const n: ActiveNote = {
          id,
          eventIndex: this.spawnIndex,
          type: ev.type,
          lane: ev.lane,
          issameline: ev.samelineLane,
          startMs: ev.startMs,
          tgId: ev.tgId,
          tgPos: ev.tgPos,
          started: false,
          sePlayed: false,
          t: 0,
          gray: this.isGrayNote(ev.beat, ev.type),
          parentEventIndex: ev.parentEventIndex,
          parentActiveId
        };
        this.activeNotes.push(n);
        this.activeIdByEvent.set(this.spawnIndex, id);
      }

      this.spawnIndex += 1;
    }
  }

  private flushPendingSystemEvents(elapsedMs: number): void {
    while (this.pendingSystemEvents.length > 0) {
      const event = this.pendingSystemEvents[0];
      if (elapsedMs < event.startMs) {
        break;
      }
      this.pendingSystemEvents.shift();
      if (event.type === 20) {
        this.bpmText = event.bpm ?? this.bpmText;
      } else {
        this.pendingMusicStart = true;
      }
      this.processedObjects += 1;
    }
  }

  private updateNote(note: ActiveNote, elapsedMs: number): void {
    if (note.tgId >= 0) {
      const tRaw = (this.tgPosAt(note.tgId, elapsedMs) * LEGACY_TIMING_FPS) / 100
        + this.settings.noteSpeedFrames
        - (note.tgPos * LEGACY_TIMING_FPS) / 100;
      if (tRaw < 0) {
        note.started = false;
        note.t = 0;
      } else {
        note.started = true;
        note.t = Math.floor(tRaw);
      }
    } else if (elapsedMs >= note.startMs) {
      note.started = true;
      note.t = Math.floor((elapsedMs - note.startMs) * LEGACY_TIMING_FPS / 1000);
    } else {
      note.started = false;
      note.t = 0;
    }
  }

  private isGrayNote(beat: number, type: number): boolean {
    if (!this.settings.grayEnabled || !isGrayEligibleType(type)) {
      return false;
    }
    const p = beat * this.settings.grayMultiplier;
    return p - Math.floor(p) >= 0.0001;
  }

  private resolveHit(type: number, lane: number, elapsedMs: number): void {
    if (!isJudgedType(type)) {
      return;
    }

    this.combo += 1;
    this.nps += 1;
    if (this.nps > this.npsMax) {
      this.npsMax = this.nps;
    }
    this.npsExpiryMs.push(elapsedMs + 1000);

    if (this.settings.effectEnable) {
      const k = hitEffectKind(type);
      if (k) {
        this.pendingHitEffects.push({ kind: k, lane });
      }
    }
  }

  private pushSe(type: number): void {
    if (isHiddenNoSeType(type)) {
      return;
    }
    this.pendingSeTypes.push(type);
  }

  private displayScore(): number {
    const notes = Math.max(1, this.notes);
    return this.combo / notes * 10000000 + this.combo;
  }

  private stats(elapsedMs: number): RuntimeStats {
    return {
      combo: this.combo,
      notes: this.notes,
      nps: this.nps,
      npsMax: this.npsMax,
      bpmText: this.bpmText,
      score: this.displayScore(),
      activeObjects: this.activeNotes.length,
      processedObjects: this.processedObjects,
      totalObjects: this.chart.events.length,
      elapsedMs
    };
  }
}

