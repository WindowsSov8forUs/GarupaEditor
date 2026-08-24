declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { Container, Texture, TextureSource } = require("pixi.js");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { deriveSessionPresentation } from "../assembly/sessionPresentationDerivation";
import {
  createPixiStartupDirectionScene,
  PIXI_STARTUP_BACKGROUND_LABEL,
  PIXI_STARTUP_FOREGROUND_LABEL,
} from "../backends/pixi/pixiStartupDirectionScene";
import {
  createPixiCombinedScene,
  PIXI_ORDINARY_STAGE_LABEL,
  PIXI_PARTICLE_STAGE_LABEL,
} from "../backends/pixi/pixiCombinedScene";
import { PIXI_MV_LIVE_STAGE_LABEL } from "../backends/pixi/pixiMvLiveBackend";
import { INITIAL_STARTUP_DIRECTION_SCENE_STATE } from "../scene/startupDirectionScene";
import { createTestPresentationPackage } from "./startupPresentationTestProfile";
import { CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES } from "./legacyCurrentStartupDirectionResourceManifest";
import { ImmutableSharedStaticResourceStore } from "./legacySharedStaticResourceStore";
import { prepareSharedStartupDirectionRenderResources } from "./legacySharedResourceAdapters";
import { startupDirectionResourceKey } from "./legacyStaticResourceSelector";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";

const SURFACE_LAYOUT = requireOk(createOriginalSurfaceLayout({
  revision: 0, viewportWidth: 1600, viewportHeight: 720,
  safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
  origin: "bottom-left",
}, Math.fround(100)));
const dynamicDecoder = {
  async decodePng(asset: { readonly width: number; readonly height: number; readonly logicalId: string }) {
    return {
      status: "ok" as const,
      value: new Texture({ source: new TextureSource({
        width: asset.width,
        height: asset.height,
        resource: { width: asset.width, height: asset.height },
        resolution: 1,
        autoGarbageCollect: false,
      }), label: asset.logicalId }),
    };
  },
};

