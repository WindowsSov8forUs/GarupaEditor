import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const harnessRoot = join(testingRoot, "webview2-production-harness");
const bundle = join(harnessRoot, "bundle.js");
const capture = join(harnessRoot, "capture.json");
const target = join(harnessRoot, "target");
const cleanCargoTarget = process.env.SIMULATOR_WEBVIEW2_CLEAN_BUILD === "1";
const require = createRequire(import.meta.url);
const esbuild = require.resolve("esbuild/bin/esbuild");
const pixi = join(repositoryRoot, "node_modules", "pixi.js", "dist", "pixi.min.js");
const scoreRoot = join(
  testingRoot,
  "fixtures/reverse-snapshots/score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4/portable-assets",
);
const png = join(scoreRoot, "rhythm-game-ui.png");
const font = join(scoreRoot, "rank-label-font.ttf");
const scoreProfile = join(
  testingRoot,
  "fixtures/reverse-snapshots/autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4/ordinary_portable_profile.json",
);
const scoreAnimation = join(dirname(scoreRoot), "score_gauge_ss_animation_profile.json");
const contract = JSON.parse(readFileSync(join(
  testingRoot,
  "fixtures/reverse-snapshots/c07-evidence/artifacts/investigations/webview2-browser-raster-10-1-4/webview2_browser_raster_contract.json",
), "utf8"));

