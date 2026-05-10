import { readSkinBinaryFileAsDataUrl } from "./services/bestdori/api";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonArray | JsonObject;
type JsonArray = JsonValue[];
type JsonObject = { [key: string]: JsonValue };

interface SpriteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpritePoint {
  x: number;
  y: number;
}

interface SpriteBorder {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface SpriteRenderDataKeyFirst {
  "data[0]": number;
  "data[1]": number;
  "data[2]": number;
  "data[3]": number;
}

interface AssetFileRef {
  m_FileID: number;
  m_PathID: string;
}

interface SpriteBase {
  m_Name: string;
  m_Rect: SpriteRect;
  m_Offset: SpritePoint;
  m_Border: SpriteBorder;
  m_PixelsToUnits: number;
  m_Pivot: SpritePoint;
  m_Extrude: number;
  m_IsPolygon: boolean;
  m_RenderDataKey: {
    first: SpriteRenderDataKeyFirst;
    second: string;
  };
  m_AtlasTags: JsonArray;
  m_SpriteAtlas: AssetFileRef;
  m_RD: JsonObject;
  m_PhysicsShape: SpritePoint[][];
  m_Bones: JsonArray;
}

interface SpriteManifestEntry {
  Base: SpriteBase;
}

export type SpriteManifest = SpriteManifestEntry[];

interface AssetSpriteEntry {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borderLeft: number;
  borderRight: number;
  borderTop: number;
  borderBottom: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
}

interface AssetBase {
  m_Name: string;
  mSprites: AssetSpriteEntry[];
  mPixelSize: number;
}

export interface AssetManifest {
  Base: AssetBase;
}

interface BundleContainerEntry {
  asset: AssetFileRef;
  preloadIndex: number;
  preloadSize: number;
}

interface BundleBase {
  m_Name: string;
  m_AssetBundleName: string;
  m_PreloadTable: AssetFileRef[];
  m_Container: Record<string, BundleContainerEntry>;
  m_MainAsset: BundleContainerEntry;
  m_Dependencies: JsonArray;
  m_SceneHashes: JsonObject;
  m_IsStreamedSceneAssetBundle: boolean;
  m_PathFlags: number;
  m_ExplicitDataLayout: number;
  m_RuntimeCompatibility: number;
}

export interface BundleManifest {
  Base: BundleBase;
}

function parseJsonValueOrThrow(raw: string, label: string): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} parse failed: ${message}`);
  }
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} parse failed: expected object`);
  }
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} parse failed: expected array`);
  }
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} parse failed: expected string`);
  }
  return value;
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} parse failed: expected boolean`);
  }
  return value;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} parse failed: expected finite number`);
  }
  return value;
}

function toJsonValueOrThrow(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => toJsonValueOrThrow(item, `${label}[${index}]`));
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const jsonObject: JsonObject = {};
    for (const [key, item] of Object.entries(object)) {
      jsonObject[key] = toJsonValueOrThrow(item, `${label}.${key}`);
    }
    return jsonObject;
  }
  throw new Error(`${label} parse failed: unsupported value type`);
}

function toJsonArrayOrThrow(value: unknown, label: string): JsonArray {
  const json = toJsonValueOrThrow(value, label);
  if (!Array.isArray(json)) {
    throw new Error(`${label} parse failed: expected JSON array`);
  }
  return json;
}

function toJsonObjectOrThrow(value: unknown, label: string): JsonObject {
  const json = toJsonValueOrThrow(value, label);
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`${label} parse failed: expected JSON object`);
  }
  return json as JsonObject;
}

function parseAssetFileRef(value: unknown, label: string): AssetFileRef {
  const object = assertObject(value, label);
  return {
    m_FileID: assertFiniteNumber(object.m_FileID, `${label}.m_FileID`),
    m_PathID: assertString(object.m_PathID, `${label}.m_PathID`),
  };
}

function parseSpritePoint(value: unknown, label: string): SpritePoint {
  const object = assertObject(value, label);
  return {
    x: assertFiniteNumber(object.x, `${label}.x`),
    y: assertFiniteNumber(object.y, `${label}.y`),
  };
}

