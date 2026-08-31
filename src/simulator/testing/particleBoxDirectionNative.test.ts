declare function require(name: string): any;
declare const process: any;

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import type { ParticleRenderSample, ParticleRootId } from "../backends/particleContracts";
import { DeterministicParticleSimulation } from "../engine/particles/particleSimulation";

const FIXTURE_ROOT = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/particle-box-direction-native/artifacts/investigations/simulator-particle-box-direction-native-10-1-4",
);
const contract = fixture("particle_box_direction_native_contract.json");
const directionOracle = fixture("particle_box_direction_oracle.json");
const simulationOracle = fixture("particle_simulation_box_corrected_oracle.json");
const productionProfile = JSON.parse(readFileSync(
  join(process.cwd(), "src/assets/game/portable/profiles/default-particle/profile.json"),
  "utf8",
));
const reverseProfileFixture = JSON.parse(readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/device-closure/artifacts/investigations/device-runtime-closure-10-1-4/particle_portable_profile.json",
), "utf8"));

function main(): void {
  verifyNativeCorrectionBoundary();
  verifyProductionInventoryAndTransformedVelocity();
  verifyRestartAndGlobalRandomContinuity();
  console.log("native Box direction consumption passed: systems=24 critical=12 axis=+Z restart=random-continuous");
}

function verifyNativeCorrectionBoundary(): void {
  assert.equal(contract.status, "current-native-box-direction-closed-portable-consumption-open");
  assert.deepEqual(contract.nativeFacts.dispatcher.localDirection, [0, 0, 1]);
  assert.equal(contract.nativeFacts.handoff.positionDirectionInterchangeForbidden, true);
  assert.deepEqual(contract.correction.supersededPortableAxis, [0, 1, 0]);
  assert.deepEqual(contract.correction.correctCurrentNativeAxis, [0, 0, 1]);
  assert.equal(
    contract.correction.historicalDeviceClosureDisposition,
    "retained byte-for-byte as historical evidence; this append-only correction owns the replacement reference and corrected simulation oracle",
  );
  assert.equal(contract.productionScope.crossTupleFramebufferThresholdTransferAuthorized, false);
  assert.equal(contract.productionScope.productionConsumptionAllowedAfterCommittedVerifierAndOriginSync, true);
  assert.ok(Object.values(contract.openClaims).every((value) => value === "open_not_claimed"));
  assert.deepEqual(directionOracle.localDirectionBits, ["0x00000000", "0x00000000", "0x3F800000"]);
  assert.equal(
    simulationOracle.classification,
    "corrected-portable-simulation-oracle-consuming-current-native-box-plus-z-not-native-random-or-gpu-oracle",
  );
  assert.equal(simulationOracle.generatedBeforeGarupaTypescriptConsumption, true);
  assert.equal(
    simulationOracle.profileProjectionSha256,
    "66D78A227898C95C670EC20690F12BA8685D84CB3F668D994E9DAC8391227492",
  );
  assert.deepEqual(productionProfile, reverseProfileFixture,
    "production profile structurally equals the independently promoted Reverse profile consumed by the corrected oracle");
}

function verifyProductionInventoryAndTransformedVelocity(): void {
  const ordinary = productionProfile.bundles.find((bundle: any) => bundle.key === "ordinary");
  assert.ok(ordinary);
  const roots = new Set(contract.focusedInventory.roots as string[]);
  const boxSystems = ordinary.systems.filter((system: any) => {
    if (!roots.has(system.root)) return false;
    const profile = ordinary.profiles[system.profile];
    const shapeId = profile.modules.ShapeModule;
    return shapeId !== undefined && ordinary.moduleProfiles.ShapeModule[shapeId].type === 5;
  });
  assert.equal(boxSystems.length, contract.focusedInventory.type5SystemCount);
  assert.equal(boxSystems.length, directionOracle.caseCount);
  assert.deepEqual(
    boxSystems.map((system: any) => system.identity),
    directionOracle.cases.map((entry: any) => entry.systemId),
    "all and only the 24 focused serialized type-5 systems remain selected",
  );
  const critical = directionOracle.cases.filter((entry: any) => entry.criticalVisibleMotion);
  assert.equal(critical.length, contract.focusedInventory.criticalVisibleMotionCount);
  assert.equal(critical.length, directionOracle.criticalVisibleMotionCount);
  assert.deepEqual(
    critical.map((entry: any) => entry.systemId),
    contract.focusedInventory.criticalSystemIds,
  );

  for (const expected of directionOracle.cases) {
    const simulation = new DeterministicParticleSimulation(productionProfile);
    simulation.playRootSystems(
      `box-axis:${expected.systemId}`,
      Object.freeze({ kind: "game-play-button" as const, buttonType: 3, rangeLength: 1 }),
      expected.root as ParticleRootId,
      Object.freeze([expected.systemId]),
    );
    simulation.step(Math.fround(0), false);
    const sample = simulation.samples().find((candidate) => candidate.systemId === expected.systemId);
    assert.ok(sample, `${expected.systemId} emits at its serialized zero-time burst`);
    const actualVelocity = vectorFromBits(sample!.velocity);
    const expectedDirection = expected.portableHierarchyDirectionBits.map(float32FromBits) as [number, number, number];
    assert.ok(cosine(actualVelocity, expectedDirection) > 0.99999,
      `${expected.systemId} hands local +Z through its complete serialized Transform chain`);
    if (expected.criticalVisibleMotion) {
      const magnitude = vectorMagnitude(actualVelocity);
      const screenPlane = Math.hypot(actualVelocity[0], actualVelocity[1]);
      assert.ok(screenPlane / magnitude > 0.99, `${expected.systemId} retains the evidenced visible-plane motion`);
      assert.ok(expected.screenPlaneMagnitudeOriginal > 0.99);
      assert.ok(expected.screenPlaneMagnitudeSupersededPlusY < 0.001);
    }
  }
}

