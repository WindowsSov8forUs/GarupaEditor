export type CurrentScoreHighRankClipName = "ScoreGaugeSS" | "ScoreGaugeSSS";

export interface CurrentScoreGraphObject {
  readonly path: string;
  readonly gameObjectPathId: string;
  readonly transformPathId: string;
  readonly parentPath: string | null;
  readonly siblingIndex: number;
  readonly activeSerialized: boolean;
  readonly localPosition: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number, number];
  readonly localScale: readonly [number, number, number];
}

export interface CurrentScoreWidget {
  readonly path: string;
  readonly game_object_path_id: number;
  readonly component_path_id: number;
  readonly component: "UISprite" | "UITexture" | "UILabel";
  readonly active: boolean;
  readonly enabled: boolean;
  readonly pivot: string;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly color_f32_bits: readonly [string, string, string, string];
  readonly sprite_name?: string;
  readonly text?: string;
  readonly font_size?: number;
  readonly resolved_texture_name?: string;
}

export interface CurrentScoreAnimationBinding {
  readonly node: string;
  readonly pathHash: number;
  readonly typeId: number;
  readonly attributeHash: number;
  readonly property: "localPosition" | "localScale" | "localEulerAngles" | "active" | "TweenAlpha.to";
  readonly streamedStartIndex: number | null;
  readonly dimension: 0 | 1 | 3;
  readonly scriptPathId: string | null;
}

export interface CurrentScoreAnimationFrame {
  readonly time: number;
  readonly keys: readonly {
    readonly index: number;
    readonly coefficients: readonly [number, number, number, number];
  }[];
}

export interface CurrentScoreAnimationClip {
  readonly name: CurrentScoreHighRankClipName;
  readonly serializedBytes: number;
  readonly serializedSha256: string;
  readonly sampleRate: 60;
  readonly durationSeconds: 3;
  readonly loop: true;
  readonly curveCount: 56 | 62;
  readonly frameCount: 39;
  readonly bindings: readonly CurrentScoreAnimationBinding[];
  readonly frames: readonly CurrentScoreAnimationFrame[];
  readonly constantValues: readonly number[];
}

export interface CurrentScoreHighRankNode {
  readonly name: string;
  readonly path: string;
  readonly gameObjectPathId: string;
  readonly transformPathId: string;
  readonly componentPathId: string;
  readonly initialActive: boolean;
  readonly initialPosition: readonly [number, number, number];
  readonly initialRotation: readonly [number, number, number, number];
  readonly initialScale: readonly [number, number, number];
  readonly textureKey: "high-rank-kira" | "high-rank-long-star" | "high-rank-overlay";
  readonly resolvedTextureName: "ss_kira" | "sss_star_long" | "ss_overlay";
  readonly width: number;
  readonly height: number;
  readonly pivot: "Center" | "Left";
  readonly colorF32Bits: readonly [string, string, string, string];
}

export interface CurrentScoreHudNativeProfile {
  readonly source: {
    readonly reverseCommit: "dddab345825dbff6d2a5cf65f5fbbcf771b00e07";
    readonly contractSha256: "E022B3D4A010D8968BF7661A8000C9822D7BDE6C9A32A668A3F14F44CF7130F4";
  };
  readonly scene: {
    readonly rootPath: "GamePlay/UI_Root/Display/Score";
    readonly objects: readonly CurrentScoreGraphObject[];
    readonly widgets: readonly CurrentScoreWidget[];
  };
  readonly label: {
    readonly component: Readonly<Record<string, unknown>>;
    readonly encodedText: Readonly<Record<string, unknown>>;
    readonly sfnt: {
      readonly unitsPerEm: 1024;
      readonly glyphs: Readonly<Record<string, { readonly glyphId: number; readonly advanceUnits: number }>>;
      readonly hintedAdvancePixelsByFontSize: Readonly<Record<string, Readonly<Record<string, number>>>>;
    };
  };
  readonly panel: {
    readonly targetLeftX: 38;
    readonly leftAbsolute: 4;
    readonly bottomY: -25.5;
    readonly topY: 13.5;
    readonly minimumWidth: 2;
    readonly clipRangeCenterF32Correction: readonly [number, number];
    readonly softness: readonly [20, 3];
  };
  readonly highRank: {
    readonly siblingOrder: readonly string[];
    readonly nodes: readonly CurrentScoreHighRankNode[];
    readonly tweenAlpha: readonly {
      readonly node: "BigStar_1" | "BigStar_2" | "Flash";
      readonly durationSeconds: number;
      readonly fromAlpha: number;
      readonly toAlpha: number;
      readonly method: 0;
      readonly style: 2;
    }[];
    readonly clips: readonly CurrentScoreAnimationClip[];
  };
}

