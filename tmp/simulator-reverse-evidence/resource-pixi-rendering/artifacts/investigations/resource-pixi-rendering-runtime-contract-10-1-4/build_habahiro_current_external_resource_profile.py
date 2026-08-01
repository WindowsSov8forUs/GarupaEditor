#!/usr/bin/env python3
"""Build the current Bestdori-backed portable HABAHIRO resource profile."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CACHE = ROOT / "tmp/resource-pixi-rendering-10.1.4_230/bestdori-habahiro-current"
HISTORICAL = ROOT / "artifacts/investigations/note-sprite-combination-lookup/habahiro_atlas_sources.json"
BINDINGS = ROOT / "artifacts/investigations/note-sprite-combination-lookup/habahiro_sprite_bindings.tsv"
OUTPUT = HERE / "habahiro_current_external_resource_profile.json"
BASE_URL = "https://bestdori.com/assets/jp/ingameskin/noteskin/habahiro_rip"
MASTER_PUBLISHED_UTC = "2026-03-31T15:00:00+00:00"
EXPLORER_LAST_MODIFIED = "Fri, 31 Jul 2026 09:26:07 GMT"
ASSET_LAST_MODIFIED_DATE = "Tue, 31 Mar 2026"
EXPECTED = {
    "explorer.json": (264, "7F257C8A8D3CE7DFE2922CC972A7B6A10B32DBABCC335AD2BC24D6B17B7CA363", "Fri, 31 Jul 2026 09:26:07 GMT"),
    "ingameskin-noteskin-habahiro.bundle": (10448, "E4F0D2A380DC217AFB3EAD8A601493D72ED7A2C84746B949C0FD1BC4B08A96C5", "Tue, 31 Mar 2026 13:56:47 GMT"),
    ".sprites": (1214567, "BEFD45C7D0702D4479365AFFD527DFB5D5FA263A8B58176EA7C5EA88B3740B6A", "Tue, 31 Mar 2026 13:56:47 GMT"),
    "RhythmGameSprites1.png": (505257, "BD949E997D85E58BE1E674E1115870E14C81369142CF85D6E73AF80CC0383656", "Tue, 31 Mar 2026 13:57:03 GMT"),
    "RhythmGameSprites16.png": (500135, "6FFE3A079FF03191F03A2A9CCA46B651DA1B3D4013D7E1556DD8D0C4E9E0A877", "Tue, 31 Mar 2026 13:57:14 GMT"),
    "RhythmGameSprites2.png": (438702, "F1319CE2143BA1DEBE7F2B5BB0B6208F134C6E0FF077D12C938D2CDA0B373894", "Tue, 31 Mar 2026 13:56:56 GMT"),
    "RhythmGameSprites3.png": (252911, "3193607C11352516393AFB0AE23144C575A92EB58B7D21349621F9F676823E97", "Tue, 31 Mar 2026 13:57:11 GMT"),
    "RhythmGameSprites4.png": (445320, "E1D7E6C8F11A70BB2B633DFD9DA5C6D6F36005A47875DF7D652123D8C626D12D", "Tue, 31 Mar 2026 13:57:08 GMT"),
    "RhythmGameSprites5.png": (443964, "CC4464CF02E143B37E9E01E87352ED30CDC90EDA9A4CB19D4E0AC38C2C69AD11", "Tue, 31 Mar 2026 13:56:52 GMT"),
    "longNoteLine.png": (3124, "DC28380A2110D07022C63F323499DEC597DE5A82924F81DFC19394909C97E26E", "Tue, 31 Mar 2026 13:56:47 GMT"),
    "longNoteLine2.png": (727, "845FE4E4FFC693B4C05526A765060E24E35E79A34CD9E4EA7F900104D4A9E397", "Tue, 31 Mar 2026 13:56:47 GMT"),
    "simultaneous_line.png": (408, "1C9F1D79986F609733810D1068A927D895D9DA2E6366C2C5D68C975CAEB1BD88", "Tue, 31 Mar 2026 13:56:47 GMT"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def png_size(data: bytes) -> list[int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("invalid PNG")
    return list(struct.unpack(">II", data[16:24]))


def read_headers(name: str) -> dict[str, str]:
    header_name = "explorer.headers" if name == "explorer.json" else "bundle.headers" if name == "ingameskin-noteskin-habahiro.bundle" else "sprites.headers" if name == ".sprites" else f"{name}.headers"
    path = CACHE / header_name
    if not path.is_file():
        raise ValueError(f"header cache is absent: {path}")
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            values[key.lower()] = value.strip()
    return values


def build() -> dict[str, Any]:
    historical = json.loads(HISTORICAL.read_text(encoding="utf-8"))
    bindings = [line for line in BINDINGS.read_text(encoding="utf-8").splitlines()[1:] if line]
    assets: list[dict[str, Any]] = []
    for name, (expected_bytes, expected_sha, expected_modified) in EXPECTED.items():
        path = CACHE / name
        if not path.is_file():
            raise ValueError(f"Bestdori cache is absent: {path}")
        data = path.read_bytes()
        headers = read_headers(name)
        if len(data) != expected_bytes or digest(data) != expected_sha:
            raise ValueError(f"Bestdori byte/hash mismatch: {name}")
        if headers.get("last-modified") != expected_modified:
            raise ValueError(f"Bestdori Last-Modified mismatch: {name}")
        row: dict[str, Any] = {
            "technical_name": name,
            "url": "https://bestdori.com/api/explorer/jp/assets/ingameskin/noteskin/habahiro.json" if name == "explorer.json" else f"{BASE_URL}/{name}",
            "bytes": len(data),
            "sha256": digest(data),
            "last_modified": headers["last-modified"],
            "etag": headers.get("etag"),
        }
        if name.endswith(".png"):
            row["dimensions"] = png_size(data)
        assets.append(row)
    explorer = json.loads((CACHE / "explorer.json").read_text(encoding="utf-8"))
    expected_listing = sorted(name for name in EXPECTED if name != "explorer.json")
    if sorted(explorer) != expected_listing:
        raise ValueError("Bestdori explorer listing differs")
    historical_hashes = {
        "explorer": historical["explorer_sha256"].upper(),
        "bundle_export": historical["bundle_export_sha256"].upper(),
        "sprite_metadata": historical["sprite_metadata_sha256"].upper(),
    }
    if historical_hashes != {
        "explorer": EXPECTED["explorer.json"][1],
        "bundle_export": EXPECTED["ingameskin-noteskin-habahiro.bundle"][1],
        "sprite_metadata": EXPECTED[".sprites"][1],
    }:
        raise ValueError("historical/current external identity differs")
    return {
        "schema_version": 1,
        "status": "confirmed-current-external-portable-habahiro-resource-profile",
        "sample": {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"},
        "logical_resource": "ingameskin/noteskin/habahiro",
        "source": {
            "provider": "Bestdori asset explorer",
            "provider_role": "user-authorized fallback when current device cache/service does not expose the limited-time bundle",
            "explorer_live_checked_http_date": "Sat, 01 Aug 2026 01:39:13 GMT",
            "explorer_last_modified": EXPLORER_LAST_MODIFIED,
            "asset_release_window": "2026-03-31 13:56:47-13:57:14 GMT",
            "master_music_786_published_utc": MASTER_PUBLISHED_UTC,
            "release_link": "asset timestamps precede the current MasterMusic 786 publication by approximately one hour and the live explorer was refreshed on 2026-07-31",
            "device_asset_bundle_info": {"rows": 11041, "habahiro_rows": 0, "sha256": "26A26B8FEEA40D0FB0CDEEE1CECDAF85CB21C07A7321BFAD964278059D7CF528"},
        },
        "assets": assets,
        "sprite_profile": {
            "sprite_count": historical["sprite_count"],
            "family_counts": historical["family_counts"],
            "binding_rows": len(bindings),
            "pivots": [["0.5", "0.5"]],
            "pixels_per_unit": ["100", "65"],
            "directional_overlay_profile": historical["directional_overlay_profile"],
        },
        "cross_version_identity": {
            "same_external_explorer_sha256": True,
            "same_external_bundle_export_sha256": True,
            "same_external_sprite_metadata_sha256": True,
            "interpretation": "the portable exported atlas bytes are unchanged and were republished in the current 2026-03-31 release window",
        },
        "gate": {
            "s01_portable_resource_delivery": "closed-current-external-fallback",
            "original_unity_assetbundle_byte_parity": "open-not-claimed",
            "habahiro_natural_runtime": "open-not-replaced-by-resource-profile",
            "habahiro_original_frame": "open-not-replaced-by-resource-profile",
        },
        "distribution": {
            "binaries_committed": False,
            "production_network_allowed": False,
            "host_local_hash_verified_provider_required": True,
            "automatic_download_or_fallback": False,
            "tests_use_structured_profile_only": True,
        },
    }


def main() -> int:
    profile = build()
    OUTPUT.write_text(json.dumps(profile, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(f"current external HABAHIRO profile: assets={len(profile['assets'])} sprites={profile['sprite_profile']['sprite_count']} S01=closed-portable original-bundle=open")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
