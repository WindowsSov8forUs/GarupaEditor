from __future__ import annotations

import gzip
from hashlib import sha256
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def digest(path: Path) -> str:
    value = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_json(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def verify_sums() -> None:
    for line in (ROOT / "SHA256SUMS").read_text(encoding="ascii").splitlines():
        expected, relative = line.split("  ", 1)
        path = ROOT / relative
        assert path.is_file(), relative
        assert digest(path) == expected, relative


def verify_trace(path: Path, expected_count: int) -> dict[str, int]:
    sequence = 0
    count = 0
    event_counts: dict[str, int] = {}
    with gzip.open(path, "rt", encoding="utf-8") as source:
        for line in source:
            event = json.loads(line)
            assert event["sequence"] > sequence
            assert "event" in event and "frame_id" in event and "substep_id" in event and "thread_id" in event
            sequence = event["sequence"]
            count += 1
            name = event["event"]
            event_counts[name] = event_counts.get(name, 0) + 1
    assert count == expected_count, (path, count, expected_count)
    return event_counts


def verify_version_10_1_4(closure: dict) -> None:
    """Check the 10.1.4 runs and, above all, that they stay separate from the 10.1.3 evidence."""
    manifest = load_json("sample_manifest.json")
    runs = {entry["run_id"]: entry for entry in manifest["version_10_1_4_runs"]}
    assert manifest["version_separation"], "the version separation note must not be dropped"

    # A 10.1.4 run must never appear among the 10.1.3 samples or supplemental runs.
    older = ({sample["run_id"] for sample in manifest["samples"]}
             | {entry["run_id"] for entry in manifest["supplemental_runs"]})
    assert not (older & set(runs)), older & set(runs)

    event_counts_by_run = {}
    for run_id, entry in runs.items():
        assert entry["package_version_code"] == "230", run_id
        assert entry["address_table"]["version_code"] == "230", run_id
        assert entry["collection_complete"], run_id
        assert entry["collector"]["fault_count"] == 0, run_id
        metadata = load_json(f"traces/raw/{run_id}.metadata.json")
        assert metadata["sample"]["version_code"] == "230", run_id
        raw_path = ROOT / entry["raw_trace"]["path"]
        assert digest(raw_path) == entry["raw_trace"]["sha256"], run_id
        event_counts_by_run[run_id] = verify_trace(raw_path, metadata["event_count"])

    zero_run_id = "tentai-zero-run-034-fresh-process-manual"
    zero = runs[zero_run_id]
    assert "no_auto_live_boundary" in zero["coverage"], zero
    zero_counts = event_counts_by_run[zero_run_id]
    assert zero_counts["frame_enter"] == 763, zero_counts
    assert zero_counts["clock_substep_enter"] == 763, zero_counts
    assert zero_counts.get("adaptive_substep_decision", 0) == 0, zero_counts
    assert zero_counts.get("adaptive_bucket_increment", 0) == 0, zero_counts

    pause = load_json("summaries/pause_during_bpm_10_1_4.json")
    assert set(pause["run_ids"]) <= set(runs), pause["run_ids"]
    setup = pause["setup"]
    assert (setup["cc_num"], setup["absolute_pos"], setup["bpm"]) == (8, 3072, 95.5), setup
    paused = pause["pause"]
    assert paused["game_state"] == 7 and paused["active_bpm_count"] == 1, paused
    assert paused["frozen_frame_ids_after_pause"] == [1081], paused
    for name in ("clock_substep_enter", "note_update_enter", "bpm_object_update_enter"):
        assert paused["events_after_pause"].get(name, 0) == 0, (name, paused)
    assert paused["events_after_pause"]["ingame_manager_exec_enter"] > 100, paused
    resumed = pause["resume"]
    assert resumed["attached_game_state"] == 7 and resumed["attached_active_bpm_count"] == 1
    for name in ("clock_substep_enter", "note_update_enter", "bpm_object_update_enter"):
        assert resumed["events_before_resume_click"].get(name, 0) == 0, (name, resumed)
    assert resumed["events_before_resume_click"]["ingame_manager_exec_enter"] > 100, resumed
    assert resumed["finish_resume_pause_state"] == 2, resumed
    assert resumed["first_frame_id"] == 1, resumed
    assert (resumed["committed_frame_id"], resumed["committed_bpm"]) == (9, 95.5), resumed
    for name in ("clock_substep_enter", "note_update_enter", "bpm_object_commit_leave"):
        assert resumed["events_after_resume"].get(name, 0) > 0, (name, resumed)

    judge = load_json("summaries/judge_offset_10_1_4.json")
    positive = judge["runs"]["positive"]
    assert positive["judgement_adjust_value_b"] == 5 and positive["direction"] == "fast"
    assert positive["cross_bpm_call_count"] >= 1
    positive_sample = positive["cross_bpm_sample"]
    assert positive_sample["frames_argument"] == 5
    assert {step["cursor_bar"] for step in positive_sample["steps"]} == {15, 16}
    assert {step["step_bpm"] for step in positive_sample["steps"]
            if step["step_bpm"] is not None} == {99.5, 95.5}

    negative = judge["runs"]["negative"]
    assert negative["judgement_adjust_value_b"] == -5 and negative["direction"] == "slow"
    assert negative["cross_bar_call_count"] >= 1
    assert negative["cross_bpm_call_count"] == 0
    negative_sample = negative["tempo_command_bar_sample"]
    assert negative_sample["frames_argument"] == 5
    assert [negative_sample["steps"][0]["cursor_bar"],
            negative_sample["steps"][-1]["cursor_bar"]] == [16, 15]
    assert {step["step_bpm"] for step in negative_sample["steps"]
            if step["step_bpm"] is not None} == {95.5}

    reverse_index = load_json("summaries/reverse_index_update_10_1_4.json")
    assert reverse_index["run_id"] == "ikuoku-cc08-run-060-full-note-detail"
    assert reverse_index["multi_member_substep_count"] >= 1
    assert (reverse_index["reverse_index_match_count"]
            == reverse_index["multi_member_substep_count"])
    sample = reverse_index["sample"]
    assert sample["main_active_updates"] == list(reversed(sample["active_members"]))
    assert sample["nested_updates"], sample

    bpm_inventory = load_json("summaries/cached_bpm_candidates_10_1_4.json")
    assert bpm_inventory["scanned_bundles"] == 81
    assert bpm_inventory["bms_asset_count"] == 4176
    assert bpm_inventory["candidate_count"] == 445
    assert bpm_inventory["zero_command_bms_count"] == 3731
    assert bpm_inventory["max_command_count"] == 16
    assert bpm_inventory["charts_at_max_command_count"] == 5
    assert max(len(candidate["commands"])
               for candidate in bpm_inventory["candidates"]) == 16

    frame_rate = load_json("summaries/frame_rate_request_120.json")
    assert frame_rate["package_version_code"] == "230"
    # Exactly one target frame rate request is issued inside InGameDirector.Awake, and with the
    # 120FPS setting selected that request is 120. Requests outside Awake belong to other
    # initialisation and must not be counted.
    assert frame_rate["requests_inside_director_awake"] == [120], frame_rate
    assert 120 in frame_rate["requests"]
    corroboration = frame_rate["cross_version_corroboration"]
    assert corroboration["launcher_lead_beat"] == 79.5999984741211, corroboration
    assert (corroboration["start_bpm"], corroboration["start_bpm_string"]) == (99.5, "99.5")
    assert (corroboration["committed_bpm"], corroboration["committed_bpm_string"]) == (95.5, "95.5")
    assert frame_rate["setting_owner"]["ui_change_callback_observed"] is False

    section = closure["version_10_1_4"]
    assert section["package_version_code"] == "230"
    assert section["sample_matrix"]["same_nonzero_120"] == "confirmed"
    assert section["sample_matrix"]["normal_zero_bpm_60"] == "confirmed"
    assert section["sample_matrix"]["pause_during_bpm"] == "confirmed"
    assert section["sample_matrix"]["positive_offset_cross_bpm"] == "confirmed"
    assert section["sample_matrix"]["negative_offset_cross_bpm_bar"] == "confirmed"
    assert section["findings"]["target_frame_rate_120"]["status"] == "confirmed"
    assert section["findings"]["setting_source"]["status"] == "confirmed-partial"
    assert section["findings"]["fresh_process_zero_bpm"]["status"] == "confirmed"
    assert section["findings"]["pause_during_bpm"]["status"] == "confirmed-split-capture"
    assert section["findings"]["judgement_offsets"]["status"] == "confirmed"
    assert section["findings"]["reverse_index_update"]["status"] == "confirmed"
    assert (section["findings"]["adaptive_fallback_lower_buckets"]["status"]
            == "blocked-runtime-reachability-under-observation")
    assert (section["findings"]["bpm_pool_cursor_wrap_reuse"]["status"]
            == "blocked-production-chart-unavailable")
    assert set(section["runs"]) == set(runs)
    # 10.1.4 is the locked version, so its matrix is the one that gates S02. The former live-start
    # blocker was auto-live, not the network, and is resolved by collecting with auto-live off.
    assert section["locked_version"] is True
    locked = closure["locked_package_version"]
    assert (locked["version_name"], locked["version_code"]) == ("10.1.4", "230"), locked
    assert locked["s02_gating_matrix"] == "version_10_1_4.sample_matrix", locked
    assert closure["sections"]["R07_60_120_request"] == "60-and-120-confirmed-on-10.1.4"
    blocked = [row for row, status in section["sample_matrix"].items()
               if status == "blocked-network"]
    assert not blocked, blocked
    assert section["recapture_blocker"]["status"] == "resolved"


def verify_pass2() -> None:
    """Re-check the second capture pass without a device, a network, or the game."""
    manifest = load_json("sample_manifest.json")
    supplemental = {entry["run_id"]: entry for entry in manifest["supplemental_runs"]}

    adaptive = load_json("summaries/pass2_adaptive_substeps.json")
    by_run = {entry["run_id"]: entry for entry in adaptive["runs"]}

    # The bucket the client increments determines the tentative substep count, and the mapping is
    # bucket k -> k + 1 in every run that reached that bucket.
    for entry in adaptive["runs"]:
        for bucket, tentative in entry["bucket_to_tentative_substeps"].items():
            assert tentative == [int(bucket) + 1], (entry["run_id"], bucket, tentative)

    # The history fallback engages on the frame counters[3] reaches 6, and at least one run must
    # do so while counters[2] is still far below its own boundary -- that is what rules out the
    # previously frozen counter[2] >= 6 mapping.
    fired = [entry["first_history_fallback"] for entry in adaptive["runs"]
             if entry["first_history_fallback"] is not None]
    assert len(fired) >= 4, len(fired)
    assert all(event["counters_after_decision"][3] == 6 for event in fired), fired
    assert all(event["substeps"] == 1 and event["tentative_substeps"] > 1 for event in fired), fired
    assert any(event["counters_after_decision"][2] < 6 for event in fired), fired
    assert [comparison["counter_index"] for comparison in adaptive["fallback_comparisons"]] == [1, 2, 3]
    assert adaptive["static_correction"]["status"] == "confirmed"
    assert adaptive["static_correction"]["boundaries_unchanged"] == ["101", "21", "6"]

    # Zero BPM-change on a fresh process: one substep per frame, no counter traffic at all. The
    # same chart on a warm process takes the adaptive path, which is the whole point of the pair.
    fresh = by_run["tentai-zero-run-024-fresh-process"]
    warm = by_run["tentai-zero-run-023-warm-process"]
    assert fresh["adaptive_decision_count"] == 0 and fresh["adaptive_bucket_increment_count"] == 0
    assert fresh["single_step_per_frame"] and fresh["frame_count"] == fresh["clock_substep_count"]
    assert warm["adaptive_decision_count"] > 0

    pause = load_json("summaries/pass2_pause_resume.json")
    assert pause["gate"]["status"] == "confirmed"
    assert {bracket["run_id"] for bracket in pause["brackets"]} == {
        "ikuoku-cc08-run-021-pause-during", "ikuoku-cc08-run-022-pause-bracket"}
    assert len(pause["brackets"]) == 3, len(pause["brackets"])
    residency = [bracket for bracket in pause["brackets"]
                 if bracket["active_bpm_count_while_frozen"] == 1]
    assert len(residency) == 1, residency
    for bracket in pause["brackets"]:
        assert bracket["note_manager_exec_update_calls_while_frozen"] == 0, bracket["run_id"]
        assert bracket["clock_substep_calls_while_frozen"] == 0, bracket["run_id"]
        assert bracket["bpm_object_update_calls_while_frozen"] == 0, bracket["run_id"]
        assert bracket["note_update_calls_while_frozen"] == 0, bracket["run_id"]
        assert bracket["batch_activation_calls_while_frozen"] == 0, bracket["run_id"]
        assert bracket["ingame_manager_exec_calls_while_frozen"] > 100, bracket["run_id"]
        comparison = bracket["clock_comparison"]
        assert comparison["consecutive_frames"], bracket["run_id"]
        assert comparison["advance_is_one_ordinary_frame"], bracket["run_id"]
        assert comparison["current_bpm_before"] == comparison["current_bpm_after"], bracket["run_id"]
        assert comparison["current_bpm_string_before"] == comparison["current_bpm_string_after"]

    judge = load_json("summaries/pass2_judge_offset.json")
    by_offset = {entry["judgement_adjust_value_b"]: entry for entry in judge["runs"]}
    assert set(by_offset) == {5, -5}, sorted(by_offset)
    positive = by_offset[5]
    negative = by_offset[-5]
    assert positive["cross_bpm_call_count"] >= 1
    assert negative["cross_bar_call_count"] >= 1
    assert negative["cross_bpm_call_count"] == 0, "the summary claims this branch is unresolved"
    crossing = positive["cross_bpm_sample"]
    assert crossing["direction"] == "fast" and crossing["frames_argument"] == 5
    tempos = [step["step_bpm"] for step in crossing["steps"] if step["step_bpm"] is not None]
    assert len(set(tempos)) > 1, tempos
    borrow = negative["cross_bar_sample"]
    assert borrow["direction"] == "slow" and borrow["frames_argument"] == 5
    bars = [step["cursor_bar"] for step in borrow["steps"]]
    assert bars[0] > bars[-1], bars

    initialization = load_json("summaries/pass2_initialization.json")
    assert all(sample["target_frame_rate_requests"] for sample in initialization["samples"])
    assert all(set(sample["target_frame_rate_requests"]) == {60}
               for sample in initialization["samples"])
    assert all(sample["high_frequency_mode_read_events"] == 0
               for sample in initialization["samples"])

    # Every pass-2 run is a complete collection with no writer faults, and its frozen trace must
    # match the run metadata event by event.
    for run_id in by_run:
        entry = supplemental[run_id]
        assert entry["collection_complete"], run_id
        assert entry["collector"]["fault_count"] == 0, run_id
        assert entry["collector"]["message_thread_role"] == "enqueue-only", run_id
        metadata = load_json(f"traces/raw/{run_id}.metadata.json")
        raw_path = ROOT / entry["raw_trace"]["path"]
        assert digest(raw_path) == entry["raw_trace"]["sha256"], run_id
        assert raw_path.stat().st_size == entry["raw_trace"]["bytes"], run_id
        verify_trace(raw_path, metadata["event_count"])
        for normalized in entry["normalized_traces"]:
            path = ROOT / normalized["path"]
            assert digest(path) == normalized["sha256"], normalized["path"]
            assert path.stat().st_size == normalized["bytes"], normalized["path"]

    closure = load_json("closure.json")
    assert closure["pass"] == 2
    matrix = closure["sample_matrix"]
    for row in ("normal_zero_bpm_60", "pause_before_bpm", "pause_during_bpm", "pause_after_bpm",
                "positive_offset_cross_bpm"):
        assert matrix[row] == "confirmed", row
    assert matrix["same_nonzero_120"] == "unresolved-on-10.1.3-confirmed-on-10.1.4"
    verify_version_10_1_4(closure)
    # HABAHIRO is not a collection gap: the chart is event-exclusive and cannot be selected. It
    # still blocks, and the reason must stay recorded so nobody substitutes another chart for it.
    assert matrix["habahiro_zero_bpm_60"] == "blocked-chart-unavailable"
    assert "habahiro_zero_bpm_60" in closure["unavailable_samples"]
    assert "habahiro_zero_bpm_60" in closure["blocking_findings"]
    assert closure["sections"]["R13_pause_resume"] == "confirmed"
    assert closure["pass2_findings"]["adaptive_fallback_counter_mapping"]["status"] == "confirmed"


def verify_package_version() -> None:
    """Pin every frozen run to the package version its manifest entry declares.

    Section 4 of the evidence requirements forbids merging evidence from different package
    versions into one closed sample, and nothing in a trace itself makes the version obvious.
    The 10.1.3 samples and supplemental runs must be 229; the 10.1.4 runs must be 230; and no
    run may exist in `traces/raw/` that no manifest entry accounts for, which is how a stray
    capture from another build would otherwise slip in.
    """
    manifest = load_json("sample_manifest.json")
    expected: dict[str, tuple[str, str]] = {}
    for sample in manifest["samples"]:
        expected[sample["run_id"]] = ("10.1.3", "229")
    for entry in manifest["supplemental_runs"]:
        expected[entry["run_id"]] = ("10.1.3", "229")
    for entry in manifest["version_10_1_4_runs"]:
        expected[entry["run_id"]] = (entry["package_version"], entry["package_version_code"])

    present = {path.name[: -len(".metadata.json")]
               for path in (ROOT / "traces" / "raw").glob("*.metadata.json")}
    assert present == set(expected), (sorted(present ^ set(expected)))

    for run_id, (version_name, version_code) in expected.items():
        metadata = load_json(f"traces/raw/{run_id}.metadata.json")
        sample = metadata["sample"]
        assert sample["package"] == "jp.co.craftegg.band", run_id
        assert sample["version_name"] == version_name, (run_id, sample["version_name"])
        assert sample["version_code"] == version_code, (run_id, sample["version_code"])


def main() -> int:
    verify_sums()
    verify_package_version()
    manifest = load_json("sample_manifest.json")
    lifecycle = load_json("summaries/bpm_lifecycle.json")
    initialization = load_json("summaries/initialization.json")
    assert {sample["sample_id"] for sample in manifest["samples"]} == {"cc03", "cc08"}
    assert all(sample["target_frame_rate_requests"] and set(sample["target_frame_rate_requests"]) == {60} for sample in initialization["samples"])
    expected_commands = {3: (140.0, "140"), 8: (95.5, "95.5")}
    for sample in lifecycle["samples"]:
        cc_num = sample["command"]["cc_num"]
        assert (sample["commit"]["current_after_update"], sample["commit"]["current_string_after_update"]) == expected_commands[cc_num]
        assert sample["identity_checks"]["same_object_through_commit"]
        assert sample["identity_checks"]["callback_removed_immediately"]
    for sample in manifest["samples"]:
        metadata_path = ROOT / "traces" / "raw" / f"{sample['run_id']}.metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        raw_path = ROOT / sample["raw_trace"]["path"]
        assert digest(raw_path) == sample["raw_trace"]["sha256"]
        assert raw_path.stat().st_size == sample["raw_trace"]["bytes"]
        verify_trace(raw_path, metadata["event_count"])
        if sample["bundle_text_asset"] is not None:
            bundle_source = ROOT / sample["bundle_text_asset"]["path"]
            runtime_source = ROOT / sample["bms"]["path"]
            assert bundle_source.read_bytes().removeprefix(b"\xef\xbb\xbf") == runtime_source.read_bytes()
            assert sample["bundle_text_asset"]["matches_runtime_bms"]
    for supplemental in manifest.get("supplemental_runs", []):
        metadata = load_json(f"traces/raw/{supplemental['run_id']}.metadata.json")
        verify_trace(ROOT / supplemental["raw_trace"]["path"], metadata["event_count"])
    pool = load_json("summaries/pool_reset_reuse.json")
    assert pool["dynamic"]["reset_override_event_count"] == 0
    assert pool["dynamic"]["reset_note_event_count"] == 0
    assert pool["static_fast_path"]["reset_call_on_success"] is False
    assert pool["conclusion"]["fast_acquire_reset"] == "excluded"
    assert pool["conclusion"]["cursor_wrap_reuse"] == "unresolved"
    closure = load_json("closure.json")
    assert closure["overall_status"] == "unresolved"
    assert closure["s02_gate"] == "blocked"
    assert closure["blocking_findings"]
    verify_pass2()
    print("clock scheduling runtime oracle: verified (10.1.3 passes + 10.1.4 runs); S02 remains blocked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
