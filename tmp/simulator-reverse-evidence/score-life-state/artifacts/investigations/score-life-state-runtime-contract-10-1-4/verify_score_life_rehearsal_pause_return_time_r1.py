#!/usr/bin/env python3
"""Verify the rehearsal pause/Practice/ReturnTime R1."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
import re
from typing import Any


BASE = Path(__file__).resolve().parent
TRACE = BASE / "runtime" / "rehearsal-pause-return-time-retry2-r1.trace.json.gz"
PLAN = BASE / "runtime" / "rehearsal-pause-return-time-retry2-r1-plan.json"
CAPTURE = BASE / "capture_score_life_rehearsal_pause_return_time_retry2.py"
ORACLE = BASE / "score_life_rehearsal_pause_return_time_oracle.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def walk(value: Any) -> None:
    if isinstance(value, dict):
        forbidden = {"pointer","skill_id","situation_skill_id","character_id","card_id","member_slot","notes_type"}
        require(not (forbidden & set(value)), f"forbidden identity/string key exported: {forbidden & set(value)}")
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)
    elif isinstance(value, str):
        require(not re.fullmatch(r"0x[0-9a-fA-F]{9,16}", value), f"raw pointer-like value exported: {value}")


def main() -> int:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        trace = json.load(source)
    oracle = json.loads(ORACLE.read_text(encoding="utf-8"))
    events = trace["events"]
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace is not confirmed and error-free")
    require(trace["plan_sha256"] == sha256(PLAN) and trace["capture_script_sha256"] == sha256(CAPTURE), "plan or capture hash differs")
    require(trace["scenario"]["scenario_id"] == "ordinary-rehearsal-pause-return-time-retry2-r1" and trace["scenario"]["tail_seconds"] == 0, "scenario differs")
    require(len(events) == 6826 and all(event["sequence"] == index for index,event in enumerate(events)), "event sequence differs")
    for event in events:
        walk(event)
    require(trace["privacy"] == {"account_fields_included":False,"raw_pointers_included":False,"display_strings_included":False,"skill_master_ids_included":False,"member_identity_included":False,"notes_type_omitted":True}, "privacy projection differs")
    require(oracle["continuity"] == {"capture_error":None,"event_count":6826,"first_sequence":0,"last_sequence":6825,"contiguous":True}, "oracle continuity differs")
    pause = oracle["pause_resume"]
    require(pause["exec_update_count"] == 1223 and pause["game_frame_range"] == [2724,3947] and pause["current_game_states"] == [5,14,15] and pause["current_game_state_counts"] == {"5":262,"14":960,"15":1}, "ExecUpdate projection differs")
    require(pause["initial_paused_window"] == {"start_marker":"ordinary-rehearsal-pause-return-time-retry2-r1","end_marker":"paused-initial-window-complete","duration_ms":5016,"exec_update_count":0,"first_game_frame":None,"last_game_frame":None,"settled_quiet_ms":5016}, "initial pause differs")
    require([(row["exec_update_count"],row["first_game_frame"],row["last_game_frame"]) for row in pause["running_windows"]] == [(126,2724,2849),(116,2858,2973)], "running windows differ")
    require(pause["second_pause_window"]["exec_update_count"] == 6 and pause["second_pause_window"]["settled_quiet_ms"] == 4878, "second settled pause differs")
    require(pause["final_pause_window"]["exec_update_count"] == 6 and pause["final_pause_window"]["settled_quiet_ms"] == 831, "final settled pause differs")
    practice = oracle["practice_game_over"]
    require(practice == {"in_game_mode":10,"in_game_mode_name":"Practice","damage_result_mode_return_counts":{"0/10/-100":37,"4/10/0":104},"add_i_power_counts":{"-200":7,"-100":18,"0":1198},"game_over_check_count":1216,"game_over_leave_states":["0/0/1"],"continued_exec_update_with_life_zero_single_game_over":1216}, "Practice Game Over projection differs")
    returned = oracle["return_time"]
    require([row["kind"] for row in returned["ordered_events"]] == ["InGameMoveTimeController.returnTime.enter","NoteManager.ReturnTime.enter","NoteManager.ReturnTime.leave","CommandNoteManager.ReturnTime.enter","CommandNoteManager.ReturnTime.leave","InGameMoveTimeController.returnTime.leave"], "ReturnTime order differs")
    require(returned["back_second"] == 5 and returned["outer_sequence"] == [1469,6799] and returned["outer_duration_ms"] == 1587, "outer ReturnTime differs")
    require(returned["ordered_events"][1]["snapshot_present"] is True and returned["ordered_events"][3]["snapshot_present"] is True, "snapshot presence differs")
    require((returned["pre_update"]["sequence"],returned["pre_update"]["game_frame_counter"],returned["pre_update"]["record"]["life"],returned["pre_update"]["record"]["is_single_game_over"]) == (1464,2979,0,1), "pre-ReturnTime state differs")
    require((returned["post_update"]["sequence"],returned["post_update"]["game_frame_counter"],returned["post_update"]["record"]["life"],returned["post_update"]["record"]["is_single_game_over"],returned["post_update"]["record"]["score"]) == (6800,3940,1000,0,8304), "post-ReturnTime state differs")
    print("verified rehearsal pause/Practice/ReturnTime R1: events=6826 exec=1223 paused=5s/4.878s return=5s PracticeLife0GameOver1Continues=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
