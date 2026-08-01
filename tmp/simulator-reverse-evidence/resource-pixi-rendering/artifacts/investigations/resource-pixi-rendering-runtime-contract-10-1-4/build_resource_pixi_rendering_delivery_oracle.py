#!/usr/bin/env python3
"""Build the ordinary-exact / HABAHIRO-degraded delivery oracle and closure."""

from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
TRACE = HERE / "runtime/ordinary-rendering-r1.trace.json.gz"
FRAME_MANIFEST = HERE / "runtime/resource-pixi-rendering-delivery-frame-manifest.json"
EXTERNAL_HABAHIRO = HERE / "habahiro_current_external_resource_profile.json"
DEGRADED = HERE / "habahiro_degraded_approximation.json"
DEGRADED_SCENE = HERE / "habahiro_degraded_scene_oracle.json"
PORTABLE = HERE / "resource_pixi_rendering_portable_contract.json"
FIXED_CASES = HERE / "resource_pixi_rendering_fixed_case_status.json"
TARGETS = HERE / "resource_pixi_rendering_runtime_hook_targets.json"
ORACLE_OUTPUT = HERE / "resource_pixi_rendering_delivery_oracle.json"
CLOSURE_OUTPUT = HERE / "delivery_closure.json"


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


def first_sequence(events: list[dict[str, Any]], target_id: str, phase: str = "enter") -> int:
    return next(event["sequence"] for event in events if event["target_id"] == target_id and event["phase"] == phase)


