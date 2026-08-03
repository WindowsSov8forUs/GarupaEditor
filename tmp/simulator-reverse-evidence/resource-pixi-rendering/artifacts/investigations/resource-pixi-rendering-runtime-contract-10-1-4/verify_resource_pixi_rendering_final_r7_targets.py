#!/usr/bin/env python3
"""Verify one-shot R7 owner targets against current ARM64 slices."""
from __future__ import annotations
import hashlib,json,re
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_final_r7_targets.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));assert d['status']=='committed-before-capture-final-r7-owner-targets';assert d['unknown_targets']==[]
 assert d['remaining_pr_cases']==['PR06','PR08','PR09','PR11','PR14','PR15','PR18','PR20','PR21','PR22','PR24','PR25','PR26','PR27','PR28','PR29','PR30','PR31','PR32','PR34','PR39']
 assert d['target_count']==len(d['targets'])==130;assert len({x['target_id'] for x in d['targets']})==130
 assert d['owner_group_counts']=={'note':73,'field':5,'hud-core':25,'hud-overlay':27}
 for i,x in enumerate(d['targets']):
  assert x['target_id']==f'R7O-{i:03d}';assert x['owner_group'] in d['owner_group_counts'];assert re.fullmatch(r'0x[0-9A-Fa-f]+',x['rva'])
  p=H/x['arm64_evidence'];assert p.is_file();assert sha(p)==x['arm64_tsv_sha256'],(x['target_id'],p)
  assert re.fullmatch(r'[0-9A-F]{64}',x['arm64_sha256'])
 for name,path in [('static_contract_sha256','resource_pixi_rendering_static_contract.json'),('runtime_hook_targets_sha256','resource_pixi_rendering_runtime_hook_targets.json'),('r4_targets_sha256','resource_pixi_rendering_note_family_r4_targets.json'),('r5_targets_sha256','resource_pixi_rendering_hud_field_r5_targets.json')]:assert d['source'][name]==sha(H/path)
 print(f"verified R7 owner targets: {d['target_count']} {d['owner_group_counts']}")
if __name__=='__main__':main()
