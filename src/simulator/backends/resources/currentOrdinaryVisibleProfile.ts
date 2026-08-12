export type OrdinaryVisibleClipId =
  | "note-flick-up"
  | "note-flick-left"
  | "note-flick-right"
  | "note-long-flash"
  | "combo-scale"
  | "combo-all-perfect";

export interface OrdinaryVisibleCurveKey {
  readonly time: number;
  readonly coefficients: readonly [number, number, number, number];
}

export type OrdinaryVisibleCurve =
  | { readonly index: number; readonly channel: string; readonly storage: "streamed"; readonly keys: readonly OrdinaryVisibleCurveKey[] }
  | { readonly index: number; readonly channel: string; readonly storage: "constant"; readonly value: number };

export interface OrdinaryVisibleClip {
  readonly clipId: OrdinaryVisibleClipId;
  readonly owner: "note-icon" | "long-flash-icon" | "combo-root" | "combo-ap-sprites";
  readonly durationSeconds: number;
  readonly loop: boolean;
  readonly curves: readonly OrdinaryVisibleCurve[];
}

interface SpriteSceneProfile {
  readonly key: string;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number];
  readonly depth: number;
}

export interface OrdinaryVisibleProfile {
  readonly schemaVersion: 1;
  readonly status: "confirmed-current-ordinary-visible-rendering-portable-profile";
  readonly noteAnimations: {
    readonly iconOwnerKey: "note_flick_top";
    readonly directionalSpriteKeys: Readonly<Record<"up" | "left" | "right", string>>;
    readonly longFlashSpritePrefix: "note_long_flash_";
    readonly clips: readonly OrdinaryVisibleClip[];
    readonly pausePolicy: "owner-clock-does-not-advance";
    readonly resetPolicy: "child-first-reset-initial-channels-and-clock";
  };
  readonly combo: {
    readonly rootPosition: readonly [number, number, number];
    readonly maxDigits: 4;
    readonly order: "least-significant-first";
    readonly alignment: "center";
    readonly padding: -12;
    readonly digitSize: readonly [82, 116];
    readonly digitStep: 70;
    readonly numberLocalPosition: readonly [number, number, number];
    readonly unit: { readonly normal: "combo"; readonly allPerfect: "combo_AP"; readonly localPosition: readonly [-6, -72, 0]; readonly size: readonly [150, 42] };
    readonly clips: readonly OrdinaryVisibleClip[];
  };
  readonly addScore: {
    readonly poolSize: 4;
    readonly depthCycle: 8;
    readonly selection: "round-robin-ready-owner";
    readonly rootPosition: readonly [number, number, number];
    readonly scale: number;
    readonly digits: { readonly plus: "icon_number_plus"; readonly prefix: "icon_number_"; readonly size: readonly [47, 70]; readonly order: "least-significant-first"; readonly alignment: "center" };
    readonly start: { readonly alpha: 0.6; readonly localY: -50 };
    readonly phaseSeconds: number;
    readonly phases: readonly ["alpha=0.2+0.8*progress,y+=8", "alpha=1,y+=1", "alpha=1-progress,y+=1"];
  };
  readonly result: {
    readonly rootPosition: readonly [number, number, number];
    readonly judgeSize: readonly [288, 80];
    readonly timingSize: readonly [80, 26];
    readonly timingLocalPosition: readonly [4, -38, 0];
    readonly routes: Readonly<Record<"auto" | "miss" | "bad" | "good" | "great" | "perfect", string>>;
    readonly timingRoutes: { readonly none: null; readonly fast: "judge_fast"; readonly slow: "judge_slow" };
    readonly visibleSeconds: 1;
    readonly alpha: 1;
    readonly fadeAllowed: false;
  };
  readonly life: {
    readonly rootPosition: readonly [411, 309, 0];
    readonly primaryFormula: "min(currentLife/1000,1)";
    readonly secondaryFormula: "max(currentLife/1000-1,0)";
    readonly dangerThreshold: number;
    readonly warningThreshold: number;
    readonly colorsF32Bits: Readonly<Record<"normal" | "danger" | "gameOverBase", readonly [string, string, string, string]>>;
    readonly warning: { readonly visible: "primary<=0.25"; readonly spriteEnabled: "visible-and-no-damage-guard"; readonly damageGuardReachable: false };
    readonly label: { readonly fontLogicalAssetId: "hud/score/rank-label-font"; readonly position: readonly [number, number, number]; readonly size: 24; readonly depth: 42; readonly format: "current/max" };
    readonly sprites: Readonly<Record<"gauge_base" | "primary" | "second" | "warning_outline" | "warning_body" | "game_over_background", SpriteSceneProfile>>;
    readonly gameOverOrder: readonly ["update-primary", "update-secondary", "update-label", "update-color", "show-bg-no-health", "update-warning"];
  };
  readonly habahiro: { readonly commonHudAuthorized: true; readonly commonNoteAnimationOnExternalAtlasAuthorized: false; readonly directionalAlias: "portable-external-parser-disposition-only-not-original-sprite-identity"; readonly missingAnimationDisposition: "evidence-required" };
  readonly reserveTotalScore: { readonly accessorCallersInCurrentManagedText: 0; readonly portableConsumer: null; readonly disposition: "remove-unconsumed-portable-field-not-original-absence-claim" };
}

