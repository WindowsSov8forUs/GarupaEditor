#!/usr/bin/env python3
"""Build the explicit HABAHIRO degraded-rendering decision and difference matrix."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
STATIC = HERE / "resource_pixi_rendering_static_contract.json"
MIGRATION = HERE / "resource_pixi_rendering_instruction_migration.json"
RESOURCE = HERE / "resource_pixi_rendering_resource_contract.json"
FIXED_CASES = HERE / "resource_pixi_rendering_fixed_case_status.json"
CHART_METADATA = ROOT / "artifacts/investigations/score-life-state-runtime-contract-10-1-4/runtime-inputs/bms/786_miracle_april_habahiro_special.metadata.json"
CHART_ORACLE = ROOT / "artifacts/investigations/score-life-state-runtime-contract-10-1-4/score_life_state_chart_count_oracle.json"
HISTORICAL_ATLAS = ROOT / "artifacts/investigations/note-sprite-combination-lookup/habahiro_atlas_sources.json"
HISTORICAL_BINDINGS = ROOT / "artifacts/investigations/note-sprite-combination-lookup/habahiro_sprite_bindings.tsv"
HISTORICAL_LANE = ROOT / "artifacts/investigations/habahiro-lane-change/evidence.json"
ARM64 = HERE / "arm64"

METHODS = [
    ("NoteManager", "setupNoteSkin"),
    ("NoteImageController", "SetupNoteFileNameMap"),
    ("NoteImageController", "GetNoteSprite"),
    ("NoteMesh", "GetMeshWidthRate"),
    ("NoteAddLongMultipleDirectionalFlickVisual", "CreateInstances"),
    ("NoteBatchInformationListFactory", "IsEnableHabahiroChangeFlash"),
    ("ButtonManager", "ExecAwakeStart"),
    ("ButtonManager", "getEffectSkinBundleName"),
    ("ButtonManager", "onUpdateMusicPos"),
    ("ButtonManager", "changeLaneImage"),
    ("RhythmGameHabahiroFlashAnim", "AnimationComplete"),
    ("RhythmGameHabahiroFlashAnim", "ChangeLane"),
    ("RhythmGameHabahiroFlashAnim", ".ctor"),
]


def strict_json(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def source(path: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": digest(path),
    }


def method_rows() -> list[dict[str, Any]]:
    static = strict_json(STATIC)
    migration = strict_json(MIGRATION)
    static_by_key = {(row["owner"], row["method"]): row for row in static["methods"]}
    migration_by_key = {(row["owner"], row["method"]): row for row in migration["methods"]}
    rows = []
    for owner, method in METHODS:
        static_row = static_by_key.get((owner, method))
        migration_row = migration_by_key.get((owner, method))
        if static_row is None or migration_row is None:
            raise ValueError(f"missing current method: {owner}::{method}")
        rows.append({
            "owner": owner,
            "method": method,
            "rva": static_row["target_rva"],
            "end_rva": static_row["target_end_rva"],
            "arm64_sha256": static_row["target_sha256"],
            "arm64_evidence": static_row["evidence"],
            "migration_status": migration_row["status"],
        })
    return rows


def validate_current_arm64() -> dict[str, Any]:
    setup = (ARM64 / "03774c74__NoteManager__setupNoteSkin.arm64.tsv").read_text(encoding="utf-8")
    width = (ARM64 / "030e2038__NoteMesh__GetMeshWidthRate.arm64.tsv").read_text(encoding="utf-8")
    pool = (ARM64 / "030e60a4__NoteAddLongMultipleDirectionalFlickVisual__CreateInstances.arm64.tsv").read_text(encoding="utf-8")
    required_setup = [
        "0x3774DCC\t4C9EEE97\tbl #0x331c6fc\tAssetBundleNames$$get_HabahiroBundleName",
        "0x3774FB8\t5FCFEE97\tbl #0x3328d34\tAssetBundleNames$$GetInGameSkinNoteSkinBundleName",
    ]
    required_width = [
        "NoteBatchInformationListFactory$$get_IsMultiRangeNotes",
        "0x30E2078\t00102E1E\tfmov s0, #1.00000000",
        "0x30E20A4\t008440BD\tldr s0, [x0, #0x84]",
        "0x30E20B8\t0358231E\tfmin s3, s0, s3",
        "0x30E20C8\t205C221E\tfcsel s0, s1, s2, pl",
    ]
    required_pool = [
        "0x30E6194\t38008052\tmov w24, #1",
        "0x30E62B8\t1FF70071\tcmp w24, #0x3d",
        "System.Collections.Generic.List<object>$$ToArray",
    ]
    for value in required_setup:
        if value not in setup:
            raise ValueError(f"current setupNoteSkin fragment missing: {value}")
    for value in required_width:
        if value not in width:
            raise ValueError(f"current mesh-width fragment missing: {value}")
    for value in required_pool:
        if value not in pool:
            raise ValueError(f"current multiple pool fragment missing: {value}")
    return {
        "setup_note_skin": {
            "status": "confirmed-current-static-habahiro-suffix-and-bundle-name-route",
            "multi_range_suffix_call": "AssetBundleNames.get_HabahiroBundleName @ 0x3774DCC",
            "bundle_name_builder_call": "AssetBundleNames.GetInGameSkinNoteSkinBundleName @ 0x3774FB8",
        },
        "mesh_width": {
            "status": "confirmed-current-static-formula-runtime-setting-value-open",
            "ordinary_default": 1.0,
            "multi_range_setting_source": "runtime singleton Float32 at +0x84",
            "combination": "base + min(setting, 1.0) * coefficient when setting >= 0; base otherwise",
            "unknown": "runtime singleton value and selected enum branch in an inaccessible HABAHIRO Live",
        },
        "multiple_directional_pool": {
            "status": "confirmed-current-static-create-count-runtime-identity-open",
            "loop_start": 1,
            "exclusive_end": 61,
            "created_instances": 60,
            "unknown": "natural pool identity, reuse and release sequence",
        },
    }


def historical_profile() -> dict[str, Any]:
    atlas = strict_json(HISTORICAL_ATLAS)
    with HISTORICAL_BINDINGS.open(encoding="utf-8", newline="") as source_file:
        bindings = list(csv.DictReader(source_file, delimiter="\t"))
    if len(bindings) != 179:
        raise ValueError("historical HABAHIRO binding count mismatch")
    family_counts: dict[str, int] = {}
    for row in bindings:
        family_counts[row["logical_family"]] = family_counts.get(row["logical_family"], 0) + 1
    pivots = [list(value) for value in sorted({(row["pivot_x"], row["pivot_y"]) for row in bindings})]
    ppu = sorted({row["ppu"] for row in bindings})
    return {
        "status": "historical-10.1.3-unversioned-external-candidate-not-current-evidence",
        "bundle_name": atlas["bundle_name"],
        "bundle_export_sha256": atlas["bundle_export_sha256"].upper(),
        "sprite_metadata_sha256": atlas["sprite_metadata_sha256"].upper(),
        "sprite_count": len(bindings),
        "family_counts": family_counts,
        "texture_count": len(atlas["textures"]),
        "texture_profiles": {
            name: {
                "sha256": value["sha256"].upper(),
                "size": value["size"],
                "families": value["families"],
            }
            for name, value in atlas["textures"].items()
        },
        "pivots": pivots,
        "pixels_per_unit": ppu,
        "binary_committed": False,
        "version_equivalence_to_10_1_4": "unproven",
        "allowed_use": "explicit degraded preview only; never current parity evidence",
    }


def current_resource_proxies() -> dict[str, Any]:
    resource = strict_json(RESOURCE)
    bundles = {row["bundle_name"]: row for row in resource["ingameskin_bundles"]}
    selected = {}
    for name in (
        "ingameskin/noteskin/skin00",
        "ingameskin/noteskin/skin01",
        "ingameskin/noteskin/directionalflickskin01",
        "ingameskin/fieldskin/skin00",
        "ingameskin/judgeskin/skin00",
    ):
        row = bundles[name]
        selected[name] = {
            "bytes": row["bundle_bytes"],
            "sha256": row["bundle_sha256"],
            "sprite_count": len(row["sprites"]),
            "texture_count": len(row["textures"]),
        }
    return selected


def difference_matrix() -> list[dict[str, Any]]:
    return [
        {"id": "HA-D01", "area": "resource-version", "severity": "critical", "exact_status": "open", "approximation": "use user-supplied historical bundle/PNG bytes matching pinned hashes", "possible_difference": "10.1.4 may contain changed pixels, rects, pivots, PPU, texture settings, materials or additional objects", "detectable_without_live": "only if a current bundle is later obtained and byte/object compared"},
        {"id": "HA-D02", "area": "wide-note-artwork", "severity": "high", "exact_status": "open", "approximation": "prefer 179 historical exact combination rows; secondary proxy stretches/composes current ordinary single-lane art", "possible_difference": "secondary proxy distorts borders, highlights, flick tops and long/flash artwork; historical proxy may be version-stale", "detectable_without_live": "current bundle required for exact comparison"},
        {"id": "HA-D03", "area": "bundle-selection-runtime", "severity": "medium", "exact_status": "current-static-route-confirmed-runtime-selection-open", "approximation": "select degraded profile directly when chart is multi-range", "possible_difference": "original special-skin/master overrides and loader failure order are bypassed", "detectable_without_live": "natural selected profile trace required"},
        {"id": "HA-D04", "area": "mesh-width-setting", "severity": "medium", "exact_status": "current-formula-confirmed-runtime-input-open", "approximation": "require an explicit host width setting; do not supply an implicit default", "possible_difference": "host value may differ from inaccessible original session singleton +0x84", "detectable_without_live": "original runtime value required"},
        {"id": "HA-D05", "area": "multiple-directional-pool", "severity": "medium", "exact_status": "current-create-count-60-confirmed-runtime-identity-open", "approximation": "allocate deterministic chart/session identities and reuse in chart order", "possible_difference": "acquire/reuse/release identity and same-frame visibility order may differ", "detectable_without_live": "natural object trace required"},
        {"id": "HA-D06", "area": "lane-change-trigger", "severity": "low", "exact_status": "current-static-two-stage-semantics-confirmed", "approximation": "preserve marker->flash-start->change-lane ordering", "possible_difference": "none expected in domain order; renderer timing remains HA-D07", "detectable_without_live": "current methods are instruction-equivalent; runtime still verifies phase"},
        {"id": "HA-D07", "area": "lane-change-animation", "severity": "high", "exact_status": "clip-event-time-curves-and-Root_effect-open", "approximation": "omit Root_effect and apply line swap in the same engine frame after flash-start; optionally accept an explicit caller delay", "possible_difference": "missing flash particles/color/alpha, wrong event delay and no original completion phase", "detectable_without_live": "current effect bundle or natural frame trace required"},
        {"id": "HA-D08", "area": "field-and-judge-swap", "severity": "high", "exact_status": "four assignments-confirmed-current-resource-bytes-open", "approximation": "reposition/scale current field/judge resources and swap semantic state immediately", "possible_difference": "line/judge textures, mask boundaries, widths, colors and sorting may differ", "detectable_without_live": "current HABAHIRO field/effect bundle required"},
        {"id": "HA-D09", "area": "mask-material-shader", "severity": "high", "exact_status": "runtime-instance-and-frame-open", "approximation": "use portable alpha mask and standard material role", "possible_difference": "SpriteMask interaction, threshold, blend, transparent sorting and edge sampling may differ", "detectable_without_live": "runtime material snapshot and physical frame required"},
        {"id": "HA-D10", "area": "HUD-wide-judge", "severity": "medium", "exact_status": "current-route-static-runtime-bind-open", "approximation": "use current standard judge/HUD assets", "possible_difference": "wide-mode judge Sprite, depth, position or timing may differ", "detectable_without_live": "HABAHIRO scene/HUD trace required"},
        {"id": "HA-D11", "area": "command-lifecycle", "severity": "medium", "exact_status": "runtime-order-pause-reset-fault-dispose-open", "approximation": "project current static owner order into deterministic commands and use ordinary lifecycle policy", "possible_difference": "same-frame order, pause clock, Retry/reset and partial failure mutation may differ", "detectable_without_live": "natural R1 trace required"},
        {"id": "HA-D12", "area": "physical-raster", "severity": "critical", "exact_status": "no-10.1.4-habahiro-frame", "approximation": "generated frames are diagnostic previews only and never golden expected", "possible_difference": "all pixel-level output can differ through resources, transforms, animation phase, sampling, masks, sorting and GPU", "detectable_without_live": "cannot be closed without an original framebuffer"},
    ]


def build_contract() -> dict[str, Any]:
    chart = strict_json(CHART_METADATA)
    chart_oracle = strict_json(CHART_ORACLE)
    lane = strict_json(HISTORICAL_LANE)
    fixed = strict_json(FIXED_CASES)
    impacted_cases = [row["case"] for row in fixed["cases"] if "habahiro" in json.dumps(row, ensure_ascii=False).lower()]
    current_methods = method_rows()
    equivalent_methods = [f"{row['owner']}::{row['method']}" for row in current_methods if row["migration_status"] == "normalized-instruction-equivalent"]
    changed_methods = [f"{row['owner']}::{row['method']}" for row in current_methods if row["migration_status"] == "changed-semantic-instruction-shape"]
    return {
        "schema_version": 1,
        "status": "confirmed-explicit-degraded-habahiro-decision-not-original-parity",
        "sample": {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"},
        "question": "Can unavailable natural HABAHIRO Live evidence be replaced, or only approximated?",
        "decision": {
            "exact_whole_gate_replacement_available": False,
            "exact_s01_resource_recovery_paths": [
                "read-only direct retrieval of the current logical bundle from the game resource service with version/hash provenance",
                "a proven 10.1.4 device cache containing the current logical bundle",
                "byte equality between a later current bundle and the historical pinned export",
            ],
            "exact_s02_runtime_replacement_available": False,
            "exact_s03_frame_replacement_available": False,
            "degraded_delivery_path_available": True,
            "selected_policy": "dual-track: preserve exact parity gate, allow an explicit degraded HABAHIRO preview gate",
        },
        "gate_policy": {
            "habahiro_exact_parity_gate": "open",
            "habahiro_degraded_delivery_gate": "closed-authorized-by-explicit-user-request",
            "overall_rendering_gate": "open-ordinary-runtime-and-contract-work-remain",
            "production_authorization": False,
            "future_production_condition": "an approximation profile must be explicitly selected; automatic fallback is forbidden",
            "parity_claim_allowed": False,
        },
        "mandatory_runtime_surface": {
            "mode": "approximate-habahiro",
            "visible_label": "Approximate HABAHIRO",
            "telemetry_or_result_flag": "rendering-fidelity-degraded-habahiro",
            "silent_fallback": False,
            "parity_tests": "excluded; use a separate approximation regression suite",
            "exact_mode_without_current_resource": "evidence-required before any renderer mutation",
        },
        "current_confirmed": {
            "sources": {
                "static": source(STATIC),
                "migration": source(MIGRATION),
                "resource": source(RESOURCE),
                "chart_metadata": source(CHART_METADATA),
                "chart_oracle": source(CHART_ORACLE),
            },
            "chart": {
                "asset": chart["asset"]["asset_name"],
                "bytes": chart["asset"]["bytes"],
                "sha256": chart["asset"]["sha256"],
                "max_note_count": chart_oracle["charts"]["habahiro"]["derived"]["max_note_count"],
                "lane_change_absolute_position": lane["production_command"]["absolute_position"],
            },
            "methods": current_methods,
            "normalized_equivalent_methods": equivalent_methods,
            "changed_shape_methods_with_current_dedicated_findings": changed_methods,
            "current_arm64_findings": validate_current_arm64(),
            "resource_proxies": current_resource_proxies(),
        },
        "historical_candidate": {
            "sources": {
                "atlas": source(HISTORICAL_ATLAS),
                "bindings": source(HISTORICAL_BINDINGS),
                "lane_change": source(HISTORICAL_LANE),
            },
            "atlas_profile": historical_profile(),
            "lane_change_sample": lane["sample"],
            "allowed_claim": "closest known historical visual candidate only",
        },
        "profiles": [
            {
                "profile_id": "historical-atlas-proxy",
                "priority": 1,
                "availability": "requires user-supplied local bytes matching the pinned historical bundle/texture hashes",
                "note_art": "use all 179 exact historical Sprite rows",
                "directional_art": "use current directionalflickskin01",
                "field": "use current field/judge resources with semantic lane-state projection",
                "lane_change": "preserve two-stage order; omit Root_effect; default approximation applies swap in the same engine frame after flash-start",
                "expected_difference_level": "high",
            },
            {
                "profile_id": "current-ordinary-stretch-proxy",
                "priority": 2,
                "availability": "uses current cached ordinary/directional/field/judge resources",
                "note_art": "stretch or compose current ordinary single-lane Sprite art to the contiguous range",
                "directional_art": "use current directionalflickskin01",
                "field": "use current field/judge resources with semantic lane-state projection",
                "lane_change": "preserve two-stage order; omit Root_effect; same-frame swap after flash-start",
                "expected_difference_level": "very-high",
            },
        ],
        "difference_matrix": difference_matrix(),
        "directly_impacted_fixed_cases": impacted_cases,
        "acceptance": {
            "degraded_preview_may_continue": True,
            "original_parity_may_close": False,
            "required_tests": [
                "explicit profile selection and visible degraded label",
                "no silent fallback from exact to approximate mode",
                "current chart structure and exact Sprite-key generation",
                "historical/local resource hash rejection before mutation",
                "deterministic approximation scene/command regression",
                "all HA-D01-HA-D12 differences remain machine-readable and documented",
            ],
            "unknown_fields": [],
            "blocking_findings_for_exact_parity": ["S01-current-resource", "S02-habahiro-natural-runtime", "S03-habahiro-original-frame"],
        },
    }


def build_scene_oracle(contract: dict[str, Any]) -> dict[str, Any]:
    with HISTORICAL_BINDINGS.open(encoding="utf-8", newline="") as source_file:
        bindings = list(csv.DictReader(source_file, delimiter="\t"))
    sprite_keys = [row["sprite_name"] for row in bindings]
    if len(sprite_keys) != len(set(sprite_keys)):
        raise ValueError("historical HABAHIRO Sprite keys are not unique")
    return {
        "schema_version": 1,
        "status": "confirmed-diagnostic-degraded-scene-oracle-not-original-frame",
        "sample": contract["sample"],
        "fidelity": {
            "mode": "approximate-habahiro",
            "visible_label": "Approximate HABAHIRO",
            "original_parity": False,
            "generated_frames_are_original_expected": False,
            "automatic_fallback": False,
        },
        "chart": contract["current_confirmed"]["chart"],
        "logical_scene": {
            "historical_sprite_keys": sprite_keys,
            "historical_sprite_key_count": len(sprite_keys),
            "current_directional_profile": "ingameskin/noteskin/directionalflickskin01",
            "current_field_profile": "ingameskin/fieldskin/skin00",
            "current_judge_profile": "ingameskin/judgeskin/skin00",
            "multiple_directional_pool_capacity": contract["current_confirmed"]["current_arm64_findings"]["multiple_directional_pool"]["created_instances"],
            "mesh_width_policy": "require explicit host setting; apply current static formula; no implicit default",
        },
        "degraded_command_order": [
            "explicitly select approximate-habahiro profile",
            "preflight all selected local resource hashes and Sprite keys",
            "emit visible Approximate HABAHIRO fidelity label",
            "construct deterministic chart/session render identities",
            "bind historical exact-combination art or current ordinary stretch proxy",
            "at position 1728 emit habahiro-flash-start",
            "omit unavailable Root_effect",
            "in the same engine frame after flash-start emit habahiro-change-lane unless an explicit caller delay is supplied",
            "swap to projected current field/judge semantic state",
            "retain generated frames as diagnostic approximation output only",
        ],
        "profiles": [row["profile_id"] for row in contract["profiles"]],
        "difference_ids": [row["id"] for row in contract["difference_matrix"]],
        "directly_impacted_fixed_cases": contract["directly_impacted_fixed_cases"],
        "frame_oracle": None,
        "scene_or_command_parity_claim": False,
        "production_authorization": False,
    }


def main() -> int:
    contract = build_contract()
    scene_oracle = build_scene_oracle(contract)
    (HERE / "habahiro_degraded_approximation.json").write_text(
        json.dumps(contract, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n"
    )
    (HERE / "habahiro_degraded_scene_oracle.json").write_text(
        json.dumps(scene_oracle, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"HABAHIRO degraded decision: methods={len(contract['current_confirmed']['methods'])} sprites={scene_oracle['logical_scene']['historical_sprite_key_count']} differences={len(contract['difference_matrix'])} impacted={','.join(contract['directly_impacted_fixed_cases'])} exact=open degraded=authorized")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
