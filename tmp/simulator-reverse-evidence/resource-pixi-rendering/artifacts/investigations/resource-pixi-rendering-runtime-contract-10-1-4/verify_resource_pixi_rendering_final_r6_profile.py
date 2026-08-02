#!/usr/bin/env python3
"""Verify final R6 promoted traces and conservative authorization."""
from __future__ import annotations
import gzip,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_final_r6_profile.json'
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main()->None:
 d=json.loads(P.read_text(encoding='utf-8'));assert d['status']=='confirmed-current-final-r6-conservative-profile';assert d['unknown_fields']==[]
 assert d['source']['plan_sha256']==sha(H/'runtime/resource-pixi-rendering-final-r6-plan.json')
 total=frames=0;owners=set()
 for name,row in d['source']['traces'].items():
  p=H/row['path'];assert sha(p)==row['sha256'];t=json.loads(gzip.decompress(p.read_bytes()))
  assert t['status'].startswith('confirmed-current-') and t['summary']['completion_requirements_met'] is True
  assert not t['capture'].get('hook_failures') and not t['capture'].get('capture_error') and t['capture'].get('error') is None
  assert len(t['events'])==row['event_count']==t['summary']['event_count'];assert row['relative_frame_count']>0
  total+=row['event_count'];frames+=row['relative_frame_count'];owners.update(x['owner_target_id'] for x in t['events'])
 assert total==d['coverage']['event_count']==190401
 assert frames==d['coverage']['aggregate_relative_frame_count']==2492
 assert len(owners)==d['coverage']['observed_owner_target_count']==26
 a=d['authorization'];assert a['all_perfect_exec_update_active_gate'] is True
 for k in ['add_score_coroutine','judge_timing','guard','never_die','changeable_skill_text','field_early_setup','long_after_flick','add_long_multiple_side_visual','add_slide_multiple_side_visual','multiple_after_side_visual','advanced_mesh','threshold_shader_mapping','habahiro_exact']:
  assert a[k] is False,k
 print(f"verified final R6 profile: events={total} frames={frames} owners={len(owners)} conservative=false-routes-preserved")
if __name__=='__main__':main()
