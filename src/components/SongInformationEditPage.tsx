import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { formatDuration, type ChartMetadata, type ChartNote, type EditorOptionSettings } from "../chartCore";
import { countSongNoteKinds } from "./songNoteStatistics";
import { SongNoteStatisticsPage, SongProfileScrollPage } from "./SongNoteStatisticsPage";
import type { SlideChain } from "../app/editorHelpers";
import {
  SongDifficultyDialog,
  SongJacketPicker,
  ProfileSmallButton,
  SongPreviewButton,
  SongProfileEditor,
  SongStatsCaption,
  type SongProfilePageLayout,
  statsRowLines,
  STATS_VALUE_TEXT,
  SONG_INFORMATION_CONTENT_BOUNDS,
  SONG_INFORMATION_LEFT_BOUNDS,
  SONG_JACKET_PICKER_ASPECT,
  SONG_PROFILE_ARROW_REACH,
} from "./OriginalSongDetailParts";
import {
  OriginalFormButton,
  OriginalFormInput,
  ORIGINAL_FORM_BUTTON_SPRITE_INSET,
  ORIGINAL_FORM_BUTTON_SPRITE_WIDTH,
  ORIGINAL_FORM_BUTTON_WIDTH,
} from "./OriginalFormParts";

/** The original dialogs' two buttons are 272 apart centre to centre: their layout boxes this far apart, and their
 * visible sprites VISIBLE_GAP. */
const BUTTON_PITCH = 272;
const ACTION_GAP = BUTTON_PITCH - ORIGINAL_FORM_BUTTON_WIDTH;
const VISIBLE_GAP = BUTTON_PITCH - ORIGINAL_FORM_BUTTON_SPRITE_WIDTH;
/** The right column is as wide as its two buttons, centred where the song information page's cover column is. */
const RIGHT_WIDTH = 2 * ORIGINAL_FORM_BUTTON_WIDTH + ACTION_GAP;
/** Between the right arrow's outer edge and the right column. */
const ARROW_MARGIN = 8;
import { UiPageViewport } from "./UiViewport";
import { EditorPlaybackClock } from "./editor/EditorControlColumn";
import "./SongInformationPage.css";

export type SongInformationPageMode = "view" | "edit" | "create";

/** What 编辑信息's 确定 saves: the metadata, and the media chosen there (null background or audio: removed). */
export type SongInformationEdit = {
  metadata: ChartMetadata; cover?: File; mv?: File | null; illustBackground?: File | null; audio?: File | null;
};
/** The song's fields that must not be empty (the simulator and the project files need them). */
const REQUIRED_FIELDS = [["title", "歌曲名"], ["artist", "艺术家"]] as const;
/** Between the delay row's parts, between the two buttons, and between the audio page's lines. */
const AUDIO_ITEM_GAP = 12;
const PREVIEW_BUTTON_SIZE = 48, DELAY_ROW_HEIGHT = 40;
/** Between the preview button and the time HUD: as the original song detail's preview button and the MV icon beside
 * it (812 − 24 − (744 + 48 × 0.75 / 2)). */
const PREVIEW_HUD_GAP = 812 - 24 - (744 + 48 * 0.75 / 2);

