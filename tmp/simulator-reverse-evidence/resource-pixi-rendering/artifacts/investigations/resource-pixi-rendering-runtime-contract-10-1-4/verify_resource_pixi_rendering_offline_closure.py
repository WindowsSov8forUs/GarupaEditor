#!/usr/bin/env python3
"""Fail-closed verifier for the rendering offline-work closure."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
BUILDER = HERE / "build_resource_pixi_rendering_offline_closure.py"
PORTABLE = HERE / "resource_pixi_rendering_portable_contract.json"
CASES = HERE / "resource_pixi_rendering_fixed_case_status.json"
CLOSURE = HERE / "offline_closure.json"


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def main() -> int:
    for path in (BUILDER, PORTABLE, CASES, CLOSURE):
        require(path.is_file(), f"missing required file: {path}")
    spec = importlib.util.spec_from_file_location("verify_offline_closure_builder", BUILDER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    portable = json.loads(PORTABLE.read_text(encoding="utf-8"))
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    closure = json.loads(CLOSURE.read_text(encoding="utf-8"))
    require(module.build_portable_contract() == portable, "portable contract differs from evidence inputs")
    require(module.build_fixed_case_status() == cases, "fixed-case status differs from evidence inputs")
    require(module.build_offline_closure() == closure, "offline closure differs from evidence inputs")

    require(portable["status"] == "confirmed-offline-portable-draft-runtime-order-gate-open", "portable status mismatch")
    require(portable["production_authorization"] is False, "portable draft must not authorize production")
    require(portable["resource_profile"]["network_allowed"] is False, "portable resource network must be disabled")
    require(portable["resource_profile"]["fallback_alias_allowed"] is False, "portable resource fallback must be disabled")
    require(portable["resource_profile"]["placeholder_allowed"] is False, "portable placeholders must be disabled")
    require(portable["resource_profile"]["habahiro_exact_status"] == "evidence-required-current-bundle-absent-from-cache-index", "HABAHIRO exact resource status mismatch")
    require(portable["resource_profile"]["habahiro_degraded_status"] == "explicit-profile-allowed-not-original-parity" and portable["resource_profile"]["automatic_degraded_fallback_allowed"] is False, "HABAHIRO degraded resource policy mismatch")
    require(portable["degraded_habahiro_policy"] == {
        "status": "delivery-authorized-exact-parity-open",
        "profile_selection": "explicit-only",
        "visible_label": "Approximate HABAHIRO",
        "parity_tests": "excluded",
        "directly_impacted_cases": ["PR01", "PR04", "PR19", "PR40"],
        "evidence_ids": ["F11", "F12"],
    }, "portable degraded HABAHIRO policy mismatch")
    require(len(portable["component_mapping"]) == 7, "component mapping count mismatch")
    require(bool(portable["rejections"]), "portable rejection matrix is empty")

    require(cases["status"] == "confirmed-offline-case-classification-server-gate-open", "fixed-case status mismatch")
    require(len(cases["cases"]) == 40, "PR case count mismatch")
    require([row["case"] for row in cases["cases"]] == [f"PR{index:02d}" for index in range(1, 41)], "PR case order mismatch")
    require(cases["unknown_cases"] == [], "fixed-case oracle contains unknown cases")
    require(cases["production_authorization"] is False, "partial fixed cases must not authorize production")
    by_case = {row["case"]: row for row in cases["cases"]}
    require(by_case["PR02"]["status"] == "confirmed-current-static", "ordinary atlas static case is not closed")
    require(by_case["PR03"]["status"] == "confirmed-current-static", "directional atlas static case is not closed")
    require(by_case["PR04"]["status"] == "server-resource-required", "HABAHIRO case must remain server-blocked")
    require(by_case["PR39"]["status"] == "runtime-live-and-frame-required", "ordinary production frame case must remain runtime-blocked")
    require(by_case["PR40"]["status"] == "runtime-live-and-frame-required", "HABAHIRO production frame case must remain runtime-blocked")
    require(cases["degraded_habahiro_disposition"]["status"] == "accepted-for-explicit-preview-not-original-parity" and cases["degraded_habahiro_disposition"]["exact_case_statuses_unchanged"] is True, "degraded PR disposition mismatch")
    require(list(cases["degraded_habahiro_disposition"]["cases"]) == ["PR01", "PR04", "PR19", "PR40"], "degraded PR case set mismatch")

    require(closure["status"] == "offline-work-gate-closed-server-required-gate-open", "offline closure status mismatch")
    require(closure["offline_work_gate"] == "closed", "offline work gate is not closed")
    require(closure["offline_plan_gate"] == "closed", "offline runtime plan gate is not closed")
    require(closure["runtime_capture_plan"] == {
        "status": "confirmed-observation-only-plan-game-server-required",
        "hook_target_count": 55,
        "r1_scenarios": ["ordinary-rendering-r1", "habahiro-rendering-r1"],
        "physical_frame_anchors": 13,
        "evidence_ids": ["F08", "F09", "F10"],
    }, "runtime capture plan summary mismatch")
    require(closure["rendering_gate"] == "open", "rendering gate closed without runtime evidence")
    require(closure["habahiro_exact_parity_gate"] == "open" and closure["habahiro_degraded_delivery_gate"] == "closed-authorized-by-explicit-user-request", "HABAHIRO dual-track closure mismatch")
    require(closure["degraded_habahiro"] == {
        "status": "accepted-for-delivery-not-original-parity",
        "profiles": ["historical-atlas-proxy", "current-ordinary-stretch-proxy"],
        "visible_label": "Approximate HABAHIRO",
        "automatic_fallback": False,
        "difference_count": 12,
        "directly_impacted_cases": ["PR01", "PR04", "PR19", "PR40"],
        "evidence_ids": ["F11", "F12"],
    }, "degraded HABAHIRO closure mismatch")
    require(closure["production_authorization"] is False, "offline evidence must not authorize production")
    require(len(closure["historical_candidate_status"]) == 28, "H candidate count mismatch")
    require(set(closure["historical_candidate_status"]) == {f"H{index:02d}" for index in range(1, 29)}, "H candidate IDs mismatch")
    require(len(closure["decision_status"]) == 18, "D decision count mismatch")
    require(set(closure["decision_status"]) == {f"D{index:02d}" for index in range(1, 19)}, "D decision IDs mismatch")
    require(closure["unknown_static_work"] == [] and closure["unknown_fields"] == [], "offline closure retains unknown static work")
    require(closure["remaining_blockers_all_require_game_server"] is True, "non-server blocker remains after offline closure")
    require([row["id"] for row in closure["remaining_blockers"]] == ["S01", "S02", "S03"], "remaining blocker IDs mismatch")
    require(all(row["requires_game_server"] is True for row in closure["remaining_blockers"]), "remaining blocker is not server-bound")
    require(all(row["blocks_degraded_habahiro_delivery"] is False for row in closure["remaining_blockers"]), "exact blocker still blocks degraded HABAHIRO delivery")
    print("verified rendering offline closure: H=28 D=18 PR=40 plans=55/2/13 HAB-exact=open HAB-degraded=authorized remaining=S01,S02,S03 production=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
