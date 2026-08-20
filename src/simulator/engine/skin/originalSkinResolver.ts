import type { SimulatorModeIdentity } from "../data/inGameCalculatedData";
import { validateSimulatorModeIdentity } from "../data/inGameCalculatedData";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type {
  OriginalSkinBackgroundMode,
  OriginalSkinChartMode,
  OriginalSkinFidelity,
  OriginalSkinSpecialComponentStates,
  ResolvedDirectionalSkinComponent,
  ResolvedNoteSkinComponent,
  ResolvedOriginalSkinRecipe,
  ResolvedSkinComponent,
  OriginalSkinSettings,
} from "./contracts";
import {
  CURRENT_NORMAL_DIRECTIONAL_SKINS,
  CURRENT_NORMAL_EFFECT_SKINS,
  CURRENT_NORMAL_LANE_SKINS,
  CURRENT_NORMAL_NOTE_SKINS,
  CURRENT_NORMAL_SOUND_SKINS,
  findCurrentSpecialSkin,
  type CurrentSpecialSkinMaster,
} from "./currentMasterCatalog";
import { validateAndFreezeOriginalSkinSettings } from "./originalSkinValidation";

export function resolveOriginalSkinRecipe(
  settingsInput: OriginalSkinSettings,
  modeInput: SimulatorModeIdentity,
  chartMode: OriginalSkinChartMode,
  backgroundMode: OriginalSkinBackgroundMode,
): SimulatorResult<ResolvedOriginalSkinRecipe> {
  const settings = validateAndFreezeOriginalSkinSettings(settingsInput);
  if (settings.status !== "ok") return settings;
  const mode = validateSimulatorModeIdentity(modeInput);
  if (mode.status !== "ok") return mode;
  if ((chartMode !== "ordinary" && chartMode !== "habahiro") ||
    (backgroundMode !== "standard" && backgroundMode !== "mv")) {
    return invalid("skin.invalid-route-domain", "Skin resolution requires one exact ordinary/HAB chart route and standard/MV background route.");
  }
  if (mode.value.isEnablePractice && backgroundMode === "mv") {
    return invalid(
      "skin.rehearsal-mv-unsupported",
      "Practice has no authorized MV Skin/background matrix row; it cannot inherit the Live movie route.",
    );
  }

  const normalNote = CURRENT_NORMAL_NOTE_SKINS[settings.value.noteSkin];
  const normalField = CURRENT_NORMAL_LANE_SKINS[settings.value.fieldSkin];
  const normalEffect = CURRENT_NORMAL_EFFECT_SKINS[settings.value.tapEffect];
  const normalSound = CURRENT_NORMAL_SOUND_SKINS[settings.value.judgeSE];
  const normalDirectional = CURRENT_NORMAL_DIRECTIONAL_SKINS[settings.value.directionalFlick];
  if (!normalNote || !normalField || !normalEffect || !normalSound || !normalDirectional) {
    return invalid("skin.normal-master-missing", "Every validated normal setting must resolve to its exact current master row without clamp or fallback.");
  }

  let specialMaster: CurrentSpecialSkinMaster | null = null;
  let components: OriginalSkinSpecialComponentStates | null = null;
  let selectedSpecial: ResolvedOriginalSkinRecipe["selectedSpecial"] = Object.freeze({ kind: "none" });
  if (settings.value.special.kind !== "none") {
    const selectionId = settings.value.special.kind === "collabo"
      ? settings.value.special.seasonSpecialId
      : settings.value.special.limitedSkinId;
    specialMaster = findCurrentSpecialSkin(settings.value.special.kind, selectionId);
    if (specialMaster === null) {
      return invalid("skin.special-master-missing", "The aggregate selection must resolve in exactly one current Collabo/Limited master map.");
    }
    if (!specialMaster.selectable) {
      return invalid(
        "skin.special-package-unavailable",
        "The expired Collaboration package is rejected as a whole because its six legacy resources are unavailable; reissued aliases and partial application are forbidden.",
      );
    }
    components = settings.value.special.components;
    selectedSpecial = Object.freeze({ kind: settings.value.special.kind, selectionId });
  }

  const practice = mode.value.isEnablePractice;
  const eligible = !practice;
  const specialNote = eligible && specialMaster?.notesBundleName !== null &&
    components?.rhythmIcon === "on";
  const specialField = eligible && specialMaster?.laneBundleName !== null &&
    components?.laneAndLine === "on";
  const specialEffect = eligible && specialMaster?.effectBundleName !== null &&
    components?.tapEffect === "on";
  const specialBackground = eligible && specialMaster?.backgroundBundleName !== null &&
    components?.background === "on";
  const specialSound = eligible && specialMaster?.soundEffectBundleName !== null &&
    components?.soundEffect === "on";
  const specialDirectional = eligible && specialMaster?.directionalBundleName !== null &&
    components?.directionalFlickIcon === "on";
  const specialJudge = eligible && !mode.value.isAutoLive && specialMaster?.judgeBundleName !== null &&
    components?.judge === "on";

  const noteBundle = chartMode === "habahiro"
    ? "habahiro"
    : specialNote
      ? specialMaster!.notesBundleName!
      : normalNote.bundleName;
  const note: ResolvedNoteSkinComponent = Object.freeze({
    route: chartMode === "habahiro" ? "habahiro" : specialNote ? "special" : "normal",
    bundleName: noteBundle,
    logicalResource: `ingameskin/noteskin/${noteBundle}`,
    noteSyncEdgeMargin: chartMode === "habahiro"
      ? Math.fround(0)
      : specialNote
        ? specialMaster!.noteSyncEdgeMargin
        : normalNote.noteSyncEdgeMargin,
  });

  const fieldBundle = chartMode === "habahiro"
    ? "habahiro"
    : specialField
      ? specialMaster!.laneBundleName!
      : normalField.bundleName;
  const field = component(
    chartMode === "habahiro" ? "habahiro" : specialField ? "special" : "normal",
    fieldBundle,
    `ingameskin/fieldskin/${fieldBundle}`,
  );

  const effectBundle = specialEffect ? specialMaster!.effectBundleName! : normalEffect.bundleName;
  const tapEffect = component(
    specialEffect ? "special" : "normal",
    effectBundle,
    `ingameskin/tapeffect/${effectBundle}`,
  );

  const background = resolveBackground(
    backgroundMode,
    chartMode,
    practice,
    specialBackground ? specialMaster!.backgroundBundleName! : null,
  );

  const soundBundle = specialSound ? specialMaster!.soundEffectBundleName! : normalSound.bundleName;
  const tapSE = component(
    specialSound ? "special" : "normal",
    soundBundle,
    `sound/tapseskin/${soundBundle}`,
  );

  const directionalBundle = specialDirectional
    ? specialMaster!.directionalBundleName!
    : normalDirectional.bundleName;
  const effectSetting = settings.value.directionalFlickEffect === 0 ? 0 as const : 1 as const;
  const effectVariant = effectSetting === 0 ? "normal" : "light";
  const directional: ResolvedDirectionalSkinComponent = Object.freeze({
    route: specialDirectional ? "special" : "normal",
    bundleName: directionalBundle,
    logicalResource: `ingameskin/noteskin/directionalflick${directionalBundle}`,
    effectSetting,
    effectVariant,
    noteLogicalResource: `ingameskin/noteskin/directionalflick${directionalBundle}`,
    effectLogicalResource: `ingameskin/tapeffect/directionalflick${directionalBundle}${effectVariant}`,
    seLogicalResource: "sound/tapseskin/directionalflickskin00",
  });

  const judgeBundle = chartMode === "habahiro"
    ? "habahiro"
    : specialJudge
      ? specialMaster!.judgeBundleName!
      : "skin00";
  const judge = component(
    chartMode === "habahiro" ? "habahiro" : specialJudge ? "special" : "default",
    judgeBundle,
    `ingameskin/judgeskin/${judgeBundle}`,
  );
  const fidelity: OriginalSkinFidelity = settings.value.special.kind !== "none"
    ? "special-current-static-portable"
    : isDefaultNormalSettings(settings.value)
      ? "default-current"
      : "normal-current-static-portable";

  const partial = {
    fidelity,
    chartMode,
    backgroundMode,
    selectedSpecial,
    note,
    field,
    tapEffect,
    background,
    tapSE,
    directional,
    judge,
  } as const;
  return ok(Object.freeze({
    identity: canonicalIdentity(settings.value, partial),
    ...partial,
  }));
}

