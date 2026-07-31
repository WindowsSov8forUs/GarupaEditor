#!/usr/bin/env python3
"""Verify the no-Live-start anonymous band deck Skill profile plan."""

from __future__ import annotations

import json
from pathlib import Path


BASE = Path(__file__).resolve().parent
PLAN = BASE / "runtime" / "band-deck-switch-skill-profile-r1-plan.json"
CAPTURE = BASE / "capture_score_life_ordinary_auto_skill_effect_profile.py"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")
    require(plan["scenario_id"] == "band-deck-switch-anonymous-skill-profile-r1" and plan["status"] == "ready-for-observation", "unexpected scenario")
    require(plan["tail_seconds"] == 0 and len(plan["actions"]) == 7, "action/tail count differs")
    require([(action["kind"],action["marker"]) for action in plan["actions"]] == [
        ("tap","advance-result-to-exp"),("tap","open-band-confirmation-without-live-start"),
        ("tap","select-band-2"),("tap","select-band-3"),("tap","select-band-4"),("tap","select-band-5"),
        ("wait","observe-deck-switch-initialization-tail")], "actions differ")
    require(plan["declared_account_resource_effects"] == {"auto_live_uses":0,"live_boost":0,"premium_currency":0,"continue":False}, "resource effects differ")
    contract = plan["observation_contract"]
    require(contract["observation_only"] and not any(contract[key] for key in ["return_replacement","memory_writes","apk_modification","managed_invocation","continue_operation"]), "forbidden capability enabled")
    require("hook('SituationSkillData.Initialize'" in source and "member_identity_omitted:true" in source and "this.profile=master(args[1])" in source, "anonymous Initialize projection missing")
    require("situationSkillId" not in source and "skillId" not in source and "managedString" not in source and "notesType" not in source, "identity/string export primitive present")
    require("Interceptor.replace" not in source and "Memory.write" not in source and "NativeFunction" not in source, "replacement/write/invocation primitive present")
    require(not any(action.get("marker", "").startswith("start-") for action in plan["actions"]), "Live start marker present")
    print("verified anonymous band deck Skill profile plan: actions=7 live-start=false resources=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
