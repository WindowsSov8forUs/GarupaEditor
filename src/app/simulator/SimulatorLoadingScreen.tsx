import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useApplicationResourceUrl } from "../../resources/applicationResourceContext";

// ScreenLayerLoading / MenuAtlas, 10.1.4/230. With no account comic list,
// ComicController selects comic_001. This is the file-list loading branch:
// showLoadingGauge is called on entry, before any progress notification arrives.
export function SimulatorLoadingScreen({ progress, onReady }: {
  readonly progress: number | null;
  readonly onReady?: (error?: unknown) => void;
}) {
  const background = useApplicationResourceUrl("ui.loading-background");
  const frame = useApplicationResourceUrl("ui.loading.frame");
  const caption = useApplicationResourceUrl("ui.loading.caption");
  const pattern = useApplicationResourceUrl("ui.loading.pattern");
  const label = useApplicationResourceUrl("ui.loading.label");
  const comic = useApplicationResourceUrl("ui.loading.comic");
  const guitar = useApplicationResourceUrl("ui.loading.guitar");
  const onpu1 = useApplicationResourceUrl("ui.loading.onpu1");
  const onpu2 = useApplicationResourceUrl("ui.loading.onpu2");
  const shadow = useApplicationResourceUrl("ui.loading.shadow");
  const host = useRef<HTMLElement | null>(null);
  const [frameReady, setFrameReady] = useState<true | Error | null>(null);
  const onFrameReady = useCallback((error?: Error) => setFrameReady(error ?? true), []);
  const [size, setSize] = useState({ width: 0, scale: 0 });
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => setSize({ width: element.clientWidth,
      scale: Math.min(element.clientWidth / 1334, element.clientHeight / 750) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (onReady === undefined || !frameReady) return;
    if (frameReady instanceof Error) { onReady(frameReady); return; }
    let cancelled = false;
    const urls = [background, frame, caption, pattern, label, comic, guitar, onpu1, onpu2, shadow];
    void Promise.all(urls.map(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
    })).then(() => document.fonts.ready).then(() => {
      // The DOM has committed and its images are decoded. A hidden WebView may
      // suspend RAF, so reveal it now instead of waiting for an invisible frame.
      if (!cancelled) onReady();
    }).catch((error: unknown) => { if (!cancelled) onReady(error); });
    return () => { cancelled = true; };
  }, [onReady, frameReady, background, frame, caption, pattern, label, comic, guitar, onpu1, onpu2, shadow]);
  if (frameReady instanceof Error && onReady === undefined) throw frameReady;
  const p = Math.min(1, Math.max(0, progress ?? 0));
  const comicY = 60;
  const gauge = sliced(frame, "14", "7px");
  return <section ref={host} aria-label="加载演奏" style={{ position: "absolute", inset: 0, zIndex: 10,
    overflow: "hidden" }}>
    {/* UITexture is Tiled: fill from the widget's bottom-left in texture-sized
        blocks, then scale the whole widget. Partial edge blocks retain their UVs. */}
    <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 1334, height: 1000,
      transform: `translate(-50%, -50%) scale(${size.width / 1334})`, pointerEvents: "none",
      backgroundImage: `url("${background}")`, backgroundPosition: "left bottom",
      backgroundSize: "117px 142px", backgroundRepeat: "repeat" }} />
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <filter id="simulator-loading-gray" colorInterpolationFilters="sRGB"><feFlood floodColor="rgb(197.26415,197.26415,197.26415)" /><feComposite in2="SourceGraphic" operator="in" /></filter>
      <filter id="simulator-loading-pink" colorInterpolationFilters="sRGB"><feFlood floodColor="#ff3b72" /><feComposite in2="SourceGraphic" operator="in" /></filter>
    </svg>
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 1334, height: 750,
      transform: `translate(-50%, -50%) scale(${size.scale})`, fontFamily: '"ChartUI", "TTShinGoM", sans-serif' }}>
      <LoadingComicFrame source={frame} style={at(0, comicY, 680, 460)} onReady={onFrameReady} />
      <div style={{ ...at(0, comicY - 173.6, 680, 109), background: `url("${pattern}") left bottom / 37px 109px repeat` }} />
      <div style={{ ...at(0, comicY + 186, 640, 30), ...sliced(caption, "0 13 0 41", "0px 13px 0px 41px") }} />
      <img src={comic} alt="" style={at(0, comicY - 30, 485, 352)} />
      <div style={{ ...at(-276 + 581 / 2, comicY + 190, 581, 56), display: "flex", alignItems: "center",
        color: "white", fontSize: 28, whiteSpace: "nowrap",
        textShadow: "-2px -2px #ff3b72, 2px -2px #ff3b72, -2px 2px #ff3b72, 2px 2px #ff3b72, -2px 0 #ff3b72, 2px 0 #ff3b72, 0 -2px #ff3b72, 0 2px #ff3b72" }}>香澄＆有咲①「香澄語３級」</div>
      <>
        <img src={label} alt="Now Loading" style={at(-151.7, -236, 274, 33)} />
        <div style={{ ...at(85, -237.3, 200, 50), fontSize: 39, color: "#ff3b72", display: "flex", alignItems: "center",
          textShadow: "-2px -2px white, 2px -2px white, -2px 2px white, 2px 2px white, -2px 0 white, 2px 0 white, 0 -2px white, 0 2px white" }}>...</div>
        <div style={{ ...at(-325, -252, 0, 0), transform: "scale(0.8)" }}>
          <LoadingIcon src={shadow} x={0.8} y={-1.7} width={30} height={12} depth={12}
            from="scale(1)" to="scale(0.85)" duration={400} />
          <LoadingIcon src={guitar} x={10} y={-2} width={50} height={50} depth={13} bottom
            from="translateY(0px) scale(1.1, 0.8)" to="translateY(-5px) scale(1)" duration={400} />
          <div style={{ position: "absolute", left: 2.20004, top: -1.70007 }}>
            <LoadingIcon src={onpu1} x={32.6} y={4.3} width={25} height={28} depth={14} from="scale(0)" to="scale(1)" duration={500} delay={500} />
            <LoadingIcon src={onpu1} x={-30} y={5} width={12} height={13} depth={14} from="scale(0)" to="scale(1)" duration={500} delay={500} />
            <LoadingIcon src={onpu2} x={-19.4} y={37.5} width={23} height={26} depth={14} from="scale(0)" to="scale(1)" duration={500} />
          </div>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.trunc(p * 100)}
          style={at(0, -278.4, 680, 14)}>
          <div style={{ position: "absolute", inset: 0, ...gauge, filter: "url(#simulator-loading-gray)" }} />
          {p >= 0.001 && <div style={{ position: "absolute", left: 0, top: 0, height: 14, width: 14 + 666 * p,
            ...gauge, filter: "url(#simulator-loading-pink)" }} />}
        </div>
        <div style={{ ...at(239, -242, 200, 77), color: "white", fontSize: 30, textAlign: "right",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          textShadow: "-1px -1px black, 1px -1px black, -1px 1px black, 1px 1px black" }}>{Math.trunc(p * 100)}%</div>
      </>
    </div>
  </section>;
}