const ROOT_KEYS = ["addScore", "blockingFindings", "combo", "evidenceIds", "excluded", "habahiro", "life", "noteAnimations", "reserveTotalScore", "result", "sample", "schemaVersion", "status", "unknownFields"];
const CLIP_IDS: readonly OrdinaryVisibleClipId[] = ["note-flick-up", "note-flick-left", "note-flick-right", "note-long-flash", "combo-scale", "combo-all-perfect"];
const CLIP_OWNERS = ["note-icon", "note-icon", "note-icon", "long-flash-icon", "combo-root", "combo-ap-sprites"] as const;
const CLIP_DURATIONS = [0.3333333432674408, 0.3333333432674408, 0.3333333432674408, 0.8333333134651184, 1, 0.8333333134651184] as const;
const CLIP_LOOPS = [true, true, true, true, false, true] as const;
const CLIP_CURVE_COUNTS = [6, 6, 6, 4, 3, 20] as const;

export function parseCurrentOrdinaryVisibleProfile(value: unknown): OrdinaryVisibleProfile | null {
  if (!record(value) || !exactKeys(value, ROOT_KEYS) || value.schemaVersion !== 1 ||
    value.status !== "confirmed-current-ordinary-visible-rendering-portable-profile" ||
    !record(value.sample) || !exactKeys(value.sample, ["abi", "package", "versionCode", "versionName"]) ||
    value.sample.package !== "jp.co.craftegg.band" || value.sample.versionName !== "10.1.4" || value.sample.versionCode !== 230 || value.sample.abi !== "arm64-v8a" ||
    !emptyArray(value.unknownFields) || !emptyArray(value.blockingFindings) ||
    !validateNote(value.noteAnimations) || !validateCombo(value.combo) || !validateAddScore(value.addScore) ||
    !validateResult(value.result) || !validateLife(value.life) || !validateHabahiro(value.habahiro) || !validateReserve(value.reserveTotalScore)
  ) return null;
  return deepFreeze(value) as unknown as OrdinaryVisibleProfile;
}

function validateNote(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, ["clips", "directionalSpriteKeys", "iconOwnerKey", "longFlashSpritePrefix", "pausePolicy", "resetPolicy"]) ||
    value.iconOwnerKey !== "note_flick_top" || value.pausePolicy !== "owner-clock-does-not-advance" || value.resetPolicy !== "child-first-reset-initial-channels-and-clock" ||
    !record(value.directionalSpriteKeys) || !exactKeys(value.directionalSpriteKeys, ["left", "right", "up"]) ||
    value.directionalSpriteKeys.up !== "note_flick_top" || value.directionalSpriteKeys.left !== "note_flick_top_l" || value.directionalSpriteKeys.right !== "note_flick_top_r" ||
    value.longFlashSpritePrefix !== "note_long_flash_" || !Array.isArray(value.clips) || value.clips.length !== 4
  ) return false;
  return value.clips.every((clip, index) => validateClip(clip, index));
}

