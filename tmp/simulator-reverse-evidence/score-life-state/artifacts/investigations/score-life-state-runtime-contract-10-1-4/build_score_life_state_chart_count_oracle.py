#!/usr/bin/env python3
"""Build production chart max-Note counts from frozen chart facts and 10.1.4 ARM64."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CHART_COMMIT = "74ab76f6838847d98aae1a15741a5f024e3774ff"
STATIC_COMMIT = "6c902656c72f3983fb04386038dcfe38f0d53797"
BMS_COMMIT = "1ee976ea1de24cb0567762a74e2d091ae4c78464"
ARM64_PATH = "arm64/0377bef8__NoteManager__analyzeBMS.arm64.tsv"
INPUTS = {
    "ordinary": {
        "facts": "chart-inputs/production_bms_validation.json",
        "bms": "runtime-inputs/bms/poppin_shuffle_special.bms.txt",
        "bms_sha256": "418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC",
        "slide_nodes_field": "slide_source_connection_nodes",
        "hidden_nodes_field": "slide_source_hidden_nodes",
        "expected": 979,
    },
    "habahiro": {
        "facts": "chart-inputs/production_habahiro_bms_validation.json",
        "bms": "runtime-inputs/bms/786_miracle_april_habahiro_special.bms.txt",
        "bms_sha256": "43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159",
        "slide_nodes_field": "source_slide_connection_nodes",
        "hidden_nodes_field": "source_slide_hidden_nodes",
        "expected": 731,
    },
}
ARM64_FRAGMENTS = [
    "0x377C1C0\t5F070031\tcmn w26, #1",
    "0x377C1D8\t1F190071\tcmp w8, #6",
    "0x377C1E0\t5F2F0071\tcmp w26, #0xb",
    "0x377C1E8\t5F2B0071\tcmp w26, #0xa",
    "0x377C2A4\t48130051\tsub w8, w26, #4",
    "0x377C2D8\t085C4039\tldrb w8, [x0, #0x17]",
    "0x377C2DC\tE8020035\tcbnz w8, #0x377c338",
    "0x377C2FC\t9C070011\tadd w28, w28, #1",
    "0x377C348\t5F070071\tcmp w26, #1",
    "0x377C350\t9C070011\tadd w28, w28, #1",
    "0x377C354\t9C070011\tadd w28, w28, #1",
    "0x377C3DC\t1C2D00B9\tstr w28, [x8, #0x2c]",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load(relative: str) -> dict[str, Any]:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def projection(kind: str, config: dict[str, Any]) -> dict[str, Any]:
    facts = load(config["facts"])
    runtime = facts["runtime_result"]
    require(digest(ROOT / config["bms"]) == config["bms_sha256"], f"{kind} BMS hash differs")
    require(facts["source"]["sha256"].upper() == config["bms_sha256"], f"{kind} chart/BMS identity differs")
    roots = runtime["playable_specs"]
    long_tails = runtime["spec_kinds"]["long"]
    slide_roots = runtime["spec_kinds"]["slide"]
    source_slide_nodes = runtime[config["slide_nodes_field"]]
    hidden_slide_nodes = runtime[config["hidden_nodes_field"]]
    visible_slide_after_nodes = source_slide_nodes - hidden_slide_nodes - slide_roots
    max_note_count = roots + long_tails + visible_slide_after_nodes
    require(visible_slide_after_nodes >= 0, f"{kind} visible Slide count is negative")
    require(max_note_count == config["expected"], f"{kind} independently derived max Note count differs")
    return {
        "bms": {
            "path": config["bms"],
            "bytes": (ROOT / config["bms"]).stat().st_size,
            "sha256": config["bms_sha256"],
            "source_commit": BMS_COMMIT,
        },
        "chart_facts": {
            "path": config["facts"],
            "bytes": (ROOT / config["facts"]).stat().st_size,
            "sha256": digest(ROOT / config["facts"]),
            "source_commit": CHART_COMMIT,
            "status": facts["status"],
        },
        "inputs": {
            "playable_roots": roots,
            "long_roots": long_tails,
            "slide_roots": slide_roots,
            "source_slide_nodes_including_roots": source_slide_nodes,
            "source_hidden_slide_nodes": hidden_slide_nodes,
        },
        "derived": {
            "playable_root_entries": roots,
            "long_tail_entries": long_tails,
            "visible_slide_after_entries": visible_slide_after_nodes,
            "max_note_count": max_note_count,
        },
        "formula": "playable_roots + long_roots + (source_slide_nodes_including_roots - source_hidden_slide_nodes - slide_roots)",
        "unknown_fields": [],
        "blocking_findings": [],
    }


def main() -> int:
    arm64 = (ROOT / ARM64_PATH).read_text(encoding="utf-8")
    require(all(fragment in arm64 for fragment in ARM64_FRAGMENTS), "10.1.4 analyzeBMS fragments differ")
    rows = {kind: projection(kind, config) for kind, config in INPUTS.items()}
    output = {
        "schema_version": 1,
        "status": "confirmed-production-chart-max-note-count-10.1.4-rule",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
        },
        "provenance": {
            "chart_construction_commit": CHART_COMMIT,
            "score_life_static_commit": STATIC_COMMIT,
            "production_bms_commit": BMS_COMMIT,
            "arm64_path": ARM64_PATH,
            "arm64_sha256": digest(ROOT / ARM64_PATH),
        },
        "count_rule": {
            "ordinary_root": "every retained playable root increments once",
            "long": "GameNoteType 1 increments once for its tail before the root increment",
            "slide": "GameNoteType 4/5 increments for each non-invisible slideNoteList member before the root increment",
            "directional_multi": "GameNoteType 10/11 adjacent-group guards share one root count",
            "final_store": "InGameRecord.maxNoteCount +0x2C",
            "arm64_fragments": ARM64_FRAGMENTS,
        },
        "charts": rows,
        "unknown_fields": [],
        "blocking_findings": [],
    }
    destination = ROOT / "score_life_state_chart_count_oracle.json"
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("score/life chart count oracle built: ordinary=979 HABAHIRO=731 unknown=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
