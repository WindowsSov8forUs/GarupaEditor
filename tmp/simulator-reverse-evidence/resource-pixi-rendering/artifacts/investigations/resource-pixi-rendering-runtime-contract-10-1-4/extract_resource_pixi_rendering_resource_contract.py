#!/usr/bin/env python3
"""Extract the 10.1.4 resource catalog, skin bundles and bounded Unity assets."""

from __future__ import annotations

from collections import Counter
import csv
import hashlib
import json
import math
from pathlib import Path
import struct
from typing import Any, Iterator
import warnings

import UnityPy


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WORK = ROOT / "tmp/resource-pixi-rendering-10.1.4_230"
DATA_ROOT = WORK / "apk/assets/bin/Data"
CACHE_INDEX = WORK / "device/AssetBundleInfo"
CACHE_ROOT = WORK / "device/ingameskin-bundles"
TARGET_BASE_APK = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/original/base.apk"
TARGET_BINARY = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so"
TARGET_METADATA = ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/global-metadata.dat"
TARGET_DUMP = ROOT / "static/il2cpp/dump-10.1.4_230"
UNITY_VERSION = "2022.3.62f1"
UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
warnings.filterwarnings("ignore", category=Warning, module=r"UnityPy\..*")

EXPECTED = {
    "base_apk_sha256": "D3A6005BB1F7341E39016521390DCEB987E56A0E5D16B6BA73568837A3026413",
    "libil2cpp_sha256": "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F",
    "global_metadata_sha256": "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F",
    "asset_bundle_info_sha256": "D026CAE3740DB87AA777C2FDAE40B141FF16464BC2C839ACEF3C820E06850AC6",
}

