import { UiFitSurface } from "./UiViewport";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import source from "../data/originalSongDetailProfile.json";
import { normalizeDifficultyLevel, type ChartMetadata } from "../chartCore";
import { OriginalPrefabModel, ORIGINAL_WORDING, originalAtlasFor, type OriginalPrefab } from "./originalPrefabModel";
import { originalSpriteDrawingRect } from "./originalSpriteGeometry";
import { originalSurfaceRow } from "./useOriginalSurface";
import { OriginalPageVisible, OriginalPrefabView, type OriginalViewBindings } from "./OriginalPrefabView";
import { OriginalDifficultySelect, OriginalFormInput, OriginalFormStepper, OriginalFormButton } from "./OriginalFormParts";
import { OriginalTransferDialog } from "./OriginalTransferDialog";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalSprite } from "./OriginalUi";
import { OriginalProfilePagination } from "./originalProfilePagination";
import { DIFFICULTY_LABEL_STYLE } from "./text/difficultyLabelStyle";
import { useHorizontalTextScroll } from "./useHorizontalTextScroll";

const prefabs = source.prefabs as unknown as Record<keyof typeof source.prefabs, OriginalPrefab>;

const difficultyBase = new OriginalPrefabModel(prefabs.difficultyBase, { components: {
  // MusicInfoController.SetlLockState(false) clears the serialized caption.
  // Locked songs replace it with the acquisition-method wording instead.
  277: { mText: "" },
} });
const difficultyBodyRect = difficultyBase.rect(difficultyBase.components.get(307)!);
const difficultyBody = difficultyBase.components.get(307)!;
const difficultyBodyTransform = difficultyBase.transform(difficultyBody.node);
const difficultyBodyDrawing = originalSpriteDrawingRect(difficultyBodyRect,
  originalSurfaceRow(originalAtlasFor(difficultyBody), difficultyBody.data.mSpriteName),
  difficultyBody.data.mType, difficultyBodyTransform.scaleX, difficultyBodyTransform.scaleY,
  difficultyBody.data.mFlip === 1 || difficultyBody.data.mFlip === 3,
  difficultyBody.data.mFlip === 2 || difficultyBody.data.mFlip === 3, difficultyBody.data.mDrawRegion);
const difficultyCaptionRect = difficultyBase.rect(difficultyBase.components.get(294)!);
const difficultyBaseRect = {
  x: difficultyBodyRect.x, y: Math.min(difficultyBodyRect.y, difficultyCaptionRect.y),
  width: difficultyBodyRect.width,
  // Align the drawn bottom, excluding the atlas's transparent bottom padding.
  height: difficultyBodyDrawing.y + difficultyBodyDrawing.height - Math.min(difficultyBodyRect.y, difficultyCaptionRect.y),
};
const difficultyManager = new OriginalPrefabModel(prefabs.difficultyManager);
const difficultyHost = difficultyBase.transform(6);
const difficultyOrigin = { x: difficultyHost.x - difficultyBaseRect.x, y: -difficultyHost.y - difficultyBaseRect.y };
const difficultyLayout = {
  width: difficultyBaseRect.width, height: difficultyBaseRect.height,
  positions: difficultyManager.components.get(15)!.data.buttonPositions.map((ref: { m_PathID: number }) => {
    const point = difficultyManager.transform(ref.m_PathID);
    return { x: difficultyOrigin.x + point.x, y: difficultyOrigin.y - point.y };
  }),
};
export function SongDifficultySelect({ value, level, onChange }: {
  value: ChartMetadata["difficulty"]; level: ChartMetadata["difficultyLevel"]; onChange(value: ChartMetadata["difficulty"]): void;
}) {
  const model = new OriginalPrefabModel(prefabs.difficultyBase, { components: {
    ...difficultyBase.overrides.components,
    257: { mText: level },
    258: { mText: source.wording.word_musicLevel },
  } });
  return <UiFitSurface width={difficultyBaseRect.width} height={difficultyBaseRect.height}>
  <div className="song-difficulty-base" style={{ width: difficultyBaseRect.width, height: difficultyBaseRect.height }}>
    <div className="original-prefab-origin" style={{ left: -difficultyBaseRect.x, top: -difficultyBaseRect.y }}>
      <OriginalPrefabView model={model} />
    </div>
    <OriginalDifficultySelect value={value} onChange={onChange} layout={difficultyLayout}>
      <div className="original-prefab-origin" style={{ left: difficultyOrigin.x, top: difficultyOrigin.y }}>
        <OriginalPrefabView model={difficultyManager} />
      </div>
    </OriginalDifficultySelect>
  </div>
  </UiFitSurface>;
}

