type EffectFrameSet = {
  normal: string[];
  flick: string[];
  slide: string[];
};

function frameIndexOf(path: string): number {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.slice(normalized.lastIndexOf("/") + 1);
  const stem = file.includes(".") ? file.slice(0, file.lastIndexOf(".")) : file;
  const match = stem.match(/(\d+)$/);
  if (!match || !match[1]) {
    return Number.MAX_SAFE_INTEGER;
  }
  const index = Number.parseInt(match[1], 10);
  return Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
}

function collectFrameUrls(globMap: Record<string, unknown>): string[] {
  return Object.entries(globMap)
    .map(([path, value]) => ({ path, url: typeof value === "string" ? value : "" }))
    .filter((entry) => entry.url.length > 0)
    .sort((a, b) => {
      const ai = frameIndexOf(a.path);
      const bi = frameIndexOf(b.path);
      if (ai !== bi) {
        return ai - bi;
      }
      return a.path.localeCompare(b.path);
    })
    .map((entry) => entry.url);
}

const normalFrames = collectFrameUrls(
  import.meta.glob("../assets/effects/normal/*.png", { eager: true, import: "default" }),
);
const flickFrames = collectFrameUrls(
  import.meta.glob("../assets/effects/flick/*.png", { eager: true, import: "default" }),
);
const slideFrames = collectFrameUrls(
  import.meta.glob("../assets/effects/slide/*.png", { eager: true, import: "default" }),
);

export const EMBEDDED_EFFECT_FRAME_URLS: Readonly<EffectFrameSet> = Object.freeze({
  normal: normalFrames,
  flick: flickFrames,
  slide: slideFrames,
});
