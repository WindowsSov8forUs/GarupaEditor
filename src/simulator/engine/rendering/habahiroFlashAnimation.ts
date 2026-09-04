import profileJson from "../skin/currentHabahiroFlashSemanticProfile.json";

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const INT64_PATTERN = /^int64:-?[0-9]+$/;

export const HABAHIRO_CHANGE_LANE_SECONDS = Math.fround(0.4166666567325592);
export const HABAHIRO_ANIMATION_COMPLETE_SECONDS = Math.fround(1);
export const HABAHIRO_FLASH_SPRITE_NAMES = Object.freeze([
  "bg_line_rhythm_flash",
  "bg_line_rhythm_flash2",
  "game_play_line_flash",
  "game_play_line_flash2",
] as const);

export type HabahiroFlashSpriteName = typeof HABAHIRO_FLASH_SPRITE_NAMES[number];

export interface HabahiroCurveKey {
  readonly time: number;
  readonly value: number;
  readonly inSlope: number;
  readonly outSlope: number;
}

export interface HabahiroColorCurve {
  readonly path: string;
  readonly attribute: "m_Color.r" | "m_Color.g" | "m_Color.b" | "m_Color.a";
  readonly keys: readonly HabahiroCurveKey[];
}

export interface HabahiroFlashSpriteProfile {
  readonly path: string;
  readonly rendererPathId: string;
  readonly rendererSerializedBytes: number;
  readonly rendererSerializedSha256: string;
  readonly sortingLayerId: 0;
  readonly sortingOrder: 40 | 41;
  readonly maskInteractionSerialized: 0 | 2;
  readonly initialColor: readonly [number, number, number, number];
  readonly spritePathId: string;
  readonly spriteName: HabahiroFlashSpriteName;
  readonly spriteSerializedBytes: number;
  readonly spriteSerializedSha256: string;
  readonly texturePathId: string;
  readonly textureName: HabahiroFlashSpriteName;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly textureRgbaBytes: number;
  readonly textureRgbaSha256: string;
  readonly verticesAuthored: readonly (readonly [number, number, 0])[];
  readonly uvTopLeft: readonly (readonly [number, number])[];
  readonly indicesScreenYReflected: readonly number[];
}

export interface HabahiroFieldAssetProfile {
  readonly name: "bg_line_rhythm" | "game_play_line" | "game_play_line_skill_adjust_effect";
  readonly pathId: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaBytes: number;
  readonly rgbaSha256: string;
  readonly serializedBytes: number;
  readonly serializedSha256: string;
}

export interface HabahiroSemanticProfile {
  readonly source: {
    readonly reverseCommit: "4fc0b23c433bd294dbcdda97658b565c059590f6";
    readonly contractSha256: "846497FACCB35BE125AF7177D97BEEFB2C1562BFF6FCCDB3F59039C3C25C85C0";
  };
  readonly flash: {
    readonly logicalResource: "ingameskin/tapeffect/habahiro";
    readonly officialUnityFs: Readonly<{ readonly bytes: number; readonly sha256: string }>;
    readonly rootGameObjectPathId: string;
    readonly sprites: readonly HabahiroFlashSpriteProfile[];
    readonly curves: readonly HabahiroColorCurve[];
  };
  readonly fieldBefore: {
    readonly logicalResource: "ingameskin/fieldskin/skin00";
    readonly officialUnityFs: Readonly<{ readonly bytes: number; readonly sha256: string }>;
    readonly assets: readonly HabahiroFieldAssetProfile[];
  };
  readonly fieldAfter: {
    readonly logicalResource: "ingameskin/fieldskin/habahiro";
    readonly officialUnityFs: Readonly<{ readonly bytes: number; readonly sha256: string }>;
    readonly assets: readonly HabahiroFieldAssetProfile[];
  };
}

export interface HabahiroFlashSample {
  readonly elapsedSeconds: number;
  readonly colors: Readonly<Record<HabahiroFlashSpriteName, readonly [number, number, number, number]>>;
}

export const CURRENT_HABAHIRO_SEMANTIC_PROFILE: HabahiroSemanticProfile = parseProfile(profileJson);

