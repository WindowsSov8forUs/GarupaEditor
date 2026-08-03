#!/usr/bin/env python3
"""Verify one retained final R7 trace without interpreting unobserved routes."""
from __future__ import annotations
import argparse,gzip,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;TARGETS=H/'resource_pixi_rendering_final_r7_targets.json';PLAN=H/'runtime/resource-pixi-rendering-final-r7-plan.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('trace',type=Path);a=ap.parse_args();d=json.loads(gzip.decompress(a.trace.read_bytes()));t=json.loads(TARGETS.read_text(encoding='utf-8'));p=json.loads(PLAN.read_text(encoding='utf-8'))
 assert d['status']=='confirmed-current-final-r7-observation-only';assert d['summary']['completion_requirements_met'] is True;assert all(d['sample'][k]==v for k,v in p['sample'].items());assert d['source']['targets_sha256']==sha(TARGETS);assert d['source']['capture_script_sha256']==sha(H/'capture_resource_pixi_rendering_final_r7.py')
 assert d['capture']['error'] is None and d['capture']['hook_failures']==[];assert all(v is False for v in d['privacy'].values());assert d['capture']['return_replacement'] is False and d['capture']['memory_writes'] is False and d['capture']['managed_invocation'] is False and d['capture']['synthetic_in_process_event_injection'] is False
 events=d['events'];assert len(events)==d['summary']['event_count']>0;assert [x['sequence'] for x in events]==list(range(len(events)));assert d['summary']['relative_frame_count']>0
 ids={x['target_id'] for x in t['targets']};assert all(x['owner_target_id'] in ids for x in events);assert all(x['frame']>=0 and x['owner_object_alias'] and x['component_alias'] for x in events)
 print(f"verified R7 trace: scenario={d['scenario_id']} group={d['owner_group']} events={len(events)} frames={d['summary']['relative_frame_count']}")
if __name__=='__main__':main()
