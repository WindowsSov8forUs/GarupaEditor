import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../engine/evidence";
import { parseCurrentOrdinaryVisibleProfile } from "./resources/currentOrdinaryVisibleProfile";
import { parseCurrentGameClearProfile } from "./resources/currentGameClearProfile";
import { parseCurrentPauseCountdownAnimationProfile } from "./resources/currentPauseCountdownAnimationProfile";
import {
  RenderFidelityLabel,
  type RenderAtlasRow,
  type RenderColor,
  type RenderComponentMapping,
  type RenderFloat32,
  type RenderResourceAssetProfile,
  type RenderResourceProfile,
  type RenderVector2,
  type RenderVector3,
} from "./renderingContracts";

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const FLOAT32_BITS_PATTERN = /^[0-9A-F]{8}$/;
const RESOURCE_ROLES = new Set([
  "note-atlas", "directional-atlas", "judge-atlas", "field-atlas", "lane-effect",
  "hud-atlas", "font", "material-texture", "animation-clip", "startup-ui",
]);
const MATERIAL_ROLES = new Set([
  "none", "sprite", "long-note", "curve-note", "sync-line",
  "multiple-directional-line", "mask", "hud",
]);
const ANIMATION_ROLES = new Set([
  "none", "note-flick", "note-directional-flick", "note-long-flash",
  "combo", "all-perfect", "add-score", "result", "life-warning", "life-game-over",
  "score-gauge-ss", "habahiro-lane-change",
]);
const PROVENANCE_VALUES = new Set([
  "current-apk", "current-device-cache", "current-official-portable", "current-external-portable",
  "historical-proxy", "generated-current-ordinary-proxy",
]);
const REQUIRED_COMPONENTS = Object.freeze([
  "sprite",
  "atlas-sprite",
  "mesh",
  "line",
  "mask",
  "text",
  "slider",
  "animation",
] as const);

