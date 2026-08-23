declare function require(name: string): any;
declare const process: any;
declare const Buffer: any;

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
import type {
  AudioCommand,
  AudioDecodedResourceMetadata,
  AudioResourcePreflightAdapter,
  AudioResourceProfile,
  AudioResourceProfileSet,
  AudioResourceProvider,
} from "../backends/audioContracts";
import { audioAccepted } from "../backends/audioValidation";
import { DeterministicOfflineAudioBackend } from "../backends/audio/offlineAudioBackend";
import { WebAudioSimulatorBackend } from "../backends/audio/webAudioBackend";
import { RecordingSimulatorAudioBackend } from "../backends/recordingAudioBackend";
import { AudioCommandProducer } from "../engine/audio/audioCommandProducer";
import { createAudioSessionResourceProfile } from "./legacyCurrentAudioResourceManifest";
import {
  ALTERNATIVE_AUDIO_TEST_PROFILE,
  ALTERNATIVE_SESSION_BGM_RESOURCE,
  AUDIO_SESSION_BGM_CONTRACT,
  CURRENT_AUDIO_TEST_PROFILE,
} from "./audioSessionBgmTestProfile";

interface OracleCase {
  readonly case_id: string;
  readonly name: string;
  readonly status: "confirmed-command-expected" | "excluded-current-route";
  readonly expected: {
    readonly outcome: string;
    readonly commands: readonly Record<string, unknown>[];
    readonly mutation: string;
    readonly reason?: string;
    readonly normalized_projection?: unknown;
  };
}

const fixtureRoot = join(
  process.cwd(),
  "src", "simulator", "testing", "fixtures", "reverse-snapshots", "audio",
  "artifacts", "investigations", "audio-10-1-4",
);
const oracle = JSON.parse(
  readFileSync(join(fixtureRoot, "audio_command_oracle.json"), "utf8"),
) as {
  readonly status: string;
  readonly summary: Record<string, unknown>;
  readonly cases: readonly OracleCase[];
  readonly blocking_findings: readonly unknown[];
};
const pcmOracle = JSON.parse(
  readFileSync(join(fixtureRoot, "audio_pcm_oracle.json"), "utf8"),
) as any;
const byId = new Map(oracle.cases.map((entry) => [entry.case_id, entry]));

const currentCapabilities = virtualCapabilities(CURRENT_AUDIO_TEST_PROFILE);
const virtualProvider = currentCapabilities.provider;
const virtualPreflight = currentCapabilities.preflight;

async function main(): Promise<void> {
  assert.equal(Array.isArray(oracle.cases) && oracle.cases.length > 0, true, "audio raw command cases exist; legacy closure status is ignored");
  assert.deepEqual(oracle.summary, {
    case_count: 39,
    confirmed_count: 34,
    excluded_count: 5,
    blocking_count: 0,
    blocking_case_ids: [],
  });
  assert.deepEqual(oracle.blocking_findings, []);
  assert.deepEqual(
    oracle.cases.filter((entry) => entry.status === "excluded-current-route").map((entry) => entry.case_id),
    ["AU-C14", "AU-C15", "AU-C16", "AU-C31", "AU-C38"],
  );

  await testSessionBgmContract();
  await testPrepareCases();
  await testCommandCases();
  await testLifecycleCases();
  await testStartupAudioCallgraphCommands();
  await testDomainProducer();
  testProductionDigestCase();
  testPcmCase();
  console.log("audio C01-C40 tests passed: 34 confirmed + 5 excluded + fixed PCM");
}

