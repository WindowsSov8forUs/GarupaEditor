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
const stage = join(harnessRoot, "garupa-product-input-stage");
const target = join(harnessRoot, "target");
const clean = process.env.SIMULATOR_WEBVIEW2_CLEAN_BUILD === "1";
const require = createRequire(import.meta.url);
const esbuild = require.resolve("esbuild/bin/esbuild");
const fixtureRoot = join(testingRoot, "fixtures", "reverse-snapshots", "autonomous-module", "artifacts", "investigations", "autonomous-simulator-portable-pack-10-1-4");
const visibleProfilePath = join(
  repositoryRoot,
  "src/assets/game/portable/profiles/ordinary-visible/profile.json",
);
const visualFifthContractPath = join(
  testingRoot,
  "fixtures/reverse-snapshots/visual-fifth-reaudit/artifacts/investigations/simulator-visual-fifth-reaudit-10-1-4/visual_fifth_correction_contract.json",
);
const fiveVisualCorrectionPath = join(
  testingRoot,
  "fixtures/reverse-snapshots/five-visual-correction/artifacts/investigations/simulator-five-visual-correction-10-1-4/five_visual_correction_contract.json",
);
const commonRenderCatalogPath = join(repositoryRoot, "src/simulator/engine/skin/commonRenderSemanticCatalog.json");
const sources = [
  ["ordinary/notes/skin00/atlas", "rhythm-game-sprites.png"],
  ["ordinary/notes/skin00/long-note-line", "long-note-line.png"],
  ["ordinary/notes/skin00/curve-note-line", "curve-note-line.png"],
  ["ordinary/notes/skin00/simultaneous-line", "simultaneous-line.png"],
  ["ordinary/notes/directionalflickskin00/atlas", "directional-flick-sprites.png"],
  ["ordinary/notes/directionalflickskin00/line-left", "directional-line-left.png"],
  ["ordinary/notes/directionalflickskin00/line-right", "directional-line-right.png"],
];

try {
  if (clean) rmSync(target, { recursive: true, force: true });
  prepareStage();
  run(process.execPath, [
    esbuild,
    join(testingRoot, "garupaProductWebView2.test.ts"),
    "--bundle", "--platform=browser", "--format=iife", "--target=chrome120",
    `--outfile=${bundle}`,
  ], repositoryRoot);
  run("cargo", ["build", "--release", "--offline", "--locked"], harnessRoot);
  const loader = join(process.env.USERPROFILE ?? "", ".cargo/registry/src/index.crates.io-1949cf8c6b5b557f/webview2-com-sys-0.38.2/x64/WebView2Loader.dll");
  if (!existsSync(loader)) throw new Error(`cached WebView2Loader.dll unavailable: ${loader}`);
  const release = join(target, "release");
  copyFileSync(loader, join(release, "WebView2Loader.dll"));
  const executable = join(release, "garupa-production-browser-decoder-harness.exe");
  const observed = [];
  for (let index = 0; index < 3; index += 1) {
    const capture = join(harnessRoot, `garupa-product-capture-${index + 1}.json`);
    run(executable, [capture, stage], harnessRoot);
    const value = JSON.parse(readFileSync(capture, "utf8"));
    verify(value);
    observed.push(value);
  }
  const baseline = canonical(stableProjection(observed[0]));
  for (let index = 1; index < observed.length; index += 1) {
    if (canonical(stableProjection(observed[index])) !== baseline) {
      throw new Error(`Garupa product fresh WebView2 run ${index + 1} differs from run 1`);
    }
  }
  const digest = createHash("sha256").update(baseline).digest("hex");
  console.log(`Garupa product WebView2 passed: fresh=3 captures=4 digest=${digest} runtime=${observed[0].runtime.webglVersion}`);
} finally {
  rmSync(bundle, { force: true });
  rmSync(stage, { recursive: true, force: true });
  if (clean) rmSync(target, { recursive: true, force: true });
  for (let index = 1; index <= 3; index += 1) rmSync(join(harnessRoot, `garupa-product-capture-${index}.json`), { force: true });
}

