import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
for (const entry of manifest.entries) {
  const bytes = readFileSync(join(root, entry.path));
  equal(bytes.byteLength, entry.bytes, `${entry.path} bytes`);
  equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(), entry.sha256,
    `${entry.path} SHA-256`);
}
const profile = JSON.parse(readFileSync(join(root, "bestdori-atlas-profile.json"), "utf8"));
equal(profile.atlas_rows.length, 179, "atlas row count");
equal(new Set(profile.atlas_rows.map((row) => row.exact_key)).size, 179, "unique exact keys");
equal(profile.assets.length, 11, "pinned downloadable asset count excluding explorer index");
for (const asset of profile.assets) {
  if (!asset.url.startsWith("https://bestdori.com/")) throw new Error(`non-Bestdori URL: ${asset.url}`);
  if (!/^[A-F0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) {
    throw new Error(`invalid pinned asset: ${asset.technical_name}`);
  }
}
const dimensions = new Map(profile.assets.filter((asset) => asset.dimensions)
  .map((asset) => [asset.technical_name, asset.dimensions]));
for (const row of profile.atlas_rows) {
  const size = dimensions.get(row.technical_name);
  if (!size || row.x < 0 || row.y < 0 || row.width <= 0 || row.height <= 0 ||
    row.x + row.width > size[0] || row.y + row.height > size[1]) {
    throw new Error(`invalid atlas row: ${row.exact_key}`);
  }
}
equal(profile.mesh_width_formula.base_f32_bits, "3F866666", "mesh width base bits");
equal(profile.mesh_width_formula.coefficient_f32_bits, "3CF5C2C0", "mesh width coefficient bits");
const differences = JSON.parse(readFileSync(join(root, "difference-matrix.json"), "utf8"));
equal(differences.entries.length, 12, "difference count");
equal(differences.functional_blockers.length, 0, "functional blockers");
equal(differences.parity_claim, false, "parity claim");
console.log("HABAHIRO approximation evidence verified: assets=11 rows=179 differences=12 functional-blockers=0 parity=false");

function equal(actual, expected, label) {
  if (!Object.is(actual, expected)) throw new Error(`${label}: ${actual} !== ${expected}`);
}
