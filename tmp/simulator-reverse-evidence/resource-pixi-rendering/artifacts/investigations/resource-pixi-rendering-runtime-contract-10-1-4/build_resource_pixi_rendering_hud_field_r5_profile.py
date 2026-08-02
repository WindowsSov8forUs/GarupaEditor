#!/usr/bin/env python3
from __future__ import annotations
import argparse,gzip,hashlib,json
from collections import Counter,defaultdict
from pathlib import Path
H=Path(__file__).resolve().parent;T=H/'resource_pixi_rendering_hud_field_r5_targets.json';S=H/'resource_pixi_rendering_hud_setter_targets.json';OUT=H/'resource_pixi_rendering_hud_field_r5_profile.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--trace',action='append',required=True,help='group=path');ap.add_argument('--output',type=Path,default=OUT);a=ap.parse_args();traces={}
 for item in a.trace:
  group,path=item.split('=',1);p=Path(path);d=json.loads(gzip.decompress(p.read_bytes()));assert d['status']=='confirmed-current-hud-field-r5-observation-only' and d['owner_group']==group;traces[group]=(p,d)
 enters=Counter();pairs=Counter();values=defaultdict(set);coverage={}
 for group,(p,d) in sorted(traces.items()):
  enters.update(d['summary']['owner_enter_counts']);coverage[group]={'trace_sha256':sha(p),'event_count':len(d['events']),'relative_frame_count':d['summary']['relative_frame_count'],'owner_enter_counts':d['summary']['owner_enter_counts'],'setter_event_counts':d['summary']['setter_event_counts']}
  for e in d['events']:
   key=f"{e['owner_target_id']}/{e['setter_id']}";pairs[key]+=1
   payload=e['payload'];compact={k:v for k,v in payload.items() if k in {'technical_value','enabled','value_i32','state_hash','layer','normalized_time_f32_bits','value_f32_bits','color_f32_bits'}}
   if compact and len(values[key])<128:values[key].add(json.dumps(compact,sort_keys=True,separators=(',',':')))
 def owners(*ids):return all(enters[x]>0 for x in ids)
 def setter(owner,*ids):return any(pairs[f'{owner}/{x}']>0 for x in ids)
 auth={
  'add_score_round_robin_lifecycle':owners('RPH5-001','RPH5-002','RPH5-003') and setter('RPH5-003','RPHU-004','RPHU-005','RPHU-015','RPHU-018'),
  'result_show_change_hide_lifetime':owners('RPH5-004','RPH5-005','RPH5-006','RPH5-007') and setter('RPH5-005','RPHU-002'),
  'judge_timing_sprite_lifetime':owners('RPH5-008','RPH5-009') and setter('RPH5-009','RPHU-002'),
  'all_perfect_status_animation':owners('RPH5-010','RPH5-011','RPH5-012'),
  'score_skill_animation':owners('RPH5-013','RPH5-014') and setter('RPH5-013','RPHU-011','RPHU-018','RPHU-020'),
  'score_gauge_effect':owners('RPH5-015','RPH5-016'),
  'damage_guard_animation':owners('RPH5-017') and setter('RPH5-017','RPHU-011','RPHU-018','RPHU-020'),
  'never_die_animation':owners('RPH5-018') and setter('RPH5-018','RPHU-011','RPHU-018','RPHU-020'),
  'life_heal_animation':owners('RPH5-019'),
  'life_skill_start_finish':owners('RPH5-021','RPH5-022'),
  'warning_game_over_visual':owners('RPH5-023','RPH5-024') and (setter('RPH5-023','RPHU-004','RPHU-005') or setter('RPH5-024','RPHU-004','RPHU-005')),
  'generic_skill_display':owners('RPH5-025','RPH5-026'),
  'skill_changeable_text':owners('RPH5-027','RPH5-028','RPH5-029') and setter('RPH5-027','RPHU-001'),
  'ordinary_field_setup_sudden_lane':owners('RPH5-030','RPH5-031','RPH5-032','RPH5-033','RPH5-034') and any(k.startswith(('RPH5-031/','RPH5-032/','RPH5-033/','RPH5-034/')) for k in pairs),
 }
 out={'schema_version':1,'status':'confirmed-current-hud-field-r5-runtime-profile','sample':json.loads(T.read_text(encoding='utf-8'))['sample'],'source':{'targets_sha256':sha(T),'setter_targets_sha256':sha(S),'builder_sha256':sha(Path(__file__))},'coverage':coverage,'owner_enter_counts':dict(sorted(enters.items())),'owner_setter_counts':dict(sorted(pairs.items())),'portable_values':{k:[json.loads(x) for x in sorted(v)] for k,v in sorted(values.items())},'authorization':auth,'limits':[k for k,v in auth.items() if not v],'unknown_fields':[]}
 a.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print('built HUD/field R5 profile',len(traces),sum(enters.values()),sum(pairs.values()),sum(auth.values()),'authorized')
if __name__=='__main__':main()
