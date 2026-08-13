import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRenderObservation } from "./verifyRenderProductionCases.mjs";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testingRoot, "fixtures", "reverse-snapshots");
const observationPath = process.env.SIMULATOR_RENDER_OBSERVATION_PATH;
if (typeof observationPath !== "string" || observationPath.length === 0) {
  throw new Error("raw observation path is required for independence regression");
}
const observation = JSON.parse(readFileSync(observationPath, "utf8"));
const oracle = JSON.parse(readFileSync(join(
  fixtureRoot,
  "evidence-integrity", "artifacts", "investigations",
  "simulator-dynamic-acceptance-oracle-10-1-4", "dynamic_acceptance_oracle.json",
), "utf8"));
const closure = JSON.parse(readFileSync(join(
  fixtureRoot,
  "ordinary-visible-rendering", "artifacts", "investigations",
  "ordinary-visible-rendering-portable-10-1-4", "closure.json",
), "utf8"));
assert.equal(verifyRenderObservation(observation, oracle, closure).cases.length, 11);

const forged = structuredClone(observation);
forged.status = "closed";
forged.cases = Object.fromEntries(oracle.expectedProductionCases.map((id) => [id, { status: "closed" }]));
forged.fullChart.score = 0;
assert.throws(
  () => verifyRenderObservation(forged, oracle, closure),
  /PR39 raw observation predicate failed/,
  "self-authored closed status cannot override a false raw production observation",
);

const tamperedFloat = structuredClone(observation);
tamperedFloat.status = "closed";
tamperedFloat.samples.noteLeft.position[0] = Math.fround(tamperedFloat.samples.noteLeft.position[0] + 1);
assert.throws(
  () => verifyRenderObservation(tamperedFloat, oracle, closure),
  /Note animation observation mismatch|PR08 raw observation predicate failed/,
  "self-authored closed status cannot override a tampered Float32 scene value",
);
console.log("render observation independence verified: forged closed fields cannot satisfy raw predicates");
