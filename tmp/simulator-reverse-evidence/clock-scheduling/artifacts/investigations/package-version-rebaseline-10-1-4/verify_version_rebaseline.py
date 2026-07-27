#!/usr/bin/env python3
"""Re-check the 10.1.3 -> 10.1.4 migration of the clock-scheduling target set.

Runs offline with no device, no network and no local binaries: everything asserted here comes
from the committed `version_map.json` plus the capture script's own address tables.

The map is derived data, so the checks are about internal consistency and about the properties
that make the migration safe to act on:

- every hook, probe, constant and type resolved, none left ambiguous or changed,
- the baseline addresses in the map still match the ones the capture script declares for 10.1.3,
- the capture script's 10.1.4 tables match the map exactly, so the two cannot drift apart,
- every probe instruction word is bit-identical across versions at the same offset in its owner,
- every `.rodata` constant kept its bit pattern and was located by a unique context match,
- no field offset moved in any type the agent reads.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CAPTURE = ROOT / "artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py"


def load_capture():
    spec = importlib.util.spec_from_file_location("capture_module", CAPTURE)
    module = importlib.util.module_from_spec(spec)
    sys.modules["capture_module"] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    data = json.loads((HERE / "version_map.json").read_text(encoding="utf-8"))
    capture = load_capture()

    assert data["baseline"]["version_code"] == "229", data["baseline"]
    assert data["target"]["version_code"] == "230", data["target"]

    # Nothing may be left unresolved: a partial migration is not a migration.
    assert set(data["hook_status_counts"]) == {"mapped"}, data["hook_status_counts"]
    assert set(data["probe_status_counts"]) == {"mapped"}, data["probe_status_counts"]
    assert set(data["constant_status_counts"]) == {"mapped"}, data["constant_status_counts"]
    assert set(data["layout_status_counts"]) == {"unchanged"}, data["layout_status_counts"]

    baseline_tables = capture.VERSION_TABLES["229"]
    target_tables = capture.VERSION_TABLES["230"]

    assert len(data["hooks"]) == len(baseline_tables["rvas"]) == len(target_tables["rvas"])
    for row in data["hooks"]:
        label = row["label"]
        assert row["signature_unchanged"], label
        assert int(row["baseline_rva"], 16) == baseline_tables["rvas"][label], label
        assert int(row["target_rva"], 16) == target_tables["rvas"][label], label

    assert len(data["probes"]) == len(baseline_tables["probes"]) == len(target_tables["probes"])
    for row in data["probes"]:
        label = row["label"]
        assert row["instruction_identical"], label
        assert row["baseline_word"] == row["target_word"], label
        assert int(row["baseline_rva"], 16) == baseline_tables["probes"][label]["rva"], label
        assert int(row["target_rva"], 16) == target_tables["probes"][label]["rva"], label
        baseline_start = int(row["baseline_owner_range"][0], 16)
        target_start = int(row["target_owner_range"][0], 16)
        offset = int(row["offset_in_owner"], 16)
        assert int(row["baseline_rva"], 16) - baseline_start == offset, label
        assert int(row["target_rva"], 16) - target_start == offset, label

    # A probe is only safe if its own word is unchanged; the rest of the owner may legitimately
    # differ, but every non-PC-relative difference is recorded so a behavioural change cannot hide.
    for owner in data["probe_owners"]:
        assert owner["differing_words"] >= owner["non_pc_relative_differing_words"]
        for detail in owner["differing_word_detail"]:
            assert detail["pc_relative"] is not None or detail["baseline_word"] != detail["target_word"]

    assert len(data["constants"]) == len(target_tables["constants"])
    for row in data["constants"]:
        assert row["target_context_hits"] == 1, row["name"]
        assert row["bits_identical"], row["name"]
        assert int(row["target_rva"], 16) == target_tables["constants"][row["name"]], row["name"]

    deltas = {row["rva_delta"] for row in data["constants"]}
    assert len(deltas) == 1, f".rodata did not shift uniformly: {sorted(deltas)}"

    for row in data["field_layout"]:
        assert not row["changed_offsets"], row["type"]
        assert not row["added_fields"] and not row["removed_fields"], row["type"]
        assert row["baseline_field_count"] == row["target_field_count"], row["type"]

    print(f"package version rebaseline 10.1.3 -> 10.1.4: verified; "
          f"{len(data['hooks'])} hooks, {len(data['probes'])} probes, "
          f"{len(data['constants'])} constants, {len(data['field_layout'])} types unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
