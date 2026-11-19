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
/** The difficulty buttons under the jacket; without `onChange` they only show the difficulty. */
export function SongDifficultySelect({ value, level, onChange }: {
  value: ChartMetadata["difficulty"]; level: ChartMetadata["difficultyLevel"]; onChange?(value: ChartMetadata["difficulty"]): void;
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
    <OriginalDifficultySelect value={value} onChange={difficulty => onChange?.(difficulty)} readOnly={!onChange}
      layout={difficultyLayout}>
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
/** How far the lower pages' arrows reach out past the panel's sides (the next arrow's, the farther). */
export const SONG_PROFILE_ARROW_REACH = (() => {
  const pager = new OriginalPrefabModel(prefabs.profilePager);
  const next = pager.rect(pager.components.get(691)!), prev = pager.rect(pager.components.get(650)!);
  return Math.max(next.x + next.width - (bottomBackground.x + bottomBackground.width), bottomBackground.x - prev.x);
})();
export const SONG_INFORMATION_CONTENT_BOUNDS = {
  x: profileLeftBase.x, y: profileBounds.y,
  width: profileBounds.x + profileBounds.width - profileLeftBase.x, height: profileBounds.height,
  columnGap: profileBounds.x - (profileLeftBase.x + profileLeftBase.width),
};
const softnessX = profileMask.mClipSoftness.x, softnessY = profileMask.mClipSoftness.y;
// SoftClip takes the minimum of the horizontal/vertical edge factors. Darken
// combines two opaque grayscale ramps before converting luminance to alpha.
const profileMaskImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${maskWidth}" height="${maskHeight}" viewBox="0 0 ${maskWidth} ${maskHeight}" preserveAspectRatio="none">
<defs><linearGradient id="x"><stop stop-color="black"/><stop offset="${softnessX / maskWidth}" stop-color="white"/><stop offset="${1 - softnessX / maskWidth}" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
<linearGradient id="y" x2="0" y2="1"><stop stop-color="black"/><stop offset="${softnessY / maskHeight}" stop-color="white"/><stop offset="${1 - softnessY / maskHeight}" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
<mask id="clip" maskUnits="userSpaceOnUse" x="0" y="0" width="${maskWidth}" height="${maskHeight}" style="mask-type:luminance"><g style="isolation:isolate"><rect width="100%" height="100%" fill="url(#x)"/><rect width="100%" height="100%" fill="url(#y)" style="mix-blend-mode:darken"/></g></mask></defs>
<rect width="100%" height="100%" fill="white" mask="url(#clip)"/></svg>`)}")`;

/** A lower page's fit to its panel: how much narrower than the source's it is (profile px), how far down its
 * content may reach (page coordinates: above the page icons), and the panel's expansion (as the note statistics'). */
export type SongProfilePageLayout = { shrink: number; bottom: number; expanded: boolean; onExpandedChange(value: boolean): void;
  fit?: { shrink: number; bottomShift: number } };
/** The page mask's rect in the profile's box (left, top, width, height). */
type ProfileRect = { x: number; y: number; width: number; height: number };
const PROFILE_MASK_RECT: ProfileRect = { x: maskLeft - profileBounds.x, y: maskTop - profileBounds.y, width: maskWidth, height: maskHeight };

/** Only Pages descendants belong in this clip; BackgroundTop and Pages/bg do not. */
export function SongProfilePageMask({ children, rect = PROFILE_MASK_RECT }: { children: ReactNode; rect?: ProfileRect }) {
  return <div className="song-profile-page-mask" data-original-panel="745" style={{
    width: rect.width, height: rect.height, overflow: "clip", maskImage: profileMaskImage,
    left: rect.x, top: rect.y,
    maskSize: "100% 100%", maskRepeat: "no-repeat",
  }}>{children}</div>;
}

/** CN profile rank button; the editor replaces account rewards with chart-level editing. */
/** The level badge; without `onChange` it is not a button. */
function SongProfileLevel({ level, onChange }: { level: string; onChange?(value: string): void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(Number(normalizeDifficultyLevel(level)));
  const apply = () => { onChange?.(normalizeDifficultyLevel(draft)); setOpen(false); };
  const model = new OriginalPrefabModel(prefabs.profileRank, { components: {
    775: { mText: level, mEncoding: false },
    780: { mText: source.wording.myProfile_contentCaption_rank },
  } });
  return <>
    <OriginalPrefabView model={model} bindings={onChange ? { buttons: {
      846: { label: `谱面等级 ${level}`, action: () => { setDraft(Number(normalizeDifficultyLevel(level))); setOpen(true); } },
    } } : { omit: new Set([846]) }} />
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

type NoteStatisticsContent = (expanded: boolean, onChange: (expanded: boolean) => void,
  fit?: { shrink: number; bottomShift: number }) => ReactNode;

export function SongProfileInformation({ title, artist, duration, bpm, count, cover, level, difficulty, hasSpecialNotes, hasMv, mv, onChangeMv, illustBackground, onChangeIllustBackground, onRemoveIllustBackground, noteStatistics, isFullLength, onFullLengthChange, onLevelChange, onTitleChange, onArtistChange }: {
  title: string; artist: string; duration: string; bpm: string; count: number; cover: string | null; onTitleChange?(value: string): void;
  level: string; difficulty: ChartMetadata["difficulty"]; onLevelChange?(value: string): void;
  hasSpecialNotes: boolean; hasMv: boolean;
  mv: string | null; onChangeMv?(): void; noteStatistics: NoteStatisticsContent;
  illustBackground: string | null; onChangeIllustBackground?(): void; onRemoveIllustBackground?(): void;
  onArtistChange?(value: string): void;
  isFullLength: boolean; onFullLengthChange?(value: boolean): void;
}) {
  // Without the change handlers the profile only shows the song (the song information page); with them it edits it.
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
      {onFullLengthChange && <SongProfileSettings isFullLength={isFullLength} onChange={onFullLengthChange} />}
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
          aria-label="歌曲名" placeholder="未命名歌曲" value={title} readOnly={!onTitleChange}
          onChange={event => onTitleChange?.(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
      </div>
      <div className="song-profile-artist" style={{ position: "absolute", left: artistRect.x, top: artistRect.y,
        width: artistRect.width, height: artistRect.height, zIndex: model.components.get(676)!.data.mDepth }}>
        <OriginalFormInput source={{ model, background: 676, label: 725, marker: 706, input: 680 }}
          aria-label="艺术家" placeholder="未设置艺术家" value={artist} readOnly={!onArtistChange}
          onChange={event => onArtistChange?.(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
      </div>
    </div>
    <SongProfilePages duration={duration} bpm={bpm} count={count} mv={mv} onChangeMv={onChangeMv}
      illustBackground={illustBackground} onChangeIllustBackground={onChangeIllustBackground}
      onRemoveIllustBackground={onRemoveIllustBackground}
      noteStatistics={noteStatistics} expanded={expanded} onExpandedChange={setExpanded} />
  </div>;
}

const profilePager = new OriginalPrefabModel(prefabs.profilePager);
const profilePagination = source.profilePagination;
const profilePageNames = ["歌曲统计", "音符统计", "MV"] as const;
/** A page of 编辑信息's lower panel after the two statistics pages. */
export type SongProfileEditPage = { name: string; render(layout: SongProfilePageLayout): ReactNode };
const profileMvHeader = new OriginalPrefabModel(prefabs.profileMvHeader, {
  nodes: { 300: { x: 0 } },
  components: { 957: { mText: "MV" }, 964: { mText: "更改" } },
});
// Not in the original page: the custom background (shown by the simulator as
// the Light mode card background) reuses the MV header below the MV preview.
const profileIllustBackgroundHeader = new OriginalPrefabModel(prefabs.profileMvHeader, {
  nodes: { 300: { x: 0 } },
  components: { 957: { mText: "自定义背景" }, 964: { mText: "更改" } },
});
/** A page header `shrink` narrower (profile px): its bar shortened and its button moved in by that much. */
function narrowedHeader(header: OriginalPrefabModel, shrink: number): OriginalPrefabModel {
  const bar = header.components.get(954)!;
  const button = header.components.get(839)!;
  const buttonNode = header.nodes.get(button.node)!;
  const barScale = Math.abs(header.transform(bar.node).scaleX);
  const parentScale = Math.abs(header.transform(buttonNode.parent ?? buttonNode.id).scaleX) || 1;
  return new OriginalPrefabModel(header.prefab, {
    nodes: { ...header.overrides.nodes, [buttonNode.id]: { ...header.overrides.nodes?.[buttonNode.id],
      x: buttonNode.position.x - shrink / parentScale } },
    components: { ...header.overrides.components, 954: { mWidth: bar.data.mWidth - shrink / barScale } },
  });
}
/** The headers on the read-only page: without their 更改 button. */
const profileMvHeaderButton = profileMvHeader.components.get(839)!.node;
const profileMvHeaderReadOnly = new OriginalPrefabModel(prefabs.profileMvHeader, {
  nodes: { 300: { x: 0 }, [profileMvHeaderButton]: { active: false } },
  components: { 957: { mText: "MV" } },
});
const profileIllustBackgroundHeaderReadOnly = new OriginalPrefabModel(prefabs.profileMvHeader, {
  nodes: { 300: { x: 0 }, [profileMvHeaderButton]: { active: false } },
  components: { 957: { mText: "自定义背景" } },
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
/**
 * ProfilePageController: slide only the clipped contents, leaving arrows and page icons fixed. `frame` puts the pages
 * in another panel rect (the profile's box; 编辑信息's): the contents keep their size and their left edge, their bars
 * narrowed to the panel (the note statistics fitted to it); the arrows stay at the panel's sides as far out as
 * the source's, its page icons at its bottom.
 */
function SongProfilePages({ duration, bpm, count, mv, onChangeMv, illustBackground, onChangeIllustBackground,
  onRemoveIllustBackground, noteStatistics, expanded, onExpandedChange, frame, editPages, noStatistics = false }: {
  duration: string; bpm: string; count: number; mv: string | null; onChangeMv?(): void; noteStatistics: NoteStatisticsContent;
  illustBackground: string | null; onChangeIllustBackground?(): void; onRemoveIllustBackground?(): void;
  expanded: boolean; onExpandedChange(value: boolean): void; frame?: ProfileRect;
  /** An audio page before the MV page (编辑信息), given the page header's box and the content's box under it. */
  /** Pages in place of the source's MV page (the audio, MV and background pages). */
  editPages?: readonly SongProfileEditPage[];
  /** Without the two statistics pages (编辑信息: only `editPages`). */
  noStatistics?: boolean;
}) {
  const statisticsPages = noStatistics && editPages ? 0 : 2;
  const pageNames: readonly string[] = editPages
    ? [...profilePageNames.slice(0, statisticsPages), ...editPages.map(page => page.name)] : profilePageNames;
  // The source panel (Pages/bg, grown upward when expanded) in the profile's box, and how the frame moves it.
  const source = { x: bottomBackground.x - profileBounds.x, y: bottomBackground.y - profileBounds.y - (expanded ? 215 : 0),
    width: bottomBackground.width, height: bottomBackground.height + (expanded ? 215 : 0) };
  const shrink = frame ? source.width - frame.width : 0;
  const dx = frame ? frame.x - source.x : 0, dy = frame ? frame.y - source.y : 0;
  const bottomShift = frame ? frame.height - source.height : 0;
  const [pagination] = useState(() => new OriginalProfilePagination(pageNames.length, profilePagination.pageWidth));
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
  // The MV and the custom background share the page: header, preview, header, preview.
  const contentBottom = -icons.y + bottomShift - 24;
  const previewHeight = (contentBottom - previewTop - 32 - header.height) / 2;
  const backgroundHeaderTop = previewTop + previewHeight + 16;
  const backgroundPreviewTop = backgroundHeaderTop + header.height + 16;
  const previewWidth = bottomBackground.width - (header.x - bottomBackground.x) * 2 - shrink;
  const mask = frame ?? PROFILE_MASK_RECT;
  const mvHeaders = shrink ? { mv: narrowedHeader(onChangeMv ? profileMvHeader : profileMvHeaderReadOnly, shrink),
    background: narrowedHeader(onChangeIllustBackground ? profileIllustBackgroundHeader : profileIllustBackgroundHeaderReadOnly, shrink) }
    : { mv: onChangeMv ? profileMvHeader : profileMvHeaderReadOnly,
      background: onChangeIllustBackground ? profileIllustBackgroundHeader : profileIllustBackgroundHeaderReadOnly };
  return <>
    <SongProfilePageMask rect={mask}>
      <div ref={track} className="original-prefab-origin" data-profile-root-x={pagination.rootX}
        style={{ left: -profileBounds.x + dx - mask.x, top: -profileBounds.y + dy - mask.y,
          transform: `translateX(${pagination.rootX}px)` }}>
        {pageNames.map((name, index) => {
          const visible = index === page || index === turn?.previousIndex;
          // Keep both page consumers mounted; the authored mask clips off-screen pages.
          const x = pagination.pageX[index];
          return <OriginalPageVisible.Provider key={index} value={visible}>
          <div className="original-prefab-origin" data-song-profile-page={index}
            inert={turn !== null || index !== page} aria-label={name}
            style={{ left: x, pointerEvents: turn === null && index === page ? "auto" : "none" }}>
            {index < statisticsPages && index === 0 ? <SongDetailStats duration={duration} bpm={bpm} count={count} shrink={shrink} />
              : index < statisticsPages ? noteStatistics(expanded, onExpandedChange, frame ? { shrink, bottomShift } : undefined)
              : editPages ? editPages[index - statisticsPages]!.render({ shrink, bottom: contentBottom, expanded, onExpandedChange,
                fit: frame ? { shrink, bottomShift } : undefined })
              : <>
              <OriginalPrefabView model={mvHeaders.mv} bindings={{ buttons: {
                839: { label: "更改 MV", action: onChangeMv },
              } }} />
              {mv && <video ref={video} src={mv} controls preload="metadata" playsInline
                aria-label="MV 预览" style={{ position: "absolute", left: header.x, top: previewTop,
                  width: previewWidth, height: previewHeight, objectFit: "contain" }} />}
              <div className="original-prefab-origin" style={{ top: backgroundHeaderTop - header.y }}>
                <OriginalPrefabView model={mvHeaders.background} bindings={{ buttons: {
                  839: { label: "更改自定义背景", action: onChangeIllustBackground },
                } }} />
              </div>
              {illustBackground && <>
                <img src={illustBackground} alt="自定义背景预览" style={{ position: "absolute", left: header.x,
                  top: backgroundPreviewTop, width: previewWidth, height: previewHeight, objectFit: "contain" }} />
                <div style={{ position: "absolute", left: header.x, top: backgroundPreviewTop + previewHeight,
                  width: previewWidth, display: "flex", justifyContent: "flex-end", transform: "translateY(-100%)" }}>
                  {onRemoveIllustBackground && <OriginalFormButton size="small" onClick={onRemoveIllustBackground}>移除</OriginalFormButton>}
                </div>
              </>}
            </>}
          </div></OriginalPageVisible.Provider>;
        })}
      </div>
    </SongProfilePageMask>
    <div className="original-prefab-origin" style={{ left: -profileBounds.x, top: -profileBounds.y, zIndex: 2 }}>
      <div className="original-prefab-origin" style={{ left: dx, top: dy + bottomShift / 2 }}>
        <SongProfilePageArrow direction={-1} visible={!expanded} onClick={() => changePage(-1)} />
      </div>
      <div className="original-prefab-origin" style={{ left: dx - shrink, top: dy + bottomShift / 2 }}>
        <SongProfilePageArrow direction={1} visible={!expanded} onClick={() => changePage(1)} />
      </div>
      <div role="status" aria-label={`${pageNames[selected]}，第 ${selected + 1} 页，共 ${pageNames.length} 页`}
        style={{ position: "absolute", left: icons.x + dx - shrink / 2, top: -icons.y + dy + bottomShift, pointerEvents: "none" }}>
        {pageNames.map((_, index) => <OriginalSprite key={index}
          sprite={index === selected ? profilePagination.activeIcon : profilePagination.inactiveIcon} scale={icons.scaleX}
          style={{ position: "absolute", left: ((index - (pageNames.length - 1) / 2) * profilePagination.iconCellWidth - 8) * icons.scaleX,
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

/** What SongJacket fits into its slot: the jacket, and its 更换封面 button (reaching past the jacket's top left) when
 * it has one. */
function songJacketBoundsModel(withChangeButton: boolean) {
  return new OriginalPrefabModel(prefabs.jacket, { nodes: {
    98: { active: false }, 53: { active: withChangeButton }, 43: { active: false },
  } });
}
/** The jacket; without `onChangeCover` it has no 更换封面 button. */
export function SongJacket({ source: url, charter, difficulty, isFullLength = false, onChangeCover }: {
  source: string | null; charter: string; difficulty: ChartMetadata["difficulty"]; isFullLength?: boolean; onChangeCover?(): void;
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
    98: { active: isFullLength }, 53: { active: !!onChangeCover },
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
  const boundsModel = songJacketBoundsModel(!!onChangeCover);
  return <SourcePiece model={model} boundsModel={boundsModel} fitSlot bindings={{
    horizontalScrollLabels: new Set([270]),
    buttons: { 312: { label: "更换封面", action: onChangeCover } }, textures: { 279: url
    ? <img className="original-prefab-texture song-jacket-image" src={url} alt="歌曲封面" />
    : <span className="song-jacket-empty">未设置封面</span> } }} />;
}

// The statistics page's rows (UserProfileClearedMusicCountView at its mounts): a caption bar, the value line under it.
// Page2 is the selected page here, so remove only its off-screen paging offset.
const statsMounts = new OriginalPrefabModel(prefabs.profileStatsMounts, { nodes: { 22: { x: 0 } } });
const statsRow = new OriginalPrefabModel(prefabs.profileStatsRow);
const statsCaption = statsRow.rect(statsRow.components.get(94)!);
const statsBar = statsRow.components.get(95)!;
const statsBarScale = Math.abs(statsRow.transform(statsBar.node).scaleX);
const statsCaptionScale = Math.abs(statsRow.transform(statsRow.components.get(94)!.node).scaleX);
const statsValue = statsRow.components.get(82)!;
const statsValueNode = statsRow.nodes.get(statsValue.node)!;
const statsValuePosition = statsRow.transform(statsValue.node);
const STATS_MOUNTS = [191, 238, 165] as const;
/** The value line's text: its size and colour. */
export const STATS_VALUE_TEXT = { fontSize: statsValue.data.mFontSize as number,
  color: `rgba(${statsValue.data.mColor.r * 255},${statsValue.data.mColor.g * 255},${statsValue.data.mColor.b * 255},${statsValue.data.mColor.a})` };

/** A statistics row: its caption bar titled `title`, `text` on the value line (the first content line after the
 * caption: this editor has one chart value, not five per-difficulty account counts). */
function statsRowModel(title: string, text: string, shrink: number) {
  return new OriginalPrefabModel(prefabs.profileStatsRow, {
    nodes: { [statsValue.node]: { x: statsValueNode.position.x + statsCaption.x - statsValuePosition.x, y: 0 } },
    components: { 94: { mText: title, mWidth: statsRow.components.get(94)!.data.mWidth - shrink / statsCaptionScale },
      95: { mWidth: statsBar.data.mWidth - shrink / statsBarScale },
      82: { mText: text, mWidth: statsCaption.width - shrink, mPivot: 3, mAlignment: 1 } },
  });
}

/**
 * The statistics rows' lines in a page's coordinates: the caption text's left edge (the bar's inset) and as far in
 * from the bar's right end, and each row's caption bar centre and value line centre.
 */
export function statsRowLines(shrink: number) {
  const model = statsRowModel("", "", shrink);
  const bar = model.rect(model.components.get(95)!), value = model.rect(model.components.get(82)!);
  const inset = statsCaption.x - bar.x;
  return {
    left: statsMounts.transform(191).x + statsCaption.x,
    right: statsMounts.transform(191).x + bar.x + bar.width - inset,
    /** The first row's caption bar's top and bottom edges. */
    barTop: -statsMounts.transform(191).y + bar.y,
    barBottom: -statsMounts.transform(191).y + bar.y + bar.height,
    rows: STATS_MOUNTS.map(id => {
      const mount = statsMounts.transform(id);
      return { bar: -mount.y + bar.y + bar.height / 2, value: -mount.y + value.y + value.height / 2 };
    }),
  };
}

/** The statistics rows; `shrink` narrows their caption bars by that much (profile px), their left edges kept. */
export function SongDetailStats({ bpm, duration, count, shrink = 0 }: { bpm: string; duration: string; count: number; shrink?: number }) {
  return <>{([[191, "时长", duration], [238, "BPM", bpm], [165, "音符数", String(count)]] as const).map(([id, title, text]) => {
    const mount = statsMounts.transform(id);
    return <div key={id} className="original-prefab-origin" data-profile-statistic={title}
      style={{ left: mount.x, top: -mount.y }}>
      <OriginalPrefabView model={statsRowModel(title, text, shrink)} />
    </div>;
  })}</>;
}

/** A statistics row's caption bar alone (编辑信息's audio and media pages): across as the rows are, at the first
 * row or with its bar's top at `top` (page coordinates). */
export function SongStatsCaption({ title, shrink, top }: { title: string; shrink: number; top?: number }) {
  const mount = statsMounts.transform(STATS_MOUNTS[0]);
  const model = statsRowModel(title, "", shrink);
  const bar = model.rect(model.components.get(95)!);
  return <div className="original-prefab-origin" style={{ left: mount.x, top: top === undefined ? -mount.y : top - bar.y }}>
    <OriginalPrefabView model={model} />
  </div>;
}

// ---- 编辑信息 ----------------------------------------------------------------------------------------------------

/** What SongJacketPicker fits into its slot: the square frame and the difficulty frame behind it. */
function songJacketPickerBounds() {
  const squareHeight = new OriginalPrefabModel(prefabs.jacket).components.get(313)!.data.mWidth as number;
  return new OriginalPrefabModel(prefabs.jacket, { nodes: { 98: { active: false }, 53: { active: false },
    43: { active: false } }, components: { 313: { mHeight: squareHeight } } });
}
/** Width / height of SongJacketPicker's drawing. */
export const SONG_JACKET_PICKER_ASPECT = (() => {
  const model = songJacketPickerBounds();
  const rects = [...model.components.values()].filter(c => model.isActive(c.node)
    && ["UISprite", "UILabel", "UITexture"].includes(c.kind)).map(c => model.rect(c));
  return (Math.max(...rects.map(r => r.x + r.width)) - Math.min(...rects.map(r => r.x)))
    / (Math.max(...rects.map(r => r.y + r.height)) - Math.min(...rects.map(r => r.y)));
})();

/** The jacket on 编辑信息: the cover in a square frame (no score row under it), the whole cover pressed to choose
 * another; without one, a blank cover asks for it. */
export function SongJacketPicker({ source: url, difficulty, isFullLength, onPick }: {
  source: string | null; difficulty: ChartMetadata["difficulty"]; isFullLength: boolean;
  /** Without it the cover is only shown (歌曲信息), "无" when there is none. */
  onPick?(): void;
}) {
  const original = new OriginalPrefabModel(prefabs.jacket);
  const frame = original.components.get(313)!;
  const image = original.components.get(279)!;
  // The frame's top stays 4 above the image; its bottom is as far below it.
  const squareHeight = frame.data.mWidth as number;
  const model = new OriginalPrefabModel(prefabs.jacket, { nodes: {
    98: { active: isFullLength }, 53: { active: false }, 43: { active: false },
  }, components: {
    313: { mHeight: squareHeight },
    293: { mSpriteName: `bg_jacket_frame_rank_1_${difficulty.toLowerCase()}` },
    369: { mAtlas: { m_FileID: 2, m_PathID: 1883 } },
  } });
  const imageRect = model.rect(image);
  // Fitted by the frame alone: the FULL label coming and going does not resize the cover.
  const boundsModel = songJacketPickerBounds();
  const content = url ? <img className="song-jacket-image" src={url} alt="歌曲封面" draggable={false} />
    : <span className="song-jacket-picker-empty">{onPick ? "点击上传封面" : "无"}</span>;
  return <SourcePiece model={model} boundsModel={boundsModel} fitSlot bindings={{ textures: { 279: onPick
    ? <button type="button" className="original-button original-prefab-texture song-jacket-picker"
      aria-label={url ? "更换封面" : "上传封面"} style={{ width: imageRect.width, height: imageRect.height }} onClick={onPick}>
      {content}
    </button>
    : <div className="original-prefab-texture song-jacket-picker" style={{ width: imageRect.width, height: imageRect.height }}>
      {content}
    </div> } }} />;
}

/** A caption of the profile (the 艺术家 one) with another text, its top left at (x, y). */
function ProfileCaption({ text, x, y }: { text: string; x: number; y: number }) {
  const model = new OriginalPrefabModel(prefabs.profileInformation, { components: { 754: { mText: text, mEncoding: false } } });
  const caption = model.components.get(753)!;
  const rect = model.rect(caption);
  return <div className="original-prefab-origin" style={{ left: x - rect.x, top: y - rect.y, zIndex: 10 }}>
    <OriginalPrefabView model={model} root={caption.node} />
  </div>;
}

const editInputs = {
  name: { background: 662, label: 657, marker: 681, input: 696 },
  artist: { background: 676, label: 725, marker: 706, input: 680 },
} as const;
const captionRect = profileInformationModel.rect(profileInformationModel.components.get(753)!);
const inputHeight = profileInformationModel.rect(profileInformationModel.components.get(662)!).height;
const EDIT_PAD_X = 22, EDIT_PAD_Y = 22, EDIT_ROW_GAP = 16, EDIT_BAR_BUTTON_GAP = 8;
/** The profile's artist label (725) from its caption (753): its left edge from the caption's, its centre below. */
const ARTIST_LABEL_FROM_CAPTION = (() => {
  const label = profileInformationModel.rect(profileInformationModel.components.get(editInputs.artist.label)!);
  return { x: label.x - captionRect.x, y: label.y + label.height / 2 - (captionRect.y + captionRect.height / 2) };
})();
/** A profile label (`id` in `model`) showing `text`, `width` wide, its left edge at `left` and centred on `centerY`. */
function ProfileLabel({ id, model: base, text, label, left, centerY, width }: {
  id: number; model: OriginalPrefabModel; text: string; label: string; left: number; centerY: number; width: number;
}) {
  const source = base.components.get(id)!;
  const model = new OriginalPrefabModel(prefabs.profileInformation, { components: {
    [id]: { ...Object.fromEntries(["mFontSize", "mHeight"].map(key => [key, source.data[key]])), mText: text, mEncoding: false,
      mWidth: width } } });
  const component = model.components.get(id)!;
  const rect = model.rect(component);
  return <div className="original-prefab-origin" aria-label={label}
    style={{ left: left - rect.x, top: centerY - rect.y - rect.height / 2, zIndex: 11 }}>
    <OriginalPrefabView model={model} root={component.node} />
  </div>;
}
/*
 * The detail's band name marquee (StarUIMarqueeLabel, CN 10.1.3): a soft clipped panel (softness 4) with the label's
 * left edge 2 in from its left; when the text is wider than the panel less both softnesses it moves left at
 * 100 × speed (1) px/s, linearly, after 1 s, until its right edge reaches the panel's left edge, then restarts from
 * the panel's right edge with no delay, forever. Otherwise it stays put.
 */
const MARQUEE = { softness: 4, inset: 2, height: 50, speed: 100, delay: 1000 };
function ProfileMarqueeLabel({ id, model: base, text, label, left, centerY, width }: {
  id: number; model: OriginalPrefabModel; text: string; label: string; left: number; centerY: number; width: number;
}) {
  const source = base.components.get(id)!;
  // ResizeFreely, as the band name: the label as wide as its text.
  const model = new OriginalPrefabModel(prefabs.profileInformation, { components: {
    [id]: { ...Object.fromEntries(["mFontSize", "mHeight"].map(key => [key, source.data[key]])), mText: text,
      mEncoding: false, mWidth: 4096, mOverflow: 2 } } });
  const component = model.components.get(id)!;
  const rect = model.rect(component);
  // The panel: from 2 left of the label's left edge to the row's right edge.
  const clip = { left: left - MARQUEE.inset, width: width + MARQUEE.inset };
  const track = useRef<HTMLDivElement>(null);
  const [textWidth, setTextWidth] = useState(0);
  useLayoutEffect(() => {
    const content = track.current?.querySelector<HTMLElement>(".original-prefab-label > span");
    if (!content) return;
    const update = () => setTextWidth(content.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text]);
  useLayoutEffect(() => {
    const element = track.current;
    if (!element || textWidth <= clip.width - 2 * MARQUEE.softness) return;
    const end = -textWidth;
    const pass = (from: number, delay: number, iterations: number) => element.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${end}px)` }],
      { duration: (from - end) / MARQUEE.speed * 1000, delay, iterations, easing: "linear", fill: "both" });
    let loop: Animation | null = null;
    const first = pass(MARQUEE.inset, MARQUEE.delay, 1);
    first.onfinish = () => { loop = pass(clip.width, 0, Infinity); first.cancel(); };
    return () => { first.cancel(); loop?.cancel(); };
  }, [textWidth, clip.width]);
  const fade = `linear-gradient(to right, transparent, #000 ${MARQUEE.softness}px, #000 calc(100% - ${MARQUEE.softness}px), transparent)`;
  return <div aria-label={label} style={{ position: "absolute", left: clip.left, top: centerY - MARQUEE.height / 2,
    width: clip.width, height: MARQUEE.height, overflow: "hidden", zIndex: 11, maskImage: fade, WebkitMaskImage: fade }}>
    <div ref={track} style={{ position: "absolute", left: 0, top: 0, transform: `translateX(${MARQUEE.inset}px)` }}>
      <div className="original-prefab-origin" style={{ left: -rect.x, top: MARQUEE.height / 2 - rect.y - rect.height / 2 }}>
        <OriginalPrefabView model={model} root={component.node} />
      </div>
    </div>
  </div>;
}
/** How far the name's field sits above its row's centre. */
const TITLE_FIELD_RAISE = 6;

/**
 * The profile's small button (the MV page's 更改: button_gray 88×48, its 20 label, its hit box 8 wider and 9 taller),
 * `width` wide with its left edge at `x` and its centre at `y`; pink (button_pink, white label) when `on`, as
 * SingleToggleButton switches it.
 */
export function ProfileSmallButton({ text, label, width, x, y, on = false, onClick }: {
  text: string; label: string; width: number; x: number; y: number; on?: boolean; onClick(): void;
}) {
  const source = new OriginalPrefabModel(prefabs.profileMvHeader);
  const sprite = source.components.get(849)!, collider = source.components.get(644)!, caption = source.components.get(964)!;
  const extraHit = collider.data.m_Size.x - sprite.data.mWidth, extraLabel = caption.data.mWidth - sprite.data.mWidth;
  const spriteName = on ? "button_pink" : "button_gray";
  const model = new OriginalPrefabModel(prefabs.profileMvHeader, { components: {
    849: { mSpriteName: spriteName, mWidth: width }, 848: { mSpriteName: spriteName, mWidth: width },
    644: { m_Size: { ...collider.data.m_Size, x: width + extraHit } },
    964: { mText: text, mWidth: width + extraLabel, ...(on ? { mColor: { r: 1, g: 1, b: 1, a: 1 } } : {}) },
  } });
  const rect = model.rect(model.components.get(849)!);
  return <div className="original-prefab-origin" style={{ left: x - rect.x, top: y - rect.height / 2 - rect.y, zIndex: 11 }}>
    <OriginalPrefabView model={model} root={sprite.node} bindings={{ buttons: { 839: { label, action: onClick } } }} />
  </div>;
}
const SMALL_BUTTON_WIDTH = 88;

/**
 * The shop's preview button (SampleMusicPlayButton in musicdetailinformation): two 48×48 sliced buttons shown in
 * turn, buttonPlay (button_gray, icon_play 32×44) while stopped and buttonPause (button_pink, icon_stop 36×36, 1 up)
 * while playing, their icons at 0.5 and untinted; centred at (x, y).
 */
export function SongPreviewButton({ playing, x, y, onClick }: { playing: boolean; x: number; y: number; onClick(): void }) {
  const icon = playing ? { sprite: "icon_stop", width: 36, height: 36, up: 1 } : { sprite: "icon_play", width: 32, height: 44, up: 0 };
  const width = icon.width * PREVIEW_ICON_SCALE, height = icon.height * PREVIEW_ICON_SCALE;
  return <>
    <ProfileSmallButton text="" label={playing ? "停止试听" : "试听"} width={PREVIEW_BUTTON_SIZE} on={playing}
      x={x - PREVIEW_BUTTON_SIZE / 2} y={y} onClick={onClick} />
    <OriginalSprite sprite={icon.sprite} atlas="menu" scale={PREVIEW_ICON_SCALE} spriteType={0} aria-hidden="true"
      style={{ position: "absolute", left: x - width / 2, top: y - icon.up - height / 2, width, height, zIndex: 12,
        pointerEvents: "none" }} />
  </>;
}
const PREVIEW_ICON_SCALE = 0.5;
const PREVIEW_BUTTON_SIZE = 48;

/*
 * The difficulty under the 谱面难度 bar, laid out as the original song detail (musicdetailinformation, shared by the
 * shop's 乐曲详细 and 確定購買): under the 楽曲レベル bar the five difficulties have fixed slots 106 apart, a difficulty
 * label (difficultylabelobject at 0.9) on each and its level (24, #434343, centred) 32 below. The chart has one
 * difficulty: its slot alone is shown.
 */
const DIFFICULTY_SLOT_X: Readonly<Record<ChartMetadata["difficulty"], number>> = {
  EASY: -213, NORMAL: -106, HARD: 0, EXPERT: 106, SPECIAL: 212,
};
/** The slots' container from the bar's left edge (579 − 322) and the slots' centre below the bar's centre (248 − 211). */
const DIFFICULTY_SLOTS_X = 579 - 322, DIFFICULTY_SLOTS_BELOW_BAR = 248 - 211;
const DIFFICULTY_LABEL_SCALE = 0.9, DIFFICULTY_LEVEL_BELOW = 32, DIFFICULTY_LEVEL_FONT = 24;
/** The divider (line_dot, tiled, at 0.5) as the detail's: its centre 22 under the song name's centre. */
const DIVIDER_SCALE = 0.5, DIVIDER_HEIGHT = 6 * DIVIDER_SCALE, DIVIDER_BELOW_TITLE = 22;
/** The detail's song name: a 44 high row of 28 text; its band row's centre 50 under the name's. */
const TITLE_ROW_HEIGHT = 44, TITLE_FONT = 28, ARTIST_BELOW_TITLE = 50;
/** The detail's 楽曲レベル bar: label_round_black 40 high at 0.8, its caption 26 at 16 in from its left (both at 0.8). */
const LEVEL_BAR_SCALE = 0.8, LEVEL_BAR_HEIGHT = 40 * LEVEL_BAR_SCALE, LEVEL_BAR_FONT = 26 * LEVEL_BAR_SCALE,
  LEVEL_BAR_TEXT_LEFT = 16 * LEVEL_BAR_SCALE;
const levelBarAtlas = originalAtlasFor(new OriginalPrefabModel(prefabs.profileMvHeader).components.get(954)!);

/** A difficulty label at 0.9 centred at (x, y), its level under it. */
function SongDifficultySlot({ difficulty, level, x, y }: {
  difficulty: ChartMetadata["difficulty"]; level: string; x: number; y: number;
}) {
  const style = DIFFICULTY_LABEL_STYLE[difficulty];
  const rgba = (value: number) => ({ r: (value >> 16 & 255) / 255, g: (value >> 8 & 255) / 255, b: (value & 255) / 255, a: 1 });
  const model = new OriginalPrefabModel(prefabs.difficultyLabel, {
    nodes: { 2: { x: style.offsetX } },
    components: {
      10: { mColor: rgba(style.background) },
      11: { mText: difficulty, mEffectColor: rgba(style.outline), mSpacingX: style.spacing },
    },
  });
  const badge = model.rect(model.components.get(10)!);
  const width = badge.width * DIFFICULTY_LABEL_SCALE, height = badge.height * DIFFICULTY_LABEL_SCALE;
  return <>
    <div data-profile-difficulty={difficulty} style={{ position: "absolute", left: x - width / 2, top: y - height / 2,
      width, height, zIndex: 11 }}>
      <div className="original-prefab-origin" style={{ left: -badge.x * DIFFICULTY_LABEL_SCALE, top: -badge.y * DIFFICULTY_LABEL_SCALE,
        transform: `scale(${DIFFICULTY_LABEL_SCALE})`, transformOrigin: "0 0" }}>
        <OriginalPrefabView model={model} />
      </div>
    </div>
    <span className="song-difficulty-slot-level" style={{ left: x - 100, top: y + DIFFICULTY_LEVEL_BELOW - 18, width: 200,
      height: 36, fontSize: DIFFICULTY_LEVEL_FONT, lineHeight: "36px" }}>{level}</span>
  </>;
}

/**
 * 编辑信息's profile: the top panel holds the song's name (with the 完整版 toggle) over a divider, its artist, then the
 * chart's difficulty and level under their bar (编辑 opens their dialog), laid out as the original song detail; the
 * panel is as tall as its rows and the lower pages (statistics, MV) take the height left, unscaled, both panels the
 * column's width.
 */
export function SongProfileEditor({ width, title, artist, isFullLength, difficulty, level, onTitleChange, onArtistChange,
  onFullLengthChange, onEditDifficulty, duration, bpm, count, mv, onChangeMv, illustBackground, onChangeIllustBackground,
  onRemoveIllustBackground, noteStatistics, editPages, readOnly = false, noStatistics = false }: {
  /** The column's width: both panels take it. */
  width: number;
  /** 歌曲信息: the same panels showing the song, without their editing (fields read only, no 完整版 or 编辑 button). */
  readOnly?: boolean;
  noStatistics?: boolean;
  title: string; artist: string; isFullLength: boolean; difficulty: ChartMetadata["difficulty"]; level: string;
  onTitleChange(value: string): void; onArtistChange(value: string): void; onFullLengthChange(value: boolean): void;
  onEditDifficulty(): void;
  duration: string; bpm: string; count: number; mv: string | null; onChangeMv(): void;
  illustBackground: string | null; onChangeIllustBackground(): void; onRemoveIllustBackground?(): void;
  noteStatistics: NoteStatisticsContent;
  editPages?: readonly SongProfileEditPage[];
}) {
  const [expanded, setExpanded] = useState(false);
  const inputs = new OriginalPrefabModel(prefabs.profileInformation);
  // The name's field as the detail's name row: 44 high, 28 text.
  const nameInputs = new OriginalPrefabModel(prefabs.profileInformation, { components: {
    662: { mHeight: TITLE_ROW_HEIGHT }, 657: { mFontSize: TITLE_FONT, mHeight: TITLE_ROW_HEIGHT },
  } });
  const inner = width - 2 * EDIT_PAD_X;
  // Rows by their centres, top down (profile px), spaced as the detail's.
  const titleY = EDIT_PAD_Y + TITLE_ROW_HEIGHT / 2;
  const dividerY = titleY + DIVIDER_BELOW_TITLE;
  const artistY = titleY + ARTIST_BELOW_TITLE;
  const barY = artistY + ARTIST_BELOW_TITLE;
  const slotY = barY + DIFFICULTY_SLOTS_BELOW_BAR;
  const topHeight = slotY + DIFFICULTY_LEVEL_BELOW + 18 + EDIT_PAD_Y;
  const toggleWidth = 112;
  // The bar ends where the 编辑 button starts (across, read only).
  const barWidth = readOnly ? inner : inner - SMALL_BUTTON_WIDTH - EDIT_BAR_BUTTON_GAP;
  // BackgroundTop as wide as the column and as tall as its rows, at the column's top left.
  const topModel = new OriginalPrefabModel({ ...prefabs.profileInformation,
    components: prefabs.profileInformation.components.filter(component => component.id === 708),
  }, { components: { 708: { mWidth: width, mHeight: topHeight } } });
  const topRect = topModel.rect(topModel.components.get(708)!);
  // The lower pages' panel (Pages/bg) under it, as wide, down to the column's bottom (the whole column when expanded).
  const gap = bottomBackground.y - (topBackground.y + topBackground.height);
  const lower: ProfileRect = expanded ? { x: 0, y: 0, width, height: profileBounds.height }
    : { x: 0, y: topHeight + gap, width, height: profileBounds.height - topHeight - gap };
  const backgroundModel = new OriginalPrefabModel({ ...prefabs.profileInformation,
    components: prefabs.profileInformation.components.filter(component => component.id === 859),
  }, { components: { 859: { mWidth: lower.width, mHeight: lower.height } } });
  const backgroundRect = backgroundModel.rect(backgroundModel.components.get(859)!);
  const input = (key: keyof typeof editInputs, left: number, centerY: number, inputWidth: number, label: string,
    value: string, onChange: (value: string) => void) => {
    const height = key === "name" ? TITLE_ROW_HEIGHT : inputHeight;
    const model = key === "name" ? nameInputs : inputs;
    if (readOnly) {
      // 歌曲信息: the field's label alone (the original profile's text), its left edge at `left`, centred on `centerY`.
      // The artist scrolls as the detail's band name (StarUIMarqueeLabel) when it is wider than the row.
      return key === "artist"
        ? <ProfileMarqueeLabel id={editInputs[key].label} model={model} text={value} label={label} left={left}
          centerY={centerY} width={inputWidth} />
        : <ProfileLabel id={editInputs[key].label} model={model} text={value} label={label} left={left} centerY={centerY}
          width={inputWidth} />;
    }
    return <div className={`song-profile-${key === "name" ? "name" : "artist"}`} style={{ position: "absolute", left,
      top: centerY - height / 2, width: inputWidth, height, zIndex: 11 }}>
      <OriginalFormInput source={{ model: key === "name" ? nameInputs : inputs, ...editInputs[key] }} aria-label={label}
        readOnly={readOnly}
        value={value} onChange={event => onChange(event.currentTarget.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
    </div>;
  };
  return <div className="song-profile-information" style={{ width, height: profileBounds.height }}>
    <div hidden={expanded}>
      <div className="original-prefab-origin" style={{ left: -topRect.x, top: -topRect.y, zIndex: 0 }}>
        <OriginalPrefabView model={topModel} />
      </div>
      {/* The name's field a little above its row, clear of the divider (the original's name has no field). */}
      {/* Read only, the name is the detail's: on its row's centre, its left edge the divider's. */}
      {input("name", EDIT_PAD_X, readOnly ? titleY : titleY - TITLE_FIELD_RAISE, readOnly ? inner : inner - toggleWidth - EDIT_ROW_GAP, "歌曲名", title,
        onTitleChange)}
      {!readOnly && <ProfileSmallButton text="完整版" label={`完整版：${isFullLength ? "开" : "关"}`} width={toggleWidth} on={isFullLength}
        x={EDIT_PAD_X + inner - toggleWidth} y={titleY - TITLE_FIELD_RAISE} onClick={() => onFullLengthChange(!isFullLength)} />}
      <OriginalSprite sprite="line_dot" atlas="menu" scale={DIVIDER_SCALE} spriteType={2} aria-hidden="true"
        style={{ position: "absolute", left: EDIT_PAD_X, top: dividerY - DIVIDER_HEIGHT / 2, width: inner,
          height: DIVIDER_HEIGHT, zIndex: 12 }} />
      <ProfileCaption text="艺术家" x={EDIT_PAD_X} y={artistY - captionRect.height / 2} />
      {/* Read only, the artist is the profile's: its label beside the caption as the original has it. */}
      {readOnly ? input("artist", EDIT_PAD_X + ARTIST_LABEL_FROM_CAPTION.x, artistY + ARTIST_LABEL_FROM_CAPTION.y,
        inner - ARTIST_LABEL_FROM_CAPTION.x, "艺术家", artist, onArtistChange)
        : input("artist", EDIT_PAD_X + captionRect.width + EDIT_ROW_GAP, artistY,
          inner - captionRect.width - EDIT_ROW_GAP, "艺术家", artist, onArtistChange)}
      <OriginalSprite sprite="label_round_black" atlas={levelBarAtlas} scale={LEVEL_BAR_SCALE} spriteType={1} aria-hidden="true"
        style={{ position: "absolute", left: EDIT_PAD_X, top: barY - LEVEL_BAR_HEIGHT / 2, width: barWidth,
          height: LEVEL_BAR_HEIGHT, zIndex: 10 }} />
      <span className="song-profile-level-bar-caption" style={{ left: EDIT_PAD_X + LEVEL_BAR_TEXT_LEFT,
        top: barY - LEVEL_BAR_HEIGHT / 2, height: LEVEL_BAR_HEIGHT, lineHeight: `${LEVEL_BAR_HEIGHT}px`,
        fontSize: LEVEL_BAR_FONT }}>谱面难度</span>
      {!readOnly && <ProfileSmallButton text="编辑" label="编辑谱面难度" width={SMALL_BUTTON_WIDTH}
        x={EDIT_PAD_X + inner - SMALL_BUTTON_WIDTH} y={barY} onClick={onEditDifficulty} />}
      {/* Every difficulty in the detail's EASY slot. */}
      <SongDifficultySlot difficulty={difficulty} level={level}
        x={EDIT_PAD_X + DIFFICULTY_SLOTS_X + DIFFICULTY_SLOT_X.EASY} y={slotY} />
    </div>
    <div className="original-prefab-origin" style={{ left: lower.x - backgroundRect.x, top: lower.y - backgroundRect.y, zIndex: 0 }}>
      <OriginalPrefabView model={backgroundModel} />
    </div>
    <SongProfilePages duration={duration} bpm={bpm} count={count} mv={mv} onChangeMv={onChangeMv}
      illustBackground={illustBackground} onChangeIllustBackground={onChangeIllustBackground}
      onRemoveIllustBackground={onRemoveIllustBackground}
      noteStatistics={noteStatistics} expanded={expanded} onExpandedChange={setExpanded} frame={lower} editPages={editPages}
      noStatistics={noStatistics} />
  </div>;
}

/** 编辑信息's difficulty dialog: the difficulty and the level, applied by 确定. */
export function SongDifficultyDialog({ open, difficulty, level, onClose, onApply }: {
  open: boolean; difficulty: ChartMetadata["difficulty"]; level: string; onClose(): void;
  onApply(difficulty: ChartMetadata["difficulty"], level: string): void;
}) {
  const [draft, setDraft] = useState({ difficulty, level: Number(normalizeDifficultyLevel(level)) });
  useLayoutEffect(() => {
    if (open) setDraft({ difficulty, level: Number(normalizeDifficultyLevel(level)) });
    // Only on opening: the draft is what is edited until 确定.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return createPortal(<OriginalTransferDialog open={open} title="谱面难度" fitContent onClose={onClose}>
    <div className="transfer-body">
      <div className="transfer-page">
        <OriginalDifficultySelect value={draft.difficulty} onChange={value => setDraft(current => ({ ...current, difficulty: value }))} />
        <OriginalFormStepper title="谱面等级" value={draft.level} minimum={0} maximum={99}
          onChange={value => setDraft(current => ({ ...current, level: value }))} />
      </div>
      <div className="transfer-actions">
        <OriginalFormButton onClick={onClose}>取消</OriginalFormButton>
        <OriginalFormButton tone="pink" onClick={() => { onApply(draft.difficulty, normalizeDifficultyLevel(draft.level)); onClose(); }}>确定</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>, document.body);
}
