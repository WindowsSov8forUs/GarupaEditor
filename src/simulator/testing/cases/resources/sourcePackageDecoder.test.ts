declare function require(name: string): any;
declare const process: any;
declare const Buffer: any;
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
import type { SimulatorResourceFile, SimulatorResourceLease } from "../../../platform/resourceContracts";
import { prepareSelectedSkinSourcePackages } from "../../../resources/sourcePackageDecoder";
import { prepareLeasedCommonRenderResources } from "../../../assembly/leasedCommonResourcePreparation";
import { prepareLeasedAudioResources } from "../../../assembly/leasedAudioPreparation";
import { audioAccepted } from "../../../backends/audioValidation";
import type { SelectedSkinResourceIdentity } from "../../../assembly/resourceRequirements";

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
  await testCommonRenderPackages();
  await testNoteSourcePackage();
  await testParticleSourcePackages();
  await testAudioSourcePackage();
  await testLeasedAudioIgnoresUnselectedCommonMembers();
  console.log("source package decoder tests passed: leased render rows + 17 semantic particle roots + selected MP3 cues");
}

async function testCommonRenderPackages(): Promise<void> {
  const root = join(process.cwd(), "src/assets/game");
  const packages = new Map<string, Map<string, Uint8Array>>();
  const add = (logicalResource: string, files: readonly (readonly [string, string])[]) => {
    packages.set(logicalResource, new Map(files.map(([logicalPath, physical]) => [logicalPath, bytes(join(root, physical))])));
  };
  add("portable/profiles/ordinary-render", [["profile.json", "portable/profiles/ordinary-render/profile.json"]]);
  add("portable/profiles/ordinary-visible", [["profile.json", "portable/profiles/ordinary-visible/profile.json"]]);
  add("atlas/bms/ui/iconcombonumber", [["combo-number.png", "atlas/bms/ui/iconcombonumber/combo-number.png"]]);
  add("atlas/bms/ui/rhythmgameui", [["rhythm-game-additive.png", "atlas/bms/ui/rhythmgameui/rhythm-game-additive.png"], ["rhythm-game-ui.png", "atlas/bms/ui/rhythmgameui/rhythm-game-ui.png"]]);
  add("atlas/bms/ui/tap-lane-effect", [1, 2, 3, 4].map((index) => [`tap-lane-effect-${index}.png`, `atlas/bms/ui/tap-lane-effect/tap-lane-effect-${index}.png`] as const));
  add("atlas/bms/ui/ui-additive-effect", [["ui-additive-effect.png", "atlas/bms/ui/ui-additive-effect/ui-additive-effect.png"]]);
  add("atlas/bms/ui/uicommon", [["ui-common.png", "atlas/bms/ui/uicommon/ui-common.png"]]);
  add("fonts/sgm", [["rank-label-font.ttf", "fonts/sgm/rank-label-font.ttf"]]);
  add("prefabs/bms/information", [["startup-line-star.png", "prefabs/bms/information/startup-line-star.png"]]);
  add("prefabs/bms/pause", [
    ...[1, 2, 3].map((index) => [`countdown-${index}.png`, `prefabs/bms/pause/countdown-${index}.png`] as const),
    ["countdown-animation-profile.json", "prefabs/bms/pause/countdown-animation-profile.json"] as const,
  ]);
  add("prefabs/bms/rhythmgamegauge/score", [
    ["high-rank-kira.png", "prefabs/bms/rhythmgamegauge/score/high-rank-kira.png"],
    ["high-rank-long-star.png", "prefabs/bms/rhythmgamegauge/score/high-rank-long-star.png"],
    ["high-rank-overlay.png", "prefabs/bms/rhythmgamegauge/score/high-rank-overlay.png"],
    ["score-gauge-ss-animation-profile.json", "prefabs/bms/rhythmgamegauge/score/score-gauge-ss-animation-profile.json"],
  ]);
  add("prefabs/bms/gameclear", readdirSync(join(root, "prefabs/bms/gameclear")).map((file: string) =>
    [file, `prefabs/bms/gameclear/${file}`] as const));
  const prepared = await prepareLeasedCommonRenderResources(new MemoryLease(packages));
  assert.equal(prepared.status, "accepted", prepared.status === "rejected" ? prepared.failure.capability : "");
  if (prepared.status === "rejected") return;
  assert.equal(prepared.value.profile.assets.length, 51);
  assert.equal(prepared.value.profile.packIdentity, "application-leased-semantic-render-v1");
  assert.equal(prepared.value.profile.ordinaryVisibleProfile?.noteAnimations.clips.length, 4);
  assert.equal(prepared.value.profile.scoreGaugeSsAnimation?.curveCount, 56);
  assert.equal(prepared.value.profile.gameClearProfile?.allPerfect.clip.curve_count, 129);
  assert.equal(prepared.value.profile.pauseCountdownAnimation?.continueClip.curveCount, 25);
  assert.equal(prepared.value.profile.pauseCountdownAnimation?.resumeOneSecondClip.curveCount, 10);
  const asset = (id: string) => prepared.value.profile.assets.find((row) => row.logicalAssetId === id)!;
  const atlas = (id: string, key: string) => asset(id).atlasRows.find((row) => row.exactKey === key)!;
  assert.deepEqual(
    [atlas("hud/ordinary/combo-number-atlas", "icon_number_big_0").y,
      atlas("hud/ordinary/ui-additive-effect-atlas", "effect_health_caution_outline").y,
      atlas("hud/score/rhythm-game-ui-atlas", "gauge_base_score").y,
      atlas("hud/score/rhythm-game-ui-atlas", "combo").y,
      atlas("hud/score/rhythm-game-ui-atlas", "btn_ingame_time_back").y,
      atlas("hud/score/rhythm-game-ui-atlas", "button_pause").y],
    [396, 43, 449, 175, 920, 319],
    "NGUI-derived common atlas rows use the exported PNG top-left coordinates from the Reverse profile",
  );
  assert.equal(atlas("hud/score/ui-common-atlas", "icon_fullmusic_gray").y, 33,
    "UICommon row retains its already top-left source coordinate");
  assert.equal(prepared.value.profile.assets.some((row) => row.logicalAssetId === "hud/score/font-atlas"), false,
    "common production preparation excludes the rejected TotalScore bitmap font atlas");
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

async function testLeasedAudioIgnoresUnselectedCommonMembers(): Promise<void> {
  const expected = [
    "directional_fl", "directional_fl_2", "directional_fl_3",
    "SE_RHYTHM_CLEAR", "SE_RHYTHM_FULLCOMBO", "SE_RHYTHM_GAYA", "SE_RHYTHM_TAP_SKILL", "bad", "miss",
    "SE_RHYTHM_TAP_LONG", "flick", "game_button", "good", "great", "perfect",
  ];
  const pack = {
    logicalResource: "sound/common",
    profile: {
      portableAudio: [
        { cue: "SE_AREA_CHANGE", loop: false },
        ...expected.map((cue) => ({ cue, loop: cue === "SE_RHYTHM_GAYA" || cue === "SE_RHYTHM_TAP_LONG" })),
      ],
    },
    files: expected.map((cue, index) => ({
      id: `cue:${cue}`,
      mime: "audio/mpeg",
      bytes: Uint8Array.of(index + 1),
      sha256: "A".repeat(64),
    })),
  } as any;
  const prepared = await prepareLeasedAudioResources({
    profile: {
      role: "bgm", logicalId: "session/test-bgm", cue: "test_bgm", byteLength: 1,
      sha256: "B".repeat(64), mime: "audio/mpeg", codec: "mp3", sampleRate: 44100,
      channels: 2, durationSeconds: 1, sampleFrames: 44100, loop: null,
      identity: "session-explicit", signal: "host-supplied-portable",
    },
    bytes: Uint8Array.of(1),
  } as any, [pack], {
    async inspect() {
      return audioAccepted({ codec: "mp3", sampleRate: 44100, channels: 2, durationSeconds: 1, sampleFrames: 44100 });
    },
  } as any);
  assert.equal(prepared.status, "accepted", prepared.status === "rejected" ? prepared.failure.capability : "");
  if (prepared.status === "accepted") assert.equal(prepared.value.profile.resources.length, 16);

  const duplicate = await prepareLeasedAudioResources({
    profile: {
      role: "bgm", logicalId: "session/test-bgm", cue: "test_bgm", byteLength: 1,
      sha256: "B".repeat(64), mime: "audio/mpeg", codec: "mp3", sampleRate: 44100,
      channels: 2, durationSeconds: 1, sampleFrames: 44100, loop: null,
      identity: "session-explicit", signal: "host-supplied-portable",
    },
    bytes: Uint8Array.of(1),
  } as any, [pack, {
    ...pack,
    logicalResource: "sound/duplicate",
    profile: { portableAudio: [{ cue: "perfect", loop: false }] },
    files: [{ id: "cue:perfect", mime: "audio/mpeg", bytes: Uint8Array.of(1), sha256: "C".repeat(64) }],
  } as any], {
    async inspect() {
      return audioAccepted({ codec: "mp3", sampleRate: 44100, channels: 2, durationSeconds: 1, sampleFrames: 44100 });
    },
  } as any);
  assert.equal(duplicate.status, "rejected");
  if (duplicate.status === "rejected") assert.equal(duplicate.failure.capability, "simulator.audio.leased-cue-identity");
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
  return Object.freeze({ role, logicalResource });
}
function bytes(path: string): Uint8Array { return new Uint8Array(readFileSync(path)); }
function json(value: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(value)); }
function mediaType(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  return "application/json";
}

void main();
