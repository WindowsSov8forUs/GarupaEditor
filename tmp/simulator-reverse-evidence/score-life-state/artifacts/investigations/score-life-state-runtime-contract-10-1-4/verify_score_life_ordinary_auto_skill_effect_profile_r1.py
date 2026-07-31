#!/usr/bin/env python3
"""Verify the anonymous numeric Skill effect profile R1."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
from typing import Any


BASE = Path(__file__).resolve().parent
TRACE = BASE / "runtime" / "ordinary-auto-skill-effect-profile-r1.trace.json.gz"
PLAN = BASE / "runtime" / "ordinary-auto-skill-effect-profile-r1-plan.json"
CAPTURE = BASE / "capture_score_life_ordinary_auto_skill_effect_profile.py"
ORACLE = BASE / "score_life_ordinary_auto_skill_effect_profile_oracle.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def walk_event(value: Any) -> None:
    if isinstance(value, dict):
        forbidden = {"pointer","skill_id","situation_skill_id","chara_index","member_slot","character_id","card_id","notes_type"}
        require(not (forbidden & set(value)), f"forbidden identity/string key exported: {forbidden & set(value)}")
        for child in value.values():
            walk_event(child)
    elif isinstance(value, list):
        for child in value:
            walk_event(child)
    elif isinstance(value, str):
        require(not re.fullmatch(r"0x[0-9a-fA-F]{9,16}", value), f"raw pointer-like value exported: {value}")


def main() -> int:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        trace = json.load(source)
    oracle = json.loads(ORACLE.read_text(encoding="utf-8"))
    events = trace["events"]
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace is not confirmed and error-free")
    require(trace["plan_sha256"] == sha256(PLAN) and trace["capture_script_sha256"] == sha256(CAPTURE), "plan or capture hash differs")
    require(trace["scenario"]["scenario_id"] == "ordinary-auto-skill-effect-profile-r1" and trace["scenario"]["tail_seconds"] == 0, "scenario differs")
    require(len(events) == 5497 and all(event["sequence"] == index for index,event in enumerate(events)), "event sequence differs")
    for event in events:
        walk_event(event)
    require(trace["privacy"] == {"account_fields_included":False,"raw_pointers_included":False,"display_strings_included":False,"skill_master_ids_included":False,"member_identity_included":False,"notes_type_omitted":True}, "privacy projection differs")
    counts = Counter(event["kind"] for event in events)
    require(counts["InGameRecord.CalcOneNotesMaxScoreInfo.leave"] == 979 and counts["SituationSkillManager.processOfSkillTriggered.enter"] == 6 and counts["SituationSkillManager.processOfSkillFinished.leave"] == 6, "business completion counts differ")
    triggers = [event for event in events if event["kind"] == "SituationSkillManager.processOfSkillTriggered.enter"]
    require(all(event["effect_profile"] is not None and event["effect_profile"]["identities_omitted"] is True for event in triggers), "trigger profile missing")
    require(oracle["continuity"] == {"capture_error":None,"event_count":5497,"first_sequence":0,"last_sequence":5496,"contiguous":True}, "oracle continuity differs")
    require(oracle["profile_alias_sequence"] == ["skill-01","skill-02","skill-03","skill-04","skill-05","skill-03"] and len(oracle["profiles"]) == 5, "profile aliases differ")
    require([profile["duration"]["bits"] for profile in oracle["profiles"]] == ["0x40A00000"]*5, "duration bits differ")
    require([(profile["once_effect"]["type"],profile["once_effect"]["value_type"],profile["once_effect"]["value"],profile["once_condition"]["life_type"],profile["once_condition"]["life"]) for profile in oracle["profiles"]] == [(0,0,0,0,0),(1,1,400,1,600),(0,0,0,0,0),(1,1,300,0,0),(1,1,200,0,0)], "once-effect rows differ")
    require([profile["active_effects"]["size"] for profile in oracle["profiles"]] == [2,1,2,1,1], "active-effect sizes differ")
    require([[(row["type"],row["value_type"],row["condition"],row["value"]["bits"],row["condition_life"]) for row in profile["active_effects"]["values"]] for profile in oracle["profiles"]] == [[(0,2,2,"0x42DC0000",0),(3,1,1,"0x00000000",0)],[(4,2,2,"0x42A00000",600)],[(6,2,4,"0x42BE0000",0),(0,2,2,"0x42A00000",0)],[(0,2,2,"0x41A00000",0)],[(0,2,2,"0x41F00000",0)]], "ordered active-effect rows differ")
    require([(row["alias"],row["before"],row["after"]) for row in oracle["once_effect_observations"]] == [("skill-01",1000,1000),("skill-02",1000,1000),("skill-03",1000,1000),("skill-04",1000,1300),("skill-05",1300,1500),("skill-03",1500,1500)], "once-effect Life transitions differ")
    require(oracle["active_effect_type_counts"] == {"0":4,"1":0,"2":0,"3":1,"4":1,"5":0,"6":1,"7":0,"8":0,"9":0,"10":0}, "active-effect type counts differ")
    print("verified ordinary Auto Skill effect profile R1: events=5497 profiles=5 activeRows=7 heal=400(suppressed),300,200 identities=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
