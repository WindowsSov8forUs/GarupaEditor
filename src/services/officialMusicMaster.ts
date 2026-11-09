import { invokeTauriCommand } from "./bestdori/transport";
import { appLog } from "../logging/applicationLogger";
import { checkOfficialMasterShape, schemaFingerprint } from "./officialMasterShape";
import clientVersions from "../data/officialClientVersions.json";
import type { OfficialServer } from "./officialMusicSources";

/*
 * Rows of the original master as typed here. The decoder and the shape check (officialMasterShape) cover
 * every ProtoMember of the server's complete schema; the interfaces name the fields the editor reads.
 * protobuf omits default values, so a field absent from a row is 0, "", false or empty.
 */
export interface MasterMultiLiveScore {
  musicId?: number; musicDifficulty?: string; multiLiveDifficultyId?: number; multiLiveDifficultyType?: string;
  scoreS?: number; scoreA?: number; scoreB?: number; scoreC?: number; scoreSS?: number; scoreSSS?: number;
}
export interface MasterMusicAchievement { musicId?: number; achievementType?: string; rewardType?: string; rewardId?: number; quantity?: number }
export interface MasterSong {
  musicId: number; musicTitle: string; bgmId: string; bgmFile: string; bandId: number;
  jacketImage: string; seq: number; publishedAt: number; closedAt?: number;
  tag: string; musicDataType: string; categorySetId?: number;
  ruby?: string; phonetic?: string; lyricist?: string; composer?: string; arranger?: string; howToGet?: string;
  description?: string; transitionMethod?: string; transitionId?: number; achievements?: MasterMusicAchievement[];
}
export interface MasterDifficulty {
  musicId: number; difficulty: string; playLevel: number; publishedAt?: number;
  enableSpecialNotes?: boolean; notesQuantity?: number;
  multiLiveScoreMap?: Record<string, MasterMultiLiveScore>;
  scoreS?: number; scoreA?: number; scoreB?: number; scoreC?: number; scoreSS?: number;
  /** Nullable<uint>: null when the row sets none. */
  scoreLevel?: number | null;
}
export interface MasterCategory { id: number; seq: number; category: string; categoryName: string; categoryColor?: string; mediumCategoryColor?: string }
export interface MasterVideo {
  musicId: number; assetBundleName: string; startAt?: number; endAt?: number; seq?: number; musicStartDelayMilliseconds?: number;
  title?: string; thumbAssetBundleName?: string; description?: string;
}
export interface MasterBand {
  bandId: number; bandName: string; resourceId?: number; color?: string; leader?: number;
  member1?: number; member2?: number; member3?: number; member4?: number;
  seq?: number; bandType?: string; introductions?: string; phonetic?: string; musicId?: number;
}
export interface MasterMusicJacket { musicJacketId?: number; musicId: number; seq: number; jacketImage: string; startAt?: number; endAt?: number }
export interface MasterMusicVideo3d {
  musicVideo3dId: number; musicId: number; seq?: number; typeName?: string; startAt?: number; endAt?: number;
  originalMember1?: number; originalMember2?: number; originalMember3?: number; originalMember4?: number; originalMember5?: number;
  member1Position?: number; member2Position?: number; member3Position?: number; member4Position?: number; member5Position?: number;
  backgroundAssetBundleName?: string; backgroundColorId?: number;
}
export interface MasterCollaboOriginalMusicPage {
  collaboOriginalPageId?: number; assetBundleName?: string; ruleSlideBundleName?: string; url?: string; musicIdList?: number[];
  publishedAt?: number; closedAt?: number; description?: string; shortDescription?: string; label?: string; labelColor?: string;
  backgroundName?: string; animationName?: string; isDisplaySpecialDifficulty?: boolean;
}
export interface OfficialMaster {
  masterMusicList: { entries: MasterSong[] };
  masterMusicDifficultyList: { entries: MasterDifficulty[] };
  masterBandMap: { entries: Record<string, MasterBand> };
  masterMusicLargeCategoryDataMap: { entries: Record<string, MasterCategory> };
  masterMusicMediumCategoryDataMap: { entries: Record<string, MasterCategory> };
  masterMusicCategoryInfoMap: { entries: Record<string, { id: number; targetType: string; largeCategoryId: number; mediumCategoryId?: number }> };
  masterMusicCategoryInfoTargets: { musicCategoryIdList: number[]; shopCategoryIdList?: number[] };
  masterMusicCategorySetMap: { entries: Record<string, { id: number; musicCategoryInfoIdList: number[] }> };
  masterMusicVideoListMap: { entries: Record<string, { entries: MasterVideo[] }> };
  masterMusicJacketMap: { entries: Record<string, { entries: MasterMusicJacket[] }> };
  masterMusicVideo3dMap: { entries: Record<string, MasterMusicVideo3d> };
  masterMusicVideo3dIdListMap: { entries: Record<string, { entries: number[] }> };
  masterCollaboOriginalMusicPageList?: { entries?: MasterCollaboOriginalMusicPage[] };
}
export interface OfficialMasterSnapshot {
  clientVersion: string; dataVersion: string; masterDataVersion: string; master: OfficialMaster;
  /** Fingerprint of the schema the master was decoded with; absent in stores from before it was kept. */
  schema?: string;
}
/** AppGetResponse; the fields past the version and status ones are not read here. */
interface AppVersion {
  clientVersion: string; dataVersion: string; masterDataVersion: string; appStatus: string; clientStatus: string;
  schema?: string; gacha?: string; multiLive?: string; starShop?: string; photonAppId?: string;
  monthlyRankingStatues?: { monthlyRankingId?: number; status?: string }[];
}
const versionPattern = /^\d+(?:\.\d+){1,5}$/;
const masterVersionPattern = /^\d+(?:\.\d+){0,5}$/;
/** Shape against the server's complete schema, then the relations between the decoded tables. */
export function validateOfficialMaster(master: OfficialMaster, server: OfficialServer): void {
  checkOfficialMasterShape(master, server, "SuiteMasterGetResponse");
  validateOfficialMasterRelations(master);
}
/** Relations between decoded tables; used alone for a merged master, whose rows were shape-checked per server. */
export function validateOfficialMasterRelations(master: OfficialMaster): void {
  const fail = (): never => { throw new Error("官方主表结构或关联不完整，保留旧缓存"); };
  if (!master?.masterMusicList?.entries?.length || !Array.isArray(master.masterMusicDifficultyList?.entries)) fail();
  const ids = new Set<number>();
  const sets = master.masterMusicCategorySetMap?.entries, infos = master.masterMusicCategoryInfoMap?.entries;
  const large = master.masterMusicLargeCategoryDataMap?.entries, medium = master.masterMusicMediumCategoryDataMap?.entries;
  if (!sets || !infos || !large || !medium || !master.masterMusicCategoryInfoTargets?.musicCategoryIdList) fail();
  if (!master.masterMusicJacketMap?.entries || !master.masterBandMap?.entries || !master.masterMusicVideoListMap?.entries
    || !master.masterMusicVideo3dMap?.entries || !master.masterMusicVideo3dIdListMap?.entries) fail();
  for (const song of master.masterMusicList.entries) {
    if (!Number.isSafeInteger(song.musicId) || song.musicId <= 0 || ids.has(song.musicId)
      || !song.musicTitle || !song.bgmFile || !song.bgmId || !song.jacketImage || !Number.isFinite(song.publishedAt)
      || !Number.isFinite(song.seq) || !master.masterBandMap.entries[String(song.bandId)]
      || !["normal", "full", "collabo_original"].includes(song.musicDataType)
      || (song.categorySetId && !sets[String(song.categorySetId)])) fail();
    ids.add(song.musicId);
  }
  for (const set of Object.values(sets)) if (!Array.isArray(set.musicCategoryInfoIdList) || set.musicCategoryInfoIdList.some(id => !infos[String(id)])) fail();
  for (const info of Object.values(infos)) if (!large[String(info.largeCategoryId)] || (info.mediumCategoryId && !medium[String(info.mediumCategoryId)])) fail();
  if (master.masterMusicCategoryInfoTargets.musicCategoryIdList.some(id => !infos[String(id)])) fail();
  const difficultyKeys = new Set<string>();
  for (const difficulty of master.masterMusicDifficultyList.entries) {
    const key = `${difficulty.musicId}:${difficulty.difficulty}`;
    if (difficultyKeys.has(key) || !["easy", "normal", "hard", "expert", "special"].includes(difficulty.difficulty)
      || !Number.isFinite(difficulty.playLevel) || difficulty.playLevel < 0) fail();
    difficultyKeys.add(key);
    // Original master retains difficulty rows for removed songs (e.g. 99).
    // Membership comes exclusively from masterMusicList.
  }
  for (const [id, rows] of Object.entries(master.masterMusicJacketMap.entries))
    if (!Array.isArray(rows.entries) || rows.entries.some(row => row.musicId !== Number(id) || !row.jacketImage || !Number.isFinite(row.seq))) fail();
  for (const [id, rows] of Object.entries(master.masterMusicVideoListMap.entries))
    if (!Array.isArray(rows.entries) || rows.entries.some(row => row.musicId !== Number(id) || !row.assetBundleName)) fail();
  for (const [id, rows] of Object.entries(master.masterMusicVideo3dIdListMap.entries))
    if (!ids.has(Number(id)) || !Array.isArray(rows.entries) || rows.entries.some(video => master.masterMusicVideo3dMap.entries[String(video)]?.musicId !== Number(id))) fail();
}

