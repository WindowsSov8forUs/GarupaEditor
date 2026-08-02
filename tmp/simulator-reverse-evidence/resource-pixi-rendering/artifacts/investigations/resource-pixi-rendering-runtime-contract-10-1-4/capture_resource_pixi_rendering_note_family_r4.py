#!/usr/bin/env python3
"""Capture privacy-minimal renderer setter payloads during a natural 10.1.4 ordinary Live."""

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
TARGETS_PATH = HERE / "resource_pixi_rendering_note_family_r4_targets.json"
PACKAGE = "jp.co.craftegg.band"
ADB = r"HOST___________\scrcpy\adb.exe"
DEVICE_SERIAL = "FICIPZUGEIQC4P7H"
FRIDA_SERVER = "/data/local/tmp/frida-server-17.15.3"
FRIDA_DEVICE_ADDRESS = "127.0.0.1:27042"
TARGET_SAMPLE = {
    "package": PACKAGE,
    "version_name": "10.1.4",
    "version_code": 230,
    "abi": "arm64-v8a",
}
OWNER_GROUPS = {
    "flick": {"RPF-000", "RPF-001", "RPF-002", "RPF-003", "RPF-004", "RPF-005", "RPF-006"},
    "slide": {"RPF-000", "RPF-005", "RPF-006", "RPF-007", "RPF-008", "RPF-009", "RPF-010", "RPF-011", "RPF-012", "RPF-028", "RPF-029"},
    "multiple": {"RPF-000", *{f"RPF-{index:03d}" for index in range(13, 28)}},
}
SETTER_TARGETS = [
    {"setter_id": "RPS-001", "name": "Mesh.set_vertices", "rva": "0x659CE48", "kind": "vector3-array"},
    {"setter_id": "RPS-002", "name": "Mesh.set_uv", "rva": "0x659D04C", "kind": "vector2-array"},
    {"setter_id": "RPS-003", "name": "Mesh.set_colors", "rva": "0x659D1B8", "kind": "color-array"},
    {"setter_id": "RPS-004", "name": "Mesh.set_triangles", "rva": "0x659DF00", "kind": "int32-array"},
    {"setter_id": "RPS-005", "name": "Material.SetFloat(int,float)", "rva": "0x6596684", "kind": "material-float"},
    {"setter_id": "RPS-006", "name": "LineRenderer.SetPosition", "rva": "0x658BE54", "kind": "line-position"},
    {"setter_id": "RPS-007", "name": "LineRenderer.SetWidth", "rva": "0x658BB84", "kind": "line-width"},
    {"setter_id": "RPS-008", "name": "Transform.set_position", "rva": "0x65C97A8", "kind": "vector3-value"},
    {"setter_id": "RPS-009", "name": "Transform.set_localPosition", "rva": "0x65C8C58", "kind": "vector3-value"},
    {"setter_id": "RPS-010", "name": "Transform.set_localScale", "rva": "0x65CA1F8", "kind": "vector3-value"},
    {"setter_id": "RPFU-001", "name": "UISprite.set_spriteName", "rva": "0x308775C", "kind": "technical-string"},
    {"setter_id": "RPFU-002", "name": "GameObject.SetActive", "rva": "0x65BD414", "kind": "bool-arg1"},
    {"setter_id": "RPFU-003", "name": "Animator.Play(string,int,float)", "rva": "0x656D140", "kind": "animator-play-string-layer-time"},
    {"setter_id": "RPFU-004", "name": "Renderer.set_sortingOrder", "rva": "0x658DEAC", "kind": "int-arg1"},
]


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


