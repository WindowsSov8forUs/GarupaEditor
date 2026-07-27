from __future__ import annotations

import argparse
import json

import frida


TARGETS = {
    "InGameDirector": ["Awake", "Update"],
    "InGameManager": ["ExecUpdate", "updatePlayState"],
    "NoteManager": [
        "Init",
        "SetupNotes",
        "ExecUpdate",
        "activateNotesJustNow",
        "activateBPMChangeNoteProcess",
        "setupBpmChangeNote",
        "getNoteBpmChangeData",
        "onBpmChanged",
        "analyzeBMS",
    ],
    "InGameMusicScoreController": [
        "SetExecuteFrame",
        "SetCurrentBPM",
        "SetBasicBPM",
        "SetBasicBPMString",
        "SetNextBPM",
        "SetLauncherMusicBarProgress",
        "SetLauncherMusicBeatProgress",
        "SetMusicBarProgress",
        "SetMusicBeatProgress",
        "UpdateMusicScoreProgress",
        "UpdateBPM",
        "SetupFirstGameProgress",
    ],
    "NoteBpmChange": ["Setup", "ExecUpdate", "updateBpm"],
}


def create_agent() -> str:
    return f"""
'use strict';

const targets = {json.dumps(TARGETS, sort_keys=True)};
const module = Process.getModuleByName('libil2cpp.so');

function exported(name, returnType, argumentTypes) {{
  return new NativeFunction(module.getExportByName(name), returnType, argumentTypes);
}}

const domainGet = exported('il2cpp_domain_get', 'pointer', []);
const domainGetAssemblies = exported('il2cpp_domain_get_assemblies', 'pointer', ['pointer', 'pointer']);
const assemblyGetImage = exported('il2cpp_assembly_get_image', 'pointer', ['pointer']);
const imageGetName = exported('il2cpp_image_get_name', 'pointer', ['pointer']);
const classFromName = exported('il2cpp_class_from_name', 'pointer', ['pointer', 'pointer', 'pointer']);
const classGetMethodFromName = exported('il2cpp_class_get_method_from_name', 'pointer', ['pointer', 'pointer', 'int']);

const sizePointer = Memory.alloc(Process.pointerSize);
sizePointer.writeU64(0);
const assemblies = domainGetAssemblies(domainGet(), sizePointer);
const assemblyCount = Number(sizePointer.readU64());
const emptyNamespace = Memory.allocUtf8String('');
const results = [];

for (let assemblyIndex = 0; assemblyIndex < assemblyCount; assemblyIndex += 1) {{
  const assembly = assemblies.add(assemblyIndex * Process.pointerSize).readPointer();
  const image = assemblyGetImage(assembly);
  const imageNamePointer = imageGetName(image);
  const imageName = imageNamePointer.isNull() ? null : imageNamePointer.readUtf8String();
  for (const [className, methodNames] of Object.entries(targets)) {{
    const classPointer = classFromName(image, emptyNamespace, Memory.allocUtf8String(className));
    if (classPointer.isNull()) continue;
    for (const methodName of methodNames) {{
      const methodInfo = classGetMethodFromName(classPointer, Memory.allocUtf8String(methodName), -1);
      if (methodInfo.isNull()) {{
        results.push({{ image: imageName, class_name: className, method_name: methodName, status: 'missing' }});
        continue;
      }}
      const methodPointer = methodInfo.readPointer();
      results.push({{
        image: imageName,
        class_name: className,
        method_name: methodName,
        status: methodPointer.isNull() ? 'null-method-pointer' : 'resolved',
        method_info: methodInfo.toString(),
        method_pointer: methodPointer.toString(),
        rva: methodPointer.isNull() ? null : methodPointer.sub(module.base).toString(),
      }});
    }}
  }}
}}

send({{
  kind: 'runtime-method-resolution',
  module_base: module.base.toString(),
  module_size: module.size,
  assembly_count: assemblyCount,
  results,
}});
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve clock/scheduling method pointers through live IL2CPP metadata.")
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--device-serial")
    args = parser.parse_args()

    manager = frida.get_device_manager()
    device = manager.get_device(args.device_serial, timeout=10) if args.device_serial else frida.get_usb_device(timeout=10)
    session = device.attach(args.pid)
    script = session.create_script(create_agent())
    messages: list[dict[str, object]] = []

    def on_message(message: dict[str, object], data: bytes | None) -> None:
        messages.append(message)

    script.on("message", on_message)
    script.load()
    script.unload()
    session.detach()

    if not messages:
        raise RuntimeError("runtime method resolver returned no message")
    for message in messages:
        if message.get("type") == "error":
            raise RuntimeError(str(message.get("stack", message)))
        if message.get("type") == "send":
            print(json.dumps(message["payload"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
