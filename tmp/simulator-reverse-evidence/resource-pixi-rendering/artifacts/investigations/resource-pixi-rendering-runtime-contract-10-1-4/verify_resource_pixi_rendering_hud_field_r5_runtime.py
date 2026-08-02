#!/usr/bin/env python3
from __future__ import annotations
import argparse,gzip,hashlib,json,re
from pathlib import Path
H=Path(__file__).resolve().parent;T=H/'resource_pixi_rendering_hud_field_r5_targets.json';S=H/'resource_pixi_rendering_hud_setter_targets.json';GROUPS={'core':{'frame','core'},'overlay':{'frame','overlay'},'field':{'frame','field'},'all':{'frame','core','overlay','field'}}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('trace',type=Path);ap.add_argument('--owner-group',required=True,choices=sorted(GROUPS));a=ap.parse_args();d=json.loads(gzip.decompress(a.trace.read_bytes()));t=json.loads(T.read_text(encoding='utf-8'));s=json.loads(S.read_text(encoding='utf-8'));assert d['status']=='confirmed-current-hud-field-r5-observation-only';assert d['owner_group']==a.owner_group;assert d['sample']=={'package':'jp.co.craftegg.band','version_name':'10.1.4','version_code':230,'abi':'arm64-v8a'};c=d['capture'];assert c['error'] is None and c['hook_failures']==[] and c['selinux']=='Enforcing';assert all(c[x] is False for x in ('return_replacement','memory_writes','managed_invocation','raw_pointer_export','display_string_export','synthetic_event_injection'));assert c['actions']['natural_live_started'] and c['actions']['post_start_attach_wait_completed'] and c['actions']['wait_completed'];assert d['source']['owner_targets_sha256']==sha(T) and d['source']['setter_targets_sha256']==sha(S)
 allowed={x['target_id'] for x in t['targets'] if x['owner_group'] in GROUPS[a.owner_group]};setters={x['target_id'] for x in s['targets']};events=d['events'];summary=d['summary'];assert summary['completion_requirements_met'] and summary['event_count']==len(events)>0 and summary['relative_frame_count']>0;assert summary['owner_enter_counts'].get('RPH5-000',0)>0;assert any(v>0 and k!='RPH5-000' for k,v in summary['owner_enter_counts'].items());assert [x['sequence'] for x in events]==list(range(len(events)))
 oa=re.compile(r'^owner-\d{4}$');ca=re.compile(r'^component-\d{4}$');tech=re.compile(r'^[A-Za-z0-9_#./+ -]{0,64}$')
 for e in events:
  assert e['owner_target_id'] in allowed and e['setter_id'] in setters;assert e['owner_object_alias'] is None or oa.fullmatch(e['owner_object_alias']);assert e['component_alias'] is None or ca.fullmatch(e['component_alias']);p=e['payload'];assert not any(isinstance(v,str) and ('0x' in v.lower() or '::' in v) for v in p.values());tv=p.get('technical_value');assert tv is None or tech.fullmatch(tv)
 print('verified HUD/field R5 runtime',a.owner_group,len(events),summary['relative_frame_count'],len(summary['owner_enter_counts']))
if __name__=='__main__':main()
