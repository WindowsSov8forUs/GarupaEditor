from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE_COMMIT = "a3f28d77e71c5e7a62cab0de81f0cf668a5b745b"
PLUS_TRACE = "artifacts/investigations/clock-scheduling-runtime-oracle/traces/normalized/ikuoku-cc08-run-025-offset-plus5.adaptive.jsonl"
MINUS_TRACE = "artifacts/investigations/clock-scheduling-runtime-oracle/traces/normalized/ikuoku-cc08-run-026-offset-minus5.adaptive.jsonl"
CHART_SOURCE = "artifacts/investigations/clock-scheduling-runtime-oracle/sources/653_ikuoku_easy.bms.txt"


def committed(path: str) -> bytes:
    return subprocess.check_output(["git", "show", f"{SOURCE_COMMIT}:{path}"], cwd=ROOT)


def delta_bits(trace: bytes, target_frame: int) -> list[str]:
    rows = []
    for raw in trace.decode("utf-8").splitlines():
        event = json.loads(raw)
        if event.get("event") != "adaptive_delta_input":
            continue
        frame_id = event["frame_id"]
        if frame_id <= target_frame:
            rows.append((frame_id, event["delta_time_bits"].upper().replace("0X", "0x")))
    rows.sort()
    assert [frame for frame, _ in rows] == list(range(1, target_frame + 1))
    return [bits for _, bits in rows]


def build(plus_trace: bytes, minus_trace: bytes, chart: bytes) -> dict[str, object]:
    return {
        "schema_version": 1,
        "status": "confirmed-committed-production-replay-input",
        "evidence": ["G20", "G22", "U03", "U04"],
        "chart": {
            "file": "653_ikuoku_easy.bms.txt",
            "source_path": CHART_SOURCE,
            "bytes": len(chart),
            "sha256": hashlib.sha256(chart).hexdigest().upper(),
        },
        "offset_replays": [
            {
                "case_id": "offset-plus5-cross-bpm-exact",
                "run_id": "ikuoku-cc08-run-025-offset-plus5",
                "judge_offset_frames": 5,
                "target_frame_id": 991,
                "delta_time_bits": delta_bits(plus_trace, 991),
            },
            {
                "case_id": "offset-minus5-cross-bar-exact",
                "run_id": "ikuoku-cc08-run-026-offset-minus5",
                "judge_offset_frames": -5,
                "target_frame_id": 317,
                "delta_time_bits": delta_bits(minus_trace, 317),
            },
            {
                "case_id": "offset-zero-identity-exact",
                "run_id": "ikuoku-cc08-run-026-offset-minus5",
                "judge_offset_frames": 0,
                "target_frame_id": 317,
                "delta_time_bits": delta_bits(minus_trace, 317),
            },
        ],
        "adaptive_method_replay": {
            "oracle_case": "adaptive-substeps-one-outer-reflect",
            "setup_outer_frame_count": 1,
            "judgement_outer_frame_index": 1,
            "input_delta_time_bits": ["0x3A83126F", "0x3D23D70A"],
            "input_adjusted_positions": [119.0, 120.0, 121.0, 122.0],
            "expected_substep_indices": [0, 1, 2],
            "expected_single_reflect": True,
            "projection": "full-manager-lifecycle-index; do not remove outer_frame before comparison",
        },
        "forbidden_test_inputs": [
            "expected-step-bpms",
            "private-music-cursor-write",
            "private-bpm-lookup-call",
            "test-authored-substep-index",
            "outer-frame-field-removal",
        ],
        "production_owner": "InGameMusicScoreController.getAdjustedMusicPosition",
    }


def main() -> None:
    chart = committed(CHART_SOURCE)
    value = build(committed(PLUS_TRACE), committed(MINUS_TRACE), chart)
    (HERE / "auto_live_actual_replay.json").write_bytes(
        (json.dumps(value, indent=2) + "\n").encode("utf-8")
    )
    target = HERE / "fixtures/653_ikuoku_easy.bms.txt"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(chart)


if __name__ == "__main__":
    main()
