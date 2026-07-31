#!/usr/bin/env python3
"""Build the anonymous numeric Skill effect profile oracle."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any


BASE = Path(__file__).resolve().parent
TRACE = BASE / "runtime" / "ordinary-auto-skill-effect-profile-r1.trace.json.gz"
OUTPUT = BASE / "score_life_ordinary_auto_skill_effect_profile_oracle.json"


def load_trace() -> dict[str, Any]:
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        return json.load(source)


def main() -> int:
    trace = load_trace()
    events = trace["events"]
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        by_kind.setdefault(event["kind"], []).append(event)
    triggers = by_kind["SituationSkillManager.processOfSkillTriggered.enter"]
    once_enters = by_kind["SituationSkillManager.playOnceEffectSkill.enter"]
    once_leaves = by_kind["SituationSkillManager.playOnceEffectSkill.leave"]
    finishes = by_kind["SituationSkillManager.processOfSkillFinished.leave"]
    profiles: dict[str, dict[str, Any]] = {}
    lifecycles = []
    for index, trigger in enumerate(triggers):
        profile = trigger["effect_profile"]
        profiles.setdefault(profile["alias"], profile)
        lifecycles.append({
            "ordinal": index + 1,
            "alias": profile["alias"],
            "skill_note_index": trigger["skill"]["current"]["skill_note_index"],
            "trigger_sequence": trigger["sequence"],
            "once_sequence": [once_enters[index]["sequence"], once_leaves[index]["sequence"]],
            "once_life": [once_enters[index]["skill"]["record"]["life"], once_leaves[index]["skill"]["record"]["life"]],
            "finish_leave_sequence": finishes[index]["sequence"],
            "finish_current": finishes[index]["skill"]["current"],
        })
    ordered_profiles = [profiles[f"skill-{index:02d}"] for index in range(1, len(profiles) + 1)]
    oracle = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only",
        "source_commit": "9e217703c028e2f09be7fa2b30d791b6f7a4a338",
        "trace_file": TRACE.relative_to(BASE).as_posix(),
        "plan_file": trace["scenario"]["plan_file"],
        "plan_sha256": trace["plan_sha256"],
        "capture_script_sha256": trace["capture_script_sha256"],
        "sample": trace["sample"],
        "continuity": {"capture_error":trace["capture_error"],"event_count":len(events),"first_sequence":events[0]["sequence"],"last_sequence":events[-1]["sequence"],"contiguous":all(event["sequence"] == index for index,event in enumerate(events))},
        "enum_projection": {
            "value_type": {"none":0,"real_value":1,"rate":2},
            "once_effect_type": {"none":0,"life":1},
            "once_life_condition": {"none":0,"under_life":1},
            "activate_effect_type": {"score":0,"damage":1,"heal":2,"judge":3,"score_over_life":4,"score_under_life":5,"score_continued_note_judge":6,"score_rate_up_with_perfect":7,"score_only_perfect":8,"never_die":9,"score_under_great_half":10},
        },
        "profiles": ordered_profiles,
        "profile_alias_sequence": [row["effect_profile"]["alias"] for row in triggers],
        "skill_lifecycles": lifecycles,
        "once_effect_observations": [
            {"alias":row["alias"],"once_effect":profiles[row["alias"]]["once_effect"],"once_condition":profiles[row["alias"]]["once_condition"],"before":row["once_life"][0],"after":row["once_life"][1]}
            for row in lifecycles
        ],
        "active_effect_type_counts": {
            str(effect_type): sum(1 for profile in ordered_profiles for row in profile["active_effects"]["values"] if row["type"] == effect_type)
            for effect_type in range(11)
        },
        "privacy": trace["privacy"],
        "business_scope": {
            "confirmed": [
                "five anonymous numeric Skill profiles and six trigger/finish lifecycles",
                "duration, once-effect, once-life-condition and ordered active-effect rows",
                "under-Life 600 real-value heal 400 is suppressed at current Life 1000",
                "real-value heal 300 and 200 apply in order and produce Life 1000->1300->1500",
                "one score-over-Life row and one continued-note-judge score row exist in the locked ordinary profile",
            ],
            "not_confirmed": ["Skill/card/member IDs or slots","condition equality at Life 600","percentage heal","damage guard or Never Die","overlapping Skill","Fever"],
        },
    }
    OUTPUT.write_text(json.dumps(oracle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"ordinary Auto Skill effect profile oracle built: events={len(events)} profiles={len(ordered_profiles)} lifecycles={len(lifecycles)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
