import { Texture } from "pixi.js";
import { evidenceRequired, ok, type SimulatorResult } from "../../engine/evidence";
import type { RenderResourceAssetProfile } from "../renderingContracts";
import type { PixiTextureDecoder } from "./pixiRendererBackend";

export class BrowserPixiTextureDecoder implements PixiTextureDecoder {
  async decodePng(
    asset: RenderResourceAssetProfile,
    bytes: Uint8Array,
  ): Promise<SimulatorResult<Texture>> {
    if (typeof globalThis.createImageBitmap !== "function") {
      return reject(
        "render.pixi.create-image-bitmap-unavailable",
        "Browser PNG decode requires createImageBitmap and never falls back to a URL, Image element or network loader.",
      );
    }
    let bitmap: ImageBitmap | null = null;
    try {
      const owned = Uint8Array.from(bytes);
      bitmap = await globalThis.createImageBitmap(
        new Blob([owned.buffer], { type: "image/png" }),
        {
          imageOrientation: "none",
          premultiplyAlpha: "none",
          colorSpaceConversion: "none",
        },
      );
      if (bitmap.width !== asset.width || bitmap.height !== asset.height) {
        bitmap.close();
        return reject(
          "render.pixi.browser-decoded-dimension-mismatch",
          "Browser-decoded dimensions must match the already hash-validated PNG profile.",
        );
      }
      const texture = Texture.from(bitmap, true);
      const ownedBitmap = bitmap;
      texture.source.once("destroy", () => ownedBitmap.close());
      bitmap = null;
      return ok(texture);
    } catch {
      bitmap?.close();
      return reject(
        "render.pixi.browser-png-decode-threw",
        "Browser PNG decode failure is structured and cannot fall back to another source.",
      );
    }
  }
}

function reject(capability: string, boundary: string) {
  return evidenceRequired(
    capability,
    ["RPR-D02", "RPR-D14", "RPR-D17", "PR35", "PR37"],
    boundary,
  );
}
