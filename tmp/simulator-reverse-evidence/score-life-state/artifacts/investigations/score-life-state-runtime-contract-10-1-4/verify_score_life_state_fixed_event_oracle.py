#!/usr/bin/env python3
"""Independently verify the closed BS01-BS36 portable fixed-event oracle."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
from typing import Any
ROOT=Path(__file__).resolve().parent;ORACLE=ROOT/"score_life_state_fixed_event_oracle.json";STATUS=ROOT/"runtime_input_status.json"
LIB="815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F";META="298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
SOURCES={"static_contract":"score_life_state_static_contract.json","static_findings":"score_life_state_static_findings.json","ordinary_bms":"runtime-inputs/bms/poppin_shuffle_special.bms.txt","habahiro_bms":"runtime-inputs/bms/786_miracle_april_habahiro_special.bms.txt","no_input_r1":"runtime/no-input-retry-life-gameover.trace.json.gz","positive_r1":"runtime/positive-retry-all-lanes-early.trace.json.gz","skill_r1":"runtime/multitouch-seven-lane-native-skill.trace.json.gz","retry_r1":"runtime/multitouch-seven-lane-post-gameover-retry.trace.json.gz","chart_count":"score_life_state_chart_count_oracle.json","initialization_profile":"score_life_initialization_profile_oracle.json","deck_aggregate_profile":"score_life_deck_aggregate_profile_oracle.json","master_music_786_profile":"score_life_master_music_786_profile_oracle.json","ordinary_auto_skill_one_note":"score_life_ordinary_auto_skill_one_note_oracle.json","ordinary_auto_skill_effect_profile":"score_life_ordinary_auto_skill_effect_profile_oracle.json","rehearsal_pause_return_time":"score_life_rehearsal_pause_return_time_oracle.json","ordinary_auto_skill_playing_pause":"score_life_ordinary_auto_skill_playing_pause_oracle.json","ordinary_auto_skill_playing_retry_reset":"score_life_ordinary_auto_skill_playing_retry_reset_oracle.json","migrated_static":"score_life_state_migrated_static_oracle.json","portable_contract":"score_life_state_portable_contract.json","partial_baseline":"score_life_state_fixed_event_partial_baseline.json"}
def require(c:bool,m:str)->None:
 if not c:raise SystemExit(m)
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def load(name:str)->dict[str,Any]:return json.loads((ROOT/name).read_text(encoding="utf-8"))
def main()->int:
 o=load(ORACLE.name);portable=load(SOURCES["portable_contract"]);migrated=load(SOURCES["migrated_static"]);status=load(STATUS.name)
 require(o["status"]=="closed-10.1.4-fixed-event-oracle-portable-contract" and o["business_state_gate"]=="closed" and o["production_authorization"] is True,"oracle gate differs")
 require(o["sample"]=={"package":"jp.co.craftegg.band","version_name":"10.1.4","version_code":230,"abi":"arm64-v8a","libil2cpp_sha256":LIB,"global_metadata_sha256":META},"sample differs")
 require(set(o["evidence_catalog"])==set(SOURCES),"source set differs")
 for key,path in SOURCES.items():
  row=o["evidence_catalog"][key];require(row["path"]==path and row["bytes"]==(ROOT/path).stat().st_size and row["sha256"]==sha(ROOT/path),f"source differs: {key}")
 cases=o["cases"];ids=[f"BS{i:02d}" for i in range(1,37)];require([x["case_id"] for x in cases]==ids,"case order differs");by={x["case_id"]:x for x in cases};pc={x["case_id"]:x for x in portable["cases"]}
 for case in cases:
  require(case["status"]=="confirmed-portable" and case["unknown_fields"]==[] and case["blocking_findings"]==[],f"case open: {case['case_id']}")
  closure=case["expected_projection"]["portable_closure"];source=pc[case["case_id"]]
  require(closure=={"status":source["portable_status"],"field_dispositions":source["field_dispositions"],"unsupported_fields":source["unsupported_fields"]},f"portable closure differs: {case['case_id']}")
  require("SLS-S13" in case["evidence_ids"] and "SLS-PC-001" in case["evidence_ids"] and "migrated_static" in case["input_provenance"] and "portable_contract" in case["input_provenance"],f"closure provenance differs: {case['case_id']}")
 require(o["coverage"]=={"total_cases":36,"confirmed_cases":ids,"partial_cases":[],"blocked_cases":[],"unknown_field_count":0,"blocking_finding_count":0},"coverage differs")
 b1=by["BS01"]["expected_projection"];require(b1["production_chart_count"]["derived"]["max_note_count"]==979 and b1["observed_initialization_profile"]["score"]["base_score"]["bits"]=="0x4434718E" and b1["deck_aggregate"]["total_parameter"]["bits"]=="0x483C8A31","BS01 differs")
 b2=by["BS02"]["expected_projection"];require(b2["production_chart_count"]["derived"]["max_note_count"]==731 and b2["master_music_profile"]["free_live_score_level"]["resolved_score_level"]==26,"BS02 differs")
 require(by["BS03"]["expected_projection"]["observed_deck_aggregate"]["array_identity"]["length"]==5,"BS03 differs")
 require(by["BS05"]["expected_projection"]["result_correction"]["Perfect"]["bits_le"]=="CDCC8C3F" and by["BS06"]["expected_projection"]["combo_correction_ranges"][-1]["range"]=="combo > 700","BS05/06 differs")
 require(by["BS11"]["expected_projection"]["slot_capacity"]==5 and by["BS11"]["expected_projection"]["representative"].startswith("A strictly greater"),"BS11 differs")
 require(by["BS15"]["expected_projection"]["observed_base_damage_by_result"]=={"0":[-100],"1":[-50],"2":[0],"3":[0],"4":[0]},"BS15 differs")
 heal=by["BS19"]["expected_projection"]["observed_heal"];require((heal["before"],heal["delta"],heal["after"],heal["upper_limit"])==(800,300,1100,2000),"BS19 differs")
 require(by["BS22"]["expected_projection"]["states"]=={"none":0,"begin":1,"playing":2,"finishing":3,"final_none":0},"BS22 differs")
 b23=by["BS23"]["expected_projection"];require(b23["observed_skill_playing_pause"]["game_frame_delta"]==1 and b23["observed_playing_retry_reset"]["public_stop_count"]==0 and b23["observed_playing_retry_reset"]["process_finished_count"]==0,"BS23 differs")
 require(len(by["BS24"]["expected_projection"]["observed_ordered_effect_rows"])==5 and migrated["conclusions"]["active_effects"]["activate_effect_types"]["10"]=="score_under_great_half","BS24-28 differs")
 require(migrated["conclusions"]["skill_notes"]["difficulty_points"]["special"]=={"great":4,"perfect":4} and migrated["conclusions"]["fever_command"]["member_pass"]["minimum_point"]==80 and migrated["conclusions"]["fever_command"]["score_rate"]["FeverLevel_1"]==2.0,"BS29-32 differs")
 require(migrated["conclusions"]["special_combo"][0]=="ButtonType.None bypasses Auto Live and every mode-specific controller.","BS33/34 differs")
 continue_row=by["BS36"]["expected_projection"]["portable_closure"]["field_dispositions"]["lifecycle.continue"];require(continue_row["result"]=="evidence-required" and continue_row["mutation"]=="none","BS36 Continue differs")
 require(status["business_state_gate"]=="closed" and status["production_authorization"] is True and status["runtime"]["fixed_event_oracle"]["unknown_fields"]==0 and status["runtime"]["fixed_event_oracle"]["blocking_findings"]==0,"runtime status differs")
 print("verified fixed-event oracle: BS=36 confirmed-portable=36 unknown=0 blockers=0 gate=closed production=true")
 return 0
if __name__=="__main__":raise SystemExit(main())
