import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkRoot = dirname(fileURLToPath(import.meta.url));
const testingRoot = resolve(checkRoot, "..");
const simulatorRoot = resolve(testingRoot, "..");
const repositoryRoot = resolve(simulatorRoot, "..", "..");
const fixtureRoot = join(
  testingRoot, "fixtures", "reverse-snapshots", "device-closure",
  "artifacts", "investigations", "device-runtime-closure-10-1-4",
);

const closure = json("particle_portable_closure.json");
const difference = json("particle_portable_difference_matrix.json");
const policy = json("particle_portable_policy.json");
const semantic = json("particle_semantic_frame_oracle.json");
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));

const expectedLedger = [
  "V01",
  ...Array.from({ length: 32 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 16 }, (_, index) => `DC-R${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 48 }, (_, index) => `DC-C${String(index + 1).padStart(2, "0")}`),
];
check(closure.ledgerCount === 97 && closure.ledger.length === 97, "97-row closure count");
check(JSON.stringify(closure.ledger.map((row) => row.id)) === JSON.stringify(expectedLedger), "97-row closure identity/order");
check(new Set(closure.ledger.map((row) => row.id)).size === 97, "97 raw ledger identities are unique; legacy closure/authorization fields are ignored");
check(closure.autoLiveBudgetUsed === 0 && closure.autoLiveBudgetRemaining === 10, "Auto Live budget untouched");
check(closure.rejectedTracesReclassified === false, "rejected traces not reclassified");
check(closure.portablePolicyClaimedAsOriginalEvidence === false, "portable policy classification");
check(difference.rows.length === 13, "13-row difference matrix");
check(difference.physicalClaimsRemainingOpen.length === 4, "four physical claims remain open");
check(policy.productionBoundaries.networkAllowed === false, "production network disabled");
check(policy.productionBoundaries.forbidden.includes("Math.random"), "Math.random forbidden by policy");
check(semantic.physicalOrderingClaimed === false && semantic.cases.length === 4, "semantic-only frame oracle");

const productionFiles = [
  ...files(join(simulatorRoot, "engine", "particles")),
  ...files(join(simulatorRoot, "backends", "particles")),
  join(simulatorRoot, "backends", "particleContracts.ts"),
  join(simulatorRoot, "backends", "particleValidation.ts"),
  join(simulatorRoot, "backends", "pixi", "pixiParticleRendererBackend.ts"),
  join(simulatorRoot, "backends", "pixi", "browserPixiParticleTextureDecoder.ts"),
  join(simulatorRoot, "host", "portableReplaySession.ts"),
  join(simulatorRoot, "host", "createSimulatorEngine.ts"),
];
const production = productionFiles.map((file) => readFileSync(file, "utf8")).join("\n");
for (const [label, pattern] of [
  ["Math.random", /Math\.random\s*\(/],
  ["wall Date", /\b(?:new\s+Date|Date\.now)\s*\(/],
  ["performance clock", /performance\.now\s*\(/],
  ["Pixi ticker", /\bticker\b/i],
  ["fixture runtime read", /testing[\\/]fixtures|reverse-snapshots/],
  ["tmp runtime read", /(?:^|["'`\\/])tmp[\\/]/m],
  ["Reverse worktree read", /GirlsBandParty-Reverse/],
  ["runtime network", /\bfetch\s*\(|XMLHttpRequest|WebSocket/],
  ["Python runtime", /python(?:\.exe)?|\.py["'`]/i],
]) {
  check(!pattern.test(production), `production ${label}=off`);
}

const engineParticle = files(join(simulatorRoot, "engine", "particles"))
  .map((file) => readFileSync(file, "utf8")).join("\n");
for (const forbidden of ["pixi.js", "react", "@tauri", "node:fs", "document.", "window."]) {
  check(!engineParticle.toLowerCase().includes(forbidden.toLowerCase()), `engine particle dependency ${forbidden}=off`);
}
const pixiParticle = readFileSync(join(simulatorRoot, "backends", "pixi", "pixiParticleRendererBackend.ts"), "utf8");
check(!/engine[\\/]managers|engine[\\/]notes/.test(pixiParticle), "Pixi does not import domain managers/notes");
check(!pixiParticle.includes("Math.round(particleFloat32FromBits(sample.position.zBits)"),
  "particle position.z is not substituted for unproven renderer-bounds ordering");
check(pixiParticle.includes("systemSortOrdinals") && pixiParticle.includes("sample.creationSequence"),
  "Pixi particle ordering consumes sortingOrder/system identity/creation sequence");
const contracts = readFileSync(join(simulatorRoot, "backends", "particleContracts.ts"), "utf8");
for (const forbidden of ["fixtureId", "evidenceId", "nativePointer", "sourceOrder"]) {
  check(!contracts.includes(forbidden), `particle contracts omit ${forbidden}`);
}

const tests = [
  join(testingRoot, "cases/rendering/particleContracts.test.ts"),
  join(testingRoot, "cases/rendering/particleProduction.test.ts"),
  join(testingRoot, "suite/manifest.mjs"),
].map((file) => readFileSync(file, "utf8")).join("\n");
for (const [label, pattern] of [
  ["network", /\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//],
  ["Python", /python(?:\.exe)?|\.py["'`]/i],
  ["FFmpeg", /ffmpeg/i],
  ["sleep", /\bsleep\s*\(|setTimeout\s*\(/],
  ["real wall-clock expected", /Date\.now\s*\(|performance\.now\s*\(/],
]) {
  check(!pattern.test(tests), `particle tests ${label}=off`);
}
check(packageJson.scripts["simulator:test:portable"] ===
  "node src/simulator/testing/suite/run.mjs --profile portable", "portable suite package script");
check(packageJson.scripts["simulator:test:release"] ===
  "node src/simulator/testing/suite/run.mjs --profile release", "release suite package script");

console.log("particle static portable boundary verified: 97 raw rows, fixed-device exact=not-claimed, runtime fallback/network/wall-clock=off");

function json(name) {
  return JSON.parse(readFileSync(join(fixtureRoot, name), "utf8"));
}

function files(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

function check(condition, message) {
  if (!condition) throw new Error(`particle static audit failed: ${message}`);
}
