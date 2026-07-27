#!/usr/bin/env python3
"""Re-derive the clock-scheduling target set for package version 10.1.4 / 230.

Reads the local-only inputs (both IL2CPP dumps and both `libil2cpp.so` files) and writes the
committed `version_map.json`. Four independent checks, each of which can fail the migration:

1. **Name resolution.** Every hook is re-found by `Owner$$Method` in the target dump, and its
   managed signature is compared with the baseline. A renamed, removed or re-signed method is
   reported rather than mapped.
2. **Probe instruction identity.** Each instruction probe sits at a fixed offset inside its owner.
   The owner's whole byte range is compared word by word between versions; the probe carries over
   only if the word at its offset is bit-identical. Differing words are classified as
   PC-relative (expected to change when code moves) or not.
3. **Field offsets.** Every field of the types the capture reads is compared between the two
   `dump.cs` files. One changed offset invalidates every snapshot the agent takes.
4. **`.rodata` constants.** Each constant is re-located by matching its surrounding bytes in the
   new binary and requiring a unique hit, so a coincidentally equal float cannot be mistaken for
   the right one.

Usage (from the repository root):

    py artifacts/investigations/package-version-rebaseline-10-1-4/extract_version_rebaseline.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

BASELINE = {
    "version_name": "10.1.3",
    "version_code": "229",
    "dump": ROOT / "static/il2cpp/dump",
    "binary": ROOT / "samples/jp.co.craftegg.band/10.1.3_229/extracted/libil2cpp.so",
}
TARGET = {
    "version_name": "10.1.4",
    "version_code": "230",
    "dump": ROOT / "static/il2cpp/dump-10.1.4_230",
    "binary": ROOT / "samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so",
}

CAPTURE = ROOT / "artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py"

LABEL_OVERRIDES = {
    "Application.set_targetFrameRate": "UnityEngine.Application$$set_targetFrameRate",
    "LiveEffectVolumeTabPage.onHighFrequencyModeChanged":
        "LiveEffectVolumeTabPage$$<initializeHighFrequencyMode>b__57_0",
    "LiveCoreSettingsProtoData.get_HighFrequencyMode":
        "CE.LiveCoreSettingsProtoData$$get_HighFrequencyMode",
    "LiveCoreSettingsProtoData.set_HighFrequencyMode":
        "CE.LiveCoreSettingsProtoData$$set_HighFrequencyMode",
}

# Types whose instance layout the capture agent reads directly.
LAYOUT_TYPES = [
    "NoteManager", "InGameMusicScoreController", "LiveCoreSettings", "NoteBpmChange",
    "InGameManager", "NoteBatchInformation", "NoteInformation", "NoteDataBMSBuilder",
]

CONTEXT_BYTES = 32


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def load_capture_tables() -> tuple[dict[str, int], dict[str, Any], dict[str, int]]:
    import importlib.util
    spec = importlib.util.spec_from_file_location("capture_module", CAPTURE)
    module = importlib.util.module_from_spec(spec)
    sys.modules["capture_module"] = module
    spec.loader.exec_module(module)
    return module.RVAS, module.PROBES, module.CONSTANT_RVAS


def load_methods(dump_dir: Path) -> dict[str, list[dict[str, Any]]]:
    script = json.loads((dump_dir / "script.json").read_text(encoding="utf-8"))
    index: dict[str, list[dict[str, Any]]] = {}
    for method in script["ScriptMethod"]:
        index.setdefault(method["Name"], []).append(method)
    return index


def dump_name(label: str) -> str:
    if label in LABEL_OVERRIDES:
        return LABEL_OVERRIDES[label]
    owner, _, method = label.rpartition(".")
    return f"{owner}$${method}"


def load_segments(path: Path) -> tuple[bytes, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    if data[:4] != b"\x7fELF" or data[4] != 2:
        raise SystemExit(f"not an ELF64 file: {path}")
    e_phoff, = struct.unpack_from("<Q", data, 0x20)
    e_phentsize, e_phnum = struct.unpack_from("<HH", data, 0x36)
    segments = []
    for index in range(e_phnum):
        offset = e_phoff + index * e_phentsize
        if struct.unpack_from("<I", data, offset)[0] != 1:  # PT_LOAD
            continue
        p_offset, p_vaddr, _, p_filesz = struct.unpack_from("<QQQQ", data, offset + 8)
        segments.append((p_vaddr, p_offset, p_filesz))
    return data, segments


def read_va(data: bytes, segments: list[tuple[int, int, int]], vaddr: int, size: int) -> bytes:
    for p_vaddr, p_offset, p_filesz in segments:
        if p_vaddr <= vaddr < p_vaddr + p_filesz:
            start = p_offset + (vaddr - p_vaddr)
            return data[start:start + size]
    raise KeyError(f"0x{vaddr:X} is outside every PT_LOAD segment")


def file_to_va(segments: list[tuple[int, int, int]], offset: int) -> int | None:
    for p_vaddr, p_offset, p_filesz in segments:
        if p_offset <= offset < p_offset + p_filesz:
            return p_vaddr + (offset - p_offset)
    return None


def pc_relative_kind(word: int) -> str | None:
    """ARM64 encodings whose immediate legitimately changes when code is relocated."""
    if (word & 0x7C000000) == 0x14000000:
        return "B/BL"
    if (word & 0x1F000000) == 0x10000000:
        return "ADR/ADRP"
    if (word & 0x7E000000) == 0x34000000:
        return "CBZ/CBNZ"
    if (word & 0x7E000000) == 0x36000000:
        return "TBZ/TBNZ"
    if (word & 0xFF000010) == 0x54000000:
        return "B.cond"
    if (word & 0x3B000000) == 0x18000000:
        return "LDR-literal"
    return None


def extract_field_offsets(dump_dir: Path) -> dict[str, dict[str, str]]:
    import re
    header = re.compile(r"^(?:public|internal|private|protected)?\s*(?:sealed\s+|abstract\s+|static\s+)*"
                        r"class\s+([A-Za-z0-9_.<>`]+)")
    field = re.compile(r";\s*//\s*(0x[0-9A-Fa-f]+)\s*$")
    result: dict[str, dict[str, str]] = {}
    current: str | None = None
    in_fields = False
    with (dump_dir / "dump.cs").open(encoding="utf-8", errors="replace") as source:
        for line in source:
            stripped = line.strip()
            match = header.match(stripped)
            if match:
                name = match.group(1)
                current = name if name in LAYOUT_TYPES else None
                in_fields = False
                continue
            if current is None:
                continue
            if stripped == "// Fields":
                in_fields = True
                continue
            if stripped.startswith("// "):
                in_fields = False
                continue
            if not in_fields:
                continue
            offset = field.search(stripped)
            if offset:
                result.setdefault(current, {})[stripped[:offset.start()].strip()] = offset.group(1)
    return result


def main() -> int:
    rvas, probes, constants = load_capture_tables()
    baseline_methods = load_methods(BASELINE["dump"])
    target_methods = load_methods(TARGET["dump"])
    baseline_data, baseline_segments = load_segments(BASELINE["binary"])
    target_data, target_segments = load_segments(TARGET["binary"])

    hook_rows = []
    for label, rva in sorted(rvas.items()):
        name = dump_name(label)
        base_hits = baseline_methods.get(name, [])
        target_hits = target_methods.get(name, [])
        row: dict[str, Any] = {"label": label, "dump_name": name,
                               "baseline_rva": f"0x{rva:X}", "status": "unresolved"}
        if len(base_hits) != 1 or base_hits[0]["Address"] != rva:
            row["status"] = "baseline-mismatch"
            hook_rows.append(row)
            continue
        if len(target_hits) != 1:
            row["status"] = "removed-or-ambiguous-in-target"
            row["target_candidates"] = [f"0x{hit['Address']:X}" for hit in target_hits]
            hook_rows.append(row)
            continue
        row["target_rva"] = f"0x{target_hits[0]['Address']:X}"
        row["rva_delta"] = target_hits[0]["Address"] - rva
        row["signature_unchanged"] = base_hits[0].get("Signature") == target_hits[0].get("Signature")
        row["status"] = "mapped" if row["signature_unchanged"] else "signature-changed"
        hook_rows.append(row)

    mapped = {row["label"]: int(row["target_rva"], 16)
              for row in hook_rows if row["status"] == "mapped"}
    baseline_by_rva = {rva: label for label, rva in rvas.items()}

    probe_rows = []
    owner_rows: dict[str, dict[str, Any]] = {}
    for label, entry in sorted(probes.items()):
        owner_start, owner_end = entry["owner_range"]
        owner_label = baseline_by_rva.get(owner_start)
        row: dict[str, Any] = {"label": label, "insn": entry["insn"],
                               "purpose": entry["purpose"],
                               "baseline_rva": f"0x{entry['rva']:X}",
                               "owner_label": owner_label,
                               "baseline_owner_range": [f"0x{owner_start:X}", f"0x{owner_end:X}"],
                               "offset_in_owner": f"0x{entry['rva'] - owner_start:X}"}
        if owner_label is None or owner_label not in mapped:
            row["status"] = "owner-unmapped"
            probe_rows.append(row)
            continue
        new_start = mapped[owner_label]
        end_label = baseline_by_rva.get(owner_end)
        new_end = mapped[end_label] if end_label in mapped else new_start + (owner_end - owner_start)
        size = owner_end - owner_start
        if owner_label not in owner_rows:
            old_bytes = read_va(baseline_data, baseline_segments, owner_start, size)
            new_bytes = read_va(target_data, target_segments, new_start, size)
            differing = []
            for offset in range(0, size, 4):
                word_old, = struct.unpack_from("<I", old_bytes, offset)
                word_new, = struct.unpack_from("<I", new_bytes, offset)
                if word_old != word_new:
                    differing.append({"offset": f"0x{offset:X}",
                                      "baseline_word": f"0x{word_old:08X}",
                                      "target_word": f"0x{word_new:08X}",
                                      "pc_relative": pc_relative_kind(word_old)})
            owner_rows[owner_label] = {
                "owner_label": owner_label,
                "baseline_start": f"0x{owner_start:X}",
                "target_start": f"0x{new_start:X}",
                "size": f"0x{size:X}",
                "differing_words": len(differing),
                "non_pc_relative_differing_words":
                    sum(1 for item in differing if item["pc_relative"] is None),
                "differing_word_detail": differing,
            }
        offset = entry["rva"] - owner_start
        word_old, = struct.unpack_from(
            "<I", read_va(baseline_data, baseline_segments, owner_start, size), offset)
        word_new, = struct.unpack_from(
            "<I", read_va(target_data, target_segments, new_start, size), offset)
        row["target_owner_range"] = [f"0x{new_start:X}", f"0x{new_end:X}"]
        row["target_rva"] = f"0x{new_start + offset:X}"
        row["baseline_word"] = f"0x{word_old:08X}"
        row["target_word"] = f"0x{word_new:08X}"
        row["instruction_identical"] = word_old == word_new
        row["status"] = "mapped" if word_old == word_new else "instruction-changed"
        probe_rows.append(row)

    constant_rows = []
    for name, rva in sorted(constants.items()):
        context = read_va(baseline_data, baseline_segments, rva - CONTEXT_BYTES,
                          CONTEXT_BYTES * 2 + 4)
        hits = []
        index = target_data.find(context)
        while index != -1 and len(hits) < 4:
            hits.append(index)
            index = target_data.find(context, index + 1)
        row: dict[str, Any] = {
            "name": name,
            "baseline_rva": f"0x{rva:X}",
            "baseline_bits": f"0x{struct.unpack('<I', read_va(baseline_data, baseline_segments, rva, 4))[0]:08X}",
            "baseline_float32": struct.unpack("<f", read_va(baseline_data, baseline_segments, rva, 4))[0],
            "context_bytes": CONTEXT_BYTES,
            "target_context_hits": len(hits),
        }
        if len(hits) != 1:
            row["status"] = "ambiguous" if hits else "not-found"
            constant_rows.append(row)
            continue
        target_va = file_to_va(target_segments, hits[0])
        if target_va is None:
            row["status"] = "outside-load-segment"
            constant_rows.append(row)
            continue
        target_va += CONTEXT_BYTES
        row["target_rva"] = f"0x{target_va:X}"
        row["rva_delta"] = target_va - rva
        row["target_bits"] = f"0x{struct.unpack('<I', read_va(target_data, target_segments, target_va, 4))[0]:08X}"
        row["bits_identical"] = row["target_bits"] == row["baseline_bits"]
        row["status"] = "mapped" if row["bits_identical"] else "value-changed"
        constant_rows.append(row)

    baseline_layout = extract_field_offsets(BASELINE["dump"])
    target_layout = extract_field_offsets(TARGET["dump"])
    layout_rows = []
    for type_name in LAYOUT_TYPES:
        old = baseline_layout.get(type_name, {})
        new = target_layout.get(type_name, {})
        changed = {key: {"baseline": value, "target": new.get(key)}
                   for key, value in old.items() if new.get(key) != value}
        layout_rows.append({
            "type": type_name,
            "baseline_field_count": len(old),
            "target_field_count": len(new),
            "changed_offsets": changed,
            "added_fields": sorted(set(new) - set(old)),
            "removed_fields": sorted(set(old) - set(new)),
            "status": "unchanged" if not changed and set(old) == set(new) else "changed",
        })

    result = {
        "schema_version": 1,
        "question": "Which addresses and offsets does the clock-scheduling capture need in "
                    "10.1.4 / 230, and does anything it depends on behave differently?",
        "baseline": {k: v for k, v in BASELINE.items() if k in ("version_name", "version_code")}
        | {"libil2cpp_sha256": digest(BASELINE["binary"])},
        "target": {k: v for k, v in TARGET.items() if k in ("version_name", "version_code")}
        | {"libil2cpp_sha256": digest(TARGET["binary"])},
        "hook_status_counts": _counts(hook_rows),
        "probe_status_counts": _counts(probe_rows),
        "constant_status_counts": _counts(constant_rows),
        "layout_status_counts": _counts(layout_rows),
        "hooks": hook_rows,
        "probe_owners": list(owner_rows.values()),
        "probes": probe_rows,
        "constants": constant_rows,
        "field_layout": layout_rows,
    }
    (HERE / "version_map.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"hooks {result['hook_status_counts']}")
    print(f"probes {result['probe_status_counts']}")
    print(f"constants {result['constant_status_counts']}")
    print(f"field layout {result['layout_status_counts']}")
    return 0


def _counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    return counts


if __name__ == "__main__":
    raise SystemExit(main())
