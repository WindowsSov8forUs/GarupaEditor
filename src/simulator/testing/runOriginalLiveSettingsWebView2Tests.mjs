import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const harnessRoot = join(testingRoot, "webview2-ordinary-rendering-harness");
const bundle = join(harnessRoot, "bundle.js");
const stage = join(harnessRoot, "input-stage");
const target = join(harnessRoot, "target");
const require = createRequire(import.meta.url);
const esbuild = require.resolve("esbuild/bin/esbuild");
const fixtureRoot = join(testingRoot, "fixtures", "reverse-snapshots");
const ordinaryRoot = join(fixtureRoot, "autonomous-module", "artifacts", "investigations", "autonomous-simulator-portable-pack-10-1-4");
const visibleRoot = join(fixtureRoot, "ordinary-visible-rendering", "artifacts", "investigations", "ordinary-visible-rendering-portable-10-1-4");
const EXPECTED_DIGEST = "ea881bb158d3f7e62a73860700ade2be0468b3395eebb05c6c200a9523aea445";
const sources = [
  ["ordinary/notes/skin00/atlas", join(ordinaryRoot, "ordinary-portable-assets", "rhythm-game-sprites.png")],
  ["ordinary/notes/skin00/long-note-line", join(ordinaryRoot, "ordinary-portable-assets", "long-note-line.png")],
  ["ordinary/notes/skin00/curve-note-line", join(ordinaryRoot, "ordinary-portable-assets", "curve-note-line.png")],
  ["ordinary/notes/skin00/simultaneous-line", join(ordinaryRoot, "ordinary-portable-assets", "simultaneous-line.png")],
  ["ordinary/notes/directionalflickskin00/atlas", join(ordinaryRoot, "ordinary-portable-assets", "directional-flick-sprites.png")],
  ["ordinary/notes/directionalflickskin00/line-left", join(ordinaryRoot, "ordinary-portable-assets", "directional-line-left.png")],
  ["ordinary/notes/directionalflickskin00/line-right", join(ordinaryRoot, "ordinary-portable-assets", "directional-line-right.png")],
  ...[1, 2, 3, 4].map((index) => [`field/ordinary/tap-lane-effect-${index}`, join(visibleRoot, "portable-assets", `tap-lane-effect-${index}.png`)]),
];

try {
  prepareStage();
  run(process.execPath, [esbuild, join(testingRoot, "originalLiveSettingsWebView2.test.ts"), "--bundle", "--platform=browser", "--format=iife", "--target=chrome120", `--outfile=${bundle}`], repositoryRoot);
  run("cargo", ["build", "--release", "--offline", "--locked"], harnessRoot);
  const loader = join(process.env.USERPROFILE ?? "", ".cargo/registry/src/index.crates.io-1949cf8c6b5b557f/webview2-com-sys-0.38.2/x64/WebView2Loader.dll");
  if (!existsSync(loader)) throw new Error(`cached WebView2Loader.dll unavailable: ${loader}`);
  const release = join(target, "release");
  copyFileSync(loader, join(release, "WebView2Loader.dll"));
  const executable = join(release, "garupa-production-browser-decoder-harness.exe");
  const observed = [];
  for (let index = 0; index < 3; index += 1) {
    const capture = join(harnessRoot, `original-settings-capture-${index + 1}.json`);
    run(executable, [capture, stage], harnessRoot);
    const value = JSON.parse(readFileSync(capture, "utf8"));
    verify(value);
    observed.push(value);
  }
  const baseline = stable(observed[0]);
  for (let index = 1; index < observed.length; index += 1) {
    if (stable(observed[index]) !== baseline) throw new Error(`fresh original-settings WebView2 run ${index + 1} differs`);
  }
  const digest = createHash("sha256").update(baseline).digest("hex");
  if (!EXPECTED_DIGEST || digest !== EXPECTED_DIGEST) throw new Error(`original settings WebView2 digest changed: ${digest}`);
  console.log(`original Live settings WebView2 passed: fresh=3 digest=${digest} active=${observed[0].raster.active.rgbaSha256}`);
} finally {
  rmSync(bundle, { force: true });
  rmSync(stage, { recursive: true, force: true });
  for (let index = 1; index <= 3; index += 1) rmSync(join(harnessRoot, `original-settings-capture-${index}.json`), { force: true });
}