async function main(): Promise<void> {
  await testCommonResourcePreparation();
  const presentation = await deriveSessionPresentation(createTestPresentationPackage());
  assert.equal(presentation.status, "accepted");
  if (presentation.status !== "accepted") return;
  const forbiddenCharacters = await createPixiStartupDirectionScene(
    { ...presentation.value, sdCharacters: [presentation.value.stageBackdrop] } as any,
    {} as any,
    {} as any,
    true,
    SURFACE_LAYOUT,
  );
  assert.equal(forbiddenCharacters.status, "integrity-failure");
  if (forbiddenCharacters.status === "integrity-failure") {
    assert.equal(forbiddenCharacters.capability, "render.startup-direction.non-empty-sd-character-assets");
  }
  const commonTextures = Array.from({ length: 8 }, () => new Texture());
  const scene = await createPixiStartupDirectionScene(
    presentation.value,
    {
      lineStar: commonTextures[0],
      jacketFrame: commonTextures[1],
      difficultyFrames: {
        EASY: commonTextures[2], NORMAL: commonTextures[3], HARD: commonTextures[4],
        EXPERT: commonTextures[5], SPECIAL: commonTextures[6],
      },
      fullLiveLabel: commonTextures[7],
      fontFamily: "EvidenceFont",
    },
    dynamicDecoder as any,
    true,
    SURFACE_LAYOUT,
  );
  assert.equal(scene.status, "ok");
  if (scene.status !== "ok") return;
  assert.equal(scene.value.backgroundRoot.label, PIXI_STARTUP_BACKGROUND_LABEL);
  assert.equal(scene.value.foregroundRoot.label, PIXI_STARTUP_FOREGROUND_LABEL);
  assert.equal(scene.value.snapshot().dynamicTextureCount, 2);
  const informationOrder = (scene.value.foregroundRoot.getChildByLabel("StartupInformation") as any)
    .children.map((child: any) => child.label);
  assert(informationOrder.indexOf("StartupJacketFrame") < informationOrder.indexOf("StartupJacket"));
  scene.value.publish({
    ...INITIAL_STARTUP_DIRECTION_SCENE_STATE,
    sequence: 1,
    informationPhase: "holding",
    informationAlpha: Math.fround(1),
    stagePhase: "introducing",
    stageProgress: Math.fround(0.5),
    characterAlpha: Math.fround(0.25),
    linePhase: "fading",
    lineAlpha: Math.fround(0.125),
  });
  assert.equal(scene.value.snapshot().informationAlpha, 1);
  assert.equal(scene.value.snapshot().stageProgress, 0.5);
  assert.equal(scene.value.snapshot().characterAlpha, 0);

  const particle = new Container({ label: PIXI_PARTICLE_STAGE_LABEL });
  const ordinary = new Container({ label: PIXI_ORDINARY_STAGE_LABEL });
  const combined = createPixiCombinedScene(particle, ordinary, scene.value);
  assert.equal(combined.status, "ok");
  if (combined.status === "ok") {
    assert.deepEqual(combined.value.root.children.map((child: any) => child.label), [
      PIXI_STARTUP_BACKGROUND_LABEL,
      PIXI_PARTICLE_STAGE_LABEL,
      PIXI_ORDINARY_STAGE_LABEL,
      PIXI_STARTUP_FOREGROUND_LABEL,
    ]);
    const snapshot = combined.value.snapshot();
    assert.equal(snapshot.mvStageParentIsRoot, null);
    assert.equal(snapshot.startupBackgroundParentIsRoot, true);
    assert.equal(snapshot.startupForegroundParentIsRoot, true);
    combined.value.dispose();
  }
  scene.value.dispose();

  const mvScene = await createPixiStartupDirectionScene(
    presentation.value,
    {
      lineStar: commonTextures[0], jacketFrame: commonTextures[1],
      difficultyFrames: {
        EASY: commonTextures[2], NORMAL: commonTextures[3], HARD: commonTextures[4],
        EXPERT: commonTextures[5], SPECIAL: commonTextures[6],
      },
      fullLiveLabel: commonTextures[7], fontFamily: "EvidenceFont",
    },
    dynamicDecoder as any,
    false,
    SURFACE_LAYOUT,
    false,
  );
  assert.equal(mvScene.status, "ok");
  if (mvScene.status === "ok") {
    assert.equal(mvScene.value.snapshot().dynamicTextureCount, 1);
    assert.equal(mvScene.value.backgroundRoot.children.length, 0);
    const mv = new Container({ label: PIXI_MV_LIVE_STAGE_LABEL });
    const mvParticles = new Container({ label: PIXI_PARTICLE_STAGE_LABEL });
    const mvOrdinary = new Container({ label: PIXI_ORDINARY_STAGE_LABEL });
    const mvCombined = createPixiCombinedScene(mvParticles, mvOrdinary, mvScene.value, mv);
    assert.equal(mvCombined.status, "ok");
    if (mvCombined.status === "ok") {
      assert.deepEqual(mvCombined.value.root.children.map((child: any) => child.label), [
        PIXI_MV_LIVE_STAGE_LABEL,
        PIXI_STARTUP_BACKGROUND_LABEL,
        PIXI_PARTICLE_STAGE_LABEL,
        PIXI_ORDINARY_STAGE_LABEL,
        PIXI_STARTUP_FOREGROUND_LABEL,
      ]);
      assert.equal(mvCombined.value.snapshot().mvStageParentIsRoot, true);
      mvCombined.value.dispose();
    }
    mvScene.value.dispose();
    mv.destroy({ children: true });
    mvParticles.destroy({ children: true });
    mvOrdinary.destroy({ children: true });
  }
  const fourByThreeLayout = requireOk(createOriginalSurfaceLayout({
    revision: 0, viewportWidth: 1200, viewportHeight: 900,
    safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1200), height: Math.fround(900) },
    origin: "bottom-left",
  }, Math.fround(100)));
  const adaptiveScene = await createPixiStartupDirectionScene(
    presentation.value,
    {
      lineStar: commonTextures[0], jacketFrame: commonTextures[1],
      difficultyFrames: {
        EASY: commonTextures[2], NORMAL: commonTextures[3], HARD: commonTextures[4],
        EXPERT: commonTextures[5], SPECIAL: commonTextures[6],
      },
      fullLiveLabel: commonTextures[7], fontFamily: "EvidenceFont",
    },
    dynamicDecoder as any,
    true,
    fourByThreeLayout,
  );
  assert.equal(adaptiveScene.status, "ok");
  if (adaptiveScene.status === "ok") {
    const stage = adaptiveScene.value.backgroundRoot.getChildByLabel("StartupStageBackdrop") as any;
    const information = adaptiveScene.value.foregroundRoot.getChildByLabel("StartupInformation") as any;
    assert.equal(stage.width, 2000);
    assert.equal(stage.height, 900);
    assert.deepEqual([stage.x, stage.y], [600, 450]);
    assert.equal(stage.scale.x, stage.scale.y);
    assert.deepEqual([information.x, information.y], [600, 450]);
    assert.equal(information.scale.x, fourByThreeLayout.ui.screenToSafeChildScale);
    adaptiveScene.value.dispose();
  }

  particle.destroy({ children: true });
  ordinary.destroy({ children: true });
  for (const texture of commonTextures) texture.destroy(true);
  console.log("startup direction Pixi tests passed: dynamic resources/hierarchy/order/publication/dispose");
}

function requireOk<T>(result: { status: "ok"; value: T } | { status: "integrity-failure"; capability: string }): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}

async function testCommonResourcePreparation(): Promise<void> {
  const bytes = new Uint8Array(readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/startup-direction/artifacts/investigations/startup-direction-portable-pack-10-1-4/portable-assets/startup-line-star.png",
  )));
  const entry = CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES[0]!;
  const store = ImmutableSharedStaticResourceStore.create([{
    resourceKey: startupDirectionResourceKey(entry.resourceKeySuffix), bytes,
  }]);
  assert.equal(store.status, "accepted");
  if (store.status !== "accepted") return;
  const prepared = await prepareSharedStartupDirectionRenderResources([{
    resourceKey: startupDirectionResourceKey(entry.resourceKeySuffix), profile: entry.profile,
  }], store.value);
  assert.equal(prepared.status, "accepted");
  const bad = Uint8Array.from(bytes); bad[bad.length - 1] ^= 1;
  const badStore = ImmutableSharedStaticResourceStore.create([{
    resourceKey: startupDirectionResourceKey(entry.resourceKeySuffix), bytes: bad,
  }]);
  assert.equal(badStore.status, "accepted");
  if (badStore.status === "accepted") {
    const rejected = await prepareSharedStartupDirectionRenderResources([{
      resourceKey: startupDirectionResourceKey(entry.resourceKeySuffix), profile: entry.profile,
    }], badStore.value);
    assert.equal(rejected.status, "rejected");
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