def build_script(owner_targets: list[dict[str, Any]]) -> str:
    owners = [
        {
            "target_id": row["target_id"],
            "owner": row["owner"],
            "method": row["method"],
            "rva": row["rva"],
            "category": row["category"],
        }
        for row in owner_targets
    ]
    return f"""
'use strict';
const OWNERS = {json.dumps(owners, separators=(",", ":"))};
const SETTERS = {json.dumps(SETTER_TARGETS, separators=(",", ":"))};
const MAX_EVENTS = 180000;
const MAX_ARRAY_LENGTH = 256;
const events = [];
const failures = [];
const aliases = new Map();
const active = new Map();
let sequence = 0;
let relativeFrame = 0;

function threadKey() {{ return String(Process.getCurrentThreadId()); }}
function alias(prefix, value) {{
  let key;
  try {{ if (!value || value.isNull()) return null; key = value.toString(); }} catch (_) {{ return null; }}
  const combined = prefix + ':' + key;
  if (!aliases.has(combined)) aliases.set(combined, prefix + '-' + String(aliases.size + 1).padStart(4, '0'));
  return aliases.get(combined);
}}
function topOwner() {{
  const stack = active.get(threadKey());
  return stack && stack.length ? stack[stack.length - 1] : null;
}}
function pushOwner(owner, self) {{
  const key = threadKey();
  const stack = active.get(key) || [];
  stack.push({{ target_id: owner.target_id, owner: owner.owner, method: owner.method, category: owner.category, object_alias: alias('owner', self) }});
  active.set(key, stack);
}}
function popOwner() {{
  const key = threadKey();
  const stack = active.get(key) || [];
  stack.pop();
  if (stack.length) active.set(key, stack); else active.delete(key);
}}
function hex32(value) {{ return ('00000000' + (value >>> 0).toString(16).toUpperCase()).slice(-8); }}
function qBits(context, index) {{
  const bytes = context['q' + index];
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 4) throw new Error('vector-register-unavailable');
  return hex32(new DataView(bytes).getUint32(0, true));
}}
function arrayLength(value) {{
  if (!value || value.isNull()) throw new Error('null-managed-array');
  const length = value.add(0x18).readU32();
  if (length < 1 || length > MAX_ARRAY_LENGTH) throw new Error('managed-array-length-out-of-range');
  return length;
}}
function floatArray(value, width) {{
  const length = arrayLength(value);
  const result = [];
  const data = value.add(0x20);
  for (let index = 0; index < length; index++) {{
    const row = [];
    for (let component = 0; component < width; component++) row.push(hex32(data.add((index * width + component) * 4).readU32()));
    result.push(row);
  }}
  return result;
}}
function technicalString(value) {{
  if (!value || value.isNull()) return null;
  const length = value.add(0x10).readU32();
  if (length > 64) return null;
  const text = value.add(0x14).readUtf16String(length);
  return /^[A-Za-z0-9_#./+ -]*$/.test(text) ? text : null;
}}
function intArray(value) {{
  const length = arrayLength(value);
  const result = [];
  const data = value.add(0x20);
  for (let index = 0; index < length; index++) result.push(data.add(index * 4).readS32());
  return result;
}}
function payloadFor(setter, args, context) {{
  switch (setter.kind) {{
    case 'vector3-array': return {{ vertex_f32_bits: floatArray(args[1], 3) }};
    case 'vector2-array': return {{ uv_f32_bits: floatArray(args[1], 2) }};
    case 'color-array': return {{ color_f32_bits: floatArray(args[1], 4) }};
    case 'int32-array': return {{ index_i32: intArray(args[1]) }};
    case 'material-float': return {{ property_id: args[1].toInt32(), value_f32_bits: qBits(context, 0) }};
    case 'line-position': return {{ index: args[1].toInt32(), position_f32_bits: [qBits(context, 0), qBits(context, 1), qBits(context, 2)] }};
    case 'line-width': return {{ start_width_f32_bits: qBits(context, 0), end_width_f32_bits: qBits(context, 1) }};
    case 'vector3-value': return {{ value_f32_bits: [qBits(context, 0), qBits(context, 1), qBits(context, 2)] }};
    case 'technical-string': return {{ technical_value: technicalString(args[1]) }};
    case 'bool-arg1': return {{ enabled: args[1].toInt32() !== 0 }};
    case 'int-arg1': return {{ value_i32: args[1].toInt32() }};
    case 'animator-play-string-layer-time': return {{ technical_value: technicalString(args[1]), layer: args[2].toInt32(), normalized_time_f32_bits: qBits(context, 0) }};
    default: throw new Error('unknown-setter-kind');
  }}
}}
function record(setter, self, args, context) {{
  if (events.length >= MAX_EVENTS) return;
  const owner = topOwner();
  if (owner === null) return;
  try {{
    events.push({{
      sequence: sequence++,
      frame: relativeFrame,
      owner_target_id: owner.target_id,
      owner_role: owner.owner + '.' + owner.method,
      owner_category: owner.category,
      owner_object_alias: owner.object_alias,
      setter_id: setter.setter_id,
      setter: setter.name,
      component_alias: alias('component', self),
      payload: payloadFor(setter, args, context),
    }});
  }} catch (error) {{
    failures.push({{ setter_id: setter.setter_id, error_category: String(error && error.message ? error.message : error) }});
  }}
}}
function installOwner(module, owner) {{
  try {{
    Interceptor.attach(module.base.add(parseInt(owner.rva, 16)), {{
      onEnter(args) {{ pushOwner(owner, args[0]); if (owner.target_id === 'RPF-000') relativeFrame++; }},
      onLeave() {{ popOwner(); }},
    }});
  }} catch (_) {{ failures.push({{ target_id: owner.target_id, error_category: 'owner-hook-install-failed' }}); }}
}}
function installSetter(module, setter) {{
  try {{
    Interceptor.attach(module.base.add(parseInt(setter.rva, 16)), {{
      onEnter(args) {{ record(setter, args[0], args, this.context); }},
    }});
  }} catch (_) {{ failures.push({{ setter_id: setter.setter_id, error_category: 'setter-hook-install-failed' }}); }}
}}
const module = Process.findModuleByName('libil2cpp.so');
for (const owner of OWNERS) installOwner(module, owner);
for (const setter of SETTERS) installSetter(module, setter);
rpc.exports.drain = function() {{ return events.splice(0, events.length); }};
rpc.exports.summary = function() {{ return {{ queued: events.length, failures, alias_count: aliases.size, relative_frame: relativeFrame }}; }};
"""