async function testSessionBgmContract(): Promise<void> {
  assert.equal(AUDIO_SESSION_BGM_CONTRACT.case_count, 6);
  assert.deepEqual(
    AUDIO_SESSION_BGM_CONTRACT.cases.map((entry: any) => entry.id),
    ["BG-C01", "BG-C02", "BG-C03", "BG-C04", "BG-C05", "BG-C06"],
  );

  assert.equal(CURRENT_AUDIO_TEST_PROFILE.profileId, "session-external-portable-v1");
  assert.equal(CURRENT_AUDIO_TEST_PROFILE.resources.filter((resource) => resource.role === "bgm").length, 1);
  assert.equal(CURRENT_AUDIO_TEST_PROFILE.resources.filter((resource) => resource.role === "se").length, 15);
  assert.deepEqual(
    CURRENT_AUDIO_TEST_PROFILE.resources.find((resource) => resource.cue === "SE_RHYTHM_GAYA"),
    {
      role: "se",
      logicalId: "sound/common",
      cue: "SE_RHYTHM_GAYA",
      byteLength: 151033,
      sha256: "00DCFC839A945401863304FB64ED0407696E618F9BB5C7CFAF5810EB72C77554",
      mime: "audio/mpeg",
      codec: "mp3",
      sampleRate: 44100,
      channels: 2,
      durationSeconds: 7.03381,
      sampleFrames: 310191,
      loop: { start: 0, end: 310191 },
      identity: "semantic-exact",
      signal: "portable-equivalent-lossy",
    },
  );

  const alternativeCapabilities = virtualCapabilities(ALTERNATIVE_AUDIO_TEST_PROFILE);
  const alternative = new RecordingSimulatorAudioBackend();
  assert.equal((await alternative.prepare(
    "alternative-session",
    ALTERNATIVE_AUDIO_TEST_PROFILE,
    alternativeCapabilities.provider,
    alternativeCapabilities.preflight,
  )).status, "accepted");
  assert.equal(alternative.snapshot().preparedBgmCue, ALTERNATIVE_SESSION_BGM_RESOURCE.cue);
  const producer = new AudioCommandProducer({
    sessionId: "alternative-session",
    bgmCue: ALTERNATIVE_SESSION_BGM_RESOURCE.cue,
    seekMilliseconds: 0,
    masterGainBits: "0x3F800000",
    bgmGainBits: "0x3F800000",
    seGainBits: "0x3F800000",
  }, alternative, { noteBatches: [] } as any);
  const initialized = producer.preflightInitialize();
  assert.equal(initialized.status, "ok");
  if (initialized.status !== "ok") throw new Error(initialized.capability);
  assert.equal(initialized.value.commit().status, "ok");
  assert.equal(requireOk(producer.preflightStartBgm()).commit().status, "ok");
  const dynamicLoad = alternative.snapshot().commands.find((command) => command.kind === "bgm.load");
  assert.equal(dynamicLoad?.kind === "bgm.load" ? dynamicLoad.cue : null,
    ALTERNATIVE_SESSION_BGM_RESOURCE.cue);

  const mismatch = new AudioCommandProducer({
    ...producer.input,
    bgmCue: "foreign-session-cue",
  }, alternative, { noteBatches: [] } as any);
  assert.equal(mismatch.validate().status, "integrity-failure");
  assert.equal(alternative.dispose().status, "accepted");

  const missingBgm = cloneProfile(ALTERNATIVE_AUDIO_TEST_PROFILE);
  missingBgm.resources = missingBgm.resources.filter((resource: any) => resource.role !== "bgm");
  const missingBackend = new RecordingSimulatorAudioBackend();
  assert.equal((await missingBackend.prepare(
    "missing-bgm", missingBgm, alternativeCapabilities.provider, alternativeCapabilities.preflight,
  )).status, "integrity-failure");

  const duplicateBgm = cloneProfile(ALTERNATIVE_AUDIO_TEST_PROFILE);
  const duplicateBgmIndex = duplicateBgm.resources.findIndex((resource: any) => resource.cue === "perfect");
  duplicateBgm.resources[duplicateBgmIndex] = { ...duplicateBgm.resources[0] };
  const duplicateBackend = new RecordingSimulatorAudioBackend();
  assert.equal((await duplicateBackend.prepare(
    "duplicate-bgm", duplicateBgm, alternativeCapabilities.provider, alternativeCapabilities.preflight,
  )).status, "integrity-failure");

  const aliasedBgm = cloneProfile(ALTERNATIVE_AUDIO_TEST_PROFILE);
  aliasedBgm.resources[0].logicalId = "sound/common";
  const aliasBackend = new RecordingSimulatorAudioBackend();
  assert.equal((await aliasBackend.prepare(
    "aliased-bgm", aliasedBgm, alternativeCapabilities.provider, alternativeCapabilities.preflight,
  )).status, "integrity-failure");

  const shortProvider: AudioResourceProvider = {
    async read(resource) {
      const result = await alternativeCapabilities.provider.read(resource);
      return result.status === "accepted" && resource.role === "bgm"
        ? audioAccepted(result.value.slice(0, -1))
        : result;
    },
  };
  const integrityBackend = new RecordingSimulatorAudioBackend();
  assert.equal((await integrityBackend.prepare(
    "integrity-bgm", ALTERNATIVE_AUDIO_TEST_PROFILE, shortProvider, alternativeCapabilities.preflight,
  )).status, "audio-resource-integrity");
  assert.equal(integrityBackend.snapshot().state, "unprepared");
  console.log("audio BG-C01-C06 candidate path passed: current regression + non-bgm003 + mismatch/alias/integrity (legacy authorization ignored)");
}

