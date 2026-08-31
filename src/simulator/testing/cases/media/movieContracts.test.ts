declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { deriveSessionMvResource } from "../../../assembly/sessionMvDerivation";
import { inspectMovieContainer } from "../../../backends/movieValidation";
import { RecordingSimulatorMovieBackend } from "../../../backends/recordingMovieBackend";
import { sha256UpperHex } from "../../../backends/resources/sha256";
import type {
  MovieContainer,
  MoviePreparedResource,
  MovieResourcePreflightAdapter,
  PreparedSessionMovieResource,
} from "../../../backends/movieContracts";

const fixtureRoot = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/mv-live/artifacts/investigations/mv-live-portable-media-profile-10-1-4/portable-assets",
);

async function main(): Promise<void> {
  await testContainerAndDerivation("mp4", "mv-probe.mp4", 20933);
  await testContainerAndDerivation("webm", "mv-probe.webm", 46404);
  testMalformedContainers();
  await testRecordingLifecycle();
  await testSuppressedPublication();
  console.log("movie contracts passed: strict MP4/WebM, internal metadata/identity, recording lifecycle and suppressed publication");
}

async function testContainerAndDerivation(
  container: MovieContainer,
  filename: string,
  expectedBytes: number,
): Promise<void> {
  const bytes = new Uint8Array(readFileSync(join(fixtureRoot, filename)));
  const inspected = inspectMovieContainer(bytes);
  assert.equal(inspected.status, "accepted");
  if (inspected.status === "accepted") assert.equal(inspected.value, container);
  let released = 0;
  const derived = await deriveSessionMvResource({
    bytes,
    musicStartDelayMilliseconds: -2180,
  }, preflight(() => { released += 1; }));
  assert.equal(derived.status, "accepted");
  if (derived.status !== "accepted") return;
  assert.equal(derived.value.profile.container, container);
  assert.equal(derived.value.profile.mime, container === "mp4" ? "video/mp4" : "video/webm");
  assert.equal(derived.value.profile.byteLength, expectedBytes);
  assert.equal(derived.value.profile.durationSeconds, 2);
  assert.equal(derived.value.profile.width, 160);
  assert.equal(derived.value.profile.height, 90);
  assert.equal(derived.value.profile.musicStartDelayMilliseconds, -2180);
  assert.equal(derived.value.profile.muted, true);
  assert.equal(derived.value.profile.loop, false);
  assert.match(derived.value.profile.logicalId, /^mv-live\/session\/[0-9A-F]{64}$/);
  assert.notEqual(derived.value.bytes, bytes);
  assert.equal(released, 0);
  if (container === "mp4") {
    const relocated = relocateMp4MoovAfterMedia(bytes);
    const relocatedResult = inspectMovieContainer(relocated);
    assert.equal(relocatedResult.status, "accepted", "browser-decodable non-fast-start MP4 remains valid");
  }
  derived.value.prepared.release();
  assert.equal(released, 1);
}

function relocateMp4MoovAfterMedia(bytes: Uint8Array): Uint8Array {
  const boxes: Array<{ kind: string; bytes: Uint8Array }> = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const size = ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    boxes.push({ kind, bytes: bytes.slice(offset, offset + size) });
    offset += size;
  }
  const ordered = [
    ...boxes.filter((box) => box.kind === "ftyp"),
    ...boxes.filter((box) => box.kind !== "ftyp" && box.kind !== "moov"),
    ...boxes.filter((box) => box.kind === "moov"),
  ];
  const result = new Uint8Array(ordered.reduce((total, box) => total + box.bytes.byteLength, 0));
  let cursor = 0;
  for (const box of ordered) { result.set(box.bytes, cursor); cursor += box.bytes.byteLength; }
  return result;
}

function testMalformedContainers(): void {
  for (const bytes of [
    new Uint8Array(),
    Uint8Array.of(...new Uint8Array(32)),
    new Uint8Array(readFileSync(join(fixtureRoot, "mv-probe.mp4"))).subarray(0, 64),
    (() => {
      const value = new Uint8Array(readFileSync(join(fixtureRoot, "mv-probe.webm")));
      value[0] ^= 0xff;
      return value;
    })(),
  ]) assert.notEqual(inspectMovieContainer(bytes).status, "accepted");
}

async function testRecordingLifecycle(): Promise<void> {
  let releases = 0;
  const resource = await prepared("mp4", () => { releases += 1; });
  const backend = new RecordingSimulatorMovieBackend();
  assert.equal((await backend.prepare("movie:test", resource)).status, "accepted");
  assert.equal(backend.snapshot().state, "ready");
  assert.equal(backend.snapshot().resourceCount, 1);
  assert.equal(backend.setVisible(true).status, "integrity-failure");
  assert.equal(backend.play().status, "accepted");
  assert.equal(backend.setVisible(true).status, "accepted");
  assert.equal(backend.snapshot().visible, true);
  assert.equal(backend.pause().status, "accepted");
  assert.equal(backend.snapshot().state, "paused");
  assert.equal(backend.seek(1.25).status, "accepted");
  assert.equal(backend.snapshot().currentTimeSeconds, 1.25);
  assert.equal(backend.seek(2.001).status, "integrity-failure");
  assert.equal(backend.resume().status, "accepted");
  assert.equal(backend.notifyNaturalEnd().status, "accepted");
  assert.equal(backend.snapshot().state, "ended");
  assert.equal(backend.snapshot().visible, false);
  assert.equal(backend.dispose().status, "accepted");
  assert.equal(releases, 1);
  assert.equal(backend.snapshot().state, "disposed");
  assert.equal(backend.play().status, "terminal-disposed");
}

async function testSuppressedPublication(): Promise<void> {
  const backend = new RecordingSimulatorMovieBackend(true);
  assert.equal((await backend.prepare("movie:candidate", await prepared("webm", () => undefined))).status, "accepted");
  assert.equal(backend.play().status, "accepted");
  assert.equal(backend.setVisible(true).status, "integrity-failure");
  assert.equal(backend.publishSuppressedOutput(1, true).status, "accepted");
  const snapshot = backend.snapshot();
  assert.equal(snapshot.outputSuppressed, false);
  assert.equal(snapshot.currentTimeSeconds, 1);
  assert.equal(snapshot.state, "playing");
  assert.equal(snapshot.visible, true);
  assert.equal(backend.publishSuppressedOutput(1, true).status, "integrity-failure");
  assert.equal(backend.dispose().status, "accepted");
}

async function prepared(
  container: MovieContainer,
  release: () => void,
): Promise<PreparedSessionMovieResource> {
  const filename = container === "mp4" ? "mv-probe.mp4" : "mv-probe.webm";
  const bytes = new Uint8Array(readFileSync(join(fixtureRoot, filename)));
  const result = await deriveSessionMvResource({
    bytes,
    musicStartDelayMilliseconds: -2180,
  }, preflight(release));
  if (result.status !== "accepted") throw new Error(result.failure.capability);
  return result.value;
}

function preflight(release: () => void): MovieResourcePreflightAdapter {
  return {
    async sha256(bytes: Uint8Array) {
      return { status: "accepted" as const, value: sha256UpperHex(bytes) };
    },
    async prepare(_bytes: Uint8Array, container: MovieContainer) {
      const prepared: MoviePreparedResource = Object.freeze({
        metadata: Object.freeze({
          container,
          mime: container === "mp4" ? "video/mp4" as const : "video/webm" as const,
          durationSeconds: 2,
          width: 160,
          height: 90,
        }),
        resource: Object.freeze({ container }),
        release,
      });
      return { status: "accepted" as const, value: prepared };
    },
  };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
