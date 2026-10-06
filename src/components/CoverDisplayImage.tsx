import { useMemo, useState, type CSSProperties } from "react";
import { createDisplayImageMask, displayImageFit } from "./displayImageFit";

export function CoverDisplayImage({ src, width, height, style }: {
  src: string; width: number; height: number; style?: CSSProperties;
}) {
  const [source, setSource] = useState<{ url: string; width: number; height: number } | null>(null);
  const mask = useMemo(() => {
    if (source?.url !== src) return null;
    const fit = displayImageFit(source.width, source.height, width, height);
    return fit.fadeX || fit.fadeY ? `url("${createDisplayImageMask(fit, "alpha").toDataURL()}")` : undefined;
  }, [src, source, width, height]);
  return <div style={{ ...style, width, height, overflow: "hidden", pointerEvents: "none",
    maskImage: mask ?? undefined, maskSize: "100% 100%", maskRepeat: "no-repeat", maskMode: "alpha",
    WebkitMaskImage: mask ?? undefined, WebkitMaskSize: "100% 100%", WebkitMaskRepeat: "no-repeat" }}>
    <img src={src} alt="自定义展示图片" draggable={false}
      onLoad={event => setSource({ url: src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "center",
        visibility: source?.url === src ? "visible" : "hidden" }} />
  </div>;
}
