#!/usr/bin/env python3
"""Build a runtime/frame oracle only after all S01-S03 evidence verifies."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


HERE = Path(__file__).resolve().parent
TRACE_VERIFIER = HERE / "verify_resource_pixi_rendering_runtime_trace.py"
FRAME_VERIFIER = HERE / "verify_resource_pixi_rendering_frame_manifest.py"


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def strict_loads(text: str, label: str) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {label}")
    return json.loads(text, parse_constant=reject)


def load(path: Path) -> Any:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as source:
            return strict_loads(source.read(), str(path))
    return strict_loads(path.read_text(encoding="utf-8"), str(path))


def file_profile(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    return {"path": path.as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest().upper()}


def verify(command: list[str]) -> None:
    result = subprocess.run(command, cwd=HERE, capture_output=True, text=True, check=False)
    require(result.returncode == 0, f"evidence verifier failed: {' '.join(command)}\n{result.stdout}{result.stderr}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--habahiro-resource-profile", type=Path, required=True)
    parser.add_argument("--ordinary-trace", type=Path, required=True)
    parser.add_argument("--habahiro-trace", type=Path, required=True)
    parser.add_argument("--frame-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    for path in (args.habahiro_resource_profile, args.ordinary_trace, args.habahiro_trace, args.frame_manifest):
        require(path.is_file(), f"required S01-S03 evidence is absent: {path}")
    resource = load(args.habahiro_resource_profile)
    require(resource.get("status") == "confirmed-current-habahiro-resource-profile", "S01 HABAHIRO resource profile is not confirmed")
    require(resource.get("sample") == {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}, "S01 sample mismatch")
    require(resource.get("logical_key") == "ingameskin/noteskin/habahiro" and resource.get("bytes", 0) > 0 and len(resource.get("sha256", "")) == 64, "S01 identity mismatch")
    require(resource.get("source") in {"game-resource-service", "proven-current-device-cache"}, "S01 provenance mismatch")
    require(resource.get("binary_committed") is False and resource.get("unknown_fields") == [] and resource.get("blocking_findings") == [], "S01 profile remains open")

    verify([sys.executable, str(TRACE_VERIFIER), str(args.ordinary_trace), "--plan-id", "ordinary-rendering-r1"])
    verify([sys.executable, str(TRACE_VERIFIER), str(args.habahiro_trace), "--plan-id", "habahiro-rendering-r1"])
    verify([sys.executable, str(FRAME_VERIFIER), str(args.frame_manifest)])
    ordinary = load(args.ordinary_trace)
    habahiro = load(args.habahiro_trace)
    frames = load(args.frame_manifest)
    oracle = {
        "schema_version": 1,
        "status": "confirmed-current-runtime-and-physical-frame-inputs-closure-review-required",
        "sample": resource["sample"],
        "inputs": {
            "habahiro_resource": file_profile(args.habahiro_resource_profile),
            "ordinary_trace": file_profile(args.ordinary_trace),
            "habahiro_trace": file_profile(args.habahiro_trace),
            "frame_manifest": file_profile(args.frame_manifest),
        },
        "coverage": {
            "ordinary_events": len(ordinary["events"]),
            "ordinary_categories": ordinary["summary"]["categories"],
            "ordinary_anchors": ordinary["summary"]["anchors"],
            "habahiro_events": len(habahiro["events"]),
            "habahiro_categories": habahiro["summary"]["categories"],
            "habahiro_anchors": habahiro["summary"]["anchors"],
            "physical_frames": len(frames["frames"]),
        },
        "gates": {"S01": "confirmed", "S02": "confirmed", "S03": "confirmed"},
        "unknown_fields": [],
        "blocking_findings": ["D01-D18 and PR01-PR40 final semantic closure review has not run"],
        "rendering_gate": "open",
        "production_authorization": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(oracle, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(f"built runtime input oracle: ordinary={len(ordinary['events'])} habahiro={len(habahiro['events'])} frames={len(frames['frames'])} closure_review=required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
