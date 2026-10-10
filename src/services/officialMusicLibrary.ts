import { mergeOfficialMusic, type OfficialMasterSources, type MasterServer } from "./mergeOfficialMusic";
import { fetchOfficialSourceMedia, OFFICIAL_SERVER_ORDER, isOfficialServer, availableOfficialMedia, OFFICIAL_SERVER_INDEX, type OfficialSourceMedia } from "./officialMusicSources";
import { fetchBestdoriJson, fetchBestdoriFileBlob, buildBestdoriSongJacketUrl,
  type BestdoriSongInfo, type BestdoriBandsAll1, type BestdoriPerServerValue, type BestdoriSongServerName } from "./bestdori/api";
import { refreshOfficialMaster, validateOfficialMaster, type OfficialMasterSnapshot, type MasterSong } from "./officialMusicMaster";
import type { ApplicationResourceManager } from "../resources/applicationResourceManager";
import type { ResourceCatalogProvider } from "../resources/backend";
import { createResourceRef, resourceAccepted, resourceRejected, type NetworkResourceDescriptor,
  type ResourceConsumerLease, type ResourceResult } from "../resources/contracts";
import { appLog } from "../logging/applicationLogger";
import { detectUserMediaType } from "../resources/userMediaFormat";

export const OFFICIAL_DIFFICULTIES = ["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"] as const;
export type OfficialDifficulty = typeof OFFICIAL_DIFFICULTIES[number];
export interface OfficialSong {
  id: number; server: MasterServer; info: BestdoriSongInfo; title: string; artist: string; available: readonly OfficialDifficulty[];
  jacketSlot: string; previewSlot: string | null;
  master: MasterSong; hasMv: boolean; has3d: boolean; specialNotes: readonly OfficialDifficulty[];
}
interface LibraryMetadata {
  masters?: OfficialMasterSources; songServers?: Record<string, MasterServer>; difficultyServers?: Record<string, MasterServer>;
  version: 2; official: OfficialMasterSnapshot; index: Record<string, BestdoriSongInfo>; songs: Record<string, BestdoriSongInfo>;
  bands: BestdoriBandsAll1; previewUrls: Record<string, string>; jacketUrls?: Record<string, string>; capturedAt: number; sourceMedia?: OfficialSourceMedia;
}
export interface OfficialLibrary {
  songs: readonly OfficialSong[]; metadata: LibraryMetadata | null; lease: ResourceConsumerLease | null;
  error: string; mediaFailures: readonly string[];
}
const owner = "official-music";
function cachedSourceMedia(metadata: LibraryMetadata | undefined): OfficialSourceMedia | undefined {
  if (!metadata || metadata.sourceMedia) return metadata?.sourceMedia;
  const result: OfficialSourceMedia = { jackets: {}, previews: {}, audio: {} };
  for (const [family, urls] of [["jackets", metadata.jacketUrls], ["previews", metadata.previewUrls]] as const) {
    for (const [name, url] of Object.entries(urls ?? {})) {
      const match = new URL(url).pathname.match(/^\/assets\/(jp|cn|tw|en)\/(.+)$/);
      if (match && isOfficialServer(match[1]!)) result[family][name] = [{ server: match[1], logicalPath: match[2]!, url }];
    }
  }
  return result;
}
function accepted<T>(result: ResourceResult<T>): T {
  if (result.status === "rejected") throw new Error(`${result.failure.capability}: ${result.failure.boundary}`);
  return result.value;
}
function descriptor(path: string, url: string, kind: "json" | "image" | "audio", server: BestdoriSongServerName = "jp"): NetworkResourceDescriptor {
  return { ref: accepted(createResourceRef(`${owner}/${server}/${path}`)), origin: "network", kind, title: path,
    availability: "remote-only", files: null, catalogObservedAt: null,
    logicalPlacement: { provider: owner, server, canonicalPath: path, identityClass: "provider-package" },
    source: { provider: owner, server, family: "official-selection", nativeId: path,
      manifestUrl: null, assetBaseUrl: url } };
}
async function parallel<T>(values: readonly T[], action: (value: T) => Promise<void>, concurrency = 4) {
  let cursor = 0;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (failure === undefined && cursor < values.length) {
      try { await action(values[cursor++]!); } catch (error) { failure = error; }
    }
  }));
  if (failure !== undefined) throw failure;
}
export function officialText(values: readonly (string | null)[] | undefined): string {
  return values?.[3]?.trim() || OFFICIAL_SERVER_ORDER.map(server => values?.[OFFICIAL_SERVER_INDEX[server]]?.trim()).find(Boolean) || "";
}
export function officialAvailable(info: BestdoriSongInfo, now: number): OfficialDifficulty[] {
  return OFFICIAL_DIFFICULTIES.filter((_, index) => {
    const data = info.difficulty?.[String(index) as keyof typeof info.difficulty];
    const date = (data as { publishedAt?: (string | null)[] } | undefined)?.publishedAt;
    return !!data && (!date || OFFICIAL_SERVER_ORDER.some(server => { const value = date[OFFICIAL_SERVER_INDEX[server]]; return value != null && Number(value) <= now; }));
  });
}
export function officialPublished(info: BestdoriSongInfo, now: number): boolean {
  return OFFICIAL_SERVER_ORDER.some(server => {
    const index = OFFICIAL_SERVER_INDEX[server], start = info.publishedAt?.[index];
    return start != null && includedInOfficialLibrary(Number(start), info.closedAt?.[index] == null ? undefined : Number(info.closedAt[index]), info.musicDataType, now);
  });
}
function includedInOfficialLibrary(start: number, end: number | undefined, type: string | undefined, now: number): boolean {
  // Editor archive access: retain released event scores under their own music IDs.
  // This does not reopen the original event or expose unpublished songs/difficulties.
  return start <= now && (type === "collabo_original" || !end || end > now);
}

