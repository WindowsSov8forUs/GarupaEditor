import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(testingRoot, "..", "..", "..");
const evidence = JSON.parse(read("src/simulator/testing/fixtures/habahiro-snapshots/bestdori-atlas-profile.json"));
const differences = JSON.parse(read("src/simulator/testing/fixtures/habahiro-snapshots/difference-matrix.json"));
const manifestSource = read("src/simulator/backends/resources/habahiroExternalManifest.ts");
const providerSource = read("src/simulator/backends/resources/habahiroExternalProvider.ts");
const fidelitySource = read("src/simulator/backends/renderingContracts.ts");
const producerSource = read("src/simulator/engine/rendering/renderCommandProducer.ts");
const chartOracle = read("src/simulator/testing/runRenderProductionChartTests.mjs");

assert(evidence.atlas_row_count === 179, "HA-D04 keeps exactly 179 source Sprite rows");
assert(evidence.assets.length === 11, "all eleven pinned external payloads are profiled");
for (const asset of evidence.assets) {
  assert(manifestSource.includes(`technicalName: "${asset.technical_name}"`), `manifest technical name ${asset.technical_name}`);
  assert(manifestSource.includes(`byteLength: ${asset.bytes}`), `manifest byte length ${asset.technical_name}`);
  assert(manifestSource.includes(`sha256: "${asset.sha256}"`), `manifest SHA-256 ${asset.technical_name}`);
}
assert(differences.parity_claim === false, "approximation never claims original parity");
assert(differences.functional_blockers.length === 0, "difference profile has no functional blocker");
assert(!`${manifestSource}\n${providerSource}`.includes("https://"), "production HABAHIRO metadata contains no acquisition URL");
assert(!providerSource.includes("new URL") && !providerSource.includes("fetch("), "production HABAHIRO provider uses technical shared-store identities only");
assert(providerSource.includes('automaticFallbackAllowed: false'), "automatic fallback remains disabled");
assert(providerSource.includes('networkAllowed: false'), "prepared renderer profile performs no runtime networking");
assert(providerSource.includes('fidelity: "habahiro-external-degraded-preview"'), "external fidelity is explicitly degraded");
assert(providerSource.includes("RenderFidelityLabel"), "resource profile carries the required visible disclosure");
assert(providerSource.includes("RenderFidelityDisclosure"), "resource profile carries the machine-readable degraded flag");
assert(fidelitySource.includes('"Approximate HABAHIRO"'), "production contract fixes the visible degraded label");
assert(fidelitySource.includes('"rendering-fidelity-degraded-habahiro"'), "production contract fixes the machine-readable degraded flag");
assert(producerSource.includes('getHabahiroMeshWidthRate'), "static mesh-width rule is consumed");
assert(producerSource.includes('preflightHabahiroFlashStart'), "engine-clock flash phase is explicit");
assert(producerSource.includes('preflightHabahiroLaneChange'), "post-flash lane change is explicit");
assert(chartOracle.includes('render.habahiro.external-note-animation-evidence-required'),
  "external HABAHIRO Note animation remains explicitly fail-closed");
assert(!providerSource.includes("GirlsBandParty-Reverse"), "production provider does not read Reverse");
console.log("explicit degraded HABAHIRO preview static boundary passed: 11 payloads, 179 Sprites, no production URL or parity claim");

function read(path) { return readFileSync(resolve(root, path), "utf8"); }
function assert(condition, message) { if (!condition) throw new Error(message); }
