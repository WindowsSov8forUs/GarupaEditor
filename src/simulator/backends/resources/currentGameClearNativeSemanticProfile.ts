export type GameClearNativeBranch = "base" | "fullCombo" | "allPerfect";

export interface GameClearNativeSystemIdentity {
  readonly branch: GameClearNativeBranch;
  /** Contiguous serialized/component ordinal inside the source branch. */
  readonly sourceOrdinal: number;
  readonly path: string;
  readonly activeSerialized: boolean;
  readonly gameObjectPathId: string;
  readonly transformPathId: string;
  readonly particleSystemPathId: string;
  readonly particleSystemSerializedBytes: number;
  readonly particleSystemSerializedSha256: string;
  readonly rendererPathId: string;
  readonly rendererSerializedBytes: number;
  readonly rendererSerializedSha256: string;
  readonly localPosition: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number, number];
  readonly localScale: readonly [number, number, number];
  /** Root to immediate parent, matching the serialized Transform hierarchy. */
  readonly parentParticleSystemFlagsRootToImmediate: readonly boolean[];
  readonly enabledModules: readonly string[];
  readonly shapeType: null | 5 | 10;
  readonly rendererEnabled: boolean;
  readonly renderMode: 0 | 1;
  readonly renderAlignment: 0;
  readonly sortingOrder: number;
  readonly materialAsset: string | null;
  readonly materialPathId: string | null;
}

export interface GameClearNativeAssetIdentity {
  readonly logical_key: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly rgba_sha256: string;
  readonly png_bytes: number;
  readonly png_sha256: string;
  readonly texture_settings: Readonly<{
    readonly filter_mode: 1;
    readonly wrap_u: 0 | 1;
    readonly wrap_v: 0 | 1;
    readonly mip_count: 1;
    readonly color_space: 1;
  }>;
}

export interface GameClearNativeSemanticProfile {
  readonly source: Readonly<{
    readonly reverseCommit: "6cddb142806ffdb933cc6a237f69f4dd16e9ca97";
    readonly contractBytes: 653562;
    readonly contractSha256: "B5670A20E449671B77C3FD595AC8B27B225A9F0EDD1FEA98238BEDF0B3556D56";
    readonly runtimeGraphProfileSha256: "558FFBC854ADA8D064D98FDC53C90D2A7DDC1ACF79368F8DB5806222CC5BCDDB";
  }>;
  readonly systems: readonly GameClearNativeSystemIdentity[];
  readonly assets: readonly GameClearNativeAssetIdentity[];
  readonly nativeParticleHandoff: Readonly<{
    readonly coreContractSha256: "4311E8A35A1700CEE0443627478104F12BCBADD0B600CE867B73D66FEA6F863F";
    readonly rendererContractSha256: "7F1F19B26F6E8271D1A800645BFD7E1ECD0D5CAF322631E79474E63B3A47B307";
    readonly sameEngineRequired: true;
    readonly randomOwner: "fresh four-word state per concrete game-clear ParticleSystem instance";
    readonly moduleDomain: "all Game-clear active signatures are a subset of the closed current Initial/Emission/Shape/Color/Size/Rotation/RotationBySpeed/Clamp/UV domain";
    readonly rendererDomain: "all enabled Game-clear renderers are closed mode 0/1, alignment 0, additive material, complete source order; null material slots remain null";
  }>;
  readonly projection: Readonly<{
    readonly serializedOwner: "GamePlay/UI_Root";
    readonly canonicalLocalScale: number;
    readonly portableOwnerScale: "screenToSafeChildScale / pixelsPerWorldUnit";
    readonly ownerPositionWorld: readonly [0, 0, 0];
    readonly ownerRotation: readonly [0, 0, 0, 1];
    readonly formula: "keep serialized Game-clear transforms in authored UI units; one typed outer owner scale maps authored units to world, then the shared orthographic native primitive builder projects once";
    readonly forbidden: readonly [
      "hard-coded 375 displacement projection",
      "birth-origin split projection",
      "second Pixi-owned simulation",
    ];
  }>;
  readonly terminal: Readonly<{
    readonly baseDurationSeconds: 3.233;
    readonly exitAfterCallbackSeconds: 0.015;
    readonly additionalFinalFrameHoldUntilBaseCallback: true;
    readonly naturalAutoStatus1: "ORIGINAL";
    readonly productAutoStatus3: "PRODUCT_ONLY";
    readonly manualFcApReachability: "original status 2/3; natural device framebuffer not required for CPU/primitive closure";
  }>;
}

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const INT64_PATTERN = /^int64:-?[0-9]+$/;
const BRANCHES = Object.freeze(["base", "fullCombo", "allPerfect"] as const);
const parsedProfiles = new WeakSet<object>();
const MODULES = new Set([
  "InitialModule", "EmissionModule", "ShapeModule", "ColorModule", "SizeModule",
  "RotationModule", "RotationBySpeedModule", "ClampVelocityModule", "UVModule",
]);