function resolveBackground(
  backgroundMode: OriginalSkinBackgroundMode,
  chartMode: OriginalSkinChartMode,
  practice: boolean,
  specialBundle: string | null,
): ResolvedSkinComponent {
  if (backgroundMode === "mv") return component("mv-video", null, null);
  if (practice) return component("practice-background", null, null);
  if (chartMode === "habahiro") {
    return component("habahiro", "habahiro", "ingameskin/bgskin/habahiro");
  }
  if (specialBundle !== null) {
    return component("special", specialBundle, `ingameskin/bgskin/${specialBundle}`);
  }
  return component("presentation-background", null, null);
}

function component(
  route: ResolvedSkinComponent["route"],
  bundleName: string | null,
  logicalResource: string | null,
): ResolvedSkinComponent {
  return Object.freeze({ route, bundleName, logicalResource });
}

function isDefaultNormalSettings(settings: OriginalSkinSettings): boolean {
  return settings.noteSkin === 0 && settings.fieldSkin === 0 && settings.tapEffect === 0 &&
    settings.judgeSE === 0 && settings.directionalFlick === 0 &&
    settings.directionalFlickEffect === 0;
}

function canonicalIdentity(
  settings: OriginalSkinSettings,
  value: Omit<ResolvedOriginalSkinRecipe, "identity">,
): string {
  const special = value.selectedSpecial.kind === "none"
    ? "none"
    : `${value.selectedSpecial.kind}:${value.selectedSpecial.selectionId}`;
  return [
    "skin-recipe-v1",
    value.fidelity,
    `chart:${value.chartMode}`,
    `background-mode:${value.backgroundMode}`,
    `fixed-bg:${settings.isFixedBG ? 1 : 0}`,
    `special:${special}`,
    identityPart("note", value.note.route, value.note.bundleName),
    `note-margin:${float32Bits(value.note.noteSyncEdgeMargin)}`,
    identityPart("field", value.field.route, value.field.bundleName),
    identityPart("tap-effect", value.tapEffect.route, value.tapEffect.bundleName),
    identityPart("background", value.background.route, value.background.bundleName),
    identityPart("tap-se", value.tapSE.route, value.tapSE.bundleName),
    identityPart("directional", value.directional.route, value.directional.bundleName),
    `directional-effect:${value.directional.effectVariant}`,
    `directional-se:${value.directional.seLogicalResource}`,
    identityPart("judge", value.judge.route, value.judge.bundleName),
  ].join("|");
}

function identityPart(name: string, route: string, bundle: string | null): string {
  return `${name}:${route}:${bundle ?? "none"}`;
}

function float32Bits(value: number): string {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, true);
  return `0x${view.getUint32(0, true).toString(16).toUpperCase().padStart(8, "0")}`;
}

function invalid(capability: string, boundary: string): ReturnType<typeof evidenceRequired> {
  return evidenceRequired(capability, [], boundary);
}
