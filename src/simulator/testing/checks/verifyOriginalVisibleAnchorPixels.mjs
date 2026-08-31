import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const testingDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const investigationDirectory = join(
  testingDirectory,
  "fixtures",
  "reverse-snapshots",
  "seven-visual-original-visible-anchor",
  "artifacts",
  "investigations",
  "simulator-seven-visual-product-visible-original-anchor-10-1-4",
);
const contractPath = join(investigationDirectory, "original_visible_anchor_contract.json");
const frameDirectory = join(investigationDirectory, "runtime", "original-visible-auto-r1-promoted");
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString("utf8"));

assert.equal(
  sha256(contractBytes),
  "F702E950A7D0CD676A36E16368978DF6A123025F9377F86919B4D884BBE45DC8",
  "the independent original-visible contract bytes changed",
);
assert.equal(contract.status, "current-original-visible-anchors-confirmed-product-equivalence-open");
assert.deepEqual(contract.capture_identity.viewport_device_pixels, [1600, 720]);
assert.equal(contract.capture_identity.chart.music, "Ichininaru");
assert.equal(contract.capture_identity.chart.difficulty, "expert");
assert.equal(contract.capture_identity.manual_or_auto, "auto");
assert.equal(contract.natural_auto_base_clear_witness.clear_status, 1);
assert.equal(contract.product_visible_comparison_requirements.independent_original_pixels_required, true);
assert.equal(contract.authorization.garupa_product_equivalence_authorized, false);

const anchors = contract.original_device_visible_anchors;
assert.equal(Object.keys(anchors).length, 16);
const decoded = new Map();
for (const [identity, anchor] of Object.entries(anchors)) {
  const path = join(frameDirectory, basename(anchor.path));
  const bytes = readFileSync(path);
  assert.equal(bytes.length, anchor.bytes, `${identity} byte count`);
  assert.equal(sha256(bytes), anchor.sha256, `${identity} SHA-256`);
  const raster = decodeRgbaPng(bytes);
  assert.deepEqual([raster.width, raster.height], [1600, 720], `${identity} raster dimensions`);
  decoded.set(identity, raster);
}

const ordinary = featureSummary(decoded.get("ordinary_particle"));
assert.ok(ordinary.lowerBright > 1_000, "ordinary original anchor must contain a visible lower-field glow");
assert.ok(ordinary.lowerFineBright > 100, "ordinary original anchor must contain fine lower-field sparks/stars");
assert.ok(ordinary.lowerHueBins >= 3, "ordinary original anchor must retain multi-hue particle pixels");

for (const identity of [
  "slide_flash_play",
  "tapkeep_play",
  "slide_current_1",
  "slide_current_2",
  "slide_flash_play_second_owner",
  "tapkeep_play_second_owner",
]) {
  const feature = featureSummary(decoded.get(identity));
  assert.ok(feature.lowerBright > 1_000, `${identity} must contain visible lower-field effect pixels`);
  assert.ok(feature.lowerFineBright > 50, `${identity} must retain fine effect pixels`);
}

const rank = featureSummary(decoded.get("rank_five_entry"));
assert.ok(rank.upperBright > 2_000, "rank-five original anchor must contain the visible upper HUD");

const clearVisible = ["base_clear_0_10", "base_clear_0_25", "base_clear_0_50", "base_clear_0_90", "base_clear_1_40"];
for (const identity of clearVisible) {
  const feature = featureSummary(decoded.get(identity));
  assert.ok(feature.lowerBright > 300, `${identity} must contain visible base-clear particles`);
  assert.ok(feature.lowerHueBins >= 2, `${identity} must contain more than one base-clear hue family`);
}
assert.ok(
  differingPixels(decoded.get("base_clear_0_00"), decoded.get("base_clear_0_10")) > 10_000,
  "base-clear 0.00 and 0.10 independent frames must not collapse to one raster",
);
assert.ok(
  differingPixels(decoded.get("base_clear_0_90"), decoded.get("base_clear_1_40")) > 10_000,
  "base-clear 0.90 and 1.40 independent frames must retain distinct phases",
);
assert.ok(
  featureSummary(decoded.get("base_clear_3_10")).lowerBright < featureSummary(decoded.get("base_clear_0_90")).lowerBright,
  "the 3.10-second scene-owned tail must not be substituted for the visible peak",
);

