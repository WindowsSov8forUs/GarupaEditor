#!/usr/bin/env python3
"""Capture privacy-minimized deck aggregate initialization on 10.1.4 ARM64."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import threading
import time
from typing import Any

import frida


PACKAGE = "jp.co.craftegg.band"
ADB = r"HOST___________\scrcpy\adb.exe"
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
TARGETS = {
    "InGameCalculatedData.ctor": 0x32F0FCC,
    "InGameRecord.InitializeLife": 0x32F25B8,
    "ScoreUtility.CacheTotalParameter": 0x331E060,
    "ScoreUtility.calcTotalParameter": 0x331E0AC,
    "ScoreUtility.calcTotalParameter.array": 0x331E100,
    "ScoreUtility.calcTotalParameter.aggregates": 0x331E168,
    "ScoreUtility.calcTotalParameter.result": 0x331E180,
    "ScoreUtility.CachePlayLevelScoreRate": 0x331E188,
    "ScoreUtility.InitBaseScore": 0x331E660,
    "ScoreUtility.InitBaseScore.afterStartData": 0x331E6C8,
}


def adb(*args: str, capture: bool = True) -> str:
    result = subprocess.run(
        [ADB, *args],
        check=True,
        capture_output=capture,
        text=True,
        encoding="utf-8",
        errors="replace",
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
const MAX_EVENTS = 2000;
const module = Process.findModuleByName('libil2cpp.so');

function ptrText(value) {{ try {{ return value.isNull() ? null : value.toString(); }} catch (_) {{ return null; }} }}
function i32(pointer, offset) {{ try {{ return pointer.add(offset).readS32(); }} catch (_) {{ return null; }} }}
function u8(pointer, offset) {{ try {{ return pointer.add(offset).readU8(); }} catch (_) {{ return null; }} }}
function u32(pointer, offset) {{ try {{ return pointer.add(offset).readU32(); }} catch (_) {{ return null; }} }}
function p64(pointer, offset) {{ try {{ return pointer.add(offset).readPointer(); }} catch (_) {{ return ptr(0); }} }}
function f32(pointer, offset) {{
  try {{ return {{ value:pointer.add(offset).readFloat(), bits:'0x'+pointer.add(offset).readU32().toString(16).padStart(8,'0').toUpperCase() }}; }}
  catch (_) {{ return null; }}
}}
function registerF32(context, name) {{
  try {{
    const view=new DataView(context[name]);
    return {{ value:view.getFloat32(0,true), bits:'0x'+view.getUint32(0,true).toString(16).padStart(8,'0').toUpperCase() }};
  }} catch (_) {{ return null; }}
}}
function managedString(pointer) {{
  try {{
    if (pointer.isNull()) return null;
    const length=pointer.add(0x10).readS32();
    if (length < 0 || length > 256) return null;
    return pointer.add(0x14).readUtf16String(length);
  }} catch (_) {{ return null; }}
}}
function managedArrayIdentity(pointer) {{
  try {{
    if (pointer.isNull()) return null;
    return {{ pointer:ptrText(pointer), length:pointer.add(0x18).readU32(), elements_omitted:true }};
  }} catch (_) {{ return null; }}
}}
function scoreUtilitySnapshot() {{
  try {{
    const typeSlot=module.base.add(0x6C8E0E8).readPointer();
    const klass=typeSlot.readPointer();
    const fields=klass.add(0xB8).readPointer();
    return {{
      type_slot:ptrText(typeSlot), class:ptrText(klass), static_fields:ptrText(fields),
      total_parameter:f32(fields,0x0), score_level_rate:f32(fields,0x4),
      base_score:f32(fields,0x8), bonus_base_score:f32(fields,0xC)
    }};
  }} catch (_) {{ return null; }}
}}
function startDataSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), music_id:u32(pointer,0x20),
    bms_file_name:managedString(p64(pointer,0x58)), difficulty:managedString(p64(pointer,0x68)),
    score_level:u32(pointer,0x70), user_deck_pointer:ptrText(p64(pointer,0x78)),
    deck_user_situation_array:managedArrayIdentity(p64(pointer,0x80)),
    free_live_event_bonus_total_parameter:f32(pointer,0x88),
    miss_damage:i32(pointer,0xA0), bad_damage:i32(pointer,0xA4),
    play_mode:i32(pointer,0xA8), event_play_mode:i32(pointer,0xAC), is_auto_live:u8(pointer,0xB0),
    privacy:{{ account_fields_included:false, user_deck_contents_omitted:true, room_fields_omitted:true }}
  }};
}}
function calculatedSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), in_game_mode:i32(pointer,0x10), music_id:u32(pointer,0x44),
    difficulty:managedString(p64(pointer,0x50)), event_play_mode:i32(pointer,0x78),
    is_enable_practice:u8(pointer,0x80), bms_file_name:managedString(p64(pointer,0x88)),
    miss_damage:i32(pointer,0xA8), bad_damage:i32(pointer,0xAC), is_demo_play_mode:u8(pointer,0xB8),
    deck_user_situation_array:managedArrayIdentity(p64(pointer,0xE8)),
    deck_character_info_models:managedArrayIdentity(p64(pointer,0xF0)),
    deck_unification_band_id:i32(pointer,0x12C), deck_unification_attribute:i32(pointer,0x130),
    is_auto_live:u8(pointer,0x188),
    privacy:{{ account_fields_included:false, deck_elements_omitted:true, display_strings_omitted:true }}
  }};
}}
function recordSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), current_life:i32(pointer,0x20), displayed_or_skill_base_life:i32(pointer,0x24),
    business_life_upper_limit:i32(pointer,0x28), max_note_count:i32(pointer,0x2C)
  }};
}}
function record(kind,payload={{}}) {{
  counts[kind]=(counts[kind]||0)+1;
  if (events.length>=MAX_EVENTS) return;
  events.push({{ sequence:sequence++, timestamp_ms:Date.now(), thread_id:Process.getCurrentThreadId(), marker, kind, ...payload }});
}}
function hook(name,callbacks) {{ Interceptor.attach(module.base.add(TARGETS[name]),callbacks); }}

hook('InGameCalculatedData.ctor', {{
  onEnter(args) {{ this.self=args[0]; record('InGameCalculatedData.ctor.enter',{{ self:ptrText(this.self) }}); }},
  onLeave() {{ record('InGameCalculatedData.ctor.leave',{{ calculated:calculatedSnapshot(this.self) }}); }}
}});
hook('InGameRecord.InitializeLife', {{
  onEnter(args) {{ this.self=args[0]; record('InGameRecord.InitializeLife.enter',{{ self:ptrText(this.self), default_life:args[1].toInt32(), max_life:args[2].toInt32(), initial_life:args[3].toInt32() }}); }},
  onLeave() {{ record('InGameRecord.InitializeLife.leave',{{ record:recordSnapshot(this.self) }}); }}
}});
for (const name of ['ScoreUtility.CacheTotalParameter','ScoreUtility.CachePlayLevelScoreRate']) {{
  hook(name, {{
    onEnter() {{ record(name+'.enter',{{ score_utility:scoreUtilitySnapshot() }}); }},
    onLeave() {{ record(name+'.leave',{{ score_utility:scoreUtilitySnapshot() }}); }}
  }});
}}
hook('ScoreUtility.calcTotalParameter', {{
  onEnter() {{ record('ScoreUtility.calcTotalParameter.enter'); }},
  onLeave() {{ record('ScoreUtility.calcTotalParameter.leave'); }}
}});
hook('ScoreUtility.calcTotalParameter.array', {{
  onEnter() {{
    const singleton=this.context.x0;
    const array=p64(singleton,0x80);
    record('ScoreUtility.calcTotalParameter.array',{{
      singleton:ptrText(singleton),
      deck_array:managedArrayIdentity(array),
      privacy:{{ member_pointers_omitted:true, member_rows_omitted:true, account_fields_included:false }}
    }});
  }}
}});
hook('ScoreUtility.calcTotalParameter.aggregates', {{
  onEnter() {{ record('ScoreUtility.calcTotalParameter.aggregates',{{
    component_2c:registerF32(this.context,'q9'),
    component_30:registerF32(this.context,'q8'),
    component_34:registerF32(this.context,'q10'),
    member_rows_omitted:true
  }}); }}
}});
hook('ScoreUtility.calcTotalParameter.result', {{
  onEnter() {{ record('ScoreUtility.calcTotalParameter.result',{{ total_parameter:registerF32(this.context,'q0') }}); }}
}});
hook('ScoreUtility.InitBaseScore.afterStartData', {{
  onEnter() {{ record('ScoreUtility.InitBaseScore.start_data',{{ start_data:startDataSnapshot(this.context.x0), score_utility:scoreUtilitySnapshot() }}); }}
}});
hook('ScoreUtility.InitBaseScore', {{
  onEnter(args) {{ this.maxNoteCount=args[0].toInt32(); record('ScoreUtility.InitBaseScore.enter',{{ max_note_count:this.maxNoteCount, score_utility:scoreUtilitySnapshot() }}); }},
  onLeave() {{ record('ScoreUtility.InitBaseScore.leave',{{ max_note_count:this.maxNoteCount, score_utility:scoreUtilitySnapshot() }}); }}
}});

rpc.exports.mark=function(value) {{ marker=String(value); record('capture.marker',{{value:marker}}); return marker; }};
rpc.exports.drain=function() {{ return events.splice(0,events.length); }};
rpc.exports.summary=function() {{ return {{counts,queued:events.length,marker}}; }};
rpc.exports.moduleinfo=function() {{ return {{base:module.base.toString(),size:module.size,path:module.path}}; }};
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
    raise ValueError(f"unsupported action kind: {kind}")


def write_output(path: Path, payload: dict[str, Any]) -> None:
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".gz":
        with path.open("wb") as raw_output:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw_output, mtime=0) as output:
                output.write(encoded)
    else:
        path.write_bytes(encoded)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device-address", required=True)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes()
    script_bytes = Path(__file__).read_bytes()
    plan = json.loads(plan_bytes)
    version = adb("shell", "dumpsys", "package", PACKAGE)
    if "versionName=10.1.4" not in version or "versionCode=230" not in version:
        raise RuntimeError("device package is not locked to 10.1.4 / 230")
    if adb("shell", "getenforce") != "Enforcing":
        raise RuntimeError("SELinux must be Enforcing before observation")
    pid = int(adb("shell", "pidof", PACKAGE))
    device = frida.get_device_manager().add_remote_device(args.device_address)
    session = device.attach(pid)
    script = session.create_script(build_script())
    script.on("message", lambda message, data: print(json.dumps({"frida_message": message}, ensure_ascii=False)))
    script.load()
    module_info = script.exports_sync.moduleinfo()
    script.exports_sync.mark(plan["scenario_id"])
    collected: list[dict[str, Any]] = []
    stop = threading.Event()
    rpc_error: str | None = None

    def drain_loop() -> None:
        nonlocal rpc_error
        while not stop.wait(0.2):
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
        time.sleep(float(plan.get("tail_seconds", 2)))
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
            summary = {"counts": {}, "queued": None, "marker": None}
        try:
            session.detach()
        except Exception:
            pass
    output = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only" if rpc_error is None else "partial-r1-observation-process-ended",
        "capability": {
            "level": "R1", "return_replacement": False, "memory_writes": False,
            "apk_modification": False, "input_injection": "Android adb input tap only",
            "transport": {"kind": "explicit-remote", "address": args.device_address},
        },
        "sample": {
            "package": PACKAGE, "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a",
            "libil2cpp_sha256": LIB_SHA256, "global_metadata_sha256": METADATA_SHA256,
            "pid": pid, "module": module_info,
        },
        "scenario": {**plan, "plan_file": args.plan.name},
        "plan_sha256": hashlib.sha256(plan_bytes).hexdigest().upper(),
        "capture_script_sha256": hashlib.sha256(script_bytes).hexdigest().upper(),
        "started_utc": started,
        "finished_utc": datetime.now(timezone.utc).isoformat(),
        "events": sorted(collected, key=lambda event: event["sequence"]),
        "summary": summary,
        "privacy": {
            "account_fields_included": False,
            "omitted": ["user_id", "room_id", "room_name", "user_deck_contents", "deck_element_contents", "deck_member_pointers", "deck_member_rows", "display_strings"],
        },
        "capture_error": rpc_error,
    }
    write_output(args.output, output)
    print(json.dumps({"output": str(args.output), "events": len(collected), "summary": summary, "error": rpc_error}, ensure_ascii=False))
    return 0 if rpc_error is None else 2


if __name__ == "__main__":
    raise SystemExit(main())
