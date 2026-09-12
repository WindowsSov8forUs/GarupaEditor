import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useApplicationResourceUrl } from "../../resources/applicationResourceContext";

// ScreenLayerLoading / MenuAtlas, 10.1.4/230. The editor supplies no account
// comic list, so ComicController's empty-list comic_001 selection is used.
export function SimulatorLoadingScreen({ progress }: { readonly progress: number }) {
  const background = useApplicationResourceUrl("ui.loading-background");
  const frame = useApplicationResourceUrl("ui.loading.frame");
  const caption = useApplicationResourceUrl("ui.loading.caption");
  const pattern = useApplicationResourceUrl("ui.loading.pattern");
  const label = useApplicationResourceUrl("ui.loading.label");
  const comic = useApplicationResourceUrl("ui.loading.comic");
  const host = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => setScale(Math.min(element.clientWidth / 1334, element.clientHeight / 750));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const sliced = (source: string, slices: string, widths: string): CSSProperties => ({
    borderStyle: "solid", borderColor: "transparent", borderWidth: widths,
    borderImageSource: `url("${source}")`, borderImageSlice: `${slices} fill`,
    borderImageWidth: widths, boxSizing: "border-box",
  });
  const panel = sliced(frame, "14", "14px");
  const gauge = sliced(frame, "14", "7px");
  return <section ref={host} aria-label="加载演奏" style={{ position: "absolute", inset: 0, zIndex: 10,
    overflow: "hidden", background: `url("${background}") center / 100% 100% no-repeat` }}>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <filter id="simulator-loading-gray" colorInterpolationFilters="sRGB"><feFlood floodColor="rgb(197.26415,197.26415,197.26415)" /><feComposite in2="SourceGraphic" operator="in" /></filter>
      <filter id="simulator-loading-pink" colorInterpolationFilters="sRGB"><feFlood floodColor="#ff3b72" /><feComposite in2="SourceGraphic" operator="in" /></filter>
    </svg>
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 1334, height: 750,
      transform: `translate(-50%, -50%) scale(${scale})`, fontFamily: '"ChartUI", "TTShinGoM", sans-serif' }}>
      <div style={{ ...at(0, 60, 680, 460), ...panel }} />
      <img src={pattern} alt="" style={at(0, 60 - 173.6, 680, 109)} />
      <div style={{ ...at(0, 60 + 186, 640, 30), ...sliced(caption, "0 13 0 41", "0px 13px 0px 41px") }} />
      <img src={comic} alt="" style={at(0, 30, 485, 352)} />
      <div style={{ ...at(-276 + 581 / 2, 250, 581, 56), display: "flex", alignItems: "center",
        color: "white", fontSize: 28, whiteSpace: "nowrap",
        textShadow: "-2px -2px #ff3b72, 2px -2px #ff3b72, -2px 2px #ff3b72, 2px 2px #ff3b72, -2px 0 #ff3b72, 2px 0 #ff3b72, 0 -2px #ff3b72, 0 2px #ff3b72" }}>香澄＆有咲①「香澄語３級」</div>
      <img src={label} alt="Now Loading" style={at(-151.7, -236, 274, 33)} />
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
        style={at(0, -278.4, 680, 14)}>
        <div style={{ position: "absolute", inset: 0, ...gauge, filter: "url(#simulator-loading-gray)" }} />
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}>
          <div style={{ position: "absolute", inset: 0, ...gauge, filter: "url(#simulator-loading-pink)" }} />
        </div>
      </div>
      <div style={{ ...at(239, -242, 200, 77), color: "white", fontSize: 30, textAlign: "right",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        textShadow: "-1px -1px black, 1px -1px black, -1px 1px black, 1px 1px black" }}>{Math.round(progress * 100)}%</div>
    </div>
  </section>;
}

function at(x: number, y: number, width: number, height: number): CSSProperties {
  return { position: "absolute", left: 667 + x - width / 2, top: 375 - y - height / 2, width, height };
}
