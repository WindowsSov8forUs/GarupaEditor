import { decodeLoadingImage } from "../startupLoadingAssets";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useUiViewport } from "../../components/useUiViewport";
import { UiAuthoredSurface } from "../../components/UiViewport";
import { originalLabelBaseline, roundLabelCoordinate } from "../../components/text/originalLabelMetrics";

export interface FullScreenLoadingSources {
  background: string; frame: string; caption: string; pattern: string; label: string;
  comic: string; guitar: string; onpu1: string; onpu2: string; shadow: string;
}

/** The same full-screen view can be shown before the resource store is open. */
export function FullScreenLoading({ progress, onReady, ariaLabel = "加载程序", sources }: {
  progress: number | null; onReady?: (error?: unknown) => void; ariaLabel?: string;
  sources: FullScreenLoadingSources;
}) {
  const { background, frame, caption, pattern, label, comic, guitar, onpu1, onpu2, shadow } = sources;
  const viewport = useUiViewport();
  const [framesReady, setFramesReady] = useState<number | Error>(0);
  const markReady = useCallback((bit: number, error?: Error) => setFramesReady(current =>
    current instanceof Error ? current : error ?? (current | bit)), []);
  const onFrameReady = useCallback((error?: Error) => markReady(1, error), [markReady]);
  const onTrackReady = useCallback((error?: Error) => markReady(2, error), [markReady]);
  const onFillReady = useCallback((error?: Error) => markReady(4, error), [markReady]);
  const onCaptionReady = useCallback((error?: Error) => markReady(8, error), [markReady]);
  const onDotsReady = useCallback((error?: Error) => markReady(16, error), [markReady]);
  const onPercentReady = useCallback((error?: Error) => markReady(32, error), [markReady]);
  const onCapsuleReady = useCallback((error?: Error) => markReady(64, error), [markReady]);
  const [assetsReady, setAssetsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAssetsReady(false);
    const urls = [background, frame, caption, pattern, label, comic, guitar, onpu1, onpu2, shadow];
    void Promise.all(urls.map(decodeLoadingImage)).then(() => document.fonts.ready).then(() => {
      if (!cancelled) setAssetsReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) markReady(0, error instanceof Error ? error : new Error(String(error)));
    });
    return () => { cancelled = true; };
  }, [markReady, background, frame, caption, pattern, label, comic, guitar, onpu1, onpu2, shadow]);
  const ready = assetsReady && framesReady === 127;
  useEffect(() => {
    if (framesReady instanceof Error) onReady?.(framesReady);
    else if (ready) onReady?.();
  }, [onReady, ready, framesReady]);
  if (framesReady instanceof Error && onReady === undefined) throw framesReady;
  const p = Math.min(1, Math.max(0, progress ?? 0));
  const comicY = 60;
  return <section aria-label={ariaLabel} style={{ position: "absolute", inset: 0, zIndex: 10,
    overflow: "hidden", opacity: ready ? 1 : 0 }}>
    {/* UITexture is Tiled: fill from the widget's bottom-left in texture-sized
        blocks, then scale the whole widget. Partial edge blocks retain their UVs. */}
    <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 1334, height: 1000,
      transform: `translate(-50%, -50%) scale(${viewport.width / 1334})`, pointerEvents: "none",
      backgroundImage: `url("${background}")`, backgroundPosition: "left bottom",
      backgroundSize: "117px 142px", backgroundRepeat: "repeat" }} />
    <UiAuthoredSurface width={1334} height={750} centered={false}
      style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", fontFamily: '"ChartUI", "TTShinGoM", sans-serif' }}>
      <LoadingSlicedImage source={frame} width={680} height={460} border={14}
        style={at(0, comicY, 680, 460)} onReady={onFrameReady} />
      <div style={{ ...at(0, comicY - 173.6, 680, 109), background: `url("${pattern}") left bottom / 37px 109px repeat` }} />
      <LoadingSlicedImage source={caption} width={640} height={30} border={CAPTION_BORDER}
        sourceBorder={CAPTION_BORDER} style={at(0, comicY + 186, 640, 30)} onReady={onCapsuleReady} />
      <img src={comic} alt="" style={at(0, comicY - 30, 485, 352)} />
      <LoadingLabel x={-276 + 581 / 2} y={comicY + 190} width={581} height={56} fontSize={28}
        color="white" outline="#ff3b72" distance={2} outline8 onReady={onCaptionReady}
        text="香澄＆有咲①「香澄語３級」" />
      <>
        <img src={label} alt="Now Loading" style={at(-151.7, -236, 274, 33)} />
        <LoadingLabel x={85} y={-237.3} width={200} height={50} fontSize={39} color="#ff3b72"
          outline="white" distance={2} outline8 text="..." onReady={onDotsReady} />
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
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress === null ? undefined : Math.trunc(p * 100)}
          style={at(0, -278.4, 680, 14)}>
          <LoadingSlicedImage source={frame} width={680} height={14} border={7} tint="rgb(197.26415,197.26415,197.26415)"
            style={{ position: "absolute", inset: 0 }} onReady={onTrackReady} />
          <LoadingSlicedImage source={frame} width={14 + 666 * p} height={14} border={7} tint="#ff3b72"
            style={{ position: "absolute", left: 0, top: 0, visibility: p < 0.001 ? "hidden" : "visible" }} onReady={onFillReady} />
        </div>
        <LoadingLabel x={239} y={-242} width={200} height={77} fontSize={30} color="white"
          outline="black" distance={1} right text={progress === null ? "" : `${Math.trunc(p * 100)}%`} onReady={onPercentReady} />
      </>
    </UiAuthoredSurface>
  </section>;
}

