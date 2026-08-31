import type { ResolvedOriginalSkinRecipe } from "../../../engine/skin/contracts";
import {
  getCurrentSkinPortablePack,
  type CurrentSkinPortablePackEntry,
} from "./currentSkinTestManifest";

const SKIN_RESOURCE_NAMESPACE = "simulator-static/current-10.1.4/skin-portable" as const;

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
  readonly resourceKey: string;
  readonly profile: CurrentSkinPortablePackEntry | null;
}

export interface SelectedSkinResourceInventory {
  readonly recipeIdentity: string;
  readonly resolved: ResolvedOriginalSkinRecipe;
  readonly resources: readonly SelectedSkinResourceIdentity[];
}

export function selectResolvedSkinResourceInventory(
  recipe: ResolvedOriginalSkinRecipe,
): SelectedSkinResourceInventory {
  const rows: Array<readonly [SelectedSkinResourceRole, string | null]> = [
    ["note", recipe.note.logicalResource],
    ["field", recipe.field.logicalResource],
    ["tap-effect", recipe.tapEffect.logicalResource],
    ["habahiro-change-flash", recipe.chartMode === "habahiro"
      ? "ingameskin/tapeffect/habahiro"
      : null],
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
    resources.push(Object.freeze({
      role,
      logicalResource,
      resourceKey: skinPortableResourceKey(role, logicalResource),
      profile: getCurrentSkinPortablePack(logicalResource),
    }));
  }
  return Object.freeze({
    recipeIdentity: recipe.identity,
    resolved: recipe,
    resources: Object.freeze(resources),
  });
}

export function skinPortableResourceKey(
  role: SelectedSkinResourceRole,
  logicalResource: string,
): string {
  return `${SKIN_RESOURCE_NAMESPACE}/${encodeURIComponent(role)}/${encodeURIComponent(logicalResource).replace(/%2F/gi, "/")}`;
}
