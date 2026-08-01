#!/usr/bin/env python3
"""Promote a complete ordinary rendering capture with the static four-byte no-op exception."""

from __future__ import annotations

import argparse
from collections import Counter
import copy
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
TARGETS_PATH = HERE / "resource_pixi_rendering_runtime_hook_targets.json"
PLAN_PATH = HERE / "runtime/resource-pixi-rendering-r1-plan.json"
STATIC_NOOP_TARGET = "RPH-009"
STATIC_NOOP_ARM64_SHA256 = "110F46B5B35C069160560C6AD6786F647DD44E8760A52A46FC22DBBCD7630B91"


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    trace = strict_load(args.input)
    targets_document = strict_load(TARGETS_PATH)
    plan_document = strict_load(PLAN_PATH)
    targets = {row["target_id"]: row for row in targets_document["targets"]}
    noop = targets[STATIC_NOOP_TARGET]
    require(noop["arm64_sha256"] == STATIC_NOOP_ARM64_SHA256, "static no-op ARM64 hash differs")
    require(int(noop["end_rva"], 16) - int(noop["rva"], 16) == 4, "static no-op is not four bytes")
    require(trace["status"] == "partial-r1-observation-only", "source trace is not the expected partial capture")
    require(trace["plan_id"] == "ordinary-rendering-r1", "source trace plan differs")
    require(trace["hook_target_sha256"] == plan_document["hook_target_sha256"], "source target hash differs")
    require(trace["capture"]["capture_error"] is None, "source capture has an error")
    require(trace["capture"]["hook_failures"] == [{"target_id": STATIC_NOOP_TARGET, "error_category": "hook-install-failed"}], "source hook failure is not the static no-op only")
    require(trace["privacy"] == {
        "raw_pointers_included": False,
        "display_strings_included": False,
        "account_fields_included": False,
        "room_identity_included": False,
        "member_card_skill_identity_included": False,
    }, "source privacy boundary differs")
    events = trace["events"]
    require(events and all(event["sequence"] == index for index, event in enumerate(events)), "source sequence differs")
    activate_aliases = {
        event["object_alias"]
        for event in events
        if event["target_id"] == "RPH-016" and event["phase"] == "enter" and event["object_alias"] is not None
    }
    deactivate_aliases = {
        event["object_alias"]
        for event in events
        if event["target_id"] == "RPH-018" and event["phase"] == "enter" and event["object_alias"] is not None
    }
    lifecycle_aliases = sorted(activate_aliases & deactivate_aliases)
    require(lifecycle_aliases, "no same-alias mesh activate/deactivate lifecycle was observed")
    result = copy.deepcopy(trace)
    result["status"] = "confirmed-r1-observation-only"
    result["capture"]["hook_failures"] = []
    result["capture"]["static_noop_unhookable_targets"] = [{
        "target_id": STATIC_NOOP_TARGET,
        "arm64_sha256": STATIC_NOOP_ARM64_SHA256,
        "bytes": 4,
        "semantic": "single-ret-no-observable-state",
    }]
    result["capture"]["source_capture_sha256"] = digest(args.input)
    result["capture"]["promotion_builder_sha256"] = digest(Path(__file__))
    result["capture"]["promotion_basis"] = "same-alias RPH-016 NoteMesh.Activate to RPH-018 NoteMesh.Deactivate lifecycle; RPH-009 is a static four-byte ret"
    anchors = set(result["summary"]["anchors"])
    anchors.add("first-note-visible")
    result["summary"]["anchors"] = sorted(anchors)
    result["summary"]["note_activate_deactivate_pairs"] = len(lifecycle_aliases)
    result["summary"]["lifecycle_aliases_omitted"] = True
    scenario = next(row for row in plan_document["scenarios"] if row["plan_id"] == result["plan_id"])
    target_map = {row["target_id"]: row for row in targets_document["targets"]}
    categories = {target_map[event["target_id"]]["category"] for event in events}
    phase_counts = Counter((event["target_id"], event["phase"]) for event in events)
    setup = next(row["target_id"] for row in targets.values() if row["owner"] == "NoteManager" and row["method"] == "setupNoteSkin")
    load = next(row["target_id"] for row in targets.values() if row["owner"] == "NoteImageController" and row["method"] == "LoadResources")
    complete = (
        set(scenario["required_categories"]) <= categories
        and set(scenario["required_anchors"]) <= anchors
        and phase_counts[(setup, "enter")] == phase_counts[(setup, "leave")] >= 1
        and phase_counts[(load, "enter")] == phase_counts[(load, "leave")] >= 1
        and len(lifecycle_aliases) >= 1
        and result["summary"]["pause_resume_phase_samples"] >= 1
    )
    require(complete, "ordinary completion requirements remain open")
    result["summary"]["completion_requirements_met"] = True
    result["summary"]["privacy_requirements_met"] = True
    encoded = (json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.GzipFile(filename=str(args.output), mode="wb", mtime=0) as destination:
        destination.write(encoded)
    print(f"promoted ordinary rendering trace: events={len(events)} lifecycle_pairs={len(lifecycle_aliases)} categories={len(categories)} anchors={len(anchors)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
