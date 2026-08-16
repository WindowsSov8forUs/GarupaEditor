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
];
for (const file of productionFiles) {
  const source = readFileSync(file, "utf8");
  for (const [symbol, description] of forbidden) {
    if (source.includes(symbol)) throw new Error(`${description} remains in ${relative(root, file)}`);
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
for (const symbol of ["142", "1457.5", "912", "924", "903", "315", "issuedControlCapabilities"]) {
  if (!control.includes(symbol)) throw new Error(`control profile/capability missing ${symbol}`);
}
const capabilities = read("public/capabilities.ts");
for (const required of [
  'liveRehearsalFourModeMatrix: "closed-portable"',
  'rehearsalMoveTimeControls: "closed-portable"',
  'mainProgramIntegration: "unauthorized-stage-9"',
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
