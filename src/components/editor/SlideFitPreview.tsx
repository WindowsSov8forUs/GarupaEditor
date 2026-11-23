import { useLayoutEffect, useRef } from "react";
import { editorHiddenMarkGeometry, editorNoteTokenWidth, editorSlideLineWidth } from "../../app/editorNoteMetrics";
import { resolveSlideShape, type SlideFitSettings } from "../../app/slideFitShapes";
import { hiddenMarkPaint, type SpriteMarkColors, type SpriteOpaqueBox } from "../../app/spriteOpaqueBox";
import { drawConnectionSegment, drawNoteVisual, resolveSegmentGeometry } from "../../app/hooks/useCanvasPlayfieldBackend";

const images = new Map<string, HTMLImageElement>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let image = images.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    images.set(url, image);
  }
  const ready = image;
  return ready.complete && ready.naturalWidth > 0 ? Promise.resolve(ready) : ready.decode().then(() => ready);
}

/** A point of a Slide line, in beats (upwards) and lanes (rightwards). */
type LinePoint = { beat: number; lane: number };

/** The node a Slide tool icon shows on its line: a Hidden node's mark, or a middle node's sprite. */
export type SlideIconNode =
  | { kind: "hidden"; box: SpriteOpaqueBox | null; colors?: SpriteMarkColors | null }
  | { kind: "middle"; sprite?: string; box: SpriteOpaqueBox | null };

/**
 * A Slide tool icon drawn as the board draws a Slide: the line through `points` (the board's long note or curve Slide
 * line), and on it `node` at `nodeAt`. The line's body fills the image area `box` (design px): its lanes plus the
 * line's width (or the node, if wider) are as wide as the area, its beats as tall; its ends are cut straight across, as the board cuts a line
 * at a note. Each joint is on a device pixel row.
 */
function SlideIconCanvas({ box, points, line, node, nodeAt, beats: shownBeats }: {
  box: { width: number; height: number };
  points: LinePoint[];
  line?: string;
  node?: SlideIconNode;
  nodeAt?: LinePoint;
  /** The beats shown, the rest of the line drawn whole but cut off at the area's edges (default: all of it). */
  beats?: { from: number; to: number };
}) {
  const lineLanes = editorSlideLineWidth(1, 1, 1);
  const lanes = points.map(point => point.lane), beats = points.map(point => point.beat);
  const minLane = Math.min(...lanes);
  const minBeat = shownBeats?.from ?? Math.min(...beats), maxBeat = shownBeats?.to ?? Math.max(...beats);
  // A node wider than the line widens what must fit, the line staying in the middle.
  const lineSpan = Math.max(...lanes) - minLane + lineLanes;
  const span = Math.max(lineSpan, node ? editorNoteTokenWidth(1, false, 1, 1) : 0);
  const laneWidth = box.width / span;
  const beatHeight = box.height / Math.max(1e-6, maxBeat - minBeat);
  const at = (point: LinePoint) => ({ x: (point.lane - minLane + lineLanes / 2 + (span - lineSpan) / 2) * laneWidth,
    y: box.height - (point.beat - minBeat) * beatHeight });
  const nodeSprite = node?.kind === "middle" ? node.sprite : undefined;
  const key = JSON.stringify([points, box, line, node, nodeAt, shownBeats]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let frame = 0;
    const draw = async () => {
      const [lineImage, spriteImage] = await Promise.all([line, nodeSprite]
        .map(url => (url ? loadImage(url).catch(() => null) : Promise.resolve(null))));
      if (cancelled) return;
      // The box is in design px under the UI scale: draw at the device pixels it covers.
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const scaleX = Math.max(1e-3, rect.width * ratio / box.width), scaleY = Math.max(1e-3, rect.height * ratio / box.height);
      canvas.width = Math.max(1, Math.round(box.width * scaleX));
      canvas.height = Math.max(1, Math.round(box.height * scaleY));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      context.clearRect(0, 0, box.width, box.height);
      const snapY = (y: number) => Math.round(y * scaleY) / scaleY;
      if (lineImage && line) {
        const width = editorSlideLineWidth(1, laneWidth, 1);
        for (let index = 1; index < points.length; index += 1) {
          const from = at(points[index - 1]!), to = at(points[index]!);
          const geometry = resolveSegmentGeometry({ fromX: from.x, fromY: snapY(from.y), toX: to.x, toY: snapY(to.y) });
          if (geometry) drawConnectionSegment(context, { opacity: 1 }, geometry, width, width, lineImage);
        }
      }
      if (node && nodeAt) {
        const centre = at(nodeAt);
        const y = snapY(centre.y);
        if (node.kind === "hidden") {
          // A Hidden node's mark as the board draws it, in the slide among sprite's own colours.
          const mark = editorHiddenMarkGeometry(1, laneWidth, 1, node.box);
          const left = centre.x + mark.offsetX - mark.width / 2, top = y + mark.offsetY - mark.height / 2;
          const paint = hiddenMarkPaint(node.colors);
          context.beginPath();
          context.roundRect(left, top, mark.width, mark.height, Math.min(mark.width, mark.height) / 2);
          context.fillStyle = paint.fill;
          context.fill();
          context.lineWidth = 1.5;
          context.strokeStyle = paint.stroke;
          context.stroke();
        } else if (spriteImage) {
          const getImage = (url: string | undefined | null) => (url === nodeSprite ? spriteImage : null);
          drawNoteVisual(context, { id: "", type: "single", x: centre.x, y, spanLanes: 1, base: nodeSprite ?? null,
            overlay: null, overlayMode: "none", selected: false,
            ...(node.box ? { baseShiftY: 0.5 - (node.box.top + node.box.bottom) / 2 } : {}) }, 0, laneWidth, 1, getImage);
        }
      }
    };
    // Its device size follows the UI scale (a transform, which a ResizeObserver does not see) and settles after the
    // first layout: draw now, again on the next frame and on every resize.
    const redraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { void draw(); }); };
    void draw();
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    window.addEventListener("resize", redraw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", redraw);
    };
    // `key` stands for every input the drawing reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <span className="slide-fit-preview" style={box}>
    <canvas ref={canvasRef} className="slide-fit-preview-canvas" style={{ left: 0, top: 0, ...box }} />
  </span>;
}

