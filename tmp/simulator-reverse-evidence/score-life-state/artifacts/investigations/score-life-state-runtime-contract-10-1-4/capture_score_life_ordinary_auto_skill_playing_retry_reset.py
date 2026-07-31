#!/usr/bin/env python3
"""Observe natural Retry reset while a Skill is Playing in locked ordinary Auto Live."""

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
    "ScoreUtility.InitBaseScore": 0x331E660,
    "DamageUtility.CalcBasePowerPoint": 0x331ACF4,
    "SituationSkillData.Initialize": 0x3320308,
    "SituationSkillManager.AddSituationSkillToPlayList": 0x3321D08,
    "SituationSkillManager.executeBeginSkillProcess": 0x3321934,
    "SituationSkillManager.executeFinishingSkillProcess": 0x3321A68,
    "SituationSkillManager.processOfSkillTriggered": 0x33224BC,
    "SituationSkillManager.playOnceEffectSkill": 0x332269C,
    "SituationSkillManager.processOfSkillFinished": 0x33227F4,
    "InGameRecord.CalcOneNotesMaxScoreInfo": 0x32F2478,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo": 0x32F2570,
    "SituationSkillManager.ExecUpdate": 0x3321904,
    "SituationSkillManager.ExecAwakeStart": 0x33214FC,
    "SituationSkillManager.Stop": 0x33228D8,
}


def adb(*args: str, capture: bool = True) -> str:
    result = subprocess.run([ADB, *args], check=True, capture_output=capture, text=True, encoding="utf-8", errors="replace")
    return result.stdout.strip() if capture else ""