const profileMaskModel = new OriginalPrefabModel(prefabs.profilePageMask);
const profilePanel = profileMaskModel.components.get(745)!;
const profileMask = profilePanel.data;
const maskWidth = profileMask.mClipRange.z, maskHeight = profileMask.mClipRange.w;
const maskTransform = profileMaskModel.transform(profilePanel.node);
const maskLeft = maskTransform.x + profileMask.mClipRange.x + profileMask.mClipOffset.x - maskWidth / 2;
const maskTop = -maskTransform.y - profileMask.mClipRange.y - profileMask.mClipOffset.y - maskHeight / 2;
const profileInformationModel = new OriginalPrefabModel(prefabs.profileInformation);
const topBackground = profileInformationModel.rect(profileInformationModel.components.get(708)!);
const bottomBackground = profileInformationModel.rect(profileInformationModel.components.get(859)!);
// The page mask is not the layout container: its bounds extend beyond both backgrounds.
const profileBounds = {
  x: topBackground.x, y: topBackground.y, width: topBackground.width,
  height: bottomBackground.y + bottomBackground.height - topBackground.y,
};
const profileLeftModel = new OriginalPrefabModel(prefabs.profileLeftBase);
const profileLeftBase = profileLeftModel.rect(profileLeftModel.components.get(932)!);
// Use the authored ID plate's width and bottom edge for the replacement left content.
// Its 68-unit height belongs to the ID row, not to the song's difficulty selector.
export const SONG_INFORMATION_LEFT_BOUNDS = {
  x: profileLeftBase.x, y: profileBounds.y, width: profileLeftBase.width,
  height: profileLeftBase.y + profileLeftBase.height - profileBounds.y,
};
export const SONG_INFORMATION_CONTENT_BOUNDS = {
  x: profileLeftBase.x, y: profileBounds.y,
  width: profileBounds.x + profileBounds.width - profileLeftBase.x, height: profileBounds.height,
  columnGap: profileBounds.x - (profileLeftBase.x + profileLeftBase.width),
};
const softnessX = profileMask.mClipSoftness.x, softnessY = profileMask.mClipSoftness.y;
// SoftClip takes the minimum of the horizontal/vertical edge factors. Darken
// combines two opaque grayscale ramps before converting luminance to alpha.
const profileMaskImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${maskWidth}" height="${maskHeight}" viewBox="0 0 ${maskWidth} ${maskHeight}">
<defs><linearGradient id="x"><stop stop-color="black"/><stop offset="${softnessX / maskWidth}" stop-color="white"/><stop offset="${1 - softnessX / maskWidth}" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
<linearGradient id="y" x2="0" y2="1"><stop stop-color="black"/><stop offset="${softnessY / maskHeight}" stop-color="white"/><stop offset="${1 - softnessY / maskHeight}" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
<mask id="clip" maskUnits="userSpaceOnUse" x="0" y="0" width="${maskWidth}" height="${maskHeight}" style="mask-type:luminance"><g style="isolation:isolate"><rect width="100%" height="100%" fill="url(#x)"/><rect width="100%" height="100%" fill="url(#y)" style="mix-blend-mode:darken"/></g></mask></defs>
<rect width="100%" height="100%" fill="white" mask="url(#clip)"/></svg>`)}")`;

