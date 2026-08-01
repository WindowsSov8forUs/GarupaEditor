#!/usr/bin/env python3
"""Build the portable draft, fixed-case status and offline closure for rendering."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
STATIC = HERE / "resource_pixi_rendering_static_contract.json"
MIGRATION = HERE / "resource_pixi_rendering_instruction_migration.json"
RESOURCE = HERE / "resource_pixi_rendering_resource_contract.json"
HUD = HERE / "resource_pixi_rendering_hud_asset_profiles.json"
SKILL = HERE / "resource_pixi_rendering_skill_animation_profiles.json"
NOTE_ANIMATION = HERE / "resource_pixi_rendering_note_animation_profiles.json"
SCORE_UP = HERE / "resource_pixi_rendering_score_up_profile.json"
RUNTIME_TARGETS = HERE / "resource_pixi_rendering_runtime_hook_targets.json"
RUNTIME_PLAN = HERE / "runtime/resource-pixi-rendering-r1-plan.json"
FRAME_PLAN = HERE / "runtime/resource-pixi-rendering-frame-plan.json"
HABAHIRO_DEGRADED = HERE / "habahiro_degraded_approximation.json"
HABAHIRO_DEGRADED_SCENE = HERE / "habahiro_degraded_scene_oracle.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def evidence() -> dict[str, dict[str, Any]]:
    rows = {
        "F01": STATIC,
        "F02": MIGRATION,
        "F03": RESOURCE,
        "F04": HUD,
        "F05": SKILL,
        "F06": NOTE_ANIMATION,
        "F07": SCORE_UP,
        "F08": RUNTIME_TARGETS,
        "F09": RUNTIME_PLAN,
        "F10": FRAME_PLAN,
        "F11": HABAHIRO_DEGRADED,
        "F12": HABAHIRO_DEGRADED_SCENE,
    }
    return {
        evidence_id: {
            "path": path.relative_to(HERE).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": digest(path),
        }
        for evidence_id, path in rows.items()
    }


def build_portable_contract() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "status": "confirmed-offline-portable-draft-runtime-order-gate-open",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
        },
        "evidence": evidence(),
        "resource_profile": {
            "ownership": "prepared renderer backend only; engine receives logical immutable identifiers",
            "required_fields": [
                "schema_version", "sample", "pack_identity", "logical_asset_id", "role",
                "byte_length", "sha256", "mime", "dimensions", "texture_settings",
                "atlas_rows", "material_role", "animation_role",
            ],
            "preflight_order": [
                "validate complete profile shape",
                "reject duplicate logical IDs and exact keys",
                "read all declared bytes without creating renderer objects",
                "validate byte length and SHA-256",
                "decode dimensions and validate atlas rectangles",
                "validate all cross references and supported component mappings",
                "create backend objects atomically and enter ready",
            ],
            "network_allowed": False,
            "unityfs_parsing_in_engine": False,
            "fallback_alias_allowed": False,
            "placeholder_allowed": False,
            "habahiro_exact_status": "evidence-required-current-bundle-absent-from-cache-index",
            "habahiro_degraded_status": "explicit-profile-allowed-not-original-parity",
            "habahiro_degraded_profiles": ["historical-atlas-proxy", "current-ordinary-stretch-proxy"],
            "automatic_degraded_fallback_allowed": False,
            "evidence_ids": ["F03", "F04", "F05", "F06", "F07", "F11", "F12"],
        },
        "render_identity": {
            "fields": ["session_id", "sequence", "render_object_id", "pool_family", "role"],
            "rules": [
                "identity is authored by the engine owner and never inferred from Sprite name or array position",
                "identity cannot cross renderer sessions",
                "duplicate create/acquire is rejected before scene mutation",
                "release removes the identity only after evidence-ordered child/resource release",
            ],
            "runtime_order_status": "evidence-required",
        },
        "command_families": [
            {"name": "object-lifecycle", "operations": ["create", "acquire", "activate", "hide", "deactivate", "release"], "status": "schema-confirmed-order-runtime-required"},
            {"name": "resource-binding", "operations": ["bind-sprite", "bind-material", "bind-animation"], "status": "schema-confirmed-selected-profile-runtime-required"},
            {"name": "transform", "operations": ["set-position", "set-scale", "set-color", "set-alpha", "set-ordering", "set-mask"], "status": "schema-confirmed-values-runtime-required"},
            {"name": "geometry", "operations": ["set-mesh", "set-line", "set-threshold"], "status": "schema-confirmed-values-runtime-required"},
            {"name": "hud", "operations": ["set-score", "set-combo", "set-result", "set-life", "set-overlay", "play-animation", "stop-animation"], "status": "schema-confirmed-order-runtime-required"},
        ],
        "component_mapping": [
            {
                "source": "Unity SpriteRenderer",
                "portable": "sprite node",
                "exact_fields": ["Sprite key", "rect", "pivot", "pixels-per-unit", "transform", "color", "enabled", "sorting tuple", "mask interaction"],
                "status": "portable-equivalent-static-fields-confirmed-runtime-values-open",
                "evidence_ids": ["F01", "F03", "F06"],
            },
            {
                "source": "NGUI UISprite/UIAtlas",
                "portable": "atlas sprite node",
                "exact_fields": ["Sprite name", "rect", "border", "padding", "depth", "color", "width", "height"],
                "status": "portable-equivalent-static-fields-confirmed-runtime-values-open",
                "evidence_ids": ["F03", "F04", "F07"],
            },
            {
                "source": "MeshRenderer/MeshFilter",
                "portable": "indexed textured mesh",
                "exact_fields": ["vertices", "indices", "UV", "vertex color", "material role", "threshold", "ordering"],
                "status": "schema-confirmed-runtime-geometry-values-open",
                "evidence_ids": ["F01", "F02", "F03"],
            },
            {
                "source": "LineRenderer",
                "portable": "line or generated quad mesh",
                "exact_fields": ["endpoints", "width", "color", "material role", "threshold", "ordering"],
                "status": "schema-confirmed-runtime-endpoints-open",
                "evidence_ids": ["F01", "F02", "F03"],
            },
            {
                "source": "SpriteMask/VisibleInsideMask",
                "portable": "explicit mask node",
                "exact_fields": ["mask identity", "inside/outside mode", "ordering boundaries"],
                "status": "schema-confirmed-runtime-ordering-open",
                "evidence_ids": ["F01", "F03", "F04"],
            },
            {
                "source": "NGUI UILabel/UISpriteNumber/UISlider",
                "portable": "bitmap/dynamic text, digit run and clipped fill",
                "exact_fields": ["glyph or Sprite sequence", "LSF order", "padding", "alignment", "color", "depth", "fill ratio"],
                "status": "portable-equivalent-static-fields-confirmed-runtime-update-order-open",
                "evidence_ids": ["F01", "F04", "F07"],
            },
            {
                "source": "Animator/AnimationClip",
                "portable": "named deterministic animation clock",
                "exact_fields": ["state", "sample rate", "duration", "loop", "streamed coefficients", "constant channels", "events"],
                "status": "portable-equivalent-static-curves-confirmed-runtime-phase-open",
                "evidence_ids": ["F04", "F05", "F06"],
            },
        ],
        "ordering": {
            "portable_tuple": ["domain_layer", "source_depth_or_sorting_order", "source_z", "creation_sequence"],
            "status": "draft-static-sources-confirmed-runtime-cross-component-order-open",
            "pixi_zindex_default_allowed": False,
        },
        "float_policy": {
            "engine_values": "Float32 bits are frozen at the evidence-confirmed owner write",
            "backend_values": "the backend may widen to JavaScript number only after preserving the Float32 value",
            "implicit_clamp_allowed": False,
        },
        "rejections": [
            "missing or duplicate profile",
            "unknown logical role or exact key",
            "byte length or SHA-256 mismatch",
            "decode failure or dimension mismatch",
            "atlas rectangle outside texture",
            "unsupported texture, material, mask, animation or component mapping",
            "renderer not prepared",
            "duplicate or cross-session render identity",
            "out-of-order or unknown command",
            "HABAHIRO exact mode without a current confirmed HABAHIRO resource profile",
            "HABAHIRO degraded mode without explicit profile selection and visible fidelity label",
            "automatic fallback from exact HABAHIRO mode to a degraded profile",
        ],
        "production_authorization": False,
        "unknown_fields": [],
        "degraded_habahiro_policy": {
            "status": "delivery-authorized-exact-parity-open",
            "profile_selection": "explicit-only",
            "visible_label": "Approximate HABAHIRO",
            "parity_tests": "excluded",
            "directly_impacted_cases": ["PR01", "PR04", "PR19", "PR40"],
            "evidence_ids": ["F11", "F12"],
        },
        "blocking_findings": [
            "D13 runtime command freeze/order is not observed",
            "D15 cross-component runtime ordering and shader equivalence are not observed",
            "current HABAHIRO resource bytes are unavailable for exact parity",
        ],
    }


def case(case_id: str, status: str, evidence_ids: list[str], blocker: str | None = None) -> dict[str, Any]:
    row: dict[str, Any] = {"case": case_id, "status": status, "evidence_ids": evidence_ids}
    if blocker is not None:
        row["blocker"] = blocker
    return row


def build_fixed_case_status() -> dict[str, Any]:
    rows = [
        case("PR01", "partial-current-static", ["F03"], "current HABAHIRO resource record and bytes are absent"),
        case("PR02", "confirmed-current-static", ["F03"]),
        case("PR03", "confirmed-current-static", ["F03"]),
        case("PR04", "server-resource-required", ["F01", "F03"], "current HABAHIRO bundle must be obtained from the game resource service or a proven current cache"),
        case("PR05", "partial-current-static", ["F01", "F02", "F03"], "runtime missing-resource mutation and duplicate behavior remain unobserved"),
        case("PR06", "partial-current-static", ["F01", "F02", "F03"], "natural selected skin and bind order remain unobserved"),
        case("PR07", "partial-current-static", ["F01", "F02", "F03"], "runtime intermediate visibility and width bind remain unobserved"),
        case("PR08", "partial-current-static", ["F01", "F03", "F06"], "Animator pool phase and restart remain unobserved"),
        case("PR09", "partial-current-static", ["F01", "F02", "F03"], "side object identity and visibility order remain unobserved"),
        case("PR10", "runtime-live-required", ["F01", "F02"], "target/launcher/safe-area values require a natural Live scene"),
        case("PR11", "partial-current-static", ["F01", "F02", "F03"], "runtime generated vertices remain unobserved"),
        case("PR12", "runtime-live-required", ["F01", "F02"], "segment object ownership requires natural chart construction and activation"),
        case("PR13", "runtime-live-required", ["F01", "F02"], "runtime UV/color/width values require natural Note updates"),
        case("PR14", "partial-current-static", ["F01", "F03"], "runtime material instance and threshold writes remain unobserved"),
        case("PR15", "runtime-live-required", ["F01", "F02"], "mesh pool identity and lifecycle require natural Live"),
        case("PR16", "runtime-live-required", ["F01", "F02", "F03"], "sync-line identity, endpoints and hide/release order require natural Live"),
        case("PR17", "runtime-live-required", ["F01", "F02", "F03"], "multiple back-line complete XYZ requires natural Live"),
        case("PR18", "runtime-live-required", ["F01", "F03", "F04"], "cross-component mask and ordering require natural Live"),
        case("PR19", "runtime-live-required", ["F01", "F03"], "HABAHIRO flash Animation event and resource swap require natural Live and current bundle"),
        case("PR20", "runtime-live-required", ["F01", "F02"], "pool traversal and reuse identity require natural Live"),
        case("PR21", "runtime-live-required", ["F05", "F06"], "pause/resume phase requires natural Live"),
        case("PR22", "partial-current-static", ["F01", "F02", "F04"], "runtime update call and unchanged-value timing remain unobserved"),
        case("PR23", "confirmed-current-static-layout", ["F01", "F02", "F04"]),
        case("PR24", "partial-current-static", ["F04"], "runtime animation restart/hide phase remains unobserved"),
        case("PR25", "partial-current-static", ["F01", "F02", "F04"], "runtime Score update order remains unobserved"),
        case("PR26", "partial-current-static", ["F01", "F02", "F04"], "pool object identity and start time require natural Live"),
        case("PR27", "partial-current-static", ["F01", "F02", "F04"], "runtime lifetime start point requires natural Live"),
        case("PR28", "confirmed-current-static", ["F01", "F03", "F04", "F07"]),
        case("PR29", "partial-current-static", ["F01", "F02", "F04"], "same-frame Life update order requires natural Live"),
        case("PR30", "partial-current-static", ["F01", "F02", "F04"], "runtime warning suppression order requires natural Live"),
        case("PR31", "partial-current-static", ["F01", "F04", "F05"], "active Life Animator controller assignment and later-wins order require natural Live"),
        case("PR32", "partial-current-static", ["F01", "F04", "F05"], "play/stop caller order and phase require natural Live"),
        case("PR33", "runtime-live-required", ["F01"], "same-frame Reflect renderer command order requires natural Live"),
        case("PR34", "runtime-live-required", ["F01"], "Skill/Fever/GameOver renderer order requires natural Live"),
        case("PR35", "runtime-live-required", ["F03"], "original partial-mutation behavior requires natural loader observation"),
        case("PR36", "runtime-live-required", [], "backend reject/context-loss precedence has no original runtime observation"),
        case("PR37", "runtime-live-required", [], "fault/dispose release order requires runtime observation"),
        case("PR38", "runtime-live-required", [], "duplicate lifecycle and cross-session behavior require runtime observation"),
        case("PR39", "runtime-live-and-frame-required", [], "ordinary production command/scene/frame anchors require natural Live"),
        case("PR40", "runtime-live-and-frame-required", [], "HABAHIRO production command/scene/frame anchors require natural Live and current bundle"),
    ]
    return {
        "schema_version": 1,
        "status": "confirmed-offline-case-classification-server-gate-open",
        "evidence": evidence(),
        "cases": rows,
        "status_counts": {
            status: sum(1 for row in rows if row["status"] == status)
            for status in sorted({row["status"] for row in rows})
        },
        "degraded_habahiro_disposition": {
            "status": "accepted-for-explicit-preview-not-original-parity",
            "evidence_ids": ["F11", "F12"],
            "cases": {
                "PR01": "degraded-profile-resource-inventory",
                "PR04": "degraded-profile-exact-key-or-procedural-wide-proxy",
                "PR19": "two-stage-order-with-same-frame-or-caller-delay-approximation",
                "PR40": "diagnostic-scene-command-frame-only-not-golden",
            },
            "exact_case_statuses_unchanged": True,
        },
        "unknown_cases": [],
        "production_authorization": False,
    }


def build_offline_closure() -> dict[str, Any]:
    h_status = {
        "H01": "confirmed-current-static-resource",
        "H02": "confirmed-current-static-resource",
        "H03": "server-resource-required",
        "H04": "server-resource-required",
        "H05": "confirmed-current-static-asset-and-method-runtime-phase-open",
        "H06": "confirmed-current-static-prefab-and-method-runtime-identity-open",
        "H07": "confirmed-current-static-method-and-resource-runtime-bind-open",
        "H08": "confirmed-current-static-method-and-material-runtime-geometry-open",
        "H09": "confirmed-current-static-method-runtime-values-open",
        "H10": "confirmed-current-static-material-runtime-instance-open",
        "H11": "confirmed-current-static-prefab-and-method-runtime-values-open",
        "H12": "confirmed-current-static-method-and-resource-runtime-visibility-open",
        "H13": "confirmed-current-static-method-and-prefab-runtime-ownership-open",
        "H14": "confirmed-current-static-method-and-scene-runtime-event-open",
        "H15": "confirmed-current-static-scene-atlas-and-method-runtime-order-open",
        "H16": "confirmed-current-static-clip-and-method-runtime-phase-open",
        "H17": "confirmed-current-static-local-cache-atlas",
        "H18": "confirmed-current-static-method-and-sprite-route-runtime-order-open",
        "H19": "confirmed-current-static-scene-atlas-font-and-method-runtime-order-open",
        "H20": "confirmed-current-static-scene-font-prefab-and-method-runtime-order-open",
        "H21": "confirmed-current-static-scene-atlas-and-current-score-up-route",
        "H22": "confirmed-current-static-scene-atlas-curves-runtime-controller-and-order-open",
        "H23": "confirmed-current-static-scene-controller-clip-runtime-phase-open",
        "H24": "confirmed-current-static-scene-field-controller-clip-runtime-phase-open",
        "H25": "runtime-live-and-frame-required",
        "H26": "runtime-live-and-frame-required",
        "H27": "runtime-live-required",
        "H28": "runtime-live-required",
    }
    d_status = {
        "D01": "confirmed-current-static-runtime-call-order-open",
        "D02": "partial-current-static-server-resource-required",
        "D03": "partial-current-static-runtime-selected-profile-required",
        "D04": "partial-current-static-runtime-object-state-required",
        "D05": "partial-current-static-runtime-coordinate-values-required",
        "D06": "partial-current-static-runtime-generated-geometry-required",
        "D07": "partial-current-static-runtime-line-values-required",
        "D08": "partial-current-static-runtime-mask-and-habahiro-event-required",
        "D09": "runtime-live-required",
        "D10": "partial-current-static-runtime-update-order-required",
        "D11": "partial-current-static-runtime-update-order-and-controller-required",
        "D12": "partial-current-static-curves-confirmed-runtime-phase-required",
        "D13": "runtime-live-required",
        "D14": "portable-draft-confirmed-runtime-command-order-required",
        "D15": "partial-portable-mapping-runtime-order-and-shader-required",
        "D16": "runtime-live-and-frame-required",
        "D17": "runtime-live-required",
        "D18": "open-server-runtime-gate",
    }
    remaining = [
        {
            "id": "S01",
            "requirement": "obtain and hash the current ingameskin/noteskin/habahiro bundle through the game resource service or a proven current cache",
            "requires_game_server": True,
            "blocks_exact_parity": True,
            "blocks_degraded_habahiro_delivery": False,
        },
        {
            "id": "S02",
            "requirement": "naturally enter ordinary Live and, when available, HABAHIRO Live to capture R1 object/resource/caller/lifecycle traces",
            "requires_game_server": True,
            "ordinary_scope": "required-before-production",
            "habahiro_scope": "required-for-exact-parity; explicit degraded disposition accepted",
            "blocks_exact_parity": True,
            "blocks_degraded_habahiro_delivery": False,
        },
        {
            "id": "S03",
            "requirement": "capture privacy-safe 10.1.4 ordinary physical frame anchors and HABAHIRO anchors when naturally available",
            "requires_game_server": True,
            "ordinary_scope": "required-before-production",
            "habahiro_scope": "required-for-exact-parity; generated degraded frames are diagnostic-only",
            "blocks_exact_parity": True,
            "blocks_degraded_habahiro_delivery": False,
        },
    ]
    return {
        "schema_version": 1,
        "status": "offline-work-gate-closed-server-required-gate-open",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
        },
        "evidence": evidence(),
        "version_rebaseline": "partial-server-resource-and-runtime-gate",
        "offline_work_gate": "closed",
        "offline_plan_gate": "closed",
        "rendering_gate": "open",
        "habahiro_exact_parity_gate": "open",
        "habahiro_degraded_delivery_gate": "closed-authorized-by-explicit-user-request",
        "production_authorization": False,
        "historical_candidate_status": h_status,
        "decision_status": d_status,
        "degraded_habahiro": {
            "status": "accepted-for-delivery-not-original-parity",
            "profiles": ["historical-atlas-proxy", "current-ordinary-stretch-proxy"],
            "visible_label": "Approximate HABAHIRO",
            "automatic_fallback": False,
            "difference_count": 12,
            "directly_impacted_cases": ["PR01", "PR04", "PR19", "PR40"],
            "evidence_ids": ["F11", "F12"],
        },
        "runtime_capture_plan": {
            "status": "confirmed-observation-only-plan-game-server-required",
            "hook_target_count": 55,
            "r1_scenarios": ["ordinary-rendering-r1", "habahiro-rendering-r1"],
            "physical_frame_anchors": 13,
            "evidence_ids": ["F08", "F09", "F10"],
        },
        "remaining_blockers": remaining,
        "remaining_blockers_all_require_game_server": all(row["requires_game_server"] for row in remaining),
        "unknown_static_work": [],
        "unknown_fields": [],
    }


def write_json(name: str, value: dict[str, Any]) -> None:
    (HERE / name).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def main() -> int:
    write_json("resource_pixi_rendering_portable_contract.json", build_portable_contract())
    write_json("resource_pixi_rendering_fixed_case_status.json", build_fixed_case_status())
    write_json("offline_closure.json", build_offline_closure())
    print("offline closure: offline_work_gate=closed habahiro_degraded=authorized exact=open rendering=open blockers=S01,S02,S03")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
