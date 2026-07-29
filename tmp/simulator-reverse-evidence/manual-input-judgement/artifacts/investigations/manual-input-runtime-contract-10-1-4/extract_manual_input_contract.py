#!/usr/bin/env python3
"""Build the version-10.1.4 static contract for manual input and judgement."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import struct
from typing import Any

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE_DUMP = ROOT / "static/il2cpp/dump"
TARGET_DUMP = ROOT / "static/il2cpp/dump-10.1.4_230"
BASE_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.3_229/extracted/libil2cpp.so"
TARGET_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"

SOURCE_TARGETS = (
    "touch-note-arbitration",
    "touch-hold-release",
    "timeout-flick-paths",
    "judgement-result-pipeline",
)

EXTRA_METHODS = (
    ("NoteBase", "IsContainsButton"),
    ("NoteBase", "get_FingerId"),
    ("NoteBase", "SetFingerId"),
    ("NoteBase", "Deactivate"),
    ("GamePlayButton", ".ctor"),
    ("NoteLong", ".ctor"),
    ("NoteSlide", ".ctor"),
    ("NoteMultipleDirectionalFlick", ".ctor"),
    ("NoteFrontBase", "calculateScreenPosToWorldDistanceRate"),
    ("NoteSingleBase", "MoveState"),
    ("NoteSingleBase", "onMiss"),
    ("NoteSingleBase", "forcePerfect"),
    ("NoteSingleBase", ".ctor"),
    ("NoteFlickBase", "WaitState"),
    ("NoteFlickBase", "ExecTouchBegan"),
    ("NoteFlickBase", "ExecTouchMoved"),
    ("NoteFlickBase", "ExecTouchEnded"),
    ("NoteFlickBase", "forcePerfect"),
    ("NoteFlickBase", "resetFrameCounter"),
    ("NoteFlickBase", "getForcePerfectFlickTouchPosX"),
    ("NoteFlickBase", ".ctor"),
    ("NoteFlick", "getForcePerfectFlickTouchPosX"),
    ("NoteDirectionalFlick", "getForcePerfectFlickTouchPosX"),
    ("NoteUtility", "GetResult"),
    ("NoteUtility", "JudgeNote"),
    ("NoteUtility", "GetSecWithDistance"),
    ("NoteUtility", "IsInsideTargetNoteButtons"),
    ("NoteUtility", "isInsideTargetNoteButton"),
    ("NoteUtility", "CollisionSquared"),
    ("NoteUtility", "CalculateSlideNoteJudgeTiming"),
    ("NoteUtility", ".cctor"),
    ("SlideNoteManager", "GetNearJudgeLineNote"),
    ("SlideNoteManager", "get_VirtualPerfectLine"),
    ("SlideNoteManager", "setupJudgeDictionary"),
    ("SlideNoteManager", "setupPositionEmptyJudgeDataList"),
    ("SlideNoteManager", "setupPositionJudgeDataList"),
    ("SlideNoteManager", "removeNoneJudgeData"),
    ("GamePlayButton", "GetTouchBeganNote"),
    ("GamePlayButton", "setTouchBeganNote"),
    ("GamePlayButton", "Setup"),
    ("InputManager", ".ctor"),
    ("InputManager", "InitData"),
    ("ButtonManager", "GetButton"),
    ("ButtonManager", "GetPlayButton"),
    ("ButtonManager", "calcNearestButton"),
    ("ButtonManager", "calcSecondNearButton"),
    ("ButtonManager", "calcThirdNearButton"),
    ("NoteLong", "Deactivate"),
    ("NoteSlide", "deactivate"),
    ("NoteMultipleDirectionalFlick", "ExecTouchBegan"),
    ("NoteMultipleDirectionalFlick", "ExecTouchMoved"),
    ("NoteMultipleDirectionalFlick", "changeSideNoteUsed"),
    ("NoteMultipleDirectionalFlick", "getMultipleDirectionalFlickNoteCount"),
    ("NoteMultipleDirectionalFlick", "ChangeLeftNoteUsed"),
    ("NoteMultipleDirectionalFlick", "ChangeRightNoteUsed"),
)

LAYOUT_TYPES = (
    "InputManager",
    "GamePlayButton",
    "NoteBase",
    "NoteInformation",
    "NoteFrontBase",
    "NoteSingleBase",
    "NoteFlickBase",
    "NoteLong",
    "NoteSlide",
    "NoteMultipleDirectionalFlick",
    "SlideNoteManager",
    "NoteManager",
    "OneFrameData",
    "NoteUtility",
)

ENUM_TYPES = (
    "TouchPhase",
    "NoteResultType",
    "JudgeTiming",
    "GameNoteType",
    "AfterNoteType",
    "FrontNoteType",
    "NoteState",
    "GameState",
    "ButtonType",
    "JudgeNoteType",
    "GameNoteAdditionalType",
    "VirtualLaneDirection",
    "DamageGuardType",
)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_methods(directory: Path) -> tuple[dict[str, list[dict[str, Any]]], list[int]]:
    data = json.loads((directory / "script.json").read_text(encoding="utf-8"))
    by_name: dict[str, list[dict[str, Any]]] = {}
    for method in data["ScriptMethod"]:
        by_name.setdefault(method["Name"], []).append(method)
    return by_name, sorted({int(method["Address"]) for method in data["ScriptMethod"]})


def load_elf(path: Path) -> tuple[bytes, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    if data[:5] != b"\x7fELF\x02":
        raise SystemExit(f"not ELF64: {path}")
    phoff, = struct.unpack_from("<Q", data, 0x20)
    phentsize, phnum = struct.unpack_from("<HH", data, 0x36)
    segments = []
    for index in range(phnum):
        offset = phoff + index * phentsize
        if struct.unpack_from("<I", data, offset)[0] != 1:
            continue
        file_offset, virtual_address, _, file_size = struct.unpack_from("<QQQQ", data, offset + 8)
        segments.append((virtual_address, file_offset, file_size))
    return data, segments


def read_va(data: bytes, segments: list[tuple[int, int, int]], address: int, size: int) -> bytes:
    for virtual_address, file_offset, file_size in segments:
        if virtual_address <= address and address + size <= virtual_address + file_size:
            start = file_offset + address - virtual_address
            return data[start:start + size]
    raise KeyError(f"range 0x{address:X}+0x{size:X} is outside PT_LOAD")


def next_address(addresses: list[int], address: int) -> int:
    for candidate in addresses:
        if candidate > address:
            return candidate
    raise KeyError(f"no next managed method after 0x{address:X}")


def dump_name(owner: str, method: str) -> str:
    return f"{owner}$${method}"


def target_pairs() -> list[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set(EXTRA_METHODS)
    for investigation in SOURCE_TARGETS:
        path = ROOT / "artifacts/investigations" / investigation / "targets.tsv"
        with path.open(encoding="utf-8", newline="") as source:
            for row in csv.DictReader(source, delimiter="\t"):
                pairs.add((row["owner"], row["method"]))
    return sorted(pairs)


def extract_fields(dump_path: Path) -> dict[str, dict[str, str]]:
    import re
    class_pattern = re.compile(r"^(?:public|internal|private|protected)?\s*(?:sealed\s+|abstract\s+|static\s+)*class\s+([A-Za-z0-9_.<>`]+)")
    field_pattern = re.compile(r";\s*//\s*(0x[0-9A-Fa-f]+)\s*$")
    result: dict[str, dict[str, str]] = {}
    current: str | None = None
    in_fields = False
    with dump_path.open(encoding="utf-8", errors="replace") as source:
        for line in source:
            stripped = line.strip()
            match = class_pattern.match(stripped)
            if match:
                current = match.group(1) if match.group(1) in LAYOUT_TYPES else None
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
                offset = field_pattern.search(stripped)
                if offset:
                    result.setdefault(current, {})[stripped[:offset.start()].strip()] = offset.group(1)
    return result


def extract_enums(dump_path: Path) -> dict[str, dict[str, int]]:
    import re
    header = re.compile(r"^(?:public|internal|private|protected)?\s*enum\s+([A-Za-z0-9_.<>`]+)")
    member = re.compile(r"public const [^ ]+ ([A-Za-z0-9_]+) = (-?[0-9]+);")
    result: dict[str, dict[str, int]] = {}
    current: str | None = None
    with dump_path.open(encoding="utf-8", errors="replace") as source:
        for line in source:
            stripped = line.strip()
            match = header.match(stripped)
            if match:
                short_name = match.group(1).rsplit(".", 1)[-1]
                current = short_name if short_name in ENUM_TYPES else None
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


def classify_word(word: int) -> str | None:
    if (word & 0x7C000000) == 0x14000000:
        return "B/BL"
    if (word & 0x1F000000) == 0x10000000:
        return "ADR/ADRP"
    if (word & 0x7E000000) == 0x34000000:
        return "CBZ/CBNZ"
    if (word & 0x7E000000) == 0x36000000:
        return "TBZ/TBNZ"
    if (word & 0xFF000010) == 0x54000000:
        return "B.cond"
    if (word & 0x3B000000) == 0x18000000:
        return "LDR-literal"
    return None


def write_disassembly(path: Path, start: int, code: bytes, names: dict[int, str]) -> None:
    decoder = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
    lines = ["address\tbytes\tinstruction\tresolved_target"]
    for instruction in decoder.disasm(code, start):
        resolved = ""
        if instruction.mnemonic in {"b", "bl"} or instruction.mnemonic.startswith("b."):
            try:
                target = int(instruction.op_str.lstrip("#"), 16)
                resolved = names.get(target, "")
            except ValueError:
                pass
        lines.append(
            f"0x{instruction.address:X}\t{instruction.bytes.hex().upper()}\t"
            f"{instruction.mnemonic} {instruction.op_str}".rstrip() + f"\t{resolved or '-'}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def main() -> int:
    base_methods, base_addresses = load_methods(BASE_DUMP)
    target_methods, target_addresses = load_methods(TARGET_DUMP)
    base_data, base_segments = load_elf(BASE_BINARY)
    target_data, target_segments = load_elf(TARGET_BINARY)
    target_names = {
        int(hit["Address"]): name
        for name, hits in target_methods.items()
        for hit in hits
        if len(hits) == 1
    }
    arm64 = HERE / "arm64"
    arm64.mkdir(parents=True, exist_ok=True)

    rows = []
    for owner, method in target_pairs():
        name = dump_name(owner, method)
        baseline_hits = base_methods.get(name, [])
        target_hits = target_methods.get(name, [])
        row: dict[str, Any] = {"owner": owner, "method": method, "dump_name": name}
        if len(baseline_hits) != 1 or len(target_hits) != 1:
            row["status"] = "ambiguous-or-missing"
            row["baseline_candidates"] = [f"0x{int(hit['Address']):X}" for hit in baseline_hits]
            row["target_candidates"] = [f"0x{int(hit['Address']):X}" for hit in target_hits]
            rows.append(row)
            continue
        baseline = baseline_hits[0]
        target = target_hits[0]
        base_start = int(baseline["Address"])
        target_start = int(target["Address"])
        base_end = next_address(base_addresses, base_start)
        target_end = next_address(target_addresses, target_start)
        base_code = read_va(base_data, base_segments, base_start, base_end - base_start)
        target_code = read_va(target_data, target_segments, target_start, target_end - target_start)
        differences = []
        for offset in range(0, min(len(base_code), len(target_code)), 4):
            old_word, = struct.unpack_from("<I", base_code, offset)
            new_word, = struct.unpack_from("<I", target_code, offset)
            if old_word != new_word:
                differences.append({
                    "offset": f"0x{offset:X}",
                    "baseline_word": f"0x{old_word:08X}",
                    "target_word": f"0x{new_word:08X}",
                    "baseline_pc_relative": classify_word(old_word),
                    "target_pc_relative": classify_word(new_word),
                })
        filename = f"{target_start:08x}__{owner}__{method.replace('.', '_')}.arm64.tsv"
        write_disassembly(arm64 / filename, target_start, target_code, target_names)
        row.update({
            "status": "mapped" if baseline.get("Signature") == target.get("Signature") else "signature-changed",
            "baseline_rva": f"0x{base_start:X}",
            "baseline_end_rva": f"0x{base_end:X}",
            "target_rva": f"0x{target_start:X}",
            "target_end_rva": f"0x{target_end:X}",
            "rva_delta": target_start - base_start,
            "baseline_size": len(base_code),
            "target_size": len(target_code),
            "signature_unchanged": baseline.get("Signature") == target.get("Signature"),
            "baseline_sha256": hashlib.sha256(base_code).hexdigest().upper(),
            "target_sha256": hashlib.sha256(target_code).hexdigest().upper(),
            "differing_words": len(differences) + abs(len(base_code) - len(target_code)) // 4,
            "non_pc_relative_differing_words": sum(
                1 for item in differences
                if item["baseline_pc_relative"] is None or item["target_pc_relative"] is None
            ),
            "differing_word_detail": differences,
            "evidence": f"arm64/{filename}",
        })
        rows.append(row)

    baseline_layout = extract_fields(BASE_DUMP / "dump.cs")
    target_layout = extract_fields(TARGET_DUMP / "dump.cs")
    layouts = []
    for type_name in LAYOUT_TYPES:
        old = baseline_layout.get(type_name, {})
        new = target_layout.get(type_name, {})
        layouts.append({
            "type": type_name,
            "baseline_fields": old,
            "target_fields": new,
            "changed": {
                field: {"baseline": offset, "target": new.get(field)}
                for field, offset in old.items()
                if new.get(field) != offset
            },
            "added": sorted(set(new) - set(old)),
            "removed": sorted(set(old) - set(new)),
            "status": "unchanged" if old == new and old else "changed-or-missing",
        })

    baseline_enums = extract_enums(BASE_DUMP / "dump.cs")
    target_enums = extract_enums(TARGET_DUMP / "dump.cs")
    enums = []
    for enum_name in ENUM_TYPES:
        old = baseline_enums.get(enum_name, {})
        new = target_enums.get(enum_name, {})
        enums.append({
            "enum": enum_name,
            "baseline": old,
            "target": new,
            "status": "unchanged" if old == new and old else "changed-or-missing",
        })

    result = {
        "schema_version": 1,
        "question": "What is the version-matched static contract for manual input and judgement on 10.1.4 / 230?",
        "baseline": {
            "version_name": "10.1.3",
            "version_code": 229,
            "libil2cpp_sha256": digest(BASE_BINARY),
            "role": "migration target list only",
        },
        "target": {
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "libil2cpp_sha256": digest(TARGET_BINARY),
            "global_metadata_sha256": digest(ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/global-metadata.dat"),
        },
        "method_status_counts": counts(rows),
        "layout_status_counts": counts(layouts),
        "enum_status_counts": counts(enums),
        "methods": rows,
        "field_layout": layouts,
        "enums": enums,
    }
    (HERE / "manual_input_static_contract.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    with (HERE / "targets.tsv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        writer.writerow(("target_rva", "target_end_rva", "owner", "method", "signature_unchanged", "target_size", "differing_words", "non_pc_relative_differing_words", "evidence", "status"))
        for row in rows:
            writer.writerow((
                row.get("target_rva", ""), row.get("target_end_rva", ""), row["owner"], row["method"],
                str(row.get("signature_unchanged", False)).lower(), row.get("target_size", ""),
                row.get("differing_words", ""), row.get("non_pc_relative_differing_words", ""),
                row.get("evidence", ""), row["status"],
            ))
    print(f"methods {result['method_status_counts']}")
    print(f"layouts {result['layout_status_counts']}")
    print(f"enums {result['enum_status_counts']}")
    return 0


def counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    result: dict[str, int] = {}
    for row in rows:
        result[row["status"]] = result.get(row["status"], 0) + 1
    return result


if __name__ == "__main__":
    raise SystemExit(main())
