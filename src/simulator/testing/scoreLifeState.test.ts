import {
  AfterNoteType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type NoteInformation,
} from "../engine/chart/types";
import { NoteResultType } from "../engine/data/manualJudgement";
import {
  SkillActivateEffectType,
  type ScoreLifeStateProfile,
  type SituationSkillProfile,
} from "../engine/data/scoreLifeState";
import { FeverTimeManager, FeverTimeState } from "../engine/managers/feverTimeManager";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { InGameRecord } from "../engine/managers/inGameRecord";
import {
  ScoreLifeStateManager,
  countMaximumNotes,
} from "../engine/managers/scoreLifeStateManager";
import { ScoreUtility } from "../engine/managers/scoreUtility";
import {
  SituationSkillManager,
  SituationSkillPlayState,
} from "../engine/managers/situationSkillManager";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { chart, engineInput, noteBatch, noteInformation } from "./firstSliceFixtures";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}
function ok<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "evidence-required" }, message: string): T {
  if (result.status !== "ok") throw new Error(message);
  return result.value;
}
function bits(value: number): string {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  return `0x${new DataView(buffer).getUint32(0, true).toString(16).padStart(8, "0").toUpperCase()}`;
}
function f32(bitsValue: number): number {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, bitsValue, true);
  return new DataView(buffer).getFloat32(0, true);
}
function profile(mode: ScoreLifeStateProfile["mode"] = { kind: "ordinary" }): ScoreLifeStateProfile {
  return {
    schemaVersion: 1,
    sessionId: "score-life-test-session",
    scoreLevel: 27,
    deckTotalParameter: f32(0x483c8a31),
    freeLiveEventBonusDeckTotalParameter: Math.fround(0),
    life: {
      initialLife: 1000,
      playerMaxLife: 1000,
      lifeUpperLimit: 2000,
      missDamage: -100,
      badDamage: -50,
    },
    mode,
    skills: [],
    fever: { difficulty: "special", ownTeamMemberCount: 1 },
  };
}

function withProperties(note: NoteInformation, values: Partial<NoteInformation>): NoteInformation {
  return Object.freeze({ ...note, ...values });
}

const score = new ScoreUtility(f32(0x483c8a31), Math.fround(0), 27, 979);
equal(bits(score.scoreLevelRate), "0x3F9C28F6", "BS01 score-level rate bits");
equal(bits(score.baseScore), "0x4434718E", "BS01 base-score bits");
equal(score.getResultTypeCorrectionRate(NoteResultType.Miss), Math.fround(0), "BS05 Miss rate");
equal(bits(score.getResultTypeCorrectionRate(NoteResultType.Perfect)), "0x3F8CCCCD", "BS05 Perfect rate");
equal(bits(score.getComboCorrectionRate(701, { kind: "ordinary" }, [1])), "0x3F8E147B", "BS06 701+ rate");

const normal = noteInformation("normal", 1);
const long = withProperties(noteInformation("long", 2), {
  gameNoteType: GameNoteType.Long,
  fireNoteType: FrontNoteType.Long,
  afterNoteType: AfterNoteType.Normal,
});
const slideChild1 = withProperties(noteInformation("slide-child-1", 4), { isInvisible: false });
const slideChild2 = withProperties(noteInformation("slide-child-2", 5), { isInvisible: false });
const slideHidden = withProperties(noteInformation("slide-hidden", 6), { isInvisible: true });
const slide = withProperties(noteInformation("slide", 3), {
  gameNoteType: GameNoteType.SlideA,
  fireNoteType: FrontNoteType.SlideA,
  slideNoteList: [slideChild1, slideChild2, slideHidden],
});
const countChart = chart([{ ...noteBatch([], 1), informationList: [normal, long, slide] }]);
equal(countMaximumNotes(countChart), 6, "BS01/BS02 family maxNoteCount");

const record = new InGameRecord(1000, 1000, 2000);
record.addCombo(1); record.addCombo(1); record.addCombo(-1);
equal(record.snapshot().maxCombo, 2, "BS13 strict max Combo");
record.incrementResult(4, 0); record.incrementResult(3, 1);
equal(record.snapshot().allPerfect, false, "BS13 All Perfect clears on Great");
record.updateOneNoteMax(100, Math.fround(1), false);
record.updateOneNoteMax(100, Math.fround(2), true);
equal(record.snapshot().oneNoteMax.skillFactor, Math.fround(1), "BS14 equal maximum retains first");
equal(record.addLife(500), 500, "BS20 overheal");
equal(record.snapshot().currentLife, 1500, "BS20 current Life exceeds player max");
equal(record.addLife(-5000), -1500, "BS16 lethal clamp");
equal(record.snapshot().singleGameOver, true, "BS16 Game Over boundary");
equal(record.addLife(300), 0, "BS35 post-GameOver positive Life blocked");

