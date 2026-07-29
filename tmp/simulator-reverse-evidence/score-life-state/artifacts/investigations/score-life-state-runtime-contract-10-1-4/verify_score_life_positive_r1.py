#!/usr/bin/env python3
"""Fail-closed verifier for the 10.1.4 positive judgement score R1 trace."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "positive-retry-all-lanes-early.trace.json.gz"
PLAN = ROOT / "runtime" / "positive-retry-all-lanes-early-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_state_runtime.py"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
EXPECTED_COUNTS = {
    "capture.marker": 221,
    "InGameRecord.InitializeLife.enter": 1,
    "InGameRecord.InitializeLife.leave": 1,
    "ScoreUtility.InitBaseScore.enter": 1,
    "SituationSkillManager.ExecUpdate.enter": 220,
    "SituationSkillManager.ExecUpdate.leave": 220,
    "OneFrameController.Reflect.enter": 220,
    "OneFrameController.Reflect.leave": 220,
    "InGameRecord.AddScore.enter": 220,
    "InGameRecord.AddScore.leave": 220,
    "InGameRecord.AddIPower.enter": 220,
    "InGameRecord.AddIPower.leave": 220,
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
    "NoteFrontBase.judgeFrontNote.enter": 1,
    "GamePlayButton.CorrectNoteResult": 1,
    "ScoreUtility.GetResultTypeCorrectionRate": 2,
    "FeverTimeManager.GetFeverTimeScoreRate": 1,
    "NoteFrontBase.calcSkillScoreUpRate": 1,
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
    require(TRACE.is_file() and PLAN.is_file() and CAPTURE.is_file(), "positive R1 input file missing")
    with gzip.open(TRACE, "rt", encoding="utf-8") as stream:
        trace = json.load(stream)
    plan = json.loads(PLAN.read_text(encoding="utf-8"))

    require(trace["schema_version"] == 1, "unexpected trace schema")
    require(trace["status"] == "confirmed-r1-observation-only", "trace is not confirmed R1")
    require(trace["capture_error"] is None, "trace has a capture error")
    require(trace["scenario"]["scenario_id"] == "positive-retry-all-lanes-early-score-skill-v2", "scenario mismatch")
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
    require(len(events) == 2166, f"event count differs: {len(events)}")
    require([event["sequence"] for event in events] == list(range(len(events))), "event sequence has a gap or reorder")
    counts = Counter(event["kind"] for event in events)
    require(dict(counts) == EXPECTED_COUNTS, "event-kind counts differ")
    require(trace["summary"]["counts"] == EXPECTED_COUNTS, "agent summary counts differ")
    require(trace["summary"]["queued"] == 0, "agent queue was not drained")
    require(trace["summary"]["marker"] == "positive-hold-l6", "final marker differs")

    initial = one(events, "InGameRecord.InitializeLife.leave")["record"]
    require(
        [initial[key] for key in ("current_life", "displayed_or_skill_base_life", "business_life_upper_limit", "max_note_count")]
        == [1000, 1000, 2000, 540],
        "initialized record differs",
    )

    judgement = one(events, "NoteFrontBase.judgeFrontNote.enter")
    require(
        judgement["marker"] == "positive-c11-l0" and judgement["result"] == 4 and judgement["timing"] == 0,
        "positive judgement producer differs",
    )
    corrected = one(events, "GamePlayButton.CorrectNoteResult")
    require(
        corrected["marker"] == "positive-c11-l0"
        and corrected["arg1"] == 4
        and corrected["arg2"] == 0
        and corrected["returned"] == 4,
        "positive result correction differs",
    )

    setup_frames = [event["frame"] for event in events if event["kind"] == "OneFrameData.Setup.leave"]
    require(len(setup_frames) == 11, "OneFrame setup count differs")
    positive_frames = [frame for frame in setup_frames if frame["result"] != 0]
    require(len(positive_frames) == 1, "positive OneFrame count differs")
    positive = positive_frames[0]
    require(
        positive["index"] == 6
        and positive["is_using"] == 1
        and positive["add_score"]["bits"] == "0x44AF8052"
        and positive["add_power"] == 0
        and positive["add_combo"] == 1
        and positive["note_type"] == 0
        and positive["result"] == 4
        and positive["adjusted_result"] == 4
        and positive["fever_rate"]["bits"] == "0x3F800000"
        and positive["skill_rate"]["bits"] == "0x3F800000"
        and positive["crescendo_rate"]["bits"] == "0x00000000"
        and positive["score_up_type"] == 0
        and positive["damage_guard_type"] == 0
        and positive["judge_timing"] == 0
        and positive["score_up_rate"]["bits"] == "0x3F800000",
        "positive OneFrame projection differs",
    )
    miss_frames = [frame for frame in setup_frames if frame["result"] == 0]
    require(len(miss_frames) == 10, "Miss OneFrame count differs")
    require(
        all(
            frame["add_score"]["bits"] == "0x00000000"
            and frame["add_power"] == -100
            and frame["add_combo"] == -1
            and frame["adjusted_result"] == 0
            and frame["damage_guard_type"] == 0
            and frame["judge_timing"] == 0
            for frame in miss_frames
        ),
        "Miss OneFrame projection differs",
    )

    nonzero_scores = [
        event for event in events if event["kind"] == "InGameRecord.AddScore.enter" and event["arg1"] != 0
    ]
    require(len(nonzero_scores) == 1 and nonzero_scores[0]["arg1"] == 1404, "reflected score differs")
    score_before = nonzero_scores[0]["before"]
    require(
        [score_before[key] for key in ("score", "current_combo", "max_combo", "perfect_combo", "perfect_count", "miss_count")]
        == [0, 1, 1, 1, 1, 4],
        "record state before positive AddScore differs",
    )
    score_leave = next(
        event
        for event in events
        if event["kind"] == "InGameRecord.AddScore.leave" and event["sequence"] > nonzero_scores[0]["sequence"]
    )
    require(score_leave["after"]["score"] == 1404, "record score after AddScore differs")

    game_over_enter = one(events, "InGameRecord.updateGameOverState.enter")
    game_over_leave = one(events, "InGameRecord.updateGameOverState.leave")
    require(
        [game_over_enter["before"][key] for key in ("score", "current_life", "max_combo", "perfect_count", "miss_count", "is_single_game_over")]
        == [1404, 0, 1, 1, 10, 0],
        "Game Over input record differs",
    )
    require(
        [game_over_leave["after"][key] for key in ("score", "current_life", "max_combo", "perfect_count", "miss_count", "is_single_game_over")]
        == [1404, 0, 1, 1, 10, 1],
        "Game Over output record differs",
    )

    skill_updates = [event["skill"] for event in events if event["kind"] == "SituationSkillManager.ExecUpdate.enter"]
    require(
        len(skill_updates) == 220
        and all(
            skill["state"] == 0
            and skill["current"] is None
            and skill["playlist"]["size"] == 0
            and skill["skill_timer"]["bits"] == "0x00000000"
            and skill["finishing_timer"]["bits"] == "0x00000000"
            for skill in skill_updates
        ),
        "inactive Skill observation differs",
    )
    require(
        not any(
            event["kind"]
            in {
                "SituationSkillManager.AddSituationSkillToPlayList.enter",
                "SituationSkillManager.executeBeginSkillProcess.enter",
                "SituationSkillManager.executePlayingSkillProcess.enter",
                "SituationSkillManager.executeFinishingSkillProcess.enter",
            }
            for event in events
        ),
        "trace unexpectedly claims active Skill",
    )

    snapshots = record_snapshots(events)
    require(len(snapshots) > 1000 and len({snapshot["pointer"] for snapshot in snapshots}) == 1, "record identity differs")

    # These hooks returned float values in s0, but the capture read the generic x0 retval.
    # judgeFrontNote's parameters after result/timing were not independently ABI-closed either.
    # Their presence is retained in the raw trace but no value from those fields is consumed here.
    unconsumed = {
        "ScoreUtility.GetResultTypeCorrectionRate.rate_bits",
        "FeverTimeManager.GetFeverTimeScoreRate.result_bits",
        "NoteFrontBase.calcSkillScoreUpRate.returned",
        "NoteFrontBase.judgeFrontNote.note_type",
        "NoteFrontBase.judgeFrontNote.absolute_pos",
    }
    require(len(unconsumed) == 5, "unconsumed capture-field declaration differs")

    print(
        "verified score/life positive R1: "
        "events=2166 perfect=1 score=1404 combo=1 miss=10 life=0 active_skill=absent "
        "D18-positive=partial D20=open excluded_fields=5"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
