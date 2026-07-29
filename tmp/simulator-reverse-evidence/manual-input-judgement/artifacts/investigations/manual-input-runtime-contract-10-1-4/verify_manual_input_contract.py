#!/usr/bin/env python3
"""Verify the committed 10.1.4 manual-input static contract offline."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import struct


HERE = Path(__file__).resolve().parent
EXPECTED_BINARY = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
EXPECTED_METADATA = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
IMM12_MASK = 0x003FFC00
TARGET_BINARY = HERE.parents[2] / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def method_index(contract: dict) -> dict[tuple[str, str], dict]:
    return {(row["owner"], row["method"]): row for row in contract["methods"]}


def main() -> int:
    contract = json.loads((HERE / "manual_input_static_contract.json").read_text(encoding="utf-8"))
    require(contract["target"] == {
        "version_name": "10.1.4",
        "version_code": 230,
        "abi": "arm64-v8a",
        "libil2cpp_sha256": EXPECTED_BINARY,
        "global_metadata_sha256": EXPECTED_METADATA,
    }, "target identity changed")
    require(contract["method_status_counts"] == {"mapped": 117}, "all 117 methods must map")
    require(contract["layout_status_counts"] == {"unchanged": 14}, "all 14 layouts must match")
    require(contract["enum_status_counts"] == {"unchanged": 13}, "all 8 enums must match")

    methods = method_index(contract)
    for key, row in methods.items():
        require(row["status"] == "mapped", f"unmapped method {key}")
        require(row["signature_unchanged"], f"signature changed {key}")
        require(row["baseline_size"] == row["target_size"], f"size changed {key}")
        require(int(row["target_end_rva"], 16) - int(row["target_rva"], 16) == row["target_size"], f"range mismatch {key}")
        evidence = HERE / row["evidence"]
        require(evidence.is_file(), f"missing ARM64 evidence {evidence}")
        lines = evidence.read_text(encoding="utf-8").splitlines()
        require(lines[0] == "address\tbytes\tinstruction\tresolved_target", f"bad header {evidence}")
        require(int(lines[1].split("\t", 1)[0], 16) == int(row["target_rva"], 16), f"bad first address {key}")
        require(int(lines[-1].split("\t", 1)[0], 16) + 4 == int(row["target_end_rva"], 16), f"bad last address {key}")
        for difference in row["differing_word_detail"]:
            old_word = int(difference["baseline_word"], 16)
            new_word = int(difference["target_word"], 16)
            old_pc = difference["baseline_pc_relative"]
            new_pc = difference["target_pc_relative"]
            if old_pc is not None and new_pc is not None:
                require(old_pc == new_pc, f"PC-relative class changed {key} {difference['offset']}")
            else:
                require((old_word & ~IMM12_MASK) == (new_word & ~IMM12_MASK), f"non-global-table word changed {key} {difference}")

    require(methods[("NoteSlide", "WaitState")]["target_rva"] == "0x321B414", "Slide Wait start")
    require(methods[("NoteSlide", "WaitState")]["target_end_rva"] == "0x321B628", "Slide Wait end")
    require(methods[("NoteSlide", "execOverWaitState")]["target_rva"] == "0x321B628", "Slide over-Wait start")
    require(methods[("NoteSlide", "execOverWaitState")]["target_end_rva"] == "0x321B69C", "Slide over-Wait end")
    require(methods[("NoteSlide", "WaitState")]["target_sha256"] != methods[("NoteSlide", "execOverWaitState")]["target_sha256"], "Slide Wait functions must be independent")

    layouts = {row["type"]: row["target_fields"] for row in contract["field_layout"]}
    require(layouts["InputManager"]["private ButtonManager buttonManager"] == "0x10", "InputManager.buttonManager")
    require(layouts["InputManager"]["private GamePlayButton gameButton"] == "0x18", "InputManager.gameButton")
    require(layouts["InputManager"]["private ButtonBase[] buttonWithFingerIdArray"] == "0x20", "InputManager finger buttons")
    require(layouts["GamePlayButton"]["private Vector2[] touchBeganPosWithFingerIdArray"] == "0x60", "button touch origins")
    require(layouts["GamePlayButton"]["private NoteFrontBase[] touchBeganNoteWithFingerIdArray"] == "0x68", "button finger notes")
    require(layouts["NoteBase"]["private int fingerId"] == "0xC0", "note finger owner")
    require(layouts["NoteSingleBase"]["private float missSecondCounter"] == "0x184", "Single miss counter")
    require(layouts["NoteFlickBase"]["private float frameCounter"] == "0x188", "Flick frame counter")
    require(layouts["NoteFlickBase"]["protected NoteResultType cachedResult"] == "0x18C", "Flick cached result")
    require(layouts["NoteFlickBase"]["protected JudgeTiming cachedJudgeTiming"] == "0x190", "Flick cached timing")
    require(layouts["NoteUtility"]["public static float MissSecondInterval"] == "0x0", "miss interval static field")

    enums = {row["enum"]: row["target"] for row in contract["enums"]}
    require(enums["TouchPhase"] == {"Began": 0, "Moved": 1, "Stationary": 2, "Ended": 3, "Canceled": 4}, "TouchPhase identity")
    require(enums["NoteResultType"] == {"None": -1, "Miss": 0, "Bad": 1, "Good": 2, "Great": 3, "Perfect": 4}, "result identity")
    require(enums["JudgeTiming"] == {"None": 0, "Fast": 1, "Slow": 2}, "timing identity")
    require(enums["ButtonType"]["None"] == -1 and enums["ButtonType"]["Button_00_BMS_1P_SC"] == 0 and enums["ButtonType"]["Button_07_BMS_1P_07"] == 7, "button identity")
    require(enums["JudgeNoteType"]["Slide"] == 8 and enums["JudgeNoteType"]["DirectionalFlick"] == 9 and enums["JudgeNoteType"]["MultipleDirectionalFlick"] == 10, "judge note identity")
    require(enums["GameNoteAdditionalType"]["BpmChange"] == 3 and enums["VirtualLaneDirection"]["Left"] == 1 and enums["DamageGuardType"]["NeverDieSkill"] == 2, "additional identity")

    assert_line(methods, ("InputManager", ".ctor"), "mov w1, #0xf")
    assert_line(methods, ("NoteSlide", ".ctor"), "str x1, [x19, #0x1f0]")
    assert_line(methods, ("NoteSlide", ".ctor"), "mov w8, #4")
    assert_line(methods, ("NoteSlide", ".ctor"), "mov w1, #5")
    assert_line(methods, ("NoteSingleBase", "MoveState"), "ldr s0, [x8]")
    assert_line(methods, ("NoteSingleBase", "MoveState"), "b.le")
    assert_line(methods, ("NoteFlickBase", "WaitState"), "fmov s1, #7.00000000")
    assert_line(methods, ("NoteFlickBase", "ExecTouchBegan"), "str w21, [x20, #0x18c]")
    assert_line(methods, ("NoteFlickBase", "ExecTouchBegan"), "str w19, [x20, #0x190]")
    assert_line(methods, ("NoteFlick", "ExecTouchMoved"), "ldr s1, [x8, #0x460]")
    assert_line(methods, ("NoteFlick", "ExecTouchMoved"), "b.le")
    assert_line(methods, ("NoteDirectionalFlick", "judgeDirectionalFlickSucceeded"), "ldr s1, [x8, #0x580]")
    assert_line(methods, ("NoteDirectionalFlick", "judgeDirectionalFlickSucceeded"), "cset w0, gt")
    assert_line(methods, ("NoteLong", "ExecTouchMoved"), "fmov s2, #8.00000000")
    assert_line(methods, ("NoteSlide", "ExecTouchMoved"), "fmov s2, #8.00000000")
    assert_line(methods, ("NoteUtility", ".cctor"), "mov w9, #0xddde")
    assert_line(methods, ("NoteUtility", ".cctor"), "movk w9, #0x3e5d, lsl #16")

    binary = TARGET_BINARY.read_bytes()
    phoff = struct.unpack_from("<Q", binary, 0x20)[0]
    phentsize, phnum = struct.unpack_from("<HH", binary, 0x36)
    constant_bytes = None
    for index in range(phnum):
        header = phoff + index * phentsize
        if struct.unpack_from("<I", binary, header)[0] != 1:
            continue
        file_offset, virtual_address, _, file_size = struct.unpack_from("<QQQQ", binary, header + 8)
        if virtual_address <= 0x15366A8 and 0x15366A8 + 4 <= virtual_address + file_size:
            constant_bytes = binary[file_offset + 0x15366A8 - virtual_address:file_offset + 0x15366A8 - virtual_address + 4]
            break
    require(constant_bytes == struct.pack("<I", 0x3C888889), "GetResult frame-rate constant")

    get_result = (HERE / methods[("NoteUtility", "GetResult")]["evidence"]).read_text(encoding="utf-8")
    for immediate in ("add w9, w19, #3", "add w9, w19, #6", "add w9, w19, #7", "add w9, w19, #8"):
        require(immediate in get_result, f"missing exclusive window {immediate}")
    require("b.ge" in get_result, "GetResult upper bounds must be exclusive")

    with (HERE / "targets.tsv").open(encoding="utf-8", newline="") as source:
        rows = list(csv.DictReader(source, delimiter="\t"))
    require(len(rows) == 117, "targets row count")
    require(all(row["status"] == "mapped" for row in rows), "targets must all map")
    verify_sums()
    print("manual input static contract verified: version=10.1.4 methods=117 layouts=14 enums=13 V01=closed D01=closed")
    return 0


def assert_line(methods: dict[tuple[str, str], dict], key: tuple[str, str], fragment: str) -> None:
    text = (HERE / methods[key]["evidence"]).read_text(encoding="utf-8")
    require(fragment in text, f"{key} missing {fragment}")


def verify_sums() -> None:
    lines = (HERE / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    require(lines, "SHA256SUMS is empty")
    for line in lines:
        expected, relative = line.split("  ", 1)
        actual = hashlib.sha256((HERE / relative).read_bytes()).hexdigest().upper()
        require(actual == expected, f"hash mismatch: {relative}")


if __name__ == "__main__":
    raise SystemExit(main())