export function sampleCurrentHabahiroFlash(elapsedSeconds: number): HabahiroFlashSample {
  const time = Math.fround(elapsedSeconds);
  if (!Number.isFinite(time) || time < 0 || time > HABAHIRO_ANIMATION_COMPLETE_SECONDS) {
    throw new Error("HABAHIRO flash sampling requires finite binary32 time in the exact non-looping clip interval.");
  }
  const values = new Map<string, [number, number, number, number]>();
  for (const sprite of CURRENT_HABAHIRO_SEMANTIC_PROFILE.flash.sprites) {
    values.set(sprite.spriteName, [1, 1, 1, 0]);
  }
  for (const curve of CURRENT_HABAHIRO_SEMANTIC_PROFILE.flash.curves) {
    const name = HABAHIRO_FLASH_SPRITE_NAMES.find((candidate) => curve.path.endsWith(`/${candidate}`));
    if (name === undefined) throw new Error("HABAHIRO curve lost its exact SpriteRenderer path.");
    const color = values.get(name)!;
    const channel = curve.attribute === "m_Color.r" ? 0 : curve.attribute === "m_Color.g" ? 1 :
      curve.attribute === "m_Color.b" ? 2 : 3;
    color[channel] = sampleCurve(curve.keys, time);
  }
  return Object.freeze({
    elapsedSeconds: time,
    colors: Object.freeze(Object.fromEntries(HABAHIRO_FLASH_SPRITE_NAMES.map((name) => [
      name,
      Object.freeze(values.get(name)!) as readonly [number, number, number, number],
    ])) as Record<HabahiroFlashSpriteName, readonly [number, number, number, number]>),
  });
}

function sampleCurve(keys: readonly HabahiroCurveKey[], time: number): number {
  if (time <= keys[0]!.time) return keys[0]!.value;
  if (time >= keys[keys.length - 1]!.time) return keys[keys.length - 1]!.value;
  const index = keys.findIndex((key) => key.time >= time);
  const right = keys[index]!;
  const left = keys[index - 1]!;
  if (time === right.time) return right.value;
  const duration = subtract(right.time, left.time);
  const ratio = divide(subtract(time, left.time), duration);
  const ratio2 = multiply(ratio, ratio);
  const ratio3 = multiply(ratio2, ratio);
  const h00 = add(subtract(multiply(2, ratio3), multiply(3, ratio2)), 1);
  const h10 = add(subtract(ratio3, multiply(2, ratio2)), ratio);
  const h01 = add(multiply(-2, ratio3), multiply(3, ratio2));
  const h11 = subtract(ratio3, ratio2);
  return add(
    add(multiply(h00, left.value), multiply(multiply(h10, duration), left.outSlope)),
    add(multiply(h01, right.value), multiply(multiply(h11, duration), right.inSlope)),
  );
}

function parseProfile(value: unknown): HabahiroSemanticProfile {
  const root = record(value);
  const source = record(root?.source);
  const resources = record(root?.resources);
  const flash = record(resources?.flash);
  const before = record(resources?.fieldBefore);
  const after = record(resources?.fieldAfter);
  const animation = record(flash?.animation);
  if (root?.schemaVersion !== 1 || root.status !== "current-source-bound-habahiro-flash-and-field-swap" ||
    source?.reverseCommit !== "4fc0b23c433bd294dbcdda97658b565c059590f6" ||
    source.contractSha256 !== "846497FACCB35BE125AF7177D97BEEFB2C1562BFF6FCCDB3F59039C3C25C85C0" ||
    flash?.logicalResource !== "ingameskin/tapeffect/habahiro" || flash.rootObjectCount !== 9 ||
    flash.particleSystemCount !== 0 || !sourceIdentity(flash.officialUnityFs) || !Array.isArray(flash.sprites) ||
    animation === null || animation.legacy !== true || animation.sampleRate !== 60 || animation.wrapMode !== 0 ||
    animation.durationSeconds !== 1 || !Array.isArray(animation.curves) || animation.curves.length !== 16 ||
    !Array.isArray(animation.events) || animation.events.length !== 2 ||
    before?.logicalResource !== "ingameskin/fieldskin/skin00" || !sourceIdentity(before.officialUnityFs) ||
    after?.logicalResource !== "ingameskin/fieldskin/habahiro" || !sourceIdentity(after.officialUnityFs) ||
    !Array.isArray(before.assets) || !Array.isArray(after.assets)) {
    throw new Error("Invalid current source-bound HABAHIRO semantic profile root.");
  }
  const sprites = flash.sprites.map(parseSprite);
  if (new Set(sprites.map((sprite) => sprite.spriteName)).size !== HABAHIRO_FLASH_SPRITE_NAMES.length ||
    HABAHIRO_FLASH_SPRITE_NAMES.some((name) => !sprites.some((sprite) => sprite.spriteName === name))) {
    throw new Error("Current HABAHIRO profile must contain all four exact SpriteRenderer meshes.");
  }
  const curves = animation.curves.map(parseCurve);
  const expectedCurveIdentities = new Set(sprites.flatMap((sprite) =>
    (["m_Color.r", "m_Color.g", "m_Color.b", "m_Color.a"] as const).map((attribute) =>
      `${sprite.path.slice("Root_effect/".length)}\u0000${attribute}`)));
  const curveIdentities = curves.map((curve) => `${curve.path}\u0000${curve.attribute}`);
  if (curveIdentities.length !== expectedCurveIdentities.size ||
    new Set(curveIdentities).size !== curveIdentities.length ||
    curveIdentities.some((identity) => !expectedCurveIdentities.has(identity))) {
    throw new Error("Current HABAHIRO profile must contain each SpriteRenderer RGBA curve exactly once.");
  }
  const events = animation.events.map(record);
  if (events.some((event) => event === null) ||
    events[0]!.time !== HABAHIRO_CHANGE_LANE_SECONDS || events[0]!.functionName !== "ChangeLane" ||
    events[1]!.time !== HABAHIRO_ANIMATION_COMPLETE_SECONDS || events[1]!.functionName !== "AnimationComplete") {
    throw new Error("Current HABAHIRO legacy Animation event timeline drifted.");
  }
  const fieldBefore = parseField(before, "ingameskin/fieldskin/skin00");
  const fieldAfter = parseField(after, "ingameskin/fieldskin/habahiro");
  return deepFreeze({
    source: {
      reverseCommit: source.reverseCommit,
      contractSha256: source.contractSha256,
    },
    flash: {
      logicalResource: flash.logicalResource,
      officialUnityFs: copySourceIdentity(flash.officialUnityFs),
      rootGameObjectPathId: requireInt64(flash.rootGameObjectPathId),
      sprites,
      curves,
    },
    fieldBefore,
    fieldAfter,
  }) as HabahiroSemanticProfile;
}

