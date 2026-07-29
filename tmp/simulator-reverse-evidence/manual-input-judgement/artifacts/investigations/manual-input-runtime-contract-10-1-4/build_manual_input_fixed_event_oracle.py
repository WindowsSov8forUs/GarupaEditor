#!/usr/bin/env python3
"""Build the committed 10.1.4 manual-input fixed-event oracle from locked evidence."""

from __future__ import annotations

import hashlib
import json
import math
import struct
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
REVERSE_COMMIT = "11b8250853ca12a2106c66245724467701d9eb23"
FRAME_RATE_BITS = 0x3C888889
MISS_INTERVAL_BITS = 0x3E5DDDDE
FLICK_THRESHOLD_BITS = 0x3D23D70A
DIRECTIONAL_THRESHOLD_BITS = 0x3C23D70A


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def bits(value: float) -> str:
    return f"0x{struct.unpack('<I', struct.pack('<f', f32(value)))[0]:08X}"


def float_from_bits(value: int) -> float:
    return struct.unpack("<f", struct.pack("<I", value))[0]


def arm_round_frame(diff_second: float) -> int:
    frame_value = float_from_bits(int(bits(f32(diff_second / float_from_bits(FRAME_RATE_BITS))), 16))
    return math.floor(frame_value + 0.5) if frame_value >= 0 else math.ceil(frame_value - 0.5)


def get_result(diff_second: float, sweet_frame: int) -> int:
    frame = arm_round_frame(diff_second)
    if frame < sweet_frame + 3:
        return 4
    if frame < sweet_frame + 6:
        return 3
    if frame < sweet_frame + 7:
        return 2
    if frame < sweet_frame + 8:
        return 1
    return -1


def judge_timing(diff_second: float, sweet_frame: int) -> int:
    result = get_result(diff_second, sweet_frame)
    if result == 4:
        return 0
    return 1 if diff_second > 0 else 2


def raw_file(path: str) -> dict[str, Any]:
    data = (HERE / path).read_bytes()
    return {"path": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest().upper()}


def touch(frame: int, finger: int, phase: int, x: int, y: int) -> dict[str, Any]:
    return {
        "outer_frame": frame,
        "delta_time": {"value": float_from_bits(FRAME_RATE_BITS), "bits": bits(float_from_bits(FRAME_RATE_BITS))},
        "finger_id": finger,
        "phase": phase,
        "position": {"x": {"value": float(x), "bits": bits(float(x))}, "y": {"value": float(y), "bits": bits(float(y))}},
        "resolver": "owner-issued-button-capability-required",
    }


def case(case_id: str, source_kind: str, evidence: list[str], steps: list[dict[str, Any]], output: dict[str, Any]) -> dict[str, Any]:
    return {"case_id": case_id, "source_kind": source_kind, "evidence": evidence, "steps": steps, "output": output, "unknown_fields": []}


