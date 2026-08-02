#!/usr/bin/env python3
"""Build the conservative final R6 authorization profile from promoted natural traces."""
from __future__ import annotations
import collections,gzip,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
PLAN=H/'runtime/resource-pixi-rendering-final-r6-plan.json'
BASE_R4=H/'resource_pixi_rendering_note_family_r4_profile.json'
BASE_R5=H/'resource_pixi_rendering_hud_field_r5_profile.json'
OUT=H/'resource_pixi_rendering_final_r6_profile.json'
TRACES={
 'flick':H/'runtime/ordinary-rendering-final-r6-flick-full.trace.json.gz',
 'slide':H/'runtime/ordinary-rendering-final-r6-slide-full.trace.json.gz',
 'multiple':H/'runtime/ordinary-rendering-final-r6-multiple-full.trace.json.gz',
 'hud_core':H/'runtime/ordinary-rendering-final-r6-hud-core-full.trace.json.gz',
 'hud_overlay':H/'runtime/ordinary-rendering-final-r6-hud-overlay-full.trace.json.gz',
}
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def load(p:Path):return json.loads(p.read_text(encoding='utf-8'))
def trace(p:Path):return json.loads(gzip.decompress(p.read_bytes()))
def main()->None:
 plan=load(PLAN);r4=load(BASE_R4);r5=load(BASE_R5);docs={k:trace(v) for k,v in TRACES.items()}
 assert plan['status']=='committed-before-capture-final-r6-plan'
 for k,d in docs.items():
  assert d['status'].startswith('confirmed-current-'),(k,d['status'])
  assert d['summary']['completion_requirements_met'] is True
  assert not d['capture'].get('hook_failures') and not d['capture'].get('capture_error') and d['capture'].get('error') is None
  assert d['summary']['event_count']==len(d['events']) and d['summary']['event_count']>0
 owner=collections.Counter();setter=collections.Counter();pairs=collections.Counter()
 for d in docs.values():
  for e in d['events']:
   owner[e['owner_target_id']]+=1;setter[e['setter_id']]+=1;pairs[(e['owner_target_id'],e['setter_id'])]+=1
 required={('RPF-004','RPFU-004'),('RPF-007','RPS-005'),('RPF-008','RPFU-003'),('RPF-013','RPFU-004'),('RPF-025','RPS-005'),('RPH5-010','RPHU-018'),('RPH5-006','RPHU-005'),('RPH5-013','RPHU-011'),('RPH5-025','RPHU-005')}
 assert all(pairs[x]>0 for x in required)
 auth={
  'ordinary_flick_directional_root_full_window':True,
  'ordinary_slide_base_chain_full_window':True,
  'ordinary_multiple_back_line_full_window':True,
  'result_show_change_hide':True,
  'score_skill_score_gauge_and_generic_skill_display':True,
  'all_perfect_exec_update_active_gate':True,
  'all_perfect_clip_sampling_from_static_profile':False,
  'add_score_coroutine':False,'judge_timing':False,'guard':False,'never_die':False,
  'changeable_skill_text':False,'field_early_setup':False,'long_after_flick':False,
  'add_long_multiple_side_visual':False,'add_slide_multiple_side_visual':False,
  'multiple_after_side_visual':False,'advanced_mesh':False,'threshold_shader_mapping':False,
  'habahiro_exact':False,
 }
 out={'schema_version':1,'status':'confirmed-current-final-r6-conservative-profile','sample':r5['sample'],
  'source':{'plan_sha256':sha(PLAN),'r4_profile_sha256':sha(BASE_R4),'r5_profile_sha256':sha(BASE_R5),
   'traces':{k:{'path':str(v.relative_to(H)).replace('\\','/'),'sha256':sha(v),'event_count':docs[k]['summary']['event_count'],'relative_frame_count':docs[k]['summary']['relative_frame_count']} for k,v in TRACES.items()}},
  'coverage':{'event_count':sum(d['summary']['event_count'] for d in docs.values()),'aggregate_relative_frame_count':sum(d['summary']['relative_frame_count'] for d in docs.values()),'observed_owner_target_count':len(owner),'observed_setter_target_count':len(setter),'owner_event_counts':dict(sorted(owner.items())),'owner_setter_counts':{f'{a}/{b}':n for (a,b),n in sorted(pairs.items())}},
  'authorization':auth,
  'limits':['R6 extends observation windows but promotes only newly corroborated positive routes.','All Perfect active gating is observed; its clip sampling remains false because no owner-correlated curve phase was captured.','The attempted early field trace produced no owner event and was deleted; field setup remains false.','Demo Live suppresses AddScore and does not naturally exercise Guard, Never Die or JudgeTiming.','Ordinary R6 does not authorize exact HABAHIRO.'],
  'inherited_profiles':{'r4_status':r4['status'],'r5_status':r5['status']},'unknown_fields':[]}
 OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
 print('built final R6 profile',out['coverage']['event_count'],out['coverage']['aggregate_relative_frame_count'],len(owner))
if __name__=='__main__':main()
