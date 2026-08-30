import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
const cleanCargoTarget = process.env.SIMULATOR_WEBVIEW2_CLEAN_BUILD === "1";
const freshRunCount = process.env.SIMULATOR_WEBVIEW2_FRESH_RUNS === "1" ? 1 : 3;
const require = createRequire(import.meta.url);
const esbuild = require.resolve("esbuild/bin/esbuild");
const fixtureRoot = join(testingRoot, "fixtures", "reverse-snapshots");
const ordinaryRoot = join(
  fixtureRoot,
  "autonomous-module", "artifacts", "investigations", "autonomous-simulator-portable-pack-10-1-4",
);
const visibleRoot = join(
  fixtureRoot,
  "ordinary-visible-rendering", "artifacts", "investigations", "ordinary-visible-rendering-portable-10-1-4",
);
const scoreRoot = join(
  fixtureRoot,
  "score-hud-rank-gauge", "artifacts", "investigations", "score-hud-rank-gauge-10-1-4",
);
const pauseRoot = join(
  fixtureRoot,
  "pause-ui", "artifacts", "investigations", "in-game-pause-ui-runtime-contract-10-1-4",
);
const particleRoot = join(
  fixtureRoot,
  "device-closure", "artifacts", "investigations", "device-runtime-closure-10-1-4",
);
const dynamicRoot = join(
  fixtureRoot,
  "evidence-integrity", "artifacts", "investigations", "simulator-dynamic-acceptance-oracle-10-1-4",
);
const strictRoot = join(
  fixtureRoot,
  "hud-particle-pause-terminal-strict-reaudit", "artifacts", "investigations",
  "simulator-hud-particle-pause-terminal-strict-reaudit-10-1-4",
);
const sevenVisualOracle = join(
  fixtureRoot,
  "seven-visual-lifecycle", "artifacts", "investigations",
  "simulator-seven-visual-lifecycle-reconfirmation-10-1-4", "seven_visual_lifecycle_oracle.json",
);
const sevenVisualFreshContract = join(
  fixtureRoot,
  "seven-visual-fresh-reconfirmation", "artifacts", "investigations",
  "simulator-seven-visual-fresh-reconfirmation-10-1-4", "seven_visual_fresh_reconfirmation_contract.json",
);
const renderSources = [
  ["ordinary/notes/skin00/atlas", join(ordinaryRoot, "ordinary-portable-assets", "rhythm-game-sprites.png")],
  ["ordinary/notes/skin00/long-note-line", join(ordinaryRoot, "ordinary-portable-assets", "long-note-line.png")],
  ["ordinary/notes/skin00/curve-note-line", join(ordinaryRoot, "ordinary-portable-assets", "curve-note-line.png")],
  ["ordinary/notes/skin00/simultaneous-line", join(ordinaryRoot, "ordinary-portable-assets", "simultaneous-line.png")],
  ["ordinary/notes/directionalflickskin00/atlas", join(ordinaryRoot, "ordinary-portable-assets", "directional-flick-sprites.png")],
  ["ordinary/notes/directionalflickskin00/line-left", join(ordinaryRoot, "ordinary-portable-assets", "directional-line-left.png")],
  ["ordinary/notes/directionalflickskin00/line-right", join(ordinaryRoot, "ordinary-portable-assets", "directional-line-right.png")],
  ["hud/ordinary/combo-number-atlas", join(visibleRoot, "portable-assets", "combo-number.png")],
  ["hud/ordinary/judge-atlas", join(visibleRoot, "portable-assets", "judge-skin00.png")],
  ["hud/ordinary/rhythm-game-additive-atlas", join(visibleRoot, "portable-assets", "rhythm-game-additive.png")],
  ["hud/ordinary/ui-additive-effect-atlas", join(visibleRoot, "portable-assets", "ui-additive-effect.png")],
  ["field/ordinary/tap-lane-effect-1", join(visibleRoot, "portable-assets", "tap-lane-effect-1.png")],
  ["field/ordinary/tap-lane-effect-2", join(visibleRoot, "portable-assets", "tap-lane-effect-2.png")],
  ["field/ordinary/tap-lane-effect-3", join(visibleRoot, "portable-assets", "tap-lane-effect-3.png")],
  ["field/ordinary/tap-lane-effect-4", join(visibleRoot, "portable-assets", "tap-lane-effect-4.png")],
  ["hud/score/rhythm-game-ui-atlas", join(scoreRoot, "portable-assets", "rhythm-game-ui.png")],
  ["hud/score/rank-label-font", join(scoreRoot, "portable-assets", "rank-label-font.ttf")],
  ["hud/score/ui-common-atlas", join(scoreRoot, "portable-assets", "ui-common.png")],
  ["hud/score/high-rank-kira", join(scoreRoot, "portable-assets", "high-rank-kira.png")],
  ["hud/score/high-rank-long-star", join(scoreRoot, "portable-assets", "high-rank-long-star.png")],
  ["hud/score/high-rank-overlay", join(scoreRoot, "portable-assets", "high-rank-overlay.png")],
  ["ui/pause/countdown-1", join(pauseRoot, "portable-assets", "countdown-1.png")],
  ["ui/pause/countdown-2", join(pauseRoot, "portable-assets", "countdown-2.png")],
  ["ui/pause/countdown-3", join(pauseRoot, "portable-assets", "countdown-3.png")],
];
const gameClearRoot = join(repositoryRoot, "src", "assets", "game", "prefabs", "bms", "gameclear");
const commonRenderCatalog = JSON.parse(readFileSync(join(
  repositoryRoot, "src", "simulator", "engine", "skin", "commonRenderSemanticCatalog.json",
)));
const gameClearRows = commonRenderCatalog.groups.gameClear;
for (const row of gameClearRows) renderSources.push([row.profile.logicalAssetId, join(gameClearRoot, row.file)]);
const gameClearAssets = gameClearRows.map((row) => {
  const bytes = readFileSync(join(gameClearRoot, row.file));
  return {
    ...row.profile,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    provenance: "current-official-portable",
  };
});
const particleSources = [
  ["particle/profile/current-portable-v1", join(particleRoot, "particle_portable_profile.json")],
  ["particle/textures/current-portable-v1", join(particleRoot, "particle_portable_texture_manifest.json")],
  ["particle-texture:directional:Default-ParticleSystem", join(particleRoot, "particle-portable-textures", "directional", "Default-ParticleSystem.png")],
  ["particle-texture:directional:tex_parSet_1", join(particleRoot, "particle-portable-textures", "directional", "tex_parSet_1.png")],
  ["particle-texture:ordinary:Default-Particle", join(particleRoot, "particle-portable-textures", "ordinary", "Default-Particle.png")],
  ["particle-texture:ordinary:Tex_parSet_1", join(particleRoot, "particle-portable-textures", "ordinary", "Tex_parSet_1.png")],
  ["particle-texture:ordinary:Tex_parSet_2", join(particleRoot, "particle-portable-textures", "ordinary", "Tex_parSet_2.png")],
  ["particle-texture:ordinary:effect_circle", join(particleRoot, "particle-portable-textures", "ordinary", "effect_circle.png")],
  ["particle-texture:ordinary:light", join(particleRoot, "particle-portable-textures", "ordinary", "light.png")],
];

