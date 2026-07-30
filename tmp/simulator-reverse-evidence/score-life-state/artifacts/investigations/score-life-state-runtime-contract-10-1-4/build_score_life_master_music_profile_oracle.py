#!/usr/bin/env python3
"""Build the music-786 privacy-safe master profile oracle from natural UI calls."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
TRACE = ROOT / "runtime" / "master-music-786-ui-list.trace.json.gz"
PLAN = ROOT / "runtime" / "master-music-786-ui-list-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_master_music_profile.py"
STATIC = ROOT / "master-profile-static" / "master_music_profile_static.json"
BMS = ROOT / "runtime-inputs" / "bms" / "786_miracle_april_habahiro_special.bms.txt"
OUTPUT = ROOT / "score_life_master_music_786_profile_oracle.json"
SOURCE_COMMIT = "8b5d7dfb1a4b26a686b7e0a9cfcf093cb37e5386"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def main() -> int:
    trace: dict[str, Any] = json.loads(gzip.decompress(TRACE.read_bytes()))
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    static = json.loads(STATIC.read_text(encoding="utf-8"))
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace status differs")
    require(trace["plan_sha256"] == digest(PLAN) and trace["capture_script_sha256"] == digest(CAPTURE), "trace source hash differs")
    require(trace["scenario"]["target"]["music_id"] == 786 and digest(BMS) == trace["scenario"]["target"]["bms_sha256"], "target BMS differs")
    require(static["score_level_fallback"]["free_live_start_data_store"].endswith("0x3A1CA5C"), "start-data score-level source differs")
    events = trace["events"]
    music_event = next(event for event in events if event["kind"] == "MasterDataManager.GetMasterMusicList.leave")
    difficulty_event = next(event for event in events if event["kind"] == "MasterDataManager.GetMasterMusicDifficultyList.byId.target")
    music_matches = music_event["music_list"]["matches"]
    rows = difficulty_event["difficulty_list"]["matches"]
    require(music_event["music_list"]["length"] == 796 and len(music_matches) == 1, "music list target differs")
    require(difficulty_event["difficulty_list"]["size"] == 5 and len(rows) == 5, "difficulty list target differs")
    require({row["difficulty"] for row in rows} == {"easy", "normal", "hard", "expert", "special"}, "difficulty set differs")
    require(all(row["score_level_raw_bits"] == "0x0000000000000000" for row in rows), "nullable score-level bits differ")
    special = next(row for row in rows if row["difficulty"] == "special")
    require(special["play_level"] == 26 and special["enable_special_notes"] == 1, "SPECIAL master row differs")
    sources = []
    for path in (TRACE, PLAN, CAPTURE, STATIC, BMS):
        sources.append({"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)})
    result = {
        "schema_version": 1,
        "status": "confirmed-r1-master-music-786-profile-partial-runtime-availability",
        "source_commit": SOURCE_COMMIT,
        "sample": trace["sample"],
        "sources": sources,
        "privacy": trace["privacy"],
        "music": {
            "list_length": music_event["music_list"]["length"],
            "target": music_matches[0],
            "published_at_utc": "2026-03-31T15:00:00.000Z",
            "closed_at_utc": "2026-04-07T05:59:59.000Z",
            "selectable_at_capture": False,
            "availability_reason": plan["target"]["availability"],
        },
        "difficulty_profile": {
            "list_size": difficulty_event["difficulty_list"]["size"],
            "rows": rows,
            "special": special,
        },
        "free_live_score_level": {
            "difficulty": "special",
            "nullable_score_level_raw_bits": special["score_level_raw_bits"],
            "nullable_has_value": False,
            "fallback_play_level": special["play_level"],
            "resolved_score_level": 26,
            "static_rule": static["score_level_fallback"],
        },
        "unknown_fields": ["HABAHIRO.start_data_runtime", "HABAHIRO.event_parameter", "HABAHIRO.base_score_bits"],
        "blocking_findings": ["D23-HABAHIRO-runtime-availability"],
        "business_state_gate": "open",
        "production_authorization": False,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("built master music 786 profile: list=796 difficulties=5 special=26 availability=closed unknown=3")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
