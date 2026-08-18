import type {
  RenderAtlasRow,
  RenderResourceAssetProfile,
  RenderResourceProfile,
  SimulatorResourceProvider,
} from "../renderingContracts";
import { evidenceRequired, ok, type SimulatorResult } from "../../engine/evidence";
import { sha256UpperHex } from "./sha256";
import {
  HABAHIRO_BESTDORI_PACK_IDENTITY,
  HABAHIRO_BESTDORI_PINNED_ASSETS,
} from "./habahiroBestdoriManifest";

export interface HabahiroBestdoriTransport {
  read(url: string): Promise<SimulatorResult<Uint8Array>>;
}

export interface PreparedHabahiroBestdoriPack {
  readonly packIdentity: typeof HABAHIRO_BESTDORI_PACK_IDENTITY;
  readonly profile: RenderResourceProfile;
  readonly assets: readonly RenderResourceAssetProfile[];
  readonly provider: SimulatorResourceProvider;
  readonly bindings: {
    readonly normalAtlasLogicalAssetId: string;
    readonly normal16AtlasLogicalAssetId: string;
    readonly skillAtlasLogicalAssetId: string;
    readonly flickAtlasLogicalAssetId: string;
    readonly longAtlasLogicalAssetId: string;
    readonly longFlashAtlasLogicalAssetId: string;
    readonly slideAmongAtlasLogicalAssetId: string;
    readonly syncLineLogicalAssetId: string;
    readonly longNoteMaterialLogicalAssetId: string;
    readonly curveNoteMaterialLogicalAssetId: string;
    readonly multipleDirectionalLineLeftLogicalAssetId: string;
    readonly multipleDirectionalLineRightLogicalAssetId: string;
  };
  readonly spriteCount: 179;
}

interface RawSpriteEntry {
  readonly Base?: {
    readonly m_Name?: unknown;
    readonly m_Rect?: {
      readonly x?: unknown;
      readonly y?: unknown;
      readonly width?: unknown;
      readonly height?: unknown;
    };
    readonly m_Pivot?: { readonly x?: unknown; readonly y?: unknown };
    readonly m_PixelsToUnits?: unknown;
    readonly m_RD?: {
      readonly texture?: { readonly m_PathID?: unknown };
    };
  };
}

interface RawBundle {
  readonly Base?: {
    readonly m_PreloadTable?: readonly {
      readonly m_PathID?: unknown;
    }[];
    readonly m_Container?: Readonly<Record<string, {
      readonly preloadIndex?: unknown;
      readonly preloadSize?: unknown;
    }>>;
  };
}

const TEXTURE_SETTINGS = Object.freeze({
  scaleMode: "linear" as const,
  wrapModeU: "clamp" as const,
  wrapModeV: "clamp" as const,
  mipmap: "off" as const,
  premultiplyAlpha: true,
  blendMode: "normal" as const,
});

const LOGICAL_PREFIX = "bestdori.habahiro.";

