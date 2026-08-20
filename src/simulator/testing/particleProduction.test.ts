import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import { LIVE_AUTO_MODE } from "./modeFixtures";
declare function require(name: string): any;
declare const process: any;

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
import type {
  ParticleCommand,
  ParticleResourceProvider,
} from "../backends/particleContracts";
import { RecordingSimulatorParticleBackend } from "../backends/recordingParticleBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import {
  ImmutableLocalParticleResourceProvider,
  PortableParticleResourcePreflightAdapter,
} from "../backends/resources/localParticleResourceProvider";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { FrontNoteType, type ChartConstructionResult } from "../engine/chart/types";
import { ParticleCommandProducer } from "../engine/particles/particleCommandProducer";
import type { SimulatorResult } from "../engine/evidence";
import { createSimulatorEngine } from "../host/createSimulatorEngine";

const fixtureBase = join(process.cwd(), "src", "simulator", "testing", "fixtures", "reverse-snapshots");
const particleRoot = join(
  fixtureBase, "device-closure", "artifacts", "investigations", "device-runtime-closure-10-1-4",
);
const chartRoot = join(fixtureBase, "chart-construction", "fixtures");
const policy = JSON.parse(readFileSync(join(particleRoot, "particle_portable_policy.json"), "utf8"));
const closure = JSON.parse(readFileSync(join(particleRoot, "particle_portable_closure.json"), "utf8"));
const resources = Object.entries({
  "particle/profile/current-portable-v1": "particle_portable_profile.json",
  "particle/textures/current-portable-v1": "particle_portable_texture_manifest.json",
  "particle-texture:directional:Default-ParticleSystem": "particle-portable-textures/directional/Default-ParticleSystem.png",
  "particle-texture:directional:tex_parSet_1": "particle-portable-textures/directional/tex_parSet_1.png",
  "particle-texture:ordinary:Default-Particle": "particle-portable-textures/ordinary/Default-Particle.png",
  "particle-texture:ordinary:Tex_parSet_1": "particle-portable-textures/ordinary/Tex_parSet_1.png",
  "particle-texture:ordinary:Tex_parSet_2": "particle-portable-textures/ordinary/Tex_parSet_2.png",
  "particle-texture:ordinary:effect_circle": "particle-portable-textures/ordinary/effect_circle.png",
  "particle-texture:ordinary:light": "particle-portable-textures/ordinary/light.png",
}).map(([logicalAssetId, relative]) => ({
  logicalAssetId,
  bytes: new Uint8Array(readFileSync(join(particleRoot, relative))),
}));
const provider = accepted<ParticleResourceProvider>(
  ImmutableLocalParticleResourceProvider.create(resources),
  "particle provider",
);
const preflight = new PortableParticleResourcePreflightAdapter();

interface ProductionProjection {
  readonly chartBatches: number;
  readonly rootCount: number;
  readonly frameCount: number;
  readonly commandCount: number;
  readonly commandDigest: string;
  readonly roots: readonly string[];
  readonly slideOwnerCount: number;
  readonly finalAdjustedPosition: number;
}

async function main(): Promise<void> {
  const ordinaryChart = chart("poppin_shuffle_special.txt");
  const first = await replay("ordinary-a", ordinaryChart, 7200, 1 / 30);
  const second = await replay("ordinary-b", ordinaryChart, 7200, 1 / 30);
  assert.deepEqual(second, first, "ordinary full-chart particle replay must be deterministic across fresh sessions");
  assert.equal(first.chartBatches, 656);
  assert.equal(first.frameCount, 7200);
  assert.ok(first.commandCount > 900);
  assert.ok(first.roots.includes("ordinary:effect_tap_perfect"));
  assert.ok(first.roots.includes("ordinary:effect_TapKeep"));
  assert.ok(first.slideOwnerCount > 0);
  assert.ok(first.roots.some((root) => root.startsWith("directional:effect_tap_directional_flick_l")));
  assert.ok(first.roots.some((root) => root.startsWith("directional:effect_tap_directional_flick_r")));

  const habChart = chart("786_miracle_april_habahiro_special.txt");
  const hab = auditHabSharedRoute(habChart);
  assert.equal(hab.chartBatches, 371);
  assert.equal(hab.root, "ordinary:effect_tap_perfect");

  assert.deepEqual(
    closure.ledger.filter((row: any) => row.id === "DC-C47" || row.id === "DC-C48").map((row: any) => row.id),
    ["DC-C47", "DC-C48"],
    "required raw portable rows remain present; their legacy closure disposition is ignored",
  );
  console.log(`particle ordinary production replay passed: batches=${first.chartBatches} frames=${first.frameCount} commands=${first.commandCount} digest=${first.commandDigest}`);
  console.log(`particle HAB shared-route audit passed: batches=${hab.chartBatches} root=${hab.root}`);
}