export function validateAndFreezeRenderProfile(
  profile: RenderResourceProfile,
): SimulatorResult<RenderResourceProfile> {
  if (
    profile === null ||
    typeof profile !== "object" ||
    profile.schemaVersion !== 1 ||
    profile.sample?.package !== "jp.co.craftegg.band" ||
    profile.sample.versionName !== "10.1.4" ||
    profile.sample.versionCode !== 230 ||
    profile.sample.abi !== "arm64-v8a" ||
    !isNonEmpty(profile.packIdentity) ||
    profile.networkAllowed !== false ||
    profile.automaticFallbackAllowed !== false ||
    !Array.isArray(profile.assets) ||
    profile.assets.length === 0
  ) {
    return reject(
      "render.profile.invalid-shape",
      "The complete 10.1.4 profile identity, explicit offline policy and non-empty asset inventory must validate before resource reads.",
    );
  }
  const fidelityValidation = validateFidelity(profile.fidelity);
  if (fidelityValidation.status !== "ok") return fidelityValidation;

  const logicalIds = new Set<string>();
  const assets: RenderResourceAssetProfile[] = [];
  for (const asset of profile.assets) {
    const validated = validateAsset(asset, logicalIds);
    if (validated.status !== "ok") return validated;
    assets.push(validated.value);
  }

  const scene = profile.scene;
  if (
    scene === null ||
    typeof scene !== "object" ||
    !isNonEmpty(scene.profileId) ||
    typeof scene.roundPixels !== "boolean" ||
    !Number.isFinite(scene.resolution) ||
    scene.resolution <= 0 ||
    typeof scene.antialias !== "boolean" ||
    scene.ordering?.pixiDefaultZIndexAllowed !== false ||
    scene.ordering.tuple.join(",") !==
      "domain-layer,source-depth-or-sorting-order,source-z,creation-sequence" ||
    !Array.isArray(scene.components)
  ) {
    return reject(
      "render.profile.invalid-scene",
      "Scene ordering and every renderer default must be explicit; Pixi zIndex defaults are not accepted.",
    );
  }
  const projection = scene.projection;
  const expectedProjectionMode = fidelityValidation.value.mode === "ordinary"
    ? "current-ordinary-rhythmgame-orthographic"
    : fidelityValidation.value.fidelity === "current-external-complete"
    ? "habahiro-current-external"
    : fidelityValidation.value.fidelity === "degraded"
    ? "degraded-habahiro-ordinary-projection-proxy"
    : null;
  if (
    expectedProjectionMode === null ||
    projection === null ||
    typeof projection !== "object" ||
    projection.mode !== expectedProjectionMode ||
    !Number.isSafeInteger(projection.viewportWidth) || projection.viewportWidth <= 0 ||
    !Number.isSafeInteger(projection.viewportHeight) || projection.viewportHeight <= 0 ||
    projection.viewportWidth < projection.viewportHeight ||
    projection.pixelsPerWorldUnit !== Math.fround(projection.viewportHeight / 2) ||
    projection.pixiOrigin !== "top-left" ||
    projection.worldCenterX !== 0 ||
    projection.worldCenterY !== 0 ||
    projection.cameraPositionZ !== -15 ||
    projection.nearClip !== 0 ||
    projection.farClip !== 25 ||
    projection.clampAllowed !== false
  ) {
    return reject(
      "render.profile.invalid-projection",
      "The per-session original orthographic projection requires one explicit landscape viewport, binary32 height/2 PPU, current camera constants and the selected ordinary/HAB route without clamp.",
    );
  }

  const componentMap = new Map<string, RenderComponentMapping>();
  for (const mapping of scene.components) {
    if (
      !REQUIRED_COMPONENTS.includes(mapping.component) ||
      (mapping.support !== "semantic-exact" && mapping.support !== "portable-equivalent") ||
      componentMap.has(mapping.component)
    ) {
      return reject(
        "render.profile.invalid-component-mapping",
        "Each portable component requires one explicit supported mapping without duplicates.",
      );
    }
    componentMap.set(mapping.component, Object.freeze({ ...mapping }));
  }
  if (componentMap.size !== REQUIRED_COMPONENTS.length) {
    return reject(
      "render.profile.incomplete-component-mapping",
      "Sprite, atlas, mesh, line, mask, text, slider and animation mappings must all be declared before prepare.",
    );
  }

  const scoreGaugeSsAnimation = validateScoreGaugeSsAnimation(profile.scoreGaugeSsAnimation);
  if (scoreGaugeSsAnimation.status !== "ok") return scoreGaugeSsAnimation;
  let ordinaryVisibleProfile: RenderResourceProfile["ordinaryVisibleProfile"];
  if (profile.ordinaryVisibleProfile !== undefined) {
    const parsedOrdinaryVisibleProfile = parseCurrentOrdinaryVisibleProfile(profile.ordinaryVisibleProfile);
    if (parsedOrdinaryVisibleProfile === null) {
      return reject(
        "render.profile.invalid-ordinary-visible-profile",
        "The ordinary gameplay HUD and Note animation profile must preserve every committed route, owner, curve and Float32 value.",
      );
    }
    ordinaryVisibleProfile = parsedOrdinaryVisibleProfile;
  }
  let gameClearProfile: RenderResourceProfile["gameClearProfile"];
  if (profile.gameClearProfile !== undefined) {
    const parsedGameClearProfile = parseCurrentGameClearProfile(profile.gameClearProfile);
    if (parsedGameClearProfile !== null) gameClearProfile = parsedGameClearProfile;
    else {
      return reject(
        "render.profile.invalid-game-clear-profile",
        "Game-clear object graphs and clips must preserve the current serialized portable profile.",
      );
    }
  }
  if (profile.gameClearProfile !== undefined && gameClearProfile === undefined) {
    return reject(
      "render.profile.invalid-game-clear-profile",
      "Game-clear object graphs and clips must preserve the current serialized portable profile.",
    );
  }
  const pauseCountdownAnimation = profile.pauseCountdownAnimation === undefined
    ? undefined
    : parseCurrentPauseCountdownAnimationProfile(profile.pauseCountdownAnimation) ?? undefined;
  if (profile.pauseCountdownAnimation !== undefined && pauseCountdownAnimation === undefined) {
    return reject(
      "render.profile.invalid-pause-countdown-animation",
      "Pause resume requires the complete current persistent countdown graph and exact 25/10-curve clip profiles.",
    );
  }

  return ok(Object.freeze({
    schemaVersion: 1,
    sample: Object.freeze({ ...profile.sample }),
    packIdentity: profile.packIdentity,
    fidelity: fidelityValidation.value,
    networkAllowed: false,
    automaticFallbackAllowed: false,
    assets: Object.freeze(assets),
    scoreGaugeSsAnimation: scoreGaugeSsAnimation.value,
    ordinaryVisibleProfile,
    gameClearProfile,
    pauseCountdownAnimation,
    scene: Object.freeze({
      profileId: scene.profileId,
      components: Object.freeze(
        REQUIRED_COMPONENTS.map((component) => componentMap.get(component)!),
      ),
      ordering: Object.freeze({
        tuple: Object.freeze([
          "domain-layer",
          "source-depth-or-sorting-order",
          "source-z",
          "creation-sequence",
        ] as const),
        pixiDefaultZIndexAllowed: false,
      }),
      projection: Object.freeze({ ...projection }),
      roundPixels: scene.roundPixels,
      resolution: scene.resolution,
      antialias: scene.antialias,
    }),
  }));
}