function parseSpriteRect(value: unknown, label: string): SpriteRect {
  const object = assertObject(value, label);
  return {
    x: assertFiniteNumber(object.x, `${label}.x`),
    y: assertFiniteNumber(object.y, `${label}.y`),
    width: assertFiniteNumber(object.width, `${label}.width`),
    height: assertFiniteNumber(object.height, `${label}.height`),
  };
}

function parseSpriteBorder(value: unknown, label: string): SpriteBorder {
  const object = assertObject(value, label);
  return {
    x: assertFiniteNumber(object.x, `${label}.x`),
    y: assertFiniteNumber(object.y, `${label}.y`),
    z: assertFiniteNumber(object.z, `${label}.z`),
    w: assertFiniteNumber(object.w, `${label}.w`),
  };
}

function parseSpriteBase(value: unknown, label: string): SpriteBase {
  const object = assertObject(value, label);
  const renderDataKey = assertObject(object.m_RenderDataKey, `${label}.m_RenderDataKey`);
  const renderDataKeyFirst = assertObject(renderDataKey.first, `${label}.m_RenderDataKey.first`);

  const physicsShapeRows = assertArray(object.m_PhysicsShape, `${label}.m_PhysicsShape`).map((row, rowIndex) => {
    return assertArray(row, `${label}.m_PhysicsShape[${rowIndex}]`).map((point, pointIndex) =>
      parseSpritePoint(point, `${label}.m_PhysicsShape[${rowIndex}][${pointIndex}]`)
    );
  });

  return {
    m_Name: assertString(object.m_Name, `${label}.m_Name`),
    m_Rect: parseSpriteRect(object.m_Rect, `${label}.m_Rect`),
    m_Offset: parseSpritePoint(object.m_Offset, `${label}.m_Offset`),
    m_Border: parseSpriteBorder(object.m_Border, `${label}.m_Border`),
    m_PixelsToUnits: assertFiniteNumber(object.m_PixelsToUnits, `${label}.m_PixelsToUnits`),
    m_Pivot: parseSpritePoint(object.m_Pivot, `${label}.m_Pivot`),
    m_Extrude: assertFiniteNumber(object.m_Extrude, `${label}.m_Extrude`),
    m_IsPolygon: assertBoolean(object.m_IsPolygon, `${label}.m_IsPolygon`),
    m_RenderDataKey: {
      first: {
        "data[0]": assertFiniteNumber(renderDataKeyFirst["data[0]"], `${label}.m_RenderDataKey.first.data[0]`),
        "data[1]": assertFiniteNumber(renderDataKeyFirst["data[1]"], `${label}.m_RenderDataKey.first.data[1]`),
        "data[2]": assertFiniteNumber(renderDataKeyFirst["data[2]"], `${label}.m_RenderDataKey.first.data[2]`),
        "data[3]": assertFiniteNumber(renderDataKeyFirst["data[3]"], `${label}.m_RenderDataKey.first.data[3]`),
      },
      second: assertString(renderDataKey.second, `${label}.m_RenderDataKey.second`),
    },
    m_AtlasTags: toJsonArrayOrThrow(object.m_AtlasTags, `${label}.m_AtlasTags`),
    m_SpriteAtlas: parseAssetFileRef(object.m_SpriteAtlas, `${label}.m_SpriteAtlas`),
    m_RD: toJsonObjectOrThrow(object.m_RD, `${label}.m_RD`),
    m_PhysicsShape: physicsShapeRows,
    m_Bones: toJsonArrayOrThrow(object.m_Bones, `${label}.m_Bones`),
  };
}

function normalizeRectForCrop(rect: SpriteRect, label: string): SpriteRect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
    throw new Error(`${label} parse failed: invalid sprite rect`);
  }
  return { x, y, width, height };
}

