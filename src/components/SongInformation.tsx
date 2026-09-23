import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDuration, type ChartMetadata } from "../chartCore";
import header from "../data/simulator/resultHeaderProfile.json";
import clear from "../data/simulator/resultClearProfile.json";
import layouts from "../data/simulator/resultLabelLayoutProfile.json";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalPrefabModel, type OriginalNode, type OriginalComponent } from "./originalPrefabModel";
import { centeredUiSpace, useUiViewport } from "./useUiViewport";
import { useOriginalButtonAction } from "./useOriginalButtonAction";
import { useOriginalUiSound } from "./OriginalUiSound";
import { OriginalTransferDialog } from "./OriginalTransferDialog";
import { OriginalFormButton, OriginalFormSubtitle } from "./OriginalFormParts";
import { DIFFICULTY_LABEL_STYLE } from "./text/difficultyLabelStyle";
import "./SongInformation.css";

const background = header.find(item => item.role === "background")!;
const [sourceWidth, sourceHeight] = background.size;
const rgba = (c: readonly number[]) => ({ r: c[0], g: c[1], b: c[2], a: c[3] });
const rgb = (c: number) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1];

/** Translate the delivered result header data into the shared DOM prefab renderer.
 * Internal coordinates, pivots, dimensions and UILabel fitting remain source-owned. */
