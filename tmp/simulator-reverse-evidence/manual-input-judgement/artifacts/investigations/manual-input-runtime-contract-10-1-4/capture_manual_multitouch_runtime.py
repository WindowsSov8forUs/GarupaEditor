#!/usr/bin/env python3
"""Capture two-finger observation-only traces through the Linux MT input device."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import frida

PACKAGE = "jp.co.craftegg.band"
ADB = r"HOST___________\scrcpy\adb.exe"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
TARGETS = {
    "Touch.get_fingerId": 0x661BD24,
    "Touch.get_position": 0x661BD2C,
    "Touch.get_phase": 0x661BD6C,
    "NoteFrontBase.calculateScreenPosToWorldDistanceRate": 0x30DFFD4,
    "InputManager.ExecInput": 0x3312AE4,
    "InputManager.inputPlaying": 0x3312D20,
    "InputManager.inputButton": 0x3313370,
    "ButtonManager.GetButton": 0x3882170,
    "ButtonManager.GetPlayButton": 0x38824E0,
    "ButtonManager.calcNearestButton": 0x3883858,
    "ButtonManager.calcSecondNearButton": 0x38839B4,
    "ButtonManager.calcThirdNearButton": 0x3883B28,
    "GamePlayButton.GetTouchBeganNote": 0x387C6E0,
    "GamePlayButton.setTouchBeganNote": 0x387C71C,
    "GamePlayButton.ExecTouchBegan": 0x387C784,
    "GamePlayButton.ExecTouchMoved": 0x387CD9C,
    "GamePlayButton.ExecTouchEnded": 0x387CEB0,
    "GamePlayButton.CalculateTouchEndedJudge": 0x387D064,
    "NoteNormal.ExecTouchBegan": 0x3219BE8,
    "NoteFlick.ExecTouchMoved": 0x30E9E20,
    "NoteDirectionalFlick.ExecTouchMoved": 0x30E900C,
    "NoteMultipleDirectionalFlick.ExecTouchBegan": 0x30EC6BC,
    "NoteMultipleDirectionalFlick.ExecTouchMoved": 0x30EC820,
    "NoteLong.ExecTouchBegan": 0x30EAEDC,
    "NoteLong.ExecTouchMoved": 0x30EB210,
    "NoteLong.ExecTouchEnded": 0x30EB854,
    "NoteLong.onMiss": 0x30EC164,
    "NoteSlide.ExecTouchBegan": 0x321BA8C,
    "NoteSlide.ExecTouchMoved": 0x321C664,
    "NoteSlide.ExecTouchEnded": 0x321E3F4,
    "NoteSlide.intermediateNoteJudge": 0x321DB2C,
    "NoteSlide.afterNoteJudge": 0x321E9B8,
    "NoteSlide.onMiss": 0x321EC88,
    "NoteSlide.onMissAfterNote": 0x321F47C,
    "SlideNoteManager.Judge": 0x321D96C,
    "SlideNoteManager.GetNearJudgeLineNote": 0x3223820,
    "NoteUtility.GetResult": 0x377E224,
    "NoteUtility.JudgeNote": 0x377E370,
    "NoteUtility.CalcNoteResultType": 0x3777408,
    "OneFrameController.GetUsable": 0x3303E68,
    "OneFrameData.Setup": 0x32F29CC,
    "OneFrameController.Reflect": 0x3303FF0,
    "NoteBase.SetFingerId": 0x3A754B8,
    "NoteBase.Deactivate": 0x3A74CBC,
}


def adb(*args: str, capture: bool = True) -> str:
    result = subprocess.run(
        [ADB, *args], check=True, capture_output=capture, text=True, encoding="utf-8", errors="replace"
    )
    return result.stdout.strip() if capture else ""


def build_script() -> str:
    targets = json.dumps(TARGETS, sort_keys=True)
    return f"""
'use strict';
const TARGETS = {targets};
const events = [];
const counts = {{}};
let sequence = 0;
let marker = 'attach';
let execFrames = 0;
let reflectFrames = 0;
const MAX_EVENTS = 100000;

