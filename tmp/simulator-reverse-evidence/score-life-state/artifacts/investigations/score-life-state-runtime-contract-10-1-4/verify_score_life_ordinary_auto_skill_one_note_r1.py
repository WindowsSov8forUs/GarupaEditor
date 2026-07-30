#!/usr/bin/env python3
"""Verify the confirmed ordinary Auto Skill and one-note R1 without identity leakage."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
from typing import Any


BASE = Path(__file__).resolve().parent
TRACE = BASE / "runtime" / "ordinary-auto-skill-one-note-retry4-r1.trace.json.gz"
PLAN = BASE / "runtime" / "ordinary-auto-skill-one-note-retry4-r1-plan.json"
CAPTURE = BASE / "capture_score_life_ordinary_auto_skill_one_note.py"
ORACLE = BASE / "score_life_ordinary_auto_skill_one_note_oracle.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_trace() -> dict[str, Any]:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        return json.load(source)


def walk_event(value: Any) -> None:
    if isinstance(value, dict):
        forbidden_keys = {"pointer","skill_id","situation_skill_id","chara_index","member_slot","character_id","card_id","notes_type"}
        require(not (forbidden_keys & set(value)), f"forbidden identity/string key exported: {forbidden_keys & set(value)}")
        for child in value.values():
            walk_event(child)
    elif isinstance(value, list):
        for child in value:
            walk_event(child)
    elif isinstance(value, str):
        require(not re.fullmatch(r"0x[0-9a-fA-F]{9,16}", value), f"raw pointer-like value exported: {value}")


def main() -> int:
    trace = load_trace()
    oracle = json.loads(ORACLE.read_text(encoding="utf-8"))
    events = trace["events"]
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace is not confirmed and error-free")
    require(trace["plan_sha256"] == sha256(PLAN) and trace["capture_script_sha256"] == sha256(CAPTURE), "plan or capture hash differs")
    require(trace["scenario"]["scenario_id"] == "ordinary-auto-skill-one-note-retry4-r1" and trace["scenario"]["tail_seconds"] == 0, "scenario boundary differs")
    require(trace["sample"]["package"] == "jp.co.craftegg.band" and trace["sample"]["version_name"] == "10.1.4" and trace["sample"]["version_code"] == 230 and trace["sample"]["abi"] == "arm64-v8a", "sample differs")
    require(trace["capability"] == {"level":"R1","return_replacement":False,"memory_writes":False,"apk_modification":False,"managed_invocation":False,"input_injection":"one predeclared Android adb tap followed by passive wait-until-complete only","transport":{"kind":"explicit-remote","address":"127.0.0.1:47913"}}, "capability differs")
    require(len(events) == 5501 and all(event["sequence"] == index for index,event in enumerate(events)), "event sequence is not contiguous 0..5500")
    for event in events:
        walk_event(event)
    require(trace["privacy"] == {"account_fields_included":False,"raw_pointers_included":False,"display_strings_included":False,"skill_master_ids_included":False,"member_identity_included":False,"notes_type_omitted":True}, "privacy projection differs")
    counts = Counter(event["kind"] for event in events)
    require(dict(counts) == trace["summary"]["counts"], "event counts differ from summary")
    require(counts["ScoreUtility.InitBaseScore"] == 1 and next(event for event in events if event["kind"] == "ScoreUtility.InitBaseScore")["max_note_count"] == 979, "locked chart initialization differs")
    require(counts["InGameRecord.CalcOneNotesMaxScoreInfo.leave"] == 979 and counts["InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.leave"] == 979, "one-note call counts differ")
    require(counts["SituationSkillManager.processOfSkillTriggered.enter"] == 6 and counts["SituationSkillManager.processOfSkillFinished.leave"] == 6 and trace["summary"]["anonymous_skill_count"] == 5, "Skill lifecycle counts differ")
    damage_rows = sorted({(event["result"],event["returned"],event["calculated"]["mode"],event["calculated"]["is_auto_live"],event["calculated"]["miss_damage"],event["calculated"]["bad_damage"]) for event in events if event["kind"] == "DamageUtility.CalcBasePowerPoint"})
    require(damage_rows == [(0,-100,1,1,-100,-50),(4,0,1,1,-100,-50)], "Auto damage rows differ")
    require(oracle["continuity"] == {"capture_error":None,"event_count":5501,"first_sequence":0,"last_sequence":5500,"contiguous":True}, "oracle continuity differs")
    require(oracle["anonymous_skill_count"] == 5 and [row["alias"] for row in oracle["skill_lifecycles"]] == ["skill-01","skill-02","skill-03","skill-04","skill-05","skill-04"], "anonymous Skill alias order differs")
    require([row["skill_note_index"] for row in oracle["skill_lifecycles"]] == [1,2,3,4,5,6] and [row["trigger_state"] for row in oracle["skill_lifecycles"]] == [1]*6, "Skill trigger order/state differs")
    require([row["reservation_frame"] for row in oracle["skill_lifecycles"]] == [2147483647,775,1839,2361,4319,5388] and [row["reservation_alias"] for row in oracle["skill_lifecycles"]] == [None,"skill-02","skill-03","skill-04","skill-05","skill-04"], "Skill reservation frame/alias differs")
    require([row["finish_enter_state"] for row in oracle["skill_lifecycles"]] == [2]*6 and [row["finish_leave_current"] for row in oracle["skill_lifecycles"]] == [None]*6 and [row["finish_leave_skill_timer_bits"] for row in oracle["skill_lifecycles"]] == ["0x00000000"]*6, "Skill finish reset differs")
    require(oracle["one_note"]["call_count"] == 979 and [(row["note_index"],row["add_score"],row["value"]["score"],row["value"]["combo"],row["value"]["skill_factor"]["bits"]) for row in oracle["one_note"]["transitions"]] == [(1,541,541,1,"0x3F800000"),(82,703,703,82,"0x3FA66666"),(219,1136,1136,219,"0x40066666")], "one-note maxima differ")
    require(oracle["one_note"]["equal_score_retention_witnesses"][0]["prior_note_index"] == 1 and oracle["one_note"]["equal_score_retention_witnesses"][0]["current_note_index"] == 2 and oracle["one_note"]["equal_score_retention_witnesses"][0]["retained"]["combo"] == 1 and oracle["one_note"]["equal_score_retention_witnesses"][0]["current_record_combo"] == 2, "equal-score retention witness differs")
    require(oracle["event_bonus_one_note"]["call_count"] == 979 and oracle["event_bonus_one_note"]["unique_values"] == [{"score":0,"combo":0,"skill_factor":{"value":0,"bits":"0x00000000"},"is_fever":0,"notes_type_omitted":True}], "zero event-bonus one-note row differs")
    require(oracle["overheal"] == {"player_max_life":1000,"observed_life_values":[1000,1200,1500],"positive_once_effect_transitions":[{"alias":"skill-01","before":1000,"after":1200},{"alias":"skill-03","before":1200,"after":1500}]}, "overheal projection differs")
    print("verified ordinary Auto Skill/one-note R1: events=5501 notes=979 skills=6 aliases=5 maxima=3 overheal=1000->1200->1500 privacy=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