function validateCombo(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, ["alignment", "clips", "digitSize", "digitStep", "maxDigits", "numberLocalPosition", "order", "padding", "rootPosition", "unit"]) ||
    value.maxDigits !== 4 || value.order !== "least-significant-first" || value.alignment !== "center" || value.padding !== -12 || value.digitStep !== 70 ||
    !tuple(value.digitSize, [82, 116]) || !finiteTuple(value.rootPosition, 3) || !finiteTuple(value.numberLocalPosition, 3) ||
    !record(value.unit) || !exactKeys(value.unit, ["allPerfect", "localPosition", "normal", "size"]) || value.unit.normal !== "combo" || value.unit.allPerfect !== "combo_AP" || !tuple(value.unit.localPosition, [-6, -72, 0]) || !tuple(value.unit.size, [150, 42]) ||
    !Array.isArray(value.clips) || value.clips.length !== 2
  ) return false;
  return value.clips.every((clip, index) => validateClip(clip, index + 4));
}

function validateAddScore(value: unknown): boolean {
  return record(value) && exactKeys(value, ["depthCycle", "digits", "phaseSeconds", "phases", "poolSize", "rootPosition", "scale", "selection", "start"]) &&
    value.poolSize === 4 && value.depthCycle === 8 && value.selection === "round-robin-ready-owner" && finiteTuple(value.rootPosition, 3) && exactF32(value.scale) && value.scale === Math.fround(0.6) && exactF32(value.phaseSeconds) && value.phaseSeconds === Math.fround(0.14) &&
    record(value.digits) && exactKeys(value.digits, ["alignment", "order", "plus", "prefix", "size"]) && value.digits.plus === "icon_number_plus" && value.digits.prefix === "icon_number_" && value.digits.order === "least-significant-first" && value.digits.alignment === "center" && tuple(value.digits.size, [47, 70]) &&
    record(value.start) && exactKeys(value.start, ["alpha", "localY"]) && value.start.alpha === Math.fround(0.6) && value.start.localY === -50 && tuple(value.phases, ["alpha=0.2+0.8*progress,y+=8", "alpha=1,y+=1", "alpha=1-progress,y+=1"]);
}

function validateResult(value: unknown): boolean {
  return record(value) && exactKeys(value, ["alpha", "fadeAllowed", "judgeSize", "rootPosition", "routes", "timingLocalPosition", "timingRoutes", "timingSize", "visibleSeconds"]) &&
    finiteTuple(value.rootPosition, 3) && tuple(value.judgeSize, [288, 80]) && tuple(value.timingSize, [80, 26]) && tuple(value.timingLocalPosition, [4, -38, 0]) && value.visibleSeconds === 1 && value.alpha === 1 && value.fadeAllowed === false &&
    record(value.routes) && exactKeys(value.routes, ["auto", "bad", "good", "great", "miss", "perfect"]) && validateResultRoutes(value);
}

function validateResultRoutes(value: Record<string, unknown>): boolean {
  const routes = value.routes as Record<string, unknown>;
  const timing = value.timingRoutes;
  return routes.auto === "judge_auto" && routes.miss === "judge_miss" && routes.bad === "judge_bad" && routes.good === "judge_good" && routes.great === "judge_great" && routes.perfect === "judge_perfect" &&
    record(timing) && exactKeys(timing, ["fast", "none", "slow"]) && timing.none === null && timing.fast === "judge_fast" && timing.slow === "judge_slow";
}

