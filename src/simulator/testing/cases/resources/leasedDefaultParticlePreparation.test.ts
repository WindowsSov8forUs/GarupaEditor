declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { prepareLeasedDefaultParticleProvider } from "../../../assembly/leasedDefaultParticlePreparation";
import { selectSimulatorResourceRequirements } from "../../../assembly/resourceRequirements";
import { createNoteBatchInformationList } from "../../../engine/chart/construction";
import { createSimulatorModeIdentity } from "../../../engine/data/inGameCalculatedData";
import { resolveOriginalSkinRecipe } from "../../../engine/skin/originalSkinResolver";
import type { SimulatorResourceFile, SimulatorResourceLease } from "../../../platform/resourceContracts";

const ROOT = join(process.cwd(), "src/assets/game/portable/profiles/default-particle");
const FILES = Object.freeze([
  ["profile.json", "application/json"],
  ["textures.json", "application/json"],
  ["particle-portable-textures/ordinary/Default-Particle.png", "image/png"],
  ["particle-portable-textures/ordinary/Tex_parSet_1.png", "image/png"],
  ["particle-portable-textures/ordinary/Tex_parSet_2.png", "image/png"],
  ["particle-portable-textures/ordinary/effect_circle.png", "image/png"],
  ["particle-portable-textures/ordinary/light.png", "image/png"],
  ["particle-portable-textures/directional/Default-ParticleSystem.png", "image/png"],
  ["particle-portable-textures/directional/directional-tex_parSet_1.png", "image/png"],
] as const);

async function main(): Promise<void> {
  const chart = requireOk(createNoteBatchInformationList({ musicScoreData: "#BPM 120\n#00111:01\n" }));
  const recipe = requireOk(resolveOriginalSkinRecipe({
    noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0,
    directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false,
    special: { kind: "none" },
  }, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard"));
  const selection = selectSimulatorResourceRequirements(chart, recipe);
  assert.equal(selection.requirements.some((row) => row.semanticRole === "particle.default-current-exact"), true);
  assert.equal(selection.requirements.some((row) =>
    row.semanticRole === "skin.tap-effect" || row.semanticRole === "skin.directional-effect"), false,
  "default launch must not lease same-named unversioned provider TapEffect packages");

  const lease = new AssetLease();
  const prepared = await prepareLeasedDefaultParticleProvider(lease);
  assert.equal(prepared.status, "accepted", JSON.stringify(prepared));
  if (prepared.status !== "accepted") return;
  const packResult = await prepared.value.readPreparedSkinPack!();
  assert.equal(packResult.status, "accepted", JSON.stringify(packResult));
  if (packResult.status !== "accepted") return;
  assert.equal(packResult.value.profile.packIdentity,
    "particle-skin-leased-semantic-v1-default-current-exact-10.1.4");
  assert.equal(packResult.value.profile.systemCount, 120);
  assert.equal(packResult.value.textures.logicalTextureCount, 8);
  assert.equal(packResult.value.textures.uniquePngCount, 7);
  assert.deepEqual(packResult.value.profile.bundles.map((bundle) => bundle.key), ["ordinary", "directional"]);
  assert.equal((await prepared.value.read("particle-texture:ordinary:Tex_parSet_1")).status, "accepted");

  const tampered = new AssetLease("particle-portable-textures/ordinary/Tex_parSet_1.png");
  const rejected = await prepareLeasedDefaultParticleProvider(tampered);
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") {
    assert.equal(rejected.failure.capability, "simulator.particle.default-texture-identity");
  }
  console.log("leased exact default particle tests passed: 120 systems / 8 logical / 7 exact PNG, tamper closed");
}

class AssetLease implements SimulatorResourceLease {
  constructor(private readonly tamper: string | null = null) {}
  listFiles(logicalResource: string): readonly SimulatorResourceFile[] {
    if (logicalResource !== "portable/profiles/default-particle") return Object.freeze([]);
    return Object.freeze(FILES.map(([logicalPath, mediaType]) => Object.freeze({
      logicalPath,
      mediaType,
      byteLength: readFileSync(join(ROOT, logicalPath)).byteLength,
    })));
  }
  async readBytes(logicalResource: string, logicalPath: string): Promise<Uint8Array> {
    if (logicalResource !== "portable/profiles/default-particle") throw new Error("unexpected resource");
    const bytes = new Uint8Array(readFileSync(join(ROOT, logicalPath)));
    if (this.tamper === logicalPath) bytes[bytes.length - 1] ^= 0xff;
    return bytes;
  }
  async release(): Promise<void> {}
}

function requireOk<T>(value: { readonly status: "ok"; readonly value: T } | { readonly status: string }): T {
  if (value.status !== "ok") throw new Error(`unexpected result ${JSON.stringify(value)}`);
  return (value as { readonly value: T }).value;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
