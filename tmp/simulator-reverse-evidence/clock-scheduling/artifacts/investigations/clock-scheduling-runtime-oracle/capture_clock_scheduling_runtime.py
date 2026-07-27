from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
from typing import Any

import frida


AGENT_SCHEMA_VERSION = 3

# Upper bound on any managed string decoded by the agent. See the readString comment in the
# agent source for why an unbounded read is fatal to the collection session.
MAX_STRING_CHARS = 256

# The consumed BMS is a single managed string of a few thousand characters and is the one read
# that must not be capped at MAX_STRING_CHARS: without it the run cannot prove which chart the
# original client actually parsed. The bound stays finite so a corrupt length still cannot turn
# into an unbounded read.
BMS_MAX_STRING_CHARS = 262144

RVAS = {
    "NoteBatchInformationListFactory.CreateNoteBatchInformationList": 0x376EA70,
    "NoteDataBMSBuilder.Initialize": 0x376EF2C,
    "InGameDirector.Awake": 0x32F8668,
    "InGameDirector.Update": 0x32F8C4C,
    "InGameManager.ExecUpdate": 0x32F8C64,
    "InGameManager.updatePlayState": 0x32F9BB0,
    "Application.set_targetFrameRate": 0x657AFCC,
    "NoteManager.Init": 0x377580C,
    "NoteManager.ExecUpdate": 0x37760C0,
    "NoteManager.SetupNotes": 0x3777098,
    "NoteManager.activateNotesJustNow": 0x37784B4,
    "NoteManager.activateBPMChangeNoteProcess": 0x377B650,
    "NoteManager.setupBpmChangeNote": 0x3776A54,
    "NoteManager.getNoteBpmChangeData": 0x377B80C,
    "NoteManager.onBpmChanged": 0x377B908,
    "NoteManager.analyzeBMS": 0x377CD50,
    "InGameMusicScoreController.SetExecuteFrame": 0x33043D4,
    "InGameMusicScoreController.SetCurrentBPM": 0x33043E4,
    "InGameMusicScoreController.SetBasicBPM": 0x33043FC,
    "InGameMusicScoreController.SetBasicBPMString": 0x330440C,
    "InGameMusicScoreController.SetNextBPM": 0x330441C,
    "InGameMusicScoreController.SetLauncherMusicBarProgress": 0x330442C,
    "InGameMusicScoreController.SetLauncherMusicBeatProgress": 0x330443C,
    "InGameMusicScoreController.SetMusicBarProgress": 0x33044BC,
    "InGameMusicScoreController.SetMusicBeatProgress": 0x33044CC,
    "InGameMusicScoreController.UpdateMusicScoreProgress": 0x3304770,
    "InGameMusicScoreController.UpdateBPM": 0x330491C,
    "InGameMusicScoreController.SetupFirstGameProgress": 0x3304928,
    "NoteBpmChange.Setup": 0x30E9BD8,
    "NoteBpmChange.Reset": 0x30E9C38,
    "NoteBpmChange.ExecUpdate": 0x30E9C40,
    "NoteBpmChange.updateBpm": 0x30E9D14,
    "NoteBase.ResetNote": 0x3A76BA0,
    # schema 2 additions
    "DeviceUtility.SetTargetFrameRate": 0x3B03BF8,
    "LiveCoreSettings.get_IsHighFrequencyMode": 0x3A8920C,
    # The 60/120 decision in InGameDirector.Awake reads LiveCoreSettings +0xA9 inline, so the
    # property getter above never fires and cannot identify the setting's source on its own.
    # These four cover the write side: the settings tab that owns the toggle, its change
    # callback, and the persisted proto-data accessors.
    "LiveEffectVolumeTabPage.initializeHighFrequencyMode": 0x38FD9D0,
    "LiveEffectVolumeTabPage.onHighFrequencyModeChanged": 0x38FF100,
    "LiveCoreSettingsProtoData.get_HighFrequencyMode": 0x581C18C,
    "LiveCoreSettingsProtoData.set_HighFrequencyMode": 0x581C194,
    "NoteManager.playNoteGroupInformationList": 0x377644C,
    "NoteManager.canActivateNote": 0x37785A8,
    "NoteManager.activateNote": 0x3779F74,
    "NoteManager.activateCommandNote": 0x3778BFC,
    "NoteManager.resetNotes": 0x377B960,
    "NoteManager.GetAdjustMusicPos": 0x3776A00,
    "NoteManager.FastAbsolutePos": 0x377C7C8,
    "NoteManager.SlowAbsolutePos": 0x377CA28,
    "NoteBase.ExecuteUpdate": 0x3A76840,
    "NoteBase.ChangeState": 0x3A74E5C,
    "NoteBase.Deactivate": 0x3A75B14,
    "NoteFrontBase.Deactivate": 0x30E0740,
    "NoteBase.ExecuteAfterUpdate": 0x3A768F0,
    "NoteLong.ExecuteAfterUpdate": 0x30EB680,
    "NoteSlide.ExecuteAfterUpdate": 0x321FDBC,
    "NoteMultipleDirectionalFlick.ExecuteAfterUpdate": 0x30ED4E8,
    "NoteMultipleDirectionalFlickAfter.ExecuteAfterUpdate": 0x30EF4CC,
    "NoteAddLongMultipleDirectionalFlickVisual.ExecuteAfterUpdate": 0x30E6C88,
    "NoteAddSlideMultipleDirectionalFlickVisual.ExecuteAfterUpdate": 0x30E84F8,
    "InGameStateController.ChangeGameState": 0x33081C8,
    "InGameManager.changePauseState": 0x32FE270,
    "InGameManager.prePauseSound": 0x32FC760,
    "InGameManager.pauseSound": 0x32FC804,
    "InGameManager.onPauseSound": 0x32FEAE0,
    "InGameManager.onExecutePause": 0x32FECD0,
    "InGameManager.onClickResume": 0x32FED00,
    "InGameManager.onFinishResumeCountdownAnimation": 0x32FED1C,
    "InGameManager.resumeGame": 0x32FC948,
    "InGameManager.OnApplicationPause": 0x32F9384,
    "InGameManager.onHardwareBackKeyProcess": 0x32F9B5C,
    "InGameManager.canThroughInputInspection": 0x32FDC3C,
}

# Read-only instruction probes. Every entry names the instruction the probe sits on so the
# register mapping can be re-derived from a disassembly of the same RVA, plus the owning
# function range used to prove that Frida's 16-byte inline patch cannot overwrite a branch
# target. Overwriting a branch target corrupts the original control flow and invalidates the
# whole run, so `owner_range` is mandatory and checked on device before any probe is armed.
PROBE_PATCH_BYTES = 16

PROBES = {
    "ExecUpdate.deltaAndPreDivisionExecuteFrame": {
        "rva": 0x3776148,
        "insn": "cbz x0, <null-check>",
        "owner_range": [0x37760C0, 0x377644C],
        "purpose": "raw deltaTime in s8 and the pre-division ExecuteFrame in s0 selected by fcsel",
    },
    "ExecUpdate.slowBucketIncrement": {
        "rva": 0x3776208,
        "insn": "str w11, [x10]",
        "owner_range": [0x37760C0, 0x377644C],
        "purpose": "selected 2/3/4 bucket increment before the history fallback check",
    },
    "ExecUpdate.substepDecision": {
        "rva": 0x3776248,
        "insn": "scvtf s1, w22",
        "owner_range": [0x37760C0, 0x377644C],
        "purpose": "final substep count in w22 with the pre-division delta and ExecuteFrame",
    },
    "FastAbsolutePos.stepHead": {
        "rva": 0x377C8AC,
        "insn": "scvtf s0, w8",
        "owner_range": [0x377C7C8, 0x377CA28],
        "purpose": "per-step cursor bar/beat/absolute position before advancing",
    },
    "FastAbsolutePos.stepBpm": {
        "rva": 0x377C99C,
        "insn": "fdiv s1, s1, s8",
        "owner_range": [0x377C7C8, 0x377CA28],
        "purpose": "tempo selected for this step",
    },
    "SlowAbsolutePos.stepHead": {
        "rva": 0x377CB08,
        "insn": "scvtf s0, w8",
        "owner_range": [0x377CA28, 0x377CC28],
        "purpose": "per-step cursor bar/beat/absolute position before rewinding",
    },
    "SlowAbsolutePos.stepBpm": {
        "rva": 0x377CBB0,
        "insn": "fdiv s1, s1, s8",
        "owner_range": [0x377CA28, 0x377CC28],
        "purpose": "tempo selected for this step",
    },
}

# Float32 literals the adaptive-substep and judgement-offset paths load from .rodata.
CONSTANT_RVAS = {
    "execute_frame_cutoff_and_fast_step_seconds": 0x1536A68,
    "slow_step_seconds": 0x15363C8,
    "substep_threshold_two": 0x15367EC,
    "substep_threshold_three": 0x1536768,
    "substep_threshold_four": 0x1536758,
    "judgement_adjust_range_and_b_max": 0x1532E10,
}

# --------------------------------------------------------------------------------------------
# Per-version address tables.
#
# The tables above are 10.1.3 / 229. The capture device updated to 10.1.4 / 230 and
# `libil2cpp.so` differs across almost every 64 KiB block, so nothing may be carried over by
# assumption. The 230 tables below were re-derived and are verified by
# `artifacts/investigations/package-version-rebaseline-10-1-4/`: every hook re-resolved by
# `Owner$$Method` with an unchanged managed signature, every probe instruction word bit-identical
# at the same offset inside its owner, every `.rodata` constant re-located by a unique context
# match with an unchanged bit pattern, and no field offset moved in any type the agent reads.
#
# A version that is not in this table is refused. Guessing an address on an unproven build would
# produce a trace that looks valid and means nothing.
# --------------------------------------------------------------------------------------------