async function testPrepareCases(): Promise<void> {
  const valid = new RecordingSimulatorAudioBackend();
  assert.equal((await valid.prepare(
    "audio-session",
    CURRENT_AUDIO_TEST_PROFILE,
    virtualProvider,
    virtualPreflight,
  )).status, expected("AU-C01").outcome);
  assert.equal(valid.snapshot().resourceCount, 16);
  assert.equal(valid.snapshot().state, "ready");
  assert.equal(valid.snapshot().preparedBgmCue, CURRENT_AUDIO_TEST_PROFILE.resources[0]!.cue);
  assert.ok(Object.isFrozen(valid.snapshot()));
  assert.ok(Object.isFrozen(valid.snapshot().commands));

  const missing = new RecordingSimulatorAudioBackend();
  assert.equal((await missing.prepare(
    "audio-session",
    CURRENT_AUDIO_TEST_PROFILE,
    null as unknown as AudioResourceProvider,
    virtualPreflight,
  )).status, expected("AU-C02").outcome);
  assert.equal(missing.snapshot().state, "unprepared");

  const perfectLength = CURRENT_AUDIO_TEST_PROFILE.resources.find(
    (resource) => resource.cue === "perfect",
  )!.byteLength;
  const integrityPreflight: AudioResourcePreflightAdapter = {
    ...virtualPreflight,
    async sha256(bytes) {
      return bytes.byteLength === perfectLength
        ? audioAccepted("0".repeat(64))
        : virtualPreflight.sha256(bytes);
    },
  };
  const integrity = new RecordingSimulatorAudioBackend();
  assert.equal((await integrity.prepare(
    "audio-session",
    CURRENT_AUDIO_TEST_PROFILE,
    virtualProvider,
    integrityPreflight,
  )).status, expected("AU-C03").outcome);
  assert.equal(integrity.snapshot().state, "unprepared");
  assert.equal(integrity.snapshot().resourceCount, 0);

  const duplicate = cloneProfile(CURRENT_AUDIO_TEST_PROFILE);
  const duplicateIndex = duplicate.resources.findIndex((resource: any) => resource.cue === "perfect");
  duplicate.resources[duplicateIndex] = { ...duplicate.resources[0]! };
  const duplicateBackend = new RecordingSimulatorAudioBackend();
  assert.equal((await duplicateBackend.prepare(
    "audio-session",
    duplicate,
    virtualProvider,
    virtualPreflight,
  )).status, expected("AU-C04").outcome);
  assert.equal(duplicateBackend.snapshot().state, "unprepared");

  const opened = await readyBackend();
  runCommands(opened, expectedCommands("AU-C05"));
}

async function testCommandCases(): Promise<void> {
  const executable = [
    "AU-C06", "AU-C07", "AU-C08", "AU-C09", "AU-C11", "AU-C12", "AU-C13",
    "AU-C17", "AU-C18", "AU-C19", "AU-C20", "AU-C21", "AU-C22", "AU-C23",
    "AU-C24", "AU-C25", "AU-C26", "AU-C27", "AU-C28", "AU-C34",
  ];
  for (const caseId of executable) {
    const backend = await readyOpenBackend();
    seed(backend, caseId);
    const before = backend.snapshot().commands.length;
    runCommands(backend, expectedCommands(caseId));
    assert.deepEqual(
      backend.snapshot().commands.slice(before),
      expectedCommands(caseId),
      caseId,
    );
  }

  const natural = await readyOpenBackend();
  const chart = { noteBatches: [] } as any;
  const producer = new AudioCommandProducer({
    sessionId: "audio-session",
    bgmCue: "bgm003",
    seekMilliseconds: 0,
    masterGainBits: "0x3F800000",
    bgmGainBits: "0x3F800000",
    seGainBits: "0x3F800000",
  }, natural, chart);
  runCommands(natural, [{
    kind: "bgm.load", cue: "bgm003", seek_ms: 0, priority: 255,
    fade_bits: "0x00000000",
  }]);
  const beforeNatural = natural.snapshot().commands.length;
  assert.equal(requireOk(producer.pollBgmNaturalEnd()), false);
  assert.equal(natural.notifyBgmNaturalEnd().status, "accepted");
  assert.equal(requireOk(producer.pollBgmNaturalEnd()), true);
  assert.equal(requireOk(producer.preflightNaturalEnd()).commit().status, "ok");
  assert.equal(expected("AU-C10").outcome, "accepted");
  assert.equal(natural.snapshot().commands.length, beforeNatural);

  for (const caseId of ["AU-C14", "AU-C15", "AU-C16", "AU-C31", "AU-C38"]) {
    const row = byId.get(caseId)!;
    assert.equal(row.status, "excluded-current-route");
    assert.deepEqual(row.expected.commands, []);
    assert.ok((row.expected.reason?.length ?? 0) > 0);
  }
}

