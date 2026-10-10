import type { ChartMetadata, ChartSettings, ChartNote, ChartBpmEvent, ChartTimingGroupMap } from "../chartCore";
import type { SlideChain } from "../app/editorHelpers";
import type { ChartMediaResources } from "../resources/selections";
import type { ObservedIntegrity, ResourceRef } from "../resources/contracts";
import { createResourceRef } from "../resources/contracts";

export const PROJECT_FORMAT = "GarupaEditor.ChartProject";
export const PROJECT_VERSION = 1;
export const PROJECT_MEDIA_ROLES = ["bgm", "cover", "mv", "stageBackdrop"] as const;
export type ProjectMediaRole = typeof PROJECT_MEDIA_ROLES[number];

/** Persisted editing data, not a replay of import heuristics or a runtime scene. */
export interface ProjectChart {
  settings: ChartSettings;
  notes: ChartNote[];
  slideChains: SlideChain[];
  bpmEvents: ChartBpmEvent[];
  timingGroups: ChartTimingGroupMap;
}
export interface ProjectMedia {
  ref: ResourceRef;
  fileName: string;
  mediaType: string;
  integrity: ObservedIntegrity;
}
export interface ChartProjectDraft {
  projectId: string;
  metadata: ChartMetadata;
  chart: ProjectChart;
  mediaRefs: ChartMediaResources;
  audioFileName: string;
  audioDurationSec: number;
}
export interface ChartProject {
  format: typeof PROJECT_FORMAT;
  schemaVersion: 1;
  semanticsVersion: 1;
  projectId: string;
  contentHash: string;
  metadata: ChartMetadata;
  chart: ProjectChart;
  media: Record<ProjectMediaRole, ProjectMedia | null>;
  audioFileName: string;
  audioDurationSec: number;
}

/** Sort object keys only. Arrays (including same-beat events and connections) keep their order. */
export function canonicalJson(value: unknown): string {
  const encode = (item: unknown): unknown => {
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("项目包含非有限数值");
    if (Array.isArray(item)) return item.map(encode);
    if (item !== null && typeof item === "object") return Object.fromEntries(
      Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([k, v]) => [k, encode(v)]),
    );
    return item;
  };
  return JSON.stringify(encode(value));
}
export async function projectHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Identity is deliberately excluded; references are made portable by their content hashes. */
export function projectContent(project: Omit<ChartProject, "contentHash"> | ChartProject): unknown {
  const ids = new Map(project.chart.notes.map((note, index) => [note.id, index]));
  return {
    semanticsVersion: project.semanticsVersion, metadata: project.metadata,
    chart: { ...project.chart,
      notes: project.chart.notes.map(({ id: _id, ...note }) => note),
      slideChains: project.chart.slideChains.map(({ id: _id, noteIds, ...chain }) => ({ ...chain, noteIds: noteIds.map(id => ids.get(id)) })),
      bpmEvents: project.chart.bpmEvents.map(({ id: _id, ...event }) => event),
      timingGroups: Object.fromEntries(Object.entries(project.chart.timingGroups).map(([id, group]) => [id,
        { ...group, sv: group.sv.map(({ id: _id, ...event }) => event) }])),
    },
    media: Object.fromEntries(PROJECT_MEDIA_ROLES.map(role => [role, project.media[role] === null ? null : {
      mediaType: project.media[role]!.mediaType, integrity: project.media[role]!.integrity,
    }])),
    audioDurationSec: project.audioDurationSec,
  };
}

function requireValue(ok: unknown, field: string): asserts ok {
  if (!ok) throw new Error(`无效谱面项目：${field}`);
}
const record = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === "string";
const identifier = (v: unknown): v is string => text(v) && v.length > 0;
const timingGroupId = (value: unknown) => text(value) && /^#[A-Za-z0-9 -]+$/.test(value);
const HASH = /^[A-F0-9]{64}$/;