RVAS_230 = {
    "Application.set_targetFrameRate": 0x657A588,
    "DeviceUtility.SetTargetFrameRate": 0x3B02DA0,
    "InGameDirector.Awake": 0x32F77AC,
    "InGameDirector.Update": 0x32F7D90,
    "InGameManager.ExecUpdate": 0x32F7DA8,
    "InGameManager.OnApplicationPause": 0x32F84C8,
    "InGameManager.canThroughInputInspection": 0x32FCD80,
    "InGameManager.changePauseState": 0x32FD3B4,
    "InGameManager.onClickResume": 0x32FDE44,
    "InGameManager.onExecutePause": 0x32FDE14,
    "InGameManager.onFinishResumeCountdownAnimation": 0x32FDE60,
    "InGameManager.onHardwareBackKeyProcess": 0x32F8CA0,
    "InGameManager.onPauseSound": 0x32FDC24,
    "InGameManager.pauseSound": 0x32FB948,
    "InGameManager.prePauseSound": 0x32FB8A4,
    "InGameManager.resumeGame": 0x32FBA8C,
    "InGameManager.updatePlayState": 0x32F8CF4,
    "InGameMusicScoreController.SetBasicBPM": 0x3303540,
    "InGameMusicScoreController.SetBasicBPMString": 0x3303550,
    "InGameMusicScoreController.SetCurrentBPM": 0x3303528,
    "InGameMusicScoreController.SetExecuteFrame": 0x3303518,
    "InGameMusicScoreController.SetLauncherMusicBarProgress": 0x3303570,
    "InGameMusicScoreController.SetLauncherMusicBeatProgress": 0x3303580,
    "InGameMusicScoreController.SetMusicBarProgress": 0x3303600,
    "InGameMusicScoreController.SetMusicBeatProgress": 0x3303610,
    "InGameMusicScoreController.SetNextBPM": 0x3303560,
    "InGameMusicScoreController.SetupFirstGameProgress": 0x3303A6C,
    "InGameMusicScoreController.UpdateBPM": 0x3303A60,
    "InGameMusicScoreController.UpdateMusicScoreProgress": 0x33038B4,
    "InGameStateController.ChangeGameState": 0x330730C,
    "LiveCoreSettings.get_IsHighFrequencyMode": 0x3A883B4,
    "LiveCoreSettingsProtoData.get_HighFrequencyMode": 0x581B748,
    "LiveCoreSettingsProtoData.set_HighFrequencyMode": 0x581B750,
    "LiveEffectVolumeTabPage.initializeHighFrequencyMode": 0x38FCB78,
    "LiveEffectVolumeTabPage.onHighFrequencyModeChanged": 0x38FE2A8,
    "NoteAddLongMultipleDirectionalFlickVisual.ExecuteAfterUpdate": 0x30E5DCC,
    "NoteAddSlideMultipleDirectionalFlickVisual.ExecuteAfterUpdate": 0x30E763C,
    "NoteBase.ChangeState": 0x3A74004,
    "NoteBase.Deactivate": 0x3A74CBC,
    "NoteBase.ExecuteAfterUpdate": 0x3A75A98,
    "NoteBase.ExecuteUpdate": 0x3A759E8,
    "NoteBase.ResetNote": 0x3A75D48,
    "NoteBatchInformationListFactory.CreateNoteBatchInformationList": 0x376DC18,
    "NoteBpmChange.ExecUpdate": 0x30E8D84,
    "NoteBpmChange.Reset": 0x30E8D7C,
    "NoteBpmChange.Setup": 0x30E8D1C,
    "NoteBpmChange.updateBpm": 0x30E8E58,
    "NoteDataBMSBuilder.Initialize": 0x376E0D4,
    "NoteFrontBase.Deactivate": 0x30DF884,
    "NoteLong.ExecuteAfterUpdate": 0x30EA7C4,
    "NoteManager.ExecUpdate": 0x3775268,
    "NoteManager.FastAbsolutePos": 0x377B970,
    "NoteManager.GetAdjustMusicPos": 0x3775BA8,
    "NoteManager.Init": 0x37749B4,
    "NoteManager.SetupNotes": 0x3776240,
    "NoteManager.SlowAbsolutePos": 0x377BBD0,
    "NoteManager.activateBPMChangeNoteProcess": 0x377A7F8,
    "NoteManager.activateCommandNote": 0x3777DA4,
    "NoteManager.activateNote": 0x377911C,
    "NoteManager.activateNotesJustNow": 0x377765C,
    "NoteManager.analyzeBMS": 0x377BEF8,
    "NoteManager.canActivateNote": 0x3777750,
    "NoteManager.getNoteBpmChangeData": 0x377A9B4,
    "NoteManager.onBpmChanged": 0x377AAB0,
    "NoteManager.playNoteGroupInformationList": 0x37755F4,
    "NoteManager.resetNotes": 0x377AB08,
    "NoteManager.setupBpmChangeNote": 0x3775BFC,
    "NoteMultipleDirectionalFlick.ExecuteAfterUpdate": 0x30EC62C,
    "NoteMultipleDirectionalFlickAfter.ExecuteAfterUpdate": 0x30EE610,
    "NoteSlide.ExecuteAfterUpdate": 0x321EF00,
}

PROBES_230 = {
    "ExecUpdate.deltaAndPreDivisionExecuteFrame": {
        "rva": 0x37752F0,
        "insn": "cbz x0, <null-check>",
        "owner_range": [0x3775268, 0x37755F4],
        "purpose": "raw deltaTime in s8 and the pre-division ExecuteFrame in s0 selected by fcsel",
    },
    "ExecUpdate.slowBucketIncrement": {
        "rva": 0x37753B0,
        "insn": "str w11, [x10]",
        "owner_range": [0x3775268, 0x37755F4],
        "purpose": "selected 2/3/4 bucket increment before the history fallback check",
    },
    "ExecUpdate.substepDecision": {
        "rva": 0x37753F0,
        "insn": "scvtf s1, w22",
        "owner_range": [0x3775268, 0x37755F4],
        "purpose": "final substep count in w22 with the pre-division delta and ExecuteFrame",
    },
    "FastAbsolutePos.stepHead": {
        "rva": 0x377BA54,
        "insn": "scvtf s0, w8",
        "owner_range": [0x377B970, 0x377BBD0],
        "purpose": "per-step cursor bar/beat/absolute position before advancing",
    },
    "FastAbsolutePos.stepBpm": {
        "rva": 0x377BB44,
        "insn": "fdiv s1, s1, s8",
        "owner_range": [0x377B970, 0x377BBD0],
        "purpose": "tempo selected for this step",
    },
    "SlowAbsolutePos.stepHead": {
        "rva": 0x377BCB0,
        "insn": "scvtf s0, w8",
        "owner_range": [0x377BBD0, 0x377BDD0],
        "purpose": "per-step cursor bar/beat/absolute position before rewinding",
    },
    "SlowAbsolutePos.stepBpm": {
        "rva": 0x377BD58,
        "insn": "fdiv s1, s1, s8",
        "owner_range": [0x377BBD0, 0x377BDD0],
        "purpose": "tempo selected for this step",
    },
}

CONSTANT_RVAS_230 = {
    "execute_frame_cutoff_and_fast_step_seconds": 0x15366A8,
    "slow_step_seconds": 0x1536008,
    "substep_threshold_two": 0x153642C,
    "substep_threshold_three": 0x15363A8,
    "substep_threshold_four": 0x1536398,
    "judgement_adjust_range_and_b_max": 0x1532A50,
}

VERSION_TABLES = {
    "229": {"version_name": "10.1.3", "rvas": RVAS, "probes": PROBES, "constants": CONSTANT_RVAS},
    "230": {"version_name": "10.1.4", "rvas": RVAS_230, "probes": PROBES_230,
            "constants": CONSTANT_RVAS_230},
}

PROFILES = {
    "bpm-lifecycle": {"adaptive_probes": True},
    "scheduling": {"adaptive_probes": True, "note_detail": True},
    "adaptive": {"adaptive_probes": True},
    "pause": {"adaptive_probes": True, "note_detail": True},
    "judge-offset": {"adaptive_probes": True, "judge_probes": True},
}

