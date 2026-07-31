#!/usr/bin/env python3
"""Verify the ordinary Auto Skill-Playing pause/resume R1."""
from __future__ import annotations
import gzip,hashlib,json,re
from pathlib import Path
from typing import Any
BASE=Path(__file__).resolve().parent
TRACE=BASE/"runtime"/"ordinary-auto-skill-playing-pause-r1.trace.json.gz"; PLAN=BASE/"runtime"/"ordinary-auto-skill-playing-pause-r1-plan.json"; CAPTURE=BASE/"capture_score_life_ordinary_auto_skill_playing_pause.py"; ORACLE=BASE/"score_life_ordinary_auto_skill_playing_pause_oracle.json"
def require(c:bool,m:str)->None:
    if not c: raise SystemExit(m)
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def walk(v:Any)->None:
    if isinstance(v,dict):
        bad={"pointer","skill_id","situation_skill_id","character_id","card_id","member_slot","notes_type"};require(not(bad&set(v)),f"forbidden key: {bad&set(v)}")
        for x in v.values():walk(x)
    elif isinstance(v,list):
        for x in v:walk(x)
    elif isinstance(v,str):require(not re.fullmatch(r"0x[0-9a-fA-F]{9,16}",v),f"raw pointer-like value: {v}")
def main()->int:
    with gzip.open(TRACE,"rt",encoding="utf-8") as source:t=json.load(source)
    o=json.loads(ORACLE.read_text(encoding="utf-8"));events=t["events"]
    require(t["status"]=="confirmed-r1-observation-only" and t["capture_error"] is None,"trace not confirmed")
    require(t["plan_sha256"]==sha(PLAN) and t["capture_script_sha256"]==sha(CAPTURE),"plan/script hash differs")
    require(len(events)==13248 and all(e["sequence"]==i for i,e in enumerate(events)),"continuity differs")
    for e in events:walk(e)
    require(t["privacy"]=={"account_fields_included":False,"raw_pointers_included":False,"display_strings_included":False,"skill_master_ids_included":False,"member_identity_included":False,"notes_type_omitted":True},"privacy differs")
    require(o["continuity"]=={"capture_error":None,"event_count":13248,"first_sequence":0,"last_sequence":13247,"contiguous":True,"summary_queued_exec_update_tail":2},"oracle continuity differs")
    require(o["business_completion"]=={"one_note_leave_count":979,"skill_finished_leave_count":6,"anonymous_skill_count":5,"trigger_aliases":["skill-01","skill-02","skill-03","skill-04","skill-05","skill-05"]},"completion differs")
    p=o["playing_pause"];before=p["before"];after=p["after"]
    require(p["pause_window_ms"]==5105 and p["ui_latency_exec_updates"]==7 and p["settled_quiet_ms"]==4878,"pause window differs")
    require((before["sequence"],before["game_frame_counter"],before["skill"]["state"],before["skill"]["current"]["master_alias"],before["skill"]["skill_timer"]["bits"])==(1424,927,2,"skill-01","0x401A839F"),"pre-pause state differs")
    require((after["sequence"],after["game_frame_counter"],after["skill"]["state"],after["skill"]["current"]["master_alias"],after["skill"]["skill_timer"]["bits"])==(1428,928,2,"skill-01","0x40197398"),"post-resume state differs")
    require(p["wall_gap_ms"]==8048 and p["game_frame_delta"]==1,"freeze delta differs")
    require(before["skill"]["current"]==after["skill"]["current"],"current Skill changed across pause")
    require(o["exec_update"]["trace_count"]==7766 and o["exec_update"]["summary_count"]==7768,"ExecUpdate tail accounting differs")
    print("verified ordinary Auto Skill-Playing pause R1: events=13248 quietMs=4878 wallGapMs=8048 frameDelta=1 timer=0x401A839F->0x40197398")
    return 0
if __name__=="__main__":raise SystemExit(main())