console.log(JSON.stringify({
  status: "original-visible-anchor-pixels-verified-product-equivalence-open",
  contractSha256: sha256(contractBytes),
  frames: decoded.size,
  ordinary,
  rankUpperBright: rank.upperBright,
  clear: Object.fromEntries(clearVisible.map((identity) => [identity, featureSummary(decoded.get(identity))])),
  sameStateTuple: contract.product_visible_comparison_requirements.same_state_tuple_required,
  garupaProductEquivalenceAuthorized: contract.authorization.garupa_product_equivalence_authorized,
}, null, 2));

function featureSummary(raster) {
  let upperBright = 0;
  let lowerBright = 0;
  let lowerFineBright = 0;
  const hueBins = new Set();
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const offset = (y * raster.width + x) * 4;
      const red = raster.rgba[offset];
      const green = raster.rgba[offset + 1];
      const blue = raster.rgba[offset + 2];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      if (maximum < 170) continue;
      if (y < 190) upperBright += 1;
      if (y < 190) continue;
      lowerBright += 1;
      if (maximum - minimum >= 35) hueBins.add(hueBin(red, green, blue));
      let neighbours = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= raster.width || py < 190 || py >= raster.height) continue;
        const neighbourOffset = (py * raster.width + px) * 4;
        if (Math.max(raster.rgba[neighbourOffset], raster.rgba[neighbourOffset + 1], raster.rgba[neighbourOffset + 2]) >= 170) neighbours += 1;
      }
      if (neighbours <= 2) lowerFineBright += 1;
    }
  }
  return Object.freeze({ upperBright, lowerBright, lowerFineBright, lowerHueBins: hueBins.size });
}

function hueBin(red, green, blue) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  const raw = maximum === red
    ? ((green - blue) / delta) % 6
    : maximum === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  const degrees = (raw * 60 + 360) % 360;
  return Math.floor(degrees / 30);
}

function differingPixels(left, right) {
  assert.equal(left.rgba.length, right.rgba.length);
  let count = 0;
  for (let offset = 0; offset < left.rgba.length; offset += 4) {
    if (Math.abs(left.rgba[offset] - right.rgba[offset]) +
      Math.abs(left.rgba[offset + 1] - right.rgba[offset + 1]) +
      Math.abs(left.rgba[offset + 2] - right.rgba[offset + 2]) >= 24) count += 1;
  }
  return count;
}

function decodeRgbaPng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      assert.equal(payload[8], 8, "only evidence PNG bit depth 8 is accepted");
      assert.equal(payload[9], 6, "only evidence PNG RGBA is accepted");
      assert.equal(payload[10], 0);
      assert.equal(payload[11], 0);
      assert.equal(payload[12], 0, "interlaced evidence PNG is not accepted");
    } else if (type === "IDAT") idat.push(payload);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  assert.ok(width > 0 && height > 0 && idat.length > 0);
  const scanlines = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  assert.equal(scanlines.length, height * (stride + 1));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[source + x];
      const left = x >= 4 ? rgba[target + x - 4] : 0;
      const up = y > 0 ? rgba[target + x - stride] : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[target + x - stride - 4] : 0;
      const reconstructed = filter === 0 ? raw
        : filter === 1 ? raw + left
        : filter === 2 ? raw + up
        : filter === 3 ? raw + Math.floor((left + up) / 2)
        : filter === 4 ? raw + paeth(left, up, upLeft)
        : Number.NaN;
      assert.ok(Number.isFinite(reconstructed), `unsupported PNG filter ${filter}`);
      rgba[target + x] = reconstructed & 0xFF;
    }
  }
  return Object.freeze({ width, height, rgba });
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  return leftDistance <= upDistance && leftDistance <= upLeftDistance ? left : upDistance <= upLeftDistance ? up : upLeft;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