async function testLifecycleCases(): Promise<void> {
  const atomic = await readyOpenBackend();
  const before = atomic.snapshot();
  const invalid = atomic.preflight([
    oneShot("perfect", "one-shot-0"),
    { kind: "unknown" } as unknown as AudioCommand,
  ]);
  assert.equal(invalid.status, expected("AU-C35").outcome);
  assert.equal(atomic.snapshot().nextSequence, before.nextSequence);
  assert.deepEqual(atomic.snapshot().commands, before.commands);
  assert.deepEqual(atomic.snapshot().semantic, before.semantic);

  const faulted = await readyBackend();
  const first = faulted.recordTerminalFault("sync-first", "first boundary");
  assert.equal(first.status, expected("AU-C36").outcome);
  const second = faulted.recordTerminalFault("later", "must not replace");
  assert.equal(second.status, "audio-backend-fault");
  assert.equal(faulted.snapshot().fault?.capability, "sync-first");
  assert.equal(faulted.preflight([{ kind: "unknown" } as unknown as AudioCommand]).status,
    "audio-backend-fault");
  assert.equal(faulted.dispose().status, "accepted");
  assert.equal(faulted.snapshot().state, "disposed");
  assert.equal(faulted.snapshot().fault?.capability, "sync-first");
  assert.equal(faulted.execute({ kind: "unknown" } as unknown as AudioCommand).status,
    "terminal-disposed");

  const suspendedContext = { state: "suspended" } as unknown as AudioContext;
  const web = new WebAudioSimulatorBackend(suspendedContext);
  assert.equal((await web.prepare(
    "audio-session",
    CURRENT_AUDIO_TEST_PROFILE,
    virtualProvider,
    virtualPreflight,
  )).status, expected("AU-C37").outcome);
  assert.equal(web.snapshot().state, "unprepared");

  const disposed = await readyBackend();
  assert.equal(disposed.dispose().status, "accepted");
  assert.equal(disposed.dispose().status, "terminal-disposed");
  assert.equal(disposed.preflight([]).status, "terminal-disposed");
}

