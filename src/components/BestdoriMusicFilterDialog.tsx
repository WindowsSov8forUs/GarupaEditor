import { OriginalMusicFilterDialog } from "./OriginalMusicFilterDialog";
import { BESTDORI_LEVEL_MIN, BESTDORI_LEVEL_MAX, DEFAULT_BESTDORI_FILTER, type BestdoriMusicFilter } from "./bestdoriMusicSearch";
export function BestdoriMusicFilterDialog(props: {
  mode?: "search" | "filter";
  open: boolean; value: BestdoriMusicFilter; onChange(value: BestdoriMusicFilter): void;
  onSearch(value: BestdoriMusicFilter, field: "id" | "keyword" | "artist"): void; onClose(): void;
}) {
  return <OriginalMusicFilterDialog {...props} title="谱面筛选" defaults={DEFAULT_BESTDORI_FILTER} bounds={[BESTDORI_LEVEL_MIN, BESTDORI_LEVEL_MAX]} />;
}