export function parseGameClearNativeSemanticProfile(
  value: unknown,
): GameClearNativeSemanticProfile | null {
  const root = record(value);
  const sample = record(root?.sample);
  const source = record(root?.source);
  const inventory = record(root?.inventory);
  const counts = record(inventory?.counts);
  const handoff = record(root?.nativeParticleHandoff);
  const projection = record(root?.projection);
  const terminal = record(root?.terminal);
  if (
    root?.schemaVersion !== 1 ||
    root.status !== "current-game-clear-native-semantic-profile" ||
    sample?.package !== "jp.co.craftegg.band" ||
    sample.versionName !== "10.1.4" ||
    sample.versionCode !== 230 ||
    sample.abi !== "arm64-v8a" ||
    sample.unityVersion !== "2022.3.62f1" ||
    source?.reverseCommit !== "6cddb142806ffdb933cc6a237f69f4dd16e9ca97" ||
    source.contractBytes !== 653562 ||
    source.contractSha256 !== "B5670A20E449671B77C3FD595AC8B27B225A9F0EDD1FEA98238BEDF0B3556D56" ||
    source.runtimeGraphProfileSha256 !== "558FFBC854ADA8D064D98FDC53C90D2A7DDC1ACF79368F8DB5806222CC5BCDDB" ||
    counts === null ||
    !sameArray(inventory?.shapeTypes, [null, 5, 10]) ||
    !sameArray(inventory?.renderModes, [0, 1]) ||
    !sameArray(inventory?.renderAlignments, [0]) ||
    !Array.isArray(inventory?.systems) ||
    !Array.isArray(root.assets) ||
    !validHandoff(handoff) ||
    !validProjection(projection) ||
    !validTerminal(terminal)
  ) return null;

  const systems: GameClearNativeSystemIdentity[] = [];
  const paths = new Set<string>();
  const componentIdentities = new Set<string>();
  for (const value of inventory.systems) {
    const row = parseSystem(value);
    if (row === null || paths.has(row.path) ||
      componentIdentities.has(row.particleSystemPathId) ||
      componentIdentities.has(row.rendererPathId)) return null;
    paths.add(row.path);
    componentIdentities.add(row.particleSystemPathId);
    componentIdentities.add(row.rendererPathId);
    systems.push(row);
  }
  for (const branch of BRANCHES) {
    const branchSystems = systems.filter((system) => system.branch === branch);
    const count = record(counts[branch]);
    if (count === null || !nonNegativeInteger(count.systems) ||
      !nonNegativeInteger(count.enabledRenderers) ||
      count.systems !== branchSystems.length ||
      count.enabledRenderers !== branchSystems.filter((system) => system.rendererEnabled).length ||
      branchSystems.some((system, index) => system.sourceOrdinal !== index)) return null;
  }
  if (systems.length !== BRANCHES.reduce((sum, branch) =>
    sum + (record(counts[branch])?.systems as number), 0)) return null;

  const assets: GameClearNativeAssetIdentity[] = [];
  const assetKeys = new Set<string>();
  const assetFiles = new Set<string>();
  for (const value of root.assets) {
    const asset = parseAsset(value);
    if (asset === null || assetKeys.has(asset.logical_key) || assetFiles.has(asset.file)) return null;
    assetKeys.add(asset.logical_key);
    assetFiles.add(asset.file);
    assets.push(asset);
  }
  if (assets.length === 0 || systems.some((system) =>
    system.materialAsset !== null && !assetKeys.has(system.materialAsset))) return null;

  const parsed = deepFreeze({
    source: {
      reverseCommit: source.reverseCommit,
      contractBytes: source.contractBytes,
      contractSha256: source.contractSha256,
      runtimeGraphProfileSha256: source.runtimeGraphProfileSha256,
    },
    systems,
    assets,
    nativeParticleHandoff: {
      coreContractSha256: handoff!.coreContractSha256,
      rendererContractSha256: handoff!.rendererContractSha256,
      sameEngineRequired: handoff!.sameEngineRequired,
      randomOwner: handoff!.randomOwner,
      moduleDomain: handoff!.moduleDomain,
      rendererDomain: handoff!.rendererDomain,
    },
    projection: {
      serializedOwner: projection!.serializedOwner,
      canonicalLocalScale: projection!.canonicalLocalScale,
      portableOwnerScale: projection!.portableOwnerScale,
      ownerPositionWorld: projection!.ownerPositionWorld,
      ownerRotation: projection!.ownerRotation,
      formula: projection!.formula,
      forbidden: projection!.forbidden,
    },
    terminal: {
      baseDurationSeconds: terminal!.baseDurationSeconds,
      exitAfterCallbackSeconds: terminal!.exitAfterCallbackSeconds,
      additionalFinalFrameHoldUntilBaseCallback: terminal!.additionalFinalFrameHoldUntilBaseCallback,
      naturalAutoStatus1: terminal!.naturalAutoStatus1,
      productAutoStatus3: terminal!.productAutoStatus3,
      manualFcApReachability: terminal!.manualFcApReachability,
    },
  } as GameClearNativeSemanticProfile);
  parsedProfiles.add(parsed);
  return parsed;
}

