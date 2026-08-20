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
  equal(loads, 0);
  equal(manager.replaceSelection({ "ui.default-cover": registered.value.ref }).status, "accepted");
  equal(manager.resolveBuiltinSlotUrl("ui.default-cover").status, "accepted");
  equal(loads, 0);

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
