import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const simulatorRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = resolve(simulatorRoot, "testing/fixtures/reverse-snapshots");
const evidenceRoot = resolve(
  fixtureRoot,
  "ordinary-visible-rendering/artifacts/investigations/ordinary-visible-rendering-portable-10-1-4",
);
const dynamicRoot = resolve(
  fixtureRoot,
  "evidence-integrity/artifacts/investigations/simulator-dynamic-acceptance-oracle-10-1-4",
);
const ordinaryPackRoot = resolve(
  fixtureRoot,
  "autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4",
);
const ordinaryProfile = JSON.parse(readFileSync(resolve(ordinaryPackRoot, "ordinary_portable_profile.json"), "utf8"));
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const closure = JSON.parse(readFileSync(resolve(evidenceRoot, "closure.json"), "utf8"));
  const oracle = JSON.parse(readFileSync(resolve(dynamicRoot, "dynamic_acceptance_oracle.json"), "utf8"));
  const observationPath = process.env.SIMULATOR_RENDER_OBSERVATION_PATH;
  if (typeof observationPath !== "string" || observationPath.length === 0) {
    throw new Error("raw actual Pixi observation path is required; source markers and Recording rejection cannot close PR cases");
  }
  const observation = JSON.parse(readFileSync(observationPath, "utf8"));
  const result = verifyRenderObservation(observation, oracle, closure);
  for (const row of result.cases) {
    console.log(`${row.id}: independently-computed=${row.observation}`);
  }
  console.log(
    `actual-pixi-command-scene-routing verified from raw values: cases=${result.cases.length} ` +
    `batches=${observation.fullChart.batches} frames=${observation.fullChart.frames} score=${observation.fullChart.score}`,
  );
}