function LoadingComicFrame({ source, style, onReady }: { source: string; style: CSSProperties; onReady: (error?: Error) => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.src = source;
    void image.decode().then(() => {
      if (cancelled) return;
      const target = canvas.current!;
      const context = target.getContext("2d");
      if (context === null) throw new Error("Loading comic frame requires a 2D drawing context.");
      // MenuAtlas bg_base_r12: 32×32, L/R/T/B=14. Draw the source nine-slice
      // into one authored-size image, then scale that image with the UI root.
      // All adjoining regions share exact boundaries; no overlap or gap filler.
      const border = 14;
      const sourceX = [0, border, image.naturalWidth - border, image.naturalWidth];
      const sourceY = [0, border, image.naturalHeight - border, image.naturalHeight];
      const xEdges = [0, border, target.width - border, target.width];
      const yEdges = [0, border, target.height - border, target.height];
      context.clearRect(0, 0, target.width, target.height);
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          context.drawImage(image,
            sourceX[column], sourceY[row],
            sourceX[column + 1] - sourceX[column], sourceY[row + 1] - sourceY[row],
            xEdges[column], yEdges[row],
            xEdges[column + 1] - xEdges[column], yEdges[row + 1] - yEdges[row]);
        }
      }
      onReady();
    }).catch((error: unknown) => {
      if (!cancelled) onReady(error instanceof Error ? error : new Error(String(error)));
    });
    return () => { cancelled = true; };
  }, [source, onReady]);
  return <canvas ref={canvas} width={680} height={460} aria-hidden="true" style={style} />;
}

function LoadingIcon({ src, x, y, width, height, depth, from, to, duration, delay = 0, bottom = false }: {
  src: string; x: number; y: number; width: number; height: number; depth: number;
  from: string; to: string; duration: number; delay?: number; bottom?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    // The original unweighted curve is 2f-f². No backwards fill: initial delay
    // retains the serialized unit scale until UITweener first samples zero.
    const animation = ref.current!.animate([{ transform: from }, { transform: to }], {
      duration, delay, iterations: Infinity, direction: "alternate", fill: "none",
      easing: "cubic-bezier(0.333333333333, 0.666666666667, 0.666666666667, 1)",
    });
    return () => animation.cancel();
  }, [from, to, duration, delay]);
  return <div ref={ref} style={{ position: "absolute", left: x, top: -y, width: 0, height: 0, zIndex: depth }}>
    <img src={src} alt="" style={{ position: "absolute", left: -width / 2, top: bottom ? -height : -height / 2, width, height }} />
  </div>;
}

function sliced(source: string, slices: string, widths: string): CSSProperties {
  return { borderStyle: "solid", borderColor: "transparent", borderWidth: widths,
    borderImageSource: `url("${source}")`, borderImageSlice: `${slices} fill`,
    borderImageWidth: widths, boxSizing: "border-box" };
}

function at(x: number, y: number, width: number, height: number): CSSProperties {
  return { position: "absolute", left: 667 + x - width / 2, top: 375 - y - height / 2, width, height };
}
