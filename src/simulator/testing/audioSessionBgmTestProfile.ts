declare function require(name: string): any;
declare const process: any;

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import type {
  AudioResourceProfileSet,
  AudioSessionBgmResourceProfile,
} from "../backends/audioContracts";
import { createAudioSessionResourceProfile } from "./legacyCurrentAudioResourceManifest";

const contractPath = join(
  process.cwd(),
  "src", "simulator", "testing", "fixtures", "reverse-snapshots", "audio",
  "artifacts", "investigations", "audio-session-bgm-resource-contract-10-1-4",
  "audio_session_bgm_resource_contract.json",
);

export const AUDIO_SESSION_BGM_CONTRACT = Object.freeze(
  JSON.parse(readFileSync(contractPath, "utf8")),
) as any;

const regression = AUDIO_SESSION_BGM_CONTRACT.current_resource_partition.current_bgm_regression;

export const CURRENT_BGM_REGRESSION_RESOURCE: AudioSessionBgmResourceProfile = Object.freeze({
  role: "bgm",
  logicalId: regression.logical_id,
  cue: regression.cue,
  byteLength: regression.bytes,
  sha256: regression.sha256,
  mime: "audio/mpeg",
  codec: regression.codec,
  sampleRate: regression.sample_rate,
  channels: regression.channels,
  durationSeconds: regression.duration_seconds,
  sampleFrames: regression.current_sample_frames,
  loop: null,
  identity: "session-explicit",
  signal: "host-supplied-portable",
});

export const CURRENT_AUDIO_TEST_PROFILE: AudioResourceProfileSet =
  createAudioSessionResourceProfile(CURRENT_BGM_REGRESSION_RESOURCE);

export const ALTERNATIVE_SESSION_BGM_RESOURCE: AudioSessionBgmResourceProfile = Object.freeze({
  role: "bgm",
  logicalId: "host/session-bgm",
  cue: "host_session_cue",
  byteLength: 2048,
  sha256: "A".repeat(64),
  mime: "audio/mpeg",
  codec: "mp3",
  sampleRate: 32000,
  channels: 2,
  durationSeconds: 0.064,
  sampleFrames: 2048,
  loop: null,
  identity: "session-explicit",
  signal: "host-supplied-portable",
});

export const ALTERNATIVE_AUDIO_TEST_PROFILE: AudioResourceProfileSet =
  createAudioSessionResourceProfile(ALTERNATIVE_SESSION_BGM_RESOURCE);
