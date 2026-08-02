#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_hud_field_r5_targets.json';S=H/'resource_pixi_rendering_static_contract.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def code_sha(p):
 rows=p.read_text(encoding='utf-8').splitlines()[1:]
 return hashlib.sha256(b''.join(bytes.fromhex(row.split('\t')[1]) for row in rows)).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));s=json.loads(S.read_text(encoding='utf-8'));assert d['status']=='confirmed-current-hud-field-r5-observation-targets';assert d['source_static_contract_sha256']==sha(S);assert d['target_count']==35==len(d['targets']);assert d['unknown_fields']==[];assert all(v is False for v in d['observation_policy'].values());assert [x['target_id'] for x in d['targets']]==[f'RPH5-{i:03d}' for i in range(35)];assert {x['owner_group'] for x in d['targets']}=={'frame','core','overlay','field'}
 for x in d['targets']:
  hit=[m for m in s['methods'] if m['owner']==x['owner'] and m['method']==x['method'] and m['target_rva']==x['rva']];assert len(hit)==1;assert hit[0]['target_sha256']==x['arm64_sha256'];p=H/x['arm64_evidence'];assert p.is_file() and code_sha(p)==x['arm64_sha256']
 print('verified HUD/field R5 targets',len(d['targets']))
if __name__=='__main__':main()
