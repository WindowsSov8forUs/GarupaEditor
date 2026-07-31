#!/usr/bin/env python3
"""Build the rehearsal pause/Practice/ReturnTime oracle."""

from __future__ import annotations

from collections import Counter
import gzip
import json
from pathlib import Path
from typing import Any


BASE = Path(__file__).resolve().parent
TRACE = BASE / "runtime" / "rehearsal-pause-return-time-retry2-r1.trace.json.gz"
OUTPUT = BASE / "score_life_rehearsal_pause_return_time_oracle.json"


def main() -> int:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        trace: dict[str, Any] = json.load(source)
    events = trace["events"]
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        by_kind.setdefault(event["kind"], []).append(event)
    markers = by_kind["capture.marker"]
    exec_updates = by_kind["SituationSkillManager.ExecUpdate"]
    windows = []
    for start, end in zip(markers, markers[1:]):
        rows = [event for event in exec_updates if start["sequence"] < event["sequence"] < end["sequence"]]
        windows.append({
            "start_marker": start["value"],
            "end_marker": end["value"],
            "duration_ms": end["timestamp_ms"] - start["timestamp_ms"],
            "exec_update_count": len(rows),
            "first_game_frame": rows[0]["game_frame_counter"] if rows else None,
            "last_game_frame": rows[-1]["game_frame_counter"] if rows else None,
            "settled_quiet_ms": end["timestamp_ms"] - rows[-1]["timestamp_ms"] if rows else end["timestamp_ms"] - start["timestamp_ms"],
        })
    return_events = [event for event in events if "returntime" in event["kind"].lower()]
    outer_enter = by_kind["InGameMoveTimeController.returnTime.enter"][0]
    outer_leave = by_kind["InGameMoveTimeController.returnTime.leave"][0]
    pre_update = [event for event in exec_updates if event["sequence"] < outer_enter["sequence"]][-1]
    post_update = next(event for event in exec_updates if event["sequence"] > outer_leave["sequence"])
    game_over_rows = by_kind["InGameRecord.updateGameOverState.leave"]
    add_enters = by_kind["InGameRecord.AddIPower.enter"]
    damage_rows = by_kind["DamageUtility.CalcBasePowerPoint"]
    oracle = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only-partial-return-time-practice",
        "source_commit": "645375cd3b52a5bca4ff8b1a715e5a663eff6872",
        "trace_file": TRACE.relative_to(BASE).as_posix(),
        "plan_file": trace["scenario"]["plan_file"],
        "plan_sha256": trace["plan_sha256"],
        "capture_script_sha256": trace["capture_script_sha256"],
        "sample": trace["sample"],
        "continuity": {"capture_error":trace["capture_error"],"event_count":len(events),"first_sequence":events[0]["sequence"],"last_sequence":events[-1]["sequence"],"contiguous":all(event["sequence"] == index for index,event in enumerate(events))},
        "pause_resume": {
            "windows": windows,
            "initial_paused_window": windows[0],
            "second_pause_window": windows[4],
            "final_pause_window": windows[10],
            "running_windows": [windows[2], windows[6]],
            "exec_update_count": len(exec_updates),
            "game_frame_range": [exec_updates[0]["game_frame_counter"], exec_updates[-1]["game_frame_counter"]],
            "current_game_states": sorted({event["current_game_state"] for event in exec_updates}),
            "current_game_state_counts": {str(value):count for value,count in sorted(Counter(event["current_game_state"] for event in exec_updates).items())},
        },
        "practice_game_over": {
            "in_game_mode": 10,
            "in_game_mode_name": "Practice",
            "damage_result_mode_return_counts": dict(sorted(Counter(f"{event['result']}/{event['calculated']['mode']}/{event['returned']}" for event in damage_rows).items())),
            "add_i_power_counts": {str(value): count for value,count in sorted(Counter(event["add"] for event in add_enters).items())},
            "game_over_check_count": len(game_over_rows),
            "game_over_leave_states": sorted({f"{event['record']['life']}/{event['record']['is_multi_game_over']}/{event['record']['is_single_game_over']}" for event in game_over_rows}),
            "continued_exec_update_with_life_zero_single_game_over": sum(1 for event in exec_updates if event["skill"]["record"]["life"] == 0 and event["skill"]["record"]["is_single_game_over"] == 1),
        },
        "return_time": {
            "ordered_events": [{key:event[key] for key in ("sequence","kind","timestamp_ms","marker") if key in event} | ({"back_second":event["back_second"]} if "back_second" in event else {}) | ({"snapshot_present":event["snapshot_present"]} if "snapshot_present" in event else {}) for event in return_events],
            "back_second": outer_enter["back_second"],
            "outer_sequence": [outer_enter["sequence"], outer_leave["sequence"]],
            "outer_duration_ms": outer_leave["timestamp_ms"] - outer_enter["timestamp_ms"],
            "pre_update": {"sequence":pre_update["sequence"],"game_frame_counter":pre_update["game_frame_counter"],"record":pre_update["skill"]["record"]},
            "post_update": {"sequence":post_update["sequence"],"game_frame_counter":post_update["game_frame_counter"],"record":post_update["skill"]["record"]},
        },
        "privacy": trace["privacy"],
        "business_scope": {
            "confirmed": [
                "SituationSkillManager ExecUpdate is absent for an initial 5-second settled pause and resumes after UI Resume",
                "second and final pause taps have short UI-latency tails followed by settled quiet windows",
                "Practice mode 10 continues ExecUpdate while Life is zero and single-game-over is one",
                "a two-second rewind hold invokes InGameMoveTimeController.returnTime(5) with nested NoteManager then CommandNoteManager ReturnTime",
                "the outer ReturnTime restores a snapshot from Life 0/game-over 1 to Life 1000/game-over 0",
            ],
            "not_confirmed": ["ReturnTime behavior outside Practice","forward seek","Skill Playing pause","fault/dispose","duplicate consume","Continue","collaboration or multiplayer Game Over"],
        },
    }
    OUTPUT.write_text(json.dumps(oracle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"rehearsal pause/ReturnTime oracle built: events={len(events)} exec={len(exec_updates)} gameOverChecks={len(game_over_rows)} returnEvents={len(return_events)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