/** One startup-owned snapshot. Selection consumers never fetch or refresh it. */
let library: OfficialLibrary | undefined;
let pending: Promise<OfficialLibrary> | undefined;
export function getOfficialMusicLibrary(): OfficialLibrary {
  if (!library) throw new Error("官方曲库尚未完成启动初始化");
  return library;
}
export function bootstrapOfficialMusic(manager: ApplicationResourceManager, progress: (ratio: number) => void = () => {}) {
  return pending ??= initialize(manager, progress).catch(error => {
    appLog("error", "official.startup-failed", { error });
    return { songs: [], metadata: null, lease: null, error: String(error), mediaFailures: [] };
  }).then(result => library = result);
}
async function initialize(manager: ApplicationResourceManager, progress: (ratio: number) => void): Promise<OfficialLibrary> {
  let previous: LibraryMetadata | undefined;
  const metadataDescriptor = descriptor("catalog-v3", "https://api.garupa.jp/api/application", "json");
  let metadata: LibraryMetadata | undefined;
  let refreshFailure = "";
  const provider: ResourceCatalogProvider = {
    provider: owner,
    refresh: async () => resourceRejected("catalog-unavailable", "official.startup-only", "Official metadata refresh is owned by startup."),
    validatePackageFiles: (_, paths) => paths.length === 1 && paths[0] === "payload"
      ? resourceAccepted(undefined) : resourceRejected("invalid-resource-request", "official.incomplete-cache", "Expected one payload."),
    install: async resource => {
      try {
        let bytes: Uint8Array, mediaType: string;
        if (resource.ref.id === metadataDescriptor.ref.id) {
          const masters = Object.fromEntries(await Promise.all(OFFICIAL_SERVER_ORDER.map(async server => [server,
            await refreshOfficialMaster(previous?.masters?.[server] ?? (server === "jp" && !previous?.masters ? previous?.official : undefined), server),
          ] as const))) as Record<MasterServer, OfficialMasterSnapshot>;
          const { jp, cn } = masters;
          const capturedAt = Date.now();
          const merged = mergeOfficialMusic(masters, capturedAt);
          const official = { ...jp, master: merged.master };
          const cnSongs = new Map(cn.master.masterMusicList.entries.map(song => [song.musicId, song]));
          const [index, bands, sourceMedia] = await Promise.all([
            fetchBestdoriJson<Record<string, BestdoriSongInfo>>("/api/songs/all.8.json"),
            fetchBestdoriJson<BestdoriBandsAll1>("/api/bands/all.1.json"),
            fetchOfficialSourceMedia(cachedSourceMedia(previous)),
          ]);
          if (!index || !bands) throw new Error("官方曲库响应格式无效");
          const songs: Record<string, BestdoriSongInfo> = {};
          const localize = (value: string | undefined, values?: BestdoriPerServerValue<string>, server: MasterServer = "jp"): BestdoriPerServerValue<string> => {
            const result: BestdoriPerServerValue<string> = [values?.[0] ?? null, values?.[1] ?? null, values?.[2] ?? null, values?.[3] ?? null, values?.[4] ?? null];
            if (value !== undefined) result[OFFICIAL_SERVER_INDEX[server]] = value;
            return result;
          };
          for (const band of Object.values(official.master.masterBandMap.entries)) {
            let names = bands[String(band.bandId)]?.bandName;
            for (const server of OFFICIAL_SERVER_ORDER) names = localize(masters[server].master.masterBandMap.entries[String(band.bandId)]?.bandName, names, server);
            bands[String(band.bandId)] = { ...bands[String(band.bandId)], bandName: names! };
          }
          const difficulties = new Map<number, typeof official.master.masterMusicDifficultyList.entries>();
          for (const row of official.master.masterMusicDifficultyList.entries) {
            const list = difficulties.get(row.musicId) ?? []; list.push(row); difficulties.set(row.musicId, list);
          }
          for (const row of official.master.masterMusicList.entries) {
            if (!includedInOfficialLibrary(row.publishedAt, row.closedAt, row.musicDataType, capturedAt)) continue;
            const id = String(row.musicId), extra = index[id];
            const server = merged.songServers[id]!;
            const chinese = cnSongs.get(row.musicId);
            const text = (key: "musicTitle" | "ruby" | "phonetic" | "lyricist" | "composer" | "arranger" | "howToGet") => {
              const values = localize(row[key], extra?.[key], server);
              return chinese?.[key] ? localize(chinese[key], values, "cn") : values;
            };
            const difficulty = {} as BestdoriSongInfo["difficulty"];
            for (const diff of difficulties.get(row.musicId) ?? []) {
              const key = String(OFFICIAL_DIFFICULTIES.indexOf(diff.difficulty.toUpperCase() as OfficialDifficulty)) as keyof typeof difficulty;
              difficulty[key] = { ...extra?.difficulty?.[key], ...diff,
                publishedAt: localize(String(diff.publishedAt ?? 0), undefined, merged.difficultyServers[`${row.musicId}:${diff.difficulty}`]!) };
            }
            const videos: NonNullable<BestdoriSongInfo["musicVideos"]> = {};
            for (const video of (official.master.masterMusicVideoListMap.entries[id]?.entries ?? [])) {
              if (!inPeriod(video.startAt, video.endAt, capturedAt)) continue;
              videos[video.assetBundleName] = { ...video, startAt: localize(String(video.startAt ?? 0), undefined, server), endAt: localize(String(video.endAt ?? 0), undefined, server) };
            }
            songs[id] = { ...extra, bgmId: row.bgmId, bgmFile: row.bgmFile, bandId: row.bandId,
              tag: row.tag, musicDataType: row.musicDataType, seq: row.seq, achievements: [],
              jacketImage: (official.master.masterMusicJacketMap.entries[id]?.entries ?? [])
                .filter(jacket => inPeriod(jacket.startAt, jacket.endAt, capturedAt)).sort((a, b) => a.seq - b.seq).map(jacket => jacket.jacketImage),
              musicTitle: text("musicTitle"), ruby: text("ruby"),
              phonetic: text("phonetic"), lyricist: text("lyricist"),
              composer: text("composer"), arranger: text("arranger"),
              howToGet: text("howToGet"), publishedAt: localize(String(row.publishedAt), undefined, server),
              closedAt: localize(row.closedAt ? String(row.closedAt) : undefined, undefined, server),
              difficulty, musicVideos: videos, musicVideo: undefined,
              length: extra?.length ?? 0, notes: extra?.notes ?? {}, bpm: extra?.bpm ?? {} };
          }
          if (!Object.keys(songs).length) throw new Error("官方主表未返回可用于当前列表的歌曲");
          progress(0.2);
          const previewUrls = Object.fromEntries(Object.entries(sourceMedia.previews).map(([key, values]) => [key, values[0]!.url]));
          const jacketUrls = Object.fromEntries(Object.entries(sourceMedia.jackets).map(([key, values]) => [key, values[0]!.url]));
          metadata = { version: 2, official, masters, songServers: merged.songServers, difficultyServers: merged.difficultyServers, index, songs, bands, previewUrls, jacketUrls, sourceMedia, capturedAt };
          bytes = new TextEncoder().encode(JSON.stringify(metadata)); mediaType = "application/json";
        } else {
          const blob = await fetchBestdoriFileBlob(resource.source.assetBaseUrl,
            resource.kind === "audio" ? "audio/mpeg" : "image/png", "官方选曲资源");
          bytes = new Uint8Array(await blob.arrayBuffer());
          mediaType = detectUserMediaType(bytes) ?? "";
          if (!mediaType.startsWith(resource.kind === "audio" ? "audio/" : "image/"))
            throw new Error(`官方资源未返回有效的${resource.kind === "audio" ? "音频" : "图片"}：${resource.source.assetBaseUrl}`);
        }
        return resourceAccepted({ descriptor: resource, files: [{ logicalPath: "payload", mediaType, bytes }] });
      } catch (error) {
        // A master update can fail before the media manifests are requested.
        // Keep the complete old master, but independently repair its media index.
        if (resource.ref.id === metadataDescriptor.ref.id && previous) {
          refreshFailure = String(error);
          appLog("warn", "official.catalog-offline", { error: refreshFailure });
          try {
            const sourceMedia = await fetchOfficialSourceMedia(cachedSourceMedia(previous));
            metadata = { ...previous, sourceMedia };
            return resourceAccepted({ descriptor: resource, files: [{ logicalPath: "payload", mediaType: "application/json",
              bytes: new TextEncoder().encode(JSON.stringify(metadata)) }] });
          } catch (repairError) {
            appLog("warn", "official.media-catalog-repair-failed", { error: repairError });
          }
        }
        return resourceRejected("catalog-unavailable", "official.download-failed", String(error));
      }
    },
  };
  accepted(manager.registerCatalogProvider(provider));
  accepted(manager.registerNetworkResource(metadataDescriptor));
  // Read an installed record without initiating an implicit network refresh.
  const cached = accepted(await manager.listResources({ provider: owner })).find(item => item.ref.id === metadataDescriptor.ref.id && item.files !== null);
  if (cached) {
    try {
      const receipt = accepted(await manager.createSnapshotFromRefs({ catalog: cached.ref }));
      const lease = accepted(await manager.acquireSnapshot(receipt.snapshotId));
      try {
        const value = JSON.parse(new TextDecoder().decode(await lease.readBytes("catalog", "payload"))) as LibraryMetadata;
        if (value.version !== 2 || !value.official) throw new Error("官方缓存版本无效");
        validateOfficialMaster(value.official.master);
        for (const source of Object.values(value.masters ?? {})) validateOfficialMaster(source.master);
        previous = value;
      }
      finally { await lease.release(); }
    } catch (error) { appLog("warn", "official.catalog-cache-invalid", { error }); }
  }
  let error = "";
  try { accepted(await manager.ensureAvailable(metadataDescriptor.ref, { refresh: true })); error = refreshFailure; }
  catch (failure) { error = String(failure); metadata = previous; appLog("warn", "official.catalog-offline", { error }); }
  if (!metadata) return { songs: [], metadata: null, lease: null, error, mediaFailures: [] };
  for (const failure of metadata.sourceMedia?.failures ?? []) {
    appLog("warn", "official.media-catalog-incomplete", { failure });
  }
  const songs: OfficialSong[] = [];
  const startupTime = Date.now();
  const masterSongs = new Map(metadata.official.master.masterMusicList.entries.map(song => [song.musicId, song]));
  const resources = new Map<string, { candidates: NetworkResourceDescriptor[]; slot: string }>();
  const missingJackets: string[] = [];
  for (const [id, info] of Object.entries(metadata.songs)) {
    if (!officialPublished(info, startupTime)) continue;
    const available = officialAvailable(info, startupTime);
    if (!available.length) continue;
    const jacketName = info.jacketImage[info.jacketImage.length - 1]?.toLowerCase() ?? "";
    const legacyLocation = (url: string | undefined) => {
      if (!url) return [];
      const match = new URL(url).pathname.match(/^\/assets\/(jp|cn|tw|en|kr)\/(.+)$/);
      if (!match) throw new Error(`官方缓存资源路径无效：${url}`);
      return isOfficialServer(match[1]!) ? [{ server: match[1], logicalPath: match[2]!, url }] : [];
    };
    const jackets = availableOfficialMedia(metadata.sourceMedia?.jackets[jacketName] ?? legacyLocation(metadata.jacketUrls
      ? metadata.jacketUrls[jacketName] : buildBestdoriSongJacketUrl(Number(id), info)));
    const jacketSlot = `jacket.${id}`;
    if (jackets.length) {
      resources.set(jacketSlot, { candidates: jackets.map(value => descriptor(value.logicalPath, value.url, "image", value.server)), slot: jacketSlot });
    } else {
      missingJackets.push(jacketSlot);
      appLog("warn", "official.media-unavailable", { slot: jacketSlot, error: "封面未收录在资源站清单中", jacketName });
    }
    const previews = availableOfficialMedia(metadata.sourceMedia?.previews[info.bgmId] ?? legacyLocation(metadata.previewUrls[info.bgmId]));
    const previewSlot = previews.length ? `preview.${id}` : null;
    if (previewSlot) resources.set(previewSlot, { slot: previewSlot,
      candidates: previews.map(value => descriptor(value.logicalPath, value.url, "audio", value.server)) });
    const master = masterSongs.get(Number(id));
    if (!master) throw new Error(`官方缓存歌曲缺少主表记录：${id}`);
    songs.push({ id: Number(id), server: metadata.songServers?.[id] ?? "jp", info, master, title: officialText(info.musicTitle),
      hasMv: (metadata.official.master.masterMusicVideoListMap.entries[id]?.entries ?? []).some(video => inPeriod(video.startAt, video.endAt, startupTime)),
      has3d: (metadata.official.master.masterMusicVideo3dIdListMap.entries[id]?.entries ?? []).some(videoId => {
        const video = metadata!.official.master.masterMusicVideo3dMap.entries[String(videoId)];
        return !!video && inPeriod(video.startAt, video.endAt, startupTime);
      }),
      specialNotes: metadata.official.master.masterMusicDifficultyList.entries.filter(diff => diff.musicId === Number(id) && diff.enableSpecialNotes)
        .map(diff => diff.difficulty.toUpperCase() as OfficialDifficulty).filter(diff => available.includes(diff)),
      artist: officialText(metadata.bands[String(info.bandId)]?.bandName), available, jacketSlot, previewSlot });
  }
  const bindings: Record<string, NetworkResourceDescriptor["ref"]> = {};
  const failures: string[] = [...missingJackets, ...songs.filter(song => !song.previewSlot).map(song => `preview.${song.id}`)];
  let complete = 0;
  await parallel([...resources.values()], async ({ candidates, slot }) => {
    const attempts: string[] = [];
    for (const resource of candidates) {
      try {
        accepted(manager.registerNetworkResource(resource));
        accepted(await manager.ensureAvailable(resource.ref));
        bindings[slot] = resource.ref;
        break;
      } catch (failure) {
        attempts.push(`${resource.source.server}: ${String(failure)}`);
      }
    }
    if (!bindings[slot]) {
      failures.push(slot);
      appLog("warn", "official.media-unavailable", { slot, attempts });
    } else if (attempts.length) {
      appLog("info", "official.media-fallback", { slot, selected: bindings[slot].id, attempts });
    }
    progress(0.25 + ++complete / resources.size * 0.75);
  });
  let lease: ResourceConsumerLease | null = null;
  if (Object.keys(bindings).length) {
    const receipt = accepted(await manager.createSnapshotFromRefs(bindings));
    lease = accepted(await manager.acquireSnapshot(receipt.snapshotId));
  }
  appLog("info", "official.startup-ready", { songs: songs.length, media: resources.size, failures: failures.length, offline: !!error });
  return { songs, metadata, lease, error, mediaFailures: failures };
}
function inPeriod(start: number | undefined, end: number | undefined, now: number) {
  return (!start || start <= now) && (!end || end > now);
}
