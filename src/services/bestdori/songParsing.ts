import {
  ResponseShapeError, arrayOf, boolean, finite, idKey, integer, nullable, oneOf, optional, record, recordOf, string, type Reader,
} from "../responseShape";

/*
 * Bestdori song database responses. Shapes follow real responses: songs/all.8 (826 songs) and
 * songs/{id} for 37 songs across the id range, bands/all.1 and misc/llsif.10.
 */

/** One value per Bestdori server, in the order jp, en, tw, cn, kr; null where a server lacks it. */
export type BestdoriPerServerValue<T> = [T | null, T | null, T | null, T | null, T | null];
export type BestdoriSongDifficultyIndex = "0" | "1" | "2" | "3" | "4";
const DIFFICULTY_INDEXES: readonly BestdoriSongDifficultyIndex[] = ["0", "1", "2", "3", "4"];

export function parsePerServer<T>(value: unknown, path: string, read: Reader<T>): BestdoriPerServerValue<T> {
  const values = arrayOf(value, path, (item, itemPath) => nullable(item, itemPath, read));
  if (values.length !== 5) throw new ResponseShapeError(path, "长度为 5 的分服数组");
  return values as BestdoriPerServerValue<T>;
}
const perServerText = (value: unknown, path: string) => parsePerServer(value, path, string);

/** A map keyed by difficulty index; songs without SPECIAL have only 0–3. */
function byDifficulty<T>(value: unknown, path: string, read: Reader<T>): Partial<Record<BestdoriSongDifficultyIndex, T>> {
  return recordOf(value, path, read, (key, keyPath) => oneOf(key, keyPath, DIFFICULTY_INDEXES));
}

export interface BestdoriSongBpm { bpm: number; start: number; end: number }
const parseBpm: Reader<BestdoriSongBpm> = (value, path) => {
  const bpm = record(value, path);
  return { bpm: finite(bpm.bpm, `${path}.bpm`), start: finite(bpm.start, `${path}.start`), end: finite(bpm.end, `${path}.end`) };
};

/**
 * Fields songs/all.8 and songs/{id} share. tag is the song's category (normal, anime, tie_up);
 * length is in seconds; publishedAt and closedAt are millisecond timestamps as strings.
 */
export interface BestdoriSongCommon {
  tag: string; bandId: number; jacketImage: string[];
  musicTitle: BestdoriPerServerValue<string>; ruby: BestdoriPerServerValue<string>; phonetic: BestdoriPerServerValue<string>;
  lyricist: BestdoriPerServerValue<string>; composer: BestdoriPerServerValue<string>; arranger: BestdoriPerServerValue<string>;
  publishedAt: BestdoriPerServerValue<string>; closedAt: BestdoriPerServerValue<string>;
  length: number;
  notes: Partial<Record<BestdoriSongDifficultyIndex, number>>;
  bpm: Partial<Record<BestdoriSongDifficultyIndex, BestdoriSongBpm[]>>;
}
export function parseBestdoriSongCommon(song: Record<string, unknown>, path: string): BestdoriSongCommon {
  return {
    tag: string(song.tag, `${path}.tag`), bandId: integer(song.bandId, `${path}.bandId`),
    jacketImage: arrayOf(song.jacketImage, `${path}.jacketImage`, string),
    musicTitle: perServerText(song.musicTitle, `${path}.musicTitle`), ruby: perServerText(song.ruby, `${path}.ruby`),
    phonetic: perServerText(song.phonetic, `${path}.phonetic`), lyricist: perServerText(song.lyricist, `${path}.lyricist`),
    composer: perServerText(song.composer, `${path}.composer`), arranger: perServerText(song.arranger, `${path}.arranger`),
    publishedAt: perServerText(song.publishedAt, `${path}.publishedAt`), closedAt: perServerText(song.closedAt, `${path}.closedAt`),
    length: finite(song.length, `${path}.length`),
    notes: byDifficulty(song.notes, `${path}.notes`, integer),
    bpm: byDifficulty(song.bpm, `${path}.bpm`, (v, p) => arrayOf(v, p, parseBpm)),
  };
}