async function testDomainProducer(): Promise<void> {
  const backend = await readyBackend();
  const notes = [
    { index: 1, fireNoteType: 0, slideNoteList: [] },
    { index: 2, fireNoteType: 1, slideNoteList: [] },
    { index: 3, fireNoteType: 3, slideNoteList: [] },
    { index: 4, fireNoteType: 5, slideNoteList: [] },
  ] as any;
  const producer = new AudioCommandProducer({
    sessionId: "audio-session",
    bgmCue: "bgm003",
    seekMilliseconds: 1234,
    masterGainBits: "0x3F000000",
    bgmGainBits: "0x3F000000",
    seGainBits: "0x3F800000",
  }, backend, { noteBatches: [{ informationList: notes }] } as any);
  assert.equal(producer.validate().status, "ok");
  assert.equal(requireOk(producer.preflightInitialize()).commit().status, "ok");
  assert.equal(backend.snapshot().semantic.bgmCue, null);
  assert.equal(requireOk(producer.preflightStartBgm()).commit().status, "ok");
  assert.deepEqual(backend.snapshot().commands.slice(0, 3), [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    { kind: "gain.set", bgm_bits: "0x3E800000", se_bits: "0x3F000000" },
    { kind: "bgm.load", cue: "bgm003", seek_ms: 1234, priority: 255, fade_bits: "0x00000000" },
  ]);

  const judgementStart = backend.snapshot().commands.length;
  assert.equal(requireOk(producer.preflightJudgement({
    batchIndex: 0,
    entries: [
      judgementEntry(0, 1, 0, 4, 100, 0, "head"),
      judgementEntry(1, 1, 0, 4, 100, 0, "head"),
      judgementEntry(2, 4, 10, 4, 101, 2, "head"),
    ],
    entryCount: 3,
    addCombo: 3,
    rawResult: 4,
    adjustedResult: 4,
    judgeTiming: 0,
  })).commit().status, "ok");
  assert.deepEqual(backend.snapshot().commands.slice(judgementStart).map((command: AudioCommand) =>
    command.kind === "se.play-one-shot" ? command.cue : command.kind), [
      "perfect", "directional_fl_2",
    ]);

  const longStart = backend.snapshot().commands.length;
  assert.equal(requireOk(producer.preflightJudgement(singleBatch(
    judgementEntry(0, 2, 1, 4, 102, 0, "head"),
  ))).commit().status, "ok");
  assert.deepEqual(backend.snapshot().commands.slice(longStart).map((command: AudioCommand) => command.kind), [
    "hold.start-loop", "se.play-one-shot",
  ]);
  const paused = requireOk(producer.preflightPause());
  assert.equal(paused.commit().status, "ok");
  assert.deepEqual(backend.snapshot().commands.slice(-3).map((command: AudioCommand) => command.kind), [
    "bgm.pause", "se.pause", "hold.pause",
  ]);
  assert.equal(requireOk(producer.preflightResume()).commit().status, "ok");
  assert.deepEqual(backend.snapshot().commands.slice(-3).map((command: AudioCommand) => command.kind), [
    "bgm.resume", "se.resume", "hold.resume",
  ]);
  const longTail = backend.snapshot().commands.length;
  assert.equal(requireOk(producer.preflightJudgement(singleBatch(
    judgementEntry(0, 2, 1, 4, 103, 0, "tail"),
  ))).commit().status, "ok");
  assert.deepEqual(backend.snapshot().commands.slice(longTail).map((command: AudioCommand) => command.kind), [
    "hold.fade", "se.play-one-shot",
  ]);

  assert.equal(requireOk(producer.preflightCompleteLive(2)).commit().status, "ok");
  assert.deepEqual(backend.snapshot().commands.slice(-2).map((command: any) => command.cue), [
    "SE_RHYTHM_FULLCOMBO", "SE_RHYTHM_CLEAR",
  ]);
}

function testProductionDigestCase(): void {
  const projection = expected("AU-C39").normalized_projection as any;
  assert.equal(projection.ordinary.normalized_command_count, 1277);
  assert.equal(
    projection.ordinary.normalized_command_sha256,
    "25DA5C28B66E3B1AFD361657854639908A97614645B0930B81618666565BE9A1",
  );
  assert.equal(projection.habahiro.normalized_command_count, 713);
  assert.equal(
    projection.habahiro.normalized_command_sha256,
    "903C36F0617E566B88A7900CB4B4836E04CB4655CC6C9D45A51525D78F1E66FE",
  );
  assert.deepEqual(projection.normalization_excludes, [
    "trace sequence", "runtime alias", "pointer", "wall clock", "audio bytes",
  ]);
}

