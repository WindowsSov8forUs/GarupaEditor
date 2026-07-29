#!/usr/bin/env python3
"""Fail-closed verifier for the pending seven-lane Linux MT score/Skill capture plan."""

from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BASE_CAPTURE = ROOT / "capture_score_life_state_runtime.py"
MT_CAPTURE = ROOT / "capture_score_life_state_multitouch_runtime.py"
PLAN = ROOT / "runtime" / "multitouch-seven-lane-skill-r1-plan.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def literal_targets(path: Path) -> dict[str, int]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "TARGETS" for target in node.targets
        ):
            value = ast.literal_eval(node.value)
            require(isinstance(value, dict), "TARGETS is not a dictionary")
            return value
    raise SystemExit("TARGETS assignment missing")


def main() -> int:
    require(BASE_CAPTURE.is_file() and MT_CAPTURE.is_file() and PLAN.is_file(), "multitouch plan input missing")
    require(literal_targets(BASE_CAPTURE) == literal_targets(MT_CAPTURE), "multitouch capture hook targets differ")
    source = MT_CAPTURE.read_text(encoding="utf-8")
    require("Interceptor.attach" in source, "observation hooks missing")
    for forbidden in (
        "Interceptor.replace",
        "Interceptor.replaceFast",
        "retval.replace",
        "Memory.patchCode",
        "writeByteArray",
        "writePointer",
        "writeS32",
        "writeU32",
        "writeFloat",
    ):
        require(forbidden not in source, f"forbidden target-process mutation primitive: {forbidden}")
    for fragment in (
        'if kind == "multitap_burst":',
        'event_device != "/dev/input/event2"',
        'screen_xs != [380, 520, 660, 800, 940, 1080, 1220]',
        'sendevent {event_device} 3 47 {slot}',
        'sendevent {event_device} 3 57 {100 + slot}',
        'sendevent {event_device} 1 330 1',
        'sendevent {event_device} 1 330 0',
        'if adb("shell", "getenforce") != "Enforcing":',
        'adb("shell", "su", "-c", "setenforce 0"',
        "finally:",
        'adb("shell", "su", "-c", "setenforce 1"',
        '"temporary_selinux_permissive":True',
        '"selinux_restore_required":True',
    ):
        require(fragment in source, f"multitouch safety fragment missing: {fragment}")

    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    require(plan["schema_version"] == 1, "plan schema differs")
    require(plan["scenario_id"] == "multitouch-seven-lane-positive-skill-window", "scenario differs")
    require(
        plan["control_provenance"]
        == {
            "source_commit": "5ce2a7ef325def61986a93053ad85c2f4973f25b",
            "source_script_path": "artifacts/investigations/manual-input-runtime-contract-10-1-4/capture_manual_multitouch_runtime.py",
            "source_script_sha256": "31555FC51CAD1F98C65B443D3298D246EC08C57357202FB7F82DDB3DD4CF3089",
            "source_plan_path": "artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/ui-multitouch-plan.json",
            "source_plan_sha256": "70C0DABBBAA3549A385CD9248793750E1F0BC27485718659DBDE8CC083F3918E",
            "source_trace_path": "artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/ui-multitouch.json",
            "source_trace_sha256": "DA0214D9C4B3005A44F059B0E3D276A8EA4C44A246F23DCC0FB8B0DCAC8C4D62",
            "reuse": "event2 ABS_MT_SLOT/TRACKING_ID/POSITION_X/POSITION_Y, BTN_TOUCH, SYN_REPORT, rotated screen mapping, temporary Permissive bracket and mandatory Enforcing restoration",
        },
        "control provenance differs",
    )
    actions = plan["actions"]
    require(len(actions) == 4 and plan["tail_seconds"] == 5, "plan shape differs")
    require(
        actions[:3]
        == [
            {"kind": "tap", "x": 800, "y": 440, "marker": "multitouch-open-retry-confirmation"},
            {"kind": "tap", "x": 920, "y": 440, "delay_ms": 750, "marker": "multitouch-confirm-retry"},
            {"kind": "wait", "delay_ms": 300, "marker": "multitouch-pre-burst"},
        ],
        "Retry prefix differs",
    )
    require(
        actions[3]
        == {
            "kind": "multitap_burst",
            "marker": "multitouch-seven-lane-burst",
            "event_device": "/dev/input/event2",
            "screen_height": 720,
            "screen_y": 650,
            "screen_xs": [380, 520, 660, 800, 940, 1080, 1220],
            "repeat": 250,
            "interval_ms": 80,
            "touch_ms": 20,
        },
        "Linux MT burst differs",
    )
    print(
        "verified pending score/life multitouch plan: hooks=50 slots=7 repeat=250 interval_ms=80 "
        "selinux=restore-required status=not-runtime-evidence"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