function songHeaderModel(metadata: ChartMetadata): OriginalPrefabModel {
  const nodes: OriginalNode[] = [];
  const components: OriginalComponent[] = [];
  let nextId = 1;
  const node = (name: string, parent: number | null, position: readonly number[], scale: readonly number[] = [1, 1, 1], active = true) => {
    const id = nextId++;
    nodes.push({ id, transformId: id, name, path: name, parent, active,
      position: { x: position[0]!, y: position[1]!, z: position[2] ?? 0 },
      scale: { x: scale[0]!, y: scale[1]!, z: scale[2] ?? 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    return id;
  };
  const root = node("Header", null, [-background.position[0]!, -background.position[1]! - sourceHeight! / 2]);
  const sprite = (owner: number, name: string, size: readonly number[], pivot: number, depth: number,
    color: readonly number[], atlas: "menu" | "common", type: number) => components.push({ id: nextId++, node: owner, kind: "UISprite", data: {
      mSpriteName: name, mAtlas: { m_PathID: atlas === "menu" ? 1520 : 1611 },
      mWidth: size[0], mHeight: size[1], mPivot: pivot, mDepth: depth, mColor: rgba(color), mType: type, centerType: 1,
    } });
  const label = (owner: number, text: string, size: readonly number[], pivot: number, depth: number,
    fontSize: number, spacing: number, color: readonly number[], layout: { spacingY: number; alignment: number; maxLines: number; overflow: number },
    outline = 0, outlineColor: readonly number[] = [1, 1, 1, 1]) => components.push({ id: nextId++, node: owner, kind: "UILabel", data: {
      mText: text, mWidth: size[0], mHeight: size[1], mPivot: pivot, mDepth: depth,
      mFontSize: fontSize, mSpacingX: spacing, mSpacingY: layout.spacingY, mColor: rgba(color),
      mAlignment: layout.alignment, mMaxLineCount: layout.maxLines, mOverflow: layout.overflow,
      mFontStyle: 0, mEncoding: false, mEffectStyle: outline ? 2 : 0,
      mEffectDistance: { x: outline, y: outline }, mEffectColor: rgba(outlineColor),
    } });
  for (const item of header) {
    const owner = node(item.role, root, item.position);
    if (item.sprite) sprite(owner, item.sprite, item.size, item.pivot, item.depth, item.color, "menu", item.type!);
    else {
      const layout = layouts["result-header.json"][item.role as keyof typeof layouts["result-header.json"]];
      label(owner, item.role === "title" ? metadata.title || "Untitled" : item.role === "level" ? String(metadata.difficultyLevel) : "Lv.",
        item.size, item.pivot, item.depth, item.fontSize!, item.spacing!, item.color, layout, item.outline);
    }
  }
  const anchors = new Map<string, number>();
  const extras = clear.headerNodes.filter(item => !("sprite" in item));
  for (const item of extras) anchors.set(item.path, node(`header/${item.path}`, root, item.position, item.scale, item.active));
  for (const item of extras) {
    const target = nodes.find(value => value.id === anchors.get(item.path))!;
    target.parent = item.parent === null ? root : anchors.get(item.parent)!;
  }
  // Only the clear-status artwork is replaced, at its original parent/position.
  // The music sprite keeps its own source widget and atlas padding (reverse 4d8cb8d8).
  const icon = node("MusicListButton", anchors.get("ComponentRoot/ClearStarRoot")!, [0, 0, 0]);
  sprite(icon, "button_bandtop_music", [66, 66], 4, 10, [1, 1, 1, 1], "menu", 1);
  const difficultyRoot = node("DifficultyLabelObject", anchors.get("ComponentRoot/DifficultyLabelPos")!, [0, 0, 0]);
  const style = DIFFICULTY_LABEL_STYLE[metadata.difficulty];
  for (const item of clear.difficultyNodes) {
    const owner = node(`difficulty/${item.path}`, difficultyRoot, item.position, item.scale, item.active && item.path !== "Frame");
    if (item.sprite) sprite(owner, item.sprite.name, item.sprite.size, item.sprite.pivot, item.sprite.depth,
      item.path === "Bg" ? rgb(style.background) : item.sprite.color, "common", item.sprite.type);
    if (item.label) {
      nodes.find(value => value.id === owner)!.position.x = style.offsetX;
      label(owner, metadata.difficulty, item.label.size, item.label.pivot, item.label.depth, item.label.fontSize,
        style.spacing, item.label.color, layouts["result-clear.json"].difficultyNodes.Difficulty, 1, rgb(style.outline));
    }
  }
  return new OriginalPrefabModel({ resource: "result-header", nodes, components });
}

export function SongInformationBar({ metadata, onOpen }: { metadata: ChartMetadata; onOpen(): void }) {
  const model = useMemo(() => songHeaderModel(metadata), [metadata.title, metadata.difficulty, metadata.difficultyLevel]);
  const slot = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, offset: 0 });
  const viewport = useUiViewport();
  useLayoutEffect(() => {
    const element = slot.current!;
    const update = () => {
      const { width, offset } = centeredUiSpace(element.getBoundingClientRect(), viewport.width);
      setSpace(previous => previous.width === width && previous.offset === offset ? previous : { width, offset });
    };
    const observer = new ResizeObserver(update); observer.observe(element); update();
    return () => observer.disconnect();
  }, [viewport.width]);
  const scale = Math.min(viewport.scale, space.width / sourceWidth!);
  const sound = useOriginalUiSound();
  const { handlers } = useOriginalButtonAction(onOpen, false, false, 1, () => sound?.play(1));
  return <div className="song-information-slot" ref={slot}>
    <button type="button" className="original-button song-information-bar" {...handlers}
      aria-label={`歌曲详情：${metadata.title || "Untitled"}`} title="查看歌曲详情"
      style={{ width: sourceWidth! * scale, height: sourceHeight! * scale, transform: `translateX(${space.offset}px)` }}>
      <span className="song-information-scene" style={{ width: sourceWidth, height: sourceHeight, transform: `scale(${scale})` }}>
        <OriginalPrefabView model={model} />
      </span>
    </button>
  </div>;
}

export function SongInformationDialog({ open, metadata, coverImageSrc, audioDurationSec, noteCount,
  onCoverError, onClose, onEdit, onPlay }: {
  open: boolean; metadata: ChartMetadata; coverImageSrc: string; audioDurationSec: number; noteCount: number;
  onCoverError(): void; onClose(): void; onEdit(): void; onPlay(): void;
}) {
  return <OriginalTransferDialog open={open} title="歌曲详情" onClose={onClose}>
    <div className="transfer-body">
      <div className="transfer-page song-detail-page">
        <div className="song-detail-heading">
          <img src={coverImageSrc} alt="歌曲封面" onError={onCoverError} />
          <div><h2>{metadata.title || "Untitled"}</h2><p>{metadata.difficulty} Lv.{metadata.difficultyLevel}</p></div>
        </div>
        <div className="song-detail-grid">
          {[["艺术家", metadata.artist], ["谱师", metadata.charter], ["BPM", metadata.bpm.toFixed(2)],
            ["时长", formatDuration(audioDurationSec)], ["音符数", String(noteCount)]].map(([label, value]) =>
            <div key={label}><OriginalFormSubtitle text={label!} /><p>{value || "—"}</p></div>)}
        </div>
      </div>
      <div className="transfer-actions">
        <OriginalFormButton onClick={onClose}>关闭</OriginalFormButton>
        <OriginalFormButton onClick={onEdit}>编辑谱面信息</OriginalFormButton>
        <OriginalFormButton tone="pink" onClick={onPlay}>开始演奏</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>;
}
