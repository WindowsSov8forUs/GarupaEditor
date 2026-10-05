import { useEffect, useMemo, useRef } from "react";
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
    }).catch(error => { if (active) onError(`音符缩略图加载失败：${String(error)}`); });
    return () => { active = false; };
  }, [resources, index, onError]);
  return <canvas ref={canvas} width={Math.round(thumbnail.width * 5)} height={Math.round(thumbnail.height * 5)} role="img" aria-label={label}
    style={{ position: "absolute", left: thumbnail.x, top: thumbnail.y, width: thumbnail.width, height: thumbnail.height,
      zIndex: cell.components.get(11)!.data.mDepth }} />;
}

export function SongNoteStatisticsPage({ counts, settings, onError, expanded, onExpandedChange }: {
  counts: readonly number[]; settings: EditorOptionSettings; onError(message: string): void;
  expanded: boolean; onExpandedChange(value: boolean): void;
}) {
  const page = useMemo(() => {
    const panel = pageSource.components.get(947)!.data;
    const sizes = pageSource.components.get(943)!.data;
    const bar = pageSource.components.get(919)!.data;
    const height = expanded ? sizes.expandedSize.y : sizes.shrinkedSize.y;
    return new OriginalPrefabModel(pageSource.prefab, {
      nodes: { 309: { x: 0 }, 263: { y: pageSource.nodes.get(expanded ? 105 : 181)!.position.y } },
      components: { 768: { mText: "音符统计" }, 875: { mFlip: expanded ? 1 : 2 },
        947: { mClipRange: { ...panel.mClipRange, w: height },
          mClipOffset: { ...panel.mClipOffset, y: -(height - sizes.shrinkedSize.y) / 2 } },
        758: { mHeight: expanded ? bar.expandedScrollbarHeight : bar.shrinkedScrollbarHeight } },
    });
  }, [expanded]);
  const grid = page.components.get(765)!;
  const gridPosition = page.transform(grid.node);
  const scroll = page.nodeAt("UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView");
  const scrollTransform = page.transform(scroll.id), panel = page.components.get(947)!.data;
  const viewportTop = -(scrollTransform.y + panel.mClipRange.y + panel.mClipOffset.y + panel.mClipRange.w / 2);
  const rows = Math.ceil(counts.length / grid.data.maxPerLine);
  const contentHeight = -gridPosition.y + (rows - 1) * grid.data.cellHeight + countBox.y + countBox.height - viewportTop;
  const recipe = useMemo(() => resolveOriginalPreviewSkin(settings.simulatorSettings.skin, settings.habahiro ? "habahiro" : "ordinary"),
    [settings.simulatorSettings.skin, settings.habahiro]);
  const resources = useOriginalAnimatedSkinResources(recipe, onError, true);
  const scrollState = useRef({ value: 0 });
  return <>
    <OriginalPrefabView model={page} bindings={{ omit: new Set([758, 960]), buttons: {
      967: { label: expanded ? "收起音符统计" : "展开音符统计", action: () => onExpandedChange(!expanded) },
    } }} />
    <OriginalPageViewport model={page} bindings={{}} scrollState={scrollState.current} layout={{
      scroll: "UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView",
      content: "UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView/Grid",
      bar: "UserCharacterRankPage/Main/ScrollWindow/ScrollBar", contentHeight,
    }}>
      {counts.map((count, index) => {
        const label = `${SONG_NOTE_ROLES[Math.floor(index / 4)]}${SONG_NOTE_KINDS[index % 4]}音符`;
        const model = new OriginalPrefabModel(cellPrefab, { components: { 12: { mText: String(count), mEncoding: false } } });
        return <div key={index} className="original-prefab-origin" data-note-statistic={index} aria-label={`${label}：${count}`}
          style={{ left: gridPosition.x + (index % grid.data.maxPerLine - (grid.data.maxPerLine - 1) / 2) * grid.data.cellWidth,
            top: -gridPosition.y + Math.floor(index / grid.data.maxPerLine) * grid.data.cellHeight }}>
          {/* The source circle is tinted by CharacterModel, not a generic icon frame.
              Notes have no character identity; retain the icon slot and rank label. */}
          <OriginalPrefabView model={model} bindings={{ omit: new Set([10, 11]) }} />
          <NoteThumbnail resources={resources} index={settings.mirrorEnabled && index % 4 >= 2 ? index ^ 1 : index}
            label={label} onError={onError} />
        </div>;
      })}
    </OriginalPageViewport>
  </>;
}
