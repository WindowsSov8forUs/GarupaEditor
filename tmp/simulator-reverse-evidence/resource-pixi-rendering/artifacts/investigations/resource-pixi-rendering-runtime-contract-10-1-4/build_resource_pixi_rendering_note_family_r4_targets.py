#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re
from pathlib import Path
from extract_resource_pixi_rendering_static_contract import load_elf,load_methods,next_address,read_va,write_disassembly
H=Path(__file__).resolve().parent;STATIC=H/'resource_pixi_rendering_static_contract.json';OUT=H/'resource_pixi_rendering_note_family_r4_targets.json';DUMP=H.parents[2]/'static/il2cpp/dump-10.1.4_230';BINARY=H.parents[2]/'samples/jp.co.craftegg.band/10.1.4_230/extracted/libil2cpp.so';ARM=H/'note-family-r4-arm64'
SPECS=(
 ('RPF-000','Combo','ExecUpdate',None),('RPF-001','NoteFlick','Activate',None),('RPF-002','NoteFlick','setupFlickIconSprite',None),('RPF-003','NoteDirectionalFlick','Activate',None),('RPF-004','NoteDirectionalFlick','setupFlickIconSprite',None),('RPF-005','NoteAfterBase','Activate',None),('RPF-006','NoteAfterBase','setupFlickIconSprite',None),
 ('RPF-007','NoteSlide','Activate',None),('RPF-008','NoteSlide','OnUpdate',None),('RPF-009','NoteSlide','MoveState',None),('RPF-010','NoteSlide','WaitState',None),('RPF-011','NoteSlide','StopState',None),('RPF-012','NoteSlide','ExecuteAfterUpdate',None),
 ('RPF-013','NoteMultipleDirectionalFlick','Activate',None),('RPF-014','NoteMultipleDirectionalFlick','Deactivate',None),('RPF-015','NoteMultipleDirectionalFlick','ConnectWithTheNextNote','0x30ECF1C'),('RPF-016','NoteMultipleDirectionalFlick','setupFlickAnimationIconVisibility',None),
 ('RPF-017','NoteAddLongMultipleDirectionalFlickVisual','Activate',None),('RPF-018','NoteAddLongMultipleDirectionalFlickVisual','ConnectWithTheNextNote','0x30E66A4'),('RPF-019','NoteAddLongMultipleDirectionalFlickVisual','setupFlickAnimationIconVisibility',None),('RPF-020','NoteAddSlideMultipleDirectionalFlickVisual','Activate',None),('RPF-021','NoteAddSlideMultipleDirectionalFlickVisual','ConnectWithTheNextNote','0x30E7FE8'),('RPF-022','NoteAddSlideMultipleDirectionalFlickVisual','setupFlickAnimationIconVisibility',None),
 ('RPF-023','NoteMultipleDirectionalFlickAfter','setupFlickIconSprite',None),('RPF-024','NoteMultipleDirectionalFlickAfter','setupFlickAnimationIconVisibility',None),('RPF-025','NoteMultipleDirectionalFlickBackLine','Setup',None),('RPF-026','NoteMultipleDirectionalFlickBackLine','OnUpdate',None),('RPF-027','NoteMultipleDirectionalFlickBackLine','Deactivate',None),('RPF-028','NoteMeshAdvanced','initMesh',None),('RPF-029','NoteMeshAdvanced','OnUpdate',None),
)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def main():
 d=json.loads(STATIC.read_text(encoding='utf-8'));_,by_name,by_address,addresses=load_methods(DUMP);binary,segments=load_elf(BINARY);ARM.mkdir(exist_ok=True);managed={a:sorted({r['Name'] for r in rows})[0] for a,rows in by_address.items()};out_rows=[]
 for target_id,owner,method,rva in SPECS:
  hits=[x for x in d['methods'] if x['owner']==owner and x['method']==method]
  if rva:hits=[x for x in hits if x['target_rva'].upper()==rva.upper()]
  if len(hits)==1:
   x=hits[0];out_rows.append({'target_id':target_id,'owner':owner,'method':method,'category':'note-family-r4','rva':x['target_rva'],'end_rva':x['target_end_rva'],'signature':x['signature'],'arm64_sha256':x['target_sha256'],'arm64_evidence':x['evidence']});continue
  direct=by_name.get(f'{owner}$${method}',[])
  if rva:direct=[x for x in direct if int(x['Address'])==int(rva,16)]
  assert len(direct)==1,(owner,method,rva,len(hits),len(direct));x=direct[0];start=int(x['Address']);end=next_address(addresses,start);code=read_va(binary,segments,start,end-start);name=f"{start:08x}__{re.sub(r'[^A-Za-z0-9_-]+','_',owner)}__{re.sub(r'[^A-Za-z0-9_-]+','_',method)}.arm64.tsv";write_disassembly(ARM/name,start,code,managed);out_rows.append({'target_id':target_id,'owner':owner,'method':method,'category':'note-family-r4','rva':f'0x{start:X}','end_rva':f'0x{end:X}','signature':x['Signature'],'arm64_sha256':hashlib.sha256(code).hexdigest().upper(),'arm64_evidence':f'note-family-r4-arm64/{name}'})
 out={'schema_version':1,'status':'confirmed-current-note-family-r4-observation-targets','sample':d['target'],'source_static_contract_sha256':sha(STATIC),'source_script_json_sha256':sha(DUMP/'script.json'),'source_libil2cpp_sha256':sha(BINARY),'observation_policy':{'return_replacement':False,'memory_writes':False,'managed_invocation':False,'raw_pointer_export':False,'display_string_export':False},'target_count':len(out_rows),'targets':out_rows,'unknown_fields':[]};OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print('built Note family R4 targets',len(out_rows))
if __name__=='__main__':main()
