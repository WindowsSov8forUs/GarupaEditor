/**
 * Official BMS charts → Garupa JSON. The original's pipeline
 * (NoteBatchInformationListFactory.CreateNoteBatchInformationList): the
 * MusicScoreBezierConverter expands curve control notes into Slide nodes,
 * NoteDataBMSBuilder reads the score lines into note material, then Long
 * pairs, Slide families, the HABAHIRO wide-note combine and the directional
 * groups / Adds are set up. The result is written as Garupa JSON. The curve
 * arithmetic is float32 like the original; every operation is rounded with
 * Math.fround.
 */
import type {
  GarupaChartJson,
  GarupaChartJsonDirection,
  GarupaChartJsonItem,
  GarupaChartJsonSlideConnection,
  GarupaChartJsonSimpleNoteType,
} from "./garupa";
import { GARUPA_HEADER_HABAHIRO, GARUPA_SYSTEM_LANE_CHANGE } from "./garupa";
import { originalIntroSort } from "./originalIntroSort";

const UNITS_PER_BAR = 192; // NoteManager.MUSIC_BAR_DIVISION_COUNT
const UNITS_PER_BEAT = 48;
const SAMPLES = 200;
const QUANTUM = UNITS_PER_BAR >> 6; // 3
const f32 = Math.fround;

export class BmsConversionError extends Error {}

// ---------------------------------------------------------------- header

const CONTROL_NAMES = [
  "cont_bezier_front_a", "cont_bezier_front_b", "cont_bezier_back_a", "cont_bezier_back_b",
  "cont_force_front_a", "cont_force_front_b", "cont_force_back_a", "cont_force_back_b",
];
const isControlName = (name: string) => CONTROL_NAMES.includes(name);

interface Header {
  wav: Map<string, string>; // key → sound value (name up to the first '.')
  wavRaw: Map<string, string>; // key → file name
  wavOrder: { key: string; raw: string }[]; // declaration order
  startBpm: number | null;
  bpmTable: Map<string, number>;
  habahiro: boolean;
  shift: boolean;
}

function parseFloatStrict(text: string): number | null {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? Number(text) : null;
}

function bmsLines(text: string): string[] {
  return text.replace(/^﻿/, "").split("\n").map(line => line.replace(/\r+$/, ""));
}

function parseHeader(lines: readonly string[]): Header {
  const h: Header = { wav: new Map(), wavRaw: new Map(), wavOrder: [], startBpm: null, bpmTable: new Map(), habahiro: false, shift: false };
  for (const line of lines) {
    if (line.includes("#HABAHIRO")) h.habahiro = true;
    if (line.trim() === "#SHIFT") h.shift = true;
    if (line.startsWith("#WAV") && line.length >= 8) {
      const key = line.slice(4, 6), raw = line.slice(7).trim();
      if (!h.wavRaw.has(key)) {
        h.wavRaw.set(key, raw);
        h.wavOrder.push({ key, raw });
        h.wav.set(key, raw.split(".", 1)[0]!.split(" ").join(""));
      }
    } else if (line.startsWith("#BPM ")) {
      const value = parseFloatStrict(line.slice(5).trim());
      if (value !== null) h.startBpm = value;
    } else if (line.startsWith("#BPM") && line.length >= 8 && line[6] === " ") {
      const value = parseFloatStrict(line.slice(7).trim());
      if (value !== null) h.bpmTable.set(line.slice(4, 6).toUpperCase(), value);
    }
  }
  return h;
}

interface ScoreLine { bar: number; cc: number; value: string }

const isDigits = (text: string) => /^\d*$/.test(text);

function scoreLines(lines: readonly string[]): ScoreLine[] {
  const out: ScoreLine[] = [];
  for (const line of lines) {
    if (line.length >= 8 && line[0] === "#" && isDigits(line.slice(1, 4)) && isDigits(line.slice(4, 6)) && line[6] === ":") {
      out.push({ bar: Number(line.slice(1, 4)), cc: Number(line.slice(4, 6)), value: line.slice(7).replace(/[\s\u0085]/gu, "") });
    }
  }
  return out;
}

const cellPos = (index: number, count: number, bar: number) => Math.floor(UNITS_PER_BAR * index / count) + UNITS_PER_BAR * bar;

// ---------------------------------------------------------------- note material

const NORMAL_BUTTONS = [1, 2, 3, 4, 5, 0, -1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 3, 4, 5, 0, -1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 3, 4, 5, 0, -1, 6];
const SHIFT_BUTTONS = [0, 1, 2, 3, 4, 0, -1, 5, 6, -1, 8, 9, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 2, 3, 4, 0, -1, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 2, 3, 4, 0, -1, 5, 6, -1, 8, 9];

