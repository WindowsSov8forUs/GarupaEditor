import type { NORMALIZED_SCORE_RULESET_ID } from "../scoring/contracts";
import type { SimulatorModeIdentity } from "./inGameCalculatedData";

export interface ScoreLifeStateProfile {
  readonly schemaVersion: 3;
  readonly sessionId: string;
  readonly life: {
    readonly initialLife: number;
    readonly playerMaxLife: number;
    readonly lifeUpperLimit: number;
    readonly missDamage: number;
    readonly badDamage: number;
  };
  readonly mode: SimulatorModeIdentity;
}

export interface ScoreLifeInitializationSnapshot {
  readonly sessionId: string;
  readonly mode: SimulatorModeIdentity;
  readonly ruleSetId: typeof NORMALIZED_SCORE_RULESET_ID;
  readonly totalScoringUnitCount: number;
  readonly scoreMaximum: number;
  readonly consumedScoringUnitCount: number;
  readonly timelineRevision: number;
}

export function deepFreezeScoreLifeProfile(
  profile: ScoreLifeStateProfile,
): ScoreLifeStateProfile {
  return Object.freeze({
    schemaVersion: 3 as const,
    sessionId: profile.sessionId,
    life: Object.freeze({
      initialLife: profile.life.initialLife,
      playerMaxLife: profile.life.playerMaxLife,
      lifeUpperLimit: profile.life.lifeUpperLimit,
      missDamage: profile.life.missDamage,
      badDamage: profile.life.badDamage,
    }),
    mode: profile.mode,
  });
}
