import level3UiCoordinateData from "../assets/ui/level3-ui-coordinate-paths-current.json";
import level3HudSubtreeData from "../assets/ui/level3-hud-subtree-report.json";
import uiRootFieldsReport from "../assets/ui/uiroot-fields-report.json";

export interface NguiPoint {
  x: number;
  y: number;
}

export interface HudViewportSize {
  width: number;
  height: number;
}

export interface ProjectedNguiPoint {
  x: number;
  y: number;
  scale: number;
  activeHeight: number;
}

export type NguiHorizontalAnchor = "left" | "center" | "right";
export type NguiVerticalAnchor = "top" | "center" | "bottom";

export interface NguiAnchoredPoint {
  horizontal: NguiHorizontalAnchor;
  vertical: NguiVerticalAnchor;
  offset: NguiPoint;
}

interface Level3UiComponent {
  script?: string;
  star_anchor?: {
    horizontal: number;
    horizontal_name?: string;
    vertical: number;
    vertical_name?: string;
  };
  widget_like?: {
    pivot_or_depth_132?: number;
    width_136?: number;
    height_140?: number;
  };
}

interface Level3UiNode {
  path: string;
  localPosition: NguiPoint;
  chain_from_display_root: Array<{
    path: string;
    pos: NguiPoint;
  }>;
  components: Level3UiComponent[];
}

interface Level3HudSubtreeComponent {
  script?: string;
  raw?: {
    ints_96_176?: Array<{
      offset: number;
      value: number;
    }>;
    ngui_sprite?: {
      type: number;
      type_name: string;
      fill_direction: number;
      fill_amount: number;
      invert: boolean;
      flip: number;
      advanced_types?: NguiSpriteAdvancedTypes;
      atlas?: {
        file_id: number;
        path_id: number;
      };
      sprite_name?: string;
      fixed_aspect?: boolean;
    };
  };
}

interface Level3HudSubtreeNode {
  path: string;
  components: Level3HudSubtreeComponent[];
  children?: Level3HudSubtreeNode[];
}

interface UiRootReportEntry {
  gameObject?: string;
  uiRootFields?: {
    scalingStyle: number;
    manualWidth: number;
    manualHeight: number;
    minimumHeight: number;
    maximumHeight: number;
    fitWidth: boolean;
    fitHeight: boolean;
  };
}

export interface NguiWidgetMetrics {
  width: number;
  height: number;
  pivot: number;
}

export interface NguiWidgetDepthMetrics {
  depth: number;
}

export interface NguiSpriteMetrics {
  type: number;
  typeName: string;
  fillDirection: number;
  fillAmount: number;
  invert: boolean;
  flip: number;
  advancedTypes?: NguiSpriteAdvancedTypes;
  // Source: UISprite.mFixedAspect, used by UISprite.get_drawingDimensions.
  // Consumers must keep widget bounds separate from the actual draw rect.
  fixedAspect: boolean;
  spriteName: string;
  atlas: {
    fileId: number;
    pathId: number;
  };
}

export interface NguiSpriteAdvancedTypes {
  center: NguiSpriteAdvancedType;
  left: NguiSpriteAdvancedType;
  right: NguiSpriteAdvancedType;
  bottom: NguiSpriteAdvancedType;
  top: NguiSpriteAdvancedType;
}

export interface NguiSpriteAdvancedType {
  value: number;
  name: "Invisible" | "Sliced" | "Tiled" | string;
}

export interface NguiAtlasSpriteRect {
  width: number;
  height: number;
}

export interface NguiDrawingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NguiDrawingCenterOffset {
  x: number;
  y: number;
}

const level3UiNodes = (level3UiCoordinateData as { nodes: Level3UiNode[] }).nodes;
const level3UiNodeByPath = new Map(level3UiNodes.map((node) => [node.path, node]));
const level3HudSubtreeRoots = (level3HudSubtreeData as { roots: Level3HudSubtreeNode[] }).roots;
const level3HudSubtreeNodeByPath = new Map<string, Level3HudSubtreeNode>();
for (const root of level3HudSubtreeRoots) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    level3HudSubtreeNodeByPath.set(node.path, node);
    for (const child of node.children ?? []) {
      stack.push(child);
    }
  }
}
const uiRootReportEntries = uiRootFieldsReport as UiRootReportEntry[];
const uiRootNode = uiRootReportEntries.find((entry) => entry.gameObject === "UI_Root" && entry.uiRootFields)
  ?? uiRootReportEntries.find((entry) => entry.uiRootFields);

