declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");

import { createSimulatorSessionRecipe } from "../assembly/sessionRecipe";
import { deriveSessionPresentation } from "../assembly/sessionPresentationDerivation";
import { copyAndFreezeSimulatorPresentation } from "../assembly/startupPresentationContract";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";
import { createTestPresentationPackage } from "./startupPresentationTestProfile";

async function main(): Promise<void> {
  testExactShapeAndOwnership();
  testMalformedPresentationFailsClosed();
  await testInternalDerivation();
  console.log("startup presentation derivation tests passed: schema5 exact shape/copy/PNG/MP3/nullable MV/open gate");
}

function testExactShapeAndOwnership(): void {
  const source = request();
  const result = createSimulatorSessionRecipe(source);
  assert.equal(result.status, "accepted");
  if (result.status !== "accepted") return;
  assert.equal(result.value.schemaVersion, 5);
  assert.equal(Object.isFrozen(result.value.request.presentation), true);
  assert.equal(Object.isFrozen(result.value.request.presentation.song), true);
  assert.equal(Object.isFrozen(result.value.request.presentation.stage), true);
  const first = result.value.request.presentation.jacketPng[0];
  source.presentation.jacketPng[0] = 0;
  source.presentation.stage.sdCharacterAtlases[0][0] = 0;
  assert.equal(result.value.request.presentation.jacketPng[0], first);
  assert.notEqual(result.value.request.presentation.jacketPng, source.presentation.jacketPng);
  assert.notEqual(result.value.request.presentation.stage.sdCharacterAtlases[0], source.presentation.stage.sdCharacterAtlases[0]);

  const mvBytes = Uint8Array.of(1, 2, 3, 4);
  const copied = copyAndFreezeSimulatorPresentation({
    ...createTestPresentationPackage(),
    mv: { bytes: mvBytes, musicStartDelayMilliseconds: -2180 },
  });
  assert.equal(copied.status, "accepted");
  if (copied.status === "accepted" && copied.value.mv !== null) {
    mvBytes.fill(9);
    assert.deepEqual([...copied.value.mv.bytes], [1, 2, 3, 4]);
    assert.equal(copied.value.mv.musicStartDelayMilliseconds, -2180);
    assert.equal(Object.isFrozen(copied.value.mv), true);
    assert.notEqual(copied.value.mv.bytes, mvBytes);
  }
  const gated = request();
  (gated.presentation as { mv: unknown }).mv = {
    bytes: Uint8Array.of(1, 2, 3, 4),
    musicStartDelayMilliseconds: -2180,
  };
  assertInvalid(gated, "simulator.mv-live.complete-closure-open");
}

function testMalformedPresentationFailsClosed(): void {
  const oldShape: any = request();
  delete oldShape.presentation;
  assertInvalid(oldShape, "simulator.recipe.invalid-public-request");
  const legacyMissingMv: any = request();
  delete legacyMissingMv.presentation.mv;
  assertInvalid(legacyMissingMv, "simulator.presentation.invalid-public-package");
  const extra: any = request();
  extra.presentation.defaultJacket = true;
  assertInvalid(extra, "simulator.presentation.invalid-public-package");
  const slots: any = request();
  slots.presentation.stage.sdCharacterAtlases.pop();
  assertInvalid(slots, "simulator.presentation.invalid-public-package");
  const wrongSize: any = request();
  wrongSize.presentation.stage.backdropPng = Uint8Array.from(wrongSize.presentation.jacketPng);
  assertInvalid(wrongSize, "simulator.presentation.invalid-png");
  const badCrc: any = request();
  badCrc.presentation.jacketPng[badCrc.presentation.jacketPng.length - 1] ^= 1;
  assertInvalid(badCrc, "simulator.presentation.invalid-png");
  const badText: any = request();
  badText.presentation.song.title = "\ud800";
  assertInvalid(badText, "simulator.presentation.invalid-public-package");
  const missingGlyph: any = request();
  missingGlyph.presentation.song.title = "😀";
  assertInvalid(missingGlyph, "simulator.presentation.missing-font-glyph");
  const badVoice: any = request();
  badVoice.presentation.liveStartVoiceMp3 = new Uint16Array([1]);
  assertInvalid(badVoice, "simulator.presentation.invalid-public-package");
  for (const mv of [
    {},
    { bytes: Uint8Array.of(1), musicStartDelayMilliseconds: 0, mime: "video/mp4" },
    { bytes: new Uint16Array([1]), musicStartDelayMilliseconds: 0 },
    { bytes: new Uint8Array(), musicStartDelayMilliseconds: 0 },
    { bytes: Uint8Array.of(1), musicStartDelayMilliseconds: 1.5 },
    { bytes: Uint8Array.of(1), musicStartDelayMilliseconds: 0x80000000 },
    { bytes: Uint8Array.of(1), musicStartDelayMilliseconds: -0x80000001 },
  ]) {
    const malformed: any = request();
    malformed.presentation.mv = mv;
    assertInvalid(malformed, "simulator.presentation.invalid-public-package");
  }
}

async function testInternalDerivation(): Promise<void> {
  const presentation = createTestPresentationPackage();
  const nullVoice = await deriveSessionPresentation(presentation, preflight());
  assert.equal(nullVoice.status, "accepted");
  if (nullVoice.status === "accepted") {
    assert.equal(nullVoice.value.jacket.width, 360);
    assert.equal(nullVoice.value.stageBackdrop.width, 1600);
    assert.equal(nullVoice.value.sdCharacters.length, 5);
    assert.equal(nullVoice.value.liveStartVoice, null);
    assert.match(nullVoice.value.jacket.logicalId, /^startup\/session\/jacket\/[0-9A-F]{64}$/);
  }
  const voice = { ...presentation, liveStartVoiceMp3: Uint8Array.of(0xff, 0xfb, 0x90, 0x00) };
  const prepared = await deriveSessionPresentation(voice, preflight());
  assert.equal(prepared.status, "accepted");
  if (prepared.status === "accepted") {
    assert.equal(prepared.value.liveStartVoice?.sampleFrames, 44100);
    assert.equal(prepared.value.liveStartVoice?.durationSeconds, 1);
  }
  const invalid = await deriveSessionPresentation(
    { ...presentation, liveStartVoiceMp3: Uint8Array.of(1, 2, 3, 4) },
    preflight(),
  );
  assert.equal(invalid.status, "rejected");
  if (invalid.status === "rejected") assert.equal(invalid.failure.capability, "simulator.presentation.invalid-live-start-voice-mp3");
}

function request(): SimulatorModuleLaunchRequest {
  return {
    chartData: {
      chart: [{ type: "BPM", beat: 0, value: 120 }],
      bgm: Uint8Array.of(1),
      isFullLength: false,
    },
    presentation: createTestPresentationPackage(),
    config: {
      sessionMode: "live",
      inputMode: "manual",
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      visual: {
        specificSpeed: Math.fround(11), noteSize: Math.fround(100),
        highAspectRatio: 1, habahiroMeshWidthSetting: Math.fround(1),
      },
      audio: { masterGain: 1, bgmGain: 1, seGain: 1 },
    },
  };
}
function preflight(): any {
  return {
    async inspect() {
      return { status: "accepted", value: { codec: "mp3", sampleRate: 44100, channels: 2, sampleFrames: 44100, durationSeconds: 1 } };
    },
  };
}
function assertInvalid(value: SimulatorModuleLaunchRequest, capability: string): void {
  const result = createSimulatorSessionRecipe(value);
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.equal(result.failure.capability, capability);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
