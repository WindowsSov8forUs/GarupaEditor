import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("../../..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const testPath = join(root, "src/simulator/testing/sevenVisualLifecycleReconfirmation.test.ts");
const test = readFileSync(testPath, "utf8");
const manifest = JSON.parse(readFileSync(join(root, "src/simulator/testing/fixtures/manifest.json"), "utf8"));
if (/from\s+["'][^"']*(?:engine|backends|scene|runtime|assembly)\//.test(test) ||
    /productRenderProducer|pixiRendererBackend|singlePlayScoreGauge|currentGameClearProfile/.test(test)) {
  throw new Error("seven visual lifecycle expected values must not import or invoke production helpers");
}
const lifecycleRows = manifest.entries.filter((row) => row.path.startsWith("reverse-snapshots/seven-visual-lifecycle/"));
const gapRows = manifest.entries.filter((row) => row.path.startsWith("reverse-snapshots/seven-visual-production-gap/"));
const freshRows = manifest.entries.filter((row) => row.path.startsWith("reverse-snapshots/seven-visual-fresh-reconfirmation/"));
if (lifecycleRows.length !== 1 || gapRows.length !== 1 || freshRows.length !== 1) {
  throw new Error(`seven visual fixture inventory mismatch: lifecycle=${lifecycleRows.length} gap=${gapRows.length} fresh=${freshRows.length}`);
}
const oracle = lifecycleRows[0];
const gap = gapRows[0];
const fresh = freshRows[0];
if (oracle.sourceReverseCommit !== "9c627f1f7d67491d637d6780da8da27357d86dbe" ||
    oracle.bytes !== 152733 ||
    oracle.sha256 !== "73D9F78A491FE3E533A3AC9E11EBDF237235B4162D428B6A09390DD41AF8B879") {
  throw new Error("seven visual lifecycle oracle provenance mismatch");
}
if (gap.sourceReverseCommit !== "9c627f1f7d67491d637d6780da8da27357d86dbe" ||
    gap.bytes !== 6494 ||
    gap.sha256 !== "81E44FB00360B96C4614C04E8CB9F259A63A7C0DC62E819E11A22B5C622BE626") {
  throw new Error("seven visual production-gap provenance mismatch");
}
if (fresh.sourceReverseCommit !== "d4ab8146c1e13f9cfd293dab570677607e99221a" ||
    fresh.bytes !== 45031 ||
    fresh.sha256 !== "B713447F873C9EFF1741AEAD79F5A8BACEEDFEA47A40D53E1E312BCAF2321133") {
  throw new Error("seven visual fresh-reconfirmation provenance mismatch");
}
console.log("seven visual static independence verified: fixtures=3 production-helper-imports=0 Reverse=d4ab8146");