const SHA256 = /^[0-9A-F]{64}$/;
const INT64 = /^int64:-?[0-9]+$/;
const ROOT = "GamePlay/UI_Root/Display/Score";
const NODE_NAMES = Object.freeze([
  "kira_1", "kira_2", "kira_3", "kira_4", "kira_5", "kira_6", "kira_7", "kira_8",
  "BigStar_2", "BigStar_1", "Flash",
]);
const SIBLING_ORDER = Object.freeze([
  "Flash", "BigStar_1", "BigStar_2",
  "kira_1", "kira_2", "kira_3", "kira_4", "kira_5", "kira_6", "kira_7", "kira_8",
]);

// Only this parser's immutable output may bypass the serialized-input checks.
const parsedProfiles = new WeakSet<CurrentScoreHudNativeProfile>();

export function parseCurrentScoreHudNativeProfile(value: unknown): CurrentScoreHudNativeProfile | null {
  if (value !== null && typeof value === "object" && parsedProfiles.has(value as CurrentScoreHudNativeProfile)) {
    return value as CurrentScoreHudNativeProfile;
  }
  const root = record(value);
  const sample = record(root?.sample);
  const source = record(root?.source);
  const scene = record(root?.scene);
  const label = record(root?.label);
  const sfnt = record(label?.sfnt);
  const highRank = record(root?.highRank);
  const panel = record(root?.panel);
  const panelSerialized = record(panel?.serialized);
  const panelFields = record(panelSerialized?.fields);
  const panelClip = record(panelFields?.m_clip_range);
  const panelSoftness = record(panelFields?.m_clip_softness);
  const panelGeometry = record(panel?.geometry);
  const anchorWidget = record(panelGeometry?.anchor_target_widget);
  if (root?.schemaVersion !== 1 || root.status !== "current-score-ngui-native-production-profile" ||
    sample?.package !== "jp.co.craftegg.band" || sample.versionName !== "10.1.4" ||
    sample.versionCode !== 230 || sample.abi !== "arm64-v8a" ||
    source?.reverseCommit !== "dddab345825dbff6d2a5cf65f5fbbcf771b00e07" ||
    source.contractBytes !== 320367 ||
    source.contractSha256 !== "E022B3D4A010D8968BF7661A8000C9822D7BDE6C9A32A668A3F14F44CF7130F4" ||
    scene?.rootPath !== ROOT || scene.gameObjectCount !== 64 || scene.widgetCount !== 45 ||
    !Array.isArray(scene.objects) || !Array.isArray(scene.widgets) ||
    label === null || sfnt?.unitsPerEm !== 1024 || highRank === null || panel === null ||
    anchorWidget === null || !Array.isArray(anchorWidget.local_position) || anchorWidget.local_position[0] !== 38 ||
    panelClip === null || !Array.isArray(panelClip.value) || panelClip.value.length !== 4 ||
    panelSoftness === null || !Array.isArray(panelSoftness.value) || panelSoftness.value[0] !== 20 || panelSoftness.value[1] !== 3 ||
    !Array.isArray(highRank.nodes) || !Array.isArray(highRank.clips) ||
    !Array.isArray(highRank.tweenAlpha) || !Array.isArray(highRank.siblingOrder)) return null;

  const objects = scene.objects.map(parseGraphObject);
  if (objects.some((row) => row === null)) return null;
  const graph = objects as CurrentScoreGraphObject[];
  const pathSet = new Set(graph.map((row) => row.path));
  if (graph.length !== 64 || pathSet.size !== 64 || !pathSet.has(ROOT) || graph.some((row) =>
    row.path !== ROOT && (row.parentPath === null || !pathSet.has(row.parentPath)))) return null;
  const siblingKeys = graph.map((row) => `${row.parentPath}\0${row.siblingIndex}`);
  if (new Set(siblingKeys).size !== siblingKeys.length) return null;

  const widgets = scene.widgets.map(parseWidget);
  if (widgets.some((row) => row === null)) return null;
  const parsedWidgets = widgets as CurrentScoreWidget[];
  if (parsedWidgets.length !== 45 || new Set(parsedWidgets.map((row) => row.path)).size !== 45 ||
    parsedWidgets.some((row) => !pathSet.has(row.path))) return null;

  const nodes = highRank.nodes.map(parseHighRankNode);
  if (nodes.some((row) => row === null) || nodes.length !== 11 ||
    new Set(nodes.map((row) => row!.name)).size !== 11 ||
    NODE_NAMES.some((name) => !nodes.some((row) => row!.name === name)) ||
    highRank.siblingOrder.join("\0") !== SIBLING_ORDER.join("\0")) return null;

  const clips = highRank.clips.map(parseClip);
  if (clips.some((row) => row === null) || clips.length !== 2 ||
    clips[0]!.name !== "ScoreGaugeSS" || clips[1]!.name !== "ScoreGaugeSSS") return null;
  const tweenAlpha = highRank.tweenAlpha.map((value) => {
    const row = record(value);
    if (row === null || !["BigStar_1", "BigStar_2", "Flash"].includes(row.node as string) ||
      row.method !== 0 || row.style !== 2 || !f32(row.durationSeconds) || row.durationSeconds <= 0 ||
      !f32(row.fromAlpha) || !f32(row.toAlpha)) return null;
    return Object.freeze({ node: row.node, durationSeconds: row.durationSeconds, fromAlpha: row.fromAlpha, toAlpha: row.toAlpha, method: 0, style: 2 });
  });
  if (tweenAlpha.some((row) => row === null) || tweenAlpha.length !== 3) return null;

  const glyphs = record(sfnt.glyphs);
  const hinted = record(sfnt.hintedAdvancePixelsByFontSize);
  if (glyphs === null || hinted === null || ![..."0123456789ABCS+"].every((char) => {
    const glyph = record(glyphs[char]);
    return glyph !== null && Number.isSafeInteger(glyph.glyphId) && Number.isSafeInteger(glyph.advanceUnits) && glyph.advanceUnits > 0;
  }) || !Array.from({ length: 28 }, (_, index) => String(index + 1)).every((size) => {
    const metrics = record(hinted[size]);
    return metrics !== null && [..."0123456789ABCS+"].every((char) =>
      typeof metrics[char] === "number" && Number.isFinite(metrics[char]) && metrics[char] > 0);
  })) return null;

  const parsed = deepFreeze({
    source: { reverseCommit: source.reverseCommit, contractSha256: source.contractSha256 },
    scene: { rootPath: ROOT, objects: graph, widgets: parsedWidgets },
    label: { component: record(label.component)!, encodedText: record(label.encodedText)!, sfnt: { unitsPerEm: 1024, glyphs, hintedAdvancePixelsByFontSize: hinted } },
    panel: {
      targetLeftX: 38,
      leftAbsolute: 4,
      bottomY: -25.5,
      topY: 13.5,
      minimumWidth: 2,
      clipRangeCenterF32Correction: Object.freeze([
        Math.fround(0.0000152587890625),
        Math.fround(0.000011444091796875),
      ]),
      softness: Object.freeze([20, 3]),
    },
    highRank: { siblingOrder: [...SIBLING_ORDER], nodes: nodes as CurrentScoreHighRankNode[], tweenAlpha, clips: clips as CurrentScoreAnimationClip[] },
  }) as unknown as CurrentScoreHudNativeProfile;
  parsedProfiles.add(parsed);
  return parsed;
}