function bmsButton(cc: number, shift: boolean): number {
  return (shift ? SHIFT_BUTTONS : NORMAL_BUTTONS)[cc - 11] ?? -1;
}

/** NoteDataBMSBuilder.getFireNoteTypeWithSoundValue. */
function fireType(s: string, front: number): number {
  if (s === "flick" || s === "fever_note_flick") return front === 1 ? -1 : 2;
  if (s.includes("directional_fl_l") || s.includes("directional_fl_r")) return 5;
  if (s.includes("slide_a")) return 3;
  if (s.includes("slide_end_a") || s.includes("slide_end_flick_a") || s === "slide_end_dir_flick_l_a" || s === "slide_end_dir_flick_r_a") return -1;
  if (s.includes("slide_b")) return 4;
  if (s.includes("slide_end_b") || s.includes("slide_end_flick_b") || s === "slide_end_dir_flick_l_b" ||
    s === "slide_end_dir_flick_r_b" || s === "long_end_dir_flick_l" || s === "long_end_dir_flick_r") return -1;
  if (s === "add_long_dir_flick") return 7;
  if (s === "add_slide_dir_flick") return 8;
  return front;
}

const GAME_TYPE_NEEDLES: readonly (readonly [string, number])[] = [["slide_a", 4], ["slide_end_a", 6], ["slide_end_flick_a", 8], ["slide_b", 5],
  ["slide_end_b", 7], ["slide_end_flick_b", 9], ["directional_fl_l", 10], ["directional_fl_r", 11]];
const GAME_TYPE_NAMES: Readonly<Record<string, number>> = {
  long_end_dir_flick_l: 12, long_end_dir_flick_r: 13, slide_end_dir_flick_l_a: 14, slide_end_dir_flick_r_a: 15,
  slide_end_dir_flick_l_b: 16, slide_end_dir_flick_r_b: 17, add_long_dir_flick: 24, add_slide_dir_flick: 25,
};

/** NoteDataBMSBuilder.getGameNoteTypeWithSoundValue. */
function gameType(s: string, front: number): number {
  if (s === "flick" || s === "fever_note_flick") return front === 1 ? 3 : 2;
  for (const [needle, value] of GAME_TYPE_NEEDLES) if (s.includes(needle)) return value;
  if (Object.prototype.hasOwnProperty.call(GAME_TYPE_NAMES, s)) return GAME_TYPE_NAMES[s]!;
  return front === 1 ? 1 : front === 0 ? 0 : -1;
}

/** NoteUtility.GetGameNoteAdditionalTypeWithSoundValue. */
function additionalType(s: string): number {
  return s.includes("fever") ? 1 : s.includes("skill") ? 2 : s.includes("lane_change") ? 4 : 0;
}

function virtualLane(s: string, game: number): [number, number] {
  if (game !== 4 && game !== 5) return [0, 0];
  const direction = s.includes("LS") ? 1 : s.includes("RS") ? 2 : 0;
  if (direction === 0) return [0, 0];
  const digits = s.slice(10);
  return [direction, s.length > 10 && /^[+-]?\d+$/.test(digits) ? Number(digits) : 0];
}

type Role = "" | "long_head" | "long_tail" | "long_unpaired" | "slide_head" | "slide_node" | "orphan_add";

interface Note {
  pos: number; bar: number; cc: number; button: number;
  sound: string;
  front: number; game: number; add: number;
  invisible: boolean;
  vdir: number; vdist: number;
  buttons: number[];
  tail: Note | null;
  nodes: Note[];
  role: Role;
  combined: boolean;
  adds: Note[];
  entry: number;
}

function newNote(pos: number, bar: number, cc: number, sound: string, shift: boolean): Note {
  const front = cc >= 50 && cc < 62 ? 1 : 0;
  const game = gameType(sound, front);
  const [vdir, vdist] = virtualLane(sound, game);
  const button = bmsButton(cc, shift);
  return { pos, bar, cc, button, sound, front: fireType(sound, front), game, add: additionalType(sound),
    invisible: (cc >= 31 && cc <= 36) || (cc & ~1) === 38, vdir, vdist, buttons: [button], tail: null, nodes: [], role: "",
    combined: false, adds: [], entry: 0 };
}

// ---------------------------------------------------------------- Bezier expansion