function parseSprite(value: unknown): HabahiroFlashSpriteProfile {
  const row = record(value);
  const initialColor = record(row?.initialColor);
  if (row === null || typeof row.path !== "string" || !row.path.startsWith("Root_effect/") ||
    !HABAHIRO_FLASH_SPRITE_NAMES.includes(row.spriteName as HabahiroFlashSpriteName) || row.textureName !== row.spriteName ||
    !positiveInteger(row.rendererSerializedBytes) || !sha(row.rendererSerializedSha256) ||
    !positiveInteger(row.spriteSerializedBytes) || !sha(row.spriteSerializedSha256) ||
    !positiveInteger(row.textureWidth) || !positiveInteger(row.textureHeight) ||
    row.textureRgbaBytes !== row.textureWidth * row.textureHeight * 4 || !sha(row.textureRgbaSha256) ||
    row.sortingLayerId !== 0 || (row.sortingOrder !== 40 && row.sortingOrder !== 41) ||
    (row.maskInteractionSerialized !== 0 && row.maskInteractionSerialized !== 2) ||
    initialColor === null || !float32(initialColor.r) || !float32(initialColor.g) ||
    !float32(initialColor.b) || !float32(initialColor.a) ||
    !Array.isArray(row.verticesAuthored) || !Array.isArray(row.uvTopLeft) ||
    !Array.isArray(row.indicesScreenYReflected)) {
    throw new Error("Invalid current HABAHIRO Sprite mesh row.");
  }
  const vertices = row.verticesAuthored;
  const uv = row.uvTopLeft;
  const indices = row.indicesScreenYReflected;
  if (vertices.length < 4 || uv.length !== vertices.length || indices.length < 3 || indices.length % 3 !== 0 ||
    !vertices.every(vector3Array) || !uv.every(vector2Array) ||
    !indices.every((index) => Number.isSafeInteger(index) && index >= 0 && index < vertices.length)) {
    throw new Error("Invalid current HABAHIRO Sprite mesh geometry.");
  }
  const spriteName = row.spriteName as HabahiroFlashSpriteName;
  return {
    path: row.path,
    rendererPathId: requireInt64(row.rendererPathId),
    rendererSerializedBytes: row.rendererSerializedBytes,
    rendererSerializedSha256: row.rendererSerializedSha256,
    sortingLayerId: 0,
    sortingOrder: row.sortingOrder,
    maskInteractionSerialized: row.maskInteractionSerialized,
    initialColor: Object.freeze([initialColor.r, initialColor.g, initialColor.b, initialColor.a] as const),
    spritePathId: requireInt64(row.spritePathId),
    spriteName,
    spriteSerializedBytes: row.spriteSerializedBytes,
    spriteSerializedSha256: row.spriteSerializedSha256,
    texturePathId: requireInt64(row.texturePathId),
    textureName: spriteName,
    textureWidth: row.textureWidth,
    textureHeight: row.textureHeight,
    textureRgbaBytes: row.textureRgbaBytes,
    textureRgbaSha256: row.textureRgbaSha256,
    verticesAuthored: vertices.map((item) => Object.freeze([item[0], item[1], 0] as const)),
    uvTopLeft: uv.map((item) => Object.freeze([item[0], item[1]] as const)),
    indicesScreenYReflected: [...indices],
  };
}

