#!/usr/bin/env python3
"""Verify the ordinary-exact / HABAHIRO-degraded delivery oracle and closure."""

from __future__ import annotations

import hashlib
import json

from build_resource_pixi_rendering_delivery_oracle import CLOSURE_OUTPUT, ORACLE_OUTPUT, build


def strict(path):
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))


def serialized(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def main() -> int:
    expected_oracle = strict(ORACLE_OUTPUT)
    expected_closure = strict(CLOSURE_OUTPUT)
    actual_oracle, actual_closure = build()
    if actual_oracle != expected_oracle or actual_closure != expected_closure:
        raise SystemExit("FAIL: rendering delivery oracle/closure differs from frozen evidence")
    if hashlib.sha256(serialized(actual_oracle)).hexdigest().upper() != actual_closure["oracle"]["sha256"]:
        raise SystemExit("FAIL: rendering delivery oracle hash differs")
    required_gates = {
        "ordinary_runtime_gate": "closed",
        "ordinary_frame_gate": "closed",
        "habahiro_portable_resource_gate": "closed-current-external-fallback",
        "habahiro_exact_parity_gate": "open-not-claimed",
        "habahiro_degraded_delivery_gate": "closed",
        "rendering_delivery_gate": "closed",
    }
    for key, value in required_gates.items():
        if actual_closure[key] != value:
            raise SystemExit(f"FAIL: {key} differs")
    if actual_closure["production_authorization"] is not True:
        raise SystemExit("FAIL: delivery production remains unauthorized")
    if len(actual_closure["decision_status"]) != 18 or len(actual_closure["fixed_case_status"]) != 40:
        raise SystemExit("FAIL: D/PR closure count differs")
    if actual_oracle["fidelity"]["original_habahiro_runtime_or_frame_claim"] is not False:
        raise SystemExit("FAIL: degraded HABAHIRO claims original runtime/frame parity")
    print(f"verified rendering delivery oracle: events={actual_oracle['ordinary_runtime']['events']} frames={actual_oracle['ordinary_frames']['count']} HAB={actual_oracle['habahiro_resources']['asset_count']}/{actual_oracle['habahiro_resources']['sprite_count']} D=18 PR=40 delivery=closed exact-HAB=open production=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
