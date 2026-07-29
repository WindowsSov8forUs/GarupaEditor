#!/usr/bin/env python3
"""Build the version-10.1.4 static contract for score, life, Skill and Fever."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import re
import struct
from typing import Any

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE_DUMP = ROOT / "static/il2cpp/dump"
TARGET_DUMP = ROOT / "static/il2cpp/dump-10.1.4_230"
BASE_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.3_229/extracted/libil2cpp.so"
TARGET_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"
TARGET_METADATA = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/global-metadata.dat"

SOURCE_TARGETS = (
    "judgement-result-pipeline",
    "base-score-construction",
    "event-score-multipliers",
    "free-live-event-bonus-construction",
    "special-mode-combo-rates",
    "skill-fever-consumers",
    "skill-playback-state-machine",
    "skill-activate-effect-consumers",
    "fever-command-state-machine",
    "move-time-state-restore",
)

# Complete owner slices are intentional: these objects own the stage-5 state.
CORE_OWNERS = (
    "InGameCalculatedData",
    "InGameRecord",
    "OneFrameData",
    "OneFrameTotalData",
    "InGameOneFrameJudgementController",
    "ScoreUtility",
    "DamageUtility",
    "SkillNotesInfoUtility",
    "InGameSkillNoteController",
    "SituationSkillActivateEffect",
    "SituationSkillData",
    "SituationSkillMaster",
    "SituationSkillOnceEffect",
    "SituationSkillOnceEffectConditions",
    "SituationSkillManager.SkillEffectReservationData",
    "SituationSkillManager",
    "FeverTimeManager.FeverEffectReservationData",
    "FeverTimeManager.FeverStatePassConditionChangedData",
    "FeverTimeManager.FeverPointInfo",
    "FeverTimeManager",
    "AllPerfectStatusController",
)

EXTRA_METHODS = (
    ("BMSDefine", ".cctor"),
    ("GamePlayButton", "CorrectNoteResult"),
    ("NoteBase", "getAddCombo"),
    ("NoteBase", "calcBaseCorrectedScore"),
    ("NoteBase", "judgeFeverNote"),
    ("NoteBase", "judgeAfterNote"),
    ("NoteBase", "playSkillNote"),
    ("NoteFrontBase", "calcAddDamage"),
    ("NoteFrontBase", "getNoteResultType"),
    ("NoteFrontBase", "calcSkillScoreUpRate"),
    ("NoteFrontBase", "judgeFrontNote"),
    ("SkillUtility", "shouldActivateNeverDieSkillEffect"),
    ("SkillUtility", "CalcAddDamageWithNeverDieSkill"),
    ("SkillUtility", "GetDamageGuardTypeWithNeverDieSkill"),
    ("SkillUtility", "CalcJudgeContinuousResultType"),
    ("SkillUtility", "CalculateRateUpValueWithGettingPerfect"),
    ("InGameManager.<onAwakeEnd>d__77", "MoveNext"),
    ("InGameManager", "updatePlayState"),
    ("InGameManager", "onResetOnMovedTime"),
    ("InGameManager", "onAdvanceTime"),
    ("InGameManager", "onResumeFromContinue"),
    ("InGameManager", "onResumeFromMoveTime"),
)

LAYOUT_TYPES = (
    "InGameRecord",
    "OneNotesMaxScoreInfo",
    "OneFrameData",
    "OneFrameTotalData",
    "InGameOneFrameJudgementController",
    "InGameCalculatedData",
    "NoteBase",
    "NoteFrontBase",
    "SituationSkillActivateEffect",
    "SituationSkillData",
    "SituationSkillMaster",
    "SituationSkillOnceEffect",
    "SituationSkillOnceEffectConditions",
    "SituationSkillTriggeringConditions",
    "SituationSkillManager.SkillEffectReservationData",
    "SituationSkillManager",
    "InGameSkillNoteController",
    "FeverTimeManager.FeverEffectReservationData",
    "FeverTimeManager.FeverStatePassConditionChangedData",
    "FeverTimeManager.FeverPointInfo",
    "FeverTimeManager",
    "TeamLiveFestivalInGameController",
    "MedleyInGameController",
    "GarupaCupQualificationComboRateCalculator",
    "RhythmGameStartData",
)

ENUM_TYPES = (
    "NoteResultType",
    "JudgeTiming",
    "ScoreUpType",
    "DamageGuardType",
    "GameState",
    "SkillNoteSkillState",
    "FeverTimeState",
    "DifficultyType",
    "InGameMode",
    "GameCommandType",
    "SituationSkillPlayConditionType",
    "SituationSkillStatusConditionType",
    "SituationSkillComparisonMethod",
    "SituationSkillValueType",
    "SituationSkillOnceEffectType",
    "SituationSkillActivateEffectType",
    "SituationSkillOnceEffectConditionLifeType",
    "SituationSkillManager.SkillPlayState",
    "AllPerfectStatus",
)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_methods(directory: Path) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]], dict[int, list[dict[str, Any]]], list[int]]:
    data = json.loads((directory / "script.json").read_text(encoding="utf-8"))
    methods = list(data["ScriptMethod"])
    by_name: dict[str, list[dict[str, Any]]] = {}
    by_address: dict[int, list[dict[str, Any]]] = {}
    for method in methods:
        by_name.setdefault(method["Name"], []).append(method)
        by_address.setdefault(int(method["Address"]), []).append(method)
    return methods, by_name, by_address, sorted(by_address)


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


def owner_from_name(name: str) -> str:
    return name.split("$$", 1)[0]


def method_from_name(name: str) -> str:
    return name.split("$$", 1)[1]


def select_target_names(
    baseline_methods: list[dict[str, Any]],
    baseline_by_address: dict[int, list[dict[str, Any]]],
) -> list[tuple[str, str, str | None]]:
    selected: set[tuple[str, str, str | None]] = {
        (owner, method, None) for owner, method in EXTRA_METHODS
    }
    for entry in baseline_methods:
        name = entry["Name"]
        if "$$" not in name:
            continue
        owner = owner_from_name(name)
        if owner in CORE_OWNERS:
            selected.add((owner, method_from_name(name), entry.get("Signature")))
    for investigation in SOURCE_TARGETS:
        path = ROOT / "artifacts/investigations" / investigation / "targets.tsv"
        if not path.is_file():
            continue
        with path.open(encoding="utf-8", newline="") as source:
            for row in csv.DictReader(source, delimiter="\t"):
                raw_address = row.get("address") or row.get("rva")
                if raw_address:
                    hits = baseline_by_address.get(int(raw_address, 16), [])
                    for hit in hits:
                        if "$$" in hit["Name"]:
                            selected.add((
                                owner_from_name(hit["Name"]),
                                method_from_name(hit["Name"]),
                                hit.get("Signature"),
                            ))
                    continue
                owner = row.get("owner")
                method = row.get("method")
                if owner and method and "(" not in method:
                    selected.add((owner, method, None))
    signed = {(owner, method) for owner, method, signature in selected if signature is not None}
    selected = {
        item for item in selected
        if item[2] is not None or (item[0], item[1]) not in signed
    }
    return sorted(selected, key=lambda item: (item[0], item[1], item[2] or ""))


def resolve_unique(
    by_name: dict[str, list[dict[str, Any]]],
    owner: str,
    method: str,
    signature: str | None = None,
) -> list[dict[str, Any]]:
    hits = by_name.get(f"{owner}$${method}", [])
    if signature is not None:
        exact = [hit for hit in hits if hit.get("Signature") == signature]
        if exact:
            return exact
    return hits


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
        resolved = "-"
        if instruction.mnemonic in {"b", "bl"} or instruction.mnemonic.startswith("b."):
            try:
                target = int(instruction.op_str.lstrip("#"), 16)
                resolved = names.get(target, "-")
            except ValueError:
                pass
        lines.append(
            f"0x{instruction.address:X}\t{instruction.bytes.hex().upper()}\t"
            f"{instruction.mnemonic} {instruction.op_str}".rstrip() + f"\t{resolved}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def extract_fields(dump_path: Path) -> dict[str, dict[str, str]]:
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
                offset = field.search(stripped)
                if offset:
                    result.setdefault(current, {})[stripped[:offset.start()].strip()] = offset.group(1)
    return result


def extract_enums(dump_path: Path) -> dict[str, dict[str, int]]:
    header = re.compile(r"^(?:public|internal|private|protected)?\s*enum\s+([A-Za-z0-9_.<>`]+)")
    member = re.compile(r"public const [^ ]+ ([A-Za-z0-9_]+) = (-?[0-9]+);")
    result: dict[str, dict[str, int]] = {}
    current: str | None = None
    with dump_path.open(encoding="utf-8", errors="replace") as source:
        for line in source:
            stripped = line.strip()
            match = header.match(stripped)
            if match:
                current = match.group(1) if match.group(1) in ENUM_TYPES else None
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


def extract_named_constants(dump_path: Path) -> dict[str, dict[str, str | int | float]]:
    wanted = {
        "BMSDefine": {
            "DefaultLifeValue", "MaxLifeValue", "LeaderIndex", "LifeWhenNeverDieEffect",
        },
        "FeverTimeManager": {"FEVER_LEVEL_1_POINT", "FEVER_LEVEL_1_SCORE_RATE"},
    }
    header = re.compile(
        r"^(?:public|internal|private|protected)?\s*"
        r"(?:sealed\s+|abstract\s+|static\s+)*class\s+([A-Za-z0-9_.<>`]+)"
    )
    constant = re.compile(r"(?:public|private|protected|internal) const ([^ ]+) ([^ ]+) = ([^;]+);")
    result: dict[str, dict[str, str | int | float]] = {}
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
            value = constant.match(stripped)
            if value and value.group(2) in wanted[current]:
                raw = value.group(3)
                parsed: str | int | float
                try:
                    parsed = int(raw)
                except ValueError:
                    try:
                        parsed = float(raw)
                    except ValueError:
                        parsed = raw
                result.setdefault(current, {})[value.group(2)] = parsed
    return result


def counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    result: dict[str, int] = {}
    for row in rows:
        result[row["status"]] = result.get(row["status"], 0) + 1
    return result


def main() -> int:
    baseline_methods, baseline_by_name, baseline_by_address, baseline_addresses = load_methods(BASE_DUMP)
    target_methods, target_by_name, _, target_addresses = load_methods(TARGET_DUMP)
    baseline_data, baseline_segments = load_elf(BASE_BINARY)
    target_data, target_segments = load_elf(TARGET_BINARY)
    target_names = {
        int(hit["Address"]): hit["Name"]
        for hit in target_methods
        if len(target_by_name.get(hit["Name"], [])) == 1
    }
    arm64 = HERE / "arm64"
    arm64.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    for owner, method, requested_signature in select_target_names(baseline_methods, baseline_by_address):
        baseline_hits = resolve_unique(baseline_by_name, owner, method, requested_signature)
        row: dict[str, Any] = {"owner": owner, "method": method, "requested_signature": requested_signature}
        if len(baseline_hits) != 1:
            row.update({
                "status": "baseline-ambiguous-or-missing",
                "baseline_candidates": [f"0x{int(hit['Address']):X}" for hit in baseline_hits],
            })
            rows.append(row)
            continue
        baseline = baseline_hits[0]
        target_hits = resolve_unique(target_by_name, owner, method, baseline.get("Signature"))
        if len(target_hits) != 1:
            row.update({
                "status": "target-ambiguous-or-missing",
                "baseline_rva": f"0x{int(baseline['Address']):X}",
                "target_candidates": [f"0x{int(hit['Address']):X}" for hit in target_hits],
            })
            rows.append(row)
            continue
        target = target_hits[0]
        base_start = int(baseline["Address"])
        target_start = int(target["Address"])
        base_end = next_address(baseline_addresses, base_start)
        target_end = next_address(target_addresses, target_start)
        base_code = read_va(baseline_data, baseline_segments, base_start, base_end - base_start)
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
        safe_method = re.sub(r"[^A-Za-z0-9_-]+", "_", method)
        safe_owner = re.sub(r"[^A-Za-z0-9_-]+", "_", owner)
        filename = f"{target_start:08x}__{safe_owner}__{safe_method}.arm64.tsv"
        write_disassembly(arm64 / filename, target_start, target_code, target_names)
        row.update({
            "dump_name": target["Name"],
            "status": "mapped" if baseline.get("Signature") == target.get("Signature") else "signature-changed",
            "signature": target.get("Signature"),
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
                for field, offset in old.items() if new.get(field) != offset
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
        "question": "What is the version-matched static contract for score, life, Skill and Fever on 10.1.4 / 230?",
        "baseline": {
            "version_name": "10.1.3",
            "version_code": 229,
            "libil2cpp_sha256": digest(BASE_BINARY),
            "role": "migration target list only",
        },
        "target": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "libil2cpp_sha256": digest(TARGET_BINARY),
            "global_metadata_sha256": digest(TARGET_METADATA),
        },
        "method_status_counts": counts(rows),
        "layout_status_counts": counts(layouts),
        "enum_status_counts": counts(enums),
        "named_constants": extract_named_constants(TARGET_DUMP / "dump.cs"),
        "methods": rows,
        "field_layout": layouts,
        "enums": enums,
    }
    (HERE / "score_life_state_static_contract.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    with (HERE / "targets.tsv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        writer.writerow((
            "target_rva", "target_end_rva", "owner", "method", "signature_unchanged",
            "target_size", "differing_words", "non_pc_relative_differing_words", "evidence", "status",
        ))
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
    print(f"constants {result['named_constants']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
