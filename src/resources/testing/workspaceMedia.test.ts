import { ApplicationResourceManager } from "../applicationResourceManager";
import type {
  ResourceCatalogProvider,
  ResourceInstallInput,
  ResourceObjectUrlFactory,
} from "../backend";
import {
  createResourceRef,
  resourceAccepted,
  type NetworkResourceDescriptor,
  type ResourceCatalogSnapshot,
} from "../contracts";
import { MemoryApplicationResourceBackend } from "../memoryResourceBackend";

export async function runWorkspaceMediaTests(): Promise<void> {
  const backend = new MemoryApplicationResourceBackend();
  const manager = new ApplicationResourceManager(backend, new NoopUrls());
  equal((await manager.initialize()).status, "accepted");

  const first = await manager.importWorkspaceMedia({
    purpose: "bgm",
    fileName: "first.mp3",
    mediaType: "audio/mpeg",
    bytes: id3("first"),
  });
  const duplicate = await manager.importWorkspaceMedia({
    purpose: "bgm",
    fileName: "renamed.mp3",
    mediaType: "audio/mpeg",
    bytes: id3("first"),
  });
  if (first.status === "rejected" || duplicate.status === "rejected") throw new Error("workspace import rejected");
  equal(first.value.ref.id.startsWith("workspace/current/chart-media/bgm/"), true);
  equal(duplicate.value.ref.id, first.value.ref.id);
  const listed = await manager.listResources({ origin: "workspace" });
  if (listed.status === "rejected") throw new Error("workspace list rejected");
  equal(listed.value.length, 0);

  const selected = Object.freeze({ bgm: first.value.ref, cover: null, mv: null, stageBackdrop: null });
  const receipt = await manager.createSnapshotFromRefs({ "chart-media.bgm": first.value.ref });
  if (receipt.status === "rejected") throw new Error("workspace snapshot rejected");
  const lease = await manager.acquireSnapshot(receipt.value.snapshotId);
  if (lease.status === "rejected") throw new Error("workspace lease rejected");

  const second = await manager.importWorkspaceMedia({
    purpose: "bgm",
    fileName: "second.mp3",
    mediaType: "audio/mpeg",
    bytes: id3("second"),
  });
  if (second.status === "rejected") throw new Error("second workspace import rejected");
  equal((await manager.reconcileCurrentChartMedia(Object.freeze({ ...selected, bgm: second.value.ref }))).status, "accepted");
  equal((await manager.verify(first.value.ref)).status, "rejected");
  const oldPath = lease.value.listFiles("chart-media.bgm")[0]!.logicalPath;
  equal(new TextDecoder().decode(await lease.value.readBytes("chart-media.bgm", oldPath)), new TextDecoder().decode(id3("first")));
  await lease.value.release();
  equal((await manager.collectGarbage()).status, "accepted");

  const provider = new MediaProvider();
  equal(manager.registerCatalogProvider(provider).status, "accepted");
  equal(manager.registerNetworkResource(provider.descriptor).status, "accepted");
  const network = await manager.materializeNetworkMediaInWorkspace(provider.descriptor, "cover");
  if (network.status === "rejected") throw new Error("workspace network media rejected");
  equal(network.value.ref.id.startsWith("workspace/current/chart-media/cover/"), true);
  equal(network.value.origin, "workspace");
  equal((await backend.readRecord(provider.descriptor.ref)).status, "rejected");
  equal((await manager.ensureAvailable(provider.descriptor.ref, { refresh: true })).status, "rejected");

  const legacy = await backend.importUserMedia({
    purpose: "mv",
    fileName: "legacy.mp4",
    mediaType: "video/mp4",
    bytes: mp4(),
  });
  if (legacy.status === "rejected") throw new Error("legacy setup rejected");
  const adopted = await manager.adoptLegacyChartMedia(Object.freeze({
    bgm: null,
    cover: null,
    mv: legacy.value.descriptor.ref,
    stageBackdrop: null,
  }));
  if (adopted.status === "rejected") throw new Error("legacy adoption rejected");
  equal(adopted.value.media.mv?.id.startsWith("workspace/current/chart-media/mv/"), true);
  equal(adopted.value.migratedActiveRefs[0]?.id, legacy.value.descriptor.ref.id);
  const finalized = await manager.finalizeLegacyMediaMigration(adopted.value.migratedActiveRefs);
  if (finalized.status === "rejected") throw new Error("legacy finalization rejected");
  equal(finalized.value.migratedActiveCount, 1);
  equal((await backend.readRecord(legacy.value.descriptor.ref)).status, "rejected");
}

class MediaProvider implements ResourceCatalogProvider {
  readonly provider = "bestdori";
  readonly descriptor: NetworkResourceDescriptor;

  constructor() {
    const ref = createResourceRef("bestdori/jp/musicjacket/musicjacket100/musicjacket100.png");
    if (ref.status === "rejected") throw new Error("network media ref rejected");
    this.descriptor = Object.freeze({
      ref: ref.value,
      origin: "network" as const,
      kind: "image" as const,
      title: "Official jacket",
      availability: "remote-only" as const,
      files: null,
      catalogObservedAt: null,
      logicalPlacement: Object.freeze({
        provider: "bestdori",
        server: "jp",
        canonicalPath: "musicjacket/musicjacket100/musicjacket100.png",
        identityClass: "provider-media" as const,
      }),
      source: Object.freeze({
        provider: "bestdori",
        server: "jp",
        family: "media-cover",
        nativeId: "musicjacket100.png",
        manifestUrl: null,
        assetBaseUrl: "https://bestdori.com/example.png",
      }),
    });
  }

  async refresh(_previous: ResourceCatalogSnapshot | null) {
    const snapshot: ResourceCatalogSnapshot = Object.freeze({
      provider: "bestdori",
      freshness: "fresh",
      observedAt: null,
      etag: null,
      lastModified: null,
      bodySha256: null,
      resources: Object.freeze([this.descriptor]),
    });
    return resourceAccepted(snapshot);
  }

  async install(descriptor: NetworkResourceDescriptor) {
    const input: ResourceInstallInput = Object.freeze({
      descriptor,
      files: Object.freeze([Object.freeze({
        logicalPath: "official.png",
        mediaType: "image/png",
        bytes: png(),
      })]),
    });
    return resourceAccepted(input);
  }
}

class NoopUrls implements ResourceObjectUrlFactory {
  create(): string { return "workspace://media"; }
  revoke(): void {}
}

function id3(label: string): Uint8Array {
  return new TextEncoder().encode(`ID3-${label}`);
}
function mp4(): Uint8Array {
  return Uint8Array.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);
}
function png(): Uint8Array {
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
}
function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
}