export function verifyRenderObservation(observation, oracle, closure) {
  if (
    closure.status !== "ordinary-visible-rendering-portable-evidence-gate-closed" ||
    closure.productionAuthorization !== true ||
    closure.blockingFindings.length !== 0 ||
    oracle.schemaVersion !== 1 ||
    oracle.status !== "simulator-dynamic-acceptance-expected-values-closed" ||
    oracle.decoderLayer?.rasterClaimAllowed !== false ||
    observation.schemaVersion !== 3 ||
    observation.source !== "actual-pixi-command-scene-routing" ||
    observation.decoder?.kind !== oracle.decoderLayer.name ||
    observation.decoder?.browserDecodeExecuted !== false ||
    observation.decoder?.rasterObserved !== false
  ) {
    throw new Error("Reverse evidence, oracle identity or command/scene observation layer is invalid");
  }
  if (!Array.isArray(observation.resourcePreparation) || observation.resourcePreparation.length === 0 ||
    observation.resourcePreparation.some((row) => row.decoded !== true || row.logicalAssetId.length === 0)) {
    throw new Error("hash-validated prepared resource identities were not observed");
  }

  const samples = observation.samples;
  const expectedNotes = oracle.noteAnimationMidpoints;
  requireNote(samples.noteUp, expectedNotes["note:up"], "note-flick");
  requireNote(samples.noteLeft, expectedNotes["note:left"], "note-directional-flick");
  requireNote(samples.noteRight, expectedNotes["note:right"], "note-directional-flick");
  requireNote(samples.noteFlash, expectedNotes["note:flash"], "note-long-flash");

  const combo = samples.combo;
  const addScore = samples.addScore;
  const result = samples.result;
  const life = samples.life;
  const expectedCombo = oracle.comboMidpoint;
  const expectedAdd = oracle.addScoreRoute;
  const expectedResult = oracle.resultRoute;
  const expectedLife = oracle.lifeThreshold;
  const full = observation.fullChart;
  const sampleCleanup = observation.sampleCleanup;

  const predicates = new Map([
    ["PR08", () =>
      equalArray(samples.noteUp.position, noteLocalToPixi(expectedNotes["note:up"])) &&
      equalArray(samples.noteLeft.position, noteLocalToPixi(expectedNotes["note:left"])) &&
      equalArray(samples.noteRight.position, noteLocalToPixi(expectedNotes["note:right"])) &&
      equalArray(samples.noteWorld.position, [800, 360]) &&
      equalArray(samples.noteWorld.scale, [Math.fround(3.6), Math.fround(3.6)]) &&
      full.visibleNoteSampleCount > 0 && full.visibleNoteViewportCount > 0 &&
      full.visibleNoteViewportCount <= full.visibleNoteSampleCount &&
      samples.noteFlash.spriteAlpha === expectedNotes["note:flash"].alpha &&
      samples.noteFlash.spriteTint === rgbTint(expectedNotes["note:flash"].rgb)],
    ["PR09", () =>
      samples.noteLeft.role === "note-icon" && samples.noteRight.role === "note-icon" &&
      samples.noteLeft.renderObjectId !== samples.noteRight.renderObjectId &&
      samples.noteLeft.spriteBindingKey !== samples.noteRight.spriteBindingKey],
    ["PR11", () => full.roles.includes("note-mesh") && full.maxGeometryVertexCount >= 22 &&
      full.maxAbsGeometryCoordinate > 100 && full.geometryViewportIntersectionCount > 0],
    ["PR22", () => combo.hudSpriteCount === expectedCombo.spriteCount && combo.hudText === null],
    ["PR23", () => combo.hudSpriteLabels?.length === expectedCombo.spriteCount && combo.visible === true],
    ["PR24", () => combo.activeAnimationRole === "all-perfect" &&
      combo.hudSpriteAlphas?.every((alpha) => alpha === expectedCombo.spriteAlpha)],
    ["PR26", () => addScore.hudSpriteCount === expectedAdd.spriteCount && addScore.hudText === null],
    ["PR27", () => addScore.activeAnimationRole === "add-score" && addScore.alpha === Math.fround(0.2)],
    ["PR29", () => life.hudText === `${expectedLife.life}/1000` &&
      life.hudFillRatios?.[0] === expectedLife.primary && life.hudFontFamily?.startsWith("sgm-")],
    ["PR30", () => life.hudSpriteLabels?.includes("life-warning-outline") &&
      life.hudSpriteLabels?.includes("life-warning-body")],
    ["PR39", () =>
      full.batches === oracle.fullChart.batches &&
      full.consumedBatches === oracle.fullChart.batches &&
      Number.isInteger(full.totalScoringUnitCount) && full.totalScoringUnitCount > 0 &&
      full.frames > 0 && full.frames <= 7200 &&
      Number.isInteger(full.score) && full.score > 0 &&
      full.score <= 10000000 + full.totalScoringUnitCount &&
      full.life === oracle.fullChart.life &&
      equalArray(full.routes.filter((route) => route !== "combo-ap-overlay"), oracle.fullChart.routes) &&
      full.routes.includes("combo-ap-overlay") &&
      full.cleanupOwnerCount === oracle.fullChart.cleanupOwnerCount &&
      full.cleanupStageChildren === oracle.fullChart.cleanupStageChildren &&
      sampleCleanup.ownerCount === 0 && sampleCleanup.stageChildren === 0],
  ]);

  if (!equalArray([...predicates.keys()], oracle.expectedProductionCases)) {
    throw new Error("independent PR predicate inventory differs from the committed oracle");
  }
  const computed = [];
  for (const [id, predicate] of predicates) {
    if (!predicate()) throw new Error(`${id} raw observation predicate failed`);
    computed.push(Object.freeze({
      id,
      observation: id === "PR39"
        ? "full-chart-owner-resource-cleanup"
        : "typed-command-scene-value-match",
    }));
  }
  return Object.freeze({ cases: Object.freeze(computed) });
}

function requireNote(actual, expected, animationRole) {
  if (
    actual?.activeAnimationRole !== animationRole ||
    actual.spriteBindingKey?.endsWith(`\u0000${expected.exactKey}`) !== true ||
    (expected.position !== undefined && !equalArray(actual.position, noteLocalToPixi(expected)))
  ) {
    throw new Error(`Note animation observation mismatch: ${animationRole}`);
  }
}

function noteLocalToPixi(expected) {
  const row = ordinaryProfile.assets.flatMap((asset) => asset.atlasRows)
    .find((candidate) => candidate.exactKey === expected.exactKey);
  if (row === undefined) throw new Error(`missing independent Sprite PPU for ${expected.exactKey}`);
  return [
    Math.fround(expected.position[0] * row.pixelsPerUnit),
    Math.fround(expected.position[1] * row.pixelsPerUnit),
  ];
}

function rgbTint(rgb) {
  const bytes = rgb.map((value) => Math.round(value * 255));
  return (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
}

function equalArray(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected) &&
    actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