function prepareStage() {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const allowlist = [];
  const render = sources.map(([logicalAssetId, source], index) => {
    const name = `settings-render-${String(index).padStart(2, "0")}.bin`;
    const route = `/assets/${name}`;
    stageFile(route, name, "application/octet-stream", readFileSync(source), allowlist);
    return { logicalAssetId, url: route };
  });
  const profile = JSON.parse(readFileSync(join(ordinaryRoot, "ordinary_portable_profile.json"), "utf8"));
  profile.assets.push(
    laneAsset(1, 14137, "14AA04909EB54FAF55A479B512D8AF5E8745AEAC7F330CA9F2EE2B7353B09F3D", 467),
    laneAsset(2, 11402, "0683902F48E0CE8662B716227FDCA5DDFFECC979DCB1BC1C70AB2A5BB21CE113", 342),
    laneAsset(3, 7630, "D53F90B1F97D5ACFB461A46E3BF2250B07191A6E5BFACED6166A3A27E53FD0CA", 218),
    laneAsset(4, 5535, "5710C5079FCCDE25C2638074AFDD8FFE5A3B8305FF5BCAD1986DE82F4EF43B48", 154),
  );
  stageFile("/input-map.json", "input-map.json", "application/json; charset=utf-8", Buffer.from(JSON.stringify({ render })), allowlist);
  stageFile("/render-profile.json", "render-profile.json", "application/json; charset=utf-8", Buffer.from(JSON.stringify(profile)), allowlist);
  writeFileSync(join(stage, "allowlist.txt"), allowlist.map((row) => row.join("\t")).join("\n") + "\n");
}
function laneAsset(index, byteLength, sha256, width) {
  return {
    logicalAssetId: `field/ordinary/tap-lane-effect-${index}`, role: "lane-effect", byteLength, sha256,
    mime: "image/png", width, height: 500,
    textureSettings: { scaleMode: "linear", wrapModeU: "clamp", wrapModeV: "clamp", mipmap: "off", premultiplyAlpha: true, blendMode: "add" },
    atlasRows: [{ exactKey: `NoteLaneEffect_${index}`, x: 0, y: 0, width, height: 500, pivotX: 0.5, pivotY: 0, pixelsPerUnit: 69 }],
    materialRole: "sprite", animationRole: "none", provenance: "current-apk",
  };
}
function stageFile(route, name, mime, bytes, allowlist) {
  writeFileSync(join(stage, name), bytes);
  allowlist.push([route, name, mime]);
}
function verify(value) {
  if (value.schema !== "garupa-original-live-settings-webview2-v1" || value.status !== "ok") throw new Error(JSON.stringify(value));
  if (value.runtime.rendererName !== "webgl" || value.owner.initializedSlots !== 13 || value.owner.activeCount !== 1 ||
    value.owner.disabledCount !== 0 || value.owner.resourceCount !== 11 || !value.owner.activeBinding.endsWith("NoteLaneEffect_4") ||
    value.raster.active.nonBackgroundPixels <= value.raster.disabled.nonBackgroundPixels ||
    value.cleanup.rendererOwners !== 0 || value.cleanup.stageChildren !== 0) throw new Error(`invalid original settings browser observation: ${JSON.stringify(value)}`);
}
function stable(value) {
  return JSON.stringify({ owner: value.owner, raster: value.raster, cleanup: value.cleanup, runtime: { pixiVersion: value.runtime.pixiVersion, rendererName: value.runtime.rendererName } });
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: target, NODE_PATH: join(repositoryRoot, "node_modules") } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
