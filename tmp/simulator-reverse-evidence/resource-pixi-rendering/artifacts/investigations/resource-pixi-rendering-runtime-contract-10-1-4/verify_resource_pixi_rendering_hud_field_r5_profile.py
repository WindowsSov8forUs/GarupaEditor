#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_hud_field_r5_profile.json';T=H/'resource_pixi_rendering_hud_field_r5_targets.json';S=H/'resource_pixi_rendering_hud_setter_targets.json';B=H/'build_resource_pixi_rendering_hud_field_r5_profile.py'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--profile',type=Path,default=P);a=ap.parse_args();d=json.loads(a.profile.read_text(encoding='utf-8'));assert d['status']=='confirmed-current-hud-field-r5-runtime-profile';assert d['source']=={'targets_sha256':sha(T),'setter_targets_sha256':sha(S),'builder_sha256':sha(B)};assert d['unknown_fields']==[];assert all(type(v) is bool for v in d['authorization'].values());assert sorted(d['limits'])==sorted(k for k,v in d['authorization'].items() if not v);assert sum(x['event_count'] for x in d['coverage'].values())==sum(d['owner_setter_counts'].values())
 for key,rows in d['portable_values'].items():
  assert key in d['owner_setter_counts'] and len(rows)<=128
  assert not any('owner-' in json.dumps(x) or 'component-' in json.dumps(x) for x in rows)
 print('verified HUD/field R5 profile',len(d['coverage']),sum(d['authorization'].values()),'authorized')
if __name__=='__main__':main()
