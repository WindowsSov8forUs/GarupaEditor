import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const simulatorRoot = resolve(testingRoot, "..");
const productionRoots = [
  "assembly", "backends", "engine", "host", "platform", "public", "resources",
].map((part) => resolve(simulatorRoot, part));
const engineRoot = resolve(simulatorRoot, "engine");
const webAudioPath = resolve(simulatorRoot, "backends", "audio", "webAudioBackend.ts");
const audioTestPaths = [
  resolve(testingRoot, "sessionBgmDerivation.test.ts"),
  resolve(testingRoot, "audioContracts.test.ts"),
  resolve(testingRoot, "audioWebAudio.test.ts"),
  resolve(testingRoot, "audioSessionBgmTestProfile.ts"),
  resolve(testingRoot, "runAudioTests.mjs"),
];
const bgmContract = JSON.parse(readFileSync(resolve(
  testingRoot, "fixtures", "reverse-snapshots", "audio", "artifacts", "investigations",
  "audio-session-bgm-resource-contract-10-1-4", "audio_session_bgm_resource_contract.json",
), "utf8"));

const violations = [];
let productionSource = "";
for (const root of productionRoots) {
  for (const path of listFiles(root, ".ts")) {
    const source = readFileSync(path, "utf8");
    productionSource += `\n${source}`;
    if (/testing[\\/]fixtures|GirlsBandParty-Reverse|(?:^|["'`])tmp[\\/]/m.test(source)) {
      violations.push(`production evidence path: ${path}`);
    }
    if (path.startsWith(engineRoot) &&
      /\b(?:AudioContext|AudioBuffer|AudioNode|GainNode|document|window|fetch|XMLHttpRequest|WebSocket|AudioDecoder)\b/.test(source)) {
      violations.push(`engine DOM/WebAudio/network/codec dependency: ${path}`);
    }
    if (path.startsWith(engineRoot) &&
      /(?:from\s+["'](?:node:)?(?:fs|http|https|net|tls|dgram)["']|import\s+["'](?:node:)?(?:fs|http|https|net|tls|dgram)["'])/.test(source)) {
      violations.push(`engine Node filesystem/network dependency: ${path}`);
    }
  }
}
if (/bgm003|sound\/bgm003|current-external-portable-v1/.test(productionSource)) {
  violations.push("production retains a chart-specific BGM literal or old fixed profile identity");
}
if (!productionSource.includes('cue: "SE_RHYTHM_TAP_SKILL"') ||
  !productionSource.includes('return ok("SE_RHYTHM_TAP_SKILL")')) {
  violations.push("Skill-note hit SE resource or chart-owned route was removed with the character skill effect system");
}
if (/SE_RHYTHM_(?:CLEAR_VO|CUTIN|CUTIN_AUDIENCE|CUTIN_SKILL)/.test(productionSource)) {
  violations.push("character voice/cut-in-only SE remains production-reachable");
}
if (bgmContract.case_count !== 6 || !Array.isArray(bgmContract.cases) || bgmContract.cases.length !== 6) {
  violations.push("session BGM raw Reverse case inventory mismatch; legacy closure/authorization fields are ignored");
}
const publicContracts = readFileSync(resolve(simulatorRoot, "public", "contracts.ts"), "utf8");
const derivation = readFileSync(resolve(simulatorRoot, "assembly", "sessionBgmDerivation.ts"), "utf8");
const composition = readFileSync(resolve(simulatorRoot, "platform", "platformComposition.ts"), "utf8");
if (!publicContracts.includes("readonly bgm: Uint8Array;") ||
  /SimulatorChartAudioData|currentSampleFrames/.test(publicContracts)) {
  violations.push("Public BGM is not the direct Uint8Array-only contract");
}
for (const required of [
  "inspectMp3FirstFrame", "simulator.audio.invalid-mp3-byte-structure",
  "metadata.sampleFrames / metadata.sampleRate", "sha256UpperHex(bytes)",
  "session_bgm_${sha256}",
]) {
  if (!derivation.includes(required)) violations.push(`internal BGM derivation missing: ${required}`);
}
if (!composition.includes("deriveSessionBgmResource") ||
  !composition.includes("bgmByRecipe") ||
  !composition.includes("this.bgmByRecipe.get(recipe)") ||
  !composition.includes("bgm.value.profile.cue") ||
  !composition.includes("bgm.value.profile.durationSeconds") ||
  composition.includes("chartData.bgm.cue")) {
  violations.push("production composition does not exclusively consume derived BGM metadata");
}
if (/currentSampleFrames/.test(productionSource)) {
  violations.push("obsolete currentSampleFrames remains in production audio contracts");
}
const webSource = readFileSync(webAudioPath, "utf8");
if (/from\s+["'](?:\.\.\/)*\.\.\/engine\/(?:managers|notes)|from\s+["'](?:\.\.\/)*\.\.\/host/.test(webSource)) {
  violations.push("Web Audio backend imports domain managers/notes/host");
}
for (const path of audioTestPaths) {
  const source = readFileSync(path, "utf8");
  if (/\b(?:python|python3|py\.exe|ffmpeg)\b|https?:\/\/|\bfetch\s*\(|\bsetTimeout\s*\(/i.test(source)) {
    violations.push(`audio test external dependency/sleep: ${path}`);
  }
}
const contracts = readFileSync(resolve(simulatorRoot, "backends", "audioContracts.ts"), "utf8");
const commandSection = contracts.slice(contracts.indexOf("export type AudioCommand"), contracts.indexOf("export interface AudioCommandBatch"));
if (/fixtureId|evidenceId|sourceOrder|expected/i.test(commandSection)) {
  violations.push("AudioCommand contains test/evidence/expected identity");
}
if (violations.length > 0) {
  throw new Error(`Audio static boundary failed:\n${violations.join("\n")}`);
}
console.log("audio static boundary verified: dynamic session BGM, no production bgm003/default, engine DOM/WebAudio/fs/network/codec=off production fixtures=off tests network/python/sleep=off");

function listFiles(root, extension) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return listFiles(path, extension);
    return extname(entry.name) === extension ? [path] : [];
  });
}
