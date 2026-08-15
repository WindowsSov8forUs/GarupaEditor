import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type { ScoreLifeStateProfile } from "./scoreLifeState";

const ORDINARY_SINGLE_PLAY_INITIAL_LIFE = 1000;
const ORDINARY_SINGLE_PLAY_PLAYER_MAX_LIFE = 1000;
const ORDINARY_SINGLE_PLAY_LIFE_UPPER_LIMIT = 2000;

export function createCurrentSinglePlayLifeProfile(
  isFullLength: unknown,
): SimulatorResult<ScoreLifeStateProfile["life"]> {
  if (typeof isFullLength !== "boolean") {
    return evidenceRequired(
      "score-life.invalid-full-length-classification",
      ["PLP-E03", "PLP-E04"],
      "The ordinary single-song Life owner requires the explicit resolved musicDataType == full boolean and never infers it from duration, BMS, filename or play mode.",
    );
  }
  return ok(Object.freeze({
    // PLP-E01/PLP-E02: ResetLife calls InitializeLife(1000, 2000, 1000).
    initialLife: ORDINARY_SINGLE_PLAY_INITIAL_LIFE,
    playerMaxLife: ORDINARY_SINGLE_PLAY_PLAYER_MAX_LIFE,
    lifeUpperLimit: ORDINARY_SINGLE_PLAY_LIFE_UPPER_LIMIT,
    // PLP-E03..PLP-E06: CalcDamage selects one exact profile before calculated-data publication.
    missDamage: isFullLength ? -50 : -100,
    badDamage: isFullLength ? -25 : -50,
  }));
}