function ptrText(value) {{ try {{ return value.isNull() ? null : value.toString(); }} catch (_) {{ return null; }} }}
function i32(pointer, offset) {{ try {{ return pointer.add(offset).readS32(); }} catch (_) {{ return null; }} }}
function u8(pointer, offset) {{ try {{ return pointer.add(offset).readU8(); }} catch (_) {{ return null; }} }}
function u32(pointer, offset) {{ try {{ return pointer.add(offset).readU32(); }} catch (_) {{ return null; }} }}
function f32(pointer, offset) {{
  try {{ return {{ value: pointer.add(offset).readFloat(), bits: '0x' + pointer.add(offset).readU32().toString(16).padStart(8, '0').toUpperCase() }}; }}
  catch (_) {{ return null; }}
}}
function p64(pointer, offset) {{ try {{ return pointer.add(offset).readPointer(); }} catch (_) {{ return ptr(0); }} }}
function objectType(pointer) {{
  try {{
    if (pointer.isNull()) return null;
    const klass = pointer.readPointer();
    const name = klass.add(0x10).readPointer().readUtf8String();
    const namespaceName = klass.add(0x18).readPointer().readUtf8String();
    return namespaceName ? namespaceName + '.' + name : name;
  }} catch (_) {{ return null; }}
}}
function managedArray(pointer, mapper, maximum = 32) {{
  try {{
    if (pointer.isNull()) return null;
    const length = pointer.add(0x18).readU32();
    const values = [];
    for (let index = 0; index < Math.min(length, maximum); index++) values.push(mapper(pointer, index));
    return {{ length, values, truncated: length > maximum }};
  }} catch (_) {{ return null; }}
}}
function pointerArray(pointer, maximum = 32) {{
  return managedArray(pointer, (array, index) => ptrText(array.add(0x20 + index * Process.pointerSize).readPointer()), maximum);
}}
function intArray(pointer, maximum = 32) {{
  return managedArray(pointer, (array, index) => array.add(0x20 + index * 4).readS32(), maximum);
}}
function buttonSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{ pointer: ptrText(pointer), type: objectType(pointer), button_type: i32(pointer, 0x24) }};
}}
function noteSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  const info = p64(pointer, 0x60);
  return {{
    pointer: ptrText(pointer), type: objectType(pointer), note_state: i32(pointer, 0x50), finger_id: i32(pointer, 0xC0),
    info: info.isNull() ? null : {{ pointer: ptrText(info), index: i32(info, 0x10), is_result: u8(info, 0x14), is_slide_head: u8(info, 0x15), is_multi_range: u8(info, 0x16), is_invisible: u8(info, 0x17), button_type: i32(info, 0x18), game_note_type: i32(info, 0x30), after_note_type: i32(info, 0x38), absolute_pos: i32(info, 0x58) }}
  }};
}}
function oneFrameSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{ pointer: ptrText(pointer), is_using: i32(pointer, 0x10), index: i32(pointer, 0x14), button_types: intArray(p64(pointer, 0x18)), add_score: f32(pointer, 0x20), add_power: i32(pointer, 0x24), add_combo: i32(pointer, 0x28), note_type: i32(pointer, 0x2C), result: i32(pointer, 0x30), adjusted_result: i32(pointer, 0x34), absolute_pos: i32(pointer, 0x48), damage_guard_type: i32(pointer, 0x4C), judge_timing: i32(pointer, 0x50) }};
}}
function controllerSlots(pointer) {{
  try {{
    const list = p64(pointer, 0x60);
    const items = p64(list, 0x10);
    const size = i32(list, 0x18);
    const values = [];
    for (let index = 0; index < Math.min(size, 16); index++) values.push(oneFrameSnapshot(items.add(0x20 + index * Process.pointerSize).readPointer()));
    return {{ size, values }};
  }} catch (_) {{ return null; }}
}}
function inputOwners(pointer) {{
  try {{
    const array = p64(pointer, 0x20);
    return {{ array: ptrText(array), length: array.isNull() ? null : u32(array, 0x18), values: pointerArray(array, 20) }};
  }} catch (_) {{ return null; }}
}}
function touchSnapshot(pointer) {{
  return {{ pointer: ptrText(pointer), finger_id: i32(pointer, 0), position_x: f32(pointer, 4), position_y: f32(pointer, 8), raw_x: f32(pointer, 0xC), raw_y: f32(pointer, 0x10), delta_x: f32(pointer, 0x14), delta_y: f32(pointer, 0x18), delta_time: f32(pointer, 0x1C), tap_count: i32(pointer, 0x20), phase: i32(pointer, 0x24), touch_type: i32(pointer, 0x28), pressure: f32(pointer, 0x2C) }};
}}
function record(kind, payload = {{}}) {{
  counts[kind] = (counts[kind] || 0) + 1;
  if (events.length >= MAX_EVENTS) return;
  events.push({{ sequence: sequence++, timestamp_ms: Date.now(), thread_id: Process.getCurrentThreadId(), marker, kind, ...payload }});
}}
function hook(name, callbacks) {{
  const address = Process.findModuleByName('libil2cpp.so').base.add(TARGETS[name]);
  Interceptor.attach(address, callbacks);
}}
function argInt(args, index) {{ try {{ return args[index].toInt32(); }} catch (_) {{ return null; }} }}