export async function prepareHabahiroBestdoriPack(
  transport: HabahiroBestdoriTransport,
): Promise<SimulatorResult<PreparedHabahiroBestdoriPack>> {
  const bytesByName = new Map<string, Uint8Array>();
  for (const pinned of HABAHIRO_BESTDORI_PINNED_ASSETS) {
    if (!isAllowedBestdoriUrl(pinned.url)) {
      return reject(
        "render.habahiro.bestdori-url-not-allowed",
        "Every HABAHIRO resource URL must remain under the pinned bestdori.com HTTPS path.",
      );
    }
    const read = await transport.read(pinned.url);
    if (read.status !== "ok") return read;
    const bytes = Uint8Array.from(read.value);
    if (
      bytes.byteLength !== pinned.byteLength ||
      sha256UpperHex(bytes) !== pinned.sha256
    ) {
      return reject(
        "render.habahiro.bestdori-resource-mismatch",
        `Pinned HABAHIRO resource ${pinned.technicalName} changed length or SHA-256.`,
      );
    }
    bytesByName.set(pinned.technicalName, bytes);
  }

  const spriteBytes = bytesByName.get(".sprites");
  const bundleBytes = bytesByName.get("ingameskin-noteskin-habahiro.bundle");
  if (spriteBytes === undefined || bundleBytes === undefined) {
    return reject(
      "render.habahiro.bestdori-metadata-missing",
      "The pinned HABAHIRO Sprite and bundle manifests are both required.",
    );
  }
  const parsed = parseHabahiroAtlasRows(spriteBytes, bundleBytes);
  if (parsed.status !== "ok") return parsed;

  const imageAssets = HABAHIRO_BESTDORI_PINNED_ASSETS.filter(
    (asset) => asset.dimensions !== null,
  );
  const assets: RenderResourceAssetProfile[] = [];
  for (const pinned of imageAssets) {
    const [width, height] = pinned.dimensions!;
    const materialRole = materialRoleFor(pinned.technicalName);
    const sourceRows = parsed.value.get(pinned.technicalName.toLowerCase());
    if (materialRole === "sprite" && sourceRows === undefined) {
      return reject(
        "render.habahiro.bestdori-atlas-rows-missing",
        "Every pinned HABAHIRO Sprite texture must have an explicit parsed row set.",
      );
    }
    const directionalAliases = pinned.technicalName === "RhythmGameSprites1.png"
      ? createDirectionalAliasRows(sourceRows!)
      : ok(Object.freeze([]));
    if (directionalAliases.status !== "ok") return directionalAliases;
    const rows = Object.freeze([...(sourceRows ?? []), ...directionalAliases.value]);
    assets.push(Object.freeze({
      logicalAssetId: logicalAssetId(pinned.technicalName),
      role: materialRole === "sprite" ? "note-atlas" as const : "material-texture" as const,
      byteLength: pinned.byteLength,
      sha256: pinned.sha256,
      mime: "image/png" as const,
      width,
      height,
      textureSettings: TEXTURE_SETTINGS,
      atlasRows: materialRole === "sprite" ? rows : Object.freeze([]),
      materialRole,
      animationRole: "none" as const,
      provenance: "current-external-portable" as const,
    }));
  }
  for (const [logicalAssetId, technicalName] of [
    ["bestdori.habahiro.multiple-directional-left", "longNoteLine.png"],
    ["bestdori.habahiro.multiple-directional-right", "longNoteLine2.png"],
  ] as const) {
    assets.push(Object.freeze({
      ...assets.find((asset) => asset.logicalAssetId === logicalAssetIdFor(technicalName))!,
      logicalAssetId,
      role: "material-texture" as const,
      atlasRows: Object.freeze([]),
      materialRole: "multiple-directional-line" as const,
    }));
  }
  const providerBytes = new Map<string, Uint8Array>();
  for (const asset of imageAssets) {
    providerBytes.set(
      logicalAssetId(asset.technicalName),
      Uint8Array.from(bytesByName.get(asset.technicalName)!),
    );
  }
  providerBytes.set("bestdori.habahiro.multiple-directional-left", Uint8Array.from(bytesByName.get("longNoteLine.png")!));
  providerBytes.set("bestdori.habahiro.multiple-directional-right", Uint8Array.from(bytesByName.get("longNoteLine2.png")!));
  const provider: SimulatorResourceProvider = Object.freeze({
    async read(logicalAssetId: string): Promise<SimulatorResult<Uint8Array>> {
      const bytes = providerBytes.get(logicalAssetId);
      return bytes === undefined
        ? reject(
            "render.habahiro.bestdori-logical-asset-missing",
            "The prepared HABAHIRO provider rejects undeclared logical asset IDs.",
          )
        : ok(Uint8Array.from(bytes));
    },
  });
  const frozenAssets = Object.freeze(assets);
  const profile: RenderResourceProfile = Object.freeze({
    schemaVersion: 1 as const,
    sample: Object.freeze({
      package: "jp.co.craftegg.band" as const,
      versionName: "10.1.4" as const,
      versionCode: 230 as const,
      abi: "arm64-v8a" as const,
    }),
    packIdentity: HABAHIRO_BESTDORI_PACK_IDENTITY,
    fidelity: Object.freeze({
      mode: "habahiro" as const,
      fidelity: "current-external-complete" as const,
    }),
    networkAllowed: false,
    automaticFallbackAllowed: false,
    assets: frozenAssets,
    scene: Object.freeze({
      profileId: "habahiro-10.1.4-current-external-complete",
      components: Object.freeze((["sprite", "atlas-sprite", "mesh", "line", "mask", "text", "slider", "animation"] as const).map(
        (component) => Object.freeze({ component, support: "portable-equivalent" as const }),
      )),
      ordering: Object.freeze({
        tuple: Object.freeze(["domain-layer", "source-depth-or-sorting-order", "source-z", "creation-sequence"] as const),
        pixiDefaultZIndexAllowed: false,
      }),
      projection: Object.freeze({
        mode: "habahiro-current-external" as const,
        viewportWidth: 1,
        viewportHeight: 1,
        pixiOrigin: "top-left" as const,
        worldCenterX: 0,
        worldCenterY: 0,
        cameraPositionZ: -15,
        nearClip: 0,
        farClip: 25,
        pixelsPerWorldUnit: Math.fround(0.5),
        clampAllowed: false,
      }),
      roundPixels: false,
      resolution: 1,
      antialias: false,
    }),
  });
  return ok(Object.freeze({
    packIdentity: HABAHIRO_BESTDORI_PACK_IDENTITY,
    profile,
    assets: frozenAssets,
    provider,
    bindings: Object.freeze({
      normalAtlasLogicalAssetId: logicalAssetId("RhythmGameSprites4.png"),
      normal16AtlasLogicalAssetId: logicalAssetId("RhythmGameSprites16.png"),
      skillAtlasLogicalAssetId: logicalAssetId("RhythmGameSprites5.png"),
      flickAtlasLogicalAssetId: logicalAssetId("RhythmGameSprites1.png"),
      longAtlasLogicalAssetId: logicalAssetId("RhythmGameSprites2.png"),
      longFlashAtlasLogicalAssetId: logicalAssetId("RhythmGameSprites3.png"),
      slideAmongAtlasLogicalAssetId: logicalAssetId("RhythmGameSprites2.png"),
      syncLineLogicalAssetId: logicalAssetId("simultaneous_line.png"),
      longNoteMaterialLogicalAssetId: logicalAssetId("longNoteLine.png"),
      curveNoteMaterialLogicalAssetId: logicalAssetId("longNoteLine2.png"),
      multipleDirectionalLineLeftLogicalAssetId: "bestdori.habahiro.multiple-directional-left",
      multipleDirectionalLineRightLogicalAssetId: "bestdori.habahiro.multiple-directional-right",
    }),
    spriteCount: 179 as const,
  }));
}

