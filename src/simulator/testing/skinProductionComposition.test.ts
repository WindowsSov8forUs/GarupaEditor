declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

import { Texture, TextureSource } from "pixi.js";
import { assembleSimulatorResources } from "./legacyStaticResourceAssembly";
import { RecordingSimulatorAudioBackend } from "../backends/recordingAudioBackend";
import { DeterministicSimulatorParticleBackend } from "../backends/particles/deterministicParticleBackend";
import { PixiParticleRendererBackend } from "../backends/pixi/pixiParticleRendererBackend";
import { PixiRendererBackend } from "../backends/pixi/pixiRendererBackend";
import { PortableParticleResourcePreflightAdapter } from "../backends/resources/localParticleResourceProvider";
import { PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import { audioAccepted } from "../backends/audioValidation";
import { particleAccepted } from "../backends/particleValidation";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { ok } from "../engine/evidence";
import { RenderCommandProducer } from "../engine/rendering/renderCommandProducer";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import { ImmutableSharedStaticResourceStore } from "./legacySharedStaticResourceStore";
import { selectSimulatorStaticResources } from "./legacyStaticResourceSelector";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { CURRENT_AUDIO_TEST_PROFILE } from "./audioSessionBgmTestProfile";

const FIXTURE_ROOT = join(process.cwd(), "src/simulator/testing/fixtures");
const FIXTURE_MANIFEST = JSON.parse(readFileSync(join(FIXTURE_ROOT, "manifest.json"), "utf8"));
const EMBEDDED_AUDIO = loadEmbeddedAudio();

async function main(): Promise<void> {
  await runComposition("default");
  await runComposition("limited3");
}

async function runComposition(scenario: "default" | "limited3"): Promise<void> {
  const chart = requireOk(createNoteBatchInformationList({ musicScoreData: "#BPM 120\n#00111:01\n" }));
  const skin = requireOk(resolveOriginalSkinRecipe({
    noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0,
    directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false,
    special: scenario === "default"
      ? { kind: "none" }
      : { kind: "limited", limitedSkinId: 3, components: {
          laneAndLine: "on", tapEffect: "on", rhythmIcon: "on", background: "on",
          soundEffect: "on", judge: "on", directionalFlickIcon: "on",
        } },
  }, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard"));
  const selection = selectSimulatorStaticResources(chart, skin);
  const rows: Array<{ readonly resourceKey: string; readonly profile: any }> = [
    ...selection.audioSe,
    ...selection.particles,
    ...selection.scoreHud,
    ...selection.startupDirection,
    selection.ordinaryVisibleProfile,
    ...selection.ordinaryVisible,
    selection.scoreGaugeSsAnimation,
    ...selection.skin.resources,
  ];
  if (selection.rendering.kind !== "ordinary") throw new Error("ordinary selection expected");
  rows.push(selection.rendering.profileResource, ...selection.rendering.resources);
  const entries = rows.map((row) => ({ resourceKey: row.resourceKey, bytes: fixtureBytes(row.profile) }));
  assert.equal(new Set(entries.map((entry) => entry.resourceKey)).size, entries.length);
  const store = requireAccepted(ImmutableSharedStaticResourceStore.create(entries));
  const audioMetadata = buildAudioMetadata(selection.skin.resources.map((resource) => fixtureBytes(resource.profile)));
  const audioPreflight = {
    async sha256(bytes: Uint8Array) { return audioAccepted(sha256(bytes)); },
    async inspect(bytes: Uint8Array) {
      const metadata = audioMetadata.get(sha256(bytes));
      return metadata === undefined
        ? { status: "audio-resource-decode" as const, failure: { code: "audio-resource-decode" as const, capability: "test.metadata", boundary: "missing" } }
        : audioAccepted(metadata);
    },
  };
  const renderer = new PixiRendererBackend({
    async decodePng(asset) {
      return ok(new Texture({ source: new TextureSource({ width: asset.width!, height: asset.height!,
        resource: { width: asset.width!, height: asset.height! }, resolution: 1, autoGarbageCollect: false }), label: asset.logicalAssetId }));
    },
    async decodeFont(asset) { return ok(Object.freeze({ family: `skin-composition-${asset.sha256.slice(0, 8)}`, dispose() {} })); },
  });
  const audio = new RecordingSimulatorAudioBackend();
  const particles = new DeterministicSimulatorParticleBackend();
  const particleRenderer = new PixiParticleRendererBackend({
    async decodePng(asset) {
      return particleAccepted(new Texture({ source: new TextureSource({ width: asset.width!, height: asset.height!,
        resource: { width: asset.width!, height: asset.height! }, resolution: 1, autoGarbageCollect: false }), label: asset.logicalAssetId }));
    },
  });
  const bgmSource = CURRENT_AUDIO_TEST_PROFILE.resources.find((resource) =>
    resource.sha256 === "439727B162B67CA472A11AC1753D9F7D64FF5396EEDBC8123F3EA2AEC1F48514")!;
  const bgmProfile = Object.freeze({
    ...bgmSource, role: "bgm" as const, logicalId: "host/skin-composition-bgm",
    cue: "skin_composition_bgm", loop: null, identity: "session-explicit" as const,
    signal: "host-supplied-portable" as const,
  });
  const result = await assembleSimulatorResources(
    { profile: bgmProfile, bytes: fixtureBytes(bgmSource) },
    selection,
    store,
    {
      sessionId: `selected-skin-production-composition-${scenario}`,
      rendering: { backend: renderer, preflight: new PortableRenderResourcePreflightAdapter() },
      audio: { backend: audio, preflight: audioPreflight },
      particles: { backend: particles, renderer: particleRenderer, preflight: new PortableParticleResourcePreflightAdapter() },
      createSceneLayout: (kind, resources, fieldBindings) => {
        const scene = createSimulatorSceneLayout({
          revision: 0, viewportWidth: 1600, viewportHeight: 720,
          safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
          origin: "bottom-left",
        }, {
          specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0,
          habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: skin.note.noteSyncEdgeMargin,
        }, kind, resources, fieldBindings);
        return scene.status === "ok"
          ? { status: "accepted" as const, value: scene.value }
          : { status: "rejected" as const, failure: { code: "evidence-required" as const, capability: scene.capability, boundary: scene.boundary } };
      },
    },
  );
  if (result.status !== "accepted") throw new Error(`${result.failure.capability}: ${result.failure.boundary}`);
  assert.equal(result.value.skinPortablePacks.length, scenario === "default" ? 8 : 9);
  assert.notEqual(result.value.fieldBindings, null);
  assert.equal(result.value.backgroundImage !== null, scenario === "limited3");
  assert.match(result.value.renderBindings.noteAtlasLogicalAssetId,
    scenario === "default" ? /noteskin%2Fskin00/ : /skin_april2021/);
  assert.match(result.value.renderBindings.ordinaryVisible!.judgeLogicalAssetId,
    scenario === "default" ? /judgeskin%2Fskin00/ : /skinapril2021/);
  assert.equal(renderer.snapshot().state, "ready");
  assert.equal(audio.snapshot().state, "ready");
  assert.equal(particles.snapshot().state, "ready");
  assert.equal(particleRenderer.snapshot().state, "ready");
  requireOk(renderer.bindOriginalSurfaceLayout(result.value.sceneLayout.surfaceLayout));
  const field = result.value.sceneLayout.ordinaryNoteScene.field;
  if (field === undefined) throw new Error("production selected Field absent");
  const producer = new RenderCommandProducer(result.value.sessionId, renderer, result.value.renderBindings);
  requireOk(requireOk(producer.preflightFieldSetup(field.objects, field.masks)).commit());
  assert.equal(renderer.sceneSnapshot().filter((row) => row.renderObjectId.startsWith("render:skin-field:")).length, 3);
  requireOk(requireOk(producer.preflightSessionRelease()).commit());
  assert.equal(particleRenderer.dispose().status, "accepted");
  assert.equal(particles.dispose().status, "accepted");
  assert.equal(audio.dispose().status, "accepted");
  requireOk(renderer.dispose());
  assert.equal(renderer.snapshot().objectCount, 0);
  assert.equal(particleRenderer.snapshot().nodeCount, 0);
  console.log(`selected Skin production composition ${scenario} passed: resources=${entries.length} packs=${result.value.skinPortablePacks.length} field=3 cleanup=0`);
}

function fixtureBytes(profile: any): Uint8Array {
  const bytes = profile.byteLength ?? profile.bytes;
  const row = FIXTURE_MANIFEST.entries.find((entry: any) => entry.sha256 === profile.sha256 && entry.bytes === bytes);
  if (row !== undefined) return new Uint8Array(readFileSync(join(FIXTURE_ROOT, row.path)));
  const embedded = EMBEDDED_AUDIO.get(profile.sha256);
  if (embedded === undefined || embedded.byteLength !== bytes) throw new Error(`fixture unavailable ${profile.sha256}/${bytes}`);
  return Uint8Array.from(embedded);
}
function loadEmbeddedAudio(): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  for (const scenario of ["default", "limited3"]) {
    const root = join(FIXTURE_ROOT, "reverse-snapshots", "skin-settings", scenario);
    for (const name of readdirSync(root)) {
      const pack = JSON.parse(readFileSync(join(root, name), "utf8"));
      for (const file of pack.files ?? []) if (file.mime === "audio/mpeg") {
        const bytes = Uint8Array.from(atob(file.dataBase64), (character: string) => character.charCodeAt(0));
        result.set(file.sha256, bytes);
      }
    }
  }
  return result;
}
function buildAudioMetadata(packBytes: readonly Uint8Array[]) {
  const map = new Map<string, { codec: "mp3"; sampleRate: number; channels: number; durationSeconds: number; sampleFrames: number }>();
  for (const resource of CURRENT_AUDIO_TEST_PROFILE.resources) map.set(resource.sha256, {
    codec: "mp3", sampleRate: resource.sampleRate, channels: resource.channels,
    durationSeconds: resource.durationSeconds, sampleFrames: resource.sampleFrames,
  });
  for (const bytes of packBytes) {
    const pack = JSON.parse(new TextDecoder().decode(bytes));
    for (const row of pack.portableAudio) {
      const duration = Number(row.container.duration ?? row.container.format_duration);
      const sampleRate = Number(row.container.sample_rate);
      map.set(row.sha256, { codec: "mp3", sampleRate, channels: Number(row.container.channels),
        durationSeconds: duration, sampleFrames: Math.round(duration * sampleRate) });
    }
  }
  return map;
}
function sha256(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex").toUpperCase(); }
function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "evidence-required"; readonly capability: string }): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}
function requireAccepted<T>(result: { readonly status: "accepted"; readonly value: T } | { readonly status: "rejected"; readonly failure: { readonly capability: string } }): T {
  if (result.status !== "accepted") throw new Error(result.failure.capability);
  return result.value;
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
