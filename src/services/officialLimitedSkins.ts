import type { OfficialLimitedSkin, SkinResourceServer } from "../simulator/public/settings";
import { OFFICIAL_SERVER_ORDER, type OfficialServer } from "./officialMusicSources";
import type { MasterLimitedSkin, OfficialMasterSnapshot } from "./officialMusicMaster";

/** A bundle is used only for the components the row changes, as the master's change flags say. */
const changed = (changes: boolean | undefined, value: string | undefined): string | null => changes && value ? value : null;

/**
 * Limited skins as the official masters carry them: each id once, from the first server in server order
 * that has it, with that server's resource bundles and thumbnail. The name is the Chinese master's when it
 * has one, because the editor shows Chinese names; otherwise the server's own name.
 */
export function limitedSkinsFromMasters(masters: Partial<Record<OfficialServer, OfficialMasterSnapshot>>): OfficialLimitedSkin[] {
  const rows = new Map<number, OfficialLimitedSkin>();
  for (const server of OFFICIAL_SERVER_ORDER) {
    for (const row of Object.values(masters[server]?.master.masterLimitedSkinMap?.entries ?? {})) {
      if (rows.has(row.limitedSkinId)) continue;
      rows.set(row.limitedSkinId, toLimitedSkin(row, server, masters));
    }
  }
  return [...rows.values()].sort((a, b) => a.seq - b.seq);
}

function toLimitedSkin(row: MasterLimitedSkin, server: OfficialServer, masters: Partial<Record<OfficialServer, OfficialMasterSnapshot>>): OfficialLimitedSkin {
  const chineseName = masters.cn?.master.masterLimitedSkinMap?.entries?.[String(row.limitedSkinId)]?.limitedSkinName;
  return {
    kind: "limited",
    resourceServer: server as SkinResourceServer,
    selectionId: row.limitedSkinId,
    selectable: true,
    backgroundBundleName: changed(row.changeBackgroundSkinFlg, row.backgroundSkinAssetBundleName),
    effectBundleName: changed(row.changeEffectSkinFlg, row.effectSkinAssetBundleName),
    laneBundleName: changed(row.changeLaneSkinFlg, row.laneSkinAssetBundleName),
    notesBundleName: changed(row.changeNotesSkinFlg, row.notesSkinAssetBundleName),
    soundEffectBundleName: changed(row.changeSoundEffectSkinFlg, row.soundEffectSkinAssetBundleName),
    judgeBundleName: changed(row.changeJudgeSkinFlg, row.judgeSkinAssetBundleName),
    directionalBundleName: changed(row.changeDirectionalFlickFlg, row.directionalFlickAssetBundleName),
    noteSyncEdgeMargin: Math.fround(row.noteSyncEdgeMargin ?? 0),
    name: chineseName || row.limitedSkinName || String(row.limitedSkinId),
    seq: row.seq ?? 0,
    thumbnailFileName: row.thumbnailFileName ?? "",
  };
}
