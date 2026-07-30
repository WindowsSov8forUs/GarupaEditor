#!/usr/bin/env python3
"""Build the privacy-safe ordinary Auto Skill and one-note oracle."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any


BASE = Path(__file__).resolve().parent
TRACE = BASE / "runtime" / "ordinary-auto-skill-one-note-retry4-r1.trace.json.gz"
OUTPUT = BASE / "score_life_ordinary_auto_skill_one_note_oracle.json"


def load_trace() -> dict[str, Any]:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        return json.load(source)


def main() -> int:
    trace = load_trace()
    events = trace["events"]
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        by_kind.setdefault(event["kind"], []).append(event)
    one_note_events = by_kind["InGameRecord.CalcOneNotesMaxScoreInfo.leave"]
    event_one_note_events = by_kind["InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo.leave"]
    transitions: list[dict[str, Any]] = []
    previous: dict[str, Any] | None = None
    for index, event in enumerate(one_note_events, start=1):
        current = event["record"]["one_note"]
        if current != previous:
            transitions.append({"note_index":index,"add_score":event["add_score"],"record_combo":event["record"]["combo"],"value":current})
            previous = current
    equal_retention = []
    for index in range(1, len(one_note_events)):
        prior = one_note_events[index - 1]
        current = one_note_events[index]
        if current["add_score"] == prior["add_score"] and current["record"]["one_note"] == prior["record"]["one_note"] and current["record"]["combo"] > prior["record"]["combo"]:
            equal_retention.append({"prior_note_index":index,"current_note_index":index+1,"equal_add_score":current["add_score"],"retained":current["record"]["one_note"],"current_record_combo":current["record"]["combo"]})
            if len(equal_retention) == 3:
                break
    triggers = by_kind["SituationSkillManager.processOfSkillTriggered.enter"]
    finishes = by_kind["SituationSkillManager.processOfSkillFinished.enter"]
    finish_leaves = by_kind["SituationSkillManager.processOfSkillFinished.leave"]
    once_enters = by_kind["SituationSkillManager.playOnceEffectSkill.enter"]
    once_leaves = by_kind["SituationSkillManager.playOnceEffectSkill.leave"]
    lifecycles = []
    for index in range(len(triggers)):
        current = triggers[index]["skill"]["current"]
        lifecycles.append({
            "ordinal": index + 1,
            "alias": current["master_alias"],
            "skill_note_index": current["skill_note_index"],
            "absolute_pos": current["absolute_pos"],
            "trigger_sequence": triggers[index]["sequence"],
            "trigger_state": triggers[index]["skill"]["state"],
            "trigger_life": triggers[index]["skill"]["record"]["life"],
            "reservation_frame": triggers[index]["skill"]["reservation_frame"],
            "reservation_alias": None if triggers[index]["skill"]["reservation"] is None else triggers[index]["skill"]["reservation"]["master_alias"],
            "once_sequence": [once_enters[index]["sequence"], once_leaves[index]["sequence"]],
            "once_life": [once_enters[index]["skill"]["record"]["life"], once_leaves[index]["skill"]["record"]["life"]],
            "finish_enter_sequence": finishes[index]["sequence"],
            "finish_enter_state": finishes[index]["skill"]["state"],
            "finish_enter_current": finishes[index]["skill"]["current"],
            "finish_enter_skill_timer_bits": finishes[index]["skill"]["skill_timer"]["bits"],
            "finish_leave_sequence": finish_leaves[index]["sequence"],
            "finish_leave_state": finish_leaves[index]["skill"]["state"],
            "finish_leave_current": finish_leaves[index]["skill"]["current"],
            "finish_leave_skill_timer_bits": finish_leaves[index]["skill"]["skill_timer"]["bits"],
        })
    damage_rows = sorted({
        (event["result"], event["returned"], event["calculated"]["mode"], event["calculated"]["is_auto_live"], event["calculated"]["miss_damage"], event["calculated"]["bad_damage"])
        for event in by_kind["DamageUtility.CalcBasePowerPoint"]
    })
    oracle = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only",
        "source_commit": "6ee113568b2b06abce524beff4a57d83290c9f8d",
        "trace_file": TRACE.relative_to(BASE).as_posix(),
        "plan_file": trace["scenario"]["plan_file"],
        "plan_sha256": trace["plan_sha256"],
        "capture_script_sha256": trace["capture_script_sha256"],
        "sample": trace["sample"],
        "continuity": {"capture_error":trace["capture_error"],"event_count":len(events),"first_sequence":events[0]["sequence"],"last_sequence":events[-1]["sequence"],"contiguous":all(event["sequence"] == index for index,event in enumerate(events))},
        "counts": trace["summary"]["counts"],
        "anonymous_skill_count": trace["summary"]["anonymous_skill_count"],
        "damage_rows": [{"result":row[0],"returned":row[1],"mode":row[2],"is_auto_live":row[3],"miss_damage":row[4],"bad_damage":row[5]} for row in damage_rows],
        "one_note": {
            "call_count": len(one_note_events),
            "transitions": transitions,
            "equal_score_retention_witnesses": equal_retention,
            "final": one_note_events[-1]["record"]["one_note"],
        },
        "event_bonus_one_note": {
            "call_count": len(event_one_note_events),
            "unique_values": list({json.dumps(event["record"]["event_one_note"], sort_keys=True):event["record"]["event_one_note"] for event in event_one_note_events}.values()),
        },
        "skill_lifecycles": lifecycles,
        "overheal": {
            "player_max_life": once_enters[0]["skill"]["record"]["max_life"],
            "observed_life_values": sorted({event["skill"]["record"]["life"] for event in once_enters + once_leaves}),
            "positive_once_effect_transitions": [row for row in ({"alias":lifecycle["alias"],"before":lifecycle["once_life"][0],"after":lifecycle["once_life"][1]} for lifecycle in lifecycles) if row["after"] > row["before"]],
        },
        "privacy": trace["privacy"],
        "business_scope": {
            "confirmed": [
                "locked ordinary Auto Live initialization uses maxNoteCount 979 and is_auto_live=1",
                "six Skill requests complete in order with five anonymous master aliases and one repeated alias",
                "Skill begin/trigger/once/finish ordering and before/after state are directly observed",
                "one-note max updates only on larger score and retains the earlier object on equal score",
                "ordinary event-bonus one-note max remains zero when event bonus base score is zero",
                "once-effect healing directly crosses playerMaxLife 1000 to 1200 and then reaches 1500",
            ],
            "not_confirmed": ["skill master IDs or numeric effect rows","overlapping queued Skills","Fever lifecycle","nonzero event-bonus one-note max","Never Die or damage guard"],
        },
    }
    OUTPUT.write_text(json.dumps(oracle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"ordinary Auto Skill/one-note oracle built: events={len(events)} notes={len(one_note_events)} skills={len(lifecycles)} aliases={oracle['anonymous_skill_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
