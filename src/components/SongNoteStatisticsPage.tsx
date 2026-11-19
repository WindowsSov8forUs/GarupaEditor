import { usePreparationPending } from "./PagePreparation";
import { useState } from "react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { EditorOptionSettings } from "../chartCore";
import source from "../data/originalSongDetailProfile.json";
import { resolveOriginalPreviewSkin } from "../simulator/public/settings";
import { sampleOriginalPreviewFlickAnimation } from "../simulator/public/preview";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalPageViewport } from "./OriginalPageViewport";
import { useOriginalAnimatedSkinResources, type OriginalAnimatedSkinResources } from "./useOriginalAnimatedSkinResources";
import type { OriginalPreviewSprite } from "./originalPreviewSprites";
import { SONG_NOTE_KINDS, SONG_NOTE_ROLES } from "./songNoteStatistics";

const pageSource = new OriginalPrefabModel(source.prefabs.profileNoteStatistics as OriginalPrefab, {
  nodes: { 309: { x: 0 } }, components: { 768: { mText: "音符统计" } },
});
const cellPrefab = source.prefabs.profileNoteCountIcon as OriginalPrefab;
const cell = new OriginalPrefabModel(cellPrefab);
const icon = cell.rect(cell.components.get(11)!);
const bandIconModel = new OriginalPrefabModel(source.prefabs.profileStageChallengeIcon as OriginalPrefab);
const bandIcon = bandIconModel.rect(bandIconModel.components.get(770)!);
const thumbnail = { x: icon.x + (icon.width - bandIcon.width) / 2,
  y: icon.y + (icon.height - bandIcon.height) / 2, width: bandIcon.width, height: bandIcon.height };
const countBox = cell.rect(cell.components.get(12)!);

type Layer = { sprite: OriginalPreviewSprite; x: number; y: number; angle: number };
export function songNoteThumbnailLayers(resources: OriginalAnimatedSkinResources, index: number): Layer[] {
  const role = Math.floor(index / 4), kind = index % 4;
  const body = role === 2 ? resources.slideAmong! : resources.bodies[
    kind === 1 ? 2 : kind === 2 ? 7 : kind === 3 ? 6 : role === 0 ? 0 : 3];
  const layers: Layer[] = [{ sprite: body, x: 0, y: 0, angle: 0 }];
  if (kind !== 0) {
    const direction = kind === 1 ? "up" : kind === 2 ? "left" : "right";
    const pose = sampleOriginalPreviewFlickAnimation(resources.flickAnimations, direction, 0);
    layers.push({ sprite: resources.flickTops[direction], x: pose.x, y: -pose.y,
      angle: -pose.rotationDegrees * Math.PI / 180 });
  }
  return layers;
}