function validateLife(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, ["colorsF32Bits", "dangerThreshold", "gameOverOrder", "label", "primaryFormula", "rootPosition", "secondaryFormula", "sprites", "warning", "warningThreshold"]) ||
    !tuple(value.rootPosition, [411, 309, 0]) || value.primaryFormula !== "min(currentLife/1000,1)" || value.secondaryFormula !== "max(currentLife/1000-1,0)" || value.dangerThreshold !== Math.fround(0.2) || value.warningThreshold !== Math.fround(0.25) ||
    !record(value.colorsF32Bits) || !exactKeys(value.colorsF32Bits, ["danger", "gameOverBase", "normal"]) || !tuple(value.colorsF32Bits.normal, ["3EDCDCDD", "3F800000", "3ED2D2D3", "3F800000"]) || !tuple(value.colorsF32Bits.danger, ["3F800000", "3F19999A", "3F19999A", "3F800000"]) || !tuple(value.colorsF32Bits.gameOverBase, ["3F800000", "3F800000", "3F800000", "3F800000"]) ||
    !record(value.warning) || !exactKeys(value.warning, ["damageGuardReachable", "spriteEnabled", "visible"]) || value.warning.visible !== "primary<=0.25" || value.warning.spriteEnabled !== "visible-and-no-damage-guard" || value.warning.damageGuardReachable !== false ||
    !record(value.label) || !exactKeys(value.label, ["depth", "fontLogicalAssetId", "format", "position", "size"]) || value.label.fontLogicalAssetId !== "hud/score/rank-label-font" || value.label.format !== "current/max" || value.label.size !== 24 || value.label.depth !== 42 || !finiteTuple(value.label.position, 3) ||
    !tuple(value.gameOverOrder, ["update-primary", "update-secondary", "update-label", "update-color", "show-bg-no-health", "update-warning"]) || !record(value.sprites) || !exactKeys(value.sprites, ["game_over_background", "gauge_base", "primary", "second", "warning_body", "warning_outline"])
  ) return false;
  return Object.values(value.sprites).every((sprite) => record(sprite) && exactKeys(sprite, ["depth", "key", "position", "size"]) && typeof sprite.key === "string" && sprite.key.length > 0 && finiteTuple(sprite.position, 3) && finiteTuple(sprite.size, 2) && Number.isInteger(sprite.depth));
}

function validateHabahiro(value: unknown): boolean {
  return record(value) && exactKeys(value, ["commonHudAuthorized", "commonNoteAnimationOnExternalAtlasAuthorized", "directionalAlias", "missingAnimationDisposition"]) && value.commonHudAuthorized === true && value.commonNoteAnimationOnExternalAtlasAuthorized === false && value.directionalAlias === "portable-external-parser-disposition-only-not-original-sprite-identity" && value.missingAnimationDisposition === "evidence-required";
}

function validateReserve(value: unknown): boolean {
  return record(value) && exactKeys(value, ["accessorCallersInCurrentManagedText", "disposition", "portableConsumer"]) && value.accessorCallersInCurrentManagedText === 0 && value.portableConsumer === null && value.disposition === "remove-unconsumed-portable-field-not-original-absence-claim";
}

function validateClip(value: unknown, index: number): boolean {
  if (!record(value) || !exactKeys(value, ["clipId", "curves", "durationSeconds", "loop", "owner"]) || value.clipId !== CLIP_IDS[index] || value.owner !== CLIP_OWNERS[index] || value.durationSeconds !== CLIP_DURATIONS[index] || value.loop !== CLIP_LOOPS[index] || !exactF32(value.durationSeconds) || !Array.isArray(value.curves) || value.curves.length !== CLIP_CURVE_COUNTS[index]) return false;
  return value.curves.every((curve, curveIndex) => validateCurve(curve, curveIndex));
}

function validateCurve(value: unknown, expectedIndex: number): boolean {
  if (!record(value) || value.index !== expectedIndex || typeof value.channel !== "string" || value.channel.length === 0 || (value.storage !== "streamed" && value.storage !== "constant")) return false;
  if (value.storage === "constant") return exactKeys(value, ["channel", "index", "storage", "value"]) && exactF32(value.value);
  if (!exactKeys(value, ["channel", "index", "keys", "storage"]) || !Array.isArray(value.keys) || value.keys.length === 0) return false;
  let previous = -1;
  return value.keys.every((key) => {
    if (!record(key) || !exactKeys(key, ["coefficients", "time"]) || !exactF32(key.time) || (key.time as number) <= previous || !finiteTuple(key.coefficients, 4) || !(key.coefficients as unknown[]).every(exactF32)) return false;
    previous = key.time as number;
    return true;
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean { return Object.keys(value).sort().join(",") === [...expected].sort().join(","); }
function exactF32(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value; }
function finiteTuple(value: unknown, length: number): value is readonly number[] { return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item)); }
function tuple(value: unknown, expected: readonly unknown[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]); }
function emptyArray(value: unknown): boolean { return Array.isArray(value) && value.length === 0; }
