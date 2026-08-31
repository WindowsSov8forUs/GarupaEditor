declare function require(name: string): any;
declare const process: any;

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { copyAndFreezeGarupaChartJson } from "../assembly/garupaChartContract";
import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import type { ParticleRenderSample, ParticleRootId } from "../backends/particleContracts";
import { ParticleCommandProducer } from "../engine/particles/particleCommandProducer";
import { DeterministicParticleSimulation } from "../engine/particles/particleSimulation";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import type { SimulatorResult } from "../engine/evidence";

const FOCUSED_ROOT = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/ordinary-particle-terminal-focused/artifacts/investigations/simulator-ordinary-particle-fc-ap-terminal-focused-10-1-4",
);
const contract = JSON.parse(readFileSync(join(FOCUSED_ROOT, "focused_particle_terminal_contract.json"), "utf8"));
const oracle = JSON.parse(readFileSync(join(FOCUSED_ROOT, "ordinary_particle_phase_oracle.json"), "utf8"));
const productionProfile = JSON.parse(readFileSync(
  join(process.cwd(), "src/assets/game/portable/profiles/default-particle/profile.json"),
  "utf8",
));
const PHASE_SECONDS = Object.freeze([0, 1 / 60, 0.05, 0.1, 0.2, 0.4, 0.8, 1.2, 2]);

function main(): void {
  verifyFocusedEvidenceBoundary();
  verifyFocusedProductionInventory();
  verifyIndependentPhaseOracle();
  verifySingleWidthProductRoutes();
  console.log("focused ordinary particle consumption passed: roots=8 systems=56 renderers=49 phases=27");
}

function verifyFocusedEvidenceBoundary(): void {
  assert.equal(contract.status, "focused-current-evidence-closed-product-consumption-open");
  assert.equal(contract.sample.versionName, "10.1.4");
  assert.equal(contract.sample.versionCode, 230);
  assert.equal(contract.sample.abi, "arm64-v8a");
  assert.equal(contract.authorization.productionConsumptionEquivalenceAuthorization, false);
  assert.equal(contract.authorization.garupaProductEquivalenceAuthorized, false);
  assert.equal(
    oracle.classification,
    "independent-python-portable-oracle-with-current-native-box-direction-not-native-random-witness",
  );
  assert.match(contract.ordinaryParticles.shapeAxis.boxType5, /exact SoA \[0,0,1\].*\+Y is superseded/);
  assert.match(contract.ordinaryParticles.shapeAxis.transform, /full serialized Transform parent chain/);
  assert.deepEqual(oracle.sortProjection, [
    "sortingOrder", "systemSemanticIdentity", "particleCreationSequence",
  ]);
  assert.match(
    contract.ordinaryParticles.targetMeaning,
    /single-width normal, skill and flick judgement roots/,
  );
}

function verifyFocusedProductionInventory(): void {
  const expected = contract.ordinaryParticles.focusedProfile;
  const ordinary = productionProfile.bundles.find((bundle: any) => bundle.key === "ordinary");
  assert.ok(ordinary, "production default particle profile retains the ordinary bundle");
  const roots = new Set(expected.roots);
  const systems = ordinary.systems.filter((system: any) => roots.has(system.root));
  const profileIds = new Set(systems.map((system: any) => system.profile));
  const profiles: Record<string, any> = Object.fromEntries(Object.entries(ordinary.profiles)
    .filter(([identity]) => profileIds.has(identity)));
  const rendererIds = new Set(Object.values(profiles).map((profile: any) => profile.renderer));
  const rendererProfiles: Record<string, any> = Object.fromEntries(Object.entries(ordinary.rendererProfiles)
    .filter(([identity]) => rendererIds.has(identity)));
  const moduleProfiles: Record<string, unknown> = {};
  for (const [moduleName, rows] of Object.entries(ordinary.moduleProfiles) as [string, Record<string, unknown>][]) {
    const used = new Set(Object.values(profiles).map((profile: any) => profile.modules[moduleName])
      .filter((identity) => identity !== undefined));
    const selected = Object.fromEntries(Object.entries(rows).filter(([identity]) => used.has(identity)));
    if (Object.keys(selected).length > 0) moduleProfiles[moduleName] = selected;
  }
  const materialNames = new Set(Object.values(rendererProfiles)
    .flatMap((renderer: any) => renderer.m_Materials)
    .filter((material: any) => material !== null)
    .map((material: any) => material.name));
  const materials = ordinary.materials.filter((material: any) => materialNames.has(material.name));
  const textureNames = new Set(materials.map((material: any) => material.texture)
    .filter((name: any) => name !== null));
  const textures = ordinary.textures.filter((texture: any) => textureNames.has(texture.name));

  assert.deepEqual(systems, expected.systems, "production consumes every focused serialized system definition");
  assert.deepEqual(profiles, expected.profiles, "production consumes every focused system/module relation");
  assert.deepEqual(moduleProfiles, expected.moduleProfiles, "production consumes every focused module profile");
  assert.deepEqual(rendererProfiles, expected.rendererProfiles, "production consumes every focused renderer profile");
  assert.deepEqual(materials, expected.materials, "production consumes focused material identities");
  assert.deepEqual(textures, expected.textures, "production consumes focused complete-atlas identities");
  assert.equal(systems.length, 56);
  assert.equal(systems.filter((system: any) =>
    rendererProfiles[profiles[system.profile].renderer].m_Enabled).length, 49);
  assert.ok(materials.every((material: any) =>
    material.shader === "Mobile/Particles/Additive" && material.blend === "add"));
  assert.ok(Object.values(rendererProfiles).every((renderer: any) =>
    renderer.m_SortMode === 0 && renderer.m_Pivot.x === 0 &&
    renderer.m_Pivot.y === 0 && renderer.m_Pivot.z === 0));
}

