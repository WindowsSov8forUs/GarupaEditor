#!/usr/bin/env python3
"""Build byte-pinned 10.1.4 Unity renderer setter targets used by R2 observation."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DUMP_DIR = ROOT / "static" / "il2cpp" / "dump-10.1.4_230"
ELF_PATH = ROOT / "samples" / "jp.co.craftegg.band" / "10.1.4_230" / "extracted" / "libil2cpp.so"
OUTPUT = HERE / "resource_pixi_rendering_setter_targets.json"
TARGETS = [
    ("RPS-001", "UnityEngine.Mesh$$set_vertices", "vector3-array", 0x659CE48),
    ("RPS-002", "UnityEngine.Mesh$$set_uv", "vector2-array", 0x659D04C),
    ("RPS-003", "UnityEngine.Mesh$$set_colors", "color-array", 0x659D1B8),
    ("RPS-004", "UnityEngine.Mesh$$set_triangles", "int32-array", 0x659DF00),
    ("RPS-005", "UnityEngine.Material$$SetFloat", "material-float", 0x6596684),
    ("RPS-006", "UnityEngine.LineRenderer$$SetPosition", "line-position", 0x658BE54),
    ("RPS-007", "UnityEngine.LineRenderer$$SetWidth", "line-width", 0x658BB84),
    ("RPS-008", "UnityEngine.Transform$$set_position", "vector3-value", 0x65C97A8),
    ("RPS-009", "UnityEngine.Transform$$set_localPosition", "vector3-value", 0x65C8C58),
    ("RPS-010", "UnityEngine.Transform$$set_localScale", "vector3-value", 0x65CA1F8),
]
SAMPLE = {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def digest(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def load_elf(path: Path) -> tuple[bytes, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    if data[:5] != b"\x7fELF\x02":
        raise ValueError("locked libil2cpp is not ELF64")
    phoff, = struct.unpack_from("<Q", data, 0x20)
    phentsize, phnum = struct.unpack_from("<HH", data, 0x36)
    segments: list[tuple[int, int, int]] = []
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
    raise ValueError(f"RVA 0x{address:X}+0x{size:X} outside PT_LOAD")


def main() -> int:
    script = json.loads((DUMP_DIR / "script.json").read_text(encoding="utf-8"))
    methods = list(script["ScriptMethod"])
    by_name: dict[str, list[dict[str, Any]]] = {}
    addresses = sorted({int(row["Address"]) for row in methods})
    for row in methods:
        by_name.setdefault(row["Name"], []).append(row)
    elf, segments = load_elf(ELF_PATH)
    rows = []
    for setter_id, name, kind, expected_rva in TARGETS:
        candidates = [row for row in by_name.get(name, []) if int(row["Address"]) == expected_rva]
        if len(candidates) != 1:
            raise ValueError(f"setter identity/RVA is not unique: {name}@0x{expected_rva:X} ({len(candidates)})")
        method = candidates[0]
        start = int(method["Address"])
        end = next(candidate for candidate in addresses if candidate > start)
        body = read_va(elf, segments, start, end - start)
        rows.append({
            "setter_id": setter_id,
            "managed_name": name,
            "signature": method["Signature"],
            "kind": kind,
            "rva": f"0x{start:X}",
            "end_rva": f"0x{end:X}",
            "bytes": len(body),
            "arm64_sha256": digest_bytes(body),
        })
    document = {
        "schema_version": 1,
        "status": "confirmed-10.1.4-render-setter-targets",
        "sample": SAMPLE,
        "libil2cpp_sha256": digest(ELF_PATH),
        "source_script_json_sha256": digest(DUMP_DIR / "script.json"),
        "observation_policy": {
            "intercept_enter_only": True,
            "return_replacement": False,
            "memory_writes": False,
            "managed_invocation": False,
            "raw_pointer_export": False,
        },
        "targets": rows,
        "unknown_targets": [],
    }
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"built render setter targets: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
