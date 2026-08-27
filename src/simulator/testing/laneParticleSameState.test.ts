declare function require(name: string): any;
declare const process: any;

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { copyAndFreezeGarupaChartJson } from "../assembly/garupaChartContract";
import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { ok, type SimulatorResult } from "../engine/evidence";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import { TapLaneEffectOwner } from "../engine/managers/tapLaneEffectOwner";
import { ParticleCommandProducer } from "../engine/particles/particleCommandProducer";
import type { OrdinaryFixedNoteSceneInput, TapLaneEffectRenderState } from "../engine/rendering/renderCommandProducer";

const fixturePath = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/lane-particle-same-state/artifacts/investigations/simulator-lane-judgement-particle-same-state-10-1-4/lane_judgement_particle_same_state.json",
);
const oracle = JSON.parse(readFileSync(fixturePath, "utf8"));
const secondOracle = JSON.parse(readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/second-visible-consumer/artifacts/investigations/simulator-second-visible-consumer-oracle-10-1-4/second_visible_consumer_oracle.json",
), "utf8"));

function main(): void {
  assert.equal(oracle.status, "confirmed-current-lane-judgement-particle-same-state-portable");
  assert.equal(oracle.authority.browserOrGarupaFrameAsOracle, false);
  assert.equal(oracle.defaultSelection.skin_effect_id, 1);
  assert.equal(oracle.defaultSelection.asset_bundle_name, "skin00");
  verifyLaneLifecycle();
  verifyDirectionalFingerRoute();
  verifySerializedParticleParents();
  console.log("lane/skin00 particle same-state tests passed: 13-slot lifecycle + directional finger + serialized parent chains");
}

function verifyLaneLifecycle(): void {
  const updates: TapLaneEffectRenderState[][] = [];
  const fakeProducer = {
    preflightTapLaneEffectSetup(states: readonly TapLaneEffectRenderState[]) {
      updates.push([...states]);
      return ok(fakeRenderTransaction());
    },
    preflightTapLaneEffectUpdate(states: readonly TapLaneEffectRenderState[]) {
      updates.push([...states]);
      return ok(fakeRenderTransaction());
    },
  };
  const owner = new TapLaneEffectOwner(
    fakeProducer as any,
    laneScene(),
    true,
  );
  requireOk(requireOk(owner.preflightInitialize()).commit());
  assert.equal(owner.snapshot().slots.length, oracle.lane.fixedOwnerCount);
  assert.equal(updates[0]!.length, 13);
  assert.deepEqual(updates[0]!.map((row) => row.textureIndex), [0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0]);
  assert.deepEqual(updates[0]!.map((row) => [row.position.x.value, row.position.y.value]),
    secondOracle.lane.owners.map((row: any) => [
      row.buttonTransform.localPosition[0], row.buttonTransform.localPosition[1],
    ]),
  "all thirteen Lane owners consume the exact Button/half-Button Transform positions");

  const judgement = requireOk(owner.preflightJudgement(oneFrame(0, [2, 3])));
  assert.notEqual(judgement, null);
  requireOk(judgement!.commit());
  let slot = owner.snapshot().slots[5]!;
  assert.deepEqual([slot.phase, slot.reserveCounter, slot.fadeFrame], ["idle", oracle.lane.offReserveCounter, 0]);

  const sameOuter = requireOk(owner.preflightAdvance());
  assert.notEqual(sameOuter, null, "the same outer update owns the counter-only mutation");
  requireOk(sameOuter!.commit());
  slot = owner.snapshot().slots[5]!;
  assert.deepEqual([slot.phase, slot.reserveCounter], ["idle", 1]);

  const followingOuter = requireOk(owner.preflightAdvance());
  assert.notEqual(followingOuter, null);
  requireOk(followingOuter!.commit());
  slot = owner.snapshot().slots[5]!;
  assert.deepEqual([slot.phase, slot.reserveCounter, slot.fadeFrame], ["fading", -1, 0]);
  const fadeStart = updates[updates.length - 1]![0]!;
  assert.deepEqual([fadeStart.scale.x.value, fadeStart.scale.y.value], [1, 1]);
  assert.deepEqual([fadeStart.color.red.value, fadeStart.color.green.value, fadeStart.color.blue.value, fadeStart.color.alpha.value], [1, 1, 1, 1]);

  const retrigger = requireOk(owner.preflightJudgement(oneFrame(1, [2, 3])));
  requireOk(retrigger!.commit());
  slot = owner.snapshot().slots[5]!;
  assert.deepEqual([slot.phase, slot.reserveCounter, slot.fadeFrame], ["idle", 2, 0]);

  const directOff = requireOk(owner.preflightInputEvents([{ buttonType: 1, kind: "on" }]));
  requireOk(directOff!.commit());
  const animated = requireOk(owner.preflightInputEvents([{ buttonType: 1, kind: "animated-off" }]));
  requireOk(animated!.commit());
  for (let frame = 0; frame < oracle.lane.fadeNominalFrames; frame += 1) {
    const advance = requireOk(owner.preflightAdvance());
    if (advance !== null) requireOk(advance.commit());
  }
  assert.equal(owner.snapshot().slots[2]!.phase, "disabled");
  let allOff = requireOk(owner.preflightAllOff());
  if (allOff !== null) requireOk(allOff.commit());
  assert.equal(owner.snapshot().activeCount, 0);

  for (let targetSlot = 0; targetSlot < oracle.lane.fixedOwnerCount; targetSlot += 1) {
    const left = Math.floor(targetSlot / 2);
    const buttons = targetSlot % 2 === 0 ? [left] : [left, left + 1];
    const activate = requireOk(owner.preflightJudgement(oneFrame(10 + targetSlot, buttons)));
    assert.notEqual(activate, null);
    requireOk(activate!.commit());
    assert.equal(owner.snapshot().slots[targetSlot]!.phase, "idle", `slot ${targetSlot} has its fixed owner`);
  }
  assert.equal(owner.snapshot().activeCount, oracle.lane.fixedOwnerCount);
  allOff = requireOk(owner.preflightAllOff());
  requireOk(allOff!.commit());
  assert.equal(owner.snapshot().activeCount, 0);
}

