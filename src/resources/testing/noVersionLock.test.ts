import { createBestdoriNetworkMediaDescriptor, createBestdoriNetworkResourceRef } from "../providers/bestdoriCatalogProvider";

export function runNoVersionLockTests(): void {
  const future = createBestdoriNetworkResourceRef("jp", "noteskin", "future_collaboration_9999");
  equal(future.status, "accepted");
  if (future.status === "accepted") {
    equal(future.value.id, "bestdori/jp/noteskin/future_collaboration_9999");
    equal(future.value.id.includes("10.1.4"), false);
  }
  const media = createBestdoriNetworkMediaDescriptor({
    server: "jp",
    purpose: "mv",
    nativeId: "future-movie",
    title: "Future movie",
    url: "https://bestdori.com/assets/jp/movie/mv/future/movie.mp4",
  });
  equal(media.status, "accepted");
  if (media.status === "accepted") {
    equal(media.value.files, null);
    equal(media.value.availability, "remote-only");
  }
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