try {
  if (cleanCargoTarget) rmSync(target, { recursive: true, force: true });
  run(process.execPath, [
    esbuild,
    join(testingRoot, "browserPixiDecoderWebView2.test.ts"),
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
  run(join(release, "garupa-production-browser-decoder-harness.exe"), [
    capture,
    pixi,
    png,
    font,
    scoreProfile,
    scoreRoot,
    scoreAnimation,
  ], harnessRoot);
  const observed = JSON.parse(readFileSync(capture, "utf8"));
  if (observed.status !== "ok") verify(observed);
  if (process.env.SIMULATOR_SCORE_HUD_CAPTURE_PATH) {
    const prefix = "data:image/png;base64,";
    if (!observed.raster?.scoreHud?.pngDataUrl?.startsWith(prefix)) {
      throw new Error("Score HUD audit PNG was not captured");
    }
    writeFileSync(
      resolve(repositoryRoot, process.env.SIMULATOR_SCORE_HUD_CAPTURE_PATH),
      Buffer.from(observed.raster.scoreHud.pngDataUrl.slice(prefix.length), "base64"),
    );
  }
  verify(observed);
} finally {
  rmSync(bundle, { force: true });
  rmSync(capture, { force: true });
  if (cleanCargoTarget) rmSync(target, { recursive: true, force: true });
}

function verify(value) {
  if (value.schema !== "garupa-production-browser-decoder-webview2-v1" || value.status !== "ok") {
    throw new Error(`production browser decoder WebView2 failed: ${JSON.stringify(value)}`);
  }
  const versions = new Map(value.runtime.highEntropy.fullVersionList.map((row) => [row.brand, row.version]));
  sameRuntimeLine(versions.get("Microsoft Edge WebView2"), contract.hostScope.webView2Runtime, "WebView2 runtime");
  sameRuntimeLine(versions.get("Chromium"), contract.hostScope.chromium, "Chromium runtime");
  equal(value.runtime.pixiVersion, contract.hostScope.pixi, "Pixi version");
  equal(value.runtime.rendererName, "webgl", "actual Pixi renderer");
  equal(value.productionDecoder.className, "BrowserPixiTextureDecoder", "production decoder class");
  equal(value.productionDecoder.fontFamily, "GarupaScoreRank-949356BBFEA78FB5", "hash-derived production font family");
  equal(value.productionDecoder.fontFaceLoaded, true, "real production FontFace load");
  equal(value.productionDecoder.documentFontsDeleted, true, "production FontFace cleanup");
  equal(value.productionDecoder.textureResourceType, "ImageBitmap", "real production PNG decode resource");
  equal(JSON.stringify(value.productionDecoder.textureDimensions), "[1024,1024]", "production PNG dimensions");
  equal(value.productionDecoder.transparentRgbCompositePreserved, true,
    "GE-PS-BROWSER-PREMULTIPLIED-ALPHA opaque-scene compositing");
  equal(value.productionDecoder.textureResourceAfterDestroy, null, "production ImageBitmap ownership release");
  equal(
    JSON.stringify(value.productionDecoder.fallbackMetrics),
    JSON.stringify(contract.observation.browserDecode.fallbackMetrics),
    "absent-family metrics",
  );
  equal(
    JSON.stringify(value.productionDecoder.loadedMetrics),
    JSON.stringify(contract.observation.browserDecode.loadedMetrics),
    "loaded production glyph metrics",
  );
  const scoreHud = value.raster.scoreHud;
  const adaptive = adaptiveScoreLayout();
  closeTuple(scoreHud.maskWorldTransform, adaptive.progress, 1e-4, "Score high-rank panel mask world transform");
  closeTuple(scoreHud.maskWorldBounds, adaptive.maskBounds, 1e-4, "Score high-rank panel SS-threshold world bounds");
  closeTuple(scoreHud.animationLayerWorldTransform, adaptive.progress, 1e-4, "Score high-rank animation and panel coordinate spaces");
  closeTuple(scoreHud.firstDigitWorldTransform, adaptive.firstDigit, 1e-4, "CS-V1 SS-threshold first bitmap digit world transform");
  if (scoreHud.nonTransparentPixels <= 0 || !/^[0-9a-f]{64}$/.test(scoreHud.sha256)) {
    throw new Error(`production Score HUD WebView2 raster is invalid: ${JSON.stringify(scoreHud)}`);
  }
  const pngRaster = value.raster.pngOnly;
  if (!/^[0-9a-f]{64}$/.test(pngRaster.sha256)) {
    throw new Error(`premultiplied production PNG raster digest is invalid: ${pngRaster.sha256}`);
  }
  equal(pngRaster.nonTransparentPixels, contract.observation.raster.pngOnly.stats.nonTransparentPixels,
    "premultiplied PNG visible pixel count");
  const fontRaster = value.raster.fontOnly;
  equal(fontRaster.sha256, contract.observation.raster.fontOnly.sha256, "fontOnly RGBA digest");
  equal(fontRaster.nonTransparentPixels, contract.observation.raster.fontOnly.stats.nonTransparentPixels,
    "fontOnly visible pixel count");
  if (new Set(value.isolation.resourceUrls.map((url) => new URL(url).origin)).size !== 1 ||
      !value.isolation.resourceUrls.every((url) => url.startsWith("http://garupa.localhost/"))) {
    throw new Error(`production browser harness escaped custom protocol: ${value.isolation.resourceUrls.join(",")}`);
  }
  equal(sha256(readFileSync(png)), contract.observation.inputs.sha256.png.toUpperCase(), "fixture PNG hash");
  equal(sha256(readFileSync(font)), contract.observation.inputs.sha256.font.toUpperCase(), "fixture font hash");
  console.log(`production BrowserPixiTextureDecoder WebView2 passed: runtime=${versions.get("Microsoft Edge WebView2")} png=${value.raster.pngOnly.sha256} font=${value.raster.fontOnly.sha256} scoreHud=${scoreHud.sha256} pixels=${scoreHud.nonTransparentPixels}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function sameRuntimeLine(actual, baseline, label) {
  if (typeof actual !== "string" || typeof baseline !== "string") {
    throw new Error(`${label}: missing runtime identity`);
  }
  const current = actual.split(".").map(Number);
  const locked = baseline.split(".").map(Number);
  if (current.length !== 4 || locked.length !== 4 ||
      current.slice(0, 3).some((value, index) => value !== locked[index]) ||
      current[3] < locked[3]) {
    throw new Error(`${label}: ${actual} is outside locked ${baseline} patch line`);
  }
}

function adaptiveScoreLayout() {
  const f32 = Math.fround;
  const width = 1600;
  const height = 720;
  const screenRatioX = f32(f32(width) / f32(1334));
  const verticalFit = f32(f32(height) / f32(screenRatioX * f32(750)));
  const safeWidth = f32(f32(width) * f32(0.8999999761581421));
  const safeLeft = f32(f32(f32(width) - safeWidth) * f32(0.5));
  const screenToSafe = f32(f32(safeWidth / f32(width)) * verticalFit);
  const scale = f32(screenRatioX * screenToSafe);
  const root = [safeLeft, 0];
  const progress = [root[0] + 25 * scale, root[1] + 45 * scale];
  const glyphScale = f32(28 / 36);
  const firstDigitLocalX = f32(212 - f32((36 + 33 + 36 * 6) * glyphScale) + f32(2 * glyphScale));
  return {
    progress,
    maskBounds: [
      progress[0] + 42,
      progress[1] - 13.5,
      progress[0] + 417,
      progress[1] + 25.5,
    ],
    firstDigit: [root[0] + firstDigitLocalX * scale, root[1] + 84 * scale],
  };
}

function closeTuple(actual, expected, tolerance, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length ||
      actual.some((value, index) => Math.abs(value - expected[index]) > tolerance)) {
    throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

function equal(actual, expected, label) {
  if (!Object.is(actual, expected)) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, CARGO_NET_OFFLINE: "true" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${String(result.status)}`);
}
