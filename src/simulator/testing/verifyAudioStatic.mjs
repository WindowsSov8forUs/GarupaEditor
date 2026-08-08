import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const simulatorRoot = resolve(testingRoot, "..");
const productionRoots = ["engine", "host", "backends"].map((part) => resolve(simulatorRoot, part));
const engineRoot = resolve(simulatorRoot, "engine");
const webAudioPath = resolve(simulatorRoot, "backends", "audio", "webAudioBackend.ts");
const audioTestPaths = [
  resolve(testingRoot, "audioContracts.test.ts"),
  resolve(testingRoot, "audioWebAudio.test.ts"),
  resolve(testingRoot, "runAudioTests.mjs"),
];

const violations = [];
for (const root of productionRoots) {
  for (const path of listFiles(root, ".ts")) {
    const source = readFileSync(path, "utf8");
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
console.log("audio static boundary verified: engine DOM/WebAudio/fs/network/codec=off production fixtures=off tests network/python/sleep=off command test identity=off");

function listFiles(root, extension) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return listFiles(path, extension);
    return extname(entry.name) === extension ? [path] : [];
  });
}
