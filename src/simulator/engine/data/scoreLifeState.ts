import type { NoteResultTypeValue } from "./manualJudgement";

export const ScoreLifeMode = {
  Ordinary: "ordinary",
  AutoLive: "auto-live",
  TeamLiveFestival: "team-live-festival",
  SingleMedley: "single-medley",
  GarupaCupFirstQualification: "garupa-cup-first-qualification",
  Practice: "practice",
  Collaboration: "collaboration",
} as const;

export type ScoreLifeModeValue = (typeof ScoreLifeMode)[keyof typeof ScoreLifeMode];
export type SkillEffectValueType = "real-value" | "rate";
export type FeverDifficulty = "easy" | "normal" | "hard" | "expert" | "special";

export const SkillActivateEffectType = {
  Score: 0,
  Damage: 1,
  Heal: 2,
  Judge: 3,
  ScoreOverLife: 4,
  ScoreUnderLife: 5,
  ScoreContinuedNoteJudge: 6,
  ScoreRateUpWithPerfect: 7,
  ScoreOnlyPerfect: 8,
  NeverDie: 9,
  ScoreUnderGreatHalf: 10,
} as const;

export type SkillActivateEffectTypeValue =
  (typeof SkillActivateEffectType)[keyof typeof SkillActivateEffectType];

export interface SkillActivateEffectProfile {
  readonly type: SkillActivateEffectTypeValue;
  readonly valueType: SkillEffectValueType;
  readonly value: number;
  readonly conditionResult?: Exclude<NoteResultTypeValue, -1>;
  readonly conditionLife?: number;
  readonly maxValue?: number;
}

export interface SkillOnceEffectProfile {
  readonly valueType: SkillEffectValueType;
  readonly value: number;
  readonly conditionLife?: number;
}

export interface SituationSkillProfile {
  readonly skillNoteIndex: number;
  readonly durationSeconds: number;
  readonly onceEffect?: SkillOnceEffectProfile;
  readonly activeEffects: readonly SkillActivateEffectProfile[];
}

export interface InclusiveRateRange {
  readonly from: number;
  readonly to: number;
  readonly rate: number;
}

export interface FestivalJudgeRate {
  readonly result: Exclude<NoteResultTypeValue, -1>;
  readonly rate: number;
  readonly level: number;
}

export interface FestivalRangeRate extends InclusiveRateRange {
  readonly level: number;
}

export type ScoreLifeSpecialModeProfile =
  | { readonly kind: "ordinary" }
  | { readonly kind: "practice" }
  | { readonly kind: "collaboration" }
  | {
      readonly kind: "auto-live";
      readonly comboCoefficient: number;
    }
  | {
      readonly kind: "team-live-festival";
      readonly judgeRates: readonly FestivalJudgeRate[];
      readonly comboRates: readonly FestivalRangeRate[];
      readonly lifeRates: readonly FestivalRangeRate[];
    }
  | {
      readonly kind: "single-medley";
      readonly comboRates: readonly InclusiveRateRange[];
    }
  | {
      readonly kind: "garupa-cup-first-qualification";
      readonly comboRates: readonly InclusiveRateRange[];
    };

export interface ScoreLifeStateProfile {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly scoreLevel: number;
  readonly deckTotalParameter: number;
  readonly freeLiveEventBonusDeckTotalParameter: number;
  readonly life: {
    readonly initialLife: number;
    readonly playerMaxLife: number;
    readonly lifeUpperLimit: number;
    readonly missDamage: number;
    readonly badDamage: number;
  };
  readonly mode: ScoreLifeSpecialModeProfile;
  readonly skills: readonly SituationSkillProfile[];
  readonly fever: {
    readonly difficulty: FeverDifficulty;
    readonly ownTeamMemberCount: number;
  };
}

export interface ScoreLifeInitializationSnapshot {
  readonly sessionId: string;
  readonly mode: ScoreLifeModeValue;
  readonly scoreLevel: number;
  readonly maxNoteCount: number;
  readonly deckTotalParameter: number;
  readonly scoreLevelRate: number;
  readonly baseScore: number;
  readonly freeLiveEventBonusBaseScore: number;
}

export function deepFreezeScoreLifeProfile(
  profile: ScoreLifeStateProfile,
): ScoreLifeStateProfile {
  const skills = profile.skills.map((skill) => Object.freeze({
    ...skill,
    onceEffect: skill.onceEffect === undefined
      ? undefined
      : Object.freeze({ ...skill.onceEffect }),
    activeEffects: Object.freeze(skill.activeEffects.map((effect) => Object.freeze({ ...effect }))),
  }));
  const mode = copyMode(profile.mode);
  return Object.freeze({
    ...profile,
    life: Object.freeze({ ...profile.life }),
    mode,
    skills: Object.freeze(skills),
    fever: Object.freeze({ ...profile.fever }),
  });
}

function copyMode(mode: ScoreLifeSpecialModeProfile): ScoreLifeSpecialModeProfile {
  if (mode.kind === "team-live-festival") {
    return Object.freeze({
      ...mode,
      judgeRates: Object.freeze(mode.judgeRates.map((row) => Object.freeze({ ...row }))),
      comboRates: Object.freeze(mode.comboRates.map((row) => Object.freeze({ ...row }))),
      lifeRates: Object.freeze(mode.lifeRates.map((row) => Object.freeze({ ...row }))),
    });
  }
  if (mode.kind === "single-medley" || mode.kind === "garupa-cup-first-qualification") {
    return Object.freeze({
      ...mode,
      comboRates: Object.freeze(mode.comboRates.map((row) => Object.freeze({ ...row }))),
    });
  }
  return Object.freeze({ ...mode });
}
