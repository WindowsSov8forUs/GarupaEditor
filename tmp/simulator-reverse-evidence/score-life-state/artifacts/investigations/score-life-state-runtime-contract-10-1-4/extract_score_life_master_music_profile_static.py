#!/usr/bin/env python3
"""Freeze minimal 10.1.4 master-music methods and layouts for B02 observation."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import struct
from typing import Any

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DUMP = ROOT / "static" / "il2cpp" / "dump-10.1.4_230"
SCRIPT = DUMP / "script.json"
DUMP_CS = DUMP / "dump.cs"
BINARY = ROOT / "samples" / "jp.co.craftegg.band" / "10.1.4_230" / "extracted" / "libil2cpp.so"
METADATA = ROOT / "samples" / "jp.co.craftegg.band" / "10.1.4_230" / "extracted" / "global-metadata.dat"
OUT = HERE / "master-profile-static"
METHODS = {
    "GetMasterMusic": ("CE.MasterDataManager$$GetMasterMusic", "uint32_t musicId", 0x3290F94),
    "GetMasterMusicList": ("CE.MasterDataManager$$GetMasterMusicList", "const MethodInfo* method", 0x32910BC),
    "GetMasterMusicDifficultyList.all": ("CE.MasterDataManager$$GetMasterMusicDifficultyList", "__this, const MethodInfo* method", 0x328B610),
    "GetMasterMusicDifficultyList.byId": ("CE.MasterDataManager$$GetMasterMusicDifficultyList", "uint32_t musicId", 0x328B634),
    "MusicData.GetPlayLevel": ("MusicData$$GetPlayLevel", "int32_t difficultyType", 0x340C764),
    "MusicData.GetScoreLevel": ("MusicData$$GetScoreLevel", "int32_t difficultyType", 0x340CAB0),
    "ScreenLayerMusicSelect.onClickMusicSelectButton": ("ScreenLayerMusicSelect$$onClickMusicSelectButton", "const MethodInfo* method", 0x3A1C83C),
}
LAYOUTS = {
    "CE.MasterMusicGetResponse": {
        "musicId": "0x10", "bandId": "0x60", "seq": "0x80", "publishedAt": "0x88",
        "closedAt": "0x90", "categorySetId": "0xB8",
    },
    "CE.MasterMusicDifficultyGetResponse": {
        "musicId": "0x10", "difficulty": "0x18", "playLevel": "0x20",
        "multiLiveScoreMap": "0x28", "notesQuantity": "0x30", "scoreS": "0x34",
        "scoreA": "0x38", "scoreB": "0x3C", "scoreC": "0x40", "scoreSS": "0x44",
        "publishedAt": "0x48", "enableSpecialNotes": "0x50", "scoreLevel": "0x54",
    },
    "CE.MasterMusicDifficultyListGetResponse": {"entries": "0x10"},
    "MusicData": {"difficultyDictionary": "0x30"},
}
EXPECTED_LIB = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
EXPECTED_METADATA = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def load_elf(path: Path) -> tuple[bytes, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    require(data[:5] == b"\x7fELF\x02", "target is not ELF64")
    phoff, = struct.unpack_from("<Q", data, 0x20)
    phentsize, phnum = struct.unpack_from("<HH", data, 0x36)
    segments = []
    for index in range(phnum):
        offset = phoff + index * phentsize
        if struct.unpack_from("<I", data, offset)[0] != 1:
            continue
        file_offset, virtual_address, _, file_size = struct.unpack_from("<QQQQ", data, offset + 8)
        segments.append((virtual_address, file_offset, file_size))
    return data, segments


def read_va(data: bytes, segments: list[tuple[int, int, int]], address: int, size: int) -> bytes:
    for virtual_address, file_offset, file_size in segments:
        if virtual_address <= address and address + size <= virtual_address + file_size:
            start = file_offset + address - virtual_address
            return data[start:start + size]
    raise SystemExit(f"ELF range is unavailable: 0x{address:X}+0x{size:X}")


def class_block(text: str, class_name: str) -> str:
    match = re.search(rf"public class {re.escape(class_name)}\b.*?(?=\n// Namespace:|\Z)", text, re.DOTALL)
    require(match is not None, f"class missing: {class_name}")
    return match.group(0)


def main() -> int:
    require(digest(BINARY) == EXPECTED_LIB, "target binary hash differs")
    require(digest(METADATA) == EXPECTED_METADATA, "target metadata hash differs")
    script = json.loads(SCRIPT.read_text(encoding="utf-8"))["ScriptMethod"]
    addresses = sorted({int(row["Address"]) for row in script})
    selected: dict[str, dict[str, Any]] = {}
    for key, (name, signature_fragment, expected_address) in METHODS.items():
        hits = [row for row in script if row["Name"] == name and signature_fragment in row.get("Signature", "")]
        require(len(hits) == 1, f"method selection differs: {key}")
        row = hits[0]
        require(int(row["Address"]) == expected_address, f"method RVA differs: {key}")
        end = next(address for address in addresses if address > expected_address)
        selected[key] = {
            "name": row["Name"], "signature": row["Signature"],
            "rva": f"0x{expected_address:X}", "end_rva": f"0x{end:X}", "size": end - expected_address,
        }
    dump_text = DUMP_CS.read_text(encoding="utf-8")
    blocks = {
        "CE.MasterMusicGetResponse": class_block(dump_text, "MasterMusicGetResponse"),
        "CE.MasterMusicDifficultyGetResponse": class_block(dump_text, "MasterMusicDifficultyGetResponse"),
        "CE.MasterMusicDifficultyListGetResponse": class_block(dump_text, "MasterMusicDifficultyListGetResponse"),
        "MusicData": class_block(dump_text, "MusicData"),
    }
    for owner, fields in LAYOUTS.items():
        block = blocks[owner]
        for field, offset in fields.items():
            pattern = rf"{re.escape(field)}; // {offset}\b" if owner == "MusicData" else rf"<{re.escape(field)}>k__BackingField; // {offset}\b"
            require(re.search(pattern, block) is not None, f"layout differs: {owner}.{field}")
    data, segments = load_elf(BINARY)
    disassembler = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
    OUT.mkdir(parents=True, exist_ok=True)
    arm64_dir = OUT / "arm64"
    arm64_dir.mkdir(exist_ok=True)
    for key, row in selected.items():
        start = int(row["rva"], 16)
        code = read_va(data, segments, start, row["size"])
        row["sha256"] = hashlib.sha256(code).hexdigest().upper()
        lines = ["address\tbytes\tinstruction"]
        for instruction in disassembler.disasm(code, start):
            lines.append(f"0x{instruction.address:X}\t{instruction.bytes.hex().upper()}\t{instruction.mnemonic} {instruction.op_str}".rstrip())
        filename = key.replace(".", "_") + ".arm64.tsv"
        (arm64_dir / filename).write_text("\n".join(lines) + "\n", encoding="utf-8")
        row["evidence"] = f"master-profile-static/arm64/{filename}"
    accessor_bytes = {
        "MasterMusicGetResponse.get_musicId": (0x58BD648, "ldr w0, [x0, #0x10]"),
        "MasterMusicDifficultyGetResponse.get_difficulty": (0x58BD8A8, "ldr x0, [x0, #0x18]"),
        "MasterMusicDifficultyGetResponse.get_playLevel": (0x58BD8B8, "ldr w0, [x0, #0x20]"),
        "MasterMusicDifficultyGetResponse.get_enableSpecialNotes": (0x58BD948, "ldrb w0, [x0, #0x50]"),
        "MasterMusicDifficultyGetResponse.get_scoreLevel": (0x58BD95C, "ldur x0, [x0, #0x54]"),
    }
    accessors = {}
    for name, (address, semantic) in accessor_bytes.items():
        raw = read_va(data, segments, address, 8)
        instruction = next(disassembler.disasm(raw, address))
        accessors[name] = {"rva": f"0x{address:X}", "bytes": raw.hex().upper(), "instruction": f"{instruction.mnemonic} {instruction.op_str}", "semantic": semantic}
    result = {
        "schema_version": 1,
        "status": "confirmed-static-10.1.4-master-music-profile-observation-targets",
        "sample": {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a", "libil2cpp_sha256": EXPECTED_LIB, "global_metadata_sha256": EXPECTED_METADATA},
        "source": {"script_sha256": digest(SCRIPT), "dump_cs_sha256": digest(DUMP_CS)},
        "methods": selected,
        "layouts": LAYOUTS,
        "accessors": accessors,
        "score_level_fallback": {
            "source": "MusicData.GetScoreLevel @ 0x340CAB0",
            "nullable_read": "LDUR X8, [row,#0x54] @ 0x340CB88",
            "has_value_test": "TST W8,#0xFF @ 0x340CB8C",
            "value_test": "LSR X8,#32 then CBZ @ 0x340CB98..0x340CB9C",
            "fallback": "MusicData.GetPlayLevel @ 0x340C764 when nullable is absent or zero",
            "play_level_read": "LDR W0,[row,#0x20] @ 0x340C818",
            "free_live_start_data_call": "BL MusicData.GetScoreLevel @ 0x3A1CA54",
            "free_live_start_data_store": "STR W0,[RhythmGameStartData,#0x70] @ 0x3A1CA5C"
        },
        "privacy_projection": {"allowed": ["musicId", "bandId", "seq", "publishedAt", "closedAt", "categorySetId", "difficulty", "playLevel", "notesQuantity", "score thresholds", "enableSpecialNotes", "scoreLevel raw bits"], "forbidden": ["musicTitle", "user identifiers", "room fields", "deck contents"]},
        "business_state_gate": "open",
        "production_authorization": False,
    }
    (OUT / "master_music_profile_static.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("extracted master music profile static: methods=7 layouts=4 accessors=5 fallback=playLevel start-data=0x70")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
