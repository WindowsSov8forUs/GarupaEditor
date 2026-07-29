#!/usr/bin/env python3
"""Fail-closed verifier for the 10.1.4 no-input R1 and next positive-input plan."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "no-input-retry-life-gameover.trace.json.gz"
PLAN = ROOT / "runtime" / "no-input-retry-plan.json"
CAPTURE = ROOT / "capture_score_life_state_runtime.py"
POSITIVE_PLAN = ROOT / "runtime" / "positive-retry-all-lanes-r1-plan.json"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
EXPECTED_COUNTS = {
    "capture.marker": 4,
    "InGameRecord.InitializeLife.enter": 1,
    "InGameRecord.InitializeLife.leave": 1,
    "ScoreUtility.InitBaseScore.enter": 1,
    "SituationSkillManager.ExecUpdate.enter": 210,
    "SituationSkillManager.ExecUpdate.leave": 210,
    "OneFrameController.Reflect.enter": 210,
    "OneFrameController.Reflect.leave": 210,
    "InGameRecord.AddScore.enter": 210,
    "InGameRecord.AddScore.leave": 210,
    "InGameRecord.AddIPower.enter": 210,
    "InGameRecord.AddIPower.leave": 210,
    "DamageUtility.CalcBasePowerPoint": 11,
    "NoteFrontBase.calcAddDamage": 11,
    "OneFrameData.Setup.enter": 11,
    "OneFrameData.Setup.leave": 11,
    "InGameRecord.AddCombo.enter": 11,
    "InGameRecord.AddCombo.leave": 11,
    "ScoreUtility.GetComboCorrectionRate": 11,
    "InGameRecord.CalcOneNotesMaxScoreInfo.enter": 11,
    "InGameRecord.CalcOneNotesMaxScoreInfo.leave": 11,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.enter": 11,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.leave": 11,
    "InGameRecord.IncrementJudgeCount.enter": 11,
    "InGameRecord.IncrementJudgeCount.leave": 11,
    "InGameRecord.IncrementJudgeTimingCount.enter": 11,
    "InGameRecord.IncrementJudgeTimingCount.leave": 11,
    "OneFrameTotalData.Setup.leave": 9,
    "InGameRecord.updateGameOverState.enter": 1,
    "InGameRecord.updateGameOverState.leave": 1,
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def one(events: list[dict[str, Any]], kind: str) -> dict[str, Any]:
    matches = [event for event in events if event["kind"] == kind]
    require(len(matches) == 1, f"expected one {kind}, got {len(matches)}")
    return matches[0]


def record_snapshots(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        if {"pointer", "current_life", "business_life_upper_limit", "miss_count"} <= value.keys():
            found.append(value)
        for child in value.values():
            found.extend(record_snapshots(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(record_snapshots(child))
    return found


def main() -> int:
    require(TRACE.is_file() and PLAN.is_file() and CAPTURE.is_file() and POSITIVE_PLAN.is_file(), "R1 input file missing")
    positive_plan = json.loads(POSITIVE_PLAN.read_text(encoding="utf-8"))
    require(positive_plan["schema_version"] == 1, "positive plan schema differs")
    require(positive_plan["scenario_id"] == "positive-retry-all-lanes-score-skill", "positive scenario differs")
    require(
        positive_plan["control_provenance"]
        == {
            "source_commit": "72aa279fb07041b04ca649df918fa35ab0490d91",
            "source_path": "artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/hard-touch-plan.json",
            "source_sha256": "E5B48E6D9D46CDD600CB0A8B024D9B10CFF437D0555526AE8E93D9EB0F74EADD",
            "reuse": "actions after the committed hard-live-start and hard-gameplay controls; lane coordinates, 120 ms all-lane cycles, and seven hold swipes are byte-value preserving except marker prefix",
        },
        "positive plan provenance differs",
    )
    positive_actions = positive_plan["actions"]
    require(len(positive_actions) == 220 and positive_plan["tail_seconds"] == 5, "positive plan size differs")
    require(
        positive_actions[:3]
        == [
            {"kind": "tap", "x": 800, "y": 440, "marker": "positive-open-retry-confirmation"},
            {"kind": "tap", "x": 920, "y": 440, "delay_ms": 750, "marker": "positive-confirm-retry"},
            {"kind": "wait", "delay_ms": 7000, "marker": "positive-gameplay-window"},
        ],
        "positive Retry prefix differs",
    )
    lane_x = [380, 520, 660, 800, 940, 1080, 1220]
    cycle_actions = positive_actions[3:213]
    require(
        all(
            action["kind"] == "tap"
            and action["x"] == lane_x[index % 7]
            and action["y"] == 650
            and action["delay_ms"] == (120 if index % 7 == 0 else 0)
            and action["marker"] == f"positive-c{index // 7}-l{index % 7}"
            for index, action in enumerate(cycle_actions)
        ),
        "positive all-lane cycles differ",
    )
    hold_actions = positive_actions[213:]
    require(
        all(
            action
            == {
                "delay_ms": 80,
                "marker": f"positive-hold-l{index}",
                "kind": "swipe",
                "x1": lane_x[index],
                "y1": 650,
                "x2": lane_x[index],
                "y2": 650,
                "duration_ms": 450,
            }
            for index, action in enumerate(hold_actions)
        ),
        "positive hold controls differ",
    )
    with gzip.open(TRACE, "rt", encoding="utf-8") as stream:
        trace = json.load(stream)
    plan = json.loads(PLAN.read_text(encoding="utf-8"))

    require(trace["schema_version"] == 1, "unexpected trace schema")
    require(trace["status"] == "confirmed-r1-observation-only", "trace is not confirmed R1")
    require(trace["capture_error"] is None, "trace has a capture error")
    require(trace["scenario"]["scenario_id"] == "no-input-retry-life-gameover", "scenario mismatch")
    require(trace["scenario"]["actions"] == plan["actions"], "embedded plan actions differ")
    require(trace["plan_sha256"] == sha256(PLAN), "embedded plan hash differs")
    require(trace["capture_script_sha256"] == sha256(CAPTURE), "embedded capture hash differs")
    require(
        trace["capability"]
        == {
            "level": "R1",
            "return_replacement": False,
            "memory_writes": False,
            "apk_modification": False,
            "input_injection": "Android adb input only",
            "transport": {"kind": "explicit-remote", "address": "127.0.0.1:47913"},
        },
        "capture capability or transport differs",
    )
    sample = trace["sample"]
    require(
        (sample["package"], sample["version_name"], sample["version_code"], sample["abi"])
        == ("jp.co.craftegg.band", "10.1.4", 230, "arm64-v8a"),
        "sample identity differs",
    )
    require(sample["libil2cpp_sha256"] == LIB_SHA256, "libil2cpp hash differs")
    require(sample["global_metadata_sha256"] == METADATA_SHA256, "metadata hash differs")

    events = trace["events"]
    require(len(events) == 1863, f"event count differs: {len(events)}")
    require([event["sequence"] for event in events] == list(range(len(events))), "event sequence has a gap or reorder")
    counts = Counter(event["kind"] for event in events)
    require(dict(counts) == EXPECTED_COUNTS, "event-kind counts differ")
    require(trace["summary"]["counts"] == EXPECTED_COUNTS, "agent summary counts differ")
    require(trace["summary"]["queued"] == 0, "agent queue was not drained")
    require(trace["summary"]["marker"] == "observe-no-input", "final marker differs")
    require(
        [event["value"] for event in events if event["kind"] == "capture.marker"]
        == ["no-input-retry-life-gameover", "open-retry-confirmation", "confirm-retry", "observe-no-input"],
        "capture markers differ",
    )

    initialize_enter = one(events, "InGameRecord.InitializeLife.enter")
    initialize_leave = one(events, "InGameRecord.InitializeLife.leave")
    require(
        [initialize_enter[key] for key in ("default_life", "max_life", "initial_life")] == [1000, 2000, 1000],
        "Life initialization arguments differ",
    )
    initial = initialize_leave["record"]
    require(
        [initial[key] for key in ("current_life", "displayed_or_skill_base_life", "business_life_upper_limit", "max_note_count")]
        == [1000, 1000, 2000, 540],
        "initialized record differs",
    )
    require(
        [initial[key] for key in ("score", "current_combo", "max_combo", "perfect_count", "great_count", "good_count", "bad_count", "miss_count")]
        == [0, 0, 0, 0, 0, 0, 0, 0],
        "initialized score/combo/count state differs",
    )

    setup_enters = [event["frame"] for event in events if event["kind"] == "OneFrameData.Setup.enter"]
    setups = [event["frame"] for event in events if event["kind"] == "OneFrameData.Setup.leave"]
    require(all(frame["is_using"] == 0 for frame in setup_enters), "Setup reused an in-use slot")
    require(all(frame["is_using"] == 1 for frame in setups), "Setup did not mark a slot in use")
    require([frame["index"] for frame in setups] == [2, 1, 3, 4, 5, 6, 8, 9, 10, 11, 0], "judgement source order differs")
    require(Counter(frame["note_type"] for frame in setups) == Counter({0: 9, 8: 2}), "note-type projection differs")
    for frame in setups:
        require(
            [frame[key] for key in ("add_power", "add_combo", "result", "adjusted_result", "damage_guard_type", "judge_timing")]
            == [-100, -1, 0, 0, 0, 0],
            "Miss OneFrame projection differs",
        )
        require(frame["add_score"]["bits"] == "0x00000000", "Miss add-score differs")

    nonzero_power = [event for event in events if event["kind"] == "InGameRecord.AddIPower.enter" and event["arg1"] != 0]
    require(
        [(event["arg1"], event["before"]["current_life"], event["before"]["miss_count"]) for event in nonzero_power]
        == [
            (-200, 1000, 2),
            (-100, 800, 3),
            (-100, 700, 4),
            (-100, 600, 5),
            (-100, 500, 6),
            (-100, 400, 7),
            (-100, 300, 8),
            (-100, 200, 9),
            (-200, 100, 11),
        ],
        "slot-order Life mutation differs",
    )
    require([event["sequence"] for event in nonzero_power] == [987, 1123, 1195, 1347, 1427, 1507, 1667, 1755, 1858], "Life mutation sequence differs")

    game_over_enter = one(events, "InGameRecord.updateGameOverState.enter")
    game_over_leave = one(events, "InGameRecord.updateGameOverState.leave")
    require([game_over_enter["sequence"], game_over_leave["sequence"]] == [1859, 1860], "Game Over nesting differs")
    require(
        [game_over_enter["before"][key] for key in ("current_life", "miss_count", "is_single_game_over")]
        == [0, 11, 0],
        "Game Over input state differs",
    )
    require(
        [game_over_leave["after"][key] for key in ("current_life", "miss_count", "is_single_game_over")]
        == [0, 11, 1],
        "Game Over output state differs",
    )
    final_power_leave = events[1861]
    require(final_power_leave["kind"] == "InGameRecord.AddIPower.leave", "Game Over did not return to AddIPower")
    require(
        [final_power_leave["after"][key] for key in ("current_life", "miss_count", "is_single_game_over")]
        == [0, 11, 1],
        "final Life/Game Over state differs",
    )

    skill_updates = [event["skill"] for event in events if event["kind"] == "SituationSkillManager.ExecUpdate.enter"]
    require(len(skill_updates) == 210, "Skill update count differs")
    require(
        all(
            skill["state"] == 0
            and skill["skill_timer"]["bits"] == "0x00000000"
            and skill["finishing_timer"]["bits"] == "0x00000000"
            and skill["current"] is None
            and skill["playlist"]["size"] == 0
            and skill["stock"]["size"] == 8
            for skill in skill_updates
        ),
        "inactive Skill state differs",
    )

    snapshots = record_snapshots(events)
    pointers = {snapshot["pointer"] for snapshot in snapshots}
    require(len(snapshots) > 1000 and len(pointers) == 1, "InGameRecord object identity is not stable")

    print(
        "verified score/life no-input R1: "
        f"events={len(events)} oneframe={len(setups)} reflect={counts['OneFrameController.Reflect.enter']} "
        "life=1000->0 miss=11 single_game_over=0->1 D18/D22=partial"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
