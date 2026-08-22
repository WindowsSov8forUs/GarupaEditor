import { ApplicationResourceManager } from "../applicationResourceManager";
import type { ResourceObjectUrlFactory } from "../backend";
import { MemoryApplicationResourceBackend } from "../memoryResourceBackend";
import { observeResourceIntegrity } from "../sha256";

export async function runBuiltinCatalogTests(): Promise<void> {
  const manager = new ApplicationResourceManager(
    new MemoryApplicationResourceBackend(),
    new NoopObjectUrls(),
  );
  equal((await manager.initialize()).status, "accepted");
  const bytes = new TextEncoder().encode("lazy-builtin");
  const integrity = await observeResourceIntegrity(bytes);
  equal(integrity.status, "accepted");
  if (integrity.status !== "accepted") return;
  let loads = 0;
  const registered = await manager.registerBuiltin({
    id: "builtin/ui/lazy-test",
    kind: "image",
    title: "Lazy test",
    sourceUrl: "/assets/lazy-test.png",
    files: [{
      logicalPath: "lazy-test.png",
      mediaType: "image/png",
      integrity: integrity.value,
      loadBytes: async () => {
        loads += 1;
        return Uint8Array.from(bytes);
      },
    }],
  });
  equal(registered.status, "accepted");
  if (registered.status !== "accepted") return;
  equal(loads, 1);
  equal(manager.replaceSelection({ "ui.default-cover": registered.value.ref }).status, "accepted");
  equal(manager.resolveBuiltinSlotUrl("ui.default-cover").status, "rejected");
  equal((await manager.prepareBuiltinDocumentLease(["ui.default-cover"])).status, "accepted");
  equal(manager.resolveBuiltinSlotUrl("ui.default-cover").status, "accepted");
  equal(loads, 1);

  const receipt = await manager.createSnapshot(["ui.default-cover"]);
  equal(receipt.status, "accepted");
  if (receipt.status !== "accepted") return;
  const lease = await manager.acquireSnapshot(receipt.value.snapshotId);
  equal(lease.status, "accepted");
  if (lease.status !== "accepted") return;
  equal(new TextDecoder().decode(await lease.value.readBytes("ui.default-cover", "lazy-test.png")), "lazy-builtin");
  equal(new TextDecoder().decode(await lease.value.readBytes("ui.default-cover", "lazy-test.png")), "lazy-builtin");
  equal(loads, 1);
  await lease.value.release();

  const rejectedBackend = new MemoryApplicationResourceBackend();
  const rejectedManager = new ApplicationResourceManager(rejectedBackend, new NoopObjectUrls());
  equal((await rejectedManager.initialize()).status, "accepted");
  const declaredBytes = new TextEncoder().encode("source-controlled-builtin");
  const transformedBytes = new TextEncoder().encode("source-controlled-builtin-transformed");
  const declaredIntegrity = await observeResourceIntegrity(declaredBytes);
  const transformedIntegrity = await observeResourceIntegrity(transformedBytes);
  equal(declaredIntegrity.status, "accepted");
  equal(transformedIntegrity.status, "accepted");
  if (declaredIntegrity.status !== "accepted" || transformedIntegrity.status !== "accepted") return;
  const rejected = await rejectedManager.registerBuiltin({
    id: "builtin/ui/transformed-test",
    kind: "image",
    title: "Transformed test",
    sourceUrl: "/assets/transformed-test.svg",
    files: [{
      logicalPath: "icons/transformed-test.svg",
      mediaType: "image/svg+xml",
      integrity: declaredIntegrity.value,
      loadBytes: async () => Uint8Array.from(transformedBytes),
    }],
  });
  equal(rejected.status, "rejected");
  if (rejected.status !== "rejected") return;
  equal(rejected.failure.code, "resource-integrity");
  equal(rejected.failure.capability, "resources.manager.builtin-load-integrity");
  contains(rejected.failure.boundary, "icons/transformed-test.svg");
  contains(rejected.failure.boundary, `${declaredIntegrity.value.byteLength} bytes / SHA-256 ${declaredIntegrity.value.sha256}`);
  contains(rejected.failure.boundary, `${transformedIntegrity.value.byteLength} bytes / SHA-256 ${transformedIntegrity.value.sha256}`);
  const rejectedRecords = await rejectedBackend.listRecords();
  equal(rejectedRecords.status, "accepted");
  if (rejectedRecords.status === "accepted") equal(rejectedRecords.value.length, 0);
  equal(rejectedManager.resolveBuiltinSlotUrl("ui.default-cover").status, "rejected");
}

class NoopObjectUrls implements ResourceObjectUrlFactory {
  create(): string {
    return "noop";
  }
  revoke(): void {}
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function contains(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`assertion failed: expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
  }
}
