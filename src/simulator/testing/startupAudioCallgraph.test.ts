declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { CURRENT_AUDIO_SE_RESOURCES } from "../backends/resources/currentAudioResourceManifest";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { StartupAudioOwner } from "../engine/audio/startupAudioOwner";
import { evidenceRequired } from "../engine/evidence";

const fixtureRoot = join(
  process.cwd(),
  "src", "simulator", "testing", "fixtures", "reverse-snapshots", "startup-audio",
  "artifacts", "investigations", "startup-audio-callgraph-10-1-4",
);
const callgraph = JSON.parse(readFileSync(join(fixtureRoot, "startup_audio_callgraph.json"), "utf8")) as any;
const gayaBytes = new Uint8Array(readFileSync(join(fixtureRoot, "portable-assets", "SE_RHYTHM_GAYA.mp3")));

function main(): void {
  verifyClosureAndCallgraph();
  verifyFourModePredicates();
  verifyGayaResource();
  verifyFaultLatching();
  console.log("startup audio callgraph tests passed: closure=0 four-mode predicates/resource/timeline/fault lifecycle");
}

function verifyClosureAndCallgraph(): void {
  assert.equal(callgraph.schema_version, 1);
  assert.equal(callgraph.status, "confirmed-current-four-mode-complete-startup-audio-portable-contract");
  assert.deepEqual(callgraph.sample, {
    package: "jp.co.craftegg.band",
    version_name: "10.1.4",
    version_code: 230,
    abi: "arm64-v8a",
    libil2cpp_bytes: 119816840,
    libil2cpp_sha256: "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F",
    script_json_sha256: "826C592717ED07974F8DCD435AF92B8DCE7A6406E0706AC43A85102FE8567D91",
    dump_cs_sha256: "4AC4ACC5981D0010B3D6A69482C37C1175339458246BC4A5878CF30F694E884B",
  });
  assert.deepEqual(callgraph.closure, {
    reachable_unclassified_count: 0,
    unknown_predicate_count: 0,
    missing_resource_count: 0,
    runtime_hook_failure_count: 0,
    rejected_trace_consumption: false,
    r2_used: false,
    fixed_device_speaker_exact: "open-not-claimed",
    mv_star3d_multi: "excluded-from-positive-scope",
    production_authorization: true,
  });
  assert.equal(callgraph.methods.length, 44);
  assert.equal(callgraph.runtime_traces.length, 10);
  assert.equal(callgraph.runtime_traces.every((trace: any) =>
    trace.status === "confirmed-r1-observation-only" && trace.hook_failure_count === 0), true);
  assert.equal(callgraph.callgraph.edges.every((edge: any) =>
    edge.disposition.startsWith("confirmed")), true);
  assert.equal(callgraph.callgraph.indirect_and_animation_inventory.every((row: any) =>
    row.status.startsWith("confirmed") || row.status.startsWith("excluded")), true);
  assert.deepEqual(callgraph.startup_timeline, [
    "BGM LoadMusic(0) creates PlayBGM at zero volume and immediately Pause(true)",
    "playGayaSound runs in all modes; Standard background plus not-Practice starts Gaya only in Live",
    "Gaya starts as an owned loop at caller volume 1.0 with 0.5-second fade-in",
    "Live requests and waits for optional live-start voice; Practice bypasses it",
    "Standard OnStartMusic/Stage StartAnimation is followed by the evidenced one-second wait",
    "fadeOutGayaSound fades from current effective resource volume to zero over 1.5 seconds and stops at zero",
    "PlayingNone(4) is published before MusicManager.PlayMusic unpauses prepared BGM; updatePlayingSound publishes PlayingSound(5)",
  ]);
}

function verifyFourModePredicates(): void {
  const expected = [
    ["live-manual", "live", "manual", true, true],
    ["live-auto", "live", "auto", true, true],
    ["rehearsal-manual", "rehearsal", "manual", false, false],
    ["rehearsal-auto", "rehearsal", "auto", false, false],
  ] as const;
  for (const [label, sessionMode, inputMode, gaya, voice] of expected) {
    const row = callgraph.mode_matrix[label];
    assert.equal(row.gaya_loop, gaya, `${label} fixture Gaya predicate`);
    assert.equal(row.live_voice, voice, `${label} fixture voice predicate`);
    const owner = new StartupAudioOwner(
      createSimulatorModeIdentity(sessionMode, inputMode),
      "initial",
      {} as any,
      `session_live_start_voice_${"A".repeat(64)}`,
    );
    const snapshot = owner.snapshot();
    assert.equal(snapshot.gayaRequired, gaya, `${label} implementation Gaya predicate`);
    assert.equal(snapshot.liveVoiceRequired, voice, `${label} implementation voice predicate`);
    assert.equal(snapshot.purpose, "initial");
    owner.dispose();
  }
  assert.deepEqual(callgraph.mode_matrix["live-manual"], {
    in_game_mode: 1, practice: false, demo: false, auto_live: false,
    gaya_loop: true, live_voice: true,
  });
  assert.deepEqual(callgraph.mode_matrix["live-auto"], {
    in_game_mode: 1, practice: false, demo: false, auto_live: true,
    gaya_loop: true, live_voice: true,
  });
  assert.deepEqual(callgraph.mode_matrix["rehearsal-manual"], {
    in_game_mode: 10, practice: true, demo: false, auto_live: false,
    gaya_loop: false, live_voice: false,
  });
  assert.deepEqual(callgraph.mode_matrix["rehearsal-auto"], {
    in_game_mode: 10, practice: true, demo: true, auto_live: false,
    gaya_loop: false, live_voice: false,
  });
}

