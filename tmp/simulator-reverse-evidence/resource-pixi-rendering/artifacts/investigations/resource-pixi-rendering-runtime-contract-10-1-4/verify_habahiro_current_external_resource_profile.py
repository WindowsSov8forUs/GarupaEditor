#!/usr/bin/env python3
"""Verify the current external portable HABAHIRO resource profile from pinned local bytes."""

from __future__ import annotations

import json

from build_habahiro_current_external_resource_profile import OUTPUT, build


def main() -> int:
    expected = json.loads(OUTPUT.read_text(encoding="utf-8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    actual = build()
    if actual != expected:
        raise SystemExit("FAIL: current external HABAHIRO resource profile differs from pinned local bytes")
    if actual["status"] != "confirmed-current-external-portable-habahiro-resource-profile":
        raise SystemExit("FAIL: HABAHIRO resource status differs")
    if actual["gate"] != {
        "s01_portable_resource_delivery": "closed-current-external-fallback",
        "original_unity_assetbundle_byte_parity": "open-not-claimed",
        "habahiro_natural_runtime": "open-not-replaced-by-resource-profile",
        "habahiro_original_frame": "open-not-replaced-by-resource-profile",
    }:
        raise SystemExit("FAIL: HABAHIRO gate boundary differs")
    if actual["distribution"]["production_network_allowed"] is not False or actual["distribution"]["binaries_committed"] is not False:
        raise SystemExit("FAIL: HABAHIRO distribution boundary differs")
    print(f"verified current external HABAHIRO profile: assets={len(actual['assets'])} sprites={actual['sprite_profile']['sprite_count']} S01=closed-portable original-bundle=open production-network=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
