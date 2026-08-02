#!/usr/bin/env python3
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;P=H/'resource_pixi_rendering_note_family_r4_targets.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def code_sha(p):
 rows=p.read_text(encoding='utf-8').splitlines()[1:];return hashlib.sha256(b''.join(bytes.fromhex(row.split('\t')[1]) for row in rows)).hexdigest().upper()
def main():
 d=json.loads(P.read_text(encoding='utf-8'));assert d['status']=='confirmed-current-note-family-r4-observation-targets' and d['target_count']==len(d['targets'])==30;assert [x['target_id'] for x in d['targets']]==[f'RPF-{i:03d}' for i in range(30)];assert len({x['rva'] for x in d['targets']})==30
 for x in d['targets']:
  p=H/x['arm64_evidence'];assert p.is_file() and code_sha(p)==x['arm64_sha256']
 assert all(v is False for v in d['observation_policy'].values()) and d['unknown_fields']==[]
 print('verified Note family R4 targets:',len(d['targets']))
if __name__=='__main__':main()