function verifyRestartAndGlobalRandomContinuity(): void {
  assert.deepEqual(contract.restartLifecycle.nonNullOrder, ["clearParticle", "Play(withChildren=true)"]);
  assert.deepEqual(contract.restartLifecycle.clearParticleWhenPlaying, [
    "get_isPlaying", "Stop(withChildren=false)", "Clear(withChildren=false)",
  ]);
  assert.match(contract.restartLifecycle.portableRequired, /without resetting the per-system global random stream/);

  const expected = simulationOracle.cases.find((entry: any) => entry.case === "restart-active");
  assert.ok(expected);
  const root = expected.root as ParticleRootId;
  const simulation = new DeterministicParticleSimulation(productionProfile);
  const instance = Object.freeze({ kind: "game-play-button" as const, buttonType: 0, rangeLength: 1 });
  simulation.playRoot("box-restart", instance, root);
  simulation.step(Math.fround(1 / 60), false);
  const first = simulation.samples().map(projectSample);
  const firstIds = new Set(first.map((sample: any) => sample.particleId));
  const firstState = rootRandomState(simulation, root);
  assert.equal(sha256Canonical(first), expected.beforeSha256);

  simulation.playRoot("box-restart", instance, root);
  simulation.step(Math.fround(1 / 60), false);
  const restarted = simulation.samples().map(projectSample);
  const restartedState = rootRandomState(simulation, root);
  assert.equal(restarted.length, expected.afterSampleCount);
  assert.deepEqual(restarted.slice(0, 32), expected.afterSamples);
  assert.equal(sha256Canonical(restarted), expected.afterSha256);
  assert.ok(restarted.every((sample: any) => !firstIds.has(sample.particleId)),
    "restart clears the active owner particles before publishing the replacement Play");

  let advancedSystems = 0;
  for (const [systemId, before] of firstState) {
    const after = restartedState.get(systemId)!;
    assert.ok(after);
    if (before.birthCount > 0) {
      advancedSystems += 1;
      assert.equal(after.birthCount, before.birthCount * 2,
        `${systemId} particle identities continue across Stop/Clear/Play`);
      assert.notDeepEqual(after.stateU32, before.stateU32,
        `${systemId} global random stream advances rather than resetting with its owner`);
    }
  }
  assert.ok(advancedSystems > 0);
}

function rootRandomState(
  simulation: DeterministicParticleSimulation,
  root: ParticleRootId,
): Map<string, { readonly stateU32: readonly number[]; readonly birthCount: number }> {
  const systems = new Set(productionProfile.bundles
    .flatMap((bundle: any) => bundle.systems)
    .filter((system: any) => system.root === root)
    .map((system: any) => system.identity));
  return new Map(simulation.randomStateSnapshot()
    .filter((state) => systems.has(state.systemId))
    .map((state) => [state.systemId, {
      stateU32: Object.freeze([...state.stateU32]),
      birthCount: state.birthCount,
    }]));
}

function projectSample(sample: ParticleRenderSample): unknown {
  return Object.freeze({
    particleId: sample.particleId,
    systemId: sample.systemId,
    sequence: sample.creationSequence,
    positionBits: Object.freeze([sample.position.xBits, sample.position.yBits, sample.position.zBits]),
    velocityBits: Object.freeze([sample.velocity.xBits, sample.velocity.yBits, sample.velocity.zBits]),
    sizeBits: Object.freeze([sample.size.xBits, sample.size.yBits, sample.size.zBits]),
    rotationBits: Object.freeze([sample.rotation.xBits, sample.rotation.yBits, sample.rotation.zBits]),
    colorBits: Object.freeze([
      sample.color.redBits, sample.color.greenBits, sample.color.blueBits, sample.color.alphaBits,
    ]),
    ageBits: sample.ageBits,
    lifeBits: sample.lifetimeBits,
    uvFrame: sample.uvFrame,
    sortingOrder: sample.sortingOrder,
    renderMode: sample.renderMode,
    renderAlignment: sample.renderAlignment,
    material: sample.material,
  });
}

function vectorFromBits(value: {
  readonly xBits: string;
  readonly yBits: string;
  readonly zBits: string;
}): [number, number, number] {
  return [float32FromBits(value.xBits), float32FromBits(value.yBits), float32FromBits(value.zBits)];
}

function float32FromBits(bits: string): number {
  assert.match(bits, /^0x[0-9A-F]{8}$/);
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, Number.parseInt(bits.slice(2), 16), true);
  return view.getFloat32(0, true);
}

function vectorMagnitude(value: readonly number[]): number {
  return Math.hypot(value[0]!, value[1]!, value[2]!);
}

function cosine(left: readonly number[], right: readonly number[]): number {
  const denominator = vectorMagnitude(left) * vectorMagnitude(right);
  assert.ok(denominator > 0);
  return (left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!) / denominator;
}

function fixture(name: string): any {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, name), "utf8"));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex").toUpperCase();
}

main();
