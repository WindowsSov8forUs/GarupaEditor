import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { RecordingSimulatorMovieBackend } from "../backends/recordingMovieBackend";
import type { PreparedSessionMovieResource } from "../backends/movieContracts";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { GameState } from "../engine/data/inGameState";
import { StartupDirectionController } from "../engine/managers/startupDirectionController";
import { InGameMovieManager, InGameMusicVideoState } from "../engine/movie/inGameMovieManager";
import { MvBackgroundModule } from "../engine/movie/mvBackgroundModule";
import { RecordingStartupDirectionBackend } from "../backends/recordingStartupDirectionBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { createSimulatorEngine } from "../host/createSimulatorEngine";

async function main(): Promise<void> {
  testEvidenceClosure();
  await testNegativeDelayAndPause();
  await testZeroAndPositiveDelay();
  await testHostBinding();
  console.log("MV Live engine contracts passed: state17, signed delay branches, gameplay-before-negative-movie, Gaya exclusion and movie pause map");
}

function testEvidenceClosure(): void {
  const root = join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/mv-live/artifacts/investigations",
  );
  const contract = JSON.parse(readFileSync(join(
    root,
    "mv-live-runtime-contract-10-1-4/mv_live_runtime_contract.json",
  ), "utf8"));
  const oracle = JSON.parse(readFileSync(join(
    root,
    "mv-live-runtime-contract-10-1-4/mv_live_command_oracle.json",
  ), "utf8"));
  const closure = JSON.parse(readFileSync(join(
    root,
    "mv-live-runtime-contract-10-1-4/mv_live_closure.json",
  ), "utf8"));
  assert.equal(contract.status, "confirmed-current-live-manual-auto-mv-portable-contract");
  assert.deepEqual(contract.master_delay_inventory.sign_counts, { negative: 95, zero: 0, positive: 3 });
  assert.equal(contract.master_delay_inventory.selected_runtime_row.delay_milliseconds, -2180);
  assert.deepEqual(oracle.supported_public_matrix, {
    "live-manual": "mv-live-supported",
    "live-auto": "mv-live-supported",
    "rehearsal-manual": "evidence-required-Practice-does-not-select-Simple-display",
    "rehearsal-auto": "evidence-required-Practice-does-not-select-Simple-display",
  });
  assert.equal(oracle.delay_branches.negative[4].gameplay, "enabled-before-movie");
  assert.equal(oracle.replay.retry, "excluded-MV-Live-has-no-Rehearsal-retry-route");
  for (const field of [
    "reachable_unclassified_count", "unknown_mode_predicate_count",
    "unknown_delay_branch_count", "missing_runtime_route_count",
    "missing_lifecycle_edge_count", "missing_resource_or_media_profile_count",
    "portable_mapping_gap_count", "runtime_hook_failure_count",
  ]) assert.equal(closure[field], 0, field);
  assert.equal(closure.production_authorization, true);
}

async function testNegativeDelayAndPause(): Promise<void> {
  const built = await controller(-2180);
  const { owner, backend, gayaRequests } = built;
  requireOk(owner.initialize());
  assert.equal(owner.snapshot().audio?.gayaRequired, false);
  assert.deepEqual(gayaRequests, [false]);
  const observed: number[] = [owner.snapshot().currentGameState];
  const delta = Math.fround(0.1);
  for (let frame = 0; frame < 100 && !owner.snapshot().playable; frame += 1) {
    requireOk(owner.step(delta));
    const state = owner.snapshot().currentGameState;
    if (observed[observed.length - 1] !== state) observed.push(state);
  }
  assert.deepEqual(observed, [0, 1, 2, 3, 17, 4, 5]);
  assert.equal(owner.snapshot().playable, true);
  assert.equal(owner.snapshot().movie?.manager.state, InGameMusicVideoState.WaitingPlay);
  assert.equal(backend.snapshot().state, "ready");
  requireOk(owner.pauseMovie());
  assert.equal(owner.snapshot().movie?.manager.state, InGameMusicVideoState.PauseOfWaitingPlay);
  const frozen = owner.snapshot().movie?.manager.delayTimerSeconds;
  for (let frame = 0; frame < 5; frame += 1) requireOk(owner.step(delta));
  assert.equal(owner.snapshot().movie?.manager.delayTimerSeconds, frozen);
  requireOk(owner.resumeMovie());
  assert.equal(owner.snapshot().movie?.manager.state, InGameMusicVideoState.WaitingPlay);
  for (let frame = 0; frame < 30 && owner.snapshot().movie?.manager.state !== InGameMusicVideoState.Playing; frame += 1) {
    requireOk(owner.step(delta));
  }
  const played = owner.snapshot();
  assert.equal(played.movie?.manager.state, InGameMusicVideoState.Playing);
  assert.ok((played.movie?.manager.delayTimerSeconds ?? 0) >= Math.fround(2.18));
  assert.equal(backend.snapshot().state, "playing");
  requireOk(owner.step(delta));
  assert.equal(backend.snapshot().visible, true);
  owner.dispose();
  assert.equal(backend.dispose().status, "accepted");
}

