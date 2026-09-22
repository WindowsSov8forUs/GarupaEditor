import { useEffect, useMemo, useRef, useState } from "react";
import profile from "../data/originalSpecialSkinProfile.json";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalSprite } from "./OriginalUi";
import { OriginalPageViewport } from "./OriginalPageViewport";
import { OriginalPrefabView, type OriginalRadioBinding } from "./OriginalPrefabView";
import { OriginalPrefabModel, originalAtlasFor, originalRef, type OriginalPrefab, type OriginalOverrides } from "./originalPrefabModel";
import { specialComponentFields, specialSkinKey, specialSkinMaster, specialSkinName, selectSpecialSkin,
  selectableSpecialSkins, specialSkinWording, type SelectedSpecialSkin } from "./originalSpecialSkinSelection";
import type { CurrentSpecialSkinMaster, OriginalSkinSpecialSelection } from "../simulator/public/settings";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { createResourceRef, type ResourceRef, type ResourceConsumerLease } from "../resources/contracts";
import { limitedSkinThumbnailDescriptor } from "../resources/providers/bestdoriCatalogProvider";
import { useCollaborationSkinThumbnails } from "./useCollaborationSkinThumbnails";

const prefabs = profile.prefabs as unknown as Record<string, OriginalPrefab>;
const list = new OriginalPrefabModel(prefabs.limitedskinselectdialog!);
const cell = new OriginalPrefabModel(prefabs.limitedskinselectitemcell!);
const details = new OriginalPrefabModel(prefabs.specialskindetailsettingdialog!);
const loadingAtlas = originalAtlasFor({ id: 11, node: 2, kind: "UISprite", data: profile.thumbnail.loadingSprite });
const listLayout = { scroll: "ScrollViewAnchor/ScrollView", content: "ScrollView/ScrollContent", bar: "ScrollViewAnchor/ScrollBar" };
const detailLayout = { scroll: "Settings/ScrollView", content: "Settings/ScrollView", bar: "Body/ScrollBar" };
const omitScrolled = (model: OriginalPrefabModel, layout: { scroll: string; bar: string }) => new Set(
  [...model.components.values()].filter(component => model.isWithin(component.node, model.nodeAt(layout.scroll).id) ||
    model.isWithin(component.node, model.nodeAt(layout.bar).id)).map(component => component.id));

function useThumbnails(enabled: boolean, onError?: (message: string) => void) {
  const manager = useApplicationResourceManager(), report = useRef(onError); report.current = onError;
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true, finished = false, lease: ResourceConsumerLease | undefined;
    const release = () => { const owner = lease; lease = undefined; if (owner) void owner.release().catch(console.error); };
    void (async () => {
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
      if (!active) return;
      const refs: Record<string, ResourceRef> = {};
      for (const server of ["jp", "cn"] as const) {
        const registered = manager.registerNetworkResource(limitedSkinThumbnailDescriptor(server, catalog.value.observedAt));
        if (registered.status === "rejected") throw new Error(registered.failure.boundary);
        const ref = createResourceRef(`bestdori/${server}/${profile.consumers.limitedThumbnail.bundle}`);
        if (ref.status === "rejected") throw new Error(ref.failure.boundary);
        refs[server] = ref.value;
      }
      const snapshot = await manager.createSnapshotFromRefs(refs);
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      const next: Record<string, string> = {};
      for (const row of profile.limited) {
        if (!active) return;
        const files = lease.listFiles(row.server).filter(file => file.logicalPath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() === `${row.thumbnailFileName}.png`);
        if (files.length !== 1) throw new Error(`Missing original skin thumbnail: ${row.thumbnailFileName}`);
        next[`${row.server}/${row.thumbnailFileName}`] = await lease.openObjectUrl(row.server, files[0]!.logicalPath);
      }
      if (active) setUrls(next);
    })().catch(cause => { if (active) report.current?.(String(cause)); release(); })
      .finally(() => { finished = true; if (!active) release(); });
    return () => { active = false; if (finished) release(); };
  }, [manager, enabled]);
  return urls;
}

