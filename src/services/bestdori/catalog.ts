import bgTypeRipMapJson from "../../data/bg-type-rip-map.json";
import directionalSeTypeRipMapJson from "../../data/directional-se-type-rip-map.json";
import directionalTypeRipMapJson from "../../data/directional-type-rip-map.json";
import fieldTypeRipMapJson from "../../data/field-type-rip-map.json";
import habahiroTypeRipMapJson from "../../data/habahiro-type-rip-map.json";
import rhythmSeTypeRipMapJson from "../../data/rhythm-se-type-rip-map.json";
import rhythmTypeRipMapJson from "../../data/rhythm-type-rip-map.json";
import {
  BESTDORI_ASSET_SERVERS,
  DEFAULT_BESTDORI_ASSET_SERVER,
  fetchBestdoriJson,
  type BestdoriAssetFamily,
  type BestdoriAssetServer,
} from "./api";

type TypeRipMapEntry = {
  type: string;
  ripName: string;
};

type BestdoriInfoEntry = {
  assetBundleName?: unknown;
  skinName?: unknown;
};

type BestdoriAssetsInfo = {
  ingameskin?: {
    noteskin?: Record<string, unknown>;
    fieldskin?: Record<string, unknown>;
    bgskin?: Record<string, unknown>;
  };
  sound?: {
    tapseskin?: Record<string, unknown>;
  };
};

export type BestdoriCatalogKind =
  | "rhythm"
  | "habahiroRhythm"
  | "directional"
  | "rhythmSe"
  | "directionalSe"
  | "bg"
  | "field";

export interface BestdoriCatalogResource {
  server: BestdoriAssetServer;
  family: BestdoriAssetFamily;
  id: string;
  title: string;
}

export interface BestdoriSkinCatalogOptions {
  rhythm: string[];
  habahiroRhythm: string[];
  directional: string[];
  rhythmSe: string[];
  directionalSe: string[];
  bg: string[];
  field: string[];
  labels: Record<string, string>;
  resources: Record<BestdoriCatalogKind, Record<string, BestdoriCatalogResource>>;
}

const fallbackMaps = {
  rhythm: rhythmTypeRipMapJson as TypeRipMapEntry[],
  habahiroRhythm: habahiroTypeRipMapJson as TypeRipMapEntry[],
  directional: directionalTypeRipMapJson as TypeRipMapEntry[],
  rhythmSe: rhythmSeTypeRipMapJson as TypeRipMapEntry[],
  directionalSe: directionalSeTypeRipMapJson as TypeRipMapEntry[],
  bg: bgTypeRipMapJson as TypeRipMapEntry[],
  field: fieldTypeRipMapJson as TypeRipMapEntry[],
} as const;