function testPcmCase(): void {
  const inputBytes = readFileSync(join(fixtureRoot, "synthetic-mono-f32le.bin"));
  const samples = new Float32Array(8);
  const inputView = new DataView(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = inputView.getFloat32(index * 4, true);
  }
  const mix = pcmOracle.case.input.mix;
  const rendered = new DeterministicOfflineAudioBackend().render({
    sampleRate: 8000,
    outputFrames: mix.output_frames,
    sources: [{
      sourceId: "synthetic",
      sampleRate: 8000,
      channels: 1,
      frameCount: 8,
      samples,
    }],
    voices: [
      {
        sourceId: "synthetic",
        startFrame: mix.voice_a.start_frame,
        gainBits: mix.voice_a.gain_bits,
        loop: {
          startFrame: mix.voice_a.loop[0],
          endFrame: mix.voice_a.loop[1],
        },
        fade: null,
      },
      {
        sourceId: "synthetic",
        startFrame: mix.voice_b.start_frame,
        gainBits: mix.voice_b.gain_bits,
        loop: {
          startFrame: mix.voice_b.loop[0],
          endFrame: mix.voice_b.loop[1],
        },
        fade: {
          startFrame: mix.voice_b.fade_start_frame,
          durationBits: mix.voice_b.fade_duration_bits,
          targetBits: mix.voice_b.fade_target_bits,
          stopAtZero: mix.voice_b.stop_at_zero,
        },
      },
    ],
  });
  assert.equal(rendered.status, pcmOracle.case.expected.outcome);
  const value = requireAccepted(rendered);
  const expectedBytes = readFileSync(
    join(fixtureRoot, "portable-mix-expected-f32le-stereo.bin"),
  );
  assert.equal(value.sampleFormat, pcmOracle.case.expected.sample_format);
  assert.equal(value.sampleRate, pcmOracle.case.expected.sample_rate);
  assert.equal(value.channelCount, pcmOracle.case.expected.channel_count);
  assert.equal(value.frameCount, pcmOracle.case.expected.frame_count);
  assert.equal(value.bytes.byteLength, pcmOracle.case.expected.byte_length);
  assert.deepEqual(Buffer.from(value.bytes), expectedBytes);
  assert.equal(
    createHash("sha256").update(value.bytes).digest("hex").toUpperCase(),
    pcmOracle.case.expected.pcm_sha256,
  );
  const view = new DataView(value.bytes.buffer, value.bytes.byteOffset, value.bytes.byteLength);
  for (const [frame, bits] of Object.entries(pcmOracle.case.expected.anchors) as [string, string[]][]) {
    const offset = Number(frame) * 8;
    assert.equal(hex(view.getUint32(offset, true)), bits[0]);
    assert.equal(hex(view.getUint32(offset + 4, true)), bits[1]);
  }
  const gayaEnvelope = requireAccepted(new DeterministicOfflineAudioBackend().render({
    sampleRate: 4,
    outputFrames: 8,
    sources: [{
      sourceId: "startup-gaya",
      sampleRate: 4,
      channels: 1,
      frameCount: 2,
      samples: new Float32Array([1, 1]),
    }],
    voices: [{
      sourceId: "startup-gaya",
      startFrame: 0,
      gainBits: "0x3F800000",
      loop: { startFrame: 0, endFrame: 2 },
      fade: {
        startFrame: 4,
        durationBits: "0x3F000000",
        targetBits: "0x00000000",
        stopAtZero: true,
      },
    }],
  }));
  const gayaView = new DataView(
    gayaEnvelope.bytes.buffer,
    gayaEnvelope.bytes.byteOffset,
    gayaEnvelope.bytes.byteLength,
  );
  assert.deepEqual(
    Array.from({ length: 8 }, (_, frame) => gayaView.getFloat32(frame * 8, true)),
    [1, 1, 1, 1, 1, 0.5, 0, 0],
  );

  assert.equal(new DeterministicOfflineAudioBackend().render({
    sampleRate: 44100,
    outputFrames: 1,
    sources: [{ sourceId: "x", sampleRate: 8000, channels: 1, frameCount: 1, samples: new Float32Array([0]) }],
    voices: [{ sourceId: "x", startFrame: 0, gainBits: "0x3F800000", loop: null, fade: null }],
  }).status, "integrity-failure");
}

