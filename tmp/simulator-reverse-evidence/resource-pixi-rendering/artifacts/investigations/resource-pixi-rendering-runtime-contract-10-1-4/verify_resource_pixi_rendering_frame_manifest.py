#!/usr/bin/env python3
"""Verify a future physical-device rendering frame manifest; absent frames never pass."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
from typing import Any


HERE = Path(__file__).resolve().parent
PLAN_PATH = HERE / "runtime/resource-pixi-rendering-frame-plan.json"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def strict_json(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def png_dimensions(data: bytes) -> tuple[int, int]:
    require(len(data) >= 24 and data[:8] == PNG_SIGNATURE and data[12:16] == b"IHDR", "invalid PNG/IHDR")
    return struct.unpack(">II", data[16:24])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    require(args.manifest.is_file(), f"frame manifest is absent: {args.manifest}")
    plan = strict_json(PLAN_PATH)
    manifest = strict_json(args.manifest)
    require(set(manifest) == set(plan["manifest_required_fields"]), "frame manifest fields mismatch")
    require(manifest["schema_version"] == 1 and manifest["status"] == "confirmed-physical-device-frame-manifest", "frame manifest status mismatch")
    require(manifest["sample"] == plan["sample"], "frame sample mismatch")
    require(manifest["viewport"] == plan["viewport"], "frame viewport mismatch")
    privacy = manifest["privacy"]
    require(all(privacy.get(key) is False for key in ["account_room_member_card_skill_identity_visible", "display_strings_visible", "raw_pointer_metadata"]), "frame privacy mismatch")
    require(privacy.get("approved_playfield_hud_crop_only") is True and privacy.get("manual_review_complete") is True, "frame privacy review mismatch")
    frames = manifest["frames"]
    expected = {(scenario, anchor) for scenario, anchors in plan["scenarios"].items() for anchor in anchors}
    require(isinstance(frames, list) and len(frames) == len(expected), "frame count mismatch")
    require({(row.get("scenario"), row.get("anchor")) for row in frames} == expected, "frame anchor set mismatch")
    required_fields = set(plan["frame_required_fields"])
    seen_paths: set[str] = set()
    for row in frames:
        require(set(row) == required_fields, f"frame fields mismatch: {row.get('scenario')}/{row.get('anchor')}")
        require(isinstance(row["event_sequence"], int) and row["event_sequence"] >= 0, "frame event sequence mismatch")
        relative_path = row["relative_path"]
        require(isinstance(relative_path, str) and relative_path.endswith(".png") and ".." not in Path(relative_path).parts, "frame path mismatch")
        require(relative_path not in seen_paths, "duplicate frame path")
        seen_paths.add(relative_path)
        path = args.manifest.parent / relative_path
        require(path.is_file(), f"frame file is absent: {path}")
        data = path.read_bytes()
        require(len(data) == row["bytes"] and hashlib.sha256(data).hexdigest().upper() == row["sha256"], f"frame bytes/hash mismatch: {relative_path}")
        width, height = png_dimensions(data)
        require((width, height) == (row["width"], row["height"]), f"frame PNG dimensions mismatch: {relative_path}")
        require(width <= plan["viewport"]["width"] and height <= plan["viewport"]["height"] and width > 0 and height > 0, f"frame crop dimensions mismatch: {relative_path}")
        require(row["crop"] == "playfield-and-approved-HUD-only", f"frame crop label mismatch: {relative_path}")
    print(f"verified rendering frame manifest: frames={len(frames)} ordinary=7 habahiro=6 privacy=closed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
