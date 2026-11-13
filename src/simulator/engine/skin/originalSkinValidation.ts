import { integrityFailure, ok, type SimulatorResult } from "../result";
import type {
  OriginalSkinComponentRoute,
  ResolvedDirectionalSkinComponent,
  ResolvedNoteSkinComponent,
  ResolvedOriginalSkinRecipe,
  ResolvedSkinComponent,
  OriginalSkinSettings,
  OriginalSkinSpecialComponentStates,
  OriginalSkinSpecialSelection,
} from "./contracts";
import { findCurrentSpecialSkin } from "./currentMasterCatalog";

const ROOT_KEYS =
  "directionalFlick,directionalFlickEffect,fieldSkin,isFixedBG,judgeSE,noteSkin,special,tapEffect";
const COMPONENT_KEYS =
  "background,directionalFlickIcon,judge,laneAndLine,rhythmIcon,soundEffect,tapEffect";

export function validateAndFreezeOriginalSkinSettings(
  value: unknown,
): SimulatorResult<OriginalSkinSettings> {
  if (!record(value) || !hasRequiredKeys(value, ROOT_KEYS) ||
    !integerRange(value.noteSkin, 0, 6) ||
    !integerRange(value.fieldSkin, 0, 14) ||
    !integerRange(value.tapEffect, 0, 4) ||
    !integerRange(value.judgeSE, 0, 3) ||
    !integerRange(value.directionalFlick, 0, 4) ||
    !integerRange(value.directionalFlickEffect, 0, 1) ||
    typeof value.isFixedBG !== "boolean") {
    return invalid();
  }
  const special = validateSpecial(value.special);
  if (special === null) return invalid();
  return ok(Object.freeze({
    noteSkin: value.noteSkin,
    fieldSkin: value.fieldSkin,
    tapEffect: value.tapEffect,
    judgeSE: value.judgeSE,
    directionalFlick: value.directionalFlick,
    directionalFlickEffect: value.directionalFlickEffect,
    isFixedBG: value.isFixedBG,
    special,
  }));
}

function validateSpecial(value: unknown): OriginalSkinSpecialSelection | null {
  if (!record(value)) return null;
  if (value.kind === "none") return Object.freeze({ kind: "none" as const });
  const kind = value.kind === "collabo" || value.kind === "limited"
    ? value.kind
    : null;
  if (kind === null) return null;
  const idKey = kind === "collabo" ? "seasonSpecialId" : "limitedSkinId";
  const selectionId = value[idKey];
  if (!hasRequiredKeys(value, `components,kind,${idKey}`) ||
    !Number.isSafeInteger(selectionId) ||
    findCurrentSpecialSkin(kind, selectionId as number) === null) {
    return null;
  }
  const components = validateComponents(value.components);
  if (components === null) return null;
  return kind === "collabo"
    ? Object.freeze({ kind, seasonSpecialId: selectionId as number, components })
    : Object.freeze({ kind, limitedSkinId: selectionId as number, components });
}

function validateComponents(value: unknown): OriginalSkinSpecialComponentStates | null {
  if (!record(value) || !hasRequiredKeys(value, COMPONENT_KEYS) ||
    !COMPONENT_KEYS.split(",").every((key) => value[key] === "on" || value[key] === "off")) {
    return null;
  }
  return Object.freeze({
    laneAndLine: value.laneAndLine as "on" | "off",
    tapEffect: value.tapEffect as "on" | "off",
    rhythmIcon: value.rhythmIcon as "on" | "off",
    background: value.background as "on" | "off",
    soundEffect: value.soundEffect as "on" | "off",
    judge: value.judge as "on" | "off",
    directionalFlickIcon: value.directionalFlickIcon as "on" | "off",
  });
}

const RECIPE_KEYS =
  "backgroundMode,background,chartMode,directional,field,identity,judge,note,selectedSpecial,tapEffect,tapSE";
const COMPONENT_ROUTES: readonly OriginalSkinComponentRoute[] = [
  "normal", "default", "special", "habahiro", "presentation-background", "practice-background", "mv-video",
];

/**
 * Shape check for a Skin recipe the main program already resolved. The Simulator does no catalog lookup: it only
 * requires every component, route and logical resource to be well formed, and copies the recipe frozen.
 */
