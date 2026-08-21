import type {
  ResourceCatalogProvider,
  ResourceInstallInput,
  ResourceInstallFile,
} from "../backend";
import {
  createResourceRef,
  resourceAccepted,
  resourceRejected,
  type NetworkResourceDescriptor,
  type ResourceCatalogSnapshot,
  type ResourceResult,
} from "../contracts";
import { observeResourceIntegrity } from "../sha256";
import {
  BESTDORI_ASSET_SERVERS,
  fetchBestdoriFileBlob,
  fetchBestdoriJson,
  type BestdoriAssetFamily,
  type BestdoriAssetServer,
} from "../../services/bestdori/api";

interface BestdoriInfoEntry {
  readonly assetBundleName?: unknown;
  readonly skinName?: unknown;
}

interface BestdoriAssetsInfo {
  readonly ingameskin?: {
    readonly noteskin?: Record<string, unknown>;
    readonly fieldskin?: Record<string, unknown>;
    readonly bgskin?: Record<string, unknown>;
    readonly judgeskin?: Record<string, unknown>;
  };
  readonly sound?: {
    readonly tapseskin?: Record<string, unknown>;
  };
}

interface BestdoriNames {
  readonly note: Record<string, BestdoriInfoEntry>;
  readonly directional: Record<string, BestdoriInfoEntry>;
  readonly field: Record<string, BestdoriInfoEntry>;
  readonly effect: Record<string, BestdoriInfoEntry>;
  readonly background: Record<string, BestdoriInfoEntry>;
}

export function createBestdoriNetworkMediaDescriptor(input: {
  readonly server: BestdoriAssetServer;
  readonly purpose: "bgm" | "cover" | "mv" | "stage-backdrop";
  readonly nativeId: string;
  readonly title: string;
  readonly url: string;
}): ResourceResult<NetworkResourceDescriptor> {
  const encodedIdentity = encodeURIComponent(`${input.nativeId}:${input.url}`);
  const reference = createResourceRef(
    `bestdori/${input.server}/media-${input.purpose}/${encodedIdentity}`,
  );
  if (reference.status === "rejected") return reference;
  const kind = input.purpose === "bgm" ? "audio" : input.purpose === "mv" ? "video" : "image";
  return resourceAccepted(Object.freeze({
    ref: reference.value,
    origin: "network" as const,
    kind,
    title: input.title,
    availability: "remote-only" as const,
    files: null,
    catalogObservedAt: new Date().toISOString(),
    logicalPlacement: Object.freeze({
      provider: "bestdori",
      server: input.server,
      canonicalPath: mediaLogicalPath(input.purpose, input.nativeId),
      identityClass: "provider-media" as const,
    }),
    source: Object.freeze({
      provider: "bestdori",
      server: input.server,
      family: `media-${input.purpose}`,
      nativeId: input.nativeId,
      manifestUrl: null,
      assetBaseUrl: input.url,
    }),
  }));
}

export function createBestdoriNetworkResourceRef(
  server: BestdoriAssetServer,
  family: BestdoriAssetFamily,
  nativeId: string,
): ResourceResult<NetworkResourceDescriptor["ref"]> {
  const reference = createResourceRef(
    `bestdori/${server}/${family}/${encodeURIComponent(nativeId)}`,
  );
  return reference.status === "rejected" ? reference : resourceAccepted(reference.value);
}

export class BestdoriApplicationResourceProvider implements ResourceCatalogProvider {
  readonly provider = "bestdori";

