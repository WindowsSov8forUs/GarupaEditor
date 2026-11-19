import { useLayoutEffect, useRef } from "react";
import { editorNoteHeight, editorNoteTokenWidth, editorSlideLineWidth } from "../../app/editorNoteMetrics";
import { resolveSlideShape, type SlideFitSettings } from "../../app/slideFitShapes";
import { drawConnectionSegment, drawNoteVisual, resolveSegmentGeometry } from "../../app/hooks/useCanvasPlayfieldBackend";

/** The Slide the icon draws: `ICON_GRID.shift` lanes leftwards over `ICON_GRID.beats` beats. */
const ICON_GRID = { beats: 1, shift: 1 };

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

/**
 * The curve tool's icon: the shape `settings` names, applied as the dialog's preview applies it (SlideFitTrackPreview),
 * from a Slide head at the bottom right to a Slide tail at the top left. Like the other tool icons it fills the
 * button's image area `box`: the lane width makes the Slide's lane shift plus one end button as wide as the area, the
 * beat height makes its beats plus one end button as tall. The line is the board's (a long note line without Hidden
 * nodes, a curve Slide line with them), each joint on a device pixel row.
 */
export function SlideFitPreview({ settings, box, slideNote, longLine, curveSlideLine }: {
  settings: SlideFitSettings;
  /** The image area, in design px. */
  box: { width: number; height: number };
  /** The Slide head/tail sprite. */
  slideNote?: string;
  longLine?: string;
  curveSlideLine?: string;
}) {
  const noteLanes = editorNoteTokenWidth(1, false, 1, 1);
  const laneWidth = box.width / (ICON_GRID.shift + noteLanes);
  const noteHeight = editorNoteHeight(laneWidth, 1);
  const beatHeight = Math.max(0, box.height - noteHeight) / ICON_GRID.beats;
  const nodes = resolveSlideShape(settings, { beat: 0, lane: 0, width: 1 }, { beat: ICON_GRID.beats, lane: -ICON_GRID.shift, width: 1 });
  // Box px: the head (lane 0, beat 0) half a button in from the bottom right; lanes leftwards, beats upwards.
  const headX = box.width - (noteLanes / 2) * laneWidth, headY = box.height - noteHeight / 2;
  const at = (beat: number, lane: number) => ({ x: headX + lane * laneWidth, y: headY - beat * beatHeight });
  const points = [at(0, 0), ...nodes.map(node => at(node.beat, node.lane)), at(ICON_GRID.beats, -ICON_GRID.shift)];
  const canvasBox = box;
  const key = JSON.stringify([points, box, slideNote, longLine, curveSlideLine]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let frame = 0;
    const lineUrl = nodes.length > 0 ? curveSlideLine : longLine;
    const draw = async () => {
      const [note, line] = await Promise.all([slideNote, lineUrl]
        .map(url => (url ? loadImage(url).catch(() => null) : Promise.resolve(null))));
      if (cancelled) return;
      // The box is in design px under the UI scale: draw at the device pixels it covers.
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const scaleX = Math.max(1e-3, rect.width * ratio / canvasBox.width), scaleY = Math.max(1e-3, rect.height * ratio / canvasBox.height);
      canvas.width = Math.max(1, Math.round(canvasBox.width * scaleX));
      canvas.height = Math.max(1, Math.round(canvasBox.height * scaleY));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      context.clearRect(0, 0, canvasBox.width, canvasBox.height);
      const snapY = (y: number) => Math.round(y * scaleY) / scaleY;
      if (line) {
        const width = editorSlideLineWidth(1, laneWidth, 1);
        for (let index = 1; index < points.length; index += 1) {
          const from = points[index - 1]!, to = points[index]!;
          const geometry = resolveSegmentGeometry({ fromX: from.x, fromY: snapY(from.y), toX: to.x, toY: snapY(to.y) });
          if (geometry) drawConnectionSegment(context, { opacity: 1 }, geometry, width, width, line);
        }
      }
      if (note) {
        const getImage = (url: string | undefined | null) => (url === slideNote ? note : null);
        for (const end of [points[0]!, points[points.length - 1]!]) {
          drawNoteVisual(context, { id: "", type: "slide", x: end.x, y: snapY(end.y), spanLanes: 1, base: slideNote ?? null,
            overlay: null, overlayMode: "none", selected: false }, 0, laneWidth, 1, getImage);
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