for (const name of ['Touch.get_fingerId', 'Touch.get_position', 'Touch.get_phase']) {{
  hook(name, {{ onEnter(args) {{ const touch = touchSnapshot(args[0]); record(name, {{ touch }}); }} }});
}}
hook('InputManager.ExecInput', {{ onEnter(args) {{ execFrames++; const state=argInt(args,1); if (execFrames <= 5 || state !== 5) record('InputManager.ExecInput', {{ frame:execFrames, current_game_state:state, owner:ptrText(args[0]) }}); }} }});
hook('InputManager.inputPlaying', {{ onEnter(args) {{ this.owner=args[0]; }}, onLeave() {{ if (events.length && events[events.length-1].timestamp_ms >= Date.now()-20) record('InputManager.inputPlaying.leave', {{ owner:ptrText(this.owner), finger_button_owners:inputOwners(this.owner) }}); }} }});
hook('InputManager.inputButton', {{
  onEnter(args) {{ this.owner=args[0]; this.phase=argInt(args,1); this.button=args[2]; this.finger=argInt(args,3); record('InputManager.inputButton.enter', {{ owner:ptrText(args[0]), phase:this.phase, button:buttonSnapshot(this.button), finger_id:this.finger, finger_button_owners:inputOwners(args[0]) }}); }},
  onLeave(retval) {{ record('InputManager.inputButton.leave', {{ phase:this.phase, finger_id:this.finger, returned:retval.toInt32() & 1, button:buttonSnapshot(this.button), finger_button_owners:inputOwners(this.owner) }}); }}
}});
for (const name of ['ButtonManager.GetButton','ButtonManager.GetPlayButton','ButtonManager.calcNearestButton','ButtonManager.calcSecondNearButton','ButtonManager.calcThirdNearButton']) {{
  hook(name, {{ onEnter(args) {{ this.owner=args[0]; }}, onLeave(retval) {{ record(name, {{ owner:ptrText(this.owner), returned:buttonSnapshot(retval) }}); }} }});
}}
hook('GamePlayButton.GetTouchBeganNote', {{ onEnter(args) {{ this.owner=args[0]; this.finger=argInt(args,1); }}, onLeave(retval) {{ record('GamePlayButton.GetTouchBeganNote', {{ owner:buttonSnapshot(this.owner), finger_id:this.finger, returned:noteSnapshot(retval) }}); }} }});
hook('GamePlayButton.setTouchBeganNote', {{ onEnter(args) {{ record('GamePlayButton.setTouchBeganNote', {{ owner:buttonSnapshot(args[0]), note:noteSnapshot(args[1]), finger_id:argInt(args,2) }}); }} }});
for (const name of ['GamePlayButton.ExecTouchBegan','GamePlayButton.ExecTouchMoved','GamePlayButton.ExecTouchEnded']) {{
  hook(name, {{ onEnter(args) {{ this.owner=args[0]; this.finger=argInt(args,1); record(name+'.enter', {{ owner:buttonSnapshot(args[0]), finger_id:this.finger }}); }}, onLeave() {{ record(name+'.leave', {{ owner:buttonSnapshot(this.owner), finger_id:this.finger }}); }} }});
}}
hook('GamePlayButton.CalculateTouchEndedJudge', {{ onEnter(args) {{ this.owner=args[0]; this.finger=argInt(args,1); this.timing=args[2]; }}, onLeave(retval) {{ record('GamePlayButton.CalculateTouchEndedJudge', {{ owner:buttonSnapshot(this.owner), finger_id:this.finger, result:retval.toInt32(), judge_timing:i32(this.timing,0) }}); }} }});