function parseCurve(value: unknown): HabahiroColorCurve {
  const row = record(value);
  const curve = record(row?.curve);
  if (row === null || typeof row.path !== "string" ||
    !["m_Color.r", "m_Color.g", "m_Color.b", "m_Color.a"].includes(row.attribute as string) ||
    row.classId !== 212 || curve === null || !Array.isArray(curve.m_Curve) || curve.m_Curve.length < 2) {
    throw new Error("Invalid HABAHIRO legacy color curve.");
  }
  const keys = curve.m_Curve.map((value: unknown): HabahiroCurveKey => {
    const key = record(value);
    if (key === null || !float32(key.time) || !float32(key.value) || !float32(key.inSlope) || !float32(key.outSlope) ||
      key.weightedMode !== 0) throw new Error("Invalid HABAHIRO Animation key.");
    return Object.freeze({ time: key.time, value: key.value, inSlope: key.inSlope, outSlope: key.outSlope });
  });
  if (keys.some((key, index) => index > 0 && key.time <= keys[index - 1]!.time)) {
    throw new Error("HABAHIRO Animation keys must be strictly ordered.");
  }
  return Object.freeze({ path: row.path, attribute: row.attribute as HabahiroColorCurve["attribute"], keys: Object.freeze(keys) });
}

function parseField(value: Record<string, unknown>, logicalResource: "ingameskin/fieldskin/skin00" | "ingameskin/fieldskin/habahiro") {
  const assets = value.assets as unknown[];
  const parsed = assets.map((value): HabahiroFieldAssetProfile => {
    const row = record(value);
    if (row === null || !["bg_line_rhythm", "game_play_line", "game_play_line_skill_adjust_effect"].includes(row.name as string) ||
      !positiveInteger(row.width) || !positiveInteger(row.height) || !positiveInteger(row.rgbaBytes) ||
      !sha(row.rgbaSha256) || !positiveInteger(row.serializedBytes) || !sha(row.serializedSha256)) {
      throw new Error("Invalid HABAHIRO field asset relation.");
    }
    if (row.rgbaBytes !== row.width * row.height * 4) throw new Error("Invalid HABAHIRO field RGBA extent.");
    return Object.freeze({
      name: row.name as HabahiroFieldAssetProfile["name"], pathId: requireInt64(row.pathId),
      width: row.width, height: row.height, rgbaBytes: row.rgbaBytes, rgbaSha256: row.rgbaSha256,
      serializedBytes: row.serializedBytes, serializedSha256: row.serializedSha256,
    });
  });
  if (parsed.length !== 3 || new Set(parsed.map((row) => row.name)).size !== 3) {
    throw new Error("HABAHIRO before/after field requires three exact assets.");
  }
  return Object.freeze({ logicalResource, officialUnityFs: copySourceIdentity(value.officialUnityFs), assets: Object.freeze(parsed) });
}

function copySourceIdentity(value: unknown): Readonly<{ readonly bytes: number; readonly sha256: string }> {
  const row = record(value);
  if (row === null || !positiveInteger(row.bytes) || !sha(row.sha256)) {
    throw new Error("Invalid HABAHIRO official source identity.");
  }
  return Object.freeze({ bytes: row.bytes, sha256: row.sha256 });
}
function sourceIdentity(value: unknown): boolean {
  const row = record(value);
  return row !== null && positiveInteger(row.bytes) && sha(row.sha256);
}
function requireInt64(value: unknown): string {
  if (typeof value !== "string" || !INT64_PATTERN.test(value)) throw new Error("Invalid HABAHIRO PathID.");
  return value;
}
function vector2Array(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every(float32);
}
function vector3Array(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every(float32) && value[2] === 0;
}
function float32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value;
}
function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function sha(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function f32(value: number): number { return Math.fround(value); }
function add(left: number, right: number): number { return f32(f32(left) + f32(right)); }
function subtract(left: number, right: number): number { return f32(f32(left) - f32(right)); }
function multiply(left: number, right: number): number { return f32(f32(left) * f32(right)); }
function divide(left: number, right: number): number { return f32(f32(left) / f32(right)); }