if (!uiRootNode?.uiRootFields) {
  throw new Error("Missing UIRoot fields in bundled decompilation report");
}

// Data source: HOST________/VSCode/bangdream-apk/reverse/analysis/targets/uiroot-fields-report.json.
export const RHYTHM_UI_ROOT = uiRootNode.uiRootFields;

export const RHYTHM_UI_PATHS = {
  informationRoot: "GamePlay/UI_Root_Back/Display/Information",
  comboNumberRoot: "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number",
  comboNumberLabel: "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number/combo_num_label",
  comboUnit: "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number/combo_unit",
  comboDigitSample: "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number/combo_num_label/num",
  comboDigitSamples: [
    "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number/combo_num_label/num",
    "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number/combo_num_label/num (1)",
    "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number/combo_num_label/num (2)",
    "GamePlay/UI_Root_Back/Display/Information/Combo/combo_number/combo_num_label/num (3)",
  ],
  judgementResult: "GamePlay/UI_Root_Back/Display/Information/Result/other",
  judgeTiming: "GamePlay/UI_Root_Back/Display/Information/Result/other/JudgeTiming",
  scoreRoot: "GamePlay/UI_Root/Display/Score",
  scoreBackground: "GamePlay/UI_Root/Display/Score/Progress/Background",
  scoreForeground: "GamePlay/UI_Root/Display/Score/Progress/Foreground",
  scoreBackgroundCover: "GamePlay/UI_Root/Display/Score/Progress/Background_Cover",
  scoreHighRankPanel: "GamePlay/UI_Root/Display/Score/Progress/Panel",
  scoreHighRankEffect: "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect",
  scoreRankObject: "GamePlay/UI_Root/Display/Score/Progress/RankObject",
  scoreRankC: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankC",
  scoreRankCLabel: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankC/C",
  scoreRankCSeparator: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankC/Separator",
  scoreRankB: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankB",
  scoreRankBLabel: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankB/B",
  scoreRankBSeparator: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankB/Separator",
  scoreRankA: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankA",
  scoreRankALabel: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankA/A",
  scoreRankASeparator: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankA/Separator",
  scoreRankS: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankS",
  scoreRankSLabel: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankS/S",
  scoreRankSSeparator: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankS/Separator",
  scoreRankSS: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSS",
  scoreRankSSLabel: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSS/SS",
  scoreRankSSSeparator: "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSS/Separator",
  scoreTotalScore: "GamePlay/UI_Root/Display/Score/Base/TotalScore",
  lifeGaugeRoot: "GamePlay/UI_Root/Display/LifeGauge",
  lifeGaugeBackground: "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/hp_gauge_round/GaugeBG",
  lifeGaugeFront: "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/hp_gauge_round/FrontGauge",
  lifeGaugeSecondFront: "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/hp_gauge_second/FrontGauge",
  pauseRoot: "GamePlay/UI_Root/Display/Button",
  pauseMain: "GamePlay/UI_Root/Display/Button/Pause",
  pauseCover: "GamePlay/UI_Root/Display/Button/Pause/cover",
} as const;

export const RHYTHM_HUD_WIDGETS = {
  comboDigit: { width: 82, height: 116, padding: -12 },
} as const;

