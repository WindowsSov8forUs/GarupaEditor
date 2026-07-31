#!/usr/bin/env python3
"""Fail-closed verifier for current 10.1.4 resource and HUD asset profiles."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
RESOURCE_EXTRACTOR = HERE / "extract_resource_pixi_rendering_resource_contract.py"
HUD_EXTRACTOR = HERE / "extract_resource_pixi_rendering_hud_asset_profiles.py"
SKILL_EXTRACTOR = HERE / "extract_resource_pixi_rendering_skill_animation_profiles.py"
NOTE_ANIMATION_EXTRACTOR = HERE / "extract_resource_pixi_rendering_note_animation_profiles.py"
SCORE_UP_EXTRACTOR = HERE / "extract_resource_pixi_rendering_score_up_profile.py"
RESOURCE_CONTRACT = HERE / "resource_pixi_rendering_resource_contract.json"
HUD_CONTRACT = HERE / "resource_pixi_rendering_hud_asset_profiles.json"
SKILL_CONTRACT = HERE / "resource_pixi_rendering_skill_animation_profiles.json"
NOTE_ANIMATION_CONTRACT = HERE / "resource_pixi_rendering_note_animation_profiles.json"
SCORE_UP_CONTRACT = HERE / "resource_pixi_rendering_score_up_profile.json"


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def read_strict_json(path: Path) -> Any:
    def reject_constant(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)


def find_float_specials(value: Any) -> list[dict[str, str]]:
    if isinstance(value, dict):
        if set(value) == {"float_special", "ieee754_binary32"}:
            return [value]
        return [item for child in value.values() for item in find_float_specials(child)]
    if isinstance(value, list):
        return [item for child in value for item in find_float_specials(child)]
    return []


def main() -> int:
    for path in (RESOURCE_EXTRACTOR, HUD_EXTRACTOR, SKILL_EXTRACTOR, NOTE_ANIMATION_EXTRACTOR, SCORE_UP_EXTRACTOR, RESOURCE_CONTRACT, HUD_CONTRACT, SKILL_CONTRACT, NOTE_ANIMATION_CONTRACT, SCORE_UP_CONTRACT):
        require(path.is_file(), f"missing required file: {path}")
    resource_module = load_module("verify_resource_contract_extract", RESOURCE_EXTRACTOR)
    hud_module = load_module("verify_hud_asset_extract", HUD_EXTRACTOR)
    skill_module = load_module("verify_skill_animation_extract", SKILL_EXTRACTOR)
    note_animation_module = load_module("verify_note_animation_extract", NOTE_ANIMATION_EXTRACTOR)
    score_up_module = load_module("verify_score_up_extract", SCORE_UP_EXTRACTOR)
    expected_resource = read_strict_json(RESOURCE_CONTRACT)
    expected_hud = read_strict_json(HUD_CONTRACT)
    expected_skill = read_strict_json(SKILL_CONTRACT)
    expected_note_animation = read_strict_json(NOTE_ANIMATION_CONTRACT)
    expected_score_up = read_strict_json(SCORE_UP_CONTRACT)
    actual_resource = resource_module.build_contract()
    actual_hud = hud_module.build_contract()
    actual_skill = skill_module.build_contract()
    actual_note_animation = note_animation_module.build_contract()
    actual_score_up = score_up_module.build_profile()
    require(actual_resource == expected_resource, "resource contract differs from current local-only inputs")
    require(actual_hud == expected_hud, "HUD asset profile differs from current local-only inputs")
    require(actual_skill == expected_skill, "Skill animation profile differs from current local-only inputs")
    require(actual_note_animation == expected_note_animation, "Note animation profile differs from current local-only inputs")
    require(actual_score_up == expected_score_up, "ScoreUp profile differs from current local-only inputs")

    require(expected_resource["status"] == "confirmed-current-r0-resource-and-static-unity-assets-runtime-gate-open", "resource status mismatch")
    require(expected_resource["asset_bundle_info"]["record_count"] == 11026, "AssetBundleInfo record count mismatch")
    require(expected_resource["asset_bundle_info"]["ingameskin_record_count"] == 57, "ingameskin record count mismatch")
    require(len(expected_resource["ingameskin_bundles"]) == 57, "ingameskin profile count mismatch")
    require(len(expected_resource["selected_base_resources"]) == 100, "selected base resource count mismatch")
    bundles = {row["bundle_name"]: row for row in expected_resource["ingameskin_bundles"]}
    require(len(bundles) == 57, "duplicate ingameskin bundle profile")
    required = {
        "ingameskin/noteskin/skin00",
        "ingameskin/noteskin/skin01",
        "ingameskin/noteskin/directionalflickskin00",
        "ingameskin/noteskin/directionalflickskin01",
        "ingameskin/judgeskin/skin00",
        "ingameskin/fieldskin/skin00",
        "ingameskin/tapeffect/skin00",
    }
    require(required <= set(bundles), "required skin bundles are missing")
    for name in ("ingameskin/noteskin/skin00", "ingameskin/noteskin/skin01"):
        require(len(bundles[name]["sprites"]) == 45, f"standard Note Sprite count mismatch: {name}")
        require(any(texture["name"] == "RhythmGameSprites" and texture["width"] == 2048 and texture["height"] == 1024 for texture in bundles[name]["textures"]), f"standard Note atlas mismatch: {name}")
    for name in ("ingameskin/noteskin/directionalflickskin00", "ingameskin/noteskin/directionalflickskin01"):
        require(len(bundles[name]["sprites"]) == 16, f"directional Sprite count mismatch: {name}")
        require(any(texture["name"] == "DirectionalFlickSprites" and texture["width"] == 1024 and texture["height"] == 1024 for texture in bundles[name]["textures"]), f"directional atlas mismatch: {name}")
    judge = bundles["ingameskin/judgeskin/skin00"]
    require(len(judge["ngui_atlases"]) == 1, "Judge NGUI atlas missing")
    require([row["name"] for row in judge["ngui_atlases"][0]["sprites"]] == [
        "judge_auto", "judge_bad", "judge_fast", "judge_good", "judge_great", "judge_miss", "judge_perfect", "judge_slow",
    ], "Judge Sprite row order mismatch")
    field = bundles["ingameskin/fieldskin/skin00"]
    require({row["name"] for row in field["sprites"]} == {"game_play_line", "game_play_line_skill_adjust_effect"}, "Field Sprite inventory mismatch")
    require(expected_resource["habahiro_route"]["cache_index_candidates"] == [], "unexpected current HABAHIRO cache record")
    require(expected_resource["habahiro_route"]["resource_bytes_status"] == "evidence-required-current-bundle-absent-from-cache-index", "HABAHIRO resource status mismatch")
    require(expected_resource["distribution"]["original_binary_assets_committed"] is False, "binary assets must remain local-only")
    require(expected_resource["distribution"]["runtime_network_allowed"] is False, "runtime network must remain disabled")
    float_specials = find_float_specials(expected_resource)
    require(len(float_specials) == 12, "unexpected explicit Float special-value count")
    require(all(row == {"float_special": "positive-infinity", "ieee754_binary32": "7F800000"} for row in float_specials), "Float special-value encoding mismatch")
    require(expected_resource["capability"] == {
        "level": "R0-local-static-and-device-cache-read",
        "game_process_started": False,
        "server_contacted": False,
        "frida_used": False,
        "return_replacement": False,
        "memory_writes": False,
        "apk_modification": False,
        "managed_invocation": False,
    }, "R0 capability record mismatch")

    require(expected_hud["status"] == "confirmed-current-static-hud-assets-runtime-gate-open", "HUD status mismatch")
    require(expected_hud["sample"]["level3_bytes"] == 764840, "RhythmGame scene size mismatch")
    require(len(expected_hud["profiles"]) == 8, "HUD profile count mismatch")
    require(set(expected_hud["profiles"]) == {"combo", "combo_animation", "life", "score_result", "score_up", "life_skill", "score_skill", "judge_skill"}, "HUD profile set mismatch")
    require(bool(expected_hud["blocking_findings"]), "HUD runtime/static blockers were lost")
    require(expected_skill["status"] == "confirmed-current-static-skill-animation-assets-runtime-assignment-open", "Skill animation status mismatch")
    require(set(expected_skill["clips"]) == {"life_heal", "damage_guard", "score_up", "judge_adjust"}, "Skill clip set mismatch")
    require(set(expected_skill["controllers"]) == {"life", "score", "judge"}, "Skill controller set mismatch")
    require(expected_skill["scene_life_animator"]["runtime_assignment_status"] == "evidence-required", "Life controller assignment must remain open")
    require(expected_note_animation["status"] == "confirmed-current-static-note-animation-assets-runtime-phase-open", "Note animation status mismatch")
    require(set(expected_note_animation["clips"]) == {"flick", "flick_left", "flick_right", "long_note_flash"}, "Note animation clip set mismatch")
    require(set(expected_note_animation["controllers"]) == {"flick", "long_note_flash"}, "Note animation controller set mismatch")
    for label in ("flick", "flick_left", "flick_right"):
        require(expected_note_animation["clips"][label]["stop_time"] == 0.3333333432674408 and bool(expected_note_animation["clips"][label]["loop_time"]), f"Flick animation duration/loop mismatch: {label}")
    score_up_behavior = expected_score_up["behavior"]["result_change_sprite"]
    require(score_up_behavior["address"] == "0x32AC010", "current ScoreUp method address mismatch")
    require(score_up_behavior["jump_table_virtual_address"] == "0x15818BF" and score_up_behavior["jump_table_bytes"] == "00414f5865", "current ScoreUp jump table mismatch")
    require(score_up_behavior["string_literals"] == {
        "icon_skill_score_half": "0x6F9D018",
        "icon_skill_score_up_1": "0x6F9D020",
        "icon_skill_score_up_2": "0x6F9D028",
        "icon_skill_score_zero": "0x6F9D030",
    }, "current ScoreUp string literals mismatch")
    require(set(score_up_behavior["score_up_types"]) == {"1", "2", "3", "4", "5"}, "ScoreUp type route mismatch")
    serialized = json.dumps({"resource": expected_resource, "hud": expected_hud, "skill": expected_skill, "note_animation": expected_note_animation, "score_up": expected_score_up}, ensure_ascii=False, allow_nan=False)
    require("bestdori.com" not in serialized.lower(), "current evidence must not depend on Bestdori")
    require("http://" not in serialized.lower() and "https://" not in serialized.lower(), "current evidence contains a network source")
    print("verified resource/render assets: cache=11026 ingameskin=57 base_resources=100 hud_profiles=8 skill_clips=4 note_clips=4 score_up=5")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
