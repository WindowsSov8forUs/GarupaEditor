import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NOTE_SPECS, type EditorTool, type NoteType } from "../../chartCore";
import type { SkinNoteType } from "../../skinLoader";
import profile from "../../data/originalSongDetailProfile.json";
import musicSelectionProfile from "../../data/originalMusicSelectionProfile.json";
import cardImageSwitch from "../../data/originalCardImageSwitchButton.json";
import buttonTemplates from "../../data/originalButtonTemplates.json";
import { OriginalPrefabView } from "../OriginalPrefabView";
import { OriginalPrefabModel, originalAtlasFor, type OriginalPrefab } from "../originalPrefabModel";
import { OriginalSprite } from "../OriginalUi";
import { OriginalSquareRadioButton, ORIGINAL_SQUARE_RADIO_BOUNDS } from "../OriginalSquareRadioButton";
import { OriginalPageViewport } from "../OriginalPageViewport";

type SpriteLayers = { base?: string; overlay?: string; overlayMode: "none" | "flick" | "directional" };
type SidebarPanelProps = {
  isSkinReady: boolean; isToolArmed: boolean; tool: EditorTool;
  applyToolFromPalette(type: NoteType): void;
  onPlay(): void;
  onPreview(): void;
  getSpriteLayers(type: NoteType, options?: { includeDirectionalOverlay?: boolean; includeFlickOverlay?: boolean; baseImageType?: SkinNoteType }): SpriteLayers;
  getSpriteAspectRatio(layers: SpriteLayers): number;
  renderSpriteStack(layers: SpriteLayers, label: string, className?: string, aspectRatio?: number): ReactNode;
};
const tools = ["single", "skill", "flick", "slide", "directional_flick_left", "directional_flick_right"] as const;
const frameModel = new OriginalPrefabModel(profile.prefabs.profileInformation as unknown as OriginalPrefab);
const frame = frameModel.components.get(859)!;
const frameTransform = frameModel.transform(frame.node);
const frameBounds = frameModel.rect(frame);
const objectSource = new OriginalPrefabModel(profile.prefabs.profileNoteStatistics as unknown as OriginalPrefab, {
  nodes: { 309: { x: 0 } },
});
const objectPanel = objectSource.components.get(947)!.data;
const scrollTransform = objectSource.transform(288);
const scrollLeft = scrollTransform.x - objectPanel.mClipRange.z / 2;
const scrollTop = -scrollTransform.y - objectPanel.mClipRange.w / 2;
const gridGap = 8;
const gridWidth = ORIGINAL_SQUARE_RADIO_BOUNDS.width * 2 + gridGap;
const sidebarWidth = frameBounds.width - objectPanel.mClipRange.z + gridWidth;
const widthReduction = frameBounds.width - sidebarWidth;
const actionGap = 12;
const cardImageSwitchModel = new OriginalPrefabModel(cardImageSwitch as unknown as OriginalPrefab);
const cardImageSwitchBounds = cardImageSwitchModel.rect(cardImageSwitchModel.components.get(534)!);
const actionWidth = sidebarWidth - cardImageSwitchBounds.width - actionGap;
const actionPrefab = musicSelectionProfile.prefabs.info as unknown as OriginalPrefab;
function createActionModel(preview: boolean) {
  return new OriginalPrefabModel({ ...actionPrefab,
    components: actionPrefab.components.map(component => component.id === 331
      ? { ...component, data: { ...component.data, initializeTemplateHeight: 3,
        initializeTemplateWidth: 0, initializeTemplateColorPattern: preview ? 1 : 2 } }
      : component.node === 73 && component.kind === "BoxCollider2D"
        ? { ...component, data: { ...component.data, m_Size: { ...component.data.m_Size,
          x: Math.trunc(actionWidth * buttonTemplates.colliderWidthScale) } } }
        : component),
  }, {
  nodes: { 1: { x: 0, y: 0 }, 73: { x: 0, y: 0 } },
  components: { 328: { mSpriteName: preview ? "button_gray" : "button_pink", mWidth: actionWidth },
    329: { mWidth: actionWidth, mSpriteName: preview ? "button_gray" : "button_pink" },
    352: { mText: preview ? "预览" : "游玩", mWidth: actionWidth } },
  });
}
const playModel = createActionModel(false);
const previewModel = createActionModel(true);
const playBounds = playModel.rect(playModel.components.get(328)!);

