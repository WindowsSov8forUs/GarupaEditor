import type { ResourceConsumerLease } from "../resources/contracts";
import { appLog } from "../logging/applicationLogger";
import { extractNamedSprites, parseBundleJsonOrThrow, parseSpritesJsonOrThrow } from "../noteSkinAssetTool";

export interface OriginalPreviewSprite {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly pixelsPerUnit: number;
  readonly pivotX: number;
  readonly pivotY: number;
}
const basename = (value: string) => value.replace(/\\/g, "/").split("/").pop()!.toLowerCase();

/** Use the same sprite decoder as live/editor skins; PNG dimensions alone are not world geometry. */
export async function readOriginalPreviewSprites(lease: ResourceConsumerLease, slot: string, identity: string,
  createImageUrl: (canvas: HTMLCanvasElement) => Promise<string>,
  names: ReadonlySet<string>): Promise<ReadonlyMap<string, OriginalPreviewSprite>> {
  const files = lease.listFiles(slot), urls: Record<string, string> = {};
  for (const file of files) {
    const name = basename(file.logicalPath);
    if (!name.endsWith(".png")) continue;
    if (name in urls) throw new Error(`Ambiguous preview asset ${slot}/${name}.`);
    urls[name] = await lease.openObjectUrl(slot, file.logicalPath);
  }
  const text = async (suffix: string) => {
    const matches = files.filter(file => basename(file.logicalPath).endsWith(suffix));
    if (matches.length !== 1) {
      appLog("error", "skin.preview.metadata-invalid", { slot, identity, suffix, count: matches.length,
        files: files.map(file => file.logicalPath) });
      throw new Error(`皮肤预览元数据不完整或重复：${identity}（${suffix}，找到 ${matches.length} 个）。`);
    }
    return new TextDecoder().decode(await lease.readBytes(slot, matches[0]!.logicalPath));
  };
  const sprites = parseSpritesJsonOrThrow(await text(".sprites"), identity)
    .filter(entry => names.has(entry.Base.m_Name));
  const bundle = parseBundleJsonOrThrow(await text(".bundle"), identity);
  const named = await extractNamedSprites({ filePathByName: urls, sprites, bundle, createImageUrl });
  const result = new Map<string, OriginalPreviewSprite>();
  for (const entry of sprites) {
    const value = entry.Base, url = named[value.m_Name];
    if (!url) continue;
    if (!(value.m_PixelsToUnits > 0) || !Number.isFinite(value.m_PixelsToUnits))
      throw new Error(`Invalid preview sprite units: ${value.m_Name}.`);
    result.set(value.m_Name, { url, width: value.m_Rect.width, height: value.m_Rect.height,
      pixelsPerUnit: value.m_PixelsToUnits, pivotX: value.m_Pivot.x, pivotY: value.m_Pivot.y });
  }
  return result;
}
