import { CURRENT_SCORE_HUD_BINDINGS } from "./currentScoreHudTestManifest";
import { CURRENT_ORDINARY_VISIBLE_BINDINGS } from "./currentOrdinaryVisibleTestManifest";

export interface OrdinaryPortableResourceEntry {
  readonly logicalAssetId: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

export const CURRENT_ORDINARY_PORTABLE_PACK_IDENTITY =
  "ordinary-current-10.1.4-portable-v1" as const;

export const CURRENT_ORDINARY_PORTABLE_PROFILE_RESOURCE = Object.freeze({
  logicalAssetId: "ordinary/profile/current-10.1.4-portable-v1",
  byteLength: 20287,
  sha256: "82F9D26EF7A2A770F4846B534528094EEEDCE87DABDF5BB9E8D108777751453C",
});

export const CURRENT_ORDINARY_PORTABLE_RESOURCES: readonly OrdinaryPortableResourceEntry[] = Object.freeze([
  Object.freeze({
    logicalAssetId: "ordinary/notes/skin00/atlas",
    byteLength: 1190293,
    sha256: "E3D8EDE1D3CEC31D0250D41E0DF2EDE9822A9BDC981D2B69585F5875C5A9618F",
    width: 2048,
    height: 1024,
  }),
  Object.freeze({
    logicalAssetId: "ordinary/notes/skin00/long-note-line",
    byteLength: 1976,
    sha256: "D4011A1FF77407E3E3EA224C6C81B5BFC3122AC65E4A1A2FC99CFA667E1ECA2D",
    width: 146,
    height: 205,
  }),
  Object.freeze({
    logicalAssetId: "ordinary/notes/skin00/curve-note-line",
    byteLength: 1905,
    sha256: "09F8E06F160A34D95B337590BCBED1A88C914396B7EF3B4E8373CE29F8527FBE",
    width: 146,
    height: 205,
  }),
  Object.freeze({
    logicalAssetId: "ordinary/notes/skin00/simultaneous-line",
    byteLength: 247,
    sha256: "9DC5E6C2DAA88BACFC3F39F791CAC7C40601300AA4BD6870344326C2CCB4CCE5",
    width: 10,
    height: 27,
  }),
  Object.freeze({
    logicalAssetId: "ordinary/notes/directionalflickskin00/atlas",
    byteLength: 264263,
    sha256: "9B16438FEFA28997D7B813421A8683B42D9BFECD378CC419F1E688239FD82365",
    width: 1024,
    height: 1024,
  }),
  Object.freeze({
    logicalAssetId: "ordinary/notes/directionalflickskin00/line-left",
    byteLength: 190,
    sha256: "6B9A27F589A65CBF9F36D1F73690B95D8304BC95DC3F8BE3A580B8AEB47C478B",
    width: 10,
    height: 78,
  }),
  Object.freeze({
    logicalAssetId: "ordinary/notes/directionalflickskin00/line-right",
    byteLength: 191,
    sha256: "19654D4B306230CC770ED37E2CD763239AC2A5F253064123DBF3862DBD271886",
    width: 10,
    height: 78,
  }),
]);

export const CURRENT_ORDINARY_RENDER_BINDINGS = Object.freeze({
  noteAtlasLogicalAssetId: "ordinary/notes/skin00/atlas",
  directionalAtlasLogicalAssetId: "ordinary/notes/directionalflickskin00/atlas",
  syncLineLogicalAssetId: "ordinary/notes/skin00/simultaneous-line",
  multipleDirectionalLineLeftLogicalAssetId: "ordinary/notes/directionalflickskin00/line-left",
  multipleDirectionalLineRightLogicalAssetId: "ordinary/notes/directionalflickskin00/line-right",
  longNoteMaterialLogicalAssetId: "ordinary/notes/skin00/long-note-line",
  curveNoteMaterialLogicalAssetId: "ordinary/notes/skin00/curve-note-line",
  scoreHud: CURRENT_SCORE_HUD_BINDINGS,
  ordinaryVisible: CURRENT_ORDINARY_VISIBLE_BINDINGS,
});
