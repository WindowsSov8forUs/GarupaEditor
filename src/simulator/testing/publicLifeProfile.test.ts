declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { createSimulatorSessionRecipe } from "../assembly/sessionRecipe";
import { createCurrentSinglePlayLifeProfile } from "../engine/data/currentSinglePlayLifeProfile";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";
import { createTestPresentationPackage } from "./startupPresentationTestProfile";

const fixture = JSON.parse(readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/public-life-profile",
  "artifacts/investigations/simulator-public-life-profile-10-1-4",
  "simulator_public_life_profile_contract.json",
), "utf8"));

function main(): void {
  testFixtureAuthority();
  testInternalProfiles();
  testPublicExactShape();
  testRecipeOwnership();
  testModeAxesRemainIndependent();
  console.log("Public Life profile tests passed: internal init, full damage, exact chart boolean, no caller Life");
}

function testFixtureAuthority(): void {
  assert.equal(fixture.status, "confirmed-single-play-life-initialization-and-full-damage-profile");
  assert.deepEqual(fixture.portableContract.life, {
    initialLife: 1000,
    playerMaxLife: 1000,
    lifeUpperLimit: 2000,
  });
  assert.deepEqual(fixture.portableContract.damage, {
    nonFull: { missDamage: -100, badDamage: -50 },
    full: { missDamage: -50, badDamage: -25 },
  });
  assert.equal(fixture.sources.fullLiteralPointer.value, "full");
  assert.deepEqual(fixture.evidence.map((row: { id: string }) => row.id), [
    "PLP-E01", "PLP-E02", "PLP-E03", "PLP-E04", "PLP-E05", "PLP-E06", "PLP-E07",
  ]);
}

function testInternalProfiles(): void {
  const nonFull = requireOk(createCurrentSinglePlayLifeProfile(false));
  const full = requireOk(createCurrentSinglePlayLifeProfile(true));
  assert.equal(Object.isFrozen(nonFull), true);
  assert.equal(Object.isFrozen(full), true);
  assert.deepEqual(nonFull, {
    initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000,
    missDamage: -100, badDamage: -50,
  });
  assert.deepEqual(full, {
    initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000,
    missDamage: -50, badDamage: -25,
  });
  for (const invalid of [undefined, null, 0, 1, "false", "full", {}, []]) {
    const result = createCurrentSinglePlayLifeProfile(invalid);
    assert.equal(result.status, "evidence-required");
    if (result.status === "evidence-required") {
      assert.equal(result.capability, "score-life.invalid-full-length-classification");
    }
  }
}

function testPublicExactShape(): void {
  assert.equal(createSimulatorSessionRecipe(request(false)).status, "accepted");
  assert.equal(createSimulatorSessionRecipe(request(true)).status, "accepted");

  const missing: any = request(false);
  delete missing.chartData.isFullLength;
  assertInvalid(missing);
  for (const value of [0, 1, "false", "full", null, {}, []]) {
    const malformed: any = request(false);
    malformed.chartData.isFullLength = value;
    assertInvalid(malformed);
  }
  const legacyGameplay: any = request(false);
  legacyGameplay.chartData.gameplay = {
    life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
  };
  assertInvalid(legacyGameplay);
  const directLife: any = request(false);
  directLife.chartData.initialLife = 1000;
  assertInvalid(directLife);
  for (const bgm of [
    null,
    new Uint8Array(),
    new Uint16Array([1]),
    { bytes: new Uint8Array([1]), codec: "mp3" },
  ]) {
    const malformed: any = request(false);
    malformed.chartData.bgm = bgm;
    const result = createSimulatorSessionRecipe(malformed);
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.failure.capability, "simulator.recipe.invalid-chart-bgm");
    }
  }
}

function testRecipeOwnership(): void {
  const source = request(true);
  const recipe = requireAccepted(createSimulatorSessionRecipe(source));
  assert.equal(recipe.schemaVersion, 10);
  assert.equal(recipe.request.chartData.isFullLength, true);
  assert.equal(Object.isFrozen(recipe), true);
  assert.equal(Object.isFrozen(recipe.request), true);
  assert.equal(Object.isFrozen(recipe.request.chartData), true);
  source.chartData.bgm.fill(0);
  (source.chartData as { isFullLength: boolean }).isFullLength = false;
  assert.deepEqual([...recipe.request.chartData.bgm], [1, 2, 3, 4]);
  assert.equal(recipe.request.chartData.isFullLength, true);
}

function testModeAxesRemainIndependent(): void {
  for (const sessionMode of ["live", "rehearsal"] as const) {
    for (const inputMode of ["manual", "auto"] as const) {
      const expected = createSimulatorModeIdentity(sessionMode, inputMode);
      for (const isFullLength of [false, true]) {
        const recipe = requireAccepted(createSimulatorSessionRecipe(request(isFullLength, sessionMode, inputMode)));
        assert.deepEqual(
          createSimulatorModeIdentity(recipe.request.config.sessionMode, recipe.request.config.inputMode),
          expected,
        );
      }
    }
  }
}

function request(
  isFullLength: boolean,
  sessionMode: "live" | "rehearsal" = "live",
  inputMode: "manual" | "auto" = "manual",
): SimulatorModuleLaunchRequest {
  return {
    chartData: {
      chart: [
        { type: "BPM", beat: 0, value: 120 },
        { type: "Single", beat: 4, lane: 1, width: 1 },
      ],
      bgm: new Uint8Array([1, 2, 3, 4]),
      isFullLength,
    },
    presentation: createTestPresentationPackage(),
    config: {
      sessionMode,
      inputMode,
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      visual: {
        specificSpeed: Math.fround(11),
        noteSize: Math.fround(100),
        habahiroMeshWidthSetting: Math.fround(1),
      },
      audio: { masterGain: 1, bgmGain: 1, seGain: 1 },
    },
  };
}

function assertInvalid(value: SimulatorModuleLaunchRequest): void {
  const result = createSimulatorSessionRecipe(value);
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.capability, "simulator.recipe.invalid-public-request");
  }
}

function requireOk<T>(result: { status: string; value?: T; capability?: string }): T {
  if (result.status !== "ok") throw new Error(result.capability ?? result.status);
  return result.value as T;
}

function requireAccepted<T>(result: { status: string; value?: T; failure?: { capability: string } }): T {
  if (result.status !== "accepted") throw new Error(result.failure?.capability ?? result.status);
  return result.value as T;
}

main();
