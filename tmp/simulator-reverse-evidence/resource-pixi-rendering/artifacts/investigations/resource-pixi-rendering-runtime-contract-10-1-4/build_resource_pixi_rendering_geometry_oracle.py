#!/usr/bin/env python3
"""Build a compact exact oracle over the full ordinary renderer-setter R2 trace."""

from __future__ import annotations

from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
TRACE_PATH = HERE / "runtime" / "ordinary-rendering-geometry-r2.trace.json.gz"
TARGETS_PATH = HERE / "resource_pixi_rendering_setter_targets.json"
OUTPUT_PATH = HERE / "resource_pixi_rendering_geometry_oracle.json"


def strict_load(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")

    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as source:
            return json.loads(source.read(), parse_constant=reject)
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def exact_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "sequence": event["sequence"],
        "frame": event["frame"],
        "owner_target_id": event["owner_target_id"],
        "owner_object_alias": event["owner_object_alias"],
        "setter_id": event["setter_id"],
        "component_alias": event["component_alias"],
        "payload": event["payload"],
    }


def build_document() -> dict[str, Any]:
    trace = strict_load(TRACE_PATH)
    targets = strict_load(TARGETS_PATH)
    require(trace["status"] == "confirmed-render-setter-r2-observation-only", "R2 trace not confirmed")
    events = trace["events"]
    by_setter: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_owner: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        by_setter[event["setter_id"]].append(event)
        by_owner[event["owner_object_alias"]].append(event)

    init_payloads: dict[str, Any] = {}
    for setter_id in ("RPS-001", "RPS-002", "RPS-003", "RPS-004"):
        rows = [event for event in by_setter[setter_id] if event["owner_target_id"] == "RPH-014"]
        require(len(rows) == 510, f"{setter_id} init observation count differs")
        payloads = {canonical(event["payload"]) for event in rows}
        require(len(payloads) == 1, f"{setter_id} init payload is not invariant")
        init_payloads[setter_id] = rows[0]["payload"]

    lifecycle_owners = sorted(
        owner for owner, rows in by_owner.items()
        if {event["owner_target_id"] for event in rows} >= {"RPH-014", "RPH-016", "RPH-017", "RPH-018"}
    )
    require(len(lifecycle_owners) == 510, "mesh lifecycle owner count differs")
    selected_owner = lifecycle_owners[0]
    selected_rows = by_owner[selected_owner]
    selected: dict[str, list[dict[str, Any]]] = {}
    for target_id in ("RPH-014", "RPH-016", "RPH-017", "RPH-018"):
        rows = [event for event in selected_rows if event["owner_target_id"] == target_id]
        require(rows, f"selected mesh lifecycle misses {target_id}")
        selected[target_id] = [exact_event(event) for event in (rows if target_id != "RPH-017" else rows[:1])]

    material_rows = by_setter["RPS-005"]
    property_ids = sorted({event["payload"]["property_id"] for event in material_rows})
    threshold_bits = sorted({event["payload"]["value_f32_bits"] for event in material_rows})
    require(property_ids == [3453] and threshold_bits == ["44322D84"], "material threshold invariant differs")

    line_width_rows = by_setter["RPS-007"]
    require(all(event["payload"]["start_width_f32_bits"] == event["payload"]["end_width_f32_bits"] for event in line_width_rows), "line start/end width differs")
    line_owners = sorted({event["owner_object_alias"] for event in by_setter["RPS-006"]})
    require(len(line_owners) == 80, "line owner count differs")
    line_owner = line_owners[0]
    line_rows = by_owner[line_owner]
    positions = [event for event in line_rows if event["setter_id"] == "RPS-006"]
    widths = [event for event in line_rows if event["setter_id"] == "RPS-007"]
    first_pair = []
    for event in positions:
        if not first_pair or event["payload"]["index"] != first_pair[-1]["payload"]["index"]:
            first_pair.append(event)
        if len(first_pair) == 2 and {row["payload"]["index"] for row in first_pair} == {0, 1}:
            break
    first_nonzero_width = next(event for event in widths if event["payload"]["start_width_f32_bits"] != "00000000")

    update_vertices = [event for event in by_setter["RPS-001"] if event["owner_target_id"] == "RPH-017"]
    require(update_vertices and all(len(event["payload"]["vertex_f32_bits"]) == 22 for event in update_vertices), "runtime mesh vertex count differs")
    require(all(vertex[2] == "00000000" for event in update_vertices for vertex in event["payload"]["vertex_f32_bits"]), "runtime mesh Z is not zero")

    transform_counts = Counter(
        (event["owner_target_id"], event["setter_id"], canonical(event["payload"]))
        for event in events if event["setter_id"] in {"RPS-008", "RPS-009", "RPS-010"}
    )
    field_transform_rows = [
        {"owner_target_id": owner, "setter_id": setter, "payload": json.loads(payload), "count": count}
        for (owner, setter, payload), count in sorted(transform_counts.items())
        if owner in {"RPH-030", "RPH-031"}
    ]

    return {
        "schema_version": 1,
        "status": "confirmed-ordinary-render-geometry-oracle",
        "sample": trace["sample"],
        "source": {
            "trace_path": "runtime/ordinary-rendering-geometry-r2.trace.json.gz",
            "trace_bytes": TRACE_PATH.stat().st_size,
            "trace_sha256": digest(TRACE_PATH),
            "setter_targets_path": TARGETS_PATH.name,
            "setter_targets_bytes": TARGETS_PATH.stat().st_size,
            "setter_targets_sha256": digest(TARGETS_PATH),
        },
        "coverage": {
            "events": len(events),
            "relative_frames": trace["summary"]["relative_frame_count"],
            "setter_counts": trace["summary"]["setter_event_counts"],
            "owner_counts": trace["summary"]["owner_event_counts"],
            "mesh_lifecycle_owners": len(lifecycle_owners),
            "line_owners": len(line_owners),
        },
        "mesh": {
            "init_invariant_observations": 510,
            "init_payloads": init_payloads,
            "runtime_vertex_count": 22,
            "runtime_vertex_z_bits": "00000000",
            "material_property_ids": property_ids,
            "material_threshold_f32_bits": threshold_bits,
            "selected_lifecycle_owner_alias": selected_owner,
            "selected_lifecycle": selected,
        },
        "line": {
            "start_end_width_equal": True,
            "zero_width_observations": sum(event["payload"]["start_width_f32_bits"] == "00000000" for event in line_width_rows),
            "nonzero_width_observations": sum(event["payload"]["start_width_f32_bits"] != "00000000" for event in line_width_rows),
            "selected_line_owner_alias": line_owner,
            "first_endpoint_pair": [exact_event(event) for event in first_pair],
            "first_nonzero_width": exact_event(first_nonzero_width),
        },
        "field": {
            "setup_transform_histogram": field_transform_rows,
        },
        "portable_boundary": {
            "float_policy": "exact-uppercase-Float32-bits",
            "line_mapping": "endpoint-pair-plus-equal-width; cap/join/material-raster-remain-separate-static-profile-fields",
            "mesh_mapping": "22-vertex indexed strip with exact UV/color and per-update vertices; Unity shader binary parity not claimed",
            "hud_layout": "not-closed-by-this-geometry-oracle",
            "habahiro_original_parity": "open-not-claimed",
        },
        "unknown_fields": [],
    }


def main() -> int:
    document = build_document()
    OUTPUT_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"built render geometry oracle: events={document['coverage']['events']} mesh={document['coverage']['mesh_lifecycle_owners']} line={document['coverage']['line_owners']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
