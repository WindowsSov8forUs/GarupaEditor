declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");

import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createSimulatorSessionRecipe } from "../assembly/sessionRecipe";
import {
  createOriginalLiveSettings,
  originalLiveSettingsIdentity,
} from "../engine/data/originalLiveSettings";
import { PrimaryJudgementAdjustmentOwner } from "../engine/managers/primaryJudgementAdjustmentOwner";
import type { SimulatorResult } from "../engine/evidence";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";
import { engineInput } from "./firstSliceFixtures";
import { LIVE_AUTO_MODE } from "./modeFixtures";
import { DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS, originalLiveSettingsForTest } from "./originalLiveSettingsTestProfile";
import { createDefaultTestSkinSettings, createTestPresentationPackage } from "./startupPresentationTestProfile";

function main(): void {
  testSchema12ExactShapeAndFreeze();
  testCurrentDomainsAndIdentity();
  testPrimaryOwnerCounters();
  testIntegratedNegativePauseAndMoveTime();
  console.log("original Live settings tests passed: Schema12/domains/frozen identity/Primary counters/pause/MoveTime");
}

function testSchema12ExactShapeAndFreeze(): void {
  const request = validRequest();
  const recipe = accepted(createSimulatorSessionRecipe(request));
  assert.equal(recipe.schemaVersion, 12);
  assert.equal(Object.isFrozen(recipe.request.config), true);
  assert.equal(Object.isFrozen(recipe.request.config.skin), true);
  assert.equal(recipe.request.config.judgementAdjustValue, 0);
  assert.equal(recipe.request.config.judgementAdjustValueB, 0);
  assert.equal(recipe.request.config.mvDarkness, 20);

  for (const key of [
    "judgementAdjustValue", "judgementAdjustValueB", "syncLine", "noteColor",
    "visibleTapLaneEffect", "mvDarkness",
  ]) {
    const missing = cloneRequest(request) as any;
    delete missing.config[key];
    assert.equal(createSimulatorSessionRecipe(missing).status, "rejected", `missing ${key}`);
  }
  for (const [key, value] of [
    ["judgeOffsetFrames", 0], ["offsetMs", 0], ["effectEnable", true], ["mvAlphaPercent", 80],
  ] as const) {
    const legacy = cloneRequest(request) as any;
    legacy.config[key] = value;
    assert.equal(createSimulatorSessionRecipe(legacy).status, "rejected", `legacy ${key}`);
  }
  const oldOnly = cloneRequest(request) as any;
  delete oldOnly.config.judgementAdjustValueB;
  oldOnly.config.judgeOffsetFrames = 0;
  assert.equal(createSimulatorSessionRecipe(oldOnly).status, "rejected");
}

function testCurrentDomainsAndIdentity(): void {
  for (const judgementAdjustValue of [-30, 0, 30]) {
    for (const judgementAdjustValueB of [-5, 0, 5]) {
      for (const mvDarkness of [0, 20, 70]) {
        const value = created(createOriginalLiveSettings({
          highFrequencyMode: false,
          judgementAdjustValue,
          judgementAdjustValueB,
          syncLine: true,
          noteColor: false,
          visibleTapLaneEffect: true,
          mvDarkness,
        }));
        assert.equal(Object.isFrozen(value), true);
        assert.equal(Object.isFrozen(value.core), true);
        assert.equal(
          originalLiveSettingsIdentity(value),
          `60:${judgementAdjustValue}:${judgementAdjustValueB}:${mvDarkness}:1:0:1`,
        );
      }
    }
  }
  for (const invalid of [
    { judgementAdjustValue: -31 }, { judgementAdjustValue: 31 },
    { judgementAdjustValueB: -6 }, { judgementAdjustValueB: 6 },
    { mvDarkness: 1 }, { mvDarkness: 80 }, { syncLine: 1 },
  ]) {
    assert.equal(createOriginalLiveSettings({
      highFrequencyMode: false,
      ...DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS,
      ...invalid,
    }).status, "evidence-required");
  }
}