export function parseHabahiroAtlasRows(
  spriteBytes: Uint8Array,
  bundleBytes: Uint8Array,
): SimulatorResult<ReadonlyMap<string, readonly RenderAtlasRow[]>> {
  let sprites: unknown;
  let bundle: unknown;
  try {
    sprites = JSON.parse(new TextDecoder().decode(spriteBytes));
    bundle = JSON.parse(new TextDecoder().decode(bundleBytes));
  } catch {
    return reject(
      "render.habahiro.bestdori-metadata-invalid-json",
      "The pinned HABAHIRO exported Sprite and bundle metadata must both be valid JSON.",
    );
  }
  if (!Array.isArray(sprites) || sprites.length !== 179) {
    return reject(
      "render.habahiro.bestdori-sprite-count-mismatch",
      "The current external HABAHIRO profile requires exactly 179 Sprite rows.",
    );
  }
  const pathToFile = parseBundleTextureMap(bundle as RawBundle);
  if (pathToFile.status !== "ok") return pathToFile;
  const dimensions = new Map(
    HABAHIRO_BESTDORI_PINNED_ASSETS.flatMap((asset) =>
      asset.dimensions === null
        ? []
        : [[asset.technicalName.toLowerCase(), asset.dimensions] as const]),
  );
  const exactKeys = new Set<string>();
  const rowsByTexture = new Map<string, RenderAtlasRow[]>();
  for (const candidate of sprites as RawSpriteEntry[]) {
    const base = candidate.Base;
    const rect = base?.m_Rect;
    const pivot = base?.m_Pivot;
    const exactKey = base?.m_Name;
    const pathId = base?.m_RD?.texture?.m_PathID;
    const pixelsPerUnit = base?.m_PixelsToUnits;
    if (
      typeof exactKey !== "string" || exactKey.length === 0 || exactKeys.has(exactKey) ||
      !isFiniteNumber(rect?.x) || !isFiniteNumber(rect?.y) ||
      !isFiniteNumber(rect?.width) || !isFiniteNumber(rect?.height) ||
      !isFiniteNumber(pivot?.x) || !isFiniteNumber(pivot?.y) ||
      !isFiniteNumber(pixelsPerUnit) || pixelsPerUnit <= 0 ||
      (typeof pathId !== "string" && typeof pathId !== "number")
    ) {
      return reject(
        "render.habahiro.bestdori-sprite-row-invalid",
        "Every HABAHIRO Sprite row requires one unique key, finite rect/pivot/PPU and texture PathID.",
      );
    }
    const textureName = pathToFile.value.get(String(pathId));
    const size = textureName === undefined ? undefined : dimensions.get(textureName);
    if (textureName === undefined || size === undefined) {
      return reject(
        "render.habahiro.bestdori-texture-path-unresolved",
        "Every HABAHIRO Sprite texture PathID must resolve through the pinned bundle preload range.",
      );
    }
    const x = Math.trunc(rect.x);
    const y = Math.trunc(size[1] - rect.y - rect.height);
    const width = Math.trunc(rect.width);
    const height = Math.trunc(rect.height);
    if (
      x < 0 || y < 0 || width <= 0 || height <= 0 ||
      x + width > size[0] || y + height > size[1]
    ) {
      return reject(
        "render.habahiro.bestdori-sprite-rect-out-of-bounds",
        "Unity bottom-left HABAHIRO rects must convert inside the pinned PNG dimensions.",
      );
    }
    exactKeys.add(exactKey);
    const rows = rowsByTexture.get(textureName) ?? [];
    rows.push(Object.freeze({
      exactKey,
      x,
      y,
      width,
      height,
      pivotX: pivot.x,
      pivotY: pivot.y,
      pixelsPerUnit,
    }));
    rowsByTexture.set(textureName, rows);
  }
  return ok(new Map([...rowsByTexture].map(([name, rows]) => [
    name,
    Object.freeze([...rows].sort((left, right) => left.exactKey.localeCompare(right.exactKey))),
  ])));
}