MINIMAL_DISABLED = {
    "Application.set_targetFrameRate",
    "InGameDirector.Awake",
    "InGameDirector.Update",
    "InGameManager.ExecUpdate",
    "InGameManager.updatePlayState",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(data: bytes) -> str:
    return sha256(data).hexdigest().upper()


def adb(*args: str) -> str:
    return subprocess.run(
        ["adb", *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stdout.strip()


def frida_server_info() -> dict[str, str | None]:
    """Identify the on-device collection tool so the trace records its exact build."""
    try:
        listing = adb("shell", "ps", "-A")
    except subprocess.CalledProcessError:
        return {"process": None, "path": None, "sha256": None}
    name = next(
        (line.split()[-1] for line in listing.splitlines() if "frida-server" in line),
        None,
    )
    if name is None:
        return {"process": None, "path": None, "sha256": None}
    path = f"/data/local/tmp/{name}"
    try:
        digest_line = adb("shell", "sha256sum", path)
        server_sha = digest_line.split()[0].upper()
    except (subprocess.CalledProcessError, IndexError):
        server_sha = None
    return {"process": name, "path": path, "sha256": server_sha}


def package_info(package: str) -> dict[str, str | None]:
    output = adb("shell", "dumpsys", "package", package)
    values: dict[str, str | None] = {
        "version_name": None,
        "version_code": None,
        "primary_cpu_abi": None,
    }
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("versionName="):
            values["version_name"] = stripped.split("=", 1)[1]
        elif stripped.startswith("versionCode="):
            values["version_code"] = stripped.split("=", 1)[1].split()[0]
        elif stripped.startswith("primaryCpuAbi="):
            values["primary_cpu_abi"] = stripped.split("=", 1)[1]
    return values


def create_agent(config: dict[str, Any], tables: dict[str, Any]) -> str:
    RVAS = tables["rvas"]
    PROBES = tables["probes"]
    CONSTANT_RVAS = tables["constants"]
    return f"""
'use strict';

const rvas = {json.dumps(RVAS, sort_keys=True)};
const probes = {json.dumps(PROBES, sort_keys=True)};
const constantRvas = {json.dumps(CONSTANT_RVAS, sort_keys=True)};
const config = {json.dumps(config, sort_keys=True)};
const disabledLabels = new Set(config.disabled_labels);
const module = Process.getModuleByName('libil2cpp.so');
let sequence = 0;
let frameId = 0;
let substepId = 0;
let directorUpdateCount = 0;
let bpmAcquireDepth = 0;
let bpmAcquireManager = null;
let noteDetail = false;
let noteDetailFramesLeft = 0;
let noteUpdateOrdinal = 0;
let afterUpdateOrdinal = 0;
let judgeSampling = false;
let judgeSamplesTaken = 0;
let judgeSampleBudget = 0;
let judgeFrameSampled = -1;
let judgeStepEvents = 0;
let cachedInGameManager = null;

function pointerValue(value) {{
  if (value === null || value === undefined || value.isNull()) return null;
  return value.toString();
}}

function safeRead(reader, fallback = null) {{
  try {{ return reader(); }} catch (_) {{ return fallback; }}
}}

// A managed string field that has not been assigned yet holds whatever the allocator left
// behind. Decoding that as System.String yields a multi-megabyte UTF-16 read, and the
// resulting payload overflows the frida-server message thread, which kills the whole run at
// the first InGameManager.ExecUpdate of a freshly constructed gameplay object graph.
// Every string this investigation reads (BPM value strings) is a handful of characters, so
// refuse anything longer and record the refusal instead of dropping it silently.
const MAX_STRING_CHARS = {MAX_STRING_CHARS};
// The one deliberate exception: the chart text handed to NoteManager.analyzeBMS. It is the
// evidence that identifies which BMS the original client parsed, so it gets its own finite,
// much larger bound instead of being refused by the general cap.
const BMS_MAX_STRING_CHARS = {BMS_MAX_STRING_CHARS};

function readString(pointer, limit) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  const cap = limit || MAX_STRING_CHARS;
  return safeRead(() => {{
    const length = pointer.add(0x10).readS32();
    if (length < 0) return null;
    if (length > cap) return {{ oversize_length: length, cap, read: false }};
    return pointer.add(0x14).readUtf16String(length);
  }});
}}

function readListCount(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => pointer.add(0x18).readS32());
}}

function readListMembers(pointer, limit = 64) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => {{
    const count = pointer.add(0x18).readS32();
    const items = pointer.add(0x10).readPointer();
    if (count < 0 || count > 1048576 || items.isNull()) return null;
    const members = [];
    for (let index = 0; index < Math.min(count, limit); index += 1) {{
      members.push(pointerValue(items.add(0x20 + index * Process.pointerSize).readPointer()));
    }}
    return {{ count, members, truncated: count > limit }};
  }});
}}

function readFloatBits(pointer) {{
  return safeRead(() => '0x' + pointer.readU32().toString(16).padStart(8, '0'));
}}

function readFloatList(pointer, limit = 64) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => {{
    const count = pointer.add(0x18).readS32();
    const items = pointer.add(0x10).readPointer();
    if (count < 0 || count > 1048576 || items.isNull()) return null;
    const values = [];
    for (let index = 0; index < Math.min(count, limit); index += 1) {{
      const address = items.add(0x20 + index * 4);
      values.push({{ value: address.readFloat(), bits: readFloatBits(address) }});
    }}
    return {{ count, values, truncated: count > limit }};
  }});
}}

function readIntList(pointer, limit = 64) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => {{
    const count = pointer.add(0x18).readS32();
    const items = pointer.add(0x10).readPointer();
    if (count < 0 || count > 1048576 || items.isNull()) return null;
    const values = [];
    for (let index = 0; index < Math.min(count, limit); index += 1) {{
      values.push(items.add(0x20 + index * 4).readS32());
    }}
    return {{ count, values, truncated: count > limit }};
  }});
}}

function readStringList(pointer, limit = 64) {{
  const members = readListMembers(pointer, limit);
  if (members === null) return null;
  return {{
    count: members.count,
    values: members.members.map(value => value === null ? null : readString(ptr(value))),
    truncated: members.truncated,
  }};
}}

function readArrayLength(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => Number(pointer.add(0x18).readU64()));
}}

function readObjectArray(pointer, limit = 64) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => {{
    const length = Number(pointer.add(0x18).readU64());
    if (length < 0 || length > 1048576) return null;
    const members = [];
    for (let index = 0; index < Math.min(length, limit); index += 1) {{
      members.push(pointerValue(pointer.add(0x20 + index * Process.pointerSize).readPointer()));
    }}
    return {{ length, members, truncated: length > limit }};
  }});
}}

function readCounters(pointer) {{
  const length = readArrayLength(pointer);
  if (length === null) return null;
  const count = Math.min(length, 4);
  const values = [];
  for (let index = 0; index < count; index += 1) {{
    values.push(safeRead(() => pointer.add(0x20 + index * 4).readU32()));
  }}
  return values;
}}

function registerFloat(context, name) {{
  return safeRead(() => {{
    const value = context[name];
    return typeof value === 'number' ? value : null;
  }});
}}

function registerBits(context, name) {{
  return safeRead(() => {{
    const buffer = context[name];
    if (!buffer) return null;
    const view = new DataView(buffer);
    return '0x' + view.getUint32(0, true).toString(16).padStart(8, '0');
  }});
}}

function registerU32(context, name) {{
  return safeRead(() => context[name].toUInt32());
}}

function registerS32(context, name) {{
  return safeRead(() => {{
    const value = context[name].toUInt32();
    return value >= 0x80000000 ? value - 0x100000000 : value;
  }});
}}

function controllerSnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => {{
    const launcherBar = pointer.add(0x3c).readS32();
    const launcherBeat = pointer.add(0x40).readFloat();
    const musicBar = pointer.add(0x44).readS32();
    const musicBeat = pointer.add(0x48).readFloat();
    return {{
      pointer: pointerValue(pointer),
      bpm_change_note_count: readListCount(pointer.add(0x10).readPointer()),
      execute_frame: pointer.add(0x18).readFloat(),
      current_bpm: pointer.add(0x1c).readFloat(),
      current_bpm_string: readString(pointer.add(0x20).readPointer()),
      basic_bpm: pointer.add(0x28).readFloat(),
      basic_bpm_string: readString(pointer.add(0x30).readPointer()),
      next_bpm: pointer.add(0x38).readFloat(),
      launcher_bar: launcherBar,
      launcher_beat: launcherBeat,
      launcher_absolute_pos: launcherBar * 192 + launcherBeat,
      music_bar: musicBar,
      music_beat: musicBeat,
      music_absolute_pos: musicBar * 192 + musicBeat,
      before_music_pos: pointer.add(0x4c).readFloat(),
      on_update_music_pos: pointerValue(pointer.add(0x50).readPointer()),
      float_bits: {{
        execute_frame: readFloatBits(pointer.add(0x18)),
        current_bpm: readFloatBits(pointer.add(0x1c)),
        basic_bpm: readFloatBits(pointer.add(0x28)),
        next_bpm: readFloatBits(pointer.add(0x38)),
        launcher_beat: readFloatBits(pointer.add(0x40)),
        music_beat: readFloatBits(pointer.add(0x48)),
        before_music_pos: readFloatBits(pointer.add(0x4c)),
      }},
    }};
  }});
}}

function managerSnapshot(pointer, deep) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  const wantDeep = deep === undefined ? noteDetail : deep;
  return safeRead(() => {{
    const controller = pointer.add(0xe8).readPointer();
    const snapshot = {{
      pointer: pointerValue(pointer),
      note_batch_count: readListCount(pointer.add(0x28).readPointer()),
      active_note_count: readListCount(pointer.add(0x38).readPointer()),
      active_note_list: readListMembers(pointer.add(0x38).readPointer()),
      bpm_pool_length: readArrayLength(pointer.add(0x40).readPointer()),
      active_bpm_count: readListCount(pointer.add(0x48).readPointer()),
      active_bpm_list: readListMembers(pointer.add(0x48).readPointer()),
      bpm_pool_cursor: pointer.add(0x50).readS32(),
      note_group_index: pointer.add(0x70).readS32(),
      bpm_change_count: pointer.add(0x74).readS32(),
      performance_counters: readCounters(pointer.add(0x78).readPointer()),
      execute_count: pointer.add(0xa0).readS32(),
      before_beat_progress: pointer.add(0xb8).readS32(),
      deep: wantDeep,
      controller: controllerSnapshot(controller),
    }};
    if (wantDeep) {{
      snapshot.bpm_pool_members = readObjectArray(pointer.add(0x40).readPointer());
      snapshot.ref_execute_notes = readObjectArray(pointer.add(0x98).readPointer());
      snapshot.notes_activate_index = readIntList(pointer.add(0xa8).readPointer());
      snapshot.judgement_adjust_value_b = safeRead(() => pointer.add(0xd8).readPointer().add(0x17c).readS32());
      snapshot.bpm_cache_keys = readIntList(pointer.add(0x110).readPointer());
    }}
    return snapshot;
  }});
}}

function inGameManagerSnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => {{
    const noteManager = pointer.add(0x70).readPointer();
    const stateController = pointer.add(0xe8).readPointer();
    return {{
      pointer: pointerValue(pointer),
      current_game_state: safeRead(() => stateController.add(0x10).readS32()),
      state_controller: pointerValue(stateController),
      pause_state: pointer.add(0x140).readS32(),
      note_manager: managerSnapshot(noteManager),
    }};
  }});
}}

function noteInfoSnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => ({{
    pointer: pointerValue(pointer),
    index: pointer.add(0x10).readS32(),
    cc_num: pointer.add(0x48).readS32(),
    bar_index: pointer.add(0x4c).readS32(),
    numerator: pointer.add(0x50).readS32(),
    denominator: pointer.add(0x54).readS32(),
    absolute_pos: pointer.add(0x58).readS32(),
    bpm: pointer.add(0x64).readFloat(),
    bpm_bits: readFloatBits(pointer.add(0x64)),
    bpm_string: readString(pointer.add(0x68).readPointer()),
  }}));
}}

function bpmObjectSnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => ({{
    pointer: pointerValue(pointer),
    active: pointer.add(0x10).readU8() !== 0,
    note_info: noteInfoSnapshot(pointer.add(0x18).readPointer()),
    bpm: pointer.add(0x20).readFloat(),
    bpm_bits: readFloatBits(pointer.add(0x20)),
    bpm_string: readString(pointer.add(0x28).readPointer()),
    note_manager: pointerValue(pointer.add(0x30).readPointer()),
    on_bpm_changed: pointerValue(pointer.add(0x38).readPointer()),
  }}));
}}

function noteSnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => ({{
    pointer: pointerValue(pointer),
    note_state: pointer.add(0x50).readS32(),
    absolute_pos: pointer.add(0x74).readS32(),
    info_absolute_pos: safeRead(() => pointer.add(0x60).readPointer().add(0x58).readS32()),
    info_index: safeRead(() => pointer.add(0x60).readPointer().add(0x10).readS32()),
    info_cc_num: safeRead(() => pointer.add(0x60).readPointer().add(0x48).readS32()),
    note_bpm: pointer.add(0xdc).readFloat(),
  }}));
}}

function batchSnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => ({{
    pointer: pointerValue(pointer),
    bar_index: pointer.add(0x10).readS32(),
    numerator: pointer.add(0x14).readS32(),
    denominator: pointer.add(0x18).readS32(),
    absolute_pos: pointer.add(0x1c).readS32(),
    information_count: readListCount(pointer.add(0x20).readPointer()),
    information_list: readListMembers(pointer.add(0x20).readPointer()),
  }}));
}}

function batchInformationDetail(pointer, limit = 32) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => {{
    const list = pointer.add(0x20).readPointer();
    const count = list.add(0x18).readS32();
    const items = list.add(0x10).readPointer();
    const records = [];
    for (let index = 0; index < Math.min(count, limit); index += 1) {{
      records.push(noteInfoSnapshot(items.add(0x20 + index * Process.pointerSize).readPointer()));
    }}
    return {{ count, records, truncated: count > limit }};
  }});
}}

function builderSnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => ({{
    pointer: pointerValue(pointer),
    bpm_values: readFloatList(pointer.add(0x18).readPointer()),
    bpm_strings: readStringList(pointer.add(0x20).readPointer()),
    bpm_materials: readListMembers(pointer.add(0x28).readPointer()),
    exist_change_bpm: pointer.add(0x30).readU8() !== 0,
    bpm_change_bar_index: pointer.add(0x34).readS32(),
    start_bpm: pointer.add(0x38).readFloat(),
    start_bpm_bits: readFloatBits(pointer.add(0x38)),
    start_bpm_string: readString(pointer.add(0x40).readPointer()),
  }}));
}}

function factorySnapshot(pointer) {{
  if (pointer === null || pointer === undefined || pointer.isNull()) return null;
  return safeRead(() => ({{
    pointer: pointerValue(pointer),
    builder: builderSnapshot(pointer.add(0x18).readPointer()),
  }}));
}}

// Events are buffered and flushed as batches. One send() per event saturates the
// frida-server IPC channel at gameplay rates and both slows the original client and
// destabilises collection; batching keeps the observed deltaTime closer to untraced play.
let pending = [];
let batchIndex = 0;

function flush() {{
  if (pending.length === 0) return;
  const events = pending;
  pending = [];
  send({{ kind: 'clock-scheduling-batch', batch_index: ++batchIndex, events }});
}}

function emit(event, fields = {{}}) {{
  pending.push(Object.assign({{
    kind: 'clock-scheduling-event',
    sequence: ++sequence,
    event,
    frame_id: frameId,
    substep_id: substepId,
    thread_id: Process.getCurrentThreadId(),
  }}, fields));
  if (pending.length >= config.batch_max_events) flush();
}}

setInterval(flush, config.batch_flush_ms);
rpc.exports.flush = function () {{ flush(); return sequence; }};

// Liveness beacon. Without it an agent that stops delivering is indistinguishable from a
// gameplay session that simply never reached the hooked code, and a truncated run can be
// mistaken for a complete one.
let heartbeatIndex = 0;
setInterval(function () {{
  heartbeatIndex += 1;
  emit('agent_heartbeat', {{ heartbeat_index: heartbeatIndex, pending: pending.length }});
  flush();
}}, 1000);

function hook(label, callbacks) {{
  if (disabledLabels.has(label)) return;
  const address = module.base.add(rvas[label]);
  Interceptor.attach(address, callbacks);
  emit('hook_installed', {{ label, rva: '0x' + rvas[label].toString(16), address: address.toString() }});
}}

const BRANCH_MNEMONICS = new Set([
  'b', 'bl', 'cbz', 'cbnz', 'tbz', 'tbnz',
  'b.eq', 'b.ne', 'b.cs', 'b.hs', 'b.cc', 'b.lo', 'b.mi', 'b.pl', 'b.vs', 'b.vc',
  'b.hi', 'b.ls', 'b.ge', 'b.lt', 'b.gt', 'b.le', 'b.al', 'b.nv',
]);

// Frida's arm64 inline hook replaces PROBE_PATCH_BYTES bytes with `ldr x16, #lit; br x16`
// plus an 8-byte literal. If any instruction inside that window is the destination of a
// branch, the original control flow jumps into the middle of the patch. Enumerate every
// local branch destination in the owning function and refuse to arm an unsafe probe.
function localBranchTargets(startRva, endRva) {{
  const targets = new Set();
  let pointer = module.base.add(startRva);
  const limit = module.base.add(endRva);
  while (pointer.compare(limit) < 0) {{
    let insn;
    try {{ insn = Instruction.parse(pointer); }} catch (_) {{ pointer = pointer.add(4); continue; }}
    if (BRANCH_MNEMONICS.has(insn.mnemonic)) {{
      for (const operand of insn.operands) {{
        if (operand.type !== 'imm') continue;
        const destination = ptr(operand.value.toString());
        if (destination.compare(module.base.add(startRva)) >= 0 && destination.compare(limit) < 0) {{
          targets.add(destination.sub(module.base).toString());
        }}
      }}
    }}
    pointer = insn.next;
  }}
  return targets;
}}

const branchTargetCache = {{}};
const armedProbeWindows = [];

function probe(label, callback) {{
  const entry = probes[label];
  const rangeKey = entry.owner_range.join('-');
  if (!(rangeKey in branchTargetCache)) {{
    branchTargetCache[rangeKey] = localBranchTargets(entry.owner_range[0], entry.owner_range[1]);
  }}
  const targets = branchTargetCache[rangeKey];
  const address = module.base.add(entry.rva);
  const covered = [];
  const observed = [];
  for (let offset = 0; offset < {PROBE_PATCH_BYTES}; offset += 4) {{
    const stepAddress = address.add(offset);
    const stepRva = stepAddress.sub(module.base).toString();
    observed.push(safeRead(() => Instruction.parse(stepAddress).toString()));
    if (offset > 0 && targets.has(stepRva)) covered.push(stepRva);
  }}
  const overlap = armedProbeWindows.filter(window =>
    entry.rva < window.end && window.start < entry.rva + {PROBE_PATCH_BYTES});
  const safe = covered.length === 0 && overlap.length === 0;
  emit('probe_installed', {{
    label,
    rva: '0x' + entry.rva.toString(16),
    address: address.toString(),
    insn: entry.insn,
    purpose: entry.purpose,
    owner_range: ['0x' + entry.owner_range[0].toString(16), '0x' + entry.owner_range[1].toString(16)],
    patch_bytes: {PROBE_PATCH_BYTES},
    observed_window: observed,
    local_branch_target_count: targets.size,
    covered_branch_targets: covered,
    overlapping_probes: overlap.map(window => window.label),
    armed: safe,
  }});
  if (!safe) return null;
  armedProbeWindows.push({{ label, start: entry.rva, end: entry.rva + {PROBE_PATCH_BYTES} }});
  return Interceptor.attach(address, {{ onEnter: callback }});
}}


function cachedNoteManagerSnapshot() {{
  if (cachedInGameManager === null) return null;
  return managerSnapshot(safeRead(() => cachedInGameManager.add(0x70).readPointer(), null));
}}

hook('Application.set_targetFrameRate', {{
  onEnter(args) {{ emit('target_frame_rate_requested', {{ value: args[0].toInt32() }}); }},
}});

hook('DeviceUtility.SetTargetFrameRate', {{
  onEnter(args) {{ emit('device_utility_set_target_frame_rate', {{ value: args[0].toInt32() }}); }},
}});

hook('LiveCoreSettings.get_IsHighFrequencyMode', {{
  onEnter(args) {{ this.settings = args[0]; }},
  onLeave(retval) {{
    emit('high_frequency_mode_read', {{
      settings: pointerValue(this.settings),
      value: retval.toInt32() & 1,
      field_a9: safeRead(() => this.settings.add(0xa9).readU8()),
      judgement_adjust_value: safeRead(() => this.settings.add(0x18).readS32()),
      judgement_adjust_value_b: safeRead(() => this.settings.add(0x1c).readS32()),
    }});
  }},
}});

// Write side of the same bool. InGameDirector.Awake inlines the getter, so without these the
// trace can show the 60 or 120 request but cannot name where the value came from.
hook('LiveEffectVolumeTabPage.initializeHighFrequencyMode', {{
  onEnter(args) {{ emit('high_frequency_ui_init_enter', {{ page: pointerValue(args[0]) }}); }},
  onLeave() {{ emit('high_frequency_ui_init_leave'); }},
}});

hook('LiveEffectVolumeTabPage.onHighFrequencyModeChanged', {{
  onEnter(args) {{
    emit('high_frequency_ui_changed', {{
      page: pointerValue(args[0]),
      value: args[1].toInt32() & 1,
    }});
  }},
}});

hook('LiveCoreSettingsProtoData.set_HighFrequencyMode', {{
  onEnter(args) {{
    emit('high_frequency_proto_write', {{
      proto: pointerValue(args[0]),
      value: args[1].toInt32() & 1,
    }});
  }},
}});

hook('LiveCoreSettingsProtoData.get_HighFrequencyMode', {{
  onEnter(args) {{ this.proto = args[0]; }},
  onLeave(retval) {{
    emit('high_frequency_proto_read', {{
      proto: pointerValue(this.proto),
      value: retval.toInt32() & 1,
    }});
  }},
}});

hook('NoteBatchInformationListFactory.CreateNoteBatchInformationList', {{
  onEnter(args) {{
    this.factory = args[0];
    emit('factory_create_enter', {{ factory: factorySnapshot(this.factory), is_command: args[2].toInt32() !== 0 }});
  }},
  onLeave(retval) {{
    const members = readListMembers(retval, 512);
    emit('factory_create_leave', {{ factory: factorySnapshot(this.factory), result: members }});
  }},
}});

hook('NoteDataBMSBuilder.Initialize', {{
  onEnter(args) {{
    this.builder = args[0];
    emit('builder_initialize_enter', {{ builder: builderSnapshot(this.builder), is_command: args[1].toInt32() !== 0 }});
  }},
  onLeave() {{ emit('builder_initialize_leave', {{ builder: builderSnapshot(this.builder) }}); }},
}});

hook('InGameDirector.Awake', {{
  onEnter(args) {{ emit('director_awake_enter', {{ director: pointerValue(args[0]) }}); }},
  onLeave() {{ emit('director_awake_leave'); }},
}});

hook('InGameDirector.Update', {{
  onEnter() {{
    directorUpdateCount += 1;
    if (directorUpdateCount <= 5 || directorUpdateCount % 120 === 0) {{
      emit('director_update_sample', {{ director_update_count: directorUpdateCount }});
    }}
  }},
}});

hook('InGameManager.ExecUpdate', {{
  onEnter(args) {{
    this.inGameManager = args[0];
    cachedInGameManager = args[0];
    emit('ingame_manager_exec_enter', {{ manager: inGameManagerSnapshot(this.inGameManager) }});
  }},
  onLeave() {{ emit('ingame_manager_exec_leave', {{ manager: inGameManagerSnapshot(this.inGameManager) }}); }},
}});

hook('InGameManager.updatePlayState', {{
  onEnter(args) {{
    this.inGameManager = args[0];
    emit('play_state_update_enter', {{ manager: inGameManagerSnapshot(this.inGameManager) }});
  }},
  onLeave() {{ emit('play_state_update_leave', {{ manager: inGameManagerSnapshot(this.inGameManager) }}); }},
}});

hook('InGameManager.canThroughInputInspection', {{
  onEnter(args) {{ this.inGameManager = args[0]; }},
  onLeave(retval) {{
    emit('can_through_input_inspection_leave', {{
      value: retval.toInt32() & 1,
      manager: inGameManagerSnapshot(this.inGameManager),
    }});
  }},
}});

for (const label of [
  'InGameManager.changePauseState',
  'InGameManager.prePauseSound',
  'InGameManager.pauseSound',
  'InGameManager.onPauseSound',
  'InGameManager.onExecutePause',
  'InGameManager.onClickResume',
  'InGameManager.onFinishResumeCountdownAnimation',
  'InGameManager.resumeGame',
  'InGameManager.OnApplicationPause',
  'InGameManager.onHardwareBackKeyProcess',
]) {{
  hook(label, {{
    onEnter(args) {{
      this.inGameManager = args[0];
      emit('pause_path_enter', {{
        label,
        argument0: safeRead(() => args[1].toInt32()),
        manager: inGameManagerSnapshot(this.inGameManager),
      }});
    }},
    onLeave() {{ emit('pause_path_leave', {{ label, manager: inGameManagerSnapshot(this.inGameManager) }}); }},
  }});
}}

hook('InGameStateController.ChangeGameState', {{
  onEnter(args) {{
    this.stateController = args[0];
    emit('game_state_change_enter', {{
      state_controller: pointerValue(this.stateController),
      before: safeRead(() => this.stateController.add(0x10).readS32()),
      requested: args[1].toInt32(),
    }});
  }},
  onLeave() {{
    emit('game_state_change_leave', {{
      state_controller: pointerValue(this.stateController),
      after: safeRead(() => this.stateController.add(0x10).readS32()),
      manager: cachedInGameManager === null ? null : inGameManagerSnapshot(cachedInGameManager),
    }});
  }},
}});

hook('NoteManager.Init', {{
  onEnter(args) {{ this.manager = args[0]; emit('manager_init_enter', {{ manager: managerSnapshot(this.manager, true) }}); }},
  onLeave() {{ emit('manager_init_leave', {{ manager: managerSnapshot(this.manager, true) }}); }},
}});

hook('NoteManager.SetupNotes', {{
  onEnter(args) {{ this.manager = args[0]; emit('setup_notes_enter', {{ manager: managerSnapshot(this.manager, true) }}); }},
  onLeave() {{ emit('setup_notes_leave', {{ manager: managerSnapshot(this.manager, true) }}); }},
}});

hook('NoteManager.resetNotes', {{
  onEnter(args) {{ this.manager = args[0]; emit('reset_notes_enter', {{ manager: managerSnapshot(this.manager, true) }}); }},
  onLeave() {{ emit('reset_notes_leave', {{ manager: managerSnapshot(this.manager, true) }}); }},
}});

hook('NoteManager.ExecUpdate', {{
  onEnter(args) {{
    frameId += 1;
    substepId = 0;
    noteUpdateOrdinal = 0;
    afterUpdateOrdinal = 0;
    judgeFrameSampled = -1;
    noteDetail = false;
    if (config.note_detail) {{
      if (noteDetailFramesLeft > 0) {{ noteDetail = true; noteDetailFramesLeft -= 1; }}
      else if (frameId <= config.note_detail_lead_frames) {{ noteDetail = true; }}
      else if (config.note_detail_duty_on > 0
        && (frameId % (config.note_detail_duty_on + config.note_detail_duty_off)) < config.note_detail_duty_on) {{
        noteDetail = true;
      }}
    }}
    this.manager = args[0];
    emit('frame_enter', {{
      manager: managerSnapshot(this.manager),
      delta_time: registerFloat(this.context, 's0'),
      delta_time_bits: registerBits(this.context, 'q0'),
      note_detail: noteDetail,
    }});
  }},
  onLeave() {{ emit('frame_leave', {{ manager: managerSnapshot(this.manager), substep_count: substepId }}); }},
}});

hook('InGameMusicScoreController.UpdateMusicScoreProgress', {{
  onEnter(args) {{
    substepId += 1;
    this.controller = args[0];
    emit('clock_substep_enter', {{
      controller: controllerSnapshot(this.controller),
      substep_delta: registerFloat(this.context, 's0'),
      substep_delta_bits: registerBits(this.context, 'q0'),
    }});
  }},
  onLeave() {{ emit('clock_substep_leave', {{ controller: controllerSnapshot(this.controller) }}); }},
}});

for (const label of [
  'InGameMusicScoreController.SetExecuteFrame',
  'InGameMusicScoreController.SetCurrentBPM',
  'InGameMusicScoreController.SetBasicBPM',
  'InGameMusicScoreController.SetBasicBPMString',
  'InGameMusicScoreController.SetNextBPM',
  'InGameMusicScoreController.SetLauncherMusicBarProgress',
  'InGameMusicScoreController.SetLauncherMusicBeatProgress',
  'InGameMusicScoreController.SetMusicBarProgress',
  'InGameMusicScoreController.SetMusicBeatProgress',
]) {{
  hook(label, {{
    onEnter(args) {{ this.controller = args[0]; this.before = controllerSnapshot(this.controller); }},
    onLeave() {{ emit('controller_setter_leave', {{ label, before: this.before, after: controllerSnapshot(this.controller) }}); }},
  }});
}}

hook('InGameMusicScoreController.SetupFirstGameProgress', {{
  onEnter(args) {{ this.controller = args[0]; emit('setup_first_progress_enter', {{ controller: controllerSnapshot(this.controller) }}); }},
  onLeave() {{ emit('setup_first_progress_leave', {{ controller: controllerSnapshot(this.controller) }}); }},
}});

hook('InGameMusicScoreController.UpdateBPM', {{
  onEnter(args) {{ this.controller = args[0]; emit('update_bpm_enter', {{ controller: controllerSnapshot(this.controller), bpm_string_argument: readString(args[1]) }}); }},
  onLeave() {{ emit('update_bpm_leave', {{ controller: controllerSnapshot(this.controller) }}); }},
}});

hook('NoteManager.activateNotesJustNow', {{
  onEnter(args) {{
    this.manager = args[0];
    this.batch = args[1];
    emit('activate_batch_enter', {{
      batch: batchSnapshot(this.batch),
      batch_records: noteDetail ? batchInformationDetail(this.batch) : null,
      manager: managerSnapshot(this.manager, true),
    }});
  }},
  onLeave(retval) {{ emit('activate_batch_leave', {{ activated: retval.toInt32() !== 0, batch: batchSnapshot(this.batch), manager: managerSnapshot(this.manager, true) }}); }},
}});

hook('NoteManager.canActivateNote', {{
  onEnter(args) {{ this.manager = args[0]; this.batch = args[1]; }},
  onLeave(retval) {{
    if (!noteDetail) return;
    emit('can_activate_note_leave', {{ value: retval.toInt32() & 1, batch: batchSnapshot(this.batch) }});
  }},
}});

hook('NoteManager.playNoteGroupInformationList', {{
  onEnter(args) {{ this.manager = args[0]; emit('play_group_enter', {{ manager: managerSnapshot(this.manager) }}); }},
  onLeave() {{ emit('play_group_leave', {{ manager: managerSnapshot(this.manager) }}); }},
}});

hook('NoteManager.activateNote', {{
  onEnter(args) {{
    this.manager = args[0];
    if (!noteDetail) return;
    emit('activate_note_enter', {{ note_info: noteInfoSnapshot(args[1]), manager: managerSnapshot(this.manager) }});
  }},
  onLeave(retval) {{
    if (!noteDetail) return;
    emit('activate_note_leave', {{ note: noteSnapshot(retval), manager: managerSnapshot(this.manager) }});
  }},
}});

hook('NoteManager.activateCommandNote', {{
  onEnter(args) {{ this.manager = args[0]; emit('activate_command_note_enter', {{ note_info: noteInfoSnapshot(args[1]), manager: managerSnapshot(this.manager) }}); }},
  onLeave() {{ emit('activate_command_note_leave', {{ manager: managerSnapshot(this.manager) }}); }},
}});

hook('NoteManager.activateBPMChangeNoteProcess', {{
  onEnter(args) {{ this.manager = args[0]; emit('activate_bpm_process_enter', {{ launch_note_count: readListCount(args[1]), launch_note_list: readListMembers(args[1]), manager: managerSnapshot(this.manager, true) }}); }},
  onLeave() {{ emit('activate_bpm_process_leave', {{ manager: managerSnapshot(this.manager, true) }}); }},
}});

hook('NoteManager.setupBpmChangeNote', {{
  onEnter(args) {{ this.manager = args[0]; this.noteInfo = args[1]; emit('setup_bpm_change_enter', {{ note_info: noteInfoSnapshot(this.noteInfo), manager: managerSnapshot(this.manager, true) }}); }},
  onLeave() {{ emit('setup_bpm_change_leave', {{ note_info: noteInfoSnapshot(this.noteInfo), manager: managerSnapshot(this.manager, true) }}); }},
}});

hook('NoteManager.getNoteBpmChangeData', {{
  onEnter(args) {{ this.manager = args[0]; bpmAcquireDepth += 1; bpmAcquireManager = this.manager; emit('bpm_pool_acquire_enter', {{ manager: managerSnapshot(this.manager, true) }}); }},
  onLeave(retval) {{ emit('bpm_pool_acquire_leave', {{ bpm_object: bpmObjectSnapshot(retval), manager: managerSnapshot(this.manager, true) }}); bpmAcquireDepth -= 1; if (bpmAcquireDepth === 0) bpmAcquireManager = null; }},
}});

hook('NoteManager.onBpmChanged', {{
  onEnter(args) {{ this.manager = args[0]; this.bpmObject = args[1]; emit('on_bpm_changed_enter', {{ bpm_object: bpmObjectSnapshot(this.bpmObject), manager: managerSnapshot(this.manager, true) }}); }},
  onLeave() {{ emit('on_bpm_changed_leave', {{ bpm_object: bpmObjectSnapshot(this.bpmObject), manager: managerSnapshot(this.manager, true) }}); }},
}});

hook('NoteBpmChange.Setup', {{
  onEnter(args) {{ this.bpmObject = args[0]; emit('bpm_object_setup_enter', {{ bpm_object: bpmObjectSnapshot(this.bpmObject), note_info_argument: noteInfoSnapshot(args[1]) }}); }},
  onLeave() {{ emit('bpm_object_setup_leave', {{ bpm_object: bpmObjectSnapshot(this.bpmObject) }}); }},
}});

hook('NoteBpmChange.Reset', {{
  onEnter(args) {{ this.bpmObject = args[0]; emit('bpm_object_reset_enter', {{ bpm_object: bpmObjectSnapshot(this.bpmObject) }}); }},
  onLeave() {{ emit('bpm_object_reset_leave', {{ bpm_object: bpmObjectSnapshot(this.bpmObject) }}); }},
}});

hook('NoteBase.ResetNote', {{
  onEnter(args) {{ if (bpmAcquireDepth < 1) return; this.isBpmAcquire = true; this.bpmObject = args[0]; emit('bpm_pool_reset_note_enter', {{ bpm_object: bpmObjectSnapshot(this.bpmObject), manager: managerSnapshot(bpmAcquireManager, true) }}); }},
  onLeave() {{ if (!this.isBpmAcquire) return; emit('bpm_pool_reset_note_leave', {{ bpm_object: bpmObjectSnapshot(this.bpmObject), manager: managerSnapshot(bpmAcquireManager, true) }}); }},
}});

hook('NoteBpmChange.ExecUpdate', {{
  onEnter(args) {{ this.bpmObject = args[0]; emit('bpm_object_update_enter', {{ bpm_object: bpmObjectSnapshot(this.bpmObject) }}); }},
  onLeave() {{ emit('bpm_object_update_leave', {{ bpm_object: bpmObjectSnapshot(this.bpmObject) }}); }},
}});

hook('NoteBpmChange.updateBpm', {{
  onEnter(args) {{ this.bpmObject = args[0]; emit('bpm_object_commit_enter', {{ bpm_object: bpmObjectSnapshot(this.bpmObject) }}); }},
  onLeave() {{ emit('bpm_object_commit_leave', {{ bpm_object: bpmObjectSnapshot(this.bpmObject) }}); }},
}});

hook('NoteBase.ExecuteUpdate', {{
  onEnter(args) {{
    if (!noteDetail) return;
    this.sampled = true;
    this.note = args[0];
    noteUpdateOrdinal += 1;
    this.ordinal = noteUpdateOrdinal;
    emit('note_update_enter', {{
      ordinal: this.ordinal,
      note: noteSnapshot(this.note),
      substep_delta: registerFloat(this.context, 's0'),
      manager: cachedNoteManagerSnapshot(),
    }});
  }},
  onLeave() {{
    if (!this.sampled) return;
    emit('note_update_leave', {{
      ordinal: this.ordinal,
      note: noteSnapshot(this.note),
      manager: cachedNoteManagerSnapshot(),
    }});
  }},
}});

for (const label of [
  'NoteBase.ExecuteAfterUpdate',
  'NoteLong.ExecuteAfterUpdate',
  'NoteSlide.ExecuteAfterUpdate',
  'NoteMultipleDirectionalFlick.ExecuteAfterUpdate',
  'NoteMultipleDirectionalFlickAfter.ExecuteAfterUpdate',
  'NoteAddLongMultipleDirectionalFlickVisual.ExecuteAfterUpdate',
  'NoteAddSlideMultipleDirectionalFlickVisual.ExecuteAfterUpdate',
]) {{
  hook(label, {{
    onEnter(args) {{
      if (!noteDetail) return;
      afterUpdateOrdinal += 1;
      emit('note_after_update_enter', {{ label, ordinal: afterUpdateOrdinal, note: noteSnapshot(args[0]) }});
    }},
  }});
}}

hook('NoteBase.ChangeState', {{
  onEnter(args) {{
    if (!noteDetail) return;
    emit('note_change_state_enter', {{ note: noteSnapshot(args[0]), requested_state: args[1].toInt32() }});
  }},
}});

for (const label of ['NoteBase.Deactivate', 'NoteFrontBase.Deactivate']) {{
  hook(label, {{
    onEnter(args) {{
      if (!noteDetail) return;
      this.sampled = true;
      this.note = args[0];
      emit('note_deactivate_enter', {{
        label,
        note: noteSnapshot(this.note),
        manager: cachedNoteManagerSnapshot(),
      }});
    }},
    onLeave() {{
      if (!this.sampled) return;
      emit('note_deactivate_leave', {{
        label,
        note: noteSnapshot(this.note),
        manager: cachedNoteManagerSnapshot(),
      }});
    }},
  }});
}}

hook('NoteManager.GetAdjustMusicPos', {{
  onEnter(args) {{
    this.manager = args[0];
    if (judgeFrameSampled === frameId) return;
    judgeFrameSampled = frameId;
    this.sampled = true;
    emit('judge_adjust_enter', {{
      manager_pointer: pointerValue(this.manager),
      judgement_adjust_value_b: safeRead(() => this.manager.add(0xd8).readPointer().add(0x17c).readS32()),
      controller: controllerSnapshot(safeRead(() => this.manager.add(0xe8).readPointer(), null)),
      bpm_cache_keys: readIntList(safeRead(() => this.manager.add(0x110).readPointer(), null)),
    }});
  }},
  onLeave(retval) {{
    if (!this.sampled) return;
    emit('judge_adjust_leave', {{
      result: registerFloat(this.context, 's0'),
      result_bits: registerBits(this.context, 'q0'),
    }});
  }},
}});

for (const [label, direction] of [['NoteManager.FastAbsolutePos', 'fast'], ['NoteManager.SlowAbsolutePos', 'slow']]) {{
  hook(label, {{
    onEnter(args) {{
      this.manager = args[0];
      this.direction = direction;
      this.armed = config.judge_probes
        && judgeProbeListeners !== null
        && judgeSamplesTaken < judgeSampleBudget
        && judgeFrameSampled === frameId;
      if (!this.armed) return;
      judgeSamplesTaken += 1;
      judgeSampling = true;
      emit('judge_absolute_pos_enter', {{
        direction,
        frames_argument: args[1].toInt32(),
        sample_index: judgeSamplesTaken,
        controller: controllerSnapshot(safeRead(() => this.manager.add(0xe8).readPointer(), null)),
      }});
    }},
    onLeave(retval) {{
      if (!this.armed) return;
      judgeSampling = false;
      emit('judge_absolute_pos_leave', {{
        direction,
        result: registerFloat(this.context, 's0'),
        result_bits: registerBits(this.context, 'q0'),
      }});
      if (judgeSamplesTaken >= judgeSampleBudget || judgeStepEvents >= config.judge_step_budget) {{
        disarmJudgeProbes('budget-exhausted');
      }}
    }},
  }});
}}

if (config.adaptive_probes) {{
  probe('ExecUpdate.deltaAndPreDivisionExecuteFrame', function () {{
    const manager = this.context.x19;
    emit('adaptive_delta_input', {{
      delta_time: registerFloat(this.context, 's8'),
      delta_time_bits: registerBits(this.context, 'q8'),
      execute_frame_before_division: registerFloat(this.context, 's0'),
      execute_frame_before_division_bits: registerBits(this.context, 'q0'),
      manager: pointerValue(manager),
      controller: pointerValue(this.context.x0),
      bpm_change_count: safeRead(() => manager.add(0x74).readS32()),
      counters_before_frame: readCounters(safeRead(() => manager.add(0x78).readPointer(), null)),
      counter_array_length: safeRead(() => manager.add(0x78).readPointer().add(0x18).readS32()),
    }});
  }});

  probe('ExecUpdate.slowBucketIncrement', function () {{
    const arrayPointer = this.context.x8;
    const counterPointer = this.context.x10;
    let index = null;
    try {{ index = (counterPointer.sub(arrayPointer).toInt32() - 0x20) / 4; }} catch (_) {{ index = null; }}
    emit('adaptive_bucket_increment', {{
      bucket_index: index,
      counter_after_increment: registerU32(this.context, 'x11'),
      counter_array: pointerValue(arrayPointer),
      counter_pointer: pointerValue(counterPointer),
      tentative_substeps: registerU32(this.context, 'x22'),
      delta_time: registerFloat(this.context, 's8'),
      array_length: safeRead(() => arrayPointer.add(0x18).readS32()),
      counters_after_increment: readCounters(arrayPointer),
    }});
  }});

  probe('ExecUpdate.substepDecision', function () {{
    emit('adaptive_substep_decision', {{
      substeps: registerU32(this.context, 'x22'),
      delta_time_before_division: registerFloat(this.context, 's8'),
      delta_time_before_division_bits: registerBits(this.context, 'q8'),
      execute_frame_before_division: registerFloat(this.context, 's0'),
      execute_frame_before_division_bits: registerBits(this.context, 'q0'),
      counters: readCounters(safeRead(() => this.context.x19.add(0x78).readPointer(), null)),
    }});
  }});
}}

let judgeProbeListeners = null;
let judgeProbeFactories = [];

function armJudgeProbes(budget) {{
  if (judgeProbeListeners !== null) return;
  judgeSamplesTaken = 0;
  judgeStepEvents = 0;
  judgeSampleBudget = budget;
  judgeProbeListeners = judgeProbeFactories.map(factory => factory()).filter(Boolean);
  emit('judge_probes_armed', {{ probe_count: judgeProbeListeners.length, sample_budget: budget }});
}}

function disarmJudgeProbes(reason) {{
  if (judgeProbeListeners === null) return;
  for (const listener of judgeProbeListeners) {{
    try {{ listener.detach(); }} catch (_) {{}}
  }}
  Interceptor.flush();
  for (const label of Object.keys(probes)) {{
    if (!label.endsWith('.stepHead') && !label.endsWith('.stepBpm')) continue;
    const index = armedProbeWindows.findIndex(window => window.label === label);
    if (index >= 0) armedProbeWindows.splice(index, 1);
  }}
  judgeProbeListeners = null;
  judgeSampling = false;
  emit('judge_probes_disarmed', {{ reason, samples: judgeSamplesTaken, step_events: judgeStepEvents }});
}}

if (config.judge_probes) {{
  judgeProbeFactories.push(() => probe('FastAbsolutePos.stepHead', function () {{
    if (!judgeSampling || judgeStepEvents >= config.judge_step_budget) return;
    judgeStepEvents += 1;
    emit('judge_step_head', {{
      direction: 'fast',
      step_index: registerU32(this.context, 'x22'),
      total_steps: registerU32(this.context, 'x28'),
      cursor_bar: registerS32(this.context, 'x26'),
      cursor_beat: registerFloat(this.context, 's11'),
      cursor_beat_bits: registerBits(this.context, 'q11'),
      cursor_bar_ticks: registerU32(this.context, 'x8'),
    }});
  }}));

  judgeProbeFactories.push(() => probe('FastAbsolutePos.stepBpm', function () {{
    if (!judgeSampling || judgeStepEvents >= config.judge_step_budget) return;
    judgeStepEvents += 1;
    emit('judge_step_bpm', {{
      direction: 'fast',
      step_index: registerU32(this.context, 'x22'),
      step_bpm: registerFloat(this.context, 's8'),
      step_bpm_bits: registerBits(this.context, 'q8'),
      cursor_beat: registerFloat(this.context, 's11'),
      cursor_bar: registerS32(this.context, 'x26'),
    }});
  }}));

  judgeProbeFactories.push(() => probe('SlowAbsolutePos.stepHead', function () {{
    if (!judgeSampling || judgeStepEvents >= config.judge_step_budget) return;
    judgeStepEvents += 1;
    emit('judge_step_head', {{
      direction: 'slow',
      step_index: registerU32(this.context, 'x22'),
      total_steps: registerU32(this.context, 'x28'),
      cursor_bar: registerS32(this.context, 'x26'),
      cursor_beat: registerFloat(this.context, 's10'),
      cursor_beat_bits: registerBits(this.context, 'q10'),
      cursor_bar_ticks: registerU32(this.context, 'x8'),
    }});
  }}));

  judgeProbeFactories.push(() => probe('SlowAbsolutePos.stepBpm', function () {{
    if (!judgeSampling || judgeStepEvents >= config.judge_step_budget) return;
    judgeStepEvents += 1;
    emit('judge_step_bpm', {{
      direction: 'slow',
      step_index: registerU32(this.context, 'x22'),
      step_bpm: registerFloat(this.context, 's8'),
      step_bpm_bits: registerBits(this.context, 'q8'),
      cursor_beat: registerFloat(this.context, 's10'),
      cursor_bar: registerS32(this.context, 'x26'),
    }});
  }}));
}}

hook('NoteManager.analyzeBMS', {{
  onEnter(args) {{
    const text = readString(args[1], BMS_MAX_STRING_CHARS);
    emit('analyze_bms_enter', {{ runtime_bms_text: text }});
  }},
  onLeave() {{ emit('analyze_bms_leave'); }},
}});

const constants = {{}};
for (const [name, rva] of Object.entries(constantRvas)) {{
  const pointer = module.base.add(rva);
  constants[name] = {{
    rva: '0x' + rva.toString(16),
    float32: safeRead(() => pointer.readFloat()),
    bits: readFloatBits(pointer),
    int32: safeRead(() => pointer.readS32()),
    int32_next: safeRead(() => pointer.add(4).readS32()),
  }};
}}

emit('agent_ready', {{
  agent_schema_version: {AGENT_SCHEMA_VERSION},
  max_string_chars: MAX_STRING_CHARS,
  process_arch: Process.arch,
  frida_version: Frida.version,
  module_base: module.base.toString(),
  module_size: module.size,
  hook_count: Object.keys(rvas).filter(label => !disabledLabels.has(label)).length,
  config,
  constants,
}});

recv('judge_window', function onJudgeWindow(message) {{
  if (message.action === 'arm') armJudgeProbes(message.sample_budget);
  else disarmJudgeProbes('host-request');
  recv('judge_window', onJudgeWindow);
}});

recv('detail_window', function onDetailWindow(message) {{
  noteDetailFramesLeft = message.frames;
  emit('detail_window_armed', {{ frames: message.frames }});
  recv('detail_window', onDetailWindow);
}});
"""


class DeviceInput:
    """Persistent adb shell used to deliver timed user input with low latency."""

    def __init__(self, serial: str | None) -> None:
        command = ["adb"] + (["-s", serial] if serial else []) + ["shell"]
        self.process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
        )
        self.actions: list[dict[str, Any]] = []

    def send(self, command: str, label: str) -> None:
        assert self.process.stdin is not None
        self.actions.append({"label": label, "command": command, "at_utc": utc_now()})
        self.process.stdin.write(command + "\n")
        self.process.stdin.flush()

    def close(self) -> None:
        if self.process.stdin is not None:
            try:
                self.process.stdin.close()
            except OSError:
                pass
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()


class TraceWriter(threading.Thread):
    """Consumes agent batches off Frida's message-delivery thread.

    `docs/RUNTIME_CAPTURE_STABILITY.md` mode 2: blocking work inside `on_message` stalls the
    message pump for the whole host process, and that stall propagates backwards as
    backpressure into the agent, which runs inside the original client. The quantities this
    capture exists to close -- per-substep `deltaTime`, `ExecuteFrame = min(deltaTime * 60, 1)`
    and the strict adaptive thresholds -- are exactly the quantities a stalled collector
    perturbs, so keeping the message thread free is an evidence-integrity requirement.

    `on_message` therefore only enqueues. Serialization, hashing, disk writes, `script.post()`
    and device input all happen on this thread, and the trace stream is flushed once per batch
    instead of once per event.
    """

    def __init__(
        self,
        *,
        stream: Any,
        output_dir: Path,
        expected_text: str | None,
        judge_event_arms: list[dict[str, Any]],
        judge_frame_arms: list[dict[str, Any]],
        detail_windows: dict[str, int],
        device_input: DeviceInput | None,
        event_inputs: list[dict[str, Any]],
        frame_inputs: list[dict[str, Any]],
    ) -> None:
        super().__init__(name="trace-writer", daemon=True)
        self.stream = stream
        self.output_dir = output_dir
        self.expected_text = expected_text
        self.judge_event_arms = judge_event_arms
        self.judge_frame_arms = judge_frame_arms
        self.detail_windows = detail_windows
        self.device_input = device_input
        self.event_inputs = event_inputs
        self.frame_inputs = frame_inputs
        self.script: Any = None
        self.inbox: queue.SimpleQueue[tuple[str, Any]] = queue.SimpleQueue()
        self.event_count = 0
        self.runtime_bms_count = 0
        self.batch_count = 0
        self.max_queue_depth = 0
        self.armed_windows: set[str] = set()
        self.script_errors: list[dict[str, Any]] = []
        self.post_failures: list[dict[str, Any]] = []
        self.fault_count = 0
        self.faults: list[dict[str, Any]] = []

    # -- called on the message-delivery thread; must stay allocation-only ------------------
    def submit_events(self, batch: list[dict[str, Any]]) -> None:
        self.inbox.put(("events", batch))

    def submit_error(self, message: dict[str, Any]) -> None:
        self.inbox.put(("error", message))

    def stop(self) -> None:
        self.inbox.put(("stop", None))

    # -- writer thread ---------------------------------------------------------------------
    def run(self) -> None:
        while True:
            kind, item = self.inbox.get()
            if kind == "stop":
                self.stream.flush()
                return
            depth = self.inbox.qsize()
            if depth > self.max_queue_depth:
                self.max_queue_depth = depth
            if kind == "error":
                self.script_errors.append(item)
                print(item.get("stack", item), file=sys.stderr, flush=True)
                continue
            self.batch_count += 1
            for payload in item:
                # One malformed event must never end the collection. Before this guard a single
                # unexpected field shape killed the writer thread, and the run went on producing
                # nothing while the agent still looked healthy. Section 19 of the evidence
                # requirements rejects silently dropped events, so every fault is counted and
                # recorded in the capture metadata instead.
                try:
                    self._write_event(payload)
                except Exception as error:
                    self._record_fault("write", payload, error)
                    continue
                try:
                    self._react(payload)
                except Exception as error:
                    self._record_fault("react", payload, error)
            self.stream.flush()

    def _record_fault(self, stage: str, payload: dict[str, Any], error: Exception) -> None:
        self.fault_count += 1
        if len(self.faults) < 50:
            self.faults.append(
                {
                    "stage": stage,
                    "sequence": payload.get("sequence"),
                    "event": payload.get("event"),
                    "error": f"{type(error).__name__}: {error}",
                    "at_utc": utc_now(),
                }
            )

    def _write_event(self, payload: dict[str, Any]) -> None:
        runtime_text = payload.pop("runtime_bms_text", None)
        if runtime_text is not None and not isinstance(runtime_text, str):
            # readString() answers `{oversize_length, read: false}` instead of a string when the
            # managed length exceeds the agent's cap. Keep the refusal in the event rather than
            # dropping it, so a missing BMS is visible in the trace instead of silent.
            payload["runtime_bms"] = {"read": False, "detail": runtime_text}
            runtime_text = None
        if runtime_text is not None:
            self.runtime_bms_count += 1
            runtime_bytes = runtime_text.encode("utf-8")
            runtime_path = self.output_dir / f"runtime_consumed_bms_{self.runtime_bms_count:03d}.txt"
            runtime_path.write_bytes(runtime_bytes)
            payload["runtime_bms"] = {
                "path": runtime_path.name,
                "bytes": len(runtime_bytes),
                "sha256": digest(runtime_bytes),
                "matches_expected_text": (
                    self.expected_text == runtime_text if self.expected_text is not None else None
                ),
            }
        payload["host_received_at_utc"] = utc_now()
        self.stream.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
        self.event_count += 1

    def _post(self, message: dict[str, Any]) -> None:
        if self.script is None:
            return
        try:
            self.script.post(message)
        except Exception as error:  # a dead session must be recorded, never swallowed
            self.post_failures.append({"message": message, "error": str(error), "at_utc": utc_now()})

    def _react(self, payload: dict[str, Any]) -> None:
        event_name = payload.get("event")
        for arm in self.judge_event_arms:
            if not arm["fired"] and arm["event"] == event_name:
                arm["fired"] = True
                self._post({"type": "judge_window", "action": "arm", "sample_budget": arm["samples"]})
        frame_number = payload.get("frame_id")
        if isinstance(frame_number, int):
            for arm in self.judge_frame_arms:
                if not arm["fired"] and frame_number >= arm["frame"]:
                    arm["fired"] = True
                    self._post({"type": "judge_window", "action": "arm", "sample_budget": arm["samples"]})
        frames = self.detail_windows.get(event_name)
        if frames and event_name not in self.armed_windows:
            self.armed_windows.add(event_name)
            self._post({"type": "detail_window", "frames": frames})
        if self.device_input is None:
            return
        for rule in self.event_inputs:
            if rule["fired"] or rule["event"] != event_name:
                continue
            rule["seen"] += 1
            if rule["seen"] >= rule["nth"]:
                rule["fired"] = True
                self.device_input.send(rule["command"], f"on:{event_name}#{rule['seen']}")
        if isinstance(frame_number, int):
            for rule in self.frame_inputs:
                if not rule["fired"] and frame_number >= rule["frame"]:
                    rule["fired"] = True
                    self.device_input.send(rule["command"], f"frame:{frame_number}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture native ARM64 clock/BPM scheduling events from the original client.")
    parser.add_argument("--package", default="jp.co.craftegg.band")
    parser.add_argument("--pid", type=int)
    parser.add_argument("--device-serial")
    parser.add_argument("--frida-remote", metavar="HOST:PORT",
                        help="reach frida-server through an explicit forward, e.g. 127.0.0.1:47913")
    parser.add_argument("--duration", type=float, default=0.0)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-bms", type=Path)
    parser.add_argument("--minimal-runtime", action="store_true")
    parser.add_argument("--disable-label", action="append", default=[], metavar="LABEL",
                        help="skip one hook by label; use to shed per-frame snapshot cost")
    parser.add_argument("--profile", choices=sorted(PROFILES), default="bpm-lifecycle")
    parser.add_argument("--no-instruction-probes", action="store_true",
                        help="install interceptor hooks only; skip the inline register probes")
    parser.add_argument("--note-detail-lead-frames", type=int, default=40)
    parser.add_argument("--note-detail-duty", default="0:0", metavar="ON:OFF",
                        help="emit note-level detail for ON frames out of every ON+OFF frames")
    parser.add_argument("--judge-sample-budget", type=int, default=60)
    parser.add_argument("--judge-step-budget", type=int, default=4000)
    parser.add_argument("--judge-arm-at-frame", action="append", default=[], metavar="FRAME:SAMPLES",
                        help="attach the judgement-offset step probes when the given frame is reached")
    parser.add_argument("--judge-arm-on", action="append", default=[], metavar="EVENT:SAMPLES",
                        help="attach the judgement-offset step probes when the named trace event appears")
    parser.add_argument("--batch-flush-ms", type=int, default=100)
    parser.add_argument("--batch-max-events", type=int, default=400)
    parser.add_argument(
        "--detail-window-on",
        action="append",
        default=[],
        metavar="EVENT:FRAMES",
        help="arm a note-detail frame window when the named trace event first appears",
    )
    parser.add_argument(
        "--input-on",
        action="append",
        default=[],
        metavar="EVENT[:NTH]=SHELL",
        help="send a device shell command when the named trace event appears",
    )
    parser.add_argument(
        "--input-at-frame",
        action="append",
        default=[],
        metavar="FRAME=SHELL",
        help="send a device shell command when the given NoteManager frame id is reached",
    )
    parser.add_argument(
        "--input-after",
        action="append",
        default=[],
        metavar="SECONDS=SHELL",
        help="send a device shell command the given number of seconds after capture start",
    )
    args = parser.parse_args()

    if args.duration < 0:
        raise ValueError("duration must be non-negative")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    trace_path = args.output_dir / "runtime_trace.jsonl"
    metadata_path = args.output_dir / "capture_metadata.json"
    expected_bytes = args.expected_bms.read_bytes() if args.expected_bms else None
    expected_text = expected_bytes.decode("utf-8-sig") if expected_bytes is not None else None

    # Resolve the address tables from the version actually installed on the device, before any
    # hook address is computed. Every RVA, probe offset and constant in this script is proven
    # against a specific build; running the 10.1.3 table against another build would attach
    # interceptors to whatever happens to live at those addresses and produce a trace that looks
    # valid and means nothing.
    installed = package_info(args.package)
    version_code = installed.get("version_code")
    if version_code not in VERSION_TABLES:
        proven = ", ".join(f"{table['version_name']} / {code}"
                           for code, table in sorted(VERSION_TABLES.items()))
        raise SystemExit(
            f"refusing to capture: {args.package} is version {installed.get('version_name')} / "
            f"{version_code} on this device and no proven address table exists for it. "
            f"Proven versions: {proven}. Re-prove the target set first; see "
            f"artifacts/investigations/package-version-rebaseline-10-1-4/."
        )
    tables = VERSION_TABLES[version_code]

    profile = dict(PROFILES[args.profile])
    disabled_labels = set(MINIMAL_DISABLED) if args.minimal_runtime else set()
    unknown = [label for label in args.disable_label if label not in tables["rvas"]]
    if unknown:
        raise SystemExit(f"unknown hook labels: {sorted(unknown)}")
    disabled_labels.update(args.disable_label)
    config: dict[str, Any] = {
        "profile": args.profile,
        "adaptive_probes": bool(profile.get("adaptive_probes")) and not args.no_instruction_probes,
        "judge_probes": bool(profile.get("judge_probes")) and not args.no_instruction_probes,
        "note_detail": bool(profile.get("note_detail")),
        "note_detail_lead_frames": args.note_detail_lead_frames,
        "note_detail_duty_on": int(args.note_detail_duty.split(":")[0]),
        "note_detail_duty_off": int(args.note_detail_duty.split(":")[1]),
        "judge_sample_budget": args.judge_sample_budget,
        "judge_step_budget": args.judge_step_budget,
        "batch_flush_ms": args.batch_flush_ms,
        "batch_max_events": args.batch_max_events,
        "disabled_labels": sorted(disabled_labels),
    }

    judge_frame_arms: list[dict[str, Any]] = []
    for entry in args.judge_arm_at_frame:
        frame, _, samples = entry.partition(":")
        judge_frame_arms.append({"frame": int(frame), "samples": int(samples or 40), "fired": False})
    judge_event_arms: list[dict[str, Any]] = []
    for entry in args.judge_arm_on:
        event, _, samples = entry.partition(":")
        judge_event_arms.append({"event": event, "samples": int(samples or 40), "fired": False})

    detail_windows: dict[str, int] = {}
    for entry in args.detail_window_on:
        event, _, frames = entry.partition(":")
        detail_windows[event] = int(frames or 30)

    event_inputs: list[dict[str, Any]] = []
    for entry in args.input_on:
        selector, _, command = entry.partition("=")
        event, _, nth = selector.partition(":")
        event_inputs.append({"event": event, "nth": int(nth or 1), "command": command, "seen": 0, "fired": False})

    frame_inputs: list[dict[str, Any]] = []
    for entry in args.input_at_frame:
        frame, _, command = entry.partition("=")
        frame_inputs.append({"frame": int(frame), "command": command, "fired": False})

    timed_inputs: list[dict[str, Any]] = []
    for entry in args.input_after:
        seconds, _, command = entry.partition("=")
        timed_inputs.append({"seconds": float(seconds), "command": command, "fired": False})

    # docs/RUNTIME_CAPTURE_STABILITY.md: the default 27042 is the first port anti-tamper code
    # probes, and a probe that connects then drops is exactly the input that trips the fatal
    # libsoup assert inside frida-server. Prefer a non-standard loopback port reached through an
    # explicit adb forward over USB auto-discovery.
    manager = frida.get_device_manager()
    if args.frida_remote:
        device = manager.add_remote_device(args.frida_remote)
    elif args.device_serial:
        device = manager.get_device(args.device_serial, timeout=10)
    else:
        device = frida.get_usb_device(timeout=10)
    pid = args.pid
    if pid is None:
        processes = {process.name: process.pid for process in device.enumerate_processes()}
        pid = processes.get(args.package)
    if pid is None:
        applications = {app.identifier: app.pid for app in device.enumerate_applications()}
        pid = applications.get(args.package) or None
    if not pid:
        raise RuntimeError(f"package process is not running: {args.package}")

    session = device.attach(pid)
    script = session.create_script(create_agent(config, tables))
    trace_stream = trace_path.open("w", encoding="utf-8", newline="\n")
    device_input = DeviceInput(args.device_serial) if (event_inputs or frame_inputs or timed_inputs) else None
    writer = TraceWriter(
        stream=trace_stream,
        output_dir=args.output_dir,
        expected_text=expected_text,
        judge_event_arms=judge_event_arms,
        judge_frame_arms=judge_frame_arms,
        detail_windows=detail_windows,
        device_input=device_input,
        event_inputs=event_inputs,
        frame_inputs=frame_inputs,
    )
    writer.script = script
    input_lock = threading.Lock()
    started_monotonic = time.monotonic()

    def on_message(message: dict[str, Any], data: bytes | None) -> None:
        # Enqueue only. Anything heavier here stalls Frida's message pump for this process.
        if message.get("type") == "send":
            envelope = message["payload"]
            kind = envelope.get("kind")
            if kind == "clock-scheduling-batch":
                writer.submit_events(envelope.get("events") or [])
            elif kind == "clock-scheduling-event":
                writer.submit_events([envelope])
        elif message.get("type") == "error":
            writer.submit_error(message)

    # A collection session that dies mid-run produces a short trace that otherwise looks
    # like a legitimate capture. Record the detach reason so a truncated run can never be
    # mistaken for a complete one. The teardown at the end of a bounded run detaches too, and
    # that one also arrives as `application-requested`; flag it so a normal stop is not filed
    # as a truncated collection.
    detach_records: list[dict[str, Any]] = []
    shutdown_started = threading.Event()

    def on_detached(reason: str, crash: Any) -> None:
        during_teardown = shutdown_started.is_set()
        detach_records.append(
            {
                "reason": reason,
                "crash": None if crash is None else str(crash),
                "at_utc": utc_now(),
                "events_before_detach": writer.event_count,
                "during_teardown": during_teardown,
            }
        )
        if not during_teardown:
            print(f"collection session detached: {reason}", file=sys.stderr, flush=True)

    session.on("detached", on_detached)
    script.on("message", on_message)
    writer.start()
    script.load()
    started_at = utc_now()
    try:
        deadline = started_monotonic + args.duration if args.duration > 0 else None
        if deadline is None:
            print("capture active; press Ctrl+C to stop", flush=True)
        while True:
            now = time.monotonic()
            if device_input is not None:
                with input_lock:
                    for rule in timed_inputs:
                        if not rule["fired"] and now - started_monotonic >= rule["seconds"]:
                            rule["fired"] = True
                            device_input.send(rule["command"], f"after:{rule['seconds']}s")
            if detach_records:
                break
            if deadline is not None and now >= deadline:
                break
            time.sleep(0.02)
    except KeyboardInterrupt:
        pass
    finally:
        stopped_at = utc_now()
        shutdown_started.set()
        try:
            script.exports_sync.flush()
        except Exception:
            pass
        time.sleep(0.3)
        try:
            script.unload()
        except frida.InvalidOperationError:
            pass
        try:
            session.detach()
        except frida.InvalidOperationError:
            pass
        # Drain whatever the agent already handed over before closing the stream, otherwise a
        # clean shutdown silently truncates the tail of the trace.
        writer.stop()
        writer.join(timeout=30)
        writer_drained = not writer.is_alive()
        trace_stream.close()
        if device_input is not None:
            device_input.close()

    event_count = writer.event_count
    runtime_bms_count = writer.runtime_bms_count
    script_errors = writer.script_errors
    unexpected_detaches = [record for record in detach_records if not record["during_teardown"]]

    metadata = {
        "schema_version": 1,
        "agent_schema_version": AGENT_SCHEMA_VERSION,
        "probe_type": "native-arm64-clock-scheduling-runtime-oracle",
        "started_at_utc": started_at,
        "stopped_at_utc": stopped_at,
        "device": {
            "id": device.id,
            "name": device.name,
            "cpu_abi": adb("shell", "getprop", "ro.product.cpu.abi"),
            "root_id": adb("shell", "su", "-c", "id"),
            "selinux": adb("shell", "getenforce"),
        },
        "sample": {"package": args.package, **installed},
        # Which proven address table this run used. A trace is only interpretable against
        # the build its addresses were proven on.
        "address_table": {"version_code": version_code,
                          "version_name": tables["version_name"]},
        "frida": {
            "python_package_version": frida.__version__,
            "server": frida_server_info(),
            "pid": pid,
            "transport": "remote" if args.frida_remote else ("device-id" if args.device_serial else "usb"),
            "remote_address": args.frida_remote,
        },
        "rvas": {label: f"0x{rva:X}" for label, rva in tables["rvas"].items()},
        "instruction_probes": {
            label: {
                "rva": f"0x{entry['rva']:X}",
                "insn": entry["insn"],
                "purpose": entry["purpose"],
                "owner_range": [f"0x{entry['owner_range'][0]:X}", f"0x{entry['owner_range'][1]:X}"],
                "patch_bytes": PROBE_PATCH_BYTES,
            }
            for label, entry in tables["probes"].items()
        },
        "constant_rvas": {name: f"0x{rva:X}" for name, rva in tables["constants"].items()},
        "capture_config": config,
        "disabled_labels": sorted(disabled_labels),
        "device_input_actions": device_input.actions if device_input is not None else [],
        "event_count": event_count,
        "runtime_bms_count": runtime_bms_count,
        "script_errors": script_errors,
        "session_detached": detach_records,
        "collection_complete": (
            not unexpected_detaches
            and writer_drained
            and not writer.post_failures
            and writer.fault_count == 0
        ),
        # Host-side backpressure record. `max_queue_depth` counts batches still waiting when the
        # writer picked one up; a depth that stays low is the evidence that serialization and
        # disk writes never held up the message thread, and therefore never perturbed the
        # original client's frame timing. See docs/RUNTIME_CAPTURE_STABILITY.md mode 2.
        "collector": {
            "message_thread_role": "enqueue-only",
            "writer_thread": "trace-writer",
            "flush_granularity": "per-batch",
            "post_issued_from": "writer-thread",
            "batch_count": writer.batch_count,
            "max_queue_depth_batches": writer.max_queue_depth,
            "writer_drained_before_close": writer_drained,
            "post_failures": writer.post_failures,
            "fault_count": writer.fault_count,
            "faults": writer.faults,
        },
        "max_string_chars": MAX_STRING_CHARS,
        "expected_bms": (
            {
                "path": str(args.expected_bms),
                "bytes": len(expected_bytes),
                "sha256": digest(expected_bytes),
                "decoded_utf8_sha256": digest(expected_text.encode("utf-8")),
            }
            if expected_bytes is not None and expected_text is not None
            else None
        ),
        "guardrails": {
            "patched_apk": False,
            "wrote_process_memory": False,
            "replaced_return_value": False,
            "interceptor_observation_hooks": True,
            "instruction_probes_read_registers_only": True,
        },
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"runtime trace={trace_path} events={event_count} runtime_bms={runtime_bms_count}")
    print(f"capture metadata={metadata_path}")
    if unexpected_detaches:
        print(f"collection incomplete: {unexpected_detaches}", file=sys.stderr, flush=True)
        return 2
    if script_errors:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
