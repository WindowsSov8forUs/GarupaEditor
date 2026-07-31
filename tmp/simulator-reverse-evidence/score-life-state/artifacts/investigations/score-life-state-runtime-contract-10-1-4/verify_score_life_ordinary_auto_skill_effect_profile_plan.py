#!/usr/bin/env python3
"""Verify the predeclared anonymous Skill effect profile capture plan."""

from __future__ import annotations

import json
from pathlib import Path


BASE = Path(__file__).resolve().parent
PLAN = BASE / "runtime" / "ordinary-auto-skill-effect-profile-r1-plan.json"
CAPTURE = BASE / "capture_score_life_ordinary_auto_skill_effect_profile.py"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")
    require(plan["scenario_id"] == "ordinary-auto-skill-effect-profile-r1" and plan["status"] == "ready-for-observation", "unexpected scenario")
    require(plan["tail_seconds"] == 0 and plan["sample"]["music_fixture_id"] == "poppin_shuffle_special" and plan["sample"]["max_note_count"] == 979, "sample/completion boundary differs")
    require(plan["actions"] == [
        {"kind":"tap","marker":"start-locked-ordinary-auto-skill-effect-profile","x":1240,"y":590,"delay_ms":1000},
        {"kind":"wait_until_capture_complete","marker":"observe-complete-ordinary-auto-skill-effect-profile","timeout_ms":180000,"required_one_note_leave_count":979,"required_skill_finished_leave_count":6},
    ], "actions differ")
    require(any("six remaining" in item for item in plan["preconditions"]) and any("10 -> 9" in item for item in plan["preconditions"]), "resource provenance differs")
    require(plan["declared_account_resource_effects"] == {"auto_live_uses":-1,"live_boost":-1,"premium_currency":0,"continue":False}, "resource effects differ")
    contract = plan["observation_contract"]
    require(contract["observation_only"] and not any(contract[key] for key in ["return_replacement","memory_writes","apk_modification","managed_invocation","continue_operation"]), "forbidden capability enabled")
    require("effect_profile:name==='SituationSkillManager.processOfSkillTriggered'?master" in source, "trigger-time profile projection missing")
    require("situationSkillId" not in source and "skillId" not in source and "managedString" not in source and "notesType" not in source, "identity/string export primitive present")
    require("Interceptor.replace" not in source and "Memory.write" not in source and "NativeFunction" not in source, "replacement/write/invocation primitive present")
    print("verified ordinary Auto anonymous Skill effect profile plan: remaining=6 boost=10->9 rows=numeric-only tail=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
