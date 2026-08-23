declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { ManualTouchPhase, type ManualInputFrame, type ManualInputTouch } from "../engine/data/manualInput";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import {
  consumePauseControlCommand,
  createPauseControlLayout,
  PauseControlSceneOwner,
  type PauseControlBounds,
  type PauseControlCommand,
} from "../scene/pauseControlScene";
import { consumeRehearsalControlCommand } from "../scene/rehearsalControlScene";

const FIXTURE = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/pause-ui/artifacts/investigations/in-game-pause-ui-runtime-contract-10-1-4",
);
const SURFACE = Object.freeze({
  revision: 0,
  viewportWidth: 1600,
  viewportHeight: 720,
  safeArea: Object.freeze({ x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }),
  origin: "bottom-left" as const,
});
const ORIGINAL = requireOk(createOriginalSurfaceLayout(SURFACE, Math.fround(100)));
const LAYOUT = requireOk(createPauseControlLayout(ORIGINAL));

function main(): void {
  testFixtureAndParameterizedLayout();
  testFourModePauseMatrix();
  testResumeCountdown();
  testHardwareBackResumeBoundary();
  testRetryCancelConfirmAndFreshCommand();
  testAbortCancelConfirm();
  testInputPriorityAndFailureClosure();
  console.log("Pause control scene tests passed: fixtures, four modes, priority, countdown, Retry and Abort capabilities");
}

function testFixtureAndParameterizedLayout(): void {
  const contract = fixture("in_game_pause_ui_runtime_contract.json");
  const profile = fixture("pause_serialized_resource_profile.json");
  const traces = fixture("pause_runtime_trace_manifest.json");
  assert.equal(contract.status, "confirmed-current-four-mode-pause-runtime-resource-layout-portable-contract");
  assert.deepEqual(contract.closure, {
    static_target_count: 38,
    runtime_mode_rows_confirmed: 4,
    accepted_runtime_trace_count: 19,
    serialized_prefab_profiles_confirmed: 5,
    parameterized_layout_rows_confirmed: 6,
    blocking_finding_count: 0,
    unknown_live_modal_branch_count: 0,
    missing_resource_pack_count: 0,
    auto_live_uses_consumed: 1,
    auto_live_budget_remaining: 8,
    screenshot_derived_geometry_scalar_count: 0,
    fixed_device_exact: "open-not-claimed",
    portable_pause_ui_authorization: true,
    production_authorization: true,
  });
  assert.equal(traces.status, "accepted-r1-observation-only-complete-pause-matrix");
  assert.equal(traces.summary.accepted_trace_count, 19);
  assert.deepEqual(traces.summary.confirmed_mode_rows, [
    { session_mode: "live", input_mode: "auto" },
    { session_mode: "live", input_mode: "manual" },
    { session_mode: "rehearsal", input_mode: "auto" },
    { session_mode: "rehearsal", input_mode: "manual" },
  ]);
  const high = profile.layout_rows.find((row: any) => row.id === "20:9-full");
  assert.deepEqual(LAYOUT.pause.centerBottomLeft, [high.pause.center_top_left[0], Math.fround(720 - high.pause.center_top_left[1])]);
  assert.deepEqual(center(LAYOUT.pauseMenu.abortBoundsTopLeft), high.retryable_pause.button_centers_top_left.abort);
  assert.deepEqual(center(LAYOUT.pauseMenu.retryBoundsTopLeft), high.retryable_pause.button_centers_top_left.retry);
  assert.deepEqual(center(LAYOUT.pauseMenu.resumeBoundsTopLeft), high.retryable_pause.button_centers_top_left.resume);
  assert.equal(profile.actual_pause_button.sprite.sprite_name, "button_pause");
  assert.deepEqual(profile.resume_countdown.textures.map((row: any) => row.size), [[51, 119], [99, 120], [99, 121]]);
  assert.equal(profile.resume_countdown.runtime_callback_seconds, 3);
  assert.deepEqual(profile.common_atlas.rows.button_pink.rect, [154, 19, 48, 48]);
  assert.equal(Object.isFrozen(LAYOUT), true);
}