function NoteThumbnail({ resources, index, label, onError }: {
  resources: OriginalAnimatedSkinResources | null; index: number; label: string;
  onError(message: string): void;
}) {
  const [painted, setPainted] = useState<OriginalAnimatedSkinResources | null>(null);
  const [failure, setFailure] = useState<unknown>();
  usePreparationPending(!resources || painted !== resources, failure);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current!, context = target.getContext("2d")!;
    context.clearRect(0, 0, target.width, target.height);
    if (!resources) return;
    let active = true;
    const layers = songNoteThumbnailLayers(resources, index);
    const role = Math.floor(index / 4);
    const hasConnection = role === 1 || role === 3;
    const urls = layers.map(layer => layer.sprite.url);
    if (hasConnection) urls.push(resources.longNoteLine);
    void Promise.all(urls.map(async url => {
      const image = new Image(); image.src = url; await image.decode(); return image;
    })).then(images => {
      if (!active) return;
      // Use one body-centred coordinate system for every category. Normalize the
      // representative width-1 body, then apply the same fit to all 16 icons;
      // an attached arrow can reduce the common scale, never move its own body.
      const geometry = (items: Layer[]) => {
        const body = items[0].sprite;
        const width = body.width / body.pixelsPerUnit;
        return { width, centerX: (0.5 - body.pivotX) * width,
          centerY: (body.pivotY - 0.5) * body.height / body.pixelsPerUnit };
      };
      const corners = Array.from({ length: 16 }, (_, i) => {
        const items = songNoteThumbnailLayers(resources, i), body = geometry(items);
        return items.flatMap(({ sprite: s, x, y, angle }) => [0, 1].flatMap(px => [0, 1].map(py => {
          const dx = (px - s.pivotX) * s.width / s.pixelsPerUnit;
          const dy = (py - (1 - s.pivotY)) * s.height / s.pixelsPerUnit;
          return { x: (x + dx * Math.cos(angle) - dy * Math.sin(angle) - body.centerX) / body.width,
            y: (y + dx * Math.sin(angle) + dy * Math.cos(angle) - body.centerY) / body.width };
        })));
      }).flat();
      // Symmetric bounds keep the body exactly at the slot centre in both axes.
      const halfWidth = Math.max(...corners.map(p => Math.abs(p.x)));
      const halfHeight = Math.max(...corners.map(p => Math.abs(p.y)));
      const scale = Math.min((target.width - 2) / (2 * halfWidth), (target.height - 2) / (2 * halfHeight));
      const body = geometry(layers);
      context.save(); context.translate(target.width / 2, target.height / 2);
      if (hasConnection) {
        // A schematic continuation behind the note: the head connects upward
        // to later nodes, the tail downward to earlier nodes. It is deliberately
        // excluded from fitting, so adding it cannot move or shrink any sprite.
        // SkinPreview's connection mesh has halfWidth = note.scale.
        const lineWidth = 2 * scale / body.width;
        const lineLength = target.height / 2 - 1;
        context.drawImage(images[layers.length], -lineWidth / 2, role === 1 ? -lineLength : 0,
          lineWidth, lineLength);
      }
      context.scale(scale / body.width, scale / body.width);
      context.translate(-body.centerX, -body.centerY);
      layers.forEach(({ sprite: s, x, y, angle }, i) => {
        context.save(); context.translate(x, y); context.rotate(angle);
        context.drawImage(images[i], -s.pivotX * s.width / s.pixelsPerUnit,
          -(1 - s.pivotY) * s.height / s.pixelsPerUnit, s.width / s.pixelsPerUnit, s.height / s.pixelsPerUnit);
        context.restore();
      });
      context.restore();
      if (active) setPainted(resources);
    }).catch(error => { if (active) setFailure(error); if (active) onError(`音符缩略图加载失败：${String(error)}`); });
    return () => { active = false; };
  }, [resources, index, onError]);
  return <canvas ref={canvas} width={Math.round(thumbnail.width * 5)} height={Math.round(thumbnail.height * 5)} role="img" aria-label={label}
    style={{ position: "absolute", left: thumbnail.x, top: thumbnail.y, width: thumbnail.width, height: thumbnail.height,
      zIndex: cell.components.get(11)!.data.mDepth }} />;
}

/** A narrower and shorter page (profile px), as 编辑信息's lower panel gives it. */
export type SongNoteStatisticsFit = { shrink: number; bottomShift: number };
const expandButtonNode = pageSource.nodeAt("UserCharacterRankPage/ExpandButton");
const scrollBarNode = pageSource.nodeAt("UserCharacterRankPage/Main/ScrollWindow/ScrollBar");

/** The scroll page's view in its page's coordinates: the clip's left and right edges and its top. */
export type SongScrollPageView = { left: number; right: number; top: number };

/**
 * A lower page laid out as the original's scrolling page (UserCharacterRankPage, the note statistics): its caption
 * bar with the expand button (expanded, the panel takes the column), and a clipped scroll view with its scroll bar.
 * `children` places the content in the page's coordinates from the view; `contentHeight` is its extent from the
 * view's top.
 */