const LANE_CC = [36, 31, 32, 33, 34, 35, 38];
const LANE_OF_CC: ReadonlyMap<number, number> = new Map([[11, 1], [12, 2], [13, 3], [14, 4], [15, 5], [16, 0], [18, 6],
  [31, 1], [32, 2], [33, 3], [34, 4], [35, 5], [36, 0], [38, 6], [51, 1], [52, 2], [53, 3], [54, 4], [55, 5], [56, 0], [58, 6]]);
const DECORATIONS = [".wav", "fever_note_", "_fever_note", "lane_change_", "_lane_change", "_skill", "_fever", "skill_", "fever_"];

function normalizeName(name: string): string {
  for (const decoration of DECORATIONS) name = name.split(decoration).join("");
  return name;
}

/** The Slide family of a sound name: 1 A, 2 B, 0 none. */
function slideGroup(name: string): number {
  switch (normalizeName(name)) {
    case "slide_a": case "slide_end_a": case "slide_end_dir_flick_l_a": case "slide_end_dir_flick_r_a": case "slide_end_flick_a":
      return 1;
    case "slide_b": case "slide_end_b": case "slide_end_dir_flick_l_b": case "slide_end_dir_flick_r_b": case "slide_end_flick_b":
      return 2;
  }
  return 0;
}

interface BezNote { key: string; name: string; pos: number; lane: number; cc: number; width: number }
interface BezSample { pos: number; lane: number; group: number; width: number; right: boolean }

function roundHalfEven(value: number): number {
  const floor = Math.floor(value), fraction = value - floor;
  return fraction > 0.5 ? floor + 1 : fraction < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
}
const rounded = (sample: BezSample) => roundHalfEven(sample.lane);
const sampleDiff = (sample: BezSample) => Math.trunc(f32(f32(sample.lane - rounded(sample)) * 100));

function qbez(a: number, c: number, b: number, t: number): number {
  const p = f32(f32(t * f32(c - a)) + a);
  const q = f32(f32(t * f32(b - c)) + c);
  return f32(p + f32(t * f32(q - p)));
}

function bezQuantize(position: number): number {
  const whole = Math.trunc(f32(position / QUANTUM));
  let base = whole * QUANTUM;
  if (f32(QUANTUM * 0.5) <= Math.trunc(f32(position - base))) base += QUANTUM;
  return base;
}

function base36(key: string): number {
  return /^[0-9a-z]+$/i.test(key) ? Number.parseInt(key, 36) : 0;
}

interface Cell { pos: number; sound: string }
interface ConvLine { bar: number; cc: number; cells: Cell[] }

/** MusicScoreBezierConverter.Convert: null when no control WAV is declared, else the score
 * lines that replace every source line. */