export function isParsedGameClearNativeSemanticProfile(
  value: unknown,
): value is GameClearNativeSemanticProfile {
  return value !== null && typeof value === "object" && parsedProfiles.has(value);
}

function parseSystem(value: unknown): GameClearNativeSystemIdentity | null {
  const row = record(value);
  if (
    row === null || !BRANCHES.includes(row.branch as never) ||
    !nonNegativeInteger(row.sourceOrdinal) || !nonEmpty(row.path) ||
    typeof row.activeSerialized !== "boolean" ||
    ![row.gameObjectPathId, row.transformPathId, row.particleSystemPathId, row.rendererPathId]
      .every((entry) => typeof entry === "string" && INT64_PATTERN.test(entry)) ||
    !positiveInteger(row.particleSystemSerializedBytes) ||
    typeof row.particleSystemSerializedSha256 !== "string" ||
    !SHA256_PATTERN.test(row.particleSystemSerializedSha256) ||
    !positiveInteger(row.rendererSerializedBytes) ||
    typeof row.rendererSerializedSha256 !== "string" ||
    !SHA256_PATTERN.test(row.rendererSerializedSha256) ||
    !vector(row.localPosition, 3) || !vector(row.localRotation, 4) ||
    !vector(row.localScale, 3) || row.localScale.some((entry: number) => entry <= 0) ||
    !Array.isArray(row.parentParticleSystemFlagsRootToImmediate) ||
    !row.parentParticleSystemFlagsRootToImmediate.every((entry: unknown) => typeof entry === "boolean") ||
    !Array.isArray(row.enabledModules) || row.enabledModules.length === 0 ||
    new Set(row.enabledModules).size !== row.enabledModules.length ||
    !row.enabledModules.every((entry: unknown) => typeof entry === "string" && MODULES.has(entry)) ||
    ![null, 5, 10].includes(row.shapeType) ||
    typeof row.rendererEnabled !== "boolean" || ![0, 1].includes(row.renderMode) ||
    row.renderAlignment !== 0 || !Number.isSafeInteger(row.sortingOrder) ||
    !(row.materialAsset === null || nonEmpty(row.materialAsset)) ||
    !(row.materialPathId === null || typeof row.materialPathId === "string" && INT64_PATTERN.test(row.materialPathId)) ||
    row.rendererEnabled !== (row.materialAsset !== null) ||
    (row.materialAsset === null) !== (row.materialPathId === null)
  ) return null;
  return deepFreeze({ ...row }) as GameClearNativeSystemIdentity;
}