async function replay(
  sessionId: string,
  chartData: ChartConstructionResult,
  frameCount: number,
  deltaTimeSeconds: number,
): Promise<ProductionProjection> {
  const particle = new RecordingSimulatorParticleBackend();
  assert.equal((await particle.prepare(sessionId, provider, preflight)).status, "accepted");
  const engine = requireOk(createSimulatorEngine({
    chart: chartData,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode: LIVE_AUTO_MODE },
    particles: { sessionId },
  }, createRecordingSimulatorBackends(undefined, particle)), `create ${sessionId}`);
  requireOk(engine.initialize(), `initialize ${sessionId}`);
  for (let frame = 0; frame < frameCount; frame += 1) {
    requireOk(engine.step(deltaTimeSeconds), `${sessionId} frame ${frame}`);
  }
  const host = requireOk(engine.snapshot(), `${sessionId} snapshot`);
  assert.equal(host.managers.noteManager.nextBatchIndex, chartData.noteBatches.length);
  const particleSnapshot = host.particleBackend!;
  assert.equal(particleSnapshot.frames.length, frameCount);
  const commands = particleSnapshot.frames.flatMap((frame) => frame.commands.map((command) => ({
    frame: frame.frame,
    ...projectCommand(command),
  })));
  const roots = [...new Set(commands.flatMap((command) => "root" in command ? [String(command.root)] : []))].sort();
  assert.ok(roots.every((root) => routeRoots().has(root)));
  const slideOwners = new Set(commands.flatMap((command) =>
    "instance" in command && command.instance !== null && typeof command.instance === "object" &&
      (command.instance as any).kind === "note-slide"
      ? [`${(command.instance as any).noteIndex}@${(command.instance as any).absolutePosition}`]
      : []));
  assert.ok([...slideOwners].every((identity) => /^(0|[1-9][0-9]*)@(0|[1-9][0-9]*)$/.test(identity)));
  const projection = Object.freeze({
    chartBatches: chartData.noteBatches.length,
    rootCount: roots.length,
    frameCount,
    commandCount: commands.length,
    commandDigest: sha256Canonical(commands),
    roots: Object.freeze(roots),
    slideOwnerCount: slideOwners.size,
    finalAdjustedPosition: host.adjustedMusicPosition,
  });
  assert.equal(engine.dispose().status, "ok");
  assert.equal(particle.snapshot().state, "disposed");
  assert.equal(particle.snapshot().activeOwners.length, 0);
  return projection;
}

function auditHabSharedRoute(chartData: ChartConstructionResult): {
  readonly chartBatches: number;
  readonly root: string;
} {
  const producer = new ParticleCommandProducer(chartData);
  requireOk(producer.validate(), "validate HAB particle graph");
  const note = chartData.noteBatches
    .flatMap((batch) => batch.informationList)
    .find((candidate) => !candidate.isInvisible &&
      candidate.fireNoteType === FrontNoteType.Normal &&
      candidate.buttonTypesArray.length >= 1 && candidate.buttonTypesArray.length <= 7)!;
  assert.ok(note);
  const transaction = requireOk(producer.preflightJudgement({
    batchIndex: 0,
    entries: [Object.freeze({
      slot: 0,
      containerId: "hab-shared-route",
      noteIndex: note.index,
      buttonTypes: note.buttonTypesArray,
      noteType: 0,
      phase: "head",
      rawResult: 4,
      adjustedResult: 4,
      addCombo: 1,
      absolutePosition: note.absolutePos,
      judgeTiming: 0,
      multipleDirectionalFlickNoteCount: 0,
    })],
    entryCount: 1,
    addCombo: 1,
    rawResult: 4,
    adjustedResult: 4,
    judgeTiming: 0,
  }), "HAB shared judgement route");
  const command = transaction.commands.find((candidate) => candidate.kind === "play-root");
  if (command === undefined || command.kind !== "play-root") {
    throw new Error("HAB shared judgement did not produce its current ordinary root");
  }
  return Object.freeze({ chartBatches: chartData.noteBatches.length, root: command.root });
}

function projectCommand(command: ParticleCommand): Record<string, unknown> {
  switch (command.kind) {
    case "play-root":
      return {
        kind: command.kind,
        ownerKey: command.ownerKey,
        instance: command.instance,
        root: command.root,
        restartIfActive: command.restartIfActive,
      };
    case "stop-clear-deactivate-root":
      return {
        kind: command.kind,
        ownerKey: command.ownerKey,
        instance: command.instance,
        root: command.root,
      };
    case "clear-all":
    case "suppress-until-replay":
      return { kind: command.kind, reason: command.reason };
  }
}

function routeRoots(): Set<string> {
  return new Set(policy.supportedInventory.routeRoots as string[]);
}

function chart(name: string): ChartConstructionResult {
  return requireOk(createNoteBatchInformationList({
    musicScoreData: readFileSync(join(chartRoot, name), "utf8"),
  }), `construct ${name}`);
}

function accepted<T>(result: any, message: string): T {
  if (result.status !== "accepted") throw new Error(`${message}: ${result.failure.capability}`);
  return result.value;
}

function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
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

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
