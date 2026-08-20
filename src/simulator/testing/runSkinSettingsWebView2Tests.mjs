import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const harnessRoot = join(testingRoot, "webview2-ordinary-rendering-harness");
const bundle = join(harnessRoot, "bundle.js");
const stage = join(harnessRoot, "skin-input-stage");
const target = join(harnessRoot, "target");
const fixtureRoot = join(testingRoot, "fixtures", "reverse-snapshots");
const renderProfile = join(
  fixtureRoot, "autonomous-module", "artifacts", "investigations",
  "autonomous-simulator-portable-pack-10-1-4", "ordinary_portable_profile.json",
);
const scenarios = Object.freeze([
  Object.freeze({ kind: "default", packRoot: join(fixtureRoot, "skin-settings", "default"), packCount: 8,
    roles: Object.freeze(["note", "field", "judge"]), background: false }),
  Object.freeze({ kind: "limited3", packRoot: join(fixtureRoot, "skin-settings", "limited3"), packCount: 9,
    roles: Object.freeze(["note", "field", "judge", "background"]), background: true }),
]);
const require = createRequire(import.meta.url);
const esbuild = require.resolve("esbuild/bin/esbuild");
const clean = process.env.SIMULATOR_WEBVIEW2_CLEAN_BUILD === "1";

try {
  if (clean) rmSync(target, { recursive: true, force: true });
  run(process.execPath, [
    esbuild,
    join(testingRoot, "skinSettingsWebView2.test.ts"),
    "--bundle", "--platform=browser", "--format=iife", "--target=chrome120",
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
  const executable = join(release, "garupa-production-browser-decoder-harness.exe");
  for (const scenario of scenarios) {
    prepareStage(scenario);
    const values = [];
    for (let index = 0; index < 3; index += 1) {
      const capture = join(harnessRoot, `skin-${scenario.kind}-capture-${index + 1}.json`);
      run(executable, [capture, stage], harnessRoot);
      const value = JSON.parse(readFileSync(capture, "utf8"));
      verify(value, scenario);
      values.push(value);
    }
    const canonical = JSON.stringify(values[0]);
    if (values.some((value) => JSON.stringify(value) !== canonical)) {
      throw new Error(`selected Skin ${scenario.kind} fresh WebView2 observations differ`);
    }
    console.log(`selected Skin ${scenario.kind} WebView2 passed: fresh=3 raster=${values[0].rgbaSha256} observation=${createHash("sha256").update(canonical).digest("hex")}`);
  }
} finally {
  rmSync(bundle, { force: true });
  rmSync(stage, { recursive: true, force: true });
  if (clean) rmSync(target, { recursive: true, force: true });
  for (const scenario of scenarios) for (let index = 1; index <= 3; index += 1) {
    rmSync(join(harnessRoot, `skin-${scenario.kind}-capture-${index}.json`), { force: true });
  }
}

function prepareStage(scenario) {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const allowlist = [];
  const packs = [];
  let index = 0;
  for (const name of readdirSync(scenario.packRoot).filter((value) => value.endsWith(".json")).sort()) {
    const logicalResource = name.slice(0, -5).replaceAll("__", "/");
    const fileName = `skin-pack-${String(index++).padStart(2, "0")}.json`;
    const route = `/assets/${fileName}`;
    stageFile(route, fileName, "application/json; charset=utf-8", readFileSync(join(scenario.packRoot, name)), allowlist);
    packs.push({ logicalResource, url: route });
  }
  stageFile("/packs.json", "packs.json", "application/json; charset=utf-8", Buffer.from(JSON.stringify({ packs })), allowlist);
  stageFile("/selection.json", "selection.json", "application/json; charset=utf-8", Buffer.from(JSON.stringify({ kind: scenario.kind })), allowlist);
  stageFile("/render-profile.json", "render-profile.json", "application/json; charset=utf-8", readFileSync(renderProfile), allowlist);
  writeFileSync(join(stage, "allowlist.txt"), allowlist.map((row) => row.join("\t")).join("\n") + "\n");
}
function stageFile(route, name, mime, bytes, allowlist) {
  writeFileSync(join(stage, name), bytes);
  allowlist.push([route, name, mime]);
}
function verify(value, scenario) {
  if (value.status !== "accepted" || value.scenario !== scenario.kind || value.packCount !== scenario.packCount ||
      value.assetCount < 10 || JSON.stringify(value.actualDrawnRoles) !== JSON.stringify(scenario.roles) ||
      value.fieldDrawCount !== 3 || value.judgeDraw !== true || value.backgroundDraw !== scenario.background ||
      typeof value.rgbaSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.rgbaSha256) ||
      !Number.isSafeInteger(value.alphaPixels) || value.alphaPixels <= 0 ||
      value.particleResources <= 2 || value.particleCleanup !== 0 || value.fieldCleanup !== 0 || value.cleanup !== 0) {
    throw new Error(`selected Skin ${scenario.kind} WebView2 failed: ${JSON.stringify(value)}`);
  }
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit", env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
