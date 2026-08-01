#!/usr/bin/env python3
"""Build the current ordinary Long after/base-mesh lifecycle implementation profile."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from extract_resource_pixi_rendering_static_contract import (
    load_elf,
    load_methods,
    next_address,
    read_va,
    write_disassembly,
)

HERE = Path(__file__).resolve().parent
STATIC = HERE / "resource_pixi_rendering_static_contract.json"
MIGRATION = HERE / "resource_pixi_rendering_instruction_migration.json"
GEOMETRY = HERE / "resource_pixi_rendering_geometry_oracle.json"
NOTE_GEOMETRY = HERE / "resource_pixi_rendering_note_geometry_profile.json"
OUT = HERE / "resource_pixi_rendering_note_child_lifecycle_profile.json"
TARGET_DUMP = HERE.parents[2] / "static/il2cpp/dump-10.1.4_230"
TARGET_BINARY = HERE.parents[2] / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"
ARM64 = HERE / "note-child-arm64"

METHODS = (
    ("NoteLong", "Activate"),
    ("NoteLong", "Deactivate"),
    ("NoteLong", "OnUpdate"),
    ("NoteLong", "ExecuteAfterUpdate"),
    ("NoteLong", "MoveState"),
    ("NoteLong", "WaitState"),
    ("NoteLong", "StopState"),
    ("NoteAfterBase", "Activate"),
    ("NoteAfterBase", "Deactivate"),
    ("NoteAfterBase", "OnUpdate"),
    ("NoteAfterBase", "WaitState"),
    ("NoteAfterBase", "MoveState"),
    ("NoteAfterBase", "StopState"),
    ("NoteAfterBase", "setupFlickIconSprite"),
    ("NoteBase", "Move"),
    ("NoteBase", "getStartPos"),
    ("NoteBase", "activateAdjust"),
    ("NoteBase", "setupNoteType"),
    ("NoteBase", "SetSpriteEnabled"),
    ("NoteMesh", "SetMaterial"),
    ("NoteMesh", "Activate"),
    ("NoteMesh", "OnUpdate"),
    ("NoteMesh", "Deactivate"),
    ("NoteMesh", "ResetNote"),
    ("NoteManager", "activateNoteAndConnectSyncLine"),
    ("NoteManager", "activateNote"),
    ("NoteManager", "syncLineReconnect"),
    ("NoteManager", "setupSyncLineForFrontAndLongNoteEnd"),
    ("NoteManager", "setupSyncLineForLongNoteEnd"),
    ("NoteManager", "syncLineReconnectAfterMultiNotes"),
)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def main() -> int:
    static = load(STATIC)
    migration = load(MIGRATION)
    geometry = load(GEOMETRY)
    note_geometry = load(NOTE_GEOMETRY)
    ARM64.mkdir(parents=True, exist_ok=True)
    static_map = {(row["owner"], row["method"]): row for row in static["methods"]}
    migration_map = {(row["owner"], row["method"]): row for row in migration["methods"]}
    _, by_name, by_address, addresses = load_methods(TARGET_DUMP)
    binary, segments = load_elf(TARGET_BINARY)
    managed_names = {
        address: sorted({row["Name"] for row in rows})[0]
        for address, rows in by_address.items()
    }
    methods = []
    for key in METHODS:
        source = static_map.get(key)
        if source is not None:
            instruction = migration_map[key]
            assert source["status"] == "mapped"
            assert instruction["target_sha256"] == source["target_sha256"]
            methods.append({
                "owner": key[0],
                "method": key[1],
                "rva": source["target_rva"],
                "end_rva": source["target_end_rva"],
                "arm64_sha256": source["target_sha256"],
                "arm64_evidence": source["evidence"],
                "instruction_status": instruction["status"],
                "current_specific_differences": instruction["differences"],
            })
            continue
        hits = by_name.get(f"{key[0]}$${key[1]}", [])
        assert len(hits) == 1, key
        start = int(hits[0]["Address"])
        end = next_address(addresses, start)
        code = read_va(binary, segments, start, end - start)
        safe_owner = re.sub(r"[^A-Za-z0-9_-]+", "_", key[0])
        safe_method = re.sub(r"[^A-Za-z0-9_-]+", "_", key[1])
        filename = f"{start:08x}__{safe_owner}__{safe_method}.arm64.tsv"
        write_disassembly(ARM64 / filename, start, code, managed_names)
        methods.append({
            "owner": key[0],
            "method": key[1],
            "rva": f"0x{start:X}",
            "end_rva": f"0x{end:X}",
            "arm64_sha256": hashlib.sha256(code).hexdigest().upper(),
            "arm64_evidence": f"note-child-arm64/{filename}",
            "instruction_status": "current-direct-byte-pinned",
            "current_specific_differences": [],
        })
    assert geometry["coverage"]["mesh_lifecycle_owners"] == 510
    assert note_geometry["authorization"]["ordinary_base_note_mesh_producer"] is True
    profile = {
        "schema_version": 1,
        "status": "confirmed-current-ordinary-long-normal-after-base-mesh-lifecycle-profile",
        "sample": static["target"],
        "source": {
            "static_contract_sha256": sha(STATIC),
            "instruction_migration_sha256": sha(MIGRATION),
            "geometry_oracle_sha256": sha(GEOMETRY),
            "note_geometry_profile_sha256": sha(NOTE_GEOMETRY),
            "target_script_sha256": sha(TARGET_DUMP / "script.json"),
            "target_libil2cpp_sha256": sha(TARGET_BINARY),
        },
        "methods": methods,
        "long_activate": {
            "order": [
                "NoteFrontBase.Activate",
                "select inactive NoteAfterBase by AfterNoteType",
                "NoteAfterBase.Activate(after, front, same NoteInformation)",
                "configure front flick-icon route then keep it inactive for Long",
            ],
            "supported_subset": "ordinary fixed 1600x720, FrontNoteType.Long, AfterNoteType.Normal, one non-virtual lane",
        },
        "after_activate": {
            "position": "NotesLauncher.GetStartPosition(after target buttons)",
            "local_scale": [1.0, 1.0, 1.0],
            "mesh_order": ["NoteMesh.SetMaterial", "NoteMesh.Activate(front, after, color)"],
            "sprite_order": ["setupNoteType", "setupFlickIconSprite", "ChangeState(Wait)"],
            "normal_tail_sprite": "note_long_<single lane suffix>",
        },
        "after_wait_and_move": {
            "wait_position": "refresh NotesLauncher.GetStartPosition while LauncherMusicPos is before after absolute position",
            "transition": "LauncherMusicPos >= after absolute position => ChangeState(Move), enable Sprite, run activateAdjust",
            "move": "reuse current NoteBase Move/calcNoteScale Float32 producer with after absolute position and target lane",
            "stop": "MoveState changes to Stop when music position minus after absolute position is non-negative",
        },
        "base_mesh_lifecycle": {
            "activate_transform": {"position": [0.0, 0.0, 0.9900000095367432], "local_scale": [1.0, 1.0, 1.0]},
            "activate": "bind front and after endpoint owners, initial color, set active state",
            "update": "after endpoint state/scale first, then rebuild the authorized 22-vertex/60-index base mesh",
            "deactivate": "Long deactivation deactivates and clears its NoteMesh owner before returning it to the pool",
            "runtime_corroboration": {"mesh_owners": geometry["coverage"]["mesh_lifecycle_owners"]},
        },
        "authorization": {
            "ordinary_long_normal_after_motion": True,
            "ordinary_long_normal_base_mesh_lifecycle": True,
            "ordinary_long_flick_after_icon": False,
            "ordinary_slide_child_chain": False,
            "ordinary_non_normal_sync_reconnect": False,
            "multiple_directional_lifecycle": False,
            "advanced_mesh": False,
            "threshold_shader": False,
            "habahiro_exact": False,
        },
        "limits": [
            "The profile does not authorize Flick or Directional Long tails.",
            "The profile does not authorize Slide intermediate chains or curve mesh ownership.",
            "The profile does not authorize Multiple side/back-line or reconnect behavior.",
            "The profile does not authorize threshold shader clipping or HABAHIRO exact output.",
        ],
        "unknown_fields": [],
    }
    OUT.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"built Note child lifecycle profile: methods={len(methods)} mesh_owners={geometry['coverage']['mesh_lifecycle_owners']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
