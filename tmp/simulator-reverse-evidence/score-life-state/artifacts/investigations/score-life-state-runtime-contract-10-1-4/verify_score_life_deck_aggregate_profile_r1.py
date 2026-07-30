#!/usr/bin/env python3
"""Independently verify the deck aggregate R1 trace and frozen oracle."""

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
ORACLE = ROOT / "score_life_deck_aggregate_profile_oracle.json"
SOURCE_COMMIT = "0bdb5cd59494076d92d3d5d6596608af476fec3e"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def bits(value: float) -> str:
    return f"0x{struct.unpack('<I', struct.pack('<f', value))[0]:08X}"


def main() -> int:
    compressed = TRACE.read_bytes()
    raw = gzip.decompress(compressed)
    trace: dict[str, Any] = json.loads(raw)
    oracle: dict[str, Any] = json.loads(ORACLE.read_text(encoding="utf-8"))
    require(gzip.compress(raw, compresslevel=9, mtime=0) == compressed, "trace gzip encoding is not deterministic")
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace status differs")
    require(trace["scenario"]["scenario_id"] == "production-deck-aggregate-profile-retry-r1", "scenario differs")
    require(trace["plan_sha256"] == digest(PLAN), "plan hash differs")
    require(trace["capture_script_sha256"] == digest(CAPTURE), "capture hash differs")
    require(trace["privacy"] == {
        "account_fields_included": False,
        "omitted": ["user_id", "room_id", "room_name", "user_deck_contents", "deck_element_contents", "deck_member_pointers", "deck_member_rows", "display_strings"],
    }, "trace privacy differs")
    require(all(event["sequence"] == index for index, event in enumerate(trace["events"])), "trace sequence gap")
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for event in trace["events"]:
        by_kind.setdefault(event["kind"], []).append(event)
    expected_counts = {
        "capture.marker": 4,
        "InGameCalculatedData.ctor.enter": 1,
        "InGameCalculatedData.ctor.leave": 1,
        "InGameRecord.InitializeLife.enter": 1,
        "InGameRecord.InitializeLife.leave": 1,
        "ScoreUtility.InitBaseScore.enter": 1,
        "ScoreUtility.calcTotalParameter.enter": 2,
        "ScoreUtility.calcTotalParameter.array": 12,
        "ScoreUtility.calcTotalParameter.aggregates": 2,
        "ScoreUtility.calcTotalParameter.result": 2,
        "ScoreUtility.calcTotalParameter.leave": 2,
        "ScoreUtility.InitBaseScore.start_data": 1,
        "ScoreUtility.InitBaseScore.leave": 1,
    }
    require(trace["summary"]["counts"] == expected_counts, "summary counts differ")
    require({kind: len(events) for kind, events in by_kind.items()} == expected_counts, "event counts differ")
    arrays = by_kind["ScoreUtility.calcTotalParameter.array"]
    require(len({event["deck_array"]["pointer"] for event in arrays}) == 1, "deck array identity differs")
    require(all(event["deck_array"]["length"] == 5 and event["deck_array"]["elements_omitted"] is True for event in arrays), "deck array projection differs")
    require(all(event["privacy"]["member_pointers_omitted"] is True and event["privacy"]["member_rows_omitted"] is True for event in arrays), "member privacy differs")
    aggregates = by_kind["ScoreUtility.calcTotalParameter.aggregates"]
    expected_aggregate = {
        "component_2c": {"value": 57715.1875, "bits": "0x47617330"},
        "component_30": {"value": 70965.765625, "bits": "0x478A9AE2"},
        "component_34": {"value": 64383.80859375, "bits": "0x477B7FCF"},
    }
    for event in aggregates:
        require({key: event[key] for key in expected_aggregate} == expected_aggregate, "aggregate bits differ")
        require(event["member_rows_omitted"] is True, "aggregate member omission differs")
    first_sum = f32(expected_aggregate["component_2c"]["value"] + expected_aggregate["component_30"]["value"])
    total = f32(expected_aggregate["component_34"]["value"] + first_sum)
    require(bits(first_sum) == "0x47FB547A" and bits(total) == "0x483C8A31", "independent Float32 recomputation differs")
    require(all(event["total_parameter"]["bits"] == bits(total) for event in by_kind["ScoreUtility.calcTotalParameter.result"]), "result total differs")
    require(by_kind["ScoreUtility.InitBaseScore.start_data"][0]["score_utility"]["total_parameter"]["bits"] == bits(total), "start-data total differs")
    require(by_kind["ScoreUtility.InitBaseScore.leave"][0]["score_utility"]["base_score"]["bits"] == "0x4434718E", "base-score correlation differs")
    require(oracle["schema_version"] == 1 and oracle["source_commit"] == SOURCE_COMMIT, "oracle provenance differs")
    require(oracle["deck_aggregate"]["component_2c"] == expected_aggregate["component_2c"], "oracle 0x2C differs")
    require(oracle["deck_aggregate"]["component_30"] == expected_aggregate["component_30"], "oracle 0x30 differs")
    require(oracle["deck_aggregate"]["component_34"] == expected_aggregate["component_34"], "oracle 0x34 differs")
    require(oracle["deck_aggregate"]["first_addition"]["bits"] == "0x47FB547A", "oracle first addition differs")
    require(oracle["deck_aggregate"]["total_parameter"]["bits"] == "0x483C8A31", "oracle total differs")
    require(oracle["unknown_fields"] == ["deck.member_rows"], "oracle unknown fields differ")
    require(oracle["blocking_findings"] == ["D23-deck-member-rows-privacy"], "oracle blocker differs")
    require(oracle["business_state_gate"] == "open" and oracle["production_authorization"] is False, "oracle gate differs")
    require(all(source["sha256"] == digest(ROOT / source["path"]) for source in oracle["sources"]), "oracle source hash differs")
    print("verified deck aggregate R1: events=31 invocations=2 members=5 total=0x483C8A31 privacy=member-rows-omitted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
