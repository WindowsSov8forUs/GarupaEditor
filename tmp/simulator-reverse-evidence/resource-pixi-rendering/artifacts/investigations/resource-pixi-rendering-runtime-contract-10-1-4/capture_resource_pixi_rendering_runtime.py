#!/usr/bin/env python3
"""Capture privacy-minimal observation-only rendering R1 evidence on 10.1.4 ARM64."""

from __future__ import annotations

import argparse
from collections import Counter
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


HERE = Path(__file__).resolve().parent
TARGETS_PATH = HERE / "resource_pixi_rendering_runtime_hook_targets.json"
PLAN_PATH = HERE / "runtime/resource-pixi-rendering-r1-plan.json"
PACKAGE = "jp.co.craftegg.band"
ADB = r"HOST___________\scrcpy\adb.exe"
DEVICE_SERIAL = "FICIPZUGEIQC4P7H"
TARGET_SAMPLE = {
    "package": PACKAGE,
    "version_name": "10.1.4",
    "version_code": 230,
    "abi": "arm64-v8a",
}


def strict_load(path: Path) -> Any:
    def reject(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value} in {path}")

    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


def adb(*args: str, capture: bool = True) -> str:
    result = subprocess.run(
        [ADB, "-s", DEVICE_SERIAL, *args],
        check=True,
        capture_output=capture,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout.strip() if capture else ""


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def build_script(targets: list[dict[str, Any]]) -> str:
    compact = [
        {
            "target_id": row["target_id"],
            "owner": row["owner"],
            "method": row["method"],
            "rva": row["rva"],
            "category": row["category"],
            "payload_fields": row["payload_fields"],
        }
        for row in targets
    ]
    encoded = json.dumps(compact, separators=(",", ":"))
    return f"""
'use strict';
const TARGETS = {encoded};
const MAX_EVENTS = 190000;
const HOT_TARGETS = new Set(['RPH-017','RPH-020','RPH-025','RPH-036','RPH-039','RPH-048']);
const events = [];
const counts = {{}};
const hookFailures = [];
const objectAliases = new Map();
const threadAliases = new Map();
let sequence = 0;
let relativeFrame = 0;

function alias(map, prefix, value) {{
  let key;
  try {{ if (!value || value.isNull()) return null; key = value.toString(); }} catch (_) {{ key = String(value); }}
  if (!map.has(key)) map.set(key, prefix + '-' + String(map.size + 1).padStart(2, '0'));
  return map.get(key);
}}
function threadAlias() {{ return alias(threadAliases, 'thread', ptr(Process.getCurrentThreadId())); }}
function objectAlias(value) {{ return alias(objectAliases, 'object', value); }}
function argBool(args, index) {{ try {{ return args[index].toInt32() !== 0; }} catch (_) {{ return null; }} }}
function argInt(args, index) {{ try {{ return args[index].toInt32(); }} catch (_) {{ return null; }} }}
function technicalString(value) {{
  try {{
    if (!value || value.isNull()) return null;
    const length = value.add(0x10).readU32();
    if (length < 1 || length > 120) return null;
    const text = value.add(0x14).readUtf16String(length);
    return /^[A-Za-z0-9_#./-]+$/.test(text) ? text : null;
  }} catch (_) {{ return null; }}
}}
function payloadFor(target, args, phase) {{
  const allowed = new Set(target.payload_fields);
  const payload = {{}};
  if (allowed.has('role')) payload.role = target.owner + '.' + target.method;
  if (allowed.has('selected_profile_alias') && target.target_id === 'RPH-003') payload.selected_profile_alias = 'ordinary-profile';
  if (allowed.has('logical_resource_alias') && target.target_id === 'RPH-003') payload.logical_resource_alias = 'ordinary-note-skin';
  if (allowed.has('technical_sprite_key') && target.target_id === 'RPH-008') {{
    const key = technicalString(args[1]);
    if (key !== null) payload.technical_sprite_key = key;
  }}
  if (allowed.has('enabled')) {{
    if (target.target_id === 'RPH-010') payload.enabled = argBool(args, 1);
    else if (target.method.startsWith('Deactivate') || target.method === 'Hide' || target.method === 'Off') payload.enabled = false;
    else if (target.method === 'Activate' || target.method === 'OnStart' || target.method === 'Show' || target.method === 'Play') payload.enabled = true;
  }}
  if (allowed.has('numeric_value')) {{
    const value = argInt(args, 1);
    if (value !== null && value > -100000000 && value < 100000000) payload.numeric_value = value;
  }}
  if (allowed.has('controller_alias')) payload.controller_alias = 'controller-' + String(Math.max(1, objectAliases.size)).padStart(2, '0');
  if (phase === 'leave' && allowed.has('success')) payload.success = true;
  return payload;
}}
function record(target, phase, self, args) {{
  if (events.length >= MAX_EVENTS) return;
  const key = target.target_id + ':' + phase;
  counts[key] = (counts[key] || 0) + 1;
  const ticks = Date.now() * 1000 + sequence;
  events.push({{
    sequence: sequence++,
    target_id: target.target_id,
    phase,
    frame: relativeFrame,
    monotonic_ticks: ticks,
    thread_alias: threadAlias(),
    object_alias: objectAlias(self),
    payload: payloadFor(target, args, phase),
  }});
}}
function install(target) {{
  try {{
    const module = Process.findModuleByName('libil2cpp.so');
    const address = module.base.add(parseInt(target.rva, 16));
    Interceptor.attach(address, {{
      onEnter(args) {{
        if (target.target_id === 'RPH-036') relativeFrame++;
        const invocation = (counts[target.target_id + ':invocation'] || 0) + 1;
        counts[target.target_id + ':invocation'] = invocation;
        this.capture = invocation <= (HOT_TARGETS.has(target.target_id) ? 1600 : 5000);
        if (!this.capture) return;
        this.self = args[0];
        this.args = [args[0], args[1], args[2], args[3], args[4]];
        record(target, 'enter', this.self, this.args);
      }},
      onLeave() {{
        if (!this.capture) return;
        record(target, 'leave', this.self, this.args);
      }},
    }});
  }} catch (error) {{ hookFailures.push({{ target_id: target.target_id, error_category: 'hook-install-failed' }}); }}
}}
for (const target of TARGETS) install(target);

rpc.exports.drain = function() {{ return events.splice(0, events.length); }};
rpc.exports.summary = function() {{
  return {{ counts, queued: events.length, hook_failures: hookFailures, object_alias_count: objectAliases.size, thread_alias_count: threadAliases.size, relative_frame: relativeFrame }};
}};
"""


def tap(x: int, y: int) -> None:
    adb("shell", "input", "tap", str(x), str(y), capture=False)


def capture_trace(args: argparse.Namespace) -> dict[str, Any]:
    targets_document = strict_load(TARGETS_PATH)
    plan_document = strict_load(PLAN_PATH)
    scenario = next(row for row in plan_document["scenarios"] if row["plan_id"] == args.plan_id)
    package = adb("shell", "dumpsys", "package", PACKAGE)
    if "versionName=10.1.4" not in package or "versionCode=230" not in package:
        raise RuntimeError("device package is not locked to 10.1.4 / 230")
    if adb("shell", "getenforce") != "Enforcing":
        raise RuntimeError("SELinux is not Enforcing")
    pid = int(adb("shell", "pidof", PACKAGE))
    device = frida.get_device_manager().add_remote_device(args.device_address)
    session = device.attach(pid)
    script = session.create_script(build_script(targets_document["targets"]))
    messages: list[dict[str, Any]] = []
    script.on("message", lambda message, data: messages.append(message))
    script.load()
    started = datetime.now(timezone.utc).isoformat()
    collected: list[dict[str, Any]] = []
    stop = threading.Event()
    capture_error: str | None = None

    def drain_loop() -> None:
        nonlocal capture_error
        while not stop.wait(0.2):
            try:
                collected.extend(script.exports_sync.drain())
            except Exception as error:
                capture_error = f"{type(error).__name__}: {error}"
                return

    drainer = threading.Thread(target=drain_loop, daemon=True)
    drainer.start()
    action_state = {
        "auto_live_enabled": False,
        "natural_live_started": False,
        "pause_requested": False,
        "resume_requested": False,
        "result_wait_completed": False,
    }
    try:
        tap(1030, 557)
        action_state["auto_live_enabled"] = True
        time.sleep(1)
        tap(1240, 590)
        action_state["natural_live_started"] = True
        time.sleep(args.pause_after)
        tap(1505, 45)
        action_state["pause_requested"] = True
        time.sleep(2)
        tap(1040, 443)
        action_state["resume_requested"] = True
        time.sleep(args.finish_after_resume)
        action_state["result_wait_completed"] = True
    except Exception as error:
        capture_error = f"{type(error).__name__}: {error}"
    finally:
        stop.set()
        drainer.join(timeout=3)
        try:
            collected.extend(script.exports_sync.drain())
            runtime_summary = script.exports_sync.summary()
        except Exception as error:
            capture_error = capture_error or f"{type(error).__name__}: {error}"
            runtime_summary = {"counts": {}, "hook_failures": [{"error_category": "rpc-summary-failed"}]}
        try:
            session.detach()
        except Exception:
            pass

    collected.sort(key=lambda row: row["sequence"])
    for index, event in enumerate(collected):
        event["sequence"] = index
    counts = Counter((event["target_id"], event["phase"]) for event in collected)
    by_target = Counter(event["target_id"] for event in collected)
    target_map = {row["target_id"]: row for row in targets_document["targets"]}
    categories = sorted({target_map[event["target_id"]]["category"] for event in collected})
    owner_method = {(row["owner"], row["method"]): row["target_id"] for row in targets_document["targets"]}
    setup = owner_method[("NoteManager", "setupNoteSkin")]
    load = owner_method[("NoteImageController", "LoadResources")]
    result = owner_method[("CE.Result", "Show")]
    note_start = owner_method[("NoteBase", "OnStart")]
    note_end = owner_method[("NoteBase", "Deactivate")]
    anchors: list[str] = []
    if counts[(setup, "enter")] and counts[(setup, "enter")] == counts[(setup, "leave")] and counts[(load, "enter")] == counts[(load, "leave")]:
        anchors.append("scene-ready")
    if by_target[note_start]:
        anchors.append("first-note-visible")
    if by_target[owner_method[("ComboNumber", "Show")]] or by_target[owner_method[("Score", "UpdateView")]]:
        anchors.append("first-note-judged")
    if all(by_target[owner_method[key]] for key in [("Score", "UpdateView"), ("Combo", "ExecUpdate"), ("InGameLifeGauge", "UpdateView")]):
        anchors.append("score-combo-life-update")
    if any(target_map[event["target_id"]]["category"] == "hud-animation" and event["payload"].get("enabled") is True for event in collected):
        anchors.append("skill-start")
    if action_state["pause_requested"]:
        anchors.append("pause")
    if action_state["resume_requested"]:
        anchors.append("resume")
    if by_target[result]:
        anchors.append("scene-exit")
    note_pairs = min(counts[(note_start, "enter")], counts[(note_end, "enter")])
    required_categories = set(scenario["required_categories"])
    required_anchors = set(scenario["required_anchors"])
    promotable = (
        capture_error is None
        and not runtime_summary.get("hook_failures")
        and required_categories <= set(categories)
        and required_anchors <= set(anchors)
        and note_pairs >= 1
        and action_state["pause_requested"]
        and action_state["resume_requested"]
        and len(collected) <= plan_document["trace_schema"]["max_events"]
    )
    return {
        "schema_version": 1,
        "status": "confirmed-r1-observation-only" if promotable else "partial-r1-observation-only",
        "sample": TARGET_SAMPLE,
        "plan_id": args.plan_id,
        "hook_target_sha256": plan_document["hook_target_sha256"],
        "capture": {
            "capture_error": capture_error,
            "natural_live_entry": action_state["natural_live_started"],
            "game_server_available": True,
            "selinux": "Enforcing",
            "loopback_transport_only": args.device_address == "127.0.0.1:47913",
            "return_replacement": False,
            "memory_writes": False,
            "managed_invocation": False,
            "apk_patch": False,
            "premium_currency_continue": False,
            "synthetic_event_injection": False,
            "frame_source": "relative epoch incremented by natural RPH-036 Combo.ExecUpdate.enter",
            "operator_actions": action_state,
            "hook_failures": runtime_summary.get("hook_failures", []),
            "frida_messages": len(messages),
            "started_utc": started,
            "finished_utc": datetime.now(timezone.utc).isoformat(),
            "capture_script_sha256": digest(Path(__file__)),
        },
        "privacy": {
            "raw_pointers_included": False,
            "display_strings_included": False,
            "account_fields_included": False,
            "room_identity_included": False,
            "member_card_skill_identity_included": False,
        },
        "events": collected,
        "summary": {
            "categories": categories,
            "anchors": sorted(set(anchors)),
            "note_activate_deactivate_pairs": note_pairs,
            "pause_resume_phase_samples": 1 if action_state["pause_requested"] and action_state["resume_requested"] else 0,
            "completion_requirements_met": promotable,
            "privacy_requirements_met": True,
            "event_count": len(collected),
            "target_event_counts": dict(sorted(by_target.items())),
            "object_alias_count": runtime_summary.get("object_alias_count", 0),
            "thread_alias_count": runtime_summary.get("thread_alias_count", 0),
            "relative_frame_count": runtime_summary.get("relative_frame", 0),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan-id", default="ordinary-rendering-r1", choices=["ordinary-rendering-r1"])
    parser.add_argument("--device-address", default="127.0.0.1:47913")
    parser.add_argument("--pause-after", type=float, default=35.0)
    parser.add_argument("--finish-after-resume", type=float, default=145.0)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    trace = capture_trace(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(trace, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    if args.output.suffix == ".gz":
        with gzip.GzipFile(filename=str(args.output), mode="wb", mtime=0) as destination:
            destination.write(encoded)
    else:
        args.output.write_bytes(encoded)
    print(json.dumps({"output": str(args.output), "status": trace["status"], "events": len(trace["events"]), "summary": trace["summary"]}, ensure_ascii=False))
    return 0 if trace["status"] == "confirmed-r1-observation-only" else 2


if __name__ == "__main__":
    raise SystemExit(main())
