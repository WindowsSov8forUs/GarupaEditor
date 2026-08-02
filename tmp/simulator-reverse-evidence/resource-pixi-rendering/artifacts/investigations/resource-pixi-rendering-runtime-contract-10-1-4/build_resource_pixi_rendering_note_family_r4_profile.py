#!/usr/bin/env python3
"""Build the compact current Flick/Slide/Multiple R4 authorization profile."""
from __future__ import annotations

from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGETS = HERE / "resource_pixi_rendering_note_family_r4_targets.json"
OUT = HERE / "resource_pixi_rendering_note_family_r4_profile.json"
TRACE_PATHS = {
    group: HERE / f"runtime/ordinary-rendering-note-family-r4-{group}.trace.json.gz"
    for group in ("flick", "slide", "multiple")
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_trace(path: Path) -> dict:
    return json.loads(gzip.decompress(path.read_bytes()))


def main() -> int:
    targets = load(TARGETS)
    traces = {group: load_trace(path) for group, path in TRACE_PATHS.items()}
    observations = {}
    all_observed_owners: set[str] = set()
    for group, trace in traces.items():
        assert trace["status"] == f"confirmed-current-note-family-r4-{group}-observation-only"
        assert trace["summary"]["completion_requirements_met"] is True
        pair_counts = Counter((event["owner_target_id"], event["setter_id"]) for event in trace["events"])
        technical_values = defaultdict(set)
        array_lengths = defaultdict(set)
        line_indices = defaultdict(set)
        bool_values = defaultdict(set)
        int_values = defaultdict(set)
        material_values = defaultdict(set)
        for event in trace["events"]:
            owner_id = event["owner_target_id"]
            setter_id = event["setter_id"]
            payload = event["payload"]
            all_observed_owners.add(owner_id)
            if "technical_value" in payload and payload["technical_value"] is not None:
                technical_values[(owner_id, setter_id)].add(payload["technical_value"])
            for key in ("vertex_f32_bits", "uv_f32_bits", "color_f32_bits", "index_i32"):
                if key in payload:
                    array_lengths[(owner_id, setter_id)].add(len(payload[key]))
            if "index" in payload:
                line_indices[(owner_id, setter_id)].add(payload["index"])
            if "enabled" in payload:
                bool_values[(owner_id, setter_id)].add(payload["enabled"])
            if "value_i32" in payload:
                int_values[(owner_id, setter_id)].add(payload["value_i32"])
            if "property_id" in payload:
                material_values[(owner_id, setter_id)].add((payload["property_id"], payload["value_f32_bits"]))
        observations[group] = {
            "trace_sha256": sha(TRACE_PATHS[group]),
            "event_count": trace["summary"]["event_count"],
            "relative_frame_count": trace["summary"]["relative_frame_count"],
            "owner_event_counts": trace["summary"]["owner_event_counts"],
            "setter_event_counts": trace["summary"]["setter_event_counts"],
            "owner_setter_counts": {
                f"{owner_id}/{setter_id}": count
                for (owner_id, setter_id), count in sorted(pair_counts.items())
            },
            "technical_values": {
                f"{owner_id}/{setter_id}": sorted(values)
                for (owner_id, setter_id), values in sorted(technical_values.items())
            },
            "array_lengths": {
                f"{owner_id}/{setter_id}": sorted(values)
                for (owner_id, setter_id), values in sorted(array_lengths.items())
            },
            "line_indices": {
                f"{owner_id}/{setter_id}": sorted(values)
                for (owner_id, setter_id), values in sorted(line_indices.items())
            },
            "bool_values": {
                f"{owner_id}/{setter_id}": sorted(values)
                for (owner_id, setter_id), values in sorted(bool_values.items())
            },
            "int_values": {
                f"{owner_id}/{setter_id}": sorted(values)
                for (owner_id, setter_id), values in sorted(int_values.items())
            },
            "material_values": {
                f"{owner_id}/{setter_id}": [
                    {"property_id": property_id, "value_f32_bits": value_bits}
                    for property_id, value_bits in sorted(values)
                ]
                for (owner_id, setter_id), values in sorted(material_values.items())
            },
        }
    methods = [
        {
            "target_id": row["target_id"],
            "owner": row["owner"],
            "method": row["method"],
            "rva": row["rva"],
            "end_rva": row["end_rva"],
            "arm64_sha256": row["arm64_sha256"],
            "arm64_evidence": row["arm64_evidence"],
            "runtime_observed": row["target_id"] in all_observed_owners,
        }
        for row in targets["targets"]
    ]
    profile = {
        "schema_version": 1,
        "status": "confirmed-current-note-family-r4-runtime-profile",
        "sample": targets["sample"],
        "source": {
            "targets_sha256": sha(TARGETS),
            "capture_script_sha256": sha(HERE / "capture_resource_pixi_rendering_note_family_r4.py"),
            "runtime_verifier_sha256": sha(HERE / "verify_resource_pixi_rendering_note_family_r4_runtime.py"),
            "traces": {group: sha(path) for group, path in TRACE_PATHS.items()},
        },
        "coverage": {
            "trace_count": len(traces),
            "event_count": sum(trace["summary"]["event_count"] for trace in traces.values()),
            "aggregate_relative_frame_count": sum(trace["summary"]["relative_frame_count"] for trace in traces.values()),
            "observed_owner_ids": sorted(all_observed_owners),
        },
        "methods": methods,
        "observations": observations,
        "portable_contract": {
            "directional_icon_sorting_order": 71,
            "slide_mesh_vertex_count": 22,
            "slide_mesh_color_count": 22,
            "line_position_indices": [0, 1],
            "line_width_start_equals_end": True,
            "slide_move_animation": "LongNoteFlash",
            "slide_disabled_animation": "NoteLaneEffectAnimationDisabled",
            "animation_restart_normalized_time_f32_bits": "00000000",
            "deactivate_local_position_f32_bits": ["42480000", "42480000", "00000000"],
            "material_property_id": 3453,
            "material_value_f32_bits": "44322D84",
        },
        "authorization": {
            "ordinary_front_flick_icon": True,
            "ordinary_front_directional_flick_icon": True,
            "ordinary_long_after_flick_icon": False,
            "ordinary_slide_activate_update_move_stop_after": True,
            "ordinary_slide_wait_state_runtime": False,
            "ordinary_slide_child_chain_mesh": True,
            "ordinary_slide_child_chain_line": True,
            "ordinary_multiple_directional_activate_deactivate": True,
            "ordinary_multiple_directional_connect_next": True,
            "ordinary_multiple_directional_back_line": True,
            "ordinary_add_long_multiple_directional_visual": False,
            "ordinary_add_slide_multiple_directional_visual": False,
            "ordinary_multiple_directional_after_icon": False,
            "advanced_mesh": False,
            "threshold_shader": False,
            "habahiro_exact": False,
        },
        "limits": [
            "RPF-006 Long after Flick setup was not observed.",
            "RPF-010 Slide WaitState is byte-pinned but was not runtime-observed in these captures.",
            "RPF-017 through RPF-024 add-Long/add-Slide/after Multiple visual routes were not observed.",
            "RPF-028 and RPF-029 NoteMeshAdvanced routes were not observed.",
            "The constant material setter observation does not authorize threshold shader behavior.",
        ],
        "unknown_fields": [],
    }
    OUT.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(
        "built Note family R4 profile:",
        profile["coverage"]["event_count"],
        "events",
        len(profile["coverage"]["observed_owner_ids"]),
        "owners",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
