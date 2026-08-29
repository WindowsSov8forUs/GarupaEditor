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
const rows = manifest.entries.filter((row) => row.path.startsWith("reverse-snapshots/seven-visual-lifecycle/"));
if (rows.length !== 1) throw new Error(`seven visual lifecycle fixture inventory mismatch: ${rows.length}`);
const oracle = rows[0];
if (oracle.sourceReverseCommit !== "e5a15b823193f09e8262d4152e2e8ec7da2af9b7" ||
    oracle.bytes !== 152585 ||
    oracle.sha256 !== "242049AAE84007E9E580423F929D2C1164F7091A9473C7A47CAD355DC55077B2") {
  throw new Error("seven visual lifecycle oracle provenance mismatch");
}
console.log("seven visual lifecycle static independence verified: fixture=1 production-helper-imports=0 Reverse=e5a15b8");
