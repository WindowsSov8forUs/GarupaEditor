from __future__ import annotations

import json
import struct
from pathlib import Path


HERE = Path(__file__).resolve().parent


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def bits(value: float) -> str:
    return f"0x{struct.unpack('<I', struct.pack('<f', f32(value)))[0]:08X}"


def position(value: float) -> dict[str, object]:
    return {"value": f32(value), "bits": bits(value)}


def build() -> dict[str, object]:
    return {
        "schema_version": 1,
        "sample": "jp.co.craftegg.band 10.1.3 (229) arm64-v8a",
        "status": "confirmed-static-and-upstream-runtime-supplement-oracle",
        "excluded_by_stage": [
            "real-touch-thresholds",
            "finger-ownership",
            "sprite",
            "back-line",
            "audio",
            "particle",
            "score",
            "life",
            "skill",
        ],
        "cases": [
            {
                "case_id": "multiple-directional-left-auto-group",
                "evidence": ["S02", "S03", "S04", "S05"],
                "source_note": {
                    "classification": "method-fixture-backed-by-production-front-type-6",
                    "game_note_type": 10,
                    "front_note_type": 6,
                    "group_count": 3,
                },
                "settings": {"is_auto_live": True, "judgement_adjust_value_b": 0},
                "steps": [
                    {"event": "flick-begin", "state_before": "Move", "state_after": "Move", "submitted_result": 4},
                    {"event": "flick-synthetic-move", "synthetic_x": position(-500.0), "source_note_type": 10},
                    {"event": "head-perfect", "state_before": "Move", "state_after": "Deactive", "note_type": 10,
                     "raw_result": 4, "adjusted_result": 4, "add_combo": 1, "judge_timing": 0,
                     "multiple_directional_flick_note_count": 3, "one_frame_slot": 0},
                    {"event": "side-notes-used", "left_count": 1, "right_count": 1},
                    {"event": "reflect", "slots": [0], "entry_count": 1, "add_combo": 1},
                ],
            },
            {
                "case_id": "multiple-directional-right-auto-group",
                "evidence": ["S02", "S03", "S04", "S05"],
                "source_note": {
                    "classification": "method-fixture-backed-by-production-front-type-6",
                    "game_note_type": 11,
                    "front_note_type": 6,
                    "group_count": 2,
                },
                "settings": {"is_auto_live": True, "judgement_adjust_value_b": 0},
                "steps": [
                    {"event": "flick-begin", "state_before": "Move", "state_after": "Move", "submitted_result": 4},
                    {"event": "flick-synthetic-move", "synthetic_x": position(500.0), "source_note_type": 11},
                    {"event": "head-perfect", "state_before": "Move", "state_after": "Deactive", "note_type": 10,
                     "raw_result": 4, "adjusted_result": 4, "add_combo": 1, "judge_timing": 0,
                     "multiple_directional_flick_note_count": 2, "one_frame_slot": 0},
                    {"event": "side-notes-used", "left_count": 0, "right_count": 1},
                    {"event": "reflect", "slots": [0], "entry_count": 1, "add_combo": 1},
                ],
            },
            {
                "case_id": "slide-stop-selected-visible-intermediate",
                "evidence": ["S06", "R02:slide-stop"],
                "source_note": {"classification": "method-fixture", "family": "slide", "selected_after_index": 0},
                "settings": {"is_auto_live": True, "judgement_adjust_value_b": 0},
                "steps": [
                    {"event": "stop-before-crossing", "adjusted_position": position(179.99998474121094),
                     "state_before": "Stop", "state_after": "Stop", "selected_judged": False, "current_after_index": 0},
                    {"event": "stop-intermediate-perfect", "adjusted_position": position(180.0),
                     "state_before": "Stop", "state_after": "Stop", "phase": "intermediate", "note_type": 8,
                     "raw_result": 4, "adjusted_result": 4, "one_frame_slot": 0, "selected_judged": True},
                    {"event": "on-update-advance-judged-current", "current_after_before": 0, "current_after_after": 1},
                    {"event": "reflect", "slots": [0], "entry_count": 1, "add_combo": 1},
                ],
            },
            {
                "case_id": "pause-active-long-freeze-resume",
                "evidence": ["S07", "U03", "U04"],
                "source_note": {"classification": "composed-confirmed-manager-and-long-contract", "family": "long"},
                "steps": [
                    {"event": "head-perfect", "state_before": "Move", "state_after": "Wait", "linked_judged": False},
                    {"event": "pause-enter", "state_before": "Wait", "state_after": "Wait", "linked_judged": False},
                    {"event": "paused-frame", "music_advanced": False, "note_manager_entered": False,
                     "state_before": "Wait", "state_after": "Wait", "linked_judged": False, "one_frame_slots_unchanged": True},
                    {"event": "resume", "catch_up_substeps": 0, "state_before": "Wait", "state_after": "Wait"},
                    {"event": "tail-equal-no-crossing", "state_before": "Wait", "state_after": "Wait", "linked_judged": False},
                    {"event": "tail-strict-greater", "state_before": "Wait", "state_after": "Deactive", "linked_finish_before_tail": True},
                ],
            },
            {
                "case_id": "pause-active-slide-pending-slot-freeze",
                "evidence": ["S07", "U03", "U04"],
                "source_note": {"classification": "composed-confirmed-manager-and-slide-contract", "family": "slide"},
                "steps": [
                    {"event": "pause-enter", "state": "Wait", "current_after_index": 0, "occupied_slots": [0]},
                    {"event": "paused-frame", "music_advanced": False, "note_manager_entered": False,
                     "current_after_before": 0, "current_after_after": 0, "occupied_slots_before": [0], "occupied_slots_after": [0]},
                    {"event": "resume", "catch_up_substeps": 0},
                    {"event": "one-normal-current-transition", "current_after_before": 0, "current_after_after": 1},
                ],
            },
            {
                "case_id": "offset-plus5-cross-bpm-exact",
                "evidence": ["S08", "U03", "U04"],
                "source_note": {"classification": "committed-device-runtime-oracle", "run_id": "ikuoku-cc08-run-025-offset-plus5"},
                "settings": {"judgement_adjust_value_b": 5, "frames_argument": 5},
                "entry_music_cursor": {
                    "bar": 15,
                    "beat_progress": position(187.35589599609375),
                },
                "entry_music_absolute_position": position(3067.35595703125),
                "step_bpms": [99.5, 99.5, 99.5, 99.5, 95.5],
                "result_adjusted_position": position(3073.935791015625),
                "crossed_bar": True,
                "crossed_bpm": True,
            },
            {
                "case_id": "offset-minus5-cross-bar-exact",
                "evidence": ["S08", "U03", "U04"],
                "source_note": {"classification": "committed-device-runtime-oracle", "run_id": "ikuoku-cc08-run-026-offset-minus5"},
                "settings": {"judgement_adjust_value_b": -5, "frames_argument": 5},
                "entry_music_cursor": {
                    "bar": 5,
                    "beat_progress": position(0.454833984375),
                },
                "entry_music_absolute_position": position(960.454833984375),
                "step_bpms": [99.5, 99.5, 99.5, 99.5, 99.5],
                "result_adjusted_position": position(953.821533203125),
                "crossed_bar": True,
                "crossed_bpm": False,
            },
            {
                "case_id": "offset-zero-identity-exact",
                "evidence": ["S08", "U03"],
                "settings": {"judgement_adjust_value_b": 0},
                "entry_music_cursor": {
                    "bar": 5,
                    "beat_progress": position(0.454833984375),
                },
                "entry_music_absolute_position": position(960.454833984375),
                "result_adjusted_position": position(960.454833984375),
                "step_count": 0,
            },
            {
                "case_id": "multiple-source-order-interleaved-break",
                "evidence": ["S11", "S12", "S14", "G18", "G21"],
                "source_note": {
                    "classification": "method-fixture-with-interleaved-playable-root",
                    "absolute_position": 1424,
                },
                "source_order": [
                    {"slot": 0, "front_note_type": 6, "game_note_type": 11, "button_type": 4},
                    {"slot": 1, "front_note_type": 6, "game_note_type": 11, "button_type": 5},
                    {"slot": 2, "front_note_type": 3, "game_note_type": 4, "button_type": 0},
                    {"slot": 3, "front_note_type": 6, "game_note_type": 11, "button_type": 6},
                ],
                "multiple_candidate_source_order": [4, 5, 6],
                "source_order_runs": [[4, 5], [6]],
                "reverse_playable_update_buttons": [6, 0, 5, 4],
                "judged_buttons": [6, 5],
                "multiple_judgement_count": 2,
                "multiple_directional_flick_note_counts": [1, 2],
            },
            {
                "case_id": "one-frame-exhaustion-long-head-terminal-fault",
                "evidence": ["R02:long", "R02:one-frame", "G19"],
                "native_order": [
                    "change-state-wait",
                    "judge-front-note",
                    "get-usable-one-frame-data",
                    "exception-after-five-is-use-slots",
                ],
                "state_at_native_failure": "Wait",
                "portable_boundary": {
                    "result": "evidence-required",
                    "manager_state": "faulted",
                    "five_committed_entries_retained": True,
                    "subsequent_step": "same-latched-failure",
                    "allowed_after_fault": ["snapshot", "dispose"],
                },
            },
            {
                "case_id": "one-frame-exhaustion-slide-head-terminal-fault",
                "evidence": ["R02:slide", "R02:one-frame", "G19"],
                "native_order": [
                    "change-state-wait",
                    "judge-front-note",
                    "get-usable-one-frame-data",
                    "exception-after-five-is-use-slots",
                ],
                "state_at_native_failure": "Wait",
                "portable_boundary": {
                    "result": "evidence-required",
                    "manager_state": "faulted",
                    "five_committed_entries_retained": True,
                    "subsequent_step": "same-latched-failure",
                    "allowed_after_fault": ["snapshot", "dispose"],
                },
            },
            {
                "case_id": "one-frame-exhaustion-long-tail-terminal-fault",
                "evidence": ["R02:long", "R02:one-frame", "G19"],
                "native_order": [
                    "linked-after-finish",
                    "tail-judgement",
                    "get-usable-one-frame-data",
                    "exception-after-five-is-use-slots",
                ],
                "state_at_native_failure": "Wait",
                "portable_boundary": {
                    "result": "evidence-required",
                    "manager_state": "faulted",
                    "five_committed_entries_retained": True,
                    "subsequent_step": "same-latched-failure",
                    "allowed_after_fault": ["snapshot", "dispose"],
                },
            },
            {
                "case_id": "actual-adaptive-scheduler-observation-requirements",
                "evidence": ["R02:reflect-owner", "U03", "U04", "G20"],
                "must_be_observed_from_runtime": [
                    "outer-frame-index",
                    "substep-index",
                    "adjusted-position-value-and-bits",
                    "note-state-before-and-after",
                    "one-frame-slot",
                    "single-outer-reflect-batch",
                ],
                "forbidden_test_inputs": ["substep-index", "event-order"],
                "oracle_case": "adaptive-substeps-one-outer-reflect",
            },
            {
                "case_id": "actual-offset-tempo-query-observation-requirements",
                "evidence": ["S08", "U03", "U04", "G20"],
                "must_be_observed_from_runtime": [
                    "entry-bar",
                    "entry-beat-progress-bits",
                    "per-step-bpm",
                    "result-position-bits",
                ],
                "forbidden_test_inputs": ["expected-step-bpms"],
                "production_owner": "InGameMusicScoreController.getAdjustedMusicPosition",
                "oracle_cases": [
                    "offset-plus5-cross-bpm-exact",
                    "offset-minus5-cross-bar-exact",
                    "offset-zero-identity-exact",
                ],
            },
        ],
    }


def main() -> None:
    output = HERE / "auto_live_supplement_fixed_event_trace.json"
    output.write_bytes((json.dumps(build(), ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
