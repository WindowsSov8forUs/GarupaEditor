#!/usr/bin/env python3
"""Fail-closed verifier for rendering runtime/frame capture plans."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
BUILDER = HERE / "build_resource_pixi_rendering_runtime_plans.py"
TARGETS = HERE / "resource_pixi_rendering_runtime_hook_targets.json"
R1_PLAN = HERE / "runtime/resource-pixi-rendering-r1-plan.json"
FRAME_PLAN = HERE / "runtime/resource-pixi-rendering-frame-plan.json"
STATUS = HERE / "runtime_input_status.json"


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def strict_json(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def main() -> int:
    for path in (BUILDER, TARGETS, R1_PLAN, FRAME_PLAN, STATUS):
        require(path.is_file(), f"missing required plan file: {path}")
    spec = importlib.util.spec_from_file_location("verify_render_runtime_plan_builder", BUILDER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    targets = strict_json(TARGETS)
    r1_plan = strict_json(R1_PLAN)
    frame_plan = strict_json(FRAME_PLAN)
    status = strict_json(STATUS)
    require(module.build_targets() == targets, "hook targets differ from current static contract")
    require(module.build_r1_plan(targets) == r1_plan, "R1 plan differs from hook targets")
    require(module.build_frame_plan() == frame_plan, "frame plan differs from builder")
    require(module.build_status() == status, "runtime input status differs from builder")

    require(targets["status"] == "confirmed-current-hook-target-plan-runtime-evidence-absent", "target status mismatch")
    require(targets["target_count"] == 55 and len(targets["targets"]) == 55, "hook target count mismatch")
    require(targets["unknown_targets"] == [] and targets["production_authorization"] is False, "hook target gate mismatch")
    require([row["target_id"] for row in targets["targets"]] == [f"RPH-{index:03d}" for index in range(1, 56)], "hook target IDs mismatch")
    require(len({(row["owner"], row["method"]) for row in targets["targets"]}) == 55, "duplicate hook target")
    require(all(row["observation_only"] is True and row["phases"] == ["enter", "leave"] for row in targets["targets"]), "hook mutation/phase boundary mismatch")
    require({row["category"] for row in targets["targets"]} == {"resource", "note", "mesh", "line", "multiple-directional", "field", "hud", "hud-animation"}, "hook target categories mismatch")

    require(r1_plan["status"] == "confirmed-observation-only-plan-game-server-required", "R1 plan status mismatch")
    require(len(r1_plan["scenarios"]) == 2 and [row["plan_id"] for row in r1_plan["scenarios"]] == ["ordinary-rendering-r1", "habahiro-rendering-r1"], "R1 scenario set mismatch")
    safety = r1_plan["safety"]
    require(safety["observation_only"] is True and safety["natural_live_entry_required"] is True, "R1 observation boundary mismatch")
    require(all(safety[key] is False for key in ["return_replacement", "memory_writes", "managed_invocation", "apk_patch", "premium_currency_continue", "network_manipulation", "synthetic_event_injection", "raw_pointer_export", "display_string_export", "account_room_member_card_skill_identity_export"]), "R1 safety boundary mismatch")
    require(r1_plan["trace_schema"]["max_events"] == 200000, "R1 event bound mismatch")
    require("pointer" in r1_plan["trace_schema"]["forbidden_recursive_keys"] and "skill_id" in r1_plan["trace_schema"]["forbidden_recursive_keys"], "R1 forbidden field list mismatch")
    for scenario in r1_plan["scenarios"]:
        require(scenario["status"] == "planned-game-server-required", f"scenario status mismatch: {scenario['plan_id']}")
        require(scenario["completion"]["capture_error"] is None and scenario["completion"]["sequence_contiguous_from_zero"] is True, f"scenario completion mismatch: {scenario['plan_id']}")
        require(scenario["completion"]["all_required_categories_observed"] is True and scenario["completion"]["all_required_anchors_observed"] is True, f"scenario coverage mismatch: {scenario['plan_id']}")
    require(r1_plan["degraded_habahiro_disposition"] == {
        "exact_scenario_remains_planned": True,
        "absence_blocks_exact_parity": True,
        "absence_blocks_degraded_delivery": False,
        "approximation_contract": "habahiro_degraded_approximation.json",
        "generated_trace_may_pass_this_verifier": False,
    }, "R1 degraded HABAHIRO disposition mismatch")
    require(r1_plan["production_authorization"] is False, "R1 plan must not authorize production")

    require(frame_plan["status"] == "confirmed-frame-plan-game-server-required", "frame plan status mismatch")
    require(frame_plan["viewport"] == {"orientation": "landscape", "width": 2400, "height": 1080, "pixel_format": "RGBA8", "device_scale": 1}, "frame viewport mismatch")
    require(sum(len(rows) for rows in frame_plan["scenarios"].values()) == 13, "frame anchor count mismatch")
    require(frame_plan["capture"]["source"] == "physical-device-screencap" and frame_plan["capture"]["lossy_reencode"] is False, "frame source/encoding mismatch")
    require(frame_plan["capture"]["account_room_member_card_skill_identity_visible"] is False and frame_plan["capture"]["display_strings_visible"] is False and frame_plan["capture"]["raw_pointer_metadata"] is False, "frame privacy mismatch")
    require(frame_plan["degraded_habahiro_disposition"] == {
        "exact_habahiro_anchors_remain_planned": True,
        "absence_blocks_exact_parity": True,
        "absence_blocks_degraded_delivery": False,
        "generated_degraded_frames_are_original_expected": False,
        "generated_degraded_frames_may_pass_this_verifier": False,
    }, "frame degraded HABAHIRO disposition mismatch")
    require(frame_plan["production_authorization"] is False, "frame plan must not authorize production")

    require(status["status"] == "ordinary-runtime-required-habahiro-degraded-delivery-accepted" and status["offline_plan_gate"] == "closed" and status["rendering_gate"] == "open", "runtime status gate mismatch")
    require(status["habahiro_exact_parity_gate"] == "open" and status["habahiro_degraded_delivery_gate"] == "closed-authorized-by-explicit-user-request", "HABAHIRO dual-track gate mismatch")
    require([row["id"] for row in status["required"]] == ["S01", "S02", "S03"], "runtime required IDs mismatch")
    require(all(row["blocks_degraded_delivery"] is False for row in status["required"]), "exact blocker still blocks degraded delivery")
    require(status["degraded_habahiro"] == {
        "status": "accepted-not-original-parity",
        "contract": "habahiro_degraded_approximation.json",
        "visible_label": "Approximate HABAHIRO",
        "automatic_fallback": False,
        "generated_frames_are_golden": False,
    }, "degraded HABAHIRO runtime disposition mismatch")
    require(status["confirmed_traces"] == [] and status["confirmed_frames"] == [] and status["unknown_offline_work"] == [], "runtime status invents evidence or retains offline work")
    require(status["production_authorization"] is False, "runtime plans must not authorize production")
    print("verified rendering runtime plans: targets=55 scenarios=2 frame_anchors=13 exact=S01-S03-open habahiro-degraded=authorized production=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
