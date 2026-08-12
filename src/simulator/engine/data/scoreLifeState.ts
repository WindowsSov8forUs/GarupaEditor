export const ScoreLifeMode = {
  Ordinary: "ordinary",
  AutoLive: "auto-live",
  Practice: "practice",
} as const;

export type ScoreLifeModeValue = (typeof ScoreLifeMode)[keyof typeof ScoreLifeMode];

export type ScoreLifeModeProfile =
  | { readonly kind: "ordinary" }
  | { readonly kind: "practice" }
  | { readonly kind: "auto-live"; readonly comboCoefficient: number };

export interface ScoreLifeStateProfile {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly scoreLevel: number;
  readonly totalParameter: number;
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
  readonly scoreLevel: number;
  readonly maxNoteCount: number;
  readonly totalParameter: number;
  readonly scoreLevelRate: number;
  readonly baseScore: number;
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
