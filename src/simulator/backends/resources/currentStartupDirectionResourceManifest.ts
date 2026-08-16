import type { RenderResourceAssetProfile } from "../renderingContracts";

export const CURRENT_STARTUP_DIRECTION_RESOURCE_IDENTITY =
  "startup-direction-current-10.1.4-portable-v1" as const;

export interface StartupDirectionPortableResourceEntry {
  readonly resourceKeySuffix: string;
  readonly profile: RenderResourceAssetProfile;
}

export const CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES: readonly StartupDirectionPortableResourceEntry[] = Object.freeze([
  Object.freeze({
    resourceKeySuffix: "startup-line-star.png",
    profile: Object.freeze({
      logicalAssetId: "startup/information/line-star",
      role: "startup-ui" as const,
      byteLength: 10967,
      sha256: "52584D0CFCB6AA53FF2CA5F423DC45B8331E72809AD059109E1128D9D8F0A08D",
      mime: "image/png" as const,
      width: 1346,
      height: 198,
      textureSettings: Object.freeze({
        scaleMode: "linear" as const,
        wrapModeU: "clamp" as const,
        wrapModeV: "clamp" as const,
        mipmap: "off" as const,
        premultiplyAlpha: true,
        blendMode: "normal" as const,
      }),
      atlasRows: Object.freeze([]),
      materialRole: "hud" as const,
      animationRole: "none" as const,
      provenance: "current-apk" as const,
    }),
  }),
]);

export const CURRENT_STARTUP_DIRECTION_BINDINGS = Object.freeze({
  lineStarLogicalAssetId: "startup/information/line-star",
  uiCommonLogicalAssetId: "hud/score/ui-common-atlas",
  rhythmGameUiLogicalAssetId: "hud/score/rhythm-game-ui-atlas",
  fontLogicalAssetId: "hud/score/rank-label-font",
});
