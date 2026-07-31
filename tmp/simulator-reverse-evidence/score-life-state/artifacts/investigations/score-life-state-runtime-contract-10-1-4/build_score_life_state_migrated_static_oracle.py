#!/usr/bin/env python3
"""Build current-ARM64 semantic bundles from reviewed historical guides and 10.1.4 slices."""
from __future__ import annotations
import hashlib,json
from pathlib import Path
from typing import Any
BASE=Path(__file__).resolve().parent;INV=BASE.parent
CONTRACT=BASE/"score_life_state_static_contract.json";FINDINGS=BASE/"score_life_state_static_findings.json";OUTPUT=BASE/"score_life_state_migrated_static_oracle.json"
HISTORICAL={
 "base_score":("base-score-construction/base_score_construction.json","FAC19A68CEF22F299D15304E9F05A4947913AC08E7E8D6948788F3C6B5D7CC9F"),
 "event_score":("event-score-multipliers/event_score_multipliers.json","DA1EBFA0BC6B9813577C809DF0AD867E8AC90DCAC24BB025903AC5713322BB01"),
 "free_event":("free-live-event-bonus-construction/free_live_event_bonus_construction.json","84A6C04E378A642CE90F4A8CF4B943C94959E7492990A92A8E958B4C4ECDE919"),
 "special_combo":("special-mode-combo-rates/special_mode_combo_rates.json","7D5EF4396771ECE85277AF059C9064C625627354862CF38CB8504BC437A0F01B"),
 "skill_fever_notes":("skill-fever-consumers/README.md","B1252479933D0EC85AD01AFAA18B0AE00D2BA538DD6CB1F6DA2C89645A10093B"),
 "skill_playback":("skill-playback-state-machine/skill_playback_state_machine.json","99B1DEC146FEE33D7025A87C034DA3C322C3565656E5B69D55D787339237F7C5"),
 "active_effects":("skill-activate-effect-consumers/skill_activate_effect_consumers.json","6CE30C07E73AF1967C72DEAED56BA356F098AAC203A41FB20F12A2A45D40B734"),
 "fever_command":("fever-command-state-machine/fever_command_state_machine.json","8D063CC679EFC06F4DD53A607FCA5495877A3BF1DA157337CD9F9546DAB7DC15"),
}
METHODS={
 "base_score":["ScoreUtility.calcTotalParameter","ScoreUtility.InitBaseScore","ScoreUtility.GetBaseScore","NoteBase.calcBaseCorrectedScore","NoteManager.analyzeBMS"],
 "event_score":["InGameOneFrameJudgementController.ReflectOneFrameData","TeamLiveFestivalInGameController.GetStageEffectScoreUpRate","InGameRecord.CalcOneNotesMaxScoreInfo","InGameRecord.CalcFreeLiveEventBonusAppliedOneNotesMaxScoreInfo","InGameRecord.updateOneNotesMaxScoreInfo"],
 "free_event":["ScreenLayerSoloLiveDeckSelectBase.setupFreeLiveEventBonusAppliedDeckTotalParameter","ScreenLayerSoloLiveDeckSelectBase.createEventBuffData","DeckParamCalcUtility.CalculateEventParameterBuff","RhythmGameStartData.SetFreeLiveEventBonusAppliedDeckTotalParameter","PostRhythmGame.<start>d__3.MoveNext"],
 "special_combo":["InGameOneFrameJudgementController.getComboCorrectionRate","MedleyInGameController.GetComboCorrectionRate","MedleyComboRateModel.IsInRangeCombo","GarupaCupQualificationComboRateCalculator.GetCurrentComboRate"],
 "skill_fever_notes":["NoteBase.playSkillNote","NoteFrontBase.judgeFrontNote","NoteFrontBase.checkFeverNote","NoteBase.judgeAfterNote","FeverTimeManager.JudgeFeverNote","FeverTimeManager.getNeedFeverNoteCount"],
 "skill_playback":["SituationSkillManager.ExecUpdate","SituationSkillManager.executeBeginSkillProcess","SituationSkillManager.executePlayingSkillProcess","SituationSkillManager.executeFinishingSkillProcess","SituationSkillManager.processOfSkillTriggered","SituationSkillManager.processOfSkillFinished","SituationSkillManager.Stop","SituationSkillManager.playOnceEffectSkill"],
 "active_effects":["GamePlayButton.CorrectNoteResult","NoteFrontBase.calcAddDamage","NoteFrontBase.calcSkillScoreUpRate","SkillUtility.CalcAddDamageWithNeverDieSkill","SkillUtility.GetDamageGuardTypeWithNeverDieSkill","SkillUtility.CalcJudgeContinuousResultType","SkillUtility.CalculateRateUpValueWithGettingPerfect"],
 "fever_command":["FeverTimeManager.GetFeverTimeScoreRate","FeverTimeManager.changeFeverTimeCommandType","FeverTimeManager.execFeverCommandChanged","FeverTimeManager.judgeFever","FeverTimeManager.updateFeverStatePassConditions","FeverTimeManager.resetFeverPoint","FeverTimeManager.resetFeverStatePassConditions","FeverTimeManager.FeverEffectReservationData.Reserve"],
}
def digest(path:Path)->str:return hashlib.sha256(path.read_bytes()).hexdigest().upper()
def main()->int:
 c=json.loads(CONTRACT.read_text(encoding="utf-8"));f=json.loads(FINDINGS.read_text(encoding="utf-8"));rows={f"{m['owner']}.{m['method']}":m for m in c["methods"]};guides={};
 for key,(rel,expected) in HISTORICAL.items():
  path=INV/rel;actual=digest(path)
  if actual!=expected:raise SystemExit(f"historical hash differs: {rel}")
  guides[key]={"path":f"artifacts/investigations/{rel}","sha256":actual}
 bundles={}
 for key,names in METHODS.items():
  methods=[]
  for name in names:
   if name not in rows:raise SystemExit(f"missing current method: {name}")
   row=rows[name];path=BASE/row["evidence"]
   methods.append({"managed_name":name,"signature":row["signature"],"target_rva":row["target_rva"],"target_end_rva":row["target_end_rva"],"target_sha256":row["target_sha256"],"target_arm64_tsv":row["evidence"],"target_arm64_tsv_sha256":digest(path),"migration_class":"exact-bytes" if row["baseline_sha256"]==row["target_sha256"] else ("pc-relative-only" if row["non_pc_relative_differing_words"]==0 else "target-arm64-reviewed")})
  bundles[key]={"historical_guide":guides[key],"current_methods":methods,"confirmation":"10.1.4 target ARM64 reviewed directly; historical bytes are a semantic guide only"}
 history={key:json.loads((INV/rel).read_text(encoding="utf-8")) for key,(rel,_) in HISTORICAL.items() if rel.endswith('.json')}
 by_finding={x["id"]:x["conclusion"] for x in f["findings"]}
 output={"schema_version":1,"status":"confirmed-current-arm64-semantic-bundles","sample":c["target"],"historical_guides":guides,"bundles":bundles,"conclusions":{
  "base_score":history["base_score"]["confirmed"],"event_score":history["event_score"]["confirmed"],"free_event":history["free_event"]["confirmed"],"special_combo":history["special_combo"]["confirmed"],
  "skill_notes":{"eligibility":"modes 1,3,4,5,10,11,12 enabled; modes 6,7 disabled; MultiNormal(2) requires local skillCharaList ownership","result_route":"Great/Perfect enqueue unless MoveTime; Good/Bad/Miss failure; MultiNormal reserves played index","fever_route":"state None only; root front path and Long/Slide terminal after path; only Great/Perfect have point keys","difficulty_points":{"easy":{"great":20,"perfect":20},"normal":{"great":12,"perfect":12},"hard":{"great":6,"perfect":6},"expert":{"great":4,"perfect":4},"special":{"great":4,"perfect":4}}},
  "skill_playback":history["skill_playback"],"active_effects":history["active_effects"],"fever_command":history["fever_command"],
  "current_findings":{"one_frame":by_finding["SLS-S01"],"reflect":by_finding["SLS-S02"],"damage":by_finding["SLS-S07"],"never_die":by_finding["SLS-S08"],"once_heal":by_finding["SLS-S09"],"skill_state":by_finding["SLS-S10"],"fever_rate":by_finding["SLS-S11"],"record":by_finding["SLS-S12"]},
  "all_perfect":{"reset":1,"cleared_by_results":[0,1,2,3],"retained_by_perfect":4},
 },"portable_profile_ownership":{"caller_required":["deck parameter components or validated member rows","ordered active Skill effect rows","Fever difficulty-point table","Auto combo coefficient","Festival judge/combo/life rows","Medley and Garupa ordered combo ranges","Free Live event-buff rows","mode and collaboration flags"],"missing_or_invalid":"evidence-required before domain mutation","concrete_identity_fields":"not exported; profiles are owner/session-bound numeric values"},"business_state_gate":"open-pending-portable-contract-and-fixed-event-rebuild","production_authorization":False}
 OUTPUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(f"migrated static oracle built: bundles={len(bundles)} current_methods={sum(len(x['current_methods']) for x in bundles.values())}");return 0
if __name__=="__main__":raise SystemExit(main())
