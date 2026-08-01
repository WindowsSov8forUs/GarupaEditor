#!/usr/bin/env python3
"""Fail-closed verifier for the explicit HABAHIRO degraded approximation decision."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
BUILDER = HERE / "build_habahiro_degraded_approximation.py"
CONTRACT = HERE / "habahiro_degraded_approximation.json"
SCENE_ORACLE = HERE / "habahiro_degraded_scene_oracle.json"


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def strict_json(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def main() -> int:
    require(BUILDER.is_file() and CONTRACT.is_file() and SCENE_ORACLE.is_file(), "degraded approximation builder/contract/oracle is absent")
    spec = importlib.util.spec_from_file_location("verify_habahiro_degraded_builder", BUILDER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    contract = strict_json(CONTRACT)
    scene_oracle = strict_json(SCENE_ORACLE)
    require(module.build_contract() == contract, "degraded approximation differs from locked evidence")
    require(module.build_scene_oracle(contract) == scene_oracle, "degraded scene oracle differs from locked evidence")
    require(contract["status"] == "confirmed-explicit-degraded-habahiro-decision-not-original-parity", "contract status mismatch")
    require(contract["sample"] == {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}, "sample mismatch")

    decision = contract["decision"]
    require(decision["exact_whole_gate_replacement_available"] is False, "whole exact gate was incorrectly replaced")
    require(len(decision["exact_s01_resource_recovery_paths"]) == 3, "S01 exact recovery path count mismatch")
    require(decision["exact_s02_runtime_replacement_available"] is False and decision["exact_s03_frame_replacement_available"] is False, "runtime/frame exact replacement incorrectly claimed")
    require(decision["degraded_delivery_path_available"] is True, "degraded delivery path is absent")

    gates = contract["gate_policy"]
    require(gates["habahiro_exact_parity_gate"] == "open", "exact parity gate closed without evidence")
    require(gates["habahiro_degraded_delivery_gate"] == "closed-authorized-by-explicit-user-request", "degraded delivery gate mismatch")
    require(gates["overall_rendering_gate"] == "open-ordinary-runtime-and-contract-work-remain", "overall rendering gate mismatch")
    require(gates["production_authorization"] is False and gates["parity_claim_allowed"] is False, "degraded decision incorrectly authorizes parity/production")

    surface = contract["mandatory_runtime_surface"]
    require(surface["mode"] == "approximate-habahiro" and surface["visible_label"] == "Approximate HABAHIRO", "visible approximation labeling mismatch")
    require(surface["silent_fallback"] is False and surface["exact_mode_without_current_resource"].startswith("evidence-required"), "silent/exact fallback boundary mismatch")
    require(surface["parity_tests"].startswith("excluded"), "approximation entered parity tests")

    current = contract["current_confirmed"]
    require(current["chart"]["sha256"] == "43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159" and current["chart"]["max_note_count"] == 731 and current["chart"]["lane_change_absolute_position"] == 1728, "current chart facts mismatch")
    require(len(current["methods"]) == 13 and len(current["normalized_equivalent_methods"]) == 10 and len(current["changed_shape_methods_with_current_dedicated_findings"]) == 3, "current method classification mismatch")
    require(set(current["changed_shape_methods_with_current_dedicated_findings"]) == {"NoteManager::setupNoteSkin", "NoteMesh::GetMeshWidthRate", "NoteAddLongMultipleDirectionalFlickVisual::CreateInstances"}, "changed method set mismatch")
    require(current["current_arm64_findings"]["multiple_directional_pool"]["created_instances"] == 60, "current multiple pool count mismatch")
    require(current["current_arm64_findings"]["mesh_width"]["ordinary_default"] == 1.0, "current mesh width finding mismatch")
    require(len(current["resource_proxies"]) == 5, "current proxy resource set mismatch")

    historical = contract["historical_candidate"]["atlas_profile"]
    require(historical["status"] == "historical-10.1.3-unversioned-external-candidate-not-current-evidence", "historical boundary mismatch")
    require(historical["sprite_count"] == 179 and historical["texture_count"] == 9, "historical resource counts mismatch")
    require(historical["pivots"] == [["0.5", "0.5"]] and historical["pixels_per_unit"] == ["100", "65"], "historical Sprite geometry mismatch")
    require(historical["version_equivalence_to_10_1_4"] == "unproven" and historical["binary_committed"] is False, "historical resource was incorrectly promoted")
    require(sum(historical["family_counts"].values()) == 179 and set(historical["family_counts"]) == {"note_flick", "note_flick_top", "note_slide_among", "note_long", "note_long_flash", "note_normal", "note_normal_16", "note_skill", "simultaneous_line"}, "historical family inventory mismatch")

    require([row["profile_id"] for row in contract["profiles"]] == ["historical-atlas-proxy", "current-ordinary-stretch-proxy"], "approximation profile order mismatch")
    require(all("approx" in row["lane_change"].lower() or "omit Root_effect" in row["lane_change"] for row in contract["profiles"]), "lane-change approximation boundary missing")
    differences = contract["difference_matrix"]
    require(len(differences) == 12 and [row["id"] for row in differences] == [f"HA-D{index:02d}" for index in range(1, 13)], "difference matrix IDs mismatch")
    require({row["severity"] for row in differences} == {"low", "medium", "high", "critical"}, "difference severity coverage mismatch")
    require(contract["directly_impacted_fixed_cases"] == ["PR01", "PR04", "PR19", "PR40"], "directly impacted PR cases mismatch")

    acceptance = contract["acceptance"]
    require(acceptance["degraded_preview_may_continue"] is True and acceptance["original_parity_may_close"] is False, "acceptance boundary mismatch")
    require(acceptance["unknown_fields"] == [] and acceptance["blocking_findings_for_exact_parity"] == ["S01-current-resource", "S02-habahiro-natural-runtime", "S03-habahiro-original-frame"], "exact blockers mismatch")
    require(scene_oracle["status"] == "confirmed-diagnostic-degraded-scene-oracle-not-original-frame", "degraded scene oracle status mismatch")
    require(scene_oracle["fidelity"] == {
        "mode": "approximate-habahiro",
        "visible_label": "Approximate HABAHIRO",
        "original_parity": False,
        "generated_frames_are_original_expected": False,
        "automatic_fallback": False,
    }, "degraded scene fidelity mismatch")
    require(scene_oracle["logical_scene"]["historical_sprite_key_count"] == 179 and len(scene_oracle["logical_scene"]["historical_sprite_keys"]) == 179 and len(set(scene_oracle["logical_scene"]["historical_sprite_keys"])) == 179, "degraded Sprite key inventory mismatch")
    require(scene_oracle["logical_scene"]["multiple_directional_pool_capacity"] == 60 and scene_oracle["chart"]["max_note_count"] == 731, "degraded scene capacity mismatch")
    require(scene_oracle["difference_ids"] == [f"HA-D{index:02d}" for index in range(1, 13)] and scene_oracle["frame_oracle"] is None, "degraded scene difference/frame boundary mismatch")
    require(scene_oracle["scene_or_command_parity_claim"] is False and scene_oracle["production_authorization"] is False, "degraded scene incorrectly authorizes parity/production")
    serialized = json.dumps({"contract": contract, "scene_oracle": scene_oracle}, ensure_ascii=False, allow_nan=False)
    require("automatic fallback is forbidden" in serialized and "diagnostic previews only" in serialized and "same engine frame" in serialized, "mandatory degraded warnings missing")
    print("verified HABAHIRO degraded decision: methods=13 historical=179/9 scene=179/731/60 profiles=2 differences=12 impacted=PR01,PR04,PR19,PR40 exact=open degraded=authorized production=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