export function validateAndFreezeResolvedSkinRecipe(
  value: unknown,
): SimulatorResult<ResolvedOriginalSkinRecipe> {
  if (!record(value) || !hasRequiredKeys(value, RECIPE_KEYS) || typeof value.identity !== "string" ||
    value.identity.length === 0 ||
    (value.chartMode !== "ordinary" && value.chartMode !== "habahiro") ||
    (value.backgroundMode !== "standard" && value.backgroundMode !== "mv")) {
    return invalidRecipe();
  }
  const selected = value.selectedSpecial;
  const selectedSpecial = !record(selected) ? null
    : selected.kind === "none" ? Object.freeze({ kind: "none" as const })
      : (selected.kind === "collabo" || selected.kind === "limited") && Number.isSafeInteger(selected.selectionId)
        ? Object.freeze({ kind: selected.kind, selectionId: selected.selectionId as number })
        : null;
  const note = resolvedComponent(value.note);
  const field = resolvedComponent(value.field);
  const tapEffect = resolvedComponent(value.tapEffect);
  const background = resolvedComponent(value.background);
  const tapSE = resolvedComponent(value.tapSE);
  const judge = resolvedComponent(value.judge);
  const directional = resolvedComponent(value.directional);
  if (selectedSpecial === null || note === null || field === null || tapEffect === null || background === null ||
    tapSE === null || judge === null || directional === null) {
    return invalidRecipe();
  }
  const rawNote = value.note as Record<string, unknown>;
  const rawDirectional = value.directional as Record<string, unknown>;
  if (typeof rawNote.noteSyncEdgeMargin !== "number" || !Number.isFinite(rawNote.noteSyncEdgeMargin) ||
    (rawDirectional.effectSetting !== 0 && rawDirectional.effectSetting !== 1) ||
    (rawDirectional.effectVariant !== "normal" && rawDirectional.effectVariant !== "light") ||
    !logicalResource(rawDirectional.noteLogicalResource) || !logicalResource(rawDirectional.effectLogicalResource) ||
    rawDirectional.seLogicalResource !== "sound/tapseskin/directionalflickskin00") {
    return invalidRecipe();
  }
  return ok(Object.freeze({
    identity: value.identity,
    chartMode: value.chartMode,
    backgroundMode: value.backgroundMode,
    selectedSpecial,
    note: Object.freeze({ ...note, noteSyncEdgeMargin: Math.fround(rawNote.noteSyncEdgeMargin) }) as ResolvedNoteSkinComponent,
    field,
    tapEffect,
    background,
    tapSE,
    directional: Object.freeze({
      ...directional,
      effectSetting: rawDirectional.effectSetting,
      effectVariant: rawDirectional.effectVariant,
      noteLogicalResource: rawDirectional.noteLogicalResource as string,
      effectLogicalResource: rawDirectional.effectLogicalResource as string,
      seLogicalResource: rawDirectional.seLogicalResource,
    }) as ResolvedDirectionalSkinComponent,
    judge,
  }));
}

function resolvedComponent(value: unknown): ResolvedSkinComponent | null {
  if (!record(value) || !hasRequiredKeys(value, "bundleName,logicalResource,route") ||
    !COMPONENT_ROUTES.includes(value.route as OriginalSkinComponentRoute) ||
    (value.bundleName !== null && (typeof value.bundleName !== "string" || value.bundleName.length === 0)) ||
    (value.logicalResource !== null && !logicalResource(value.logicalResource))) {
    return null;
  }
  return Object.freeze({
    route: value.route as OriginalSkinComponentRoute,
    bundleName: value.bundleName as string | null,
    logicalResource: value.logicalResource as string | null,
  });
}

function logicalResource(value: unknown): value is string {
  // Bundle names of master-derived limited skins are not restricted further than path-safe characters.
  return typeof value === "string" && /^(ingameskin|sound)\/[a-z0-9_]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function invalidRecipe(): ReturnType<typeof integrityFailure> {
  return integrityFailure(
    "skin.invalid-resolved-recipe",
    "The resolved Skin recipe requires one identity, exact chart/background routes, a selected-special record and every component with a known route and well-formed logical resource.",
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasRequiredKeys(value: Record<string, unknown>, keys: string): boolean {
  return keys.split(",").every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function integerRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function invalid(): ReturnType<typeof integrityFailure> {
  return integrityFailure(
    "skin.invalid-original-settings",
    "Original Skin settings require the exact current persisted normal domains, one current aggregate identity and seven explicit On/Off states; independent Judge/resource identities are forbidden.",
  );
}
