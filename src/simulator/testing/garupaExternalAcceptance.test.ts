import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");

import { parseGarupaChartJson } from "../../chart";
import { copyAndFreezeGarupaChartJson } from "../assembly/garupaChartContract";
import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import type { ChartConstructionResult } from "../engine/chart/types";
import { ManualTouchPhase, type ManualInputFrame, type ManualInputPosition } from "../engine/data/manualInput";
import { getGarupaProductChartProfile, type GarupaProductNode } from "../engine/garupa/productChartProfile";
import { getGarupaProductTimingGroupAxisProfile } from "../engine/garupa/timingGroupAxis";
import { ParticleCommandProducer } from "../engine/particles/particleCommandProducer";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { createSimulatorSceneLayout, type GarupaProductSceneLayout } from "../scene/simulatorSceneLayout";

interface ExternalChartIdentity {
  readonly bytes: number;
  readonly sha256: string;
  readonly units: number;
  readonly score: number;
}

const expected = new Map<string, ExternalChartIdentity>([
  ["D_N_A.json", Object.freeze({ bytes: 102077, sha256: "9238D1F1CCCB37EB4C7CCAC0C75D1409F882E06B527B09FFF10C41931034E483", units: 1003, score: 10001003 })],
  ["B.B.K.K.B.K.K..json", Object.freeze({ bytes: 57513, sha256: "54938A6CA7509D1C0286C756AC44EA643FBD755236BC5F2D1B543FE894F221F8", units: 676, score: 10000676 })],
]);

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.log("Garupa external acceptance unavailable: pass D_N_A.json and B.B.K.K.B.K.K..json paths explicitly");
    return;
  }
  assert.equal(paths.length, 2, "external acceptance requires exactly two explicit paths");
  for (const path of paths) {
    const name = String(path).replace(/\\/g, "/").split("/").pop() ?? "";
    const identity = expected.get(name);
    assert.ok(identity, `unexpected external chart ${name}`);
    const bytes = new Uint8Array(readFileSync(path));
    assert.equal(bytes.byteLength, identity!.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(), identity!.sha256);
    const canonical = parseGarupaChartJson(JSON.parse(new TextDecoder().decode(bytes)));
    const copied = requireOk(copyAndFreezeGarupaChartJson(canonical));
    const chart = requireOk(constructChartFromGarupaChartJson(copied.chart));
    const product = getGarupaProductChartProfile(chart)!;
    assert.equal(product.route, "product-extension");
    assert.equal(product.visibleNodes.length, identity!.units);
    verifyProductParticleBoundary(chart);
    const auto = runAuto(chart, identity!.units);
    assert.deepEqual(auto, {
      judged: identity!.units,
      missed: 0,
      perfect: identity!.units,
      score: identity!.score,
      combo: identity!.units,
      life: 1000,
    });
    const manual = runManual(copied.chart, identity!.units);
    assert.deepEqual(manual, {
      judged: identity!.units,
      missed: 0,
      perfect: identity!.units,
      score: identity!.score,
      combo: identity!.units,
      life: 1000,
      activeFingers: 0,
    });
    const axis = getGarupaProductTimingGroupAxisProfile(chart)!;
    const axisRows: unknown[] = [];
    for (const group of axis.groups) {
      for (let position = 0; position <= 12000; position += 17) {
        const milliseconds = requireOk(axis.positionToMilliseconds(position));
        axisRows.push([group.id, position, Number(requireOk(axis.axisAtMilliseconds(group.id, milliseconds)).toFixed(6))]);
      }
    }
    const axisDigest = createHash("sha256").update(JSON.stringify(axisRows)).digest("hex");
    console.log(JSON.stringify({
      path,
      bytes: bytes.byteLength,
      sha256: identity!.sha256,
      nodes: product.nodes.length,
      visible: product.visibleNodes.length,
      slides: product.slideChains.length,
      sv: product.svEvents.length,
      groups: axis.groups.map((group) => [group.id, group.changes.length]),
      axisDigest,
      auto,
      manual,
    }));
  }
}

