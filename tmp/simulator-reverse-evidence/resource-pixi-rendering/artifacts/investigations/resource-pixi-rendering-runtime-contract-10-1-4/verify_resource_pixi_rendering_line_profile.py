#!/usr/bin/env python3
"""Verify the current NoteSyncLine serialized/R2 portable profile."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROFILE = HERE / "resource_pixi_rendering_line_profile.json"
BUILDER = HERE / "build_resource_pixi_rendering_line_profile.py"
APK = ROOT / "samples" / "jp.co.craftegg.band" / "10.1.4_230" / "original" / "base.apk"
TRACE = HERE / "runtime" / "ordinary-rendering-geometry-r2.trace.json.gz"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def main() -> int:
    before = PROFILE.read_bytes()
    subprocess.run([sys.executable, str(BUILDER)], cwd=ROOT, check=True, capture_output=True)
    require(PROFILE.read_bytes() == before, "line profile builder is not byte-idempotent")
    data = json.loads(before)
    require(data["schema_version"] == 1 and data["status"] == "confirmed-current-note-sync-line-portable-profile", "line profile status differs")
    require(data["sample"] == {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}, "line profile sample differs")
    source = data["source"]
    require(source["geometry_r2_sha256"] == digest(TRACE), "line profile R2 hash differs")
    if APK.exists():
        require(source["base_apk_sha256"] == digest(APK), "line profile APK hash differs")
    line = data["serialized_line"]
    require(line["position_count"] == 2 and line["num_corner_vertices"] == 0 and line["num_cap_vertices"] == 0, "line primitive shape differs")
    require(line["alignment_name"] == "View" and line["texture_mode_name"] == "Stretch" and line["use_world_space"] is True and line["loop"] is False, "line rendering mode differs")
    require(line["mask_interaction"] == 0 and line["generate_lighting_data"] is False, "line mask/lighting boundary differs")
    require(line["width_curve"][0]["value"] == line["width_curve"][1]["value"] == 0.2800000011920929, "line width curve differs")
    require(data["material"]["name"] == "SyncNoteLine" and data["material"]["serialized_threshold"] == 750.0, "line material differs")
    runtime = data["runtime_r2"]
    require(runtime == {"endpoint_writes": 24470, "width_writes": 12235, "line_owners": 80, "equal_start_end_width": True, "zero_width_writes": 482, "nonzero_width_writes": 11753}, "line R2 summary differs")
    mapping = data["portable_mapping"]
    require(mapping["primitive"] == "camera-facing textured quad" and mapping["cap"] == "butt" and mapping["indices"] == [0, 1, 2, 0, 2, 3] and mapping["gpu_raster_parity"] is False, "line portable mapping differs")
    require(data["unknown_fields"] == [], "line profile contains unknown fields")
    print("verified current sync-line profile: endpoints=24470 widths=12235 owners=80")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
