#!/usr/bin/env python3
"""Verify final R7 plan, pinned tools and complete remaining-PR coverage."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'runtime/resource-pixi-rendering-final-r7-plan.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));assert d['status']=='committed-before-capture-final-r7-plan';assert len(d['scenarios'])==9
 expected=['PR06','PR08','PR09','PR11','PR14','PR15','PR18','PR20','PR21','PR22','PR24','PR25','PR26','PR27','PR28','PR29','PR30','PR31','PR32','PR34','PR39'];assert d['remaining_pr_cases']==expected
 covered={p for s in d['scenarios'] for p in s['pr_cases']};assert covered==set(expected)
 assert len({s['id'] for s in d['scenarios']})==9
 for row in d['pinned_inputs'].values():assert sha(H/row['path'])==row['sha256']
 assert all(v is False for k,v in d['observation_policy'].items() if k not in {'os_ui_navigation_only'}) and d['observation_policy']['os_ui_navigation_only'] is True
 assert d['static_policy']['current_10_1_4_bytes_required'] is True;assert d['promotion_gate']['partial_trace_behavior']=='delete and never promote'
 print(f"verified final R7 plan: scenarios={len(d['scenarios'])} remaining={len(expected)} coverage=complete")
if __name__=='__main__':main()
