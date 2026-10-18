import { GLOBAL_TIMING_GROUP_ID, sortNotes, sortBpmEvents, sortSvEvents, type ChartNote } from "../chartCore";
import { GARUPA_HEADER_HABAHIRO, GARUPA_SYSTEM_LANE_CHANGE, isGarupaLongSlideShape } from "../chart";
import type { GarupaChartJson, GarupaChartJsonSlideConnection, GarupaChartJsonTopLevelNote } from "../chart";
import type { ChartProjectDraft } from "./chartProject";

/** One projection for export and play. Persisted project data never round-trips through this view. */
export function projectGarupaChart(project: Pick<ChartProjectDraft, "metadata" | "chart">): GarupaChartJson {
  const { chart, metadata } = project;
  const group = (id?: string) => id && id !== GLOBAL_TIMING_GROUP_ID ? id : undefined;
  const node = (n: ChartNote, hidden: boolean): GarupaChartJsonSlideConnection | null => {
    const common = { beat: n.beat, lane: n.lane, width: n.width ?? 1, timingGroup: group(n.timingGroup) };
    switch (n.type) {
      case "single": return { ...common, type: "Single" };
      case "flick": return { ...common, type: "Flick" };
      case "skill": return { ...common, type: "Skill" };
      case "hidden": return hidden ? { ...common, type: "Hidden" } : null;
      case "directional_flick_left": return { ...common, type: "Directional", direction: "Left" };
      case "directional_flick_right": return { ...common, type: "Directional", direction: "Right" };
      default: return null;
    }
  };
  const notes = sortNotes(chart.notes);
  const byId = new Map(notes.map(n => [n.id, n]));
  const connected = new Set<string>();
  const slides = chart.slideChains.map(chain => {
    const connections = chain.noteIds.flatMap(id => {
      const n = byId.get(id);
      if (!n) throw new Error(`Slide 引用不存在的节点：${id}`);
      const value = node({ ...n, timingGroup: chain.timingGroup ?? GLOBAL_TIMING_GROUP_ID }, true);
      if (!value) throw new Error(`Slide 节点类型不可播放：${n.type}`);
      connected.add(id); return [value];
    });
    // An edit that leaves the Long shape (another node, a lane move) makes the chain a Slide again.
    const long = chain.long === true && isGarupaLongSlideShape({ connections });
    return { type: "Slide" as const, timingGroup: group(chain.timingGroup), connections, ...(long ? { long: true as const } : {}) };
  });
  const settings = chart.settings;
  return [
    { type: "BPM", beat: 0, value: metadata.bpm },
    ...(settings.habahiro === true ? [{ type: "Header" as const, data: GARUPA_HEADER_HABAHIRO }] : []),
    ...(settings.habahiro === true
      ? (settings.laneChangeBeats ?? []).map((beat) => ({ type: "System" as const, beat, data: GARUPA_SYSTEM_LANE_CHANGE }))
      : []),
    ...sortBpmEvents(chart.bpmEvents).filter(b => b.beat !== 0).map(b => ({ type: "BPM" as const, beat: b.beat, value: b.bpm })),
    ...sortSvEvents(Object.values(chart.timingGroups).flatMap(g => g.sv)).map(e => ({ type: "SV" as const,
      beat: e.beat, value: e.value, timingGroup: e.timingGroup })),
    ...notes.filter(n => !connected.has(n.id)).flatMap(n => {
      const value = node(n, false); return value ? [value as GarupaChartJsonTopLevelNote] : [];
    }),
    ...slides,
  ];
}