export function parseSpritesJsonOrThrow(raw: string, label: string): SpriteManifest {
  const parsed = parseJsonValueOrThrow(raw, label);
  const array = assertArray(parsed, label);
  return array.map((entry, index) => {
    const object = assertObject(entry, `${label}[${index}]`);
    return {
      Base: parseSpriteBase(object.Base, `${label}[${index}].Base`),
    };
  });
}

function parseBundleContainerEntry(value: unknown, label: string): BundleContainerEntry {
  const object = assertObject(value, label);
  return {
    asset: parseAssetFileRef(object.asset, `${label}.asset`),
    preloadIndex: assertFiniteNumber(object.preloadIndex, `${label}.preloadIndex`),
    preloadSize: assertFiniteNumber(object.preloadSize, `${label}.preloadSize`),
  };
}

function parseBundleBase(value: unknown, label: string): BundleBase {
  const object = assertObject(value, label);
  const containerObject = assertObject(object.m_Container, `${label}.m_Container`);
  const parsedContainer: Record<string, BundleContainerEntry> = {};
  for (const [assetPath, entry] of Object.entries(containerObject)) {
    parsedContainer[assetPath] = parseBundleContainerEntry(entry, `${label}.m_Container.${assetPath}`);
  }

  return {
    m_Name: assertString(object.m_Name, `${label}.m_Name`),
    m_AssetBundleName: assertString(object.m_AssetBundleName, `${label}.m_AssetBundleName`),
    m_PreloadTable: assertArray(object.m_PreloadTable, `${label}.m_PreloadTable`).map((item, index) =>
      parseAssetFileRef(item, `${label}.m_PreloadTable[${index}]`)
    ),
    m_Container: parsedContainer,
    m_MainAsset: parseBundleContainerEntry(object.m_MainAsset, `${label}.m_MainAsset`),
    m_Dependencies: toJsonArrayOrThrow(object.m_Dependencies, `${label}.m_Dependencies`),
    m_SceneHashes: toJsonObjectOrThrow(object.m_SceneHashes, `${label}.m_SceneHashes`),
    m_IsStreamedSceneAssetBundle: assertBoolean(
      object.m_IsStreamedSceneAssetBundle,
      `${label}.m_IsStreamedSceneAssetBundle`,
    ),
    m_PathFlags: assertFiniteNumber(object.m_PathFlags, `${label}.m_PathFlags`),
    m_ExplicitDataLayout: assertFiniteNumber(object.m_ExplicitDataLayout, `${label}.m_ExplicitDataLayout`),
    m_RuntimeCompatibility: assertFiniteNumber(object.m_RuntimeCompatibility, `${label}.m_RuntimeCompatibility`),
  };
}

function parseAssetSpriteEntry(value: unknown, label: string): AssetSpriteEntry {
  const object = assertObject(value, label);
  return {
    name: assertString(object.name, `${label}.name`),
    x: assertFiniteNumber(object.x, `${label}.x`),
    y: assertFiniteNumber(object.y, `${label}.y`),
    width: assertFiniteNumber(object.width, `${label}.width`),
    height: assertFiniteNumber(object.height, `${label}.height`),
    borderLeft: assertFiniteNumber(object.borderLeft, `${label}.borderLeft`),
    borderRight: assertFiniteNumber(object.borderRight, `${label}.borderRight`),
    borderTop: assertFiniteNumber(object.borderTop, `${label}.borderTop`),
    borderBottom: assertFiniteNumber(object.borderBottom, `${label}.borderBottom`),
    paddingLeft: assertFiniteNumber(object.paddingLeft, `${label}.paddingLeft`),
    paddingRight: assertFiniteNumber(object.paddingRight, `${label}.paddingRight`),
    paddingTop: assertFiniteNumber(object.paddingTop, `${label}.paddingTop`),
    paddingBottom: assertFiniteNumber(object.paddingBottom, `${label}.paddingBottom`),
  };
}

function parseAssetBase(value: unknown, label: string): AssetBase {
  const object = assertObject(value, label);
  return {
    m_Name: assertString(object.m_Name, `${label}.m_Name`),
    mSprites: assertArray(object.mSprites, `${label}.mSprites`).map((entry, index) =>
      parseAssetSpriteEntry(entry, `${label}.mSprites[${index}]`)
    ),
    mPixelSize: assertFiniteNumber(object.mPixelSize, `${label}.mPixelSize`),
  };
}

