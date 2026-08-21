declare function require(name: string): any;
declare const process: any;
declare const Buffer: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
import type { SimulatorResourceFile, SimulatorResourceLease } from "../platform/resourceContracts";
import { prepareSelectedSkinSourcePackages } from "../resources/sourcePackageDecoder";
import type { SelectedSkinResourceIdentity } from "../resources/skinResourceSelector";

const ORDINARY_ROOTS = [
  "effect_TapKeep", "effect_tap", "effect_tap_good", "effect_tap_great", "effect_tap_perfect",
  "effect_tap_skill_good", "effect_tap_skill_great", "effect_tap_skill_perfect", "effect_tap_swipe",
] as const;
const DIRECTIONAL_ROOTS = [
  "effect_tap_directional_flick_l", "effect_tap_directional_flick_l_2", "effect_tap_directional_flick_l_3",
  "effect_tap_directional_flick_l_finger", "effect_tap_directional_flick_r",
  "effect_tap_directional_flick_r_2", "effect_tap_directional_flick_r_3", "effect_tap_directional_flick_r_finger",
] as const;

async function main(): Promise<void> {
  await testNoteSourcePackage();
  await testParticleSourcePackages();
  await testAudioSourcePackage();
  console.log("source package decoder tests passed: leased render rows + 17 semantic particle roots + MP3 cues");
}

async function testNoteSourcePackage(): Promise<void> {
  const logicalResource = "ingameskin/noteskin/skin00";
  const fixtureRoot = join(process.cwd(), "src/simulator/testing/fixtures/reverse-snapshots/autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4/ordinary-portable-assets");
  const files = new Map<string, Uint8Array>([
    ["ingameskin-noteskin-skin00.bundle", json({ Base: { m_AssetBundleName: logicalResource, m_Container: {} } })],
    [".sprites", json([{ Base: {
      m_Name: "note_normal_0",
      m_Rect: { x: 0, y: 0, width: 10, height: 10 },
      m_Pivot: { x: 0.5, y: 0.5 },
      m_PixelsToUnits: 100,
    } }])],
    ["RhythmGameSprites.png", bytes(join(fixtureRoot, "rhythm-game-sprites.png"))],
    ["longNoteLine.png", bytes(join(fixtureRoot, "long-note-line.png"))],
    ["longNoteLine2.png", bytes(join(fixtureRoot, "curve-note-line.png"))],
    ["simultaneous_line.png", bytes(join(fixtureRoot, "simultaneous-line.png"))],
  ]);
  const lease = new MemoryLease(new Map([[logicalResource, files]]));
  const decoded = await prepareSelectedSkinSourcePackages([
    identity("note", logicalResource),
  ], lease);
  assert.equal(decoded.status, "accepted", decoded.status === "rejected" ? decoded.failure.capability : "");
  if (decoded.status === "rejected") return;
  assert.equal(decoded.value.length, 1);
  assert.equal(decoded.value[0]!.files.length, 4);
  const unity = decoded.value[0]!.profile.unity as any;
  assert.equal(unity.textures.length, 4);
  assert.equal(unity.sprites[0].name, "note_normal_0");
  assert.equal(unity.sprites[0].texture_path_id, 1);
  await lease.release();
}

async function testAudioSourcePackage(): Promise<void> {
  const logicalResource = "sound/tapseskin/skin00";
  const portable = JSON.parse(readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/skin-settings/default/sound__tapseskin__skin00.json",
  ), "utf8"));
  const files = new Map<string, Uint8Array>([
    ["sound-tapseskin-skin00.bundle", json({ Base: { m_AssetBundleName: logicalResource, m_Container: {} } })],
  ]);
  for (const file of portable.files) {
    if (file.mime !== "audio/mpeg") continue;
    const cue = String(file.id).slice("cue:".length);
    files.set(`${cue}.mp3`, Uint8Array.from(Buffer.from(file.dataBase64, "base64")));
  }
  const decoded = await prepareSelectedSkinSourcePackages([
    identity("tap-se", logicalResource),
  ], new MemoryLease(new Map([[logicalResource, files]])));
  assert.equal(decoded.status, "accepted", decoded.status === "rejected" ? decoded.failure.capability : "");
  if (decoded.status === "rejected") return;
  assert.equal(decoded.value[0]!.files.length, 6);
  const portableAudio = decoded.value[0]!.profile.portableAudio as any[];
  assert.equal(portableAudio.find((item) => item.cue === "SE_RHYTHM_TAP_LONG").loop, true);
  assert.equal(portableAudio.find((item) => item.cue === "perfect").loop, false);
}

