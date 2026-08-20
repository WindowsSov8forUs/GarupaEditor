import { RenderFidelityLabel } from "./renderingContracts";
import type {
  RenderAnimationRole,
  RenderCommand,
  RenderObjectRole,
  RenderResourceProfile,
} from "./renderingContracts";
import { validateRenderFloat32 } from "./renderingValidation";

export type SetHudCommand = Extract<RenderCommand, { readonly kind: "set-hud" }>;
export type BindResourceCommand = Extract<RenderCommand, { readonly kind: "bind-resource" }>;

export function validateTypedRenderResourceBinding(
  command: BindResourceCommand,
  objectRole: RenderObjectRole,
  profile: RenderResourceProfile,
): boolean {
  const asset = profile.assets.find(
    (candidate) => candidate.logicalAssetId === command.logicalAssetId,
  );
  if (asset === undefined) return false;
  if (command.binding === "sprite") {
    return spriteObjectRole(objectRole) && command.exactKey !== null &&
      asset.mime === "image/png" && asset.materialRole === "sprite" &&
      asset.atlasRows.some((row) => row.exactKey === command.exactKey);
  }
  if (command.exactKey !== null) return false;
  if (command.binding === "material") {
    return objectRole === "note-mesh"
      ? asset.materialRole === "long-note" || asset.materialRole === "curve-note"
      : objectRole === "sync-line"
      ? asset.materialRole === "sync-line"
      : objectRole === "multiple-directional-line" && asset.materialRole === "multiple-directional-line";
  }
  return asset.role === "animation-clip" && asset.animationRole !== "none" &&
    animationRoleMatchesObject(asset.animationRole, objectRole);
}