def main() -> int:
    static_contract = json.loads((HERE / "manual_input_static_contract.json").read_text(encoding="utf-8"))
    require(static_contract["target"]["libil2cpp_sha256"] == LIB_SHA256, "static target identity")
    observations = [raw_file("runtime/easy-play.json"), raw_file("runtime/expert-timeout.json"), raw_file("runtime/hard-touch.json"), raw_file("runtime/hard-timeout.json"), raw_file("runtime/ui-multitouch.json")]
    cases: list[dict[str, Any]] = []

    cases.append(case("MJ01", "portable-contract", ["R02", "R05"], [{"outer_frame": 0, "delta_time_bits": f"0x{FRAME_RATE_BITS:08X}", "touches": []}], {"input_manager_calls": 1, "touch_consumed": 0, "input_mutation": "none", "note_update": "continues", "manual_empty_frame": "explicit-touch-array"}))
    timing_steps = []
    for boundary in (3, 6, 7, 8):
        for offset in (-1, 0, 1):
            frame = boundary + offset
            diff = f32(frame / 60.0)
            timing_steps.append({"sweet_frame": 0, "diff_second": {"value": diff, "bits": bits(diff)}, "rounded_frame": arm_round_frame(diff), "raw_result": get_result(diff, 0), "judge_timing": judge_timing(diff, 0)})
    cases.append(case("MJ02", "arm64-independent", ["R02", "R05", "10.1.4:NoteUtility.GetResult"], timing_steps, {"algorithm": "Float32 diff / Float32(1/60), ARM Math.Round tie-away-from-zero, exclusive +3/+6/+7/+8", "results": sorted({step["raw_result"] for step in timing_steps})}))
    cases.append(case("MJ03", "arm64-independent", ["R02", "R05"], [{"active_order": ["root-A", "root-B"], "distance_bits": [bits(1.0), bits(1.0)]}], {"candidate": "first-active-on-strict-less-only", "equal_distance_replacement": False}))
    cases.append(case("MJ04", "arm64-independent", ["R02", "R05", "R06", "R07"], [{"candidate_domains": ["ordinary", "slide-current", "slide-near-line"], "equal_position": True}], {"candidate": "owner-scan-order", "cross_family": "no synthetic tie-break"}))
    cases.append(case("MJ05", "arm64-independent", ["R02", "R05"], [{"button_types": [0, 1, 2, 3, 4, 5, 6, 7], "wide_button_array": "metadata-owned"}], {"containment": "NoteBase.IsContainsButton owner method", "button_provenance": "resolver-capability-only"}))
    cases.append(case("MJ06", "arm64-plus-portable-contract", ["R02", "R05", "D06"], [touch(0, 0, 0, 800, 650), touch(0, 1, 0, 940, 650)], {"finger_owner": "one owner per finger", "same_note_competition": "first touch that observes NoteBase.fingerId < 0 binds; later contenders do not rebind", "touch_order": "finger 0 then finger 1 in every observed two-touch Unity array frame", "observed_phases": {"finger_0": [0, 1, 2, 3], "finger_1": [0, 1, 2, 3]}, "observed_positions": {"finger_0": ["0x44110000", "0x442F0000"], "finger_1": ["0x447A0000", "0x44610000"], "y": "0x428C0000"}, "selinux_after_capture": "Enforcing", "observations": observations[4]}))
    cases.append(case("MJ07", "observed-r1", ["R05", "runtime/easy-play.json"], [touch(1, 0, 1, 580, 650), touch(2, 0, 2, 580, 650), touch(3, 0, 3, 580, 650)], {"observed": "Moved/Stationary/Ended reached InputManager.inputButton with existing button identity", "finger_id": 0, "button_rebind": False, "observations": observations[0]}))
    cases.append(case("MJ08", "arm64-independent", ["R02", "R05"], [{"rate_bits": ["0x3D23D709", "0x3D23D70A", "0x3D23D70B"], "comparison": ">", "threshold_bits": f"0x{FLICK_THRESHOLD_BITS:08X}"}], {"success": [False, False, True], "source": "NoteFlick.ExecTouchMoved"}))
    cases.append(case("MJ09", "arm64-independent", ["R02", "R05"], [{"rate_bits": ["0x3C23D709", "0x3C23D70A", "0x3C23D70B"], "comparison": ">", "threshold_bits": f"0x{DIRECTIONAL_THRESHOLD_BITS:08X}"}], {"success": [False, False, True], "source": "NoteDirectionalFlick.judgeDirectionalFlickSucceeded"}))
    cases.append(case("MJ10", "arm64-independent", ["R02", "R05", "R06"], [{"count": count, "left_side": True, "right_side": True, "button_types": list(range(0, min(count + 1, 8)))} for count in (1, 2, 3)], {"note_type": 10, "count_owner": "registered-group", "duplicate_consumption": False}))
    cases.append(case("MJ11", "arm64-plus-observed-r1", ["R02", "R05", "runtime/hard-touch.json"], [{"result": result, "repeat_began": result in (-1, 0)} for result in (-1, 0, 1, 2, 3, 4)], {"began_owner": "concrete-note", "none_and_miss": "separate branches", "observed_long": {"index": 6, "button_types": [6], "game_note_type": 1, "result": 2, "judge_timing": 2, "note_type": 4, "absolute_pos": 276, "state_after": 2, "finger_id": 0}, "observations": observations[2]}))
    cases.append(case("MJ12", "arm64-independent", ["R02", "R05"], [{"rate_bits": ["0x3D23D709", "0x3D23D70A", "0x3D23D70B"], "grace_reset": 8.0}], {"ordinary_move": "strict-threshold", "none": "origin-update-required"}))
    cases.append(case("MJ13", "arm64-independent", ["R02", "R05"], [{"count": count, "rate_bits": ["0x3C23D709", "0x3C23D70A", "0x3C23D70B"]} for count in (1, 2, 3)], {"directional": "strict-threshold", "multiple": "group-count-owned"}))
    cases.append(case("MJ14", "arm64-independent", ["R02", "R05"], [{"inside": True, "grace_before": grace, "grace_after": 8.0} for grace in (0.0, 1.0, 8.0)], {"inside": "reset-to-8.0", "outside": "subtract-Float32-delta", "reentry": "owner-state-dependent"}))
    cases.append(case("MJ15", "arm64-plus-observed-r1", ["R02", "R05", "runtime/hard-touch.json"], [touch(0, 0, 0, 800, 650), touch(1, 0, 3, 800, 650)], {"ended": "physical-release", "observed_input_result": -1, "observed_input_timing": 1, "projected_result": 0, "projected_note_type": 1, "absolute_pos": 336, "state_after": 3, "finger_after": -1, "none_result": "converted-to-Miss-by-concrete-release-branch", "finger_clear": "concrete-note-deactivation-path", "observations": observations[2]}))
    cases.append(case("MJ16", "observed-r1", ["R05", "runtime/hard-timeout.json"], [], {"equal_deadline": "no-timeout-because-comparison-is-strict-greater", "next_float": "timeout", "observed": "NoteLong index 6 start timeout called onMiss twice in one outer frame", "slots": [{"slot": 0, "note_type": 1, "result": 0, "button_types": [6], "add_power": -50}, {"slot": 1, "note_type": 1, "result": 0, "button_types": [6], "add_power": -50}], "reflect_once": True, "observations": observations[3]}))
    cases.append(case("MJ17", "arm64-independent", ["R02", "R05"], [{"deadline": "equal"}, {"deadline": "next-Float32"}], {"equal_deadline": "no-timeout", "next_float": "single-tail-Miss", "note_type": "LongEnd-family", "cleanup": "parent-owned-deactivate"}))
    cases.append(case("MJ18", "observed-r1", ["R02", "runtime/expert-timeout.json"], [], {"observed_note_type": 8, "observed_button_type": 4, "observed_root_family": "NoteSlide", "observations": observations[1]}))
    cases.append(case("MJ19", "arm64-independent", ["R02", "R05"], [{"paired_band_arrays": ["laneSize1", "laneSize2Left", "laneSize2Right", "laneSize3", "laneSize4Left", "laneSize4Right", "laneSize5", "laneSize6Left", "laneSize6Right", "laneSize7"], "field_offsets": ["0x1F0", "0x1F8", "0x200", "0x208", "0x210", "0x218", "0x220", "0x228", "0x230", "0x238"]}], {"cursor": "SlideNoteManager-owned", "band_source": "NoteSlide constructor direct ARM64"}))
    cases.append(case("MJ20", "arm64-independent", ["R02", "R05"], [{"result": result, "cursor_before": 0} for result in (0, 2, 3, 4)], {"intermediate": "NoteSlide.intermediateNoteJudge", "great_correction": "SlideNoteManager.Judge returns stored band result and computes signed cursor from selected pair; no caller-authored correction"}))
    cases.append(case("MJ21", "arm64-independent", ["R02", "R05"], [{"game_note_type": game_note_type, "judge_note_type": judge_note_type} for game_note_type, judge_note_type in ((4, 8), (5, 8), (6, 8), (7, 8), (8, 8), (9, 9), (10, 10), (11, 10), (12, 10))], {"slide_line": "VirtualPerfectLine owner getter", "movement": "strict-Float32-threshold"}))
    cases.append(case("MJ22", "arm64-independent", ["R02", "R05"], [touch(0, 0, 0, 800, 650), touch(1, 0, 3, 800, 650)], {"release": "ExecTouchEnded", "consumed_child": "skip-before-next-visible", "finger_clear": "deactivate-owner"}))
    cases.append(case("MJ23", "observed-r1", ["R05", "runtime/expert-timeout.json"], [], {"observed": "two NoteSlide onMiss outputs and one onMissAfterNote output; OneFrame noteType 8 slots reflected", "observations": observations[1]}))
    cases.append(case("MJ24", "static-contract-boundary", ["R02", "R05"], [{"slot_count": slot_count, "producer": "manual-or-timeout"} for slot_count in (1, 5, 6)], {"five_slots": "fixed", "sixth": "terminal-fault-required", "no_retry": True}))
    cases.append(case("MJ25", "static-contract-boundary", ["R02", "R05"], [{"lifecycle": lifecycle, "input_frame_consumption": "at-most-once"} for lifecycle in ("pause", "resume", "fault", "dispose", "auto-live")], {"terminal": "fault/dispose-priority", "snapshot": "read-only"}))
    cases.append(case("MJ26", "portable-contract", ["R02", "R05"], [{"invalid": invalid, "mutation": "none"} for invalid in ("non-finite-coordinate", "foreign-button", "duplicate-finger-phase", "later-invalid-touch", "out-of-range-finger")], {"failure": "evidence-required", "whole_domain_atomic": True}))

    output = {
        "schema_version": 1,
        "status": "confirmed-10.1.4-fixed-event-oracle-static-plus-r1",
        "sample": {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a", "libil2cpp_sha256": LIB_SHA256},
        "reverse_commit": REVERSE_COMMIT,
        "generator": "build_manual_input_fixed_event_oracle.py",
        "input_facts": {"frame_rate_bits": f"0x{FRAME_RATE_BITS:08X}", "miss_interval_bits": f"0x{MISS_INTERVAL_BITS:08X}", "flick_threshold_bits": f"0x{FLICK_THRESHOLD_BITS:08X}", "directional_threshold_bits": f"0x{DIRECTIONAL_THRESHOLD_BITS:08X}"},
        "portable_input_contract": {
            "frame": "explicit immutable per-step input frame; touch array required in manual mode",
            "touch_order": "preserve caller enumeration; never sort by finger/lane/phase",
            "finger_id": {"minimum": 0, "maximum": 14, "basis": "InputManager owner array length 15"},
            "phase": {"accepted": {"Began": 0, "Moved": 1, "Stationary": 2, "Ended": 3}, "rejected": {"Canceled": 4, "reason": "10.1.4 inputButton dispatch has no virtual branch above 3"}},
            "position": {"space": "Unity Touch.position bottom-left origin", "observation": "ADB screen y=650 was observed as Unity y=70 on 720px display", "representation": "Float32 bits preserved", "non_finite": "evidence-required-before-owner-mutation"},
            "resolver": {"input": "raw Float32 screen position", "output": "owner-issued GamePlayButton capability", "forbidden": ["caller-authored button type", "note", "result", "timing", "Slide cursor"]},
            "ownership": "capability is bound to engine, initialized session and resolver owner; aliases/foreign/forged values fail",
            "transaction": "preflight entire frame before clock/scheduler/finger/note/OneFrame/backend mutation",
            "lifecycle": "faulted/disposed terminal failure precedes shape and resolver; pause does not consume; adaptive substeps consume once per outer frame"
        },
        "chart_samples": {
            "song_id": 653,
            "song_name": "幾億光年",
            "bundle_path": "musicscore/musicscore660",
            "bundle_cache_key": "732902106be3618450695e273c48219a2d915e6f6c118b87c45586395fa85c42",
            "bundle_bytes": 5420525,
            "bundle_sha256": "14172F64733E58E275EF7665F8A451236386B3FE1FD45C83342C23457EAC8029",
            "difficulties": {
                "easy": {"asset_name": "653_ikuoku_easy", "text_asset_bytes": 1691, "text_asset_sha256": "C09736F52128AAF27360D0E980A3513C47A8A6770BF30057E15B5EA966E1634A", "runtime_bms_bytes": 1688, "runtime_bms_sha256": "4C2F8D202DED5DFD9C4144C0FE000B1E3524E0F25D3FEAF4DD102413F6CD6325"},
                "hard": {"asset_name": "653_ikuoku_hard", "text_asset_bytes": 7111, "text_asset_sha256": "86382CF8C16B8992A72EA93FBE7409022FA8590E284C65F3796668E4DD3FEB0F"},
                "expert": {"asset_name": "653_ikuoku_expert", "text_asset_bytes": 7933, "text_asset_sha256": "CC4C38FA4DE47767CF1C1605C716D8DD8868D4FBD86844D375B134F34BB02740"}
            },
            "identity_source": "committed clock-scheduling 10.1.4 cached bundle scanner"
        },
        "runtime_observations": observations,
        "excluded_by_stage": ["score", "power", "life", "skill", "fever", "audio", "particle", "rendering", "hud", "unity_player_loop_presentation"],
        "cases": cases,
    }
    path = HERE / "manual_input_fixed_event_oracle.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manual fixed event oracle cases={len(cases)} runtime_observations={len(observations)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
