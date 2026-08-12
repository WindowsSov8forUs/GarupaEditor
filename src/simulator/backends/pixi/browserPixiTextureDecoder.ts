import { Texture } from "pixi.js";
import { evidenceRequired, ok, type SimulatorResult } from "../../engine/evidence";
import type { RenderResourceAssetProfile } from "../renderingContracts";
import type { PixiDecodedFont, PixiTextureDecoder } from "./pixiRendererBackend";

export class BrowserPixiTextureDecoder implements PixiTextureDecoder {
  async decodeFont(
    asset: RenderResourceAssetProfile,
    bytes: Uint8Array,
  ): Promise<SimulatorResult<PixiDecodedFont>> {
    if (typeof globalThis.FontFace !== "function" || typeof document === "undefined" || document.fonts == null) {
      return reject(
        "render.pixi.font-face-unavailable",
        "Browser Score Rank label preparation requires FontFace and document.fonts without a system-font fallback.",
      );
    }
    const family = `GarupaScoreRank-${asset.sha256.slice(0, 16)}`;
    let face: FontFace | null = null;
    try {
      const owned = Uint8Array.from(bytes);
      face = new FontFace(family, owned.buffer as ArrayBuffer);
      await face.load();
      document.fonts.add(face);
      const loaded = face;
      return ok(Object.freeze({
        family,
        dispose() { document.fonts.delete(loaded); },
      }));
    } catch {
      if (face !== null) document.fonts.delete(face);
      return reject(
        "render.pixi.rank-font-decode-threw",
        "The hash-validated current sgm Rank label font must load before renderer readiness.",
      );
    }
  }

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
