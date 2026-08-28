import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd(), "src", "simulator");
const productionFiles = walk(root).filter((path) =>
  !path.includes(`${join("src", "simulator", "testing")}`) &&
  !path.endsWith(".md") && /\.(?:ts|mjs)$/.test(path)
);
const forbidden = [
  ["startMilliseconds", "initial arbitrary seek"],
  ["create-replay-checkpoint", "caller checkpoint command"],
  ['kind: "return-time"', "legacy unbounded return command"],
  ["resultTransform", "legacy three-value Auto transform"],
  ["playMode:", "legacy playMode field"],
  ["Math.random", "ambient random"],
  ["Date.now", "wall clock"],
  ["performance.now", "wall clock"],
  ["REHEARSAL_CONTROL_SCENE_PROFILE", "screenshot-derived fixed control profile"],
];
for (const file of productionFiles) {
  const source = readFileSync(file, "utf8");
  for (const [symbol, description] of forbidden) {
    const present = symbol === "playMode:"
      ? /(?:^|[^A-Za-z0-9_])playMode\s*:/.test(source)
      : source.includes(symbol);
    if (present) throw new Error(`${description} remains in ${relative(root, file)}`);
  }
}

const calculated = read("engine/data/inGameCalculatedData.ts");
for (const field of ["sessionMode", "inputMode", "isEnablePractice", "isDemoPlayMode", "isAutoLive", "isAutoPlay"]) {
  if (!calculated.includes(field)) throw new Error(`canonical mode field missing: ${field}`);
}
const replay = read("host/portableReplaySession.ts");
for (const symbol of ["return-five", "advance-five", "RETURN_REPLAY_LIMIT_SECONDS", "timelineRevisionValue", "moveTimeCountValue"]) {
  if (!replay.includes(symbol)) throw new Error(`MoveTime owner missing ${symbol}`);
}
const control = read("scene/rehearsalControlScene.ts");
for (const symbol of [
  "createRehearsalControlSceneLayout",
  "centerBottomLeft",
  "hitCircleRadiusPixels",
  "insideCircle",
  "timeLabelBoundsTopLeft",
  "demoBadgeBoundsTopLeft",
  "issuedControlCapabilities",
]) {
  if (!control.includes(symbol)) throw new Error(`control prefab/capability missing ${symbol}`);
}
const pause = read("scene/pauseControlScene.ts");
for (const symbol of [
  "PauseControlSceneOwner", "createPauseControlLayout", "consumePauseControlCommand",
  "resume-countdown", "RESUME_COUNTDOWN_SECONDS", "issuedCommands", "GE-PS-BACK-PLAYING-OPENS-PAUSE",
  "GE-PS-BACK-CONFIRM-TO-PAUSE", "retry-confirm", "abort-confirm",
]) if (!pause.includes(symbol)) throw new Error(`Pause scene/capability missing ${symbol}`);
const autonomous = read("runtime/autonomousSimulatorRuntime.ts");
for (const symbol of ["synchronizeSurface", "pauseControl.route", "publishPauseControlState", "consumePauseControlCommand", "platform-abort"])
  if (!autonomous.includes(symbol)) throw new Error(`Pause runtime route missing ${symbol}`);
const pixi = read("backends/pixi/pixiRendererBackend.ts");
for (const symbol of ["createInGameControlOverlay", "original-pause-button", "pause-modal-root", "InGameCountDownAnimation", "Contents/Count1Fadeout", "samplePauseCountdownClip"])
  if (!pixi.includes(symbol)) throw new Error(`Pause Pixi owner missing ${symbol}`);
const builtInWindow = readFileSync(resolve(process.cwd(), "src/app/BuiltInSimulatorWindow.tsx"), "utf8");
for (const forbiddenSymbol of ["showTemporaryMobileBack", "temporaryMobileBackStyle", "点击开始以解锁音频"])
  if (builtInWindow.includes(forbiddenSymbol)) throw new Error(`player shell retains forbidden running overlay: ${forbiddenSymbol}`);
if (!builtInWindow.includes("setMobileSimulatorImmersive(false)")) throw new Error("Mobile Simulator teardown does not restore system bars");
const mobileRuntime = readFileSync(resolve(process.cwd(), "src/app/mobileRuntime.ts"), "utf8");
for (const symbol of ["GarupaSimulatorHost", "setMobileSimulatorImmersive", "window.location.replace"])
  if (!mobileRuntime.includes(symbol)) throw new Error(`Mobile route boundary missing ${symbol}`);
const androidActivity = readFileSync(resolve(process.cwd(), "src-tauri/gen/android/app/src/main/java/com/garupa/editor/MainActivity.kt"), "utf8");
for (const symbol of ["SimulatorHostBridge", "SYSTEM_UI_FLAG_IMMERSIVE_STICKY", "BrowserBack", "handleBackNavigation: Boolean = false"])
  if (!androidActivity.includes(symbol)) throw new Error(`Android Simulator host boundary missing ${symbol}`);
const browserPlatform = readFileSync(resolve(process.cwd(), "src/app/simulator/browserSimulatorPlatform.ts"), "utf8");
for (const symbol of ["platform-pause", "platform-resume", "platform-abort", "hardwareBack"])
  if (!browserPlatform.includes(symbol)) throw new Error(`browser raw platform input missing ${symbol}`);

const capabilities = read("public/capabilities.ts");
for (const required of [
  'liveRehearsalFourModeMatrix: "closed-portable"',
  'rehearsalMoveTimeControls: "closed-portable"',
  'mainProgramIntegration: "closed-product-integration"',
]) if (!capabilities.includes(required)) throw new Error(`mode capability missing: ${required}`);
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
if (packageJson.scripts?.["simulator:test:live-rehearsal"] !==
    "node src/simulator/testing/runLiveRehearsalModeTests.mjs") {
  throw new Error("standalone Live/Rehearsal test script is not registered");
}
console.log(`Live/Rehearsal static boundaries passed: production-files=${productionFiles.length}`);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}
function walk(directory) {
  const values = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) values.push(...walk(path));
    else values.push(path);
  }
  return values;
}