function testFourModePauseMatrix(): void {
  for (const [sessionMode, inputMode] of [["live", "manual"], ["live", "auto"], ["rehearsal", "manual"], ["rehearsal", "auto"]] as const) {
    const mode = createSimulatorModeIdentity(sessionMode, inputMode);
    const owner = new PauseControlSceneOwner();
    const routed = requireOk(owner.route(1 / 60, frame(1, ManualTouchPhase.Began, ...LAYOUT.pause.centerBottomLeft), state(mode, true, false), LAYOUT));
    assert.equal(routed.manualFrame?.touches.length, 0);
    assert.equal(routed.commands.length, 1);
    const command = routed.commands[0] as PauseControlCommand;
    assert.equal(command.kind, "pause");
    assert.equal(requireOk(consumePauseControlCommand(command, state(mode, true, false), SURFACE)), "pause");
    assert.equal(consumePauseControlCommand(command, state(mode, true, false), SURFACE).status, "integrity-failure", "capability is one-use");
    assert.equal(routed.snapshot.state, "pause-menu");
    owner.dispose();
  }
}

function testResumeCountdown(): void {
  const mode = createSimulatorModeIdentity("live", "manual");
  const owner = pausedOwner(mode);
  click(owner, mode, LAYOUT.pauseMenu.resumeBoundsTopLeft);
  let routed = requireOk(owner.route(Math.fround(2.9), null, state(mode, true, true), LAYOUT));
  assert.equal(routed.commands.length, 0);
  assert.equal(routed.snapshot.state, "resume-countdown");
  assert.ok(routed.snapshot.resumeCountdownSecondsRemaining! > 0);
  routed = requireOk(owner.route(Math.fround(0.1), null, state(mode, true, true), LAYOUT));
  assert.equal(routed.commands.length, 1);
  const command = routed.commands[0] as PauseControlCommand;
  assert.equal(command.kind, "resume");
  assert.equal(requireOk(consumePauseControlCommand(command, state(mode, true, true), SURFACE)), "resume");
  assert.equal(routed.snapshot.state, "playing");
}

function testHardwareBackResumeBoundary(): void {
  const mode = createSimulatorModeIdentity("rehearsal", "auto");
  const owner = pausedOwner(mode);
  const routed = requireOk(owner.route(1 / 60, null, state(mode, true, true), LAYOUT, true));
  assert.equal(routed.snapshot.state, "resume-countdown");
  const nested = pausedOwner(mode);
  click(nested, mode, LAYOUT.pauseMenu.retryBoundsTopLeft);
  assert.equal(nested.route(1 / 60, null, state(mode, true, true), LAYOUT, true).status, "integrity-failure");
}

function testRetryCancelConfirmAndFreshCommand(): void {
  const mode = createSimulatorModeIdentity("rehearsal", "auto");
  const owner = pausedOwner(mode);
  click(owner, mode, LAYOUT.pauseMenu.retryBoundsTopLeft);
  assert.equal(snapshot(owner, mode).state, "retry-confirm");
  click(owner, mode, LAYOUT.confirmation.cancelBoundsTopLeft);
  assert.equal(snapshot(owner, mode).state, "pause-menu");
  click(owner, mode, LAYOUT.pauseMenu.retryBoundsTopLeft);
  const routed = click(owner, mode, LAYOUT.confirmation.confirmBoundsTopLeft);
  assert.equal(routed.commands.length, 1);
  const command = routed.commands[0] as PauseControlCommand;
  assert.equal(command.kind, "retry");
  assert.equal(requireOk(consumePauseControlCommand(command, state(mode, true, true), SURFACE)), "retry");
  assert.equal(consumePauseControlCommand(Object.freeze({ ...command, capability: Object.freeze({}) }), state(mode, true, true), SURFACE).status, "integrity-failure");
}

function testAbortCancelConfirm(): void {
  const mode = createSimulatorModeIdentity("live", "auto");
  const owner = pausedOwner(mode);
  click(owner, mode, LAYOUT.pauseMenu.abortBoundsTopLeft);
  assert.equal(snapshot(owner, mode).state, "abort-confirm");
  click(owner, mode, LAYOUT.confirmation.cancelBoundsTopLeft);
  assert.equal(snapshot(owner, mode).state, "pause-menu");
  click(owner, mode, LAYOUT.pauseMenu.abortBoundsTopLeft);
  const routed = click(owner, mode, LAYOUT.confirmation.confirmBoundsTopLeft);
  const command = routed.commands[0] as PauseControlCommand;
  assert.equal(command.kind, "abort");
  assert.equal(requireOk(consumePauseControlCommand(command, state(mode, true, true), SURFACE)), "abort");
}

