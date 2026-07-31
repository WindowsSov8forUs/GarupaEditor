#!/usr/bin/env python3
"""Extract current Skill HUD AnimatorController and AnimationClip profiles."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

import UnityPy


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA_ROOT = ROOT / "tmp/resource-pixi-rendering-10.1.4_230/apk/assets/bin/Data"
COMBO_ANIMATION_EXTRACTOR = ROOT / "artifacts/investigations/hud-combo-animation/extract_hud_combo_animation.py"
UNITY_VERSION = "2022.3.62f1"
UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION

CLIPS = {
    "life_heal": "64c7d8e6881a845cc870e9287e5199dc",
    "damage_guard": "f6d3164e2619543bfb47f42d5a603c15",
    "score_up": "2295aaec51fdd4fe0a73bb8ffc702f9b",
    "judge_adjust": "5964c266e9a334f98966b714e38cc6bf",
}
CONTROLLERS = {
    "life": "85009f9afa17e4481b920d0e4f81f49e",
    "score": "ee1bec92ae1cc4396998d3c17ee09e12",
    "judge": "fb10e0ef8672a4d2fa44b5d3cfe7f11f",
}
PATHS = {2496849696: "SpriteIcon", 837955738: "SpriteBase", 0: ""}


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_decoder() -> Any:
    spec = importlib.util.spec_from_file_location("current_skill_curve_decoder", COMBO_ANIMATION_EXTRACTOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    module.DATA_ROOT = DATA_ROOT
    return module


def pointer(value: Any) -> dict[str, int]:
    if isinstance(value, dict):
        return {"file_id": int(value["m_FileID"]), "path_id": int(value["m_PathID"])}
    return {"file_id": int(value.file_id), "path_id": int(value.path_id)}


def controller_profile(external: str) -> dict[str, Any]:
    path = DATA_ROOT / external
    environment = UnityPy.load(str(path))
    obj = next(obj for obj in environment.objects if obj.type.name == "AnimatorController")
    tree = obj.read_typetree()
    externals = [item.path for item in obj.assets_file.externals]
    states = []
    for machine in tree["m_Controller"]["m_StateMachineArray"]:
        for wrapper in machine["data"]["m_StateConstantArray"]:
            state = wrapper["data"]
            states.append({
                "name_id": state["m_NameID"],
                "path_id": state["m_PathID"],
                "full_path_id": state["m_FullPathID"],
                "speed": state["m_Speed"],
                "loop": state["m_Loop"],
            })
    clips = []
    for value in tree["m_AnimationClips"]:
        pptr = pointer(value)
        clips.append({
            **pptr,
            "external": externals[pptr["file_id"] - 1] if pptr["file_id"] else None,
        })
    return {
        "external": external,
        "bytes": path.stat().st_size,
        "sha256": digest(path),
        "path_id": obj.path_id,
        "name": tree["m_Name"],
        "controller_size": tree["m_ControllerSize"],
        "states": states,
        "clips": clips,
        "tos": [{"hash": value, "name": text} for value, text in tree["m_TOS"]],
    }


def normalize_clip(profile: dict[str, Any]) -> dict[str, Any]:
    profile = dict(profile)
    profile["path"] = "base.apk!/assets/bin/Data/" + Path(profile["path"]).name
    profile["sha256"] = profile["sha256"].upper()
    return profile


def build_contract() -> dict[str, Any]:
    decoder = load_decoder()
    clips = {
        label: normalize_clip(decoder.clip_profile(external, PATHS))
        for label, external in CLIPS.items()
    }
    controllers = {
        label: controller_profile(external)
        for label, external in CONTROLLERS.items()
    }
    expected = {
        "life_heal": {"name": "LifeHealGauge", "stop_time": 1.0, "loop_time": False},
        "damage_guard": {"name": "DamageGuard", "stop_time": 1.0, "loop_time": True},
        "score_up": {"name": "ScoreUpGauge", "stop_time": 0.75, "loop_time": True},
        "judge_adjust": {"name": "SkillAdjustEffect", "stop_time": 0.9833333492279053, "loop_time": True},
    }
    for label, values in expected.items():
        clip = clips[label]
        if clip["name"] != values["name"] or clip["stop_time"] != values["stop_time"] or bool(clip["loop_time"]) != values["loop_time"]:
            raise ValueError(f"current Skill clip identity changed: {label}")
        if clip["sample_rate"] != 60.0 or clip["events"]:
            raise ValueError(f"current Skill clip sample/event contract changed: {label}")
    if controllers["life"]["name"] != "LifeHealGauge" or len(controllers["life"]["states"]) != 2:
        raise ValueError("Life Skill controller state inventory changed")
    if controllers["score"]["name"] != "ScoreUpGauge" or len(controllers["score"]["states"]) != 1:
        raise ValueError("Score Skill controller state inventory changed")
    if controllers["judge"]["name"] != "judgeLineAdjustSkillEffect" or len(controllers["judge"]["states"]) != 1:
        raise ValueError("Judge Skill controller state inventory changed")
    return {
        "schema_version": 1,
        "status": "confirmed-current-static-skill-animation-assets-runtime-assignment-open",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "unity_version": UNITY_VERSION,
        },
        "decoder": {
            "path": COMBO_ANIMATION_EXTRACTOR.relative_to(ROOT).as_posix(),
            "bytes": COMBO_ANIMATION_EXTRACTOR.stat().st_size,
            "sha256": digest(COMBO_ANIMATION_EXTRACTOR),
            "coefficient_formula": "c0*dt^3 + c1*dt^2 + c2*dt + c3",
        },
        "controllers": controllers,
        "clips": clips,
        "scene_life_animator": {
            "path_id": 886,
            "serialized_controller": {"file_id": 0, "path_id": 0},
            "runtime_assignment_status": "evidence-required",
        },
        "unknown_fields": [],
        "blocking_findings": [
            "the active runtime assignment for scene Life Animator 886 is not statically present",
            "PlayerLoop sampling phase and final rendered pixels remain runtime-required",
        ],
    }


def main() -> int:
    contract = build_contract()
    (HERE / "resource_pixi_rendering_skill_animation_profiles.json").write_text(
        json.dumps(contract, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"Skill animations: controllers={len(contract['controllers'])} clips={len(contract['clips'])} "
        f"life_assignment={contract['scene_life_animator']['runtime_assignment_status']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