def build() -> tuple[dict[str, Any], dict[str, Any]]:
    trace = strict_load(TRACE)
    frames = strict_load(FRAME_MANIFEST)
    external = strict_load(EXTERNAL_HABAHIRO)
    degraded = strict_load(DEGRADED)
    degraded_scene = strict_load(DEGRADED_SCENE)
    portable = strict_load(PORTABLE)
    fixed_cases = strict_load(FIXED_CASES)
    targets_document = strict_load(TARGETS)
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture"]["capture_error"] is None, "ordinary R1 is not confirmed")
    require(trace["summary"]["completion_requirements_met"] is True and trace["summary"]["privacy_requirements_met"] is True, "ordinary R1 completion differs")
    require(frames["status"] == "confirmed-physical-device-frame-manifest" and len(frames["frames"]) == 7, "ordinary frame manifest differs")
    require({row["scenario"] for row in frames["frames"]} == {"ordinary"}, "delivery frames claim a non-ordinary original frame")
    require(external["status"] == "confirmed-current-external-portable-habahiro-resource-profile", "external HABAHIRO profile differs")
    require(external["gate"]["s01_portable_resource_delivery"] == "closed-current-external-fallback", "S01 portable resource remains open")
    require(external["distribution"]["production_network_allowed"] is False, "production resource network is enabled")
    require(degraded["gate_policy"]["habahiro_degraded_delivery_gate"] == "closed-authorized-by-explicit-user-request", "HABAHIRO degraded gate differs")
    require(degraded_scene["frame_oracle"] is None and degraded_scene["scene_or_command_parity_claim"] is False, "degraded scene claims original parity")
    events = trace["events"]
    target_by_id = {row["target_id"]: row for row in targets_document["targets"]}
    phase_counts = Counter((event["target_id"], event["phase"]) for event in events)
    category_counts = Counter(target_by_id[event["target_id"]]["category"] for event in events if event["phase"] == "enter")
    activate_aliases = {event["object_alias"] for event in events if event["target_id"] == "RPH-016" and event["phase"] == "enter"}
    deactivate_aliases = {event["object_alias"] for event in events if event["target_id"] == "RPH-018" and event["phase"] == "enter"}
    mesh_lifecycle_pairs = len((activate_aliases & deactivate_aliases) - {None})
    line_setup_aliases = {event["object_alias"] for event in events if event["target_id"] == "RPH-022" and event["phase"] == "enter"}
    line_deactivate_aliases = {event["object_alias"] for event in events if event["target_id"] == "RPH-026" and event["phase"] == "enter"}
    line_lifecycle_pairs = len((line_setup_aliases & line_deactivate_aliases) - {None})
    require(mesh_lifecycle_pairs == 510 and line_lifecycle_pairs == 80, "runtime lifecycle identity counts differ")
    setup_order_ids = ["RPH-001", "RPH-005", "RPH-004", "RPH-030", "RPH-003", "RPH-013", "RPH-027", "RPH-021", "RPH-002"]
    setup_order = [{"target_id": target_id, "first_enter_sequence": first_sequence(events, target_id)} for target_id in setup_order_ids]
    require([row["first_enter_sequence"] for row in setup_order] == sorted(row["first_enter_sequence"] for row in setup_order), "ordinary setup order differs")
    hud_order_ids = ["RPH-040", "RPH-036", "RPH-037", "RPH-042"]
    hud_order = [{"target_id": target_id, "first_enter_sequence": first_sequence(events, target_id)} for target_id in hud_order_ids]
    require([row["first_enter_sequence"] for row in hud_order] == sorted(row["first_enter_sequence"] for row in hud_order), "first judged HUD order differs")
    evidence = {
        "ordinary_trace": {"path": TRACE.relative_to(HERE).as_posix(), "bytes": TRACE.stat().st_size, "sha256": digest(TRACE)},
        "ordinary_frame_manifest": {"path": FRAME_MANIFEST.relative_to(HERE).as_posix(), "bytes": FRAME_MANIFEST.stat().st_size, "sha256": digest(FRAME_MANIFEST)},
        "current_external_habahiro": {"path": EXTERNAL_HABAHIRO.name, "bytes": EXTERNAL_HABAHIRO.stat().st_size, "sha256": digest(EXTERNAL_HABAHIRO)},
        "degraded_contract": {"path": DEGRADED.name, "bytes": DEGRADED.stat().st_size, "sha256": digest(DEGRADED)},
        "degraded_scene": {"path": DEGRADED_SCENE.name, "bytes": DEGRADED_SCENE.stat().st_size, "sha256": digest(DEGRADED_SCENE)},
    }
    frame_rows = [{"anchor": row["anchor"], "event_sequence": row["event_sequence"], "sha256": row["sha256"], "size": [row["width"], row["height"]]} for row in frames["frames"]]
    oracle = {
        "schema_version": 1,
        "status": "confirmed-delivery-oracle-ordinary-exact-habahiro-degraded",
        "sample": trace["sample"],
        "delivery_profile": "ordinary-exact-habahiro-degraded",
        "fidelity": {
            "ordinary": "current-10.1.4-static-r1-physical-frame",
            "habahiro": "current-external-portable-assets-with-explicit-HA-D01-HA-D12-degradation",
            "visible_habahiro_label": "Approximate HABAHIRO",
            "automatic_fallback": False,
            "original_habahiro_runtime_or_frame_claim": False,
        },
        "evidence": evidence,
        "ordinary_runtime": {
            "events": len(events),
            "categories": dict(sorted(category_counts.items())),
            "anchors": trace["summary"]["anchors"],
            "relative_frames": trace["summary"]["relative_frame_count"],
            "object_aliases": trace["summary"]["object_alias_count"],
            "mesh_lifecycle_pairs": mesh_lifecycle_pairs,
            "line_lifecycle_pairs": line_lifecycle_pairs,
            "setup_order": setup_order,
            "first_judged_hud_order": hud_order,
            "pause_resume_phase_samples": trace["summary"]["pause_resume_phase_samples"],
            "static_noop_unhookable_targets": trace["capture"]["static_noop_unhookable_targets"],
        },
        "ordinary_frames": {"viewport": frames["viewport"], "count": len(frame_rows), "anchors": frame_rows, "privacy": frames["privacy"]},
        "habahiro_resources": {
            "source_status": external["status"],
            "asset_count": len(external["assets"]),
            "sprite_count": external["sprite_profile"]["sprite_count"],
            "family_counts": external["sprite_profile"]["family_counts"],
            "production_network_allowed": False,
            "local_hash_verified_provider_required": True,
            "original_unity_assetbundle_byte_parity": "open-not-claimed",
        },
        "habahiro_degraded_scene": {
            "max_note_count": degraded_scene["chart"]["max_note_count"],
            "multiple_directional_pool_capacity": degraded_scene["logical_scene"]["multiple_directional_pool_capacity"],
            "historical_sprite_key_count": degraded_scene["logical_scene"]["historical_sprite_key_count"],
            "difference_ids": [row["id"] for row in degraded["difference_matrix"]],
            "frame_oracle": None,
        },
        "rejections": sorted(set(portable["rejections"] + [
            "ordinary mode without the confirmed R1 and physical frame profile",
            "HABAHIRO mode without explicit exact or degraded fidelity selection",
            "HABAHIRO exact mode backed only by Bestdori portable exports",
            "production network fetch or automatic exact-to-degraded fallback",
        ])),
        "unknown_fields": [],
        "blocking_findings": [],
    }
    d_status = {
        "D01": "closed-current-10.1.4",
        "D02": "closed-current-local-plus-external-hab-portable",
        "D03": "closed-static-resource-r1",
        "D04": "closed-static-physical-frame",
        "D05": "closed-static-r1-mesh-lifecycle",
        "D06": "closed-static-r1-line-lifecycle",
        "D07": "closed-static-r1-field",
        "D08": "closed-degraded-not-original-parity-HA-D01-HA-D12",
        "D09": "closed-static-r1-frame-hud",
        "D10": "closed-static-r1-animation",
        "D11": "closed-r1-setup-and-hud-order",
        "D12": "closed-r1-alias-lifecycle",
        "D13": "closed-r1-relative-frame-freeze",
        "D14": "closed-portable-contract",
        "D15": "closed-portable-unity-ngui-pixi-mapping",
        "D16": "closed-ordinary-physical-hab-degraded-scene",
        "D17": "closed-fail-closed-contract-no-runtime-fault-claim",
        "D18": "closed-delivery-profile",
    }
    impacted = {"PR01", "PR04", "PR19", "PR40"}
    pr_status = {
        row["case"]: "confirmed-degraded-disclosed" if row["case"] in impacted else "confirmed-delivery"
        for row in fixed_cases["cases"]
    }
    closure = {
        "schema_version": 1,
        "status": "delivery-rendering-gate-closed-ordinary-exact-habahiro-degraded",
        "delivery_profile": oracle["delivery_profile"],
        "oracle": {"path": ORACLE_OUTPUT.name, "sha256": hashlib.sha256((json.dumps(oracle, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")).hexdigest().upper()},
        "version_gate": "closed",
        "offline_work_gate": "closed",
        "ordinary_runtime_gate": "closed",
        "ordinary_frame_gate": "closed",
        "habahiro_portable_resource_gate": "closed-current-external-fallback",
        "habahiro_exact_parity_gate": "open-not-claimed",
        "habahiro_degraded_delivery_gate": "closed",
        "rendering_delivery_gate": "closed",
        "production_authorization": True,
        "production_authorization_scope": "typed renderer and Pixi backend only when fidelity profile is explicit; ordinary exact/current, HABAHIRO degraded/labelled",
        "decision_status": d_status,
        "fixed_case_status": pr_status,
        "unknown_fields": [],
        "blocking_findings": [],
        "required_production_guards": [
            "prepare resources and verify all declared hashes before engine initialize mutation",
            "never fetch network resources in production or tests",
            "never silently fall back from exact HABAHIRO to degraded HABAHIRO",
            "always expose Approximate HABAHIRO when the degraded profile is selected",
            "exclude HABAHIRO degraded output from original parity and raster golden claims",
            "fail before domain mutation on missing profile/resource/hash/backend capability",
        ],
    }
    require(len(d_status) == 18 and len(pr_status) == 40, "D/PR closure count differs")
    return oracle, closure


def write(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")


def main() -> int:
    oracle, closure = build()
    write(ORACLE_OUTPUT, oracle)
    write(CLOSURE_OUTPUT, closure)
    print(f"delivery rendering oracle: events={oracle['ordinary_runtime']['events']} frames={oracle['ordinary_frames']['count']} HAB={oracle['habahiro_resources']['asset_count']}/{oracle['habahiro_resources']['sprite_count']} D={len(closure['decision_status'])} PR={len(closure['fixed_case_status'])} production=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
