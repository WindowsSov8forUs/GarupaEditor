import { invokeTauriCommand } from "./bestdori/transport";
import { appLog } from "../logging/applicationLogger";
import protocols from "../data/originalOfficialRegionalMasterProtocol.json";
import type { OfficialServer } from "./officialMusicSources";

export interface MasterSong {
  musicId: number; musicTitle: string; bgmId: string; bgmFile: string; bandId: number;
  jacketImage: string; seq: number; publishedAt: number; closedAt?: number;
  tag: string; musicDataType: string; categorySetId?: number;
  ruby?: string; phonetic?: string; lyricist?: string; composer?: string; arranger?: string; howToGet?: string;
}
export interface MasterDifficulty {
  musicId: number; difficulty: string; playLevel: number; publishedAt?: number;
  enableSpecialNotes?: boolean; notesQuantity?: number;
}
export interface MasterCategory { id: number; seq: number; category: string; categoryName: string; categoryColor?: string; mediumCategoryColor?: string }
export interface MasterVideo { musicId: number; assetBundleName: string; startAt?: number; endAt?: number; seq?: number; musicStartDelayMilliseconds?: number }
export interface OfficialMaster {
  masterMusicList: { entries: MasterSong[] };
  masterMusicDifficultyList: { entries: MasterDifficulty[] };
  masterBandMap: { entries: Record<string, { bandId: number; bandName: string }> };
  masterMusicLargeCategoryDataMap: { entries: Record<string, MasterCategory> };
  masterMusicMediumCategoryDataMap: { entries: Record<string, MasterCategory> };
  masterMusicCategoryInfoMap: { entries: Record<string, { id: number; targetType: string; largeCategoryId: number; mediumCategoryId?: number }> };
  masterMusicCategoryInfoTargets: { musicCategoryIdList: number[] };
  masterMusicCategorySetMap: { entries: Record<string, { id: number; musicCategoryInfoIdList: number[] }> };
  masterMusicVideoListMap: { entries: Record<string, { entries: MasterVideo[] }> };
  masterMusicJacketMap: { entries: Record<string, { entries: { musicId: number; jacketImage: string; seq: number; startAt?: number; endAt?: number }[] }> };
  masterMusicVideo3dMap: { entries: Record<string, { musicVideo3dId: number; musicId: number; startAt?: number; endAt?: number }> };
  masterMusicVideo3dIdListMap: { entries: Record<string, { entries: number[] }> };
}
export interface OfficialMasterSnapshot { clientVersion: string; dataVersion: string; masterDataVersion: string; master: OfficialMaster }
interface AppVersion { clientVersion: string; dataVersion: string; masterDataVersion: string; appStatus: string; clientStatus: string }
const versionPattern = /^\d+(?:\.\d+){1,5}$/;
const masterVersionPattern = /^\d+(?:\.\d+){0,5}$/;
export function validateOfficialMaster(master: OfficialMaster): void {
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
export async function refreshOfficialMaster(previous?: OfficialMasterSnapshot, server: OfficialServer = "jp"): Promise<OfficialMasterSnapshot> {
  let clientVersion = previous?.clientVersion ?? protocols[server].clientVersion;
  const request = async <T>(args: Record<string, string>, stage: string): Promise<T> => {
    try { return await invokeTauriCommand<T>("official_music_request", args); }
    catch (error) { throw new Error(`${server} ${stage}失败：${String(error)}`); }
  };
  const requestVersion = () => request<AppVersion>({ clientVersion, server }, "主表版本检查");
  let version = await requestVersion();
  if (version.clientVersion !== clientVersion) {
    if (!versionPattern.test(version.clientVersion)) throw new Error("原作返回无效客户端版本");
    clientVersion = version.clientVersion;
    version = await requestVersion();
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
  if (previous && previous.masterDataVersion === version.masterDataVersion && previous.dataVersion === version.dataVersion && previous.clientVersion === clientVersion) {
    validateOfficialMaster(previous.master);
    return { ...previous, clientVersion, dataVersion: version.dataVersion };
  }
  const master = await request<OfficialMaster>({
    clientVersion, dataVersion: version.dataVersion, masterVersion: version.masterDataVersion, server,
  }, "主表下载");
  validateOfficialMaster(master);
  appLog("info", "official.master-update-validated", { server, masterDataVersion: version.masterDataVersion, songs: master.masterMusicList.entries.length });
  return { clientVersion, dataVersion: version.dataVersion, masterDataVersion: version.masterDataVersion, master };
}
