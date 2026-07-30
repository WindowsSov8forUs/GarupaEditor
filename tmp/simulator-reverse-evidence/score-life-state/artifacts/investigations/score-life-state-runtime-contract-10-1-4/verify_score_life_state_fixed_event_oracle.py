#!/usr/bin/env python3
"""Independently verify the partial BS01-BS36 fixed-event oracle."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
ORACLE = ROOT / "score_life_state_fixed_event_oracle.json"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
SOURCE_COMMIT = "3c95190f4b6326da97e21c8e590f625a7582dc22"
EXPECTED_CONFIRMED = ["BS05", "BS06", "BS11"]
EXPECTED_PARTIAL = [
    "BS01", "BS02", "BS03", "BS07", "BS10", "BS12", "BS13", "BS15", "BS16", "BS18",
    "BS19", "BS20", "BS21", "BS22", "BS24", "BS27", "BS29", "BS30", "BS32", "BS36",
]
EXPECTED_BLOCKED = [
    "BS04", "BS08", "BS09", "BS14", "BS17", "BS23", "BS25", "BS26",
    "BS28", "BS31", "BS33", "BS34", "BS35",
]
EXPECTED_SOURCES = {
    "static_contract": "score_life_state_static_contract.json",
    "static_findings": "score_life_state_static_findings.json",
    "ordinary_bms": "runtime-inputs/bms/poppin_shuffle_special.bms.txt",
    "habahiro_bms": "runtime-inputs/bms/786_miracle_april_habahiro_special.bms.txt",
    "no_input_r1": "runtime/no-input-retry-life-gameover.trace.json.gz",
    "positive_r1": "runtime/positive-retry-all-lanes-early.trace.json.gz",
    "skill_r1": "runtime/multitouch-seven-lane-native-skill.trace.json.gz",
    "retry_r1": "runtime/multitouch-seven-lane-post-gameover-retry.trace.json.gz",
    "chart_count": "score_life_state_chart_count_oracle.json",
    "initialization_profile": "score_life_initialization_profile_oracle.json",
}
EXPECTED_OUTPUT_FIELDS = [
    "initialization.base_score_and_profile",
    "one_frame.entries_and_bits",
    "reflect.score_life_power_combo",
    "record.result_timing_and_one_note_max",
    "skill.queue_state_timers_and_effects",
    "fever.points_command_state_rate_reservation",
    "lifecycle.game_over_guard_never_die",
    "trace.callback_domain_order",
    "failure.before_after_and_backend_trace",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_trace(relative: str) -> dict[str, Any]:
    with gzip.open(ROOT / relative, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def events(trace: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    return [event for event in trace["events"] if event["kind"] == kind]


def main() -> int:
    oracle = load_json(ORACLE)
    static_findings = load_json(ROOT / EXPECTED_SOURCES["static_findings"])
    runtime_status = load_json(ROOT / "runtime_input_status.json")
    finding = {entry["id"]: entry for entry in static_findings["findings"]}
    no_input = load_trace(EXPECTED_SOURCES["no_input_r1"])
    positive = load_trace(EXPECTED_SOURCES["positive_r1"])
    skill = load_trace(EXPECTED_SOURCES["skill_r1"])
    retry = load_trace(EXPECTED_SOURCES["retry_r1"])
    chart_count = load_json(ROOT / EXPECTED_SOURCES["chart_count"])
    initialization_profile = load_json(ROOT / EXPECTED_SOURCES["initialization_profile"])

    require(oracle["schema_version"] == 1, "oracle schema differs")
    require(oracle["status"] == "partial-10.1.4-fixed-event-oracle-business-gate-open", "oracle status differs")
    require(oracle["source_commit"] == SOURCE_COMMIT, "oracle source commit differs")
    require(oracle["generator"] == "build_score_life_state_fixed_event_oracle.py", "oracle generator identity differs")
    require(
        oracle["sample"]
        == {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "libil2cpp_sha256": LIB_SHA256,
            "global_metadata_sha256": METADATA_SHA256,
        },
        "oracle sample differs",
    )
    require(oracle["business_state_gate"] == "open" and oracle["production_authorization"] is False, "oracle closed the business gate")
    require(oracle["required_output_fields"] == EXPECTED_OUTPUT_FIELDS, "required output field set differs")

    catalog = oracle["evidence_catalog"]
    require(set(catalog) == set(EXPECTED_SOURCES), "evidence catalog keys differ")
    for source_id, relative in EXPECTED_SOURCES.items():
        path = ROOT / relative
        row = catalog[source_id]
        require(
            row == {
                "path": relative,
                "bytes": path.stat().st_size,
                "sha256": digest(path),
                "source_commit": SOURCE_COMMIT,
            },
            f"evidence catalog differs: {source_id}",
        )

    cases = oracle["cases"]
    require([entry["case_id"] for entry in cases] == [f"BS{index:02d}" for index in range(1, 37)], "BS01-BS36 order differs")
    by_id = {entry["case_id"]: entry for entry in cases}
    require(len(by_id) == 36, "duplicate BS case")
    require([entry["case_id"] for entry in cases if entry["status"] == "confirmed-static"] == EXPECTED_CONFIRMED, "confirmed case set differs")
    require([entry["case_id"] for entry in cases if entry["status"] == "partial"] == EXPECTED_PARTIAL, "partial case set differs")
    require([entry["case_id"] for entry in cases if entry["status"] == "blocked"] == EXPECTED_BLOCKED, "blocked case set differs")
    expected_keys = {
        "case_id", "requirement", "status", "evidence_ids", "input_provenance", "expected_source",
        "expected_projection", "unknown_fields", "blocking_findings",
    }
    for entry in cases:
        require(set(entry) == expected_keys, f"case shape differs: {entry['case_id']}")
        require(entry["requirement"], f"case requirement missing: {entry['case_id']}")
        require(entry["evidence_ids"] and entry["input_provenance"] and entry["expected_source"], f"case provenance missing: {entry['case_id']}")
        require(len(entry["unknown_fields"]) == len(set(entry["unknown_fields"])), f"duplicate unknown field: {entry['case_id']}")
        require(len(entry["blocking_findings"]) == len(set(entry["blocking_findings"])), f"duplicate blocker: {entry['case_id']}")
        if entry["status"] == "confirmed-static":
            require(entry["unknown_fields"] == [] and entry["blocking_findings"] == [], f"confirmed case has blockers: {entry['case_id']}")
            require(entry["expected_projection"], f"confirmed case has no projection: {entry['case_id']}")
        elif entry["status"] == "partial":
            require((entry["unknown_fields"] or entry["blocking_findings"]) and entry["expected_projection"], f"partial case is not fail-closed: {entry['case_id']}")
        else:
            require(entry["unknown_fields"] and entry["blocking_findings"] and entry["expected_projection"] == {}, f"blocked case overclaims projection: {entry['case_id']}")

    coverage = oracle["coverage"]
    require(
        coverage
        == {
            "total_cases": 36,
            "confirmed_cases": EXPECTED_CONFIRMED,
            "partial_cases": EXPECTED_PARTIAL,
            "blocked_cases": EXPECTED_BLOCKED,
            "unknown_field_count": 146,
            "blocking_finding_count": 89,
        },
        "coverage summary differs",
    )

    require(
        by_id["BS01"]["expected_projection"]["production_chart_count"]
        == {
            "inputs": chart_count["charts"]["ordinary"]["inputs"],
            "derived": chart_count["charts"]["ordinary"]["derived"],
            "formula": chart_count["charts"]["ordinary"]["formula"],
        }
        and by_id["BS01"]["unknown_fields"] == []
        and by_id["BS01"]["blocking_findings"] == ["D23-master-start-data"]
        and by_id["BS01"]["expected_projection"]["observed_initialization_profile"]
        == {
            "difficulty": "special",
            "score_level": 27,
            "max_note_count": 979,
            "life": initialization_profile["life_initialization"],
            "score": initialization_profile["score_initialization"],
            "mode_and_damage": initialization_profile["mode_and_damage"],
            "object_identity": initialization_profile["object_identity"],
        }
        and initialization_profile["score_initialization"]["total_parameter"]["bits"] == "0x483C8A31"
        and initialization_profile["score_initialization"]["score_level_rate"]["bits"] == "0x3F9C28F6"
        and initialization_profile["score_initialization"]["event_parameter"]["bits"] == "0x00000000"
        and initialization_profile["score_initialization"]["base_score"]["bits"] == "0x4434718E"
        and initialization_profile["score_initialization"]["bonus_base_score"]["bits"] == "0x00000000"
        and chart_count["charts"]["ordinary"]["derived"]["max_note_count"] == 979,
        "BS01 production initialization projection differs",
    )
    require(
        by_id["BS02"]["expected_projection"]
        == {
            "production_bms_sha256": "43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159",
            "production_chart_count": {
                "inputs": chart_count["charts"]["habahiro"]["inputs"],
                "derived": chart_count["charts"]["habahiro"]["derived"],
                "formula": chart_count["charts"]["habahiro"]["formula"],
            },
        }
        and by_id["BS02"]["unknown_fields"] == ["initialization.base_score_bits"]
        and by_id["BS02"]["blocking_findings"] == ["D23-master-start-data"]
        and chart_count["charts"]["habahiro"]["derived"]["max_note_count"] == 731,
        "BS02 HABAHIRO chart count projection differs",
    )

    require(by_id["BS05"]["expected_projection"]["result_correction"] == finding["SLS-S03"]["conclusion"], "BS05 result table differs")
    require(by_id["BS06"]["expected_projection"]["combo_correction_ranges"] == finding["SLS-S04"]["conclusion"], "BS06 Combo ranges differ")
    require(
        by_id["BS11"]["expected_projection"]
        == {
            "slot_capacity": 5,
            "slot_scan": finding["SLS-S02"]["conclusion"]["slot_scan"],
            "clear_point": finding["SLS-S02"]["conclusion"]["clear_point"],
            "representative": finding["SLS-S02"]["conclusion"]["representative"],
        },
        "BS11 five-slot/tie projection differs",
    )

    positive_frame = next(event["frame"] for event in events(positive, "OneFrameData.Setup.leave") if event["frame"]["result"] != 0)
    positive_add = next(event for event in events(positive, "InGameRecord.AddScore.enter") if event["arg1"] != 0)
    require(by_id["BS07"]["expected_projection"]["frame"] == positive_frame, "BS07 frame differs")
    require(
        positive_frame["index"] == 6
        and positive_frame["result"] == 4
        and positive_frame["adjusted_result"] == 4
        and positive_frame["add_score"]["bits"] == "0x44AF8052"
        and positive_frame["add_combo"] == 1
        and positive_frame["skill_rate"]["bits"] == "0x3F800000"
        and positive_add["arg1"] == 1404,
        "BS07 locked positive trajectory differs",
    )

    no_input_game_over = events(no_input, "InGameRecord.updateGameOverState.leave")[0]["after"]
    require(
        by_id["BS16"]["expected_projection"]["observed_single_path"]
        == {
            "one_frame_misses": 11,
            "reflect_count": 210,
            "final_life": no_input_game_over["current_life"],
            "miss_count": no_input_game_over["miss_count"],
            "single_game_over": no_input_game_over["is_single_game_over"],
        }
        and no_input_game_over["current_life"] == 0
        and no_input_game_over["miss_count"] == 11
        and no_input_game_over["is_single_game_over"] == 1,
        "BS16 no-input Life/Game Over projection differs",
    )

    heal_enter = next(event for event in events(skill, "InGameRecord.AddIPower.enter") if event["arg1"] == 300)
    heal_leave = next(event for event in events(skill, "InGameRecord.AddIPower.leave") if event["arg1"] == 300)
    require(
        by_id["BS19"]["expected_projection"]["observed_heal"]
        == {
            "sequence": [2204, 2205],
            "before": heal_enter["before"]["current_life"],
            "delta": 300,
            "after": heal_leave["after"]["current_life"],
            "displayed_base": heal_leave["after"]["displayed_or_skill_base_life"],
            "upper_limit": heal_leave["after"]["business_life_upper_limit"],
        }
        and (heal_enter["before"]["current_life"], heal_leave["after"]["current_life"])
        == (800, 1100),
        "BS19 fixed-heal projection differs",
    )

    skill_projection = by_id["BS22"]["expected_projection"]
    require(
        skill_projection["states"] == {"none": 0, "begin": 1, "playing": 2, "finishing": 3, "final_none": 0}
        and skill_projection["playing_timer_bits"] == "0x40A00000"
        and skill_projection["finishing_timer_bits"] == "0x3F400000"
        and skill_projection["current_identity"] == {"chara_index": 4, "skill_note_index": 1, "absolute_pos": 384},
        "BS22 Skill lifecycle projection differs",
    )
    active_frames = [event["frame"] for event in events(skill, "OneFrameData.Setup.leave") if event["frame"]["skill_rate"]["bits"] == "0x3F99999A"]
    require(
        len(active_frames) == 18
        and by_id["BS24"]["expected_projection"] == {"observed_active_entries": 18, "active_skill_rate_bits": "0x3F99999A", "active_score_up_type": 1}
        and by_id["BS27"]["expected_projection"] == {"observed_score_up_type": 1, "observed_rate_bits": "0x3F99999A", "active_entry_count": 18},
        "BS24/BS27 active Skill projection differs",
    )

    retry_game_over = events(retry, "InGameRecord.updateGameOverState.leave")[0]
    retry_init = events(retry, "InGameRecord.InitializeLife.leave")[-1]
    retry_markers = events(retry, "capture.marker")
    require(
        by_id["BS36"]["expected_projection"]
        == {
            "post_game_over_hook_quiet_ms": retry_markers[5]["timestamp_ms"] - retry_game_over["timestamp_ms"],
            "record_identity_stable": True,
            "retry_reset": {
                "single_game_over": [1, 0],
                "score": [44403, 0],
                "life": [0, 1000],
                "max_combo": [6, 0],
                "max_note_count": 540,
            },
        }
        and retry_game_over["after"]["pointer"] == retry_init["record"]["pointer"]
        and retry_markers[5]["timestamp_ms"] - retry_game_over["timestamp_ms"] == 11875,
        "BS36 Retry/reset projection differs",
    )

    forbidden_closure_claims = {"closed", "complete", "production-authorized", "unknown_fields=[]"}
    serialized = ORACLE.read_text(encoding="utf-8")
    require(not any(claim in oracle["status"] for claim in forbidden_closure_claims), "oracle status overclaims closure")
    require(runtime_status["business_state_gate"] == "open" and runtime_status["production_authorization"] is False, "runtime status gate differs")
    require("capture_fields_not_consumed" in runtime_status["runtime"], "ABI-unsafe field exclusion missing")
    require(serialized.count('"case_id": "BS') == 36, "serialized BS case count differs")

    print(
        "verified score/life fixed-event oracle: BS=36 confirmed=3 partial=20 blocked=13 "
        "unknown_fields=146 blockers=89 R1=5 gate=open production=false"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
