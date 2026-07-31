#!/usr/bin/env python3
"""Build observation-only runtime and physical-frame plans for rendering."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
STATIC_CONTRACT = HERE / "resource_pixi_rendering_static_contract.json"
SOURCE_COMMIT = "b8a749bb3fff2106237336e011a8e976a58ef94d"

SELECTORS = [
    ("NoteManager", "setupNoteSkin", "resource"),
    ("NoteImageController", "Init", "resource"),
    ("NoteImageController", "LoadResources", "resource"),
    ("NoteImageController", "SetupNoteFileNameMap", "resource"),
    ("NoteImageController", "SetupDirectionalFlickNoteSkin", "resource"),
    ("NoteImageController", "SetupMeshMaterial", "resource"),
    ("NoteImageController", "SetSyncLineSprite", "resource"),
    ("NoteImageController", "GetNoteSprite", "resource"),
    ("NoteBase", "OnStart", "note"),
    ("NoteBase", "SetSpriteEnabled", "note"),
    ("NoteAfterBase", "setupFlickIconSprite", "note"),
    ("NoteBase", "Deactivate", "note"),
    ("NoteMesh", "CreateInstances", "mesh"),
    ("NoteMesh", "initMesh", "mesh"),
    ("NoteMesh", "SetMaterial", "mesh"),
    ("NoteMesh", "Activate", "mesh"),
    ("NoteMesh", "OnUpdate", "mesh"),
    ("NoteMesh", "Deactivate", "mesh"),
    ("NoteMeshAdvanced", "initMesh", "mesh"),
    ("NoteMeshAdvanced", "OnUpdate", "mesh"),
    ("NoteSyncLine", "CreateInstances", "line"),
    ("NoteSyncLine", "Setup", "line"),
    ("NoteSyncLine", "setLineRendererPosition", "line"),
    ("NoteSyncLine", "setLineWidth", "line"),
    ("NoteSyncLine", "OnUpdate", "line"),
    ("NoteSyncLine", "Deactivate", "line"),
    ("NoteAddLongMultipleDirectionalFlickVisual", "CreateInstances", "multiple-directional"),
    ("NoteAddLongMultipleDirectionalFlickVisual", "DeactivateBackLine", "multiple-directional"),
    ("NoteAddLongMultipleDirectionalFlickVisual", "Deactivate", "multiple-directional"),
    ("ButtonManager", "setupPlayButtons", "field"),
    ("ButtonManager", "SetupSudden", "field"),
    ("ButtonManager", "changeLaneImage", "field"),
    ("Score", "UpdateTotalScore", "hud"),
    ("Score", "UpdateView", "hud"),
    ("Score", "UpdateScoreGauge", "hud"),
    ("Combo", "ExecUpdate", "hud"),
    ("ComboNumber", "Show", "hud"),
    ("ComboNumber", "Hide", "hud"),
    ("AllPerfectStatusAnimation", "ExecUpdate", "hud"),
    ("AddScoreManager", "Play", "hud"),
    ("CE.Result", "Show", "hud"),
    ("CE.Result", "changeSprite", "hud"),
    ("CE.Result", "Hide", "hud"),
    ("JudgeTimingController", "Show", "hud"),
    ("InGameLifeGauge", "UpdateView", "hud"),
    ("InGameLifeGauge", "updateLifeText", "hud"),
    ("InGameLifeGauge", "updateGaugeColor", "hud"),
    ("InGameLifeGauge", "updateWarningGaugeBlink", "hud"),
    ("InGameLifeGauge", "playSkillEffectLifeHealAnimation", "hud-animation"),
    ("InGameLifeGauge", "playSkillEffectDamageGuardAnimation", "hud-animation"),
    ("InGameLifeGauge", "playSkillEffectNeverDieAnimation", "hud-animation"),
    ("InGameLifeGauge", "stopSkillEffectAnimation", "hud-animation"),
    ("InGameSkillEffectDisplay", "Play", "hud-animation"),
    ("InGameSkillEffectDisplay", "Off", "hud-animation"),
    ("SkillEffectChangeableTextObject", "Play", "hud-animation"),
]

SNAPSHOT_FIELDS = {
    "resource": ["logical_resource_alias", "technical_sprite_key", "selected_profile_alias", "success", "error_category"],
    "note": ["object_alias", "pool_alias", "role", "enabled", "position_f32_bits", "scale_f32_bits", "color_f32_bits", "sorting_tuple"],
    "mesh": ["object_alias", "pool_alias", "role", "vertex_f32_bits", "index_u16", "uv_f32_bits", "color_f32_bits", "material_alias", "threshold_f32_bits", "enabled"],
    "line": ["object_alias", "pool_alias", "role", "endpoint_f32_bits", "width_f32_bits", "material_alias", "threshold_f32_bits", "enabled"],
    "multiple-directional": ["object_alias", "pool_alias", "side", "position_f32_bits", "line_alias", "enabled"],
    "field": ["object_alias", "role", "position_f32_bits", "scale_f32_bits", "mask_alias", "sorting_tuple", "enabled"],
    "hud": ["object_alias", "role", "numeric_value", "technical_sprite_key", "color_f32_bits", "alpha_f32_bits", "depth", "enabled"],
    "hud-animation": ["object_alias", "role", "controller_alias", "state_alias", "normalized_time_f32_bits", "enabled"],
}


def strict_json(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def serialized(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def build_targets() -> dict[str, Any]:
    contract = strict_json(STATIC_CONTRACT)
    by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in contract["methods"]:
        by_key.setdefault((row["owner"], row["method"]), []).append(row)
    targets = []
    for index, (owner, method, category) in enumerate(SELECTORS, 1):
        matches = by_key.get((owner, method), [])
        if len(matches) != 1:
            raise ValueError(f"runtime target must resolve uniquely: {owner}::{method} count={len(matches)}")
        row = matches[0]
        targets.append({
            "target_id": f"RPH-{index:03d}",
            "owner": owner,
            "method": method,
            "signature": row["signature"],
            "rva": row["target_rva"],
            "end_rva": row["target_end_rva"],
            "arm64_sha256": row["target_sha256"],
            "arm64_evidence": row["evidence"],
            "category": category,
            "phases": ["enter", "leave"],
            "payload_fields": SNAPSHOT_FIELDS[category],
            "observation_only": True,
        })
    return {
        "schema_version": 1,
        "status": "confirmed-current-hook-target-plan-runtime-evidence-absent",
        "sample": contract["target"],
        "source_static_commit": SOURCE_COMMIT,
        "target_count": len(targets),
        "targets": targets,
        "unknown_targets": [],
        "production_authorization": False,
    }


def base_safety() -> dict[str, Any]:
    return {
        "observation_only": True,
        "natural_live_entry_required": True,
        "spawn_or_attach_only": True,
        "return_replacement": False,
        "memory_writes": False,
        "managed_invocation": False,
        "apk_patch": False,
        "premium_currency_continue": False,
        "network_manipulation": False,
        "synthetic_event_injection": False,
        "raw_pointer_export": False,
        "display_string_export": False,
        "account_room_member_card_skill_identity_export": False,
    }


def trace_schema() -> dict[str, Any]:
    return {
        "required_top_level": ["schema_version", "status", "sample", "plan_id", "hook_target_sha256", "capture", "privacy", "events", "summary"],
        "required_event_fields": ["sequence", "target_id", "phase", "frame", "monotonic_ticks", "thread_alias", "object_alias", "payload"],
        "forbidden_recursive_keys": [
            "address", "pointer", "raw_pointer", "account_id", "user_id", "room_id", "member_id", "card_id", "skill_id",
            "display_name", "nickname", "message", "access_token", "authorization", "cookie", "email", "phone",
        ],
        "technical_strings_allowed": ["target_id", "thread_alias", "object_alias", "pool_alias", "role", "technical_sprite_key", "logical_resource_alias", "controller_alias", "state_alias", "error_category"],
        "max_events": 200000,
        "max_technical_string_bytes": 160,
    }


def scenario(plan_id: str, family: str, required_categories: list[str], anchors: list[str]) -> dict[str, Any]:
    return {
        "plan_id": plan_id,
        "status": "planned-game-server-required",
        "scene_family": family,
        "chart_identity": "content-sha256-only; no music/master/display identity",
        "skin_identity": "logical profile aliases and byte hashes only",
        "start_condition": "attach observation-only hooks before naturally entering the Live scene",
        "capture_start": "first NoteManager.setupNoteSkin.enter",
        "capture_end": "natural result/retire scene transition after all required anchors",
        "required_categories": required_categories,
        "required_anchors": anchors,
        "completion": {
            "capture_error": None,
            "sequence_contiguous_from_zero": True,
            "all_required_categories_observed": True,
            "all_required_anchors_observed": True,
            "setup_note_skin_enter_leave_pair": True,
            "resource_load_enter_leave_pair": True,
            "at_least_one_note_activate_deactivate_pair": True,
            "pause_resume_phase_sample_required": True,
            "renderer_fault_or_context_loss_required": False,
        },
        "output": f"runtime/{plan_id}.trace.json.gz",
    }


def build_r1_plan(targets: dict[str, Any]) -> dict[str, Any]:
    target_bytes = serialized(targets)
    ordinary_categories = ["resource", "note", "mesh", "line", "field", "hud", "hud-animation"]
    habahiro_categories = ordinary_categories + ["multiple-directional"]
    return {
        "schema_version": 1,
        "status": "confirmed-observation-only-plan-game-server-required",
        "sample": {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"},
        "hook_target_sha256": sha256_bytes(target_bytes),
        "safety": base_safety(),
        "trace_schema": trace_schema(),
        "scenarios": [
            scenario("ordinary-rendering-r1", "ordinary", ordinary_categories, ["scene-ready", "first-note-visible", "first-note-judged", "score-combo-life-update", "skill-start", "pause", "resume", "scene-exit"]),
            scenario("habahiro-rendering-r1", "habahiro", habahiro_categories, ["scene-ready", "lane-before", "lane-transition", "lane-after", "multiple-directional-visible", "mesh-line-visible", "pause", "resume", "scene-exit"]),
        ],
        "preconditions": [
            "S01 current HABAHIRO resource profile is committed before HABAHIRO capture",
            "SELinux remains Enforcing",
            "Frida transport is loopback-only and removed after capture",
            "game server is available and the operator naturally enters each planned Live scene",
            "no premium currency, account mutation or synthetic managed/native invocation is used",
        ],
        "promotion_rules": [
            "trace verifier passes with capture_error=null and contiguous sequence",
            "all scenario completion conditions and privacy booleans pass",
            "trace and verifier are committed and pushed before any Garupa evidence freeze",
            "failed, partial, timeout or privacy-invalid traces remain diagnostic-only",
        ],
        "production_authorization": False,
    }


def build_frame_plan() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "status": "confirmed-frame-plan-game-server-required",
        "sample": {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"},
        "safety": base_safety(),
        "viewport": {"orientation": "landscape", "width": 2400, "height": 1080, "pixel_format": "RGBA8", "device_scale": 1},
        "capture": {
            "format": "PNG",
            "source": "physical-device-screencap",
            "crop": "playfield-and-approved-HUD-only",
            "account_room_member_card_skill_identity_visible": False,
            "display_strings_visible": False,
            "raw_pointer_metadata": False,
            "lossy_reencode": False,
        },
        "scenarios": {
            "ordinary": ["scene-ready", "first-note-mid", "judge-perfect", "combo-change", "skill-start", "life-change", "pause"],
            "habahiro": ["scene-ready", "lane-before", "lane-transition", "lane-after", "multiple-directional-mid", "pause"],
        },
        "manifest_required_fields": ["schema_version", "status", "sample", "viewport", "privacy", "frames"],
        "frame_required_fields": ["scenario", "anchor", "event_sequence", "relative_path", "bytes", "sha256", "width", "height", "crop"],
        "output": "runtime/resource-pixi-rendering-frame-manifest.json",
        "production_authorization": False,
    }


def build_status() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "status": "runtime-and-frame-evidence-required-game-server",
        "offline_plan_gate": "closed",
        "rendering_gate": "open",
        "production_authorization": False,
        "required": [
            {"id": "S01", "status": "game-server-required", "artifact": "current HABAHIRO resource profile"},
            {"id": "S02", "status": "game-server-required", "artifact": "ordinary and HABAHIRO confirmed R1 traces"},
            {"id": "S03", "status": "game-server-required", "artifact": "ordinary and HABAHIRO fixed frame manifest"},
        ],
        "confirmed_traces": [],
        "confirmed_frames": [],
        "unknown_offline_work": [],
    }


def write(name: str, value: dict[str, Any]) -> None:
    path = HERE / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(serialized(value))


def main() -> int:
    targets = build_targets()
    write("resource_pixi_rendering_runtime_hook_targets.json", targets)
    write("runtime/resource-pixi-rendering-r1-plan.json", build_r1_plan(targets))
    write("runtime/resource-pixi-rendering-frame-plan.json", build_frame_plan())
    write("runtime_input_status.json", build_status())
    print(f"runtime plans: targets={targets['target_count']} scenarios=2 frame_anchors=13 gate=game-server-required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
