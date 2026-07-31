#!/usr/bin/env python3
"""Independently verify current-ARM64 migrated semantic bundles."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
BASE=Path(__file__).resolve().parent;INV=BASE.parent;O=BASE/"score_life_state_migrated_static_oracle.json";C=BASE/"score_life_state_static_contract.json"
def require(c:bool,m:str)->None:
 if not c:raise SystemExit(m)
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main()->int:
 o=json.loads(O.read_text(encoding="utf-8"));c=json.loads(C.read_text(encoding="utf-8"));rows={f"{m['owner']}.{m['method']}":m for m in c["methods"]}
 require(o["status"]=="confirmed-current-arm64-semantic-bundles" and len(o["bundles"])==8,"bundle status differs")
 require(sum(len(x["current_methods"]) for x in o["bundles"].values())==48,"method count differs")
 for guide in o["historical_guides"].values():require(sha(INV/guide["path"].removeprefix("artifacts/investigations/"))==guide["sha256"],f"historical hash differs: {guide['path']}")
 for bundle in o["bundles"].values():
  require(bundle["confirmation"]=="10.1.4 target ARM64 reviewed directly; historical bytes are a semantic guide only","confirmation differs")
  for method in bundle["current_methods"]:
   row=rows[method["managed_name"]];require(method["target_rva"]==row["target_rva"] and method["target_end_rva"]==row["target_end_rva"] and method["target_sha256"]==row["target_sha256"],f"method mapping differs: {method['managed_name']}")
   require(method["target_arm64_tsv"]==row["evidence"] and method["target_arm64_tsv_sha256"]==sha(BASE/row["evidence"]),f"ARM64 evidence differs: {method['managed_name']}")
   expected="exact-bytes" if row["baseline_sha256"]==row["target_sha256"] else ("pc-relative-only" if row["non_pc_relative_differing_words"]==0 else "target-arm64-reviewed")
   require(method["migration_class"]==expected,f"migration class differs: {method['managed_name']}")
 a=o["conclusions"]["active_effects"];require(a["activate_effect_types"]=={"0":"score","1":"damage","2":"heal","3":"judge","4":"score_over_life","5":"score_under_life","6":"score_continued_note_judge","7":"score_rate_up_with_perfect","8":"score_only_perfect","9":"never_die","10":"score_under_great_half"},"effect enum differs")
 require(a["damage"]["zero_rate_guard"]==1 and a["damage"]["never_die_guard"]==2 and a["damage"]["never_die_life"]==5,"damage effect differs")
 s=o["conclusions"]["skill_playback"];require(s["states"]=={"0":"None","1":"Begin","2":"Playing","3":"Finishing"} and s["finishing"]["seconds"]==0.75 and s["playing"]["frozen_game_states"]==[7,8],"Skill state differs")
 f=o["conclusions"]["fever_command"];require(f["states"]=={"0":"None","1":"FeverLevel_1","2":"FeverTimeFailed"} and f["commands"]=={"0":"None","1":"FeverReady","2":"FeverStart","3":"FeverEnd"} and f["member_pass"]["minimum_point"]==80 and f["score_rate"]["FeverLevel_1"]==2.0,"Fever command differs")
 n=o["conclusions"]["skill_notes"];require(n["difficulty_points"]["easy"]=={"great":20,"perfect":20} and n["difficulty_points"]["special"]=={"great":4,"perfect":4},"Fever point rows differ")
 require(o["conclusions"]["all_perfect"]=={"reset":1,"cleared_by_results":[0,1,2,3],"retained_by_perfect":4},"all-perfect differs")
 require(o["portable_profile_ownership"]["missing_or_invalid"]=="evidence-required before domain mutation" and o["production_authorization"] is False,"portable boundary differs")
 print("verified migrated static oracle: bundles=8 methods=48 effects=0..10 Skill=0/1/2/3 Fever=0/1/2 commands=0..3 profiles=caller-required")
 return 0
if __name__=="__main__":raise SystemExit(main())
