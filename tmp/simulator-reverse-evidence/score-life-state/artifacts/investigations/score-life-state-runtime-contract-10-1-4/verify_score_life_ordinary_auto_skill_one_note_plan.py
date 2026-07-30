#!/usr/bin/env python3
"""Fail closed unless the ordinary Auto Skill/one-note R1 plan is predeclared and safe."""

from __future__ import annotations

import json
from pathlib import Path


BASE = Path(__file__).resolve().parent
PLAN = BASE / "runtime" / "ordinary-auto-skill-one-note-r1-plan.json"
CAPTURE = BASE / "capture_score_life_ordinary_auto_skill_one_note.py"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")
    require(plan["scenario_id"] == "ordinary-auto-skill-one-note-r1", "unexpected scenario")
    require(plan["status"] == "ready-for-observation", "plan is not ready")
    require(plan["sample"] == {
        "package":"jp.co.craftegg.band","version_name":"10.1.4","version_code":230,"abi":"arm64-v8a",
        "music_fixture_id":"poppin_shuffle_special","music_title_omitted":True,"difficulty":"SPECIAL",
        "score_level":27,"max_note_count":979,"mode":"Free Live Auto Live",
    }, "sample is not the locked ordinary Auto Live")
    require(plan["actions"] == [
        {"kind":"tap","marker":"start-locked-ordinary-auto-live","x":1240,"y":590,"delay_ms":1000},
        {"kind":"wait","marker":"observe-complete-auto-live","delay_ms":180000},
    ], "actions must be one start tap followed by wait")
    require(plan["declared_account_resource_effects"] == {"auto_live_uses":-1,"live_boost":-1,"premium_currency":0,"continue":False}, "resource effects differ")
    contract = plan["observation_contract"]
    require(contract["observation_only"] and not contract["return_replacement"] and not contract["memory_writes"], "observation contract differs")
    require(not contract["apk_modification"] and not contract["managed_invocation"] and not contract["continue_operation"], "forbidden capability enabled")
    forbidden = set(plan["privacy_contract"]["forbidden"])
    require({"user or account identifiers","deck or member identities","card, situation-skill, or skill identifiers","raw managed pointers","music, member, card, or skill display strings","deck element contents"} <= forbidden, "privacy exclusions incomplete")
    require("Interceptor.replace" not in source and "Memory.write" not in source and ".replace(" not in source, "capture contains replacement or write primitive")
    require("Java.perform" not in source and "NativeFunction" not in source, "capture contains managed/native invocation primitive")
    require("SituationSkillData.Initialize" in source and "CalcOneNotesMaxScoreInfo" in source, "required hooks missing")
    require("situationSkillId" not in source and "skillId" not in source and "managedString" not in source and "notesType" not in source, "identity/string export primitive present")
    print("verified ordinary Auto Skill/one-note plan: one tap resource=-1/-1 premium=0 identities=false writes=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