async function testZeroAndPositiveDelay(): Promise<void> {
  for (const delay of [0, 300]) {
    const { owner, backend } = await controller(delay);
    requireOk(owner.initialize());
    const delta = Math.fround(0.1);
    for (let frame = 0; frame < 100 && owner.snapshot().currentGameState !== GameState.MovieBeforeSound; frame += 1) {
      requireOk(owner.step(delta));
    }
    assert.equal(owner.snapshot().currentGameState, GameState.MovieBeforeSound);
    assert.equal(owner.snapshot().movie?.manager.state, InGameMusicVideoState.Playing);
    let beforeFrames = 0;
    while (owner.snapshot().currentGameState === GameState.MovieBeforeSound && beforeFrames < 10) {
      requireOk(owner.step(delta));
      beforeFrames += 1;
    }
    assert.equal(owner.snapshot().currentGameState, GameState.PlayingNone);
    assert.equal(beforeFrames, delay === 0 ? 1 : 3);
    requireOk(owner.step(delta));
    assert.equal(owner.snapshot().currentGameState, GameState.PlayingSound);
    assert.equal(owner.snapshot().movie?.manager.state, InGameMusicVideoState.Playing);
    owner.dispose();
    assert.equal(backend.dispose().status, "accepted");
  }
}

async function testHostBinding(): Promise<void> {
  const sessionId = "movie:host";
  const movie = new RecordingSimulatorMovieBackend();
  assert.equal((await movie.prepare(sessionId, prepared(-2180))).status, "accepted");
  const backends = createRecordingSimulatorBackends(undefined, undefined, undefined, movie);
  const chart = requireOk<any>(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00111:01\n",
  }));
  const mode = createSimulatorModeIdentity("live", "auto");
  const engine = requireOk<any>(createSimulatorEngine({
    chart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode },
    movie: { sessionId, musicStartDelayMilliseconds: -2180 },
    startupDirection: {
      scene: new RecordingStartupDirectionBackend(),
      liveStartVoiceCue: null,
      purpose: "initial",
    },
  }, backends));
  requireOk(engine.initialize());
  const delta = Math.fround(0.1);
  for (let frame = 0; frame < 100 && !requireOk<any>(engine.snapshot()).managers.playable; frame += 1) {
    requireOk(engine.step(delta, { touches: [] }));
  }
  const playable = requireOk<any>(engine.snapshot());
  assert.equal(playable.managers.currentGameState, GameState.PlayingSound);
  assert.equal(playable.managers.startupDirection.movie.manager.state, InGameMusicVideoState.WaitingPlay);
  assert.equal(playable.movieBackend.state, "ready");
  requireOk(engine.pause());
  assert.equal(requireOk<any>(engine.snapshot()).managers.startupDirection.movie.manager.state, InGameMusicVideoState.PauseOfWaitingPlay);
  requireOk(engine.resume());
  assert.equal(requireOk<any>(engine.snapshot()).managers.startupDirection.movie.manager.state, InGameMusicVideoState.WaitingPlay);
  requireOk(engine.dispose());
  assert.equal(movie.snapshot().state, "disposed");

  const rehearsalMovie = new RecordingSimulatorMovieBackend();
  assert.equal((await rehearsalMovie.prepare("movie:rehearsal", prepared(-2180))).status, "accepted");
  const rejected = createSimulatorEngine({
    chart,
    runtime: {
      originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS,
      mode: createSimulatorModeIdentity("rehearsal", "manual"),
    },
    movie: { sessionId: "movie:rehearsal", musicStartDelayMilliseconds: -2180 },
    startupDirection: { scene: null, liveStartVoiceCue: null, purpose: "initial" },
  }, createRecordingSimulatorBackends(undefined, undefined, undefined, rehearsalMovie));
  assert.equal(rejected.status, "evidence-required");
  if (rejected.status === "evidence-required") assert.equal(rejected.capability, "movie.session.invalid-host-binding");
  assert.equal(rehearsalMovie.dispose().status, "accepted");

  let releaseAttempted = false;
  const cleanupMovie = new RecordingSimulatorMovieBackend();
  const cleanupResource = prepared(-2180, () => {
    releaseAttempted = true;
    throw new Error("injected release failure");
  });
  assert.equal((await cleanupMovie.prepare("movie:cleanup", cleanupResource)).status, "accepted");
  const cleanupEngine = requireOk<any>(createSimulatorEngine({
    chart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode },
    movie: { sessionId: "movie:cleanup", musicStartDelayMilliseconds: -2180 },
    startupDirection: { scene: null, liveStartVoiceCue: null, purpose: "initial" },
  }, createRecordingSimulatorBackends(undefined, undefined, undefined, cleanupMovie)));
  requireOk(cleanupEngine.initialize());
  const disposed = cleanupEngine.dispose();
  assert.equal(disposed.status, "evidence-required");
  assert.equal(releaseAttempted, true);
  assert.equal(cleanupMovie.snapshot().state, "disposed");
}

