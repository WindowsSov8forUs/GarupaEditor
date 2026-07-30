#!/usr/bin/env python3
"""Independently verify production chart counts against frozen facts and 10.1.4 ARM64."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
ORACLE = ROOT / "score_life_state_chart_count_oracle.json"
CHART_COMMIT = "74ab76f6838847d98aae1a15741a5f024e3774ff"
STATIC_COMMIT = "6c902656c72f3983fb04386038dcfe38f0d53797"
BMS_COMMIT = "1ee976ea1de24cb0567762a74e2d091ae4c78464"
ARM64_PATH = ROOT / "arm64/0377bef8__NoteManager__analyzeBMS.arm64.tsv"
EXPECTED = {
    "ordinary": {
        "facts": "chart-inputs/production_bms_validation.json",
        "facts_sha256": "081956FDB61263D84F6FDBC1DCDC5A93365B50F0032BE282EF8D42DD046BFF0A",
        "bms": "runtime-inputs/bms/poppin_shuffle_special.bms.txt",
        "bms_sha256": "418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC",
        "fields": ("slide_source_connection_nodes", "slide_source_hidden_nodes"),
        "inputs": (825, 29, 93, 298, 80),
        "derived": (825, 29, 125, 979),
    },
    "habahiro": {
        "facts": "chart-inputs/production_habahiro_bms_validation.json",
        "facts_sha256": "ECBAF86B547FED5426CD0A59F1D8401AB8A1E1714B78BF8EED974A923BCEE951",
        "bms": "runtime-inputs/bms/786_miracle_april_habahiro_special.bms.txt",
        "bms_sha256": "43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159",
        "fields": ("source_slide_connection_nodes", "source_slide_hidden_nodes"),
        "inputs": (598, 58, 51, 141, 15),
        "derived": (598, 58, 75, 731),
    },
}
EXPECTED_ARM64_LINES = {
    "0x377C1C0\t5F070031\tcmn w26, #1\t-",
    "0x377C1D8\t1F190071\tcmp w8, #6\t-",
    "0x377C1E0\t5F2F0071\tcmp w26, #0xb\t-",
    "0x377C1E8\t5F2B0071\tcmp w26, #0xa\t-",
    "0x377C2A4\t48130051\tsub w8, w26, #4\t-",
    "0x377C2D8\t085C4039\tldrb w8, [x0, #0x17]\t-",
    "0x377C2DC\tE8020035\tcbnz w8, #0x377c338\t-",
    "0x377C2FC\t9C070011\tadd w28, w28, #1\t-",
    "0x377C348\t5F070071\tcmp w26, #1\t-",
    "0x377C350\t9C070011\tadd w28, w28, #1\t-",
    "0x377C354\t9C070011\tadd w28, w28, #1\t-",
    "0x377C3DC\t1C2D00B9\tstr w28, [x8, #0x2c]\t-",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    oracle = load(ORACLE)
    require(oracle["schema_version"] == 1, "schema differs")
    require(oracle["status"] == "confirmed-production-chart-max-note-count-10.1.4-rule", "status differs")
    require(oracle["sample"] == {"package": "jp.co.craftegg.band", "version_name": "10.1.4", "version_code": 230, "abi": "arm64-v8a"}, "sample differs")
    require(oracle["provenance"]["chart_construction_commit"] == CHART_COMMIT, "chart commit differs")
    require(oracle["provenance"]["score_life_static_commit"] == STATIC_COMMIT, "static commit differs")
    require(oracle["provenance"]["production_bms_commit"] == BMS_COMMIT, "BMS commit differs")
    require(oracle["provenance"]["arm64_sha256"] == digest(ARM64_PATH) == "F2D61C63D285A4B6997183F51161FD0C4CEC848BE92D66D015432EC329F77F04", "ARM64 hash differs")
    arm64_lines = set(ARM64_PATH.read_text(encoding="utf-8").splitlines())
    require(EXPECTED_ARM64_LINES <= arm64_lines, "ARM64 count-rule lines differ")
    require(set(oracle["charts"]) == set(EXPECTED), "chart set differs")

    for kind, expected in EXPECTED.items():
        facts_path = ROOT / expected["facts"]
        bms_path = ROOT / expected["bms"]
        require(digest(facts_path) == expected["facts_sha256"], f"{kind} facts hash differs")
        require(digest(bms_path) == expected["bms_sha256"], f"{kind} BMS hash differs")
        facts = load(facts_path)
        runtime = facts["runtime_result"]
        require(facts["source"]["sha256"].upper() == expected["bms_sha256"], f"{kind} facts/BMS identity differs")
        node_field, hidden_field = expected["fields"]
        inputs = (
            runtime["playable_specs"],
            runtime["spec_kinds"]["long"],
            runtime["spec_kinds"]["slide"],
            runtime[node_field],
            runtime[hidden_field],
        )
        require(inputs == expected["inputs"], f"{kind} structure inputs differ")
        roots, long_tails, slide_roots, source_nodes, hidden_nodes = inputs
        visible_after = source_nodes - hidden_nodes - slide_roots
        derived = (roots, long_tails, visible_after, roots + long_tails + visible_after)
        require(derived == expected["derived"], f"{kind} independent derivation differs")
        row = oracle["charts"][kind]
        require(row["inputs"] == {
            "playable_roots": roots,
            "long_roots": long_tails,
            "slide_roots": slide_roots,
            "source_slide_nodes_including_roots": source_nodes,
            "source_hidden_slide_nodes": hidden_nodes,
        }, f"{kind} oracle inputs differ")
        require(row["derived"] == {
            "playable_root_entries": roots,
            "long_tail_entries": long_tails,
            "visible_slide_after_entries": visible_after,
            "max_note_count": derived[-1],
        }, f"{kind} oracle projection differs")
        require(row["unknown_fields"] == [] and row["blocking_findings"] == [], f"{kind} oracle retained blockers")

    require(oracle["unknown_fields"] == [] and oracle["blocking_findings"] == [], "oracle retained blockers")
    print("verified score/life chart count oracle: ordinary=979 HABAHIRO=731 rule=10.1.4 ARM64")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
