#!/usr/bin/env python3
"""Build the ordinary Auto Skill-Playing natural-Retry reset oracle."""
from __future__ import annotations
import gzip,json
from pathlib import Path
from typing import Any
BASE=Path(__file__).resolve().parent;TRACE=BASE/"runtime"/"ordinary-auto-skill-playing-retry-reset-r1.trace.json.gz";OUTPUT=BASE/"score_life_ordinary_auto_skill_playing_retry_reset_oracle.json"
def main()->int:
    with gzip.open(TRACE,"rt",encoding="utf-8") as source:t:dict[str,Any]=json.load(source)
    events=t["events"];by:dict[str,list[dict[str,Any]]]={}
    for event in events:by.setdefault(event["kind"],[]).append(event)
    markers={e["value"]:e for e in by["capture.marker"]};confirm=markers["confirm-natural-retry-during-skill-playing-reset"]
    awake_enter=by["SituationSkillManager.ExecAwakeStart.enter"];awake_leave=by["SituationSkillManager.ExecAwakeStart.leave"]
    pre_retry=[e for e in by["SituationSkillManager.ExecUpdate"] if e["sequence"]<confirm["sequence"]][-1]
    reset_interval=[e for e in events if confirm["sequence"]<e["sequence"]<=awake_leave[1]["sequence"]]
    callback_kinds=[e["kind"] for e in reset_interval if e["kind"].startswith("SituationSkillManager.") and e["kind"] not in {"SituationSkillManager.ExecAwakeStart.enter","SituationSkillManager.ExecAwakeStart.leave"}]
    oracle={
      "schema_version":1,"status":"confirmed-r1-observation-only-skill-playing-retry-reset-partial-business-gate-open","source_commit":"f87e578b86b7640cad2358e54d5e9236862590f1",
      "trace_file":TRACE.relative_to(BASE).as_posix(),"plan_file":t["scenario"]["plan_file"],"plan_sha256":t["plan_sha256"],"capture_script_sha256":t["capture_script_sha256"],"sample":t["sample"],
      "continuity":{"capture_error":t["capture_error"],"event_count":len(events),"first_sequence":events[0]["sequence"],"last_sequence":events[-1]["sequence"],"contiguous":all(e["sequence"]==i for i,e in enumerate(events)),"queued":t["summary"]["queued"]},
      "playing_before_retry":{"sequence":pre_retry["sequence"],"timestamp_ms":pre_retry["timestamp_ms"],"game_frame_counter":pre_retry["game_frame_counter"],"current_game_state":pre_retry["current_game_state"],"skill":pre_retry["skill"]},
      "confirmed_retry_reset":{"confirm_marker":{"sequence":confirm["sequence"],"timestamp_ms":confirm["timestamp_ms"]},"second_exec_awake_start_enter":{"sequence":awake_enter[1]["sequence"],"timestamp_ms":awake_enter[1]["timestamp_ms"],"skill":awake_enter[1]["skill"],"record":awake_enter[1]["record"],"calculated":awake_enter[1]["calculated"]},"second_exec_awake_start_leave":{"sequence":awake_leave[1]["sequence"],"timestamp_ms":awake_leave[1]["timestamp_ms"],"skill":awake_leave[1]["skill"]},"confirm_to_enter_ms":awake_enter[1]["timestamp_ms"]-confirm["timestamp_ms"],"ordered_interval_kinds":[e["kind"] for e in reset_interval],"manager_callback_kinds_between_confirm_and_reset_leave":callback_kinds,"public_stop_count":len(by.get("SituationSkillManager.Stop.enter",[])),"process_finished_count":len(by.get("SituationSkillManager.processOfSkillFinished.enter",[]))},
      "manager_initialization":{"first_enter":awake_enter[0]["skill"],"first_leave":awake_leave[0]["skill"],"second_enter":awake_enter[1]["skill"],"second_leave":awake_leave[1]["skill"],"leave_projection_equal":awake_leave[0]["skill"]==awake_leave[1]["skill"]},
      "pre_reset_progress":{"one_note_leave_count":len(by["InGameRecord.CalcOneNotesMaxScoreInfo.leave"]),"damage_base_count":len(by["DamageUtility.CalcBasePowerPoint"]),"skill_trigger_count":len(by["SituationSkillManager.processOfSkillTriggered.enter"])},
      "resource_reconciliation":{"displayed_auto_live_uses":[7,6],"live_boost_consumption":-1,"displayed_live_boost":[9,9],"rank_up_restoration_observed":True,"premium_currency":0,"continue":False,"note":"Live Boost gross consumption is separated from post-result rank-up restoration and displayed net change."},
      "privacy":t["privacy"],
      "business_scope":{"confirmed":["confirmed Retry begins from anonymous skill-01 Playing state","second ExecAwakeStart replaces the active manager lifecycle without public Stop or processOfSkillFinished in the complete ordered reset interval","fresh manager leaves ExecAwakeStart in state 0 with empty playlist, null current, eight stock rows and reset timers/reservation","Auto Live use reconciles 7 to 6; one Boost is consumed while rank-up restoration makes displayed Boost net 9 to 9"],"not_confirmed":["public Stop drain","GameOver while Skill Playing","multiple or overlapping Skill queue","fault/dispose or duplicate consume","Continue"]}
    }
    OUTPUT.write_text(json.dumps(oracle,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"ordinary Auto Skill-Playing Retry reset oracle built: events={len(events)} interval={oracle['confirmed_retry_reset']['ordered_interval_kinds']} callbacks={callback_kinds}")
    return 0
if __name__=="__main__":raise SystemExit(main())
