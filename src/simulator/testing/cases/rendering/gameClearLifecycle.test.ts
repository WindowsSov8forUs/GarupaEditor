declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import {
  parseCurrentGameClearProfile,
  sampleGameClearAdditionalAnimation,
  type GameClearAdditionalBranch,
} from "../../../backends/resources/currentGameClearProfile";

const FOCUSED_ROOT = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/ordinary-particle-terminal-focused/artifacts/investigations/simulator-ordinary-particle-fc-ap-terminal-focused-10-1-4",
);
const focused = JSON.parse(readFileSync(join(FOCUSED_ROOT, "focused_particle_terminal_contract.json"), "utf8"));
const productionRaw = JSON.parse(readFileSync(join(
  process.cwd(),
  "src/assets/game/prefabs/bms/gameclear/game-clear-profile.json",
), "utf8"));
const profile = parseCurrentGameClearProfile(productionRaw);
assert.notEqual(profile, null, "production Schema 2 game-clear profile must parse");

assert.equal(focused.status, "focused-current-evidence-closed-product-consumption-open");
assert.equal(focused.authorization.productionConsumptionEquivalenceAuthorization, false);
assert.equal(focused.authorization.garupaProductEquivalenceAuthorized, false);
assert.equal(focused.terminalAdditional.sessionOrder.playBaseThenAdditional, true);
assert.equal(focused.terminalAdditional.sessionOrder.naturalAutoClearStatus, 1);
assert.equal(focused.terminalAdditional.sessionOrder.baseCallbackSecondsObservedNaturalAutoStatus1, 3.233);
assert.equal(focused.terminalAdditional.sessionOrder.exitAfterCallbackSecondsObserved, 0.015);
assert.match(focused.terminalAdditional.sessionOrder.ownerSeparation, /independent/);
assert.equal(profile!.durationSeconds, focused.terminalAdditional.sessionOrder.baseCallbackSecondsObservedNaturalAutoStatus1);
assert.equal(profile!.exitAfterFinishedSeconds, focused.terminalAdditional.sessionOrder.exitAfterCallbackSecondsObserved);

verifyBranch("fullCombo", 2, profile!.fullCombo);
verifyBranch("allPerfect", 3, profile!.allPerfect);

console.log(
  "focused FC/AP terminal production contract passed: text-in -> text-out -> alpha-zero terminal; base callback/exit remain separate",
);

function verifyBranch(
  identity: "fullCombo" | "allPerfect",
  clearStatus: 2 | 3,
  productionBranch: GameClearAdditionalBranch,
): void {
  const expected = focused.terminalAdditional[identity];
  const controller = expected.controller;
  assert.equal(controller.defaultState, 0);
  assert.equal(controller.states.length, 3);
  assert.equal(controller.states[1].clip, productionBranch.clip.name);
  assert.equal(controller.states[2].clip, productionBranch.textOutClip.name);
  assert.deepEqual(controller.states[1].transitions, [{
    destinationState: 2,
    duration: 0,
    offset: 0,
    exitTime: 1,
    hasExitTime: true,
    hasFixedDuration: true,
    conditionCount: 0,
    orderedInterruption: true,
  }]);
  assert.deepEqual(controller.states[2].transitions, []);

  const expectedTextOut = { ...expected.clips.text_out };
  delete expectedTextOut.source;
  assert.deepEqual(productionBranch.textOutClip, expectedTextOut,
    `${identity} production text-out clip must be the committed focused serialized extraction`);

  const orderedChannels = expected.clips.text_out.bindings.flatMap((binding: any) => binding.channels);
  const textInStop = Math.fround(expected.timeline.textInSeconds);
  const terminalAt = Math.fround(expected.timeline.textInSeconds + expected.timeline.textOutSeconds);
  assert.equal(terminalAt, expected.timeline.additionalInvisibleFromSeconds);

  for (let phaseIndex = 0; phaseIndex < expected.textOutOracle.phases.length; phaseIndex += 1) {
    const phase = expected.textOutOracle.phases[phaseIndex];
    const phaseSeconds = numberFromBits(phase.secondsBits);
    const elapsed = phaseIndex === expected.textOutOracle.phases.length - 1
      ? terminalAt
      : Math.fround(textInStop + phaseSeconds);
    const actual = sampleGameClearAdditionalAnimation(profile!, clearStatus, elapsed);
    assert.equal(actual.clipName, expected.clips.text_out.name);
    assert.equal(actual.state, phaseIndex === expected.textOutOracle.phases.length - 1
      ? "text-out-terminal"
      : "text-out");
    assert.equal(actual.phaseSeconds, phaseSeconds);
    assert.deepEqual(actual.channels, orderedChannels);
    assert.deepEqual(actual.values.map(float32Bits), orderedChannels.map((channel: string) =>
      phase.channelBits[channel]), `${identity} text-out phase ${phaseSeconds} channel matrix`);

    const active = new Set<string>();
    const alpha = new Map<string, number>();
    for (let index = 0; index < actual.channels.length; index += 1) {
      const channel = actual.channels[index]!;
      const value = actual.values[index]!;
      if (channel.endsWith(".m_IsActive.value") && value >= 0.5) {
        active.add(channel.slice(0, -".m_IsActive.value".length));
      } else if (channel.endsWith(".mColor.a.value")) {
        alpha.set(channel.slice(0, -".mColor.a.value".length), value);
      }
    }
    const visible = [...active].filter((owner) => (alpha.get(owner) ?? 0) > 0);
    assert.equal(active.size, phase.activeOwnerCount);
    assert.equal(visible.length, phase.visibleOwnerCount);
    assert.deepEqual(visible.sort(), [...phase.visibleOwners].sort());
  }

  const terminal = sampleGameClearAdditionalAnimation(profile!, clearStatus, terminalAt);
  const beforeBaseCallback = sampleGameClearAdditionalAnimation(profile!, clearStatus, Math.fround(3.232));
  const atBaseCallback = sampleGameClearAdditionalAnimation(profile!, clearStatus, Math.fround(3.233));
  const afterFormerHold = sampleGameClearAdditionalAnimation(profile!, clearStatus, Math.fround(10));
  for (const sample of [beforeBaseCallback, atBaseCallback, afterFormerHold]) {
    assert.equal(sample.state, "text-out-terminal");
    assert.equal(sample.clipName, terminal.clipName);
    assert.deepEqual(sample.values.map(float32Bits), terminal.values.map(float32Bits));
  }
  assert.equal(expected.timeline.additionalHiddenBeforeBaseCallbackSeconds > 0.6, true);
  assert.match(expected.timeline.terminalPose, /alpha zero/);
}

function numberFromBits(bits: string): number {
  const value = Number.parseInt(bits.slice(2), 16) >>> 0;
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return new DataView(bytes.buffer).getFloat32(0, false);
}

function float32Bits(value: number): string {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, Math.fround(value), false);
  return `0x${new DataView(bytes.buffer).getUint32(0, false).toString(16).padStart(8, "0").toUpperCase()}`;
}
