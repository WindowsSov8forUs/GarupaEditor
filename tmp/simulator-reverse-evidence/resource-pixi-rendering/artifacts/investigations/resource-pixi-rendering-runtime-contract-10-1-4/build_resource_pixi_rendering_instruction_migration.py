#!/usr/bin/env python3
"""Build a conservative instruction-shape migration oracle for selected render owners."""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import struct
from typing import Any

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM
from capstone.arm64 import ARM64_OP_FP, ARM64_OP_IMM, ARM64_OP_MEM, ARM64_OP_REG


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CONTRACT = HERE / "resource_pixi_rendering_static_contract.json"
BASE_DUMP = ROOT / "static/il2cpp/dump/script.json"
TARGET_DUMP = ROOT / "static/il2cpp/dump-10.1.4_230/script.json"
BASE_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.3_229/extracted/libil2cpp.so"
TARGET_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"

PC_BRANCHES = {
    "b", "bl", "br", "blr", "ret", "cbz", "cbnz", "tbz", "tbnz",
}
MEMORY_MNEMONIC_PREFIXES = ("ldr", "str", "ldp", "stp", "ldur", "stur", "prfm")


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def load_elf(path: Path) -> tuple[bytes, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    if data[:5] != b"\x7fELF\x02":
        raise ValueError(f"not ELF64: {path}")
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
    raise ValueError(f"VA range outside PT_LOAD: 0x{address:X}+0x{size:X}")


def method_names(path: Path) -> dict[int, str]:
    rows = json.loads(path.read_text(encoding="utf-8"))["ScriptMethod"]
    by_address: dict[int, list[str]] = {}
    for row in rows:
        by_address.setdefault(int(row["Address"]), []).append(row["Name"])
    return {
        address: names[0]
        for address, names in by_address.items()
        if len(set(names)) == 1
    }


def is_branch(mnemonic: str) -> bool:
    return mnemonic in PC_BRANCHES or mnemonic.startswith("b.")


def normalized_instruction(
    instruction: Any,
    method_start: int,
    method_end: int,
    names: dict[int, str],
    global_registers: set[int],
) -> tuple[Any, ...]:
    mnemonic = instruction.mnemonic
    operands = []
    for operand in instruction.operands:
        if operand.type == ARM64_OP_REG:
            operands.append(("reg", instruction.reg_name(operand.reg)))
            continue
        if operand.type == ARM64_OP_IMM:
            value = int(operand.imm)
            if is_branch(mnemonic):
                if method_start <= value < method_end:
                    operands.append(("internal-target", value - method_start))
                else:
                    operands.append(("external-target", names.get(value, "runtime-or-native-relocation")))
            elif mnemonic in {"adr", "adrp"} or mnemonic.startswith("ldr"):
                operands.append(("pc-relative",))
            else:
                operands.append(("imm", value))
            continue
        if operand.type == ARM64_OP_FP:
            operands.append(("fp", float(operand.fp)))
            continue
        if operand.type == ARM64_OP_MEM:
            base = operand.mem.base
            index = operand.mem.index
            displacement: int | str = int(operand.mem.disp)
            if base in global_registers and mnemonic.startswith(MEMORY_MNEMONIC_PREFIXES):
                displacement = "global-table-relocation"
            operands.append((
                "mem",
                instruction.reg_name(base) if base else None,
                instruction.reg_name(index) if index else None,
                displacement,
            ))
            continue
        operands.append(("other", operand.type, instruction.op_str))

    if mnemonic in {"adr", "adrp"} and instruction.operands and instruction.operands[0].type == ARM64_OP_REG:
        global_registers.add(instruction.operands[0].reg)
    elif instruction.operands and instruction.operands[0].type == ARM64_OP_REG:
        destination = instruction.operands[0].reg
        if mnemonic == "add" and len(instruction.operands) >= 2 and instruction.operands[1].type == ARM64_OP_REG and instruction.operands[1].reg in global_registers:
            global_registers.add(destination)
        elif mnemonic.startswith(("ldr", "ldur")) and len(instruction.operands) >= 2 and instruction.operands[1].type == ARM64_OP_MEM and instruction.operands[1].mem.base in global_registers:
            global_registers.discard(destination)
        elif destination in global_registers and mnemonic not in {"mov", "movk", "movn", "movz"}:
            global_registers.discard(destination)
    return (mnemonic, tuple(operands))


def compare_method(
    row: dict[str, Any],
    baseline_data: bytes,
    baseline_segments: list[tuple[int, int, int]],
    target_data: bytes,
    target_segments: list[tuple[int, int, int]],
    baseline_names: dict[int, str],
    target_names: dict[int, str],
) -> dict[str, Any]:
    baseline_start = int(row["baseline_rva"], 16)
    baseline_end = int(row["baseline_end_rva"], 16)
    target_start = int(row["target_rva"], 16)
    target_end = int(row["target_end_rva"], 16)
    baseline_code = read_va(baseline_data, baseline_segments, baseline_start, baseline_end - baseline_start)
    target_code = read_va(target_data, target_segments, target_start, target_end - target_start)
    decoder = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
    decoder.detail = True
    baseline_instructions = list(decoder.disasm(baseline_code, baseline_start))
    target_instructions = list(decoder.disasm(target_code, target_start))
    result = {
        "owner": row["owner"],
        "method": row["method"],
        "baseline_rva": row["baseline_rva"],
        "target_rva": row["target_rva"],
        "baseline_size": len(baseline_code),
        "target_size": len(target_code),
        "baseline_sha256": digest_bytes(baseline_code),
        "target_sha256": digest_bytes(target_code),
        "differences": [],
    }
    if len(baseline_code) != len(target_code) or len(baseline_instructions) != len(target_instructions):
        result["status"] = "changed-size-or-instruction-count"
        return result
    baseline_globals: set[int] = set()
    target_globals: set[int] = set()
    for index, (baseline, target) in enumerate(zip(baseline_instructions, target_instructions)):
        left = normalized_instruction(baseline, baseline_start, baseline_end, baseline_names, baseline_globals)
        right = normalized_instruction(target, target_start, target_end, target_names, target_globals)
        if left != right:
            result["differences"].append({
                "offset": f"0x{index * 4:X}",
                "baseline": {"bytes": baseline.bytes.hex().upper(), "instruction": f"{baseline.mnemonic} {baseline.op_str}".rstrip(), "normalized": left},
                "target": {"bytes": target.bytes.hex().upper(), "instruction": f"{target.mnemonic} {target.op_str}".rstrip(), "normalized": right},
            })
    result["status"] = "normalized-instruction-equivalent" if not result["differences"] else "changed-semantic-instruction-shape"
    return result


def build_oracle() -> dict[str, Any]:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    baseline_data, baseline_segments = load_elf(BASE_BINARY)
    target_data, target_segments = load_elf(TARGET_BINARY)
    baseline_names = method_names(BASE_DUMP)
    target_names = method_names(TARGET_DUMP)
    rows = [
        compare_method(row, baseline_data, baseline_segments, target_data, target_segments, baseline_names, target_names)
        for row in contract["methods"]
    ]
    counts = dict(sorted(Counter(row["status"] for row in rows).items()))
    return {
        "schema_version": 1,
        "status": "confirmed-conservative-instruction-migration-classification",
        "sample": contract["target"],
        "normalization_policy": {
            "preserved_exactly": [
                "instruction count and order",
                "mnemonics",
                "register operands",
                "instance memory displacements",
                "arithmetic and floating-point immediates",
                "internal branch relative offsets",
                "resolved managed external callee identities",
            ],
            "relocation_only": [
                "PC-relative branch and address targets",
                "ADRP-derived global metadata table load displacements",
                "unresolved IL2CPP runtime/native helper targets",
            ],
            "behavioral_equivalence_claimed": False,
        },
        "status_counts": counts,
        "methods": rows,
        "unknown_fields": [],
        "blocking_findings": [
            "methods classified changed-semantic-instruction-shape require current-version semantic review",
            "normalized equivalence does not prove pointed global object contents or runtime behavior",
        ] if counts.get("changed-semantic-instruction-shape", 0) else [
            "normalized equivalence does not prove pointed global object contents or runtime behavior",
        ],
    }


def main() -> int:
    oracle = build_oracle()
    (HERE / "resource_pixi_rendering_instruction_migration.json").write_text(
        json.dumps(oracle, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"instruction migration: {oracle['status_counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
