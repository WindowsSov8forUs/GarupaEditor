#!/usr/bin/env python3
"""Verify a future observation-only rendering R1 trace; absent evidence never passes."""

from __future__ import annotations

import argparse
import gzip
import json
import math
from pathlib import Path
import re
from typing import Any, Iterator


HERE = Path(__file__).resolve().parent
TARGETS_PATH = HERE / "resource_pixi_rendering_runtime_hook_targets.json"
PLAN_PATH = HERE / "runtime/resource-pixi-rendering-r1-plan.json"
ALIAS = re.compile(r"^(thread|object|pool|resource|controller|state)-[0-9]{2,}$")


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def strict_loads(text: str, label: str) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {label}")
    return json.loads(text, parse_constant=reject)


def load(path: Path) -> Any:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as source:
            return strict_loads(source.read(), str(path))
    return strict_loads(path.read_text(encoding="utf-8"), str(path))


def walk(value: Any, path: str = "$") -> Iterator[tuple[str, str, Any]]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield path, key, child
            yield from walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{path}[{index}]")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", type=Path)
    parser.add_argument("--plan-id", required=True, choices=["ordinary-rendering-r1", "habahiro-rendering-r1"])
    args = parser.parse_args()
    require(args.trace.is_file(), f"trace is absent: {args.trace}")
    targets_document = load(TARGETS_PATH)
    plan_document = load(PLAN_PATH)
    trace = load(args.trace)
    scenario = next((row for row in plan_document["scenarios"] if row["plan_id"] == args.plan_id), None)
    require(scenario is not None, "plan scenario is absent")
    targets = {row["target_id"]: row for row in targets_document["targets"]}

    require(trace.get("schema_version") == 1 and trace.get("status") == "confirmed-r1-observation-only", "trace status/schema mismatch")
    sample = trace.get("sample", {})
    require(sample == {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}, "trace sample mismatch")
    require(trace.get("plan_id") == args.plan_id and trace.get("hook_target_sha256") == plan_document["hook_target_sha256"], "trace plan/target identity mismatch")
    capture = trace.get("capture", {})
    require(capture.get("capture_error") is None and capture.get("natural_live_entry") is True and capture.get("game_server_available") is True, "trace is partial or not a natural Live capture")
    require(capture.get("selinux") == "Enforcing" and capture.get("loopback_transport_only") is True, "capture device/transport boundary mismatch")
    require(all(capture.get(key) is False for key in ["return_replacement", "memory_writes", "managed_invocation", "apk_patch", "premium_currency_continue", "synthetic_event_injection"]), "capture mutation boundary mismatch")
    privacy = trace.get("privacy", {})
    require(all(privacy.get(key) is False for key in ["raw_pointers_included", "display_strings_included", "account_fields_included", "room_identity_included", "member_card_skill_identity_included"]), "trace privacy boundary mismatch")

    events = trace.get("events")
    require(isinstance(events, list) and 0 < len(events) <= plan_document["trace_schema"]["max_events"], "trace event count mismatch")
    required_fields = set(plan_document["trace_schema"]["required_event_fields"])
    forbidden_keys = set(plan_document["trace_schema"]["forbidden_recursive_keys"])
    categories: set[str] = set()
    last_ticks = -1
    target_phase_counts: dict[tuple[str, str], int] = {}
    for index, event in enumerate(events):
        require(isinstance(event, dict) and set(event) == required_fields, f"event fields mismatch at sequence {index}")
        require(event["sequence"] == index, f"event sequence is not contiguous at {index}")
        require(event["target_id"] in targets, f"unknown target at sequence {index}")
        target = targets[event["target_id"]]
        require(event["phase"] in target["phases"], f"invalid phase at sequence {index}")
        require(isinstance(event["frame"], int) and event["frame"] >= 0, f"invalid frame at sequence {index}")
        require(isinstance(event["monotonic_ticks"], int) and event["monotonic_ticks"] >= last_ticks, f"non-monotonic ticks at sequence {index}")
        last_ticks = event["monotonic_ticks"]
        require(isinstance(event["thread_alias"], str) and ALIAS.fullmatch(event["thread_alias"]) is not None, f"thread alias mismatch at sequence {index}")
        require(event["object_alias"] is None or (isinstance(event["object_alias"], str) and ALIAS.fullmatch(event["object_alias"]) is not None), f"object alias mismatch at sequence {index}")
        payload = event["payload"]
        require(isinstance(payload, dict) and set(payload) <= set(target["payload_fields"]), f"payload field mismatch at sequence {index}")
        for value_path, key, value in walk(event, f"$.events[{index}]"):
            require(key not in forbidden_keys, f"forbidden key {key} at {value_path}")
            if isinstance(value, str):
                require(len(value.encode("utf-8")) <= plan_document["trace_schema"]["max_technical_string_bytes"], f"technical string too long at {value_path}.{key}")
            if isinstance(value, float):
                require(math.isfinite(value), f"non-finite number at {value_path}.{key}")
        categories.add(target["category"])
        pair = (event["target_id"], event["phase"])
        target_phase_counts[pair] = target_phase_counts.get(pair, 0) + 1

    summary = trace.get("summary", {})
    require(set(summary.get("categories", [])) == categories, "summary category set mismatch")
    require(set(scenario["required_categories"]) <= categories, "required category was not observed")
    anchors = summary.get("anchors")
    require(isinstance(anchors, list) and set(scenario["required_anchors"]) <= set(anchors), "required anchor was not observed")
    setup_target = next(row["target_id"] for row in targets.values() if row["owner"] == "NoteManager" and row["method"] == "setupNoteSkin")
    load_target = next(row["target_id"] for row in targets.values() if row["owner"] == "NoteImageController" and row["method"] == "LoadResources")
    for target_id in (setup_target, load_target):
        require(target_phase_counts.get((target_id, "enter"), 0) >= 1 and target_phase_counts.get((target_id, "enter")) == target_phase_counts.get((target_id, "leave"), 0), f"required enter/leave pair mismatch: {target_id}")
    require(summary.get("note_activate_deactivate_pairs", 0) >= 1 and summary.get("pause_resume_phase_samples", 0) >= 1, "required lifecycle sample is absent")
    require(summary.get("completion_requirements_met") is True and summary.get("privacy_requirements_met") is True, "trace summary is not promotable")
    print(f"verified rendering R1 trace: plan={args.plan_id} events={len(events)} categories={len(categories)} anchors={len(anchors)} privacy=closed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
