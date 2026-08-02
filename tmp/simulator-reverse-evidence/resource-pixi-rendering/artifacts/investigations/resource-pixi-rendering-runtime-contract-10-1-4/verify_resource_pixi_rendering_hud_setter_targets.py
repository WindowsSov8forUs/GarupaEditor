#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json
from pathlib import Path
from extract_resource_pixi_rendering_static_contract import load_elf,read_va
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];ELF=ROOT/'samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so';TARGETS=HERE/'resource_pixi_rendering_hud_setter_targets.json'
def tsv(p):
 rows=p.read_text(encoding='utf-8').splitlines();assert rows[0]=='address\tbytes\tinstruction\tresolved_target';return b''.join(bytes.fromhex(r.split('\t',3)[1]) for r in rows[1:] if r)
def main():
 d=json.loads(TARGETS.read_text(encoding='utf-8'));data,segs=load_elf(ELF);assert d['status']=='confirmed-current-hud-mask-animation-observation-targets' and len(d['targets'])==22 and d['unknown_fields']==[]
 for r in d['targets']:
  start=int(r['rva'],16);end=int(r['end_rva'],16);code=read_va(data,segs,start,end-start);assert hashlib.sha256(code).hexdigest().upper()==r['arm64_sha256'];assert code==tsv(HERE/r['evidence'])
 assert d['observation_policy']=={'return_replacement':False,'memory_writes':False,'managed_invocation':False,'raw_pointer_export':False,'display_string_export':False}
 print('verified HUD R3 targets: 22 observation-only')
if __name__=='__main__':main()
