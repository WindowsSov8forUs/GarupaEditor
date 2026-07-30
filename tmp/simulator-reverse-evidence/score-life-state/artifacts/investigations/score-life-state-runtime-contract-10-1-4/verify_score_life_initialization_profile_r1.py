#!/usr/bin/env python3
"""Verify the privacy-minimized ordinary initialization-profile R1 and oracle."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
import struct


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "initialization-profile-retry.trace.json.gz"
PLAN = ROOT / "runtime" / "initialization-profile-retry-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_state_initialization_profile.py"
ORACLE = ROOT / "score_life_initialization_profile_oracle.json"
SOURCE_COMMIT = "a032f8fe82d045b6d3b5c8853cb923803e0c5435"
TRACE_SHA256 = "81E335AE1CB0686EB8806B3284FA0AE14F411D0A2F91C8CC4C93BB2683A6C302"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
EXPECTED_KINDS = [
    "capture.marker",
    "capture.marker",
    "capture.marker",
    "InGameCalculatedData.ctor.enter",
    "InGameCalculatedData.ctor.leave",
    "capture.marker",
    "InGameRecord.InitializeLife.enter",
    "InGameRecord.InitializeLife.leave",
    "ScoreUtility.InitBaseScore.enter",
    "ScoreUtility.InitBaseScore.start_data",
    "ScoreUtility.InitBaseScore.leave",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def bits(value: float) -> str:
    return "0x" + struct.pack("<f", value)[::-1].hex().upper()


def one(events: list[dict], kind: str) -> dict:
    matches = [event for event in events if event["kind"] == kind]
    require(len(matches) == 1, f"event count differs: {kind}")
    return matches[0]


def main() -> int:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        trace = json.load(source)
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    oracle = json.loads(ORACLE.read_text(encoding="utf-8"))
    require(digest(TRACE) == TRACE_SHA256, "trace hash differs")
    require(trace["schema_version"] == 1 and trace["status"] == "confirmed-r1-observation-only", "trace status differs")
    require(trace["capture_error"] is None, "trace capture error is not null")
    require(trace["plan_sha256"] == digest(PLAN), "plan hash differs")
    require(trace["capture_script_sha256"] == digest(CAPTURE), "capture script hash differs")
    require(trace["scenario"]["scenario_id"] == plan["scenario_id"], "scenario identity differs")
    require(trace["scenario"]["production_chart"] == plan["production_chart"], "scenario chart differs")
    require(trace["capability"] == {
        "level": "R1", "return_replacement": False, "memory_writes": False,
        "apk_modification": False, "input_injection": "Android adb input tap only",
        "transport": {"kind": "explicit-remote", "address": "127.0.0.1:47913"},
    }, "capability differs")
    require(trace["sample"]["package"] == "jp.co.craftegg.band" and trace["sample"]["version_name"] == "10.1.4" and trace["sample"]["version_code"] == 230 and trace["sample"]["abi"] == "arm64-v8a", "sample identity differs")
    require(trace["sample"]["libil2cpp_sha256"] == LIB_SHA256 and trace["sample"]["global_metadata_sha256"] == METADATA_SHA256, "sample hashes differ")
    require(trace["privacy"]["account_fields_included"] is False, "trace privacy gate differs")
    require(set(trace["privacy"]["omitted"]) == {"user_id", "room_id", "room_name", "user_deck_contents", "deck_element_contents", "display_strings"}, "privacy omissions differ")
    events = trace["events"]
    require([event["sequence"] for event in events] == list(range(11)), "event sequence differs")
    require([event["kind"] for event in events] == EXPECTED_KINDS, "event order differs")
    calculated = one(events, "InGameCalculatedData.ctor.leave")["calculated"]
    life_enter = one(events, "InGameRecord.InitializeLife.enter")
    life_leave = one(events, "InGameRecord.InitializeLife.leave")["record"]
    init_enter = one(events, "ScoreUtility.InitBaseScore.enter")
    start_event = one(events, "ScoreUtility.InitBaseScore.start_data")
    init_leave = one(events, "ScoreUtility.InitBaseScore.leave")
    start = start_event["start_data"]
    score = init_leave["score_utility"]
    require(start["privacy"] == {"account_fields_included": False, "room_fields_omitted": True, "user_deck_contents_omitted": True}, "start-data privacy differs")
    require(calculated["privacy"] == {"account_fields_included": False, "deck_elements_omitted": True, "display_strings_omitted": True}, "calculated-data privacy differs")
    require(start["bms_file_name"] == calculated["bms_file_name"] == "poppin_shuffle_special.bms", "BMS identity differs")
    require(start["difficulty"] == calculated["difficulty"] == "special" and start["score_level"] == 27 and start["music_id"] == calculated["music_id"] == 3, "chart profile differs")
    require(start["deck_user_situation_array"]["length"] == calculated["deck_user_situation_array"]["length"] == 5, "deck situation count differs")
    require(calculated["deck_character_info_models"]["length"] == 5, "deck character count differs")
    require(start["miss_damage"] == calculated["miss_damage"] == -100 and start["bad_damage"] == calculated["bad_damage"] == -50, "damage profile differs")
    require(start["play_mode"] == 0 and start["event_play_mode"] == calculated["event_play_mode"] == 0 and calculated["in_game_mode"] == 1, "mode profile differs")
    require(start["is_auto_live"] == calculated["is_auto_live"] == 0 and calculated["is_enable_practice"] == 0 and calculated["is_demo_play_mode"] == 0, "mode flags differ")
    require([life_enter["default_life"], life_enter["max_life"], life_enter["initial_life"]] == [1000, 2000, 1000], "Life arguments differ")
    require([life_leave["current_life"], life_leave["displayed_or_skill_base_life"], life_leave["business_life_upper_limit"], life_leave["max_note_count"]] == [1000, 1000, 2000, 979], "Life record differs")
    require(init_enter["max_note_count"] == init_leave["max_note_count"] == 979, "InitBaseScore max note differs")
    require(init_enter["score_utility"] == init_leave["score_utility"] == start_event["score_utility"], "ScoreUtility cache identity or bits changed")
    require(score["total_parameter"]["bits"] == "0x483C8A31", "total parameter bits differ")
    require(score["score_level_rate"]["bits"] == "0x3F9C28F6", "score-level rate bits differ")
    require(start["free_live_event_bonus_total_parameter"]["bits"] == "0x00000000", "event parameter bits differ")
    require(score["base_score"]["bits"] == "0x4434718E" and score["bonus_base_score"]["bits"] == "0x00000000", "base-score bits differ")
    expected_rate = f32(f32(f32(27 - 5) * f32(0.01)) + f32(1.0))
    expected_base = f32(f32(f32(score["total_parameter"]["value"]) * expected_rate) / f32(979))
    expected_base = f32(expected_base * f32(3.0))
    require(bits(expected_rate) == score["score_level_rate"]["bits"], "independent score-level rate differs")
    require(bits(expected_base) == score["base_score"]["bits"], "independent base-score calculation differs")
    require(oracle["schema_version"] == 1 and oracle["status"] == "confirmed-r1-ordinary-initialization-profile-partial-D23", "oracle status differs")
    require(oracle["source_commit"] == SOURCE_COMMIT, "oracle source commit differs")
    require(oracle["production_chart"]["max_note_count"] == 979 and oracle["production_chart"]["score_level"] == 27, "oracle chart differs")
    require(oracle["score_initialization"]["total_parameter"]["bits"] == "0x483C8A31" and oracle["score_initialization"]["base_score"]["bits"] == "0x4434718E", "oracle score differs")
    require(oracle["unknown_fields"] == ["deck.member_rows", "deck.member_parameter_accumulation", "HABAHIRO.initialization_profile", "event.master_parameter"], "oracle unknown fields differ")
    require(oracle["blocking_findings"] == ["D23-master-start-data-remaining"] and oracle["business_state_gate"] == "open" and oracle["production_authorization"] is False, "oracle gate differs")
    for source in oracle["sources"]:
        require(digest(ROOT / source["path"]) == source["sha256"], f"oracle source hash differs: {source['path']}")
    print(
        "verified score/life initialization profile R1: events=11 chart=poppin_shuffle_special "
        "scoreLevel=27 maxNote=979 total=0x483C8A31 base=0x4434718E privacy=closed gate=open"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