function LimitedThumbnail({ url, x, y }: { url?: string | null; x: number; y: number }) {
  const loading = useRef<HTMLDivElement>(null);
  const source = profile.thumbnail, size = source.sourceWidgetSize * source.scale;
  useEffect(() => {
    if (url !== undefined || !loading.current) return;
    const tween = source.loadingTween;
    const animation = loading.current.animate([{ transform: `rotate(${-tween.from.z}deg)` },
      { transform: `rotate(${-tween.to.z}deg)` }], { duration: tween.duration * 1000, iterations: Infinity });
    return () => animation.cancel();
  }, [url, source]);
  if (url === null) return null;
  if (url) return <img src={url} alt="" style={{ position: "absolute", left: x - size / 2,
    top: -y - size / 2, width: size, height: size, pointerEvents: "none", zIndex: source.textureDepth }} />;
  const loadingSize = source.loadingSprite.mWidth * source.scale;
  return <div ref={loading} style={{ position: "absolute", left: x - loadingSize / 2, top: -y - loadingSize / 2,
    width: loadingSize, height: loadingSize, pointerEvents: "none", zIndex: source.loadingDepth }}>
    <OriginalSprite sprite={source.loadingSprite.mSpriteName} atlas={loadingAtlas} spriteType={0}
      style={{ width: loadingSize, height: loadingSize }} />
  </div>;
}

function SkinCell({ master, selected, equipped, thumbnail, index, onSelect }: {
  master: CurrentSpecialSkinMaster; selected: boolean; equipped: boolean; thumbnail?: string | null; index: number; onSelect: () => void;
}) {
  const model = useMemo(() => new OriginalPrefabModel(cell.prefab, {
    components: { 38: { mText: specialSkinName(master), ...(master.kind === "collabo" ? { mMaxLineCount: 2, mHeight: 48 } : {}) } },
    nodes: Object.fromEntries(([["DisableCover", false], ["SelectEquipView/lock", false],
      ["SelectEquipView/UnselectableCover", false], ["SelectEquipView/SelectFrame", selected],
      ["SelectEquipView/EquippedIcon", equipped]] as const).map(([path, active]) => [cell.nodeAt(path).id, { active }])),
  }), [master, selected, equipped]);
  const origin = cell.transform(cell.nodeAt("ItemInfo/Body/ThumbPos").id);
  return <>
    <OriginalPrefabView model={model} bindings={{ buttons: { 32: { action: onSelect, selected, role: "radio", navigationIndex: index, label: specialSkinName(master) } } }} />
    <LimitedThumbnail url={thumbnail} x={origin.x} y={origin.y} />
  </>;
}

export function OriginalSpecialSkinSelectDialog({ kind, initial, equipped, open, busy, onApply, onClose, onClosed, onError }: {
  kind: "limited" | "collabo";
  open: boolean; onClosed: () => void;
  initial: OriginalSkinSpecialSelection; equipped: OriginalSkinSpecialSelection; busy: boolean;
  onApply: (value: SelectedSpecialSkin) => void; onClose: () => void; onError?: (message: string) => void;
}) {
  const choices = useMemo(() => selectableSpecialSkins.filter(row => row.kind === kind), [kind]);
  const [choice, setChoice] = useState(() => initial.kind === "none"
    ? `${choices[0]!.kind}:${choices[0]!.selectionId}` : specialSkinKey(initial));
  const thumbnails = useThumbnails(kind === "limited", onError);
  const collaborations = useCollaborationSkinThumbnails(kind === "collabo", onError);
  const model = useMemo(() => new OriginalPrefabModel(list.prefab, {
    nodes: { [list.nodeAt("List/EmptyMessage").id]: { active: false } },
    components: { 53: { mText: "设置期间限定演出皮肤" },
      52: { mText: specialSkinWording("dialog_button_ok") } },
  }), [kind]);
  const selected = choices.find(row => `${row.kind}:${row.selectionId}` === choice);
  const confirm = () => {
    if (!selected || busy) return;
    onApply(selectSpecialSkin(selected));
  };
  const panel = model.components.get(46)!.data.mClipRange;
  const origin = model.transform(model.nodeAt(listLayout.scroll).id);
  const { width, height } = profile.consumers.listCell;
  const columns = Math.max(1, Math.floor(panel.z / width));
  const scrollState = useRef({ value: profile.listLayout.initialScrollPosition });
  return <OriginalAuthoredDialog open={open} model={model} busy={busy} onClose={onClose} onClosed={onClosed}
    bindings={{ omit: omitScrolled(model, listLayout), buttons: { 60: { action: confirm, disabled: !selected || busy } } }}>
    <OriginalPageViewport model={model} bindings={{}} scrollState={scrollState.current} layout={{ ...listLayout,
      contentHeight: Math.ceil(choices.length / columns) * height }}>
      <div role="radiogroup">{choices.map((master, index) => {
        const key = `${master.kind}:${master.selectionId}`;
        const thumb = master.kind === "limited" ? profile.limited.find(row => row.limitedSkinId === master.selectionId)! : null;
        return <div key={key} className="original-prefab-origin" style={{ left: origin.x - panel.z / 2 + (index % columns) * width,
          top: -origin.y - panel.w / 2 + Math.floor(index / columns) * height }}>
          <SkinCell master={master} index={index} selected={choice === key} equipped={specialSkinKey(equipped) === key}
            thumbnail={thumb ? thumbnails[`${thumb.server}/${thumb.thumbnailFileName}`] : collaborations[master.selectionId]} onSelect={() => setChoice(key)} />
        </div>;
      })}</div>
    </OriginalPageViewport>
  </OriginalAuthoredDialog>;
}

