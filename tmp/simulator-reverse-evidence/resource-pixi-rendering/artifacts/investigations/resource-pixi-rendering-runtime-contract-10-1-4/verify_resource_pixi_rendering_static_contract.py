#!/usr/bin/env python3
"""Fail-closed verifier for the 10.1.4 resource/rendering static contract."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TARGET_DUMP = ROOT / "static/il2cpp/dump-10.1.4_230"
TARGET_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"
TARGET_METADATA = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/global-metadata.dat"
TARGET_BASE_APK = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/original/base.apk"
TARGET_ARM64_APK = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/original/split_config.arm64_v8a.apk"
CONTRACT = HERE / "resource_pixi_rendering_static_contract.json"
MIGRATION_BUILDER = HERE / "build_resource_pixi_rendering_instruction_migration.py"
MIGRATION = HERE / "resource_pixi_rendering_instruction_migration.json"
SHA256SUMS = HERE / "SHA256SUMS"

EXPECTED = {
    "base_apk_sha256": "D3A6005BB1F7341E39016521390DCEB987E56A0E5D16B6BA73568837A3026413",
    "arm64_split_apk_sha256": "3D846C0AA18CCBA4BFC48B5E6B82C2EED92A999D653057F0766198C1AEA1D9DD",
    "libil2cpp_sha256": "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F",
    "global_metadata_sha256": "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F",
}
EXPECTED_METHODS = 673
EXPECTED_LAYOUTS = 32
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
    require(bool(segments), "ELF has no PT_LOAD segments")
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


def main() -> int:
    for path in (TARGET_DUMP / "dump.cs", TARGET_DUMP / "script.json", TARGET_BINARY, TARGET_METADATA, TARGET_BASE_APK, TARGET_ARM64_APK, CONTRACT, MIGRATION_BUILDER, MIGRATION):
        require(path.is_file(), f"missing required local-only input: {path}")
    require(digest(TARGET_BASE_APK) == EXPECTED["base_apk_sha256"], "base.apk SHA-256 mismatch")
    require(digest(TARGET_ARM64_APK) == EXPECTED["arm64_split_apk_sha256"], "arm64 split APK SHA-256 mismatch")
    require(digest(TARGET_BINARY) == EXPECTED["libil2cpp_sha256"], "libil2cpp.so SHA-256 mismatch")
    require(digest(TARGET_METADATA) == EXPECTED["global_metadata_sha256"], "global-metadata.dat SHA-256 mismatch")

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    target = contract["target"]
    for key, expected in EXPECTED.items():
        require(target[key] == expected, f"contract sample identity mismatch: {key}")
    require(target["dump_cs_sha256"] == digest(TARGET_DUMP / "dump.cs"), "dump.cs SHA-256 mismatch")
    require(target["script_json_sha256"] == digest(TARGET_DUMP / "script.json"), "script.json SHA-256 mismatch")
    require(contract["method_layout_rebaseline"] == "closed", "method/layout rebaseline is open")
    require(contract["method_status_counts"] == {"mapped": EXPECTED_METHODS}, "method mapping is not fully closed")
    require(contract["layout_status_counts"] == {"unchanged": EXPECTED_LAYOUTS}, "layout migration is not fully closed")
    require(contract["enum_status_counts"] == {"unchanged": EXPECTED_ENUMS}, "enum migration is not fully closed")
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
    targets_by_rva = {int(row["target_rva"], 16): row for row in target_rows}
    evidence_files: set[str] = set()
    for row in contract["methods"]:
        require(row["status"] == "mapped", f"non-mapped method: {row['owner']}::{row['method']}")
        start = int(row["target_rva"], 16)
        end = int(row["target_end_rva"], 16)
        require(end > start and end - start == row["target_size"], f"invalid method boundary: 0x{start:X}")
        require(next_by_address.get(start) == end, f"boundary is not next global managed entry: 0x{start:X}")
        dump_name = f"{row['owner']}$${row['method']}"
        exact = [
            candidate for candidate in script_by_name.get(dump_name, [])
            if candidate.get("Signature") == row["signature"] and int(candidate["Address"]) == start
        ]
        require(len(exact) == 1, f"metadata mapping is not unique: {dump_name} @ 0x{start:X}")
        code = read_va(elf, segments, start, end - start)
        require(hashlib.sha256(code).hexdigest().upper() == row["target_sha256"], f"method bytes mismatch: {dump_name}")
        evidence = row["evidence"]
        require(evidence not in evidence_files, f"duplicate evidence path: {evidence}")
        evidence_files.add(evidence)
        with (HERE / evidence).open(encoding="utf-8", newline="") as source:
            instructions = list(csv.DictReader(source, delimiter="\t"))
        require(len(instructions) * 4 == len(code), f"instruction count mismatch: {evidence}")
        rebuilt = bytearray()
        for index, instruction in enumerate(instructions):
            require(int(instruction["address"], 16) == start + index * 4, f"non-contiguous instruction address: {evidence}")
            word = bytes.fromhex(instruction["bytes"])
            require(len(word) == 4, f"non-word instruction: {evidence}")
            rebuilt.extend(word)
        require(bytes(rebuilt) == code, f"ARM64 TSV differs from locked ELF: {evidence}")
        target_row = targets_by_rva.get(start)
        require(target_row is not None and target_row["evidence"] == evidence and target_row["status"] == "mapped", f"targets.tsv mismatch: 0x{start:X}")
    actual_arm64 = {path.relative_to(HERE).as_posix() for path in (HERE / "arm64").glob("*.tsv")}
    require(actual_arm64 == evidence_files, "arm64 directory has stale or missing slices")

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

    spec = importlib.util.spec_from_file_location("verify_instruction_migration_builder", MIGRATION_BUILDER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    migration = json.loads(MIGRATION.read_text(encoding="utf-8"))
    rebuilt_migration = json.loads(json.dumps(module.build_oracle(), ensure_ascii=False))
    require(rebuilt_migration == migration, "instruction migration oracle differs from locked inputs")
    require(migration["status_counts"] == {
        "changed-semantic-instruction-shape": 21,
        "normalized-instruction-equivalent": 652,
    }, "instruction migration status counts mismatch")
    migration_by_method = {(row["owner"], row["method"]): row for row in migration["methods"]}
    for key in (
        ("NoteImageController", "GetNoteSprite"),
        ("AllPerfectStatusAnimation", "ExecUpdate"),
        ("AllPerfectStatusController", "UpdateAllPerfectStatus"),
        ("InGameLifeGauge", "updateWarningGaugeBlink"),
        ("InGameSkillEffectDisplay", "Play"),
        ("JudgeTimingController", "setupJudgeTimingSprite"),
        ("UISpriteNumber", "SetNumber"),
    ):
        require(migration_by_method[key]["status"] == "normalized-instruction-equivalent", f"critical normalized migration changed: {key}")
    require(migration_by_method[("CE.Result", "changeSprite")]["status"] == "changed-semantic-instruction-shape", "ScoreUp route must use current-version dedicated evidence")

    verify_sha256s()
    print(f"verified resource/render static contract: methods={EXPECTED_METHODS} layouts={EXPECTED_LAYOUTS} enums={EXPECTED_ENUMS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
