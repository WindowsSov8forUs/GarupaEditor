export {};
declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const FIXTURE = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/seven-visual-lifecycle/artifacts/investigations/simulator-seven-visual-lifecycle-reconfirmation-10-1-4/seven_visual_lifecycle_oracle.json",
);
const oracle = JSON.parse(readFileSync(FIXTURE, "utf8"));

assert.equal(oracle.schema_version, 1);
assert.equal(oracle.status, "confirmed-current-seven-visual-lifecycle-reconfirmation");
assert.deepEqual(oracle.sample, {
  package: "jp.co.craftegg.band",
  version_name: "10.1.4",
  version_code: 230,
  abi: "arm64-v8a",
  unity_version: "2022.3.62f1",
});
assert.equal(oracle.closure.user_issue_count, 7);
assert.deepEqual(oracle.closure.closed_issue_ids, [
  "SVL-R01", "SVL-R02", "SVL-R03", "SVL-R04", "SVL-R05", "SVL-R06", "SVL-R07",
]);
assert.equal(oracle.closure.production_authorization, true);
assert.match(oracle.closure.authorization_boundary, /Portable Browser\/Pixi/);
assert.match(oracle.authority.device_scope, /does not claim fixed-device GPU framebuffer identity/);

const particle = oracle.particle_texture_material_color_blend;
assert.deepEqual(particle.tiles, [4, 4]);
assert.equal(particle.uv_frame, 11);
assert.equal(particle.raster_origin, "top-left");
assert.deepEqual(particle.selected_tile, {
  column: 3,
  row_from_top: 2,
  rgba_sha256: "C0F52F2624542475038C1E669BB56E363E8C7C9D9AD6731B93A0353FCEE9BF34",
  observed_shape: "solid five-point star with glow",
});
assert.deepEqual(particle.rejected_vertical_inversion_tile, {
  column: 3,
  row_from_top: 1,
  rgba_sha256: "D9457AB0619FA54AB660A6A48F38D4C548AB152FD6AADF33E367043779169B4B",
  observed_shape: "radial burst, not the kira star",
});
assert.equal(particle.texture_storage, "straight-alpha sRGB RGBA");
assert.equal(particle.linear_sampling, true);
assert.deepEqual(particle.blend_factors_rgb, ["SRC_ALPHA", "ONE"]);
assert.match(particle.particle_color_contract, /applies alpha exactly once/);
assert.match(particle.framebuffer_gate, /Actual Browser\/WebGL/);

const flash = oracle.slide_flash;
assert.equal(flash.roots.length, 14);
assert.equal(flash.activate_count, 14);
assert.equal(flash.binding_count, 100);
assert.deepEqual(flash.lifecycle_counts, {
  "flash-play": 14,
  "flash-stop": 28,
  "tapkeep-play": 14,
  "tapkeep-stop": 28,
});
assert.equal(flash.roots.every((row: any) =>
  row.tap_keep_identity_materialized_before_terminal_stop === true &&
  JSON.stringify(row.lifecycle_order) === JSON.stringify([
    "flash-stop", "tapkeep-stop", "flash-play", "tapkeep-play", "flash-stop", "tapkeep-stop",
  ])), true);
assert.deepEqual(flash.roots.slice(0, 2).map((row: any) => ({
  front: row.front_button_types,
  firstCurrent: row.flash_binding_button_types,
})), [
  { front: [0], firstCurrent: [3] },
  { front: [6], firstCurrent: [3] },
]);
assert.match(flash.portable_conclusion, /bound once from the first current after-node/);

const tapKeep = oracle.slide_tap_keep;
assert.equal(tapKeep.static_profile.acquire, "NoteInstanceContainer.GetSlideNoteTapKeepEffect");
assert.equal(tapKeep.static_profile.parent, "NoteSlide transform");
assert.equal(tapKeep.static_profile.play, "ParticleSystem.Play");
assert.equal(tapKeep.static_profile.stop, "ParticleSystem.Stop + Clear + GameObject.SetActive(false)");
assert.equal(tapKeep.runtime_roots_with_materialized_identity, 14);
assert.deepEqual(tapKeep.runtime_lifecycle_counts, flash.lifecycle_counts);
assert.match(tapKeep.portable_conclusion, /stable NoteSlide Transform/);

const scoreClip = oracle.score_above_ss_clip;
assert.equal(scoreClip.rank_five_change_count, 1);
assert.equal(scoreClip.score_update_count_after_entry, 58);
assert.deepEqual(scoreClip.selected_clip_rows.map((row: any) => row.score), [
  872726, 915926, 939899, 950189, 982088,
]);
assert.deepEqual(scoreClip.selected_clip_rows.map((row: any) =>
  bigEndianF32(row.clip_f32_bits[2])), [375, 394, 405, 409, 418]);
