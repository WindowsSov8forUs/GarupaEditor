#!/usr/bin/env python3
"""Observe privacy-safe master music profile rows through natural UI calls."""

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
TARGET_MUSIC_ID = 786
TARGETS = {
    "MasterDataManager.GetMasterMusicDifficultyList.all": 0x328B610,
    "MasterDataManager.GetMasterMusicDifficultyList.byId": 0x328B634,
    "MasterDataManager.GetMasterMusic": 0x3290F94,
    "MasterDataManager.GetMasterMusicList": 0x32910BC,
}


def adb(*args: str, capture: bool = True) -> str:
    result = subprocess.run([ADB, *args], check=True, capture_output=capture, text=True, encoding="utf-8", errors="replace")
    return result.stdout.strip() if capture else ""


def build_script() -> str:
    targets = json.dumps(TARGETS, sort_keys=True)
    return f"""
'use strict';
const TARGETS = {targets};
const TARGET_MUSIC_ID = {TARGET_MUSIC_ID};
const events = [];
const counts = {{}};
let sequence = 0;
let marker = 'attach';
const module = Process.findModuleByName('libil2cpp.so');
function ptrText(value) {{ try {{ return value.isNull() ? null : value.toString(); }} catch (_) {{ return null; }} }}
function p64(pointer, offset) {{ try {{ return pointer.add(offset).readPointer(); }} catch (_) {{ return ptr(0); }} }}
function u8(pointer, offset) {{ try {{ return pointer.add(offset).readU8(); }} catch (_) {{ return null; }} }}
function u32(pointer, offset) {{ try {{ return pointer.add(offset).readU32(); }} catch (_) {{ return null; }} }}
function hex64(pointer, offset) {{ try {{ return '0x'+pointer.add(offset).readU64().toString(16).padStart(16,'0').toUpperCase(); }} catch (_) {{ return null; }} }}
function managedString(pointer) {{
  try {{ if (pointer.isNull()) return null; const length=pointer.add(0x10).readS32(); if(length<0||length>64)return null; return pointer.add(0x14).readUtf16String(length); }} catch (_) {{ return null; }}
}}
function arrayLength(pointer) {{ try {{ return pointer.isNull() ? null : pointer.add(0x18).readU32(); }} catch (_) {{ return null; }} }}
function arrayElement(pointer,index) {{ try {{ return pointer.add(0x20+index*8).readPointer(); }} catch (_) {{ return ptr(0); }} }}
function musicRow(pointer) {{
  if (!pointer || pointer.isNull() || u32(pointer,0x10)!==TARGET_MUSIC_ID) return null;
  return {{ pointer:ptrText(pointer), music_id:u32(pointer,0x10), band_id:u32(pointer,0x60), seq:u32(pointer,0x80), published_at_bits:hex64(pointer,0x88), closed_at_bits:hex64(pointer,0x90), category_set_id:u32(pointer,0xB8), strings_omitted:true }};
}}
function difficultyRow(pointer) {{
  if (!pointer || pointer.isNull() || u32(pointer,0x10)!==TARGET_MUSIC_ID) return null;
  return {{ pointer:ptrText(pointer), music_id:u32(pointer,0x10), difficulty:managedString(p64(pointer,0x18)), play_level:u32(pointer,0x20), notes_quantity:u32(pointer,0x30), score_s:u32(pointer,0x34), score_a:u32(pointer,0x38), score_b:u32(pointer,0x3C), score_c:u32(pointer,0x40), score_ss:u32(pointer,0x44), published_at_bits:hex64(pointer,0x48), enable_special_notes:u8(pointer,0x50), score_level_raw_bits:hex64(pointer,0x54), strings_omitted_except_difficulty:true }};
}}
function scanArray(pointer, projector) {{
  const length=arrayLength(pointer); const matches=[];
  if(length===null || length>10000) return {{ pointer:ptrText(pointer), length, matches, scan_error:'invalid-length' }};
  for(let index=0;index<length;index++) {{ const row=projector(arrayElement(pointer,index)); if(row) matches.push(row); }}
  return {{ pointer:ptrText(pointer), length, matches }};
}}
function scanMusicArray(pointer) {{ return scanArray(pointer,musicRow); }}
function scanDifficultyResponse(pointer) {{
  if (!pointer || pointer.isNull()) return {{ pointer:null, entries:null }};
  return {{ pointer:ptrText(pointer), entries:scanArray(p64(pointer,0x10),difficultyRow) }};
}}
function scanDifficultyList(pointer) {{
  if (!pointer || pointer.isNull()) return {{ pointer:null, size:null, matches:[] }};
  const size=u32(pointer,0x18); const items=p64(pointer,0x10); const scanned=scanArray(items,difficultyRow);
  return {{ pointer:ptrText(pointer), size, items_pointer:ptrText(items), matches:scanned.matches }};
}}
function record(kind,payload={{}}) {{ counts[kind]=(counts[kind]||0)+1; events.push({{sequence:sequence++,timestamp_ms:Date.now(),thread_id:Process.getCurrentThreadId(),marker,kind,...payload}}); }}
function hook(name,callbacks) {{ Interceptor.attach(module.base.add(TARGETS[name]),callbacks); }}
hook('MasterDataManager.GetMasterMusic', {{ onEnter(args){{this.musicId=args[1].toUInt32();}}, onLeave(retval){{if(this.musicId===TARGET_MUSIC_ID)record('MasterDataManager.GetMasterMusic.target',{{music_id:this.musicId,row:musicRow(retval)}});}} }});
hook('MasterDataManager.GetMasterMusicList', {{ onLeave(retval){{record('MasterDataManager.GetMasterMusicList.leave',{{music_list:scanMusicArray(retval)}});}} }});
hook('MasterDataManager.GetMasterMusicDifficultyList.all', {{ onLeave(retval){{record('MasterDataManager.GetMasterMusicDifficultyList.all.leave',{{difficulty_response:scanDifficultyResponse(retval)}});}} }});
hook('MasterDataManager.GetMasterMusicDifficultyList.byId', {{ onEnter(args){{this.musicId=args[1].toUInt32();}}, onLeave(retval){{if(this.musicId===TARGET_MUSIC_ID)record('MasterDataManager.GetMasterMusicDifficultyList.byId.target',{{music_id:this.musicId,difficulty_list:scanDifficultyList(retval)}});}} }});
rpc.exports.mark=function(value){{marker=String(value);record('capture.marker',{{value:marker}});return marker;}};
rpc.exports.drain=function(){{return events.splice(0,events.length);}};
rpc.exports.summary=function(){{return {{counts,queued:events.length,marker}};}};
rpc.exports.moduleinfo=function(){{return {{base:module.base.toString(),size:module.size,path:module.path}};}};
"""


