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
    if (descriptor.source.provider !== this.provider || descriptor.source.manifestUrl === null) {
      return resourceRejected(
        "resource-unavailable",
        "resources.bestdori.dynamic-manifest-unavailable",
        "The selected Bestdori package has no dynamically discoverable complete manifest; fixed filename fallback is forbidden.",
      );
    }
    let manifest: unknown;
    try {
      manifest = await fetchBestdoriJson<unknown>(
        descriptor.source.manifestUrl,
        `bestdori ${descriptor.source.family}/${descriptor.source.nativeId} manifest`,
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
    const files: ResourceInstallFile[] = [];
    for (const logicalPath of filenames.value) {
      const url = `${descriptor.source.assetBaseUrl}/${encodeLogicalPath(logicalPath)}`;
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
      source: Object.freeze(source),
    }));
  }
}

function sourceFor(
  server: BestdoriAssetServer,
  family: Exclude<BestdoriAssetFamily, "sound-common">,
  nativeId: string,
) {
  const encoded = encodeURIComponent(nativeId);
  const explorerRoot = `https://bestdori.com/api/explorer/${server}/assets`;
  const assetRoot = `https://bestdori.com/assets/${server}`;
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

function encodeLogicalPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
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
