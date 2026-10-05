import { useMemo, useRef, type ChangeEventHandler, type Dispatch, type SetStateAction } from "react";
import { formatDuration, isDirectionalNoteType, type ChartMetadata, type ChartNote, type EditorOptionSettings } from "../chartCore";
import { countSongNoteKinds } from "./songNoteStatistics";
import { SongNoteStatisticsPage } from "./SongNoteStatisticsPage";
import type { SlideChain } from "../app/editorHelpers";
import { SongJacket, SongDifficultySelect, SongProfileInformation, SONG_INFORMATION_CONTENT_BOUNDS, SONG_INFORMATION_LEFT_BOUNDS } from "./OriginalSongDetailParts";
import { UiPageViewport } from "./UiViewport";
import "./SongInformationPage.css";

type SongInformationPageProps = {
  audioDurationSec: number;
  noteCount: number;
  notes: readonly ChartNote[];
  slideChains: readonly SlideChain[];
  metadata: ChartMetadata;
  mediaSources: { cover: string | null; mv: string | null };
  setMetadata: Dispatch<SetStateAction<ChartMetadata>>;
  onCoverUpload: ChangeEventHandler<HTMLInputElement>;
  onMvUpload: ChangeEventHandler<HTMLInputElement>;
  optionSettings: EditorOptionSettings;
  onError(message: string): void;
};

export function SongInformationPage({ audioDurationSec, noteCount, notes, slideChains, metadata, mediaSources,
  setMetadata, onCoverUpload, onMvUpload, optionSettings, onError }: SongInformationPageProps) {
  const coverInput = useRef<HTMLInputElement>(null);
  const mvInput = useRef<HTMLInputElement>(null);
  const noteCounts = useMemo(() => countSongNoteKinds(notes, slideChains), [notes, slideChains]);
  const hasSpecialNotes = useMemo(() => {
    if (notes.some(note => isDirectionalNoteType(note.type))) return true;
    const hiddenIds = new Set(notes.filter(note => note.type === "hidden").map(note => note.id));
    return slideChains.some(chain => chain.noteIds.some(id => hiddenIds.has(id)));
  }, [notes, slideChains]);
  return (
    <UiPageViewport>
    <section className="song-information-page" aria-label="歌曲信息">
      <input ref={coverInput} type="file" accept="image/*" className="hidden-input"
        aria-label="选择封面图片" onChange={onCoverUpload} />
      <input ref={mvInput} type="file" accept="video/*" className="hidden-input"
        aria-label="选择 MV 文件" onChange={onMvUpload} />
      <div className="song-information-composition" style={{
        left: `calc(var(--ui-page-window-center-x) + ${SONG_INFORMATION_CONTENT_BOUNDS.x}px)`,
        top: `calc(var(--ui-page-window-center-y) + ${SONG_INFORMATION_CONTENT_BOUNDS.y}px)`,
        width: SONG_INFORMATION_CONTENT_BOUNDS.width, height: SONG_INFORMATION_CONTENT_BOUNDS.height,
        columnGap: SONG_INFORMATION_CONTENT_BOUNDS.columnGap,
        gridTemplateColumns: `${SONG_INFORMATION_LEFT_BOUNDS.width}px auto`,
      }}>
        <div className="song-information-cover-column" style={{ height: SONG_INFORMATION_LEFT_BOUNDS.height }}>
          <div className="song-information-jacket">
            <SongJacket source={mediaSources.cover} charter={metadata.charter} difficulty={metadata.difficulty} isFullLength={metadata.isFullLength}
              onChangeCover={() => coverInput.current?.click()} />
          </div>
          <SongDifficultySelect value={metadata.difficulty} level={metadata.difficultyLevel} onChange={difficulty =>
            setMetadata(current => current.difficulty === difficulty ? current : { ...current, difficulty })} />
        </div>
        <SongProfileInformation title={metadata.title} artist={metadata.artist}
          cover={mediaSources.cover}
          level={metadata.difficultyLevel}
          difficulty={metadata.difficulty}
          hasSpecialNotes={hasSpecialNotes}
          hasMv={Boolean(mediaSources.mv)}
          mv={mediaSources.mv}
          onChangeMv={() => mvInput.current?.click()}
          noteStatistics={(expanded, onExpandedChange) => <SongNoteStatisticsPage counts={noteCounts}
            settings={optionSettings} onError={onError} expanded={expanded} onExpandedChange={onExpandedChange} />}
          isFullLength={metadata.isFullLength}
          onFullLengthChange={isFullLength => setMetadata(current => ({ ...current, isFullLength }))}
          onLevelChange={difficultyLevel => setMetadata(current => current.difficultyLevel === difficultyLevel
            ? current : { ...current, difficultyLevel })}
          onTitleChange={title => setMetadata(current => current.title === title ? current : { ...current, title })}
          onArtistChange={artist => setMetadata(current => current.artist === artist ? current : { ...current, artist })}
          duration={formatDuration(audioDurationSec)} bpm={metadata.bpm.toFixed(2)} count={noteCount} />
      </div>
    </section>
    </UiPageViewport>
  );
}