def execute_action(script: Any, action: dict[str, Any]) -> None:
    delay_ms = int(action.get("delay_ms", 0))
    if delay_ms:
        time.sleep(delay_ms / 1000)
    if action.get("marker"):
        script.exports_sync.mark(str(action["marker"]))
    if action.get("kind", "wait") == "wait":
        return
    if action["kind"] == "tap":
        adb("shell", "input", "tap", str(action["x"]), str(action["y"]), capture=False)
        return
    raise ValueError(f"unsupported action kind: {action['kind']}")


def write_output(path: Path, payload: dict[str, Any]) -> None:
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as raw_output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw_output, mtime=0) as output:
            output.write(encoded)


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
            try: collected.extend(script.exports_sync.drain())
            except Exception as error:
                rpc_error = f"{type(error).__name__}: {error}"; return
    drainer = threading.Thread(target=drain_loop, daemon=True); drainer.start()
    started = datetime.now(timezone.utc).isoformat()
    try:
        for action in plan["actions"]: execute_action(script, action)
        time.sleep(float(plan.get("tail_seconds", 2)))
    except Exception as error: rpc_error = f"{type(error).__name__}: {error}"
    finally:
        stop.set(); drainer.join(timeout=2)
        try: collected.extend(script.exports_sync.drain()); summary=script.exports_sync.summary()
        except Exception as error: rpc_error=rpc_error or f"{type(error).__name__}: {error}"; summary={}
        try: session.detach()
        except Exception: pass
    output = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only" if rpc_error is None else "partial-r1-observation-process-ended",
        "capability": {"level":"R1","return_replacement":False,"memory_writes":False,"apk_modification":False,"input_injection":"Android adb input tap only","transport":{"kind":"explicit-remote","address":args.device_address}},
        "sample": {"package":PACKAGE,"version_name":"10.1.4","version_code":230,"abi":"arm64-v8a","libil2cpp_sha256":LIB_SHA256,"global_metadata_sha256":METADATA_SHA256,"pid":pid,"module":module_info},
        "scenario": {**plan,"plan_file":args.plan.name},
        "plan_sha256": hashlib.sha256(plan_bytes).hexdigest().upper(),
        "capture_script_sha256": hashlib.sha256(script_bytes).hexdigest().upper(),
        "started_utc": started,"finished_utc":datetime.now(timezone.utc).isoformat(),
        "events": sorted(collected,key=lambda event:event["sequence"]),"summary":summary,
        "privacy": {"account_fields_included":False,"omitted":["music_title","user_id","room_fields","deck_contents","all_non_target_master_rows"]},
        "capture_error": rpc_error,
    }
    write_output(args.output,output)
    print(json.dumps({"output":str(args.output),"events":len(collected),"summary":summary,"error":rpc_error},ensure_ascii=False))
    return 0 if rpc_error is None else 2


if __name__ == "__main__":
    raise SystemExit(main())