export function validateTypedRenderHudCommand(
  command: SetHudCommand,
  objectRole: string,
): boolean {
  switch (command.hudRole) {
    case "score": {
      const state = command.state;
      const expectedMax = validScoringUnitCount(state.totalScoringUnitCount)
        ? 10_000_000 + state.totalScoringUnitCount
        : null;
      return objectRole === "hud-score" && exactKeys(state, [
        "beforeRank", "foregroundActive", "highRankEffect", "highRankEffectActive", "indicatorLocalX",
        "meterKey", "rank", "rankChanged", "rankMarkerALocalX", "rankMarkerBLocalX",
        "rankMarkerCLocalX", "rankMarkerSLocalX", "rankMarkerSSLocalX", "ratio", "ruleSetId", "score",
        "scoreMax", "scoreText", "sliderValue", "totalScoringUnitCount",
      ]) &&
        state.ruleSetId === "garupa-editor-normalized-10m-v1" &&
        expectedMax !== null && state.scoreMax === expectedMax &&
        isUInt32(state.score) && state.score <= state.scoreMax && isUInt32(state.scoreMax) &&
        state.scoreText === expectedScoreText(state.score) &&
        isOrdinaryScoreRank(state.beforeRank) && isOrdinaryScoreRank(state.rank) &&
        state.rank === scoreRank(state.score) &&
        state.rankChanged === (state.beforeRank !== state.rank) &&
        isScoreMeterKey(state.meterKey) && state.meterKey === scoreMeterKeyForRank(state.rank) &&
        validateRenderFloat32(state.ratio) && state.ratio.value === expectedScoreRatio(state.score, state.scoreMax) &&
        validateRenderFloat32(state.sliderValue) && state.sliderValue.value === Math.fround(Math.min(Math.max(state.ratio.value, 0), 1)) &&
        state.foregroundActive === (state.ratio.value > 0) &&
        Number.isInteger(state.indicatorLocalX) && state.indicatorLocalX === expectedScoreIndicatorX(state.ratio.value) &&
        [state.rankMarkerCLocalX, state.rankMarkerBLocalX, state.rankMarkerALocalX,
          state.rankMarkerSLocalX, state.rankMarkerSSLocalX].every(validateRenderFloat32) &&
        state.rankMarkerCLocalX.value === expectedRankMarkerX(375_000, state.scoreMax) &&
        state.rankMarkerBLocalX.value === expectedRankMarkerX(2_250_000, state.scoreMax) &&
        state.rankMarkerALocalX.value === expectedRankMarkerX(4_500_000, state.scoreMax) &&
        state.rankMarkerSLocalX.value === expectedRankMarkerX(6_750_000, state.scoreMax) &&
        state.rankMarkerSSLocalX.value === expectedRankMarkerX(9_000_000, state.scoreMax) &&
        (state.highRankEffect === "none" || state.highRankEffect === "ScoreGaugeSS") &&
        (state.highRankEffect !== "ScoreGaugeSS" || state.rank === 5 && state.rankChanged) &&
        (state.highRankEffect !== "ScoreGaugeSS" || state.highRankEffectActive);
    }
    case "combo": {
      const state = command.state;
      return objectRole === "hud-combo" && exactKeys(state, ["allPerfect", "combo"]) &&
        isUInt32(state.combo) && state.combo <= 9999 && typeof state.allPerfect === "boolean";
    }
    case "result": {
      const state = command.state;
      return objectRole === "hud-result" && exactKeys(state, ["judgeKey", "timingKey"]) &&
        ["judge_auto", "judge_miss", "judge_bad", "judge_good", "judge_great", "judge_perfect"].includes(state.judgeKey) &&
        (state.timingKey === null || state.timingKey === "judge_fast" || state.timingKey === "judge_slow");
    }
    case "life": {
      const state = command.state;
      const ratio = Math.fround(state.currentLife / 1000);
      const primary = Math.fround(Math.min(ratio, 1));
      const secondary = Math.fround(Math.max(ratio - 1, 0));
      return objectRole === "hud-life" && exactKeys(state, [
        "color", "currentLife", "label", "lifeUpperLimit", "playerMaxLife",
        "primaryFill", "secondaryFill", "singleGameOver", "warning",
      ]) &&
        isUInt32(state.currentLife) && isUInt32(state.playerMaxLife) && state.playerMaxLife > 0 &&
        isUInt32(state.lifeUpperLimit) && state.currentLife <= state.lifeUpperLimit &&
        state.singleGameOver === (state.currentLife === 0) &&
        state.warning === (primary <= Math.fround(0.25)) &&
        state.color === (primary <= Math.fround(0.2) ? "danger" : "normal") &&
        state.label === `${state.currentLife}/${state.playerMaxLife}` &&
        validateRenderFloat32(state.primaryFill) && state.primaryFill.value === primary &&
        validateRenderFloat32(state.secondaryFill) && state.secondaryFill.value === secondary;
    }
    case "add-score": {
      const state = command.state;
      return objectRole === "hud-add-score" && exactKeys(state, ["depth", "poolIndex", "value"]) &&
        isUInt32(state.value) && state.value > 0 &&
        Number.isInteger(state.poolIndex) && state.poolIndex >= 0 && state.poolIndex < 4 &&
        Number.isInteger(state.depth) && state.depth >= 0 && state.depth < 8;
    }
    case "habahiro-flash": {
      const state = command.state;
      return objectRole === "habahiro-flash" && exactKeys(state, ["phase", "progress"]) &&
        state.phase === "flash-start" && validateRenderFloat32(state.progress) && state.progress.value === 0;
    }
    case "fidelity-label": {
      const state = command.state;
      return objectRole === "fidelity-label" && state.label === RenderFidelityLabel && state.visible === true && (
        exactKeys(state, ["label", "visible"]) ||
        exactKeys(state, ["absolutePosition", "label", "laneChangePhase", "visible"]) &&
          "absolutePosition" in state && Number.isInteger(state.absolutePosition) && state.absolutePosition >= 0 &&
          (state.laneChangePhase === "flash-start" || state.laneChangePhase === "change-lane" || state.laneChangePhase === "complete")
      );
    }
  }
}

