import { validateOfficialMaster, type OfficialMaster, type OfficialMasterSnapshot } from "./officialMusicMaster";
import { OFFICIAL_SERVER_ORDER, type OfficialServer } from "./officialMusicSources";

export type MasterServer = OfficialServer;
export type OfficialMasterSources = Partial<Record<MasterServer, OfficialMasterSnapshot>>;
export function mergeOfficialMusic(sources: OfficialMasterSources, now: number) {
  const ordered = OFFICIAL_SERVER_ORDER
    .flatMap(server => sources[server] ? [{ server, master: sources[server]!.master }] : []);
  if (!ordered.length) throw new Error("没有可用的完整官方主表");
  const master: OfficialMaster = structuredClone(ordered[0]!.master);
  master.masterMusicList.entries = [];
  master.masterMusicDifficultyList.entries = [];
  master.masterMusicJacketMap.entries = {};
  master.masterMusicVideoListMap.entries = {};
  master.masterMusicVideo3dMap.entries = {};
  master.masterMusicVideo3dIdListMap.entries = {};
  master.masterMusicLargeCategoryDataMap.entries = {};
  master.masterMusicMediumCategoryDataMap.entries = {};
  master.masterMusicCategoryInfoMap.entries = {};
  master.masterMusicCategorySetMap.entries = {};
  master.masterMusicCategoryInfoTargets.musicCategoryIdList = [];
  master.masterBandMap.entries = {};
  const songServers: Record<string, MasterServer> = {}, difficultyServers: Record<string, MasterServer> = {};
  const largeKeys = new Map<string, number>(), mediumKeys = new Map<string, number>(), infoKeys = new Map<string, number>();
  const targets = new Set<number>();
  for (const { server, master: source } of ordered) {
    validateOfficialMaster(source);
    const largeIds = new Map<number, number>(), mediumIds = new Map<number, number>(), infoIds = new Map<number, number>();
    for (const [input, output, keys, ids] of [
      [source.masterMusicLargeCategoryDataMap, master.masterMusicLargeCategoryDataMap, largeKeys, largeIds],
      [source.masterMusicMediumCategoryDataMap, master.masterMusicMediumCategoryDataMap, mediumKeys, mediumIds],
    ] as const) for (const row of Object.values(input.entries)) {
      let id = keys.get(row.category);
      if (id === undefined) { id = keys.size + 1; keys.set(row.category, id); output.entries[String(id)] = { ...row, id }; }
      ids.set(row.id, id);
    }
    for (const row of Object.values(source.masterMusicCategoryInfoMap.entries)) {
      const largeCategoryId = largeIds.get(row.largeCategoryId)!;
      const mediumCategoryId = row.mediumCategoryId ? mediumIds.get(row.mediumCategoryId) : undefined;
      const key = `${row.targetType}:${largeCategoryId}:${mediumCategoryId ?? 0}`;
      let id = infoKeys.get(key);
      if (id === undefined) {
        id = infoKeys.size + 1; infoKeys.set(key, id);
        master.masterMusicCategoryInfoMap.entries[String(id)] = { ...row, id, largeCategoryId, mediumCategoryId };
      }
      infoIds.set(row.id, id);
    }
    for (const id of source.masterMusicCategoryInfoTargets.musicCategoryIdList) targets.add(infoIds.get(id)!);
    for (const [id, row] of Object.entries(source.masterBandMap.entries)) master.masterBandMap.entries[id] ??= { ...row };
    const eligible = new Set<number>();
    for (const song of source.masterMusicList.entries) {
      if (song.publishedAt > now || song.musicDataType !== "collabo_original" && song.closedAt && song.closedAt <= now) continue;
      eligible.add(song.musicId);
      const id = String(song.musicId);
      if (songServers[id]) continue;
      songServers[id] = server;
      let categorySetId: number | undefined;
      if (song.categorySetId) {
        categorySetId = Object.keys(master.masterMusicCategorySetMap.entries).length + 1;
        master.masterMusicCategorySetMap.entries[String(categorySetId)] = { id: categorySetId,
          musicCategoryInfoIdList: source.masterMusicCategorySetMap.entries[String(song.categorySetId)]!.musicCategoryInfoIdList.map(value => infoIds.get(value)!) };
      }
      master.masterMusicList.entries.push({ ...song, categorySetId });
      const jackets = source.masterMusicJacketMap.entries[id];
      master.masterMusicJacketMap.entries[id] = structuredClone(jackets ?? { entries: [] });
      master.masterMusicVideoListMap.entries[id] = structuredClone(source.masterMusicVideoListMap.entries[id] ?? { entries: [] });
      const entries: number[] = [];
      for (const videoId of source.masterMusicVideo3dIdListMap.entries[id]?.entries ?? []) {
        const next = Object.keys(master.masterMusicVideo3dMap.entries).length + 1;
        master.masterMusicVideo3dMap.entries[String(next)] = { ...source.masterMusicVideo3dMap.entries[String(videoId)]!, musicVideo3dId: next };
        entries.push(next);
      }
      master.masterMusicVideo3dIdListMap.entries[id] = { entries };
    }
    for (const row of source.masterMusicDifficultyList.entries) {
      if (!eligible.has(row.musicId) || (row.publishedAt ?? 0) > now) continue;
      const key = `${row.musicId}:${row.difficulty}`;
      if (difficultyServers[key]) continue;
      difficultyServers[key] = server;
      master.masterMusicDifficultyList.entries.push({ ...row });
    }
  }
  master.masterMusicCategoryInfoTargets.musicCategoryIdList = [...targets];
  validateOfficialMaster(master);
  return { master, songServers, difficultyServers };
}
