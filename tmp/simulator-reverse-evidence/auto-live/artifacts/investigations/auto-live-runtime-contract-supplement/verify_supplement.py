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
    "artifacts/investigations/auto-live-runtime-contract/decompiled/030eb97c__NoteLong__forcePerfectMoveState.c": (1126, "18F64A4F7F52C46EF62E657AD0670B48B45D5F034CA884F9390F7B99AABF0A26"),
    "artifacts/investigations/auto-live-runtime-contract/decompiled/0321c1cc__NoteSlide__forcePerfectMoveState.c": (2100, "3AC65DB508F03FFEB7EEAA91F9E4BE537C6094DB546B0C30895E1FD5A22C120C"),
    "artifacts/investigations/auto-live-runtime-contract/decompiled/030eb7a0__NoteLong__forcePerfectOnUpdate.c": (2188, "95944BDCEC2DE63B300FDAC8E2AE88431192B1D00D0E23A566D60090E823B718"),
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
    same_group = decoded_slices["0377a140__NoteManager__isMultipleDirectionalSameGroup.arm64.tsv"]
    assert same_group.count("cmp w8, #6") == 2
    assert "cmp w8, w9" in same_group and "b #0x377b770" in same_group
    connect = decoded_slices["03778da4__NoteManager__connectMultipleDirectionalFlick.arm64.tsv"]
    assert connect.count("#0x30eddd8") == 2
    side = decoded_slices["030ed264__NoteMultipleDirectionalFlick__changeSideNoteUsed.arm64.tsv"]
    assert "bl #0x30ee12c" in side and "bl #0x30ee1d4" in side
    left = decoded_slices["030ee12c__NoteMultipleDirectionalFlick__ChangeLeftNoteUsed.arm64.tsv"]
    right = decoded_slices["030ee1d4__NoteMultipleDirectionalFlick__ChangeRightNoteUsed.arm64.tsv"]
    assert "strb w9, [x8, #0x14]" in left and "bl #0x30ee12c" in left
    assert "strb w9, [x8, #0x14]" in right and "bl #0x30ee1d4" in right

    long_head = committed_sources[
        "artifacts/investigations/auto-live-runtime-contract/decompiled/030eb97c__NoteLong__forcePerfectMoveState.c"
    ].decode("utf-8")
    slide_head = committed_sources[
        "artifacts/investigations/auto-live-runtime-contract/decompiled/0321c1cc__NoteSlide__forcePerfectMoveState.c"
    ].decode("utf-8")
    long_tail = committed_sources[
        "artifacts/investigations/auto-live-runtime-contract/decompiled/030eb7a0__NoteLong__forcePerfectOnUpdate.c"
    ].decode("utf-8")
    assert long_head.index("NoteBase__ChangeState(a1, 1)") < long_head.index("*a1 + 616LL")
    assert slide_head.index("NoteBase__ChangeState(a1, 1)") < slide_head.index("*a1 + 616LL")
    assert long_tail.index("*(_QWORD *)v10 + 648LL") < long_tail.index("*(_QWORD *)a1 + 648LL")

    first = build()
    second = build()
    frozen = json.loads((HERE / "auto_live_supplement_fixed_event_trace.json").read_text(encoding="utf-8"))
    assert first == second == frozen
    cases = {case["case_id"]: case for case in frozen["cases"]}
    runtime = json.loads(committed_sources[
        "artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pass2_judge_offset.json"
    ])
    runs = {run["run_id"]: run for run in runtime["runs"]}
    plus_clock = runs["ikuoku-cc08-run-025-offset-plus5"]["cross_bpm_sample"]["entry_clock"]
    minus_clock = runs["ikuoku-cc08-run-026-offset-minus5"]["cross_bar_sample"]["entry_clock"]
    contract = json.loads((HERE / "auto_live_supplement_contract.json").read_text(encoding="utf-8"))
    closure = json.loads((HERE / "closure.json").read_text(encoding="utf-8"))
    assert set(cases) == set(contract["supplemental_oracle"]["required_cases"])
    assert cases["multiple-directional-left-auto-group"]["steps"][2]["note_type"] == 10
    assert cases["multiple-directional-left-auto-group"]["steps"][1]["synthetic_x"]["bits"] == "0xC3FA0000"
    assert cases["multiple-directional-right-auto-group"]["steps"][1]["synthetic_x"]["bits"] == "0x43FA0000"
    assert cases["offset-plus5-cross-bpm-exact"]["result_adjusted_position"]["bits"] == "0x45401EF9"
    assert cases["offset-minus5-cross-bar-exact"]["result_adjusted_position"]["bits"] == "0x446E7494"
    assert cases["offset-plus5-cross-bpm-exact"]["entry_music_cursor"] == {
        "bar": plus_clock["music_bar"],
        "beat_progress": {
            "value": plus_clock["music_beat"],
            "bits": plus_clock["float_bits"]["music_beat"].upper().replace("0X", "0x"),
        },
    }
    assert cases["offset-minus5-cross-bar-exact"]["entry_music_cursor"] == {
        "bar": minus_clock["music_bar"],
        "beat_progress": {
            "value": minus_clock["music_beat"],
            "bits": minus_clock["float_bits"]["music_beat"].upper().replace("0X", "0x"),
        },
    }
    assert cases["offset-zero-identity-exact"]["entry_music_cursor"] == cases[
        "offset-minus5-cross-bar-exact"
    ]["entry_music_cursor"]
    component = cases["multiple-connected-component-non-source-order"]
    assert component["multiple_candidate_source_order"] == [1, 2, 0]
    assert component["adjacent_edges"] == [[0, 1], [1, 2]]
    assert component["connected_components"] == [[0, 1, 2]]
    assert component["multiple_judgement_count"] == 1
    for case_id in [
        "one-frame-exhaustion-long-head-terminal-fault",
        "one-frame-exhaustion-slide-head-terminal-fault",
        "one-frame-exhaustion-long-tail-terminal-fault",
    ]:
        assert cases[case_id]["portable_boundary"]["manager_state"] == "faulted"
        assert cases[case_id]["portable_boundary"]["subsequent_step"] == "same-latched-failure"
    assert cases["actual-adaptive-scheduler-observation-requirements"]["forbidden_test_inputs"] == [
        "substep-index", "event-order"
    ]
    assert cases["actual-offset-tempo-query-observation-requirements"]["forbidden_test_inputs"] == [
        "expected-step-bpms"
    ]
    assert closure["overall_status"] == "confirmed"
    assert closure["auto_live_gate"] == "closed"
    assert closure["blocking_findings"] == []
    assert sorted(closure["supplement_gap_resolution"]) == [f"G{index}" for index in range(11, 21)]
    print("auto live supplement: verified; gaps=G11-G20, gate=closed, cases=14")


if __name__ == "__main__":
    main()
