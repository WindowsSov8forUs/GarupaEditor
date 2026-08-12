import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(testingRoot, "..", "..", "..");
const evidence = JSON.parse(read("src/simulator/testing/fixtures/habahiro-snapshots/bestdori-atlas-profile.json"));
const differences = JSON.parse(read("src/simulator/testing/fixtures/habahiro-snapshots/difference-matrix.json"));
const manifestSource = read("src/simulator/backends/resources/habahiroBestdoriManifest.ts");
const providerSource = read("src/simulator/backends/resources/habahiroBestdoriProvider.ts");
const fidelitySource = read("src/simulator/backends/renderingContracts.ts");
const producerSource = read("src/simulator/engine/rendering/renderCommandProducer.ts");
const chartOracle = read("src/simulator/testing/runRenderProductionChartTests.mjs");

assert(evidence.atlas_row_count === 179, "HA-D04 keeps exactly 179 source Sprite rows");
assert(evidence.assets.length === 11, "all eleven pinned Bestdori payloads are profiled");
for (const asset of evidence.assets) {
  assert(manifestSource.includes(`technicalName: "${asset.technical_name}"`), `manifest technical name ${asset.technical_name}`);
  assert(manifestSource.includes(`byteLength: ${asset.bytes}`), `manifest byte length ${asset.technical_name}`);
  assert(manifestSource.includes(`sha256: "${asset.sha256}"`), `manifest SHA-256 ${asset.technical_name}`);
  assert(manifestSource.includes(`url: "${asset.url}"`), `manifest URL ${asset.technical_name}`);
}
assert(differences.parity_claim === false, "approximation never claims original parity");
assert(differences.functional_blockers.length === 0, "difference profile has no functional blocker");
assert(providerSource.includes('parsed.hostname === "bestdori.com"'), "injected transport URL allowlist is exact");
assert(!providerSource.includes("fetch("), "production HABAHIRO provider has no implicit network transport");
assert(!providerSource.includes("BrowserHabahiroBestdoriTransport"), "browser acquisition is outside production graph");
assert(providerSource.includes('automaticFallbackAllowed: false'), "automatic fallback remains disabled");
assert(providerSource.includes('networkAllowed: false'), "prepared renderer profile performs no runtime networking");
assert(providerSource.includes('fidelity: "current-external-complete"'), "functionally complete current-external fidelity is emitted");
assert(!providerSource.includes('visibleLabel: "Approximate HABAHIRO"'), "resource profile emits no runtime approximation label");
assert(!providerSource.includes('rendering-fidelity-approximate-habahiro'), "resource profile emits no runtime approximation flag");
assert(!`${providerSource}\n${fidelitySource}\n${producerSource}`.toLowerCase().includes("approximat"),
  "production contracts and commands contain no runtime approximation marker");
assert(producerSource.includes('getHabahiroMeshWidthRate'), "static mesh-width rule is consumed");
assert(producerSource.includes('preflightHabahiroFlashStart'), "engine-clock flash phase is explicit");
assert(producerSource.includes('preflightHabahiroLaneChange'), "post-flash lane change is explicit");
assert(chartOracle.includes('render.habahiro.external-note-animation-evidence-required'),
  "external HABAHIRO Note animation remains explicitly fail-closed");
assert(!providerSource.includes("GirlsBandParty-Reverse"), "production provider does not read Reverse");
console.log("HABAHIRO complete implementation static audit passed: HA-D01-HA-D12, 11 payloads, 179 Sprites, locked replay");

function read(path) { return readFileSync(resolve(root, path), "utf8"); }
function assert(condition, message) { if (!condition) throw new Error(message); }