def build_script() -> str:
    targets = json.dumps(TARGETS, sort_keys=True)
    return f"""
'use strict';
const TARGETS={targets}; const events=[]; const counts={{}}; let sequence=0; let marker='attach';
const module=Process.findModuleByName('libil2cpp.so'); const aliases=new Map(); let nextAlias=1;
function p64(p,o){{try{{return p.add(o).readPointer();}}catch(_){{return ptr(0);}}}}
function u8(p,o){{try{{return p.add(o).readU8();}}catch(_){{return null;}}}}
function u32(p,o){{try{{return p.add(o).readU32();}}catch(_){{return null;}}}}
function i32(p,o){{try{{return p.add(o).readS32();}}catch(_){{return null;}}}}
function f32(p,o){{try{{const v=p.add(o).readFloat(),b=p.add(o).readU32();return {{value:v,bits:'0x'+b.toString(16).padStart(8,'0').toUpperCase()}};}}catch(_){{return null;}}}}
function alias(p){{if(!p||p.isNull())return null;const k=p.toString();if(!aliases.has(k))aliases.set(k,'skill-'+String(nextAlias++).padStart(2,'0'));return aliases.get(k);}}
function list(p,project,max=32){{if(!p||p.isNull())return {{size:null,values:[]}};const n=u32(p,0x18),a=p64(p,0x10),values=[];if(n===null||n>max)return {{size:n,values,invalid:true}};for(let i=0;i<n;i++)values.push(project(p64(a,0x20+i*8)));return {{size:n,values}};}}
function once(p){{return !p||p.isNull()?null:{{type:i32(p,0x10),value_type:i32(p,0x14),value:i32(p,0x18)}};}}
function onceCondition(p){{return !p||p.isNull()?null:{{life_type:i32(p,0x10),life:u32(p,0x14)}};}}
function trigger(p){{return !p||p.isNull()?null:{{play_type:i32(p,0x10),play_value:u32(p,0x14),status_type:i32(p,0x18),comparison:i32(p,0x1C),value_type:i32(p,0x20),status_value:u32(p,0x24),probability:u32(p,0x28)}};}}
function effect(p){{return !p||p.isNull()?null:{{type:i32(p,0x10),value_type:i32(p,0x14),condition:i32(p,0x18),value:f32(p,0x1C),condition_life:u32(p,0x20),unification_value:u32(p,0x24),unification_type:i32(p,0x28),unification_band:u32(p,0x2C),unification_satisfied:u8(p,0x30),stack_value:f32(p,0x34),max_value:u32(p,0x38)}};}}
function master(p){{return !p||p.isNull()?null:{{alias:alias(p),duration:f32(p,0x30),once_effect:once(p64(p,0x38)),once_condition:onceCondition(p64(p,0x40)),trigger:trigger(p64(p,0x48)),active_effects:list(p64(p,0x50),effect),identities_omitted:true}};}}
function skillData(p){{if(!p||p.isNull())return null;return {{master_alias:alias(p64(p,0x18)),skill_note_index:i32(p,0x24),absolute_pos:i32(p,0x28),continuous_result:i32(p,0x2C),crescendo_rate:f32(p,0x30),member_identity_omitted:true}};}}
function oneNote(p){{return !p||p.isNull()?null:{{score:u32(p,0x10),combo:u32(p,0x14),skill_factor:f32(p,0x18),is_fever:u8(p,0x28),notes_type_omitted:true}};}}
function recordState(p){{return !p||p.isNull()?null:{{score:u32(p,0x14),reserve_score:u32(p,0x1C),life:i32(p,0x20),max_life:i32(p,0x24),max_note_count:i32(p,0x2C),combo:i32(p,0x34),one_note:oneNote(p64(p,0x78)),event_one_note:oneNote(p64(p,0x80)),judge_counts:[i32(p,0x44),i32(p,0x48),i32(p,0x4C),i32(p,0x50),i32(p,0x54)]}};}}
function skillState(p){{return !p||p.isNull()?null:{{record:recordState(p64(p,0x48)),playlist:list(p64(p,0x70),skillData),stock_size:list(p64(p,0x78),skillData).size,current:skillData(p64(p,0x80)),skill_timer:f32(p,0x88),finishing_timer:f32(p,0x8C),state:i32(p,0x90),reservation_frame:i32(p,0x30),reservation:skillData(p64(p,0x38)),reservation_encore:u8(p,0x40)}};}}
function calculated(p){{return !p||p.isNull()?null:{{mode:i32(p,0x10),miss_damage:i32(p,0xA8),bad_damage:i32(p,0xAC),is_auto_live:u8(p,0x188)}};}}
function emit(kind,payload={{}}){{counts[kind]=(counts[kind]||0)+1;events.push({{sequence:sequence++,timestamp_ms:Date.now(),thread_id:Process.getCurrentThreadId(),marker,kind,...payload}});}}
function hook(name,callbacks){{Interceptor.attach(module.base.add(TARGETS[name]),callbacks);}}
hook('ScoreUtility.InitBaseScore',{{onEnter(args){{emit('ScoreUtility.InitBaseScore',{{max_note_count:args[0].toInt32()}});}}}});
hook('DamageUtility.CalcBasePowerPoint',{{onEnter(args){{this.result=args[0].toInt32();this.data=args[1];}},onLeave(retval){{emit('DamageUtility.CalcBasePowerPoint',{{result:this.result,calculated:calculated(this.data),returned:retval.toInt32()}});}}}});
hook('SituationSkillData.Initialize',{{onEnter(args){{this.data=args[0];this.profile=master(args[1]);this.skill_note_index=args[4].toInt32();this.absolute_pos=args[5].toInt32();emit('SituationSkillData.Initialize.enter',{{profile:this.profile,skill_note_index:this.skill_note_index,absolute_pos:this.absolute_pos,member_identity_omitted:true}});}},onLeave(){{emit('SituationSkillData.Initialize.leave',{{data:skillData(this.data)}});}}}});
for(const name of ['SituationSkillManager.AddSituationSkillToPlayList','SituationSkillManager.executeBeginSkillProcess','SituationSkillManager.executeFinishingSkillProcess','SituationSkillManager.processOfSkillTriggered','SituationSkillManager.playOnceEffectSkill','SituationSkillManager.processOfSkillFinished']){{hook(name,{{onEnter(args){{this.self=args[0];emit(name+'.enter',{{skill:skillState(this.self),data:skillData(args[1]),effect_profile:name==='SituationSkillManager.processOfSkillTriggered'?master(p64(p64(this.self,0x80),0x18)):null}});}},onLeave(){{emit(name+'.leave',{{skill:skillState(this.self)}});}}}});}}
for(const name of ['InGameRecord.CalcOneNotesMaxScoreInfo','InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo']){{hook(name,{{onEnter(args){{this.self=args[0];this.add=args[1].toUInt32();emit(name+'.enter',{{add_score:this.add,record:recordState(this.self)}});}},onLeave(){{emit(name+'.leave',{{add_score:this.add,record:recordState(this.self)}});}}}});}}
hook('SituationSkillManager.ExecUpdate',{{onEnter(args){{emit('SituationSkillManager.ExecUpdate',{{game_frame_counter:args[1].toInt32(),current_game_state:args[2].toInt32(),skill:skillState(args[0])}});}}}});
hook('SituationSkillManager.ExecAwakeStart',{{onEnter(args){{this.self=args[0];emit('SituationSkillManager.ExecAwakeStart.enter',{{skill:skillState(this.self),record:recordState(args[1]),calculated:calculated(args[2])}});}},onLeave(){{emit('SituationSkillManager.ExecAwakeStart.leave',{{skill:skillState(this.self)}});}}}});
hook('SituationSkillManager.Stop',{{onEnter(args){{this.self=args[0];emit('SituationSkillManager.Stop.enter',{{skill:skillState(this.self)}});}},onLeave(){{emit('SituationSkillManager.Stop.leave',{{skill:skillState(this.self)}});}}}});
rpc.exports.mark=function(v){{marker=String(v);emit('capture.marker',{{value:marker}});return marker;}};
rpc.exports.drain=function(){{return events.splice(0,events.length);}};
rpc.exports.summary=function(){{return {{counts,queued:events.length,marker,anonymous_skill_count:aliases.size}};}};
rpc.exports.moduleinfo=function(){{return {{base:module.base.toString(),size:module.size,path:module.path}};}};
"""


