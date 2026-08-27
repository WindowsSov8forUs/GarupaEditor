declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { gunzipSync } = require("node:zlib");

const ROOT = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/full-visible-lifecycle/artifacts/investigations/simulator-full-visible-lifecycle-reaudit-10-1-4",
);
const contract = JSON.parse(readFileSync(join(ROOT, "full_visible_lifecycle_contract.json"), "utf8"));
const trace = JSON.parse(gunzipSync(readFileSync(join(ROOT, "runtime/full-visible-lifecycle-r1.trace.json.gz"))).toString("utf8"));

assert.equal(contract.status, "confirmed-current-full-visible-lifecycle-reaudit");
assert.deepEqual(contract.sample, {
  package: "jp.co.craftegg.band", version_name: "10.1.4", version_code: 230, abi: "arm64-v8a",
});
assert.match(contract.authority.color_policy, /never sampled/);
assert.equal(contract.score_hud.encoded_text.leading_color.bbcode, "[BEBEBE]");
assert.equal(contract.score_hud.encoded_text.significant_color.bbcode, "[FF3B72]");

const rank = contract.score_hud.rank_position;
assert.deepEqual(rank.original_setup_threshold_scores, {
  C: 36_300, B: 217_800, A: 435_600, S: 653_400, SS: 871_200,
});
assert.deepEqual(
  deriveRankPositions(rank.original_setup_threshold_scores, 871_200, rank.foreground_local_x, rank.foreground_width),
  { C: 58.541664123535156, B: 146.25, A: 251.5, S: 356.75, SS: 462 },
);
// CS-V1 is an approved product input to the original position function, not an original threshold claim.
assert.deepEqual(
  deriveRankPositions({ C: 375_000, B: 2_250_000, A: 4_500_000, S: 6_750_000, SS: 9_000_000 }, 10_001_000, 41, 421),
  {
    C: 56.78592300415039,
    B: 135.7155303955078,
    A: 230.43106079101562,
    S: 325.1465759277344,
    SS: 419.86212158203125,
  },
);
assert.equal(contract.score_hud.ss_effect.clip.duration_seconds, 3);
assert.equal(contract.score_hud.ss_effect.clip.loop, true);
assert.match(contract.score_hud.ss_effect.prohibition, /Do not restart/);

const auto = contract.auto_live_caption;
assert.deepEqual(auto.label.color_rgba_f32_bits, ["3F800000", "3F800000", "3F800000", "3F800000"]);
assert.deepEqual(auto.background.color_rgba_f32_bits, ["3F800000", "3E6CECED", "3EE4E4E5", "3F800000"]);
assert.deepEqual([auto.label.width, auto.label.height], [312, 104]);
assert.deepEqual([auto.background.width, auto.background.height], [206, 38]);
assert.notDeepEqual([auto.label.width, auto.label.height], [auto.background.width, auto.background.height]);

assert.equal(contract.add_score.serialized_widget_count, 28);
assert.equal(contract.add_score.logic.poolSize, 4);
assert.equal(contract.add_score.serialized_widgets.filter((row: any) => row.active).length, 24);
assert.equal(contract.life_hud.serialized_widget_count, 10);
assert.match(contract.life_hud.visibility_requirement, /remain visible/);
assert.equal(contract.pause.button.root.game_object, "Pause");
assert.match(contract.pause.button_disposition, /no DisableButton/);
assert.equal(contract.pause.modal_prefabs.retryable_pause.window.width, 922);
assert.equal(contract.pause.modal_prefabs.retryable_pause.buttons.length, 3);

assert.equal(contract.slide.mesh.section_count, 10);
assert.match(contract.slide.mesh.boundary_formula, /buttonCount \* screenToSafeAreaRatio \* widthRate/);
assert.match(contract.slide.flash.placement, /judgement line/);
assert.equal(contract.judgement_particles.default_selection.skin_effect_id, 1);
assert.equal(contract.judgement_particles.default_selection.asset_bundle_name, "skin00");
assert.equal(contract.judgement_particles.default_selection.ordinary_resource, "ingameskin/tapeffect/skin00");

