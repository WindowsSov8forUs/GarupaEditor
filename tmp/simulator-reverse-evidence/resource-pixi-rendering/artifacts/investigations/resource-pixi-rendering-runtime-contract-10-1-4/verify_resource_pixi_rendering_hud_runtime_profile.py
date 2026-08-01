#!/usr/bin/env python3
"""Verify compact current ordinary HUD/animation R1 implementation evidence."""
from __future__ import annotations
import hashlib,json,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;PROFILE=HERE/'resource_pixi_rendering_hud_runtime_profile.json';BUILDER=HERE/'build_resource_pixi_rendering_hud_runtime_profile.py'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def load(p):return json.loads(p.read_text(encoding='utf-8'),parse_constant=lambda v:(_ for _ in ()).throw(ValueError(v)))
def main():
 before=PROFILE.read_bytes();subprocess.run([sys.executable,str(BUILDER)],cwd=HERE.parents[2],check=True,capture_output=True);assert PROFILE.read_bytes()==before
 d=load(PROFILE);assert d['status']=='confirmed-current-ordinary-hud-runtime-semantic-profile' and d['unknown_fields']==[]
 assert d['coverage']=={'events':87364,'relative_frames':632,'hud_trace_events':28168,'hud_caller_entries':14084,'hud_animation_trace_events':2904,'hud_animation_caller_entries':1452}
 assert len(d['targets'])==23 and sum(r['observed'] for r in d['targets'])==18
 assert d['first_judged_order']==['RPH-040','RPH-036','RPH-037','RPH-042']
 assert d['life_heal_order']==[{'frame':129,'play_sequence':44520,'update_view_sequence':44522,'update_life_text_sequence':44523},{'frame':277,'play_sequence':64524,'update_view_sequence':64526,'update_life_text_sequence':64527}]
 assert d['authorization']=={'score_combo_result_life_semantic_commands':True,'life_heal_restart_before_life_update':True,'damage_guard_animation':False,'never_die_animation':False,'score_skill_animation':False,'judge_skill_animation':False,'mask_runtime_ordering':False,'pixi_animation_curve_sampling':False}
 for key,name in [('trace_sha256','runtime/ordinary-rendering-r1.trace.json.gz'),('hook_targets_sha256','resource_pixi_rendering_runtime_hook_targets.json'),('hud_asset_profiles_sha256','resource_pixi_rendering_hud_asset_profiles.json'),('skill_animation_profiles_sha256','resource_pixi_rendering_skill_animation_profiles.json')]:assert d['source'][key]==sha(HERE/name)
 print('verified current ordinary HUD runtime profile: hud=14084 animation=1452 heal=2 absent=5')
if __name__=='__main__':main()
