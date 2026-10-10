import { fetchBestdoriJson, type BestdoriSongServerName } from "./bestdori/api";

export const OFFICIAL_SERVER_ORDER = ["jp", "cn", "tw", "en"] as const;
export type OfficialServer = typeof OFFICIAL_SERVER_ORDER[number];
export function isOfficialServer(server: string): server is OfficialServer {
  return (OFFICIAL_SERVER_ORDER as readonly string[]).includes(server);
}
export function availableOfficialMedia(values: readonly OfficialMediaLocation[]): OfficialMediaLocation[] {
  return values.filter(value => isOfficialServer(value.server))
    .sort((a, b) => OFFICIAL_SERVER_ORDER.indexOf(a.server as OfficialServer) - OFFICIAL_SERVER_ORDER.indexOf(b.server as OfficialServer)
      || (a.logicalPath < b.logicalPath ? -1 : a.logicalPath > b.logicalPath ? 1 : 0)
      || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}
export const OFFICIAL_SERVER_INDEX = { jp: 0, cn: 3, tw: 2, en: 1, kr: 4 } as const;
export interface OfficialMediaLocation {
  server: BestdoriSongServerName;
  url: string;
  logicalPath: string;
}
export interface OfficialSourceMedia {
  jackets: Record<string, OfficialMediaLocation[]>;
  previews: Record<string, OfficialMediaLocation[]>;
  audio: Record<string, OfficialMediaLocation[]>;
  failures?: string[];
}

/** Resolve provider filenames independently in each region; never derive jacket
 * bundles from song IDs or let a later region overwrite a higher-priority one. */
export async function fetchOfficialSourceMedia(previous?: OfficialSourceMedia): Promise<OfficialSourceMedia> {
  const result: OfficialSourceMedia = { jackets: {}, previews: {}, audio: {}, failures: [] };
  const retain = (server: OfficialServer, prefix = "") => {
    for (const family of ["jackets", "previews", "audio"] as const) {
      for (const [name, locations] of Object.entries(previous?.[family] ?? {})) {
        const matches = locations.filter(value => value.server === server && value.logicalPath.startsWith(prefix));
        if (matches.length) (result[family][name] ??= []).push(...matches);
      }
    }
  };
  for (const server of OFFICIAL_SERVER_ORDER) {
    const endpoint = `/api/explorer/${server}/assets/_info.json`;
    let assets: Record<string, Record<string, unknown>>;
    try {
      assets = await fetchBestdoriJson<typeof assets>(endpoint);
      if (!assets?.musicjacket || !assets.musicscore || !assets.sound) throw new Error("官方资源目录无效");
    } catch (error) {
      result.failures!.push(`${endpoint}: ${String(error)}`);
      retain(server);
      continue;
    }
    const jobs = [
      ...Object.keys(assets.musicjacket).sort().map(folder => ({ family: "musicjacket", folder })),
      ...Object.keys(assets.musicscore).sort().map(folder => ({ family: "musicscore", folder })),
    ];
    let cursor = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < jobs.length) {
        const { family, folder } = jobs[cursor++]!;
        const endpoint = `/api/explorer/${server}/assets/${family}/${folder}.json`;
        let files: string[];
        try {
          files = await fetchBestdoriJson<string[]>(endpoint);
          if (!Array.isArray(files) || files.some(file => typeof file !== "string")) throw new Error("资源清单无效");
        } catch (error) {
          result.failures!.push(`${endpoint}: ${String(error)}`);
          retain(server, `${family}/${folder}_rip/`);
          continue;
        }
        const prefix = `assets-star-forassetbundle-startapp-musicjacket-${folder}-`;
        for (const file of files) {
          const name = family === "musicjacket"
            ? file.startsWith(prefix) && file.endsWith("-jacket.png") ? file.slice(prefix.length, -11).toLowerCase() : null
            : /^(bgm[\w-]+)_chorus\.mp3$/.exec(file)?.[1];
          if (!name) continue;
          const index = family === "musicjacket" ? result.jackets : result.previews;
          const location = { server, logicalPath: `${family}/${folder}_rip/${encodeURIComponent(file)}`,
            url: `https://bestdori.com/assets/${server}/${family}/${folder}_rip/${encodeURIComponent(file)}` };
          const matches = index[name] ??= [];
          // Provider bundles may repeat the same asset (e.g. bgm177 in both
          // musicscore180 and musicscore190). Keep each URL as a fallback.
          if (!matches.some(value => value.url === location.url)) matches.push(location);
        }
      }
    }));
    for (const folder of Object.keys(assets.sound)) {
      if (!/^bgm[\w-]+$/.test(folder)) continue;
      (result.audio[folder] ??= []).push({ server, logicalPath: `sound/${folder}/${folder}.mp3`,
        url: `https://bestdori.com/assets/${server}/sound/${folder}_rip/${folder}.mp3` });
    }
  }
  // Worker completion order must not change the persisted candidate priority.
  for (const index of [result.jackets, result.previews, result.audio]) {
    for (const name of Object.keys(index)) index[name] = availableOfficialMedia(index[name]!);
  }
  result.failures!.sort();
  return result;
}
