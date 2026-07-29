#!/usr/bin/env python3
"""Fail-closed verifier for the 10.1.4 score/life/state static evidence."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TARGET_DUMP = ROOT / "static/il2cpp/dump-10.1.4_230"
TARGET_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"
TARGET_METADATA = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/global-metadata.dat"
CONTRACT = HERE / "score_life_state_static_contract.json"
FINDINGS = HERE / "score_life_state_static_findings.json"
STATIC_CLOSURE = HERE / "static_closure.json"
SHA256SUMS = HERE / "SHA256SUMS"

EXPECTED_BINARY_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
EXPECTED_METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
EXPECTED_METHODS = 326
EXPECTED_LAYOUTS = 25
EXPECTED_ENUMS = 19


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_elf(path: Path) -> tuple[bytes, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    require(data[:5] == b"\x7fELF\x02", f"not ELF64: {path}")
    phoff, = struct.unpack_from("<Q", data, 0x20)
    phentsize, phnum = struct.unpack_from("<HH", data, 0x36)
    segments: list[tuple[int, int, int]] = []
    for index in range(phnum):
        offset = phoff + index * phentsize
        if struct.unpack_from("<I", data, offset)[0] != 1:
            continue
        file_offset, virtual_address, _, file_size = struct.unpack_from("<QQQQ", data, offset + 8)
        segments.append((virtual_address, file_offset, file_size))
    require(bool(segments), "ELF has no PT_LOAD segment")
    return data, segments


def read_va(data: bytes, segments: list[tuple[int, int, int]], address: int, size: int) -> bytes:
    for virtual_address, file_offset, file_size in segments:
        if virtual_address <= address and address + size <= virtual_address + file_size:
            start = file_offset + address - virtual_address
            return data[start:start + size]
    fail(f"VA range 0x{address:X}+0x{size:X} is outside PT_LOAD")
    raise AssertionError


def parse_fields(dump_path: Path, wanted: set[str]) -> dict[str, dict[str, str]]:
    header = re.compile(
        r"^(?:public|internal|private|protected)?\s*"
        r"(?:sealed\s+|abstract\s+|static\s+|readonly\s+)*"
        r"(?:class|struct)\s+([A-Za-z0-9_.<>`]+)"
    )
    field = re.compile(r";\s*//\s*(0x[0-9A-Fa-f]+)\s*$")
    result: dict[str, dict[str, str]] = {}
    current: str | None = None
    in_fields = False
    with dump_path.open(encoding="utf-8", errors="replace") as source:
        for line in source:
            stripped = line.strip()
            match = header.match(stripped)
            if match:
                current = match.group(1) if match.group(1) in wanted else None
                in_fields = False
                continue
            if current is None:
                continue
            if stripped == "// Fields":
                in_fields = True
                continue
            if stripped.startswith("// "):
                in_fields = False
                continue
            if in_fields:
                offset = field.search(stripped)
                if offset:
                    result.setdefault(current, {})[stripped[:offset.start()].strip()] = offset.group(1)
    return result


def parse_enums(dump_path: Path, wanted: set[str]) -> dict[str, dict[str, int]]:
    header = re.compile(r"^(?:public|internal|private|protected)?\s*enum\s+([A-Za-z0-9_.<>`]+)")
    member = re.compile(r"public const [^ ]+ ([A-Za-z0-9_]+) = (-?[0-9]+);")
    result: dict[str, dict[str, int]] = {}
    current: str | None = None
    with dump_path.open(encoding="utf-8", errors="replace") as source:
        for line in source:
            stripped = line.strip()
            match = header.match(stripped)
            if match:
                current = match.group(1) if match.group(1) in wanted else None
                continue
            if current is None:
                continue
            if stripped == "}":
                current = None
                continue
            value = member.match(stripped)
            if value:
                result.setdefault(current, {})[value.group(1)] = int(value.group(2))
    return result


def verify_sha256s() -> None:
    require(SHA256SUMS.is_file(), "missing SHA256SUMS")
    listed: dict[str, str] = {}
    for line in SHA256SUMS.read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([0-9A-F]{64})  (.+)", line)
        require(match is not None, f"malformed SHA256SUMS row: {line!r}")
        checksum, relative = match.groups()
        require(relative not in listed, f"duplicate SHA256SUMS path: {relative}")
        listed[relative] = checksum
    actual = {
        path.relative_to(HERE).as_posix()
        for path in HERE.rglob("*")
        if path.is_file() and path != SHA256SUMS and "__pycache__" not in path.parts
    }
    require(set(listed) == actual, "SHA256SUMS has stale or missing paths")
    for relative, checksum in listed.items():
        require(digest(HERE / relative) == checksum, f"SHA256SUMS mismatch: {relative}")


def verify_instruction_fragments() -> None:
    requirements = {
        "arm64/032f25b8__InGameRecord__InitializeLife.arm64.tsv": [
            "0x32F25B8\t03040429\tstp w3, w1, [x0, #0x20]",
            "0x32F25BC\t022800B9\tstr w2, [x0, #0x28]",
        ],
        "arm64/032f262c__InGameRecord__AddIPower.arm64.tsv": [
            "0x32F263C\t68464039\tldrb w8, [x19, #0x11]",
            "0x32F2644\t684A4039\tldrb w8, [x19, #0x12]",
            "0x32F2658\t606240BD\tldr s0, [x19, #0x60]",
            "0x32F266C\t0001010B\tadd w0, w8, w1",
            "0x32F267C\t682A40B9\tldr w8, [x19, #0x28]",
            "0x32F2698\t7F2200B9\tstr wzr, [x19, #0x20]",
            "0x32F269C\t04000094\tbl #0x32f26ac\tInGameRecord$$updateGameOverState",
        ],
        "arm64/032f272c__InGameRecord__AddCombo.arm64.tsv": [
            "0x32F2738\t0801010B\tadd w8, w8, w1",
            "0x32F2768\t1FFC0629\tstp wzr, wzr, [x0, #0x34]", 
        ],
        "arm64/0331e660__ScoreUtility__InitBaseScore.arm64.tsv": [
            "0x331E6DC\tA8160051\tsub w8, w21, #5",
            "0x331E6F8\t0A102E1E\tfmov s10, #1.00000000",
            "0x331E774\t0110211E\tfmov s1, #3.00000000",
        ],
        "arm64/0331ea00__ScoreUtility__GetComboCorrectionRate.arm64.tsv": [
            "0x331EA00\t1F540071\tcmp w0, #0x15",
            "0x331EA54\t1FF00A71\tcmp w0, #0x2bc",
        ],
        "arm64/03321a08__SituationSkillManager__executePlayingSkillProcess.arm64.tsv": [
            "0x3321A10\t088840BD\tldr s8, [x0, #0x88]",
            "0x3321A34\t0039201E\tfsub s0, s8, s0",
            "0x3321A50\t08E8A7D2\tmov x8, #0x3f400000",
            "0x3321A58\t68C208F8\tstur x8, [x19, #0x8c]",
        ],
        "arm64/0332269c__SituationSkillManager__playOnceEffectSkill.arm64.tsv": [
            "0x3322780\tE9A39052\tmov w9, #0x851f",
            "0x3322790\t087D0A1B\tmul w8, w8, w10",
            "0x33227C0\t9B3FFF97\tbl #0x32f262c\tInGameRecord$$AddIPower",
        ],
        "arm64/032f3bf8__FeverTimeManager__GetFeverTimeScoreRate.arm64.tsv": [
            "0x32F3BFC\t00102E1E\tfmov s0, #1.00000000",
            "0x32F3C00\t0110201E\tfmov s1, #2.00000000",
            "0x32F3C08\t200C201E\tfcsel s0, s1, s0, eq",
        ],
        "arm64/033dadcc__SkillUtility__shouldActivateNeverDieSkillEffect.arm64.tsv": [
            "0x33DADCC\tE803014B\tneg w8, w1",
            "0x33DADD0\t1F01006B\tcmp w8, w0",
            "0x33DADD4\tE0B79F1A\tcset w0, ge",
        ],
        "arm64/033daddc__SkillUtility__CalcAddDamageWithNeverDieSkill.arm64.tsv": [
            "0x33DADE0\tA9008052\tmov w9, #5",
            "0x33DADE4\t2901004B\tsub w9, w9, w0",
            "0x33DADEC\t20B0891A\tcsel w0, w1, w9, lt",
        ],
    }
    for relative, fragments in requirements.items():
        text = (HERE / relative).read_text(encoding="utf-8")
        for fragment in fragments:
            require(fragment in text, f"missing exact instruction fragment: {relative}: {fragment}")


def main() -> int:
    for path in (TARGET_BINARY, TARGET_METADATA, CONTRACT, FINDINGS, STATIC_CLOSURE):
        require(path.is_file(), f"missing required file: {path}")
    require(digest(TARGET_BINARY) == EXPECTED_BINARY_SHA256, "libil2cpp.so SHA-256 mismatch")
    require(digest(TARGET_METADATA) == EXPECTED_METADATA_SHA256, "global-metadata.dat SHA-256 mismatch")

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    closure = json.loads(STATIC_CLOSURE.read_text(encoding="utf-8"))
    findings = json.loads(FINDINGS.read_text(encoding="utf-8"))
    require(contract["target"]["libil2cpp_sha256"] == EXPECTED_BINARY_SHA256, "contract binary identity mismatch")
    require(contract["target"]["global_metadata_sha256"] == EXPECTED_METADATA_SHA256, "contract metadata identity mismatch")
    require(contract["method_status_counts"] == {"mapped": EXPECTED_METHODS}, "method status is not fully mapped")
    require(contract["layout_status_counts"] == {"unchanged": EXPECTED_LAYOUTS}, "layout status is not fully closed")
    require(contract["enum_status_counts"] == {"unchanged": EXPECTED_ENUMS}, "enum status is not fully closed")
    require(len(contract["methods"]) == EXPECTED_METHODS, "method count mismatch")
    require(len(contract["field_layout"]) == EXPECTED_LAYOUTS, "layout count mismatch")
    require(len(contract["enums"]) == EXPECTED_ENUMS, "enum count mismatch")

    script = json.loads((TARGET_DUMP / "script.json").read_text(encoding="utf-8"))["ScriptMethod"]
    script_by_name: dict[str, list[dict[str, Any]]] = {}
    addresses = sorted({int(row["Address"]) for row in script})
    for row in script:
        script_by_name.setdefault(row["Name"], []).append(row)
    next_by_address = {address: addresses[index + 1] for index, address in enumerate(addresses[:-1])}
    elf, segments = load_elf(TARGET_BINARY)

    with (HERE / "targets.tsv").open(encoding="utf-8", newline="") as source:
        target_rows = list(csv.DictReader(source, delimiter="\t"))
    require(len(target_rows) == EXPECTED_METHODS, "targets.tsv row count mismatch")
    target_by_rva = {int(row["target_rva"], 16): row for row in target_rows}
    evidence_files: set[str] = set()
    for row in contract["methods"]:
        require(row["status"] == "mapped", f"non-mapped method: {row['owner']}::{row['method']}")
        start = int(row["target_rva"], 16)
        end = int(row["target_end_rva"], 16)
        require(end > start and end - start == row["target_size"], f"invalid boundary at 0x{start:X}")
        require(next_by_address.get(start) == end, f"boundary is not global next managed entry at 0x{start:X}")
        name = f"{row['owner']}$${row['method']}"
        exact = [candidate for candidate in script_by_name.get(name, []) if candidate.get("Signature") == row["signature"] and int(candidate["Address"]) == start]
        require(len(exact) == 1, f"metadata-name/signature mapping is not unique: {name} @ 0x{start:X}")
        code = read_va(elf, segments, start, end - start)
        require(hashlib.sha256(code).hexdigest().upper() == row["target_sha256"], f"method bytes mismatch: {name}")
        evidence = row["evidence"]
        require(evidence not in evidence_files, f"duplicate ARM64 evidence path: {evidence}")
        evidence_files.add(evidence)
        evidence_path = HERE / evidence
        require(evidence_path.is_file(), f"missing ARM64 evidence: {evidence}")
        with evidence_path.open(encoding="utf-8", newline="") as source:
            lines = list(csv.DictReader(source, delimiter="\t"))
        require(len(lines) * 4 == len(code), f"instruction count/byte-size mismatch: {evidence}")
        rebuilt = bytearray()
        for index, instruction in enumerate(lines):
            require(int(instruction["address"], 16) == start + index * 4, f"non-contiguous ARM64 address: {evidence}")
            word = bytes.fromhex(instruction["bytes"])
            require(len(word) == 4, f"non-word instruction bytes: {evidence}")
            rebuilt.extend(word)
        require(bytes(rebuilt) == code, f"ARM64 TSV differs from locked ELF: {evidence}")
        target = target_by_rva.get(start)
        require(target is not None and target["evidence"] == evidence and target["status"] == "mapped", f"targets.tsv disagrees at 0x{start:X}")
    require({path.relative_to(HERE).as_posix() for path in (HERE / "arm64").glob("*.tsv")} == evidence_files, "ARM64 directory has stale or missing method slices")

    dump_cs = TARGET_DUMP / "dump.cs"
    wanted_layouts = {row["type"] for row in contract["field_layout"]}
    actual_layouts = parse_fields(dump_cs, wanted_layouts)
    for row in contract["field_layout"]:
        require(row["status"] == "unchanged" and not row["changed"] and not row["added"] and not row["removed"], f"layout migration is not closed: {row['type']}")
        require(actual_layouts.get(row["type"]) == row["target_fields"], f"dump.cs layout mismatch: {row['type']}")
    wanted_enums = {row["enum"] for row in contract["enums"]}
    actual_enums = parse_enums(dump_cs, wanted_enums)
    for row in contract["enums"]:
        require(row["status"] == "unchanged", f"enum migration is not closed: {row['enum']}")
        require(actual_enums.get(row["enum"]) == row["target"], f"dump.cs enum mismatch: {row['enum']}")

    require(contract["named_constants"] == {
        "BMSDefine": {"DefaultLifeValue": 1000, "MaxLifeValue": 2000, "LeaderIndex": 2, "LifeWhenNeverDieEffect": 5},
        "FeverTimeManager": {"FEVER_LEVEL_1_POINT": 80, "FEVER_LEVEL_1_SCORE_RATE": 2},
    }, "named constants mismatch")
    require(read_va(elf, segments, 0x1581A14, 20) == bytes.fromhex("00000000000000000000003FCDCC4C3FCDCC8C3F"), "result-rate rodata mismatch")
    require(read_va(elf, segments, 0x1533250, 8) == bytes.fromhex("CDCC8C3F7B148E3F"), "combo-rate tail rodata mismatch")
    verify_instruction_fragments()

    require(closure["version_rebaseline"] == "closed", "static version gate is not closed")
    require(closure["unknown_methods"] == [] and closure["unknown_layouts"] == [], "static closure has unknown methods/layouts")
    require(closure["business_state_gate"] == "open", "static-only evidence must not close business gate")
    require(bool(closure["blocking_findings"]), "static closure must preserve B02 blockers")
    require(findings["status"] == "confirmed-static-10.1.4-business-gate-open", "findings status mismatch")
    require(findings["unknown_fields"] == [], "static findings contain unknown asserted fields")
    require(bool(findings["runtime_required_before_code"]), "runtime blocker list is empty")
    verify_sha256s()

    print(
        f"verified score/life/state static contract: methods={EXPECTED_METHODS} "
        f"layouts={EXPECTED_LAYOUTS} enums={EXPECTED_ENUMS} version_rebaseline=closed business_state_gate=open"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, ValueError, json.JSONDecodeError) as error:
        fail(f"malformed evidence: {error}")
