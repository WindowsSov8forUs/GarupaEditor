#!/usr/bin/env python3
"""Build byte-pinned current HUD/mask/animation setter targets for observation-only R3."""
from __future__ import annotations
import hashlib,json,re
from pathlib import Path
from extract_resource_pixi_rendering_static_contract import load_elf,load_methods,next_address,read_va,write_disassembly
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
DUMP=ROOT/'static/il2cpp/dump-10.1.4_230'
ELF=ROOT/'samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so'
OUT=HERE/'resource_pixi_rendering_hud_setter_targets.json'
ARM=HERE/'hud-setter-arm64'
SPECS=(
 ('RPHU-001','UILabel','set_text','technical-string'),
 ('RPHU-002','UISprite','set_spriteName','technical-string'),
 ('RPHU-003','UISlider','set_sliderValue','float-q0'),
 ('RPHU-004','UIWidget','set_color','color-q0-q3'),
 ('RPHU-005','UIWidget','set_alpha','float-q0'),
 ('RPHU-006','UIWidget','set_depth','int-arg1'),
 ('RPHU-007','UIWidget','set_width','int-arg1'),
 ('RPHU-008','UIWidget','set_height','int-arg1'),
 ('RPHU-009','UIWidget','set_pivot','int-arg1'),
 ('RPHU-010','NGUITools','SetActive','bool-arg1'),
 ('RPHU-011','UnityEngine.Animator','Play','animator-play-hash-layer-time'),
 ('RPHU-012','UnityEngine.Animator','set_speed','float-q0'),
 ('RPHU-013','UnityEngine.Renderer','set_sortingOrder','int-arg1'),
 ('RPHU-014','UnityEngine.SpriteRenderer','set_maskInteraction','int-arg1'),
 ('RPHU-015','UnityEngine.Transform','set_localPosition','vector3-q0-q2'),
 ('RPHU-016','UnityEngine.Transform','set_localScale','vector3-q0-q2'),
 ('RPHU-017','UIProgressBar','set_value','float-q0'),
 ('RPHU-018','UnityEngine.GameObject','SetActive','bool-arg1'),
 ('RPHU-019','UnityEngine.Animator','Play','animator-play-string-layer'),
 ('RPHU-020','UnityEngine.Animator','Play','animator-play-string-layer-time'),
 ('RPHU-021','UnityEngine.Animator','Play','animator-play-hash-layer'),
 ('RPHU-022','UnityEngine.Animator','Play','animator-play-hash'),
)
SPECIAL_BY_ID={
 'RPHU-010':0x3035B54,
 'RPHU-011':0x656C824,
 'RPHU-019':0x656D134,
 'RPHU-020':0x656D140,
 'RPHU-021':0x656D1E0,
 'RPHU-022':0x656D23C,
}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 _,by_name,by_addr,addresses=load_methods(DUMP);data,segs=load_elf(ELF);ARM.mkdir(exist_ok=True)
 names={a:sorted({r['Name'] for r in rows})[0] for a,rows in by_addr.items()};rows=[]
 for target_id,owner,method,kind in SPECS:
  managed=f'{owner}$${method}';hits=by_name.get(managed,[])
  if target_id in SPECIAL_BY_ID: hits=[r for r in hits if int(r['Address'])==SPECIAL_BY_ID[target_id]]
  assert len(hits)==1,(managed,len(hits));r=hits[0];start=int(r['Address']);end=next_address(addresses,start);code=read_va(data,segs,start,end-start)
  safe_owner=re.sub(r'[^A-Za-z0-9_-]+','_',owner);name=f'{start:08x}__{safe_owner}__{method}.arm64.tsv';write_disassembly(ARM/name,start,code,names)
  rows.append({'target_id':target_id,'owner':owner,'method':method,'managed_name':managed,'signature':r.get('Signature'),'rva':f'0x{start:X}','end_rva':f'0x{end:X}','arm64_sha256':hashlib.sha256(code).hexdigest().upper(),'evidence':f'hud-setter-arm64/{name}','payload_kind':kind})
 doc={'schema_version':1,'status':'confirmed-current-hud-mask-animation-observation-targets','sample':{'package':'jp.co.craftegg.band','version_name':'10.1.4','version_code':230,'abi':'arm64-v8a','libil2cpp_sha256':sha(ELF)},'observation_policy':{'return_replacement':False,'memory_writes':False,'managed_invocation':False,'raw_pointer_export':False,'display_string_export':False},'targets':rows,'unknown_fields':[]}
 OUT.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print('built HUD R3 targets',len(rows))
if __name__=='__main__':main()
