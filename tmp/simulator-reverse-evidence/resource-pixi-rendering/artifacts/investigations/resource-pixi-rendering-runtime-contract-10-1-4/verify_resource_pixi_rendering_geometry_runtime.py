#!/usr/bin/env python3
"""Verify byte-pinned renderer setter targets and the ordinary R2 payload trace."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
from typing import Any

from build_resource_pixi_rendering_geometry_oracle import build_document


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TARGETS_PATH = HERE / "resource_pixi_rendering_setter_targets.json"
TRACE_PATH = HERE / "runtime" / "ordinary-rendering-geometry-r2.trace.json.gz"
ORACLE_PATH = HERE / "resource_pixi_rendering_geometry_oracle.json"
CAPTURE_PATH = HERE / "capture_resource_pixi_rendering_geometry_runtime.py"
ELF_PATH = ROOT / "samples" / "jp.co.craftegg.band" / "10.1.4_230" / "extracted" / "libil2cpp.so"
EXPECTED_SAMPLE = {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}
EXPECTED_FLAGS = {
    "return_replacement": False,
    "memory_writes": False,
    "managed_invocation": False,
    "apk_patch": False,
    "synthetic_event_injection": False,
}
EXPECTED_SETTERS = {
    "RPS-001": ("vector3-array", "vertex_f32_bits", 3),
    "RPS-002": ("vector2-array", "uv_f32_bits", 2),
    "RPS-003": ("color-array", "color_f32_bits", 4),
    "RPS-004": ("int32-array", "index_i32", 1),
    "RPS-005": ("material-float", "value_f32_bits", 1),
    "RPS-006": ("line-position", "position_f32_bits", 3),
    "RPS-007": ("line-width", "start_width_f32_bits", 1),
    "RPS-008": ("vector3-value", "value_f32_bits", 3),
    "RPS-009": ("vector3-value", "value_f32_bits", 3),
    "RPS-010": ("vector3-value", "value_f32_bits", 3),
}
BITS = re.compile(r"^[0-9A-F]{8}$")
ALIAS = re.compile(r"^(?:owner|component)-[0-9]{4}$")


def strict_load(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")

    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as source:
            return json.loads(source.read(), parse_constant=reject)
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def finite_bits(value: Any) -> bool:
    if not isinstance(value, str) or BITS.fullmatch(value) is None:
        return False
    number, = struct.unpack(">f", bytes.fromhex(value))
    return number == number and number not in (float("inf"), float("-inf"))


def load_elf(path: Path) -> tuple[bytes, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    require(data[:5] == b"\x7fELF\x02", "locked libil2cpp is not ELF64")
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
    raise ValueError(f"target RVA 0x{address:X}+0x{size:X} outside PT_LOAD")


def verify_payload(event: dict[str, Any]) -> None:
    setter_id = event["setter_id"]
    kind, primary, width = EXPECTED_SETTERS[setter_id]
    payload = event["payload"]
    require(isinstance(payload, dict), f"{setter_id} payload is not an object")
    if kind in {"vector3-array", "vector2-array", "color-array"}:
        rows = payload.get(primary)
        require(isinstance(rows, list) and 1 <= len(rows) <= 256, f"{setter_id} array length invalid")
        require(all(isinstance(row, list) and len(row) == width and all(finite_bits(value) for value in row) for row in rows), f"{setter_id} float array invalid")
    elif kind == "int32-array":
        values = payload.get(primary)
        require(isinstance(values, list) and 1 <= len(values) <= 256, "index array length invalid")
        require(all(isinstance(value, int) and 0 <= value < 256 for value in values), "index array value invalid")
    elif kind == "material-float":
        require(set(payload) == {"property_id", primary}, "material payload keys differ")
        require(isinstance(payload["property_id"], int) and finite_bits(payload[primary]), "material payload invalid")
    elif kind == "line-position":
        require(set(payload) == {"index", primary}, "line position payload keys differ")
        require(payload["index"] in (0, 1), "line position index differs")
        require(isinstance(payload[primary], list) and len(payload[primary]) == width and all(finite_bits(value) for value in payload[primary]), "line position payload invalid")
    elif kind == "line-width":
        require(set(payload) == {"start_width_f32_bits", "end_width_f32_bits"}, "line width payload keys differ")
        require(finite_bits(payload["start_width_f32_bits"]) and finite_bits(payload["end_width_f32_bits"]), "line width payload invalid")
    else:
        require(set(payload) == {primary}, f"{setter_id} vector payload keys differ")
        require(isinstance(payload[primary], list) and len(payload[primary]) == width and all(finite_bits(value) for value in payload[primary]), f"{setter_id} vector payload invalid")


def main() -> int:
    targets = strict_load(TARGETS_PATH)
    trace = strict_load(TRACE_PATH)
    require(targets["schema_version"] == 1 and targets["status"] == "confirmed-10.1.4-render-setter-targets", "setter target status differs")
    require(targets["sample"] == EXPECTED_SAMPLE and trace["sample"] == EXPECTED_SAMPLE, "sample differs")
    require(targets["unknown_targets"] == [], "setter targets contain unknown rows")
    rows = targets["targets"]
    require(len(rows) == len(EXPECTED_SETTERS), "setter target count differs")
    require({row["setter_id"] for row in rows} == set(EXPECTED_SETTERS), "setter target IDs differ")
    require(all(row["kind"] == EXPECTED_SETTERS[row["setter_id"]][0] for row in rows), "setter target kinds differ")
    if ELF_PATH.exists():
        require(digest(ELF_PATH) == targets["libil2cpp_sha256"], "locked ELF hash differs")
        elf, segments = load_elf(ELF_PATH)
        for row in rows:
            start = int(row["rva"], 16)
            end = int(row["end_rva"], 16)
            body = read_va(elf, segments, start, end - start)
            require(len(body) == row["bytes"] and hashlib.sha256(body).hexdigest().upper() == row["arm64_sha256"], f"setter ARM64 differs: {row['setter_id']}")

    require(trace["schema_version"] == 1 and trace["status"] == "confirmed-render-setter-r2-observation-only", "R2 trace status differs")
    capture = trace["capture"]
    require(capture["capture_error"] is None and capture["hook_failures"] == [] and capture["frida_messages"] == 0, "capture has runtime failures")
    require(capture["selinux"] == "Enforcing" and capture["loopback_transport_only"] is True, "capture transport differs")
    require(all(capture[key] == value for key, value in EXPECTED_FLAGS.items()), "capture mutation policy differs")
    require(capture["capture_script_sha256"] == digest(CAPTURE_PATH), "capture script hash differs")
    require(trace["privacy"] == {
        "raw_pointers_included": False,
        "display_strings_included": False,
        "account_fields_included": False,
        "room_identity_included": False,
        "member_card_skill_identity_included": False,
    }, "privacy boundary differs")
    actions = capture["operator_actions"]
    require(all(actions.values()), "natural Live/pause/resume action incomplete")

    contract = trace["setter_contract"]
    target_by_id = {row["setter_id"]: row for row in rows}
    require(len(contract) == len(rows), "embedded setter contract count differs")
    for row in contract:
        target = target_by_id[row["setter_id"]]
        require(row["rva"] == target["rva"] and row["kind"] == target["kind"], f"embedded setter target differs: {row['setter_id']}")

    events = trace["events"]
    summary = trace["summary"]
    require(summary["completion_requirements_met"] is True, "R2 completion flag differs")
    require(1 <= len(events) <= 120000 and summary["event_count"] == len(events), "R2 event count differs")
    require(all(event["sequence"] == index for index, event in enumerate(events)), "R2 sequence is not contiguous")
    setter_counts = Counter()
    owner_counts = Counter()
    for event in events:
        require(set(event) == {"sequence", "frame", "owner_target_id", "owner_role", "owner_category", "owner_object_alias", "setter_id", "setter", "component_alias", "payload"}, "event fields differ")
        require(isinstance(event["frame"], int) and event["frame"] >= 0, "event frame invalid")
        require(event["setter_id"] in EXPECTED_SETTERS, "event setter unknown")
        require(isinstance(event["owner_target_id"], str) and event["owner_target_id"].startswith("RPH-"), "owner target invalid")
        require(ALIAS.fullmatch(event["owner_object_alias"]) is not None and ALIAS.fullmatch(event["component_alias"]) is not None, "technical alias invalid")
        verify_payload(event)
        setter_counts[event["setter_id"]] += 1
        owner_counts[event["owner_target_id"]] += 1
    require(set(setter_counts) == set(EXPECTED_SETTERS), "not every setter was observed")
    require(dict(sorted(setter_counts.items())) == summary["setter_event_counts"], "setter counts differ")
    require(dict(sorted(owner_counts.items())) == summary["owner_event_counts"], "owner counts differ")
    require(summary["relative_frame_count"] >= 1 and summary["alias_count"] >= 1, "frame/alias summary invalid")
    json.dumps(trace, ensure_ascii=False, allow_nan=False)
    oracle = strict_load(ORACLE_PATH)
    require(oracle == build_document(), "compact geometry oracle does not rebuild exactly from R2")
    require(oracle["unknown_fields"] == [], "geometry oracle contains unknown fields")
    print(f"verified render setter R2: targets={len(rows)} events={len(events)} frames={summary['relative_frame_count']} aliases={summary['alias_count']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"verification failed: {error}", file=sys.stderr)
        raise
