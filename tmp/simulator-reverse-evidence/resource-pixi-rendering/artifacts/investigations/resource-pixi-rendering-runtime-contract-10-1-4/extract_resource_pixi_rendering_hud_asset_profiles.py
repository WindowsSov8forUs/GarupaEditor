#!/usr/bin/env python3
"""Extract current 10.1.4 HUD scene, atlas, font and animation asset profiles."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import types
from typing import Any, Callable


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA_ROOT = ROOT / "tmp/resource-pixi-rendering-10.1.4_230/apk/assets/bin/Data"
TARGET_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"
TARGET_DUMP = ROOT / "static/il2cpp/dump-10.1.4_230"
INVESTIGATIONS = ROOT / "artifacts/investigations"
STATIC_CONTRACT = HERE / "resource_pixi_rendering_static_contract.json"

EXTRACTORS = {
    "combo": "hud-combo-rendering/extract_hud_combo_rendering.py",
    "combo_animation": "hud-combo-animation/extract_hud_combo_animation.py",
    "life": "hud-life-rendering/extract_hud_life_rendering.py",
    "score_result": "hud-score-result-rendering/extract_hud_score_result_rendering.py",
    "score_up": "hud-score-up-overlay-rendering/extract_hud_score_up_overlay_rendering.py",
    "life_skill": "hud-skill-overlay-rendering/extract_hud_skill_overlay_rendering.py",
    "score_skill": "hud-score-skill-overlay-rendering/extract_hud_score_skill_overlay_rendering.py",
    "judge_skill": "hud-judge-skill-overlay-rendering/extract_hud_judge_skill_overlay_rendering.py",
}


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_module(name: str, relative: str) -> types.ModuleType:
    path = INVESTIGATIONS / relative
    spec = importlib.util.spec_from_file_location(f"current_10_1_4_{name}", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    module.DATA_ROOT = DATA_ROOT
    if hasattr(module, "SO_PATH"):
        module.SO_PATH = TARGET_BINARY
    if hasattr(module, "STRING_LITERALS"):
        module.STRING_LITERALS = TARGET_DUMP / "stringliteral.json"
    for value in vars(module).values():
        if isinstance(value, types.ModuleType):
            if hasattr(value, "DATA_ROOT"):
                value.DATA_ROOT = DATA_ROOT
            if hasattr(value, "SO_PATH"):
                value.SO_PATH = TARGET_BINARY
            if hasattr(value, "STRING_LITERALS"):
                value.STRING_LITERALS = TARGET_DUMP / "stringliteral.json"
    return module


def current_method_ranges() -> dict[tuple[str, str], tuple[int, int]]:
    contract = json.loads(STATIC_CONTRACT.read_text(encoding="utf-8"))
    return {
        (row["owner"], row["method"]): (int(row["target_rva"], 16), int(row["target_end_rva"], 16))
        for row in contract["methods"]
    }


def normalize_paths(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: normalize_paths(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_paths(item) for item in value]
    if isinstance(value, str):
        markers = (
            "static/apktool/base/assets/bin/Data/",
            "tmp/resource-pixi-rendering-10.1.4_230/apk/assets/bin/Data/",
        )
        for marker in markers:
            if value.startswith(marker):
                return "base.apk!/assets/bin/Data/" + value[len(marker):]
    return value


def pick(profile: dict[str, Any], *keys: str) -> dict[str, Any]:
    return {key: profile[key] for key in keys}


def build_contract() -> dict[str, Any]:
    ranges = current_method_ranges()
    modules = {name: load_module(name, relative) for name, relative in EXTRACTORS.items()}

    combo = modules["combo"].build_profile()

    combo_animation_module = modules["combo_animation"]
    combo_animation_module.FUNCTIONS = {
        "all_perfect_awake_start": ranges[("AllPerfectStatusAnimation", "AwakeStart")],
        "all_perfect_hide": ranges[("AllPerfectStatusAnimation", "Hide")],
        "all_perfect_reset": ranges[("AllPerfectStatusAnimation", "Reset")],
        "all_perfect_reset_combo_number": ranges[("AllPerfectStatusAnimation", "ResetComboNumber")],
        "all_perfect_exec_update": ranges[("AllPerfectStatusAnimation", "ExecUpdate")],
        "combo_show_coroutine_move_next": ranges[("ComboNumber.<showCoroutine>d__9", "MoveNext")],
        "all_perfect_status_update": ranges[("AllPerfectStatusController", "UpdateAllPerfectStatus")],
    }
    combo_animation = combo_animation_module.build_profile()

    life = modules["life"].build_profile()
    score_result = modules["score_result"].build_profile()
    score_up_module = modules["score_up"]
    score_up = {
        "scene": score_up_module.scene_profile(),
        "atlas": score_up_module.atlas_profile(),
    }
    life_skill_module = modules["life_skill"]
    life_skill_helper = life_skill_module.life_helper
    life_skill_profile = life_skill_helper.build_profile()
    rhythm_game_ui = life_skill_profile["atlases"]["rhythm_game_ui"]
    life_skill = {
        "atlas": {
            "resource_path": rhythm_game_ui["resource_path"],
            "atlas": rhythm_game_ui["atlas"],
            "texture": rhythm_game_ui["texture"],
            "sprites": {
                sprite["name"]: sprite
                for sprite in rhythm_game_ui["sprites"]
                if sprite["name"] in life_skill_module.SPRITE_NAMES
            },
        },
        "scene": {
            "ui_root_scale": life_skill_profile["scene"]["ui_root_scale"],
            "animator": {"path_id": 886, "game_object": "SkillEffect", "serialized_controller": None},
            "sprite_base": life_skill_profile["scene"]["sprites"]["skill_effect"],
            "sprite_icon": life_skill_profile["scene"]["sprites"]["skill_effect_icon"],
        },
    }
    score_skill = {"scene": modules["score_skill"].scene_profile()}
    judge_skill = {"scene": modules["judge_skill"].scene_profile()}

    sources = {}
    for name, relative in EXTRACTORS.items():
        path = INVESTIGATIONS / relative
        sources[name] = {"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)}

    return {
        "schema_version": 1,
        "status": "confirmed-current-static-hud-assets-runtime-gate-open",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "libil2cpp_sha256": digest(TARGET_BINARY),
            "level3_bytes": (DATA_ROOT / "level3").stat().st_size,
            "level3_sha256": digest(DATA_ROOT / "level3"),
        },
        "source_extractors": sources,
        "profiles": normalize_paths({
            "combo": pick(combo, "resources", "atlases", "scene"),
            "combo_animation": combo_animation,
            "life": pick(life, "resources", "atlases", "scene", "dynamic_font"),
            "score_result": pick(score_result, "resources", "rhythm_game_ui_atlas", "score_font", "scene"),
            "score_up": score_up,
            "life_skill": life_skill,
            "score_skill": score_skill,
            "judge_skill": judge_skill,
        }),
        "excluded_historical_inputs": [
            "Bestdori Judge/Field HTTP resources",
            "10.1.3 skill-ui-animation-curves JSON",
            "10.1.3 skill-ui-animation-helpers JSON",
            "10.1.3 life-controller binding JSON",
            "10.1.3 multiresolution projection JSON",
            "10.1.3 hard-coded ScoreUp jump table and addresses",
        ],
        "unknown_fields": [],
        "blocking_findings": [
            "current Skill overlay animation curves and controller assignment require separate current asset/static promotion",
            "current ScoreUp branch table and current method constants require separate current ARM64 promotion",
            "runtime object identity, caller order and frame output remain unobserved",
        ],
    }


def main() -> int:
    contract = build_contract()
    (HERE / "resource_pixi_rendering_hud_asset_profiles.json").write_text(
        json.dumps(contract, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"HUD assets: profiles={len(contract['profiles'])} "
        f"level3={contract['sample']['level3_bytes']} blockers={len(contract['blocking_findings'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