const beganHooks=['NoteNormal.ExecTouchBegan','NoteMultipleDirectionalFlick.ExecTouchBegan','NoteLong.ExecTouchBegan','NoteSlide.ExecTouchBegan'];
for (const name of beganHooks) hook(name, {{ onEnter(args) {{ this.note=args[0]; record(name+'.enter', {{ note:noteSnapshot(args[0]), result:argInt(args,1), judge_timing:argInt(args,2) }}); }}, onLeave() {{ record(name+'.leave', {{ note:noteSnapshot(this.note) }}); }} }});
const movedHooks=['NoteFlick.ExecTouchMoved','NoteDirectionalFlick.ExecTouchMoved','NoteMultipleDirectionalFlick.ExecTouchMoved','NoteLong.ExecTouchMoved','NoteSlide.ExecTouchMoved'];
for (const name of movedHooks) hook(name, {{ onEnter(args) {{ this.note=args[0]; record(name+'.enter', {{ note:noteSnapshot(args[0]), result:argInt(args,1), button:buttonSnapshot(args[2]) }}); }}, onLeave() {{ record(name+'.leave', {{ note:noteSnapshot(this.note) }}); }} }});
for (const name of ['NoteLong.ExecTouchEnded','NoteSlide.ExecTouchEnded']) hook(name, {{ onEnter(args) {{ this.note=args[0]; record(name+'.enter', {{ note:noteSnapshot(args[0]), result:argInt(args,1), judge_timing:argInt(args,2) }}); }}, onLeave() {{ record(name+'.leave', {{ note:noteSnapshot(this.note) }}); }} }});
for (const name of ['NoteLong.onMiss','NoteSlide.intermediateNoteJudge','NoteSlide.afterNoteJudge','NoteSlide.onMiss','NoteSlide.onMissAfterNote']) hook(name, {{ onEnter(args) {{ this.note=args[0]; record(name+'.enter', {{ note:noteSnapshot(args[0]), arg1:argInt(args,1), arg2:argInt(args,2), arg3:argInt(args,3), target_note:noteSnapshot(args[1]) }}); }}, onLeave() {{ record(name+'.leave', {{ note:noteSnapshot(this.note) }}); }} }});
hook('SlideNoteManager.Judge', {{ onEnter(args) {{ this.owner=args[0]; this.cursor=args[1]; }}, onLeave(retval) {{ record('SlideNoteManager.Judge', {{ owner:ptrText(this.owner), result:retval.toInt32(), cursor:i32(this.cursor,0) }}); }} }});
hook('SlideNoteManager.GetNearJudgeLineNote', {{ onEnter(args) {{ this.a=args[1]; this.b=args[2]; }}, onLeave(retval) {{ record('SlideNoteManager.GetNearJudgeLineNote', {{ note_a:noteSnapshot(this.a), note_b:noteSnapshot(this.b), returned:noteSnapshot(retval) }}); }} }});
hook('NoteFrontBase.calculateScreenPosToWorldDistanceRate', {{ onLeave(retval) {{ record('NoteFrontBase.calculateScreenPosToWorldDistanceRate', {{ result_bits:'0x'+(retval.toInt32() >>> 0).toString(16).padStart(8,'0').toUpperCase() }}); }} }});
hook('NoteUtility.GetResult', {{ onEnter(args) {{ this.sweet=argInt(args,0); }}, onLeave(retval) {{ record('NoteUtility.GetResult', {{ sweet_frame:this.sweet, result:retval.toInt32() }}); }} }});
hook('NoteUtility.JudgeNote', {{ onEnter(args) {{ this.timing=args[0]; this.sweet=argInt(args,1); }}, onLeave(retval) {{ record('NoteUtility.JudgeNote', {{ sweet_frame:this.sweet, result:retval.toInt32(), judge_timing:i32(this.timing,0) }}); }} }});
hook('NoteUtility.CalcNoteResultType', {{ onEnter(args) {{ this.note=args[0]; this.timing=args[4]; }}, onLeave(retval) {{ record('NoteUtility.CalcNoteResultType', {{ note:noteSnapshot(this.note), result:retval.toInt32(), judge_timing:i32(this.timing,0) }}); }} }});
hook('OneFrameController.GetUsable', {{ onEnter(args) {{ this.owner=args[0]; }}, onLeave(retval) {{ record('OneFrameController.GetUsable', {{ owner:ptrText(this.owner), returned:oneFrameSnapshot(retval), slots:controllerSlots(this.owner) }}); }} }});
hook('OneFrameData.Setup', {{ onEnter(args) {{ this.frame=args[0]; record('OneFrameData.Setup.enter', {{ frame:oneFrameSnapshot(args[0]) }}); }}, onLeave() {{ record('OneFrameData.Setup.leave', {{ frame:oneFrameSnapshot(this.frame) }}); }} }});
hook('OneFrameController.Reflect', {{ onEnter(args) {{ reflectFrames++; const slots=controllerSlots(args[0]); if (slots && slots.values.some(slot => slot && slot.is_using)) record('OneFrameController.Reflect.enter', {{ frame:reflectFrames, is_on_move_time:argInt(args,1), slots }}); }}, onLeave() {{ }} }});
hook('NoteBase.SetFingerId', {{ onEnter(args) {{ record('NoteBase.SetFingerId', {{ note:noteSnapshot(args[0]), new_finger_id:argInt(args,1) }}); }} }});
hook('NoteBase.Deactivate', {{ onEnter(args) {{ this.note=args[0]; record('NoteBase.Deactivate.enter', {{ note:noteSnapshot(args[0]) }}); }}, onLeave() {{ record('NoteBase.Deactivate.leave', {{ note:noteSnapshot(this.note) }}); }} }});