/** Startup caller owns persistence. Never publish a partially decoded update. */
/**
 * Returns the server's master, or the cached one when this server's check is skipped because the client
 * version is obsolete for it. Each server is decided on its own.
 */
export async function refreshOfficialMaster(previous?: OfficialMasterSnapshot, server: OfficialServer = "jp"): Promise<OfficialMasterSnapshot | undefined> {
  let clientVersion = clientVersions[server];
  const request = async <T>(args: Record<string, string>, stage: string): Promise<T> => {
    try { return await invokeTauriCommand<T>("official_music_request", args); }
    catch (error) { throw new Error(`${server} ${stage}失败：${String(error)}`); }
  };
  const requestVersion = async () => {
    const version = await request<AppVersion>({ clientVersion, server }, "主表版本检查");
    checkOfficialMasterShape(version, server, "AppGetResponse", "application");
    return version;
  };
  let version = await requestVersion();
  if (version.clientVersion !== clientVersion) {
    if (!versionPattern.test(version.clientVersion)) throw new Error("原作返回无效客户端版本");
    clientVersion = version.clientVersion;
    version = await requestVersion();
  }
  if (version.clientStatus === "obsolete") {
    appLog("warn", "official.client-version-obsolete", { server, clientVersion, serverClientVersion: version.clientVersion,
      appStatus: version.appStatus, clientStatus: version.clientStatus });
    return previous;
  }
  // CN exposes the public master even when the game advertises maintenance.
  // This accepts master reads only, and does not treat maintenance as playable.
  const readable = server === "cn"
    ? ["available", "maintenance"].includes(version.appStatus) && ["latest", "stable"].includes(version.clientStatus)
    : version.appStatus === "available" && version.clientStatus === "latest";
  if (!readable || version.clientVersion !== clientVersion
    || !versionPattern.test(version.dataVersion) || !masterVersionPattern.test(version.masterDataVersion))
    throw new Error("原作主数据暂不可用或客户端版本不兼容");
  appLog("info", "official.master-version-checked", { server, appStatus: version.appStatus, clientStatus: version.clientStatus, clientVersion, dataVersion: version.dataVersion, masterDataVersion: version.masterDataVersion, previousMasterDataVersion: previous?.masterDataVersion });
  const schema = await schemaFingerprint(server);
  if (previous && previous.masterDataVersion === version.masterDataVersion && previous.dataVersion === version.dataVersion
    && previous.clientVersion === clientVersion && previous.schema === schema) {
    validateOfficialMaster(previous.master, server);
    return { ...previous, clientVersion, dataVersion: version.dataVersion };
  }
  if (previous && previous.schema !== schema) appLog("info", "official.master-schema-changed", { server, masterDataVersion: version.masterDataVersion });
  const master = await request<OfficialMaster>({
    clientVersion, dataVersion: version.dataVersion, masterVersion: version.masterDataVersion, server,
  }, "主表下载");
  validateOfficialMaster(master, server);
  appLog("info", "official.master-update-validated", { server, masterDataVersion: version.masterDataVersion, songs: master.masterMusicList.entries.length });
  return { clientVersion, dataVersion: version.dataVersion, masterDataVersion: version.masterDataVersion, master, schema };
}
