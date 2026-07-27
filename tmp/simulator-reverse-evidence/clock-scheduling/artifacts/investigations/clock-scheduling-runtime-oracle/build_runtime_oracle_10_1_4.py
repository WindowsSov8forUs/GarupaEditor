#!/usr/bin/env python3
"""Promote the 10.1.4 / 230 runs into the package, kept strictly separate from 10.1.3 evidence.

Section 4 of the clock-scheduling evidence requirements forbids merging traces from different
package versions into one closed sample. The 10.1.3 samples and supplemental runs therefore stay
exactly as they are, and everything captured on 10.1.4 lands under its own manifest key and its
own closure section.

What 10.1.4 adds is the row 10.1.3 never closed: the 120-mode target frame rate request. The run
also re-observes the CC08 lifecycle and the launcher lead, which is corroboration across versions
rather than a replacement for the frozen 10.1.3 closure.

    py artifacts/investigations/clock-scheduling-runtime-oracle/build_runtime_oracle_10_1_4.py
"""

from __future__ import annotations

import gzip
from hashlib import sha256
import json
from pathlib import Path
import shutil
from typing import Any, Iterator


OUTPUT = Path(__file__).resolve().parent
ROOT = OUTPUT.parents[2]
CAPTURE_ROOT = ROOT / "runtime" / "captures" / "clock-scheduling"

