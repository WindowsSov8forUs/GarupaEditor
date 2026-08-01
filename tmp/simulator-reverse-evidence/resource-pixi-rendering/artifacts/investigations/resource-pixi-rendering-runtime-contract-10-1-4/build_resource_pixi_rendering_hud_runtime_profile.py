#!/usr/bin/env python3
"""Build the compact current ordinary HUD/animation R1 implementation profile."""
from __future__ import annotations
import gzip,hashlib,json
from collections import Counter
from pathlib import Path
HERE=Path(__file__).resolve().parent
TRACE=HERE/'runtime/ordinary-rendering-r1.trace.json.gz'
HOOKS=HERE/'resource_pixi_rendering_runtime_hook_targets.json'
STATIC=HERE/'resource_pixi_rendering_hud_asset_profiles.json'
SKILL=HERE/'resource_pixi_rendering_skill_animation_profiles.json'
OUT=HERE/'resource_pixi_rendering_hud_runtime_profile.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def main():
 with gzip.open(TRACE,'rt',encoding='utf-8') as f:trace=json.load(f)
 hooks=load(HOOKS);targets={r['target_id']:r for r in hooks['targets']}
 events=trace['events'];rows=[]
 for number in range(33,56):
  tid=f'RPH-{number:03d}';selected=[e for e in events if e['target_id']==tid];phases=Counter(e['phase'] for e in selected)
  rows.append({'target_id':tid,'owner':targets[tid]['owner'],'method':targets[tid]['method'],'category':targets[tid]['category'],'event_count':len(selected),'enter_count':phases['enter'],'leave_count':phases['leave'],'observed':bool(selected),'first_enter_sequence':next((e['sequence'] for e in selected if e['phase']=='enter'),None),'first_enter_frame':next((e['frame'] for e in selected if e['phase']=='enter'),None)})
 heal=[]
 for e in events:
  if e['target_id']!='RPH-049' or e['phase']!='enter':continue
  later=[x for x in events if x['frame']==e['frame'] and x['sequence']>e['sequence'] and x['phase']=='enter' and x['target_id'] in {'RPH-045','RPH-046'}]
  heal.append({'frame':e['frame'],'play_sequence':e['sequence'],'update_view_sequence':next((x['sequence'] for x in later if x['target_id']=='RPH-045'),None),'update_life_text_sequence':next((x['sequence'] for x in later if x['target_id']=='RPH-046'),None)})
 assert len(heal)==2 and all(r['play_sequence']<r['update_view_sequence']<r['update_life_text_sequence'] for r in heal)
 out={'schema_version':1,'status':'confirmed-current-ordinary-hud-runtime-semantic-profile','sample':trace['sample'],'source':{'trace_path':'runtime/ordinary-rendering-r1.trace.json.gz','trace_bytes':TRACE.stat().st_size,'trace_sha256':sha(TRACE),'hook_targets_sha256':sha(HOOKS),'hud_asset_profiles_sha256':sha(STATIC),'skill_animation_profiles_sha256':sha(SKILL)},'coverage':{'events':len(events),'relative_frames':trace['summary']['relative_frame_count'],'hud_trace_events':sum(r['event_count'] for r in rows if r['category']=='hud'),'hud_caller_entries':sum(r['enter_count'] for r in rows if r['category']=='hud'),'hud_animation_trace_events':sum(r['event_count'] for r in rows if r['category']=='hud-animation'),'hud_animation_caller_entries':sum(r['enter_count'] for r in rows if r['category']=='hud-animation')},'targets':rows,'first_judged_order':['RPH-040','RPH-036','RPH-037','RPH-042'],'life_heal_order':heal,'authorization':{'score_combo_result_life_semantic_commands':True,'life_heal_restart_before_life_update':True,'damage_guard_animation':False,'never_die_animation':False,'score_skill_animation':False,'judge_skill_animation':False,'mask_runtime_ordering':False,'pixi_animation_curve_sampling':False},'boundary':'Only R1-observed ordinary semantic caller order is authorized. Static-only absent animation routes, mask ordering and Pixi curve sampling remain fail-closed.','unknown_fields':[]}
 OUT.write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8',newline='\n');print(f'wrote {OUT}: targets={len(rows)} heal={len(heal)}')
if __name__=='__main__':main()
