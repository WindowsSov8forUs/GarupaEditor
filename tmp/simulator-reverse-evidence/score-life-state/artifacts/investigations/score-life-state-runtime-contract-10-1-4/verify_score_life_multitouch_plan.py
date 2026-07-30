#!/usr/bin/env python3
"""Fail-closed verifier for the pending native seven-lane Linux MT capture plan."""

from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BASE_CAPTURE = ROOT / "capture_score_life_state_runtime.py"
MT_CAPTURE = ROOT / "capture_score_life_state_multitouch_runtime.py"
SHELL_PLAN = ROOT / "runtime" / "multitouch-seven-lane-skill-r1-plan.json"
NATIVE_PLAN = ROOT / "runtime" / "multitouch-seven-lane-native-skill-r1-plan.json"
CONTROL_SOURCE = ROOT / "runtime-control" / "multitouch_seven_lane_control.c"
CONTROL_BINARY = ROOT / "runtime-control" / "multitouch_seven_lane_control.arm64"
CONTROL_BUILD = ROOT / "runtime-control" / "multitouch_seven_lane_control.build.json"
SOURCE_SHA = "4845E1F487782E9A167AC03D8F1B133AC557643B39EF08BC5A1E7620117FBC60"
BINARY_SHA = "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


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


def retry_prefix() -> list[dict[str, object]]:
    return [
        {"kind": "tap", "x": 800, "y": 440, "marker": "multitouch-open-retry-confirmation"},
        {"kind": "tap", "x": 920, "y": 440, "delay_ms": 750, "marker": "multitouch-confirm-retry"},
        {"kind": "wait", "delay_ms": 300, "marker": "multitouch-pre-burst"},
    ]