const skillRecord = new InGameRecord(1000, 1000, 2000);
const skillManager = new SituationSkillManager(new Map([[1, {
  skillNoteIndex: 1,
  durationSeconds: Math.fround(5),
  onceEffect: { valueType: "real-value", value: Math.fround(300) },
  activeEffects: [
    { type: SkillActivateEffectType.Score, valueType: "rate", value: Math.fround(20) },
    { type: SkillActivateEffectType.NeverDie, valueType: "real-value", value: Math.fround(0) },
  ],
}]]), skillRecord);
assert(skillManager.enqueue(1, 10), "BS21 Skill enqueue");
equal(skillManager.snapshot().state, SituationSkillPlayState.Begin, "BS22 Begin");
skillManager.update(Math.fround(1 / 60));
equal(skillManager.snapshot().state, SituationSkillPlayState.Playing, "BS22 Playing");
equal(skillRecord.snapshot().currentLife, 1300, "BS19 once heal");
equal(bits(skillManager.projectScore(4).rate), "0x3F99999A", "BS24 score active effect");
const neverDie = skillManager.projectDamage(-2000);
equal(neverDie.damageGuardType, 2, "BS18 Never Die guard type");
equal(neverDie.addPower, -1295, "BS18 Never Die leaves Life 5");
skillManager.update(Math.fround(5.1));
equal(skillManager.snapshot().state, SituationSkillPlayState.Playing, "BS22 expiry checks before subtract");
skillManager.update(Math.fround(0));
equal(skillManager.snapshot().state, SituationSkillPlayState.Finishing, "BS22 Finishing");
equal(bits(skillManager.snapshot().finishingTimer), "0x3F400000", "BS22 0.75 timer");
skillManager.update(Math.fround(0.75));
equal(skillManager.snapshot().state, SituationSkillPlayState.None, "BS22 final None");

function activeManager(
  activeEffects: ScoreLifeStateProfile["skills"][number]["activeEffects"],
  life = 1000,
): SituationSkillManager {
  const value = new SituationSkillManager(new Map([[1, {
    skillNoteIndex: 1,
    durationSeconds: Math.fround(5),
    activeEffects,
  }]]), new InGameRecord(life, 1000, 2000));
  assert(value.enqueue(1, 0), "enqueue active-effect profile");
  value.update(Math.fround(0));
  return value;
}
const judgeSkill = activeManager([{ type: SkillActivateEffectType.Judge, valueType: "real-value", value: Math.fround(0), conditionResult: 2 }]);
equal(judgeSkill.correctResult(2), 4, "BS24 judge correction first eligible");
const fixedDamageSkill = activeManager([{ type: SkillActivateEffectType.Damage, valueType: "real-value", value: Math.fround(50) }]);
equal(fixedDamageSkill.projectDamage(-100).addPower, -50, "BS17 fixed Damage Guard producer");
const rateGuardSkill = activeManager([{ type: SkillActivateEffectType.Damage, valueType: "rate", value: Math.fround(0) }]);
equal(rateGuardSkill.projectDamage(-100).damageGuardType, 1, "BS17 zero-rate guard type");
equal(rateGuardSkill.projectDamage(-100).addPower, 0, "BS17 zero-rate damage");
const overLifeSkill = activeManager([{ type: SkillActivateEffectType.ScoreOverLife, valueType: "rate", value: Math.fround(80), conditionLife: 1000 }]);
equal(bits(overLifeSkill.projectScore(4).rate), "0x3FE66666", "BS25 over-Life equality");
const underLifeSkill = activeManager([{ type: SkillActivateEffectType.ScoreUnderLife, valueType: "rate", value: Math.fround(80), conditionLife: 1001 }]);
equal(bits(underLifeSkill.projectScore(4).rate), "0x3FE66666", "BS25 under-Life condition");
const continuousSkill = activeManager([{ type: SkillActivateEffectType.ScoreContinuedNoteJudge, valueType: "rate", value: Math.fround(95), conditionResult: 3 }]);
equal(bits(continuousSkill.projectScore(4).rate), "0x3FF9999A", "BS26 continuous eligible");
equal(bits(continuousSkill.projectScore(2).rate), "0x3F800000", "BS26 continuous worst-result gate");
const onlyPerfectSkill = activeManager([{ type: SkillActivateEffectType.ScoreOnlyPerfect, valueType: "rate", value: Math.fround(100) }]);
equal(onlyPerfectSkill.projectScore(2).rate, Math.fround(0), "BS27 only-perfect Good zero");
equal(onlyPerfectSkill.projectScore(2).scoreUpType, 3, "BS27 only-perfect ScoreUpType");
const underGreatSkill = activeManager([{ type: SkillActivateEffectType.ScoreUnderGreatHalf, valueType: "rate", value: Math.fround(100) }]);
equal(underGreatSkill.projectScore(3).rate, Math.fround(0.5), "BS27 under-Great half");
equal(underGreatSkill.projectScore(3).scoreUpType, 4, "BS27 under-Great ScoreUpType");
const crescendoSkill = activeManager([{ type: SkillActivateEffectType.ScoreRateUpWithPerfect, valueType: "rate", value: Math.fround(10), maxValue: Math.fround(30) }]);
equal(bits(crescendoSkill.projectScore(4).crescendoRate), "0x3F8CCCCD", "BS28 Crescendo first stack");
crescendoSkill.projectScore(4); crescendoSkill.projectScore(4);
equal(bits(crescendoSkill.projectScore(4).crescendoRate), "0x3FA66666", "BS28 Crescendo clamp");

