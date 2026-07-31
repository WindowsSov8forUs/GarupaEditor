#!/usr/bin/env python3
"""Independently verify final V01/D01-D24 closure."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
BASE=Path(__file__).resolve().parent;P=BASE/"closure.json"
def require(c:bool,m:str)->None:
 if not c:raise SystemExit(m)
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main()->int:
 o=json.loads(P.read_text(encoding="utf-8"));require(o["status"]=="closed-score-life-state-evidence-and-portable-contract","status differs")
 require(list(o["gates"])==["V01"]+[f"D{i:02d}" for i in range(1,25)] and all(x["status"]=="closed" and x["basis"] for x in o["gates"].values()),"gate closure differs")
 for name,row in o["sources"].items():require(row=={"sha256":sha(BASE/name),"bytes":(BASE/name).stat().st_size},f"source differs: {name}")
 require(o["fixed_event"]=={"cases":36,"confirmed_cases":[f"BS{i:02d}" for i in range(1,37)],"unknown_fields":0,"blocking_findings":0},"fixed event differs")
 require(o["native_unobserved_policy"]=={"continue":"evidence-required; zero mutation","missing_profile":"evidence-required before mutation","fault_dispose_duplicate":"portable preflight zero mutation; no invented native partial mutation","identity_exports":"forbidden"},"unknown policy differs")
 require(o["unknown_methods"]==[] and o["unknown_layouts"]==[] and o["unknown_fields"]==[] and o["blocking_findings"]==[],"unknowns remain")
 require(o["version_rebaseline"]=="closed" and o["business_state_gate"]=="closed" and o["production_authorization"] is True,"authorization differs")
 print("verified closure: V01+D01-D24=closed BS01-BS36=confirmed unknown=0 blockers=0 production=true")
 return 0
if __name__=="__main__":raise SystemExit(main())
