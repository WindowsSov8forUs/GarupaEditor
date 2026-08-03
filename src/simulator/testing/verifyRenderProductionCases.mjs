import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const matrix = [
  ["PR01", "closed"], ["PR02", "closed"], ["PR03", "closed"],
  ["PR04", "closed-degraded"], ["PR05", "closed"], ["PR06", "partial"],
  ["PR07", "closed-current-subset"], ["PR08", "partial"], ["PR09", "partial"],
  ["PR10", "closed-current-subset"], ["PR11", "partial"], ["PR12", "closed-current-subset"],
  ["PR13", "closed-current-subset"], ["PR14", "blocked"], ["PR15", "partial"],
  ["PR16", "closed-current-subset"], ["PR17", "closed-current-subset"], ["PR18", "partial"],
  ["PR19", "closed-degraded"], ["PR20", "partial"], ["PR21", "partial"],
  ["PR22", "partial"], ["PR23", "closed-current-subset"], ["PR24", "partial"],
  ["PR25", "partial"], ["PR26", "partial"], ["PR27", "partial"],
  ["PR28", "partial"], ["PR29", "partial"], ["PR30", "blocked"],
  ["PR31", "partial"], ["PR32", "partial"], ["PR33", "closed"],
  ["PR34", "partial"], ["PR35", "closed"], ["PR36", "closed"],
  ["PR37", "closed"], ["PR38", "closed"], ["PR39", "blocked"],
  ["PR40", "closed-degraded"],
];
const ids = matrix.map(([id]) => id);
const expectedIds = Array.from({ length: 40 }, (_, index) => `PR${String(index + 1).padStart(2, "0")}`);
if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) throw new Error("PR production matrix IDs differ");
const source = [
  "backends/pixi/pixiRendererBackend.ts",
  "engine/managers/noteManager.ts",
  "engine/rendering/renderCommandProducer.ts",
].map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
for (const marker of [
  'kind: "set-mask"', 'kind: "sample-animation"', "Approximate HABAHIRO",
  "preflightOrdinarySlideChildFrame",
  "multipleDirectionalLineLeftLogicalAssetId",
  "preflightHudSkillTransition",
  "representativeScoreUpType",
  "preflightDegradedHabahiroLaneChange",
  "Approximate HABAHIRO",
  "score-skill",
  "render.note.long-non-normal-tail-evidence-required",
  "render.note.multiple-directional-lifecycle-evidence-required",
  "Threshold shaders remain outside the authorized portable mapping",
]) {
  if (!source.includes(marker)) throw new Error(`PR production marker missing: ${marker}`);
}
const groups = { closed: [], partial: [], blocked: [] };
for (const [id, status] of matrix) {
  if (status.startsWith("closed")) groups.closed.push(id);
  else if (status === "partial") groups.partial.push(id);
  else if (status.startsWith("blocked")) groups.blocked.push(id);
  else throw new Error(`Unknown PR production status: ${status}`);
}
if (groups.closed.length !== 19 || groups.partial.length !== 18 || groups.blocked.length !== 3) {
  throw new Error(`PR production counts differ: ${JSON.stringify(groups)}`);
}
Object.freeze(matrix); Object.freeze(groups.closed); Object.freeze(groups.partial); Object.freeze(groups.blocked);
console.log("render PR production matrix verified: closed=19 partial=18 blocked=3 RP14=blocked");
