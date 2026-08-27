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
if (contract?.sourceReverseCommit !== "dc2a8db819032498d0deb8181c29a6963af8cb3f" ||
    contract.bytes !== 6919505 || contract.sha256 !== "9492A5B34127EF1D6201D261047607E076CC18207C98E24C3C970B6411E4F819") {
  throw new Error("full visible/lifecycle strict-JSON contract provenance mismatch");
}
console.log("full visible/lifecycle oracle static independence verified: fixture=12 production-helper-imports=0");
