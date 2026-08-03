#!/usr/bin/env python3
"""Verify final R7 evidence authorization closure."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_final_r7_closure.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));assert d['status']=='final-r7-evidence-gate-closed';assert d['rendering_evidence_gate']=='closed' and d['production_authorization'] is True and d['production_consumption_claimed'] is False;assert d['unknown_fields']==[] and d['blocking_findings']==[]
 assert d['source']['delivery_closure_sha256']==sha(H/'delivery_closure.json');assert d['source']['final_r7_profile_sha256']==sha(H/'resource_pixi_rendering_final_r7_profile.json')
 ids=list(d['pr_cases']);assert ids==[f'PR{i:02d}' for i in range(1,41)];assert d['confirmed_case_count']==40;assert all(x['evidence_status'].startswith('confirmed-') and x['production_consumption_status']=='authorized-not-claimed-by-reverse' for x in d['pr_cases'].values());assert d['habahiro_exact_parity_gate']=='open-not-claimed' and d['habahiro_degraded_delivery_gate']=='closed'
 print('verified final R7 closure: PR=40 evidence=closed consumption=not-claimed blockers=0')
if __name__=='__main__':main()
