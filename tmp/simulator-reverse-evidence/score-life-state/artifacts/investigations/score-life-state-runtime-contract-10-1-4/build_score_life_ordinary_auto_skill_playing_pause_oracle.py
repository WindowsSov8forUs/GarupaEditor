#!/usr/bin/env python3
"""Build the ordinary Auto Skill-Playing pause/resume oracle."""
from __future__ import annotations
from collections import Counter
import gzip,json
from pathlib import Path
from typing import Any
BASE=Path(__file__).resolve().parent
TRACE=BASE/"runtime"/"ordinary-auto-skill-playing-pause-r1.trace.json.gz"
OUTPUT=BASE/"score_life_ordinary_auto_skill_playing_pause_oracle.json"

def main()->int:
    with gzip.open(TRACE,"rt",encoding="utf-8") as source: trace:dict[str,Any]=json.load(source)
    events=trace["events"]; by:dict[str,list[dict[str,Any]]]={}
    for event in events: by.setdefault(event["kind"],[]).append(event)
    markers={event["value"]:event for event in by["capture.marker"]}; updates=by["SituationSkillManager.ExecUpdate"]
    pause=markers["pause-during-first-skill-playing"]; settled=markers["paused-playing-window-complete"]; resume=markers["resume-first-skill-playing"]
    pause_tail=[event for event in updates if pause["sequence"]<event["sequence"]<settled["sequence"]]
    before=[event for event in updates if event["sequence"]<settled["sequence"]][-1]
    after=next(event for event in updates if event["sequence"]>resume["sequence"])
    oracle={
      "schema_version":1,"status":"confirmed-r1-observation-only-skill-playing-pause-partial-business-gate-open","source_commit":"16760726981882d16ae474c22ce9a281c0821187",
      "trace_file":TRACE.relative_to(BASE).as_posix(),"plan_file":trace["scenario"]["plan_file"],"plan_sha256":trace["plan_sha256"],"capture_script_sha256":trace["capture_script_sha256"],"sample":trace["sample"],
      "continuity":{"capture_error":trace["capture_error"],"event_count":len(events),"first_sequence":events[0]["sequence"],"last_sequence":events[-1]["sequence"],"contiguous":all(e["sequence"]==i for i,e in enumerate(events)),"summary_queued_exec_update_tail":trace["summary"]["queued"]},
      "business_completion":{"one_note_leave_count":len(by["InGameRecord.CalcOneNotesMaxScoreInfo.leave"]),"skill_finished_leave_count":len(by["SituationSkillManager.processOfSkillFinished.leave"]),"anonymous_skill_count":trace["summary"]["anonymous_skill_count"],"trigger_aliases":[e["skill"]["current"]["master_alias"] for e in by["SituationSkillManager.processOfSkillTriggered.enter"]]},
      "playing_pause":{
        "pause_marker":{"sequence":pause["sequence"],"timestamp_ms":pause["timestamp_ms"]},"settled_marker":{"sequence":settled["sequence"],"timestamp_ms":settled["timestamp_ms"]},"resume_marker":{"sequence":resume["sequence"],"timestamp_ms":resume["timestamp_ms"]},
        "pause_window_ms":settled["timestamp_ms"]-pause["timestamp_ms"],"ui_latency_exec_updates":len(pause_tail),"settled_quiet_ms":settled["timestamp_ms"]-pause_tail[-1]["timestamp_ms"],
        "before":{"sequence":before["sequence"],"timestamp_ms":before["timestamp_ms"],"game_frame_counter":before["game_frame_counter"],"current_game_state":before["current_game_state"],"skill":before["skill"]},
        "after":{"sequence":after["sequence"],"timestamp_ms":after["timestamp_ms"],"game_frame_counter":after["game_frame_counter"],"current_game_state":after["current_game_state"],"skill":after["skill"]},
        "wall_gap_ms":after["timestamp_ms"]-before["timestamp_ms"],"game_frame_delta":after["game_frame_counter"]-before["game_frame_counter"],
      },
      "exec_update":{"trace_count":len(updates),"summary_count":trace["summary"]["counts"]["SituationSkillManager.ExecUpdate"],"state_counts":{str(v):n for v,n in sorted(Counter(e["skill"]["state"] for e in updates).items())}},
      "privacy":trace["privacy"],
      "business_scope":{"confirmed":["pause occurs while anonymous skill-01 is Playing","after a short UI-latency tail, ExecUpdate is quiet for 4878 ms","first resumed ExecUpdate retains skill-01 and advances exactly one game frame/timer step after an 8048 ms wall gap","979 one-note leaves and six Skill finishes complete"],"not_confirmed":["GameOver while Skill Playing","Stop drain","multiple or overlapping Skill","callback identity","fault/dispose/duplicate consume"]}
    }
    OUTPUT.write_text(json.dumps(oracle,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"ordinary Auto Skill-Playing pause oracle built: events={len(events)} updates={len(updates)} quietMs={oracle['playing_pause']['settled_quiet_ms']}")
    return 0
if __name__=="__main__": raise SystemExit(main())