def main() -> int:
    required = [BASE_CAPTURE, MT_CAPTURE, SHELL_PLAN, NATIVE_PLAN, CONTROL_SOURCE, CONTROL_BINARY, CONTROL_BUILD]
    require(all(path.is_file() for path in required), "multitouch plan input missing")
    targets = literal_targets(MT_CAPTURE)
    require(targets == literal_targets(BASE_CAPTURE) and len(targets) == 50, "multitouch capture hook targets differ")

    capture = MT_CAPTURE.read_text(encoding="utf-8")
    require("Interceptor.attach" in capture, "observation hooks missing")
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
        require(forbidden not in capture, f"forbidden target-process mutation primitive: {forbidden}")
    for fragment in (
        'CONTROL_BINARY_SHA256 = "AB39066A205A1E4B4CA9B335D43204064712A850CF041C86684B5E2E4B59C249"',
        'if kind == "multitap_native":',
        '"event_device": "/dev/input/event2"',
        '"screen_xs": [380, 520, 660, 800, 940, 1080, 1220]',
        '"repeat": 250',
        '"interval_ms": 80',
        '"touch_ms": 20',
        'adb("push", str(CONTROL_BINARY), CONTROL_REMOTE_PATH',
        'if adb("shell", "getenforce") != "Enforcing":',
        'adb("shell", "su", "-c", "setenforce 0"',
        "finally:",
        'adb("shell", "su", "-c", "setenforce 1"',
        'adb("shell", "su", "-c", f"rm -f {CONTROL_REMOTE_PATH}"',
        '"temporary_selinux_permissive":True',
        '"selinux_restore_required":True',
    ):
        require(fragment in capture, f"native control safety fragment missing: {fragment}")

    source = CONTROL_SOURCE.read_text(encoding="utf-8")
    require(digest(CONTROL_SOURCE) == SOURCE_SHA, "control source hash differs")
    for fragment in (
        'kEventDevice = "/dev/input/event2"',
        "kRawX = 70",
        "kRawY[7] = {380, 520, 660, 800, 940, 1080, 1220}",
        "kRepeat = 250",
        "kTouchNanoseconds = 20000000L",
        "kReleaseNanoseconds = 60000000L",
        "emit_event(fd, EV_ABS, ABS_MT_SLOT, slot)",
        "emit_event(fd, EV_ABS, ABS_MT_TRACKING_ID, 100 + slot)",
        "emit_event(fd, EV_KEY, BTN_TOUCH, 1)",
        "emit_event(fd, EV_KEY, BTN_TOUCH, 0)",
        "nanosleep(&request, &request)",
    ):
        require(fragment in source, f"control source fragment missing: {fragment}")
    for forbidden in ("ptrace", "process_vm_writev", "/proc/", "dlopen", "socket("):
        require(forbidden not in source, f"forbidden control source capability: {forbidden}")

    binary = CONTROL_BINARY.read_bytes()
    require(len(binary) == 6304 and digest(CONTROL_BINARY) == BINARY_SHA, "control binary differs")
    require(binary[:6] == b"\x7fELF\x02\x01" and int.from_bytes(binary[18:20], "little") == 183, "control binary is not ELF64 AArch64")
    build = json.loads(CONTROL_BUILD.read_text(encoding="utf-8"))
    require(
        build["status"] == "confirmed-capture-control-not-runtime-evidence"
        and build["ndk_revision"] == "27.2.12479018"
        and build["target"] == "aarch64-unknown-linux-android24"
        and build["source"]["sha256"] == SOURCE_SHA
        and build["binary"]["sha256"] == BINARY_SHA
        and build["fixed_control"]["slots"] == 7
        and build["fixed_control"]["repeat"] == 250
        and build["capability"]["target_process_memory_writes"] is False
        and build["capability"]["input_device_writes_only"] is True
        and build["capability"]["selinux_restore_required"] is True,
        "control build provenance differs",
    )

    shell_plan = json.loads(SHELL_PLAN.read_text(encoding="utf-8"))
    require(shell_plan["scenario_id"] == "multitouch-seven-lane-positive-skill-window", "shell scenario differs")
    require(shell_plan["actions"][:3] == retry_prefix(), "shell Retry prefix differs")
    require(shell_plan["actions"][3]["kind"] == "multitap_burst", "shell control identity differs")
    require(digest(SHELL_PLAN) == "AC9D59776EBE4913E27993DE6FBC5964BD91B7200EC0F7F5379DC5EF4E6A4D5E", "shell plan hash differs")

    native_plan = json.loads(NATIVE_PLAN.read_text(encoding="utf-8"))
    require(native_plan["schema_version"] == 1, "native plan schema differs")
    require(native_plan["scenario_id"] == "multitouch-seven-lane-native-positive-skill-window-v2", "native scenario differs")
    require(
        native_plan["control_provenance"]
        == {
            "source_commit": "eb7aba5467569b577cd942957dd65bdce600bc9d",
            "source_plan_path": "artifacts/investigations/score-life-state-runtime-contract-10-1-4/runtime/multitouch-seven-lane-skill-r1-plan.json",
            "source_plan_sha256": "AC9D59776EBE4913E27993DE6FBC5964BD91B7200EC0F7F5379DC5EF4E6A4D5E",
            "change": "replace the shell multitap_burst action with one committed ARM64 control binary; Retry timing and fixed 7-slot/250-cycle/80ms/20ms values remain unchanged",
            "control_source_path": "runtime-control/multitouch_seven_lane_control.c",
            "control_source_sha256": SOURCE_SHA,
            "control_binary_path": "runtime-control/multitouch_seven_lane_control.arm64",
            "control_binary_sha256": BINARY_SHA,
            "control_build_path": "runtime-control/multitouch_seven_lane_control.build.json",
        },
        "native control provenance differs",
    )
    require(native_plan["actions"][:3] == retry_prefix(), "native Retry prefix differs")
    require(
        native_plan["actions"][3]
        == {
            "kind": "multitap_native",
            "marker": "multitouch-native-seven-lane-burst",
            "event_device": "/dev/input/event2",
            "screen_height": 720,
            "screen_y": 650,
            "screen_xs": [380, 520, 660, 800, 940, 1080, 1220],
            "repeat": 250,
            "interval_ms": 80,
            "touch_ms": 20,
            "control_binary_sha256": BINARY_SHA,
        }
        and native_plan["tail_seconds"] == 5,
        "native Linux MT action differs",
    )

    print(
        "verified pending native score/life multitouch plan: hooks=50 ELF64-AArch64=6304 "
        "slots=7 repeat=250 interval_ms=80 selinux=restore-required status=not-runtime-evidence"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