def tap(x: int, y: int) -> None:
    adb("shell", "input", "tap", str(x), str(y), capture=False)


def capture(args: argparse.Namespace) -> dict[str, Any]:
    target_document = strict_load(TARGETS_PATH)
    target_map = {row["target_id"]: row for row in target_document["targets"]}
    owner_targets = [target_map[target_id] for target_id in sorted(OWNER_GROUPS[args.owner_group])]
    package = adb("shell", "dumpsys", "package", PACKAGE)
    if "versionName=10.1.4" not in package or "versionCode=230" not in package:
        raise RuntimeError("device package is not locked to 10.1.4 / 230")
    if adb("shell", "getenforce") != "Enforcing":
        raise RuntimeError("SELinux is not Enforcing")
    actions = {
        "natural_live_started": False,
        "post_start_attach_wait_completed": False,
        "pause_requested": False,
        "resume_requested": False,
        "wait_completed": False,
    }
    tap(args.start_x, args.start_y)
    actions["natural_live_started"] = True
    time.sleep(args.post_start_attach_delay)
    actions["post_start_attach_wait_completed"] = True
    adb(
        "shell",
        "su",
        "-c",
        f"nohup {FRIDA_SERVER} -l {FRIDA_DEVICE_ADDRESS} >/data/local/tmp/frida-r4.log 2>&1 &",
    )
    time.sleep(args.frida_server_start_delay)
    adb("forward", "tcp:27042", "tcp:27042")

    pid = int(adb("shell", "pidof", PACKAGE))
    device = frida.get_device_manager().add_remote_device(args.device_address)
    session = device.attach(pid)
    script = session.create_script(build_script(owner_targets))
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
    try:
        time.sleep(args.pause_after)
        tap(1505, 45)
        actions["pause_requested"] = True
        time.sleep(2)
        tap(1040, 443)
        actions["resume_requested"] = True
        time.sleep(args.finish_after_resume)
        actions["wait_completed"] = True
    except Exception as error:
        capture_error = f"{type(error).__name__}: {error}"
    finally:
        stop.set()
        drainer.join(timeout=3)
        try:
            collected.extend(script.exports_sync.drain())
            summary = script.exports_sync.summary()
        except Exception as error:
            capture_error = capture_error or f"{type(error).__name__}: {error}"
            summary = {"failures": [{"error_category": "rpc-summary-failed"}]}
        try:
            session.detach()
        except Exception:
            pass

    collected.sort(key=lambda row: row["sequence"])
    for index, event in enumerate(collected):
        event["sequence"] = index
    setter_counts = Counter(event["setter_id"] for event in collected)
    owner_counts = Counter(event["owner_target_id"] for event in collected)
    required_setters = {
        "flick": {"RPS-008", "RPS-009", "RPS-010", "RPFU-001", "RPFU-002", "RPFU-003", "RPFU-004"},
        "slide": {"RPS-001", "RPS-003", "RPS-005", "RPS-008", "RPS-009", "RPS-010", "RPFU-002"},
        "multiple": {"RPS-006", "RPS-007", "RPS-008", "RPS-009", "RPS-010", "RPFU-001", "RPFU-002", "RPFU-003"},
    }[args.owner_group]
    required_owner_groups = {
        "flick": [{"RPF-001", "RPF-002", "RPF-003", "RPF-004"}],
        "slide": [{"RPF-007", "RPF-008", "RPF-009", "RPF-010", "RPF-011", "RPF-012"}],
        "multiple": [{"RPF-013", "RPF-017", "RPF-020", "RPF-023", "RPF-025", "RPF-026"}],
    }[args.owner_group]
    promotable = (
        capture_error is None
        and summary.get("failures") == []
        and required_setters <= set(setter_counts)
        and all(group & set(owner_counts) for group in required_owner_groups)
        and actions["natural_live_started"]
        and actions["pause_requested"]
        and actions["resume_requested"]
    )
    return {
        "schema_version": 1,
        "status": f"confirmed-current-note-family-r4-{args.owner_group}-observation-only" if promotable else f"partial-current-note-family-r4-{args.owner_group}-observation-only",
        "sample": TARGET_SAMPLE,
        "owner_group": args.owner_group,
        "source": {
            "owner_targets_sha256": digest(TARGETS_PATH),
            "geometry_setter_targets_sha256": digest(HERE / "resource_pixi_rendering_setter_targets.json"),
            "hud_setter_targets_sha256": digest(HERE / "resource_pixi_rendering_hud_setter_targets.json"),
        },
        "capture": {
            "capture_error": capture_error,
            "natural_live_entry": actions["natural_live_started"],
            "selinux": "Enforcing",
            "loopback_transport_only": args.device_address == FRIDA_DEVICE_ADDRESS,
            "return_replacement": False,
            "memory_writes": False,
            "managed_invocation": False,
            "apk_patch": False,
            "synthetic_event_injection": False,
            "operator_actions": actions,
            "hook_failures": summary.get("failures", []),
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
        "setter_contract": SETTER_TARGETS,
        "events": collected,
        "summary": {
            "completion_requirements_met": promotable,
            "event_count": len(collected),
            "setter_event_counts": dict(sorted(setter_counts.items())),
            "owner_event_counts": dict(sorted(owner_counts.items())),
            "alias_count": summary.get("alias_count", 0),
            "relative_frame_count": summary.get("relative_frame", 0),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device-address", default="127.0.0.1:47913")
    parser.add_argument("--owner-group", choices=sorted(OWNER_GROUPS), required=True)
    parser.add_argument("--start-x", type=int, default=1240)
    parser.add_argument("--start-y", type=int, default=590)
    parser.add_argument("--post-start-attach-delay", type=float, default=8.0)
    parser.add_argument("--frida-server-start-delay", type=float, default=2.0)
    parser.add_argument("--pause-after", type=float, default=35.0)
    parser.add_argument("--finish-after-resume", type=float, default=145.0)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = capture(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    if args.output.suffix == ".gz":
        with gzip.GzipFile(filename=str(args.output), mode="wb", mtime=0) as destination:
            destination.write(encoded)
    else:
        args.output.write_bytes(encoded)
    print(json.dumps({"output": str(args.output), "status": result["status"], "summary": result["summary"]}, ensure_ascii=False))
    return 0 if result["status"].startswith("confirmed-") else 2


if __name__ == "__main__":
    raise SystemExit(main())
