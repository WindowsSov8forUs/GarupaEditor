import cn from "../data/originalOfficialMusicWording.json";
import { OFFICIAL_DIFFICULTIES, type OfficialDifficulty, type OfficialLibrary, type OfficialSong } from "../services/officialMusicLibrary";
import type { OfficialSelectionEntry } from "./musicSelectionData";
import type { OfficialMaster, MasterCategory } from "../services/officialMusicMaster";
import { OFFICIAL_SERVER_INDEX } from "../services/officialMusicSources";

// Match original semantic keys, never assume server-specific numeric IDs are interchangeable.
// A future unknown category retains its original JP master name rather than inventing a translation.
function categoryName(category: MasterCategory, medium = false): string {
  const names: Readonly<Record<string, string>> = medium ? cn.mediumCategories : cn.largeCategories;
  return names[category.category] ?? category.categoryName;
}

export interface OfficialCategory extends MasterCategory { children: { id: number; label: string; all: boolean }[] }
export function officialCategories(master: OfficialMaster | undefined): OfficialCategory[] {
  if (!master) return [];
  const allowed = new Set(master.masterMusicCategoryInfoTargets.musicCategoryIdList);
  return Object.values(master.masterMusicLargeCategoryDataMap.entries).sort((a, b) => a.seq - b.seq).map(category => ({
    ...category, categoryName: categoryName(category), children: Object.values(master.masterMusicCategoryInfoMap.entries)
      .filter(info => allowed.has(info.id) && info.largeCategoryId === category.id)
      .sort((a, b) => (master.masterMusicMediumCategoryDataMap.entries[String(a.mediumCategoryId)]?.seq ?? 0)
        - (master.masterMusicMediumCategoryDataMap.entries[String(b.mediumCategoryId)]?.seq ?? 0))
      .map(info => { const medium = master.masterMusicMediumCategoryDataMap.entries[String(info.mediumCategoryId)];
        return { id: info.id, label: medium ? categoryName(medium, true) : categoryName(category), all: medium?.category === "all" }; }),
  })).filter(category => category.children.length > 0);
}

export interface OfficialMusicFilter {
  id: string; keyword: string; difficulty: OfficialDifficulty; band: number; extension: number;
  minimum: number; maximum: number; sort: number; category: number;
}
export const DEFAULT_OFFICIAL_FILTER: OfficialMusicFilter = {
  id: "", keyword: "", difficulty: "EXPERT", band: 0, extension: 0, minimum: 0, maximum: Number.POSITIVE_INFINITY, sort: 0, category: 0,
};
export function officialLevelBounds(library: OfficialLibrary): readonly [number, number] {
  const levels = library.songs.flatMap(song => Object.values(song.info.difficulty).map(diff => diff.playLevel));
  return levels.length ? [Math.min(...levels), Math.max(...levels)] : [0, 0];
}
export function resetOfficialFilter(value: OfficialMusicFilter, library: OfficialLibrary): OfficialMusicFilter {
  const [minimum, maximum] = officialLevelBounds(library);
  return { ...DEFAULT_OFFICIAL_FILTER, minimum, maximum, category: value.category,
    difficulty: value.difficulty === "SPECIAL" ? "EXPERT" : value.difficulty };
}
export function officialLevel(song: OfficialSong, difficulty: OfficialDifficulty): number {
  return song.info.difficulty[String(OFFICIAL_DIFFICULTIES.indexOf(difficulty)) as keyof typeof song.info.difficulty]?.playLevel ?? 0;
}
export function selectOfficialMusic(library: OfficialLibrary, filter: OfficialMusicFilter): OfficialSelectionEntry[] {
  const keyword = filter.keyword.trim().toLocaleLowerCase();
  return library.songs.filter(song => {
    if (filter.category && !library.metadata?.official.master.masterMusicCategorySetMap.entries[String(song.master.categorySetId)]?.musicCategoryInfoIdList.includes(filter.category)) return false;
    if (!song.available.includes(filter.difficulty)) return false;
    if (filter.id.trim() && String(song.id) !== filter.id.trim()) return false;
    if (keyword && ![...song.info.musicTitle, song.artist].some(text => text?.toLocaleLowerCase().includes(keyword))) return false;
    if (filter.band === -1 ? [1, 2, 3, 4, 5, 18, 21, 45].includes(song.info.bandId)
      : filter.band !== 0 && song.info.bandId !== filter.band) return false;
    const level = officialLevel(song, filter.difficulty);
    if (level < filter.minimum || level > filter.maximum) return false;
    if (filter.extension === 1 && !song.has3d) return false;
    if (filter.extension === 2 && !song.hasMv) return false;
    if (filter.extension === 3 && song.master.musicDataType !== "full") return false;
    // CN MusicData.get_ExistSpecialNotesInPublishedMusicScore explicitly reads
    // the published SPECIAL score, independent of the selected difficulty.
    if (filter.extension === 4 && !song.specialNotes.includes("SPECIAL")) return false;
    return true;
  }).sort((a, b) => {
    const sequence = a.info.seq - b.info.seq;
    switch (filter.sort) {
      case 1: return (a.info.phonetic?.[0] ?? a.title).localeCompare(b.info.phonetic?.[0] ?? b.title, "ja") || sequence;
      case 2: return Number(a.info.publishedAt[OFFICIAL_SERVER_INDEX[a.server]]) - Number(b.info.publishedAt[OFFICIAL_SERVER_INDEX[b.server]]) || sequence;
      case 3: return officialLevel(b, filter.difficulty) - officialLevel(a, filter.difficulty) || sequence;
      default: return sequence;
    }
  }).map(song => ({ source: "official", id: song.id, title: song.title, artists: song.artist,
    level: String(officialLevel(song, filter.difficulty)), difficulty: filter.difficulty, officialSong: song }));
}
