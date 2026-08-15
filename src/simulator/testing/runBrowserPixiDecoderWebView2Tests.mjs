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
  equal(versions.get("Microsoft Edge WebView2"), contract.hostScope.webView2Runtime, "WebView2 runtime");
  equal(versions.get("Chromium"), contract.hostScope.chromium, "Chromium runtime");
  equal(value.runtime.pixiVersion, contract.hostScope.pixi, "Pixi version");
  equal(value.runtime.rendererName, "webgl", "actual Pixi renderer");
  equal(value.productionDecoder.className, "BrowserPixiTextureDecoder", "production decoder class");
  equal(value.productionDecoder.fontFamily, "GarupaScoreRank-949356BBFEA78FB5", "hash-derived production font family");
  equal(value.productionDecoder.fontFaceLoaded, true, "real production FontFace load");
  equal(value.productionDecoder.documentFontsDeleted, true, "production FontFace cleanup");
  equal(value.productionDecoder.textureResourceType, "ImageBitmap", "real production PNG decode resource");
  equal(JSON.stringify(value.productionDecoder.textureDimensions), "[1024,1024]", "production PNG dimensions");
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
  equal(scoreHud.maskWorldTransform[0], 414, "Score high-rank panel mask world X");
  equal(scoreHud.maskWorldTransform[1], 96, "Score high-rank panel mask world Y");
  equal(JSON.stringify(scoreHud.maskWorldBounds), JSON.stringify([456, 82.5, 831, 121.5]), "Score high-rank panel SS-threshold world bounds");
  equal(JSON.stringify(scoreHud.animationLayerWorldTransform), JSON.stringify([414, 96]), "Score high-rank animation and panel coordinate spaces");
  equal(JSON.stringify(scoreHud.firstDigitWorldTransform), JSON.stringify([324, 135]), "Score first bitmap digit world transform");
  if (scoreHud.nonTransparentPixels <= 0 || !/^[0-9a-f]{64}$/.test(scoreHud.sha256)) {
    throw new Error(`production Score HUD WebView2 raster is invalid: ${JSON.stringify(scoreHud)}`);
  }
  for (const [key, expectedKey] of [["pngOnly", "pngOnly"], ["fontOnly", "fontOnly"]]) {
    const actual = value.raster[key];
    const expected = contract.observation.raster[expectedKey];
    equal(actual.sha256, expected.sha256, `${key} RGBA digest`);
    equal(actual.nonTransparentPixels, expected.stats.nonTransparentPixels, `${key} visible pixel count`);
  }
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
