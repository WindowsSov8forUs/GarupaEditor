import background from "../assets/game/loading/background.png?url";
import frame from "../assets/game/loading/bg_base_r12.png?url";
import caption from "../assets/game/loading/bg_dialog_caption.png?url";
import pattern from "../assets/game/loading/frame_back.png?url";
import label from "../assets/game/loading/nowloading.png?url";
import comic from "../assets/game/loading/comic_001.png?url";
import guitar from "../assets/game/loading/icon_guitar.png?url";
import onpu1 from "../assets/game/loading/icon_onpu1.png?url";
import onpu2 from "../assets/game/loading/icon_onpu2.png?url";
import shadow from "../assets/game/loading/onpu_shadow.png?url";

// Packaged build URLs are deliberately available before persistence or networking.
export const startupLoadingAssets = { background, frame, caption, pattern, label, comic, guitar, onpu1, onpu2, shadow };

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