/** The Slide the curve icon shapes: `CURVE_GRID.shift` lanes leftwards over `CURVE_GRID.beats` beats. */
const CURVE_GRID = { beats: 1, shift: 1 };

/**
 * The curve tool's icon: the shape `settings` names, applied as the dialog's preview applies it (SlideFitTrackPreview),
 * from the bottom right to the top left. Only the line is drawn (a long note line without Hidden nodes, a curve Slide
 * line with them), filling the image area.
 */
export function SlideFitPreview({ settings, box, longLine, curveSlideLine }: {
  settings: SlideFitSettings;
  /** The image area, in design px. */
  box: { width: number; height: number };
  longLine?: string;
  curveSlideLine?: string;
}) {
  const nodes = resolveSlideShape(settings, { beat: 0, lane: 0, width: 1 },
    { beat: CURVE_GRID.beats, lane: -CURVE_GRID.shift, width: 1 });
  const points = [{ beat: 0, lane: 0 }, ...nodes.map(node => ({ beat: node.beat, lane: node.lane })),
    { beat: CURVE_GRID.beats, lane: -CURVE_GRID.shift }];
  return <SlideIconCanvas box={box} points={points} line={nodes.length > 0 ? curveSlideLine : longLine} />;
}

/**
 * The Hidden and Middle tools' icon: a straight Slide [X, node, X] on one lane, a beat between each, drawn whole and
 * cut half a beat before and after its node, so half of each line to it shows. The line is the board's for such a Slide: a curve Slide line through a Hidden node, a long note line through
 * a visible one.
 */
export function SlideNodeIcon({ box, node, longLine, curveSlideLine }: {
  box: { width: number; height: number };
  node: SlideIconNode;
  longLine?: string;
  curveSlideLine?: string;
}) {
  return <SlideIconCanvas box={box} points={[{ beat: 0, lane: 0 }, { beat: 1, lane: 0 }, { beat: 2, lane: 0 }]}
    beats={{ from: 0.5, to: 1.5 }}
    line={node.kind === "hidden" ? curveSlideLine : longLine} node={node} nodeAt={{ beat: 1, lane: 0 }} />;
}