const fever = new FeverTimeManager("special", 1, true);
for (let index = 0; index < 20; index += 1) fever.judge(4);
equal(fever.snapshot().myPoint, 80, "BS29 Fever points");
equal(fever.snapshot().ownTeamPassCount, 1, "BS30 pass at 80");
ok(fever.changeCommand("start", 100), "BS31 Fever Start");
equal(fever.snapshot().state, FeverTimeState.FeverLevel1, "BS31 Fever Level1");
equal(bits(fever.scoreRate), "0x40000000", "BS32 Fever 2.0 rate");
equal(fever.snapshot().reservationFrame, 101, "BS31 next-frame reservation");
ok(fever.changeCommand("end", 101), "BS31 Fever End");
equal(fever.snapshot().state, FeverTimeState.None, "BS31 Fever reset");
const teamFever = new FeverTimeManager("special", 2, true);
for (let index = 0; index < 20; index += 1) teamFever.judge(4);
ok(teamFever.updateMemberPoint(1, 80, true), "BS30 remote own-team pass adapter");
ok(teamFever.updateMemberPoint(1, 80, true), "BS30 duplicate pass suppression");
equal(teamFever.snapshot().ownTeamPassCount, 2, "BS30 own-team pass count");
ok(teamFever.changeCommand("start", 200), "BS31 team Fever Start");
equal(teamFever.snapshot().state, FeverTimeState.FeverLevel1, "BS31 team Fever success");
const failedFever = new FeverTimeManager("special", 2, true);
for (let index = 0; index < 20; index += 1) failedFever.judge(4);
ok(failedFever.changeCommand("start", 200), "BS31 failed Fever Start");
equal(failedFever.snapshot().state, FeverTimeState.FeverTimeFailed, "BS31 Fever failure state");

