#!/usr/bin/env python3
"""Promote the second runtime-capture pass into the clock-scheduling oracle package.

Pass 1 (`build_runtime_oracle.py`) froze the CC03 and CC08 activation lifecycles. This pass adds
the samples that pass 1 left unresolved: adaptive substeps with the live history fallback, the
zero-BPM-change single-step gate proven on a fresh process, three pause/resume brackets, and
positive/negative judgement-offset stepping.

Every capture is streamed. The schema-3 traces are 55-70 MB of JSON per run and must never be
loaded whole.

Run from anywhere:

    py artifacts/investigations/clock-scheduling-runtime-oracle/build_runtime_oracle_pass2.py
"""

from __future__ import annotations

import gzip
from hashlib import sha256
import json
from pathlib import Path
import shutil
from typing import Any, Callable, Iterator


OUTPUT = Path(__file__).resolve().parent
ROOT = OUTPUT.parents[2]
CAPTURE_ROOT = ROOT / "runtime" / "captures" / "clock-scheduling"

# Working capture directory -> frozen run id. The working names are session scratch; the run ids
# continue the numbering already used by the frozen pass-1 runs.
RUNS: dict[str, dict[str, Any]] = {
    "w02-ikuoku-scheduling-auto": {
        "run_id": "ikuoku-cc08-run-020-scheduling-60",
        "music_score_key": "653_ikuoku_easy",
        "purpose": "60-mode CC08 lifecycle, two-phase scheduling, and live adaptive substeps",
        "coverage": ["60_target_request", "dual_clock_initialization", "launcher_lead",
                     "CC08_lifecycle", "adaptive_2_3_4", "fallback_101_21_6",
                     "two_phase_scheduling"],
    },
    "w03-ikuoku-pause": {
        "run_id": "ikuoku-cc08-run-021-pause-during",
        "music_score_key": "653_ikuoku_easy",
        "purpose": "pause and resume while a BPM command is resident in the active BPM list",
        "coverage": ["pause_during_bpm"],
    },
    "w04-ikuoku-pause-bracket": {
        "run_id": "ikuoku-cc08-run-022-pause-bracket",
        "music_score_key": "653_ikuoku_easy",
        "purpose": "pause and resume before the BPM command is acquired and after it commits",
        "coverage": ["pause_before_bpm", "pause_after_bpm"],
    },
    "w05-tentai-zero-60": {
        "run_id": "tentai-zero-run-023-warm-process",
        "music_score_key": None,
        "purpose": "zero-BPM-change chart in a process that already parsed a BPM-change chart",
        "coverage": ["normal_zero_bpm_60", "process_accumulated_change_count"],
    },
    "w06-tentai-zero-freshproc": {
        "run_id": "tentai-zero-run-024-fresh-process",
        "music_score_key": None,
        "purpose": "zero-BPM-change chart as the first chart of a freshly started process",
        "coverage": ["normal_zero_bpm_60", "zero_change_single_step_gate"],
    },
    "w07-ikuoku-offset-plus5": {
        "run_id": "ikuoku-cc08-run-025-offset-plus5",
        "music_score_key": "653_ikuoku_easy",
        "purpose": "positive judgement offset stepping across a bar and across the BPM change",
        "coverage": ["positive_offset_cross_bpm", "positive_offset_cross_bar"],
    },
    "w08-ikuoku-offset-minus5": {
        "run_id": "ikuoku-cc08-run-026-offset-minus5",
        "music_score_key": "653_ikuoku_easy",
        "purpose": "negative judgement offset stepping with a bar borrow",
        "coverage": ["negative_offset_cross_bar"],
    },
}

LIFECYCLE_EVENTS = {
    "agent_ready", "target_frame_rate_requested", "device_utility_set_target_frame_rate",
    "high_frequency_mode_read", "director_awake_enter", "director_awake_leave",
    "manager_init_enter", "manager_init_leave", "analyze_bms_enter", "analyze_bms_leave",
    "setup_notes_enter", "setup_notes_leave", "setup_first_progress_enter",
    "setup_first_progress_leave", "setup_bpm_change_enter", "setup_bpm_change_leave",
    "bpm_pool_acquire_enter", "bpm_pool_acquire_leave", "bpm_object_setup_enter",
    "bpm_object_setup_leave", "bpm_object_update_enter", "bpm_object_update_leave",
    "bpm_object_commit_enter", "bpm_object_commit_leave", "update_bpm_enter",
    "update_bpm_leave", "on_bpm_changed_enter", "on_bpm_changed_leave",
    "bpm_object_reset_enter", "bpm_object_reset_leave",
}