export interface BestdoriSongAchievement {
  musicId: number; achievementType: string; rewardType: string;
  /** Only for item rewards (practice_ticket); coin and star rewards have none. */
  rewardId?: number;
  quantity: number;
}
export interface BestdoriSongDifficultyMultiLiveScore {
  musicId: number; musicDifficulty: string; multiLiveDifficultyId: number; multiLiveDifficultyType: string;
  scoreS: number; scoreA: number; scoreB: number; scoreC: number; scoreSS: number; scoreSSS: number;
}
/** publishedAt is present only for difficulties released after the song (most SPECIAL charts). */
export interface BestdoriSongDifficulty {
  playLevel: number; publishedAt?: BestdoriPerServerValue<string>;
  multiLiveScoreMap: Record<string, BestdoriSongDifficultyMultiLiveScore>;
  notesQuantity: number; scoreC: number; scoreB: number; scoreA: number; scoreS: number; scoreSS: number;
}
/** An MV, keyed by its asset package (music_video_<id>…); only songs with an MV have musicVideos. */
export interface BestdoriSongMusicVideo {
  assetBundleName: string; thumbAssetBundleName: string; musicStartDelayMilliseconds: number;
  title: BestdoriPerServerValue<string>; description: BestdoriPerServerValue<string>;
  startAt: BestdoriPerServerValue<string>; endAt: BestdoriPerServerValue<string>;
}
/** songs/{id}.json. description is present only for songs that have one on some server. */
export interface BestdoriSongInfo extends BestdoriSongCommon {
  bgmId: string; bgmFile: string; seq: number;
  achievements: BestdoriSongAchievement[];
  howToGet: BestdoriPerServerValue<string>;
  description?: BestdoriPerServerValue<string>;
  difficulty: Partial<Record<BestdoriSongDifficultyIndex, BestdoriSongDifficulty>>;
  musicVideos?: Record<string, BestdoriSongMusicVideo>;
}

const parseAchievement: Reader<BestdoriSongAchievement> = (value, path) => {
  const row = record(value, path);
  return { musicId: integer(row.musicId, `${path}.musicId`), achievementType: string(row.achievementType, `${path}.achievementType`),
    rewardType: string(row.rewardType, `${path}.rewardType`), rewardId: optional(row.rewardId, `${path}.rewardId`, integer),
    quantity: integer(row.quantity, `${path}.quantity`) };
};
const parseMultiLiveScore: Reader<BestdoriSongDifficultyMultiLiveScore> = (value, path) => {
  const row = record(value, path);
  return { musicId: integer(row.musicId, `${path}.musicId`), musicDifficulty: string(row.musicDifficulty, `${path}.musicDifficulty`),
    multiLiveDifficultyId: integer(row.multiLiveDifficultyId, `${path}.multiLiveDifficultyId`),
    multiLiveDifficultyType: string(row.multiLiveDifficultyType, `${path}.multiLiveDifficultyType`),
    scoreS: integer(row.scoreS, `${path}.scoreS`), scoreA: integer(row.scoreA, `${path}.scoreA`), scoreB: integer(row.scoreB, `${path}.scoreB`),
    scoreC: integer(row.scoreC, `${path}.scoreC`), scoreSS: integer(row.scoreSS, `${path}.scoreSS`), scoreSSS: integer(row.scoreSSS, `${path}.scoreSSS`) };
};
const parseDifficulty: Reader<BestdoriSongDifficulty> = (value, path) => {
  const row = record(value, path);
  return { playLevel: integer(row.playLevel, `${path}.playLevel`), publishedAt: optional(row.publishedAt, `${path}.publishedAt`, perServerText),
    multiLiveScoreMap: recordOf(row.multiLiveScoreMap, `${path}.multiLiveScoreMap`, parseMultiLiveScore),
    notesQuantity: integer(row.notesQuantity, `${path}.notesQuantity`),
    scoreC: integer(row.scoreC, `${path}.scoreC`), scoreB: integer(row.scoreB, `${path}.scoreB`), scoreA: integer(row.scoreA, `${path}.scoreA`),
    scoreS: integer(row.scoreS, `${path}.scoreS`), scoreSS: integer(row.scoreSS, `${path}.scoreSS`) };
};
const parseMusicVideo: Reader<BestdoriSongMusicVideo> = (value, path) => {
  const row = record(value, path);
  return { assetBundleName: string(row.assetBundleName, `${path}.assetBundleName`),
    thumbAssetBundleName: string(row.thumbAssetBundleName, `${path}.thumbAssetBundleName`),
    musicStartDelayMilliseconds: integer(row.musicStartDelayMilliseconds, `${path}.musicStartDelayMilliseconds`),
    title: perServerText(row.title, `${path}.title`), description: perServerText(row.description, `${path}.description`),
    startAt: perServerText(row.startAt, `${path}.startAt`), endAt: perServerText(row.endAt, `${path}.endAt`) };
};

export function parseBestdoriSongInfo(value: unknown, path = "song"): BestdoriSongInfo {
  const song = record(value, path);
  return {
    ...parseBestdoriSongCommon(song, path),
    bgmId: string(song.bgmId, `${path}.bgmId`), bgmFile: string(song.bgmFile, `${path}.bgmFile`), seq: integer(song.seq, `${path}.seq`),
    achievements: arrayOf(song.achievements, `${path}.achievements`, parseAchievement),
    howToGet: perServerText(song.howToGet, `${path}.howToGet`),
    description: optional(song.description, `${path}.description`, perServerText),
    difficulty: byDifficulty(song.difficulty, `${path}.difficulty`, parseDifficulty),
    musicVideos: optional(song.musicVideos, `${path}.musicVideos`, (v, p) => recordOf(v, p, parseMusicVideo)),
  };
}

