from __future__ import annotations

from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import struct

import UnityPy


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SO_PATH = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"
DATA_ROOT = ROOT / "tmp/resource-pixi-rendering-10.1.4_230/apk/assets/bin/Data"
STRING_LITERALS = ROOT / "static/il2cpp/dump-10.1.4_230/stringliteral.json"
COMBO_HELPER_PATH = (
    ROOT / "artifacts/investigations/hud-combo-rendering/extract_hud_combo_rendering.py"
)
SCORE_HELPER_PATH = (
    ROOT
    / "artifacts/investigations/hud-score-result-rendering/extract_hud_score_result_rendering.py"
)
COLOR_HELPER_PATH = (
    ROOT
    / "artifacts/investigations/hud-judge-color-rendering/extract_hud_judge_color_rendering.py"
)
UNITY_VERSION = "2022.3.62f1"
JUMP_TABLE_VA = 0x15818BF


def load_helper(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


combo_helper = load_helper("hud_combo_extract", COMBO_HELPER_PATH)
score_helper = load_helper("hud_score_result_extract", SCORE_HELPER_PATH)
color_helper = load_helper("hud_judge_color_extract", COLOR_HELPER_PATH)
combo_helper.DATA_ROOT = DATA_ROOT
score_helper.DATA_ROOT = DATA_ROOT
score_helper.helper.DATA_ROOT = DATA_ROOT


def pptr(raw: bytes, offset: int) -> dict[str, int]:
    file_id, path_id = struct.unpack_from("<iq", raw, offset)
    return {"file_id": file_id, "path_id": path_id}


def file_profile(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "size": len(data),
        "sha256": sha256(data).hexdigest(),
    }


def scene_profile() -> dict[str, object]:
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    environment = UnityPy.load(str(DATA_ROOT / "level3"))
    objects = {obj.path_id: obj for obj in environment.objects}
    scene_file = next(iter(environment.files.values()))
    scene_externals = [external.path for external in scene_file.externals]
    names = combo_helper.script_names()

    def sprite_for_transform(transform_id: int) -> dict[str, object]:
        transform = objects[transform_id].read_typetree()
        game_object = objects[transform["m_GameObject"]["m_PathID"]].read_typetree()
        sprite = next(
            objects[pointer["component"]["m_PathID"]]
            for pointer in game_object["m_Component"]
            if objects[pointer["component"]["m_PathID"]].type.name
            == "MonoBehaviour"
            and names.get(
                struct.unpack_from(
                    "<q",
                    objects[pointer["component"]["m_PathID"]].get_raw_data(),
                    20,
                )[0]
            )
            == "UISprite"
        )
        profile = score_helper.sprite_profile(sprite, objects, scene_externals)
        profile["serialized_color"] = list(
            struct.unpack_from("<4f", sprite.get_raw_data(), 0x74)
        )
        return profile

    result = objects[1236]
    result_raw = result.get_raw_data()
    skill_effect_count = struct.unpack_from("<I", result_raw, 0x2C)[0]
    displays = []
    for index in range(skill_effect_count):
        display_id = pptr(result_raw, 0x30 + index * 12)["path_id"]
        display = objects[display_id]
        display_raw = display.get_raw_data()
        main_sprite = pptr(display_raw, 0x20)
        sub_sprite = pptr(display_raw, 0x2C)
        displays.append(
            {
                **score_helper.component_profile(display, objects, names),
                "main_sprite": score_helper.sprite_profile(
                    objects[main_sprite["path_id"]], objects, scene_externals
                ),
                "sub_sprite": score_helper.sprite_profile(
                    objects[sub_sprite["path_id"]], objects, scene_externals
                ),
            }
        )
    rate_ui_id = pptr(result_raw, 0x60)["path_id"]
    rate_ui = objects[rate_ui_id]
    rate_raw = rate_ui.get_raw_data()
    number = pptr(rate_raw, 0x20)
    decimal = pptr(rate_raw, 0x2C)
    fractional = pptr(rate_raw, 0x38)
    return {
        **file_profile(DATA_ROOT / "level3"),
        "unity_scene": "Assets/star/Scenes/RhythmGame.unity",
        "ui_root_scale": combo_helper.transform_profile(objects[436], objects)[
            "local_scale"
        ],
        "result": score_helper.component_profile(result, objects, names),
        "skill_effects": displays,
        "rate_up_value_ui": {
            **score_helper.component_profile(rate_ui, objects, names),
            "base_sprite": sprite_for_transform(863),
            "rate_up_value_sprite_number": score_helper.sprite_number_profile(
                objects[number["path_id"]], objects, names, scene_externals
            ),
            "decimal_point_sprite": sprite_for_transform(decimal["path_id"]),
            "below_first_decimal_point_number": {
                "pointer": fractional,
                "transform": combo_helper.transform_profile(
                    objects[fractional["path_id"]], objects
                ),
            },
            "total_sprite": sprite_for_transform(830),
            "percentage_sprite": sprite_for_transform(837),
        },
    }


def atlas_profile() -> dict[str, object]:
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    entries = combo_helper.resource_entries()
    atlas = combo_helper.atlas_profile(
        "atlas/bms/ui/rhythmgameui",
        entries["atlas/bms/ui/rhythmgameui"],
    )
    selected = {
        "skill_eff",
        "icon_skill_score_up_1",
        "icon_skill_score_up_2",
        "icon_skill_score_zero",
        "icon_skill_score_half",
        "icon_skill_number_period",
        "icon_skill_percentage",
        "icon_skill_total",
    }
    selected.update(f"icon_skill_number_{digit}" for digit in range(10))
    atlas["sprites"] = [
        sprite for sprite in atlas["sprites"] if sprite["name"] in selected
    ]
    return atlas


def string_literal_profile() -> dict[str, str]:
    expected = {
        "icon_skill_score_half": "0x6F9D018",
        "icon_skill_score_up_1": "0x6F9D020",
        "icon_skill_score_up_2": "0x6F9D028",
        "icon_skill_score_zero": "0x6F9D030",
    }
    entries = json.loads(STRING_LITERALS.read_text(encoding="utf-8"))
    actual = {entry["value"]: entry["address"] for entry in entries if entry["value"] in expected}
    if actual != expected:
        raise ValueError("ScoreUp string-literal addresses changed")
    return actual


def build_profile() -> dict[str, object]:
    binary = SO_PATH.read_bytes()
    segments = color_helper.load_segments(binary)
    jump_offset = color_helper.va_to_file_offset(JUMP_TABLE_VA, segments)
    jump_bytes = binary[jump_offset : jump_offset + 5]
    if jump_bytes != bytes.fromhex("00414f5865"):
        raise ValueError("ScoreUp jump table changed")
    return {
        "schema_version": 1,
        "sample": file_profile(SO_PATH),
        "scene": scene_profile(),
        "atlas": atlas_profile(),
        "behavior": {
            "result_change_sprite": {
                "address": "0x32AC010",
                "jump_table_virtual_address": f"0x{JUMP_TABLE_VA:X}",
                "jump_table_file_offset": f"0x{jump_offset:X}",
                "jump_table_bytes": jump_bytes.hex(),
                "instructions": color_helper.disassemble(
                    binary, segments, 0x32AC334, 0x1D0
                ),
                "string_literals": string_literal_profile(),
                "score_up_types": {
                    "1": {
                        "sprite": "icon_skill_score_up_1",
                        "effect_type": 0,
                        "branch": "0x32AC350",
                    },
                    "2": {
                        "sprite": "icon_skill_score_up_2",
                        "effect_type": 1,
                        "branch": "0x32AC454",
                    },
                    "3": {
                        "sprite": "icon_skill_score_zero",
                        "effect_type": 2,
                        "branch": "0x32AC48C",
                    },
                    "4": {
                        "sprite": "icon_skill_score_half",
                        "effect_type": 2,
                        "branch": "0x32AC4B0",
                    },
                    "5": {
                        "sprite": "icon_skill_score_up_1",
                        "effect_type": 0,
                        "branch": "0x32AC4E4",
                        "activates_rate_up_value_ui": True,
                    },
                },
            },
            "in_game_skill_effect_display_play": {
                "address": "0x3A6DE00",
                "main_sprite_alpha": 1.0,
                "main_sprite_dynamic_native_size": True,
                "sub_sprite": "skill_eff",
                "effect_tints_rgba8": {
                    "0": [243, 236, 3, 255],
                    "1": [225, 136, 0, 255],
                    "2": [192, 192, 192, 255],
                },
                "sub_sprite_alpha": 1.0,
            },
            "skill_effect_changeable_text_object_play": {
                "address": "0x32E2D60",
                "integer_input": "truncate(currentRateUpValue * 10.0)",
                "set_number": {
                    "address": "0x33750D4",
                    "mode": 0,
                    "interval": 0.0,
                    "should_add_plus_sign": False,
                },
                "set_depth": {"address": "0x3375058", "depth": 55},
                "digit_layout": {
                    "order": "least-significant-first",
                    "align": "center",
                    "digit_size": [18, 22],
                    "padding": -3.0,
                    "step": 15.0,
                },
                "decimal_layout": {
                    "period_local_x": 16.100000381469727,
                    "fractional_digit_local_x": "period_local_x + 4.0",
                    "resolved_fractional_digit_local_x": 20.100000381469727,
                    "fractional_digit_y": "preserve current local Y",
                    "set_position_address": "0x3B054C0",
                },
                "full_digit_and_decimal_layout_recovered": True,
            },
        },
        "confirmed": [
            "Result serializes two InGameSkillEffectDisplay objects and the ScoreUp route uses skillEffect_0.",
            "ScoreUp types 1 through 5 select four exact rhythmgameui icon Sprites.",
            "InGameSkillEffectDisplay.Play resizes the main Sprite to native atlas dimensions and tints skill_eff with one of three exact RGBA8 colors.",
            "The sub Sprite depth 33 precedes the main Sprite depth 55.",
            "Type 5 renders TOTAL, a centered UISpriteNumber, a fixed period, the relocated fractional digit, and a percentage unit over its own yellow skill_eff base.",
        ],
        "unresolved": [
            "Exact NGUI draw-call batching and Unity GPU sampling remain outside this portable software closure.",
        ],
        "avd_used": False,
    }


def main() -> None:
    output_path = HERE / "resource_pixi_rendering_score_up_profile.json"
    output_path.write_text(
        json.dumps(build_profile(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(output_path.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
