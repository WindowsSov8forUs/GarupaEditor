import background from "../assets/game/loading/background.png?url";
import frame from "../assets/game/loading/bg_base_r12.png?url";
import caption from "../assets/game/loading/bg_dialog_caption.png?url";
import pattern from "../assets/game/loading/frame_back.png?url";
import label from "../assets/game/loading/nowloading.png?url";
import guitar from "../assets/game/loading/icon_guitar.png?url";
import onpu1 from "../assets/game/loading/icon_onpu1.png?url";
import onpu2 from "../assets/game/loading/icon_onpu2.png?url";
import shadow from "../assets/game/loading/onpu_shadow.png?url";
import loadingTipTable from "../data/loadingTips.json";

// Packaged build URLs are deliberately available before persistence or networking.
export const startupLoadingAssets = { background, frame, caption, pattern, label, guitar, onpu1, onpu2, shadow };

/** A tip the full-screen loading view shows in its picture frame: an image and its caption. */
export interface LoadingTip { readonly title: string; readonly image: string }

// Tip images are packaged files under src/assets (the table names them by their path there, e.g.
// "loading-tips/foo.png"); new ones go in src/assets/loading-tips/.
const tipImages = import.meta.glob<string>(["../assets/game/loading/*.png", "../assets/loading-tips/*.{png,jpg,webp}"],
  { eager: true, query: "?url", import: "default" });

/** The tips (src/data/loadingTips.json), each with its packaged image URL; a missing image is an error here. */
export const LOADING_TIPS: readonly LoadingTip[] = loadingTipTable.tips.map(tip => {
  const image = tipImages[`../assets/${tip.image}`];
  if (!image) throw new Error(`Loading tip image not found: src/assets/${tip.image}`);
  return Object.freeze({ title: tip.title, image });
});

/** One tip at random, for one showing of the loading view. */
export function pickLoadingTip(): LoadingTip {
  return LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]!;
}

const decodedImages = new Map<string, Promise<HTMLImageElement>>();
/** Shared packaged loading artwork; failed reads remain retryable. */
export function decodeLoadingImage(source: string): Promise<HTMLImageElement> {
  let pending = decodedImages.get(source);
  if (!pending) {
    const image = new Image(); image.src = source;
    pending = image.decode().then(() => image);
    decodedImages.set(source, pending);
    const current = pending;
    void pending.catch(() => { if (decodedImages.get(source) === current) decodedImages.delete(source); });
  }
  return pending;
}
