#!/usr/bin/env python3
"""Verify the ordinary Auto Skill-Playing natural-Retry reset R1."""
from __future__ import annotations
import gzip,hashlib,json,re
from pathlib import Path
from typing import Any
BASE=Path(__file__).resolve().parent;TRACE=BASE/"runtime"/"ordinary-auto-skill-playing-retry-reset-r1.trace.json.gz";PLAN=BASE/"runtime"/"ordinary-auto-skill-playing-retry-reset-r1-plan.json";CAPTURE=BASE/"capture_score_life_ordinary_auto_skill_playing_retry_reset.py";ORACLE=BASE/"score_life_ordinary_auto_skill_playing_retry_reset_oracle.json"
def require(c:bool,m:str)->None:
    if not c:raise SystemExit(m)
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
    require(len(events)==1471 and all(e["sequence"]==i for i,e in enumerate(events)),"continuity differs")
    for event in events:walk(event)
    require(t["privacy"]=={"account_fields_included":False,"raw_pointers_included":False,"display_strings_included":False,"skill_master_ids_included":False,"member_identity_included":False,"notes_type_omitted":True},"privacy differs")
    require(o["source_commit"]=="f87e578b86b7640cad2358e54d5e9236862590f1","source commit differs")
    require(o["continuity"]=={"capture_error":None,"event_count":1471,"first_sequence":0,"last_sequence":1470,"contiguous":True,"queued":0},"oracle continuity differs")
    p=o["playing_before_retry"]
    require((p["sequence"],p["game_frame_counter"],p["current_game_state"],p["skill"]["state"])==(1463,949,5,2),"pre-Retry Playing state differs")
    require(p["skill"]["current"]["master_alias"]=="skill-01" and p["skill"]["skill_timer"]["bits"]=="0x400443D8","pre-Retry Skill differs")
    require((p["skill"]["record"]["score"],p["skill"]["record"]["life"],p["skill"]["record"]["combo"])==(62308,1000,100),"pre-Retry record differs")
    r=o["confirmed_retry_reset"]
    require(r["confirm_marker"]=={"sequence":1467,"timestamp_ms":1785471213269},"confirm marker differs")
    require(r["second_exec_awake_start_enter"]["sequence"]==1469 and r["second_exec_awake_start_leave"]["sequence"]==1470 and r["confirm_to_enter_ms"]==2487,"second Awake timing differs")
    require(r["ordered_interval_kinds"]==["capture.marker","SituationSkillManager.ExecAwakeStart.enter","SituationSkillManager.ExecAwakeStart.leave"],"reset interval differs")
    require(r["manager_callback_kinds_between_confirm_and_reset_leave"]==[] and r["public_stop_count"]==0 and r["process_finished_count"]==0,"unexpected reset callback")
    fresh=r["second_exec_awake_start_leave"]["skill"]
    require(fresh["state"]==0 and fresh["playlist"]=={"size":0,"values":[]} and fresh["stock_size"]==8 and fresh["current"] is None,"fresh manager differs")
    require(fresh["skill_timer"]["bits"]=="0x00000000" and fresh["finishing_timer"]["bits"]=="0x00000000" and fresh["reservation_frame"]==2147483647 and fresh["reservation"] is None and fresh["reservation_encore"]==0,"fresh timer/reservation differs")
    require(o["manager_initialization"]["leave_projection_equal"] is True,"manager initialization projections differ")
    require(o["pre_reset_progress"]=={"one_note_leave_count":100,"damage_base_count":100,"skill_trigger_count":1},"pre-reset progress differs")
    require(o["resource_reconciliation"]=={"displayed_auto_live_uses":[7,6],"live_boost_consumption":-1,"displayed_live_boost":[9,9],"rank_up_restoration_observed":True,"premium_currency":0,"continue":False,"note":"Live Boost gross consumption is separated from post-result rank-up restoration and displayed net change."},"resource reconciliation differs")
    print("verified Skill-Playing Retry reset R1: events=1471 Playing skill-01 -> ExecAwakeStart state0/stock8 callbacks=0 Auto=7->6 Boost gross=-1 displayed=9->9(rank-up)")
    return 0
if __name__=="__main__":raise SystemExit(main())