RESOURCE_PREFIXES = (
    "atlas/bms/",
    "fonts/score/",
    "materials/bms/",
    "prefabs/bms/notes/",
    "prefabs/bms/addscoreobject/",
    "prefabs/bms/judgement/",
    "prefabs/bms/rhythmgamegauge/",
)
RESOURCE_EXACT = {
    "animation/rhythmgame/combo_number",
    "animation/rhythmgame/combonumber",
    "animation/rhythmgame/gamejudge",
}
RESOURCE_ANIMATION_PREFIXES = (
    "animation/rhythmgame/allperfect/",
    "animation/rhythmgame/allperfectandmedleyfullcombo/",
    "animation/rhythmgame/note/",
    "animation/rhythmgame/scoregauge/",
    "animation/rhythmgame/skilleffect/",
)


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def normalize_json_value(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return {
            "float_special": "positive-infinity" if value > 0 else "negative-infinity" if value < 0 else "nan",
            "ieee754_binary32": struct.pack(">f", value).hex().upper(),
        }
    if isinstance(value, dict):
        return {key: normalize_json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, tuple):
        return [normalize_json_value(item) for item in value]
    return value


def read_varint(data: bytes, position: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if position >= len(data) or shift >= 70:
            raise ValueError("invalid protobuf varint")
        byte = data[position]
        position += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, position
        shift += 7


def protobuf_fields(data: bytes) -> Iterator[tuple[int, int, int | bytes, int, int]]:
    position = 0
    while position < len(data):
        start = position
        key, position = read_varint(data, position)
        number = key >> 3
        wire_type = key & 7
        if wire_type == 0:
            value, position = read_varint(data, position)
        elif wire_type == 1:
            value = data[position:position + 8]
            position += 8
        elif wire_type == 2:
            length, position = read_varint(data, position)
            value = data[position:position + length]
            position += length
        elif wire_type == 5:
            value = data[position:position + 4]
            position += 4
        else:
            raise ValueError(f"unsupported protobuf wire type: {wire_type}")
        if position > len(data):
            raise ValueError("truncated protobuf field")
        yield number, wire_type, value, start, position


def parse_cache_index() -> tuple[str, list[dict[str, Any]]]:
    data = CACHE_INDEX.read_bytes()
    version: str | None = None
    rows: list[dict[str, Any]] = []
    for number, wire_type, value, start, end in protobuf_fields(data):
        if number == 1 and wire_type == 2 and isinstance(value, bytes):
            version = value.decode("utf-8")
            continue
        if number != 2 or wire_type != 2 or not isinstance(value, bytes):
            continue
        outer = {field_number: field_value for field_number, _, field_value, _, _ in protobuf_fields(value)}
        name_value = outer.get(1)
        info_value = outer.get(2)
        if not isinstance(name_value, bytes) or not isinstance(info_value, bytes):
            continue
        info = {field_number: field_value for field_number, _, field_value, _, _ in protobuf_fields(info_value)}

        def text(field_number: int) -> str:
            field_value = info.get(field_number)
            if not isinstance(field_value, bytes):
                raise ValueError(f"cache field {field_number} is not bytes")
            return field_value.decode("utf-8")

        name = name_value.decode("utf-8")
        if text(1) != name:
            raise ValueError(f"cache record name mismatch: {name}")
        rows.append({
            "bundle_name": name,
            "cache_file": text(2),
            "resource_version": text(3),
            "download_timing": text(4),
            "checksum_u32": info.get(5),
            "bundle_bytes": info.get(7),
            "record_start": start,
            "record_end": end,
            "record_sha256": digest_bytes(data[start:end]),
        })
    if version is None:
        raise ValueError("AssetBundleInfo has no version")
    if len(rows) != len({row["bundle_name"] for row in rows}):
        raise ValueError("AssetBundleInfo has duplicate bundle names")
    return version, rows


def plain(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return {"bytes": len(value), "sha256": digest_bytes(value)}
    if isinstance(value, dict):
        return {str(key): plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    if hasattr(value, "items"):
        return {str(key): plain(item) for key, item in value.items()}
    return str(value)


def texture_profile(obj: Any) -> dict[str, Any]:
    tree = obj.read_typetree()
    texture = obj.read()
    profile: dict[str, Any] = {
        "path_id": obj.path_id,
        "serialized_bytes": len(obj.get_raw_data()),
        "serialized_sha256": digest_bytes(obj.get_raw_data()),
        "name": tree["m_Name"],
        "width": tree["m_Width"],
        "height": tree["m_Height"],
        "texture_format": tree["m_TextureFormat"],
        "mip_count": tree["m_MipCount"],
        "color_space": tree["m_ColorSpace"],
        "complete_image_size": tree["m_CompleteImageSize"],
        "texture_settings": plain(tree["m_TextureSettings"]),
    }
    image = texture.image.convert("RGBA")
    profile["rgba_bytes"] = len(image.tobytes())
    profile["rgba_sha256"] = digest_bytes(image.tobytes())
    return profile


def sprite_profile(obj: Any) -> dict[str, Any]:
    tree = obj.read_typetree()
    render_data = tree["m_RD"]
    selected_render_data = {
        key: plain(render_data[key])
        for key in (
            "texture", "alphaTexture", "textureRect", "textureRectOffset", "atlasRectOffset",
            "settingsRaw", "uvTransform", "downscaleMultiplier",
        )
        if key in render_data
    }
    return {
        "path_id": obj.path_id,
        "serialized_bytes": len(obj.get_raw_data()),
        "serialized_sha256": digest_bytes(obj.get_raw_data()),
        "name": tree["m_Name"],
        "rect": plain(tree["m_Rect"]),
        "offset": plain(tree["m_Offset"]),
        "border": plain(tree["m_Border"]),
        "pivot": plain(tree["m_Pivot"]),
        "pixels_to_units": tree["m_PixelsToUnits"],
        "extrude": tree["m_Extrude"],
        "is_polygon": tree["m_IsPolygon"],
        "render_data_key": plain(tree["m_RenderDataKey"]),
        "render_data": selected_render_data,
    }


def material_profile(obj: Any) -> dict[str, Any]:
    tree = obj.read_typetree()
    return {
        "path_id": obj.path_id,
        "serialized_bytes": len(obj.get_raw_data()),
        "serialized_sha256": digest_bytes(obj.get_raw_data()),
        "name": tree["m_Name"],
        "shader": plain(tree["m_Shader"]),
        "valid_keywords": plain(tree.get("m_ValidKeywords", [])),
        "invalid_keywords": plain(tree.get("m_InvalidKeywords", [])),
        "custom_render_queue": tree["m_CustomRenderQueue"],
        "saved_properties": plain(tree["m_SavedProperties"]),
    }


def object_identity_profile(obj: Any) -> dict[str, Any]:
    tree = obj.read_typetree()
    common = {
        "path_id": obj.path_id,
        "type": obj.type.name,
        "serialized_bytes": len(obj.get_raw_data()),
        "serialized_sha256": digest_bytes(obj.get_raw_data()),
    }
    selected: dict[str, Any] = {}
    for key in (
        "m_Name", "m_IsActive", "m_Layer", "m_TagString", "m_Component", "m_GameObject",
        "m_Father", "m_Children", "m_LocalPosition", "m_LocalRotation", "m_LocalScale",
        "m_Enabled", "m_Materials", "m_SortingLayerID", "m_SortingLayer", "m_SortingOrder",
        "m_Sprite", "m_MaskInteraction", "m_Controller", "m_Avatar", "m_ApplyRootMotion",
        "m_CullingMode", "m_UpdateMode", "m_Mesh",
    ):
        if key in tree:
            selected[key] = plain(tree[key])
    common["fields"] = selected
    return common


def bundle_profile(row: dict[str, Any]) -> dict[str, Any]:
    path = CACHE_ROOT / row["cache_file"]
    if not path.is_file() or path.stat().st_size != row["bundle_bytes"]:
        raise ValueError(f"missing or wrong-size cached bundle: {row['bundle_name']}")
    environment = UnityPy.load(str(path))
    objects = list(environment.objects)
    asset_bundle = next(obj for obj in objects if obj.type.name == "AssetBundle")
    bundle_tree = asset_bundle.read_typetree()
    if bundle_tree["m_AssetBundleName"] != row["bundle_name"]:
        raise ValueError(f"serialized bundle name mismatch: {row['bundle_name']}")
    textures = sorted((texture_profile(obj) for obj in objects if obj.type.name == "Texture2D"), key=lambda item: item["path_id"])
    sprites = sorted((sprite_profile(obj) for obj in objects if obj.type.name == "Sprite"), key=lambda item: (item["name"], item["path_id"]))
    materials = sorted((material_profile(obj) for obj in objects if obj.type.name == "Material"), key=lambda item: item["path_id"])
    ngui_atlases = []
    for obj in objects:
        if obj.type.name != "MonoBehaviour":
            continue
        tree = obj.read_typetree()
        if "mSprites" not in tree or "mPixelSize" not in tree:
            continue
        ngui_atlases.append({
            "path_id": obj.path_id,
            "serialized_bytes": len(obj.get_raw_data()),
            "serialized_sha256": digest_bytes(obj.get_raw_data()),
            "name": tree["m_Name"],
            "material": plain(tree["material"]),
            "pixel_size": tree["mPixelSize"],
            "sprites": plain(tree["mSprites"]),
        })
    family_counts: dict[str, int] = {}
    for sprite in sprites:
        family = sprite["name"].split("_", 2)
        key = "_".join(family[:2]) if len(family) >= 2 else sprite["name"]
        family_counts[key] = family_counts.get(key, 0) + 1
    return {
        "bundle_name": row["bundle_name"],
        "cache_file": row["cache_file"],
        "download_timing": row["download_timing"],
        "index_bundle_bytes": row["bundle_bytes"],
        "bundle_bytes": path.stat().st_size,
        "bundle_sha256": digest(path),
        "record_sha256": row["record_sha256"],
        "asset_bundle_path_id": asset_bundle.path_id,
        "container": [
            {
                "asset_path": asset_path,
                "preload_index": entry["preloadIndex"],
                "preload_size": entry["preloadSize"],
                "asset": plain(entry["asset"]),
            }
            for asset_path, entry in bundle_tree["m_Container"]
        ],
        "object_counts": dict(sorted(Counter(obj.type.name for obj in objects).items())),
        "textures": textures,
        "sprites": sprites,
        "sprite_family_counts": dict(sorted(family_counts.items())),
        "materials": materials,
        "ngui_atlases": sorted(ngui_atlases, key=lambda item: item["path_id"]),
    }


def selected_resource(path: str) -> bool:
    return (
        path in RESOURCE_EXACT
        or path.startswith(RESOURCE_PREFIXES)
        or path.startswith(RESOURCE_ANIMATION_PREFIXES)
    )


def selected_base_resources() -> list[dict[str, Any]]:
    environment = UnityPy.load(str(DATA_ROOT / "globalgamemanagers"))
    manager = next(obj for obj in environment.objects if obj.type.name == "ResourceManager")
    tree = manager.read_typetree()
    externals = [external.path for external in manager.assets_file.externals]
    rows: list[dict[str, Any]] = []
    file_cache: dict[str, dict[str, Any]] = {}
    for resource_path, pointer in tree["m_Container"]:
        if not selected_resource(resource_path):
            continue
        if pointer["m_FileID"] == 0:
            raise ValueError(f"selected resource unexpectedly local to globalgamemanagers: {resource_path}")
        external = externals[pointer["m_FileID"] - 1]
        path = DATA_ROOT / external
        if external not in file_cache:
            asset = UnityPy.load(str(path))
            objects = list(asset.objects)
            detailed = [
                object_identity_profile(obj)
                for obj in objects
                if obj.type.name in {
                    "GameObject", "Transform", "SpriteRenderer", "MeshRenderer", "MeshFilter", "Animator"
                }
            ]
            materials = [material_profile(obj) for obj in objects if obj.type.name == "Material"]
            file_cache[external] = {
                "external": external,
                "bytes": path.stat().st_size,
                "sha256": digest(path),
                "object_counts": dict(sorted(Counter(obj.type.name for obj in objects).items())),
                "visible_object_graph": sorted(detailed, key=lambda item: (item["type"], item["path_id"])),
                "materials": sorted(materials, key=lambda item: item["path_id"]),
            }
        rows.append({
            "resource_path": resource_path,
            "file_id": pointer["m_FileID"],
            "path_id": pointer["m_PathID"],
            "file": file_cache[external],
        })
    return sorted(rows, key=lambda item: (item["resource_path"], item["file_id"], item["path_id"]))


def script_strings() -> list[dict[str, Any]]:
    script = json.loads((TARGET_DUMP / "script.json").read_text(encoding="utf-8"))
    return sorted(
        ({"address": f"0x{int(row['Address']):X}", "value": row["Value"]} for row in script["ScriptString"] if "habahiro" in row["Value"].lower()),
        key=lambda item: item["address"],
    )


def build_contract() -> dict[str, Any]:
    for path in (DATA_ROOT / "globalgamemanagers", CACHE_INDEX, CACHE_ROOT, TARGET_BASE_APK, TARGET_BINARY, TARGET_METADATA, TARGET_DUMP / "script.json"):
        if not path.exists():
            raise FileNotFoundError(path)
    if digest(TARGET_BASE_APK) != EXPECTED["base_apk_sha256"]:
        raise ValueError("base APK identity mismatch")
    if digest(TARGET_BINARY) != EXPECTED["libil2cpp_sha256"]:
        raise ValueError("libil2cpp identity mismatch")
    if digest(TARGET_METADATA) != EXPECTED["global_metadata_sha256"]:
        raise ValueError("metadata identity mismatch")
    if digest(CACHE_INDEX) != EXPECTED["asset_bundle_info_sha256"]:
        raise ValueError("AssetBundleInfo identity mismatch")

    resource_version, cache_rows = parse_cache_index()
    ingameskin_rows = sorted((row for row in cache_rows if row["bundle_name"].startswith("ingameskin/")), key=lambda row: row["bundle_name"])
    if len(ingameskin_rows) != 57:
        raise ValueError(f"expected 57 ingameskin records, got {len(ingameskin_rows)}")
    bundle_names = {row["bundle_name"] for row in cache_rows}
    habahiro_candidates = sorted(name for name in bundle_names if "habahiro" in name.lower())
    profiles = [bundle_profile(row) for row in ingameskin_rows]
    base_resources = selected_base_resources()
    return normalize_json_value({
        "schema_version": 1,
        "status": "confirmed-current-r0-resource-and-static-unity-assets-runtime-gate-open",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "unity_version": UNITY_VERSION,
            **EXPECTED,
        },
        "capability": {
            "level": "R0-local-static-and-device-cache-read",
            "game_process_started": False,
            "server_contacted": False,
            "frida_used": False,
            "return_replacement": False,
            "memory_writes": False,
            "apk_modification": False,
            "managed_invocation": False,
        },
        "asset_bundle_info": {
            "device_path": "/sdcard/Android/data/jp.co.craftegg.band/files/data/AssetBundleInfo",
            "bytes": CACHE_INDEX.stat().st_size,
            "sha256": digest(CACHE_INDEX),
            "resource_version": resource_version,
            "record_count": len(cache_rows),
            "ingameskin_record_count": len(ingameskin_rows),
        },
        "ingameskin_bundles": profiles,
        "selected_base_resources": base_resources,
        "habahiro_route": {
            "script_strings": script_strings(),
            "setup_method": "NoteManager.setupNoteSkin @ 0x3774C74",
            "suffix_getter": "AssetBundleNames.get_HabahiroBundleName @ 0x331C6FC",
            "name_builder": "AssetBundleNames.GetInGameSkinNoteSkinBundleName @ 0x3328D34",
            "cache_index_candidates": habahiro_candidates,
            "resource_bytes_status": "evidence-required-current-bundle-absent-from-cache-index",
        },
        "distribution": {
            "original_binary_assets_committed": False,
            "committed_surface": "metadata, hashes, object identities, atlas rows and decoded RGBA hashes only",
            "runtime_network_allowed": False,
            "portable_provider_policy_status": "open",
        },
        "unknown_fields": [],
        "blocking_findings": [
            "the current AssetBundleInfo contains no HABAHIRO bundle record",
            "the naturally selected Note/Directional/Field/Judge skin profile remains runtime-required",
            "scene-to-runtime object identity and command order remain runtime-required",
        ],
    })


def write_inventory(contract: dict[str, Any]) -> None:
    with (HERE / "resource_inventory.tsv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        writer.writerow(("kind", "logical_name", "bytes", "sha256", "objects", "status"))
        for bundle in contract["ingameskin_bundles"]:
            writer.writerow((
                "cached-bundle", bundle["bundle_name"], bundle["bundle_bytes"], bundle["bundle_sha256"],
                sum(bundle["object_counts"].values()), "confirmed-current-r0",
            ))
        seen: set[str] = set()
        for resource in contract["selected_base_resources"]:
            file_profile = resource["file"]
            if file_profile["external"] in seen:
                continue
            seen.add(file_profile["external"])
            writer.writerow((
                "base-apk-data", file_profile["external"], file_profile["bytes"], file_profile["sha256"],
                sum(file_profile["object_counts"].values()), "confirmed-current-static",
            ))
        writer.writerow(("required-resource", "ingameskin/noteskin/habahiro", "", "", "", "evidence-required"))


def main() -> int:
    contract = build_contract()
    (HERE / "resource_pixi_rendering_resource_contract.json").write_text(
        json.dumps(contract, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    write_inventory(contract)
    print(
        f"resource contract: cache={contract['asset_bundle_info']['record_count']} "
        f"ingameskin={len(contract['ingameskin_bundles'])} "
        f"base_resources={len(contract['selected_base_resources'])} "
        f"habahiro={contract['habahiro_route']['resource_bytes_status']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