function verifyIndependentPhaseOracle(): void {
  assert.equal(oracle.cases.length, 3);
  for (const expectedCase of oracle.cases) {
    const root = expectedCase.root as ParticleRootId;
    const simulation = new DeterministicParticleSimulation(productionProfile);
    simulation.playRoot(
      `focused:${root}`,
      Object.freeze({ kind: "game-play-button" as const, buttonType: 3, rangeLength: 1 }),
      root,
    );
    let previous = 0;
    assert.equal(expectedCase.phases.length, PHASE_SECONDS.length);
    for (let index = 0; index < PHASE_SECONDS.length; index += 1) {
      const seconds = PHASE_SECONDS[index]!;
      simulation.step(Math.fround(seconds - previous), false);
      previous = seconds;
      const actual = simulation.samples().map(projectSample);
      const expected = expectedCase.phases[index];
      assert.equal(actual.length, expected.sampleCount, `${root} phase ${seconds} sample count`);
      assert.deepEqual(actual, expected.samples, `${root} phase ${seconds} complete sample projection`);
      assert.deepEqual(aliveCounts(actual), expected.systemAliveCounts, `${root} phase ${seconds} owner inventory`);
    }
  }

  const swipe = oracle.cases.find((entry: any) => entry.root === "ordinary:effect_tap_swipe");
  assert.equal(swipe.phases[8].systemAliveCounts["ordinary:effect_tap_swipe/kira"], 12,
    "expiry occurs after same-update emission capacity evaluation");
}

function verifySingleWidthProductRoutes(): void {
  const chart = requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 1, lane: 1, width: 1 },
    { type: "Skill", beat: 2, lane: 3, width: 1 },
    { type: "Flick", beat: 3, lane: 5, width: 1 },
    { type: "SV", beat: 8, value: -1 },
  ]));
  const constructed = requireOk(constructChartFromGarupaChartJson(chart.chart));
  const product = getGarupaProductChartProfile(constructed)!;
  const expectedRoots: Readonly<Record<string, ParticleRootId>> = Object.freeze({
    Single: "ordinary:effect_tap_perfect",
    Skill: "ordinary:effect_tap_skill_perfect",
    Flick: "ordinary:effect_tap_swipe",
  });
  for (const node of product.visibleNodes.filter((candidate) => candidate.type in expectedRoots)) {
    assert.equal(node.width, 1, `${node.type} test owner is single-width`);
    const source = node.scoringSource!;
    const producer = new ParticleCommandProducer(constructed, true);
    const transaction = requireOk(producer.preflightJudgement(Object.freeze({
      batchIndex: node.absolutePosition,
      entryCount: 1,
      addCombo: 1,
      rawResult: 4,
      adjustedResult: 4,
      judgeTiming: 0,
      entries: Object.freeze([Object.freeze({
        slot: 0,
        containerId: `focused-${node.type}`,
        noteIndex: source.index,
        buttonTypes: source.buttonTypesArray,
        noteType: node.type === "Flick" ? 3 : 0,
        phase: "head" as const,
        rawResult: 4,
        adjustedResult: 4,
        addCombo: 1,
        absolutePosition: node.absolutePosition,
        judgeTiming: 0,
        multipleDirectionalFlickNoteCount: 0,
      })]),
    }) as any));
    assert.deepEqual(
      transaction.commands.filter((command) => command.kind === "play-root").map((command: any) => command.root),
      [expectedRoots[node.type]],
      `${node.type} width-1 route plays its complete root rather than a wide-note substitute`,
    );
  }
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

function aliveCounts(samples: readonly any[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const sample of samples) counts[sample.systemId] = (counts[sample.systemId] ?? 0) + 1;
  return Object.freeze(Object.fromEntries(Object.entries(counts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0)));
}

function requireOk<T>(result: SimulatorResult<T>): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value;
}

main();
