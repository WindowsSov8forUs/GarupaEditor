#!/usr/bin/env python3
"""Build the one-shot R7 owner inventory for all remaining PR06-PR39 routes."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
STATIC=H/'resource_pixi_rendering_static_contract.json'
RPH=H/'resource_pixi_rendering_runtime_hook_targets.json'
R4=H/'resource_pixi_rendering_note_family_r4_targets.json'
R5=H/'resource_pixi_rendering_hud_field_r5_targets.json'
OUT=H/'resource_pixi_rendering_final_r7_targets.json'
REMAINING=['PR06','PR08','PR09','PR11','PR14','PR15','PR18','PR20','PR21','PR22','PR24','PR25','PR26','PR27','PR28','PR29','PR30','PR31','PR32','PR34','PR39']
EXTRAS={
 'NoteBase':['ChangeState','Deactivate','ResetNote','SetSpriteEnabled','setFlickIconSpriteEnabled','setupSkillNote'],
 'NoteFrontBase':['Activate','Deactivate','MoveState','WaitState','StopState'],
 'NoteAfterBase':['Deactivate','KillMesh','MoveState','OnUpdate','WaitState','StopState'],
 'NoteMesh':['CreateInstances','initMesh','Activate','OnUpdate','Deactivate','ResetNote','SetMaterial'],
 'NoteMeshAdvanced':['InitVertices','initMesh','OnUpdate'],
 'Combo':['ExecUpdate','Hide','Reset'], 'ComboNumber':['Show','Hide','ResetComboNumber','showCoroutine'],
 'AllPerfectStatusAnimation':['ExecUpdate','Hide','Reset','ResetComboNumber'],
 'Score':['UpdateTotalScore','UpdateView','UpdateScoreGauge','onPlaySkill','onFinishSkill','playSkillEffectScoreUpAnimation','stopSkillEffectScoreUpAnimation'],
 'AddScoreManager':['Play','searchOldestAddScoreObject'], 'AddScoreObject':['Play','BackDepth','ReadyForUse','setAlpha'],
 'AddScoreObject.<playCoroutine>d__11':['MoveNext'], 'CE.Result':['Show','changeSprite','Hide'],
 'JudgeTimingController':['Show','setupJudgeTimingSprite'],
 'InGameLifeGauge':['UpdateView','updateLifeText','updateGaugeColor','updateWarningGaugeBlink','changeLifeGaugeBaseColorWhenGameOver','onPlaySkill','onFinishSkill','playSkillEffectDamageGuardAnimation','playSkillEffectNeverDieAnimation','playSkillEffectLifeHealAnimation','stopSkillEffectAnimation'],
 'InGameSkillEffectDisplay':['Play','Off'], 'SkillEffectChangeableTextObject':['Play','SetActive','SetLabelDepth'],
 'ScoreGaugeEffect':['On','Off'],
 'ButtonManager':['ExecAwakeStart','setupPlayButtons','SetupSudden','changeLaneImage','execMultiResolution','Pause','onPlaySkill','onFinishSkill','OnGameClear'],
}
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def group(owner,method):
 if owner=='ButtonManager' and method in {'ExecAwakeStart','setupPlayButtons','SetupSudden','changeLaneImage','execMultiResolution'}:return 'field'
 if owner.startswith('Note') or owner=='Combo' and method=='ExecUpdate':return 'note'
 if owner in {'Score','Combo','ComboNumber','AllPerfectStatusAnimation','AddScoreManager','AddScoreObject','AddScoreObject.<playCoroutine>d__11','CE.Result','JudgeTimingController'} and not (owner=='Score' and ('Skill' in method or method in {'onPlaySkill','onFinishSkill'})):return 'hud-core'
 return 'hud-overlay'
def normalize(row,source):
 return {'source_id':row.get('target_id'),'source':source,'owner':row['owner'],'method':row['method'],'signature':row['signature'],'rva':row.get('rva') or row['target_rva'],'end_rva':row.get('end_rva') or row.get('target_end_rva'),'arm64_sha256':row.get('arm64_sha256') or row.get('target_sha256'),'arm64_evidence':row['arm64_evidence'] if 'arm64_evidence' in row else row['evidence']}
def main():
 docs=[(load(RPH)['targets'],'runtime-hook'),(load(R4)['targets'],'note-r4'),(load(R5)['targets'],'hud-r5')]
 rows=[];seen=set()
 for source_rows,source in docs:
  for raw in source_rows:
   row=normalize(raw,source);key=(row['owner'],row['method'],row['rva'])
   if key not in seen:seen.add(key);rows.append(row)
 static=load(STATIC);index={(x['owner'],x['method']):x for x in static['methods'] if x['status']=='mapped'}
 for owner,methods in EXTRAS.items():
  for method in methods:
   raw=index[(owner,method)];row=normalize(raw,'static-extra');key=(row['owner'],row['method'],row['rva'])
   if key not in seen:seen.add(key);rows.append(row)
 rows.sort(key=lambda x:(group(x['owner'],x['method']),x['owner'],x['method'],int(x['rva'],16)))
 targets=[]
 for i,row in enumerate(rows):
  row={**row,'arm64_tsv_sha256':sha(H/row['arm64_evidence'])}
  targets.append({'target_id':f'R7O-{i:03d}','owner_group':group(row['owner'],row['method']),**row})
 out={'schema_version':1,'status':'committed-before-capture-final-r7-owner-targets','sample':load(R4)['sample'],'remaining_pr_cases':REMAINING,'source':{'static_contract_sha256':sha(STATIC),'runtime_hook_targets_sha256':sha(RPH),'r4_targets_sha256':sha(R4),'r5_targets_sha256':sha(R5)},'target_count':len(targets),'owner_group_counts':{g:sum(x['owner_group']==g for x in targets) for g in ['note','field','hud-core','hud-overlay']},'targets':targets,'unknown_targets':[]}
 OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print('built R7 targets',len(targets),out['owner_group_counts'])
if __name__=='__main__':main()