def execute_action(script: Any, action: dict[str, Any], capture_complete: threading.Event) -> None:
    kind = action.get("kind", "wait")
    delay_ms = int(action.get("delay_ms", 0))
    if delay_ms:
        time.sleep(delay_ms / 1000)
    if action.get("marker"):
        script.exports_sync.mark(str(action["marker"]))
    if kind == "wait":
        return
    if kind == "wait_until_capture_complete":
        if not capture_complete.wait(int(action["timeout_ms"]) / 1000):
            raise TimeoutError("capture completion requirements were not met")
        return
    if kind == "tap":
        adb("shell", "input", "tap", str(action["x"]), str(action["y"]), capture=False)
        return
    raise ValueError(f"unsupported action kind: {kind}")


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
    capture_complete = threading.Event()
    completion_action = next((action for action in plan["actions"] if action["kind"] == "wait_until_capture_complete"), None)
    completion_counts = {"exec_awake_start_leave": 0}
    rpc_error: str | None = None

    def drain_loop() -> None:
        nonlocal rpc_error
        while not stop.wait(0.2):
            try:
                batch = script.exports_sync.drain()
                collected.extend(batch)
                for event in batch:
                    if event["kind"] == "SituationSkillManager.ExecAwakeStart.leave":
                        completion_counts["exec_awake_start_leave"] += 1
                if completion_action and completion_counts["exec_awake_start_leave"] >= completion_action["required_exec_awake_start_leave_count"]:
                    capture_complete.set()
            except Exception as error:
                rpc_error = f"{type(error).__name__}: {error}"
                capture_complete.set()
                return

    drainer = threading.Thread(target=drain_loop, daemon=True)
    drainer.start()
    started = datetime.now(timezone.utc).isoformat()
    try:
        for action in plan["actions"]:
            execute_action(script, action, capture_complete)
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
            summary = {}
        try:
            session.detach()
        except Exception:
            pass
    output = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only" if rpc_error is None else "partial-r1-observation-process-ended",
        "capability": {"level":"R1","return_replacement":False,"memory_writes":False,"apk_modification":False,"managed_invocation":False,"input_injection":"four predeclared Android adb taps for start, pause, natural Retry and confirmation, followed by passive wait-until-second-ExecAwakeStart-leave only","transport":{"kind":"explicit-remote","address":args.device_address}},
        "sample": {"package":PACKAGE,"version_name":"10.1.4","version_code":230,"abi":"arm64-v8a","libil2cpp_sha256":LIB_SHA256,"global_metadata_sha256":METADATA_SHA256,"pid":pid,"module":module_info},
        "scenario": {**plan,"plan_file":args.plan.name},
        "plan_sha256": hashlib.sha256(plan_bytes).hexdigest().upper(),
        "capture_script_sha256": hashlib.sha256(script_bytes).hexdigest().upper(),
        "started_utc": started,
        "finished_utc": datetime.now(timezone.utc).isoformat(),
        "events": sorted(collected, key=lambda event: event["sequence"]),
        "summary": summary,
        "privacy": {"account_fields_included":False,"raw_pointers_included":False,"display_strings_included":False,"skill_master_ids_included":False,"member_identity_included":False,"notes_type_omitted":True},
        "capture_error": rpc_error,
    }
    write_output(args.output, output)
    print(json.dumps({"output":str(args.output),"events":len(collected),"summary":summary,"error":rpc_error},ensure_ascii=False))
    return 0 if rpc_error is None else 2


if __name__ == "__main__":
    raise SystemExit(main())
