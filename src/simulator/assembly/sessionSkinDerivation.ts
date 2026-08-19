import type { ChartConstructionResult } from "../engine/chart/types";
import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import type { SimulatorResult } from "../engine/evidence";
import type { ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";

export function deriveSessionSkinRecipe(
  request: SimulatorModuleLaunchRequest,
  mode: SimulatorModeIdentity,
  chart: ChartConstructionResult,
): SimulatorResult<ResolvedOriginalSkinRecipe> {
  return resolveOriginalSkinRecipe(
    request.config.skin,
    mode,
    chart.habahiroChangeAbsolutePos >= 0 ? "habahiro" : "ordinary",
    request.presentation.mv === null ? "standard" : "mv",
  );
}
