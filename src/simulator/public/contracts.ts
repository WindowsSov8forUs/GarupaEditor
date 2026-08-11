export type SimulatorPublicPlayMode = "manual" | "auto-live";

export interface SimulatorChartAudioData {
  readonly cue: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly codec: "mp3";
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  readonly currentSampleFrames: number;
}

export type SimulatorPublicNoteResult =
  | "perfect"
  | "great"
  | "good"
  | "bad"
  | "miss";

export type SimulatorPublicSkillEffectKind =
  | "score"
  | "damage-guard"
  | "heal"
  | "judge"
  | "score-over-life"
  | "score-under-life"
  | "score-continued-note-judge"
  | "score-rate-up-with-perfect"
  | "score-only-perfect"
  | "never-die"
  | "score-under-great-half";

export interface SimulatorPublicSkillActiveEffect {
  readonly kind: SimulatorPublicSkillEffectKind;
  readonly valueType: "real-value" | "rate";
  readonly value: number;
  readonly conditionResult?: SimulatorPublicNoteResult;
  readonly conditionLife?: number;
  readonly maxValue?: number;
}

export interface SimulatorPublicSkillOnceEffect {
  readonly valueType: "real-value" | "rate";
  readonly value: number;
  readonly conditionLife?: number;
}

export interface SimulatorPublicSituationSkill {
  readonly skillNoteIndex: number;
  readonly durationSeconds: number;
  readonly onceEffect?: SimulatorPublicSkillOnceEffect;
  readonly activeEffects: readonly SimulatorPublicSkillActiveEffect[];
}

export interface SimulatorPublicInclusiveRateRange {
  readonly from: number;
  readonly to: number;
  readonly rate: number;
}

export interface SimulatorPublicFestivalJudgeRate {
  readonly result: SimulatorPublicNoteResult;
  readonly rate: number;
  readonly level: number;
}

export interface SimulatorPublicFestivalRangeRate
  extends SimulatorPublicInclusiveRateRange {
  readonly level: number;
}

export type SimulatorPublicScoreMode =
  | { readonly kind: "ordinary" }
  | { readonly kind: "practice" }
  | { readonly kind: "collaboration" }
  | {
      readonly kind: "auto-live";
      readonly comboCoefficient: number;
    }
  | {
      readonly kind: "team-live-festival";
      readonly judgeRates: readonly SimulatorPublicFestivalJudgeRate[];
      readonly comboRates: readonly SimulatorPublicFestivalRangeRate[];
      readonly lifeRates: readonly SimulatorPublicFestivalRangeRate[];
    }
  | {
      readonly kind: "single-medley";
      readonly comboRates: readonly SimulatorPublicInclusiveRateRange[];
    }
  | {
      readonly kind: "garupa-cup-first-qualification";
      readonly comboRates: readonly SimulatorPublicInclusiveRateRange[];
    };

export interface SimulatorSessionBusinessData {
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
  readonly mode: SimulatorPublicScoreMode;
  readonly skills: readonly SimulatorPublicSituationSkill[];
  readonly fever: {
    readonly difficulty: "easy" | "normal" | "hard" | "expert" | "special";
    readonly ownTeamMemberCount: number;
  };
}

export interface SimulatorChartDataPackage {
  readonly bmsText: string;
  readonly bgm: SimulatorChartAudioData;
  readonly sessionBusinessData?: SimulatorSessionBusinessData;
}

export interface SimulatorLaunchConfig {
  readonly playMode: SimulatorPublicPlayMode;
  readonly highFrequencyMode: boolean;
  readonly judgeOffsetFrames: number;
  readonly practice: {
    readonly enabled: boolean;
    readonly startMilliseconds: number;
  };
  readonly audio: {
    readonly masterGain: number;
    readonly bgmGain: number;
    readonly seGain: number;
    readonly voiceGain: number;
  };
}

export interface SimulatorModuleLaunchRequest {
  readonly chartData: SimulatorChartDataPackage;
  readonly config: SimulatorLaunchConfig;
}

export type SimulatorModuleCloseReason =
  | "completed"
  | "game-over"
  | "user-closed"
  | "terminal-fault";

export interface SimulatorModuleFinalResult {
  readonly adjustedMusicPosition: number;
  readonly score: number | null;
  readonly life: number | null;
  readonly combo: number | null;
  readonly clearStatus: 1 | 2 | 3 | null;
}

export interface SimulatorModuleFailure {
  readonly code:
    | "evidence-required"
    | "resource-unavailable"
    | "resource-integrity"
    | "resource-decode"
    | "platform-unavailable"
    | "launch-failed";
  readonly capability: string;
  readonly boundary: string;
}

export interface SimulatorModuleCloseReport {
  readonly reason: SimulatorModuleCloseReason;
  readonly result: SimulatorModuleFinalResult | null;
  readonly failure: SimulatorModuleFailure | null;
}

export type SimulatorModuleLaunchResult =
  | {
      readonly status: "accepted";
      readonly closed: Promise<SimulatorModuleCloseReport>;
    }
  | {
      readonly status: "rejected";
      readonly failure: SimulatorModuleFailure;
    };

export type LaunchSimulatorModule = (
  request: SimulatorModuleLaunchRequest,
) => Promise<SimulatorModuleLaunchResult>;