function testPrimaryOwnerCounters(): void {
  const positive = new PrimaryJudgementAdjustmentOwner(2, "initial");
  ok(positive.initialize(true));
  assert.equal(created(positive.preflightMusicStart()), false);
  assert.equal(positive.snapshot().fastCounter, 1);
  assert.equal(created(positive.preflightMusicStart()), false);
  assert.equal(positive.snapshot().fastCounter, 2);
  assert.equal(created(positive.preflightMusicStart()), true);
  ok(positive.commitMusicStarted());
  assert.equal(positive.snapshot().phase, "complete");

  const negative = new PrimaryJudgementAdjustmentOwner(-3, "retry");
  ok(negative.initialize(true));
  assert.equal(created(negative.preflightMusicStart()), true);
  ok(negative.commitMusicStarted());
  for (let index = 1; index <= 3; index += 1) {
    assert.equal(created(negative.consumeGameplayGate()), true);
    assert.equal(negative.snapshot().slowCounter, index);
  }
  assert.equal(created(negative.consumeGameplayGate()), false);
  assert.equal(negative.snapshot().phase, "complete");

  const moved = new PrimaryJudgementAdjustmentOwner(30, "move-time-reconstruction");
  ok(moved.initialize(true));
  assert.deepEqual(moved.snapshot(), {
    judgementAdjustValue: 30,
    purpose: "move-time-reconstruction",
    phase: "move-time-bypassed",
    fastCounter: 0,
    slowCounter: 0,
    musicStarted: false,
    gameplayBlocked: false,
  });
}

function testIntegratedNegativePauseAndMoveTime(): void {
  const input = engineInput();
  const negative = requireEngine({
    ...input,
    runtime: {
      ...input.runtime,
      originalLiveSettings: originalLiveSettingsForTest({ judgementAdjustValue: -3 }),
      mode: LIVE_AUTO_MODE,
    },
    startupDirection: { scene: null, liveStartVoiceCue: null, purpose: "initial" as const },
  });
  ok(negative.initialize());
  let guard = 0;
  while (
    created(negative.snapshot()).managers.primaryJudgementAdjustment?.phase !== "waiting-gameplay" ||
    created(negative.snapshot()).managers.startupDirection?.playable !== true
  ) {
    ok(negative.step(Math.fround(1 / 60)));
    if (++guard > 600) throw new Error("negative Primary startup did not reach gameplay gate");
  }
  assert.equal(created(negative.snapshot()).managers.playable, false);
  ok(negative.pause());
  assert.equal(created(negative.snapshot()).managers.primaryJudgementAdjustment?.slowCounter, 0);
  ok(negative.resume());
  for (let index = 1; index <= 3; index += 1) {
    ok(negative.step(Math.fround(1 / 60), { touches: [] }));
    assert.equal(created(negative.snapshot()).managers.primaryJudgementAdjustment?.slowCounter, index);
    assert.equal(created(negative.snapshot()).managers.playable, index === 3);
  }
  ok(negative.step(Math.fround(1 / 60), { touches: [] }));
  assert.equal(created(negative.snapshot()).managers.playable, true);
  ok(negative.dispose());

  const moved = requireEngine({
    ...input,
    runtime: {
      ...input.runtime,
      originalLiveSettings: originalLiveSettingsForTest({ judgementAdjustValue: 30 }),
      mode: LIVE_AUTO_MODE,
    },
    startupDirection: { scene: null, liveStartVoiceCue: null, purpose: "move-time-reconstruction" as const },
  });
  ok(moved.initialize());
  assert.equal(created(moved.snapshot()).managers.primaryJudgementAdjustment?.phase, "move-time-bypassed");
  assert.equal(created(moved.snapshot()).managers.playable, true);
  ok(moved.dispose());
}

function validRequest(): SimulatorModuleLaunchRequest {
  return {
    chartData: {
      chart: [{ type: "BPM", beat: 0, value: 120 }],
      bgm: new Uint8Array([1, 2, 3]),
      isFullLength: false,
    },
    presentation: createTestPresentationPackage(),
    config: {
      sessionMode: "live",
      inputMode: "manual",
      highFrequencyMode: false,
      ...DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS,
      skin: createDefaultTestSkinSettings(),
      visual: {
        specificSpeed: Math.fround(11),
        noteSize: Math.fround(100),
        habahiroMeshWidthSetting: Math.fround(1),
      },
      audio: { masterGain: 1, bgmGain: 1, seGain: 1 },
    },
  };
}

function cloneRequest(value: SimulatorModuleLaunchRequest): SimulatorModuleLaunchRequest {
  return {
    chartData: { ...value.chartData, chart: value.chartData.chart.map((row) => ({ ...row })), bgm: Uint8Array.from(value.chartData.bgm) },
    presentation: value.presentation,
    config: { ...value.config, skin: value.config.skin, visual: { ...value.config.visual }, audio: { ...value.config.audio } },
  };
}

function requireEngine(input: Parameters<typeof createSimulatorEngine>[0]) {
  const result = createSimulatorEngine(input, createRecordingSimulatorBackends());
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value;
}
function accepted<T>(result: { status: "accepted"; value: T } | { status: "rejected" }): T {
  if (result.status !== "accepted") throw new Error("expected accepted result");
  return result.value;
}
function created<T>(result: SimulatorResult<T>): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}
function ok(result: SimulatorResult<unknown>): void {
  if (result.status !== "ok") throw new Error(result.capability);
}

main();