/** A chosen file's object URL while it is shown. */
function useFileUrl(file: File | null | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/**
 * 编辑信息: the song information page's layout with its sides swapped, editing a draft of the song: on the left the
 * profile (name, 完整版, artist, difficulty and level; the statistics and MV pages under it), on the right the cover
 * (pressed to choose another) and 取消 / 确定. 确定 saves the draft (onConfirm), 取消 drops it.
 */
export function SongInformationEditPage({ mode, audioDurationSec, noteCount, notes, slideChains, metadata, mediaSources,
  optionSettings, habahiro, onError, onNotice, onConfirm, onLeave, onCancel, onEdit }: {
  /** 歌曲信息 (read only, with the statistics pages; 编辑 / 返回), 编辑信息 or 创建工程 (a draft; 取消 / 确定). */
  mode: SongInformationPageMode;
  audioDurationSec: number;
  noteCount: number;
  notes: readonly ChartNote[];
  slideChains: readonly SlideChain[];
  metadata: ChartMetadata;
  mediaSources: { cover: string | null; mv: string | null; illustBackground: string | null; audio: string | null };
  optionSettings: EditorOptionSettings;
  habahiro: boolean;
  onError(message: string): void;
  /** A notice with only 确定 (a required field left empty on 确定). */
  onNotice(message: string): void;
  /** 确定 (编辑信息, 创建工程): saves the draft; the page leaves when it is saved. */
  onConfirm?(edit: SongInformationEdit): Promise<boolean>;
  /** 返回 (歌曲信息), and after a save. */
  onLeave(): void;
  /** 取消 (编辑信息, 创建工程). */
  onCancel?(): void;
  /** 编辑 (歌曲信息). */
  onEdit?(): void;
}) {
  const readOnly = mode === "view";
  // The draft starts from the song as the page opens (the page is mounted anew each time it opens).
  const [draft, setDraft] = useState(metadata);
  const [cover, setCover] = useState<File>();
  const [mv, setMv] = useState<File | null>();
  const [illustBackground, setIllustBackground] = useState<File | null>();
  const [audio, setAudio] = useState<File | null>();
  const [playing, setPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  // The delay being typed; null shows the draft's.
  const [delayText, setDelayText] = useState<string | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLAudioElement>(null);
  const [difficultyOpen, setDifficultyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const mvInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const coverUrl = useFileUrl(cover), mvUrl = useFileUrl(mv), backgroundUrl = useFileUrl(illustBackground);
  const audioUrl = useFileUrl(audio);
  const shownAudio = audio === null ? null : audioUrl ?? mediaSources.audio;
  // Another audio (or none) stops the preview.
  useEffect(() => { setPlaying(false); }, [shownAudio]);
  useEffect(() => {
    const element = player.current;
    if (!element) return;
    if (playing) { element.currentTime = 0; void element.play().catch(() => setPlaying(false)); } else element.pause();
  }, [playing, shownAudio]);
  const noteCounts = useMemo(() => countSongNoteKinds(notes, slideChains), [notes, slideChains]);
  const patch = (next: Partial<ChartMetadata>) => setDraft(current => ({ ...current, ...next }));
  const choose = (set: (file: File) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) set(file);
  };
  const shownBackground = illustBackground === null ? null : backgroundUrl ?? mediaSources.illustBackground;
  const shownMv = mv === null ? null : mvUrl ?? mediaSources.mv;
  // The delay being typed for the MV; null shows the draft's.
  const [mvDelayText, setMvDelayText] = useState<string | null>(null);
  const confirm = async () => {
    if (saving) return;
    // Required fields: nothing is saved while one is empty; the notice closes back to the page.
    const empty: string[] = REQUIRED_FIELDS.filter(([key]) => draft[key].trim() === "").map(([, name]) => name);
    // A new project needs its song: the live cannot start without one.
    if (mode === "create" && !shownAudio) empty.push("音频");
    if (empty.length > 0) { onNotice(`${empty.join("、")}不能为空。`); return; }
    setSaving(true);
    setPlaying(false);
    const saved = await onConfirm?.({ metadata: draft, cover, mv, illustBackground, audio });
    setSaving(false);
    if (saved) onLeave();
  };
  const content = SONG_INFORMATION_CONTENT_BOUNDS;
  // Content x. The right column (as wide as its two buttons) is centred on the right part of the content (the cover
  // column's width at its right end). The cover, its right arrow's room narrower than the buttons' visible span, is
  // centred under that span; the left column runs from the content's left edge (its left arrow out in the margin) to
  // the arrow's room and the buttons' visible gap short of the cover.
  const coverColumnWidth = SONG_INFORMATION_LEFT_BOUNDS.width;
  const rightLeft = content.width - coverColumnWidth / 2 - RIGHT_WIDTH / 2;
  const arrowRoom = SONG_PROFILE_ARROW_REACH + ARROW_MARGIN;
  const buttonsLeft = rightLeft + ORIGINAL_FORM_BUTTON_SPRITE_INSET;
  const buttonsSpan = RIGHT_WIDTH - 2 * ORIGINAL_FORM_BUTTON_SPRITE_INSET;
  const jacketWidth = buttonsSpan - arrowRoom;
  const jacketLeft = buttonsLeft + (buttonsSpan - jacketWidth) / 2;
  const profileWidth = jacketLeft - arrowRoom - VISIBLE_GAP;
  /**
   * The MV and the custom background pages, as the original's scrolling page (the note statistics'): the caption bar
   * with the expand button over a scroll view. With a medium: its preview (16:9 across the view), the MV's delay, and
   * upload / clear; without, one upload button across. Their lines between the statistics rows' insets.
   */
  const mediaPage = ({ shrink, expanded, onExpandedChange, fit }: SongProfilePageLayout, kind: "mv" | "background") => {
    const title = kind === "mv" ? "MV" : "自定义背景";
    const media = kind === "mv" ? shownMv : shownBackground;
    const lines = statsRowLines(shrink);
    const width = lines.right - lines.left;
    const gap = AUDIO_ITEM_GAP;
    const upload = kind === "mv" ? () => mvInput.current?.click() : () => backgroundInput.current?.click();
    const uploadText = kind === "mv" ? "上传 MV" : "上传背景";
    const heights = !media ? [PREVIEW_BUTTON_SIZE]
      : [width * 9 / 16, ...(kind === "mv" ? [DELAY_ROW_HEIGHT] : []), ...(readOnly ? [] : [PREVIEW_BUTTON_SIZE])];
    const extent = heights.reduce((sum, height) => sum + height + gap, gap);
    return <SongProfileScrollPage title={title} expanded={expanded} onExpandedChange={onExpandedChange} fit={fit}
      contentHeight={extent}>
      {view => {
        let cursor = view.top + gap;
        const rowAt = (height: number) => { const box = { left: lines.left, top: cursor, width, height }; cursor += height + gap; return box; };
        if (!media) {
          const box = rowAt(PREVIEW_BUTTON_SIZE);
          return readOnly ? <div className="song-audio-row" style={{ ...box, justifyContent: "center", ...STATS_VALUE_TEXT }}>无</div>
            : <ProfileSmallButton text={uploadText} label={uploadText} width={width} x={box.left}
              y={box.top + PREVIEW_BUTTON_SIZE / 2} onClick={upload} />;
        }
        const preview = rowAt(heights[0]!);
        const items: ReactNode[] = [kind === "mv"
          ? <video key="preview" className="song-media-preview" src={media} controls preload="metadata" playsInline
            aria-label="MV 预览" style={preview} />
          : <img key="preview" className="song-media-preview" src={media} alt="自定义背景预览" style={preview} />];
        if (kind === "mv") {
          items.push(<div key="delay" className="song-audio-row" style={{ ...rowAt(DELAY_ROW_HEIGHT), gap, ...STATS_VALUE_TEXT, ...(readOnly ? { justifyContent: "center" } : {}) }}>
            <span>延迟</span>
            <div style={readOnly ? { flex: "none" } : { flex: 1, minWidth: 0 }}>
              {readOnly ? <span aria-label="MV 延迟（毫秒）">{draft.mvOffsetMs} ms</span> :
              <OriginalFormInput aria-label="MV 延迟（毫秒）" inputMode="numeric"
                value={mvDelayText ?? String(draft.mvOffsetMs)}
                onChange={event => {
                  const next = event.currentTarget.value;
                  if (!/^-?\d*$/.test(next)) return;
                  setMvDelayText(next);
                  if (next !== "" && next !== "-") patch({ mvOffsetMs: Number(next) });
                }}
                onBlur={() => setMvDelayText(null)} />}
            </div>
            {!readOnly && <span>ms</span>}
          </div>);
        }
        if (readOnly) return <>{items}</>;
        const buttons = rowAt(PREVIEW_BUTTON_SIZE);
        const half = (width - gap) / 2, buttonY = buttons.top + PREVIEW_BUTTON_SIZE / 2;
        items.push(<ProfileSmallButton key="upload" text={uploadText} label={uploadText} width={half} x={lines.left}
          y={buttonY} onClick={upload} />);
        items.push(<ProfileSmallButton key="clear" text={kind === "mv" ? "清空 MV" : "清空背景"}
          label={kind === "mv" ? "清空 MV" : "清空背景"} width={half} x={lines.left + half + gap} y={buttonY}
          onClick={kind === "mv" ? () => setMv(null) : () => setIllustBackground(null)} />);
        return <>{items}</>;
      }}
    </SongProfileScrollPage>;
  };
  /** The audio page: the caption bar, then the preview button with the time HUD, the delay, upload / clear. */
  const audioPage = ({ shrink }: SongProfilePageLayout) => {

  // As the statistics page: the caption bar, then the content under it between the caption text's inset on
  // both sides; each line as tall as what it holds, the lines AUDIO_ITEM_GAP apart.
  const lines = statsRowLines(shrink);
  const width = lines.right - lines.left;
  const heights = [PREVIEW_BUTTON_SIZE, DELAY_ROW_HEIGHT, PREVIEW_BUTTON_SIZE];
  const tops = heights.reduce<number[]>((acc, _height, index) =>
    [...acc, index === 0 ? lines.barBottom + AUDIO_ITEM_GAP : acc[index - 1]! + heights[index - 1]! + AUDIO_ITEM_GAP], []);
  const lineY = (index: number) => tops[index]! + heights[index]! / 2;
  const row = (index: number, height = heights[index]!) => ({ left: lines.left, top: lineY(index) - height / 2, width, height });
  return <>
    <SongStatsCaption title="音频" shrink={shrink} />
    {!shownAudio ? (readOnly ? <div className="song-audio-row" style={{ ...row(0), justifyContent: "center", ...STATS_VALUE_TEXT }}>无</div>
      : <ProfileSmallButton text="上传音频" label="上传音频" width={width} x={lines.left} y={lineY(0)}
        onClick={() => audioInput.current?.click()} />) : <>
      {/* The preview button and the time HUD as one, centred. */}
      <div className="song-audio-row" style={{ ...row(0), justifyContent: "center", gap: PREVIEW_HUD_GAP }}>
        <div style={{ position: "relative", width: PREVIEW_BUTTON_SIZE, height: PREVIEW_BUTTON_SIZE, flex: "none" }}>
          <SongPreviewButton playing={playing} x={PREVIEW_BUTTON_SIZE / 2} y={PREVIEW_BUTTON_SIZE / 2}
            onClick={() => setPlaying(value => !value)} />
        </div>
        <EditorPlaybackClock designUnits maxSeconds={audioDuration}
          getSeconds={() => player.current?.currentTime ?? 0} />
      </div>
      <div className="song-audio-row" style={{ ...row(1), gap: AUDIO_ITEM_GAP, ...STATS_VALUE_TEXT, ...(readOnly ? { justifyContent: "center" } : {}) }}>
        <span>延迟</span>
        <div style={readOnly ? { flex: "none" } : { flex: 1, minWidth: 0 }}>
          {readOnly ? <span aria-label="延迟（毫秒）">{draft.offsetMs} ms</span> :
          <OriginalFormInput aria-label="延迟（毫秒）" inputMode="numeric" value={delayText ?? String(draft.offsetMs)}
            onChange={event => {
              const next = event.currentTarget.value;
              if (!/^-?\d*$/.test(next)) return;
              setDelayText(next);
              if (next !== "" && next !== "-") patch({ offsetMs: Number(next) });
            }}
            onBlur={() => setDelayText(null)} />}
        </div>
        {!readOnly && <span>ms</span>}
      </div>
      {!readOnly && <>
        <ProfileSmallButton text="上传音频" label="上传音频" width={(width - AUDIO_ITEM_GAP) / 2} x={lines.left}
          y={lineY(2)} onClick={() => audioInput.current?.click()} />
        <ProfileSmallButton text="清空音频" label="清空音频" width={(width - AUDIO_ITEM_GAP) / 2}
          x={lines.left + (width + AUDIO_ITEM_GAP) / 2} y={lineY(2)} onClick={() => setAudio(null)} />
      </>}
    </>}
  </>;
  };

  return (
    <UiPageViewport>
    <section className="song-information-page" aria-label={mode === "view" ? "歌曲信息" : mode === "create" ? "创建工程" : "编辑信息"}>
      <input ref={coverInput} type="file" accept="image/*" className="hidden-input" aria-label="选择封面图片"
        onChange={choose(setCover)} />
      <input ref={mvInput} type="file" accept="video/*" className="hidden-input" aria-label="选择 MV 文件"
        onChange={choose(setMv)} />
      <input ref={backgroundInput} type="file" accept="image/png,image/jpeg" className="hidden-input"
        aria-label="选择自定义背景图片" onChange={choose(setIllustBackground)} />
      <input ref={audioInput} type="file" accept="audio/*" className="hidden-input" aria-label="选择音频文件"
        onChange={choose(setAudio)} />
      {shownAudio && <audio ref={player} src={shownAudio} preload="auto" onEnded={() => setPlaying(false)}
        onLoadedMetadata={event => setAudioDuration(event.currentTarget.duration || 0)} />}
      <div className="song-information-composition" style={{
        left: `calc(var(--ui-page-window-center-x) + ${content.x}px)`,
        top: `calc(var(--ui-page-window-center-y) + ${content.y}px)`,
        width: content.width, height: content.height, display: "block",
      }}>
        <SongProfileEditor width={profileWidth} readOnly={readOnly} noStatistics={!readOnly} title={draft.title} artist={draft.artist} isFullLength={draft.isFullLength}
          difficulty={draft.difficulty} level={draft.difficultyLevel}
          onTitleChange={title => patch({ title })} onArtistChange={artist => patch({ artist })}
          onFullLengthChange={isFullLength => patch({ isFullLength })} onEditDifficulty={() => setDifficultyOpen(true)}
          duration={formatDuration(audioDurationSec)} bpm={draft.bpm.toFixed(2)} count={noteCount}
          mv={shownMv} onChangeMv={() => mvInput.current?.click()}
          illustBackground={shownBackground} onChangeIllustBackground={() => backgroundInput.current?.click()}
          onRemoveIllustBackground={shownBackground ? () => setIllustBackground(null) : undefined}
          editPages={[{ name: "音频", render: audioPage }, { name: "MV", render: layout => mediaPage(layout, "mv") },
            { name: "自定义背景", render: layout => mediaPage(layout, "background") }]}
                    noteStatistics={(expanded, onExpandedChange, fit) => <SongNoteStatisticsPage counts={noteCounts}
            settings={optionSettings} habahiro={habahiro} onError={onError} expanded={expanded} onExpandedChange={onExpandedChange}
            fit={fit} />} />
        <div className="song-information-edit-column" style={{ position: "absolute", left: rightLeft, top: 0,
          width: RIGHT_WIDTH, height: content.height }}>
          {/* The cover takes the height the buttons leave. */}
          {/* Its top (the difficulty frame's) at the column's top, centred under the buttons. */}
          <div className="song-information-edit-jacket" style={{ marginLeft: jacketLeft - rightLeft,
            width: jacketWidth, height: jacketWidth / SONG_JACKET_PICKER_ASPECT, flex: "none" }}>
            <SongJacketPicker source={coverUrl ?? mediaSources.cover} difficulty={draft.difficulty}
              isFullLength={draft.isFullLength} onPick={readOnly ? undefined : () => coverInput.current?.click()} />
          </div>
          <div className="song-information-edit-actions" style={{ gap: ACTION_GAP }}>
            {readOnly ? <>
              <OriginalFormButton onClick={() => onEdit?.()}>编辑</OriginalFormButton>
              <OriginalFormButton tone="pink" onClick={onLeave}>返回</OriginalFormButton>
            </> : <>
              <OriginalFormButton onClick={() => onCancel?.()}>取消</OriginalFormButton>
              <OriginalFormButton tone="pink" disabled={saving} onClick={() => void confirm()}>确定</OriginalFormButton>
            </>}
          </div>
        </div>
      </div>
      <SongDifficultyDialog open={difficultyOpen} difficulty={draft.difficulty} level={draft.difficultyLevel}
        onClose={() => setDifficultyOpen(false)}
        onApply={(difficulty, difficultyLevel) => patch({ difficulty, difficultyLevel })} />
    </section>
    </UiPageViewport>
  );
}
