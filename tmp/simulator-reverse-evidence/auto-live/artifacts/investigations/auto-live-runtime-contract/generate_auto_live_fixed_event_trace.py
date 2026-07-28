from __future__ import annotations

import json
import struct
from pathlib import Path


HERE = Path(__file__).resolve().parent


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def bits(value: float) -> str:
    return f"0x{struct.unpack('<I', struct.pack('<f', f32(value)))[0]:08X}"


def position(value: float) -> dict[str, object]:
    value = f32(value)
    return {"value": value, "bits": bits(value)}


def step(
    outer_frame: int,
    substep: int,
    adjusted: float,
    event: str,
    state_before: str,
    state_after: str,
    slot: int | None = None,
    **extra: object,
) -> dict[str, object]:
    row: dict[str, object] = {
        "outer_frame": outer_frame,
        "substep": substep,
        "adjusted_position": position(adjusted),
        "event": event,
        "state_before": state_before,
        "state_after": state_after,
        "one_frame_slot": slot,
    }
    row.update(extra)
    return row


def source(family: str, index: int = 0) -> dict[str, object]:
    return {
        "chart": f"method-fixture://auto-live/{family}",
        "note_index": index,
        "family": family,
        "classification": "method-fixture-not-runtime-chart",
    }


def build() -> dict[str, object]:
    cases: list[dict[str, object]] = []

    cases.append(
        {
            "case_id": "single-normal-before-equal",
            "evidence": ["R02:single", "E01", "E02", "E03"],
            "source_note": source("normal", 100),
            "settings": {
                "is_auto_live": True,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 119.99999237060547, "no-crossing", "Move", "Move"),
                step(1, 0, 120.0, "head-perfect", "Move", "Deactive", 0,
                     raw_result=4, adjusted_result=4, add_combo=1, judge_timing=0),
                step(1, 0, 120.0, "reflect", "Deactive", "Deactive", None,
                     slots=[0], entry_count=1, add_combo=1),
            ],
        }
    )

    cases.append(
        {
            "case_id": "single-manual-does-not-force",
            "evidence": ["R02:is-auto-play", "E02", "E03"],
            "source_note": source("normal", 101),
            "settings": {
                "is_auto_live": False,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 120.0, "manual-crossing-no-force-perfect", "Move", "Move"),
            ],
        }
    )

    cases.append(
        {
            "case_id": "flick-base-first-single-result",
            "evidence": ["R02:flick", "E06", "R05:0x3A77768", "R05:0x30EAD54"],
            "source_note": source("flick", 102),
            "settings": {
                "is_auto_live": True,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 120.0, "flick-begin", "Move", "Move", None,
                     submitted_result=4),
                step(0, 0, 120.0, "flick-synthetic-move", "Move", "Move", None,
                     synthetic_x=position(-100.0)),
                step(0, 0, 120.0, "head-perfect", "Move", "Deactive", 0,
                     raw_result=4, adjusted_result=4, note_type=3,
                     add_combo=1, judge_timing=0),
                step(0, 0, 120.0, "reflect", "Deactive", "Deactive", None,
                     slots=[0], entry_count=1, add_combo=1),
            ],
        }
    )

    for case_id, source_type, synthetic_x in (
        ("directional-left-synthetic", 10, -500.0),
        ("directional-right-synthetic", 11, 500.0),
    ):
        cases.append(
            {
                "case_id": case_id,
                "evidence": ["R02:directional-flick", "R05:0x30EA108"],
                "source_note": source("directional-flick", 103 if source_type == 10 else 104),
                "settings": {
                    "is_auto_live": True,
                    "judgement_adjust_value_b": 0,
                    "result_transform": "identity-no-active-situation-skill",
                },
                "steps": [
                    step(0, 0, 120.0, "flick-begin", "Move", "Move", None,
                         submitted_result=4),
                    step(0, 0, 120.0, "flick-synthetic-move", "Move", "Move", None,
                         source_note_type=source_type, synthetic_x=position(synthetic_x)),
                    step(0, 0, 120.0, "head-perfect", "Move", "Deactive", 0,
                         raw_result=4, adjusted_result=4, note_type=9,
                         add_combo=1, judge_timing=0),
                    step(0, 0, 120.0, "reflect", "Deactive", "Deactive", None,
                         slots=[0], entry_count=1, add_combo=1),
                ],
            }
        )

    cases.append(
        {
            "case_id": "long-head-equal-tail-strict-greater",
            "evidence": ["R02:long", "E09", "E10", "E11", "E12", "E13"],
            "source_note": source("long", 105),
            "settings": {
                "is_auto_live": True,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 120.0, "head-perfect", "Move", "Wait", 0,
                     raw_result=4, adjusted_result=4, add_combo=1, judge_timing=0),
                step(0, 0, 120.0, "reflect", "Wait", "Wait", None,
                     slots=[0], entry_count=1, add_combo=1),
                step(1, 0, 240.0, "tail-equal-no-crossing", "Wait", "Wait"),
                step(2, 0, 240.00001525878906, "long-linked-after-finish", "Wait", "Wait"),
                step(2, 0, 240.00001525878906, "tail-perfect", "Wait", "Deactive", 0,
                     raw_result=4, adjusted_result=4, add_combo=1, judge_timing=0),
                step(2, 0, 240.00001525878906, "reflect", "Deactive", "Deactive", None,
                     slots=[0], entry_count=1, add_combo=1),
            ],
        }
    )

    cases.append(
        {
            "case_id": "slide-one-pending-node-per-update",
            "evidence": ["R02:slide", "E14", "E15", "E16", "E17", "E18", "E19", "E20"],
            "source_note": source("slide", 106),
            "settings": {
                "is_auto_live": True,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 120.0, "head-perfect", "Move", "Wait", 0,
                     current_after_index=0, raw_result=4, adjusted_result=4,
                     add_combo=1, judge_timing=0),
                step(0, 0, 120.0, "reflect", "Wait", "Wait", None,
                     slots=[0], entry_count=1, add_combo=1),
                step(1, 0, 200.0, "intermediate-perfect", "Wait", "Wait", 0,
                     node_position=180, current_after_before=0, current_after_after=1,
                     raw_result=4, adjusted_result=4, add_combo=1, judge_timing=0),
                step(1, 0, 200.0, "reflect", "Wait", "Wait", None,
                     slots=[0], entry_count=1, add_combo=1),
                step(2, 0, 200.0, "intermediate-perfect", "Wait", "Wait", 0,
                     node_position=181, current_after_before=1, current_after_after=2,
                     raw_result=4, adjusted_result=4, add_combo=1, judge_timing=0),
                step(2, 0, 200.0, "reflect", "Wait", "Wait", None,
                     slots=[0], entry_count=1, add_combo=1),
                step(3, 0, 240.0, "tail-perfect", "Wait", "Deactive", 0,
                     node_position=240, current_after_before=2, current_after_after=3,
                     raw_result=4, adjusted_result=4, add_combo=1, judge_timing=0),
                step(3, 0, 240.0, "reflect", "Deactive", "Deactive", None,
                     slots=[0], entry_count=1, add_combo=1),
            ],
        }
    )

    cases.append(
        {
            "case_id": "slide-invisible-support-skipped-before-visible",
            "evidence": ["R02:slide-invisible-selection", "E14", "E15", "E18"],
            "source_note": source("slide", 107),
            "settings": {
                "is_auto_live": True,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 180.0, "invisible-support-no-one-frame", "Wait", "Wait", None,
                     current_after_before=0, current_after_after=1),
                step(1, 0, 192.0, "intermediate-perfect", "Wait", "Wait", 0,
                     current_after_before=1, current_after_after=2,
                     raw_result=4, adjusted_result=4, add_combo=1, judge_timing=0),
                step(1, 0, 192.0, "reflect", "Wait", "Wait", None,
                     slots=[0], entry_count=1, add_combo=1),
            ],
        }
    )

    cases.append(
        {
            "case_id": "simultaneous-reverse-update-five-slot-pool",
            "evidence": ["R02:one-frame", "E24", "E26", "U03"],
            "source_note": source("normal", 200),
            "settings": {
                "is_auto_live": True,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                *[
                    step(0, 0, 120.0, "head-perfect", "Move", "Deactive", slot,
                         note_index=note_index, raw_result=4, adjusted_result=4,
                         add_combo=1, judge_timing=0)
                    for slot, note_index in enumerate((204, 203, 202, 201, 200))
                ],
                step(0, 0, 120.0, "reflect", "Deactive", "Deactive", None,
                     slots=[0, 1, 2, 3, 4], entry_count=5, add_combo=5,
                     note_indices=[204, 203, 202, 201, 200]),
            ],
        }
    )

    cases.append(
        {
            "case_id": "adaptive-substeps-one-outer-reflect",
            "evidence": ["R02:reflect-owner", "E26", "U03", "U04"],
            "source_note": source("normal", 300),
            "settings": {
                "is_auto_live": True,
                "judgement_adjust_value_b": 0,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 120.0, "head-perfect", "Move", "Deactive", 0,
                     note_index=300, raw_result=4, adjusted_result=4,
                     add_combo=1, judge_timing=0),
                step(0, 1, 121.0, "head-perfect", "Move", "Deactive", 1,
                     note_index=301, raw_result=4, adjusted_result=4,
                     add_combo=1, judge_timing=0),
                step(0, 2, 122.0, "head-perfect", "Move", "Deactive", 2,
                     note_index=302, raw_result=4, adjusted_result=4,
                     add_combo=1, judge_timing=0),
                step(0, 2, 122.0, "reflect", "Deactive", "Deactive", None,
                     slots=[0, 1, 2], entry_count=3, add_combo=3,
                     note_indices=[300, 301, 302]),
            ],
        }
    )

    cases.append(
        {
            "case_id": "adjustment-sign-crossing",
            "evidence": ["R02:adjusted-position", "E02", "E30", "U03"],
            "source_note": source("normal", 400),
            "settings": {
                "is_auto_live": True,
                "result_transform": "identity-no-active-situation-skill",
            },
            "steps": [
                step(0, 0, 120.0, "adjustment-sample", "Move", "Move", None,
                     judgement_adjust_value_b=-5, relation="rewind-five-tempo-aware-steps"),
                step(0, 0, 120.0, "adjustment-sample", "Move", "Move", None,
                     judgement_adjust_value_b=0, relation="identity"),
                step(0, 0, 120.0, "adjustment-sample", "Move", "Move", None,
                     judgement_adjust_value_b=5, relation="advance-five-tempo-aware-steps"),
            ],
        }
    )

    return {
        "schema_version": 1,
        "sample": "jp.co.craftegg.band 10.1.3 (229) arm64-v8a",
        "status": "confirmed-static-contract-fixed-offline-oracle",
        "generator": "generate_auto_live_fixed_event_trace.py",
        "excluded_by_stage": [
            "score",
            "power",
            "life",
            "skill",
            "fever",
            "crescendo",
            "audio",
            "particle",
            "rendering",
            "hud",
        ],
        "cases": cases,
    }


def main() -> None:
    output = HERE / "auto_live_fixed_event_trace.json"
    output.write_text(
        json.dumps(build(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(output.relative_to(HERE.parents[2]).as_posix())


if __name__ == "__main__":
    main()
