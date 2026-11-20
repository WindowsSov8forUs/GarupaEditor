import { EditorSlideFitDialog } from "./EditorSlideFitDialog";
import type { SlideFitSettings } from "../../app/slideFitShapes";
import { SlideFitPreview } from "./SlideFitPreview";
import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NOTE_SPECS, type ChartTimingGroupId, type EditorTool, type NoteType } from "../../chartCore";
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
import { EditorBpmDialog } from "./EditorBpmDialog";
import { EditorSvDialog } from "./EditorSvDialog";

type SpriteLayers = { base?: string; overlay?: string; overlayMode: "none" | "flick" | "directional" };
type SidebarPanelProps = {
  isSkinReady: boolean; isToolArmed: boolean; tool: EditorTool;
  applyToolFromPalette(type: NoteType): void;
  bpm: number; onApplyBpm(value: number): void; onArmBpmTool(): void;
  /** Arms the Long tool: one click places a head and a tail half a beat apart. */
  onArmLongTool(): void;
  /** Arms the Middle tool: it inserts nodes into Slides (and places lone middle nodes in ExGarupa). */
  onArmMiddleTool(): void;
  /** Puts the selected tool down: pressing a selected placement tool again. */
  onDisarmTool(): void;
  /** The SV tool, offered in ExGarupa mode: the first press arms it, the next opens its setting. */
  sv?: {
    value: number;
    timingGroup: ChartTimingGroupId;
    timingGroups: readonly ChartTimingGroupId[];
    onArm(): void;
    onApply(value: number, timingGroup: ChartTimingGroupId): void;
    onAddTimingGroup(): ChartTimingGroupId | null;
  };
  onPlay(): void;
  onPreview(): void;
  getSpriteLayers(type: NoteType, options?: { includeDirectionalOverlay?: boolean; includeFlickOverlay?: boolean; baseImageType?: SkinNoteType }): SpriteLayers;
  getSpriteAspectRatio(layers: SpriteLayers): number;
  renderSpriteStack(layers: SpriteLayers, label: string, className?: string, aspectRatio?: number): ReactNode;
  /** Row between the object panel and the play action (undo, redo, clipboard); the panel gives up its height. */
  historyTools?: ReactNode;
  /** A row of selection tools under the history row. */
  mirrorTools?: ReactNode;
  /** Directional flick tools are offered only from the SP 音符 mode up. */
  directionalEnabled: boolean;
  /** The skin's long-note body texture, for the Long icon. */
  longBodyTexture?: string;
  /** The curve Slide line texture (a Slide with Hidden nodes), for the Curve tool icon. */
  curveSlideLineTexture?: string;
  /** The curve tool's preset; its button opens the preset dialog, whose 保存 keeps it and arms the tool, 取消 not. */
  curve: {
    settings: SlideFitSettings; onSave(settings: SlideFitSettings): void; onCancel(): void;
    /** For the dialog's board crop preview: the board's flat lane art and lane width. */
    trackLane: string | null; boardLaneWidth: number;
  };
};
const tools = ["single", "skill", "flick", "slide", "directional_flick_left", "directional_flick_right"] as const;
const basicTools = tools.filter(type => type !== "directional_flick_left" && type !== "directional_flick_right");

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
/** The music selection's action button (the template 「游玩」 uses), pink or gray, at any width in design px. */
function createActionModel(label: string, width: number, gray: boolean) {
  return new OriginalPrefabModel({ ...actionPrefab,
    components: actionPrefab.components.map(component => component.id === 331
      ? { ...component, data: { ...component.data, initializeTemplateHeight: 3,
        initializeTemplateWidth: 0, initializeTemplateColorPattern: gray ? 1 : 2 } }
      : component.node === 73 && component.kind === "BoxCollider2D"
        ? { ...component, data: { ...component.data, m_Size: { ...component.data.m_Size,
          x: Math.trunc(width * buttonTemplates.colliderWidthScale) } } }
        : component),
  }, {
  nodes: { 1: { x: 0, y: 0 }, 73: { x: 0, y: 0 } },
  components: { 328: { mSpriteName: gray ? "button_gray" : "button_pink", mWidth: width },
    329: { mWidth: width, mSpriteName: gray ? "button_gray" : "button_pink" },
    352: { mText: label, mWidth: width } },
  });
}
const playModel = createActionModel("游玩", actionWidth, false);
const previewModel = createActionModel("预览", actionWidth, true);
const playBounds = playModel.rect(playModel.components.get(328)!);
/** Width of the editor's left column, in design px. */
export const EDITOR_SIDEBAR_WIDTH = sidebarWidth;
/** The left column's gap between its rows and between the controls of a row, in design px. */
export const EDITOR_LEFT_COLUMN_GAP = actionGap;