function verifyGayaResource(): void {
  const fixture = callgraph.gaya_resource;
  const current = CURRENT_AUDIO_SE_RESOURCES.find((resource) => resource.cue === "SE_RHYTHM_GAYA");
  assert.notEqual(current, undefined);
  assert.equal(CURRENT_AUDIO_SE_RESOURCES.length, 15);
  assert.equal(fixture.logical_id, current!.logicalId);
  assert.equal(fixture.bytes, current!.byteLength);
  assert.equal(fixture.sha256, current!.sha256);
  assert.equal(fixture.portable.codec, current!.codec);
  assert.equal(fixture.portable.sample_rate, current!.sampleRate);
  assert.equal(fixture.portable.channels, current!.channels);
  assert.equal(fixture.portable.sample_frames, current!.sampleFrames);
  assert.deepEqual(current!.loop, {
    start: fixture.loop_mapping.start_frame,
    end: fixture.loop_mapping.end_frame,
  });
  assert.equal(gayaBytes.byteLength, fixture.bytes);
  assert.equal(
    createHash("sha256").update(gayaBytes).digest("hex").toUpperCase(),
    fixture.sha256,
  );
}

function verifyFaultLatching(): void {
  const failedOpening = new StartupAudioOwner(
    createSimulatorModeIdentity("live", "manual"),
    "initial",
    producerFailure("opening-preflight"),
    null,
  );
  assert.equal(failedOpening.initialize().status, "evidence-required");
  assert.equal(failedOpening.snapshot().phase, "faulted");
  failedOpening.dispose();
  failedOpening.dispose();
  assert.equal(failedOpening.snapshot().phase, "disposed");

  const failedPlaying = new StartupAudioOwner(
    createSimulatorModeIdentity("live", "auto"),
    "initial",
    producerFailure("playing-commit"),
    null,
  );
  assert.equal(failedPlaying.initialize().status, "ok");
  const transition = failedPlaying.preflightEnterPlaying();
  assert.equal(transition.status, "ok");
  if (transition.status !== "ok") throw new Error(transition.capability);
  assert.equal(transition.value.commit().status, "evidence-required");
  assert.equal(failedPlaying.snapshot().phase, "faulted");

  const voiceObserver = new StartupAudioOwner(
    createSimulatorModeIdentity("live", "manual"),
    "initial",
    producerFailure("voice-observer"),
    `session_live_start_voice_${"C".repeat(64)}`,
  );
  assert.equal(voiceObserver.initialize().status, "ok");
  assert.equal(voiceObserver.isLiveStartVoicePlaying().status, "evidence-required");
  assert.equal(voiceObserver.snapshot().phase, "opening");
}

function producerFailure(point: "opening-preflight" | "playing-commit" | "voice-observer"): any {
  const transaction = (failure: boolean) => ({
    commit() {
      return failure
        ? evidenceRequired("startup-audio.test-injected", ["SRA-CG01"], "injected first fault")
        : { status: "ok" as const, value: undefined };
    },
    discard() { return { status: "ok" as const, value: undefined }; },
  });
  return {
    preflightStartupOpening() {
      return point === "opening-preflight"
        ? evidenceRequired("startup-audio.test-opening", ["SRA-CG01"], "injected opening fault")
        : { status: "ok" as const, value: transaction(false) };
    },
    preflightMoveTimeReconstructionBgm() {
      return { status: "ok" as const, value: transaction(false) };
    },
    preflightEnterStartupPlaying() {
      return { status: "ok" as const, value: transaction(point === "playing-commit") };
    },
    isLiveStartVoicePlaying() {
      return point === "voice-observer"
        ? evidenceRequired("startup-audio.test-voice", ["SRA-CG01"], "injected observer fault")
        : { status: "ok" as const, value: false };
    },
  };
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