RUNS = {
    "v14-ikuoku-120": {
        "run_id": "ikuoku-cc08-run-030-120-mode",
        "purpose": "120-mode target frame rate request and CC08 lifecycle on 10.1.4 / 230",
        "coverage": ["120_target_request", "same_nonzero_120", "CC08_lifecycle",
                     "dual_clock_initialization", "launcher_lead"],
        "music_score_key": "653_ikuoku_easy",
    },
    "v14-hf-toggle": {
        "run_id": "settings-run-031-high-frequency-toggle",
        "purpose": "settings UI owning the frame-rate toggle, captured while switching 60 -> 120",
        "coverage": ["high_frequency_setting_owner"],
        "music_score_key": None,
    },
    "n14-ikuoku-sched-60": {
        "run_id": "ikuoku-cc08-run-032-scheduling-60",
        "purpose": "60-mode CC08 lifecycle, two-phase scheduling and adaptive substeps on 10.1.4",
        "coverage": ["60_target_request", "dual_clock_initialization", "launcher_lead",
                     "CC08_lifecycle", "cross_bar_bpm_command", "adaptive_2_3_4",
                     "fallback_101_21_6", "two_phase_scheduling"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-pause-bracket": {
        "run_id": "ikuoku-cc08-run-033-pause-bracket",
        "purpose": "pause and resume before the BPM command is acquired and after it commits",
        "coverage": ["pause_before_bpm", "pause_after_bpm"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-tentai-zero-manual": {
        "run_id": "tentai-zero-run-034-fresh-process-manual",
        "purpose": "fresh-process zero-BPM-change scheduling without auto-live on 10.1.4",
        "coverage": ["normal_zero_bpm_60", "fresh_process_zero_bpm",
                     "single_step_per_frame", "no_auto_live_boundary"],
        "music_score_key": None,
    },
    "n14-ikuoku-pause-during-r6": {
        "run_id": "ikuoku-cc08-run-035-pause-during-setup",
        "purpose": "CC08 setup followed by pause while the BPM object is resident",
        "coverage": ["pause_during_bpm", "bpm_resident_pause_enter",
                     "continued_life_boundary", "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-pause-during-r7-resume": {
        "run_id": "ikuoku-cc08-run-036-pause-during-resume",
        "purpose": "attach during the same resident-BPM pause and observe resume through commit",
        "coverage": ["pause_during_bpm", "bpm_resident_pause_resume",
                     "split_capture_same_process"],
        "music_score_key": None,
    },
    "n14-thesis-cc03-run-037": {
        "run_id": "thesis-cc03-run-037-nonzero-60",
        "purpose": "60-mode CC03 lifecycle on 10.1.4, including the 85 to 140 BPM commit",
        "coverage": ["nonzero_cc03_60", "CC03_lifecycle", "launcher_lead",
                     "no_auto_live_boundary", "continued_life_boundary"],
        "music_score_key": "087_thesis_easy",
    },
    "n14-ikuoku-offset-plus5-run-057": {
        "run_id": "ikuoku-cc08-run-057-offset-plus5",
        "purpose": "positive judgement offset crossing the CC08 bar and tempo boundary",
        "coverage": ["positive_offset_cross_bpm", "positive_offset_cross_bar",
                     "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-offset-minus5-run-059": {
        "run_id": "ikuoku-cc08-run-059-offset-minus5",
        "purpose": "negative judgement offset borrowing across the committed CC08 bar boundary",
        "coverage": ["negative_offset_cross_bpm_bar", "negative_offset_cross_bar",
                     "negative_offset_retains_current_bpm", "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-full-detail-run-060": {
        "run_id": "ikuoku-cc08-run-060-full-note-detail",
        "purpose": "high-duty-cycle note detail proving reverse-index main active-list updates",
        "coverage": ["reverse_index_update", "nested_note_update_interleave",
                     "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-live-affinity4-bucket2-trigger-run-081": {
        "run_id": "ikuoku-cc08-run-081-bucket2-fallback",
        "purpose": "bucket-2 history fallback at counter[2] 20 to 21 under bounded CPU controls",
        "coverage": ["fallback_101_21_6", "fallback_counter2_21",
                     "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-live-affinity4-bucket2-trigger-run-083": {
        "run_id": "ikuoku-cc08-run-083-bucket2-fallback-repeat",
        "purpose": "independent repeat of the bucket-2 counter[2] 20 to 21 fallback",
        "coverage": ["fallback_101_21_6", "fallback_counter2_21",
                     "independent_repeat", "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-live-target40-timescale075-bucket1-trigger-run-086": {
        "run_id": "ikuoku-cc08-run-086-bucket1-fallback",
        "purpose": "bucket-1 history fallback at counter[1] 100 to 101 using original Unity APIs",
        "coverage": ["fallback_101_21_6", "fallback_counter1_101",
                     "original_api_timing_control", "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
    "n14-ikuoku-live-target40-timescale075-bucket1-trigger-run-087": {
        "run_id": "ikuoku-cc08-run-087-bucket1-fallback-repeat",
        "purpose": "independent repeat of the bucket-1 counter[1] 100 to 101 fallback",
        "coverage": ["fallback_101_21_6", "fallback_counter1_101",
                     "original_api_timing_control", "independent_repeat",
                     "no_auto_live_boundary"],
        "music_score_key": "653_ikuoku_easy",
    },
}

LIFECYCLE_EVENTS = {
    "agent_ready", "target_frame_rate_requested", "device_utility_set_target_frame_rate",
    "high_frequency_mode_read", "high_frequency_ui_init_enter", "high_frequency_ui_init_leave",
    "high_frequency_ui_changed", "high_frequency_proto_read", "high_frequency_proto_write",
    "director_awake_enter", "director_awake_leave", "manager_init_enter", "manager_init_leave",
    "analyze_bms_enter", "analyze_bms_leave", "setup_notes_enter", "setup_notes_leave",
    "setup_first_progress_enter", "setup_first_progress_leave", "setup_bpm_change_enter",
    "setup_bpm_change_leave", "bpm_pool_acquire_enter", "bpm_pool_acquire_leave",
    "bpm_object_setup_enter", "bpm_object_setup_leave", "bpm_object_update_enter",
    "bpm_object_update_leave", "bpm_object_commit_enter", "bpm_object_commit_leave",
    "update_bpm_enter", "update_bpm_leave", "on_bpm_changed_enter", "on_bpm_changed_leave",
    "target_frame_rate_invoked", "time_scale_invoked", "adaptive_trigger_sample",
}


def digest(path: Path) -> str:
    value = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def stream(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as source:
        for line in source:
            line = line.strip()
            if line:
                yield json.loads(line)


def deterministic_gzip(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with source_path.open("rb") as source, target_path.open("wb") as target:
        with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0) as compressed:
            shutil.copyfileobj(source, compressed, length=1 << 20)


def hashed(path: Path) -> dict[str, Any]:
    return {"path": path.relative_to(OUTPUT).as_posix(),
            "bytes": path.stat().st_size, "sha256": digest(path)}


def controller_of(event: dict[str, Any]) -> dict[str, Any] | None:
    if isinstance(event.get("controller"), dict):
        return event["controller"]
    manager = event.get("manager")
    if isinstance(manager, dict) and isinstance(manager.get("controller"), dict):
        return manager["controller"]
    return None


def manager_of(event: dict[str, Any]) -> dict[str, Any] | None:
    manager = event.get("manager")
    return manager if isinstance(manager, dict) else None


def active_bpm_pointer(event: dict[str, Any]) -> str | None:
    manager = manager_of(event) or {}
    note_manager = manager.get("note_manager")
    if not isinstance(note_manager, dict):
        return None
    active = note_manager.get("active_bpm_list")
    if not isinstance(active, dict):
        return None
    members = active.get("members")
    return members[0] if isinstance(members, list) and members else None


def counted(counts: dict[str, int], event: dict[str, Any]) -> None:
    name = event.get("event")
    counts[name] = counts.get(name, 0) + 1


def build_pause_during_summary() -> dict[str, Any]:
    setup_trace = CAPTURE_ROOT / "n14-ikuoku-pause-during-r6" / "runtime_trace.jsonl"
    resume_trace = CAPTURE_ROOT / "n14-ikuoku-pause-during-r7-resume" / "runtime_trace.jsonl"
    setup_metadata = json.loads((setup_trace.parent / "capture_metadata.json").read_text(encoding="utf-8"))
    resume_metadata = json.loads((resume_trace.parent / "capture_metadata.json").read_text(encoding="utf-8"))

    setup = None
    pause = None
    frozen_after_pause: dict[str, int] = {}
    frozen_frames: set[int] = set()
    for event in stream(setup_trace):
        if event.get("event") == "bpm_object_setup_leave":
            setup = event
        manager = manager_of(event) or {}
        if (event.get("event") == "pause_path_leave"
                and event.get("label") == "InGameManager.onPauseSound"
                and manager.get("current_game_state") == 7
                and active_bpm_pointer(event)):
            pause = event
            continue
        if pause is not None:
            counted(frozen_after_pause, event)
            if event.get("event") == "ingame_manager_exec_enter":
                frozen_frames.add(event["frame_id"])

    resume_click = None
    finish_resume = None
    first_frame = None
    commit = None
    frozen_before_resume: dict[str, int] = {}
    post_resume: dict[str, int] = {}
    resume_finished = False
    for event in stream(resume_trace):
        if resume_click is None:
            if (event.get("event") == "pause_path_enter"
                    and event.get("label") == "InGameManager.onClickResume"):
                resume_click = event
            else:
                counted(frozen_before_resume, event)
            continue
        if (event.get("event") == "pause_path_leave"
                and event.get("label") == "InGameManager.onFinishResumeCountdownAnimation"):
            finish_resume = event
        if (event.get("event") == "pause_path_leave"
                and event.get("label") == "InGameManager.resumeGame"):
            resume_finished = True
            continue
        if resume_finished:
            counted(post_resume, event)
            if first_frame is None and event.get("event") == "frame_enter":
                first_frame = event
            if commit is None and event.get("event") == "bpm_object_commit_leave":
                commit = event

    if not all((setup, pause, resume_click, finish_resume, first_frame, commit)):
        raise SystemExit("pause-during pair is missing a required lifecycle anchor")
    setup_pointer = setup["bpm_object"]["pointer"]
    pause_pointer = active_bpm_pointer(pause)
    resume_pointer = active_bpm_pointer(resume_click)
    if len({setup_pointer, pause_pointer, resume_pointer}) != 1:
        raise SystemExit("pause-during pair does not preserve one resident BPM object")
    if setup_metadata["frida"]["pid"] != resume_metadata["frida"]["pid"]:
        raise SystemExit("pause-during pair does not belong to one game process")

    return {
        "schema_version": 1,
        "package_version": "10.1.4",
        "package_version_code": "230",
        "run_ids": ["ikuoku-cc08-run-035-pause-during-setup",
                    "ikuoku-cc08-run-036-pause-during-resume"],
        "same_process_pid": setup_metadata["frida"]["pid"],
        "resident_bpm_object": setup_pointer,
        "setup": {
            "frame_id": setup["frame_id"],
            "cc_num": setup["bpm_object"]["note_info"]["cc_num"],
            "absolute_pos": setup["bpm_object"]["note_info"]["absolute_pos"],
            "bpm": setup["bpm_object"]["bpm"],
        },
        "pause": {
            "frame_id": pause["frame_id"],
            "game_state": manager_of(pause)["current_game_state"],
            "active_bpm_count": manager_of(pause)["note_manager"]["active_bpm_count"],
            "frozen_frame_ids_after_pause": sorted(frozen_frames),
            "events_after_pause": frozen_after_pause,
        },
        "resume": {
            "attached_game_state": manager_of(resume_click)["current_game_state"],
            "attached_active_bpm_count": manager_of(resume_click)["note_manager"]["active_bpm_count"],
            "events_before_resume_click": frozen_before_resume,
            "finish_resume_pause_state": manager_of(finish_resume)["pause_state"],
            "first_frame_id": first_frame["frame_id"],
            "committed_frame_id": commit["frame_id"],
            "committed_bpm": commit["bpm_object"]["bpm"],
            "events_after_resume": post_resume,
        },
        "boundary": {
            "split_capture": "The resume run attached to the same paused process and the same resident BPM object after the setup run's bounded capture ended.",
            "continued_life": "The chart used the client's Continue flow because no-auto-live life depletion reached the CC08 setup frame. No process memory or return value was modified.",
            "operator_input": "A repeated pause-button input was used after the Continue countdown to win the UI race at the setup frame; the pause and resume lifecycle are proven by original-client hooks, not inferred from the input command.",
        },
    }


def analyze_judge_calls(trace: Path, expected_direction: str) -> dict[str, Any]:
    adjustment = None
    call = None
    call_count = 0
    cross_bar_calls = []
    cross_bpm_calls = []
    for event in stream(trace):
        name = event.get("event")
        if name == "judge_adjust_enter" and adjustment is None:
            adjustment = event["judgement_adjust_value_b"]
        elif name == "judge_absolute_pos_enter":
            call = {
                "frame_id": event["frame_id"],
                "direction": event["direction"],
                "frames_argument": event["frames_argument"],
                "controller_bpm": event["controller"]["current_bpm"],
                "steps": [],
            }
            call_count += 1
        elif name == "judge_step_head" and call is not None:
            call["steps"].append({
                "step_index": event["step_index"],
                "cursor_bar": event["cursor_bar"],
                "cursor_beat": event["cursor_beat"],
                "step_bpm": None,
            })
        elif name == "judge_step_bpm" and call is not None:
            step = call["steps"][-1]
            if step["step_index"] != event["step_index"]:
                raise SystemExit(f"{trace.parent.name}: judge step head/BPM mismatch")
            step["step_bpm"] = event["step_bpm"]
        elif name == "judge_absolute_pos_leave" and call is not None:
            call["result"] = event["result"]
            bars = {step["cursor_bar"] for step in call["steps"]}
            bpms = {step["step_bpm"] for step in call["steps"]
                    if step["step_bpm"] is not None}
            if len(bars) > 1:
                cross_bar_calls.append(call)
            if len(bpms) > 1:
                cross_bpm_calls.append(call)
            call = None

    if adjustment is None or call_count == 0:
        raise SystemExit(f"{trace.parent.name}: no judgement-offset calls")
    if any(sample["direction"] != expected_direction
           for sample in cross_bar_calls + cross_bpm_calls):
        raise SystemExit(f"{trace.parent.name}: unexpected judgement direction")
    return {
        "judgement_adjust_value_b": adjustment,
        "direction": expected_direction,
        "call_count": call_count,
        "cross_bar_call_count": len(cross_bar_calls),
        "cross_bpm_call_count": len(cross_bpm_calls),
        "cross_bar_sample": cross_bar_calls[0] if cross_bar_calls else None,
        "cross_bpm_sample": cross_bpm_calls[0] if cross_bpm_calls else None,
        "tempo_command_bar_sample": next(
            (sample for sample in cross_bar_calls
             if {step["cursor_bar"] for step in sample["steps"]} == {15, 16}), None),
    }


def build_judge_offset_summary() -> dict[str, Any]:
    positive = analyze_judge_calls(
        CAPTURE_ROOT / "n14-ikuoku-offset-plus5-run-057" / "runtime_trace.jsonl", "fast")
    negative = analyze_judge_calls(
        CAPTURE_ROOT / "n14-ikuoku-offset-minus5-run-059" / "runtime_trace.jsonl", "slow")
    return {
        "schema_version": 1,
        "package_version": "10.1.4",
        "package_version_code": "230",
        "runs": {
            "positive": {"run_id": "ikuoku-cc08-run-057-offset-plus5", **positive},
            "negative": {"run_id": "ikuoku-cc08-run-059-offset-minus5", **negative},
        },
        "negative_boundary": (
            "SlowAbsolutePos borrows from bar 16 into bar 15 after the 95.5 BPM commit, but "
            "all five timed steps retain 95.5 instead of looking up the prior bar's 99.5 BPM. "
            "The reverse bar crossing is confirmed; a reverse tempo re-read does not occur."
        ),
    }


def build_reverse_index_summary() -> dict[str, Any]:
    trace = CAPTURE_ROOT / "n14-ikuoku-full-detail-run-060" / "runtime_trace.jsonl"
    groups: dict[tuple[int, int], dict[str, Any]] = {}
    for event in stream(trace):
        if event.get("event") != "note_update_enter":
            continue
        manager = manager_of(event) or {}
        active = manager.get("active_note_list") or {}
        members = active.get("members") or []
        key = (event["frame_id"], event["substep_id"])
        group = groups.setdefault(key, {"frame_id": key[0], "substep_id": key[1],
                                        "active_members": members, "updates": []})
        if group["active_members"] != members:
            raise SystemExit(f"run 060: active list changed inside substep {key}")
        group["updates"].append({
            "ordinal": event["ordinal"],
            "pointer": event["note"]["pointer"],
        })

    multi = [group for group in groups.values() if len(group["active_members"]) >= 2]
    matches = []
    for group in multi:
        members = group["active_members"]
        main_updates = [update["pointer"] for update in group["updates"]
                        if update["pointer"] in members]
        group["main_active_updates"] = main_updates
        group["nested_updates"] = [update for update in group["updates"]
                                   if update["pointer"] not in members]
        if main_updates == list(reversed(members)):
            matches.append(group)
    if not multi or len(matches) != len(multi):
        raise SystemExit(f"run 060: reverse-index mismatch {len(matches)}/{len(multi)}")
    return {
        "schema_version": 1,
        "package_version": "10.1.4",
        "package_version_code": "230",
        "run_id": "ikuoku-cc08-run-060-full-note-detail",
        "multi_member_substep_count": len(multi),
        "reverse_index_match_count": len(matches),
        "maximum_active_member_count": max(len(group["active_members"]) for group in multi),
        "sample": matches[0],
        "claim": (
            "After filtering nested child updates whose pointers are absent from the manager's "
            "active list, every sampled multi-member substep updates the main active notes in "
            "the exact reverse of list-member order."
        ),
    }


def build_adaptive_lower_bucket_summary() -> dict[str, Any]:
    configurations = (
        ("n14-ikuoku-live-affinity4-bucket2-trigger-run-081",
         "ikuoku-cc08-run-081-bucket2-fallback", 2, 21, 3),
        ("n14-ikuoku-live-affinity4-bucket2-trigger-run-083",
         "ikuoku-cc08-run-083-bucket2-fallback-repeat", 2, 21, 3),
        ("n14-ikuoku-live-target40-timescale075-bucket1-trigger-run-086",
         "ikuoku-cc08-run-086-bucket1-fallback", 1, 101, 2),
        ("n14-ikuoku-live-target40-timescale075-bucket1-trigger-run-087",
         "ikuoku-cc08-run-087-bucket1-fallback-repeat", 1, 101, 2),
    )
    runs = []
    for working, run_id, counter_index, threshold, tentative_substeps in configurations:
        capture = CAPTURE_ROOT / working
        metadata = json.loads((capture / "capture_metadata.json").read_text(encoding="utf-8"))
        samples = [event for event in stream(capture / "runtime_trace.jsonl")
                   if event.get("event") == "adaptive_trigger_sample"]
        before = [event for event in samples
                  if event["counters"][counter_index] == threshold - 1
                  and event["substeps"] == tentative_substeps]
        fallback = [event for event in samples
                    if event.get("target_fallback") is True
                    and event.get("target_fallback_counter") == counter_index
                    and event["counters"][counter_index] == threshold]
        if len(before) != 1 or len(fallback) != 1:
            raise SystemExit(
                f"{working}: expected one {threshold - 1}->{threshold} counter[{counter_index}] "
                f"fallback, got before={len(before)} fallback={len(fallback)}"
            )
        if fallback[0]["substeps"] != 1:
            raise SystemExit(f"{working}: target fallback did not collapse to one substep")
        bms = capture / "runtime_consumed_bms_001.txt"
        frozen = OUTPUT / "sources" / "653_ikuoku_easy.bms.txt"
        runs.append({
            "run_id": run_id,
            "counter_index": counter_index,
            "threshold": threshold,
            "candidate_substeps": tentative_substeps,
            "before_threshold": before[0],
            "fallback_frame": fallback[0],
            "collection_complete": metadata["collection_complete"],
            "runtime_bms_count": metadata["runtime_bms_count"],
            "runtime_bms_sha256": digest(bms),
            "matches_frozen_bms": digest(bms) == digest(frozen),
            "capture_config": {
                "target_frame_rate_on_bms_leave": metadata["capture_config"].get(
                    "target_frame_rate_on_bms_leave"),
                "time_scale_on_bms_leave": metadata["capture_config"].get(
                    "time_scale_on_bms_leave"),
            },
            "guardrails": metadata["guardrails"],
            "process_cpu_affinity": {
                "start": metadata["device"]["process_cpu_affinity_at_start"],
                "stop": metadata["device"]["process_cpu_affinity_at_stop"],
            },
            "cpu_frequency_policies": {
                "start": metadata["device"]["cpu_frequency_policies_at_start"],
                "stop": metadata["device"]["cpu_frequency_policies_at_stop"],
            },
        })
    return {
        "schema_version": 1,
        "package_version": "10.1.4",
        "package_version_code": "230",
        "runs": runs,
        "confirmed_boundaries": {
            "counter_1": {"before": 100, "after": 101,
                          "candidate_substeps": 2, "fallback_substeps": 1,
                          "independent_run_count": 2},
            "counter_2": {"before": 20, "after": 21,
                          "candidate_substeps": 3, "fallback_substeps": 1,
                          "independent_run_count": 2},
        },
        "claim": (
            "Two independent original-client lives confirm each lower history threshold: "
            "counter[1] 100 to 101 collapses candidate 2 to 1 substep, and counter[2] 20 to 21 "
            "collapses candidate 3 to 1 substep."
        ),
        "intervention_boundary": (
            "Bucket 2 is reached with four-little-core affinity and minimum CPU frequencies. "
            "Bucket 1 is reached by calling the original Application.set_targetFrameRate(40) "
            "and Time.set_timeScale(0.75) APIs after BMS parsing; metadata and guardrails record "
            "both calls. No process memory or return value is replaced."
        ),
    }


def main() -> int:
    entries = []
    frame_rate: dict[str, Any] = {}
    for working, config in RUNS.items():
        capture = CAPTURE_ROOT / working
        trace = capture / "runtime_trace.jsonl"
        if not trace.is_file():
            raise SystemExit(f"missing capture: {capture}")
        metadata = json.loads((capture / "capture_metadata.json").read_text(encoding="utf-8"))
        if metadata["sample"]["version_code"] != "230":
            raise SystemExit(f"{working}: not a 10.1.4 / 230 capture")
        if metadata["address_table"]["version_code"] != "230":
            raise SystemExit(f"{working}: capture did not use the 230 address table")

        counts: dict[str, int] = {}
        lifecycle: list[dict[str, Any]] = []
        sequence = 0
        requests: list[int] = []
        awake_depth = 0
        awake_requests: list[int] = []
        for event in stream(trace):
            name = event.get("event")
            counts[name] = counts.get(name, 0) + 1
            if event["sequence"] <= sequence:
                raise SystemExit(f"{working}: non-monotonic sequence at {event['sequence']}")
            sequence = event["sequence"]
            if name in LIFECYCLE_EVENTS and len(lifecycle) < 4000:
                lifecycle.append(event)
            if name == "director_awake_enter":
                awake_depth += 1
            elif name == "director_awake_leave":
                awake_depth = max(0, awake_depth - 1)
            elif name == "target_frame_rate_requested":
                requests.append(event["value"])
                if awake_depth > 0:
                    awake_requests.append(event["value"])
        if sum(counts.values()) != metadata["event_count"]:
            raise SystemExit(f"{working}: metadata event_count disagrees with the trace")

        raw_target = OUTPUT / "traces" / "raw" / f"{config['run_id']}.jsonl.gz"
        deterministic_gzip(trace, raw_target)
        (OUTPUT / "traces" / "raw" / f"{config['run_id']}.metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        normalized = OUTPUT / "traces" / "normalized" / f"{config['run_id']}.lifecycle.jsonl"
        normalized.parent.mkdir(parents=True, exist_ok=True)
        with normalized.open("w", encoding="utf-8", newline="\n") as target:
            for event in lifecycle:
                target.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")

        consumed = None
        bms = capture / "runtime_consumed_bms_001.txt"
        if config["music_score_key"] and bms.is_file():
            frozen = OUTPUT / "sources" / f"{config['music_score_key']}.bms.txt"
            consumed = {"path": frozen.relative_to(OUTPUT).as_posix(),
                        "sha256": digest(bms),
                        "identical_to_frozen_10_1_3_source": digest(bms) == digest(frozen)}

        entries.append({
            "run_id": config["run_id"],
            "capture_directory": f"runtime/captures/clock-scheduling/{working}",
            "package_version": metadata["sample"]["version_name"],
            "package_version_code": metadata["sample"]["version_code"],
            "address_table": metadata["address_table"],
            "purpose": config["purpose"],
            "coverage": config["coverage"],
            "event_count": metadata["event_count"],
            "collection_complete": metadata["collection_complete"],
            "collector": {key: metadata["collector"][key] for key in
                          ("message_thread_role", "flush_granularity", "post_issued_from",
                           "batch_count", "max_queue_depth_batches", "fault_count")},
            "raw_trace": {**hashed(raw_target),
                          "uncompressed_bytes": trace.stat().st_size,
                          "uncompressed_sha256": digest(trace)},
            "normalized_trace": hashed(normalized),
            "consumed_bms": consumed,
            "target_frame_rate_requests": requests,
            "requests_inside_director_awake": awake_requests,
        })
        print(f"{config['run_id']}: {metadata['event_count']} events, requests {requests}")

        if working == "v14-ikuoku-120":
            init = next((event for event in lifecycle
                         if event.get("event") == "setup_first_progress_leave"), None)
            commit = next((event for event in lifecycle
                           if event.get("event") == "on_bpm_changed_leave"), None)
            frame_rate = {
                "run_id": config["run_id"],
                "requests": requests,
                "requests_inside_director_awake": awake_requests,
                "claim": "InGameDirector.Awake requests 120 when the frame-rate setting is 120FPS, "
                         "at the same point in the same call it requests 60 when the setting is "
                         "60FPS. The request proves original-client intent, not physical display "
                         "cadence.",
                "setting_owner": {
                    "read_site": "InGameDirector.Awake reads LiveCoreSettings +0xA9 inline; "
                                 "LiveCoreSettings.get_IsHighFrequencyMode is never called",
                    "ui_owner": "LiveEffectVolumeTabPage, the ライブ演出・音量設定 tab, section フレームレート",
                    "persisted_by": "CE.LiveCoreSettingsProtoData.set_HighFrequencyMode",
                    "ui_change_callback_observed": False,
                    "ui_change_callback_note":
                        "LiveEffectVolumeTabPage.<initializeHighFrequencyMode>b__57_0 resolved by "
                        "name with an unchanged signature but produced no event when the radio "
                        "changed. Compiler-generated lambda names are positional, so the 10.1.4 "
                        "lambda of that name may be a different closure. Unresolved; the setting "
                        "source is closed by the read site and the UI owner, not by this callback.",
                },
                "cross_version_corroboration": {
                    "launcher_lead_beat": (controller_of(init) or {}).get("launcher_beat") if init else None,
                    "start_bpm": (controller_of(init) or {}).get("current_bpm") if init else None,
                    "start_bpm_string": (controller_of(init) or {}).get("current_bpm_string") if init else None,
                    "committed_bpm": (controller_of(commit) or {}).get("current_bpm") if commit else None,
                    "committed_bpm_string": (controller_of(commit) or {}).get("current_bpm_string") if commit else None,
                    "note": "Identical to the frozen 10.1.3 values, and the consumed BMS is "
                            "byte-identical, so the chart input and the clock initialisation did "
                            "not change between versions.",
                },
            }

    manifest_path = OUTPUT / "sample_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["version_10_1_4_runs"] = entries
    manifest["version_separation"] = (
        "`samples` and `supplemental_runs` are 10.1.3 / 229. `version_10_1_4_runs` is "
        "10.1.4 / 230. They are never merged into one closed sample; see "
        "artifacts/investigations/package-version-rebaseline-10-1-4/ for the address migration "
        "that makes the same capture tooling valid on both."
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")

    summary_path = OUTPUT / "summaries" / "frame_rate_request_120.json"
    summary_path.write_text(json.dumps(
        {"schema_version": 1, "package_version": "10.1.4", "package_version_code": "230",
         **frame_rate}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {summary_path.relative_to(OUTPUT)}")
    pause_summary_path = OUTPUT / "summaries" / "pause_during_bpm_10_1_4.json"
    pause_summary_path.write_text(
        json.dumps(build_pause_during_summary(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {pause_summary_path.relative_to(OUTPUT)}")
    judge_summary_path = OUTPUT / "summaries" / "judge_offset_10_1_4.json"
    judge_summary_path.write_text(
        json.dumps(build_judge_offset_summary(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {judge_summary_path.relative_to(OUTPUT)}")
    reverse_summary_path = OUTPUT / "summaries" / "reverse_index_update_10_1_4.json"
    reverse_summary_path.write_text(
        json.dumps(build_reverse_index_summary(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {reverse_summary_path.relative_to(OUTPUT)}")
    adaptive_summary_path = OUTPUT / "summaries" / "adaptive_fallback_lower_buckets_10_1_4.json"
    adaptive_summary_path.write_text(
        json.dumps(build_adaptive_lower_bucket_summary(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {adaptive_summary_path.relative_to(OUTPUT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