function prepareStage() {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const allowlist = [];
  const render = sources.map(([logicalAssetId, file], index) => {
    const name = `render-${String(index).padStart(2, "0")}.bin`;
    const route = `/assets/${name}`;
    stageFile(route, name, "application/octet-stream", readFileSync(join(fixtureRoot, "ordinary-portable-assets", file)), allowlist);
    return { logicalAssetId, url: route };
  });
  const catalog = JSON.parse(readFileSync(commonRenderCatalogPath, "utf8"));
  const laneProfiles = catalog.groups.ordinaryVisible
    .filter((row) => row.file.startsWith("tap-lane-effect-"))
    .map((row) => {
      const bytes = readFileSync(join(
        repositoryRoot,
        "src/assets/game/atlas/bms/ui/tap-lane-effect",
        row.file,
      ));
      return {
        ...row,
        bytes,
        profile: {
          ...row.profile,
          byteLength: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
          provenance: "current-apk",
        },
      };
    });
  for (const row of laneProfiles) {
    const index = render.length;
    const name = `render-${String(index).padStart(2, "0")}.bin`;
    const route = `/assets/${name}`;
    stageFile(route, name, "application/octet-stream", row.bytes, allowlist);
    render.push({ logicalAssetId: row.profile.logicalAssetId, url: route });
  }
  const visualFifthContractUrl = "/visual-fifth-contract.json";
  stageFile(
    visualFifthContractUrl,
    "visual-fifth-contract.json",
    "application/json; charset=utf-8",
    readFileSync(visualFifthContractPath),
    allowlist,
  );
  const fiveVisualCorrectionUrl = "/five-visual-correction.json";
  stageFile(
    fiveVisualCorrectionUrl,
    "five-visual-correction.json",
    "application/json; charset=utf-8",
    readFileSync(fiveVisualCorrectionPath),
    allowlist,
  );
  stageFile("/input-map.json", "input-map.json", "application/json; charset=utf-8", Buffer.from(JSON.stringify({ render, visualFifthContractUrl, fiveVisualCorrectionUrl })), allowlist);
  const renderProfile = JSON.parse(readFileSync(join(fixtureRoot, "ordinary_portable_profile.json"), "utf8"));
  renderProfile.ordinaryVisibleProfile = JSON.parse(readFileSync(visibleProfilePath, "utf8"));
  renderProfile.assets.push(...laneProfiles.map((row) => row.profile));
  stageFile(
    "/render-profile.json",
    "render-profile.json",
    "application/json; charset=utf-8",
    Buffer.from(JSON.stringify(renderProfile)),
    allowlist,
  );
  while (allowlist.length < 32) {
    const index = allowlist.length;
    stageFile(`/unused/product-${index}`, `unused-${index}.bin`, "application/octet-stream", Buffer.from([index]), allowlist);
  }
  writeFileSync(join(stage, "allowlist.txt"), allowlist.map((row) => row.join("\t")).join("\n") + "\n");
}
function stageFile(route, name, mime, bytes, allowlist) {
  writeFileSync(join(stage, name), bytes);
  allowlist.push([route, name, mime]);
}
function verify(value) {
  if (value.schema !== "garupa-product-webview2-v2" || value.status !== "ok") throw new Error(`Garupa product browser failed: ${JSON.stringify(value)}`);
  equal(value.runtime.rendererName, "webgl", "actual WebGL renderer");
  equal(value.productionDecoder, "BrowserPixiTextureDecoder", "production decoder");
  equal(JSON.stringify(value.chart.referenceFieldLanes), JSON.stringify([0, 1, 2, 3, 4, 5, 6]), "fixed reference field lanes");
  equal(value.chart.fieldLines, 7, "fixed product field lines");
  equal(value.chart.sv, 3, "product SV count");
  equal(JSON.stringify(value.captures.map((row) => row.label)), JSON.stringify(["initial", "negative-sv", "zero-sv", "restore-positive"]), "capture labels");
  for (const row of value.captures) {
    if (!/^[0-9a-f]{64}$/.test(row.rgbaSha256) || row.owners <= 0 ||
      row.observedMaximumSlideSectionWidth > row.maximumSlideSectionWidth + 0.02 ||
      row.world.kind !== "testing-pixi-world-observer" || row.world.records.length < 9) {
      throw new Error(`invalid Garupa product capture ${JSON.stringify(row)}`);
    }
  }
  if (!value.captures.some((row) => row.nonTransparentPixels > 0)) {
    throw new Error("Garupa product visual matrix never intersects the physical framebuffer");
  }
  equal(value.cleanup.rendererState, "disposed", "renderer dispose");
  equal(value.cleanup.owners, 0, "owner cleanup");
  equal(value.cleanup.rendererChildren, 0, "renderer child cleanup");
  equal(value.cleanup.applicationChildren, 0, "application child cleanup");
  equal(value.laneEffect.binding.endsWith("NoteLaneEffect_4"), true, "product entry lane binding");
  equal(JSON.stringify(value.laneEffect.anchor), JSON.stringify([0.5, 1]), "product entry lane pivot");
  equal(value.laneEffect.blendMode, "add", "product entry lane blend");
  if (!/^[0-9a-f]{64}$/.test(value.laneEffect.rgbaSha256) || value.laneEffect.nonTransparentPixels <= 0) {
    throw new Error(`product lane effect has no real-resource framebuffer pixels: ${JSON.stringify(value.laneEffect)}`);
  }
  if (new Set(value.isolation.resourceUrls.map((url) => new URL(url).origin)).size !== 1 ||
    !value.isolation.resourceUrls.every((url) => url.startsWith("http://garupa.localhost/"))) {
    throw new Error(`Garupa product browser escaped custom protocol: ${value.isolation.resourceUrls.join(",")}`);
  }
}
function stableProjection(value) {
  return { runtime: value.runtime, productionDecoder: value.productionDecoder, chart: value.chart, captures: value.captures, laneEffect: value.laneEffect, cleanup: value.cleanup, isolation: value.isolation };
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function equal(actual, expected, label) { if (!Object.is(actual, expected)) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`); }
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit", timeout: 1_800_000, env: { ...process.env, CARGO_NET_OFFLINE: "true" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${String(result.status)}`);
}
