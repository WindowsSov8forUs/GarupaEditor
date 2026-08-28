import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src/simulator");
const fixturePath = resolve(root,
  "testing/fixtures/reverse-snapshots/hud-particle-pause-terminal-strict-reaudit/artifacts/investigations/simulator-hud-particle-pause-terminal-strict-reaudit-10-1-4/strict_reaudit_contract.json");
const bytes = readFileSync(fixturePath);
if (bytes.length !== 214523 || createHash("sha256").update(bytes).digest("hex").toUpperCase() !==
    "B61BC615295B132540E0100AD9A6289D7C3B2F90185D88259CB89079222D00C2") {
  throw new Error("strict re-audit fixture identity mismatch");
}
const contract = JSON.parse(bytes);
if (contract.status !== "confirmed-current-hud-particle-pause-terminal-strict-reaudit" ||
    contract.closure.productionAuthorization !== true || contract.closure.fixedDeviceFramebufferExact !== false) {
  throw new Error("strict re-audit closure mismatch");
}
const read = (relative) => readFileSync(resolve(root, relative), "utf8");
const complete = read("backends/resources/currentCompleteHudProfile.ts");
for (const symbol of [
  "CURRENT_SCORE_GAUGE_SS_SIBLING_ORDER", '"Flash", "BigStar_1", "BigStar_2"',
  "CURRENT_TAP_LANE_EFFECT_SPRITE_MASK", 'interaction: "visible-outside"',
]) if (!complete.includes(symbol)) throw new Error(`strict component profile missing ${symbol}`);
const producer = read("engine/rendering/renderCommandProducer.ts");
const comboBranch = producer.slice(producer.indexOf('if (animationRole === "combo" && nextElapsed >= 1)'),
  producer.indexOf("} else {", producer.indexOf('if (animationRole === "combo" && nextElapsed >= 1)')));
if (!comboBranch.includes('kind: "stop-animation"') || comboBranch.includes('kind: "hide-object"')) {
  throw new Error("Combo scale completion still shares Judge-style hide ownership");
}
for (const symbol of ["spriteFlipX: state.flipX", "state.flipX !== (state.slot >= 8)"])
  if (!producer.includes(symbol)) throw new Error(`Lane command producer missing ${symbol}`);
const pixi = read("backends/pixi/pixiRendererBackend.ts");
for (const symbol of [
  "CURRENT_SCORE_GAUGE_SS_SIBLING_ORDER", "componentOwners", "pauseCountdownAnimation",
  "samplePauseCountdownClip", "Contents/Count1Fadeout", "wordWrapWidth: width",
  "snapshot.hudAlpha", "setMask({ mask, inverse: true })", "if (!row.path.includes(\"/\")) node.zIndex = 20",
]) if (!pixi.includes(symbol)) throw new Error(`strict Pixi consumer missing ${symbol}`);
const particle = read("backends/pixi/pixiParticleRendererBackend.ts");
for (const symbol of [
  "createPixiParticleLinearColorMesh", "particleLinearColor", "PixiParticleLinearColorMesh",
]) if (!particle.includes(symbol)) throw new Error(`particle Float32 consumer missing ${symbol}`);
if (particle.includes("function rgbTint(") || particle.includes("sprite.filters")) {
  throw new Error("particle renderer retains RGB8 sample tint or per-sample filter render-pass path");
}
const particleMesh = read("backends/pixi/pixiParticleLinearColorMesh.ts");
for (const symbol of ["uParticleColor", "Float32Array(values)", "particle-linear-float-color-mesh"])
  if (!particleMesh.includes(symbol)) throw new Error(`particle Linear Mesh shader missing ${symbol}`);
const pause = read("scene/pauseControlScene.ts");
if (!pause.includes("hudAlpha: Math.fround(hudAlpha)")) throw new Error("Pause/Auto visual snapshot omits startup HUD alpha");
const runtime = read("runtime/autonomousSimulatorRuntime.ts");
if (!runtime.includes("refreshed.value.hudAlpha")) throw new Error("runtime drops startup HUD alpha before visual publication");
const countdown = read("backends/resources/currentPauseCountdownAnimationProfile.ts");
for (const symbol of ["ContinueCountDownAnimation", "duration: 3.5", "curves: 25", "curves: 10"])
  if (!countdown.includes(symbol)) throw new Error(`countdown parser missing ${symbol}`);
for (const forbidden of ["testing/fixtures", "GirlsBandParty-Reverse", "tmp/"])
  for (const relative of [
    "backends/pixi/pixiRendererBackend.ts", "backends/pixi/pixiParticleRendererBackend.ts",
    "engine/rendering/renderCommandProducer.ts", "scene/pauseControlScene.ts",
  ]) if (read(relative).includes(forbidden)) throw new Error(`${relative} imports forbidden evidence location ${forbidden}`);
console.log("strict HUD/particle/Pause/terminal static gate passed: 8 domains");
