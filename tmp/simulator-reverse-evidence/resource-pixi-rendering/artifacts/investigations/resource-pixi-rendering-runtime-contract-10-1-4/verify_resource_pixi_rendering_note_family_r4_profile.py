#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROFILE = HERE / "resource_pixi_rendering_note_family_r4_profile.json"
TARGETS = HERE / "resource_pixi_rendering_note_family_r4_targets.json"
TRACES = {
    group: HERE / f"runtime/ordinary-rendering-note-family-r4-{group}.trace.json.gz"
    for group in ("flick", "slide", "multiple")
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def main() -> int:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    assert profile["status"] == "confirmed-current-note-family-r4-runtime-profile"
    assert profile["source"]["targets_sha256"] == sha(TARGETS)
    assert profile["source"]["capture_script_sha256"] == sha(HERE / "capture_resource_pixi_rendering_note_family_r4.py")
    assert profile["source"]["runtime_verifier_sha256"] == sha(HERE / "verify_resource_pixi_rendering_note_family_r4_runtime.py")
    assert profile["source"]["traces"] == {group: sha(path) for group, path in TRACES.items()}
    coverage = profile["coverage"]
    assert coverage["trace_count"] == 3
    assert coverage["event_count"] == 118152
    assert coverage["aggregate_relative_frame_count"] == 1258
    assert len(coverage["observed_owner_ids"]) == 16
    methods = {row["target_id"]: row for row in profile["methods"]}
    assert len(methods) == 30
    assert methods["RPF-001"]["runtime_observed"] is True
    assert methods["RPF-006"]["runtime_observed"] is False
    assert methods["RPF-007"]["runtime_observed"] is True
    assert methods["RPF-010"]["runtime_observed"] is False
    assert methods["RPF-015"]["runtime_observed"] is True
    assert methods["RPF-017"]["runtime_observed"] is False
    assert methods["RPF-025"]["runtime_observed"] is True
    assert methods["RPF-028"]["runtime_observed"] is False
    portable = profile["portable_contract"]
    assert portable["directional_icon_sorting_order"] == 71
    assert portable["slide_mesh_vertex_count"] == portable["slide_mesh_color_count"] == 22
    assert portable["line_position_indices"] == [0, 1]
    assert portable["line_width_start_equals_end"] is True
    assert portable["slide_move_animation"] == "LongNoteFlash"
    assert portable["slide_disabled_animation"] == "NoteLaneEffectAnimationDisabled"
    assert portable["animation_restart_normalized_time_f32_bits"] == "00000000"
    assert portable["deactivate_local_position_f32_bits"] == ["42480000", "42480000", "00000000"]
    assert portable["material_property_id"] == 3453
    assert portable["material_value_f32_bits"] == "44322D84"
    authorization = profile["authorization"]
    assert authorization["ordinary_front_flick_icon"] is True
    assert authorization["ordinary_front_directional_flick_icon"] is True
    assert authorization["ordinary_slide_activate_update_move_stop_after"] is True
    assert authorization["ordinary_slide_child_chain_mesh"] is True
    assert authorization["ordinary_slide_child_chain_line"] is True
    assert authorization["ordinary_multiple_directional_activate_deactivate"] is True
    assert authorization["ordinary_multiple_directional_connect_next"] is True
    assert authorization["ordinary_multiple_directional_back_line"] is True
    assert authorization["ordinary_long_after_flick_icon"] is False
    assert authorization["ordinary_slide_wait_state_runtime"] is False
    assert authorization["ordinary_add_long_multiple_directional_visual"] is False
    assert authorization["ordinary_add_slide_multiple_directional_visual"] is False
    assert authorization["ordinary_multiple_directional_after_icon"] is False
    assert authorization["advanced_mesh"] is False
    assert authorization["threshold_shader"] is False
    assert authorization["habahiro_exact"] is False
    assert profile["unknown_fields"] == []
    print("verified Note family R4 profile: 118152 events, 16 observed owners, conservative authorization")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