async function testParticleSourcePackages(): Promise<void> {
  const fixtureRoot = join(process.cwd(), "src/simulator/testing/fixtures/reverse-snapshots/device-closure/artifacts/investigations/device-runtime-closure-10-1-4/particle-portable-textures");
  const ordinary = "ingameskin/tapeffect/skin00";
  const directional = "ingameskin/tapeffect/directionalflickskin00normal";
  const packages = new Map<string, Map<string, Uint8Array>>([
    [ordinary, particlePackage(
      ordinary,
      ORDINARY_ROOTS,
      [
        ["Default-Particle.png", join(fixtureRoot, "ordinary/Default-Particle.png")],
        ["Tex_parSet_1.png", join(fixtureRoot, "ordinary/Tex_parSet_1.png")],
        ["Tex_parSet_2.png", join(fixtureRoot, "ordinary/Tex_parSet_2.png")],
        ["effect_circle.png", join(fixtureRoot, "ordinary/effect_circle.png")],
        ["light.png", join(fixtureRoot, "ordinary/light.png")],
      ],
    )],
    [directional, particlePackage(
      directional,
      DIRECTIONAL_ROOTS,
      [
        ["Default-ParticleSystem.png", join(fixtureRoot, "directional/Default-ParticleSystem.png")],
        ["effect_circle.png", join(fixtureRoot, "ordinary/effect_circle.png")],
        ["tex_parSet_1.png", join(fixtureRoot, "directional/tex_parSet_1.png")],
      ],
    )],
  ]);
  const decoded = await prepareSelectedSkinSourcePackages([
    identity("tap-effect", ordinary),
    identity("directional-effect", directional),
  ], new MemoryLease(packages));
  assert.equal(decoded.status, "accepted", decoded.status === "rejected" ? decoded.failure.capability : "");
  if (decoded.status === "rejected") return;
  const roots = new Set(decoded.value.flatMap((pack) => {
    const particle = pack.profile.particle as any;
    return particle.systems.map((system: any) => system.prefab);
  }));
  assert.deepEqual([...ORDINARY_ROOTS, ...DIRECTIONAL_ROOTS].filter((root) => !roots.has(root)), []);
  assert.equal(decoded.value[0]!.files.length, 5);
  assert.equal(decoded.value[1]!.files.length, 3);
}

function particlePackage(
  logicalResource: string,
  roots: readonly string[],
  pngs: readonly (readonly [string, string])[],
): Map<string, Uint8Array> {
  return new Map([
    [`${logicalResource.split("/").join("-")}.bundle`, json({ Base: {
      m_AssetBundleName: logicalResource,
      m_Container: Object.fromEntries(roots.map((root) => [
        `assets/star/forassetbundle/startapp/${logicalResource}/${root}.prefab`,
        { asset: {} },
      ])),
    } })],
    [".asset", json({ Base: {} })],
    ...pngs.map(([name, path]) => [name, bytes(path)] as const),
  ]);
}

class MemoryLease implements SimulatorResourceLease {
  private closed = false;
  constructor(private readonly packages: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>) {}
  listFiles(logicalResource: string): readonly SimulatorResourceFile[] {
    if (this.closed) return [];
    return Object.freeze(Array.from(this.packages.get(logicalResource) ?? [], ([logicalPath, value]) => Object.freeze({
      logicalPath,
      mediaType: mediaType(logicalPath),
      byteLength: value.byteLength,
    })));
  }
  async readBytes(logicalResource: string, logicalPath: string): Promise<Uint8Array> {
    if (this.closed) throw new Error("closed");
    const value = this.packages.get(logicalResource)?.get(logicalPath);
    if (value === undefined) throw new Error("missing");
    return Uint8Array.from(value);
  }
  async release(): Promise<void> { this.closed = true; }
}

function identity(role: SelectedSkinResourceIdentity["role"], logicalResource: string): SelectedSkinResourceIdentity {
  return Object.freeze({ role, logicalResource, resourceKey: logicalResource, profile: null });
}
function bytes(path: string): Uint8Array { return new Uint8Array(readFileSync(path)); }
function json(value: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(value)); }
function mediaType(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  return "application/json";
}

void main();
