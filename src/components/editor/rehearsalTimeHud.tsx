import { useEffect, useRef, useState } from "react";
import { useUiViewport } from "../useUiViewport";
import { originalLabelBaseline, originalLabelFirstBaseline } from "../text/originalLabelMetrics";
import rhythmGameUiUrl from "../../assets/game/atlas/bms/ui/rhythmgameui/rhythm-game-ui.png?url&no-inline";
import rankLabelFontUrl from "../../assets/game/fonts/sgm/rank-label-font.ttf?url&no-inline";

// Rehearsal time HUD, mirrored from the simulator's rehearsal control (pixiRendererBackend.ts, InGameMoveTime/Time/BG).
// Widget geometry is in design px and scales with the UI scale (the simulator's unit = region width / 172).
const HUD_WIDTH = 172;
const HUD_HEIGHT = 32;
/** bg_base_r6_inside_rhythm (rhythm-game-ui atlas), nine-sliced with nguiBorder(6, 6, 6, 6). */
const FRAME = { x: 481, y: 616, size: 24, border: 6 };
/** icon_ingame_music (rhythm-game-ui atlas), 32x26, centred at (right - 148, top + 17). */
const ICON = { x: 989, y: 223, width: 32, height: 26, fromRight: 148, fromTop: 17 };
/** Font size 20, line spacing 8 (REHEARSAL_TIME_LABEL_SPACING_Y); both labels centre vertically on their pivot. */
const FONT_SIZE = 20;
const LABEL_SPACING_Y = 8;
/** Now: pink, right-aligned, pivot (right - 77, top + 23). Max ("/" + total): gray, left-aligned, pivot (right - 76, top + 23). */
const NOW_LABEL = { fill: "#ff3b72", fromRight: 77, fromTop: 23 };
const MAX_LABEL = { fill: "#505050", fromRight: 76, fromTop: 23 };
const FONT_FAMILY = `"RehearsalRankLabel", "GarupaSimulatorChinese"`;

type HudAssets = { atlas: HTMLImageElement };

let atlasLoad: Promise<HTMLImageElement> | null = null;
function loadAtlas(): Promise<HTMLImageElement> {
  atlasLoad ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("rhythm-game-ui atlas failed to load"));
    image.src = rhythmGameUiUrl;
  });
  return atlasLoad;
}

let fontLoad: Promise<void> | null = null;
function loadLabelFont(): Promise<void> {
  fontLoad ??= (async () => {
    const face = new FontFace("RehearsalRankLabel", `url(${JSON.stringify(rankLabelFontUrl)})`);
    document.fonts.add(face);
    await face.load();
  })();
  return fontLoad;
}

function useHudAssets(): HudAssets | null {
  const [assets, setAssets] = useState<HudAssets | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadAtlas(), loadLabelFont()])
      .then(([atlas]) => { if (!cancelled) setAssets({ atlas }); })
      .catch(error => console.error("rehearsal time HUD assets", error));
    return () => { cancelled = true; };
  }, []);
  return assets;
}

/** Nine-slice: the four corners keep the border size, the edges and centre stretch to the widget. */
function drawFrame(context: CanvasRenderingContext2D, atlas: HTMLImageElement, width: number, height: number) {
  const { x, y, size, border } = FRAME;
  const sourceX = [x, x + border, x + size - border, x + size];
  const sourceY = [y, y + border, y + size - border, y + size];
  const targetX = [0, border, width - border, width];
  const targetY = [0, border, height - border, height];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      context.drawImage(atlas,
        sourceX[column], sourceY[row], sourceX[column + 1] - sourceX[column], sourceY[row + 1] - sourceY[row],
        targetX[column], targetY[row], targetX[column + 1] - targetX[column], targetY[row + 1] - targetY[row]);
    }
  }
}

/**
 * The simulator's widget is laid out for its own "m:ss/m:ss" text. These reference strings recover its fixed
 * spacings (icon to the now text, the max text to the right edge); the frame then fits the editor's longer text.
 */
