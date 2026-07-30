#!/usr/bin/env python3
"""Fail-closed verifier for the post-Game-Over Retry/reset R1 trace."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "multitouch-seven-lane-post-gameover-retry.trace.json.gz"
PLAN = ROOT / "runtime" / "multitouch-seven-lane-post-gameover-retry-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_state_multitouch_runtime.py"
CONTROL = ROOT / "runtime-control" / "multitouch_seven_lane_control.arm64"
CONTROL_SHA = "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
EXPECTED_COUNTS = {
    "capture.marker": 9,
    "InGameRecord.InitializeLife.enter": 2,
    "InGameRecord.InitializeLife.leave": 2,
    "ScoreUtility.InitBaseScore.enter": 2,
    "SituationSkillManager.ExecUpdate.enter": 590,
    "SituationSkillManager.ExecUpdate.leave": 590,
    "OneFrameController.Reflect.enter": 590,
    "OneFrameController.Reflect.leave": 590,
    "InGameRecord.AddScore.enter": 590,
    "InGameRecord.AddScore.leave": 590,
    "InGameRecord.AddIPower.enter": 590,
    "InGameRecord.AddIPower.leave": 590,
    "NoteFrontBase.judgeFrontNote.enter": 42,
    "GamePlayButton.CorrectNoteResult": 43,
    "DamageUtility.CalcBasePowerPoint": 47,
    "NoteFrontBase.calcAddDamage": 47,
    "ScoreUtility.GetResultTypeCorrectionRate": 86,
    "FeverTimeManager.GetFeverTimeScoreRate": 43,
    "NoteFrontBase.calcSkillScoreUpRate": 43,
    "OneFrameData.Setup.enter": 47,
    "OneFrameData.Setup.leave": 47,
    "InGameRecord.AddCombo.enter": 47,
    "InGameRecord.AddCombo.leave": 47,
    "ScoreUtility.GetComboCorrectionRate": 47,
    "InGameRecord.CalcOneNotesMaxScoreInfo.enter": 47,
    "InGameRecord.CalcOneNotesMaxScoreInfo.leave": 47,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.enter": 47,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.leave": 47,
    "InGameRecord.IncrementJudgeCount.enter": 47,
    "InGameRecord.IncrementJudgeCount.leave": 47,
    "InGameRecord.IncrementJudgeTimingCount.enter": 47,
    "InGameRecord.IncrementJudgeTimingCount.leave": 47,
    "OneFrameTotalData.Setup.leave": 46,
    "SituationSkillManager.AddSituationSkillToPlayList.enter": 1,
    "SituationSkillManager.AddSituationSkillToPlayList.leave": 1,
    "SituationSkillManager.executeBeginSkillProcess.enter": 1,
    "SituationSkillManager.processOfSkillTriggered.enter": 1,
    "SituationSkillManager.playOnceEffectSkill.enter": 1,
    "SituationSkillManager.playOnceEffectSkill.leave": 1,
    "SituationSkillManager.processOfSkillTriggered.leave": 1,
    "SituationSkillManager.executeBeginSkillProcess.leave": 1,
    "SituationSkillManager.executePlayingSkillProcess.enter": 263,
    "SituationSkillManager.executePlayingSkillProcess.leave": 263,
    "SituationSkillManager.processOfSkillFinished.enter": 1,
    "SituationSkillManager.processOfSkillFinished.leave": 1,
    "SituationSkillManager.executeFinishingSkillProcess.enter": 47,
    "SituationSkillManager.executeFinishingSkillProcess.leave": 47,
    "InGameRecord.updateGameOverState.enter": 1,
    "InGameRecord.updateGameOverState.leave": 1,
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def events_of(events: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [event for event in events if event["kind"] == kind]


def record_projection(record: dict[str, Any]) -> list[Any]:
    return [
        record[key]
        for key in (
            "is_multi_game_over",
            "is_single_game_over",
            "score",
            "free_live_bonus_score",
            "reserve_total_score",
            "current_life",
            "displayed_or_skill_base_life",
            "business_life_upper_limit",
            "max_note_count",
            "max_combo",
            "current_combo",
            "current_live_combo",
            "current_live_max_combo",
            "perfect_combo",
            "perfect_count",
            "great_count",
            "good_count",
            "bad_count",
            "miss_count",
            "tap_count",
            "cached_life_when_skill_played",
            "fast_count",
            "slow_count",
        )
    ]


def main() -> int:
    require(all(path.is_file() for path in (TRACE, PLAN, CAPTURE, CONTROL)), "Retry R1 input missing")
    require(digest(CONTROL) == CONTROL_SHA, "native control hash differs")
    with gzip.open(TRACE, "rt", encoding="utf-8") as stream:
        trace = json.load(stream)
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    events = trace["events"]

    require(trace["schema_version"] == 1, "trace schema differs")
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace is not complete R1")
    require(trace["scenario"]["scenario_id"] == "multitouch-seven-lane-post-gameover-retry-lifecycle-v3", "scenario differs")
    require(trace["scenario"]["actions"] == plan["actions"], "embedded plan differs")
    require(trace["plan_sha256"] == digest(PLAN), "plan hash differs")
    require(trace["capture_script_sha256"] == digest(CAPTURE), "capture script hash differs")
    require(
        trace["capability"]
        == {
            "level": "R1",
            "return_replacement": False,
            "memory_writes": False,
            "apk_modification": False,
            "input_injection": "Android adb input plus committed native Linux MT control",
            "temporary_selinux_permissive": True,
            "selinux_restore_required": True,
            "transport": {"kind": "explicit-remote", "address": "127.0.0.1:47913"},
        },
        "capture capability differs",
    )
    sample = trace["sample"]
    require(
        (sample["package"], sample["version_name"], sample["version_code"], sample["abi"])
        == ("jp.co.craftegg.band", "10.1.4", 230, "arm64-v8a"),
        "sample identity differs",
    )
    require(sample["libil2cpp_sha256"] == LIB_SHA256 and sample["global_metadata_sha256"] == METADATA_SHA256, "sample hash differs")
    require(len(events) == 6375 and [event["sequence"] for event in events] == list(range(6375)), "event sequence differs")
    counts = Counter(event["kind"] for event in events)
    require(dict(counts) == EXPECTED_COUNTS and trace["summary"]["counts"] == EXPECTED_COUNTS, "event counts differ")
    require(trace["summary"]["queued"] == 0 and trace["summary"]["marker"] == "post-retry-reset-observation", "capture drain differs")

    markers = events_of(events, "capture.marker")
    require(
        [(event["sequence"], event["value"]) for event in markers]
        == [
            (0, "multitouch-seven-lane-post-gameover-retry-lifecycle-v3"),
            (1, "multitouch-open-retry-confirmation"),
            (2, "multitouch-confirm-retry"),
            (3, "multitouch-pre-burst"),
            (4, "multitouch-native-seven-lane-burst"),
            (6368, "post-game-over-observation-window"),
            (6369, "post-game-over-open-retry-confirmation"),
            (6370, "post-game-over-confirm-retry"),
            (6371, "post-retry-reset-observation"),
        ],
        "capture markers differ",
    )

    initialize_enter = events_of(events, "InGameRecord.InitializeLife.enter")
    initialize_leave = events_of(events, "InGameRecord.InitializeLife.leave")
    base_score = events_of(events, "ScoreUtility.InitBaseScore.enter")
    game_over_enter = events_of(events, "InGameRecord.updateGameOverState.enter")
    game_over_leave = events_of(events, "InGameRecord.updateGameOverState.leave")
    require([event["sequence"] for event in initialize_enter] == [5, 6372], "InitializeLife enter order differs")
    require([event["sequence"] for event in initialize_leave] == [6, 6373], "InitializeLife leave order differs")
    require([event["sequence"] for event in base_score] == [7, 6374], "InitBaseScore order differs")
    require(
        all(
            (event["default_life"], event["max_life"], event["initial_life"])
            == (1000, 2000, 1000)
            for event in initialize_enter
        )
        and all(event["max_note_count"] == 540 for event in base_score),
        "Retry initialization arguments differ",
    )
    require(
        initialize_enter[0]["self"] == initialize_enter[1]["self"]
        == initialize_leave[0]["record"]["pointer"]
        == initialize_leave[1]["record"]["pointer"],
        "Retry changed InGameRecord identity",
    )
    initialized_projection = [0, 0, 0, 0, 0, 1000, 1000, 2000, 540, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    require(record_projection(initialize_leave[0]["record"]) == initialized_projection, "initial record differs")
    require(record_projection(initialize_leave[1]["record"]) == initialized_projection, "Retry-reset record differs")
    require(
        initialize_leave[0]["record"]["immortality_timer"]["bits"] == "0x00000000"
        and initialize_leave[1]["record"]["immortality_timer"]["bits"] == "0x00000000",
        "Retry immortality timer differs",
    )

    require(len(game_over_enter) == 1 and len(game_over_leave) == 1, "Game Over count differs")
    require([game_over_enter[0]["sequence"], game_over_leave[0]["sequence"]] == [6365, 6366], "Game Over order differs")
    before = game_over_enter[0]["before"]
    after = game_over_leave[0]["after"]
    require(
        record_projection(before)
        == [0, 0, 44403, 0, 44403, 0, 1000, 2000, 540, 6, 0, 0, 6, 0, 4, 23, 4, 11, 5, 902, 800, 37, 1],
        "pre-Game-Over record differs",
    )
    require(after["is_single_game_over"] == 1 and after["pointer"] == before["pointer"], "Game Over mutation differs")
    require(
        {key: value for key, value in after.items() if key != "is_single_game_over"}
        == {key: value for key, value in before.items() if key != "is_single_game_over"},
        "Game Over changed an unexpected record field",
    )

    require(events[6367]["kind"] == "InGameRecord.AddIPower.leave", "nested lethal AddIPower did not close")
    require(events[6367]["after"]["is_single_game_over"] == 1, "nested AddIPower did not retain Game Over")
    require(markers[5]["timestamp_ms"] - game_over_leave[0]["timestamp_ms"] == 11875, "post-Game-Over observation interval differs")
    require(
        events[6368]["kind"] == "capture.marker"
        and events[6369]["kind"] == "capture.marker"
        and events[6370]["kind"] == "capture.marker"
        and events[6371]["kind"] == "capture.marker",
        "unexpected hooked business call occurred in the post-Game-Over/Retry-control interval",
    )
    require(initialize_enter[1]["timestamp_ms"] > markers[-1]["timestamp_ms"], "Retry reset did not follow the committed observation marker")
    require(
        record_projection(initialize_leave[1]["record"]) == initialized_projection
        and initialize_leave[1]["record"]["pointer"] == after["pointer"],
        "Retry did not reset the Game Over record in place",
    )

    unconsumed = {
        "ScoreUtility.GetResultTypeCorrectionRate.rate_bits",
        "FeverTimeManager.GetFeverTimeScoreRate.result_bits",
        "NoteFrontBase.calcSkillScoreUpRate.returned",
        "NoteFrontBase.judgeFrontNote.note_type",
        "NoteFrontBase.judgeFrontNote.absolute_pos",
    }
    require(len(unconsumed) == 5, "unconsumed field declaration differs")

    print(
        "verified score/life post-Game-Over Retry R1: events=6375 gate_ms=11875 "
        "record_identity=stable gameover=0->1 retry=1->0 life=0->1000 score=44403->0 "
        "combo=6->0 D22=partial excluded_fields=5"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