const businessNote = withProperties(noteInformation("business", 0), {
  gameNoteAdditionalType: GameNoteAdditionalType.None,
});
const businessChart = chart([{ ...noteBatch([], 1), informationList: [businessNote] }]);
const businessManager = ok(ScoreLifeStateManager.create(profile(), businessChart, "manual"), "create business manager");
const oneFrame = new InGameOneFrameJudgementController();
ok(oneFrame.initialize(), "initialize OneFrame");
ok(oneFrame.registerAutoLiveJudgementOwner(() => ({ multipleDirectionalFlickNoteCount: null })), "register Auto owner");
ok(oneFrame.registerBusinessOwner((judgement) => businessManager.freezeOneFrame(judgement)), "register business owner");
ok(oneFrame.setupAutoLiveJudgement({
  noteInformation: businessNote,
  phase: "head",
  noteType: 0,
  absolutePosition: 0,
  multipleDirectionalFlickNoteCount: 0,
}), "setup business OneFrame");
const staged = oneFrame.snapshot().slots[0]!.payload;
assert(staged?.business !== undefined, "BS07 business fields freeze at Setup");
equal(staged.business.adjustedResult, 4, "BS07 adjusted result");
equal(staged.business.addPower, 0, "BS15 Perfect Power");
const reflected = ok(oneFrame.reflectOneFrameData(), "reflect business OneFrame");
assert(reflected !== null, "business Reflect exists");
ok(businessManager.reflect(reflected), "commit business Reflect");
equal(businessManager.snapshot().record.currentCombo, 1, "BS10 Combo mutates before rate");
equal(businessManager.snapshot().record.resultCounts[4], 1, "BS13 Perfect count");
equal(businessManager.snapshot().lastReflectBatch?.representativeSlot, 0, "BS11 representative");
for (let index = 0; index < 2; index += 1) {
  ok(oneFrame.setupAutoLiveJudgement({
    noteInformation: businessNote,
    phase: "head",
    noteType: 0,
    absolutePosition: 0,
    multipleDirectionalFlickNoteCount: 0,
  }), `setup same-frame entry ${index}`);
}
const sameFrame = ok(oneFrame.reflectOneFrameData(), "reflect same-frame business entries");
assert(sameFrame !== null, "same-frame Reflect exists");
ok(businessManager.reflect(sameFrame), "commit same-frame business Reflect");
equal(businessManager.snapshot().lastReflectBatch?.entries[0]?.comboAfter, 2, "BS10 first entry updated Combo");
equal(businessManager.snapshot().lastReflectBatch?.entries[1]?.comboAfter, 3, "BS10 second entry updated Combo");
equal(businessManager.snapshot().lastReflectBatch?.representativeSlot, 0, "BS11 equal raw keeps first slot");

const originalProfile = profile();
const engineValue = ok(createSimulatorEngine({
  ...engineInput(),
  chart: businessChart,
  scoreLifeState: originalProfile,
}, createRecordingSimulatorBackends()), "create Score/Life engine");
(originalProfile.life as { initialLife: number }).initialLife = 1;
ok(engineValue.initialize(), "initialize Score/Life engine");
equal(ok(engineValue.snapshot(), "snapshot Score/Life engine").managers.scoreLifeState?.record.currentLife, 1000, "B03 deep-frozen profile");
const continueResult = engineValue.continueLive();
assert(continueResult.status === "evidence-required" && continueResult.capability === "score-life.continue-excluded", "BS36 Continue fails closed");

const invalid = profile();
(invalid.life as { lifeUpperLimit: number }).lifeUpperLimit = 999;
const invalidResult = createSimulatorEngine({ ...engineInput(), chart: businessChart, scoreLifeState: invalid }, createRecordingSimulatorBackends());
assert(invalidResult.status === "evidence-required" && invalidResult.capability === "score-life.invalid-profile", "BS36 invalid profile preflight");
const unsupportedHeal = profile();
(unsupportedHeal.skills as SituationSkillProfile[]).push({
  skillNoteIndex: 1,
  durationSeconds: Math.fround(5),
  activeEffects: [{ type: SkillActivateEffectType.Heal, valueType: "real-value", value: Math.fround(500) }],
});
const unsupportedHealResult = createSimulatorEngine({ ...engineInput(), chart: businessChart, scoreLifeState: unsupportedHeal }, createRecordingSimulatorBackends());
assert(unsupportedHealResult.status === "evidence-required" && unsupportedHealResult.capability === "score-life.invalid-profile", "unconsumed active heal fails closed");

const autoScore = new ScoreUtility(f32(0x483c8a31), Math.fround(0), 27, 979);
equal(bits(autoScore.getComboCorrectionRate(200, { kind: "auto-live", comboCoefficient: Math.fround(1.5) }, [1])), "0x3FC00000", "BS33 Auto coefficient");
equal(bits(autoScore.getComboCorrectionRate(200, { kind: "team-live-festival", judgeRates: [], comboRates: [], lifeRates: [] }, [1])), "0x3F800000", "BS33 Festival Combo bypass");
equal(bits(autoScore.getComboCorrectionRate(10, { kind: "single-medley", comboRates: [{ from: 0, to: 20, rate: Math.fround(1.2) }] }, [1])), "0x3F99999A", "BS34 Medley first inclusive range");
equal(bits(autoScore.getComboCorrectionRate(99, { kind: "single-medley", comboRates: [{ from: 0, to: 20, rate: Math.fround(1.2) }] }, [1])), "0x3F800000", "BS34 Medley fallback");

console.log("score/life/state production tests passed: B03-B11, BS01-BS36 boundaries");