export function createRenderFloat32(value: number): SimulatorResult<RenderFloat32> {
  const rounded = Math.fround(value);
  if (!Number.isFinite(value) || !Number.isFinite(rounded) || rounded !== value) {
    return reject(
      "render.float32.invalid-value",
      "Renderer values must already be frozen at an evidence-confirmed Float32 owner write.",
    );
  }
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, rounded, false);
  return ok(Object.freeze({
    value: rounded,
    bits: view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0"),
  }));
}

export function validateRenderFloat32(value: RenderFloat32): boolean {
  if (
    value === null ||
    typeof value !== "object" ||
    !Number.isFinite(value.value) ||
    Math.fround(value.value) !== value.value ||
    !FLOAT32_BITS_PATTERN.test(value.bits)
  ) {
    return false;
  }
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value.value, false);
  return view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0") === value.bits;
}

export function freezeRenderVector2(value: RenderVector2): RenderVector2 {
  return Object.freeze({
    x: Object.freeze({ ...value.x }),
    y: Object.freeze({ ...value.y }),
  });
}

export function freezeRenderVector3(value: RenderVector3): RenderVector3 {
  return Object.freeze({
    x: Object.freeze({ ...value.x }),
    y: Object.freeze({ ...value.y }),
    z: Object.freeze({ ...value.z }),
  });
}

export function freezeRenderColor(value: RenderColor): RenderColor {
  return Object.freeze({
    red: Object.freeze({ ...value.red }),
    green: Object.freeze({ ...value.green }),
    blue: Object.freeze({ ...value.blue }),
    alpha: Object.freeze({ ...value.alpha }),
  });
}

function validateFidelity(
  fidelity: RenderResourceProfile["fidelity"],
): SimulatorResult<RenderResourceProfile["fidelity"]> {
  if (fidelity?.mode === "ordinary" && fidelity.fidelity === "exact-current") {
    return ok(Object.freeze({ ...fidelity }));
  }
  if (
    fidelity?.mode === "habahiro" &&
    fidelity.fidelity === "exact-current-unityfs"
  ) {
    return ok(Object.freeze({ ...fidelity }));
  }
  if (
    fidelity?.mode === "habahiro" &&
    fidelity.fidelity === "current-external-complete"
  ) {
    return ok(Object.freeze({ ...fidelity }));
  }
  if (
    fidelity?.mode === "habahiro" &&
    fidelity.fidelity === "degraded" &&
    (fidelity.profile === "current-external-portable-atlas" ||
      fidelity.profile === "historical-atlas-proxy" ||
      fidelity.profile === "current-ordinary-stretch-proxy") &&
    fidelity.visibleLabel === RenderFidelityLabel
  ) {
    return ok(Object.freeze({ ...fidelity }));
  }
  return reject(
    "render.profile.invalid-fidelity",
    "HABAHIRO requires explicit exact, functionally complete current-external, or legacy degraded fidelity; automatic fallback is forbidden.",
  );
}

