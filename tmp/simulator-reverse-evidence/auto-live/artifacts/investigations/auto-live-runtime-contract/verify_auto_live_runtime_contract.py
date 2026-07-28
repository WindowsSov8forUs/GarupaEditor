from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess

from generate_auto_live_fixed_event_trace import build


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE_COMMIT = "2ba3bdbbab9be2de6fedb9b22f623bd80611c023"


def read_json(name: str) -> dict[str, object]:
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def committed_bytes(path: str) -> bytes:
    return subprocess.check_output(
        ["git", "show", f"{SOURCE_COMMIT}:{path}"],
        cwd=ROOT,
    )


def profile(data: bytes) -> tuple[int, str]:
    return len(data), hashlib.sha256(data).hexdigest().upper()


def verify_sources(contract: dict[str, object]) -> None:
    sources = contract["sources"]
    assert isinstance(sources, dict)
    for source in sources.values():
        assert isinstance(source, dict)
        data = committed_bytes(str(source["path"]))
        assert profile(data) == (source["size"], source["sha256"])


def verify_decompiled_hashes() -> None:
    expected_lines = (HERE / "decompiled/SHA256SUMS").read_text(
        encoding="utf-8"
    ).splitlines()
    actual_lines = []
    for path in sorted((HERE / "decompiled").iterdir(), key=lambda item: item.name):
        if not path.is_file() or path.name == "SHA256SUMS":
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest().upper()
        actual_lines.append(f"{digest}  {path.name}")
    assert actual_lines == expected_lines


def verify_trace(trace: dict[str, object]) -> None:
    first = build()
    second = build()
    assert first == second == trace
    assert trace["status"] == "confirmed-static-contract-fixed-offline-oracle"
    cases = trace["cases"]
    assert isinstance(cases, list)
    case_ids = [case["case_id"] for case in cases]
    assert len(case_ids) == len(set(case_ids)) >= 10
    flick = next(case for case in cases if case["case_id"] == "flick-base-first-single-result")
    assert [row["event"] for row in flick["steps"]] == [
        "flick-begin",
        "flick-synthetic-move",
        "head-perfect",
        "reflect",
    ]
    directional = {
        case["case_id"]: case for case in cases if case["case_id"].startswith("directional-")
    }
    assert directional["directional-left-synthetic"]["steps"][1]["synthetic_x"]["bits"] == "0xC3FA0000"
    assert directional["directional-right-synthetic"]["steps"][1]["synthetic_x"]["bits"] == "0x43FA0000"
    long_case = next(case for case in cases if case["case_id"].startswith("long-head"))
    assert "tail-equal-no-crossing" in [row["event"] for row in long_case["steps"]]
    slide = next(case for case in cases if case["case_id"] == "slide-one-pending-node-per-update")
    transitions = [
        row for row in slide["steps"] if row["event"] in {"intermediate-perfect", "tail-perfect"}
    ]
    assert [row["current_after_after"] for row in transitions] == [1, 2, 3]
    pool = next(case for case in cases if case["case_id"].startswith("simultaneous-reverse"))
    reflect = pool["steps"][-1]
    assert reflect["slots"] == [0, 1, 2, 3, 4]
    assert reflect["note_indices"] == [204, 203, 202, 201, 200]


def main() -> None:
    contract = read_json("auto_live_runtime_contract.json")
    closure = read_json("closure.json")
    failures = read_json("auto_live_failure_cases.json")
    trace = read_json("auto_live_fixed_event_trace.json")

    assert contract["source_commit"] == SOURCE_COMMIT
    assert contract["status"] == "confirmed-static-auto-live-runtime-contract"
    assert closure["source_commit"] == SOURCE_COMMIT
    assert closure["overall_status"] == "confirmed"
    assert closure["auto_live_gate"] == "closed"
    assert closure["blocking_findings"] == []
    assert sorted(closure["gap_resolution"]) == [f"G{index:02d}" for index in range(1, 11)]
    assert contract["one_frame"]["pool_capacity"] == 5
    assert contract["crossings"]["long_tail"]["comparison"] == "adjusted > tail"
    assert contract["crossings"]["slide_pending"]["maximum_selected_transitions_per_call"] == 1
    assert failures["status"] == "confirmed-failure-closed-matrix"
    assert any(case["id"] == "one-frame-sixth-entry" for case in failures["cases"])

    verify_sources(contract)
    verify_decompiled_hashes()
    verify_trace(trace)
    print(
        "auto live runtime contract: verified; "
        "gate=closed, gaps=10, pool=5, fixed-trace=deterministic"
    )


if __name__ == "__main__":
    main()
