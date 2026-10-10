import cn from "../data/originalOfficialMusicWording.json";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useUiViewport } from "./useUiViewport";
import { musicSelectionLayout, musicSelectionScale } from "./musicSelectionLayout";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { officialCategories } from "./officialMusicSelection";
import { getOfficialMusicLibrary } from "../services/officialMusicLibrary";
import { useOriginalUiSound } from "./OriginalUiSound";
import profile from "../data/originalMusicSelectionProfile.json";
import folder from "../data/originalMusicFolderProfile.json";

const parentPrefab = profile.prefabs.folderCell as unknown as OriginalPrefab;
const childPrefab = folder.accordionCell as unknown as OriginalPrefab;
const animation = folder.animation;
const gridAnimation = animation.GridCellAnimationSettings;
const childModel = new OriginalPrefabModel(childPrefab);
const childController = childModel.components.get(22)!.data;
const white = { r: 1, g: 1, b: 1, a: 1 }, dark = { r: 80 / 255, g: 80 / 255, b: 80 / 255, a: 1 };
function color(hex: string | undefined) {
  if (!hex) return profile.defaultCategoryColor;
  const rgb = Number.parseInt(hex.replace("#", ""), 16);
  return { r: (rgb >> 16 & 255) / 255, g: (rgb >> 8 & 255) / 255, b: (rgb & 255) / 255, a: 1 };
}
function ease(t: number, kind: number) {
  const x = Math.min(1, Math.max(0, t));
  return kind === 21 ? Math.sqrt(1 - (x - 1) ** 2) : kind === 5 ? x * x : x;
}
export function OfficialMusicFolders({ selected, onChange, busy }: { selected: number; onChange(id: number): void; busy: boolean }) {
  const viewport = useUiViewport(), sound = useOriginalUiSound();
  const scale = musicSelectionScale(viewport.width, viewport.height, viewport.scale);
  const width = viewport.logicalWidth / scale, height = viewport.logicalHeight / scale;
  const layout = musicSelectionLayout(width, height, scale);
  const categories = useMemo(() => officialCategories(getOfficialMusicLibrary().metadata?.official.master), []);
  const groups = [{ id: 0, seq: 0, category: "all", categoryName: profile.wording.word_musicLargeCategoryAll,
    children: [{ id: 0, label: profile.wording.word_musicLargeCategoryAll, all: true }] }, ...categories];
  const remembered = useRef(new Map<number, number>());
  const [open, setOpen] = useState<number | null>(null), openRef = useRef<number | null>(null);
  const [heightProgress, setHeightProgress] = useState(0), [offsets, setOffsets] = useState<number[]>([]);
  const [animating, setAnimating] = useState(false);
  const lock = useRef(false), alive = useRef(true), raf = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; start: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelAnimationFrame(raf.current); }; }, []);
  const animate = (duration: number, update: (seconds: number) => void) => new Promise<void>(resolve => {
    let start: number | undefined;
    const tick = (time: number) => {
      if (!alive.current) return resolve();
      start ??= time; const seconds = Math.min(duration, (time - start) / 1000); update(seconds);
      if (seconds >= duration) resolve(); else raf.current = requestAnimationFrame(tick);
    }; raf.current = requestAnimationFrame(tick);
  });
  const grid = async (count: number, entry: boolean) => {
    const settings = entry ? gridAnimation.EntryAnimationSettings : gridAnimation.ExitAnimationSettings;
    const delay = entry ? gridAnimation.EntryAnimationDelay : gridAnimation.ExitAnimationDelay;
    const from = entry ? childController.exitPositionX : childController.entryPositionX;
    const to = entry ? childController.entryPositionX : childController.exitPositionX;
    await animate(settings.AnimationDuration + Math.max(0, count - 1) * delay, time => setOffsets(Array.from({ length: count }, (_, i) =>
      from + (to - from) * ease((time - i * delay) / settings.AnimationDuration, settings.Easing))));
  };
  const choose = async (id: number) => {
    if (busy || lock.current || suppressClick.current) return;
    lock.current = true; setAnimating(true);
    try {
      const previous = openRef.current;
      if (previous !== null) {
        const count = groups.find(group => group.id === previous)!.children.length;
        await grid(count, false);
        const settings = animation.CloseAnimationSettings;
        await animate(settings.AnimationDuration, t => setHeightProgress(1 - ease(t / settings.AnimationDuration, settings.Easing)));
        if (!alive.current) return;
        setOpen(null); openRef.current = null;
      }
      const group = groups.find(item => item.id === id)!;
      if (group.children.length > 1 && previous !== id) {
        sound?.play(gridAnimation.SoundEffectType);
        setOpen(id); openRef.current = id; setHeightProgress(0);
        setOffsets(group.children.map(() => childController.exitPositionX));
        const settings = animation.OpenAnimationSettings;
        await animate(settings.AnimationDuration, t => setHeightProgress(ease(t / settings.AnimationDuration, settings.Easing)));
        await grid(group.children.length, true);
        if (alive.current) onChange(remembered.current.get(id) ?? group.children[0]!.id);
      } else if (group.children.length === 1) onChange(group.children[0]!.id);
    } finally { lock.current = false; if (alive.current) setAnimating(false); }
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    suppressClick.current = drag.current.moved; drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const top = height / 2 + layout.folder.y;
  return <div className="music-selection-selector" style={{ width, height, transform: `scale(${scale})`, pointerEvents: "none", zIndex: layout.folder.depth }}>
    <div ref={scroll} role="tablist" aria-label="乐曲分类" style={{ position: "absolute", left: width / 2 + layout.folder.x, top,
      width: 196, height: Math.max(0, height - top), overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none", touchAction: "none", pointerEvents: busy ? "none" : "auto" }}
      onPointerDown={event => { if (event.button !== 0 || animating) return; suppressClick.current = false;
        drag.current = { id: event.pointerId, start: event.clientY, top: event.currentTarget.scrollTop, moved: false }; }}
      onPointerMove={event => { const value = drag.current; if (!value || value.id !== event.pointerId) return;
        if (Math.abs(event.clientY - value.start) > 4 * viewport.scale * scale) {
          value.moved = true; suppressClick.current = true; event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.scrollTop = value.top - (event.clientY - value.start) / (viewport.scale * scale);
        } }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onClickCapture={event => { if (suppressClick.current || animating) { event.preventDefault(); event.stopPropagation(); } }}>
      {groups.map(group => {
        const active = group.children.some(child => child.id === selected);
        const selectedColor = color("categoryColor" in group ? group.categoryColor : undefined);
        const model = new OriginalPrefabModel(parentPrefab, { nodes: {
          2: { active }, 5: { active: group.category === "three_dimensions_live" }, 4: { active: group.category === "extra" },
          14: { active: !["three_dimensions_live", "extra"].includes(group.category) },
        }, components: { 45: { mText: cn.wording.musicSelect_musicFolder_3dDescription }, 48: { mText: cn.wording.musicSelect_musicFolder_extraDescription }, 44: { mText: group.categoryName.split("\\n").join("\n"), mColor: active ? white : dark },
          40: { mText: group.categoryName, mColor: active ? white : dark }, 46: { mText: group.categoryName, mColor: active ? white : dark },
          47: { mColor: selectedColor }, 52: { mColor: selectedColor } } });
        return <div key={group.id} style={{ position: "relative", height: 72 + (open === group.id ? group.children.length * 68 * heightProgress : 0), overflow: "hidden" }}>
          <OriginalPrefabView model={model} bindings={{ buttons: { 42: { label: group.categoryName, role: "tab", selected: active, disabled: animating, action: () => void choose(group.id) } } }} />
          {open === group.id && group.children.map((child, index) => {
            const lines = child.label.split("\\n").join("\n").split("\n");
            const childSelected = child.id === selected;
            const one = childModel.components.get(childController.oneLineCategoryRoot.m_PathID)?.node
              ?? childModel.prefab.nodes.find(node => node.transformId === childController.oneLineCategoryRoot.m_PathID)!.id;
            const two = childModel.prefab.nodes.find(node => node.transformId === childController.twoLineCategoryRoot.m_PathID)!.id;
            const sub = new OriginalPrefabModel(childPrefab, { nodes: { [one]: { active: lines.length === 1 }, [two]: { active: lines.length > 1 },
              [childModel.components.get(26)!.node]: { active: childSelected } }, components: {
              28: { mText: lines[0], mColor: childSelected ? selectedColor : dark }, 29: { mText: lines[0], mColor: childSelected ? selectedColor : dark },
              27: { mText: lines[1] ?? "", mColor: childSelected ? selectedColor : dark }, 26: { mColor: selectedColor },
              23: { mColor: color("mediumCategoryColor" in group ? group.mediumCategoryColor : undefined) },
            } });
            return <div key={child.id} style={{ position: "absolute", top: 72 + index * 68, left: offsets[index] ?? childController.exitPositionX }}>
              <OriginalPrefabView model={sub} bindings={{ buttons: { 30: { label: child.label, role: "tab", selected: childSelected, disabled: animating,
                action: () => { if (!suppressClick.current) { remembered.current.set(group.id, child.id); onChange(child.id); } } } } }} />
            </div>;
          })}
        </div>;
      })}
    </div>
  </div>;
}
