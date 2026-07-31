#!/usr/bin/env python3
"""Verify the predeclared Skill-Playing natural-Retry reset plan."""
from __future__ import annotations
import json
from pathlib import Path
BASE=Path(__file__).resolve().parent;PLAN=BASE/"runtime"/"ordinary-auto-skill-playing-retry-reset-r1-plan.json";CAPTURE=BASE/"capture_score_life_ordinary_auto_skill_playing_retry_reset.py"
def require(c:bool,m:str)->None:
    if not c:raise SystemExit(m)
def main()->int:
    p=json.loads(PLAN.read_text(encoding="utf-8"));s=CAPTURE.read_text(encoding="utf-8")
    require(p["scenario_id"]=="ordinary-auto-skill-playing-retry-reset-r1" and p["status"]=="ready-for-observation","unexpected scenario")
    require(p["supersedes_execution"]=="ordinary-auto-skill-playing-stop-retry4-r1-no-public-Stop-before-manager-restart","supersession differs")
    require(p["tail_seconds"]==1 and len(p["actions"])==8,"action/tail differs")
    require([a["marker"] for a in p["actions"]]==["start-locked-ordinary-auto-skill-playing-retry-reset","approach-first-skill-playing-retry-reset-window","pause-during-first-skill-playing-before-retry-reset","pause-overlay-settled-before-retry-reset","natural-retry-during-skill-playing-reset","retry-confirmation-settled-reset","confirm-natural-retry-during-skill-playing-reset","observe-complete-after-second-exec-awake-start"],"actions differ")
    require(p["actions"][1]["delay_ms"]==27000 and p["actions"][3]["delay_ms"]==1000 and p["actions"][5]["delay_ms"]==750,"timing differs")
    require(p["actions"][7]["required_exec_awake_start_leave_count"]==2 and p["actions"][7]["timeout_ms"]==30000,"completion differs")
    require(p["declared_account_resource_effects"]=={"auto_live_uses":-1,"live_boost":-1,"premium_currency":0,"continue":False,"live_rewards":"one naturally restarted completed Auto Live only"},"resources differ")
    c=p["observation_contract"];require(c["observation_only"] and not any(c[k] for k in ["return_replacement","memory_writes","apk_modification","managed_invocation","continue_operation"]),"forbidden capability enabled")
    require('"SituationSkillManager.ExecAwakeStart": 0x33214FC' in s and "hook('SituationSkillManager.ExecAwakeStart'" in s,"ExecAwakeStart hook missing")
    require('"SituationSkillManager.Stop": 0x33228D8' in s and "hook('SituationSkillManager.Stop'" in s,"optional Stop hook missing")
    require("required_exec_awake_start_leave_count" in s and 'event["kind"] == "SituationSkillManager.ExecAwakeStart.leave"' in s,"completion missing")
    require("Interceptor.replace" not in s and "Memory.write" not in s and "NativeFunction" not in s,"replacement/write/invocation primitive present")
    require("pointer:" not in s and "managedString" not in s and "situationSkillId" not in s and "skillId" not in s,"identity/string export primitive present")
    print("verified Skill-Playing Retry reset plan: ExecAwakeStart=0x33214FC count=2 Auto/Boost=-1/-1")
    return 0
if __name__=="__main__":raise SystemExit(main())
