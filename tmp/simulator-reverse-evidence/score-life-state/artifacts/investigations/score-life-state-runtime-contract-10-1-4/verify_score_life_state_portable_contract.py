#!/usr/bin/env python3
"""Independently verify the fail-closed portable Score/Life/Skill/Fever contract."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
BASE=Path(__file__).resolve().parent;O=BASE/"score_life_state_portable_contract.json"
def require(c:bool,m:str)->None:
 if not c:raise SystemExit(m)
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main()->int:
 o=json.loads(O.read_text(encoding="utf-8"));require(o["status"]=="closed-portable-contract-current-arm64-and-r1","status differs")
 for source in o["sources"].values():require(sha(BASE/source["path"])==source["sha256"],f"source hash differs: {source['path']}")
 require(len(o["cases"])==36 and [x["case_id"] for x in o["cases"]]==[f"BS{i:02d}" for i in range(1,37)],"case order differs")
 fields=[]
 for case in o["cases"]:
  require(case["unknown_fields"]==[] and case["blocking_findings"]==[],f"case remains open: {case['case_id']}")
  fields.extend(case["field_dispositions"])
  for field,row in case["field_dispositions"].items():
   require(row["source"] and row["portable_behavior"] and row["result"] and row["mutation"],f"incomplete disposition: {case['case_id']} {field}")
 require(len(fields)==125 and len(fields)==o["coverage"]["former_unknown_field_count"],"former unknown coverage differs")
 require(o["coverage"]=={"total_cases":36,"closed_cases":[f"BS{i:02d}" for i in range(1,37)],"fail_closed_cases":["BS36"],"unknown_field_count":0,"blocking_finding_count":0,"former_unknown_field_count":125,"former_blocking_finding_count":82},"coverage differs")
 bs36=o["cases"][35];continue_row=bs36["field_dispositions"]["lifecycle.continue"]
 require(continue_row=={"source":"safety-policy","portable_behavior":"excluded","result":"evidence-required","mutation":"none","reason":"premium-currency Continue observation is forbidden"},"Continue boundary differs")
 require(bs36["field_dispositions"]["failure.invalid_profile_atomicity"]["mutation"]=="none" and bs36["field_dispositions"]["lifecycle.fault_dispose"]["result"]=="evidence-required","failure boundary differs")
 require(o["principles"]=={"native_unknown":"never approximated","missing_profile":"evidence-required before mutation","host_authorship":"only declared numeric/master/profile fields; derived business fields forbidden","transaction":"validate complete input and slot capacity before domain mutation","unsupported_native_paths":"explicit evidence-required, not no-op/default/clamp"},"principles differ")
 require(o["profile_contract"]["missing_or_invalid"]=="evidence-required before domain mutation","profile failure differs")
 require(o["business_state_gate"]=="closed" and o["production_authorization"] is True,"gate not closed")
 print("verified portable contract: BS=36 dispositions=125 unknown=0 blockers=0 Continue=evidence-required preflight=zero-mutation gate=closed")
 return 0
if __name__=="__main__":raise SystemExit(main())