assert.equal(contract.game_clear.base_graph.object_count, 43);
assert.equal(contract.game_clear.full_combo.graph.object_count, 25);
assert.equal(contract.game_clear.all_perfect.graph.object_count, 36);
assert.equal(contract.game_clear.full_combo.clip.curve_count, 104);
assert.equal(contract.game_clear.all_perfect.clip.curve_count, 129);
assert.equal(contract.game_clear.full_combo.clip.stop_time, 2.2833333015441895);
assert.equal(contract.game_clear.all_perfect.clip.stop_time, 2.2833333015441895);
assert.equal(contract.game_clear.full_combo.clip.bindings.every((row: any) => row.path !== null), true);
assert.equal(contract.game_clear.all_perfect.clip.bindings.every((row: any) => row.path !== null), true);
assert.deepEqual(contract.game_clear.clear_status_mapping, {
  1: "base clear only", 2: "base + FullCombo_text_in", 3: "base + AllPerfect_text_in",
});
assert.equal(contract.game_clear.runtime.animation_duration_ms_observed, 3233);
assert.equal(contract.game_clear.runtime.exit_after_animation_finished_ms, 15);
assert.deepEqual(contract.game_clear.runtime.ordered_methods.slice(-3), [
  "RhythmGameClearAnimController.ClearAnimationFinished",
  "InGameManager.onGameClearAnimationFinished",
  "InGameManager.onExit",
]);
assert.equal(trace.status, "confirmed-current-full-visible-lifecycle-r1-promoted-subset");
assert.equal(trace.capture.memory_writes, false);
assert.equal(trace.capture.return_replacement, false);
assert.equal(trace.hook_failures.length, 0);
assert.equal(trace.events.length, 14_702);
assert.equal(trace.frames.length, 33);

for (const name of [
  "r1-039-life-UpdateView.png",
  "r1-043-playing-start.png",
  "r1-050-add-score-Play.png",
  "r1-060-particle-route-playParticle.png",
  "r1-070-pause-open.png",
  "r1-077-playing-periodic.png",
  "r1-090-playing-periodic.png",
  "r1-108-completion-onGameClear.png",
  "r1-112-completion-PlayAnimation.png",
  "r1-115-completion-ClearAnimationFinished.png",
]) {
  const bytes = readFileSync(join(ROOT, "runtime", name));
  assert.deepEqual(pngDimensions(bytes), [1600, 720]);
  assert.match(createHash("sha256").update(bytes).digest("hex"), /^[0-9a-f]{64}$/);
}
assert.equal(contract.coverage.user_reported_issue_count, 15);
assert.equal(contract.coverage.unbounded_audit_domains.length >= 6, true);
assert.deepEqual(contract.closure.unknown_fields, []);
assert.deepEqual(contract.closure.blocking_findings, []);
console.log("full visible/lifecycle independent fixture oracle passed: 15 reported + unbounded graph, rank formula, 33-frame R1, clear=3233ms");

function deriveRankPositions(
  thresholds: Readonly<Record<string, number>>,
  gaugeMaximum: number,
  foregroundLocalX: number,
  foregroundWidth: number,
): Readonly<Record<string, number>> {
  assert.equal(Number.isFinite(gaugeMaximum) && gaugeMaximum > 0, true);
  return Object.freeze(Object.fromEntries(Object.entries(thresholds).map(([key, score]) => [
    key,
    Math.fround(Math.fround(foregroundLocalX) + Math.fround(
      Math.fround(Math.fround(score) * Math.fround(foregroundWidth)) / Math.fround(gaugeMaximum),
    )),
  ])));
}

function pngDimensions(bytes: Uint8Array): readonly [number, number] {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Object.freeze([view.getUint32(16, false), view.getUint32(20, false)] as const);
}
