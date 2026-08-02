#!/usr/bin/env python3
from __future__ import annotations

import gzip
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TRACE_PATHS = {
    group: HERE / f"runtime/ordinary-rendering-note-family-r4-{group}.trace.json.gz"
    for group in ("flick", "slide", "multiple")
}
REQUIRED_SETTERS = {
    "flick": {"RPFU-001", "RPFU-002", "RPFU-003", "RPFU-004", "RPS-008", "RPS-009", "RPS-010"},
    "slide": {"RPFU-002", "RPS-001", "RPS-003", "RPS-005", "RPS-008", "RPS-009", "RPS-010"},
    "multiple": {"RPFU-001", "RPFU-002", "RPFU-003", "RPS-006", "RPS-007", "RPS-008", "RPS-009", "RPS-010"},
}
REQUIRED_OWNERS = {
    "flick": {"RPF-001", "RPF-003", "RPF-004"},
    "slide": {"RPF-007", "RPF-008", "RPF-009", "RPF-011", "RPF-012"},
    "multiple": {"RPF-013", "RPF-014", "RPF-015", "RPF-025", "RPF-026", "RPF-027"},
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_trace(path: Path) -> dict:
    return json.loads(gzip.decompress(path.read_bytes()))


def main() -> int:
    total_events = 0
    total_frames = 0
    target_sha = sha(HERE / "resource_pixi_rendering_note_family_r4_targets.json")
    for group, path in TRACE_PATHS.items():
        assert path.is_file(), path
        document = load_trace(path)
        assert document["status"] == f"confirmed-current-note-family-r4-{group}-observation-only"
        assert document["owner_group"] == group
        assert document["source"]["owner_targets_sha256"] == target_sha
        capture = document["capture"]
        assert capture["capture_error"] is None
        assert capture["hook_failures"] == []
        assert capture["loopback_transport_only"] is True
        assert capture["operator_actions"] == {
            "natural_live_started": True,
            "post_start_attach_wait_completed": True,
            "pause_requested": True,
            "resume_requested": True,
            "wait_completed": True,
        }
        assert capture["return_replacement"] is False
        assert capture["memory_writes"] is False
        assert capture["managed_invocation"] is False
        assert capture["synthetic_event_injection"] is False
        assert all(value is False for value in document["privacy"].values())
        events = document["events"]
        summary = document["summary"]
        assert summary["completion_requirements_met"] is True
        assert len(events) == summary["event_count"]
        assert [event["sequence"] for event in events] == list(range(len(events)))
        assert REQUIRED_SETTERS[group] <= set(summary["setter_event_counts"])
        assert REQUIRED_OWNERS[group] <= set(summary["owner_event_counts"])
        for event in events:
            assert re.fullmatch(r"owner-[0-9]{4}", event["owner_object_alias"] or "")
            assert re.fullmatch(r"component-[0-9]{4}", event["component_alias"] or "")
            technical_value = event["payload"].get("technical_value")
            assert technical_value is None or re.fullmatch(r"[A-Za-z0-9_#./+ -]{0,64}", technical_value)
        total_events += len(events)
        total_frames += summary["relative_frame_count"]
        print(f"verified Note family R4 {group}: {len(events)} events {summary['relative_frame_count']} frames")
    print(f"verified Note family R4 grouped runtime: {total_events} events {total_frames} aggregate frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