// Source: runtime-ui-binding-report.*. Keep this until those clip/controller
// bindings are also bundled as structured data.
export const RHYTHM_HUD_TRANSFORM_SCALES = {
  judgementResult: 0.8,
  judgeTimingDisplay: 0.8 * 1.25,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToEven(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction > 0.5) {
    return floor + 1;
  }
  if (fraction < 0.5) {
    return floor;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

function horizontalFromStarAnchor(value: number): NguiHorizontalAnchor {
  if (value === 1) {
    return "left";
  }
  if (value === 3) {
    return "right";
  }
  return "center";
}

function verticalFromStarAnchor(value: number): NguiVerticalAnchor {
  if (value === 1) {
    return "top";
  }
  if (value === 3) {
    return "bottom";
  }
  return "center";
}

export function getLevel3UiNode(path: string): Level3UiNode {
  const node = level3UiNodeByPath.get(path);
  if (!node) {
    throw new Error(`Missing level3 UI node: ${path}`);
  }
  return node;
}

export function getLevel3WidgetMetrics(path: string): NguiWidgetMetrics {
  const node = getLevel3UiNode(path);
  const widget = node.components.find((component) => component.widget_like)?.widget_like;
  const width = widget?.width_136;
  const height = widget?.height_140;
  const pivot = widget?.pivot_or_depth_132;
  if (
    typeof width !== "number"
    || typeof height !== "number"
    || typeof pivot !== "number"
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || !Number.isFinite(pivot)
  ) {
    throw new Error(`Missing widget metrics for level3 UI node: ${path}`);
  }

  return {
    width,
    height,
    pivot,
  };
}

export function getLevel3NguiSpriteMetrics(path: string): NguiSpriteMetrics {
  const node = level3HudSubtreeNodeByPath.get(path);
  const sprite = node?.components.find((component) => component.raw?.ngui_sprite)?.raw?.ngui_sprite;
  if (!sprite) {
    throw new Error(`Missing NGUI sprite metrics for level3 UI node: ${path}`);
  }
  if (!sprite.atlas || typeof sprite.sprite_name !== "string") {
    throw new Error(`Incomplete NGUI sprite metrics for level3 UI node: ${path}`);
  }

  return {
    type: sprite.type,
    typeName: sprite.type_name,
    fillDirection: sprite.fill_direction,
    fillAmount: sprite.fill_amount,
    invert: sprite.invert,
    flip: sprite.flip,
    advancedTypes: sprite.advanced_types,
    fixedAspect: sprite.fixed_aspect === true,
    spriteName: sprite.sprite_name,
    atlas: {
      fileId: sprite.atlas.file_id,
      pathId: sprite.atlas.path_id,
    },
  };
}

export function getLevel3WidgetDepthMetrics(path: string): NguiWidgetDepthMetrics {
  const node = level3HudSubtreeNodeByPath.get(path);
  const rawWidget = node?.components.find((component) => component.raw?.ints_96_176)?.raw;
  const depth = rawWidget?.ints_96_176?.find((entry) => entry.offset === 144)?.value;
  if (typeof depth !== "number" || !Number.isFinite(depth)) {
    throw new Error(`Missing NGUI widget depth for level3 UI node: ${path}`);
  }

  return { depth };
}

export function resolveNguiDrawingRect(
  widget: NguiWidgetMetrics,
  sprite: Pick<NguiSpriteMetrics, "fixedAspect" | "typeName">,
  atlasRect: NguiAtlasSpriteRect,
): NguiDrawingRect {
  const widgetWidth = Math.max(1, widget.width);
  const widgetHeight = Math.max(1, widget.height);
  // Source: UISprite.get_drawingDimensions and UIBasicSprite.Fill in
  // HOST________/VSCode/bangdream-apk/reverse/ghidra/decompilations/
  // ghidra-decompile-ngui-sprite-rendering-noanalysis/.
  // This helper is intentionally conservative: the recovered pause bug was
  // Simple + fixedAspect. Sliced/Advanced still need their Fill paths applied
  // by the renderer and must not be silently treated as Simple.
  if (!sprite.fixedAspect || sprite.typeName !== "Simple" || atlasRect.width <= 0 || atlasRect.height <= 0) {
    return {
      x: 0,
      y: 0,
      width: widgetWidth,
      height: widgetHeight,
    };
  }

  const spriteAspect = atlasRect.width / atlasRect.height;
  const widgetAspect = widgetWidth / widgetHeight;
  const width = widgetAspect > spriteAspect ? widgetHeight * spriteAspect : widgetWidth;
  const height = widgetAspect > spriteAspect ? widgetHeight : widgetWidth / spriteAspect;

  return {
    x: (widgetWidth - width) * 0.5,
    y: (widgetHeight - height) * 0.5,
    width,
    height,
  };
}

export function resolveNguiDrawingCenterOffset(
  widget: NguiWidgetMetrics,
  drawingRect: NguiDrawingRect,
): NguiDrawingCenterOffset {
  return {
    x: drawingRect.x + (drawingRect.width * 0.5) - (widget.width * 0.5),
    y: (widget.height * 0.5) - drawingRect.y - (drawingRect.height * 0.5),
  };
}

export function getLevel3StarAnchor(path: string): NguiAnchoredPoint {
  const node = getLevel3UiNode(path);
  const starAnchor = node.components.find((component) => component.star_anchor)?.star_anchor;
  if (!starAnchor) {
    throw new Error(`Missing StarUIAnchor for level3 UI node: ${path}`);
  }

  return {
    horizontal: horizontalFromStarAnchor(starAnchor.horizontal),
    vertical: verticalFromStarAnchor(starAnchor.vertical),
    offset: { x: 0, y: 0 },
  };
}

export function sumLevel3LocalPositionBetween(rootPath: string, targetPath: string): NguiPoint {
  const target = getLevel3UiNode(targetPath);
  const rootIndex = target.chain_from_display_root.findIndex((entry) => entry.path === rootPath);
  if (rootIndex < 0) {
    throw new Error(`Level3 UI node ${targetPath} is not under root ${rootPath}`);
  }

  return target.chain_from_display_root
    .slice(rootIndex + 1)
    .reduce<NguiPoint>(
      (sum, entry) => ({
        x: sum.x + entry.pos.x,
        y: sum.y + entry.pos.y,
      }),
      { x: 0, y: 0 },
    );
}

export function resolveNguiActiveHeight(viewportWidth: number, viewportHeight: number): number {
  const width = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const height = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const viewportAspect = width / height;
  const scalingStyle: number = RHYTHM_UI_ROOT.scalingStyle;

  // Current recovered UIRoot path: scalingStyle=1 with fitWidth=true/fitHeight=false.
  // The scalingStyle!=0 branch returns the fitted manual height directly and uses
  // Mathf.RoundToInt semantics, including half-to-even ties.
  if (scalingStyle !== 0 && RHYTHM_UI_ROOT.fitWidth && !RHYTHM_UI_ROOT.fitHeight) {
    return roundToEven(RHYTHM_UI_ROOT.manualWidth / Math.max(1e-6, viewportAspect));
  }

  const fittedHeight = RHYTHM_UI_ROOT.fitWidth
    ? roundToEven(RHYTHM_UI_ROOT.manualWidth / Math.max(1e-6, viewportAspect))
    : RHYTHM_UI_ROOT.manualHeight;
  return clamp(fittedHeight, RHYTHM_UI_ROOT.minimumHeight, RHYTHM_UI_ROOT.maximumHeight);
}

export function projectNguiDisplayPoint(
  point: NguiPoint,
  viewport: HudViewportSize,
): ProjectedNguiPoint {
  const width = Math.max(1, Number.isFinite(viewport.width) ? viewport.width : 1);
  const height = Math.max(1, Number.isFinite(viewport.height) ? viewport.height : 1);
  const activeHeight = resolveNguiActiveHeight(width, height);
  const scale = height / activeHeight;

  return {
    x: (width * 0.5) + (point.x * scale),
    y: (height * 0.5) - (point.y * scale),
    scale,
    activeHeight,
  };
}

export function resolveNguiActiveWidth(viewportWidth: number, viewportHeight: number): number {
  const width = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const height = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const activeHeight = resolveNguiActiveHeight(width, height);

  return activeHeight * (width / height);
}

export function projectNguiAnchoredPoint(
  point: NguiAnchoredPoint,
  viewport: HudViewportSize,
): ProjectedNguiPoint {
  const width = Math.max(1, Number.isFinite(viewport.width) ? viewport.width : 1);
  const height = Math.max(1, Number.isFinite(viewport.height) ? viewport.height : 1);
  const activeHeight = resolveNguiActiveHeight(width, height);
  const activeWidth = resolveNguiActiveWidth(width, height);
  const scale = height / activeHeight;

  const anchorX = point.horizontal === "left"
    ? -activeWidth * 0.5
    : point.horizontal === "right"
      ? activeWidth * 0.5
      : 0;
  const anchorY = point.vertical === "top"
    ? activeHeight * 0.5
    : point.vertical === "bottom"
      ? -activeHeight * 0.5
      : 0;

  return {
    x: (width * 0.5) + ((anchorX + point.offset.x) * scale),
    y: (height * 0.5) - ((anchorY + point.offset.y) * scale),
    scale,
    activeHeight,
  };
}

export function projectNguiOffsetFromAnchoredRoot(
  root: NguiAnchoredPoint,
  localOffset: NguiPoint,
  viewport: HudViewportSize,
): ProjectedNguiPoint {
  const projectedRoot = projectNguiAnchoredPoint(root, viewport);

  return {
    x: projectedRoot.x + (localOffset.x * projectedRoot.scale),
    y: projectedRoot.y - (localOffset.y * projectedRoot.scale),
    scale: projectedRoot.scale,
    activeHeight: projectedRoot.activeHeight,
  };
}