PAUSE_EVENTS = {"pause_path_enter", "pause_path_leave", "game_state_change_enter",
                "game_state_change_leave"}

ADAPTIVE_EVENTS = {"adaptive_delta_input", "adaptive_bucket_increment",
                   "adaptive_substep_decision"}

JUDGE_EVENTS = {"judge_absolute_pos_enter", "judge_absolute_pos_leave", "judge_step_head",
                "judge_step_bpm", "judge_probes_armed", "judge_probes_disarmed"}

# The decompiled fallback comparisons, re-read from
# artifacts/rhythm/decompiled_bundles/note.c at the NoteManager.ExecUpdate slice. Element k of
# the uint[4] at NoteManager+0x78 lives at +0x20 + 4*k.
FALLBACK_COMPARISONS = [
    {"counter_index": 1, "offset": "+0x24", "predicate": "counters[1] >= 101",
     "insn_form": "if (*(uint *)(counters + 0x24) < 0x65) ... else substeps = 1"},
    {"counter_index": 2, "offset": "+0x28", "predicate": "counters[2] > 20",
     "insn_form": "if (0x14 < *(uint *)(counters + 0x28)) substeps = 1"},
    {"counter_index": 3, "offset": "+0x2c", "predicate": "counters[3] > 5",
     "insn_form": "if (5 < *(uint *)(counters + 0x2c)) substeps = 1"},
]


