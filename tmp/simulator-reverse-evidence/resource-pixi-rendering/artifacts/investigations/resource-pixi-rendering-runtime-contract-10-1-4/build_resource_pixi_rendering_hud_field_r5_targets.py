#!/usr/bin/env python3
"""Build byte-pinned owner targets for consolidated HUD/overlay/field R5 capture."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
STATIC=H/'resource_pixi_rendering_static_contract.json'
OUT=H/'resource_pixi_rendering_hud_field_r5_targets.json'
SPECS=(
 ('RPH5-000','frame','Combo','ExecUpdate'),
 ('RPH5-001','core','AddScoreManager','Play'),('RPH5-002','core','AddScoreObject','Play'),('RPH5-003','core','AddScoreObject.<playCoroutine>d__11','MoveNext'),
 ('RPH5-004','core','CE.Result','Show'),('RPH5-005','core','CE.Result','changeSprite'),('RPH5-006','core','CE.Result','Hide'),('RPH5-007','core','CE.Result.<showCoroutine>d__31','MoveNext'),
 ('RPH5-008','core','JudgeTimingController','Show'),('RPH5-009','core','JudgeTimingController','setupJudgeTimingSprite'),
 ('RPH5-010','core','AllPerfectStatusAnimation','ExecUpdate'),('RPH5-011','core','AllPerfectStatusAnimation','Hide'),('RPH5-012','core','AllPerfectStatusAnimation','Reset'),
 ('RPH5-013','overlay','Score','playSkillEffectScoreUpAnimation'),('RPH5-014','overlay','Score','stopSkillEffectScoreUpAnimation'),
 ('RPH5-015','overlay','ScoreGaugeEffect','On'),('RPH5-016','overlay','ScoreGaugeEffect','Off'),
 ('RPH5-017','overlay','InGameLifeGauge','playSkillEffectDamageGuardAnimation'),('RPH5-018','overlay','InGameLifeGauge','playSkillEffectNeverDieAnimation'),
 ('RPH5-019','overlay','InGameLifeGauge','playSkillEffectLifeHealAnimation'),('RPH5-020','overlay','InGameLifeGauge','stopSkillEffectAnimation'),
 ('RPH5-021','overlay','InGameLifeGauge','onPlaySkill'),('RPH5-022','overlay','InGameLifeGauge','onFinishSkill'),
 ('RPH5-023','overlay','InGameLifeGauge','updateWarningGaugeBlink'),('RPH5-024','overlay','InGameLifeGauge','changeLifeGaugeBaseColorWhenGameOver'),
 ('RPH5-025','overlay','InGameSkillEffectDisplay','Play'),('RPH5-026','overlay','InGameSkillEffectDisplay','Off'),
 ('RPH5-027','overlay','SkillEffectChangeableTextObject','Play'),('RPH5-028','overlay','SkillEffectChangeableTextObject','SetActive'),('RPH5-029','overlay','SkillEffectChangeableTextObject','SetLabelDepth'),
 ('RPH5-030','field','ButtonManager','ExecAwakeStart'),('RPH5-031','field','ButtonManager','setupPlayButtons'),('RPH5-032','field','ButtonManager','SetupSudden'),
 ('RPH5-033','field','ButtonManager','changeLaneImage'),('RPH5-034','field','ButtonManager','execMultiResolution'),
)
def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest().upper()
def code_sha(p:Path)->str:
 rows=p.read_text(encoding='utf-8').splitlines()[1:]
 return hashlib.sha256(b''.join(bytes.fromhex(row.split('\t')[1]) for row in rows)).hexdigest().upper()
def main()->None:
 d=json.loads(STATIC.read_text(encoding='utf-8')); rows=[]
 for target_id,group,owner,method in SPECS:
  hits=[x for x in d['methods'] if x['owner']==owner and x['method']==method]
  assert len(hits)==1,(owner,method,len(hits));x=hits[0];assert x['status']=='mapped';e=H/x['evidence'];assert e.is_file() and code_sha(e)==x['target_sha256']
  rows.append({'target_id':target_id,'owner_group':group,'owner':owner,'method':method,'category':'hud-field-r5','rva':x['target_rva'],'end_rva':x['target_end_rva'],'signature':x['signature'],'arm64_sha256':x['target_sha256'],'arm64_evidence':x['evidence']})
 out={'schema_version':1,'status':'confirmed-current-hud-field-r5-observation-targets','sample':d['target'],'source_static_contract_sha256':sha(STATIC),'observation_policy':{'return_replacement':False,'memory_writes':False,'managed_invocation':False,'raw_pointer_export':False,'display_string_export':False,'synthetic_event_injection':False},'target_count':len(rows),'targets':rows,'unknown_fields':[]}
 OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print('built HUD/field R5 targets',len(rows))
if __name__=='__main__':main()
