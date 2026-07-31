#!/usr/bin/env python3
"""Verify the observation-only rehearsal pause/ReturnTime plan."""

from __future__ import annotations

import json
from pathlib import Path


BASE = Path(__file__).resolve().parent
PLAN = BASE / "runtime" / "rehearsal-pause-return-time-r1-plan.json"
CAPTURE = BASE / "capture_score_life_rehearsal_pause_return_time.py"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")
    require(plan["scenario_id"] == "ordinary-rehearsal-pause-return-time-r1" and plan["status"] == "ready-for-observation", "unexpected scenario")
    require(plan["sample"]["mode"] == "rehearsal" and plan["tail_seconds"] == 0 and len(plan["actions"]) == 13, "sample/action boundary differs")
    require([action["marker"] for action in plan["actions"]] == [
        "paused-initial-window-complete","resume-first","running-first-window-complete","pause-second",
        "paused-second-window-complete","resume-second","running-second-window-complete","rehearsal-rewind",
        "post-rewind-window-complete","pause-final","final-pause-window-complete","abort-rehearsal","post-abort-tail"], "actions differ")
    require(plan["declared_account_resource_effects"] == {"auto_live_uses":0,"live_boost":0,"premium_currency":0,"continue":False}, "resource effects differ")
    contract = plan["observation_contract"]
    require(contract["observation_only"] and not any(contract[key] for key in ["return_replacement","memory_writes","apk_modification","managed_invocation","continue_operation"]), "forbidden capability enabled")
    for target in ["InGameRecord.AddIPower","InGameRecord.updateGameOverState","SituationSkillManager.ExecUpdate","InGameMoveTimeController.returnTime"]:
        require(f'"{target}"' in source and f"hook('{target}'" in source, f"missing target/hook: {target}")
    require("['CommandNoteManager.ReturnTime','NoteManager.ReturnTime']" in source and "hook(name" in source, "snapshot ReturnTime hooks missing")
    require("snapshot_present:!args[1].isNull()" in source and "back_second:this.back" in source, "privacy-safe ReturnTime projection missing")
    require("Interceptor.replace" not in source and "Memory.write" not in source and "NativeFunction" not in source, "replacement/write/invocation primitive present")
    require("pointer:" not in source and "managedString" not in source and "situationSkillId" not in source and "skillId" not in source, "identity/string export primitive present")
    require(not any("retry" in action["marker"] or "start" in action["marker"] for action in plan["actions"]), "Retry/Live start action present")
    print("verified rehearsal pause/ReturnTime plan: actions=13 pauseWindows=2 rewind=1 resources=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