/** Validate structure without sorting, snapping, dropping or replacing persisted values. */
export function validateProject(value: unknown): asserts value is ChartProject {
  requireValue(record(value) && value.format === PROJECT_FORMAT, "文件类型");
  requireValue(value.schemaVersion === PROJECT_VERSION && value.semanticsVersion === 1, "不支持的项目版本");
  requireValue(identifier(value.projectId) && HASH.test(value.contentHash), "项目标识／内容摘要");
  const m = value.metadata, c = value.chart;
  requireValue(record(m) && [m.title, m.artist, m.charter, m.difficultyLevel].every(text)
    && ["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"].includes(m.difficulty)
    && typeof m.isFullLength === "boolean" && [m.bpm, m.offsetMs, m.mvOffsetMs].every(finite) && m.bpm > 0, "元信息");
  requireValue(record(c) && record(c.settings) && [c.settings.laneCount, c.settings.timeSignatureNumerator,
    c.settings.timeSignatureDenominator].every(n => finite(n) && n > 0), "谱面设置");
  requireValue(Array.isArray(c.notes) && Array.isArray(c.slideChains) && Array.isArray(c.bpmEvents)
    && record(c.timingGroups), "谱面结构");
  const unique = (items: any[], label: string) => {
    const ids = new Set<string>();
    for (const item of items) {
      requireValue(record(item) && identifier(item.id) && !ids.has(item.id), `${label} ID`); ids.add(item.id);
    }
    return ids;
  };
  const noteIds = unique(c.notes, "音符");
  unique(c.slideChains, "Slide"); unique(c.bpmEvents, "BPM");
  for (const n of c.notes) {
    requireValue(["single", "flick", "skill", "hidden", "slide", "directional_flick_left", "directional_flick_right"].includes(n.type)
      && finite(n.beat) && finite(n.lane) && (n.width === undefined || finite(n.width))
      && (n.endBeat === undefined || finite(n.endBeat)) && (n.endLane === undefined || finite(n.endLane))
      && (n.timingGroup === undefined || timingGroupId(n.timingGroup)), "音符数据");
  }
  for (const chain of c.slideChains) requireValue(Array.isArray(chain.noteIds) && chain.noteIds.length >= 2
    && chain.noteIds.every((id: unknown) => text(id) && noteIds.has(id))
    && (chain.timingGroup === undefined || timingGroupId(chain.timingGroup)), "Slide 连接");
  for (const b of c.bpmEvents) requireValue(finite(b.beat) && finite(b.bpm) && b.bpm !== 0, "BPM 数据");
  let lastBeat = 0, lastBpm = m.bpm;
  for (const b of c.bpmEvents) if (b.beat >= lastBeat) { lastBeat = b.beat; lastBpm = b.bpm; }
  requireValue(lastBpm > 0, "末尾 BPM 必须为正数");
  for (const [id, group] of Object.entries(c.timingGroups)) {
    requireValue(timingGroupId(id) && record(group) && Array.isArray(group.sv), "TimingGroup");
    unique(group.sv, "SV");
    for (const e of group.sv) requireValue(finite(e.beat) && finite(e.value) && e.timingGroup === id, "SV 数据");
  }
  requireValue(record(value.media), "媒体清单");
  for (const role of PROJECT_MEDIA_ROLES) {
    const media = value.media[role];
    if (media === null) continue;
    requireValue(record(media) && record(media.ref) && createResourceRef(media.ref.id).status === "accepted"
      && text(media.fileName) && identifier(media.mediaType) && record(media.integrity)
      && Number.isSafeInteger(media.integrity.byteLength) && media.integrity.byteLength > 0
      && HASH.test(media.integrity.sha256), `${role} 媒体`);
  }
  requireValue(text(value.audioFileName) && finite(value.audioDurationSec) && value.audioDurationSec >= 0, "音频描述");
  canonicalJson(value);
}
export async function readChartProject(json: string): Promise<ChartProject> {
  const project: unknown = JSON.parse(json);
  validateProject(project);
  requireValue(await projectHash(projectContent(project)) === project.contentHash, "内容摘要不匹配");
  return project;
}
export function projectDraft(project: ChartProject): ChartProjectDraft {
  return { projectId: project.projectId, metadata: project.metadata, chart: project.chart,
    mediaRefs: Object.fromEntries(PROJECT_MEDIA_ROLES.map(role => [role, project.media[role]?.ref ?? null])) as unknown as ChartMediaResources,
    audioFileName: project.audioFileName, audioDurationSec: project.audioDurationSec };
}