assert.match(scoreClip.portable_conclusion, /not clamped to the SS marker/);

const ssLoop = oracle.score_ss_highlight_loop;
assert.equal(ssLoop.clip_name, "ScoreGaugeSS");
assert.equal(ssLoop.sample_rate, 60);
assert.equal(ssLoop.stop_time_seconds, 3);
assert.equal(ssLoop.loop_time, true);
assert.equal(ssLoop.rank_five_change_count, 1);
assert.equal(ssLoop.score_update_count_after_entry, 58);
assert.equal(ssLoop.device_phase_seconds.at(-1) >= 7.5, true);
assert.match(ssLoop.portable_conclusion, /do not restart/);

const hold = oracle.terminal_final_frame_hold;
assert.equal(hold.global_presentation_duration_seconds, 3.233);
assert.equal(hold.additional_clip_stop_time_seconds, 2.2833333015441895);
assert.equal(hold.hold_window_seconds, 0.9496666789054871);
assert.equal(hold.base_runtime.clear_duration_ms, 3233);
assert.equal(hold.base_runtime.exit_after_finished_ms, 16);
assert.equal(hold.base_runtime.additional_controller_observed, false);
assert.match(hold.hold_scope, /not an infinite residency claim/);
assert.match(hold.branch_authority, /No Auto status-1 frame/);

const complete = oracle.full_combo_all_perfect_complete_animation;
assert.deepEqual(complete.clear_status_mapping, {
  1: "base clear only",
  2: "base + FullCombo_text_in",
  3: "base + AllPerfect_text_in",
});
assert.deepEqual(complete.base, {
  object_count: 43,
  particle_system_count: 40,
  clip_stop_time: 3,
  curve_count: 44,
});
verifyBranch(complete.full_combo, 25, 6, "FullCombo_text_in", 104,
  "791CBE88BC41BC4BB7C4B2D91DCD244587615614CCA75EB365FD0EF8FB029F1A");
verifyBranch(complete.all_perfect, 36, 12, "AllPerfect_text_in", 129,
  "FD10736EECE84E6C49EAE17AACD0BFB4AABD4518B20178C58D5026AF6786AD51");
assert.deepEqual(complete.resolved_attribute_hashes, {
  925582877: "looping",
  1133446416: "InitialModule.startRotation.scalar",
});
assert.equal(complete.unknown_channel_count, 0);
assert.match(complete.portable_requirement, /Every one of 104 FC and 129 AP channels/);

console.log("seven visual lifecycle independent oracle passed: SVL-R01..SVL-R07 channels=104/129 fixture-only expected values");

function verifyBranch(
  branch: any,
  objects: number,
  particles: number,
  animationKey: string,
  channels: number,
  matrixSha: string,
): void {
  assert.equal(branch.object_count, objects);
  assert.equal(branch.particle_system_count, particles);
  assert.equal(branch.animation_key, animationKey);
  const clip = branch.clip;
  assert.equal(clip.name, animationKey);
  assert.equal(clip.sample_rate, 60);
  assert.equal(clip.start_time, 0);
  assert.equal(clip.stop_time, 2.2833333015441895);
  assert.equal(clip.loop_time, false);
  assert.equal(clip.curve_count, channels);
  assert.equal(clip.channels.length, channels);
  assert.equal(clip.all_channels_classified, true);
  assert.deepEqual(clip.channels.map((row: any) => row.index),
    Array.from({ length: channels }, (_, index) => index));
  assert.equal(new Set(clip.channels.map((row: any) => row.channel)).size, channels);
  assert.equal(clip.channels.every((row: any) =>
    typeof row.portable_reason === "string" && row.portable_reason.length > 0 &&
    row.phase_f32_bits.length === clip.phase_seconds.length &&
    row.phase_f32_bits.every((bits: string) => /^[0-9A-F]{8}$/.test(bits))), true);
  assert.equal(Object.values(clip.disposition_counts).reduce((sum: number, count: any) => sum + count, 0), channels);
  assert.equal(createHash("sha256").update(canonical(clip.channels)).digest("hex").toUpperCase(), matrixSha);
}

function bigEndianF32(bits: string): number {
  const bytes = Uint8Array.from(bits.match(/../g)!.map((entry: string) => Number.parseInt(entry, 16)));
  return new DataView(bytes.buffer).getFloat32(0, false);
}

function canonical(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
