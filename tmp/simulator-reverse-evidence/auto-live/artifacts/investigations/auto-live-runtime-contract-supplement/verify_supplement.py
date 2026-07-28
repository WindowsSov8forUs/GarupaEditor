from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess

from extract_arm64_slices import build_outputs
from generate_supplement import build


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE_COMMIT = "a3f28d77e71c5e7a62cab0de81f0cf668a5b745b"
SOURCE_PROFILES = {
    "artifacts/il2cpp/method_index_core.csv": (19238266, "86046B017519B00F91D16F10B7ABA341CD2376F3E53C63273AEAFF2DEBD9DA07"),
    "artifacts/rhythm/decompiled_bundles/note.c": (15488148, "34FFB644FED6A257D6E964A2996E733751B6C70F65C97EF2E812FC4A793ED933"),
    "artifacts/investigations/auto-live-runtime-contract/auto_live_runtime_contract.json": (7536, "24B5736064666E085B217987F388840F24F644ABF5FBF3924EF2B8249D6D8D6A"),
    "artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pass2_judge_offset.json": (16320, "79FC58F54436031C6572D4DF7260C7B0336D03D4604691C3647A7511EA17AE92"),
}


def committed(path: str) -> bytes:
    return subprocess.check_output(["git", "show", f"{SOURCE_COMMIT}:{path}"], cwd=ROOT)


def profile(data: bytes) -> tuple[int, str]:
    return len(data), hashlib.sha256(data).hexdigest().upper()


def main() -> None:
    committed_sources: dict[str, bytes] = {}
    for path, expected in SOURCE_PROFILES.items():
        data = committed(path)
        committed_sources[path] = data
        assert profile(data) == expected, path

    method_index = committed_sources["artifacts/il2cpp/method_index_core.csv"].decode("utf-8")
    note_bundle = committed_sources["artifacts/rhythm/decompiled_bundles/note.c"].decode("utf-8")
    multiple_rows = [line for line in method_index.splitlines() if ",NoteMultipleDirectionalFlick," in line]
    assert any(line.startswith("0x30ed1b4,") and ",MoveState," in line for line in multiple_rows)
    assert any(line.startswith("0x30ed6dc,") and ",ExecTouchMoved," in line for line in multiple_rows)
    assert not any(",forcePerfect," in line for line in multiple_rows)
    assert "JUMPOUT(0x3A777F4);" in note_bundle

    expected_slices = build_outputs()
    for name, expected in expected_slices.items():
        assert (HERE / "decompiled" / name).read_bytes() == expected, name
    sums = [f"{hashlib.sha256(data).hexdigest().upper()}  {name}" for name, data in sorted(expected_slices.items())]
    assert (HERE / "decompiled/SHA256SUMS").read_text(encoding="utf-8") == "\n".join(sums) + "\n"
    decoded_slices = {name: data.decode("utf-8") for name, data in expected_slices.items()}
    assert "b #0x30e7f10" in decoded_slices["030ee62c__NoteMultipleDirectionalFlick__ctor.arm64.tsv"]
    assert "bl #0x30e1698" in decoded_slices["030ed1b4__NoteMultipleDirectionalFlick__MoveState.arm64.tsv"]
    moved = decoded_slices["030ed6dc__NoteMultipleDirectionalFlick__ExecTouchMoved.arm64.tsv"]
    assert "mov w2, #0xa" in moved
    assert "bl #0x30e0fec" in moved
    assert "bl #0x30ed264" in moved
    count = decoded_slices["030ed910__NoteMultipleDirectionalFlick__getCount.arm64.tsv"]
    assert "bl #0x30ed948" in count and "bl #0x30ed9cc" in count and "add w0, w8, #1" in count
    assert "ret" in decoded_slices["030e6f5c__NoteAddLongMultipleDirectionalFlickVisual__forcePerfect.arm64.tsv"]
    assert "ret" in decoded_slices["030e8870__NoteAddSlideMultipleDirectionalFlickVisual__forcePerfect.arm64.tsv"]

    first = build()
    second = build()
    frozen = json.loads((HERE / "auto_live_supplement_fixed_event_trace.json").read_text(encoding="utf-8"))
    assert first == second == frozen
    cases = {case["case_id"]: case for case in frozen["cases"]}
    contract = json.loads((HERE / "auto_live_supplement_contract.json").read_text(encoding="utf-8"))
    closure = json.loads((HERE / "closure.json").read_text(encoding="utf-8"))
    assert set(cases) == set(contract["supplemental_oracle"]["required_cases"])
    assert cases["multiple-directional-left-auto-group"]["steps"][2]["note_type"] == 10
    assert cases["multiple-directional-left-auto-group"]["steps"][1]["synthetic_x"]["bits"] == "0xC3FA0000"
    assert cases["multiple-directional-right-auto-group"]["steps"][1]["synthetic_x"]["bits"] == "0x43FA0000"
    assert cases["offset-plus5-cross-bpm-exact"]["result_adjusted_position"]["bits"] == "0x45401EF9"
    assert cases["offset-minus5-cross-bar-exact"]["result_adjusted_position"]["bits"] == "0x446E7494"
    assert closure["overall_status"] == "confirmed"
    assert closure["auto_live_gate"] == "closed"
    assert closure["blocking_findings"] == []
    assert sorted(closure["supplement_gap_resolution"]) == [f"G{index}" for index in range(11, 16)]
    print("auto live supplement: verified; gaps=G11-G15, gate=closed, cases=8")


if __name__ == "__main__":
    main()
