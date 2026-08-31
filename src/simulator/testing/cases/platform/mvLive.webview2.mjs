import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const caseRoot = dirname(fileURLToPath(import.meta.url));
const testingRoot = resolve(caseRoot, "..", "..");
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const harnessRoot = join(testingRoot, "webview2-mv-live-harness");
const bundle = join(harnessRoot, "bundle.js");
const target = join(harnessRoot, "target");
const cleanCargoTarget = process.env.SIMULATOR_WEBVIEW2_CLEAN_BUILD === "1";
const require = createRequire(import.meta.url);
const esbuild = require.resolve("esbuild/bin/esbuild");
const fixtureRoot = join(
  testingRoot,
  "fixtures/reverse-snapshots/mv-live/artifacts/investigations/mv-live-portable-media-profile-10-1-4/portable-assets",
);
const mp4 = join(fixtureRoot, "mv-probe.mp4");
const webm = join(fixtureRoot, "mv-probe.webm");
const EXPECTED_MEDIA_DIGEST = "34c345808fe455b337b43af44a32f214b9e79e595aca5c1c410176eb860c3db9";
const EXPECTED_RASTER_DIGEST = "66c7685676ddcc4ef6c606d941f2d9745f2244452b7ec2a60545cdd95d698ddb";

try {
  if (cleanCargoTarget) rmSync(target, { recursive: true, force: true });
  run(process.execPath, [
    esbuild,
    join(testingRoot, "cases/platform/mvLive.webview2.test.ts"),
    "--bundle",
    "--platform=browser",
    "--format=iife",
    "--target=chrome120",
    `--outfile=${bundle}`,
  ], repositoryRoot);
  run("cargo", ["build", "--release", "--offline", "--locked"], harnessRoot);
  const loader = join(
    process.env.USERPROFILE ?? "",
    ".cargo/registry/src/index.crates.io-1949cf8c6b5b557f/webview2-com-sys-0.38.2/x64/WebView2Loader.dll",
  );
  if (!existsSync(loader)) throw new Error(`cached WebView2Loader.dll unavailable: ${loader}`);
  const release = join(target, "release");
  copyFileSync(loader, join(release, "WebView2Loader.dll"));
  const executable = join(release, "garupa-mv-live-webview2-harness.exe");
  const captures = [];
  for (let index = 0; index < 3; index += 1) {
    const output = join(harnessRoot, `capture-${index + 1}.json`);
    run(executable, [output, mp4, webm], harnessRoot);
    const value = JSON.parse(readFileSync(output, "utf8"));
    verify(value);
    captures.push(value);
  }
  const mediaProjections = captures.map((value) => JSON.stringify({
    runtime: value.runtime,
    media: value.media.map(({ raster: _raster, ...media }) => ({
      ...media,
      ready: stableSnapshot(media.ready),
      paused: stableSnapshot(media.paused),
      ended: stableSnapshot(media.ended),
      disposed: stableSnapshot(media.disposed),
    })),
    cleanup: value.cleanup,
    isolation: value.isolation,
  }));
  const rasterProjections = captures.map((value) => JSON.stringify(
    value.media.map((media) => ({ container: media.container, raster: media.raster })),
  ));
  if (mediaProjections.some((value) => value !== mediaProjections[0])) {
    throw new Error("MV WebView2 media graph differs across fresh processes");
  }
  if (rasterProjections.some((value) => value !== rasterProjections[0])) {
    throw new Error("MV WebView2 deterministic seek raster differs across fresh processes");
  }
  const mediaDigest = sha256(Buffer.from(mediaProjections[0]));
  const rasterDigest = sha256(Buffer.from(rasterProjections[0]));
  if (!EXPECTED_MEDIA_DIGEST || !EXPECTED_RASTER_DIGEST) {
    throw new Error(`MV WebView2 digest baseline required: media=${mediaDigest} raster=${rasterDigest}`);
  }
  if (mediaDigest !== EXPECTED_MEDIA_DIGEST || rasterDigest !== EXPECTED_RASTER_DIGEST) {
    throw new Error(`MV WebView2 digest changed: media=${mediaDigest} raster=${rasterDigest}`);
  }
  console.log(`MV Live production WebView2 passed: fresh=3 containers=2 mediaDigest=${mediaDigest} rasterDigest=${rasterDigest} runtime=${captures[0].runtime.userAgent}`);
} finally {
  rmSync(bundle, { force: true });
  for (let index = 1; index <= 3; index += 1) {
    rmSync(join(harnessRoot, `capture-${index}.json`), { force: true });
  }
  if (cleanCargoTarget) rmSync(target, { recursive: true, force: true });
}

function stableSnapshot(value) {
  return {
    ...value,
    currentTimeSeconds: value.state === "paused" ? value.currentTimeSeconds : null,
  };
}

function verify(value) {
  if (value.schema !== "garupa-mv-live-webview2-v1" || value.status !== "ok" ||
    value.runtime?.rendererName !== "webgl" || value.runtime?.pixiVersion !== "8.17.1" ||
    value.cleanup?.activeResources !== 0 || value.cleanup?.stageChildren !== 0 ||
    !Array.isArray(value.media) || value.media.length !== 2) {
    throw new Error(`MV WebView2 failure: ${JSON.stringify(value)}`);
  }
  const media = new Map(value.media.map((row) => [row.container, row]));
  if (media.get("mp4")?.bytes !== 20933 || media.get("webm")?.bytes !== 46404) {
    throw new Error("MV WebView2 fixture byte identity changed");
  }
  for (const [container, expectedMime] of [["mp4", "video/mp4"], ["webm", "video/webm"]]) {
    const row = media.get(container);
    if (row?.profile?.container !== container || row.profile.mime !== expectedMime ||
      row.profile.durationSeconds !== 2 || row.profile.width !== 160 || row.profile.height !== 90 ||
      row.profile.musicStartDelayMilliseconds !== -2180 || row.profile.muted !== true || row.profile.loop !== false ||
      row.ready?.state !== "ready" || row.ready.stageParentAttached !== true ||
      row.paused?.state !== "paused" || row.paused.currentTimeSeconds !== 1 || row.paused.visible !== true ||
      row.paused.firstFramePresented !== true || row.ended?.state !== "ended" || row.ended.visible !== false ||
      row.disposed?.state !== "disposed" || row.disposed.resourceCount !== 0 ||
      row.disposed.stageParentAttached !== false || row.raster?.nonBlackPixels <= 0 ||
      !/^[0-9a-f]{64}$/.test(row.raster?.rgbaSha256 ?? "")) {
      throw new Error(`MV WebView2 ${container} graph mismatch: ${JSON.stringify(row)}`);
    }
  }
  const urls = value.isolation?.resourceUrls ?? [];
  if (urls.length < 3 || !urls.every((url) => url.startsWith("http://garupa.localhost/")) ||
    !urls.some((url) => url.endsWith("/assets/mv-probe.mp4")) ||
    !urls.some((url) => url.endsWith("/assets/mv-probe.webm"))) {
    throw new Error(`MV WebView2 custom-protocol isolation changed: ${urls.join(",")}`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    timeout: 300_000,
    env: { ...process.env, CARGO_NET_OFFLINE: "true" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${String(result.status)}`);
}