rpc.exports.mark = function(value) {{ marker=String(value); record('capture.marker', {{ value:marker }}); return marker; }};
rpc.exports.drain = function() {{ const result=events.splice(0,events.length); return result; }};
rpc.exports.summary = function() {{ return {{ counts, exec_frames:execFrames, reflect_frames:reflectFrames, queued:events.length, marker }}; }};
rpc.exports.moduleinfo = function() {{ const module=Process.findModuleByName('libil2cpp.so'); return {{ base:module.base.toString(), size:module.size, path:module.path }}; }};
"""


def execute_action(script: Any, action: dict[str, Any]) -> None:
    delay_ms = int(action.get("delay_ms", 0))
    if delay_ms:
        time.sleep(delay_ms / 1000)
    marker = action.get("marker")
    if marker:
        script.exports_sync.mark(str(marker))
    kind = action.get("kind", "wait")
    if kind == "wait":
        return
    if kind == "tap":
        adb("shell", "input", "tap", str(action["x"]), str(action["y"]), capture=False)
        return
    if kind == "swipe":
        adb(
            "shell", "input", "swipe", str(action["x1"]), str(action["y1"]),
            str(action["x2"]), str(action["y2"]), str(action["duration_ms"]), capture=False
        )
        return
    if kind == "keyevent":
        adb("shell", "input", "keyevent", str(action["keycode"]), capture=False)
        return
    if kind == "multitouch":
        screen_height = int(action.get("screen_height", 720))
        screen_y = int(action["screen_y"])
        raw_x = screen_height - screen_y
        first_y = int(action["first_screen_x"])
        second_y = int(action["second_screen_x"])
        first_end_y = int(action.get("first_end_screen_x", first_y))
        second_end_y = int(action.get("second_end_screen_x", second_y))
        duration = float(action.get("duration_ms", 300)) / 1000
        command = "; ".join([
            "sendevent /dev/input/event2 3 47 0",
            "sendevent /dev/input/event2 3 57 100",
            f"sendevent /dev/input/event2 3 53 {raw_x}",
            f"sendevent /dev/input/event2 3 54 {first_y}",
            "sendevent /dev/input/event2 3 47 1",
            "sendevent /dev/input/event2 3 57 101",
            f"sendevent /dev/input/event2 3 53 {raw_x}",
            f"sendevent /dev/input/event2 3 54 {second_y}",
            "sendevent /dev/input/event2 1 330 1",
            "sendevent /dev/input/event2 0 0 0",
            f"sleep {duration / 2:.3f}",
            "sendevent /dev/input/event2 3 47 0",
            f"sendevent /dev/input/event2 3 54 {first_end_y}",
            "sendevent /dev/input/event2 3 47 1",
            f"sendevent /dev/input/event2 3 54 {second_end_y}",
            "sendevent /dev/input/event2 0 0 0",
            f"sleep {duration / 2:.3f}",
            "sendevent /dev/input/event2 3 47 0",
            "sendevent /dev/input/event2 3 57 -1",
            "sendevent /dev/input/event2 3 47 1",
            "sendevent /dev/input/event2 3 57 -1",
            "sendevent /dev/input/event2 1 330 0",
            "sendevent /dev/input/event2 0 0 0",
        ])
        adb("shell", "su", "-c", "setenforce 0", capture=False)
        try:
            adb("shell", "su", "-c", command, capture=False)
        finally:
            adb("shell", "su", "-c", "setenforce 1", capture=False)
            if adb("shell", "getenforce") != "Enforcing":
                raise RuntimeError("SELinux was not restored to Enforcing")
        return
    raise ValueError(f"unsupported action kind: {kind}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes()
    capture_script_bytes = Path(__file__).read_bytes()
    plan = json.loads(plan_bytes)
    version = adb("shell", "dumpsys", "package", PACKAGE)
    if "versionName=10.1.4" not in version or "versionCode=230" not in version:
        raise RuntimeError("device package is not locked to 10.1.4 / 230")
    pid = int(adb("shell", "pidof", PACKAGE))
    device = frida.get_usb_device(timeout=10)
    session = device.attach(pid)
    script = session.create_script(build_script())
    script.on("message", lambda message, data: print(json.dumps({"frida_message": message}, ensure_ascii=False)))
    script.load()
    module_info = None
    script.exports_sync.mark(plan.get("scenario_id", "runtime"))
    collected: list[dict[str, Any]] = []
    stop = threading.Event()
    rpc_error: str | None = None

    def drain_loop() -> None:
        nonlocal rpc_error
        while not stop.wait(0.25):
            try:
                collected.extend(script.exports_sync.drain())
            except Exception as error:
                rpc_error = f"{type(error).__name__}: {error}"
                return

    drainer = threading.Thread(target=drain_loop, daemon=True)
    drainer.start()
    started = datetime.now(timezone.utc).isoformat()
    try:
        for action in plan["actions"]:
            execute_action(script, action)
        time.sleep(float(plan.get("tail_seconds", 3)))
    except Exception as error:
        rpc_error = f"{type(error).__name__}: {error}"
    finally:
        stop.set()
        drainer.join(timeout=2)
        try:
            collected.extend(script.exports_sync.drain())
            summary = script.exports_sync.summary()
        except Exception as error:
            rpc_error = rpc_error or f"{type(error).__name__}: {error}"
            summary = {"counts": {}, "exec_frames": None, "reflect_frames": None, "queued": None, "marker": None}
        try:
            session.detach()
        except Exception:
            pass
    output = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only" if rpc_error is None else "partial-r1-observation-process-ended",
        "capability": {
            "level": "R1",
            "return_replacement": False,
            "memory_writes": False,
            "apk_modification": False,
            "input_injection": "Android adb input only",
        },
        "sample": {
            "package": PACKAGE,
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "libil2cpp_sha256": LIB_SHA256,
            "pid": pid,
            "module": module_info,
        },
        "scenario": plan,
        "plan_sha256": hashlib.sha256(plan_bytes).hexdigest().upper(),
        "capture_script_sha256": hashlib.sha256(capture_script_bytes).hexdigest().upper(),
        "started_utc": started,
        "finished_utc": datetime.now(timezone.utc).isoformat(),
        "events": sorted(collected, key=lambda event: event["sequence"]),
        "summary": summary,
        "capture_error": rpc_error,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "events": len(collected), "summary": summary}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
