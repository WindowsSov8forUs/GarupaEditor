from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any

import UnityPy


UNITY_VERSION = "2022.3.62f1"
MUSIC_BAR_DIVISION_COUNT = 192
CATALOG_ENTRY = re.compile(
    rb"(musicscore/musicscore[0-9A-Za-z_-]+)[\x00-\xff]{0,120}?([0-9a-f]{64})"
)
HEADER_BPM = re.compile(r"^#BPM\s+([^\s]+)\s*$")
EXTENDED_BPM = re.compile(r"^#BPM([0-9A-Z]{2})\s+([^\s]+)\s*$")
BPM_CHANNEL = re.compile(r"^#([0-9]{3})(03|08):([0-9A-Z]+)\s*$")


def digest(data: bytes) -> str:
    return sha256(data).hexdigest().upper()


def parse_catalog(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    for match in CATALOG_ENTRY.finditer(path.read_bytes()):
        name = match.group(1).decode("ascii")
        entries.setdefault(name, match.group(2).decode("ascii"))
    if not entries:
        raise ValueError("no musicscore entries found in AssetBundleInfo")
    return entries


def script_bytes(value: Any) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        return value.encode("utf-8", errors="surrogateescape")
    raise TypeError(f"unsupported TextAsset script type: {type(value).__name__}")


def parse_bms(name: str, data: bytes) -> dict[str, Any] | None:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    if not any(line.startswith("#PLAYER") for line in text.splitlines()):
        return None

    start_bpm_string: str | None = None
    extended: dict[str, str] = {}
    channel_lines: list[tuple[int, str, str]] = []
    for line in text.splitlines():
        if match := HEADER_BPM.fullmatch(line):
            start_bpm_string = match.group(1)
        elif match := EXTENDED_BPM.fullmatch(line):
            extended[match.group(1)] = match.group(2)
        elif match := BPM_CHANNEL.fullmatch(line):
            channel_lines.append((int(match.group(1)), match.group(2), match.group(3)))

    commands: list[dict[str, Any]] = []
    for bar_index, channel, payload in channel_lines:
        if len(payload) % 2 != 0:
            raise ValueError(f"odd BPM channel payload in {name}: {payload}")
        cells = [payload[index : index + 2] for index in range(0, len(payload), 2)]
        for numerator, cell in enumerate(cells):
            if cell == "00":
                continue
            if channel == "03":
                bpm_string = str(int(cell, 16))
                bpm = float(int(cell, 16))
            else:
                if cell not in extended:
                    raise ValueError(f"unresolved #BPM{cell} in {name}")
                bpm_string = extended[cell]
                bpm = float(bpm_string)
            commands.append(
                {
                    "cc_num": int(channel),
                    "bar_index": bar_index,
                    "numerator": numerator,
                    "denominator": len(cells),
                    "absolute_pos": bar_index * MUSIC_BAR_DIVISION_COUNT
                    + MUSIC_BAR_DIVISION_COUNT * numerator // len(cells),
                    "cell": cell,
                    "bpm": bpm,
                    "bpm_string": bpm_string,
                }
            )

    return {
        "asset_name": name,
        "bytes": len(data),
        "sha256": digest(data),
        "start_bpm": float(start_bpm_string) if start_bpm_string is not None else None,
        "start_bpm_string": start_bpm_string,
        "commands": commands,
    }


def scan_bundle(bundle_path: Path) -> list[dict[str, Any]]:
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    environment = UnityPy.load(str(bundle_path))
    candidates: list[dict[str, Any]] = []
    for obj in environment.objects:
        if obj.type.name != "TextAsset":
            continue
        asset = obj.read()
        candidate = parse_bms(asset.m_Name, script_bytes(asset.m_Script))
        if candidate is not None:
            candidates.append(candidate)
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scan frozen device musicscore bundles for production CC03/CC08 BMS assets."
    )
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    catalog = parse_catalog(args.catalog)
    candidates: list[dict[str, Any]] = []
    bms_asset_count = 0
    scanned_bundles = 0
    for bundle_name, bundle_hash in sorted(catalog.items()):
        bundle_path = args.cache_dir / bundle_hash
        if not bundle_path.is_file():
            raise FileNotFoundError(f"missing cached bundle: {bundle_name} {bundle_hash}")
        scanned_bundles += 1
        for candidate in scan_bundle(bundle_path):
            bms_asset_count += 1
            candidate["bundle_name"] = bundle_name
            candidate["bundle_hash"] = bundle_hash
            candidate["bundle_bytes"] = bundle_path.stat().st_size
            candidate["bundle_sha256"] = digest(bundle_path.read_bytes())
            if candidate["commands"]:
                candidates.append(candidate)

    command_counts = [len(candidate["commands"]) for candidate in candidates]
    max_command_count = max(command_counts, default=0)
    histogram = {
        str(count): command_counts.count(count)
        for count in sorted(set(command_counts))
    }

    result = {
        "schema_version": 1,
        "unity_version_fallback": UNITY_VERSION,
        "catalog_bytes": args.catalog.stat().st_size,
        "catalog_sha256": digest(args.catalog.read_bytes()),
        "scanned_bundles": scanned_bundles,
        "bms_asset_count": bms_asset_count,
        "candidate_count": len(candidates),
        "zero_command_bms_count": bms_asset_count - len(candidates),
        "max_command_count": max_command_count,
        "charts_at_max_command_count": sum(
            count == max_command_count for count in command_counts
        ),
        "command_count_histogram_nonzero": histogram,
        "candidates": sorted(
            candidates,
            key=lambda item: (item["bundle_name"], item["asset_name"]),
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"clock scheduling BPM candidates: bundles={scanned_bundles}, candidates={len(candidates)}, output={args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
