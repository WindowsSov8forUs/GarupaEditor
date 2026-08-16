declare function require(name: string): any;
declare const process: any;

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";

const root = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/c07-evidence/artifacts/investigations",
);
const browser = JSON.parse(readFileSync(join(
  root,
  "webview2-browser-raster-10-1-4/webview2_browser_raster_contract.json",
), "utf8"));
const fixedDevice = JSON.parse(readFileSync(join(
  root,
  "fixed-device-exact-environment-disposition-10-1-4/fixed_device_exact_environment_disposition.json",
), "utf8"));

async function main(): Promise<void> {
  await testBrowserDecoderBoundary();
  testBrowserActualObservationConsumption();
  testFixedDeviceAndCapabilityReceipt();
  console.log("C07 evidence consumption passed: browser route, fixed-device boundary, receipts");
}

async function testBrowserDecoderBoundary(): Promise<void> {
  const decoder = new BrowserPixiTextureDecoder();
  const asset = Object.freeze({
    logicalAssetId: "test/browser",
    kind: "png" as const,
    byteLength: 1,
    sha256: "A".repeat(64),
    width: 1,
    height: 1,
    atlasRows: Object.freeze([]),
  });
  const savedBitmap = globalThis.createImageBitmap;
  const savedFont = globalThis.FontFace;
  try {
    (globalThis as any).createImageBitmap = undefined;
    (globalThis as any).FontFace = undefined;
    const png = await decoder.decodePng(asset as any, new Uint8Array([0]));
    assert.equal(png.status, "evidence-required");
    if (png.status === "evidence-required") {
      assert.equal(png.capability, "render.pixi.create-image-bitmap-unavailable");
      assert.deepEqual(png.requiredEvidence.slice(-4), ["WBR-P01", "WBR-P02", "WBR-P03", "WBR-P04"]);
    }
    const font = await decoder.decodeFont({ ...asset, kind: "font" } as any, new Uint8Array([0]));
    assert.equal(font.status, "evidence-required");
    if (font.status === "evidence-required") {
      assert.equal(font.capability, "render.pixi.font-face-unavailable");
      assert.deepEqual(font.requiredEvidence.slice(-4), ["WBR-P01", "WBR-P02", "WBR-P03", "WBR-P04"]);
    }
  } finally {
    (globalThis as any).createImageBitmap = savedBitmap;
    (globalThis as any).FontFace = savedFont;
  }

  const source = readFileSync(join(process.cwd(), "src/simulator/backends/pixi/browserPixiTextureDecoder.ts"), "utf8");
  for (const token of [
    "new FontFace(family, owned.buffer as ArrayBuffer)",
    "await face.load()",
    "document.fonts.add(face)",
    "await globalThis.createImageBitmap(",
    'imageOrientation: "none"',
    'premultiplyAlpha: "none"',
    'colorSpaceConversion: "none"',
    "Texture.from(bitmap, true)",
    'texture.source.once("destroy"',
  ]) assert.ok(source.includes(token), `production browser operation missing: ${token}`);
  for (const forbidden of ["new Image(", "URL.createObjectURL", "fetch(", "Assets.load", "document.fonts.check() ||"] ) {
    assert.equal(source.includes(forbidden), false, `production browser fallback forbidden: ${forbidden}`);
  }
}

function testBrowserActualObservationConsumption(): void {
  assert.equal(browser.status, "confirmed-current-webview2-browser-decode-glyph-pixi-raster-bounded");
  assert.equal(browser.hostScope.webView2Runtime, "151.0.4129.78");
  assert.equal(browser.hostScope.chromium, "151.0.7922.109");
  assert.equal(browser.hostScope.pixi, "8.17.1");
  assert.equal(browser.repeatability.runs, 3);
  assert.equal(browser.repeatability.byteIdentical, true);
  assert.equal(browser.observation.isolation.foreignResourceUrls.length, 0);
  assert.equal(browser.observation.browserDecode.fontFaceStatus, "loaded");
  assert.equal(browser.observation.browserDecode.documentFontsCheck, true);
  assert.equal(browser.observation.browserDecode.textureSourceResourceType, "ImageBitmap");
  assert.notDeepEqual(
    browser.observation.browserDecode.loadedMetrics,
    browser.observation.browserDecode.fallbackMetrics,
  );
  const digests = ["pngOnly", "fontOnly", "composite"].map((key) => {
    const row = browser.observation.raster[key];
    assert.ok(row.stats.nonTransparentPixels > 0);
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
    return row.sha256;
  });
  assert.equal(new Set(digests).size, 3);
  assert.equal(browser.productionBoundary.syntheticTextureSourceUsed, false);
  assert.equal(browser.productionBoundary.urlOrImageFallbackAllowed, false);
  assert.equal(browser.productionBoundary.networkFallbackAllowed, false);
  assert.equal(browser.productionBoundary.systemFontFallbackAllowed, false);
}

function testFixedDeviceAndCapabilityReceipt(): void {
  assert.equal(
    fixedDevice.status,
    "objective-environment-blockers-confirmed-exact-gate-remains-open-not-claimed",
  );
  assert.equal(fixedDevice.finalBoundary.positiveExactClaimsAdded, 0);
  assert.equal(fixedDevice.finalBoundary.objectiveBlockedClaims, 4);
  assert.equal(fixedDevice.finalBoundary.portableParticleFunctionalGate, "closed-retained");
  assert.equal(fixedDevice.finalBoundary.rejectedTracesReclassified, false);
  assert.equal(fixedDevice.finalBoundary.autoLiveBudgetRemaining, 10);
  assert.equal(fixedDevice.finalBoundary.r2Used, false);
  assert.equal(fixedDevice.finalBoundary.mainProgramIntegrationAuthorization, false);
  assert.deepEqual(
    fixedDevice.claimDispositions.map((row: any) => row.result),
    [
      "objectively-blocked-on-locked-device",
      "objectively-blocked-no-candidate-on-locked-device",
      "objectively-blocked-no-comparable-physical-output-path",
      "objectively-blocked-no-comparable-physical-output-path",
    ],
  );

  const receipt = createSimulatorModuleCapabilitySummary("ordinary-current-portable");
  assert.equal(receipt.liveRehearsalFourModeMatrix, "closed-portable");
  assert.equal(receipt.startupDirectionPortable, "open-evidence-required");
  assert.equal(receipt.rehearsalMoveTimeControls, "closed-portable");
  assert.equal(receipt.nonzeroInitialPracticeSeek, "excluded");
  assert.equal(receipt.button07SceneMapping, "closed-original-unreachable");
  assert.equal(receipt.browserDecodeRaster, "closed-portable");
  assert.equal(receipt.fixedDeviceExact, "open-objective-environment-blocked");
  assert.equal(receipt.characterSkillFeverMultiplayer, "excluded");
  assert.equal(receipt.mainProgramIntegration, "unauthorized-stage-9");
}


void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