function testInputPriorityAndFailureClosure(): void {
  const mode = createSimulatorModeIdentity("rehearsal", "auto");
  const owner = new PauseControlSceneOwner();
  let routed = requireOk(owner.route(1 / 60, frame(1, ManualTouchPhase.Ended, ...LAYOUT.pause.centerBottomLeft), state(mode, true, false), LAYOUT));
  assert.equal(routed.commands.length, 0, "Pause moved/ended routes are no-op without began");
  assert.equal(routed.manualFrame?.touches.length, 0, "Auto consumes non-control raw touches before the judgement owner");
  const manualMode = createSimulatorModeIdentity("live", "manual");
  const manual = requireOk(new PauseControlSceneOwner().route(
    1 / 60,
    frame(9, ManualTouchPhase.Began, 800, 100),
    state(manualMode, true, false),
    LAYOUT,
  ));
  assert.equal(manual.manualFrame?.touches.length, 1, "Manual forwards non-control touches to gameplay");
  const returnCenter = LAYOUT.rehearsal.returnFive.centerBottomLeft;
  routed = requireOk(owner.route(1 / 60, frame(2, ManualTouchPhase.Began, ...returnCenter), state(mode, true, false), LAYOUT));
  assert.equal(routed.manualFrame?.touches.length, 0, "MoveTime is resolved before gameplay");
  assert.equal(routed.commands[0]?.kind, "return-five-seconds");
  assert.equal(requireOk(consumeRehearsalControlCommand(routed.commands[0] as any, { ...state(mode, true, false), surfaceRevision: SURFACE.revision })), "return-five-seconds");

  const paused = pausedOwner(mode);
  routed = requireOk(paused.route(1 / 60, frame(3, ManualTouchPhase.Began, 800, 100), state(mode, true, true), LAYOUT));
  assert.equal(routed.manualFrame?.touches.length, 0, "modal dark cover consumes every touch");
  const foreignSurface = Object.freeze({ ...SURFACE, revision: 1 });
  const command = requireOk(new PauseControlSceneOwner().route(1 / 60, frame(4, ManualTouchPhase.Began, ...LAYOUT.pause.centerBottomLeft), state(mode, true, false), LAYOUT)).commands[0] as PauseControlCommand;
  assert.equal(consumePauseControlCommand(command, state(mode, true, false), foreignSurface).status, "integrity-failure");
  assert.equal(createPauseControlLayout({} as any).status, "integrity-failure");
}

function pausedOwner(mode: ReturnType<typeof createSimulatorModeIdentity>): PauseControlSceneOwner {
  const owner = new PauseControlSceneOwner();
  requireOk(owner.route(1 / 60, frame(0, ManualTouchPhase.Began, ...LAYOUT.pause.centerBottomLeft), state(mode, true, false), LAYOUT));
  return owner;
}
function click(owner: PauseControlSceneOwner, mode: ReturnType<typeof createSimulatorModeIdentity>, value: PauseControlBounds) {
  const [x, topY] = center(value);
  const y = Math.fround(LAYOUT.viewportHeight - topY);
  requireOk(owner.route(1 / 60, frame(7, ManualTouchPhase.Began, x, y), state(mode, true, true), LAYOUT));
  return requireOk(owner.route(1 / 60, frame(7, ManualTouchPhase.Ended, x, y), state(mode, true, true), LAYOUT));
}
function snapshot(owner: PauseControlSceneOwner, mode: ReturnType<typeof createSimulatorModeIdentity>) {
  return owner.snapshot(mode, LAYOUT);
}
function state(mode: ReturnType<typeof createSimulatorModeIdentity>, playable: boolean, paused: boolean) {
  return Object.freeze({ mode, timelineSeconds: Math.fround(8), playable, paused, moveTimeInProgress: false });
}
function frame(fingerId: number, phase: ManualInputTouch["phase"], x: number, y: number): ManualInputFrame {
  return Object.freeze({ touches: Object.freeze([Object.freeze({
    fingerId, phase, position: Object.freeze({ x: Math.fround(x), y: Math.fround(y) }), buttonResolution: null,
  })]) });
}
function center(value: PauseControlBounds): readonly [number, number] {
  return Object.freeze([Math.fround(value.x + value.width / 2), Math.fround(value.y + value.height / 2)]);
}
function fixture(name: string): any { return JSON.parse(readFileSync(join(FIXTURE, name), "utf8")); }
function requireOk<T>(result: { status: string; value?: T; capability?: string }): T {
  if (result.status !== "ok") throw new Error(result.capability ?? result.status);
  return result.value as T;
}

main();