export function SongProfileScrollPage({ title, expanded, onExpandedChange, fit, contentHeight, children }: {
  title: string; expanded: boolean; onExpandedChange(value: boolean): void; fit?: SongNoteStatisticsFit;
  contentHeight: number | ((view: SongScrollPageView) => number);
  children(view: SongScrollPageView): ReactNode;
}) {
  const shrink = fit?.shrink ?? 0, bottomShift = fit?.bottomShift ?? 0;
  const page = useMemo(() => {
    const panel = pageSource.components.get(947)!.data;
    const sizes = pageSource.components.get(943)!.data;
    const bar = pageSource.components.get(919)!.data;
    const header = pageSource.components.get(948)!;
    const height = (expanded ? sizes.expandedSize.y : sizes.shrinkedSize.y) + bottomShift;
    const scrollbarHeight = (expanded ? bar.expandedScrollbarHeight : bar.shrinkedScrollbarHeight) + bottomShift;
    return new OriginalPrefabModel(pageSource.prefab, {
      nodes: { 309: { x: 0 }, 263: { y: pageSource.nodes.get(expanded ? 105 : 181)!.position.y },
        ...(shrink ? {
          [expandButtonNode.id]: { x: expandButtonNode.position.x - shrink },
          [scrollBarNode.id]: { x: scrollBarNode.position.x - shrink },
        } : {}) },
      components: { 768: { mText: title, mWidth: pageSource.components.get(768)!.data.mWidth - shrink },
        875: { mFlip: expanded ? 1 : 2 },
        948: { mWidth: header.data.mWidth - shrink / Math.abs(pageSource.transform(header.node).scaleX) },
        947: { mClipRange: { ...panel.mClipRange, z: panel.mClipRange.z - shrink, w: height },
          mClipOffset: { ...panel.mClipOffset, x: panel.mClipOffset.x - shrink / 2,
            y: -(height - sizes.shrinkedSize.y) / 2 } },
        758: { mHeight: scrollbarHeight } },
    });
  }, [title, expanded, shrink, bottomShift]);
  const scroll = page.nodeAt("UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView");
  const scrollTransform = page.transform(scroll.id), panel = page.components.get(947)!.data;
  const centerX = scrollTransform.x + panel.mClipRange.x + panel.mClipOffset.x;
  const view: SongScrollPageView = {
    left: centerX - panel.mClipRange.z / 2, right: centerX + panel.mClipRange.z / 2,
    top: -(scrollTransform.y + panel.mClipRange.y + panel.mClipOffset.y + panel.mClipRange.w / 2),
  };
  const scrollState = useRef({ value: 0 });
  return <>
    <OriginalPrefabView model={page} bindings={{ omit: new Set([758, 960]), buttons: {
      967: { label: expanded ? `收起${title}` : `展开${title}`, action: () => onExpandedChange(!expanded) },
    } }} />
    <OriginalPageViewport model={page} bindings={{}} scrollState={scrollState.current} layout={{
      scroll: "UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView",
      content: "UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView/Grid",
      bar: "UserCharacterRankPage/Main/ScrollWindow/ScrollBar",
      contentHeight: typeof contentHeight === "function" ? contentHeight(view) : contentHeight,
    }}>
      {children(view)}
    </OriginalPageViewport>
  </>;
}

export function SongNoteStatisticsPage({ counts, settings, habahiro, onError, expanded, onExpandedChange, fit }: {
  counts: readonly number[]; settings: EditorOptionSettings; habahiro: boolean; onError(message: string): void;
  expanded: boolean; onExpandedChange(value: boolean): void;
  /** Narrower by `shrink` (its header bar shortened, its button, scroll bar and clip moved in, its cells closer) and
   * its view taller by `bottomShift`. */
  fit?: SongNoteStatisticsFit;
}) {
  const shrink = fit?.shrink ?? 0;
  const grid = pageSource.components.get(765)!;
  const sourceGridPosition = pageSource.transform(grid.node);
  // The cells keep their spacing's share of the narrower view, centred in it.
  const cellWidth = grid.data.cellWidth * (pageSource.components.get(947)!.data.mClipRange.z - shrink)
    / pageSource.components.get(947)!.data.mClipRange.z;
  const gridPosition = { ...sourceGridPosition, x: sourceGridPosition.x - shrink / 2 };
  const rows = Math.ceil(counts.length / grid.data.maxPerLine);
  const recipe = useMemo(() => resolveOriginalPreviewSkin(settings.simulatorSettings.skin, habahiro ? "habahiro" : "ordinary"),
    [settings.simulatorSettings.skin, habahiro]);
  const resources = useOriginalAnimatedSkinResources(recipe, onError, true);
  return <SongProfileScrollPage title="音符统计" expanded={expanded} onExpandedChange={onExpandedChange} fit={fit}
    contentHeight={view => -gridPosition.y + (rows - 1) * grid.data.cellHeight + countBox.y + countBox.height - view.top}>
    {() => counts.map((count, index) => {
      const label = `${SONG_NOTE_ROLES[Math.floor(index / 4)]}${SONG_NOTE_KINDS[index % 4]}音符`;
      const model = new OriginalPrefabModel(cellPrefab, { components: { 12: { mText: String(count), mEncoding: false } } });
      return <div key={index} className="original-prefab-origin" data-note-statistic={index} aria-label={`${label}：${count}`}
        style={{ left: gridPosition.x + (index % grid.data.maxPerLine - (grid.data.maxPerLine - 1) / 2) * cellWidth,
          top: -gridPosition.y + Math.floor(index / grid.data.maxPerLine) * grid.data.cellHeight }}>
        {/* The source circle is tinted by CharacterModel, not a generic icon frame.
            Notes have no character identity; retain the icon slot and rank label. */}
        <OriginalPrefabView model={model} bindings={{ omit: new Set([10, 11]) }} />
        <NoteThumbnail resources={resources} index={settings.mirrorEnabled && index % 4 >= 2 ? index ^ 1 : index}
          label={label} onError={onError} />
      </div>;
    })}
  </SongProfileScrollPage>;
}
