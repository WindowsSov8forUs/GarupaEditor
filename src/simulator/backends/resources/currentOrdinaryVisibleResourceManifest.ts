import type { RenderAtlasRow, RenderResourceAssetProfile } from "../renderingContracts";

export interface OrdinaryVisiblePortableResourceEntry {
  readonly resourceKeySuffix: string;
  readonly profile: RenderResourceAssetProfile;
}

const TEXTURE = Object.freeze({ scaleMode: "linear" as const, wrapModeU: "clamp" as const, wrapModeV: "clamp" as const, mipmap: "off" as const, premultiplyAlpha: true, blendMode: "normal" as const });
const ADDITIVE_TEXTURE = Object.freeze({ ...TEXTURE, blendMode: "add" as const });

export const CURRENT_ORDINARY_VISIBLE_PROFILE_RESOURCE = Object.freeze({ logicalAssetId: "hud/ordinary/visible-profile", resourceKeySuffix: "ordinary-visible-rendering-profile.json", byteLength: 28809, sha256: "13690E23ED72074C142681746EF933D97020E70D7E35D7BE10CF94E54BBE804D" });

export const CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES: readonly OrdinaryVisiblePortableResourceEntry[] = Object.freeze([
  entry("combo-number.png", {
    logicalAssetId: "hud/ordinary/combo-number-atlas", role: "hud-atlas", byteLength: 137053,
    sha256: "1AC0E30098F776E3E570AA2D8A7C15D8C71025D71A67BFCCD3B68EA56F2D743C", mime: "image/png", width: 512, height: 512,
    textureSettings: TEXTURE, atlasRows: Object.freeze([row("icon_number_big_0",336,0,82,116,[0, 0, 0, 0]),row("icon_number_big_1",168,0,82,116,[0, 0, 0, 0]),row("icon_number_big_2",84,354,82,116,[0, 0, 0, 0]),row("icon_number_big_3",84,236,82,116,[0, 0, 0, 0]),row("icon_number_big_4",84,118,82,116,[0, 0, 0, 0]),row("icon_number_big_5",84,0,82,116,[0, 0, 0, 0]),row("icon_number_big_6",0,354,82,116,[0, 0, 0, 0]),row("icon_number_big_7",0,236,82,116,[0, 0, 0, 0]),row("icon_number_big_8",0,118,82,116,[0, 0, 0, 0]),row("icon_number_big_9",252,0,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_0",0,0,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_1",252,236,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_2",420,118,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_3",336,118,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_4",252,118,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_5",168,354,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_6",168,236,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_7",168,118,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_8",420,0,82,116,[0, 0, 0, 0]),row("icon_number_big_AP_9",252,354,82,116,[0, 0, 0, 0])]),
    materialRole: "hud", animationRole: "none", provenance: "current-apk",
  }),
  entry("judge-skin00.png", {
    logicalAssetId: "hud/ordinary/judge-atlas", role: "hud-atlas", byteLength: 97258,
    sha256: "1FACA23DE96039095EF2CE5970335C560DC6A365070C601A1C53AF5A1457E205", mime: "image/png", width: 512, height: 256,
    textureSettings: TEXTURE, atlasRows: Object.freeze([row("judge_auto",289,0,205,79,[0, 0, 0, 0]),row("judge_bad",168,153,148,70,[0, 0, 0, 0]),row("judge_fast",318,153,143,30,[0, 0, 0, 0]),row("judge_good",227,81,219,70,[0, 0, 0, 0]),row("judge_great",0,81,225,70,[0, 0, 0, 0]),row("judge_miss",0,153,166,70,[0, 0, 0, 0]),row("judge_perfect",0,0,287,79,[0, 0, 0, 0]),row("judge_slow",318,185,143,30,[0, 0, 0, 0])]),
    materialRole: "hud", animationRole: "none", provenance: "current-apk",
  }),
  entry("rhythm-game-additive.png", {
    logicalAssetId: "hud/ordinary/rhythm-game-additive-atlas", role: "hud-atlas", byteLength: 464153,
    sha256: "D7A31B6A2BD4CE298C3D580DFACE8312483E941D103FD4D11FA2CFD29BC50533", mime: "image/png", width: 1024, height: 1024,
    textureSettings: ADDITIVE_TEXTURE, atlasRows: Object.freeze([row("hp_meter",474,535,17,26,[8, 8, 0, 0])]),
    materialRole: "hud", animationRole: "none", provenance: "current-apk",
  }),
  entry("tap-lane-effect-1.png", laneEffectProfile(1, 14137, "14AA04909EB54FAF55A479B512D8AF5E8745AEAC7F330CA9F2EE2B7353B09F3D", 467)),
  entry("tap-lane-effect-2.png", laneEffectProfile(2, 11402, "0683902F48E0CE8662B716227FDCA5DDFFECC979DCB1BC1C70AB2A5BB21CE113", 342)),
  entry("tap-lane-effect-3.png", laneEffectProfile(3, 7630, "D53F90B1F97D5ACFB461A46E3BF2250B07191A6E5BFACED6166A3A27E53FD0CA", 218)),
  entry("tap-lane-effect-4.png", laneEffectProfile(4, 5535, "5710C5079FCCDE25C2638074AFDD8FFE5A3B8305FF5BCAD1986DE82F4EF43B48", 154)),
  entry("ui-additive-effect.png", {
    logicalAssetId: "hud/ordinary/ui-additive-effect-atlas", role: "hud-atlas", byteLength: 20188,
    sha256: "C20901739059F91886257DEDC7C57F1029FDBC2D38A5E63A25F7EE5BCEDBC97E", mime: "image/png", width: 256, height: 256,
    textureSettings: ADDITIVE_TEXTURE, atlasRows: Object.freeze([row("effect_health_caution_inside",216,174,16,14,[6, 6, 5, 5]),row("effect_health_caution_outline",0,130,180,83,[15, 158, 0, 0])]),
    materialRole: "hud", animationRole: "none", provenance: "current-apk",
  }),
]);

export const CURRENT_ORDINARY_VISIBLE_BINDINGS = Object.freeze({
  comboNumberLogicalAssetId: "hud/ordinary/combo-number-atlas",
  judgeLogicalAssetId: "hud/ordinary/judge-atlas",
  lifeAdditiveLogicalAssetId: "hud/ordinary/rhythm-game-additive-atlas",
  warningLogicalAssetId: "hud/ordinary/ui-additive-effect-atlas",
  tapLaneEffectLogicalAssetIds: Object.freeze([
    "field/ordinary/tap-lane-effect-1",
    "field/ordinary/tap-lane-effect-2",
    "field/ordinary/tap-lane-effect-3",
    "field/ordinary/tap-lane-effect-4",
  ] as const),
});

function row(exactKey: string, x: number, y: number, width: number, height: number, border: readonly number[]): RenderAtlasRow {
  return Object.freeze({ exactKey, x, y, width, height, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100, borderLeft: border[0]!, borderRight: border[1]!, borderTop: border[2]!, borderBottom: border[3]! });
}

function laneEffectProfile(
  index: 1 | 2 | 3 | 4,
  byteLength: number,
  sha256: string,
  width: number,
): RenderResourceAssetProfile {
  return Object.freeze({
    logicalAssetId: `field/ordinary/tap-lane-effect-${index}`,
    role: "lane-effect" as const,
    byteLength,
    sha256,
    mime: "image/png" as const,
    width,
    height: 500,
    textureSettings: ADDITIVE_TEXTURE,
    atlasRows: Object.freeze([Object.freeze({
      exactKey: `NoteLaneEffect_${index}`,
      x: 0,
      y: 0,
      width,
      height: 500,
      pivotX: 0.5,
      pivotY: 0,
      pixelsPerUnit: 69,
    })]),
    materialRole: "sprite" as const,
    animationRole: "none" as const,
    provenance: "current-apk" as const,
  });
}

function entry(resourceKeySuffix: string, profile: RenderResourceAssetProfile): OrdinaryVisiblePortableResourceEntry {
  return Object.freeze({ resourceKeySuffix, profile: Object.freeze(profile) });
}
