#!/usr/bin/env python3
"""Extract byte-preserving musicscore cache records from AssetBundleInfo."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Iterator


TARGETS = {
    "musicscore/musicscore10": "poppin_shuffle_special",
    "musicscore/musicscore790": "786_miracle_april_habahiro_special",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def read_varint(data: bytes, position: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if position >= len(data) or shift >= 70:
            raise ValueError("invalid protobuf varint")
        byte = data[position]
        position += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, position
        shift += 7


def fields(data: bytes) -> Iterator[tuple[int, int, int | bytes, int, int]]:
    position = 0
    while position < len(data):
        start = position
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
            raise ValueError(f"unsupported protobuf wire type: {wire_type}")
        if position > len(data):
            raise ValueError("truncated protobuf field")
        yield number, wire_type, value, start, position


def string_field(values: dict[int, int | bytes], number: int) -> str:
    value = values.get(number)
    if not isinstance(value, bytes):
        raise ValueError(f"protobuf field {number} is not bytes")
    return value.decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--bundle10", type=Path, required=True)
    parser.add_argument("--bundle790", type=Path, required=True)
    parser.add_argument("--bms-directory", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    args = parser.parse_args()

    index = args.index.read_bytes()
    version: str | None = None
    records: dict[str, dict[str, object]] = {}
    raw_records: dict[str, bytes] = {}
    for number, wire_type, value, start, end in fields(index):
        if number == 1 and wire_type == 2 and isinstance(value, bytes):
            version = value.decode("utf-8")
            continue
        if number != 2 or wire_type != 2 or not isinstance(value, bytes):
            continue
        outer = {field_number: field_value for field_number, _, field_value, _, _ in fields(value)}
        name_value = outer.get(1)
        info_value = outer.get(2)
        if not isinstance(name_value, bytes) or not isinstance(info_value, bytes):
            continue
        name = name_value.decode("utf-8")
        if name not in TARGETS:
            continue
        info = {field_number: field_value for field_number, _, field_value, _, _ in fields(info_value)}
        if string_field(info, 1) != name:
            raise ValueError(f"cache record name mismatch: {name}")
        raw = index[start:end]
        raw_records[name] = raw
        records[name] = {
            "bundle_name": name,
            "cache_file": string_field(info, 2),
            "resource_version": string_field(info, 3),
            "download_timing": string_field(info, 4),
            "checksum_u32": info.get(5),
            "bundle_bytes": info.get(7),
            "top_level_start": start,
            "top_level_end": end,
            "raw_record_bytes": len(raw),
            "raw_record_sha256": digest(raw),
        }

    if version is None or set(records) != set(TARGETS):
        raise ValueError(f"missing cache version or targets: version={version!r}, records={sorted(records)}")

    bundles = {
        "musicscore/musicscore10": args.bundle10,
        "musicscore/musicscore790": args.bundle790,
    }
    args.output_directory.mkdir(parents=True, exist_ok=True)
    for name, bundle in bundles.items():
        data = bundle.read_bytes()
        record = records[name]
        if len(data) != record["bundle_bytes"]:
            raise ValueError(f"bundle size differs from cache index: {name}")
        record["bundle_sha256"] = digest(data)
        record["text_asset"] = TARGETS[name]
        raw_path = args.output_directory / f"{name.rsplit('/', 1)[1]}.cache-record.pb"
        raw_path.write_bytes(raw_records[name])
        record["raw_record_path"] = raw_path.name

    bms_rows = []
    for name, asset_name in TARGETS.items():
        bms_path = args.bms_directory / f"{asset_name}.bms.txt"
        metadata_path = args.bms_directory / f"{asset_name}.metadata.json"
        data = bms_path.read_bytes()
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        expected_bundle = records[name]
        if metadata["bundle_name"] != name:
            raise ValueError(f"BMS metadata bundle name differs: {asset_name}")
        if metadata["bundle_sha256"] != expected_bundle["bundle_sha256"]:
            raise ValueError(f"BMS metadata bundle hash differs: {asset_name}")
        if metadata["asset"]["sha256"] != digest(data):
            raise ValueError(f"BMS metadata asset hash differs: {asset_name}")
        bms_rows.append({
            "bundle_name": name,
            "asset_name": asset_name,
            "path": bms_path.relative_to(args.output_directory.parent.parent).as_posix(),
            "bytes": len(data),
            "sha256": digest(data),
            "start_bpm": metadata["asset"]["start_bpm"],
        })

    output = {
        "schema_version": 1,
        "status": "confirmed-r0-connected-device-cache-input-provenance",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
        },
        "capability": {
            "level": "R0",
            "source": "adb pull of app-owned external cache files",
            "return_replacement": False,
            "memory_writes": False,
            "apk_modification": False,
        },
        "asset_bundle_info": {
            "device_path": "/sdcard/Android/data/jp.co.craftegg.band/files/data/AssetBundleInfo",
            "bytes": len(index),
            "sha256": digest(index),
            "resource_version": version,
        },
        "records": [records[name] for name in sorted(records)],
        "bms": bms_rows,
        "privacy": {
            "account_fields_included": False,
            "cache_records_include_only_resource_name_hash_version_timing_checksum_size": True,
        },
        "unknown_fields": [],
        "blocking_findings": [],
    }
    (args.output_directory / "cache_index_provenance.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"cache provenance extracted: version={version} index={digest(index)} "
        f"records={len(records)} bms={len(bms_rows)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
