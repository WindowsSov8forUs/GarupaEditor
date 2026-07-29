#!/usr/bin/env python3
"""Capture observation-only score, life, Skill and Fever state on 10.1.4 ARM64."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
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
    "InGameRecord.CalcOneNotesMaxScoreInfo": 0x32F2478,
    "InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo": 0x32F2570,
    "InGameRecord.InitializeLife": 0x32F25B8,
    "InGameRecord.AddScore": 0x32F25C4,
    "InGameRecord.ResetScore": 0x32F2624,
    "InGameRecord.AddIPower": 0x32F262C,
    "InGameRecord.updateGameOverState": 0x32F26AC,
    "InGameRecord.FullRecoveryIPower": 0x32F2720,
    "InGameRecord.AddCombo": 0x32F272C,
    "InGameRecord.ResetCombo": 0x32F2780,
    "InGameRecord.ResetJudgeCount": 0x32F2788,
    "InGameRecord.IncrementJudgeCount": 0x32F27A0,
    "InGameRecord.IncrementJudgeTimingCount": 0x32F28C8,
    "OneFrameData.Setup": 0x32F29CC,
    "OneFrameTotalData.Setup": 0x32F2B00,
    "OneFrameController.Reflect": 0x3303FF0,
    "ScoreUtility.InitBaseScore": 0x331E660,
    "ScoreUtility.get_BaseScore": 0x331E528,
    "ScoreUtility.get_FreeLiveEventBonusAppliedBaseScore": 0x331E5C4,
    "ScoreUtility.GetResultTypeCorrectionRate": 0x331E91C,
    "ScoreUtility.GetComboCorrectionRate": 0x331EA00,
    "DamageUtility.CalcBasePowerPoint": 0x331ACF4,
    "NoteFrontBase.calcAddDamage": 0x30DFA98,
    "NoteFrontBase.calcSkillScoreUpRate": 0x30DFCD8,
    "NoteFrontBase.judgeFrontNote": 0x30E0130,
    "GamePlayButton.CorrectNoteResult": 0x387E684,
    "SkillUtility.shouldActivateNeverDieSkillEffect": 0x33DADCC,
    "SkillUtility.CalcAddDamageWithNeverDieSkill": 0x33DADDC,
    "SkillUtility.GetDamageGuardTypeWithNeverDieSkill": 0x33DADF4,
    "SituationSkillManager.ExecUpdate": 0x3321904,
    "SituationSkillManager.executeBeginSkillProcess": 0x3321934,
    "SituationSkillManager.executePlayingSkillProcess": 0x3321A08,
    "SituationSkillManager.executeFinishingSkillProcess": 0x3321A68,
    "SituationSkillManager.SkillNoteFailed": 0x3321CC8,
    "SituationSkillManager.AddSituationSkillToPlayList": 0x3321D08,
    "SituationSkillManager.processOfSkillTriggered": 0x33224BC,
    "SituationSkillManager.playOnceEffectSkill": 0x332269C,
    "SituationSkillManager.processOfSkillFinished": 0x33227F4,
    "SituationSkillManager.Stop": 0x33228D8,
    "FeverTimeManager.GetFeverTimeScoreRate": 0x32F3BF8,
    "FeverTimeManager.StartFeverTimeCommand": 0x32F3C10,
    "FeverTimeManager.JudgeFeverNote": 0x32F3D18,
    "FeverTimeManager.changeFeverTimeCommandType": 0x32F3C14,
    "FeverTimeManager.addMyFeverPoint": 0x32F3E80,
    "FeverTimeManager.resetFeverPoint": 0x32F4128,
    "FeverTimeManager.resetFeverStatePassConditions": 0x32F417C,
    "FeverTimeManager.execFeverCommandChanged": 0x32F41CC,
    "FeverTimeManager.judgeFever": 0x32F4214,
    "FeverTimeManager.changeFeverTimeState": 0x32F449C,
    "FeverTimeManager.updateFeverStatePassConditions": 0x32F44A4,
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
const MAX_EVENTS = 100000;

function ptrText(value) {{ try {{ return value.isNull() ? null : value.toString(); }} catch (_) {{ return null; }} }}
function i32(pointer, offset) {{ try {{ return pointer.add(offset).readS32(); }} catch (_) {{ return null; }} }}
function u8(pointer, offset) {{ try {{ return pointer.add(offset).readU8(); }} catch (_) {{ return null; }} }}
function u32(pointer, offset) {{ try {{ return pointer.add(offset).readU32(); }} catch (_) {{ return null; }} }}
function f32(pointer, offset) {{
  try {{ return {{ value:pointer.add(offset).readFloat(), bits:'0x'+pointer.add(offset).readU32().toString(16).padStart(8,'0').toUpperCase() }}; }}
  catch (_) {{ return null; }}
}}
function p64(pointer, offset) {{ try {{ return pointer.add(offset).readPointer(); }} catch (_) {{ return ptr(0); }} }}
function argInt(args, index) {{ try {{ return args[index].toInt32(); }} catch (_) {{ return null; }} }}
function argUInt(args, index) {{ try {{ return args[index].toUInt32(); }} catch (_) {{ return null; }} }}

function intArray(pointer, maximum=32) {{
  try {{
    if (pointer.isNull()) return null;
    const length=pointer.add(0x18).readU32(); const values=[];
    for (let index=0; index<Math.min(length,maximum); index++) values.push(pointer.add(0x20+index*4).readS32());
    return {{ length, values, truncated:length>maximum }};
  }} catch (_) {{ return null; }}
}}
function pointerList(pointer, mapper, maximum=16) {{
  try {{
    if (pointer.isNull()) return null;
    const items=p64(pointer,0x10); const size=i32(pointer,0x18); const values=[];
    for (let index=0; index<Math.min(size,maximum); index++) values.push(mapper(items.add(0x20+index*Process.pointerSize).readPointer()));
    return {{ pointer:ptrText(pointer), size, values, truncated:size>maximum }};
  }} catch (_) {{ return null; }}
}}
function feverPointInfoArray(pointer, maximum=16) {{
  try {{
    if (pointer.isNull()) return null;
    const length=u32(pointer,0x18); const values=[];
    for (let index=0; index<Math.min(length,maximum); index++) {{
      const item=pointer.add(0x20+index*0x18);
      values.push({{ display_index:i32(item,0x8), fever_point:i32(item,0xC), is_own_team:u8(item,0x10) }});
    }}
    return {{ pointer:ptrText(pointer), length, values, truncated:length>maximum, user_ids_omitted:true }};
  }} catch (_) {{ return null; }}
}}
function recordSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), is_multi_game_over:u8(pointer,0x11), is_single_game_over:u8(pointer,0x12),
    score:u32(pointer,0x14), free_live_bonus_score:u32(pointer,0x18), reserve_total_score:u32(pointer,0x1C),
    current_life:i32(pointer,0x20), displayed_or_skill_base_life:i32(pointer,0x24), business_life_upper_limit:i32(pointer,0x28), max_note_count:i32(pointer,0x2C),
    max_combo:i32(pointer,0x30), current_combo:i32(pointer,0x34), current_live_combo:i32(pointer,0x38), current_live_max_combo:i32(pointer,0x3C),
    perfect_combo:i32(pointer,0x40), perfect_count:i32(pointer,0x44), great_count:i32(pointer,0x48), good_count:i32(pointer,0x4C), bad_count:i32(pointer,0x50), miss_count:i32(pointer,0x54),
    immortality_timer:f32(pointer,0x60), tap_count:u32(pointer,0x70), cached_life_when_skill_played:u32(pointer,0x88),
    fast_count:u32(pointer,0x9C), slow_count:u32(pointer,0xA0)
  }};
}}
function oneFrameSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), is_using:u8(pointer,0x10), index:i32(pointer,0x14), button_types:intArray(p64(pointer,0x18)),
    add_score:f32(pointer,0x20), add_power:i32(pointer,0x24), add_combo:i32(pointer,0x28), note_type:i32(pointer,0x2C),
    result:i32(pointer,0x30), adjusted_result:i32(pointer,0x34), fever_rate:f32(pointer,0x38), skill_rate:f32(pointer,0x3C),
    crescendo_rate:f32(pointer,0x40), score_up_type:i32(pointer,0x44), absolute_pos:i32(pointer,0x48), damage_guard_type:i32(pointer,0x4C),
    judge_timing:i32(pointer,0x50), free_live_bonus_add_score:f32(pointer,0x54), score_up_rate:f32(pointer,0x58)
  }};
}}
function totalSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{ add_score:u32(pointer,0), add_power:i32(pointer,4), result:i32(pointer,8), adjusted_result:i32(pointer,12), score_up_type:i32(pointer,16), damage_guard_type:i32(pointer,20), crescendo_rate:f32(pointer,24), stage_effect_level:u32(pointer,28), judge_timing:i32(pointer,32), free_live_bonus_add_score:u32(pointer,36) }};
}}
function controllerSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), record:recordSnapshot(p64(pointer,0x10)), calculated:calculatedSnapshot(p64(pointer,0x18)),
    skill:skillSnapshot(p64(pointer,0x38)), slots:pointerList(p64(pointer,0x60), oneFrameSnapshot, 8), total:totalSnapshot(pointer.add(0x68))
  }};
}}
function calculatedSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{ pointer:ptrText(pointer), mode:i32(pointer,0x10), miss_damage:i32(pointer,0xA8), bad_damage:i32(pointer,0xAC), is_auto_live:u8(pointer,0x188) }};
}}
function skillDataSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{ pointer:ptrText(pointer), skill:ptrText(p64(pointer,0x18)), chara_index:i32(pointer,0x20), skill_note_index:i32(pointer,0x24), absolute_pos:i32(pointer,0x28), continuous_result:i32(pointer,0x2C), crescendo_rate:f32(pointer,0x30) }};
}}
function skillSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), record:recordSnapshot(p64(pointer,0x48)), playlist:pointerList(p64(pointer,0x70), skillDataSnapshot), stock:pointerList(p64(pointer,0x78), skillDataSnapshot),
    current:skillDataSnapshot(p64(pointer,0x80)), skill_timer:f32(pointer,0x88), finishing_timer:f32(pointer,0x8C), state:i32(pointer,0x90),
    reservation_frame:i32(pointer,0x30), reservation_skill:skillDataSnapshot(p64(pointer,0x38)), reservation_encore:u8(pointer,0x40)
  }};
}}
function feverSnapshot(pointer) {{
  if (!pointer || pointer.isNull()) return null;
  return {{
    pointer:ptrText(pointer), state:i32(pointer,0x4C), command:i32(pointer,0x50), my_point:i32(pointer,0x54),
    point_info:feverPointInfoArray(p64(pointer,0x58),16), points:intArray(p64(pointer,0x60),16), pass_conditions:intArray(p64(pointer,0x78),16),
    reservation_frame:i32(pointer,0x40), reservation_command:i32(pointer,0x44), reservation_after_state:i32(pointer,0x48)
  }};
}}
function record(kind,payload={{}}) {{
  counts[kind]=(counts[kind]||0)+1;
  if (events.length>=MAX_EVENTS) return;
  events.push({{ sequence:sequence++, timestamp_ms:Date.now(), thread_id:Process.getCurrentThreadId(), marker, kind, ...payload }});
}}
function hook(name,callbacks) {{
  const module=Process.findModuleByName('libil2cpp.so');
  Interceptor.attach(module.base.add(TARGETS[name]),callbacks);
}}

hook('InGameRecord.InitializeLife', {{ onEnter(args) {{ this.self=args[0]; this.values=[argInt(args,1),argInt(args,2),argInt(args,3)]; record('InGameRecord.InitializeLife.enter',{{ self:ptrText(this.self), default_life:this.values[0], max_life:this.values[1], initial_life:this.values[2] }}); }}, onLeave() {{ record('InGameRecord.InitializeLife.leave',{{ record:recordSnapshot(this.self) }}); }} }});
for (const name of ['InGameRecord.AddScore','InGameRecord.AddIPower','InGameRecord.AddCombo','InGameRecord.IncrementJudgeCount','InGameRecord.IncrementJudgeTimingCount']) {{
  hook(name, {{ onEnter(args) {{ this.self=args[0]; this.arg1=argInt(args,1); this.arg2=argUInt(args,2); this.before=recordSnapshot(this.self); record(name+'.enter',{{ arg1:this.arg1,arg2:this.arg2,before:this.before }}); }}, onLeave(retval) {{ record(name+'.leave',{{ arg1:this.arg1,returned:retval.toInt32(),after:recordSnapshot(this.self) }}); }} }});
}}
for (const name of ['InGameRecord.ResetScore','InGameRecord.ResetCombo','InGameRecord.ResetJudgeCount','InGameRecord.updateGameOverState','InGameRecord.FullRecoveryIPower']) {{
  hook(name, {{ onEnter(args) {{ this.self=args[0]; record(name+'.enter',{{ before:recordSnapshot(this.self) }}); }}, onLeave() {{ record(name+'.leave',{{ after:recordSnapshot(this.self) }}); }} }});
}}
for (const name of ['InGameRecord.CalcOneNotesMaxScoreInfo','InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo']) {{
  hook(name, {{ onEnter(args) {{ this.self=args[0]; this.add=argUInt(args,1); record(name+'.enter',{{ add_score:this.add,before:recordSnapshot(this.self) }}); }}, onLeave() {{ record(name+'.leave',{{ add_score:this.add,after:recordSnapshot(this.self) }}); }} }});
}}
hook('OneFrameData.Setup', {{ onEnter(args) {{ this.self=args[0]; record('OneFrameData.Setup.enter',{{ frame:oneFrameSnapshot(this.self) }}); }}, onLeave() {{ record('OneFrameData.Setup.leave',{{ frame:oneFrameSnapshot(this.self) }}); }} }});
hook('OneFrameTotalData.Setup', {{ onEnter(args) {{ this.self=args[0]; }}, onLeave() {{ record('OneFrameTotalData.Setup.leave',{{ total:totalSnapshot(this.self) }}); }} }});
hook('OneFrameController.Reflect', {{ onEnter(args) {{ this.self=args[0]; record('OneFrameController.Reflect.enter',{{ controller:controllerSnapshot(this.self),is_on_move_time:argInt(args,1) }}); }}, onLeave() {{ record('OneFrameController.Reflect.leave',{{ controller:controllerSnapshot(this.self) }}); }} }});
hook('ScoreUtility.InitBaseScore', {{ onEnter(args) {{ record('ScoreUtility.InitBaseScore.enter',{{ max_note_count:argInt(args,0) }}); }} }});
for (const name of ['ScoreUtility.get_BaseScore','ScoreUtility.get_FreeLiveEventBonusAppliedBaseScore']) hook(name, {{ onLeave(retval) {{ record(name,{{ result_bits:'0x'+(retval.toInt32()>>>0).toString(16).padStart(8,'0').toUpperCase() }}); }} }});
hook('ScoreUtility.GetResultTypeCorrectionRate', {{ onEnter(args) {{ this.result=argInt(args,0); }}, onLeave(retval) {{ record('ScoreUtility.GetResultTypeCorrectionRate',{{ result:this.result,rate_bits:'0x'+(retval.toInt32()>>>0).toString(16).padStart(8,'0').toUpperCase() }}); }} }});
hook('ScoreUtility.GetComboCorrectionRate', {{ onEnter(args) {{ this.combo=argInt(args,0); }}, onLeave(retval) {{ record('ScoreUtility.GetComboCorrectionRate',{{ combo:this.combo,rate_bits:'0x'+(retval.toInt32()>>>0).toString(16).padStart(8,'0').toUpperCase() }}); }} }});
hook('DamageUtility.CalcBasePowerPoint', {{ onEnter(args) {{ this.result=argInt(args,0); this.calculated=args[1]; }}, onLeave(retval) {{ record('DamageUtility.CalcBasePowerPoint',{{ result:this.result,calculated:calculatedSnapshot(this.calculated),returned:retval.toInt32() }}); }} }});
for (const name of ['SkillUtility.shouldActivateNeverDieSkillEffect','SkillUtility.CalcAddDamageWithNeverDieSkill','SkillUtility.GetDamageGuardTypeWithNeverDieSkill']) {{
  hook(name, {{ onEnter(args) {{ this.life=argInt(args,0); this.damage=argInt(args,1); this.guard=argInt(args,2); }}, onLeave(retval) {{ record(name,{{ life:this.life,damage:this.damage,input_guard_type:this.guard,returned:retval.toInt32() }}); }} }});
}}
for (const name of ['NoteFrontBase.calcAddDamage','NoteFrontBase.calcSkillScoreUpRate','GamePlayButton.CorrectNoteResult']) {{
  hook(name, {{ onEnter(args) {{ this.self=args[0]; this.arg1=argInt(args,1); this.arg2=argInt(args,2); }}, onLeave(retval) {{ record(name,{{ self:ptrText(this.self),arg1:this.arg1,arg2:this.arg2,returned:retval.toInt32() }}); }} }});
}}
hook('NoteFrontBase.judgeFrontNote', {{ onEnter(args) {{ record('NoteFrontBase.judgeFrontNote.enter',{{ self:ptrText(args[0]),result:argInt(args,1),timing:argInt(args,2),note_type:argInt(args,3),absolute_pos:argInt(args,4) }}); }} }});

for (const name of ['SituationSkillManager.ExecUpdate','SituationSkillManager.executeBeginSkillProcess','SituationSkillManager.executePlayingSkillProcess','SituationSkillManager.executeFinishingSkillProcess','SituationSkillManager.processOfSkillTriggered','SituationSkillManager.playOnceEffectSkill','SituationSkillManager.processOfSkillFinished','SituationSkillManager.Stop']) {{
  hook(name, {{ onEnter(args) {{ this.self=args[0]; record(name+'.enter',{{ skill:skillSnapshot(this.self),arg1:argInt(args,1),arg2:argInt(args,2) }}); }}, onLeave() {{ record(name+'.leave',{{ skill:skillSnapshot(this.self) }}); }} }});
}}
for (const name of ['SituationSkillManager.SkillNoteFailed','SituationSkillManager.AddSituationSkillToPlayList']) {{
  hook(name, {{ onEnter(args) {{ this.self=args[0]; record(name+'.enter',{{ skill:skillSnapshot(this.self),arg1:argInt(args,1),data:skillDataSnapshot(args[1]) }}); }}, onLeave() {{ record(name+'.leave',{{ skill:skillSnapshot(this.self) }}); }} }});
}}

for (const name of ['FeverTimeManager.StartFeverTimeCommand','FeverTimeManager.JudgeFeverNote','FeverTimeManager.changeFeverTimeCommandType','FeverTimeManager.addMyFeverPoint','FeverTimeManager.resetFeverPoint','FeverTimeManager.resetFeverStatePassConditions','FeverTimeManager.execFeverCommandChanged','FeverTimeManager.judgeFever','FeverTimeManager.changeFeverTimeState','FeverTimeManager.updateFeverStatePassConditions']) {{
  hook(name, {{ onEnter(args) {{ this.self=args[0]; record(name+'.enter',{{ fever:feverSnapshot(this.self),arg1:argInt(args,1),arg2:argInt(args,2) }}); }}, onLeave() {{ record(name+'.leave',{{ fever:feverSnapshot(this.self) }}); }} }});
}}
hook('FeverTimeManager.GetFeverTimeScoreRate', {{ onEnter(args) {{ this.self=args[0]; }}, onLeave(retval) {{ record('FeverTimeManager.GetFeverTimeScoreRate',{{ fever:feverSnapshot(this.self),result_bits:'0x'+(retval.toInt32()>>>0).toString(16).padStart(8,'0').toUpperCase() }}); }} }});

rpc.exports.mark=function(value) {{ marker=String(value); record('capture.marker',{{value:marker}}); return marker; }};
rpc.exports.drain=function() {{ return events.splice(0,events.length); }};
rpc.exports.summary=function() {{ return {{counts,queued:events.length,marker}}; }};
rpc.exports.moduleinfo=function() {{ const module=Process.findModuleByName('libil2cpp.so'); return {{base:module.base.toString(),size:module.size,path:module.path}}; }};
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
        adb("shell", "input", "swipe", str(action["x1"]), str(action["y1"]), str(action["x2"]), str(action["y2"]), str(action["duration_ms"]), capture=False)
        return
    if kind == "keyevent":
        adb("shell", "input", "keyevent", str(action["keycode"]), capture=False)
        return
    raise ValueError(f"unsupported action kind: {kind}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes()
    script_bytes = Path(__file__).read_bytes()
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
    module_info = script.exports_sync.moduleinfo()
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
            summary = {"counts": {}, "queued": None, "marker": None}
        try:
            session.detach()
        except Exception:
            pass
    output = {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only" if rpc_error is None else "partial-r1-observation-process-ended",
        "capability": {"level":"R1","return_replacement":False,"memory_writes":False,"apk_modification":False,"input_injection":"Android adb input only"},
        "sample": {"package":PACKAGE,"version_name":"10.1.4","version_code":230,"abi":"arm64-v8a","libil2cpp_sha256":LIB_SHA256,"global_metadata_sha256":METADATA_SHA256,"pid":pid,"module":module_info},
        "scenario": {**plan, "plan_file": args.plan.name},
        "plan_sha256": hashlib.sha256(plan_bytes).hexdigest().upper(),
        "capture_script_sha256": hashlib.sha256(script_bytes).hexdigest().upper(),
        "started_utc": started,
        "finished_utc": datetime.now(timezone.utc).isoformat(),
        "events": sorted(collected, key=lambda event: event["sequence"]),
        "summary": summary,
        "capture_error": rpc_error,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps({"output":str(args.output),"events":len(collected),"summary":summary,"error":rpc_error},ensure_ascii=False))
    return 0 if rpc_error is None else 2


if __name__ == "__main__":
    raise SystemExit(main())