try {
  if (cleanCargoTarget) rmSync(target, { recursive: true, force: true });
  prepareStage();
  run(process.execPath, [
    esbuild,
    join(testingRoot, "ordinaryRenderingWebView2.test.ts"),
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
  const executable = join(release, "garupa-production-browser-decoder-harness.exe");
  const observed = [];
  for (let runIndex = 0; runIndex < freshRunCount; runIndex += 1) {
    const capture = join(harnessRoot, `capture-${runIndex + 1}.json`);
    run(executable, [capture, stage], harnessRoot);
    const value = JSON.parse(readFileSync(capture, "utf8"));
    verify(value);
    observed.push(value);
  }
  const baseline = canonical(stableProjection(observed[0]));
  for (let index = 1; index < observed.length; index += 1) {
    if (canonical(stableProjection(observed[index])) !== baseline) {
      throw new Error(`fresh incognito WebView2 run ${index + 1} differs from run 1`);
    }
  }
  const digest = createHash("sha256").update(baseline).digest("hex");
  console.log(
    `ordinary production WebView2 candidate observation passed (product-visible closure remains open): fresh=${freshRunCount} captures=${observed[0].scene.captures.length} ` +
    `digest=${digest} runtime=${runtimeVersion(observed[0])}`,
  );
} finally {
  rmSync(bundle, { force: true });
  rmSync(stage, { recursive: true, force: true });
  if (cleanCargoTarget) rmSync(target, { recursive: true, force: true });
  for (let index = 1; index <= 3; index += 1) rmSync(join(harnessRoot, `capture-${index}.json`), { force: true });
}

function prepareStage() {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const allowlist = [];
  const render = stageResources("render", renderSources, allowlist);
  const particle = stageResources("particle", particleSources, allowlist);
  stageFile("/input-map.json", "input-map.json", "application/json; charset=utf-8",
    Buffer.from(JSON.stringify({ render, particle })), allowlist);
  for (const [route, name, mime, source] of [
    ["/render-profile.json", "render-profile.json", "application/json; charset=utf-8", join(ordinaryRoot, "ordinary_portable_profile.json")],
    ["/visible-profile.json", "visible-profile.json", "application/json; charset=utf-8", join(repositoryRoot, "src/assets/game/portable/profiles/ordinary-visible/profile.json")],
    ["/score-animation.json", "score-animation.json", "application/json; charset=utf-8", join(scoreRoot, "score_gauge_ss_animation_profile.json")],
    ["/game-clear-profile.json", "game-clear-profile.json", "application/json; charset=utf-8", join(gameClearRoot, "game-clear-profile.json")],
    ["/pause-countdown-animation.json", "pause-countdown-animation.json", "application/json; charset=utf-8", join(repositoryRoot, "src/assets/game/prefabs/bms/pause/countdown-animation-profile.json")],
    ["/strict-reaudit.json", "strict-reaudit.json", "application/json; charset=utf-8", join(strictRoot, "strict_reaudit_contract.json")],
    ["/seven-visual-oracle.json", "seven-visual-oracle.json", "application/json; charset=utf-8", sevenVisualOracle],
    ["/seven-visual-fresh.json", "seven-visual-fresh.json", "application/json; charset=utf-8", sevenVisualFreshContract],
    ["/game-clear-assets.json", "game-clear-assets.json", "application/json; charset=utf-8", null],
    ["/chart.bms", "chart.bms", "text/plain; charset=utf-8", join(dynamicRoot, "bms", "poppin_shuffle_special.bms.txt")],
  ]) stageFile(route, name, mime, source === null
    ? Buffer.from(JSON.stringify(gameClearAssets))
    : readFileSync(source), allowlist);
  writeFileSync(join(stage, "allowlist.txt"), allowlist.map((row) => row.join("\t")).join("\n") + "\n");
}

function stageResources(prefix, sources, allowlist) {
  return sources.map(([logicalAssetId, source], index) => {
    const name = `${prefix}-${String(index).padStart(2, "0")}.bin`;
    const route = `/assets/${name}`;
    stageFile(route, name, "application/octet-stream", readFileSync(source), allowlist);
    return { logicalAssetId, url: route };
  });
}

function stageFile(route, name, mime, bytes, allowlist) {
  if (!route.startsWith("/") || route.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`invalid staged protocol identity: ${route}/${name}`);
  }
  writeFileSync(join(stage, name), bytes);
  allowlist.push([route, name, mime]);
}

function verify(value) {
  if (value.schema !== "garupa-ordinary-rendering-webview2-v1" || value.status !== "ok") {
    throw new Error(`ordinary rendering WebView2 failed: ${JSON.stringify(value)}`);
  }
  equal(value.runtime.rendererName, "webgl", "actual Pixi renderer");
  equal(value.productionDecoders.render, "BrowserPixiTextureDecoder", "production render decoder");
  equal(value.productionDecoders.particle, "BrowserPixiParticleTextureDecoder", "production particle decoder");
  equal(value.scene.rootLabel, "GarupaSimulatorCombinedScene", "combined scene root");
  equal(JSON.stringify(value.scene.stageOrder), JSON.stringify(["GarupaSimulatorRoot", "GarupaSimulatorRoot/GarupaSimulatorParticles"]), "combined stage order");
  equal(value.scene.chartBatchCount, 656, "registered full chart batch count");
  equal(value.scene.naturalClearStatus, 3, "Auto AP product terminal status");
  const { fullComboPhaseMatrix, allPerfectPhaseMatrix, ...sevenVisualBase } = value.scene.sevenVisualLifecycle;
  equal(JSON.stringify(sevenVisualBase), JSON.stringify({
    freshStatus: "portable-requirements-authorized-product-visible-open",
    status: "confirmed-current-seven-visual-lifecycle-reconfirmation",
    fullComboChannels: 104,
    allPerfectChannels: 129,
    additionalInvisibleBoundarySeconds: 2.616666555404663,
    baseCallbackBoundarySeconds: 3.233,
    scoreGaugeSsContinuousSeconds: 7.5,
    uvFrame: 11,
  }), "SVL-R01/R05/R06/R07 actual WebView2 matrix");
  const bbkk = value.scene.bbkkSingleWidthFramebuffer;
  if (bbkk?.status !== "portable-product-complete-framebuffer-feature-gate-passed-original-equivalence-open" ||
      bbkk.productSemanticsId !== "simulator.bbkk-single-width-ordinary-particle-visible-regression-v1" ||
      bbkk.inputSha256 !== "54938A6CA7509D1C0286C756AC44EA643FBD755236BC5F2D1B543FE894F221F8" ||
      bbkk.allAuditedVisibleWidthsAreOne !== true || bbkk.threshold !== 220 ||
      bbkk.accepted?.particleNodeCount < 12 ||
      bbkk.accepted?.metrics?.leftStarAndGlow?.fineComponentCountArea2To160 < 2 ||
      bbkk.accepted?.metrics?.rightStarAndGlow?.fineComponentCountArea2To160 < 2 ||
      bbkk.accepted?.metrics?.leftJudgementGlow?.largeComponentCountAreaOver160 < 1 ||
      bbkk.accepted?.metrics?.rightJudgementGlow?.largeComponentCountAreaOver160 < 1 ||
      bbkk.accepted?.additiveBackdrop?.decreasedRgbChannelCount !== 0 ||
      !/^[0-9a-f]{64}$/.test(bbkk.accepted?.additiveBackdrop?.baselineSha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(bbkk.accepted?.additiveBackdrop?.composedSha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(bbkk.accepted?.rgbaSha256 ?? "") ||
      bbkk.originalEquivalenceAuthorized !== false || bbkk.cleanup?.renderOwners !== 0 || bbkk.cleanup?.particleOwners !== 0) {
    throw new Error(`focused R01 invalid B.B.K single-width WebGL feature gate: ${JSON.stringify(bbkk)}`);
  }
  const tapKeep = value.scene.tapKeepSameState;
  if (typeof tapKeep?.stableOwnerKey !== "string" || tapKeep.rootTransformCount < 2 ||
      tapKeep.maximumVisibleMeshes <= 0 || tapKeep.terminalObserved !== true ||
      !/^[0-9a-f]{64}$/.test(tapKeep.acceptedFramebuffer?.sha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(tapKeep.rejectedDoubleScaleFramebuffer?.sha256 ?? "") ||
      tapKeep.acceptedFramebuffer.sha256 === tapKeep.rejectedDoubleScaleFramebuffer.sha256 ||
      tapKeep.acceptedFramebuffer.nonTransparentPixels <= 0 ||
      tapKeep.rejectedDoubleScaleFramebuffer.nonTransparentPixels <= 0 ||
      tapKeep.cleanup?.particleOwners !== 0 || tapKeep.cleanup?.renderOwners !== 0) {
    throw new Error(`SVF-R03 invalid complete production TapKeep same-state gate: ${JSON.stringify(tapKeep)}`);
  }
  for (const [key, matrix] of [["FullCombo_text_in", fullComboPhaseMatrix], ["AllPerfect_text_in", allPerfectPhaseMatrix]]) {
    if (matrix?.animationKey !== key || matrix.phaseDigests.length !== 8 ||
        new Set(matrix.phaseDigests).size !== 6 || matrix.phaseDigests.some((digest) => !/^[0-9a-f]{64}$/.test(digest)) ||
        matrix.textOutPhaseDigests?.length !== 5 ||
        matrix.textOutPhaseDigests.some((digest) => !/^[0-9a-f]{64}$/.test(digest)) ||
        matrix.textOutPhaseDigests[1] === matrix.textOutPhaseDigests[4]) {
      throw new Error(`SVL-R07/focused-R06 invalid text-in/text-out production framebuffer matrix: ${JSON.stringify(matrix)}`);
    }
  }
  const required = new Set([
    "initialize", "note-spawn", "note-animation", "judgement", "combo-add-score",
    "rank-c", "rank-b", "rank-a", "rank-s", "rank-ss", "particle-peak", "pause", "resume",
    "natural-completion", "life-warning", "game-over",
    "rehearsal-manual-controls", "rehearsal-life-zero-continuation",
    "rehearsal-forward-five-controls", "rehearsal-return-five-controls",
    "rehearsal-auto-demo-controls", "live-manual-full-combo",
    "rehearsal-manual-base-clear", "rehearsal-auto-all-perfect",
  ]);
  for (const capture of value.scene.captures) {
    required.delete(capture.label);
    if (!/^[0-9a-f]{64}$/.test(capture.rgbaSha256) || capture.nonTransparentPixels <= 0 ||
        capture.owners.visibleWorldRecords <= 0 || capture.worldObservation.kind !== "testing-pixi-world-observer" ||
        capture.worldObservation.records.length <= 2 ||
        !Object.values(capture.crops).every((digest) => /^[0-9a-f]{64}$/.test(digest))) {
      throw new Error(`invalid full-scene capture: ${JSON.stringify(capture)}`);
    }
  }
  if (required.size !== 0) throw new Error(`missing full-scene captures: ${[...required].join(",")}`);
  const judgement = value.scene.captures.find((capture) => capture.label === "judgement");
  const judgementTextures = judgement?.worldObservation?.records
    ?.map((record) => record.texture?.label ?? "") ?? [];
  if (!judgementTextures.some((label) => label.endsWith(":judge_auto")) ||
      judgementTextures.some((label) => label.endsWith(":judge_perfect"))) {
    throw new Error(`Auto judgement material route mismatch: ${judgementTextures.join("|")}`);
  }
  const comboCapture = value.scene.captures.find((capture) => capture.label === "combo-add-score");
  const comboTextures = comboCapture?.worldObservation?.records
    ?.map((record) => record.texture?.label ?? "") ?? [];
  const normalDigitIndex = comboTextures.findIndex((label) =>
    label.includes("icon_number_big_") && !label.includes("icon_number_big_AP_"));
  const normalUnitIndex = comboTextures.findIndex((label) => label.endsWith(":combo"));
  const apDigitIndex = comboTextures.findIndex((label) => label.includes("icon_number_big_AP_"));
  const apUnitIndex = comboTextures.findIndex((label) => label.endsWith(":combo_AP"));
  if (normalDigitIndex < 0 || normalUnitIndex < 0 || apDigitIndex < 0 || apUnitIndex < 0 ||
      apDigitIndex <= normalDigitIndex || apUnitIndex <= normalUnitIndex) {
    throw new Error(`parallel normal/AP Combo material route mismatch: ${comboTextures.join("|")}`);
  }
  for (const cleanup of [
    value.cleanup.auto,
    value.cleanup.manual,
    value.cleanup.liveManualClear,
    value.cleanup.rehearsalManual,
    value.cleanup.rehearsalAuto,
  ]) {
    equal(cleanup.rendererState, "disposed", "render cleanup state");
    equal(cleanup.renderOwners, 0, "render cleanup owners");
    equal(cleanup.renderStageChildren, 0, "render cleanup stage");
    equal(cleanup.particleState, "disposed", "particle cleanup state");
    equal(cleanup.particleOwners, 0, "particle cleanup owners");
    equal(cleanup.particleResources, 0, "particle cleanup resources");
    equal(cleanup.particleStageChildren, 0, "particle cleanup stage");
    equal(cleanup.combinedDestroyed, true, "combined cleanup root");
    equal(cleanup.applicationStageChildren, 0, "application cleanup stage");
  }
  equal(value.cleanup.initialFontFaces, value.cleanup.finalFontFaces, "FontFace cleanup");
  equal(value.cleanup.applicationStageChildren, 0, "final application stage cleanup");
  if (new Set(value.isolation.resourceUrls.map((url) => new URL(url).origin)).size !== 1 ||
      !value.isolation.resourceUrls.every((url) => url.startsWith("http://garupa.localhost/"))) {
    throw new Error(`ordinary browser harness escaped custom protocol: ${value.isolation.resourceUrls.join(",")}`);
  }
}

function stableProjection(value) {
  return {
    runtime: value.runtime,
    productionDecoders: value.productionDecoders,
    scene: value.scene,
    cleanup: value.cleanup,
    isolation: value.isolation,
  };
}

function runtimeVersion(value) {
  const rows = value.runtime.highEntropy?.fullVersionList ?? [];
  return rows.find((row) => row.brand === "Microsoft Edge WebView2")?.version ?? "unknown";
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
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