export function parseBundleJsonOrThrow(raw: string, label: string): BundleManifest {
  const parsed = parseJsonValueOrThrow(raw, label);
  const object = assertObject(parsed, label);
  return {
    Base: parseBundleBase(object.Base, `${label}.Base`),
  };
}

export function parseAssetJsonOrThrow(raw: string, label: string): AssetManifest {
  const parsed = parseJsonValueOrThrow(raw, label);
  const object = assertObject(parsed, label);
  return {
    Base: parseAssetBase(object.Base, `${label}.Base`),
  };
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Texture image load failed: ${url}`));
    image.src = url;
  });
}

function cropSprite(image: HTMLImageElement, rect: SpriteRect): string {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Cannot create Canvas 2D context.");
  }

  // Unity .sprites y origin is bottom-left; Canvas origin is top-left.
  const sourceX = rect.x;
  const sourceY = image.height - rect.y - rect.height;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );

  return canvas.toDataURL("image/png");
}

function cropSpriteTopLeft(image: HTMLImageElement, rect: SpriteRect): string {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Cannot create Canvas 2D context.");
  }

  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );

  return canvas.toDataURL("image/png");
}

function getAssetFilename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const raw = segments[segments.length - 1] ?? normalized;
  return raw.toLowerCase();
}

function buildAtlasFileByPreloadRange(bundle: BundleManifest): Map<string, string> {
  const preloadTable = bundle.Base.m_PreloadTable;
  const output = new Map<string, string>();

  for (const [assetPath, containerEntry] of Object.entries(bundle.Base.m_Container)) {
    const atlasFile = getAssetFilename(assetPath);
    const rawStartIndex = Math.floor(containerEntry.preloadIndex);
    const rawSize = Math.max(0, Math.floor(containerEntry.preloadSize));
    if (rawSize <= 0) {
      continue;
    }
    const startIndex = Math.max(0, rawStartIndex);
    const endExclusive = Math.min(preloadTable.length, rawStartIndex + rawSize);
    if (endExclusive <= startIndex) {
      continue;
    }
    for (let index = startIndex; index < endExclusive; index += 1) {
      const pathId = preloadTable[index]?.m_PathID;
      if (!pathId) {
        continue;
      }
      if (!output.has(pathId)) {
        output.set(pathId, atlasFile);
      }
    }
  }

  return output;
}

function isLoadableUrl(path: string): boolean {
  return /^https?:\/\//i.test(path)
    || /^data:/i.test(path)
    || /^blob:/i.test(path)
    || /^asset:\/\/|^asset\.localhost\//i.test(path);
}

async function loadImageFromMappedPath(path: string): Promise<HTMLImageElement> {
  if (isLoadableUrl(path)) {
    return loadImageFromUrl(path);
  }
  const dataUrl = await readSkinBinaryFileAsDataUrl(path, path);
  return loadImageFromUrl(dataUrl);
}

function resolveSpriteTexturePathId(entry: SpriteManifestEntry): string | null {
  const textureRaw = (entry.Base.m_RD as Record<string, JsonValue>)?.texture;
  if (!textureRaw || typeof textureRaw !== "object" || Array.isArray(textureRaw)) {
    return null;
  }
  const texture = textureRaw as Record<string, JsonValue>;
  const pathId = texture.m_PathID;
  if (typeof pathId === "string" && pathId.length > 0) {
    return pathId;
  }
  if (typeof pathId === "number" && Number.isFinite(pathId)) {
    return String(pathId);
  }
  return null;
}

type ExtractNamedSpritesParams = {
  filePathByName: Record<string, string>;
  sprites: SpriteManifest;
  bundle: BundleManifest;
};

export type AssetSpriteCoordinateOrigin = "top-left" | "bottom-left";

type ExtractNamedSpritesFromAssetParams = {
  filePathByName: Record<string, string>;
  asset: AssetManifest;
  bundle?: BundleManifest;
  atlasFileName?: string;
  coordinateOrigin?: AssetSpriteCoordinateOrigin;
};

export async function extractNamedSprites(
  params: ExtractNamedSpritesParams,
): Promise<Record<string, string>> {
  const {
    filePathByName,
    sprites,
    bundle,
  } = params;

  const pathIdToAtlasFile = buildAtlasFileByPreloadRange(bundle);

  const imageCache = new Map<string, Promise<HTMLImageElement>>();
  const getImageForFile = (fileName: string): Promise<HTMLImageElement> => {
    const key = fileName.toLowerCase();
    const cached = imageCache.get(key);
    if (cached) {
      return cached;
    }
    const filePath = filePathByName[key];
    if (!filePath) {
      throw new Error(`file map missing atlas: ${fileName}`);
    }
    const promise = loadImageFromMappedPath(filePath);
    imageCache.set(key, promise);
    return promise;
  };

  const output: Record<string, string> = {};
  for (const entry of sprites) {
    const name = entry.Base.m_Name;
    if (name.length === 0) {
      continue;
    }

    const rect = normalizeRectForCrop(entry.Base.m_Rect, `${name}.m_Rect`);
    const texturePathId = resolveSpriteTexturePathId(entry);
    const atlasFile = texturePathId ? pathIdToAtlasFile.get(texturePathId) : undefined;
    if (!atlasFile) {
      throw new Error(`cannot resolve atlas file for sprite: ${name}`);
    }

    const image = await getImageForFile(atlasFile);
    output[name] = cropSprite(image, rect);
  }

  return output;
}

function listBundleAtlasFiles(bundle: BundleManifest): string[] {
  const files = new Set<string>();
  for (const assetPath of Object.keys(bundle.Base.m_Container)) {
    const fileName = getAssetFilename(assetPath);
    if (fileName.endsWith(".png")) {
      files.add(fileName);
    }
  }
  return Array.from(files.values());
}

function resolveAtlasFileNameForAssetExtraction(
  bundle: BundleManifest | undefined,
  atlasFileName: string | undefined,
): string {
  if (atlasFileName && atlasFileName.trim().length > 0) {
    return atlasFileName.trim().toLowerCase();
  }
  if (!bundle) {
    throw new Error("atlasFileName is required when bundle is not provided.");
  }
  const atlasFiles = listBundleAtlasFiles(bundle);
  if (atlasFiles.length <= 0) {
    throw new Error("bundle does not contain any .png atlas file.");
  }
  if (atlasFiles.length > 1) {
    throw new Error(`bundle has multiple atlas files (${atlasFiles.join(", ")}), atlasFileName is required.`);
  }
  return atlasFiles[0];
}

export async function extractNamedSpritesFromAsset(
  params: ExtractNamedSpritesFromAssetParams,
): Promise<Record<string, string>> {
  const {
    filePathByName,
    asset,
    bundle,
    atlasFileName,
    coordinateOrigin = "top-left",
  } = params;

  const atlasFile = resolveAtlasFileNameForAssetExtraction(bundle, atlasFileName);
  const atlasPath = filePathByName[atlasFile] ?? filePathByName[atlasFile.toLowerCase()];
  if (!atlasPath) {
    throw new Error(`file map missing atlas: ${atlasFile}`);
  }
  const image = await loadImageFromMappedPath(atlasPath);

  const output: Record<string, string> = {};
  for (const sprite of asset.Base.mSprites) {
    if (sprite.name.length <= 0) {
      continue;
    }
    const normalizedRect = normalizeRectForCrop(
      {
        x: sprite.x,
        y: coordinateOrigin === "bottom-left"
          ? image.height - sprite.y - sprite.height
          : sprite.y,
        width: sprite.width,
        height: sprite.height,
      },
      `${sprite.name}.rect`,
    );
    output[sprite.name] = cropSpriteTopLeft(image, normalizedRect);
  }

  return output;
}
