#!/usr/bin/env python3
"""Verify the current ordinary Long after/base-mesh lifecycle profile."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from extract_resource_pixi_rendering_static_contract import (
    load_elf,
    load_methods,
    next_address,
    read_va,
)

HERE = Path(__file__).resolve().parent
PROFILE = HERE / "resource_pixi_rendering_note_child_lifecycle_profile.json"
STATIC = HERE / "resource_pixi_rendering_static_contract.json"
MIGRATION = HERE / "resource_pixi_rendering_instruction_migration.json"
GEOMETRY = HERE / "resource_pixi_rendering_geometry_oracle.json"
NOTE_GEOMETRY = HERE / "resource_pixi_rendering_note_geometry_profile.json"
TARGET_DUMP = HERE.parents[2] / "static/il2cpp/dump-10.1.4_230"
TARGET_BINARY = HERE.parents[2] / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def tsv_machine_code(path: Path) -> bytes:
    rows = path.read_text(encoding="utf-8").splitlines()
    assert rows and rows[0] == "address\tbytes\tinstruction\tresolved_target"
    return b"".join(bytes.fromhex(row.split("\t", 3)[1]) for row in rows[1:] if row)


def main() -> int:
    profile = load(PROFILE)
    static = load(STATIC)
    migration = load(MIGRATION)
    geometry = load(GEOMETRY)
    note_geometry = load(NOTE_GEOMETRY)
    assert profile["status"] == "confirmed-current-ordinary-long-normal-after-base-mesh-lifecycle-profile"
    assert profile["sample"] == static["target"]
    expected_sources = {
        "static_contract_sha256": sha(STATIC),
        "instruction_migration_sha256": sha(MIGRATION),
        "geometry_oracle_sha256": sha(GEOMETRY),
        "note_geometry_profile_sha256": sha(NOTE_GEOMETRY),
        "target_script_sha256": sha(TARGET_DUMP / "script.json"),
        "target_libil2cpp_sha256": sha(TARGET_BINARY),
    }
    assert profile["source"] == expected_sources
    static_map = {(row["owner"], row["method"]): row for row in static["methods"]}
    migration_map = {(row["owner"], row["method"]): row for row in migration["methods"]}
    _, by_name, _, addresses = load_methods(TARGET_DUMP)
    binary, segments = load_elf(TARGET_BINARY)
    assert len(profile["methods"]) == 30
    for method in profile["methods"]:
        key = (method["owner"], method["method"])
        source = static_map.get(key)
        if source is not None:
            instruction = migration_map[key]
            assert method["rva"] == source["target_rva"]
            assert method["end_rva"] == source["target_end_rva"]
            assert method["arm64_sha256"] == source["target_sha256"]
            assert method["arm64_evidence"] == source["evidence"]
            assert method["instruction_status"] == instruction["status"]
            assert method["current_specific_differences"] == instruction["differences"]
        else:
            hits = by_name.get(f"{key[0]}$${key[1]}", [])
            assert len(hits) == 1, key
            start = int(hits[0]["Address"])
            end = next_address(addresses, start)
            direct = read_va(binary, segments, start, end - start)
            assert method["rva"] == f"0x{start:X}"
            assert method["end_rva"] == f"0x{end:X}"
            assert method["arm64_sha256"] == hashlib.sha256(direct).hexdigest().upper()
            assert method["instruction_status"] == "current-direct-byte-pinned"
            assert method["current_specific_differences"] == []
        code = tsv_machine_code(HERE / method["arm64_evidence"])
        assert hashlib.sha256(code).hexdigest().upper() == method["arm64_sha256"]
    authorization = profile["authorization"]
    assert authorization["ordinary_long_normal_after_motion"] is True
    assert authorization["ordinary_long_normal_base_mesh_lifecycle"] is True
    for key in (
        "ordinary_long_flick_after_icon",
        "ordinary_slide_child_chain",
        "ordinary_non_normal_sync_reconnect",
        "multiple_directional_lifecycle",
        "advanced_mesh",
        "threshold_shader",
        "habahiro_exact",
    ):
        assert authorization[key] is False
    assert profile["base_mesh_lifecycle"]["runtime_corroboration"]["mesh_owners"] == 510
    assert geometry["coverage"]["mesh_lifecycle_owners"] == 510
    assert note_geometry["authorization"]["ordinary_base_note_mesh_producer"] is True
    assert profile["unknown_fields"] == []
    print("verified Note child lifecycle profile: methods=30 long-normal=authorized slide/multiple/icon=closed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
