#!/usr/bin/env python3
"""Verify frozen master-music static slices and the natural-UI R1 plan."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PLAN = ROOT / "runtime" / "master-music-786-ui-list-r1-plan.json"
CAPTURE = ROOT / "capture_score_life_master_music_profile.py"
STATIC = ROOT / "master-profile-static" / "master_music_profile_static.json"
EXPECTED_METHODS = {
    "GetMasterMusic": "0x3290F94",
    "GetMasterMusicList": "0x32910BC",
    "GetMasterMusicDifficultyList.all": "0x328B610",
    "GetMasterMusicDifficultyList.byId": "0x328B634",
    "MusicData.GetPlayLevel": "0x340C764",
    "MusicData.GetScoreLevel": "0x340CAB0",
    "ScreenLayerMusicSelect.onClickMusicSelectButton": "0x3A1C83C",
}
EXPECTED_DIFFICULTY_LAYOUT = {
    "musicId": "0x10", "difficulty": "0x18", "playLevel": "0x20",
    "multiLiveScoreMap": "0x28", "notesQuantity": "0x30", "scoreS": "0x34",
    "scoreA": "0x38", "scoreB": "0x3C", "scoreC": "0x40", "scoreSS": "0x44",
    "publishedAt": "0x48", "enableSpecialNotes": "0x50", "scoreLevel": "0x54",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def main() -> int:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    static = json.loads(STATIC.read_text(encoding="utf-8"))
    source = CAPTURE.read_text(encoding="utf-8")
    require(static["schema_version"] == 1 and static["status"] == "confirmed-static-10.1.4-master-music-profile-observation-targets", "static status differs")
    require(static["sample"]["libil2cpp_sha256"] == "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F", "static binary differs")
    require(static["sample"]["global_metadata_sha256"] == "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F", "static metadata differs")
    require({key: row["rva"] for key, row in static["methods"].items()} == EXPECTED_METHODS, "method RVAs differ")
    require(static["layouts"]["CE.MasterMusicDifficultyGetResponse"] == EXPECTED_DIFFICULTY_LAYOUT, "difficulty layout differs")
    require(static["layouts"]["CE.MasterMusicGetResponse"] == {"musicId":"0x10","bandId":"0x60","seq":"0x80","publishedAt":"0x88","closedAt":"0x90","categorySetId":"0xB8"}, "music layout differs")
    require(static["layouts"]["CE.MasterMusicDifficultyListGetResponse"] == {"entries":"0x10"}, "difficulty response layout differs")
    require(static["layouts"]["MusicData"] == {"difficultyDictionary":"0x30"}, "MusicData layout differs")
    require(static["score_level_fallback"] == {
        "source":"MusicData.GetScoreLevel @ 0x340CAB0",
        "nullable_read":"LDUR X8, [row,#0x54] @ 0x340CB88",
        "has_value_test":"TST W8,#0xFF @ 0x340CB8C",
        "value_test":"LSR X8,#32 then CBZ @ 0x340CB98..0x340CB9C",
        "fallback":"MusicData.GetPlayLevel @ 0x340C764 when nullable is absent or zero",
        "play_level_read":"LDR W0,[row,#0x20] @ 0x340C818",
        "free_live_start_data_call":"BL MusicData.GetScoreLevel @ 0x3A1CA54",
        "free_live_start_data_store":"STR W0,[RhythmGameStartData,#0x70] @ 0x3A1CA5C",
    }, "score-level fallback differs")
    require(static["accessors"]["MasterMusicGetResponse.get_musicId"]["bytes"] == "001040B9C0035FD6", "musicId accessor differs")
    require(static["accessors"]["MasterMusicDifficultyGetResponse.get_difficulty"]["bytes"] == "000C40F9C0035FD6", "difficulty accessor differs")
    require(static["accessors"]["MasterMusicDifficultyGetResponse.get_playLevel"]["bytes"] == "002040B9C0035FD6", "playLevel accessor differs")
    require(static["accessors"]["MasterMusicDifficultyGetResponse.get_enableSpecialNotes"]["bytes"] == "00404139C0035FD6", "special-notes accessor differs")
    require(static["accessors"]["MasterMusicDifficultyGetResponse.get_scoreLevel"]["bytes"] == "004045F8C0035FD6", "scoreLevel accessor differs")
    for row in static["methods"].values():
        path = ROOT / row["evidence"]
        require(path.is_file() and path.read_text(encoding="utf-8").startswith("address\tbytes\tinstruction\n"), f"ARM64 artifact differs: {path.name}")
    require(plan["schema_version"] == 1 and plan["scenario_id"] == "master-music-786-natural-ui-list-r1", "plan identity differs")
    require(plan["target"] == {"music_id":786,"asset":"786_miracle_april_habahiro_special","bms_sha256":"43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159","availability":"limited-time chart is not selectable on this account outside its event window"}, "target identity differs")
    require(plan["privacy"] == {"music_title_allowed":False,"non_target_master_rows_allowed":False,"account_fields_allowed":False,"room_fields_allowed":False,"deck_contents_allowed":False}, "privacy differs")
    require(plan["safety"] == {"capability":"R1-observation-only","return_replacement":False,"memory_writes":False,"apk_modification":False,"managed_method_invocation":False,"continue_allowed":False,"premium_currency_actions":[]}, "safety differs")
    require(plan["actions"] == [
        {"kind":"tap","x":125,"y":50,"marker":"master-music-leave-current-song-list"},
        {"kind":"wait","delay_ms":2000,"marker":"master-music-live-selection-visible"},
        {"kind":"tap","x":950,"y":360,"marker":"master-music-reenter-free-live"},
        {"kind":"wait","delay_ms":7000,"marker":"master-music-observe-natural-list-calls"},
    ] and plan["tail_seconds"] == 2, "actions differ")
    require("Interceptor.attach" in source and "TARGET_MUSIC_ID = 786" in source, "capture target missing")
    for name, rva in EXPECTED_METHODS.items():
        if name.startswith("MusicData.") or name.startswith("ScreenLayerMusicSelect."):
            continue
        require(f'"MasterDataManager.{name}": {rva}' in source, f"capture RVA differs: {name}")
    for forbidden in ("Interceptor.replace", "retval.replace", "Memory.patchCode", "Memory.write", "NativeFunction(", ".writeU32(", ".writePointer("):
        require(forbidden not in source, f"capture contains forbidden operation: {forbidden}")
    require("all_non_target_master_rows" in source and "music_title" in source, "privacy omission declaration missing")
    require("musicTitle" not in source and "music_title:managedString" not in source, "music title projection present")
    print(f"verified master music profile plan: methods=7 layouts=4 actions=4 plan_sha256={digest(PLAN)} capture_sha256={digest(CAPTURE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