  async refresh(
    previous: ResourceCatalogSnapshot | null,
  ): Promise<ResourceResult<ResourceCatalogSnapshot>> {
    try {
      const resources = await loadBestdoriNetworkResourceDescriptors();
      const observedAt = new Date().toISOString();
      const encoded = new TextEncoder().encode(JSON.stringify(resources.map((resource) => ({
        id: resource.ref.id,
        title: resource.title,
        source: resource.source,
      }))));
      const integrity = await observeResourceIntegrity(encoded);
      if (integrity.status === "rejected") return integrity;
      const notModified = previous?.bodySha256 === integrity.value.sha256;
      return resourceAccepted(Object.freeze({
        provider: this.provider,
        freshness: notModified ? "not-modified" as const : "fresh" as const,
        observedAt,
        etag: null,
        lastModified: null,
        bodySha256: integrity.value.sha256,
        resources: Object.freeze(resources.map((resource) => Object.freeze({
          ...resource,
          catalogObservedAt: observedAt,
        }))),
      }));
    } catch (error) {
      return resourceRejected(
        "catalog-unavailable",
        "resources.bestdori.catalog-refresh-failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async install(
    descriptor: NetworkResourceDescriptor,
  ): Promise<ResourceResult<ResourceInstallInput>> {
    if (descriptor.source.provider !== this.provider) {
      return resourceRejected(
        "resource-unavailable",
        "resources.bestdori.provider-mismatch",
        "The selected network resource is not owned by the Bestdori provider.",
      );
    }
    if (descriptor.source.family.startsWith("media-")) {
      try {
        const inferredMediaType = mediaTypeForPath(new URL(descriptor.source.assetBaseUrl).pathname);
        const mediaType = inferredMediaType !== "application/octet-stream"
          ? inferredMediaType
          : descriptor.source.family === "media-bgm"
            ? "audio/mpeg"
            : descriptor.source.family === "media-cover" || descriptor.source.family === "media-stage-backdrop"
              ? "image/png"
              : "video/mp4";
        const blob = await fetchBestdoriFileBlob(
          descriptor.source.assetBaseUrl,
          mediaType,
          `bestdori ${descriptor.source.family}`,
        );
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.byteLength === 0) throw new Error("downloaded media is empty");
        const logicalPath = basenameFromUrl(descriptor.source.assetBaseUrl, descriptor.source.nativeId);
        return resourceAccepted(Object.freeze({
          descriptor,
          files: Object.freeze([{ logicalPath, mediaType, bytes }]),
        }));
      } catch (error) {
        return resourceRejected(
          "resource-transaction-failed",
          "resources.bestdori.media-download-failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (descriptor.source.manifestUrl === null) {
      return resourceRejected(
        "resource-unavailable",
        "resources.bestdori.dynamic-manifest-unavailable",
        "The selected Bestdori package has no dynamically discoverable complete manifest; fixed filename fallback is forbidden.",
      );
    }
    const sources = [descriptor.source];
    if (descriptor.source.family === "noteskin" && !descriptor.source.nativeId.endsWith("sample")) {
      const sampleId = descriptor.source.nativeId === "habahiro"
        ? "habahiro_sample"
        : `${descriptor.source.nativeId}sample`;
      sources.push(sourceFor(
        descriptor.source.server as BestdoriAssetServer,
        "noteskin",
        sampleId,
      ));
    }
    const files: ResourceInstallFile[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      if (source.manifestUrl === null) continue;
      let manifest: unknown;
      try {
        manifest = await fetchBestdoriJson<unknown>(
          source.manifestUrl,
          `bestdori ${source.family}/${source.nativeId} manifest`,
        );
      } catch (error) {
        return resourceRejected(
          "resource-unavailable",
          "resources.bestdori.manifest-fetch-failed",
          error instanceof Error ? error.message : String(error),
        );
      }
      const filenames = normalizeManifest(manifest);
      if (filenames.status === "rejected") return filenames;
      for (const logicalPath of filenames.value) {
        if (seen.has(logicalPath)) {
          return resourceRejected(
            "resource-integrity",
            "resources.bestdori.combined-package-duplicate-path",
            `Combined Bestdori package duplicates ${logicalPath}.`,
          );
        }
        seen.add(logicalPath);
        const url = `${source.assetBaseUrl}/${encodeLogicalPath(logicalPath)}`;
        try {
          const mediaType = mediaTypeForPath(logicalPath);
          const blob = await fetchBestdoriFileBlob(url, mediaType, `bestdori ${logicalPath}`);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (bytes.byteLength === 0) throw new Error("downloaded file is empty");
          files.push(Object.freeze({ logicalPath, mediaType, bytes }));
        } catch (error) {
          return resourceRejected(
            "resource-transaction-failed",
            "resources.bestdori.package-download-failed",
            `${logicalPath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    return resourceAccepted(Object.freeze({
      descriptor,
      files: Object.freeze(files),
    }));
  }
}

export async function loadBestdoriNetworkResourceDescriptors(): Promise<readonly NetworkResourceDescriptor[]> {
  const [assets, names] = await Promise.all([
    Promise.all(BESTDORI_ASSET_SERVERS.map((server) =>
      fetchBestdoriJson<BestdoriAssetsInfo>(
        `/api/explorer/${server}/assets/_info.json`,
        `bestdori ${server} assets info`,
      ))),
    loadNames(),
  ]);
  const observedAt = new Date().toISOString();
  const resources: NetworkResourceDescriptor[] = [];
  for (let index = 0; index < BESTDORI_ASSET_SERVERS.length; index += 1) {
    const server = BESTDORI_ASSET_SERVERS[index]!;
    const info = assets[index] ?? {};
    collect(resources, server, "noteskin", info.ingameskin?.noteskin, names, observedAt);
    collect(resources, server, "fieldskin", info.ingameskin?.fieldskin, names, observedAt);
    collect(resources, server, "bgskin", info.ingameskin?.bgskin, names, observedAt);
    collect(resources, server, "judgeskin", info.ingameskin?.judgeskin, names, observedAt);
    collect(resources, server, "tapseskin", info.sound?.tapseskin, names, observedAt);
    resources.push(commonSoundDescriptor(server, observedAt));
  }
  const deduplicated = new Map<string, NetworkResourceDescriptor>();
  for (const resource of resources) deduplicated.set(resource.ref.id, resource);
  return Object.freeze(Array.from(deduplicated.values()).sort((a, b) =>
    a.source.server.localeCompare(b.source.server) ||
    a.source.family.localeCompare(b.source.family) ||
    a.source.nativeId.localeCompare(b.source.nativeId)));
}

function collect(
  output: NetworkResourceDescriptor[],
  server: BestdoriAssetServer,
  family: Exclude<BestdoriAssetFamily, "sound-common">,
  values: Record<string, unknown> | undefined,
  names: BestdoriNames,
  observedAt: string,
): void {
  if (values === undefined) return;
  for (const nativeId of Object.keys(values)) {
    const reference = createResourceRef(
      `bestdori/${server}/${family}/${encodeURIComponent(nativeId)}`,
    );
    if (reference.status === "rejected") continue;
    const source = sourceFor(server, family, nativeId);
    output.push(Object.freeze({
      ref: reference.value,
      origin: "network" as const,
      kind: "package" as const,
      title: titleFor(family, nativeId, names),
      availability: "remote-only" as const,
      files: null,
      catalogObservedAt: observedAt,
      logicalPlacement: Object.freeze({
        provider: "bestdori",
        server,
        canonicalPath: packageLogicalPath(family, nativeId),
        identityClass: "provider-package" as const,
      }),
      source: Object.freeze(source),
    }));
  }
}

function sourceFor(
  server: BestdoriAssetServer,
  family: BestdoriAssetFamily,
  nativeId: string,
) {
  const encoded = encodeURIComponent(nativeId);
  const explorerRoot = `https://bestdori.com/api/explorer/${server}/assets`;
  const assetRoot = `https://bestdori.com/assets/${server}`;
  if (family === "sound-common") {
    return {
      provider: "bestdori",
      server,
      family,
      nativeId,
      manifestUrl: `${explorerRoot}/sound/common.json`,
      assetBaseUrl: `${assetRoot}/sound/common_rip`,
    };
  }
  const section = family === "tapseskin" ? "sound" : "ingameskin";
  return {
    provider: "bestdori",
    server,
    family,
    nativeId,
    manifestUrl: `${explorerRoot}/${section}/${family}/${encoded}.json`,
    assetBaseUrl: `${assetRoot}/${section}/${family}/${encoded}_rip`,
  };
}

function commonSoundDescriptor(
  server: BestdoriAssetServer,
  observedAt: string,
): NetworkResourceDescriptor {
  const reference = createResourceRef(`bestdori/${server}/sound-common/common`);
  if (reference.status === "rejected") throw new Error("Bestdori common sound identity is invalid");
  return Object.freeze({
    ref: reference.value,
    origin: "network" as const,
    kind: "package" as const,
    title: `${server.toUpperCase()} common sound`,
    availability: "remote-only" as const,
    files: null,
    catalogObservedAt: observedAt,
    logicalPlacement: Object.freeze({
      provider: "bestdori",
      server,
      canonicalPath: "sound/common",
      identityClass: "provider-package" as const,
    }),
    source: Object.freeze(sourceFor(server, "sound-common", "common")),
  });
}

async function loadNames(): Promise<BestdoriNames> {
  const [note, directional, field, effect, background] = await Promise.all([
    fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/notes.all.3.json", "bestdori note skin names"),
    fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/directionalFlicks.all.3.json", "bestdori directional skin names"),
    fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/lanes.all.3.json", "bestdori field skin names"),
    fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/effects.all.3.json", "bestdori effect skin names"),
    fetchBestdoriJson<Record<string, BestdoriInfoEntry>>("/api/skin/backgrounds.all.3.json", "bestdori background names"),
  ]);
  return { note, directional, field, effect, background };
}

function titleFor(
  family: Exclude<BestdoriAssetFamily, "sound-common">,
  nativeId: string,
  names: BestdoriNames,
): string {
  const candidates = family === "noteskin"
    ? (nativeId.startsWith("directionalflick") ? names.directional : names.note)
    : family === "fieldskin"
      ? names.field
      : family === "bgskin"
        ? names.background
        : family === "tapseskin"
          ? (nativeId.startsWith("directionalflick") ? names.directional : names.effect)
          : {};
  for (const entry of Object.values(candidates)) {
    if (entry?.assetBundleName !== nativeId || !Array.isArray(entry.skinName)) continue;
    const name = entry.skinName.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (name !== undefined) return name.trim();
  }
  return nativeId;
}

function normalizeManifest(value: unknown): ResourceResult<readonly string[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return resourceRejected(
      "resource-integrity",
      "resources.bestdori.invalid-empty-manifest",
      "Bestdori package manifests must be non-empty filename arrays.",
    );
  }
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return invalidManifest();
    const path = item.trim().split("\\").join("/");
    const parts = path.split("/");
    if (path.length === 0 || path.startsWith("/") || parts.some((part) => part.length === 0 || part === "." || part === "..") || seen.has(path)) {
      return invalidManifest();
    }
    seen.add(path);
    output.push(path);
  }
  return resourceAccepted(Object.freeze(output));
}

function invalidManifest<T>(): ResourceResult<T> {
  return resourceRejected(
    "resource-integrity",
    "resources.bestdori.invalid-manifest-path",
    "Bestdori package manifests require unique safe relative file paths and cannot be repaired.",
  );
}

function packageLogicalPath(family: BestdoriAssetFamily, nativeId: string): string {
  if (family === "sound-common") return "sound/common";
  return family === "tapseskin"
    ? `sound/tapseskin/${nativeId}`
    : `ingameskin/${family}/${nativeId}`;
}

function mediaLogicalPath(
  purpose: "bgm" | "cover" | "mv" | "stage-backdrop",
  nativeId: string,
): string {
  if (purpose === "bgm") return `sound/${nativeId}`;
  if (purpose === "cover") return `musicjacket/${nativeId}`;
  if (purpose === "mv") return `movie/mv/${nativeId}`;
  return `ingameskin/bgskin/${nativeId}`;
}

function encodeLogicalPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function basenameFromUrl(url: string, fallback: string): string {
  const tail = new URL(url).pathname.split("/").filter(Boolean).pop();
  const decoded = tail === undefined ? fallback : decodeURIComponent(tail);
  const safe = decoded.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return safe.length === 0 ? fallback : safe;
}

function mediaTypeForPath(path: string): string {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".json") || normalized.endsWith(".bundle") || normalized.endsWith(".asset") || normalized.endsWith(".sprites")) {
    return "application/json";
  }
  return "application/octet-stream";
}
