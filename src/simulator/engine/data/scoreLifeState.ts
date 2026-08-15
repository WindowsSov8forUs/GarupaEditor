import type { NORMALIZED_SCORE_RULESET_ID } from "../scoring/contracts";

export const ScoreLifeMode = {
  Ordinary: "ordinary",
  AutoLive: "auto-live",
  Practice: "practice",
} as const;

export type ScoreLifeModeValue = (typeof ScoreLifeMode)[keyof typeof ScoreLifeMode];

export type ScoreLifeModeProfile =
  | { readonly kind: "ordinary" }
  | { readonly kind: "practice" }
  | { readonly kind: "auto-live" };

export interface ScoreLifeStateProfile {
  readonly schemaVersion: 2;
  readonly sessionId: string;
  readonly life: {
    readonly initialLife: number;
    readonly playerMaxLife: number;
    readonly lifeUpperLimit: number;
    readonly missDamage: number;
    readonly badDamage: number;
  };
  readonly mode: ScoreLifeModeProfile;
}

export interface ScoreLifeInitializationSnapshot {
  readonly sessionId: string;
  readonly mode: ScoreLifeModeValue;
  readonly ruleSetId: typeof NORMALIZED_SCORE_RULESET_ID;
  readonly totalScoringUnitCount: number;
  readonly scoreMaximum: number;
  readonly consumedScoringUnitCount: number;
}

export function deepFreezeScoreLifeProfile(
  profile: ScoreLifeStateProfile,
): ScoreLifeStateProfile {
  return Object.freeze({
    ...profile,
    life: Object.freeze({ ...profile.life }),
    mode: Object.freeze({ ...profile.mode }),
  });
}
