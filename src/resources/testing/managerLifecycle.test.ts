import { ApplicationResourceManager } from "../applicationResourceManager";
import type {
  ResourceCatalogProvider,
  ResourceInstallInput,
  ResourceObjectUrlFactory,
} from "../backend";
import {
  createResourceRef,
  resourceAccepted,
  resourceRejected,
  type NetworkResourceDescriptor,
  type ResourceCatalogSnapshot,
} from "../contracts";
import { MemoryApplicationResourceBackend } from "../memoryResourceBackend";

export async function runResourceManagerLifecycleTests(): Promise<void> {
  const backend = new MemoryApplicationResourceBackend();
  const objectUrls = new FakeObjectUrls();
  const manager = new ApplicationResourceManager(backend, objectUrls);
  equal((await manager.initialize()).status, "accepted");

  const provider = new MutableCatalogProvider();
  equal(manager.registerCatalogProvider(provider).status, "accepted");
  equal(manager.registerCatalogProvider(provider).status, "rejected");

  const builtin = await manager.registerBuiltin({
    id: "builtin/ui/options-title",
    kind: "image",
    title: "Options",
    sourceUrl: "/assets/options.svg",
    files: [{ logicalPath: "options.svg", mediaType: "image/svg+xml", bytes: bytes("builtin") }],
  });
  equal(builtin.status, "accepted");

  const refreshed = await manager.refreshCatalog("bestdori");
  equal(refreshed.status, "accepted");
  if (refreshed.status !== "accepted") return;
  equal(refreshed.value.resources.some((item) => item.ref.id.endsWith("skin999")), true);

  const listed = await manager.listResources({ provider: "bestdori", family: "noteskin" });
  equal(listed.status, "accepted");
  if (listed.status !== "accepted") return;
  equal(listed.value.length, 1);
  const dynamicRef = listed.value[0]!.ref;

  equal((await manager.ensureAvailable(dynamicRef)).status, "accepted");
  equal(manager.replaceSelection({ "skin.rhythm": dynamicRef }).status, "accepted");
  const firstReceipt = await manager.createSnapshot(["skin.rhythm"]);
  equal(firstReceipt.status, "accepted");
  if (firstReceipt.status !== "accepted") return;
  const firstLeaseResult = await manager.acquireSnapshot(firstReceipt.value.snapshotId);
  equal(firstLeaseResult.status, "accepted");
  if (firstLeaseResult.status !== "accepted") return;
  const firstLease = firstLeaseResult.value;
  equal(text(await firstLease.readBytes("skin.rhythm", "atlas.bin")), "network-one");
  const firstUrl = await firstLease.openObjectUrl("skin.rhythm", "atlas.bin");
  equal(firstUrl, "memory-object:1");
  equal(await firstLease.openObjectUrl("skin.rhythm", "atlas.bin"), firstUrl);

  provider.payload = "network-two";
  equal((await manager.ensureAvailable(dynamicRef, { refresh: true })).status, "accepted");
  const secondReceipt = await manager.createSnapshot(["skin.rhythm"]);
  equal(secondReceipt.status, "accepted");
  if (secondReceipt.status !== "accepted") return;
  const secondLeaseResult = await manager.acquireSnapshot(secondReceipt.value.snapshotId);
  equal(secondLeaseResult.status, "accepted");
  if (secondLeaseResult.status !== "accepted") return;
  equal(text(await secondLeaseResult.value.readBytes("skin.rhythm", "atlas.bin")), "network-two");
  equal(text(await firstLease.readBytes("skin.rhythm", "atlas.bin")), "network-one");

  await firstLease.release();
  equal(objectUrls.revoked.includes(firstUrl), true);
  await secondLeaseResult.value.release();

  const imported = await manager.importUserMedia({
    purpose: "bgm",
    fileName: "song.mp3",
    mediaType: "audio/mpeg",
    bytes: bytes("user-bgm"),
  });
  equal(imported.status, "accepted");
  if (imported.status !== "accepted") return;
  equal(imported.value.origin, "user");
  equal(imported.value.kind, "audio");

  provider.offline = true;
  const offline = await manager.refreshCatalog("bestdori");
  equal(offline.status, "accepted");
  if (offline.status !== "accepted") return;
  equal(offline.value.freshness, "offline-cached");

  equal((await manager.verify(dynamicRef)).status, "accepted");
  equal(backend.corruptForTesting(dynamicRef, "atlas.bin"), true);
  equal((await manager.verify(dynamicRef)).status, "rejected");
}

class MutableCatalogProvider implements ResourceCatalogProvider {
  readonly provider = "bestdori";
  payload = "network-one";
  offline = false;
  readonly descriptor: NetworkResourceDescriptor;

  constructor() {
    const ref = createResourceRef("bestdori/jp/noteskin/skin999");
    if (ref.status === "rejected") throw new Error("test resource ref rejected");
    this.descriptor = Object.freeze({
      ref: ref.value,
      origin: "network" as const,
      kind: "package" as const,
      title: "Dynamic Skin 999",
      availability: "remote-only" as const,
      files: null,
      catalogObservedAt: "2026-01-01T00:00:00.000Z",
      source: Object.freeze({
        provider: "bestdori",
        server: "jp",
        family: "noteskin",
        nativeId: "skin999",
        manifestUrl: "https://bestdori.com/api/explorer/jp/assets/ingameskin/noteskin/skin999.json",
        assetBaseUrl: "https://bestdori.com/assets/jp/ingameskin/noteskin/skin999_rip",
      }),
    });
  }

  async refresh(previous: ResourceCatalogSnapshot | null) {
    if (this.offline) {
      return resourceRejected<ResourceCatalogSnapshot>(
        "catalog-unavailable",
        "resources.test.offline",
        "test catalog is offline",
      );
    }
    return resourceAccepted(Object.freeze({
      provider: this.provider,
      freshness: previous === null ? "fresh" as const : "not-modified" as const,
      observedAt: "2026-01-01T00:00:00.000Z",
      etag: null,
      lastModified: null,
      bodySha256: null,
      resources: Object.freeze([this.descriptor]),
    }));
  }

  async install(descriptor: NetworkResourceDescriptor) {
    const input: ResourceInstallInput = Object.freeze({
      descriptor,
      files: Object.freeze([{
        logicalPath: "atlas.bin",
        mediaType: "application/octet-stream",
        bytes: bytes(this.payload),
      }]),
    });
    return resourceAccepted(input);
  }
}

class FakeObjectUrls implements ResourceObjectUrlFactory {
  private next = 1;
  readonly revoked: string[] = [];
  create(_bytes: Uint8Array, _mediaType: string): string {
    return `memory-object:${this.next++}`;
  }
  revoke(url: string): void {
    this.revoked.push(url);
  }
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function text(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