/** A gray action button of the left column (same template as 「预览」), `width` design px wide. */
export function SidebarActionButton({ label, ariaLabel, width, onClick }: {
  label: string; ariaLabel: string; width: number; onClick(): void;
}) {
  const model = useMemo(() => createActionModel(label, width, true), [label, width]);
  const bounds = model.rect(model.components.get(328)!);
  return <div style={{ position: "relative", flex: "0 0 auto", width: bounds.width, height: bounds.height }}>
    <div className="original-prefab-origin" style={{ left: -bounds.x, top: -bounds.y }}>
      <OriginalPrefabView model={model} root={73} bindings={{ buttons: { 331: { action: onClick, label: ariaLabel } } }} />
    </div>
  </div>;
}

/** Long: head note at the bottom, tail note at the top, the long-note body between them. */
function EditorLongIcon({ note, body }: { note?: string; body?: string }) {
  if (!note) return <span className="editor-note-button-image" />;
  return <span className="editor-note-button-image editor-long-icon">
    <img className="editor-long-icon-note" src={note} alt="" draggable={false} />
    <span className="editor-long-icon-body" style={body ? { backgroundImage: `url(${JSON.stringify(body)})` } : undefined} />
    <img className="editor-long-icon-note" src={note} alt="" draggable={false} />
  </span>;
}

/** The Curve tool icon's image area in the note button (design px), as the other tool icons'. */
const CURVE_ICON_BOX = { width: 101, height: 48 };

