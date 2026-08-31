declare function require(name: string): any;
declare const process: any;
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import commonCatalog from "../../../engine/skin/commonRenderSemanticCatalog.json";
import { parseCurrentGameClearProfile, type GameClearRuntimeProfile } from "../../../backends/resources/currentGameClearProfile";
import type { RenderResourceAssetProfile } from "../../../backends/renderingContracts";

export function gameClearTestResources(): Readonly<{
  profile: GameClearRuntimeProfile;
  assets: readonly RenderResourceAssetProfile[];
  resources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[];
}> {
  const root = join(process.cwd(), "src/assets/game/prefabs/bms/gameclear");
  const profile = parseCurrentGameClearProfile(JSON.parse(readFileSync(join(root, "game-clear-profile.json"), "utf8")));
  if (profile === null) throw new Error("production game-clear profile did not parse in test adapter");
  const rows = (commonCatalog.groups as any).gameClear as readonly { readonly file: string; readonly profile: Omit<RenderResourceAssetProfile, "byteLength" | "sha256" | "provenance"> }[];
  const assets = rows.map((row) => {
    const bytes = Uint8Array.from(readFileSync(join(root, row.file)) as Uint8Array);
    return Object.freeze({
      ...row.profile,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
      provenance: "current-official-portable" as const,
    });
  });
  const resources = rows.map((row, index) => Object.freeze({
    logicalAssetId: assets[index]!.logicalAssetId,
    bytes: Uint8Array.from(readFileSync(join(root, row.file)) as Uint8Array),
  }));
  return Object.freeze({ profile, assets: Object.freeze(assets), resources: Object.freeze(resources) });
}
