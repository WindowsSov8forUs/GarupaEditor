from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import UnityPy

from scan_cached_bpm_candidates import UNITY_VERSION, parse_bms, script_bytes


def digest(data: bytes) -> str:
    return sha256(data).hexdigest().upper()


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract one exact BMS TextAsset from a cached musicscore bundle.")
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--bundle-name", required=True)
    parser.add_argument("--asset-name", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata-output", type=Path, required=True)
    args = parser.parse_args()

    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    environment = UnityPy.load(str(args.bundle))
    matches: list[bytes] = []
    for obj in environment.objects:
        if obj.type.name != "TextAsset":
            continue
        asset = obj.read()
        if asset.m_Name == args.asset_name:
            matches.append(script_bytes(asset.m_Script))
    if len(matches) != 1:
        raise ValueError(f"expected one TextAsset named {args.asset_name}, found {len(matches)}")

    data = matches[0]
    parsed = parse_bms(args.asset_name, data)
    if parsed is None:
        raise ValueError(f"selected asset has no nonzero CC03/CC08 command: {args.asset_name}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data)
    metadata = {
        "schema_version": 1,
        "source": "connected-device-cached-unity-text-asset",
        "bundle_name": args.bundle_name,
        "bundle_file": args.bundle.name,
        "bundle_bytes": args.bundle.stat().st_size,
        "bundle_sha256": digest(args.bundle.read_bytes()),
        "unity_version_fallback": UNITY_VERSION,
        "asset": parsed,
    }
    args.metadata_output.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"extracted BMS: asset={args.asset_name}, bytes={len(data)}, sha256={digest(data)}, commands={len(parsed['commands'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
