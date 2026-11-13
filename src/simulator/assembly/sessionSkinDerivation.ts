import type { ChartConstructionResult } from "../engine/chart/types";
import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { integrityFailure, ok, type SimulatorResult } from "../engine/result";
import type { ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";

/**
 * The main program resolves the Skin recipe (and any Judge atlas fallback) before launch. The session only checks
 * that the recipe was resolved for this chart route, background route and mode.
 */
export function deriveSessionSkinRecipe(
  request: SimulatorModuleLaunchRequest,
  mode: SimulatorModeIdentity,
  chart: ChartConstructionResult,
): SimulatorResult<ResolvedOriginalSkinRecipe> {
  const recipe = request.config.skin;
  const chartMode = chart.isMultiRangeNotes ? "habahiro" : "ordinary";
  const backgroundMode = request.presentation.mv === null ? "standard" : "mv";
  if (recipe.chartMode !== chartMode || recipe.backgroundMode !== backgroundMode) {
    return integrityFailure(
      "skin.resolved-recipe-route-mismatch",
      "The resolved Skin recipe must be resolved for this chart's ordinary/HAB route and this session's standard/MV background route.",
    );
  }
  if (mode.isEnablePractice && backgroundMode === "mv") {
    return integrityFailure(
      "skin.rehearsal-mv-unsupported",
      "Practice has no authorized MV Skin/background matrix row; it cannot inherit the Live movie route.",
    );
  }
  return ok(recipe);
}
