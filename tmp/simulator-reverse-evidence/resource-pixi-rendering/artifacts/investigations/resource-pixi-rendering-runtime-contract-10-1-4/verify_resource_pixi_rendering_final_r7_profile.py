#!/usr/bin/env python3
"""Verify final R7 completion profile and all retained evidence."""
from __future__ import annotations
import gzip,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_final_r7_profile.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));assert d['status']=='confirmed-current-final-r7-completion-profile';assert d['unknown_fields']==[] and d['blocking_findings']==[]
 assert d['source']['plan_sha256']==sha(H/'runtime/resource-pixi-rendering-final-r7-plan.json');assert d['source']['targets_sha256']==sha(H/'resource_pixi_rendering_final_r7_targets.json');assert d['source']['static_profile_sha256']==sha(H/'resource_pixi_rendering_final_r7_static_profile.json')
 total=frames=0;owners=set();setters=set()
 for name,row in d['source']['traces'].items():
  p=H/row['path'];assert sha(p)==row['sha256'];t=json.loads(gzip.decompress(p.read_bytes()));assert t['status']=='confirmed-current-final-r7-observation-only' and t['summary']['completion_requirements_met'] is True;assert t['capture']['error'] is None and t['capture']['hook_failures']==[];assert all(v is False for v in t['privacy'].values());assert len(t['events'])==row['event_count'];assert t['summary']['relative_frame_count']==row['relative_frame_count']>0
  total+=len(t['events']);frames+=row['relative_frame_count'];owners.update(x['owner_target_id'] for x in t['events']);setters.update(x['setter_id'] for x in t['events'])
 assert total==d['coverage']['event_count']==625192;assert frames==d['coverage']['aggregate_relative_frame_count']==3480;assert len(owners)==d['coverage']['observed_owner_target_count']==51;assert len(setters)==d['coverage']['observed_setter_target_count']
 plan=json.loads((H/'runtime/resource-pixi-rendering-final-r7-plan.json').read_text(encoding='utf-8'));assert set(d['scenario_dispositions'])=={x['id'] for x in plan['scenarios']};assert all(x['disposition'].startswith('confirmed-') for x in d['scenario_dispositions'].values())
 assert list(d['remaining_pr_cases'])==plan['remaining_pr_cases'];assert len(d['remaining_pr_cases'])==21;assert all(x['status']=='confirmed-current-r7' for x in d['remaining_pr_cases'].values())
 assert d['authorization']['habahiro_exact'] is False and d['authorization']['habahiro_degraded'] is True;assert all(v is True for k,v in d['authorization'].items() if k!='habahiro_exact')
 assert d['portable_static']['advanced_mesh']['vertex_count']==42;assert d['portable_static']['shader']['alpha_keep_condition']=='threshold >= fragment_y';assert d['portable_static']['hud']['add_score']['pool_size']==4;assert d['portable_static']['hud']['life']['warning_condition']=='primary <= 0.25 and not damageGuardPlaying'
 print(f"verified final R7 profile: events={total} frames={frames} owners={len(owners)} setters={len(setters)} PR={len(d['remaining_pr_cases'])} blockers=0")
if __name__=='__main__':main()