function verifyDirectionalFingerRoute(): void {
  const chart = requireOk(constructChartFromGarupaChartJson(requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Directional", beat: 1, lane: 3, width: 1, direction: "Left" },
    { type: "SV", beat: 10, value: -1 },
  ])).chart));
  const product = getGarupaProductChartProfile(chart)!;
  const node = product.visibleNodes.find((row) => row.type === "Directional")!;
  const source = node.scoringSource!;
  const producer = new ParticleCommandProducer(chart, true);
  const transaction = requireOk(producer.preflightJudgement({
    batchIndex: 0,
    entryCount: 1,
    entries: [Object.freeze({
      slot: 0,
      containerId: "directional-same-state",
      noteIndex: source.index,
      buttonTypes: source.buttonTypesArray,
      noteType: 6,
      phase: "head" as const,
      rawResult: 4,
      adjustedResult: 4,
      addCombo: 1,
      absolutePosition: node.absolutePosition,
      judgeTiming: 0,
      multipleDirectionalFlickNoteCount: 1,
    })],
  } as any));
  assert.deepEqual(transaction.commands.map((row) => row.kind === "play-root" ? row.root : row.kind), [
    "directional:effect_tap_directional_flick_l",
    "directional:effect_tap_directional_flick_l_finger",
  ]);
  assert.equal(transaction.commands.every((row: any) => row.instance.buttonType === 3), true);
  assert.equal(transaction.commit().status, "ok");
}

function verifySerializedParticleParents(): void {
  assert.equal(oracle.particles.directionalFinger.notOptional, true);
  assert.equal(oracle.particles.directionalFingerCallsites.length, 4);
  for (const route of oracle.particles.routes) {
    assert.ok(route.systemCount > 0, `${route.root} owns systems`);
    assert.equal(route.systems[0].parentTransforms.length, 0, `${route.root} root has no invented parent`);
    for (const system of route.systems) {
      assert.equal(Array.isArray(system.parentTransforms), true);
      assert.equal(Number.isInteger(system.sortingOrder), true);
      for (const transform of [system.transform, ...system.parentTransforms]) {
        assert.deepEqual(Object.keys(transform).sort(), ["m_LocalPosition", "m_LocalRotation", "m_LocalScale"]);
      }
    }
  }
  assert.match(oracle.particles.worldComposition.camera, /GamePlayButton anchor/);
  assert.equal(oracle.particles.worldComposition.fallbackAllowed, false);
}

function oneFrame(batchIndex: number, buttonTypes: readonly number[]): any {
  return Object.freeze({
    batchIndex,
    entryCount: 1,
    entries: Object.freeze([{ noteIndex: batchIndex, buttonTypes }]),
  });
}

function laneScene(): OrdinaryFixedNoteSceneInput {
  const sourceFullButtons = secondOracle.lane.owners.filter((row: any) => row.slot % 2 === 0);
  const goals = sourceFullButtons.map((row: any) => Object.freeze({
    x: f32(row.buttonTransform.localPosition[0]),
    y: f32(row.buttonTransform.localPosition[1]),
    z: f32(-13.5),
  }));
  const tapLaneEffectPositions = secondOracle.lane.owners.map((row: any) => Object.freeze({
    x: f32(row.buttonTransform.localPosition[0]),
    y: f32(row.buttonTransform.localPosition[1]),
    z: f32(-13.5),
  }));
  return Object.freeze({
    goalPositions: Object.freeze(goals),
    tapLaneEffectPositions: Object.freeze(tapLaneEffectPositions),
  }) as unknown as OrdinaryFixedNoteSceneInput;
}

function fakeRenderTransaction(): any {
  return Object.freeze({ commit: () => ok(undefined), discard: () => ok(undefined) });
}
function f32(value: number): any { return requireOk(createRenderFloat32(Math.fround(value))); }
function requireOk<T>(result: SimulatorResult<T>): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value;
}

main();
