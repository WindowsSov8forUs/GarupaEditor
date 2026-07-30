#!/usr/bin/env python3
"""Independently verify the natural-UI music-786 master profile trace and oracle."""

from __future__ import annotations

from datetime import datetime, timezone
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
ORACLE = ROOT / "score_life_master_music_786_profile_oracle.json"
SOURCE_COMMIT = "8b5d7dfb1a4b26a686b7e0a9cfcf093cb37e5386"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def utc_from_bits(bits: str) -> str:
    value = int(bits, 16)
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def main() -> int:
    compressed = TRACE.read_bytes()
    raw = gzip.decompress(compressed)
    trace: dict[str, Any] = json.loads(raw)
    static: dict[str, Any] = json.loads(STATIC.read_text(encoding="utf-8"))
    oracle: dict[str, Any] = json.loads(ORACLE.read_text(encoding="utf-8"))
    require(gzip.compress(raw, compresslevel=9, mtime=0) == compressed, "trace gzip encoding differs")
    require(trace["status"] == "confirmed-r1-observation-only" and trace["capture_error"] is None, "trace status differs")
    require(trace["plan_sha256"] == digest(PLAN) and trace["capture_script_sha256"] == digest(CAPTURE), "trace hashes differ")
    require(trace["privacy"] == {"account_fields_included":False,"omitted":["music_title","user_id","room_fields","deck_contents","all_non_target_master_rows"]}, "trace privacy differs")
    require(all(event["sequence"] == index for index, event in enumerate(trace["events"])), "trace sequence gap")
    require(trace["summary"]["counts"] == {"capture.marker":5,"MasterDataManager.GetMasterMusicList.leave":1,"MasterDataManager.GetMasterMusicDifficultyList.byId.target":1}, "summary counts differ")
    require(len(trace["events"]) == 7, "event count differs")
    music_event = trace["events"][4]
    difficulty_event = trace["events"][5]
    require(music_event["kind"] == "MasterDataManager.GetMasterMusicList.leave" and music_event["music_list"]["length"] == 796, "music list event differs")
    require(len(music_event["music_list"]["matches"]) == 1, "music target match count differs")
    music = music_event["music_list"]["matches"][0]
    require({key: music[key] for key in ("music_id","band_id","seq","category_set_id")} == {"music_id":786,"band_id":107,"seq":9993,"category_set_id":0}, "music target values differ")
    require(music["strings_omitted"] is True, "music string omission differs")
    require(utc_from_bits(music["published_at_bits"]) == "2026-03-31T15:00:00.000Z", "published timestamp differs")
    require(utc_from_bits(music["closed_at_bits"]) == "2026-04-07T05:59:59.000Z", "closed timestamp differs")
    require(difficulty_event["kind"] == "MasterDataManager.GetMasterMusicDifficultyList.byId.target" and difficulty_event["music_id"] == 786, "difficulty target event differs")
    rows = difficulty_event["difficulty_list"]["matches"]
    require(difficulty_event["difficulty_list"]["size"] == 5 and len(rows) == 5, "difficulty size differs")
    levels = {row["difficulty"]: row["play_level"] for row in rows}
    require(levels == {"easy":7,"expert":25,"hard":20,"normal":13,"special":26}, "play levels differ")
    require(all(row["music_id"] == 786 and row["notes_quantity"] == 1000 for row in rows), "difficulty identity differs")
    require(all(row["score_s"] == 648000 and row["score_a"] == 432000 and row["score_b"] == 216000 and row["score_c"] == 36000 and row["score_ss"] == 864000 for row in rows), "score thresholds differ")
    require(all(row["score_level_raw_bits"] == "0x0000000000000000" for row in rows), "nullable score-level raw bits differ")
    special = next(row for row in rows if row["difficulty"] == "special")
    require(special["enable_special_notes"] == 1 and all(row["enable_special_notes"] == 0 for row in rows if row is not special), "special-notes flags differ")
    fallback = static["score_level_fallback"]
    require(static["methods"]["MusicData.GetScoreLevel"]["rva"] == "0x340CAB0", "GetScoreLevel RVA differs")
    require(static["methods"]["MusicData.GetPlayLevel"]["rva"] == "0x340C764", "GetPlayLevel RVA differs")
    require(fallback["nullable_read"].endswith("0x340CB88") and fallback["fallback"].startswith("MusicData.GetPlayLevel"), "fallback rule differs")
    require(fallback["free_live_start_data_call"].endswith("0x3A1CA54") and fallback["free_live_start_data_store"].endswith("0x3A1CA5C"), "free-live start-data chain differs")
    require(oracle["schema_version"] == 1 and oracle["source_commit"] == SOURCE_COMMIT, "oracle provenance differs")
    require(oracle["music"]["target"] == music, "oracle music differs")
    require(oracle["difficulty_profile"]["rows"] == rows, "oracle difficulty rows differ")
    require(oracle["free_live_score_level"]["nullable_has_value"] is False and oracle["free_live_score_level"]["resolved_score_level"] == 26, "oracle score level differs")
    require(oracle["unknown_fields"] == ["HABAHIRO.start_data_runtime","HABAHIRO.event_parameter","HABAHIRO.base_score_bits"], "oracle unknown fields differ")
    require(oracle["blocking_findings"] == ["D23-HABAHIRO-runtime-availability"], "oracle blocker differs")
    require(oracle["business_state_gate"] == "open" and oracle["production_authorization"] is False, "oracle gate differs")
    require(all(source["sha256"] == digest(ROOT / source["path"]) for source in oracle["sources"]), "oracle source hash differs")
    print("verified master music 786 R1: events=7 list=796 difficulties=5 special=26 closed=2026-04-07 privacy=target-only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