function parseAsset(value: unknown): GameClearNativeAssetIdentity | null {
  const row = record(value);
  const settings = record(row?.texture_settings);
  if (
    row === null || !nonEmpty(row.logical_key) || !nonEmpty(row.file) ||
    !positiveInteger(row.width) || !positiveInteger(row.height) ||
    typeof row.rgba_sha256 !== "string" || !SHA256_PATTERN.test(row.rgba_sha256) ||
    !positiveInteger(row.png_bytes) || typeof row.png_sha256 !== "string" ||
    !SHA256_PATTERN.test(row.png_sha256) || settings?.filter_mode !== 1 ||
    ![0, 1].includes(settings.wrap_u) || ![0, 1].includes(settings.wrap_v) ||
    settings.mip_count !== 1 || settings.color_space !== 1
  ) return null;
  return deepFreeze({ ...row, texture_settings: { ...settings } }) as GameClearNativeAssetIdentity;
}

function validHandoff(value: Record<string, any> | null): boolean {
  return value?.coreContractSha256 === "4311E8A35A1700CEE0443627478104F12BCBADD0B600CE867B73D66FEA6F863F" &&
    value.rendererContractSha256 === "7F1F19B26F6E8271D1A800645BFD7E1ECD0D5CAF322631E79474E63B3A47B307" &&
    value.sameEngineRequired === true &&
    value.randomOwner === "fresh four-word state per concrete game-clear ParticleSystem instance" &&
    value.moduleDomain === "all Game-clear active signatures are a subset of the closed current Initial/Emission/Shape/Color/Size/Rotation/RotationBySpeed/Clamp/UV domain" &&
    value.rendererDomain === "all enabled Game-clear renderers are closed mode 0/1, alignment 0, additive material, complete source order; null material slots remain null";
}

function validProjection(value: Record<string, any> | null): boolean {
  return value?.serializedOwner === "GamePlay/UI_Root" &&
    value.portableOwnerScale === "screenToSafeChildScale / pixelsPerWorldUnit" &&
    finite(value.canonicalLocalScale) && value.canonicalLocalScale > 0 &&
    sameArray(value.ownerPositionWorld, [0, 0, 0]) &&
    sameArray(value.ownerRotation, [0, 0, 0, 1]) &&
    value.formula === "keep serialized Game-clear transforms in authored UI units; one typed outer owner scale maps authored units to world, then the shared orthographic native primitive builder projects once" &&
    sameArray(value.forbidden, [
      "hard-coded 375 displacement projection",
      "birth-origin split projection",
      "second Pixi-owned simulation",
    ]);
}

function validTerminal(value: Record<string, any> | null): boolean {
  return value?.baseDurationSeconds === 3.233 &&
    value.exitAfterCallbackSeconds === 0.015 &&
    value.additionalFinalFrameHoldUntilBaseCallback === true &&
    value.naturalAutoStatus1 === "ORIGINAL" && value.productAutoStatus3 === "PRODUCT_ONLY" &&
    value.manualFcApReachability === "original status 2/3; natural device framebuffer not required for CPU/primitive closure";
}

function record(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function vector(value: unknown, size: number): value is number[] {
  return Array.isArray(value) && value.length === size && value.every(finite);
}
function sameArray(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((entry, index) => Object.is(entry, expected[index]));
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
