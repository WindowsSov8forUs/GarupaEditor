#!/usr/bin/env python3
"""Extract current Flick icon and Long Note flash animation assets."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA_ROOT = ROOT / "tmp/resource-pixi-rendering-10.1.4_230/apk/assets/bin/Data"
DECODER_PATH = ROOT / "artifacts/investigations/hud-combo-animation/extract_hud_combo_animation.py"
CONTROLLER_HELPER_PATH = HERE / "extract_resource_pixi_rendering_skill_animation_profiles.py"
CLIPS = {
    "flick": "4f97156f3acb94254b712a6f344bb70a",
    "flick_left": "1267bcc008c8c4a0f92e3daa88a3e0da",
    "flick_right": "632107fe0b2d54e6bb8e8963fcdfbc3d",
    "long_note_flash": "95f0af48f261544f592b8e7a0c552354",
}
CONTROLLERS = {
    "flick": "904e88ad5e7a542e2ae909f5f5196af4",
    "long_note_flash": "e5add3bae99374db5916f81a28c73c0c",
}


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def build_contract() -> dict[str, Any]:
    decoder = load_module("current_note_animation_decoder", DECODER_PATH)
    decoder.DATA_ROOT = DATA_ROOT

    def note_binding_channels(binding: dict[str, Any], paths: dict[int, str]) -> list[str]:
        path = paths.get(binding["path"], f"path_hash:{binding['path']}")
        prefix = f"{path}." if path else ""
        if binding["typeID"] == 4 and binding["attribute"] in {1, 3, 4}:
            attribute = {1: "m_LocalPosition", 3: "m_LocalScale", 4: "localEulerAnglesRaw"}[binding["attribute"]]
            return [f"{prefix}{attribute}.{axis}" for axis in "xyz"]
        attribute = decoder.ATTRIBUTE_NAMES.get(binding["attribute"], f"attribute_hash:{binding['attribute']}")
        return [f"{prefix}{attribute}"]

    decoder.binding_channels = note_binding_channels
    controller_helper = load_module("current_note_controller_helper", CONTROLLER_HELPER_PATH)
    controller_helper.DATA_ROOT = DATA_ROOT
    clips = {}
    for label, external in CLIPS.items():
        profile = decoder.clip_profile(external, {})
        profile["path"] = "base.apk!/assets/bin/Data/" + external
        profile["sha256"] = profile["sha256"].upper()
        clips[label] = profile
    controllers = {
        label: controller_helper.controller_profile(external)
        for label, external in CONTROLLERS.items()
    }
    expected_names = {
        "flick": "FlickNoteIcon",
        "flick_left": "FlickNoteIconLeft",
        "flick_right": "FlickNoteIconRight",
        "long_note_flash": "LongNoteFlash",
    }
    for label, expected_name in expected_names.items():
        if clips[label]["name"] != expected_name or clips[label]["sample_rate"] != 60.0 or clips[label]["events"]:
            raise ValueError(f"current Note animation identity changed: {label}")
    return {
        "schema_version": 1,
        "status": "confirmed-current-static-note-animation-assets-runtime-phase-open",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
        },
        "decoder": {
            "path": DECODER_PATH.relative_to(ROOT).as_posix(),
            "sha256": digest(DECODER_PATH),
        },
        "controllers": controllers,
        "clips": clips,
        "unknown_fields": [],
        "blocking_findings": [
            "runtime Animator phase, restart and pause sampling remain unobserved",
            "final SpriteRenderer and GPU output remain runtime-required",
        ],
    }


def main() -> int:
    contract = build_contract()
    (HERE / "resource_pixi_rendering_note_animation_profiles.json").write_text(
        json.dumps(contract, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"Note animations: controllers={len(contract['controllers'])} clips={len(contract['clips'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
