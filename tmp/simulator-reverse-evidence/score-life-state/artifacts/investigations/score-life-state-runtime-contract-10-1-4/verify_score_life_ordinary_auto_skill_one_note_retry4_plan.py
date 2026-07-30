#!/usr/bin/env python3
"""Fail closed unless Retry-4 drains immediately at the complete business boundary."""

from __future__ import annotations

import json
from pathlib import Path


BASE = Path(__file__).resolve().parent
PLAN = BASE / "runtime" / "ordinary-auto-skill-one-note-retry4-r1-plan.json"
CAPTURE = BASE / "capture_score_life_ordinary_auto_skill_one_note.py"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")
    require(plan["scenario_id"] == "ordinary-auto-skill-one-note-retry4-r1", "unexpected retry scenario")
    require(plan["status"] == "ready-for-observation" and plan["tail_seconds"] == 0, "Retry-4 must have zero result-page tail")
    require(plan["sample"]["music_fixture_id"] == "poppin_shuffle_special" and plan["sample"]["score_level"] == 27 and plan["sample"]["max_note_count"] == 979, "retry sample differs")
    require(plan["actions"] == [
        {"kind":"tap","marker":"start-locked-ordinary-auto-live-retry4","x":1240,"y":590,"delay_ms":1000},
        {"kind":"wait_until_capture_complete","marker":"observe-complete-auto-live-retry4","timeout_ms":180000,"required_one_note_leave_count":979,"required_skill_finished_leave_count":6},
    ], "retry actions differ")
    require(plan["declared_account_resource_effects"] == {"auto_live_uses":-1,"live_boost":-1,"premium_currency":0,"continue":False}, "retry resource effects differ")
    require(any("seven remaining" in item for item in plan["preconditions"]), "Retry-3 resource provenance omitted")
    require(any("11 -> 10" in item for item in plan["preconditions"]), "Retry-4 Live Boost provenance omitted")
    contract = plan["observation_contract"]
    require(contract["observation_only"] and not any(contract[key] for key in ["return_replacement","memory_writes","apk_modification","managed_invocation","continue_operation"]), "forbidden capability enabled")
    require("wait_until_capture_complete" in source and "capture_complete.wait" in source, "bounded completion wait is not implemented")
    require("Interceptor.replace" not in source and "Memory.write" not in source and "NativeFunction" not in source, "capture contains replacement/write/invocation primitive")
    require("situationSkillId" not in source and "skillId" not in source and "managedString" not in source and "notesType" not in source, "identity/string export primitive present")
    print("verified ordinary Auto Skill/one-note Retry-4 plan: remaining=7 boost=11->10 tail=0 premium=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