async function testStartupAudioCallgraphCommands(): Promise<void> {
  const backend = await readyBackend();
  const producer = new AudioCommandProducer({
    sessionId: "audio-session",
    bgmCue: CURRENT_AUDIO_TEST_PROFILE.resources.find((resource) => resource.role === "bgm")!.cue,
    seekMilliseconds: 0,
    masterGainBits: "0x3F800000",
    bgmGainBits: "0x3F800000",
    seGainBits: "0x3F000000",
  }, backend, { noteBatches: [] } as any);
  assert.equal(requireOk(producer.preflightInitialize()).commit().status, "ok");
  assert.equal(requireOk(producer.preflightPrepareStartupBgm()).commit().status, "ok");
  assert.equal(backend.snapshot().semantic.bgmPaused, true);
  assert.deepEqual(
    backend.snapshot().commands.slice(-2).map((command) => command.kind),
    ["bgm.load", "bgm.pause"],
  );

  assert.equal(requireOk(producer.preflightStartStartupGaya("startup:gaya")).commit().status, "ok");
  assert.deepEqual(backend.snapshot().semantic.startupLoops, [{
    ownerKey: "startup:gaya",
    cue: "SE_RHYTHM_GAYA",
    paused: false,
  }]);
  assert.equal(producer.preflightStartStartupGaya("startup:gaya").status, "integrity-failure");
  assert.equal(requireOk(producer.preflightPlayPreparedStartupBgm()).commit().status, "ok");
  assert.equal(backend.snapshot().semantic.bgmPaused, false);
  assert.equal(requireOk(producer.preflightPause()).commit().status, "ok");
  assert.equal(backend.snapshot().semantic.startupLoops[0]?.paused, true);
  assert.equal(requireOk(producer.preflightResume()).commit().status, "ok");
  assert.equal(backend.snapshot().semantic.startupLoops[0]?.paused, false);
  assert.equal(requireOk(producer.preflightFadeStartupGaya("startup:gaya")).commit().status, "ok");
  assert.deepEqual(backend.snapshot().semantic.startupLoops, []);
  assert.equal(producer.preflightFadeStartupGaya("startup:gaya").status, "integrity-failure");
  assert.equal(backend.dispose().status, "accepted");

  const voiceSha = "B".repeat(64);
  const voiceCue = `session_live_start_voice_${voiceSha}`;
  const voiceProfile = createAudioSessionResourceProfile(
    CURRENT_AUDIO_TEST_PROFILE.resources.find((resource) => resource.role === "bgm")! as any,
    Object.freeze({
      role: "voice" as const,
      logicalId: `startup/session/live-start-voice/${voiceSha}`,
      cue: voiceCue,
      byteLength: 4097,
      sha256: voiceSha,
      mime: "audio/mpeg" as const,
      codec: "mp3" as const,
      sampleRate: 44100,
      channels: 2 as const,
      durationSeconds: 1,
      sampleFrames: 44100,
      loop: null,
      identity: "session-explicit" as const,
      signal: "host-supplied-portable" as const,
    }),
  );
  const voiceCapabilities = virtualCapabilities(voiceProfile);
  const voiceBackend = new RecordingSimulatorAudioBackend();
  assert.equal((await voiceBackend.prepare(
    "voice-session",
    voiceProfile,
    voiceCapabilities.provider,
    voiceCapabilities.preflight,
  )).status, "accepted");
  const voiceProducer = new AudioCommandProducer({
    sessionId: "voice-session",
    bgmCue: voiceProfile.resources.find((resource) => resource.role === "bgm")!.cue,
    seekMilliseconds: 0,
    masterGainBits: "0x3F800000",
    bgmGainBits: "0x3F800000",
    seGainBits: "0x3F800000",
  }, voiceBackend, { noteBatches: [] } as any);
  assert.equal(requireOk(voiceProducer.preflightInitialize()).commit().status, "ok");
  assert.equal(requireOk(voiceProducer.preflightStartupOpening(true, voiceCue)).commit().status, "ok");
  assert.equal(requireOk(voiceProducer.preflightReleaseLiveStartVoice(voiceCue)).commit().status, "ok");
  assert.equal(voiceProducer.preflightReleaseLiveStartVoice("SE_RHYTHM_GAYA").status, "integrity-failure");
  const voiceCommands = voiceBackend.snapshot().commands;
  assert.equal(voiceCommands[voiceCommands.length - 1]?.kind, "voice.release-live-start");
  assert.equal(voiceBackend.dispose().status, "accepted");
}

async function readyBackend(): Promise<RecordingSimulatorAudioBackend> {
  const backend = new RecordingSimulatorAudioBackend();
  const result = await backend.prepare(
    "audio-session",
    CURRENT_AUDIO_TEST_PROFILE,
    virtualProvider,
    virtualPreflight,
  );
  assert.equal(result.status, "accepted");
  return backend;
}

async function readyOpenBackend(): Promise<RecordingSimulatorAudioBackend> {
  const backend = await readyBackend();
  runCommands(backend, expectedCommands("AU-C05"));
  return backend;
}

function seed(backend: RecordingSimulatorAudioBackend, caseId: string): void {
  if (["AU-C08", "AU-C09", "AU-C28"].includes(caseId)) {
    runCommands(backend, [{
      kind: "bgm.load", cue: "bgm003", seek_ms: 0, priority: 255,
      fade_bits: "0x00000000",
    }]);
  }
  if (["AU-C08", "AU-C09", "AU-C22", "AU-C23", "AU-C24", "AU-C28"].includes(caseId)) {
    runCommands(backend, [{
      kind: "hold.start-loop", cue: "SE_RHYTHM_TAP_LONG", owner_key: "long-a",
      volume_bits: "0x3F800000", fade_in_bits: "0x00000000",
    }]);
  }
  if (["AU-C26", "AU-C27"].includes(caseId)) {
    runCommands(backend, [{
      kind: "hold.start-loop", cue: "SE_RHYTHM_TAP_LONG", owner_key: "slide-a",
      volume_bits: "0x3F800000", fade_in_bits: "0x00000000",
    }]);
  }
  if (caseId === "AU-C09") {
    runCommands(backend, [
      { kind: "bgm.pause" },
      { kind: "se.pause" },
      { kind: "hold.pause", owner_key: "long-a" },
    ]);
  }
}