export function animationBindingMatchesProfile(
  role: RenderAnimationRole,
  spriteExactKey: string | null,
  profile: RenderResourceProfile["ordinaryVisibleProfile"],
): boolean {
  if (role !== "note-flick" && role !== "note-directional-flick" && role !== "note-long-flash") {
    return true;
  }
  if (profile === undefined || spriteExactKey === null) return false;
  if (role === "note-flick") return spriteExactKey === profile.noteAnimations.directionalSpriteKeys.up ||
    /^note_flick_top(?:_[23])?$/.test(spriteExactKey);
  if (role === "note-directional-flick") {
    return spriteExactKey === profile.noteAnimations.directionalSpriteKeys.left ||
      spriteExactKey === profile.noteAnimations.directionalSpriteKeys.right ||
      /^note_flick_[lr]_[0-6]$/.test(spriteExactKey);
  }
  return spriteExactKey.startsWith(profile.noteAnimations.longFlashSpritePrefix);
}

export function animationRoleMatchesObject(
  role: RenderAnimationRole,
  objectRole: string | undefined,
): boolean {
  return (role === "note-flick" || role === "note-directional-flick") ? objectRole === "note-icon" :
    role === "note-long-flash" ? objectRole === "note-intermediate" :
    (role === "combo" || role === "all-perfect") ? objectRole === "hud-combo" :
    role === "add-score" ? objectRole === "hud-add-score" :
    role === "result" ? objectRole === "hud-result" :
    (role === "life-warning" || role === "life-game-over") ? objectRole === "hud-life" :
    role === "score-gauge-ss" ? objectRole === "hud-score" :
    role === "habahiro-lane-change" ? objectRole === "habahiro-flash" : false;
}

export function freezeTypedHudState<T extends SetHudCommand["state"]>(state: T): T {
  const frozen: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    frozen[key] = value !== null && typeof value === "object"
      ? Object.freeze({ ...value })
      : value;
  }
  return Object.freeze(frozen) as unknown as T;
}

function spriteObjectRole(role: RenderObjectRole): boolean {
  return role === "note-root" || role === "note-head" || role === "note-icon" ||
    role === "note-intermediate" || role === "note-side-visual" ||
    role === "field-line" || role === "judge-line" || role === "tap-lane-effect";
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isUInt32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;
}

function isOrdinaryScoreRank(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 5;
}

function isScoreMeterKey(value: unknown): value is string {
  return value === "score_meter_blue" || value === "score_meter_green" ||
    value === "score_meter_orange" || value === "score_meter_pink" || value === "score_meter_s";
}

function validScoringUnitCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 0x7fffffff &&
    10_000_000 + (value as number) <= 0xffffffff;
}

function scoreRank(score: number): number {
  if (score < 375_000) return 4;
  if (score < 2_250_000) return 3;
  if (score < 4_500_000) return 2;
  if (score < 6_750_000) return 1;
  if (score < 9_000_000) return 0;
  return 5;
}

function expectedRankMarkerX(score: number, scoreMax: number): number {
  return Math.fround(Math.fround(41) + Math.fround(
    Math.fround(Math.fround(score) * Math.fround(421)) / Math.fround(scoreMax),
  ));
}

function scoreMeterKeyForRank(rank: number): string {
  if (rank === 4) return "score_meter_blue";
  if (rank === 3) return "score_meter_green";
  if (rank === 2) return "score_meter_orange";
  if (rank === 1) return "score_meter_pink";
  return "score_meter_s";
}

function expectedScoreText(score: number): string {
  const digits = String(score);
  return `[BEBEBE]${"0".repeat(Math.max(8 - Math.max(1, digits.length), 0))}[-][FF3B72]${digits}[-]`;
}

function expectedScoreRatio(score: number, scoreMax: number): number {
  return Math.fround(Math.fround(score) / Math.fround(scoreMax));
}

function expectedScoreIndicatorX(ratio: number): number {
  return ratio >= 1 ? 422 : Math.trunc(Math.fround(ratio * Math.fround(422)));
}
