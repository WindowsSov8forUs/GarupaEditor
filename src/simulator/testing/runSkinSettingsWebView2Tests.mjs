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
const stage = join(harnessRoot, "skin-input-stage");
const target = join(harnessRoot, "target");
const fixtureRoot = join(testingRoot, "fixtures", "reverse-snapshots");
const packRoot = join(fixtureRoot, "skin-settings", "limited3");
const renderProfile = join(
  fixtureRoot, "autonomous-module", "artifacts", "investigations",
  "autonomous-simulator-portable-pack-10-1-4", "ordinary_portable_profile.json",
);
const require = createRequire(import.meta.url);
const esbuild = require.resolve("esbuild/bin/esbuild");
const clean = process.env.SIMULATOR_WEBVIEW2_CLEAN_BUILD === "1";

try {
  if (clean) rmSync(target, { recursive: true, force: true });
  prepareStage();
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
  const values = [];
  for (let index = 0; index < 3; index += 1) {
    const capture = join(harnessRoot, `skin-capture-${index + 1}.json`);
    run(executable, [capture, stage], harnessRoot);
    const value = JSON.parse(readFileSync(capture, "utf8"));
    verify(value);
    values.push(value);
  }
  const canonical = JSON.stringify(values[0]);
  if (values.some((value) => JSON.stringify(value) !== canonical)) {
    throw new Error("selected Skin fresh WebView2 observations differ");
  }
  console.log(`selected Skin WebView2 passed: fresh=3 digest=${createHash("sha256").update(canonical).digest("hex")}`);
} finally {
  rmSync(bundle, { force: true });
  rmSync(stage, { recursive: true, force: true });
  if (clean) rmSync(target, { recursive: true, force: true });
  for (let index = 1; index <= 3; index += 1) {
    rmSync(join(harnessRoot, `skin-capture-${index}.json`), { force: true });
  }
}

function prepareStage() {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const allowlist = [];
  const packs = [];
  let index = 0;
  for (const name of readFileNames(packRoot)) {
    const logicalResource = name.slice(0, -5).replaceAll("__", "/");
    const fileName = `skin-pack-${String(index++).padStart(2, "0")}.json`;
    const route = `/assets/${fileName}`;
    stageFile(route, fileName, "application/json; charset=utf-8", readFileSync(join(packRoot, name)), allowlist);
    packs.push({ logicalResource, url: route });
  }
  stageFile("/packs.json", "packs.json", "application/json; charset=utf-8", Buffer.from(JSON.stringify({ packs })), allowlist);
  stageFile("/render-profile.json", "render-profile.json", "application/json; charset=utf-8", readFileSync(renderProfile), allowlist);
  writeFileSync(join(stage, "allowlist.txt"), allowlist.map((row) => row.join("\t")).join("\n") + "\n");
}

function readFileNames(root) {
  return require("node:fs").readdirSync(root).filter((name) => name.endsWith(".json")).sort();
}
function stageFile(route, name, mime, bytes, allowlist) {
  writeFileSync(join(stage, name), bytes);
  allowlist.push([route, name, mime]);
}
function verify(value) {
  if (value.status !== "accepted" || value.packCount !== 9 || value.assetCount < 10 ||
      value.imageBitmapCount < 1 || value.fieldBindings !== true || value.background !== true ||
      value.cleanup !== 0) {
    throw new Error(`selected Skin WebView2 failed: ${JSON.stringify(value)}`);
  }
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit", env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
