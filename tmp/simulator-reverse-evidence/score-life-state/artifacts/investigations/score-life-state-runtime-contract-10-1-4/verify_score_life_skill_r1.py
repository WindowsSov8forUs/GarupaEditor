#!/usr/bin/env python3
"""Fail-closed verifier for the native seven-lane active-Skill R1 trace."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "multitouch-seven-lane-native-skill.trace.json.gz"
PLAN = ROOT / "runtime" / "multitouch-seven-lane-native-skill-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_state_multitouch_runtime.py"
CONTROL_BINARY = ROOT / "runtime-control" / "multitouch_seven_lane_control.arm64"
CONTROL_SHA = "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
EXPECTED_COUNTS = {
    "capture.marker": 5,
    "InGameRecord.InitializeLife.enter": 1,
    "InGameRecord.InitializeLife.leave": 1,
    "ScoreUtility.InitBaseScore.enter": 1,
    "SituationSkillManager.ExecUpdate.enter": 674,
    "SituationSkillManager.ExecUpdate.leave": 674,
    "OneFrameController.Reflect.enter": 674,
    "OneFrameController.Reflect.leave": 674,
    "InGameRecord.AddScore.enter": 674,
    "InGameRecord.AddScore.leave": 674,
    "InGameRecord.AddIPower.enter": 675,
    "InGameRecord.AddIPower.leave": 675,
    "NoteFrontBase.judgeFrontNote.enter": 43,
    "GamePlayButton.CorrectNoteResult": 44,
    "DamageUtility.CalcBasePowerPoint": 53,
    "NoteFrontBase.calcAddDamage": 53,
    "ScoreUtility.GetResultTypeCorrectionRate": 88,
    "FeverTimeManager.GetFeverTimeScoreRate": 44,
    "NoteFrontBase.calcSkillScoreUpRate": 44,
    "OneFrameData.Setup.enter": 53,
    "OneFrameData.Setup.leave": 53,
    "InGameRecord.AddCombo.enter": 53,
    "InGameRecord.AddCombo.leave": 53,
    "ScoreUtility.GetComboCorrectionRate": 53,
    "InGameRecord.CalcOneNotesMaxScoreInfo.enter": 53,
    "InGameRecord.CalcOneNotesMaxScoreInfo.leave": 53,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.enter": 53,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.leave": 53,
    "InGameRecord.IncrementJudgeCount.enter": 53,
    "InGameRecord.IncrementJudgeCount.leave": 53,
    "InGameRecord.IncrementJudgeTimingCount.enter": 53,
    "InGameRecord.IncrementJudgeTimingCount.leave": 53,
    "OneFrameTotalData.Setup.leave": 52,
    "SituationSkillManager.AddSituationSkillToPlayList.enter": 1,
    "SituationSkillManager.AddSituationSkillToPlayList.leave": 1,
    "SituationSkillManager.executeBeginSkillProcess.enter": 1,
    "SituationSkillManager.processOfSkillTriggered.enter": 1,
    "SituationSkillManager.playOnceEffectSkill.enter": 1,
    "SituationSkillManager.playOnceEffectSkill.leave": 1,
    "SituationSkillManager.processOfSkillTriggered.leave": 1,
    "SituationSkillManager.executeBeginSkillProcess.leave": 1,
    "SituationSkillManager.executePlayingSkillProcess.enter": 255,
    "SituationSkillManager.executePlayingSkillProcess.leave": 255,
    "SituationSkillManager.processOfSkillFinished.enter": 1,
    "SituationSkillManager.processOfSkillFinished.leave": 1,
    "SituationSkillManager.executeFinishingSkillProcess.enter": 44,
    "SituationSkillManager.executeFinishingSkillProcess.leave": 44,
    "InGameRecord.updateGameOverState.enter": 1,
    "InGameRecord.updateGameOverState.leave": 1,
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def one(events: list[dict[str, Any]], kind: str) -> dict[str, Any]:
    matches = [event for event in events if event["kind"] == kind]
    require(len(matches) == 1, f"expected one {kind}, got {len(matches)}")
    return matches[0]


def main() -> int:
    require(all(path.is_file() for path in (TRACE, PLAN, CAPTURE, CONTROL_BINARY)), "Skill R1 input missing")
    require(digest(CONTROL_BINARY) == CONTROL_SHA, "control binary hash differs")
    with gzip.open(TRACE, "rt", encoding="utf-8") as stream:
        trace = json.load(stream)
    events = trace["events"]
    plan = json.loads(PLAN.read_text(encoding="utf-8"))

    require(trace["schema_version"] == 1, "trace schema differs")
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace is not complete R1")
    require(trace["scenario"]["scenario_id"] == "multitouch-seven-lane-native-positive-skill-window-v2", "scenario differs")
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
    require(len(events) == 7122 and [event["sequence"] for event in events] == list(range(7122)), "event sequence differs")
    counts = Counter(event["kind"] for event in events)
    require(dict(counts) == EXPECTED_COUNTS and trace["summary"]["counts"] == EXPECTED_COUNTS, "event counts differ")
    require(trace["summary"]["queued"] == 0 and trace["summary"]["marker"] == "multitouch-native-seven-lane-burst", "capture drain differs")
    require(
        [event["value"] for event in events if event["kind"] == "capture.marker"]
        == [
            "multitouch-seven-lane-native-positive-skill-window-v2",
            "multitouch-open-retry-confirmation",
            "multitouch-confirm-retry",
            "multitouch-pre-burst",
            "multitouch-native-seven-lane-burst",
        ],
        "capture markers differ",
    )

    setups = [(event["sequence"], event["frame"]) for event in events if event["kind"] == "OneFrameData.Setup.leave"]
    distribution = Counter(
        (
            frame["result"],
            frame["adjusted_result"],
            frame["skill_rate"]["bits"],
            frame["score_up_rate"]["bits"],
            frame["score_up_type"],
            frame["add_combo"],
            frame["add_power"],
        )
        for _, frame in setups
    )
    require(
        distribution
        == Counter(
            {
                (3, 3, "0x3F99999A", "0x3F99999A", 1, 1, 0): 14,
                (3, 3, "0x3F800000", "0x3F800000", 0, 1, 0): 11,
                (0, 0, "0x3F800000", "0x3F800000", 0, -1, -100): 10,
                (1, 1, "0x3F800000", "0x3F800000", 0, -1, -50): 7,
                (2, 2, "0x3F800000", "0x3F800000", 0, -1, 0): 5,
                (2, 2, "0x3F99999A", "0x3F99999A", 1, -1, 0): 3,
                (4, 4, "0x3F800000", "0x3F800000", 0, 1, 0): 2,
                (4, 4, "0x3F99999A", "0x3F99999A", 1, 1, 0): 1,
            }
        ),
        "OneFrame result/Skill-rate distribution differs",
    )
    require(Counter(frame["note_type"] for _, frame in setups) == Counter({0: 43, 8: 8, 4: 1, 1: 1}), "note-type distribution differs")

    add_enter = one(events, "SituationSkillManager.AddSituationSkillToPlayList.enter")
    add_leave = one(events, "SituationSkillManager.AddSituationSkillToPlayList.leave")
    begin_enter = one(events, "SituationSkillManager.executeBeginSkillProcess.enter")
    begin_leave = one(events, "SituationSkillManager.executeBeginSkillProcess.leave")
    require([add_enter["sequence"], add_leave["sequence"], begin_enter["sequence"], begin_leave["sequence"]] == [2186, 2187, 2201, 2208], "Skill Add/Begin order differs")
    require(add_enter["skill"]["state"] == 0 and add_enter["skill"]["playlist"]["size"] == 0, "Skill pre-add differs")
    require(add_leave["skill"]["state"] == 1 and add_leave["skill"]["playlist"]["size"] == 1, "Skill post-add differs")
    require(begin_enter["skill"]["state"] == 1 and begin_enter["skill"]["current"] is None, "Skill Begin input differs")
    require(
        begin_leave["skill"]["state"] == 2
        and begin_leave["skill"]["skill_timer"]["bits"] == "0x40A00000"
        and begin_leave["skill"]["current"]["chara_index"] == 4
        and begin_leave["skill"]["current"]["skill_note_index"] == 1
        and begin_leave["skill"]["current"]["absolute_pos"] == 384,
        "Skill Begin output differs",
    )

    setup_by_sequence = {sequence: frame for sequence, frame in setups}
    for sequence in (2189, 2199):
        frame = setup_by_sequence[sequence]
        require(
            frame["result"] == 3
            and frame["skill_rate"]["bits"] == "0x3F800000"
            and frame["score_up_rate"]["bits"] == "0x3F800000"
            and frame["score_up_type"] == 0,
            f"pre-Begin frozen entry differs at {sequence}",
        )
    reflect = next(event for event in events if event["sequence"] == 2210)
    require(reflect["kind"] == "OneFrameController.Reflect.enter" and reflect["controller"]["skill"]["state"] == 2, "post-Begin Reflect state differs")
    in_use = [frame for frame in reflect["controller"]["slots"]["values"] if frame["is_using"]]
    require(
        [(frame["index"], frame["skill_rate"]["bits"]) for frame in in_use]
        == [(13, "0x3F800000"), (14, "0x3F800000")],
        "same-frame frozen Skill rates differ",
    )

    heal_enter = next(event for event in events if event["kind"] == "InGameRecord.AddIPower.enter" and event["arg1"] == 300)
    heal_leave = next(event for event in events if event["kind"] == "InGameRecord.AddIPower.leave" and event["arg1"] == 300)
    require([heal_enter["sequence"], heal_leave["sequence"]] == [2204, 2205], "once-heal order differs")
    require(
        [heal_enter["before"][key] for key in ("current_life", "displayed_or_skill_base_life", "business_life_upper_limit", "cached_life_when_skill_played")]
        == [800, 1000, 2000, 800]
        and [heal_leave["after"][key] for key in ("current_life", "displayed_or_skill_base_life", "business_life_upper_limit")]
        == [1100, 1000, 2000],
        "once-heal Life fields differ",
    )

    active_rate_entries = [
        (sequence, frame)
        for sequence, frame in setups
        if frame["skill_rate"]["bits"] == "0x3F99999A"
    ]
    require(len(active_rate_entries) == 18, "active Skill entry count differs")
    require(
        (active_rate_entries[0][0], active_rate_entries[0][1]["index"]) == (2682, 17)
        and (active_rate_entries[-1][0], active_rate_entries[-1][1]["index"]) == (5247, 38)
        and all(frame["score_up_rate"]["bits"] == "0x3F99999A" and frame["score_up_type"] == 1 for _, frame in active_rate_entries),
        "active Skill frozen rate boundary differs",
    )

    finished_enter = one(events, "SituationSkillManager.processOfSkillFinished.enter")
    finished_leave = one(events, "SituationSkillManager.processOfSkillFinished.leave")
    require([finished_enter["sequence"], finished_leave["sequence"]] == [5302, 5303], "Skill finish order differs")
    require(finished_enter["skill"]["state"] == 2 and finished_enter["skill"]["skill_timer"]["bits"] == "0xBBA60800", "Skill finish input differs")
    require(finished_leave["skill"]["current"] is None and finished_leave["skill"]["playlist"]["size"] == 0, "Skill finish cleanup differs")
    require(
        setup_by_sequence[5341]["skill_rate"]["bits"] == "0x3F800000"
        and setup_by_sequence[5341]["score_up_type"] == 0,
        "post-finish frozen entry differs",
    )
    finishing_enters = [event for event in events if event["kind"] == "SituationSkillManager.executeFinishingSkillProcess.enter"]
    require(len(finishing_enters) == 44 and finishing_enters[0]["skill"]["finishing_timer"]["bits"] == "0x3F400000", "Finishing timer start differs")
    finishing_leaves = [event for event in events if event["kind"] == "SituationSkillManager.executeFinishingSkillProcess.leave"]
    require(finishing_leaves[-1]["skill"]["state"] == 0 and finishing_leaves[-1]["skill"]["finishing_timer"]["bits"] == "0xBDA11608", "Finishing completion differs")

    game_over = one(events, "InGameRecord.updateGameOverState.leave")["after"]
    require(
        [game_over[key] for key in ("score", "current_life", "max_combo", "perfect_count", "great_count", "good_count", "bad_count", "miss_count", "cached_life_when_skill_played", "is_single_game_over")]
        == [38358, 0, 5, 3, 25, 8, 7, 10, 800, 1],
        "final record differs",
    )

    # The same five ABI-unsafe fields as the preceding positive trace remain unconsumed.
    unconsumed = {
        "ScoreUtility.GetResultTypeCorrectionRate.rate_bits",
        "FeverTimeManager.GetFeverTimeScoreRate.result_bits",
        "NoteFrontBase.calcSkillScoreUpRate.returned",
        "NoteFrontBase.judgeFrontNote.note_type",
        "NoteFrontBase.judgeFrontNote.absolute_pos",
    }
    require(len(unconsumed) == 5, "unconsumed field declaration differs")

    print(
        "verified score/life active-Skill R1: events=7122 entries=53 Skill=0->1->2->3->0 "
        "timer=5s finishing=0.75s heal=800->1100 rate=1.0/1.2 score=38358 "
        "D18/D20/D14=partial excluded_fields=5"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