async function controller(delay: number): Promise<{
  owner: StartupDirectionController;
  backend: RecordingSimulatorMovieBackend;
  gayaRequests: boolean[];
}> {
  const backend = new RecordingSimulatorMovieBackend();
  const resource = prepared(delay);
  assert.equal((await backend.prepare(`movie:${delay}`, resource)).status, "accepted");
  const manager = new InGameMovieManager(`movie:${delay}`, backend);
  const mv = new MvBackgroundModule(manager, delay);
  const gayaRequests: boolean[] = [];
  const transaction = (commit: () => void) => ({
    status: "ok" as const,
    value: {
      commit() { commit(); return { status: "ok" as const, value: undefined }; },
      discard() { return { status: "ok" as const, value: undefined }; },
    },
  });
  const audio = {
    preflightStartupOpening(includeGaya: boolean) {
      return transaction(() => { gayaRequests.push(includeGaya); });
    },
    preflightMoveTimeReconstructionBgm() { return transaction(() => undefined); },
    isLiveStartVoicePlaying() { return { status: "ok" as const, value: false }; },
    preflightReleaseLiveStartVoice() { return transaction(() => undefined); },
    preflightEnterStartupPlaying() { return transaction(() => undefined); },
  } as any;
  return {
    owner: new StartupDirectionController(
      createSimulatorModeIdentity("live", "manual"),
      new RecordingStartupDirectionBackend(),
      audio,
      null,
      "initial",
      mv,
    ),
    backend,
    gayaRequests,
  };
}

function prepared(
  delay: number,
  release: () => void = () => undefined,
): PreparedSessionMovieResource {
  const preparedResource = Object.freeze({
    metadata: Object.freeze({
      container: "mp4" as const,
      mime: "video/mp4" as const,
      durationSeconds: 120,
      width: 1280,
      height: 720,
    }),
    resource: Object.freeze({}),
    release,
  });
  return Object.freeze({
    profile: Object.freeze({
      role: "mv-live" as const,
      logicalId: `movie/${delay}`,
      byteLength: 16,
      sha256: "A".repeat(64),
      container: "mp4" as const,
      mime: "video/mp4" as const,
      durationSeconds: 120,
      width: 1280,
      height: 720,
      musicStartDelayMilliseconds: delay,
      fit: "contain-center-no-crop" as const,
      muted: true as const,
      loop: false as const,
      identity: "session-explicit" as const,
      signal: "host-supplied-portable" as const,
    }),
    bytes: new Uint8Array(16),
    prepared: preparedResource,
  });
}

function requireOk<T>(result: any): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value as T;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