function runCommands(
  backend: RecordingSimulatorAudioBackend,
  commands: readonly AudioCommand[],
): void {
  const batch = backend.preflight(commands);
  assert.equal(batch.status, "accepted");
  assert.equal(backend.commit(requireAccepted(batch)).status, "accepted");
}

function expected(caseId: string): OracleCase["expected"] {
  const value = byId.get(caseId)!.expected;
  return value.outcome === "evidence-required"
    ? { ...value, outcome: "integrity-failure" }
    : value;
}

function expectedCommands(caseId: string): readonly AudioCommand[] {
  return expected(caseId).commands as unknown as readonly AudioCommand[];
}

function oneShot(cue: string, voiceKey: string): AudioCommand {
  return {
    kind: "se.play-one-shot",
    cue,
    voice_key: voiceKey,
    volume_bits: "0x3F800000",
    pitch_bits: "0x00000000",
    pan_distance_bits: "0x00000000",
    pan_angle_bits: "0x00000000",
  };
}

function judgementEntry(
  slot: number,
  noteIndex: number,
  noteType: number,
  result: 0 | 1 | 2 | 3 | 4,
  absolutePosition: number,
  multipleCount: number,
  phase: "head" | "intermediate" | "tail",
): any {
  return Object.freeze({
    slot,
    containerId: `audio-test:${slot}`,
    noteIndex,
    buttonTypes: Object.freeze([1]),
    noteType,
    phase,
    rawResult: result,
    adjustedResult: result,
    addCombo: result >= 3 ? 1 : -1,
    absolutePosition,
    judgeTiming: 0,
    multipleDirectionalFlickNoteCount: multipleCount,
  });
}

function singleBatch(entry: any): any {
  return Object.freeze({
    batchIndex: 0,
    entries: Object.freeze([entry]),
    entryCount: 1,
    addCombo: entry.addCombo,
    rawResult: entry.rawResult,
    adjustedResult: entry.adjustedResult,
    judgeTiming: entry.judgeTiming,
  });
}

function virtualCapabilities(profile: AudioResourceProfileSet): {
  readonly provider: AudioResourceProvider;
  readonly preflight: AudioResourcePreflightAdapter;
} {
  const bytesByKey = new Map<string, Uint8Array>();
  const hashByLength = new Map<number, string>();
  const profileByLength = new Map<number, AudioResourceProfile>();
  for (let index = 0; index < profile.resources.length; index += 1) {
    const resource = profile.resources[index]!;
    const bytes = new Uint8Array(resource.byteLength);
    bytes[0] = (index + 1) & 0xff;
    bytesByKey.set(`${resource.logicalId}\u0000${resource.cue}`, bytes);
    hashByLength.set(resource.byteLength, resource.sha256);
    profileByLength.set(resource.byteLength, resource);
  }
  return {
    provider: {
      async read(resource) {
        const bytes = bytesByKey.get(`${resource.logicalId}\u0000${resource.cue}`);
        return bytes === undefined
          ? ({
              status: "audio-resource-unavailable",
              failure: {
                code: "audio-resource-unavailable",
                capability: "test.virtual.missing",
                boundary: "missing virtual bytes",
              },
            } as const)
          : audioAccepted(bytes);
      },
    },
    preflight: {
      async sha256(bytes) {
        return audioAccepted(hashByLength.get(bytes.byteLength) ?? "");
      },
      async inspect(bytes) {
        const resource = profileByLength.get(bytes.byteLength)!;
        return audioAccepted<AudioDecodedResourceMetadata>({
          codec: resource.codec,
          sampleRate: resource.sampleRate,
          channels: resource.channels,
          durationSeconds: resource.durationSeconds,
          sampleFrames: resource.sampleFrames,
        });
      },
    },
  };
}

function cloneProfile(profile: AudioResourceProfileSet): any {
  return {
    ...profile,
    sample: { ...profile.sample },
    pools: { ...profile.pools },
    resources: profile.resources.map((resource: AudioResourceProfile) => ({
      ...resource,
      loop: resource.loop === null ? null : { ...resource.loop },
    })),
  };
}

function requireAccepted<T>(result: { status: string; value?: T }): T {
  assert.equal(result.status, "accepted");
  return result.value as T;
}

function requireOk<T>(result: { status: string; value?: T }): T {
  assert.equal(result.status, "ok");
  return result.value as T;
}

function hex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