export const SidebarPanel = memo(function SidebarPanel({ isSkinReady, isToolArmed, tool, applyToolFromPalette, onPlay, onPreview,
  getSpriteLayers, getSpriteAspectRatio, renderSpriteStack }: SidebarPanelProps) {
  const [preview, setPreview] = useState(false);
  const host = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(frameBounds.height);
  const scrollState = useRef({ value: 0 });
  useLayoutEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);
  const objectModel = useMemo(() => {
    const heightChange = height - frameBounds.height;
    const clipHeight = Math.max(1, objectPanel.mClipRange.w + heightChange);
    const headerInset = objectSource.rect(objectSource.components.get(948)!).x - frameBounds.x;
    const captionInset = objectSource.components.get(948)!.data.mWidth - objectSource.components.get(768)!.data.mWidth;
    return new OriginalPrefabModel(objectSource.prefab, {
      nodes: { 309: { x: 0 }, 58: { x: -widthReduction / 2 },
        305: { x: objectSource.nodes.get(305)!.position.x + widthReduction / 2 },
        288: { y: objectSource.nodes.get(288)!.position.y - (clipHeight - objectPanel.mClipRange.w) / 2 },
        294: { x: objectSource.nodes.get(294)!.position.x - widthReduction / 2 } },
      components: {
        948: { mWidth: sidebarWidth - headerInset * 2 },
        768: { mText: "物件", mWidth: sidebarWidth - headerInset * 2 - captionInset },
        947: { mClipRange: { ...objectPanel.mClipRange, z: gridWidth, w: clipHeight } },
        758: { mHeight: Math.max(1, objectSource.components.get(758)!.data.mHeight + heightChange) },
      },
    });
  }, [height]);
  return <div className="editor-left-column ui-design-scale" style={{ width: sidebarWidth }}>
    <aside ref={host} className="sidebar editor-note-sidebar" aria-label="物件"
    style={{ "--note-button-width": `${ORIGINAL_SQUARE_RADIO_BOUNDS.width}px`,
      "--note-button-height": `${ORIGINAL_SQUARE_RADIO_BOUNDS.height}px`, "--note-button-gap": `${gridGap}px` } as CSSProperties}>
    <OriginalSprite sprite={frame.data.mSpriteName} atlas={originalAtlasFor(frame)}
      scale={frameTransform.scaleX} scaleY={frameTransform.scaleY} spriteType={frame.data.mType}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
    <div className="original-prefab-origin" style={{ left: -frameBounds.x, top: -frameBounds.y }}>
      <OriginalPrefabView model={objectModel} root={305} />
      <OriginalPageViewport model={objectModel} bindings={{}} scrollState={scrollState.current} layout={{
        scroll: "UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView",
        content: "UserCharacterRankPage/Main/ScrollWindow/scrollViewRoot/ScrollView/Grid",
        bar: "UserCharacterRankPage/Main/ScrollWindow/ScrollBar",
        contentHeight: 3 * ORIGINAL_SQUARE_RADIO_BOUNDS.height + 2 * gridGap + 2 * objectPanel.mClipSoftness.y,
      }}>
    <div className="editor-note-grid" role="radiogroup" aria-label="音符选择"
      style={{ position: "absolute", left: scrollLeft, top: scrollTop + objectPanel.mClipSoftness.y }}>
      {tools.map(type => {
        const label = NOTE_SPECS[type].label;
        const layers = getSpriteLayers(type, { includeDirectionalOverlay: false, includeFlickOverlay: false });
        const ratio = getSpriteAspectRatio(layers);
        return <div key={type} className="editor-note-button-slot">
          <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
            <OriginalSquareRadioButton label={label} selected={isToolArmed && tool === type} disabled={!isSkinReady}
              onClick={() => { if (isSkinReady && !(isToolArmed && tool === type)) applyToolFromPalette(type); }}
              content={<span className="editor-note-button-image" style={{ "--sprite-aspect-ratio": String(ratio) } as CSSProperties}>
                {isSkinReady && layers.base ? renderSpriteStack(layers, label, "note-sprite-stack", ratio) : null}
              </span>} />
          </div>
        </div>;
      })}
    </div>
      </OriginalPageViewport>
    </div>
    </aside>
    <div className="editor-left-actions" style={{ gap: actionGap }}>
      <div className="editor-card-image-switch"
        style={{ position: "relative", width: cardImageSwitchBounds.width, height: cardImageSwitchBounds.height }}>
        <div className="original-prefab-origin" style={{ left: -cardImageSwitchBounds.x, top: -cardImageSwitchBounds.y }}>
          <OriginalPrefabView model={cardImageSwitchModel} bindings={{ buttons: {
            532: { action: () => setPreview(value => !value), label: preview ? "切换为游玩模式" : "切换为预览模式" },
          } }} />
        </div>
      </div>
      <div className="editor-left-play" style={{ width: playBounds.width, height: playBounds.height }}>
        <div className="original-prefab-origin" style={{ left: -playBounds.x, top: -playBounds.y }}>
          <OriginalPrefabView model={preview ? previewModel : playModel} root={73}
            bindings={{ buttons: { 331: { action: preview ? onPreview : onPlay, label: preview ? "预览" : "游玩" } } }} />
        </div>
      </div>
    </div>
  </div>;
});
