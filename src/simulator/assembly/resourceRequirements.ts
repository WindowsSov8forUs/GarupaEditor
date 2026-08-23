import type { ChartConstructionResult } from "../engine/chart/types";
import type { ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import type { SimulatorResourceRequirement } from "../platform/resourceContracts";

export type SelectedSkinResourceRole =
  | "note"
  | "field"
  | "tap-effect"
  | "habahiro-change-flash"
  | "background"
  | "tap-se"
  | "directional-note"
  | "directional-effect"
  | "directional-se"
  | "judge";

export interface SelectedSkinResourceIdentity {
  readonly role: SelectedSkinResourceRole;
  readonly logicalResource: string;
}

export interface SelectedSkinResourceInventory {
  readonly recipeIdentity: string;
  readonly resolved: ResolvedOriginalSkinRecipe;
  readonly resources: readonly SelectedSkinResourceIdentity[];
}

export interface SimulatorResourceSelection {
  readonly schemaVersion: 1;
  readonly renderingKind: "ordinary" | "habahiro";
  readonly skin: SelectedSkinResourceInventory;
  readonly requirements: readonly SimulatorResourceRequirement[];
}

const COMMON_REQUIREMENTS: readonly SimulatorResourceRequirement[] = Object.freeze([
  requirement("render.ordinary-profile", "portable/profiles/ordinary-render", ["profile.json"]),
  requirement("render.ordinary-visible-profile", "portable/profiles/ordinary-visible", ["profile.json"]),
  requirement("render.combo", "atlas/bms/ui/iconcombonumber", ["combo-number.png"]),
  requirement("render.rhythm-game-ui", "atlas/bms/ui/rhythmgameui", ["rhythm-game-additive.png", "rhythm-game-ui.png"]),
  requirement("render.tap-lane-effect", "atlas/bms/ui/tap-lane-effect", [
    "tap-lane-effect-1.png", "tap-lane-effect-2.png", "tap-lane-effect-3.png", "tap-lane-effect-4.png",
  ]),
  requirement("render.ui-additive-effect", "atlas/bms/ui/ui-additive-effect", ["ui-additive-effect.png"]),
  requirement("render.ui-common", "atlas/bms/ui/uicommon", ["ui-common.png"]),
  requirement("render.score-font", "fonts/score/score", ["score-font.png"]),
  requirement("render.rank-label-font", "fonts/sgm", ["rank-label-font.ttf"]),
  requirement("render.startup-information", "prefabs/bms/information", ["startup-line-star.png"]),
  requirement("render.pause", "prefabs/bms/pause", ["countdown-1.png", "countdown-2.png", "countdown-3.png"]),
  requirement("render.score-gauge", "prefabs/bms/rhythmgamegauge/score", [
    "high-rank-kira.png", "high-rank-long-star.png", "high-rank-overlay.png", "score-gauge-ss-animation-profile.json",
  ]),
  requirement("audio.common", "sound/common", [
    "SE_RHYTHM_CLEAR.mp3", "SE_RHYTHM_FULLCOMBO.mp3", "SE_RHYTHM_GAYA.mp3",
    "SE_RHYTHM_TAP_SKILL.mp3", "bad.mp3", "miss.mp3",
  ]),
]);

export function selectSimulatorResourceRequirements(
  chart: ChartConstructionResult,
  skinRecipe: ResolvedOriginalSkinRecipe,
): SimulatorResourceSelection {
  const skin = selectResolvedSkinResourceInventory(skinRecipe);
  const requirements = [
    ...COMMON_REQUIREMENTS,
    ...skin.resources.map((resource) => requirement(
      `skin.${resource.role}`,
      resource.logicalResource,
      null,
    )),
  ];
  return Object.freeze({
    schemaVersion: 1 as const,
    renderingKind: chart.habahiroChangeAbsolutePos >= 0 ? "habahiro" as const : "ordinary" as const,
    skin,
    requirements: Object.freeze(requirements),
  });
}

export function selectResolvedSkinResourceInventory(
  recipe: ResolvedOriginalSkinRecipe,
): SelectedSkinResourceInventory {
  const rows: Array<readonly [SelectedSkinResourceRole, string | null]> = [
    ["note", recipe.note.logicalResource],
    ["field", recipe.field.logicalResource],
    ["tap-effect", recipe.tapEffect.logicalResource],
    ["habahiro-change-flash", recipe.chartMode === "habahiro" ? "ingameskin/tapeffect/habahiro" : null],
    ["background", recipe.background.logicalResource],
    ["tap-se", recipe.tapSE.logicalResource],
    ["directional-note", recipe.directional.noteLogicalResource],
    ["directional-effect", recipe.directional.effectLogicalResource],
    ["directional-se", recipe.directional.seLogicalResource],
    ["judge", recipe.judge.logicalResource],
  ];
  const seen = new Set<string>();
  const resources: SelectedSkinResourceIdentity[] = [];
  for (const [role, logicalResource] of rows) {
    if (logicalResource === null) continue;
    const identity = `${role}\u0000${logicalResource}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    resources.push(Object.freeze({ role, logicalResource }));
  }
  return Object.freeze({
    recipeIdentity: recipe.identity,
    resolved: recipe,
    resources: Object.freeze(resources),
  });
}

function requirement(
  semanticRole: string,
  logicalResource: string,
  requiredFiles: readonly string[] | null,
): SimulatorResourceRequirement {
  return Object.freeze({
    semanticRole,
    logicalResource,
    requiredFiles: requiredFiles === null ? null : Object.freeze(requiredFiles),
  });
}