/** Same source baseline as gameplay labels, without loading Pixi before its window. */
function LoadingLabel({ x, y, width, height, fontSize, color, outline, distance, outline8 = false, right = false, text, onReady }: {
  x: number; y: number; width: number; height: number; fontSize: number; color: string;
  outline: string; distance: number; outline8?: boolean; right?: boolean; text: string;
  onReady: (error?: Error) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const font = `${fontSize}px "ChartUI", "TTShinGoM", sans-serif`;
  useEffect(() => {
    let cancelled = false;
    void document.fonts.load(font).then(() => { if (!cancelled) setReady(true); })
      .catch((error: unknown) => { if (!cancelled) onReady(error instanceof Error ? error : new Error(String(error))); });
    return () => { cancelled = true; };
  }, [font, onReady]);
  useLayoutEffect(() => {
    if (!ready) return;
    try {
      const canvas = ref.current!;
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.ceil((width + distance * 2) * scale);
      canvas.height = Math.ceil((height + distance * 2) * scale);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("Loading label requires a 2D drawing context.");
      context.scale(scale, scale);
      context.font = font;
      context.textBaseline = "alphabetic";
      context.textAlign = right ? "right" : "left";
      const baseline = originalLabelBaseline(context, fontSize) - roundLabelCoordinate(fontSize / 2);
      context.translate(distance + (right ? width : 0), distance + height / 2);
      const fit = Math.min(1, width / Math.max(1, context.measureText(text).width));
      context.scale(fit, fit);
      context.fillStyle = outline;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1],
        ...(outline8 ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [])]) {
        context.fillText(text, dx! * distance, baseline + dy! * distance);
      }
      context.fillStyle = color;
      context.fillText(text, 0, baseline);
      onReady();
    } catch (error) { onReady(error instanceof Error ? error : new Error(String(error))); }
  }, [ready, font, fontSize, width, height, distance, color, outline, outline8, right, text, onReady]);
  return <div role="img" aria-label={text} style={at(x, y, width, height)}>
    <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", left: -distance, top: -distance,
      width: width + distance * 2, height: height + distance * 2 }} />
  </div>;
}

type SliceBorder = readonly [left: number, right: number, top: number, bottom: number];
const CAPTION_BORDER: SliceBorder = [41, 13, 0, 0];
const FRAME_BORDER: SliceBorder = [14, 14, 14, 14];

function LoadingSlicedImage({ source, width, height, border, sourceBorder = FRAME_BORDER, tint, style, onReady }: {
  source: string; width: number; height: number; border: number | SliceBorder;
  sourceBorder?: SliceBorder; tint?: string;
  style: CSSProperties; onReady?: (error?: Error) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [decoded, setDecoded] = useState<HTMLImageElement | Error | null>(null);
  useEffect(() => {
    let cancelled = false;
    void decodeLoadingImage(source).then(image => {
      if (!cancelled) setDecoded(image);
    }).catch((error: unknown) => {
      if (!cancelled) setDecoded(error instanceof Error ? error : new Error(String(error)));
    });
    return () => { cancelled = true; };
  }, [source]);
  const rasterWidth = Math.round(width);
  useLayoutEffect(() => {
    if (decoded === null) return;
    if (decoded instanceof Error) {
      if (onReady === undefined) throw decoded;
      onReady(decoded); return;
    }
    try {
      const image = decoded;
      const target = canvas.current!;
      const context = target.getContext("2d");
      if (context === null) throw new Error("Loading sliced image requires a 2D drawing context.");
      // Rasterize every slice against shared integer edges, then scale the
      // complete canvas. Separate CSS border-image slices can expose seams.
      const [sl, sr, st, sb] = sourceBorder;
      const [left, right, top, bottom] = typeof border === "number"
        ? [border, border, border, border] : border;
      const sourceX = [0, sl, image.naturalWidth - sr, image.naturalWidth];
      const sourceY = [0, st, image.naturalHeight - sb, image.naturalHeight];
      const xEdges = [0, left, target.width - right, target.width];
      const yEdges = [0, top, target.height - bottom, target.height];
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, target.width, target.height);
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          if (xEdges[column + 1] === xEdges[column] || yEdges[row + 1] === yEdges[row]) continue;
          context.drawImage(image,
            sourceX[column], sourceY[row],
            sourceX[column + 1] - sourceX[column], sourceY[row + 1] - sourceY[row],
            xEdges[column], yEdges[row],
            xEdges[column + 1] - xEdges[column], yEdges[row + 1] - yEdges[row]);
        }
      }
      if (tint !== undefined) {
        context.globalCompositeOperation = "source-in";
        context.fillStyle = tint;
        context.fillRect(0, 0, target.width, target.height);
      }
      onReady?.();
    } catch (error) {
      if (onReady === undefined) throw error;
      onReady(error instanceof Error ? error : new Error(String(error)));
    }
  }, [decoded, rasterWidth, height, border, sourceBorder, tint, onReady]);
  return <canvas ref={canvas} width={rasterWidth} height={height} aria-hidden="true" style={{ ...style, width, height }} />;
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

function at(x: number, y: number, width: number, height: number): CSSProperties {
  return { position: "absolute", left: 667 + x - width / 2, top: 375 - y - height / 2, width, height };
}
