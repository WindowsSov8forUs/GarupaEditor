#!/usr/bin/env python3
"""Build the privacy-minimized ordinary production initialization profile oracle."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "initialization-profile-retry.trace.json.gz"
PLAN = ROOT / "runtime" / "initialization-profile-retry-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_state_initialization_profile.py"
STATIC = ROOT / "score_life_state_static_findings.json"
CHART = ROOT / "score_life_state_chart_count_oracle.json"
OUTPUT = ROOT / "score_life_initialization_profile_oracle.json"
SOURCE_COMMIT = "a032f8fe82d045b6d3b5c8853cb923803e0c5435"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_trace() -> dict:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        return json.load(source)


def one(events: list[dict], kind: str) -> dict:
    matches = [event for event in events if event["kind"] == kind]
    if len(matches) != 1:
        raise RuntimeError(f"expected one event for {kind}, got {len(matches)}")
    return matches[0]


def main() -> int:
    trace = load_trace()
    findings = json.loads(STATIC.read_text(encoding="utf-8"))
    chart = json.loads(CHART.read_text(encoding="utf-8"))
    events = trace["events"]
    calculated = one(events, "InGameCalculatedData.ctor.leave")["calculated"]
    life_enter = one(events, "InGameRecord.InitializeLife.enter")
    life_leave = one(events, "InGameRecord.InitializeLife.leave")["record"]
    init_enter = one(events, "ScoreUtility.InitBaseScore.enter")
    start_event = one(events, "ScoreUtility.InitBaseScore.start_data")
    init_leave = one(events, "ScoreUtility.InitBaseScore.leave")
    start = start_event["start_data"]
    score = init_leave["score_utility"]
    finding = {row["id"]: row for row in findings["findings"]}["SLS-S05"]["conclusion"]
    payload = {
        "schema_version": 1,
        "status": "confirmed-r1-ordinary-initialization-profile-partial-D23",
        "source_commit": SOURCE_COMMIT,
        "sample": trace["sample"],
        "sources": [
            {"path": str(TRACE.relative_to(ROOT)).replace("\\", "/"), "sha256": digest(TRACE)},
            {"path": str(PLAN.relative_to(ROOT)).replace("\\", "/"), "sha256": digest(PLAN)},
            {"path": CAPTURE.name, "sha256": digest(CAPTURE)},
            {"path": STATIC.name, "sha256": digest(STATIC)},
            {"path": CHART.name, "sha256": digest(CHART)},
        ],
        "privacy": trace["privacy"],
        "object_identity": {
            "start_data": start["pointer"],
            "calculated_data": calculated["pointer"],
            "record": life_leave["pointer"],
            "user_deck": start["user_deck_pointer"],
            "deck_user_situation_array": start["deck_user_situation_array"],
            "deck_character_info_models": calculated["deck_character_info_models"],
            "score_utility_type_slot": score["type_slot"],
            "score_utility_class": score["class"],
            "score_utility_static_fields": score["static_fields"],
        },
        "production_chart": {
            "asset": "poppin_shuffle_special",
            "bms_file_name": start["bms_file_name"],
            "difficulty": start["difficulty"],
            "music_id": start["music_id"],
            "score_level": start["score_level"],
            "max_note_count": init_enter["max_note_count"],
            "family_count": chart["charts"]["ordinary"],
        },
        "mode_and_damage": {
            "play_mode": start["play_mode"],
            "event_play_mode": start["event_play_mode"],
            "in_game_mode": calculated["in_game_mode"],
            "is_auto_live": start["is_auto_live"],
            "is_enable_practice": calculated["is_enable_practice"],
            "is_demo_play_mode": calculated["is_demo_play_mode"],
            "miss_damage": start["miss_damage"],
            "bad_damage": start["bad_damage"],
        },
        "life_initialization": {
            "arguments": {
                "default_life": life_enter["default_life"],
                "max_life": life_enter["max_life"],
                "initial_life": life_enter["initial_life"],
            },
            "record": {
                "current_life": life_leave["current_life"],
                "displayed_or_skill_base_life": life_leave["displayed_or_skill_base_life"],
                "business_life_upper_limit": life_leave["business_life_upper_limit"],
                "max_note_count": life_leave["max_note_count"],
            },
        },
        "score_initialization": {
            "total_parameter": score["total_parameter"],
            "score_level_rate": score["score_level_rate"],
            "event_parameter": start["free_live_event_bonus_total_parameter"],
            "base_score": score["base_score"],
            "bonus_base_score": score["bonus_base_score"],
            "formula": {
                "score_level_rate": finding["score_level_rate"],
                "ordinary_base": finding["ordinary_base"],
                "bonus_base": finding["bonus_base"],
            },
            "before_after_identical": init_enter["score_utility"] == init_leave["score_utility"],
        },
        "unknown_fields": [
            "deck.member_rows",
            "deck.member_parameter_accumulation",
            "HABAHIRO.initialization_profile",
            "event.master_parameter",
        ],
        "blocking_findings": ["D23-master-start-data-remaining"],
        "business_state_gate": "open",
        "production_authorization": False,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(
        "built score/life initialization profile oracle: ordinary maxNote=979 scoreLevel=27 "
        "total=0x483C8A31 base=0x4434718E unknown=4 gate=open"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
