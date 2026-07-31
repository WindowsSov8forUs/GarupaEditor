#!/usr/bin/env python3
"""Verify the predeclared Skill-Playing pause/resume Auto plan."""

from __future__ import annotations
import json
from pathlib import Path
BASE=Path(__file__).resolve().parent
PLAN=BASE/"runtime"/"ordinary-auto-skill-playing-pause-r1-plan.json"
CAPTURE=BASE/"capture_score_life_ordinary_auto_skill_playing_pause.py"

def require(condition:bool,message:str)->None:
    if not condition: raise SystemExit(message)

def main()->int:
    plan=json.loads(PLAN.read_text(encoding="utf-8")); source=CAPTURE.read_text(encoding="utf-8")
    require(plan["scenario_id"]=="ordinary-auto-skill-playing-pause-r1" and plan["status"]=="ready-for-observation","unexpected scenario")
    require(plan["tail_seconds"]==0 and len(plan["actions"])==6,"action/tail boundary differs")
    require([a["marker"] for a in plan["actions"]]==["start-locked-ordinary-auto-skill-playing-pause","approach-first-skill-playing-window","pause-during-first-skill-playing","paused-playing-window-complete","resume-first-skill-playing","observe-complete-after-playing-pause"],"actions differ")
    require(plan["actions"][1]["delay_ms"]==27000 and plan["actions"][3]["delay_ms"]==5000,"pause timing differs")
    require(plan["actions"][5]["required_one_note_leave_count"]==979 and plan["actions"][5]["required_skill_finished_leave_count"]==6,"completion boundary differs")
    require(plan["declared_account_resource_effects"]=={"auto_live_uses":-1,"live_boost":-1,"premium_currency":0,"continue":False},"resource effects differ")
    contract=plan["observation_contract"]; require(contract["observation_only"] and not any(contract[k] for k in ["return_replacement","memory_writes","apk_modification","managed_invocation","continue_operation"]),"forbidden capability enabled")
    require('"SituationSkillManager.ExecUpdate": 0x3321904' in source and "hook('SituationSkillManager.ExecUpdate'" in source,"ExecUpdate hook missing")
    require("Interceptor.replace" not in source and "Memory.write" not in source and "NativeFunction" not in source,"replacement/write/invocation primitive present")
    require("pointer:" not in source and "managedString" not in source and "situationSkillId" not in source and "skillId" not in source,"identity/string export primitive present")
    print("verified ordinary Auto Skill-Playing pause plan: pauseAtMs=27000 settledMs=5000 notes=979 skills=6 resources=-1/-1")
    return 0
if __name__=="__main__": raise SystemExit(main())
