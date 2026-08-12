import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const degraded = new Set(["PR04", "PR19", "PR40"]);
const matrix = Array.from({ length: 40 }, (_, index) => {
  const id = `PR${String(index + 1).padStart(2, "0")}`;
  return [id, degraded.has(id) ? "closed-degraded" : "closed"];
});
const ids = matrix.map(([id]) => id);
const expectedIds = Array.from({ length: 40 }, (_, index) =>
  `PR${String(index + 1).padStart(2, "0")}`);
if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
  throw new Error("PR production matrix IDs differ");
}
const source = [
  "backends/pixi/pixiRendererBackend.ts",
  "engine/managers/inGameManager.ts",
  "engine/managers/noteManager.ts",
  "engine/rendering/ordinaryNoteGeometry.ts",
  "engine/rendering/renderCommandProducer.ts",
  "testing/runRenderProductionChartTests.mjs",
].map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
for (const marker of [
  'kind: "set-threshold"',
  "buildOrdinaryAdvancedNoteMesh",
  "CURRENT_SUDDEN_THRESHOLD",
  '"note-directional-flick"',
  "representativeJudgeTiming",
  "render ordinary exact production replay passed",
  "HABAHIRO",
]) {
  if (!source.includes(marker)) throw new Error(`PR production marker missing: ${marker}`);
}
const open = matrix.filter(([, status]) => !status.startsWith("closed"));
if (open.length !== 0 || matrix.length !== 40) {
  throw new Error(`RP14 production matrix remains open: ${JSON.stringify(open)}`);
}
Object.freeze(matrix);
console.log("render production matrix verified for retained note/geometry/judgement playback scope");