def file_digest(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, events: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as target:
        for event in events:
            target.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")


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
            shutil.copyfileobj(source, compressed, length=1024 * 1024)


def hashed(path: Path, relative_to: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(relative_to).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": file_digest(path),
    }


def controller_of(event: dict[str, Any]) -> dict[str, Any] | None:
    if "controller" in event and isinstance(event["controller"], dict):
        return event["controller"]
    manager = event.get("manager")
    if isinstance(manager, dict):
        if isinstance(manager.get("controller"), dict):
            return manager["controller"]
        note_manager = manager.get("note_manager")
        if isinstance(note_manager, dict) and isinstance(note_manager.get("controller"), dict):
            return note_manager["controller"]
    return None


def note_manager_of(event: dict[str, Any]) -> dict[str, Any] | None:
    manager = event.get("manager")
    if not isinstance(manager, dict):
        return None
    if isinstance(manager.get("note_manager"), dict):
        return manager["note_manager"]
    if "note_group_index" in manager:
        return manager
    return None


def clock_fields(controller: dict[str, Any] | None) -> dict[str, Any] | None:
    if controller is None:
        return None
    keys = ("current_bpm", "current_bpm_string", "basic_bpm", "basic_bpm_string", "next_bpm",
            "next_bpm_string", "launcher_bar", "launcher_beat", "launcher_absolute_pos",
            "music_bar", "music_beat", "music_absolute_pos", "before_music_pos", "float_bits")
    return {key: controller[key] for key in keys if key in controller}


def scheduling_fields(note_manager: dict[str, Any] | None) -> dict[str, Any] | None:
    if note_manager is None:
        return None
    keys = ("active_note_count", "active_note_list", "active_bpm_count", "active_bpm_list",
            "bpm_pool_cursor", "bpm_pool_length", "note_group_index", "bpm_change_count",
            "performance_counters", "note_batch_count")
    return {key: note_manager[key] for key in keys if key in note_manager}


# --------------------------------------------------------------------------------------------
# per-run collectors
# --------------------------------------------------------------------------------------------


class RunScan:
    """One streaming pass over a capture, gathering everything the summaries need."""

    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.lifecycle: list[dict[str, Any]] = []
        self.pause: list[dict[str, Any]] = []
        self.adaptive: list[dict[str, Any]] = []
        self.judge_calls: list[dict[str, Any]] = []
        self.frame_rate_requests: list[int] = []
        self.high_frequency_reads: list[Any] = []
        self.first_frame: dict[str, Any] | None = None
        self.last_frame: dict[str, Any] | None = None
        self.frame_count = 0
        self.substep_count = 0
        self.max_sequence = 0
        self.sequence_monotonic = True
        self.setup_first_progress: list[dict[str, Any]] = []
        self.agent_ready: dict[str, Any] | None = None
        self.scheduling_windows: list[list[dict[str, Any]]] = []
        self.judgement_adjust_value: Any = None
        # freeze detection
        self.freezes: list[dict[str, Any]] = []
        self._open_freeze: dict[str, Any] | None = None
        self._last_frame_before: dict[str, Any] | None = None
        self._previous_frame_before: dict[str, Any] | None = None
        self._pending_judge: dict[str, Any] | None = None
        self._window: list[dict[str, Any]] = []
        self._window_substep: tuple[int, int] | None = None

    # -- window capture for scheduling order -------------------------------------------------
    def _feed_window(self, event: dict[str, Any]) -> None:
        key = (event.get("frame_id"), event.get("substep_id"))
        if key != self._window_substep:
            if self._window and self._is_interesting_window(self._window):
                if len(self.scheduling_windows) < 3:
                    self.scheduling_windows.append(self._window)
            self._window = []
            self._window_substep = key
        if len(self._window) < 400:
            self._window.append(event)

    @staticmethod
    def _is_interesting_window(window: list[dict[str, Any]]) -> bool:
        names = {event.get("event") for event in window}
        return ("note_update_enter" in names
                and "note_after_update_enter" in names
                and "clock_substep_enter" in names
                and len([e for e in window if e.get("event") == "note_update_enter"]) >= 2)

    def feed(self, event: dict[str, Any]) -> None:
        name = event.get("event")
        self.counts[name] = self.counts.get(name, 0) + 1
        sequence = event.get("sequence", 0)
        if sequence <= self.max_sequence:
            self.sequence_monotonic = False
        self.max_sequence = max(self.max_sequence, sequence)

        if name == "agent_ready":
            self.agent_ready = event
        elif name == "target_frame_rate_requested":
            self.frame_rate_requests.append(event.get("value"))
        elif name == "high_frequency_mode_read":
            self.high_frequency_reads.append(event)
        elif name == "setup_first_progress_enter" or name == "setup_first_progress_leave":
            self.setup_first_progress.append(event)
        elif name == "frame_enter":
            self.frame_count += 1
            if self.first_frame is None:
                self.first_frame = event
            self.last_frame = event
            self._previous_frame_before = self._last_frame_before
            self._last_frame_before = event
            if self._open_freeze is not None:
                self._open_freeze["resumed_frame"] = event.get("frame_id")
                self._open_freeze["frame_after_resume"] = self._slim_frame(event)
                self.freezes.append(self._open_freeze)
                self._open_freeze = None
        elif name == "clock_substep_enter":
            self.substep_count += 1

        if name in LIFECYCLE_EVENTS and len(self.lifecycle) < 4000:
            self.lifecycle.append(event)
        if name in PAUSE_EVENTS:
            self.pause.append(event)
            label = event.get("label")
            if name == "pause_path_leave" and label == "InGameManager.onPauseSound":
                self._open_freeze = {
                    "paused_at_frame": event.get("frame_id"),
                    "pause_sequence": event.get("sequence"),
                    "frame_before_pause": self._slim_frame(self._last_frame_before),
                    # the frame before that one gives the run's own per-frame advance, which is the
                    # baseline the freeze crossing is compared against
                    "frame_two_before_pause": self._slim_frame(self._previous_frame_before),
                    "events_during_freeze": {},
                }
            if name == "pause_path_enter" and label == "InGameManager.onExecutePause":
                pass
        if self._open_freeze is not None and name is not None:
            bucket = self._open_freeze["events_during_freeze"]
            bucket[name] = bucket.get(name, 0) + 1
        if name in ADAPTIVE_EVENTS:
            self.adaptive.append(event)
        if name == "judge_adjust_enter" and self.judgement_adjust_value is None:
            self.judgement_adjust_value = event.get("judgement_adjust_value_b")
        if name in JUDGE_EVENTS:
            self._feed_judge(event)
        if name in {"clock_substep_enter", "clock_substep_leave", "note_update_enter",
                    "note_update_leave", "note_after_update_enter", "note_deactivate_enter",
                    "activate_batch_enter", "activate_batch_leave", "activate_note_enter",
                    "activate_command_note_enter", "activate_bpm_process_enter",
                    "activate_bpm_process_leave", "bpm_object_update_enter",
                    "bpm_object_update_leave", "play_group_enter", "play_group_leave",
                    "frame_enter", "frame_leave"}:
            self._feed_window(event)

    @staticmethod
    def _slim_frame(event: dict[str, Any] | None) -> dict[str, Any] | None:
        if event is None:
            return None
        return {
            "sequence": event.get("sequence"),
            "frame_id": event.get("frame_id"),
            "clock": clock_fields(controller_of(event)),
            "scheduling": scheduling_fields(note_manager_of(event)),
        }

    def _feed_judge(self, event: dict[str, Any]) -> None:
        name = event["event"]
        if name == "judge_absolute_pos_enter":
            self._pending_judge = {"enter": event, "heads": [], "bpms": []}
            return
        if self._pending_judge is None:
            return
        if name == "judge_step_head":
            self._pending_judge["heads"].append(event)
        elif name == "judge_step_bpm":
            self._pending_judge["bpms"].append(event)
        elif name == "judge_absolute_pos_leave":
            self._pending_judge["leave"] = event
            self.judge_calls.append(self._pending_judge)
            self._pending_judge = None

    def close(self) -> None:
        if self._open_freeze is not None:
            self._open_freeze["resumed_frame"] = None
            self._open_freeze["frame_after_resume"] = None
            self.freezes.append(self._open_freeze)
            self._open_freeze = None
        if self._window and self._is_interesting_window(self._window):
            if len(self.scheduling_windows) < 3:
                self.scheduling_windows.append(self._window)


def scan(capture: Path) -> RunScan:
    result = RunScan()
    for event in stream(capture / "runtime_trace.jsonl"):
        result.feed(event)
    result.close()
    return result


# --------------------------------------------------------------------------------------------
# summary builders
# --------------------------------------------------------------------------------------------


def initialization_summary(scans: dict[str, RunScan]) -> dict[str, Any]:
    samples = []
    for working, config in RUNS.items():
        run = scans[working]
        leave = next((event for event in run.setup_first_progress
                      if event.get("event") == "setup_first_progress_leave"), None)
        enter = next((event for event in run.setup_first_progress
                      if event.get("event") == "setup_first_progress_enter"), None)
        samples.append({
            "run_id": config["run_id"],
            "target_frame_rate_requests": run.frame_rate_requests,
            "high_frequency_mode_read_events": len(run.high_frequency_reads),
            "setup_first_progress_enter": clock_fields(controller_of(enter)) if enter else None,
            "setup_first_progress_leave": clock_fields(controller_of(leave)) if leave else None,
            "first_frame": RunScan._slim_frame(run.first_frame),
        })
    return {
        "schema_version": 1,
        "pass": 2,
        "note": (
            "Every pass-2 run requested Application.targetFrameRate(60). "
            "LiveCoreSettings.get_IsHighFrequencyMode produced no event in any run, so the "
            "managed getter is not on the consumed path and the 120 branch stays unresolved."
        ),
        "samples": samples,
    }


def adaptive_summary(scans: dict[str, RunScan]) -> dict[str, Any]:
    per_run = []
    for working, config in RUNS.items():
        run = scans[working]
        decisions = [e for e in run.adaptive if e["event"] == "adaptive_substep_decision"]
        increments = [e for e in run.adaptive if e["event"] == "adaptive_bucket_increment"]
        histogram: dict[str, int] = {}
        for decision in decisions:
            key = str(decision.get("substeps"))
            histogram[key] = histogram.get(key, 0) + 1
        bucket_histogram: dict[str, int] = {}
        mapping: dict[str, set[int]] = {}
        for increment in increments:
            key = str(increment.get("bucket_index"))
            bucket_histogram[key] = bucket_histogram.get(key, 0) + 1
            mapping.setdefault(key, set()).add(increment.get("tentative_substeps"))
        # the first frame where a tentative multi-step decision collapsed to a single step
        fallback_first = None
        for increment, decision in zip(increments, decisions):
            if decision.get("substeps") == 1 and (increment.get("tentative_substeps") or 1) > 1:
                fallback_first = {
                    "frame_id": decision.get("frame_id"),
                    "delta_time": decision.get("delta_time_before_division"),
                    "delta_time_bits": decision.get("delta_time_before_division_bits"),
                    "tentative_substeps": increment.get("tentative_substeps"),
                    "bucket_index": increment.get("bucket_index"),
                    "counters_after_decision": decision.get("counters"),
                    "substeps": decision.get("substeps"),
                }
                break
        last_multi = None
        for increment, decision in zip(increments, decisions):
            if decision.get("substeps", 1) > 1:
                last_multi = {
                    "frame_id": decision.get("frame_id"),
                    "tentative_substeps": increment.get("tentative_substeps"),
                    "counters_after_decision": decision.get("counters"),
                    "substeps": decision.get("substeps"),
                }
        per_run.append({
            "run_id": config["run_id"],
            "frame_count": run.frame_count,
            "clock_substep_count": run.substep_count,
            "adaptive_decision_count": len(decisions),
            "adaptive_bucket_increment_count": len(increments),
            "substep_histogram": histogram,
            "bucket_histogram": bucket_histogram,
            "bucket_to_tentative_substeps": {key: sorted(value) for key, value in
                                             sorted(mapping.items())},
            "last_multi_substep_decision": last_multi,
            "first_history_fallback": fallback_first,
            "single_step_per_frame": run.frame_count == run.substep_count,
        })
    constants = None
    for run in scans.values():
        if run.agent_ready is not None:
            constants = run.agent_ready.get("constants")
            break
    return {
        "schema_version": 1,
        "pass": 2,
        "rodata_constants": constants,
        "bucket_selection": [
            {"bucket_index": 0, "condition": "delta < 0.0179999992", "tentative_substeps": 1,
             "counter_offset": "+0x20"},
            {"bucket_index": 1, "condition": "0.0179999992 <= delta < 0.0329999998",
             "tentative_substeps": 2, "counter_offset": "+0x24"},
            {"bucket_index": 2, "condition": "0.0329999998 <= delta < 0.0500000007",
             "tentative_substeps": 3, "counter_offset": "+0x28"},
            {"bucket_index": 3, "condition": "0.0500000007 <= delta", "tentative_substeps": 4,
             "counter_offset": "+0x2c"},
        ],
        "fallback_comparisons": FALLBACK_COMPARISONS,
        "static_correction": {
            "status": "confirmed",
            "frozen_artifact": "artifacts/investigations/music-bar-division-adaptive-substeps/README.md",
            "frozen_claim": "fallbacks were mapped to counter[0] > 100, counter[1] > 20, counter[2] >= 6 "
                            "against buckets 0/1/2, with bucket 3 uncompared",
            "runtime_finding": "the compared counters are counters[1], counters[2] and counters[3]; "
                               "counters[0] is incremented for sub-0.018 s frames and never compared",
            "decompiler_evidence": "artifacts/rhythm/decompiled_bundles/note.c, NoteManager.ExecUpdate "
                                   "slice at 0x37760C0",
            "boundaries_unchanged": ["101", "21", "6"],
        },
        "zero_change_gate": {
            "status": "confirmed",
            "fresh_process_run": RUNS["w06-tentai-zero-freshproc"]["run_id"],
            "warm_process_run": RUNS["w05-tentai-zero-60"]["run_id"],
            "claim": "A chart with no BPM-change command takes the fixed single-step path and "
                     "updates none of the four counters, but only when the process has not already "
                     "parsed a BPM-change chart: NoteManager +0x74 accumulates across the process.",
        },
        "collection_boundary": {
            "slow_frames_are_collector_induced": True,
            "detail": "The agent's per-frame snapshots slow the client to roughly 20 fps, so the "
                      "2/3/4-substep samples come from collector-induced slow frames rather than a "
                      "deliberately injected stall. Each decision records its own Float32 input, "
                      "selected bucket, counter array and output, so the branch mapping is closed; "
                      "the delta distribution of an untraced client is not.",
        },
        "runs": per_run,
    }


def pause_summary(scans: dict[str, RunScan]) -> dict[str, Any]:
    brackets = []
    for working in ("w03-ikuoku-pause", "w04-ikuoku-pause-bracket"):
        run = scans[working]
        config = RUNS[working]
        path = [{
            "sequence": event.get("sequence"),
            "event": event.get("event"),
            "label": event.get("label"),
            "frame_id": event.get("frame_id"),
            "current_game_state": (event.get("manager") or {}).get("current_game_state"),
            "pause_state": (event.get("manager") or {}).get("pause_state"),
            "scheduling": scheduling_fields(note_manager_of(event)),
        } for event in run.pause]
        for freeze in run.freezes:
            frozen = freeze.get("frame_before_pause")
            earlier = freeze.get("frame_two_before_pause")
            resumed = freeze.get("frame_after_resume")
            comparison = None
            if frozen and resumed and frozen.get("clock") and resumed.get("clock"):
                before = frozen["clock"]
                after = resumed["clock"]
                # The two frame_enter events bracketing the freeze are consecutive frames, so the
                # position difference between them is one ordinary frame of advance. Comparing it
                # against the run's own preceding frame-to-frame advance is what shows the client
                # resumes in place instead of catching up the wall-clock time spent paused.
                across = after.get("music_absolute_pos") - before.get("music_absolute_pos")
                baseline = None
                if earlier and earlier.get("clock"):
                    baseline = before.get("music_absolute_pos") - earlier["clock"].get("music_absolute_pos")
                comparison = {
                    "frame_before_pause": frozen.get("frame_id"),
                    "frame_after_resume": resumed.get("frame_id"),
                    "consecutive_frames": (resumed.get("frame_id") or 0) - (frozen.get("frame_id") or 0) == 1,
                    "music_absolute_pos_before": before.get("music_absolute_pos"),
                    "music_absolute_pos_after": after.get("music_absolute_pos"),
                    "music_advance_across_freeze": across,
                    "music_advance_previous_frame": baseline,
                    "advance_is_one_ordinary_frame": (
                        baseline is not None and baseline > 0 and 0.25 <= across / baseline <= 4.0
                    ),
                    "launcher_absolute_pos_before": before.get("launcher_absolute_pos"),
                    "launcher_absolute_pos_after": after.get("launcher_absolute_pos"),
                    "current_bpm_before": before.get("current_bpm"),
                    "current_bpm_after": after.get("current_bpm"),
                    "current_bpm_string_before": before.get("current_bpm_string"),
                    "current_bpm_string_after": after.get("current_bpm_string"),
                }
            freeze_events = freeze.get("events_during_freeze", {})
            brackets.append({
                "run_id": config["run_id"],
                "paused_at_frame": freeze.get("paused_at_frame"),
                "resumed_frame": freeze.get("resumed_frame"),
                "active_bpm_count_while_frozen": (frozen or {}).get("scheduling", {}).get("active_bpm_count")
                if frozen else None,
                "note_manager_exec_update_calls_while_frozen": freeze_events.get("frame_enter", 0),
                "ingame_manager_exec_calls_while_frozen": freeze_events.get("ingame_manager_exec_enter", 0),
                "play_state_update_calls_while_frozen": freeze_events.get("play_state_update_enter", 0),
                "clock_substep_calls_while_frozen": freeze_events.get("clock_substep_enter", 0),
                "bpm_object_update_calls_while_frozen": freeze_events.get("bpm_object_update_enter", 0),
                "note_update_calls_while_frozen": freeze_events.get("note_update_enter", 0),
                "batch_activation_calls_while_frozen": freeze_events.get("activate_batch_enter", 0),
                "frame_before_pause": frozen,
                "frame_after_resume": resumed,
                "clock_comparison": comparison,
            })
        run.pause_path_projection = path  # type: ignore[attr-defined]
    return {
        "schema_version": 1,
        "pass": 2,
        "gate": {
            "status": "confirmed",
            "detail": "InGameManager.ExecUpdate keeps running through the freeze while "
                      "NoteManager.ExecUpdate is not entered at all, so the gate sits above the "
                      "note-manager frame and not inside it.",
        },
        "ordered_path": [
            {"step": 1, "owner_method": "InGameManager.onExecutePause",
             "observed": "GameState 5, PauseState 0 -> 1; prePauseSound nested inside"},
            {"step": 2, "owner_method": "InGameManager.onPauseSound",
             "observed": "next frame, GameState 5 -> 7; pauseSound nested inside"},
            {"step": 3, "owner_method": "InGameManager.onClickResume",
             "observed": "PauseState 1 -> 0"},
            {"step": 4, "owner_method": "InGameManager.onFinishResumeCountdownAnimation",
             "observed": "PauseState 0 -> 2"},
            {"step": 5, "owner_method": "InGameManager.resumeGame",
             "observed": "GameState 7 -> 5"},
        ],
        "state_controller_note": "InGameStateController.ChangeGameState produced no event in any "
                                 "pause run; the observed transitions are the InGameManager fields.",
        "brackets": brackets,
    }


def judge_summary(scans: dict[str, RunScan]) -> dict[str, Any]:
    runs = []
    for working in ("w07-ikuoku-offset-plus5", "w08-ikuoku-offset-minus5"):
        run = scans[working]
        config = RUNS[working]
        cross_bpm = []
        cross_bar = []
        plain = []
        for call in run.judge_calls:
            bars = {head.get("cursor_bar") for head in call["heads"]}
            bpms = {step.get("step_bpm") for step in call["bpms"]}
            if len(bpms) > 1:
                cross_bpm.append(call)
            elif len(bars) > 1:
                cross_bar.append(call)
            elif not plain:
                plain.append(call)

        def project(call: dict[str, Any]) -> dict[str, Any]:
            return {
                "frame_id": call["enter"].get("frame_id"),
                "substep_id": call["enter"].get("substep_id"),
                "direction": call["enter"].get("direction"),
                "frames_argument": call["enter"].get("frames_argument"),
                "entry_clock": clock_fields(controller_of(call["enter"])),
                "steps": [{
                    "step_index": head.get("step_index"),
                    "total_steps": head.get("total_steps"),
                    "cursor_bar": head.get("cursor_bar"),
                    "cursor_beat": head.get("cursor_beat"),
                    "cursor_beat_bits": head.get("cursor_beat_bits"),
                    "cursor_bar_ticks": head.get("cursor_bar_ticks"),
                    "step_bpm": (call["bpms"][index].get("step_bpm")
                                 if index < len(call["bpms"]) else None),
                    "step_bpm_bits": (call["bpms"][index].get("step_bpm_bits")
                                      if index < len(call["bpms"]) else None),
                } for index, head in enumerate(call["heads"])],
                "result": call["leave"].get("result"),
                "result_bits": call["leave"].get("result_bits"),
            }

        runs.append({
            "run_id": config["run_id"],
            "judgement_adjust_value_b": run.judgement_adjust_value,
            "call_count": len(run.judge_calls),
            "cross_bpm_call_count": len(cross_bpm),
            "cross_bar_call_count": len(cross_bar),
            "cross_bpm_sample": project(cross_bpm[0]) if cross_bpm else None,
            "cross_bar_sample": project(cross_bar[0]) if cross_bar else None,
            "plain_sample": project(plain[0]) if plain else None,
        })
    return {
        "schema_version": 1,
        "pass": 2,
        "step_model": {
            "status": "confirmed",
            "step_seconds": "1/60",
            "step_ticks_formula": "192 * bpm / (60 * 240)",
            "per_step_tempo_query": "each step re-reads the tempo at the cursor position instead of "
                                    "reusing CurrentBPM from the call site",
            "positive_direction_owner": "NoteManager.FastAbsolutePos",
            "negative_direction_owner": "NoteManager.SlowAbsolutePos",
        },
        "unresolved": {
            "negative_offset_cross_bpm": "no negative-direction call in the captured windows spans "
                                         "the tempo change; the armed windows sat before bar 16",
            "allowed_range": "the setting's permitted range is not closed; only -5 and +5 were "
                             "exercised",
        },
        "runs": runs,
    }


def scheduling_summary(scans: dict[str, RunScan]) -> dict[str, Any]:
    run = scans["w02-ikuoku-scheduling-auto"]
    windows = []
    for window in run.scheduling_windows:
        ordered = [{
            "sequence": event.get("sequence"),
            "event": event.get("event"),
            "label": event.get("label"),
            "ordinal": event.get("ordinal"),
            "note_pointer": (event.get("note") or {}).get("pointer"),
            "active_note_count": (scheduling_fields(note_manager_of(event)) or {}).get("active_note_count"),
            "active_note_list": (scheduling_fields(note_manager_of(event)) or {}).get("active_note_list"),
            "active_bpm_count": (scheduling_fields(note_manager_of(event)) or {}).get("active_bpm_count"),
        } for event in window]
        windows.append({
            "frame_id": window[0].get("frame_id"),
            "substep_id": window[0].get("substep_id"),
            "events": ordered,
        })
    return {
        "schema_version": 1,
        "pass": 2,
        "run_id": RUNS["w02-ikuoku-scheduling-auto"]["run_id"],
        "observed_order": [
            "clock_substep_enter / clock_substep_leave (main and launcher clock advance)",
            "bpm_object_update (active BPM list, forward order)",
            "note_update_enter / note_update_leave (main active note list)",
            "note_after_update_enter (survivors, recorded order)",
            "activate_batch_enter / activate_batch_leave (one pending batch per substep)",
        ],
        "event_counts": {name: run.counts.get(name, 0) for name in (
            "clock_substep_enter", "bpm_object_update_enter", "note_update_enter",
            "note_update_leave", "note_after_update_enter", "note_deactivate_enter",
            "activate_batch_enter", "activate_note_enter", "activate_command_note_enter",
            "activate_bpm_process_enter", "can_activate_note_leave")},
        "note_update_ordinal_direction": "recorded per event as `ordinal`; see the windows below "
                                         "for the observed sequence within one substep",
        "windows": windows,
        "unresolved": {
            "reverse_index_proof": "note detail ran on a 1-in-30 duty cycle, so a substep with a "
                                   "large active list was not captured end to end; the ordinal "
                                   "direction over a long list is not closed",
        },
    }


def main() -> int:
    scans: dict[str, RunScan] = {}
    supplemental: list[dict[str, Any]] = []
    for working, config in RUNS.items():
        capture = CAPTURE_ROOT / working
        if not (capture / "runtime_trace.jsonl").is_file():
            raise SystemExit(f"missing capture: {capture}")
        metadata = json.loads((capture / "capture_metadata.json").read_text(encoding="utf-8"))
        run = scan(capture)
        scans[working] = run
        if not run.sequence_monotonic:
            raise SystemExit(f"non-monotonic sequence in {working}")
        if run.counts.get("agent_ready", 0) != 1:
            raise SystemExit(f"{working}: expected exactly one agent_ready event")
        if metadata["event_count"] != sum(run.counts.values()):
            raise SystemExit(f"{working}: metadata event_count disagrees with the trace")

        raw_target = OUTPUT / "traces" / "raw" / f"{config['run_id']}.jsonl.gz"
        deterministic_gzip(capture / "runtime_trace.jsonl", raw_target)
        write_json(OUTPUT / "traces" / "raw" / f"{config['run_id']}.metadata.json", metadata)

        normalized: dict[str, list[dict[str, Any]]] = {}
        if run.lifecycle:
            normalized["lifecycle"] = run.lifecycle
        if run.pause:
            normalized["pause"] = run.pause
        if run.adaptive:
            normalized["adaptive"] = run.adaptive
        normalized_entries = []
        for topic, events in normalized.items():
            target = OUTPUT / "traces" / "normalized" / f"{config['run_id']}.{topic}.jsonl"
            write_jsonl(target, events)
            normalized_entries.append(hashed(target, OUTPUT))

        source_entry = None
        bms_path = capture / "runtime_consumed_bms_001.txt"
        if config["music_score_key"] and bms_path.is_file():
            source_target = OUTPUT / "sources" / f"{config['music_score_key']}.bms.txt"
            if source_target.is_file():
                if file_digest(source_target) != file_digest(bms_path):
                    raise SystemExit(
                        f"{working}: consumed BMS differs from the frozen "
                        f"{source_target.name}; a different chart cannot reuse the same source file")
            else:
                shutil.copyfile(bms_path, source_target)
            source_entry = hashed(source_target, OUTPUT)

        supplemental.append({
            "run_id": config["run_id"],
            "capture_directory": f"runtime/captures/clock-scheduling/{working}",
            "purpose": config["purpose"],
            "coverage": config["coverage"],
            "event_count": metadata["event_count"],
            "collection_complete": metadata["collection_complete"],
            "collector": {key: metadata["collector"][key] for key in
                          ("message_thread_role", "flush_granularity", "post_issued_from",
                           "batch_count", "max_queue_depth_batches", "fault_count")},
            "auto_live": True,
            "frame_count": run.frame_count,
            "clock_substep_count": run.substep_count,
            "raw_trace": {
                **hashed(raw_target, OUTPUT),
                "uncompressed_bytes": (capture / "runtime_trace.jsonl").stat().st_size,
                "uncompressed_sha256": file_digest(capture / "runtime_trace.jsonl"),
            },
            "normalized_traces": normalized_entries,
            "consumed_bms": source_entry,
        })
        print(f"{config['run_id']}: {metadata['event_count']} events, "
              f"{run.frame_count} frames, gz {raw_target.stat().st_size} bytes")

    write_json(OUTPUT / "summaries" / "pass2_initialization.json", initialization_summary(scans))
    write_json(OUTPUT / "summaries" / "pass2_adaptive_substeps.json", adaptive_summary(scans))
    write_json(OUTPUT / "summaries" / "pass2_pause_resume.json", pause_summary(scans))
    write_json(OUTPUT / "summaries" / "pass2_judge_offset.json", judge_summary(scans))
    write_json(OUTPUT / "summaries" / "pass2_scheduling_order.json", scheduling_summary(scans))

    manifest_path = OUTPUT / "sample_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    existing = {entry["run_id"] for entry in manifest.get("supplemental_runs", [])}
    kept = [entry for entry in manifest.get("supplemental_runs", [])
            if entry["run_id"] not in {run["run_id"] for run in supplemental}]
    manifest["supplemental_runs"] = kept + supplemental
    manifest["pass2_auto_live_boundary"] = (
        "Every pass-2 run used the client's own オートライブ so the chart plays to the end without "
        "human input. Clock, BPM and note scheduling run their normal paths; only the source of "
        "input judgement differs, and judgement display is suppressed by that mode."
    )
    write_json(manifest_path, manifest)
    print(f"supplemental_runs: {len(kept)} kept, {len(supplemental)} added "
          f"({len(existing)} previously present)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
