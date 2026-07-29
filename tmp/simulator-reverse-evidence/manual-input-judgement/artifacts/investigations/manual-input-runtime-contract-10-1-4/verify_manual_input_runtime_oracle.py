#!/usr/bin/env python3
"""Verify the 10.1.4 manual-input R1 traces and fixed-event oracle offline."""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
RUNTIME_FILES = (
    ("easy-play", "runtime/easy-play-plan.json", "runtime/easy-play.json", "capture_manual_input_runtime.py"),
    ("expert-timeout", "runtime/expert-timeout-plan.json", "runtime/expert-timeout.json", "capture_manual_input_runtime.py"),
    ("hard-touch", "runtime/hard-touch-plan.json", "runtime/hard-touch.json", "capture_manual_input_runtime.py"),
    ("hard-timeout", "runtime/hard-timeout-plan.json", "runtime/hard-timeout.json", "capture_manual_input_runtime.py"),
    ("ui-multitouch", "runtime/ui-multitouch-plan.json", "runtime/ui-multitouch.json", "capture_manual_multitouch_runtime.py"),
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def events(trace: dict, kind: str) -> list[dict]:
    return [event for event in trace["events"] if event["kind"] == kind]


def main() -> int:
    traces: dict[str, dict] = {}
    for name, plan_path, trace_path, script_path in RUNTIME_FILES:
        plan_file = HERE / plan_path
        trace_file = HERE / trace_path
        script_file = HERE / script_path
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        trace = json.loads(trace_file.read_text(encoding="utf-8"))
        require(trace["status"] == "confirmed-r1-observation-only", f"{name} status")
        require(trace["capture_error"] is None, f"{name} capture error")
        require(trace["sample"]["version_name"] == "10.1.4" and trace["sample"]["version_code"] == 230, f"{name} version")
        require(trace["sample"]["abi"] == "arm64-v8a" and trace["sample"]["libil2cpp_sha256"] == LIB_SHA256, f"{name} binary")
        require(trace["plan_sha256"] == digest(plan_file), f"{name} plan hash")
        require(trace["capture_script_sha256"] == digest(script_file), f"{name} capture script hash")
        require(trace["scenario"] == plan, f"{name} embedded plan")
        sequences = [event["sequence"] for event in trace["events"]]
        require(sequences == list(range(len(sequences))), f"{name} event sequence")
        require(all(event["thread_id"] > 0 for event in trace["events"]), f"{name} thread identity")
        traces[name] = trace

    easy = traces["easy-play"]
    easy_touches = [event["touch"] for event in events(easy, "Touch.get_phase") if event["marker"].startswith("long-swipe")]
    require({touch["phase"] for touch in easy_touches} == {0, 1, 2, 3}, "easy touch phase coverage")
    require({touch["finger_id"] for touch in easy_touches} == {0}, "easy finger identity")
    require(any(touch["position_y"]["bits"] == "0x428C0000" for touch in easy_touches), "Unity bottom-left Y conversion")
    dispatched_phases = {event["phase"] for event in events(easy, "InputManager.inputButton.enter")}
    require(dispatched_phases == {0, 1, 2, 3}, "InputManager phase dispatch")
    require(all(event["returned"] == 1 for event in events(easy, "InputManager.inputButton.leave")), "input button return")

    hard_touch = traces["hard-touch"]
    long_began = events(hard_touch, "NoteLong.ExecTouchBegan.enter")
    long_ended = events(hard_touch, "NoteLong.ExecTouchEnded.enter")
    require(len(long_began) == 1 and len(long_ended) == 1, "Long physical lifecycle count")
    require(long_began[0]["result"] == 2 and long_began[0]["judge_timing"] == 2, "Long Good/Slow head")
    require(long_began[0]["note"]["finger_id"] == 0 and long_began[0]["note"]["info"]["game_note_type"] == 1, "Long owner identity")
    setup_hard = events(hard_touch, "OneFrameData.Setup.leave")
    head = next(event["frame"] for event in setup_hard if event["frame"]["note_type"] == 4)
    tail = next(event["frame"] for event in setup_hard if event["frame"]["note_type"] == 1 and event["frame"]["index"] == 6)
    require((head["result"], head["judge_timing"], head["absolute_pos"], head["button_types"]["values"]) == (2, 2, 276, [6]), "Long head projection")
    require((tail["result"], tail["absolute_pos"], tail["button_types"]["values"]) == (0, 336, [6]), "Long physical release projection")
    require(events(hard_touch, "NoteLong.ExecTouchEnded.leave")[0]["note"]["finger_id"] == -1, "Long finger clear")

    hard_timeout = traces["hard-timeout"]
    misses = events(hard_timeout, "NoteLong.onMiss.enter")
    require(len(misses) == 2, "Long timeout double onMiss")
    require(misses[0]["note"]["pointer"] == misses[1]["note"]["pointer"], "Long timeout same owner")
    between = hard_timeout["events"][misses[0]["sequence"]:misses[1]["sequence"] + 1]
    require(not any(event["kind"] == "OneFrameController.Reflect.enter" for event in between), "Long timeout has no intervening Reflect")
    timeout_setups = [event["frame"] for event in events(hard_timeout, "OneFrameData.Setup.leave") if event["frame"]["note_type"] == 1]
    require(len(timeout_setups) == 2, "Long timeout slot count")
    require(all((frame["result"], frame["add_power"], frame["button_types"]["values"]) == (0, -50, [6]) for frame in timeout_setups), "Long timeout payload")
    timeout_reflects = [event for event in events(hard_timeout, "OneFrameController.Reflect.enter") if sum(1 for slot in event["slots"]["values"] if slot["is_using"] and slot["note_type"] == 1) == 2]
    require(len(timeout_reflects) == 1 and timeout_reflects[0]["slots"]["size"] == 5, "Long timeout one Reflect with fixed five slots")

    expert = traces["expert-timeout"]
    require(len(events(expert, "NoteSlide.onMiss.enter")) == 2, "Slide timeout onMiss count")
    require(len(events(expert, "NoteSlide.onMissAfterNote.enter")) == 1, "Slide timeout after-node count")
    slide_setups = [event["frame"] for event in events(expert, "OneFrameData.Setup.leave") if event["frame"]["note_type"] == 8]
    require(len(slide_setups) == 2, "Slide timeout projection count")
    require({tuple(frame["button_types"]["values"]) for frame in slide_setups} == {(4,), (6,)}, "Slide root/after buttons")
    require(all(frame["result"] == 0 for frame in slide_setups), "Slide timeout Miss results")

    multi = traces["ui-multitouch"]
    phase_rows = [event["touch"] for event in events(multi, "Touch.get_phase")]
    coverage: dict[int, set[int]] = {0: set(), 1: set()}
    for row in phase_rows:
        if row["finger_id"] in coverage:
            coverage[row["finger_id"]].add(row["phase"])
    require(coverage == {0: {0, 1, 2, 3}, 1: {0, 1, 2, 3}}, "two-finger phase coverage")
    began = [row for row in phase_rows if row["phase"] == 0]
    ended = [row for row in phase_rows if row["phase"] == 3]
    require([row["finger_id"] for row in began] == [0, 1], "two-finger began enumeration")
    require([row["finger_id"] for row in ended] == [0, 1], "two-finger ended enumeration")
    require({row["position_y"]["bits"] for row in phase_rows} == {"0x428C0000"}, "two-finger Y identity")

    oracle_path = HERE / "manual_input_fixed_event_oracle.json"
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    require(oracle["status"] == "confirmed-10.1.4-fixed-event-oracle-static-plus-r1", "oracle status")
    require(oracle["sample"]["libil2cpp_sha256"] == LIB_SHA256, "oracle sample")
    require(oracle["input_facts"] == {"frame_rate_bits": "0x3C888889", "miss_interval_bits": "0x3E5DDDDE", "flick_threshold_bits": "0x3D23D70A", "directional_threshold_bits": "0x3C23D70A"}, "oracle constants")
    ids = [entry["case_id"] for entry in oracle["cases"]]
    require(ids == [f"MJ{index:02d}" for index in range(1, 27)], "MJ01-MJ26 order")
    require(all(entry["unknown_fields"] == [] for entry in oracle["cases"]), "oracle unknown fields")
    require(oracle["portable_input_contract"]["finger_id"] == {"minimum": 0, "maximum": 14, "basis": "InputManager owner array length 15"}, "portable finger range")
    require(oracle["portable_input_contract"]["phase"]["accepted"] == {"Began": 0, "Moved": 1, "Stationary": 2, "Ended": 3}, "portable phases")
    require(oracle["portable_input_contract"]["transaction"].startswith("preflight entire frame"), "portable transaction")
    require(oracle["chart_samples"]["song_id"] == 653 and oracle["chart_samples"]["difficulties"]["hard"]["text_asset_sha256"] == "86382CF8C16B8992A72EA93FBE7409022FA8590E284C65F3796668E4DD3FEB0F", "chart identity")
    runtime_entries = {entry["path"]: entry for entry in oracle["runtime_observations"]}
    for _, _, trace_path, _ in RUNTIME_FILES:
        require(runtime_entries[trace_path]["sha256"] == digest(HERE / trace_path), f"oracle runtime hash {trace_path}")

    print("manual input runtime oracle verified: R1=5 MJ01-MJ26=26 Long=head/release+double-timeout Slide=root/after-timeout multi-touch=0/1 gate=closed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