function runAuto(chart: ChartConstructionResult, expectedUnits: number) {
  const mode = createSimulatorModeIdentity("live", "auto");
  const engine = requireOk(createSimulatorEngine({
    chart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode },
    scoreLifeState: {
      schemaVersion: 3, sessionId: `external-auto-${expectedUnits}`, mode,
      life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
    },
  }, createRecordingSimulatorBackends()));
  requireOk(engine.initialize());
  for (let frame = 0; frame < 120000; frame += 1) {
    requireOk(engine.step(Math.fround(1 / 60)));
    if (frame % 60 === 0 && requireOk(engine.snapshot()).managers.garupaProduct?.judgedNodeCount === expectedUnits) break;
  }
  const snapshot = requireOk(engine.snapshot());
  const record = snapshot.managers.scoreLifeState!.record;
  const value = Object.freeze({
    judged: snapshot.managers.garupaProduct!.judgedNodeCount,
    missed: snapshot.managers.garupaProduct!.missedNodeCount,
    perfect: record.resultCounts[4], score: record.score, combo: record.currentCombo, life: record.currentLife,
  });
  requireOk(engine.dispose());
  return value;
}

function verifyProductParticleBoundary(chart: ChartConstructionResult): void {
  const product = getGarupaProductChartProfile(chart)!;
  const compatible = product.visibleNodes.find((candidate) =>
    candidate.scoringSource !== null && candidate.width === 1 &&
    Number.isInteger(candidate.spanStart) && candidate.spanStart >= 0 && candidate.spanStart <= 6 &&
    (candidate.type === "Single" || candidate.type === "Skill" ||
      candidate.type === "Flick" || candidate.type === "Directional"));
  assert.notEqual(compatible, undefined, "external compatible product particle fixture");
  const incompatible = product.visibleNodes.find((candidate) =>
    candidate.scoringSource !== null && !(candidate.width === 1 &&
      Number.isInteger(candidate.spanStart) && candidate.spanStart >= 0 && candidate.spanStart <= 6));
  const cases = [
    ...(compatible === undefined ? [] : [{ node: compatible, expected: 1 }]),
    ...(incompatible === undefined ? [] : [{ node: incompatible, expected: 0 }]),
  ];
  const producer = new ParticleCommandProducer(chart);
  assert.equal(producer.validate().status, "ok");
  for (const [batchIndex, item] of cases.entries()) {
    const source = item.node.scoringSource!;
    const entry = Object.freeze({
      slot: 0,
      containerId: `one-frame:${batchIndex}`,
      noteIndex: source.index,
      buttonTypes: Object.freeze([...source.buttonTypesArray]),
      noteType: 0,
      phase: "head",
      rawResult: 4,
      adjustedResult: 4,
      addCombo: 1,
      absolutePosition: item.node.absolutePosition,
      judgeTiming: 0,
      multipleDirectionalFlickNoteCount: 0,
    });
    const prepared = producer.preflightJudgement(Object.freeze({
      batchIndex,
      entryCount: 1,
      entries: Object.freeze([entry]),
    }) as any);
    assert.equal(prepared.status, "ok", prepared.status === "integrity-failure" ? prepared.boundary : "");
    if (prepared.status === "ok") {
      assert.equal(prepared.value.commands.length, item.expected,
        item.expected === 1
          ? "integer-lane width-one product node reuses one selected exact particle root"
          : "fractional/wide product node uses no nearest or fallback original particle root");
      assert.equal(prepared.value.commit().status, "ok");
    }
  }
  const disposed = producer.preflightDispose();
  assert.equal(disposed.status, "ok");
  if (disposed.status === "ok") assert.equal(disposed.value.commit().status, "ok");
}

