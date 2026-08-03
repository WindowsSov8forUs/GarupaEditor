#!/usr/bin/env python3
"""Close the evidence/authorization gate for final R7 without claiming Garupa consumption."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;BASE=H/'delivery_closure.json';PROFILE=H/'resource_pixi_rendering_final_r7_profile.json';OUT=H/'resource_pixi_rendering_final_r7_closure.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def main():
 b=load(BASE);p=load(PROFILE);assert b['rendering_delivery_gate']=='closed' and b['production_authorization'] is True;assert p['status']=='confirmed-current-final-r7-completion-profile';remaining=set(p['remaining_pr_cases']);cases={}
 for i in range(1,41):
  case=f'PR{i:02d}'
  if case in {'PR04','PR19','PR40'}:status='confirmed-degraded'
  elif case in remaining:status='confirmed-current-r7'
  else:status='confirmed-current-r1-r6'
  cases[case]={'evidence_status':status,'production_consumption_status':'authorized-not-claimed-by-reverse'}
 out={'schema_version':1,'status':'final-r7-evidence-gate-closed','sample':p['sample'],'delivery_profile':'ordinary-exact-habahiro-degraded','source':{'delivery_closure_sha256':sha(BASE),'final_r7_profile_sha256':sha(PROFILE)},'rendering_evidence_gate':'closed','production_authorization':True,'production_consumption_claimed':False,'pr_cases':cases,'confirmed_case_count':40,'habahiro_exact_parity_gate':'open-not-claimed','habahiro_degraded_delivery_gate':'closed','unknown_fields':[],'blocking_findings':[]}
 OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print('built final R7 closure',len(cases))
if __name__=='__main__':main()
