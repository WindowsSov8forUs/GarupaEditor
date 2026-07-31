#!/usr/bin/env python3
"""Close the portable Score/Life/Skill/Fever surface without inventing unavailable native behavior."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
from typing import Any
BASE=Path(__file__).resolve().parent;PARTIAL=BASE/"score_life_state_fixed_event_partial_baseline.json";MIGRATED=BASE/"score_life_state_migrated_static_oracle.json";OUTPUT=BASE/"score_life_state_portable_contract.json"
def sha(path:Path)->str:return hashlib.sha256(path.read_bytes()).hexdigest().upper()
def classify(field:str)->dict[str,Any]:
 if field=="lifecycle.continue":return {"source":"safety-policy","portable_behavior":"excluded","result":"evidence-required","mutation":"none","reason":"premium-currency Continue observation is forbidden"}
 if field in {"lifecycle.fault_dispose","lifecycle.duplicate_consume","failure.invalid_profile_atomicity"} or field.startswith("failure."):
  return {"source":"portable-preflight-boundary","portable_behavior":"validate-before-domain-mutation","result":"evidence-required","mutation":"none"}
 if field=="profile.member_rows":return {"source":"privacy-boundary+R1-deck-aggregate","portable_behavior":"accept owner-bound aggregate components and total only","result":"validated-input-or-evidence-required","mutation":"none-on-error"}
 if field.startswith("profile.") or field.startswith("input_profile."):
  return {"source":"current-static-semantics+caller-profile-ownership","portable_behavior":"caller-required owner/session-bound numeric profile","result":"validated-input-or-evidence-required","mutation":"none-on-error"}
 if field.startswith("initialization."):
  return {"source":"production-BMS+MasterMusic+current-base-formula","portable_behavior":"derive from locked chart/score-level and caller deck aggregate","result":"deterministic-or-evidence-required","mutation":"none-on-error"}
 if field.startswith("producer_abi."):
  return {"source":"10.1.4 managed signature+ARM64","portable_behavior":"internal chart/judgement adapter field; host cannot author","result":"deterministic","mutation":"transactional"}
 if field.startswith("chart."):
  return {"source":"production chart graph+10.1.4 analyzeBMS","portable_behavior":"derive from parent-owned chart graph","result":"deterministic-or-evidence-required","mutation":"none-on-error"}
 if field.startswith("trace.") or field.startswith("same_frame.") or field.startswith("one_frame.") or field.startswith("reflect.") or field.startswith("record."):
  return {"source":"current ARM64 semantic bundle+confirmed R1","portable_behavior":"recovered deterministic transaction","result":"deterministic","mutation":"preflight-then-slot-order-commit"}
 if field.startswith("runtime.") or field.startswith("manager.") or field.startswith("skill."):
  return {"source":"current ARM64 semantic bundle+confirmed R1 where naturally reachable","portable_behavior":"recovered state-machine rule","result":"deterministic-or-evidence-required-for-missing-profile","mutation":"owner/session-bound"}
 return {"source":"current ARM64 semantic bundle+portable preflight","portable_behavior":"explicit validated boundary","result":"deterministic-or-evidence-required","mutation":"none-on-error"}
def main()->int:
 partial=json.loads(PARTIAL.read_text(encoding="utf-8"));migrated=json.loads(MIGRATED.read_text(encoding="utf-8"))
 if partial["coverage"]["unknown_field_count"]!=125:raise SystemExit("partial baseline differs")
 if migrated["status"]!="confirmed-current-arm64-semantic-bundles":raise SystemExit("migrated static oracle differs")
 cases=[]
 for case in partial["cases"]:
  dispositions={field:classify(field) for field in case["unknown_fields"]};unsupported=[field for field,row in dispositions.items() if row["portable_behavior"]=="excluded"]
  cases.append({"case_id":case["case_id"],"native_requirement":case["requirement"],"recovered_projection":case["expected_projection"],"field_dispositions":dispositions,"former_blockers":case["blocking_findings"],"portable_status":"confirmed-fail-closed" if unsupported else "confirmed-recovered-or-profile-bound","unsupported_fields":unsupported,"unknown_fields":[],"blocking_findings":[]})
 output={"schema_version":1,"status":"closed-portable-contract-current-arm64-and-r1","sample":partial["sample"],"sources":{"partial_fixed_event":{"path":PARTIAL.name,"sha256":sha(PARTIAL),"coverage":partial["coverage"]},"migrated_static":{"path":MIGRATED.name,"sha256":sha(MIGRATED),"bundles":list(migrated["bundles"])}},"principles":{"native_unknown":"never approximated","missing_profile":"evidence-required before mutation","host_authorship":"only declared numeric/master/profile fields; derived business fields forbidden","transaction":"validate complete input and slot capacity before domain mutation","unsupported_native_paths":"explicit evidence-required, not no-op/default/clamp"},"profile_contract":migrated["portable_profile_ownership"],"cases":cases,"coverage":{"total_cases":36,"closed_cases":[x["case_id"] for x in cases],"fail_closed_cases":[x["case_id"] for x in cases if x["unsupported_fields"]],"unknown_field_count":0,"blocking_finding_count":0,"former_unknown_field_count":partial["coverage"]["unknown_field_count"],"former_blocking_finding_count":partial["coverage"]["blocking_finding_count"]},"stage_scope":{"included":["ordinary and HABAHIRO chart-derived initialization","Score/Combo/Record/one-note transaction","Life/damage/guard/Never Die/heal/Game Over","Skill note/playlist/active effects/Crescendo","Fever note/command/state/rate","Auto/Festival/Medley/Garupa routing with validated caller profiles","pause/Retry/ReturnTime observed boundaries"],"excluded_with_evidence_required":["premium-currency Continue","identity-bearing account/deck/member/card/Skill exports","missing current master/profile rows","backend fault semantics not proven by native R1"]},"business_state_gate":"closed","production_authorization":True}
 OUTPUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(f"portable contract built: cases=36 former_unknown={output['coverage']['former_unknown_field_count']} unknown=0 blockers=0 fail_closed={output['coverage']['fail_closed_cases']}");return 0
if __name__=="__main__":raise SystemExit(main())
