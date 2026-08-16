declare function require(name: string): any;
declare const Buffer: any;
declare const process: any;
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

import {
  deriveSessionBgmResource,
  inspectMp3FirstFrame,
} from "../assembly/sessionBgmDerivation";
import type {
  AudioDecodedResourceMetadata,
  AudioResourcePreflightAdapter,
} from "../backends/audioContracts";
import { BrowserAudioResourcePreflightAdapter } from "../backends/audio/browserAudioResourcePreflightAdapter";
import { audioAccepted } from "../backends/audioValidation";

async function main(): Promise<void> {
  const stereo = Uint8Array.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
  const stereoHeader = requireAccepted(inspectMp3FirstFrame(stereo));
  assert.deepEqual(stereoHeader, {
    byteOffset: 0,
    mpegVersion: "1",
    layer: "III",
    sampleRate: 44100,
    channels: 2,
  });

  const withId3 = Uint8Array.from([
    0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 3,
    1, 2, 3,
    0xff, 0xe3, 0x48, 0xc0,
  ]);
  assert.deepEqual(requireAccepted(inspectMp3FirstFrame(withId3)), {
    byteOffset: 13,
    mpegVersion: "2.5",
    layer: "III",
    sampleRate: 8000,
    channels: 1,
  });

  for (const invalid of [
    new Uint8Array(),
    Uint8Array.from([0xff, 0xfb, 0x90]),
    Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 127]),
    Uint8Array.from([0xff, 0xfd, 0x90, 0x00]),
    Uint8Array.from([0xff, 0xfb, 0x00, 0x00]),
    Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]),
  ]) {
    const result = inspectMp3FirstFrame(invalid);
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.failure.code, "resource-decode");
      assert.equal(result.failure.capability, "simulator.audio.invalid-mp3-byte-structure");
    }
  }

  const metadata: AudioDecodedResourceMetadata = {
    codec: "mp3",
    sampleRate: 44100,
    channels: 2,
    sampleFrames: 88200,
    durationSeconds: 2,
  };
  let inspections = 0;
  const preflight = adapter(async () => {
    inspections += 1;
    return audioAccepted(metadata);
  });
  const derived = requireAccepted(await deriveSessionBgmResource(stereo, preflight));
  const expectedSha = createHash("sha256").update(Buffer.from(stereo)).digest("hex").toUpperCase();
  assert.equal(inspections, 1);
  assert.equal(derived.profile.sha256, expectedSha);
  assert.equal(derived.profile.cue, `session_bgm_${expectedSha}`);
  assert.equal(derived.profile.logicalId, `chart-bgm/${expectedSha}`);
  assert.equal(derived.profile.byteLength, stereo.byteLength);
  assert.equal(derived.profile.codec, "mp3");
  assert.equal(derived.profile.sampleFrames, 88200);
  assert.equal(derived.profile.durationSeconds, 2);
  assert.equal(Object.isFrozen(derived), true);
  assert.equal(Object.isFrozen(derived.profile), true);
  stereo.fill(0);
  assert.deepEqual([...derived.bytes.slice(0, 4)], [0xff, 0xfb, 0x90, 0x00]);

  const browserContext = new DerivationAudioContext();
  const browserPreflight = new BrowserAudioResourcePreflightAdapter(
    browserContext as unknown as AudioContext,
  );
  assert.equal((await deriveSessionBgmResource(derived.bytes, browserPreflight)).status, "accepted");
  assert.equal((await browserPreflight.inspect(derived.bytes)).status, "accepted");
  assert.equal(browserContext.decodeCount, 1);
  assert.equal(browserPreflight.getDecodedBuffer(derived.bytes).status, "accepted");

  const mismatch = await deriveSessionBgmResource(
    Uint8Array.from([0xff, 0xfb, 0x90, 0x00]),
    adapter(async () => audioAccepted({ ...metadata, channels: 1 })),
  );
  assert.equal(mismatch.status, "rejected");
  if (mismatch.status === "rejected") {
    assert.equal(mismatch.failure.capability, "simulator.audio.bgm-mp3-decoded-metadata-mismatch");
  }

  const durationMismatch = await deriveSessionBgmResource(
    Uint8Array.from([0xff, 0xfb, 0x90, 0x00]),
    adapter(async () => audioAccepted({ ...metadata, durationSeconds: 1.5 })),
  );
  assert.equal(durationMismatch.status, "rejected");
  if (durationMismatch.status === "rejected") {
    assert.equal(durationMismatch.failure.capability, "simulator.audio.bgm-decoded-duration-mismatch");
  }

  const thrown = await deriveSessionBgmResource(
    Uint8Array.from([0xff, 0xfb, 0x90, 0x00]),
    adapter(async () => { throw new Error("decode"); }),
  );
  assert.equal(thrown.status, "rejected");
  if (thrown.status === "rejected") {
    assert.equal(thrown.failure.capability, "simulator.audio.bgm-inspection-threw");
  }

  console.log("session BGM derivation tests passed: ID3/MP3 structure, decoded metadata, hash/cue, ownership, failures");
}

class DerivationAudioContext {
  readonly state = "running";
  decodeCount = 0;

  async decodeAudioData(): Promise<unknown> {
    this.decodeCount += 1;
    return {
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 88200,
      duration: 2,
    };
  }
}

function adapter(
  inspect: AudioResourcePreflightAdapter["inspect"],
): AudioResourcePreflightAdapter {
  return {
    async sha256() { return audioAccepted(""); },
    inspect,
  };
}

function requireAccepted<T>(result: { readonly status: string; readonly value?: T; readonly failure?: { readonly capability: string } }): T {
  if (result.status !== "accepted") throw new Error(result.failure?.capability ?? result.status);
  return result.value as T;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