function runManual(canonical: ReturnType<typeof parseGarupaChartJson>, expectedUnits: number) {
  const chart = requireOk(constructChartFromGarupaChartJson(canonical));
  const product = getGarupaProductChartProfile(chart)!;
  const resources = Object.freeze({ noteAtlasLogicalAssetId: "note", directionalAtlasLogicalAssetId: "directional" });
  const layout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: 1600, viewportHeight: 720, safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }, origin: "bottom-left" },
    { specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0, habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0) },
    "ordinary", resources,
  ));
  const mode = createSimulatorModeIdentity("live", "manual");
  const engine = requireOk(createSimulatorEngine({
    chart,
    garupaProductScene: layout.garupaProductScene,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode },
    scoreLifeState: {
      schemaVersion: 3, sessionId: `external-manual-${expectedUnits}`, mode,
      life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
    },
  }, createRecordingSimulatorBackends()));
  requireOk(engine.initialize());
  const positions = [...new Set(product.visibleNodes.map((node) => node.absolutePosition))].sort((left, right) => left - right);
  const chainFinger = new Map<string, number>();
  let nextFinger = 1;
  let currentPosition = 0;
  const positionsPerSecond = chart.startBpm * 0.8;
  for (const target of positions) {
    const delta = Math.max(0, (target - currentPosition) / positionsPerSecond);
    if (delta > 0) requireOk(engine.step(Math.fround(delta)));
    currentPosition = requireOk(engine.snapshot()).adjustedMusicPosition;
    for (const node of product.visibleNodes.filter((candidate) => candidate.absolutePosition === target)) {
      let fingerId: number;
      let justAllocated = false;
      if (node.chainIdentity === null) fingerId = nextFinger++;
      else {
        const existing = chainFinger.get(node.chainIdentity);
        if (existing === undefined) {
          fingerId = nextFinger++;
          chainFinger.set(node.chainIdentity, fingerId);
          justAllocated = true;
        } else fingerId = existing;
      }
      const position = productScreenPoint(layout.garupaProductScene, node);
      requireOk(engine.step(Math.fround(0), manualFrame(
        fingerId,
        justAllocated || node.chainIdentity === null ? ManualTouchPhase.Began : ManualTouchPhase.Stationary,
        position,
      )));
      if (node.type === "Flick" || node.type === "Directional") {
        const deltaX = node.type === "Directional"
          ? node.direction === "Left" ? -10 : 10
          : 20;
        requireOk(engine.step(Math.fround(0), manualFrame(
          fingerId,
          ManualTouchPhase.Moved,
          { x: position.x + deltaX, y: position.y },
        )));
      }
      if (node.chainIdentity !== null) {
        const chain = product.slideChains.find((candidate) => candidate.identity === node.chainIdentity)!;
        if (chain.visibleConnectionIdentities[chain.visibleConnectionIdentities.length - 1] === node.identity) {
          chainFinger.delete(node.chainIdentity);
        }
      }
    }
  }
  const snapshot = requireOk(engine.snapshot());
  const record = snapshot.managers.scoreLifeState!.record;
  const value = Object.freeze({
    judged: snapshot.managers.garupaProduct!.judgedNodeCount,
    missed: snapshot.managers.garupaProduct!.missedNodeCount,
    perfect: record.resultCounts[4], score: record.score, combo: record.currentCombo, life: record.currentLife,
    activeFingers: snapshot.managers.garupaProduct!.activeFingerCount,
  });
  requireOk(engine.dispose());
  return value;
}

function productScreenPoint(scene: GarupaProductSceneLayout, node: GarupaProductNode): ManualInputPosition {
  const projected = requireOk(scene.projectLaneAtCurve(node.spanStart + (node.width - 1) / 2, 1));
  return Object.freeze({ x: Math.fround(800 + projected.x.value * 360), y: Math.fround(360 + projected.y.value * 360) });
}
function manualFrame(fingerId: number, phase: 0 | 1 | 2 | 3, position: ManualInputPosition): ManualInputFrame {
  return Object.freeze({ touches: Object.freeze([{ fingerId, phase, position, buttonResolution: null }]) });
}
function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "integrity-failure"; readonly boundary: string }): T {
  if (result.status !== "ok") throw new Error(result.boundary);
  return result.value;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
