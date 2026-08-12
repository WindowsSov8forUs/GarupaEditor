import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const simulatorRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(simulatorRoot, "..", "..");
const evidenceRoot = resolve(
  repositoryRoot,
  "src/simulator/testing/fixtures/reverse-snapshots/ordinary-visible-rendering/artifacts/investigations/ordinary-visible-rendering-portable-10-1-4",
);
const closure = JSON.parse(readFileSync(resolve(evidenceRoot, "closure.json"), "utf8"));
const oracle = JSON.parse(readFileSync(resolve(evidenceRoot, "ordinary_visible_rendering_oracle.json"), "utf8"));
const observationPath = process.env.SIMULATOR_RENDER_OBSERVATION_PATH;
if (typeof observationPath !== "string" || observationPath.length === 0) {
  throw new Error("actual Pixi observation path is required; source markers and Recording rejection cannot close RP cases");
}
const observation = JSON.parse(readFileSync(observationPath, "utf8"));
if (
  closure.status !== "ordinary-visible-rendering-portable-evidence-gate-closed" ||
  closure.productionAuthorization !== true ||
  closure.blockingFindings.length !== 0 ||
  observation.schemaVersion !== 1 ||
  observation.source !== "actual-pixi-reverse-semantic-oracle"
) {
  throw new Error("Reverse evidence or actual Pixi observation did not satisfy the portable gate identity");
}
const expected = oracle.expectedProductionCases;
if (!Array.isArray(expected) || expected.length !== 11) throw new Error("Reverse PR case matrix is incomplete");
for (const id of expected) {
  const row = observation.cases?.[id];
  if (row?.status !== "closed" ||
    (row.observation !== "actual-pixi-positive-route" && row.observation !== "failed-batch-zero-mutation")) {
    throw new Error(`${id} lacks a dynamic actual Pixi observation`);
  }
  console.log(`${id}: evidence=closed production=closed actual-pixi=${row.observation}`);
}
const full = observation.fullChart;
if (
  full?.batches !== 656 || full.frames !== 3900 || !Number.isInteger(full.score) || full.score <= 0 ||
  full.routes?.join(",") !== "add-score,combo,life,result,score"
) throw new Error("actual Pixi poppin_shuffle_special Score/Life full-chart observation is incomplete");
console.log(`RP matrix closed from Reverse closure + dynamic actual Pixi: cases=${expected.length} batches=${full.batches} frames=${full.frames} score=${full.score}`);