/** songs/all.8.json: the index keeps only levels, release dates and MV start dates. */
export interface BestdoriSongIndexEntry extends BestdoriSongCommon {
  difficulty: Partial<Record<BestdoriSongDifficultyIndex, { playLevel: number; publishedAt?: BestdoriPerServerValue<string> }>>;
  musicVideos?: Record<string, { startAt: BestdoriPerServerValue<string> }>;
}
export type BestdoriSongIndex = Record<string, BestdoriSongIndexEntry>;
export function parseBestdoriSongIndex(value: unknown, path = "songs"): BestdoriSongIndex {
  return recordOf(value, path, (item, itemPath) => {
    const song = record(item, itemPath);
    return {
      ...parseBestdoriSongCommon(song, itemPath),
      difficulty: byDifficulty(song.difficulty, `${itemPath}.difficulty`, (v, p) => {
        const row = record(v, p);
        return { playLevel: integer(row.playLevel, `${p}.playLevel`), publishedAt: optional(row.publishedAt, `${p}.publishedAt`, perServerText) };
      }),
      musicVideos: optional(song.musicVideos, `${itemPath}.musicVideos`, (v, p) =>
        recordOf(v, p, (video, videoPath) => ({ startAt: perServerText(record(video, videoPath).startAt, `${videoPath}.startAt`) }))),
    };
  }, idKey);
}

/** bands/all.1.json: band names per server, keyed by band id. */
export interface BestdoriBandsAll1Band { bandName: BestdoriPerServerValue<string> }
export type BestdoriBandsAll1 = Record<string, BestdoriBandsAll1Band>;
export function parseBestdoriBandsAll1(value: unknown, path = "bands"): BestdoriBandsAll1 {
  return recordOf(value, path, (item, itemPath) => ({ bandName: perServerText(record(item, itemPath).bandName, `${itemPath}.bandName`) }), idKey);
}

/**
 * misc/llsif.10.json: School idol festival songs keyed by id. Asset paths are relative to the
 * LLSIF asset host; unit_type_id is null for songs without a unit.
 */
export interface BestdoriLlsifDifficulty {
  live_setting_id: number; difficulty: number; stage_level: number; notes_setting_asset: string; s_rank_combo: number;
  /** Absent on 19 of the 1931 difficulties in llsif.10. */
  available?: boolean;
  ac_flag: number; swing_flag: number; five_keys_flag: boolean;
}
export interface BestdoriLlsifSong {
  name: string; name_kana: string; keyword: string; live_icon_asset: string; sound_asset: string;
  attribute_icon_id: number; live_time: number; member_tag: string; unit_type_id: number | null;
  member_filter_cond: number; min_id: number; max_id: number; difficulties: BestdoriLlsifDifficulty[];
}
export type BestdoriLlsifMisc = Record<string, BestdoriLlsifSong>;
export function parseBestdoriLlsifMisc(value: unknown, path = "llsif"): BestdoriLlsifMisc {
  return recordOf(value, path, (item, p) => {
    const song = record(item, p);
    return {
      name: string(song.name, `${p}.name`), name_kana: string(song.name_kana, `${p}.name_kana`), keyword: string(song.keyword, `${p}.keyword`),
      live_icon_asset: string(song.live_icon_asset, `${p}.live_icon_asset`), sound_asset: string(song.sound_asset, `${p}.sound_asset`),
      attribute_icon_id: integer(song.attribute_icon_id, `${p}.attribute_icon_id`), live_time: finite(song.live_time, `${p}.live_time`),
      member_tag: string(song.member_tag, `${p}.member_tag`), unit_type_id: nullable(song.unit_type_id, `${p}.unit_type_id`, integer),
      member_filter_cond: integer(song.member_filter_cond, `${p}.member_filter_cond`),
      min_id: integer(song.min_id, `${p}.min_id`), max_id: integer(song.max_id, `${p}.max_id`),
      difficulties: arrayOf(song.difficulties, `${p}.difficulties`, (v, dp) => {
        const row = record(v, dp);
        return { live_setting_id: integer(row.live_setting_id, `${dp}.live_setting_id`), difficulty: integer(row.difficulty, `${dp}.difficulty`),
          stage_level: integer(row.stage_level, `${dp}.stage_level`), notes_setting_asset: string(row.notes_setting_asset, `${dp}.notes_setting_asset`),
          s_rank_combo: integer(row.s_rank_combo, `${dp}.s_rank_combo`), available: optional(row.available, `${dp}.available`, boolean),
          ac_flag: integer(row.ac_flag, `${dp}.ac_flag`), swing_flag: integer(row.swing_flag, `${dp}.swing_flag`),
          five_keys_flag: boolean(row.five_keys_flag, `${dp}.five_keys_flag`) };
      }),
    };
  }, idKey);
}
