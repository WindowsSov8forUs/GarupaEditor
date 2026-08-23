import type { RenderResourceAssetProfile } from "../backends/renderingContracts";

const pauseRhythmRow = Object.freeze({ exactKey: "button_pause", x: 828, y: 641, width: 64, height: 64, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100, borderLeft: 0, borderRight: 0, borderTop: 0, borderBottom: 0 });
const pauseCommonRows = Object.freeze([
  Object.freeze({ exactKey: "bg_base_r12", x: 164, y: 130, width: 32, height: 32, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100, borderLeft: 12, borderRight: 12, borderTop: 12, borderBottom: 12 }),
  Object.freeze({ exactKey: "bg_header_dialog", x: 214, y: 0, width: 40, height: 40, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100, borderLeft: 28, borderRight: 4, borderTop: 0, borderBottom: 0 }),
  Object.freeze({ exactKey: "button_gray", x: 164, y: 0, width: 48, height: 48, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100, borderLeft: 14, borderRight: 20, borderTop: 22, borderBottom: 12 }),
  Object.freeze({ exactKey: "button_pink", x: 154, y: 189, width: 48, height: 48, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100, borderLeft: 14, borderRight: 20, borderTop: 22, borderBottom: 12 }),
  Object.freeze({ exactKey: "fill", x: 211, y: 92, width: 8, height: 8, pivotX: 0.5, pivotY: 0.5, pixelsPerUnit: 100, borderLeft: 1, borderRight: 1, borderTop: 1, borderBottom: 1 }),
]);

export const PAUSE_COUNTDOWN_FIXTURE_RELATIVE_PATHS = Object.freeze([
  "reverse-snapshots/pause-ui/artifacts/investigations/in-game-pause-ui-runtime-contract-10-1-4/portable-assets/countdown-1.png",
  "reverse-snapshots/pause-ui/artifacts/investigations/in-game-pause-ui-runtime-contract-10-1-4/portable-assets/countdown-2.png",
  "reverse-snapshots/pause-ui/artifacts/investigations/in-game-pause-ui-runtime-contract-10-1-4/portable-assets/countdown-3.png",
] as const);

const countdown = Object.freeze([
  profile("ui/pause/countdown-1", 2024, "6622E8DFE2FDDE79A1983875185B7E160BA7BDE8347FF2EFB16756774B9BF752", 51, 119),
  profile("ui/pause/countdown-2", 10393, "9E2D4F2E5A1BD380081CD9A9AFA1D34A5B65FBA4D7216A2A5702ACF6934ABA8B", 99, 120),
  profile("ui/pause/countdown-3", 12514, "630AD98434CFBAA7AD2E8954680A130051ED8DD655DC5160DD9C2429D2893E9F", 99, 121),
]);

export function augmentScoreHudProfilesForPause(
  values: readonly RenderResourceAssetProfile[],
): readonly RenderResourceAssetProfile[] {
  return Object.freeze([
    ...values.map((value) => {
      if (value.logicalAssetId === "hud/score/rhythm-game-ui-atlas") return Object.freeze({ ...value, atlasRows: Object.freeze([...value.atlasRows, pauseRhythmRow]) });
      if (value.logicalAssetId === "hud/score/ui-common-atlas") return Object.freeze({ ...value, atlasRows: Object.freeze([...value.atlasRows, ...pauseCommonRows]) });
      return value;
    }),
    ...countdown,
  ]);
}

function profile(logicalAssetId: string, byteLength: number, sha256: string, width: number, height: number): RenderResourceAssetProfile {
  return Object.freeze({
    logicalAssetId,
    role: "hud-atlas",
    mime: "image/png",
    byteLength,
    sha256,
    width,
    height,
    textureSettings: Object.freeze({ scaleMode: "linear", wrapModeU: "clamp", wrapModeV: "clamp", mipmap: "off", premultiplyAlpha: true, blendMode: "normal" }),
    atlasRows: Object.freeze([]),
    materialRole: "hud",
    animationRole: "none",
    provenance: "current-apk",
  });
}
