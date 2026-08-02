#!/usr/bin/env python3
from __future__ import annotations
import gzip,hashlib,json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent;TRACE=HERE/'runtime/ordinary-rendering-hud-r3.trace.json.gz';TARGETS=HERE/'resource_pixi_rendering_hud_setter_targets.json';OWNERS=HERE/'resource_pixi_rendering_runtime_hook_targets.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 assert TRACE.is_file(),'HUD R3 trace missing';d=json.loads(gzip.decompress(TRACE.read_bytes()));assert d['status']=='captured-current-ordinary-hud-r3-observation-only';assert d['source']=={'setter_targets_sha256':sha(TARGETS),'owner_targets_sha256':sha(OWNERS)};c=d['capture'];assert c['selinux']=='Enforcing' and c['transport']=='loopback-frida' and c['error'] is None and c['hook_failures']==[]
 for k in ('return_replacement','memory_writes','managed_invocation','raw_pointer_export','display_string_export'):assert c[k] is False
 events=d['events'];assert len(events)==d['summary']['event_count'] and [r['sequence'] for r in events]==list(range(len(events)));assert d['summary']['relative_frame_count']>0
 ids={r['target_id'] for r in json.loads(TARGETS.read_text(encoding='utf-8'))['targets']}
 for r in events:
  assert r['setter_id'] in ids and re.fullmatch(r'(owner|component)-[0-9]{4}',r['owner_object_alias'] or '') and re.fullmatch(r'(owner|component)-[0-9]{4}',r['component_alias'] or '')
  v=r['payload'].get('technical_value');assert v is None or re.fullmatch(r'[A-Za-z0-9_#./+ -]{0,64}',v)
 required={'RPHU-001','RPHU-002','RPHU-004','RPHU-005','RPHU-006','RPHU-007','RPHU-008','RPHU-015','RPHU-016','RPHU-017','RPHU-018','RPHU-020'};assert required<=set(d['summary']['setter_event_counts'])
 print('verified HUD R3 runtime:',len(events),'events',d['summary']['relative_frame_count'],'frames')
if __name__=='__main__':main()