function parseGraphObject(value: unknown): CurrentScoreGraphObject | null {
  const row = record(value);
  if (row === null || typeof row.path !== "string" || !row.path.startsWith(ROOT) ||
    !INT64.test(row.gameObjectPathId as string) || !INT64.test(row.transformPathId as string) ||
    !(row.parentPath === null || typeof row.parentPath === "string") ||
    !Number.isSafeInteger(row.siblingIndex) || row.siblingIndex < 0 || typeof row.activeSerialized !== "boolean" ||
    !vector(row.localPosition, 3) || !vector(row.localRotation, 4) || !vector(row.localScale, 3)) return null;
  return Object.freeze({
    path: row.path, gameObjectPathId: row.gameObjectPathId as string, transformPathId: row.transformPathId as string,
    parentPath: row.parentPath as string | null, siblingIndex: row.siblingIndex as number, activeSerialized: row.activeSerialized,
    localPosition: Object.freeze([...row.localPosition]) as readonly [number, number, number],
    localRotation: Object.freeze([...row.localRotation]) as readonly [number, number, number, number],
    localScale: Object.freeze([...row.localScale]) as readonly [number, number, number],
  });
}

function parseWidget(value: unknown): CurrentScoreWidget | null {
  const row = record(value);
  if (row === null || typeof row.path !== "string" || !row.path.startsWith(`${ROOT}/`) ||
    !Number.isSafeInteger(row.game_object_path_id) || !Number.isSafeInteger(row.component_path_id) ||
    !["UISprite", "UITexture", "UILabel"].includes(row.component as string) ||
    typeof row.active !== "boolean" || typeof row.enabled !== "boolean" || typeof row.pivot !== "string" ||
    !positiveInteger(row.width) || !positiveInteger(row.height) || !Number.isInteger(row.depth) ||
    !bits4(row.color_f32_bits)) return null;
  return Object.freeze({ ...row }) as unknown as CurrentScoreWidget;
}

