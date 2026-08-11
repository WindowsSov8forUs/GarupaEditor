import { Texture } from "pixi.js";
import type { ParticleOperationResult, ParticleResourceAllowlistEntry } from "../particleContracts";
import { particleAccepted, particleRejected } from "../particleValidation";
import type { ParticlePixiTextureDecoder } from "./pixiParticleRendererBackend";

export class BrowserPixiParticleTextureDecoder implements ParticlePixiTextureDecoder {
  async decodePng(
    asset: ParticleResourceAllowlistEntry,
    bytes: Uint8Array,
  ): Promise<ParticleOperationResult<Texture>> {
    if (asset.mime !== "image/png" || asset.width === null || asset.height === null ||
      !(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return reject(
        "particle.pixi.browser-invalid-decode-input",
        "Browser particle decode accepts only one prepared PNG allowlist entry and its non-empty owned bytes.",
      );
    }
    if (typeof globalThis.createImageBitmap !== "function") {
      return reject(
        "particle.pixi.create-image-bitmap-unavailable",
        "Browser PNG decode requires createImageBitmap and never falls back to URL, Image, network or software-generated texture content.",
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
          "particle.pixi.browser-decoded-dimension-mismatch",
          "Browser-decoded particle dimensions must match the hash-validated current PNG profile.",
        );
      }
      const texture = Texture.from(bitmap, true);
      const ownedBitmap = bitmap;
      texture.source.once("destroy", () => ownedBitmap.close());
      bitmap = null;
      return particleAccepted(texture);
    } catch {
      bitmap?.close();
      return reject(
        "particle.pixi.browser-png-decode-threw",
        "Browser particle PNG decode failure is structured and has no alternate source fallback.",
      );
    }
  }
}

function reject(capability: string, boundary: string) {
  return particleRejected("particle-resource-decode", capability, boundary);
}