let cachedCatalogPromise: Promise<BestdoriSkinCatalogOptions> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readResourceMap(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function cleanId(id: string): string {
  return id
    .replace(/^directionalflickskin_?/i, "")
    .replace(/^skin_?/i, "")
    .replace(/^_+/, "")
    .replace(/_/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fallbackTitle(id: string): string {
  return titleCase(cleanId(id)) || id;
}

function readSkinNames(entry: BestdoriInfoEntry | undefined): string[] {
  if (!Array.isArray(entry?.skinName)) {
    return [];
  }
  return entry.skinName.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getInfoTitle(info: Record<string, BestdoriInfoEntry>, id: string, aliases: string[] = []): string {
  const ids = new Set([id, ...aliases]);
  for (const entry of Object.values(info)) {
    const assetBundleName = typeof entry.assetBundleName === "string" ? entry.assetBundleName : "";
    if (!ids.has(assetBundleName)) {
      continue;
    }
    const [name] = readSkinNames(entry);
    if (name) {
      return name;
    }
  }
  return fallbackTitle(id);
}

function collectByServer(
  assets: BestdoriAssetsInfo[],
  getter: (asset: BestdoriAssetsInfo) => Record<string, unknown>,
): Map<string, BestdoriAssetServer> {
  const output = new Map<string, BestdoriAssetServer>();
  for (let index = 0; index < BESTDORI_ASSET_SERVERS.length; index += 1) {
    const server = BESTDORI_ASSET_SERVERS[index];
    const names = Object.keys(getter(assets[index] ?? {}));
    for (const name of names) {
      if (!output.has(name)) {
        output.set(name, server);
      }
    }
  }
  return output;
}

function serverPriority(server: BestdoriAssetServer): number {
  return BESTDORI_ASSET_SERVERS.indexOf(server);
}

function idPriority(id: string): number {
  if (id === "skin00" || id === "directionalflickskin00") {
    return 0;
  }
  if (/^(?:directionalflick)?skin\d+$/i.test(id)) {
    return 1;
  }
  return 2;
}

function makeResource(
  id: string,
  server: BestdoriAssetServer,
  family: BestdoriAssetFamily,
  title: string,
): BestdoriCatalogResource {
  return { id, server, family, title };
}

function sortResources(resources: BestdoriCatalogResource[]): BestdoriCatalogResource[] {
  return [...resources].sort(
    (a, b) =>
      serverPriority(a.server) - serverPriority(b.server)
      || idPriority(a.id) - idPriority(b.id)
      || a.id.localeCompare(b.id),
  );
}

function mergeResources(
  primary: BestdoriCatalogResource[],
  fallback: BestdoriCatalogResource[],
): BestdoriCatalogResource[] {
  const output = new Map<string, BestdoriCatalogResource>();
  for (const item of fallback) {
    output.set(item.id, item);
  }
  for (const item of primary) {
    output.set(item.id, item);
  }
  return sortResources([...output.values()]);
}

function fallbackResources(kind: keyof typeof fallbackMaps, family: BestdoriAssetFamily): BestdoriCatalogResource[] {
  return fallbackMaps[kind].map((entry) =>
    makeResource(entry.ripName, DEFAULT_BESTDORI_ASSET_SERVER, family, entry.type),
  );
}

function buildOptions(groups: Record<BestdoriCatalogKind, BestdoriCatalogResource[]>): BestdoriSkinCatalogOptions {
  const labels: Record<string, string> = {};
  const resources = {} as Record<BestdoriCatalogKind, Record<string, BestdoriCatalogResource>>;
  for (const [kind, list] of Object.entries(groups) as [BestdoriCatalogKind, BestdoriCatalogResource[]][]) {
    resources[kind] = {};
    for (const item of list) {
      resources[kind][item.id] = item;
      labels[item.id] = item.title;
    }
  }
  return {
    rhythm: groups.rhythm.map((item) => item.id),
    habahiroRhythm: groups.habahiroRhythm.map((item) => item.id),
    directional: groups.directional.map((item) => item.id),
    rhythmSe: groups.rhythmSe.map((item) => item.id),
    directionalSe: groups.directionalSe.map((item) => item.id),
    bg: groups.bg.map((item) => item.id),
    field: groups.field.map((item) => item.id),
    labels,
    resources,
  };
}

export function buildFallbackBestdoriSkinCatalogOptions(): BestdoriSkinCatalogOptions {
  return buildOptions({
    rhythm: fallbackResources("rhythm", "noteskin"),
    habahiroRhythm: fallbackResources("habahiroRhythm", "noteskin"),
    directional: fallbackResources("directional", "noteskin"),
    rhythmSe: fallbackResources("rhythmSe", "tapseskin"),
    directionalSe: fallbackResources("directionalSe", "tapseskin"),
    bg: fallbackResources("bg", "bgskin"),
    field: fallbackResources("field", "fieldskin"),
  });
}

async function loadCatalogOptions(): Promise<BestdoriSkinCatalogOptions> {
  const fallback = buildFallbackBestdoriSkinCatalogOptions();
  try {
    const [assets, noteInfo, directionalInfo, fieldInfo, effectInfo, backgroundInfo] = await Promise.all([
      Promise.all(
        BESTDORI_ASSET_SERVERS.map((server) =>
          fetchBestdoriJson<BestdoriAssetsInfo>(`/api/explorer/${server}/assets/_info.json`, `bestdori ${server} assets info`),
        ),
      ),
      fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/notes.all.3.json", "bestdori note skin names"),
      fetchBestdoriJson<Record<string, BestdoriInfoEntry>>(
        "/api/skin/directionalFlicks.all.3.json",
        "bestdori directional skin names",
      ),
      fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/lanes.all.3.json", "bestdori lane skin names"),
      fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/effects.all.3.json", "bestdori effect skin names"),
      fetchBestdoriJson<Record<string, BestdoriInfoEntry>>(
        "/api/skin/backgrounds.all.3.json",
        "bestdori background names",
      ),
    ]);
    const noteskinByServer = collectByServer(assets, (asset) => readResourceMap(asset.ingameskin?.noteskin));
    const fieldskinByServer = collectByServer(assets, (asset) => readResourceMap(asset.ingameskin?.fieldskin));
    const bgskinByServer = collectByServer(assets, (asset) => readResourceMap(asset.ingameskin?.bgskin));
    const tapseskinByServer = collectByServer(assets, (asset) => readResourceMap(asset.sound?.tapseskin));

    const rhythms = [...noteskinByServer.entries()]
      .filter(([id]) => !id.startsWith("directionalflick") && !id.endsWith("sample") && id !== "habahiro")
      .map(([id, server]) => makeResource(id, server, "noteskin", getInfoTitle(noteInfo, id)));
    const habahiroRhythm = [...noteskinByServer.entries()]
      .filter(([id]) => id === "habahiro")
      .map(([id, server]) => makeResource(id, server, "noteskin", getInfoTitle(noteInfo, id)));
    const directionals = [...noteskinByServer.entries()]
      .filter(([id]) => id.startsWith("directionalflick") && !id.endsWith("sample"))
      .map(([id, server]) =>
        makeResource(
          id,
          server,
          "noteskin",
          getInfoTitle(directionalInfo, id, [id.replace(/^directionalflick/, "")]),
        ),
      );
    const fields = [...fieldskinByServer.entries()]
      .map(([id, server]) => makeResource(id, server, "fieldskin", getInfoTitle(fieldInfo, id)));
    const rhythmSe = [...tapseskinByServer.entries()]
      .filter(([id]) => !id.startsWith("directionalflickskin"))
      .map(([id, server]) => makeResource(id, server, "tapseskin", getInfoTitle(effectInfo, id)));
    const directionalSe = [...tapseskinByServer.entries()]
      .filter(([id]) => id.startsWith("directionalflickskin"))
      .map(([id, server]) =>
        makeResource(
          id,
          server,
          "tapseskin",
          getInfoTitle(directionalInfo, id, [id.replace(/^directionalflick/, "")]),
        ),
      );
    const bg = [...bgskinByServer.entries()]
      .filter(([id]) => id.startsWith("skin") && !id.endsWith("preview"))
      .map(([id, server]) => makeResource(id, server, "bgskin", getInfoTitle(backgroundInfo, id)));

    return buildOptions({
      rhythm: mergeResources(rhythms, Object.values(fallback.resources.rhythm)),
      habahiroRhythm: mergeResources(habahiroRhythm, Object.values(fallback.resources.habahiroRhythm)),
      directional: mergeResources(directionals, Object.values(fallback.resources.directional)),
      rhythmSe: mergeResources(rhythmSe, Object.values(fallback.resources.rhythmSe)),
      directionalSe: mergeResources(directionalSe, Object.values(fallback.resources.directionalSe)),
      bg: mergeResources(bg, Object.values(fallback.resources.bg)),
      field: mergeResources(fields, Object.values(fallback.resources.field)),
    });
  } catch {
    return fallback;
  }
}

export function loadBestdoriSkinCatalogOptions(): Promise<BestdoriSkinCatalogOptions> {
  cachedCatalogPromise ??= loadCatalogOptions();
  return cachedCatalogPromise;
}
