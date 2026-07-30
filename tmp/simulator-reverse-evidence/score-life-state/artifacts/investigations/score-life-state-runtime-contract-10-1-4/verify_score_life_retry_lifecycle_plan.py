#!/usr/bin/env python3
"""Fail-closed verifier for the post-Game-Over non-destructive Retry R1 plan."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
PLAN = ROOT / "runtime" / "multitouch-seven-lane-post-gameover-retry-r1-plan.json"
SOURCE_PLAN = ROOT / "runtime" / "multitouch-seven-lane-native-skill-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_state_multitouch_runtime.py"
CONTROL = ROOT / "runtime-control" / "multitouch_seven_lane_control.arm64"
SOURCE_COMMIT = "4ac4ea186efade9091c6f4377ab7ad7dc852a2c5"
SOURCE_PLAN_SHA = "0A345C27D75B83047CD2FE4771B1426DD6772155DD1F9D495A06FC9722B114D4"
CONTROL_SHA = "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def exact(value: Any, expected: Any, label: str) -> None:
    require(value == expected, f"{label} differs")


def main() -> int:
    require(all(path.is_file() for path in (PLAN, SOURCE_PLAN, CAPTURE, CONTROL)), "Retry plan input missing")
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    source_plan = json.loads(SOURCE_PLAN.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")

    require(digest(SOURCE_PLAN) == SOURCE_PLAN_SHA, "source native plan hash differs")
    require(digest(CONTROL) == CONTROL_SHA, "native control hash differs")
    exact(plan["schema_version"], 1, "schema")
    exact(plan["scenario_id"], "multitouch-seven-lane-post-gameover-retry-lifecycle-v3", "scenario")
    provenance = plan["control_provenance"]
    exact(provenance["source_commit"], SOURCE_COMMIT, "source commit")
    exact(
        provenance["source_plan_path"],
        "artifacts/investigations/score-life-state-runtime-contract-10-1-4/runtime/multitouch-seven-lane-native-skill-r1-plan.json",
        "source path",
    )
    exact(provenance["source_plan_sha256"], SOURCE_PLAN_SHA, "source hash")
    exact(provenance["control_binary_sha256"], CONTROL_SHA, "control hash")

    exact(
        plan["safety"],
        {
            "retry_only": True,
            "continue_allowed": False,
            "premium_currency_actions": [],
            "target_process_memory_writes": False,
            "return_replacement": False,
            "apk_modification": False,
            "selinux_restore_required": True,
        },
        "safety boundary",
    )
    actions = plan["actions"]
    require(len(actions) == 8, "action count differs")
    require(actions[:4] == source_plan["actions"], "native source actions changed")
    exact(
        actions[4],
        {"kind": "wait", "delay_ms": 12000, "marker": "post-game-over-observation-window"},
        "post-Game-Over wait",
    )
    exact(
        actions[5],
        {"kind": "tap", "x": 800, "y": 440, "marker": "post-game-over-open-retry-confirmation"},
        "post-Game-Over Retry tap",
    )
    exact(
        actions[6],
        {
            "kind": "tap",
            "x": 920,
            "y": 440,
            "delay_ms": 750,
            "marker": "post-game-over-confirm-retry",
        },
        "post-Game-Over Retry confirmation",
    )
    exact(
        actions[7],
        {"kind": "wait", "delay_ms": 1500, "marker": "post-retry-reset-observation"},
        "post-Retry observation",
    )
    exact(plan["tail_seconds"], 5, "tail")
    require(all(action["kind"] in {"wait", "tap", "multitap_native"} for action in actions), "forbidden action kind")
    require("continue" not in PLAN.read_text(encoding="utf-8").lower().replace('"continue_allowed": false', ""), "Continue action present")

    require('if kind == "wait":' in source and 'if kind == "tap":' in source, "capture action support differs")
    require('if kind == "multitap_native":' in source, "native action support differs")
    require('adb("shell", "su", "-c", "setenforce 1"' in source, "SELinux restoration missing")
    require('adb("shell", "su", "-c", f"rm -f {CONTROL_REMOTE_PATH}"' in source, "device helper cleanup missing")
    require("Interceptor.replace" not in source and "retval.replace" not in source and "Memory.patchCode" not in source, "capture is not observation-only")

    print(
        "verified pending post-Game-Over Retry plan: source_actions=4 total_actions=8 "
        "post_gameover_wait_ms=12000 retry_only=true continue=false status=not-runtime-evidence"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
