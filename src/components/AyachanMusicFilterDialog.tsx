import { OriginalMusicFilterDialog, type MusicFilterFields } from "./OriginalMusicFilterDialog";
import { AYACHAN_LEVEL_MIN, AYACHAN_LEVEL_MAX, DEFAULT_AYACHAN_FILTER, type AyachanMusicFilter } from "./ayachanMusicSearch";
const fields = (value: AyachanMusicFilter): MusicFilterFields => ({ ...value, keyword: "", artist: "", difficulty: null, order: "TIME_DESC" });
export function AyachanMusicFilterDialog({ value, onChange, onSearch, ...props }: {
  mode?: "search" | "filter";
  open: boolean; value: AyachanMusicFilter; onChange(value: AyachanMusicFilter): void;
  onSearch(value: AyachanMusicFilter): void; onClose(): void;
}) {
  const extract = ({ id, minimum, maximum }: MusicFilterFields) => ({ id, minimum, maximum });
  return <OriginalMusicFilterDialog {...props} title="谱面筛选" compact value={fields(value)} defaults={fields(DEFAULT_AYACHAN_FILTER)}
    bounds={[AYACHAN_LEVEL_MIN, AYACHAN_LEVEL_MAX]} onChange={value => onChange(extract(value))}
    onSearch={value => onSearch(extract(value))} />;
}