export const SidebarPanel = memo(function SidebarPanel({ isSkinReady, isToolArmed, tool, applyToolFromPalette, bpm, onApplyBpm, onArmBpmTool, onArmLongTool, onArmMiddleTool, onDisarmTool, onPlay, onPreview,
  getSpriteLayers, getSpriteAspectRatio, renderSpriteStack, historyTools, mirrorTools, directionalEnabled, longBodyTexture, curveSlideLineTexture, curve, sv }: SidebarPanelProps) {
  const visibleTools = directionalEnabled ? tools : basicTools;
  // Note tools, Long, Middle, Curve, BPM and (in ExGarupa) SV.
  const noteRows = Math.ceil((visibleTools.length + 5 + (sv ? 1 : 0)) / 2);
  const middleLayers = getSpriteLayers("single", { baseImageType: "slide_among", includeDirectionalOverlay: false, includeFlickOverlay: false });
  const middleRatio = getSpriteAspectRatio(middleLayers);
  const [preview, setPreview] = useState(false);
  const [bpmOpen, setBpmOpen] = useState(false);
  const [svOpen, setSvOpen] = useState(false);
  const [curveOpen, setCurveOpen] = useState(false);
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
        contentHeight: noteRows * ORIGINAL_SQUARE_RADIO_BOUNDS.height + (noteRows - 1) * gridGap + 2 * objectPanel.mClipSoftness.y,
      }}>
    <div className="editor-note-grid" role="radiogroup" aria-label="音符选择"
      style={{ position: "absolute", left: scrollLeft, top: scrollTop + objectPanel.mClipSoftness.y }}>
      {/* Notes, then the long-note tools together: Long, Slide, Hidden, Middle, Curve. */}
      {visibleTools.filter(type => type !== "slide").map(type => {
        const label = NOTE_SPECS[type].label;
        const layers = getSpriteLayers(type, { includeDirectionalOverlay: false, includeFlickOverlay: false });
        const ratio = getSpriteAspectRatio(layers);
        return <Fragment key={type}>
          <div className="editor-note-button-slot">
            <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
              <OriginalSquareRadioButton label={label} selected={isToolArmed && tool === type} disabled={!isSkinReady}
                onClick={() => { if (!isSkinReady) return; if (isToolArmed && tool === type) onDisarmTool(); else applyToolFromPalette(type); }}
                content={<span className="editor-note-button-image" style={{ "--sprite-aspect-ratio": String(ratio) } as CSSProperties}>
                  {isSkinReady && layers.base ? renderSpriteStack(layers, label, "note-sprite-stack", ratio) : null}
                </span>} />
            </div>
          </div>
        </Fragment>;
      })}
          {/* Long tool, right after Slide: the icon is the long note's head and tail with its body, from the current skin. */}
          <div className="editor-note-button-slot">
            <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
              <OriginalSquareRadioButton label="Long" selected={isToolArmed && tool === "long"} disabled={!isSkinReady}
                onClick={() => { if (!isSkinReady) return; if (isToolArmed && tool === "long") onDisarmTool(); else onArmLongTool(); }}
                content={<EditorLongIcon note={isSkinReady ? getSpriteLayers("slide", { includeDirectionalOverlay: false, includeFlickOverlay: false }).base : undefined}
                  body={longBodyTexture} />} />
            </div>
          </div>
      {(() => {
        const type = "slide" as const;
        const label = NOTE_SPECS[type].label;
        const layers = getSpriteLayers(type, { includeDirectionalOverlay: false, includeFlickOverlay: false });
        const ratio = getSpriteAspectRatio(layers);
        return <div className="editor-note-button-slot">
            <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
              <OriginalSquareRadioButton label={label} selected={isToolArmed && tool === type} disabled={!isSkinReady}
                onClick={() => { if (!isSkinReady) return; if (isToolArmed && tool === type) onDisarmTool(); else applyToolFromPalette(type); }}
                content={<span className="editor-note-button-image" style={{ "--sprite-aspect-ratio": String(ratio) } as CSSProperties}>
                  {isSkinReady && layers.base ? renderSpriteStack(layers, label, "note-sprite-stack", ratio) : null}
                </span>} />
            </div>
          </div>;
      })()}
          {/* Hidden tool: the Slide tool placing Hidden nodes. No original sprite; the slide middle node, faded. */}
          <div className="editor-note-button-slot">
            <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
              <OriginalSquareRadioButton label="Hidden" selected={isToolArmed && tool === "hidden"} disabled={!isSkinReady}
                onClick={() => { if (!isSkinReady) return; if (isToolArmed && tool === "hidden") onDisarmTool(); else applyToolFromPalette("hidden"); }}
                content={<span className="editor-note-button-image editor-hidden-icon" style={{ "--sprite-aspect-ratio": String(middleRatio) } as CSSProperties}>
                  {isSkinReady && middleLayers.base ? renderSpriteStack(middleLayers, "Hidden", "note-sprite-stack", middleRatio) : null}
                </span>} />
            </div>
          </div>
          {/* Middle tool, after Long: the icon is the skin's slide middle-node sprite. */}
          <div className="editor-note-button-slot">
            <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
              <OriginalSquareRadioButton label="Middle" selected={isToolArmed && tool === "middle"} disabled={!isSkinReady}
                onClick={() => { if (!isSkinReady) return; if (isToolArmed && tool === "middle") onDisarmTool(); else onArmMiddleTool(); }}
                content={<span className="editor-note-button-image" style={{ "--sprite-aspect-ratio": String(middleRatio) } as CSSProperties}>
                  {isSkinReady && middleLayers.base ? renderSpriteStack(middleLayers, "Middle", "note-sprite-stack", middleRatio) : null}
                </span>} />
            </div>
          </div>
          {/* Curve tool, after Middle: its icon previews the saved shape with the current skin. Every press, armed or not,
              opens the preset dialog; while armed, pressing a Slide segment applies the preset there. */}
          <div className="editor-note-button-slot">
            <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
              <OriginalSquareRadioButton label="Curve" selected={isToolArmed && tool === "curve"} disabled={!isSkinReady}
                onClick={() => { if (isSkinReady) setCurveOpen(true); }}
                content={<span className="editor-note-button-image editor-curve-icon">
                  {isSkinReady && <SlideFitPreview settings={curve.settings} box={CURVE_ICON_BOX}
                    slideNote={getSpriteLayers("slide", { includeDirectionalOverlay: false, includeFlickOverlay: false }).base}
                    longLine={longBodyTexture} curveSlideLine={curveSlideLineTexture} />}
                </span>} />
            </div>
            <EditorSlideFitDialog open={curveOpen} settings={curve.settings}
              preview={{ slideNote: isSkinReady ? getSpriteLayers("slide", { includeDirectionalOverlay: false, includeFlickOverlay: false }).base : undefined,
                longLine: longBodyTexture, curveSlideLine: curveSlideLineTexture, trackLane: curve.trackLane,
                boardLaneWidth: curve.boardLaneWidth }}
              onSave={settings => { curve.onSave(settings); setCurveOpen(false); }}
              onCancel={() => { curve.onCancel(); setCurveOpen(false); }} />
          </div>
      <div className="editor-note-button-slot">
        <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
          {/* First press arms the BPM placement tool; pressing it again while armed opens the BPM setting. */}
          <OriginalSquareRadioButton label="BPM" selected={isToolArmed && tool === "bpm"}
            onClick={() => {
              if (isToolArmed && tool === "bpm") setBpmOpen(true);
              else onArmBpmTool();
            }} />
        </div>
        <EditorBpmDialog open={bpmOpen} title="BPM 设置" value={bpm} onClose={() => setBpmOpen(false)} onConfirm={onApplyBpm} />
      </div>
      {sv && <div className="editor-note-button-slot">
        <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_RADIO_BOUNDS.x, top: -ORIGINAL_SQUARE_RADIO_BOUNDS.y }}>
          {/* As the BPM tool: the first press arms SV placement, the next opens the SV setting. */}
          <OriginalSquareRadioButton label="SV" selected={isToolArmed && tool === "sv"}
            onClick={() => {
              if (isToolArmed && tool === "sv") setSvOpen(true);
              else sv.onArm();
            }} />
        </div>
        <EditorSvDialog open={svOpen} title="SV 设置" value={sv.value} timingGroup={sv.timingGroup}
          timingGroups={sv.timingGroups} onClose={() => setSvOpen(false)} onConfirm={sv.onApply}
          onAddTimingGroup={sv.onAddTimingGroup} />
      </div>}
    </div>
      </OriginalPageViewport>
    </div>
    </aside>
    {mirrorTools}
    {historyTools}
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
