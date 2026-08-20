import { ApplicationResourceManager } from "../applicationResourceManager";
import type { ResourceObjectUrlFactory } from "../backend";
import { MemoryApplicationResourceBackend } from "../memoryResourceBackend";
import type { UserMediaPurpose } from "../contracts";

export async function runUserMediaTests(): Promise<void> {
  const backend = new MemoryApplicationResourceBackend();
  const urls = new FakeUrls();
  const manager = new ApplicationResourceManager(backend, urls);
  equal((await manager.initialize()).status, "accepted");
  const purposes: readonly UserMediaPurpose[] = ["bgm", "cover", "mv", "stage-backdrop"];
  const refs = [];
  for (const purpose of purposes) {
    const imported = await manager.importUserMedia({
      purpose,
      fileName: `${purpose}.bin`,
      mediaType: purpose === "bgm" ? "audio/mpeg" : purpose === "mv" ? "video/mp4" : "image/png",
      bytes: mediaBytes(purpose),
    });
    equal(imported.status, "accepted");
    if (imported.status === "accepted") refs.push(imported.value.ref);
  }
  equal((await manager.importUserMedia({
    purpose: "skin" as UserMediaPurpose,
    fileName: "forbidden.bin",
    mediaType: "application/octet-stream",
    bytes: new Uint8Array([1]),
  })).status, "rejected");
  equal(refs.length, 4);
  const selected = manager.replaceSelection({
    "chart-media.bgm": refs[0]!,
    "chart-media.cover": refs[1]!,
    "chart-media.mv": refs[2]!,
    "chart-media.stage-backdrop": refs[3]!,
  });
  equal(selected.status, "accepted");
  const receipt = await manager.createSnapshot([
    "chart-media.bgm",
    "chart-media.cover",
    "chart-media.mv",
    "chart-media.stage-backdrop",
  ]);
  equal(receipt.status, "accepted");
  if (receipt.status !== "accepted") return;
  const first = await manager.acquireSnapshot(receipt.value.snapshotId);
  const second = await manager.acquireSnapshot(receipt.value.snapshotId);
  equal(first.status, "accepted");
  equal(second.status, "accepted");
  if (first.status !== "accepted" || second.status !== "accepted") return;
  const bgmPath = first.value.listFiles("chart-media.bgm")[0]!.logicalPath;
  equal(new TextDecoder().decode(await first.value.readBytes("chart-media.bgm", bgmPath)), "ID3-bgm");
  await first.value.release();
  equal(new TextDecoder().decode(await second.value.readBytes("chart-media.bgm", bgmPath)), "ID3-bgm");
  await second.value.release();
}

class FakeUrls implements ResourceObjectUrlFactory {
  create(): string { return "memory://media"; }
  revoke(): void {}
}

function mediaBytes(purpose: UserMediaPurpose): Uint8Array {
  if (purpose === "bgm") return new TextEncoder().encode("ID3-bgm");
  if (purpose === "mv") return Uint8Array.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
