import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type {
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
  if (!record(value) || Object.keys(value).sort().join(",") !== ROOT_KEYS ||
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
  if (value.kind === "none") {
    return Object.keys(value).join(",") === "kind"
      ? Object.freeze({ kind: "none" as const })
      : null;
  }
  const kind = value.kind === "collabo" || value.kind === "limited"
    ? value.kind
    : null;
  if (kind === null) return null;
  const idKey = kind === "collabo" ? "seasonSpecialId" : "limitedSkinId";
  const selectionId = value[idKey];
  if (Object.keys(value).sort().join(",") !== `components,kind,${idKey}` ||
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
  if (!record(value) || Object.keys(value).sort().join(",") !== COMPONENT_KEYS ||
    !Object.values(value).every((state) => state === "on" || state === "off")) {
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

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integerRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function invalid(): ReturnType<typeof evidenceRequired> {
  return evidenceRequired(
    "skin.invalid-original-settings",
    [],
    "Original Skin settings require the exact current persisted normal domains, one current aggregate identity and seven explicit On/Off states; independent Judge/resource identities are forbidden.",
  );
}