function parseBundleTextureMap(
  bundle: RawBundle,
): SimulatorResult<ReadonlyMap<string, string>> {
  const preload = bundle.Base?.m_PreloadTable;
  const container = bundle.Base?.m_Container;
  if (!Array.isArray(preload) || container === null || typeof container !== "object") {
    return reject(
      "render.habahiro.bestdori-bundle-shape-invalid",
      "The HABAHIRO bundle export requires preload and container tables.",
    );
  }
  const output = new Map<string, string>();
  for (const [path, value] of Object.entries(container)) {
    const start = value.preloadIndex;
    const size = value.preloadSize;
    if (typeof start !== "number" || typeof size !== "number" ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0) {
      return reject(
        "render.habahiro.bestdori-bundle-range-invalid",
        "Every HABAHIRO bundle container requires one valid preload range.",
      );
    }
    const segments = path.replace(/\\/g, "/").split("/");
    const fileName = segments[segments.length - 1]?.toLowerCase();
    if (fileName === undefined || fileName.length === 0) continue;
    for (const row of preload.slice(start, start + size)) {
      const pathId = row?.m_PathID;
      if (typeof pathId === "string" || typeof pathId === "number") {
        output.set(String(pathId), fileName);
      }
    }
  }
  return ok(output);
}

function materialRoleFor(
  technicalName: string,
): "sprite" | "long-note" | "curve-note" | "sync-line" {
  if (technicalName === "longNoteLine.png") return "long-note";
  if (technicalName === "longNoteLine2.png") return "curve-note";
  if (technicalName === "simultaneous_line.png") return "sync-line";
  return "sprite";
}

function createDirectionalAliasRows(
  rows: readonly RenderAtlasRow[],
): SimulatorResult<readonly RenderAtlasRow[]> {
  const source = rows.find((row) => row.exactKey === "note_flick_top");
  if (source === undefined) {
    return reject(
      "render.habahiro.bestdori-directional-alias-source-missing",
      "The external portable directional disposition requires exact note_flick_top and never aliases an arbitrary first row.",
    );
  }
  return ok(Object.freeze(["l", "r"].flatMap((direction) =>
    Array.from({ length: 7 }, (_, lane) => Object.freeze({
      ...source,
      exactKey: `note_flick_${direction}_${lane}`,
    })))));
}

function logicalAssetIdFor(technicalName: string): string {
  return `${LOGICAL_PREFIX}${technicalName.toLowerCase()}`;
}

function logicalAssetId(technicalName: string): string {
  return logicalAssetIdFor(technicalName);
}

function isAllowedBestdoriUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "bestdori.com" &&
      parsed.pathname.startsWith("/assets/jp/ingameskin/noteskin/habahiro_rip/");
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function reject(capability: string, detail: string): SimulatorResult<never> {
  return evidenceRequired(capability, ["HAB-A01", "HAB-A02", "HAB-A03"], detail);
}