const ORIGINAL_NOW_TEXT = "0:00";
const ORIGINAL_MAX_TEXT = "/0:00";
const ICON_LEFT = HUD_WIDTH - ICON.fromRight - ICON.width / 2;
const NOW_RIGHT = HUD_WIDTH - NOW_LABEL.fromRight;
const MAX_LEFT = HUD_WIDTH - MAX_LABEL.fromRight;

/** Text width with every digit set to the font's widest digit, so the frame does not change as the time runs. */
function stableWidth(context: CanvasRenderingContext2D, text: string): number {
  let widest = "0", widestWidth = 0;
  for (const digit of "0123456789") {
    const width = context.measureText(digit).width;
    if (width > widestWidth) { widest = digit; widestWidth = width; }
  }
  return context.measureText(text.replace(/[0-9]/g, widest)).width;
}

/** Widget geometry in design px for the given texts: the original spacings around the measured text widths. */
function hudLayout(nowText: string, maxText: string) {
  const context = document.createElement("canvas").getContext("2d")!;
  context.font = `normal normal normal ${FONT_SIZE}px ${FONT_FAMILY}`;
  const iconToNow = NOW_RIGHT - context.measureText(ORIGINAL_NOW_TEXT).width - (ICON_LEFT + ICON.width);
  const maxToRight = HUD_WIDTH - MAX_LEFT - context.measureText(ORIGINAL_MAX_TEXT).width;
  const nowRight = ICON_LEFT + ICON.width + iconToNow + stableWidth(context, nowText);
  const maxLeft = nowRight + (MAX_LEFT - NOW_RIGHT);
  return { width: Math.ceil(maxLeft + stableWidth(context, maxText) + maxToRight), nowRight, maxLeft };
}

function drawHud(canvas: HTMLCanvasElement, assets: HudAssets, scale: number, nowText: string, maxText: string,
  designUnits = false) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = window.devicePixelRatio || 1;
  const layout = hudLayout(nowText, maxText);
  const width = layout.width * scale, height = HUD_HEIGHT * scale;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  // Inside a page already scaled to the UI scale its CSS size is in design px; elsewhere in screen px.
  canvas.style.width = `${designUnits ? layout.width : width}px`;
  canvas.style.height = `${designUnits ? HUD_HEIGHT : height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Simulator z-order: frame 20, max 21, now 22, icon 23.
  drawFrame(context, assets.atlas, width, height);
  const fontSize = FONT_SIZE * scale;
  context.font = `normal normal normal ${fontSize}px ${FONT_FAMILY}`;
  context.textBaseline = "alphabetic";
  const baseline = originalLabelBaseline(context, fontSize);
  const firstBaseline = originalLabelFirstBaseline(baseline, fontSize, 1, LABEL_SPACING_Y, 0.5);
  context.fillStyle = MAX_LABEL.fill;
  context.textAlign = "left";
  context.fillText(maxText, layout.maxLeft * scale, MAX_LABEL.fromTop * scale + firstBaseline);
  context.fillStyle = NOW_LABEL.fill;
  context.textAlign = "right";
  context.fillText(nowText, layout.nowRight * scale, NOW_LABEL.fromTop * scale + firstBaseline);
  context.drawImage(assets.atlas, ICON.x, ICON.y, ICON.width, ICON.height,
    ICON_LEFT * scale, (ICON.fromTop - ICON.height / 2) * scale, ICON.width * scale, ICON.height * scale);
}

/**
 * Rehearsal time label: skin frame, time icon, pink now-time and gray "/total", drawn as the simulator draws them,
 * with the frame widened to the texts.
 */
export function RehearsalTimeHud({ nowText, maxText, designUnits = false }: { nowText: string; maxText: string;
  /** Sized in design px, for a page that is itself scaled to the UI scale. */
  designUnits?: boolean }) {
  const { scale } = useUiViewport();
  const assets = useHudAssets();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !assets) return;
    drawHud(element, assets, scale, nowText, maxText, designUnits);
  }, [assets, scale, nowText, maxText, designUnits]);
  return <canvas ref={canvas} className="editor-rehearsal-time" role="img" aria-label={`${nowText}${maxText}`} />;
}