function bezierConvert(lines: readonly string[], h: Header): ConvLine[] | null {
  if (!h.wavOrder.some(w => CONTROL_NAMES.some(name => w.raw.includes(name)))) return null;
  const notes: BezNote[] = [];
  for (const line of scoreLines(lines)) {
    const count = Math.floor(line.value.length / 2);
    for (let i = 0; i < count; i++) {
      const key = line.value.slice(2 * i, 2 * i + 2);
      if (key === "00") continue;
      notes.push({ key, name: normalizeName(h.wavRaw.get(key) ?? ""), pos: cellPos(i, count, line.bar),
        lane: LANE_OF_CC.get(line.cc) ?? -1, cc: line.cc, width: 1 });
    }
  }
  const isControl = (n: BezNote, family: string) => isControlName(n.name) && n.name.endsWith(`_${family}`);
  let groupA: BezNote[] = [], groupB: BezNote[] = [];
  if (h.habahiro) {
    const slidesA: BezNote[] = [], slidesB: BezNote[] = [], controlsA: BezNote[] = [], controlsB: BezNote[] = [];
    for (const n of notes) {
      const g = slideGroup(n.name);
      if (g === 1) slidesA.push(n);
      else if (isControl(n, "a")) controlsA.push(n);
      else if (g === 2) slidesB.push(n);
      else if (isControl(n, "b")) controlsB.push(n);
    }
    const merge = (list: readonly BezNote[]) => {
      const sorted = [...list].sort((a, b) => a.pos !== b.pos ? a.pos - b.pos : a.lane - b.lane);
      const out: BezNote[] = [];
      for (const n of sorted) {
        const last = out[out.length - 1];
        if (last !== undefined && last.pos === n.pos && last.lane + last.width === n.lane) {
          out[out.length - 1] = { ...last, width: last.width + 1 };
          continue;
        }
        out.push(n);
      }
      return out;
    };
    groupA = [...merge(slidesA), ...controlsA];
    groupB = [...merge(slidesB), ...controlsB];
  } else {
    for (const n of notes) {
      const g = slideGroup(n.name);
      if (g === 1 || isControl(n, "a")) groupA.push(n);
      else if (g === 2 || isControl(n, "b")) groupB.push(n);
    }
  }
  const firstKey = (name: string) => {
    const wav = h.wavOrder.find(w => w.raw.includes(name));
    return wav === undefined ? 0 : base36(wav.key);
  };
  const sortGroup = (list: readonly BezNote[], family: string): BezNote[] => {
    const frontKey = firstKey(`cont_bezier_front_${family}`), backKey = firstKey(`cont_bezier_back_${family}`);
    const out = [...list];
    if (out.length > 1) {
      originalIntroSort(out, 0, out.length - 1, (a, b) => {
        if (a.pos !== b.pos) return a.pos - b.pos;
        const ak = base36(a.key), bk = base36(b.key);
        if (ak === backKey) return 1;
        if (bk === backKey) return -1;
        if (ak !== frontKey) return bk === frontKey ? 1 : 0;
        return -1;
      });
    }
    for (const force of out.filter(n => n.name.startsWith("cont_force_"))) {
      const index = out.indexOf(force);
      let target = -1;
      if (force.name.includes("front")) {
        target = out.findIndex(n => n.pos < force.pos && slideGroup(n.name) !== 0);
        if (target < 0) throw new BmsConversionError("曲线控制音符 force-front 之前没有滑条音符");
      } else {
        for (let k = out.length - 1; k >= 0; k--) {
          if (out[k]!.pos > force.pos && slideGroup(out[k]!.name) !== 0) { target = k; break; }
        }
        if (target < 0) throw new BmsConversionError("曲线控制音符 force-back 之后没有滑条音符");
      }
      out.splice(index, 1);
      if (index < target) target--;
      if (!force.name.includes("front")) target++;
      out.splice(target, 0, force);
    }
    return out;
  };
  const convert = (list: readonly BezNote[], multi: boolean): BezSample[] => {
    const raw: BezSample[] = [];
    for (let i = 0; i + 2 < list.length; i++) {
      const s = list[i]!, c = list[i + 1]!, e = list[i + 2]!;
      const g = slideGroup(s.name);
      if (g === 0 || !isControlName(c.name) || slideGroup(e.name) !== g) continue;
      let sl = f32(s.lane), el = f32(e.lane);
      const cl = f32(c.lane);
      const right = sl < cl && el < cl;
      if (multi && right) {
        sl = f32(sl + f32(s.width - 1));
        el = f32(el + f32(e.width - 1));
      }
      for (let k = 1; k < SAMPLES; k++) {
        const t = Math.max(Math.min(f32(k / SAMPLES), 1), 0);
        const pos = bezQuantize(qbez(f32(s.pos), f32(c.pos), f32(e.pos), t));
        if (pos === s.pos || pos === e.pos) continue;
        raw.push({ pos, lane: qbez(sl, cl, el, t), group: g, width: s.width, right });
      }
    }
    // collapse per (position, family), in first-appearance order
    const index = new Map<string, number>();
    const groups: BezSample[][] = [];
    for (const sample of raw) {
      const key = `${sample.pos}:${sample.group}`;
      const i = index.get(key);
      if (i !== undefined) groups[i]!.push(sample);
      else { index.set(key, groups.length); groups.push([sample]); }
    }
    const collapsed = groups.map(v => {
      let sum = 0; // Enumerable.Sum(float) accumulates in double
      for (const x of v) sum += x.lane;
      return { ...v[0]!, lane: f32(f32(sum) / v.length) };
    });
    const drop = new Set<number>();
    let run = 0;
    if (collapsed.length >= 4) {
      for (let cur = 1; cur < collapsed.length - 2; cur++) {
        const p = collapsed[cur - run - 1]!, c = collapsed[cur]!, f = collapsed[cur + 1]!;
        let redundant = sampleDiff(p) === sampleDiff(c) && sampleDiff(c) === sampleDiff(f);
        if (!redundant) {
          // positions are subtracted as uint32 before the float conversion
          const a1 = f32(Math.atan2(f32((c.pos - p.pos) >>> 0), f32(sampleDiff(c) - sampleDiff(p))));
          const a2 = f32(Math.atan2(f32((f.pos - c.pos) >>> 0), f32(sampleDiff(f) - sampleDiff(c))));
          const d = f32(f32(a2 * f32(57.296)) - f32(a1 * f32(57.296)));
          redundant = f32(Math.abs(d)) < 2;
        }
        if (redundant) { drop.add(cur); run++; } else run = 0;
      }
    }
    const kept = collapsed.filter((_, i) => !drop.has(i)).sort((a, b) => sampleDiff(a) - sampleDiff(b));
    if (!multi) return kept;
    const seen = new Set<string>();
    const out: BezSample[] = [];
    for (const s of kept) {
      const candidates = [s];
      for (let w = 2; w <= s.width; w++) {
        const offset = f32(s.right ? -(w - 1) : w - 1);
        candidates.push({ ...s, lane: f32(s.lane + offset) });
      }
      for (const c of candidates) {
        const r = rounded(c);
        if (r < 0 || r > 6) { out.push(c); continue; } // reported by generate
        const key = `${LANE_CC[r]}:${c.pos}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  };
  const serialize = (source: readonly BezNote[], generated: readonly Cell[], ccs: readonly number[]): ConvLine[] => {
    const index = new Map<string, number>();
    const out: ConvLine[] = [];
    const add = (pos: number, cc: number, sound: string) => {
      const bar = Math.floor(pos / UNITS_PER_BAR), key = `${bar}:${cc}`;
      let i = index.get(key);
      if (i === undefined) { i = out.length; index.set(key, i); out.push({ bar, cc, cells: [] }); }
      if (out[i]!.cells.some(c => c.pos === pos)) return; // the first cell of a position stays
      out[i]!.cells.push({ pos, sound });
    };
    for (const n of source) add(n.pos, n.cc, h.wav.get(n.key) ?? "");
    generated.forEach((g, i) => add(g.pos, ccs[i]!, g.sound));
    for (const line of out) line.cells.sort((a, b) => a.pos - b.pos);
    return out;
  };
  const rawA: BezNote[] = [], rawB: BezNote[] = [], plain: BezNote[] = [];
  for (const n of notes) {
    const g = slideGroup(n.name);
    if (g === 1 || isControl(n, "a")) rawA.push(n);
    else if (g === 2 || isControl(n, "b")) rawB.push(n);
    if (g === 0 && !isControlName(n.name)) plain.push(n);
  }
  const generate = (list: readonly BezNote[], rawList: readonly BezNote[], family: string): ConvLine[] => {
    const cells: Cell[] = [], ccs: number[] = [];
    for (const sample of convert(sortGroup(list, family), h.habahiro)) {
      const r = rounded(sample);
      if (r < 0 || r > 6) throw new BmsConversionError(`曲线滑条轨道 ${sample.lane} 超出 0–6`);
      let name = sample.group === 2 ? "slide_b" : "slide_a";
      let d = sampleDiff(sample);
      if (d !== 0) {
        let direction = "RS";
        if (d < 0) { direction = "LS"; d = -d; }
        name = `${name}_${direction}${String(d).padStart(2, "0")}`;
      }
      cells.push({ pos: sample.pos, sound: name });
      ccs.push(LANE_CC[r]!);
    }
    return serialize(sortGroup(rawList, family).filter(n => !isControlName(n.name)), cells, ccs);
  };
  const linesA = generate(groupA, rawA, "a");
  const linesB = generate(groupB, rawB, "b");
  const out = [...serialize(plain, [], []), ...linesA, ...linesB];
  return out.length === 0 ? null : out;
}

// ---------------------------------------------------------------- material set

interface Parsed { header: Header; notes: Note[]; bpm: { pos: number; value: number }[] }

function parseBms(text: string): Parsed {
  const lines = bmsLines(text);
  const h = parseHeader(lines);
  const table = new Set<string>();
  const notes: Note[] = [];
  const bpmCommands = new Map<number, number>();
  const entries = new Map<string, number>();
  const perBar = new Map<number, number>();
  const entry = (bar: number, button: number) => {
    const key = `${bar}:${button}`;
    const existing = entries.get(key);
    if (existing !== undefined) return existing;
    const value = perBar.get(bar) ?? 0;
    entries.set(key, value);
    perBar.set(bar, value + 1);
    return value;
  };
  const scores = scoreLines(lines);
  for (const line of scores) {
    if (line.cc !== 3 && line.cc !== 8) continue;
    const count = Math.floor(line.value.length / 2);
    for (let i = 0; i < count; i++) {
      const key = line.value.slice(2 * i, 2 * i + 2);
      if (key === "00") continue;
      const pos = cellPos(i, count, line.bar);
      let value: number;
      if (line.cc === 3) {
        if (!/^[+-]?[0-9a-f]+$/i.test(key)) continue;
        value = Number.parseInt(key, 16);
      } else {
        const tempo = h.bpmTable.get(key.toUpperCase());
        if (tempo === undefined) continue;
        value = tempo;
      }
      if (!bpmCommands.has(pos)) bpmCommands.set(pos, value);
    }
  }
  const cells = bezierConvert(lines, h) ?? scores.map(line => {
    const count = Math.floor(line.value.length / 2);
    const out: ConvLine = { bar: line.bar, cc: line.cc, cells: [] };
    for (let i = 0; i < count; i++) {
      const key = line.value.slice(2 * i, 2 * i + 2);
      if (key !== "00") out.cells.push({ pos: cellPos(i, count, line.bar), sound: h.wav.get(key) ?? "" });
    }
    return out;
  });
  for (const line of cells) {
    if (line.cc >= 1 && line.cc <= 9) continue;
    const button = bmsButton(line.cc, h.shift);
    if (button < 0) continue;
    const lineEntry = entry(line.bar, button); // createBarData creates the (bar, button) entry per line
    for (const cell of line.cells) {
      const note = newNote(cell.pos, line.bar, line.cc, cell.sound, h.shift);
      note.entry = lineEntry;
      const key = `${note.button}:${note.pos}`;
      if (!table.has(key)) { table.add(key); notes.push(note); } // first one of a button and position wins
    }
  }
  notes.sort((a, b) => a.pos !== b.pos ? a.pos - b.pos : a.button !== b.button ? a.button - b.button : a.cc - b.cc);
  const bpm = [...bpmCommands].map(([pos, value]) => ({ pos, value })).sort((a, b) => a.pos - b.pos);
  return { header: h, notes, bpm };
}

// ---------------------------------------------------------------- structure

interface DirectionalGroup { pos: number; game: number; members: Note[] }

const SLIDE_ENDS = [6, 7, 8, 9, 14, 15, 16, 17];

function buildStructure(p: Parsed): DirectionalGroup[] {
  const notes = p.notes;
  // Long pairs per button, chronological
  const perButton = new Map<number, Note[]>();
  for (const n of notes) {
    if (![1, 3, 12, 13].includes(n.game)) continue;
    const list = perButton.get(n.button);
    if (list === undefined) perButton.set(n.button, [n]);
    else list.push(n);
  }
  for (const list of perButton.values()) {
    for (let i = 0; i + 1 < list.length; i += 2) {
      list[i]!.role = "long_head";
      list[i + 1]!.role = "long_tail";
      list[i]!.tail = list[i + 1]!;
    }
    if (list.length % 2 === 1) list[list.length - 1]!.role = "long_unpaired";
  }
  // Slide families: position order, ties in reverse (bar, button) entry order
  for (const family of [[4, 6, 8, 14, 15], [5, 7, 9, 16, 17]]) {
    const list = notes.filter(n => family.includes(n.game)).sort((a, b) => a.pos !== b.pos ? a.pos - b.pos : b.entry - a.entry);
    let head: Note | null = null;
    list.forEach((n, i) => {
      if (head === null) {
        head = n;
        n.role = "slide_head";
      } else if (p.header.habahiro && n.pos === head.pos) {
        head.buttons.push(n.button);
        n.combined = true;
      } else {
        const same = p.header.habahiro ? head.nodes.find(x => x.pos === n.pos) : undefined;
        if (same !== undefined) {
          same.buttons.push(n.button);
          n.combined = true;
        } else {
          n.role = "slide_node";
          head.nodes.push(n);
        }
      }
      if (SLIDE_ENDS.includes(n.game) && !(i + 1 < list.length && list[i + 1]!.game === n.game)) head = null;
    });
  }
  // batches per position
  const batchIndex = new Map<number, number>();
  const batches: Note[][] = [];
  const batchPos: number[] = [];
  for (const n of notes) {
    let i = batchIndex.get(n.pos);
    if (i === undefined) { i = batches.length; batchIndex.set(n.pos, i); batches.push([]); batchPos.push(n.pos); }
    batches[i]!.push(n);
  }
  // HABAHIRO wide-note combine
  if (p.header.habahiro) {
    for (const list of batches) {
      list.sort((a, b) => a.button - b.button);
      let run: Note[] = [];
      const closeRun = () => {
        if (run.length === 0) return;
        const centre = Math.trunc((run[0]!.button + run[run.length - 1]!.button) / 2);
        const rep = list.find(x => x.button === centre);
        if (rep === undefined) return;
        for (const x of run) {
          if (x !== rep) {
            rep.buttons.push(x.button);
            if (x.vdir !== 0) rep.vdir = x.vdir;
            if (x.vdist !== 0) rep.vdist = x.vdist;
            if (x.tail !== null && rep.tail !== null) rep.tail.buttons.push(x.tail.button);
            if (x.add === 2 && rep.add !== 2) rep.add = 2;
          }
          x.combined = true;
        }
        rep.combined = false;
      };
      for (const x of list) {
        if ((x.game >= 4 && x.game < 26) || x.combined) {
          closeRun();
          run = [];
          continue;
        }
        if (x.role === "long_tail") continue;
        const last = run[run.length - 1];
        if (last !== undefined && x.game === last.game && x.button === last.button + 1) run.push(x);
        else { closeRun(); run = [x]; }
      }
      closeRun();
    }
  }
  // directional groups and Adds, in position order
  const order = batches.map((_, i) => i).sort((a, b) => batchPos[a]! - batchPos[b]!);
  const groups: DirectionalGroup[] = [];
  for (const bi of order) {
    const pos = batchPos[bi]!, list = batches[bi]!;
    const directionals = list.filter(n => (n.game === 10 || n.game === 11) && !n.combined).sort((a, b) => a.button - b.button);
    for (const n of directionals) {
      const last = groups[groups.length - 1];
      if (last !== undefined && last.pos === pos && last.game === n.game && last.members[last.members.length - 1]!.button + 1 === n.button) {
        last.members.push(n);
      } else {
        groups.push({ pos, game: n.game, members: [n] });
      }
    }
    for (const { add, ends: endTypes } of [{ add: 25, ends: [14, 15, 16, 17] }, { add: 24, ends: [12, 13] }]) {
      const adds = list.filter(n => n.game === add);
      const ends = list.filter(n => n.game !== add && endTypes.includes(n.game));
      for (const e of ends) {
        const step = [12, 14, 16].includes(e.game) ? -1 : 1;
        for (let b = e.button + step; ; b += step) {
          const found = adds.findIndex(a => a.button === b);
          if (found < 0) break;
          e.adds.push(adds[found]!);
          adds.splice(found, 1);
        }
      }
      for (const a of adds) a.role = "orphan_add";
    }
  }
  return groups;
}

// ---------------------------------------------------------------- Garupa emission

const beatOf = (pos: number) => pos / UNITS_PER_BEAT;

function laneSpan(n: Note): [number, number] {
  const unique = [...new Set(n.buttons)].sort((a, b) => a - b);
  if (unique.some((b, i) => b !== unique[0]! + i)) {
    throw new BmsConversionError(`第 ${beatOf(n.pos)} 拍的宽音符轨道不连续（${unique.join(", ")}）`);
  }
  return [unique[0]!, unique.length];
}

function simpleNote(type: Exclude<GarupaChartJsonSimpleNoteType, "Hidden">, n: Note) {
  const [lane, width] = laneSpan(n);
  return { type, beat: beatOf(n.pos), lane, width };
}

const isLeftDirectionalEnd = (game: number) => game === 12 || game === 14 || game === 16;

/** One Slide / Long connection: only after-nodes take the invisibility and the virtual lane
 * (NoteSlideAfter); a head is a visible front, a visible node sits on its button. A directional
 * end spans its Add lanes (Slide and Long multiple directional ends alike). */
function connection(n: Note, head: boolean): GarupaChartJsonSlideConnection {
  const [lane, width] = laneSpan(n);
  const g = n.game, beat = beatOf(n.pos);
  if (g >= 12 && g <= 17) {
    const direction: GarupaChartJsonDirection = isLeftDirectionalEnd(g) ? "Left" : "Right";
    return { type: "Directional", beat, lane, width: 1 + n.adds.length, direction };
  }
  if (g === 3 || g === 8 || g === 9) return { type: "Flick", beat, lane, width };
  if (n.invisible && !head) {
    const sign = n.vdir === 1 ? -1 : n.vdir === 2 ? 1 : 0;
    return { type: "Hidden", beat, lane: (100 * lane + sign * n.vdist) / 100, width };
  }
  return { type: n.add === 2 ? "Skill" : "Single", beat, lane, width };
}

interface Keyed { pos: number; button: number; cc: number; family?: "A" | "B"; item: GarupaChartJsonItem }

export interface BmsConversionResult {
  readonly chart: GarupaChartJson;
  /** Notes the conversion leaves out: unpaired Long notes, single-node or unterminated Slides,
   * unhandled sound values. */
  readonly warnings: readonly string[];
}

/** Converts an official BMS chart into a Garupa JSON chart. */
export function convertBmsToGarupaChartJson(text: string): BmsConversionResult {
  const p = parseBms(text);
  const groups = buildStructure(p);
  const items: Keyed[] = [];
  const warnings: string[] = [];
  if (p.header.habahiro) items.push({ pos: -2, button: 0, cc: 0, item: { type: "Header", data: GARUPA_HEADER_HABAHIRO } });
  if (p.header.startBpm === null) throw new BmsConversionError("缺少 #BPM 头");
  items.push({ pos: -1, button: 0, cc: 0, item: { type: "BPM", beat: 0, value: p.header.startBpm } });
  for (const b of p.bpm) items.push({ pos: b.pos, button: -1, cc: 0, item: { type: "BPM", beat: beatOf(b.pos), value: b.value } });
  let laneChange = -1;
  for (const n of p.notes) {
    if (n.combined) continue;
    const key = { pos: n.pos, button: Math.min(...n.buttons), cc: n.cc };
    if (p.header.habahiro && n.add === 4) laneChange = n.pos;
    if (n.role === "long_head") {
      const head = simpleNote(n.add === 2 ? "Skill" : "Single", n);
      let tail = connection(n.tail!, false);
      // A Directional tail starts on the root's own lane, the center the wide combine keeps.
      tail = tail.type === "Directional" ? { ...tail, lane: n.tail!.button } : { ...tail, lane: head.lane, width: head.width };
      items.push({ ...key, item: { type: "Slide", long: true, connections: [head, tail] } });
    } else if (n.role === "slide_head") {
      const connections = [connection(n, true), ...n.nodes.map(x => connection(x, false))];
      if (connections.length < 2) {
        warnings.push(`第 ${beatOf(n.pos)} 拍的单节点滑条已略去`);
        continue;
      }
      if (!SLIDE_ENDS.includes(n.nodes[n.nodes.length - 1]!.game)) warnings.push(`第 ${beatOf(n.pos)} 拍的滑条没有终点`);
      items.push({ ...key, family: [4, 6, 8, 14, 15].includes(n.game) ? "A" : "B", item: { type: "Slide", connections } });
    } else if (n.role === "long_tail" || n.role === "slide_node" || n.role === "orphan_add") {
      // emitted with their head, or left out like the original
    } else if (n.role === "long_unpaired") {
      warnings.push(`第 ${beatOf(n.pos)} 拍的未配对长押音符已略去`);
    } else if ((n.game === 0 || n.game === 2) && (n.front === 0 || n.front === 2)) {
      items.push({ ...key, item: simpleNote(n.game === 2 ? "Flick" : n.add === 2 ? "Skill" : "Single", n) });
    } else if (![10, 11, 24, 25, 4, 5].includes(n.game) && !SLIDE_ENDS.includes(n.game)) {
      warnings.push(`第 ${beatOf(n.pos)} 拍有未处理的音符 "${n.sound}"（类型 ${n.game}）`);
    }
  }
  for (const group of groups) {
    const buttons = group.members.map(m => m.button);
    const minButton = Math.min(...buttons), maxButton = Math.max(...buttons);
    const left = group.game === 10;
    items.push({ pos: group.pos, button: minButton, cc: group.members[0]!.cc, item: { type: "Directional", beat: beatOf(group.pos),
      lane: left ? maxButton : minButton, width: group.members.length, direction: left ? "Left" : "Right" } });
  }
  if (laneChange >= 0) items.push({ pos: laneChange, button: 99, cc: 0, item: { type: "System", beat: beatOf(laneChange), data: GARUPA_SYSTEM_LANE_CHANGE } });
  items.sort((a, b) => a.pos !== b.pos ? a.pos - b.pos : a.button !== b.button ? a.button - b.button : a.cc - b.cc);
  // Slide-family parity: Garupa assigns A/B by the ordinal of the non-long Slides (even = A);
  // refill their slots alternately from the A and B queues, chronological inside each.
  const slots: number[] = [], queueA: Keyed[] = [], queueB: Keyed[] = [];
  items.forEach((item, i) => {
    if (item.item.type !== "Slide" || item.item.long) return;
    slots.push(i);
    (item.family === "A" ? queueA : queueB).push(item);
  });
  slots.forEach((slot, k) => {
    items[slot] = (k % 2 === 0 && queueA.length > 0) || queueB.length === 0 ? queueA.shift()! : queueB.shift()!;
  });
  return { chart: items.map(item => item.item), warnings };
}