export function OriginalSpecialSkinDetailDialog({ initial, open, busy, onApply, onClose, onClosed }: {
  open: boolean; onClosed: () => void;
  initial: SelectedSpecialSkin; busy: boolean; onApply: (value: SelectedSpecialSkin) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const master = specialSkinMaster(initial);
  const nodes: NonNullable<OriginalOverrides["nodes"]> extends Readonly<infer T> ? T : never = {};
  const radios: Record<number, OriginalRadioBinding> = {};
  const components: Record<number, Record<string, unknown>> = {
    137: { mText: specialSkinWording(initial.kind === "limited" ? "dialog_limitedSkinDetailSetting_title" : "dialog_specialSkinDetailSetting_title") },
    131: { mText: specialSkinWording("dialog_specialSkinDetailSetting_description") },
    133: { mText: specialSkinWording("dialog_button_ok") },
  };
  const wordingFields = { laneAndLine: "laneAndJudgeLine", directionalFlickIcon: "leftRightFlickIcon" };

  const grid = details.components.get(168)!;
  let index = 0;
  for (const [field, ref] of Object.entries(grid.data)) {
    if (!field.startsWith("settings")) continue;
    const controller = details.components.get(originalRef(ref))!;
    const key = (field.charAt(8).toLowerCase() + field.slice(9)) as keyof typeof specialComponentFields;
    const supported = key in specialComponentFields && master[specialComponentFields[key]] !== null;
    nodes[controller.node] = supported ? { active: true, y: -index++ * details.components.get(178)!.data.cellHeight } : { active: false };
    if (!supported) continue;
    const suffix = wordingFields[key as keyof typeof wordingFields] ?? key;
    components[originalRef(controller.data.labelText)] = { mText: specialSkinWording(
      `dialog_${initial.kind === "limited" ? "limited_" : ""}specialSkinDetailSetting_${suffix}`) };
    const toggle = details.components.get(originalRef(controller.data.specialSkinToggleButton))!;
    radios[originalRef(toggle.data.radioButtonManager)] = { index: value.components[key] === "on" ? 0 : 1,
      ...profile.consumers.detailRadio,
      onChange: next => setValue(old => ({ ...old, components: { ...old.components, [key]: next === 0 ? "on" : "off" } })) };
  }
  const model = new OriginalPrefabModel(details.prefab, { nodes, components });
  return <OriginalAuthoredDialog open={open} model={model} busy={busy} onClose={onClose} onClosed={onClosed}
    bindings={{ omit: omitScrolled(model, detailLayout), buttons: { 167: { action: () => onApply(value), disabled: busy } } }}>
    <OriginalPageViewport model={model} layout={detailLayout} bindings={{ radios }} />
  </OriginalAuthoredDialog>;
}
