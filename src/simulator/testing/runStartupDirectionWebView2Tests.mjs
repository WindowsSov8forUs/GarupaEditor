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
const startupRoot = join(fixtureRoot, "startup-direction", "artifacts", "investigations", "startup-direction-portable-pack-10-1-4");
const scoreRoot = join(fixtureRoot, "score-hud-rank-gauge", "artifacts", "investigations", "score-hud-rank-gauge-10-1-4", "portable-assets");

try {
  rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
  const rows = [
    ["/assets/startup-line-star.png", "startup-line-star.png", "image/png", join(startupRoot, "portable-assets", "startup-line-star.png")],
    ["/assets/ui-common.png", "ui-common.png", "image/png", join(scoreRoot, "ui-common.png")],
    ["/assets/rank-label-font.ttf", "rank-label-font.ttf", "font/ttf", join(scoreRoot, "rank-label-font.ttf")],
  ];
  const allowlist = [];
  for (const [route, name, mime, source] of rows) {
    writeFileSync(join(stage, name), readFileSync(source));
    allowlist.push([route, name, mime]);
  }
  writeFileSync(join(stage, "allowlist.txt"), allowlist.map((row) => row.join("\t")).join("\n") + "\n");
  run(process.execPath, [esbuild, join(testingRoot, "startupDirectionWebView2.test.ts"), "--bundle", "--platform=browser", "--format=iife", "--target=chrome120", `--outfile=${bundle}`], repositoryRoot);
  run("cargo", ["build", "--release", "--offline", "--locked"], harnessRoot);
  const loader = join(process.env.USERPROFILE ?? "", ".cargo/registry/src/index.crates.io-1949cf8c6b5b557f/webview2-com-sys-0.38.2/x64/WebView2Loader.dll");
  if (!existsSync(loader)) throw new Error(`cached WebView2Loader.dll unavailable: ${loader}`);
  const release = join(target, "release"); copyFileSync(loader, join(release, "WebView2Loader.dll"));
  const executable = join(release, "garupa-production-browser-decoder-harness.exe");
  const captures = [];
  for (let index = 0; index < 3; index += 1) {
    const output = join(harnessRoot, `startup-capture-${index + 1}.json`);
    run(executable, [output, stage], harnessRoot);
    const value = JSON.parse(readFileSync(output, "utf8")); verify(value); captures.push(value);
  }
  const stable = captures.map((value) => JSON.stringify({ scene: value.scene, cleanup: value.cleanup }));
  if (stable.some((value) => value !== stable[0])) throw new Error("startup WebView2 fresh processes differ");
  const digest = createHash("sha256").update(stable[0]).digest("hex");
  console.log(`startup direction production WebView2 passed: fresh=3 modes=4 captures=${captures[0].scene.captures.length} digest=${digest}`);
} finally {
  rmSync(bundle, { force: true }); rmSync(stage, { recursive: true, force: true });
  for (let index = 1; index <= 3; index += 1) rmSync(join(harnessRoot, `startup-capture-${index}.json`), { force: true });
}
function verify(value) {
  if (value.schema !== "garupa-startup-direction-webview2-v1" || value.status !== "ok" || value.scene?.modes !== 4 || value.scene?.captures?.length !== 28 || value.cleanup?.stageChildren !== 0) {
    throw new Error(`startup WebView2 failure: ${JSON.stringify(value)}`);
  }
  if (value.scene.captures.some((row) => row.visible <= 0 || !/^[0-9a-f]{64}$/.test(row.rgbaSha256))) throw new Error("startup WebView2 capture is empty or unhashed");
  for (const mode of ["live-manual", "live-auto", "rehearsal-manual", "rehearsal-auto"]) {
    if (!value.scene.captures.some((row) => row.label === `${mode}-playing-sound`)) throw new Error(`startup mode missing ${mode}`);
  }
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit", env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
