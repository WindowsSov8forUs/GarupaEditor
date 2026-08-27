import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("../../..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const test = readFileSync(join(root, "src/simulator/testing/fullVisibleLifecycleOracle.test.ts"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "src/simulator/testing/fixtures/manifest.json"), "utf8"));
if (/from\s+["'][^"']*(?:engine|backends|scene|runtime|assembly)\//.test(test) ||
    /productRenderProducer|currentScoreHudSemanticProfile|tapLaneEffectOwner|particleCommandProducer/.test(test)) {
  throw new Error("full visible/lifecycle expected values must not import production helpers");
}
const rows = manifest.entries.filter((row) => row.path.startsWith("reverse-snapshots/full-visible-lifecycle/"));
if (rows.length !== 12 || !rows.every((row) => /^[0-9a-f]{40}$/.test(row.sourceReverseCommit))) {
  throw new Error(`full visible/lifecycle fixture inventory mismatch: ${rows.length}`);
}
const contract = rows.find((row) => row.path.endsWith("/full_visible_lifecycle_contract.json"));
if (contract?.sourceReverseCommit !== "3be484bc87b0e3fffe7f349b97fe522d8d5422ca" ||
    contract.bytes !== 6942833 || contract.sha256 !== "639C7C45FDED4DC586C14E667A41E4B5BEA9B9148AFCDB806462254C4D36CB22") {
  throw new Error("full visible/lifecycle strict-JSON contract provenance mismatch");
}
console.log("full visible/lifecycle oracle static independence verified: fixture=12 production-helper-imports=0");
