#!/usr/bin/env python3
"""Build the privacy-minimized deck aggregate oracle from the committed R1 trace."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
import struct
from typing import Any


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "deck-aggregate-profile-retry.trace.json.gz"
PLAN = ROOT / "runtime" / "deck-aggregate-profile-retry-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_deck_aggregate_profile.py"
STATIC = ROOT / "score_life_state_static_contract.json"
CALC_ARM64 = ROOT / "arm64" / "0331e0ac__ScoreUtility__calcTotalParameter.arm64.tsv"
OUTPUT = ROOT / "score_life_deck_aggregate_profile_oracle.json"
SOURCE_COMMIT = "0bdb5cd59494076d92d3d5d6596608af476fec3e"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_trace() -> dict[str, Any]:
    return json.loads(gzip.decompress(TRACE.read_bytes()))


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def bits(value: float) -> str:
    return f"0x{struct.unpack('<I', struct.pack('<f', value))[0]:08X}"


def events(trace: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    return [event for event in trace["events"] if event["kind"] == kind]


def main() -> int:
    trace = load_trace()
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    contract = json.loads(STATIC.read_text(encoding="utf-8"))
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace is not confirmed R1")
    require(trace["sample"]["libil2cpp_sha256"] == LIB_SHA256, "trace binary differs")
    require(trace["sample"]["global_metadata_sha256"] == METADATA_SHA256, "trace metadata differs")
    require(trace["plan_sha256"] == digest(PLAN), "trace plan hash differs")
    require(trace["capture_script_sha256"] == digest(CAPTURE), "trace capture hash differs")
    require(plan["privacy"]["deck_member_rows_allowed"] is False, "member-row privacy boundary differs")
    require(contract["target"]["libil2cpp_sha256"] == LIB_SHA256, "static contract binary differs")

    aggregate_events = events(trace, "ScoreUtility.calcTotalParameter.aggregates")
    result_events = events(trace, "ScoreUtility.calcTotalParameter.result")
    array_events = events(trace, "ScoreUtility.calcTotalParameter.array")
    start_event = events(trace, "ScoreUtility.InitBaseScore.start_data")[0]
    leave_event = events(trace, "ScoreUtility.InitBaseScore.leave")[0]
    require(len(aggregate_events) == len(result_events) == 2, "aggregate invocation count differs")
    require(len(array_events) == 12, "array loop observation count differs")
    require(all(event["deck_array"]["length"] == 5 for event in array_events), "deck array length differs")
    require(all(event["privacy"] == {"member_pointers_omitted": True, "member_rows_omitted": True, "account_fields_included": False} for event in array_events), "array privacy differs")
    first = aggregate_events[0]
    require(all(event["component_2c"] == first["component_2c"] and event["component_30"] == first["component_30"] and event["component_34"] == first["component_34"] for event in aggregate_events), "aggregate values are not stable")
    require(all(event["total_parameter"] == result_events[0]["total_parameter"] for event in result_events), "total result is not stable")
    first_sum = f32(first["component_2c"]["value"] + first["component_30"]["value"])
    recomputed_total = f32(first["component_34"]["value"] + first_sum)
    require(bits(first_sum) == "0x47FB547A", "first aggregate addition differs")
    require(bits(recomputed_total) == result_events[0]["total_parameter"]["bits"] == "0x483C8A31", "aggregate total recomputation differs")
    require(start_event["score_utility"]["total_parameter"]["bits"] == bits(recomputed_total), "start-data total differs")
    require(leave_event["score_utility"]["base_score"]["bits"] == "0x4434718E", "base score correlation differs")

    sources = []
    for path in (TRACE, PLAN, CAPTURE, STATIC, CALC_ARM64):
        sources.append({"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)})
    result = {
        "schema_version": 1,
        "status": "confirmed-r1-ordinary-deck-aggregate-partial-member-rows",
        "source_commit": SOURCE_COMMIT,
        "sample": trace["sample"],
        "sources": sources,
        "production_chart": plan["production_chart"],
        "privacy": trace["privacy"],
        "deck_aggregate": {
            "array_identity": {"pointer": array_events[0]["deck_array"]["pointer"], "length": 5, "elements_omitted": True},
            "invocations": 2,
            "loop_observations": 12,
            "component_2c": first["component_2c"],
            "component_30": first["component_30"],
            "component_34": first["component_34"],
            "first_addition": {"value": first_sum, "bits": bits(first_sum)},
            "total_parameter": result_events[0]["total_parameter"],
            "operation_order": "Float32(component_2c + component_30), then Float32(component_34 + prior)",
            "repeat_invocations_identical": True,
        },
        "initialization_correlation": {
            "score_level": start_event["start_data"]["score_level"],
            "score_level_rate": start_event["score_utility"]["score_level_rate"],
            "base_score": leave_event["score_utility"]["base_score"],
            "bonus_base_score": leave_event["score_utility"]["bonus_base_score"],
        },
        "unknown_fields": ["deck.member_rows"],
        "blocking_findings": ["D23-deck-member-rows-privacy"],
        "business_state_gate": "open",
        "production_authorization": False,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"built {OUTPUT.name}: invocations=2 members=5 total=0x483C8A31 unknown=1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
