#!/usr/bin/env python3
"""Verify the observation-only initialization-profile plan before execution."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
PLAN = ROOT / "runtime" / "initialization-profile-retry-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_state_initialization_profile.py"
STATIC = ROOT / "score_life_state_static_contract.json"
INIT_ARM64 = ROOT / "arm64" / "0331e660__ScoreUtility__InitBaseScore.arm64.tsv"
EXPECTED_TARGETS = {
    "InGameCalculatedData.ctor": "0x32F0FCC",
    "InGameRecord.InitializeLife": "0x32F25B8",
    "ScoreUtility.CacheTotalParameter": "0x331E060",
    "ScoreUtility.CachePlayLevelScoreRate": "0x331E188",
    "ScoreUtility.InitBaseScore": "0x331E660",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def main() -> int:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    contract = json.loads(STATIC.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")
    require(plan["schema_version"] == 1, "plan schema differs")
    require(plan["scenario_id"] == "production-initialization-profile-retry-r1", "scenario differs")
    require(plan["precondition"] == "The 10.1.4 poppin_shuffle_special ordinary-family SPECIAL Lv.27 Live Failed dialog is visible with Retry available; SELinux is Enforcing and the explicit non-default Frida transport is already forwarded.", "precondition differs")
    require(plan["production_chart"] == {
        "asset": "poppin_shuffle_special",
        "difficulty": "special",
        "score_level": 27,
        "bms_sha256": "418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC",
    }, "production chart identity differs")
    require(plan["safety"] == {
        "capability": "R1-observation-only",
        "return_replacement": False,
        "memory_writes": False,
        "apk_modification": False,
        "continue_allowed": False,
        "premium_currency_actions": [],
    }, "safety policy differs")
    require(plan["privacy"] == {
        "account_fields_allowed": False,
        "user_deck_contents_allowed": False,
        "room_fields_allowed": False,
        "persistent_user_identifiers_allowed": False,
    }, "privacy policy differs")
    require(plan["actions"] == [
        {"kind": "tap", "x": 800, "y": 440, "marker": "initialization-profile-open-retry-confirmation"},
        {"kind": "tap", "x": 920, "y": 440, "delay_ms": 750, "marker": "initialization-profile-confirm-retry"},
        {"kind": "wait", "delay_ms": 4000, "marker": "initialization-profile-observe"},
    ] and plan["tail_seconds"] == 2, "action list differs")
    require("Interceptor.attach" in source, "capture has no observation hook")
    for forbidden in (
        "Interceptor.replace", "retval.replace", "Memory.patchCode", "Memory.write",
        ".writeS8(", ".writeU8(", ".writeS16(", ".writeU16(", ".writeS32(",
        ".writeU32(", ".writeS64(", ".writeU64(", ".writeFloat(", ".writeDouble(",
    ):
        require(forbidden not in source, f"capture contains forbidden operation: {forbidden}")
    require("account_fields_included:false" in source, "capture privacy projection missing")
    require("user_deck_contents_omitted:true" in source, "deck privacy omission missing")
    require("room_fields_omitted:true" in source, "room privacy omission missing")
    require("--device-address" in source and "explicit-remote" in source, "explicit transport missing")
    require("getenforce" in source and "Enforcing" in source, "SELinux precondition missing")

    mapped = {(row["owner"] + "." + row["method"]): row for row in contract["methods"]}
    contract_names = {
        "InGameCalculatedData.ctor": "InGameCalculatedData..ctor",
        "InGameRecord.InitializeLife": "InGameRecord.InitializeLife",
        "ScoreUtility.CacheTotalParameter": "ScoreUtility.CacheTotalParameter",
        "ScoreUtility.CachePlayLevelScoreRate": "ScoreUtility.CachePlayLevelScoreRate",
        "ScoreUtility.InitBaseScore": "ScoreUtility.InitBaseScore",
    }
    for capture_name, expected_rva in EXPECTED_TARGETS.items():
        row = mapped[contract_names[capture_name]]
        require(row["status"] == "mapped" and row["target_rva"].upper() == expected_rva.upper(), f"target differs: {capture_name}")
        literal = f'"{capture_name}": {expected_rva}'
        require(literal in source, f"capture target literal differs: {capture_name}")
    arm64 = INIT_ARM64.read_text(encoding="utf-8")
    require(re.search(r"^0x331E6C8\t", arm64, re.MULTILINE) is not None, "post-get-instance instruction missing")
    require('"ScoreUtility.InitBaseScore.afterStartData": 0x331E6C8' in source, "start-data observation point differs")
    print(
        "verified score/life initialization profile plan: targets=6 actions=3 "
        f"plan_sha256={digest(PLAN)} capture_sha256={digest(CAPTURE)} privacy=closed-for-plan"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
