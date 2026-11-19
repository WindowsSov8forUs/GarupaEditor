import { useLayoutEffect, useRef } from "react";
import { editorSlideLineWidth } from "../../app/editorNoteMetrics";
import { resolveSlideShape, type SlideFitSettings } from "../../app/slideFitShapes";
import { drawConnectionSegment, drawNoteVisual, resolveSegmentGeometry } from "../../app/hooks/useCanvasPlayfieldBackend";
import { FIELD_WIDTH_LANES } from "./previewLaneStrip";

/** The board's beat line colour (useCanvasPlayfieldBackend); the preview draws beat lines only, no subdivisions. */
const GRID_BEAT_COLOR = "rgb(190, 190, 190)";
/** The board draws grid lines 2 board px thick. */
const GRID_LINE_PX = 2;
/** The fit's beats take this share of the preview's height, centred in it (the rest is the margin above and below);
 * the crop shows the fit's lanes and one more lane on each side. */
const BEATS_HEIGHT_RATIO = 0.8;
const SIDE_MARGIN_LANES = 1;
/** The board's 7 lanes; the fit is centred on them. */
const LANE_COUNT = 7;

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
 * A preview of fitting a Slide segment with a shape, as a crop of the editor board: the track's lane art and beat lines,
 * a Slide head and tail (the tail `grid.lanes` lanes right of the head, left when negative, and `grid.beats` beats
 * after it; the beats BEATS_HEIGHT_RATIO of its height)
 * and the line between them through the nodes
 * `resolveSlideShape` places, drawn by the board's own functions. Without Hidden nodes the line is a long note line,
 * with them a curve Slide line, as on the board.
 */
export function SlideFitTrackPreview({ settings, grid, box, slideNote, longLine, curveSlideLine, trackLane, boardLaneWidth }: {
  settings: SlideFitSettings;
  grid: { lanes: number; beats: number };
  box: { width: number; height: number };
  /** The Slide head/tail sprite. */
  slideNote?: string;
  longLine?: string;
  curveSlideLine?: string;
  /** The flat lane art the board draws behind its lanes (FIELD_WIDTH_LANES lanes wide, centred on them). */
  trackLane?: string | null;
  /** The board's lane width in px: grid lines keep their thickness relative to a lane. */
  boardLaneWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fit = resolveSlideShape(settings, { beat: 0, lane: 0, width: 1 }, { beat: grid.beats, lane: grid.lanes, width: 1 });
  const key = JSON.stringify([settings, grid, box, slideNote, longLine, curveSlideLine, trackLane, boardLaneWidth]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let frame = 0;
    const lineUrl = fit.length > 0 ? curveSlideLine : longLine;
    const draw = async () => {
      const [lane, note, line] = await Promise.all([trackLane, slideNote, lineUrl]
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

      // The lane width follows the preview's width and the beat height its height (as the board's zoom changes the
      // beat height alone); the crop is centred on the fit, the tail's beat at the top.
      const laneWidth = box.width / (Math.abs(grid.lanes) + 1 + 2 * SIDE_MARGIN_LANES);
      const beatHeight = box.height * BEATS_HEIGHT_RATIO / Math.max(1e-6, grid.beats);
      const verticalMargin = box.height * (1 - BEATS_HEIGHT_RATIO) / 2;
      const centerColumn = LANE_COUNT / 2, headColumn = centerColumn - grid.lanes / 2;
      const xOf = (column: number) => box.width / 2 + (column - centerColumn) * laneWidth;
      const yOf = (beat: number) => verticalMargin + (grid.beats - beat) * beatHeight;

      if (lane) {
        // The lane art spans FIELD_WIDTH_LANES lanes centred on the board's lanes, stretched over the track's height.
        const left = xOf(LANE_COUNT / 2 - FIELD_WIDTH_LANES / 2);
        context.drawImage(lane, left, 0, FIELD_WIDTH_LANES * laneWidth, box.height);
      }
      const gridThickness = GRID_LINE_PX * laneWidth / Math.max(1, boardLaneWidth);
      const firstBeat = Math.ceil(-verticalMargin / beatHeight);
      const lastBeat = Math.floor(grid.beats + verticalMargin / beatHeight);
      context.strokeStyle = GRID_BEAT_COLOR;
      context.lineWidth = gridThickness;
      for (let beat = firstBeat; beat <= lastBeat; beat += 1) {
        context.beginPath();
        context.moveTo(0, yOf(beat));
        context.lineTo(box.width, yOf(beat));
        context.stroke();
      }

      // Each joint on a device pixel row, as on the board.
      const snapY = (y: number) => Math.round(y * scaleY) / scaleY;
      const points = [
        { x: xOf(headColumn), y: snapY(yOf(0)) },
        ...fit.map(node => ({ x: xOf(headColumn + node.lane), y: snapY(yOf(node.beat)) })),
        { x: xOf(headColumn + grid.lanes), y: snapY(yOf(grid.beats)) },
      ];
      if (line) {
        const width = editorSlideLineWidth(1, laneWidth, 1);
        for (let index = 1; index < points.length; index += 1) {
          const from = points[index - 1]!, to = points[index]!;
          const geometry = resolveSegmentGeometry({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
          if (geometry) drawConnectionSegment(context, { opacity: 1 }, geometry, width, width, line);
        }
      }
      if (note) {
        const getImage = (url: string | undefined | null) => (url === slideNote ? note : null);
        for (const end of [points[0]!, points[points.length - 1]!]) {
          drawNoteVisual(context, { id: "", type: "slide", x: end.x, y: end.y, spanLanes: 1, base: slideNote ?? null,
            overlay: null, overlayMode: "none", selected: false }, 0, laneWidth, 1, getImage);
        }
      }
    };
    const redraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { void draw(); }); };
    void draw();
    redraw();
    // Its device size follows the UI scale (a transform, which a ResizeObserver does not see).
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

  return <canvas ref={canvasRef} className="slide-fit-track-preview" style={{ ...box, display: "block" }} aria-hidden="true" />;
}
