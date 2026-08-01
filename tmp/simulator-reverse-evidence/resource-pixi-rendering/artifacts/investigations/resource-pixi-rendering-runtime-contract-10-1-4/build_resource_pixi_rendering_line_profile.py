#!/usr/bin/env python3
"""Derive the current 10.1.4 NoteSyncLine portable profile from locked APK bytes and R2."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
import zipfile

import UnityPy


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
APK = ROOT / "samples" / "jp.co.craftegg.band" / "10.1.4_230" / "original" / "base.apk"
PREFAB_ENTRY = "assets/bin/Data/c2d3a5135fefe421b9894cd5dee91284"
MATERIAL_ENTRY = "assets/bin/Data/3f60f90d3b06d4b45b1c82db0745afd3"
TRACE = HERE / "runtime" / "ordinary-rendering-geometry-r2.trace.json.gz"
OUTPUT = HERE / "resource_pixi_rendering_line_profile.json"
SAMPLE = {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def digest(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def object_tree(data: bytes, type_name: str) -> dict:
    matches = [obj.read_typetree() for obj in UnityPy.load(data).objects if obj.type.name == type_name]
    if len(matches) != 1:
        raise ValueError(f"expected one {type_name}, got {len(matches)}")
    return matches[0]


def main() -> int:
    with zipfile.ZipFile(APK) as source:
        prefab_bytes = source.read(PREFAB_ENTRY)
        material_bytes = source.read(MATERIAL_ENTRY)
    if digest_bytes(prefab_bytes) != "632302305E81666F52D1FD8A03AC1FF9D5C03933E07191A6EE1B09AC30FCD198":
        raise ValueError("current NoteSyncLine prefab bytes differ")
    if digest_bytes(material_bytes) != "483CB2BC8D4A6B98762AA255789AFE88A316A94B16DE01B5FB4BE425AF680BC7":
        raise ValueError("current SyncNoteLine material bytes differ")
    line = object_tree(prefab_bytes, "LineRenderer")
    transform = object_tree(prefab_bytes, "Transform")
    material = object_tree(material_bytes, "Material")
    params = line["m_Parameters"]
    curve = params["widthCurve"]["m_Curve"]
    gradient = params["colorGradient"]
    with gzip.open(TRACE, "rt", encoding="utf-8") as source:
        trace = json.load(source)
    positions = [event for event in trace["events"] if event["setter_id"] == "RPS-006"]
    widths = [event for event in trace["events"] if event["setter_id"] == "RPS-007"]
    if len(positions) != 24470 or len(widths) != 12235:
        raise ValueError("R2 line setter counts differ")
    if not all(event["payload"]["start_width_f32_bits"] == event["payload"]["end_width_f32_bits"] for event in widths):
        raise ValueError("R2 line width is not equal-ended")
    tex_env = dict(material["m_SavedProperties"]["m_TexEnvs"])["_MainTex"]
    threshold = dict(material["m_SavedProperties"]["m_Floats"])["_Threshold"]
    document = {
        "schema_version": 1,
        "status": "confirmed-current-note-sync-line-portable-profile",
        "sample": SAMPLE,
        "source": {
            "base_apk_sha256": digest(APK),
            "prefab_entry": PREFAB_ENTRY,
            "prefab_bytes": len(prefab_bytes),
            "prefab_sha256": digest_bytes(prefab_bytes),
            "material_entry": MATERIAL_ENTRY,
            "material_bytes": len(material_bytes),
            "material_sha256": digest_bytes(material_bytes),
            "geometry_r2_path": "runtime/ordinary-rendering-geometry-r2.trace.json.gz",
            "geometry_r2_sha256": digest(TRACE),
        },
        "serialized_transform": {
            "local_position": transform["m_LocalPosition"],
            "local_rotation": transform["m_LocalRotation"],
            "local_scale": transform["m_LocalScale"],
        },
        "serialized_line": {
            "enabled": line["m_Enabled"],
            "position_count": len(line["m_Positions"]),
            "positions": line["m_Positions"],
            "width_multiplier": params["widthMultiplier"],
            "width_curve": curve,
            "width_curve_pre_infinity": params["widthCurve"]["m_PreInfinity"],
            "width_curve_post_infinity": params["widthCurve"]["m_PostInfinity"],
            "white_gradient": [gradient["key0"], gradient["key1"]],
            "num_color_keys": gradient["m_NumColorKeys"],
            "num_alpha_keys": gradient["m_NumAlphaKeys"],
            "num_corner_vertices": params["numCornerVertices"],
            "num_cap_vertices": params["numCapVertices"],
            "alignment": params["alignment"],
            "alignment_name": "View",
            "texture_mode": params["textureMode"],
            "texture_mode_name": "Stretch",
            "texture_scale": params["textureScale"],
            "generate_lighting_data": params["generateLightingData"],
            "mask_interaction": line["m_MaskInteraction"],
            "use_world_space": line["m_UseWorldSpace"],
            "loop": line["m_Loop"],
            "apply_active_color_space": line["m_ApplyActiveColorSpace"],
        },
        "material": {
            "name": material["m_Name"],
            "serialized_main_texture": tex_env["m_Texture"],
            "main_texture_scale": tex_env["m_Scale"],
            "main_texture_offset": tex_env["m_Offset"],
            "serialized_threshold": threshold,
            "runtime_texture_source": "NoteImageController.syncLineSprite simultaneous_line texture",
            "runtime_threshold_source": "R2 Material.SetFloat property 3453",
        },
        "runtime_r2": {
            "endpoint_writes": len(positions),
            "width_writes": len(widths),
            "line_owners": 80,
            "equal_start_end_width": True,
            "zero_width_writes": sum(event["payload"]["start_width_f32_bits"] == "00000000" for event in widths),
            "nonzero_width_writes": sum(event["payload"]["start_width_f32_bits"] != "00000000" for event in widths),
        },
        "portable_mapping": {
            "primitive": "camera-facing textured quad",
            "cap": "butt",
            "join": "none-for-single-segment",
            "uv": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            "indices": [0, 1, 2, 0, 2, 3],
            "width_source": "typed R2 equal start/end width",
            "texture_source": "exact locally hash-validated simultaneous_line image",
            "gpu_raster_parity": False,
        },
        "unknown_fields": [],
    }
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"built current sync-line profile: endpoints={len(positions)} widths={len(widths)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