function validateAsset(
  asset: RenderResourceAssetProfile,
  logicalIds: Set<string>,
): SimulatorResult<RenderResourceAssetProfile> {
  if (
    asset === null ||
    typeof asset !== "object" ||
    !isNonEmpty(asset.logicalAssetId) ||
    logicalIds.has(asset.logicalAssetId) ||
    !Number.isSafeInteger(asset.byteLength) ||
    asset.byteLength <= 0 ||
    !SHA256_PATTERN.test(asset.sha256) ||
    !RESOURCE_ROLES.has(asset.role) ||
    !MATERIAL_ROLES.has(asset.materialRole) ||
    !ANIMATION_ROLES.has(asset.animationRole) ||
    !PROVENANCE_VALUES.has(asset.provenance) ||
    (asset.mime !== "image/png" &&
      asset.mime !== "font/ttf" &&
      asset.mime !== "application/octet-stream") ||
    !Array.isArray(asset.atlasRows)
  ) {
    return reject(
      "render.profile.invalid-asset",
      "Every asset requires one logical ID, positive byte length, uppercase SHA-256 and an explicit atlas list.",
    );
  }
  logicalIds.add(asset.logicalAssetId);
  const image = asset.mime === "image/png";
  const textureSettings = asset.textureSettings;
  if (
    image !== (asset.width !== null && asset.height !== null) ||
    image !== (textureSettings !== null) ||
    (textureSettings !== null &&
      (textureSettings.scaleMode !== "nearest" && textureSettings.scaleMode !== "linear" ||
        textureSettings.wrapModeU !== "clamp" && textureSettings.wrapModeU !== "repeat" ||
        textureSettings.wrapModeV !== "clamp" && textureSettings.wrapModeV !== "repeat" ||
        textureSettings.mipmap !== "off" && textureSettings.mipmap !== "on" ||
        typeof textureSettings.premultiplyAlpha !== "boolean" ||
        textureSettings.blendMode !== "normal" &&
          textureSettings.blendMode !== "add" &&
          textureSettings.blendMode !== "multiply")) ||
    (image && (!isPositiveInteger(asset.width) || !isPositiveInteger(asset.height))) ||
    (!image && asset.atlasRows.length !== 0)
  ) {
    return reject(
      "render.profile.invalid-resource-metadata",
      "Image dimensions and texture settings must be explicit; non-image assets cannot declare atlas rows.",
    );
  }
  const rows: RenderAtlasRow[] = [];
  const exactKeys = new Set<string>();
  for (const row of asset.atlasRows) {
    if (
      !isNonEmpty(row.exactKey) ||
      exactKeys.has(row.exactKey) ||
      !isNonNegativeInteger(row.x) ||
      !isNonNegativeInteger(row.y) ||
      !isPositiveInteger(row.width) ||
      !isPositiveInteger(row.height) ||
      row.x + row.width > asset.width! ||
      row.y + row.height > asset.height! ||
      !Number.isFinite(row.pivotX) ||
      !Number.isFinite(row.pivotY) ||
      !Number.isFinite(row.pixelsPerUnit) ||
      row.pixelsPerUnit <= 0 ||
      !validAtlasBorder(row.borderLeft, row.width) ||
      !validAtlasBorder(row.borderRight, row.width) ||
      !validAtlasBorder(row.borderTop, row.height) ||
      !validAtlasBorder(row.borderBottom, row.height) ||
      (row.borderLeft ?? 0) + (row.borderRight ?? 0) > row.width ||
      (row.borderTop ?? 0) + (row.borderBottom ?? 0) > row.height
    ) {
      return reject(
        "render.profile.invalid-atlas-row",
        "Atlas exact keys must be unique within one logical asset and every rectangle, pivot and PPU must be finite and in bounds.",
      );
    }
    exactKeys.add(row.exactKey);
    rows.push(Object.freeze({ ...row }));
  }
  return ok(Object.freeze({
    ...asset,
    textureSettings: textureSettings === null
      ? null
      : Object.freeze({ ...textureSettings }),
    atlasRows: Object.freeze(rows),
  }));
}