/** Only Pages descendants belong in this clip; BackgroundTop and Pages/bg do not. */
export function SongProfilePageMask({ children }: { children: ReactNode }) {
  return <div className="song-profile-page-mask" data-original-panel="745" style={{
    width: maskWidth, height: maskHeight, overflow: "clip", maskImage: profileMaskImage,
    left: maskLeft - profileBounds.x, top: maskTop - profileBounds.y,
    maskSize: "100% 100%", maskRepeat: "no-repeat",
  }}>{children}</div>;
}

/** CN profile rank button; the editor replaces account rewards with chart-level editing. */
function SongProfileLevel({ level, onChange }: { level: string; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(Number(normalizeDifficultyLevel(level)));
  const apply = () => { onChange(normalizeDifficultyLevel(draft)); setOpen(false); };
  const model = new OriginalPrefabModel(prefabs.profileRank, { components: {
    775: { mText: level, mEncoding: false },
    780: { mText: source.wording.myProfile_contentCaption_rank },
  } });
  return <>
    <OriginalPrefabView model={model} bindings={{ buttons: {
      846: { label: `谱面等级 ${level}`, action: () => { setDraft(Number(normalizeDifficultyLevel(level))); setOpen(true); } },
    } }} />
    {createPortal(<OriginalTransferDialog open={open} title="谱面等级" fitContent onClose={() => setOpen(false)}>
      <div className="transfer-body">
        <div className="transfer-page">
          <OriginalFormStepper title="谱面等级" value={draft} minimum={0} maximum={99} onChange={setDraft} />
        </div>
        <div className="transfer-actions">
          <OriginalFormButton onClick={() => setOpen(false)}>取消</OriginalFormButton>
          <OriginalFormButton tone="pink" onClick={apply}>确定</OriginalFormButton>
        </div>
      </div>
    </OriginalTransferDialog>, document.body)}
  </>;
}

/** PublishConfigDialog's first grid cell and SingleToggleButton, with an editor-owned field. */
function SongProfileSettings({ isFullLength, onChange }: { isFullLength: boolean; onChange(value: boolean): void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(isFullLength === true);
  // The original mutates its working cache, then saves when Close is invoked.
  const close = () => { onChange(draft); setOpen(false); };
  const button = new OriginalPrefabModel(prefabs.profileSettingsButton, { components: {
    686: { mText: source.wording.word_setting },
  } });
  const dialog = new OriginalPrefabModel(prefabs.profileSettingsDialog, { components: {
    208: { mText: "歌曲设定" },
    279: { mText: ORIGINAL_WORDING.dialog_button_close },
    199: { mText: "完整版" },
    // SingleToggleButton.changeSprite updates both content and pressed-cover sprites.
    287: { mSpriteName: draft ? "button_pink" : "button_gray" },
    288: { mSpriteName: draft ? "button_pink" : "button_gray" },
    223: { mText: ORIGINAL_WORDING[draft ? "word_on" : "word_off"],
      mColor: draft ? { r: 1, g: 1, b: 1, a: 1 } : { r: 80 / 255, g: 80 / 255, b: 80 / 255, a: 1 },
      mEffectColor: draft ? { r: 1, g: 59 / 255, b: 114 / 255, a: 1 } : { r: 1, g: 1, b: 1, a: 1 } },
  } });
  return <>
    <OriginalPrefabView model={button} bindings={{ buttons: {
      663: { label: "歌曲设定", action: () => { setDraft(isFullLength === true); setOpen(true); } },
    } }} />
    {createPortal(<OriginalAuthoredDialog open={open} model={dialog} onClose={close}
      bindings={{ buttons: {
        254: { action: close },
        295: { label: "完整版", role: "checkbox", selected: draft, action: () => setDraft(value => !value) },
      } }} />, document.body)}
  </>;
}

function SongFeatureIcon({ id, label }: { id: 55 | 90; label: string }) {
  const prefab = prefabs.songFeatureIcons;
  const model = new OriginalPrefabModel({ ...prefab,
    nodes: prefab.nodes.map(node => ({ ...node, active: true })),
    components: prefab.components.filter(component => component.id === id),
  });
  const rect = model.rect(model.components.get(id)!);
  return <div role="img" aria-label={label} style={{ position: "relative", width: rect.width, height: rect.height, flexShrink: 0 }}>
    <div className="original-prefab-origin" style={{ left: -rect.x, top: -rect.y }}>
      <OriginalPrefabView model={model} />
    </div>
  </div>;
}

function SongProfileDifficulty({ difficulty, hasSpecialNotes, hasMv }: {
  difficulty: ChartMetadata["difficulty"]; hasSpecialNotes: boolean; hasMv: boolean;
}) {
  const style = DIFFICULTY_LABEL_STYLE[difficulty];
  const rgba = (value: number) => ({ r: (value >> 16 & 255) / 255, g: (value >> 8 & 255) / 255, b: (value & 255) / 255, a: 1 });
  // Reuse DifficultyLabelObject.Setup(type, false), inside the first title image slot.
  const model = new OriginalPrefabModel(prefabs.difficultyLabel, {
    nodes: { 2: { x: style.offsetX } },
    components: {
      10: { mColor: rgba(style.background) },
      11: { mText: difficulty, mEffectColor: rgba(style.outline), mSpacingX: style.spacing },
    },
  });
  const mount = profileInformationModel.transform(98);
  const featureMount = profileInformationModel.transform(47);
  const degree = new OriginalPrefabModel(prefabs.profileDegreeSlot);
  const slot = degree.rect(degree.components.get(21)!);
  const badge = model.rect(model.components.get(10)!);
  // Keep the authored slot; display its fitted badge at two-thirds size.
  // Scale text and background together, centered within the unchanged slot.
  const scale = Math.min(slot.width / badge.width, slot.height / badge.height) * (2 / 3);
  const featureModel = new OriginalPrefabModel(prefabs.songFeatureIcons);
  const features = ([55, 90] as const).map(id => ({ id, rect: featureModel.rect(featureModel.components.get(id)!) }));
  const featureLeft = Math.min(...features.map(item => item.rect.x));
  const featureTop = Math.min(...features.map(item => item.rect.y));
  return <><div data-profile-difficulty={difficulty} style={{ position: "absolute",
    left: mount.x + slot.x, top: -mount.y + slot.y,
    width: slot.width, height: slot.height, zIndex: 5,
    display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ position: "relative", width: badge.width * scale, height: badge.height * scale, flexShrink: 0 }}>
    <div className="original-prefab-origin" style={{ left: -badge.x * scale,
      top: -badge.y * scale,
      transform: `scale(${scale})`, transformOrigin: "0 0" }}>
      <OriginalPrefabView model={model} />
    </div>
    </div>
  </div>
  <div data-profile-song-features style={{ position: "absolute",
    left: featureMount.x + slot.x, top: -featureMount.y + slot.y,
    width: slot.width, height: slot.height, zIndex: 5 }}>
    {features.map(({ id, rect }) => (id === 55 ? hasMv : hasSpecialNotes) &&
      <div key={id} style={{ position: "absolute",
        // Mount the authored icon group at the slot origin, without centering
        // or closing the original spacing when either icon is hidden.
        left: rect.x - featureLeft,
        top: rect.y - featureTop }}>
        <SongFeatureIcon id={id} label={id === 55 ? "已载入 MV" : "包含 SPECIAL 音符"} />
      </div>)}
  </div></>;
}

type NoteStatisticsContent = (expanded: boolean, onChange: (expanded: boolean) => void) => ReactNode;

export function SongProfileInformation({ title, artist, duration, bpm, count, cover, level, difficulty, hasSpecialNotes, hasMv, mv, onChangeMv, noteStatistics, isFullLength, onFullLengthChange, onLevelChange, onTitleChange, onArtistChange }: {
  title: string; artist: string; duration: string; bpm: string; count: number; cover: string | null; onTitleChange(value: string): void;
  level: string; difficulty: ChartMetadata["difficulty"]; onLevelChange(value: string): void;
  hasSpecialNotes: boolean; hasMv: boolean;
  mv: string | null; onChangeMv(): void; noteStatistics: NoteStatisticsContent;
  onArtistChange(value: string): void;
  isFullLength: boolean; onFullLengthChange(value: boolean): void;
}) {
  const nameHost = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  useHorizontalTextScroll(nameHost, "input");
  const model = new OriginalPrefabModel(prefabs.profileInformation, { components: {
    725: { mText: artist, mEncoding: false },
    754: { mText: "艺术家", mEncoding: false },
  } });
  const backgroundModel = new OriginalPrefabModel({ ...prefabs.profileInformation,
    components: prefabs.profileInformation.components.filter(component => component.id === 859),
  }, { components: { 859: { mHeight: bottomBackground.height + (expanded ? 215 : 0) } } });
  const nameRect = model.rect(model.components.get(662)!);
  const artistRect = model.rect(model.components.get(676)!);
  const thumbnailPosition = model.transform(95);
  const thumbnail = new OriginalPrefabModel(prefabs.profileThumbnail, { nodes: {
    9: { scaleX: source.profileThumbnailScale, scaleY: source.profileThumbnailScale },
  } });
  return <div className="song-profile-information" style={{ width: profileBounds.width, height: profileBounds.height }}>
    <div className="original-prefab-origin" style={{ left: -profileBounds.x, top: -profileBounds.y, zIndex: 0 }}>
      <OriginalPrefabView model={backgroundModel} />
    </div>
    <div className="original-prefab-origin" data-original-panel="829" hidden={expanded}
      style={{ left: -profileBounds.x, top: -profileBounds.y, zIndex: 0 }}>
      <OriginalPrefabView model={model} bindings={{ omit: new Set([657, 662, 676, 680, 681, 696, 706, 725, 859]) }} />
      <SongProfileLevel level={level} onChange={onLevelChange} />
      <SongProfileDifficulty difficulty={difficulty} hasSpecialNotes={hasSpecialNotes} hasMv={hasMv} />
      <SongProfileSettings isFullLength={isFullLength} onChange={onFullLengthChange} />
      <div className="original-prefab-origin song-profile-thumbnail" style={{
        left: thumbnailPosition.x, top: -thumbnailPosition.y, zIndex: 5,
      }}>
        <OriginalPrefabView model={thumbnail} bindings={{ textures: { 126: cover
          ? <img className="original-prefab-texture song-jacket-image" src={cover} alt="歌曲封面缩略图" />
          : <span className="song-jacket-empty" aria-label="未设置封面" /> } }} />
      </div>
      <div ref={nameHost} className="song-profile-name" style={{ position: "absolute", left: nameRect.x, top: nameRect.y,
        width: nameRect.width, height: nameRect.height, zIndex: 11 }}>
        <OriginalFormInput source={{ model, background: 662, label: 657, marker: 681, input: 696 }}
          aria-label="歌曲名" placeholder="未命名歌曲" value={title} onChange={event => onTitleChange(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
      </div>
      <div className="song-profile-artist" style={{ position: "absolute", left: artistRect.x, top: artistRect.y,
        width: artistRect.width, height: artistRect.height, zIndex: model.components.get(676)!.data.mDepth }}>
        <OriginalFormInput source={{ model, background: 676, label: 725, marker: 706, input: 680 }}
          aria-label="艺术家" placeholder="未设置艺术家" value={artist}
          onChange={event => onArtistChange(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
      </div>
    </div>
    <SongProfilePages duration={duration} bpm={bpm} count={count} mv={mv} onChangeMv={onChangeMv}
      noteStatistics={noteStatistics} expanded={expanded} onExpandedChange={setExpanded} />
  </div>;
}

const profilePager = new OriginalPrefabModel(prefabs.profilePager);
const profilePagination = source.profilePagination;
const profilePageNames = ["歌曲统计", "音符统计", "MV"] as const;
const profileMvHeader = new OriginalPrefabModel(prefabs.profileMvHeader, {
  nodes: { 300: { x: 0 } },
  components: { 957: { mText: "MV" }, 964: { mText: "更改" } },
});

function SongProfilePageArrow({ direction, visible, onClick }: {
  direction: -1 | 1; visible: boolean; onClick(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const buttonId = direction === 1 ? 718 : 720;
  const tween = profilePager.components.get(direction === 1 ? 690 : 742)!;
  const node = profilePager.nodes.get(tween.node)!;
  const model = new OriginalPrefabModel({ ...prefabs.profilePager,
    components: prefabs.profilePager.components.filter(component => profilePager.isWithin(component.node, node.id)),
  });
  useLayoutEffect(() => {
    if (!visible) return;
    const data = tween.data;
    const keys = data.animationCurve.m_Curve as { time: number; value: number; inSlope: number; outSlope: number }[];
    // A Hermite segment is a cubic Bezier with linear time control points.
    // Keep the authored curve and PingPong direction rather than a generic CSS ease.
    const frames = keys.map((key, index) => {
      const next = keys[index + 1];
      const dt = next ? next.time - key.time : 0, dv = next ? next.value - key.value : 0;
      const x = data.from.x + (data.to.x - data.from.x) * key.value - node.position.x;
      const y = data.from.y + (data.to.y - data.from.y) * key.value - node.position.y;
      return { offset: key.time, transform: `translate(${x}px,${-y}px)`,
        easing: next && dv !== 0
          ? `cubic-bezier(${1 / 3},${key.outSlope * dt / (3 * dv)},${2 / 3},${1 - next.inSlope * dt / (3 * dv)})`
          : "linear" };
    });
    const animation = host.current!.animate(frames, {
      duration: data.duration * 1000, iterations: Infinity, direction: "alternate",
    });
    return () => animation.cancel();
  }, [visible, tween, node]);
  return <div ref={host} className="original-prefab-origin" hidden={!visible}>
    <OriginalPrefabView model={model} bindings={{ buttons: {
      [buttonId]: { label: direction === 1 ? "下一页" : "上一页", action: onClick },
    } }} />
  </div>;
}

/** ProfilePageController: slide only the clipped contents, leaving arrows and page icons fixed. */
function SongProfilePages({ duration, bpm, count, mv, onChangeMv, noteStatistics, expanded, onExpandedChange }: {
  duration: string; bpm: string; count: number; mv: string | null; onChangeMv(): void; noteStatistics: NoteStatisticsContent;
  expanded: boolean; onExpandedChange(value: boolean): void;
}) {
  const [pagination] = useState(() => new OriginalProfilePagination(3, profilePagination.pageWidth));
  const [, render] = useState(0);
  const turn = pagination.motion;
  const page = pagination.index;
  const track = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const changePage = (direction: -1 | 1) => {
    if (expanded) return;
    if (!pagination.turn(direction)) return;
    video.current?.pause();
    render(value => value + 1);
  };
  useLayoutEffect(() => {
    if (!turn) return;
    // DOLocalMoveX's default OutQuad easing; the completion releases the input lock.
    const animation = track.current!.animate([
      { transform: `translateX(${turn.from}px)` },
      { transform: `translateX(${turn.to}px)` },
    ], { duration: profilePagination.durationSeconds * 1000,
      easing: "cubic-bezier(0.3333333333,0.6666666667,0.6666666667,1)", fill: "forwards" });
    animation.onfinish = () => {
      pagination.complete();
      render(value => value + 1);
    };
    return () => animation.cancel();
  }, [turn, pagination]);
  const grid = profilePager.components.get(729)!;
  const icons = profilePager.transform(grid.node);
  const selected = page;
  const header = profileMvHeader.rect(profileMvHeader.components.get(954)!);
  const previewTop = header.y + header.height + 16;
  const previewHeight = -icons.y - 24 - previewTop;
  return <>
    <SongProfilePageMask>
      <div ref={track} className="original-prefab-origin" data-profile-root-x={pagination.rootX}
        style={{ left: -maskLeft, top: -maskTop, transform: `translateX(${pagination.rootX}px)` }}>
        {[0, 1, 2].map(index => {
          const visible = index === page || index === turn?.previousIndex;
          // Keep both page consumers mounted; the authored mask clips off-screen pages.
          const x = pagination.pageX[index];
          return <OriginalPageVisible.Provider key={index} value={visible}>
          <div className="original-prefab-origin" data-song-profile-page={index}
            inert={turn !== null || index !== page} aria-label={profilePageNames[index]}
            style={{ left: x, pointerEvents: turn === null && index === page ? "auto" : "none" }}>
            {index === 0 ? <SongDetailStats duration={duration} bpm={bpm} count={count} /> : index === 1 ? noteStatistics(expanded, onExpandedChange) : <>
              <OriginalPrefabView model={profileMvHeader} bindings={{ buttons: {
                839: { label: "更改 MV", action: onChangeMv },
              } }} />
              {mv && <video ref={video} src={mv} controls preload="metadata" playsInline
                aria-label="MV 预览" style={{ position: "absolute", left: header.x, top: previewTop,
                  width: bottomBackground.width - (header.x - bottomBackground.x) * 2,
                  height: previewHeight, objectFit: "contain" }} />}
            </>}
          </div></OriginalPageVisible.Provider>;
        })}
      </div>
    </SongProfilePageMask>
    <div className="original-prefab-origin" style={{ left: -profileBounds.x, top: -profileBounds.y, zIndex: 2 }}>
      <SongProfilePageArrow direction={-1} visible={!expanded} onClick={() => changePage(-1)} />
      <SongProfilePageArrow direction={1} visible={!expanded} onClick={() => changePage(1)} />
      <div role="status" aria-label={`${profilePageNames[selected]}，第 ${selected + 1} 页，共 3 页`}
        style={{ position: "absolute", left: icons.x, top: -icons.y, pointerEvents: "none" }}>
        {[0, 1, 2].map(index => <OriginalSprite key={index}
          sprite={index === selected ? profilePagination.activeIcon : profilePagination.inactiveIcon} scale={icons.scaleX}
          style={{ position: "absolute", left: ((index - 1) * profilePagination.iconCellWidth - 8) * icons.scaleX,
            top: -8 * icons.scaleY, width: 16 * icons.scaleX, height: 16 * icons.scaleY }} />)}
      </div>
    </div>
  </>;
}

/** Fit an intact source component into its slot, without independently resizing its widgets. */
function SourcePiece({ model, bindings, fitSlot = false, boundsModel = model }: { model: OriginalPrefabModel; bindings?: OriginalViewBindings; fitSlot?: boolean; boundsModel?: OriginalPrefabModel }) {
  const rects = [...boundsModel.components.values()].filter(c => boundsModel.isActive(c.node)
    && ["UISprite", "UILabel", "UITexture"].includes(c.kind)).map(c => model.rect(c));
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  const width = Math.max(...rects.map(r => r.x + r.width)) - x;
  const height = Math.max(...rects.map(r => r.y + r.height)) - y;
  return <UiFitSurface width={width} height={height} fillSlot={fitSlot}>
    <div className="original-prefab-origin" style={{ left: -x, top: -y }}>
      <OriginalPrefabView model={model} bindings={bindings} />
    </div>
  </UiFitSurface>;
}

export function SongJacket({ source: url, charter, difficulty, isFullLength = false, onChangeCover }: {
  source: string | null; charter: string; difficulty: ChartMetadata["difficulty"]; isFullLength?: boolean; onChangeCover(): void;
}) {
  const original = new OriginalPrefabModel(prefabs.jacket);
  const caption = original.components.get(264)!;
  const value = original.components.get(270)!;
  const badge = original.components.get(373)!;
  // Keep MusicHighScoreRating's caption / sliced badge / value structure.
  // Transfer the unused caption width to the name, preserving the source gap,
  // badge right edge, value insets and all vertical coordinates.
  const captionWidth = caption.data.mFontSize * 2; // 谱师
  const transferredWidth = caption.data.mWidth - captionWidth;
  const model = new OriginalPrefabModel(prefabs.jacket, { nodes: {
    98: { active: isFullLength }, 53: { active: true },
    [value.node]: { x: original.nodes.get(value.node)!.position.x - transferredWidth / 2 },
    [badge.node]: { x: original.nodes.get(badge.node)!.position.x - transferredWidth / 2 },
  }, components: {
    264: { mText: "谱师", mEncoding: false, mWidth: captionWidth },
    270: { mText: charter.trim() || "未设置", mEncoding: false, mWidth: value.data.mWidth + transferredWidth },
    373: { mWidth: badge.data.mWidth + transferredWidth },
    293: { mSpriteName: `bg_jacket_frame_rank_1_${difficulty.toLowerCase()}` },
    // The source's separate FULL atlas contains the same exact Common sprite.
    369: { mAtlas: { m_FileID: 2, m_PathID: 1883 } },
  } });
  const boundsModel = new OriginalPrefabModel(prefabs.jacket, { nodes: {
    98: { active: false }, 53: { active: false }, 43: { active: false },
  } });
  return <SourcePiece model={model} boundsModel={boundsModel} fitSlot bindings={{
    horizontalScrollLabels: new Set([270]),
    buttons: { 312: { label: "更换封面", action: onChangeCover } }, textures: { 279: url
    ? <img className="original-prefab-texture song-jacket-image" src={url} alt="歌曲封面" />
    : <span className="song-jacket-empty">未设置封面</span> } }} />;
}

export function SongDetailStats({ bpm, duration, count }: { bpm: string; duration: string; count: number }) {
  // Page2 is the selected page here, so remove only its off-screen paging offset.
  const mounts = new OriginalPrefabModel(prefabs.profileStatsMounts, { nodes: { 22: { x: 0 } } });
  const row = new OriginalPrefabModel(prefabs.profileStatsRow);
  const caption = row.rect(row.components.get(94)!);
  const value = row.components.get(82)!;
  const valueNode = row.nodes.get(value.node)!;
  const valuePosition = row.transform(value.node);
  return <>{([
    [191, "时长", duration], [238, "BPM", bpm], [165, "音符数", String(count)],
  ] as const).map(([id, title, text]) => {
    const mount = mounts.transform(id);
    // This editor has one chart value, not five per-difficulty account counts.
    // Use the first content line after the caption; no empty difficulty-label row.
    const model = new OriginalPrefabModel(prefabs.profileStatsRow, {
      nodes: { [value.node]: { x: valueNode.position.x + caption.x - valuePosition.x, y: 0 } },
      components: { 94: { mText: title }, 82: { mText: text, mWidth: caption.width, mPivot: 3, mAlignment: 1 } },
    });
    return <div key={id} className="original-prefab-origin" data-profile-statistic={title}
      style={{ left: mount.x, top: -mount.y }}>
      <OriginalPrefabView model={model} />
    </div>;
  })}</>;
}