function parseHighRankNode(value: unknown): CurrentScoreHighRankNode | null {
  const row = record(value);
  if (row === null || !NODE_NAMES.includes(row.name as string) || typeof row.path !== "string" ||
    !INT64.test(row.gameObjectPathId as string) || !INT64.test(row.transformPathId as string) || !INT64.test(row.componentPathId as string) ||
    typeof row.initialActive !== "boolean" || !vector(row.initialPosition, 3) || !vector(row.initialRotation, 4) || !vector(row.initialScale, 3) ||
    !["high-rank-kira", "high-rank-long-star", "high-rank-overlay"].includes(row.textureKey as string) ||
    !["ss_kira", "sss_star_long", "ss_overlay"].includes(row.resolvedTextureName as string) ||
    !positiveInteger(row.width) || !positiveInteger(row.height) || !["Center", "Left"].includes(row.pivot as string) || !bits4(row.colorF32Bits)) return null;
  if ((row.name === "Flash") !== (row.textureKey === "high-rank-overlay") ||
    (String(row.name).startsWith("BigStar")) !== (row.textureKey === "high-rank-long-star")) return null;
  return Object.freeze({ ...row }) as unknown as CurrentScoreHighRankNode;
}

function parseClip(value: unknown): CurrentScoreAnimationClip | null {
  const row = record(value);
  if (row === null || (row.name !== "ScoreGaugeSS" && row.name !== "ScoreGaugeSSS") ||
    !positiveInteger(row.serializedBytes) || !SHA256.test(row.serializedSha256 as string) || row.sampleRate !== 60 ||
    row.durationSeconds !== 3 || row.loop !== true || row.frameCount !== 39 ||
    row.curveCount !== (row.name === "ScoreGaugeSS" ? 56 : 62) ||
    !Array.isArray(row.bindings) || !Array.isArray(row.frames) || !Array.isArray(row.constantValues)) return null;
  const bindings = row.bindings.map(parseBinding);
  if (bindings.some((item) => item === null)) return null;
  const frames = row.frames.map((value) => {
    const frame = record(value);
    if (frame === null || !f32(frame.time) || frame.time < 0 || frame.time >= 3 || !Array.isArray(frame.keys)) return null;
    const keys = frame.keys.map((value) => {
      const key = record(value);
      if (key === null || !Number.isInteger(key.index) || key.index < 0 || key.index >= row.curveCount! || !vector(key.coefficients, 4)) return null;
      return Object.freeze({ index: key.index as number, coefficients: Object.freeze([...key.coefficients]) as readonly [number, number, number, number] });
    });
    return keys.some((key) => key === null) ? null : Object.freeze({ time: frame.time as number, keys: Object.freeze(keys as NonNullable<typeof keys[number]>[]) });
  });
  if (frames.some((frame) => frame === null) || frames.length !== 39 || frames[0]!.time !== 0 || frames[0]!.keys.length !== row.curveCount) return null;
  return Object.freeze({ ...row, bindings: Object.freeze(bindings), frames: Object.freeze(frames) }) as unknown as CurrentScoreAnimationClip;
}

function parseBinding(value: unknown): CurrentScoreAnimationBinding | null {
  const row = record(value);
  if (row === null || !NODE_NAMES.includes(row.node as string) || !Number.isSafeInteger(row.pathHash) ||
    !Number.isSafeInteger(row.typeId) || !Number.isSafeInteger(row.attributeHash) ||
    !["localPosition", "localScale", "localEulerAngles", "active", "TweenAlpha.to"].includes(row.property as string) ||
    ![0, 1, 3].includes(row.dimension as number) ||
    !(row.streamedStartIndex === null || Number.isSafeInteger(row.streamedStartIndex)) ||
    !(row.scriptPathId === null || INT64.test(row.scriptPathId as string))) return null;
  return Object.freeze({ ...row }) as unknown as CurrentScoreAnimationBinding;
}

function record(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}
function vector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(f32);
}
function f32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value;
}
function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function bits4(value: unknown): value is [string, string, string, string] {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "string" && /^[0-9A-F]{8}$/.test(item));
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    // Shallow-frozen rows can still contain mutable arrays from the source JSON.
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}
