#!/usr/bin/env python3
"""Verify B02 runtime tooling and locked production BMS inputs without overclosing R1."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
from pathlib import Path
from typing import Iterator


HERE = Path(__file__).resolve().parent
CONTRACT = HERE / "score_life_state_static_contract.json"
CAPTURE = HERE / "capture_score_life_state_runtime.py"
PROVENANCE = HERE / "runtime-inputs/cache-index/cache_index_provenance.json"
EXPECTED_BMS = {
    "poppin_shuffle_special": (17882, "418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC"),
    "786_miracle_april_habahiro_special": (38700, "43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159"),
}
ALIASES = {
    "OneFrameController.Reflect": "InGameOneFrameJudgementController.ReflectOneFrameData",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def read_varint(data: bytes, position: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        require(position < len(data) and shift < 70, "invalid protobuf varint")
        byte = data[position]
        position += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, position
        shift += 7


def fields(data: bytes) -> Iterator[tuple[int, int, int | bytes]]:
    position = 0
    while position < len(data):
        key, position = read_varint(data, position)
        number = key >> 3
        wire_type = key & 7
        if wire_type == 0:
            value, position = read_varint(data, position)
        elif wire_type == 1:
            value = data[position:position + 8]
            position += 8
        elif wire_type == 2:
            length, position = read_varint(data, position)
            value = data[position:position + length]
            position += length
        elif wire_type == 5:
            value = data[position:position + 4]
            position += 4
        else:
            raise SystemExit(f"FAIL: unsupported protobuf wire type {wire_type}")
        require(position <= len(data), "truncated protobuf record")
        yield number, wire_type, value


def dict_fields(data: bytes) -> dict[int, int | bytes]:
    return {number: value for number, _, value in fields(data)}


def text(value: int | bytes | None) -> str:
    require(isinstance(value, bytes), "expected protobuf string")
    return value.decode("utf-8")


def capture_targets() -> dict[str, int]:
    tree = ast.parse(CAPTURE.read_text(encoding="utf-8"), filename=str(CAPTURE))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "TARGETS" for target in node.targets):
            value = ast.literal_eval(node.value)
            require(isinstance(value, dict), "TARGETS is not a literal dictionary")
            return value
    raise SystemExit("FAIL: capture TARGETS assignment not found")


def verify_capture_contract() -> int:
    source = CAPTURE.read_text(encoding="utf-8")
    require("Interceptor.attach" in source, "capture has no observation hook")
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
        require(forbidden not in source, f"forbidden R2/R3 operation in capture: {forbidden}")
    require('"memory_writes":False' in source and '"return_replacement":False' in source, "capture capability declaration changed")
    require("user_ids_omitted:true" in source, "Fever account identity omission changed")

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    methods: dict[str, list[dict[str, object]]] = {}
    for row in contract["methods"]:
        methods.setdefault(f"{row['owner']}.{row['method']}", []).append(row)
    targets = capture_targets()
    for label, address in targets.items():
        managed = ALIASES.get(label, label)
        hits = [row for row in methods.get(managed, []) if int(row["target_rva"], 16) == address]
        require(len(hits) == 1, f"capture target is not an exact static mapping: {label} @ 0x{address:X}")
    return len(targets)


def verify_cache_records(provenance: dict[str, object]) -> None:
    records = provenance["records"]
    require(isinstance(records, list) and len(records) == 2, "cache provenance record count changed")
    for record in records:
        raw_path = PROVENANCE.parent / record["raw_record_path"]
        raw = raw_path.read_bytes()
        require(len(raw) == record["raw_record_bytes"] and digest(raw) == record["raw_record_sha256"], "raw cache record hash mismatch")
        top = list(fields(raw))
        require(len(top) == 1 and top[0][0] == 2 and top[0][1] == 2 and isinstance(top[0][2], bytes), "raw cache record is not one top-level field 2")
        outer = dict_fields(top[0][2])
        name = text(outer.get(1))
        info_value = outer.get(2)
        require(isinstance(info_value, bytes), "cache info message missing")
        info = dict_fields(info_value)
        require(
            name == record["bundle_name"] == text(info.get(1)) and
            record["cache_file"] == text(info.get(2)) and
            record["resource_version"] == text(info.get(3)) and
            record["download_timing"] == text(info.get(4)) and
            record["checksum_u32"] == info.get(5) and
            record["bundle_bytes"] == info.get(7),
            f"cache record fields changed: {name}",
        )
        require(record["cache_file"].isalnum() and len(record["cache_file"]) == 64, f"invalid cache filename: {name}")


def verify_bms(provenance: dict[str, object]) -> None:
    rows = provenance["bms"]
    require(isinstance(rows, list) and len(rows) == 2, "BMS provenance count changed")
    for row in rows:
        asset_name = row["asset_name"]
        require(asset_name in EXPECTED_BMS, f"unexpected BMS asset: {asset_name}")
        expected_bytes, expected_hash = EXPECTED_BMS[asset_name]
        path = HERE / row["path"]
        data = path.read_bytes()
        require(len(data) == expected_bytes == row["bytes"], f"BMS byte count changed: {asset_name}")
        require(digest(data) == expected_hash == row["sha256"], f"BMS hash changed: {asset_name}")
        metadata = json.loads((path.parent / f"{asset_name}.metadata.json").read_text(encoding="utf-8"))
        record = next(entry for entry in provenance["records"] if entry["bundle_name"] == row["bundle_name"])
        require(
            metadata["source"] == "connected-device-cached-unity-text-asset" and
            metadata["bundle_sha256"] == record["bundle_sha256"] and
            metadata["bundle_bytes"] == record["bundle_bytes"] and
            metadata["asset"]["sha256"] == expected_hash and
            metadata["asset"]["bytes"] == expected_bytes,
            f"BMS metadata changed: {asset_name}",
        )


def verify_plans_and_traces(require_r1: bool) -> int:
    plans = sorted((HERE / "runtime").glob("*-plan.json"))
    require(bool(plans), "no runtime capture plan")
    for path in plans:
        plan = json.loads(path.read_text(encoding="utf-8"))
        require(plan["schema_version"] == 1 and plan["actions"], f"invalid runtime plan: {path.name}")
        require(all(action.get("kind", "wait") in {"wait", "tap", "swipe", "keyevent"} for action in plan["actions"]), f"unsupported runtime plan action: {path.name}")
    traces = sorted((HERE / "runtime").glob("*.trace.json"))
    for path in traces:
        trace = json.loads(path.read_text(encoding="utf-8"))
        plan_path = HERE / "runtime" / trace["scenario"]["plan_file"]
        require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, f"invalid R1 trace: {path.name}")
        require(trace["capability"] == {"level":"R1","return_replacement":False,"memory_writes":False,"apk_modification":False,"input_injection":"Android adb input only"}, f"R1 capability changed: {path.name}")
        require(trace["capture_script_sha256"] == digest(CAPTURE.read_bytes()), f"capture script hash mismatch: {path.name}")
        require(trace["plan_sha256"] == digest(plan_path.read_bytes()), f"capture plan hash mismatch: {path.name}")
        require(all(event["sequence"] == index for index, event in enumerate(trace["events"])), f"R1 sequence gap: {path.name}")
    if require_r1:
        require(bool(traces), "R1 is required but no confirmed trace exists")
    return len(traces)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-r1", action="store_true")
    args = parser.parse_args()
    provenance = json.loads(PROVENANCE.read_text(encoding="utf-8"))
    require(
        provenance["status"] == "confirmed-r0-connected-device-cache-input-provenance" and
        provenance["sample"] == {"package":"jp.co.craftegg.band","version_name":"10.1.4","version_code":230,"abi":"arm64-v8a"} and
        provenance["capability"]["memory_writes"] is False and
        provenance["privacy"]["account_fields_included"] is False and
        provenance["unknown_fields"] == [] and
        provenance["blocking_findings"] == [],
        "runtime input provenance gate changed",
    )
    verify_cache_records(provenance)
    verify_bms(provenance)
    target_count = verify_capture_contract()
    trace_count = verify_plans_and_traces(args.require_r1)
    print(
        f"score/life runtime inputs verified: bms=2 cache_records=2 capture_targets={target_count} "
        f"R1={trace_count} business_state_gate={'eligible-for-review' if args.require_r1 else 'open'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