function validateScoreGaugeSsAnimation(
  profile: RenderResourceProfile["scoreGaugeSsAnimation"],
): SimulatorResult<RenderResourceProfile["scoreGaugeSsAnimation"]> {
  if (profile === undefined) return ok(undefined);
  if (
    profile.durationSeconds !== 3 || profile.loop !== true || profile.curveCount !== 56 ||
    !Array.isArray(profile.nodes) || profile.nodes.length !== 11 ||
    !Array.isArray(profile.frames) || profile.frames.length !== 39
  ) return reject("render.profile.invalid-score-gauge-ss-animation", "The ScoreGaugeSS profile identity must remain the committed 3-second 56-curve loop.");
  const nodeNames = new Set<string>();
  const nodes = [];
  for (const node of profile.nodes) {
    if (
      !isNonEmpty(node.name) || nodeNames.has(node.name) ||
      (node.textureKey !== "high-rank-kira" && node.textureKey !== "high-rank-long-star" && node.textureKey !== "high-rank-overlay") ||
      !Number.isInteger(node.widgetWidth) || node.widgetWidth <= 0 ||
      !Number.isInteger(node.widgetHeight) || node.widgetHeight <= 0 ||
      (node.pivot !== "center" && node.pivot !== "left") || node.blendMode !== "normal" ||
      !Array.isArray(node.colorF32Bits) || node.colorF32Bits.length !== 4 ||
      node.colorF32Bits.some((bits: unknown) => typeof bits !== "string" || !/^[0-9A-F]{8}$/.test(bits)) ||
      !validFiniteTuple(node.initialPosition, 3) || !validFiniteTuple(node.initialScale, 3) ||
      !validFiniteTuple(node.initialRotationQuaternion, 4)
    ) return reject("render.profile.invalid-score-gauge-ss-node", "Every ScoreGaugeSS node requires one unique identity, explicit portable texture and finite initial transform.");
    nodeNames.add(node.name);
    nodes.push(Object.freeze({
      ...node,
      colorF32Bits: Object.freeze([...node.colorF32Bits]) as readonly [string, string, string, string],
      initialPosition: Object.freeze([...node.initialPosition]) as readonly [number, number, number],
      initialScale: Object.freeze([...node.initialScale]) as readonly [number, number, number],
      initialRotationQuaternion: Object.freeze([...node.initialRotationQuaternion]) as readonly [number, number, number, number],
    }));
  }
  let previousTime = -1;
  let totalKeys = 0;
  const frames = [];
  for (const frame of profile.frames) {
    if (!isExactFloat32(frame.time) || frame.time < 0 || frame.time >= 3 || frame.time <= previousTime || !Array.isArray(frame.keys) || frame.keys.length === 0) {
      return reject("render.profile.invalid-score-gauge-ss-frame", "ScoreGaugeSS finite frame times must be strict binary32 values in [0,3).")
    }
    previousTime = frame.time;
    const indices = new Set<number>();
    const keys = [];
    for (const key of frame.keys) {
      if (!Number.isInteger(key.index) || key.index < 0 || key.index >= 56 || indices.has(key.index) ||
        !validFiniteTuple(key.coefficients, 4) || key.coefficients.some((value: unknown) => !isExactFloat32(value))) {
        return reject("render.profile.invalid-score-gauge-ss-key", "Every ScoreGaugeSS curve key must have one unique index and four binary32 coefficients.");
      }
      indices.add(key.index);
      keys.push(Object.freeze({
        index: key.index,
        coefficients: Object.freeze([...key.coefficients]) as readonly [number, number, number, number],
      }));
      totalKeys += 1;
    }
    frames.push(Object.freeze({ time: frame.time, keys: Object.freeze(keys) }));
  }
  if (totalKeys !== 236 || frames[0]!.time !== 0 || frames[0]!.keys.length !== 56) {
    return reject("render.profile.incomplete-score-gauge-ss-curves", "The committed ScoreGaugeSS stream requires 236 finite keys and an initial value for all 56 curves.");
  }
  return ok(Object.freeze({ durationSeconds: 3 as const, loop: true as const, curveCount: 56 as const, nodes: Object.freeze(nodes), frames: Object.freeze(frames) }));
}

function validFiniteTuple(value: unknown, length: number): value is readonly number[] {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isExactFloat32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value;
}

function reject(capability: string, boundary: string) {
  return integrityFailure(
    capability,
    ["RPR-D14", "PR01", "PR05", "PR35"],
    boundary,
  );
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validAtlasBorder(value: unknown, extent: number): boolean {
  return value === undefined || (isNonNegativeInteger(value) && (value as number) <= extent);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
