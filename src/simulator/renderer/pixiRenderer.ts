import { Application, Container, Graphics, PerspectiveMesh, Sprite, Texture } from "pixi.js";
import {
  NoteSkinTextureBundle,
  resolveDirectionalArrowTexture,
  resolveDirectionalLaneTexture,
  resolveFlickTopTexture,
  resolveJudgeTexture,
  resolveRhythmNoteTexture,
  resolveSlideBottomMarkerFlashTexture,
  resolveSlideBottomMarkerTexture,
} from "../engine/assets";
import { SIMULATOR_TIMING_FPS } from "../engine/simulatorTiming";
import {
  calculateStageGeometry,
  FIELD_BG_WIDTH_TO_STAGE_WIDTH_RATIO,
  JUDGE_LINE_WIDTH_TO_STAGE_WIDTH_RATIO,
  type StageGeometry,
} from "../engine/stageGeometry";
import { percentFromFrameRaw as calculatePercentFromFrameRaw } from "../engine/noteMotion";
import { axisAtMs } from "../engine/timingGroup";
import {
  projectNguiDisplayPoint,
  RHYTHM_HUD_ANCHORS,
  RHYTHM_HUD_TRANSFORM_SCALES,
  RHYTHM_HUD_WIDGETS,
} from "../engine/uiHudLayout";
import type { ParticleEffectDefinition } from "../engine/particlePack";
import {
  ActiveParticleEmitter,
  drawParticleEmitter,
  ParticleEmitterDrawContext,
  ParticleLayoutPreset,
  ParticleVisualLayer,
} from "./noteParticleEffectRenderer";
import { drawComboHud } from "./comboHudRenderer";
import {
  ActiveNote,
  ActiveSlide,
  ChartEvent,
  JudgeTriggerEvent,
  NoteChartEvent,
  ParsedChart,
  ParticleTriggerEvent,
  RuntimeNoteLifecycleState,
  RuntimeStats,
  RuntimeJudgeKind,
  RuntimeNoteSemantic,
  RuntimeSlideType,
  SimultaneousGroup,
  SlideChartEvent,
  SimulatorSettings,
} from "../engine/types";
import type { TimingGroupDef } from "../engine/timingGroup";

type MvRenderFrame =
  {
    kind: "image";
    src: string;
    alpha: number;
    sourceWidth: number;
    sourceHeight: number;
  };

type NoteVisualState = {
  x: number;
  y: number;
  percent: number;
  scale: number;
};

type ActiveNoteBodyRenderState = {
  color: number;
  visual: NoteVisualState;
  noteScale: number;
  directional: boolean;
  renderX: number;
  alpha: number;
  tex: Texture | null;
};

type ActiveNoteBodyWindowState = {
  visual: NoteVisualState;
  noteScale: number;
  directional: boolean;
  renderX: number;
  tex: Texture | null;
};

export interface SimulatorStartupRenderState {
  liveBgAlpha: number;
  liveBgScale: number;
  liveBgAnchorTopCenter: boolean;
  playfieldAlpha: number;
  uiAlpha: number;
  chartObjectsVisible: boolean;
}

interface SlideConnection {
  fromEventIndex: number;
  toEventIndex: number;
  slideChainEventIndex: number;
  fromEvent: NoteChartEvent;
  toEvent: NoteChartEvent;
  fromAnchorLane: number;
  toAnchorLane: number;
  markerSourceBaseType: RuntimeNoteSemantic["baseType"] | null;
  markerSourceIsHead: boolean;
  markerSourceRhythmWidth: number;
  slideRhythmWidth: number;
  slideType: RuntimeSlideType;
  useSpecialTexture: boolean;
  mode: "normal" | "leadingIgnored" | "trailingIgnored";
}

interface ActiveHoldEffect {
  slideChainEventIndex: number;
  currentFromEventIndex: number;
  linearEmitter: ActiveParticleEmitter | null;
  circularEmitter: ActiveParticleEmitter | null;
}

interface ActiveJudgeOverlay {
  kind: RuntimeJudgeKind;
  startMs: number;
}

interface ActiveEmptyTouchLaneEffect {
  lane: number;
}

interface ActiveLaneEffect {
  lane: number;
  visualLane: number;
  state: "idle" | "fadeOut";
  startMs: number;
  fadeStartMs: number | null;
}

interface SlideBottomMarker {
  lane: number;
  renderLane: number;
  slideChainEventIndex: number;
  sourceBaseType: RuntimeNoteSemantic["baseType"] | null;
  sourceIsHead: boolean;
  sourceRhythmWidth: number;
  slideRhythmWidth: number;
}

interface SlideConnectionRenderPoint {
  x: number;
  y: number;
  percent: number;
}

type SlideConnectionEndpoint = "from" | "to";

interface SlideConnectionEndpointState {
  from: RuntimeNoteLifecycleState | null;
  to: RuntimeNoteLifecycleState | null;
}

interface BpmFlashCycleSegment {
  startMs: number;
  bpm: number;
  cyclesAtStart: number;
}

function isDirectionalNote(note: RuntimeNoteSemantic): boolean {
  return note.baseType === "directional_flick_left" || note.baseType === "directional_flick_right";
}

function rhythmWidthForNote(note: RuntimeNoteSemantic): number {
  return Math.max(1, Number.isFinite(note.rhythmWidth) ? note.rhythmWidth : 1);
}

function renderCenterLaneForNote(lane: number, note: RuntimeNoteSemantic): number {
  if (isDirectionalNote(note)) {
    return lane;
  }
  return lane + (rhythmWidthForNote(note) - 1) / 2;
}

function slideAnchorLaneForNote(
  lane: number,
  note: RuntimeNoteSemantic | null,
  mode: "incoming" | "outgoing",
): number {
  if (!note) {
    return lane;
  }
  if (isDirectionalNote(note)) {
    const width = Math.max(1, Number.isFinite(note.directionalWidth) ? note.directionalWidth : 1);
    if (mode === "incoming") {
      return lane;
    }
    return note.baseType === "directional_flick_right"
      ? lane + width - 1
      : lane - width + 1;
  }
  return renderCenterLaneForNote(lane, note);
}

function shouldRenderFlickTop(note: RuntimeNoteSemantic): boolean {
  return note.baseType === "flick";
}

function isHoldRenderableSlideNote(note: RuntimeNoteSemantic): boolean {
  if (note.baseType === "hidden") {
    return false;
  }
  return note.slideRole === "start" || note.slideRole === "middle" || note.slideRole === "end";
}

function colorForNote(note: RuntimeNoteSemantic): number {
  if (note.baseType === "flick" && (note.slideRole === "none" || note.slideRole === "end")) {
    return 0xff9d66;
  }
  if (note.baseType === "skill") {
    return 0xffe77a;
  }
  if (isDirectionalNote(note)) {
    return 0xc6a7ff;
  }
  if (note.baseType === "hidden" || note.slideRole === "middle") {
    return 0x9be9b6;
  }
  return 0x87b7ff;
}

function browserPath(path: string): string {
  if (
    path.startsWith("data:")
    || path.startsWith("blob:")
    || path.startsWith("file://")
    || /^https?:\/\//i.test(path)
  ) {
    return path;
  }
  if (path.startsWith("/")) {
    return path;
  }
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    const unix = path.replace(/\\/g, "/");
    return `file:///${unix}`;
  }
  return `/${path}`;
}

const SLIDE_LINE_MESH_VERTICES_X = 4;
const SLIDE_LINE_MESH_VERTICES_Y = 32;
const EFFECT_MESH_VERTICES_X = 2;
const EFFECT_MESH_VERTICES_Y = 2;
const NOTE_SCALE_MIN = 0.028169014084507;
const NOTE_BASE_TEXTURE_WIDTH = 308;
const NOTE_WIDTH_TO_LANE_WIDTH_RATIO = 1.38;
const LONG_NOTE_LINE_HALF_WIDTH_TO_LANE_WIDTH = 0.48;
const FIELD_BG_TO_JUDGE_WIDTH_RATIO = 1.35 / 0.875;
const SIMULTANEOUS_LINE_HEIGHT_TO_NOTE_WIDTH = 27 / 308;
const HIT_CIRCLE_LAYOUT_SCALE_NON_DIRECTIONAL = 1.15;
const HIT_CIRCLE_LAYOUT_SCALE_DIRECTIONAL = 0.85;
const NOTE_LANE_EFFECT_FADE_DURATION_MS = 1000 / 6;
const NOTE_LANE_EFFECT_OFF_RESERVE_MS = (2 * 1000) / SIMULATOR_TIMING_FPS;
// Source: HOST________/VSCode/bangdream-apk/reverse/analysis/targets/runtime-ui-binding-report.*
// level3 Button1..Button7 Transform spacing is 2.2 Unity units, and
// NoteLaneEffect_1..4 Sprite metadata has 500 px height at 69 PPU.
const NOTE_LANE_EFFECT_HEIGHT_TO_LANE_WIDTH_RATIO = (500 / 69) / 2.2;
// Source: NoteLaneEffect_1..4 Sprite m_Rect, m_RD.textureRect and m_Pivot.
// The checked-in PNGs are tight Sprite exports, so the full-rect pivot is
// translated into tight texture coordinates. SpriteRenderer.flipX is applied
// later with negative X scale around that same translated pivot.
const NOTE_LANE_EFFECT_ANCHOR_BY_TEXTURE_INDEX: Record<number, { x: number; y: number }> = {
  1: { x: (774 * 0.5 - 307.0696716308594) / 466.9303283691406, y: 1 },
  2: { x: (526 * 0.5 - 184.2117919921875) / 341.7882080078125, y: 1 },
  3: { x: (278 * 0.5 - 60.23698043823242) / 217.7630157470703, y: 1 },
  4: { x: 0.5, y: 1 },
};
const SLOT_EFFECT_DURATION_MS = 600;
const DIRECTIONAL_LINEAR_DOUBLE_PLAY_WIDTH_THRESHOLD = 3;
const DIRECTIONAL_LINEAR_DOUBLE_PLAY_DELAY_MS = 160;
// Source: AnimationClip GameJudge streamed keyframes in runtime-ui-binding-report.*.
const JUDGE_OVERLAY_DURATION_MS = 480;

function lerpNumber(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

function judgeOverlayClip(ageMs: number): { scale: number; alpha: number } {
  if (ageMs <= 40) {
    return {
      scale: lerpNumber(0.8, 1.1, ageMs / 40),
      alpha: lerpNumber(0.6, 1, ageMs / 40),
    };
  }
  if (ageMs <= 80) {
    return {
      scale: lerpNumber(1.1, 1, (ageMs - 40) / 40),
      alpha: 1,
    };
  }
  return { scale: 1, alpha: 1 };
}

function mixUint32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function hashString32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return mixUint32(hash);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export class PixiRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private playfieldLayer: Container | null = null;
  private uiLayer: Container | null = null;
  private liveBgSprite: Sprite | null = null;
  private laneBgSprite: Sprite | null = null;
  private lanesG: Graphics | null = null;
  private judgeLineSprite: Sprite | null = null;
  private linesG: Graphics | null = null;
  private simultaneousLineLayer: Container | null = null;
  private fallbackNoteG: Graphics | null = null;
  private mvSprite: Sprite | null = null;
  private slideLineLayer: Container | null = null;
  private noteSpriteLayer: Container | null = null;
  private effectSpriteLayer: Container | null = null;
  private comboHudLayer: Container | null = null;
  private judgeHudLayer: Container | null = null;

  private noteSpritePool: Sprite[] = [];
  private noteSpriteCursor = 0;
  private noteSpritePrevUsed = 0;

  private slideLineMeshPool: PerspectiveMesh[] = [];
  private slideLineMeshCursor = 0;
  private slideLineMeshPrevUsed = 0;

  private simultaneousLineSpritePool: Sprite[] = [];
  private simultaneousLineSpriteCursor = 0;
  private simultaneousLineSpritePrevUsed = 0;

  private effectSpritePool: Sprite[] = [];
  private effectSpriteCursor = 0;
  private effectSpritePrevUsed = 0;
  private effectMeshPool: PerspectiveMesh[] = [];
  private effectMeshCursor = 0;
  private effectMeshPrevUsed = 0;
  private comboHudSpritePool: Sprite[] = [];
  private comboHudSpriteCursor = 0;
  private comboHudSpritePrevUsed = 0;
  private judgeHudSpritePool: Sprite[] = [];
  private judgeHudSpriteCursor = 0;
  private judgeHudSpritePrevUsed = 0;
  private activeParticleEmitters: ActiveParticleEmitter[] = [];
  private activeJudgeOverlay: ActiveJudgeOverlay | null = null;
  private activeEmptyTouchLaneEffect: ActiveEmptyTouchLaneEffect | null = null;
  private activeLaneEffects: Array<ActiveLaneEffect | null> = new Array(7).fill(null);
  private chartEvents: readonly ChartEvent[] = [];
  private slideConnections: SlideConnection[] = [];
  private simultaneousGroups: readonly SimultaneousGroup[] = [];
  private slideConnectionByFromEventIndex = new Map<number, SlideConnection>();
  private noteLifecycleStates: ReadonlyMap<number, RuntimeNoteLifecycleState> = new Map();
  private eventSlideChainIndexByEventIndex = new Map<number, number>();
  private slideFlashFirstTriggerCycleByChainEventIndex = new Map<number, number>();
  private bpmFlashCycleSegments: BpmFlashCycleSegment[] = [];
  private activeHoldEffects = new Map<number, ActiveHoldEffect>();
  private timingGroups: readonly TimingGroupDef[] = [];
  private lanesDirty = true;
  private flickFrame = 0;
  private frameTick = 0;

  private mvTextureCache = new Map<string, Texture>();
  private mvTextureOrder: string[] = [];
  private mvCurrentPath = "";
  private particleEmitterSeedSerial = 1;
  private settings: SimulatorSettings;
  private assets: NoteSkinTextureBundle | null = null;
  private stageGeometryCache: StageGeometry | null = null;
  private lastRenderedCombo = 0;
  private lastComboHitMs = Number.NEGATIVE_INFINITY;
  private startupRenderState: SimulatorStartupRenderState | null = null;
  private webglContextLost = false;

  constructor(settings: SimulatorSettings) {
    this.settings = settings;
  }

  setAssets(bundle: NoteSkinTextureBundle | null): void {
    this.assets = bundle;
    this.lanesDirty = true;
    this.clearLaneEffects();
  }

  setStartupRenderState(state: SimulatorStartupRenderState | null): void {
    this.startupRenderState = state;
  }

  isWebglContextLost(): boolean {
    return this.webglContextLost;
  }

  getWebglContextAlphaEnabled(): boolean | null {
    const gl = (this.app?.renderer as { gl?: WebGLRenderingContext | WebGL2RenderingContext | null } | undefined)?.gl;
    if (!gl) {
      return null;
    }
    const attrs = gl.getContextAttributes?.();
    if (!attrs) {
      return null;
    }
    return attrs.alpha ?? null;
  }

  setChart(chart: ParsedChart): void {
    const events = chart.events;
    this.timingGroups = chart.timingGroups;
    this.simultaneousGroups = chart.simultaneousGroups;
    for (const hold of this.activeHoldEffects.values()) {
      this.destroyHoldEffectEmitters(hold);
    }
    this.activeHoldEffects.clear();
    this.particleEmitterSeedSerial = 1;
    const eventSlideChainIndexByEventIndex = new Map<number, number>();
    const hiddenSlideChainEventIndices = new Set<number>();
    const slideRhythmWidthBySlideChainEventIndex = new Map<number, number>();
    const resolveLastVisibleSource = (
      slideEvent: ChartEvent,
      throughEventIndex: number,
    ): { eventIndex: number; baseType: RuntimeNoteSemantic["baseType"]; rhythmWidth: number } | null => {
      if (slideEvent.eventType !== "slide") {
        return null;
      }
      let source: { eventIndex: number; baseType: RuntimeNoteSemantic["baseType"]; rhythmWidth: number } | null = null;
      for (const nodeEventIndex of slideEvent.nodeEventIndices) {
        const nodeEvent = events[nodeEventIndex];
        if (nodeEvent?.eventType === "note" && nodeEvent.note.baseType !== "hidden") {
          source = {
            eventIndex: nodeEventIndex,
            baseType: nodeEvent.note.baseType,
            rhythmWidth: rhythmWidthForNote(nodeEvent.note),
          };
        }
        if (nodeEventIndex === throughEventIndex) {
          break;
        }
      }
      return source;
    };
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.eventType !== "slide") {
        continue;
      }
      for (const nodeEventIndex of event.nodeEventIndices) {
        const nodeEvent = events[nodeEventIndex];
        if (nodeEvent?.eventType !== "note") {
          continue;
        }
        eventSlideChainIndexByEventIndex.set(nodeEventIndex, index);
        if (nodeEvent.note.baseType === "hidden") {
          hiddenSlideChainEventIndices.add(index);
        }
        if (!isDirectionalNote(nodeEvent.note)) {
          if (!slideRhythmWidthBySlideChainEventIndex.has(index)) {
            slideRhythmWidthBySlideChainEventIndex.set(index, rhythmWidthForNote(nodeEvent.note));
          }
        }
      }
    }

    const connections: SlideConnection[] = [];
    for (let slideChainEventIndex = 0; slideChainEventIndex < events.length; slideChainEventIndex += 1) {
      const slideEvent = events[slideChainEventIndex];
      if (slideEvent.eventType !== "slide") {
        continue;
      }
      const staticSlideRhythmWidth = slideRhythmWidthBySlideChainEventIndex.get(slideChainEventIndex);
      for (let nodeIndex = 1; nodeIndex < slideEvent.nodeEventIndices.length; nodeIndex += 1) {
        const fromEventIndex = slideEvent.nodeEventIndices[nodeIndex - 1];
        const toEventIndex = slideEvent.nodeEventIndices[nodeIndex];
        const fromEvent = events[fromEventIndex];
        const toEvent = events[toEventIndex];
        if (fromEvent?.eventType !== "note" || toEvent?.eventType !== "note") {
          continue;
        }
        const markerSource = resolveLastVisibleSource(slideEvent, fromEventIndex);
        const slideRhythmWidth =
          staticSlideRhythmWidth
          ?? Math.max(
            rhythmWidthForNote(fromEvent.note),
            rhythmWidthForNote(toEvent.note),
            markerSource?.rhythmWidth ?? 1,
          );
        connections.push({
          fromEventIndex,
          toEventIndex,
          slideChainEventIndex,
          fromEvent,
          toEvent,
          fromAnchorLane: slideAnchorLaneForNote(fromEvent.lane, fromEvent.note, "outgoing"),
          toAnchorLane: slideAnchorLaneForNote(toEvent.lane, toEvent.note, "incoming"),
          markerSourceBaseType: markerSource?.baseType ?? null,
          markerSourceIsHead: markerSource
            ? markerSource.eventIndex === slideEvent.headNodeEventIndex
            : true,
          markerSourceRhythmWidth: markerSource?.rhythmWidth ?? 1,
          slideRhythmWidth,
          slideType: slideEvent.slideType,
          useSpecialTexture: hiddenSlideChainEventIndices.has(slideChainEventIndex),
          mode: this.resolveSlideConnectionMode(slideEvent, nodeIndex, events),
        });
      }
    }
    connections.sort((left, right) => {
      const leftFromHitMs = events[left.fromEventIndex]?.hitMs ?? 0;
      const rightFromHitMs = events[right.fromEventIndex]?.hitMs ?? 0;
      if (leftFromHitMs !== rightFromHitMs) {
        return leftFromHitMs - rightFromHitMs;
      }
      return (events[left.toEventIndex]?.hitMs ?? 0) - (events[right.toEventIndex]?.hitMs ?? 0);
    });
    this.chartEvents = events;
    this.slideConnections = connections;
    this.slideConnectionByFromEventIndex.clear();
    for (const connection of connections) {
      this.slideConnectionByFromEventIndex.set(connection.fromEventIndex, connection);
    }
    this.eventSlideChainIndexByEventIndex = eventSlideChainIndexByEventIndex;
    this.buildBpmFlashCycleSegments(events);
    this.slideFlashFirstTriggerCycleByChainEventIndex.clear();
    this.activeJudgeOverlay = null;
    this.activeEmptyTouchLaneEffect = null;
    this.clearLaneEffects();
    this.lastRenderedCombo = 0;
    this.lastComboHitMs = Number.NEGATIVE_INFINITY;
  }

  pushParticleTriggers(events: ParticleTriggerEvent[]): void {
    if (!events.length) {
      return;
    }
    for (const trigger of events) {
      this.spawnParticleEmittersForTrigger(trigger);
    }
  }

  pushJudgeTriggers(events: JudgeTriggerEvent[]): void {
    if (!events.length) {
      return;
    }
    const latest = events[events.length - 1];
    this.activeJudgeOverlay = {
      kind: latest.kind,
      startMs: latest.elapsedMs,
    };
  }

  triggerEmptyTapEffects(lane: number, elapsedMs: number): void {
    this.startOfficialLaneEffect(lane, elapsedMs, true);
    this.startSpriteParticleEffect("slot", lane, elapsedMs);
  }

  endEmptyTapEffects(elapsedMs: number): void {
    this.releaseEmptyTouchLaneEffect(elapsedMs);
  }

  resolveSlotLaneFromViewportX(viewportX: number): number | null {
    if (!Number.isFinite(viewportX)) {
      return null;
    }
    const geometry = this.stageGeometry();
    const laneWidth = this.stageLaneWidth();
    if (!Number.isFinite(laneWidth) || laneWidth <= 1e-6) {
      return null;
    }
    const logicalLane = ((viewportX - geometry.viewportWidth * 0.5) / laneWidth) + 3;
    const lane = this.settings.mirror ? 6 - logicalLane : logicalLane;
    const snappedLane = Math.round(lane);
    if (snappedLane < 0 || snappedLane > 6) {
      return null;
    }
    return snappedLane;
  }

  async mount(host: HTMLElement): Promise<void> {
    const initialWidth = Math.max(1, Math.floor(this.settings.windowX));
    const initialHeight = Math.max(1, Math.floor(this.settings.windowY));

    this.app = new Application();
    await this.app.init({
      width: initialWidth,
      height: initialHeight,
      backgroundColor: 0x000000,
      backgroundAlpha: 0,
      clearBeforeRender: true,
      preference: "webgl",
      premultipliedAlpha: true,
      antialias: true,
      autoDensity: true,
      resolution: Math.max(1, window.devicePixelRatio || 1)
    });

    host.innerHTML = "";
    host.appendChild(this.app.canvas);
    this.app.canvas.style.background = "transparent";
    this.app.canvas.style.backgroundColor = "transparent";
    const rendererWithBackground = this.app.renderer as unknown as {
      background?: { alpha?: number; clearBeforeRender?: boolean };
    };
    if (rendererWithBackground.background) {
      rendererWithBackground.background.alpha = 0;
      rendererWithBackground.background.clearBeforeRender = true;
    }
    this.app.canvas.addEventListener("webglcontextlost", this.onWebglContextLost as EventListener, { passive: false });
    this.app.canvas.addEventListener("webglcontextrestored", this.onWebglContextRestored as EventListener);

    this.root = new Container();
    this.root.sortableChildren = true;
    this.playfieldLayer = new Container();
    this.uiLayer = new Container();
    this.app.stage.addChild(this.root);

    this.liveBgSprite = new Sprite();
    this.liveBgSprite.visible = false;
    this.liveBgSprite.zIndex = 0;
    this.mvSprite = new Sprite();
    this.mvSprite.visible = false;
    this.mvSprite.zIndex = 1;
    this.playfieldLayer.zIndex = 10;
    this.uiLayer.zIndex = 20;

    this.laneBgSprite = new Sprite(Texture.WHITE);
    this.laneBgSprite.visible = false;
    this.laneBgSprite.anchor.set(0.5, 1);
    this.lanesG = new Graphics();
    this.judgeLineSprite = new Sprite(Texture.WHITE);
    this.judgeLineSprite.visible = false;
    this.judgeLineSprite.anchor.set(0.5, 0.5);
    this.linesG = new Graphics();
    this.simultaneousLineLayer = new Container();
    this.fallbackNoteG = new Graphics();
    this.slideLineLayer = new Container();
    this.noteSpriteLayer = new Container();
    this.effectSpriteLayer = new Container();
    this.comboHudLayer = new Container();
    this.judgeHudLayer = new Container();

    this.playfieldLayer.addChild(
      this.laneBgSprite,
      this.lanesG,
      this.judgeLineSprite,
      this.linesG,
      this.simultaneousLineLayer,
      this.slideLineLayer,
      this.effectSpriteLayer,
      this.noteSpriteLayer,
      this.fallbackNoteG,
    );
    this.uiLayer.addChild(
      this.comboHudLayer,
      this.judgeHudLayer,
    );

    this.root.addChild(
      this.liveBgSprite,
      this.mvSprite,
      this.playfieldLayer,
      this.uiLayer,
    );
  }

  resize(width: number, height: number): void {
    if (!this.app) {
      return;
    }
    this.app.renderer.resize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    this.lanesDirty = true;
    this.stageGeometryCache = null;
  }

  render(
    notes: readonly ActiveNote[],
    activeSlides: readonly ActiveSlide[],
    activeNotesMap: ReadonlyMap<number, ActiveNote>,
    noteLifecycleStates: ReadonlyMap<number, RuntimeNoteLifecycleState>,
    stats: RuntimeStats,
    mvFrame: MvRenderFrame | null,
  ): void {
    this.noteLifecycleStates = noteLifecycleStates;
    this.clearNoteInWindowStates(notes);

    if (
      !this.lanesG
      || !this.linesG
      || !this.fallbackNoteG
      || !this.mvSprite
      || !this.liveBgSprite
      || !this.playfieldLayer
      || !this.uiLayer
    ) {
      return;
    }

    const startup = this.startupRenderState;
    this.playfieldLayer.alpha = clamp01(startup?.playfieldAlpha ?? 1);
    this.uiLayer.alpha = clamp01(startup?.playfieldAlpha ?? 1);
    this.playfieldLayer.visible = true;

    this.noteSpriteCursor = 0;
    this.slideLineMeshCursor = 0;
    this.simultaneousLineSpriteCursor = 0;
    this.effectSpriteCursor = 0;
    this.effectMeshCursor = 0;
    this.comboHudSpriteCursor = 0;
    this.judgeHudSpriteCursor = 0;
    this.frameTick += 1;
    this.flickFrame = Math.floor((stats.elapsedMs * this.settings.fps) / 1000) % Math.max(1, Math.floor(this.settings.fps / 3));

    this.updateLiveBackgroundFrame();
    this.updateMvFrame(mvFrame);
    this.drawLanes();
    if (startup?.chartObjectsVisible ?? true) {
      this.drawNotes(notes, activeSlides, activeNotesMap, stats.elapsedMs);
      this.drawOfficialLaneEffects(stats.elapsedMs);
      this.drawParticleEffects(stats.elapsedMs);
      this.drawComboHudOverlay(stats);
      this.drawJudgeHudOverlay(stats.elapsedMs);
    } else {
      this.linesG.clear();
      this.fallbackNoteG.clear();
    }
    this.noteSpritePrevUsed = this.compactSpritePool(this.noteSpritePool, this.noteSpriteCursor, this.noteSpritePrevUsed);
    this.slideLineMeshPrevUsed = this.compactMeshPool(
      this.slideLineMeshPool,
      this.slideLineMeshCursor,
      this.slideLineMeshPrevUsed,
    );
    this.simultaneousLineSpritePrevUsed = this.compactSpritePool(
      this.simultaneousLineSpritePool,
      this.simultaneousLineSpriteCursor,
      this.simultaneousLineSpritePrevUsed,
    );
    this.effectSpritePrevUsed = this.compactSpritePool(this.effectSpritePool, this.effectSpriteCursor, this.effectSpritePrevUsed);
    this.effectMeshPrevUsed = this.compactMeshPool(this.effectMeshPool, this.effectMeshCursor, this.effectMeshPrevUsed);
    this.comboHudSpritePrevUsed = this.compactSpritePool(
      this.comboHudSpritePool,
      this.comboHudSpriteCursor,
      this.comboHudSpritePrevUsed,
    );
    this.judgeHudSpritePrevUsed = this.compactSpritePool(
      this.judgeHudSpritePool,
      this.judgeHudSpriteCursor,
      this.judgeHudSpritePrevUsed,
    );
  }

  destroy(): void {
    if (this.app?.canvas) {
      this.app.canvas.removeEventListener("webglcontextlost", this.onWebglContextLost as EventListener);
      this.app.canvas.removeEventListener("webglcontextrestored", this.onWebglContextRestored as EventListener);
    }
    if (this.assets) {
      this.assets.destroy();
      this.assets = null;
    }
    for (const tex of this.mvTextureCache.values()) {
      tex.destroy(true);
    }
    this.mvTextureCache.clear();
    this.mvTextureOrder = [];
    this.activeParticleEmitters = [];
    this.activeJudgeOverlay = null;
    this.activeEmptyTouchLaneEffect = null;
    this.clearLaneEffects();
    this.activeHoldEffects.clear();
    this.chartEvents = [];
    this.slideConnections = [];
    this.simultaneousGroups = [];
    this.slideConnectionByFromEventIndex.clear();
    this.eventSlideChainIndexByEventIndex.clear();
    this.slideFlashFirstTriggerCycleByChainEventIndex.clear();
    this.bpmFlashCycleSegments = [];
    this.noteSpritePool = [];
    this.slideLineMeshPool = [];
    this.simultaneousLineSpritePool = [];
    this.effectSpritePool = [];
    this.effectMeshPool = [];
    this.comboHudSpritePool = [];
    this.judgeHudSpritePool = [];
    this.stageGeometryCache = null;
    this.noteSpritePrevUsed = 0;
    this.slideLineMeshPrevUsed = 0;
    this.simultaneousLineSpritePrevUsed = 0;
    this.effectSpritePrevUsed = 0;
    this.effectMeshPrevUsed = 0;
    this.comboHudSpritePrevUsed = 0;
    this.judgeHudSpritePrevUsed = 0;
    this.startupRenderState = null;
    this.webglContextLost = false;
    this.playfieldLayer = null;
    this.uiLayer = null;
    this.liveBgSprite = null;
    this.laneBgSprite = null;
    this.judgeLineSprite = null;
    this.simultaneousLineLayer = null;
    this.comboHudLayer = null;
    this.judgeHudLayer = null;
    this.lastRenderedCombo = 0;
    this.lastComboHitMs = Number.NEGATIVE_INFINITY;
    this.app?.destroy(true);
    this.app = null;
  }

  private readonly onWebglContextLost = (event: Event): void => {
    this.webglContextLost = true;
    if (typeof (event as { preventDefault?: () => void }).preventDefault === "function") {
      (event as { preventDefault: () => void }).preventDefault();
    }
  };

  private readonly onWebglContextRestored = (): void => {
    this.webglContextLost = false;
    this.lanesDirty = true;
    this.stageGeometryCache = null;
  };

  private compactSpritePool(pool: Sprite[], used: number, prevUsed: number): number {
    if (used >= prevUsed) {
      return used;
    }
    for (let i = used; i < prevUsed; i += 1) {
      pool[i].visible = false;
    }
    return used;
  }

  private compactMeshPool(pool: PerspectiveMesh[], used: number, prevUsed: number): number {
    if (used >= prevUsed) {
      return used;
    }
    for (let i = used; i < prevUsed; i += 1) {
      pool[i].visible = false;
    }
    return used;
  }

  private allocSprite(pool: Sprite[], layer: Container): Sprite {
    const isNotePool = pool === this.noteSpritePool;
    const cursor = isNotePool ? this.noteSpriteCursor : this.effectSpriteCursor;

    if (pool.length <= cursor) {
      const s = new Sprite(Texture.WHITE);
      s.visible = false;
      layer.addChild(s);
      pool.push(s);
    }
    const idx = isNotePool ? this.noteSpriteCursor++ : this.effectSpriteCursor++;
    const sprite = pool[idx];
    sprite.visible = true;
    return sprite;
  }

  private allocSlideLineMesh(texture: Texture): PerspectiveMesh | null {
    if (!this.slideLineLayer) {
      return null;
    }
    if (this.slideLineMeshPool.length <= this.slideLineMeshCursor) {
      const mesh = new PerspectiveMesh({
        texture,
        verticesX: SLIDE_LINE_MESH_VERTICES_X,
        verticesY: SLIDE_LINE_MESH_VERTICES_Y,
      });
      this.slideLineLayer.addChild(mesh);
      this.slideLineMeshPool.push(mesh);
    }
    const mesh = this.slideLineMeshPool[this.slideLineMeshCursor++];
    if (mesh.texture !== texture) {
      mesh.texture = texture;
    }
    mesh.visible = true;
    return mesh;
  }

  private allocEffectMesh(texture: Texture): PerspectiveMesh | null {
    if (!this.effectSpriteLayer) {
      return null;
    }
    if (this.effectMeshPool.length <= this.effectMeshCursor) {
      const mesh = new PerspectiveMesh({
        texture,
        verticesX: EFFECT_MESH_VERTICES_X,
        verticesY: EFFECT_MESH_VERTICES_Y,
      });
      this.effectSpriteLayer.addChild(mesh);
      this.effectMeshPool.push(mesh);
    }
    const mesh = this.effectMeshPool[this.effectMeshCursor++];
    if (mesh.texture !== texture) {
      mesh.texture = texture;
    }
    mesh.visible = true;
    return mesh;
  }

  private allocEffectSprite(): Sprite | null {
    if (!this.effectSpriteLayer) {
      return null;
    }
    return this.allocSprite(this.effectSpritePool, this.effectSpriteLayer);
  }

  private allocSimultaneousLineSprite(): Sprite | null {
    if (!this.simultaneousLineLayer) {
      return null;
    }
    if (this.simultaneousLineSpritePool.length <= this.simultaneousLineSpriteCursor) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      this.simultaneousLineLayer.addChild(sprite);
      this.simultaneousLineSpritePool.push(sprite);
    }
    const sprite = this.simultaneousLineSpritePool[this.simultaneousLineSpriteCursor++];
    sprite.visible = true;
    return sprite;
  }

  private allocComboHudSprite(): Sprite | null {
    if (!this.comboHudLayer) {
      return null;
    }
    if (this.comboHudSpritePool.length <= this.comboHudSpriteCursor) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      this.comboHudLayer.addChild(sprite);
      this.comboHudSpritePool.push(sprite);
    }
    const sprite = this.comboHudSpritePool[this.comboHudSpriteCursor++];
    sprite.visible = true;
    return sprite;
  }

  private allocJudgeHudSprite(): Sprite | null {
    if (!this.judgeHudLayer) {
      return null;
    }
    if (this.judgeHudSpritePool.length <= this.judgeHudSpriteCursor) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      this.judgeHudLayer.addChild(sprite);
      this.judgeHudSpritePool.push(sprite);
    }
    const sprite = this.judgeHudSpritePool[this.judgeHudSpriteCursor++];
    sprite.visible = true;
    return sprite;
  }

  private drawComboHudOverlay(stats: RuntimeStats): void {
    if (stats.combo > this.lastRenderedCombo) {
      this.lastComboHitMs = stats.elapsedMs;
    } else if (stats.combo <= 0) {
      this.lastComboHitMs = Number.NEGATIVE_INFINITY;
    }
    this.lastRenderedCombo = stats.combo;

    drawComboHud({
      viewportWidth: this.viewportWidth(),
      viewportHeight: this.viewportHeight(),
      elapsedMs: stats.elapsedMs,
      combo: stats.combo,
      lastComboHitMs: this.lastComboHitMs,
      textures: this.assets?.hud ?? null,
      allocSprite: () => this.allocComboHudSprite(),
    });
  }

  private drawJudgeHudOverlay(elapsedMs: number): void {
    if (!this.activeJudgeOverlay || !this.assets) {
      return;
    }

    const overlay = this.activeJudgeOverlay;
    const ageMs = elapsedMs - overlay.startMs;
    if (ageMs < 0) {
      return;
    }
    if (ageMs > JUDGE_OVERLAY_DURATION_MS) {
      this.activeJudgeOverlay = null;
      return;
    }

    // Keep full judge-kind routing, runtime currently only emits "auto".
    const texture = resolveJudgeTexture(this.assets, overlay.kind);
    if (!texture) {
      return;
    }

    const sprite = this.allocJudgeHudSprite();
    if (!sprite) {
      return;
    }
    const geometry = this.stageGeometry();
    const projected = projectNguiDisplayPoint(RHYTHM_HUD_ANCHORS.judgementResult, {
      width: geometry.viewportWidth,
      height: geometry.viewportHeight,
    });
    const clip = judgeOverlayClip(ageMs);
    const targetHeight = RHYTHM_HUD_WIDGETS.judgementResult.height
      * projected.scale
      * RHYTHM_HUD_TRANSFORM_SCALES.judgementResult
      * clip.scale;
    const scale = targetHeight / Math.max(1, texture.height);
    this.applySprite(sprite, texture, projected.x, projected.y, scale, clip.alpha, 0.5, 0.5);
  }

  private applySprite(
    sprite: Sprite,
    texture: Texture,
    x: number,
    y: number,
    scale: number,
    alpha = 1,
    anchorX = 0.5,
    anchorY = 0.5
  ): void {
    sprite.texture = texture;
    sprite.anchor.set(anchorX, anchorY);
    sprite.x = x;
    sprite.y = y;
    sprite.alpha = alpha;
    const clampedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    sprite.scale.set(clampedScale, clampedScale);
  }

  private applyStretchSprite(
    sprite: Sprite,
    texture: Texture,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 1,
    anchorX = 0,
    anchorY = 0.5,
  ): void {
    sprite.texture = texture;
    sprite.anchor.set(anchorX, anchorY);
    sprite.x = x;
    sprite.y = y;
    sprite.alpha = alpha;
    sprite.rotation = 0;
    sprite.width = Number.isFinite(width) && width > 0 ? width : 1;
    sprite.height = Number.isFinite(height) && height > 0 ? height : 1;
  }

  private applyStretchSpriteBetweenPoints(
    sprite: Sprite,
    texture: Texture,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    height: number,
    alpha = 1,
  ): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const width = Math.hypot(dx, dy);
    this.applyStretchSprite(sprite, texture, fromX, fromY, width, height, alpha, 0, 0.5);
    sprite.rotation = Math.atan2(dy, dx);
  }

  private updateLiveBackgroundFrame(): void {
    if (!this.liveBgSprite) {
      return;
    }
    if (this.settings.mvmode) {
      this.liveBgSprite.visible = false;
      return;
    }

    const texture = this.assets?.background.liveBG ?? null;
    if (!texture) {
      this.liveBgSprite.visible = false;
      return;
    }

    const viewportWidth = this.viewportWidth();
    const viewportHeight = this.viewportHeight();
    const sourceWidth = Math.max(1, texture.width);
    const sourceHeight = Math.max(1, texture.height);
    const baseScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
    const startup = this.startupRenderState;
    const scaleMultiplier = startup ? Math.max(0, startup.liveBgScale) : 1;
    const scale = baseScale * scaleMultiplier;
    const useTopAnchor = startup?.liveBgAnchorTopCenter === true;

    this.liveBgSprite.texture = texture;
    this.liveBgSprite.visible = true;
    this.liveBgSprite.alpha = clamp01(startup?.liveBgAlpha ?? 1);
    this.liveBgSprite.anchor.set(0.5, useTopAnchor ? 0 : 0.5);
    this.liveBgSprite.x = viewportWidth * 0.5;
    this.liveBgSprite.y = useTopAnchor ? 0 : (viewportHeight * 0.5);
    this.liveBgSprite.scale.set(scale, scale);
  }

  private updateMvFrame(mvFrame: MvRenderFrame | null): void {
    if (!this.mvSprite) {
      return;
    }
    if (!mvFrame) {
      this.mvSprite.visible = false;
      this.mvCurrentPath = "";
      return;
    }

    const path = `image:${browserPath(mvFrame.src)}`;
    this.mvSprite.visible = true;
    this.mvSprite.tint = 0xffffff;
    this.mvSprite.alpha = mvFrame.alpha;

    if (this.mvCurrentPath !== path) {
      let tex = this.mvTextureCache.get(path);
      if (!tex) {
        tex = Texture.from(browserPath(mvFrame.src));
        this.mvTextureCache.set(path, tex);
        this.mvTextureOrder.push(path);
        if (this.mvTextureOrder.length > 180) {
          const old = this.mvTextureOrder.shift();
          if (old && old !== path) {
            const oldTex = this.mvTextureCache.get(old);
            if (oldTex) {
              oldTex.destroy(true);
              this.mvTextureCache.delete(old);
            }
          }
        }
      }
      this.mvSprite.texture = tex;
      this.mvCurrentPath = path;
    }

    const rw = this.app?.screen.width ?? this.settings.windowX;
    const rh = this.app?.screen.height ?? this.settings.windowY;
    const sourceWidth = Math.max(1, mvFrame.sourceWidth);
    const sourceHeight = Math.max(1, mvFrame.sourceHeight);
    const scale = Math.min(rw / sourceWidth, rh / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    this.mvSprite.x = (rw - drawWidth) / 2;
    this.mvSprite.y = (rh - drawHeight) / 2;
    this.mvSprite.scale.set(scale, scale);
  }

  private drawLanes(): void {
    const g = this.lanesG!;
    if (!this.lanesDirty) {
      return;
    }
    g.clear();

    const geometry = this.stageGeometry();
    const topY = geometry.stageTop;
    const bottomY = geometry.stageBottom;
    const laneBgTexture = this.assets?.field.bgLineRhythm ?? null;
    const judgeLineTexture = this.assets?.field.gamePlayLine ?? null;

    if (this.laneBgSprite) {
      if (laneBgTexture) {
        const laneCenterX = geometry.viewportWidth * 0.5;
        const drawWidth = this.stageFieldBgWidth();
        const scale = drawWidth / Math.max(1, laneBgTexture.width);
        this.laneBgSprite.texture = laneBgTexture;
        this.laneBgSprite.alpha = 1;
        this.laneBgSprite.visible = true;
        this.laneBgSprite.x = laneCenterX;
        this.laneBgSprite.y = bottomY;
        this.laneBgSprite.scale.set(scale, scale);
      } else {
        this.laneBgSprite.visible = false;
      }
    }

    if (this.judgeLineSprite) {
      if (judgeLineTexture) {
        const drawWidth = this.laneBgSprite?.visible
          ? Math.max(1, this.laneBgSprite.width * FIELD_BG_TO_JUDGE_WIDTH_RATIO)
          : Math.max(1, this.stageJudgeLineWidth());
        const scale = drawWidth / Math.max(1, judgeLineTexture.width);
        this.judgeLineSprite.texture = judgeLineTexture;
        this.judgeLineSprite.alpha = 1;
        this.judgeLineSprite.visible = true;
        this.judgeLineSprite.x = geometry.viewportWidth * 0.5;
        this.judgeLineSprite.y = geometry.stageBottom;
        this.judgeLineSprite.scale.set(scale, scale);
      } else {
        this.judgeLineSprite.visible = false;
      }
    }

    if (!laneBgTexture) {
      g.setStrokeStyle({ width: 1, color: 0x4762a8, alpha: 0.7 });
      for (let lane = 0; lane <= 6; lane += 1) {
        const tx = this.laneXAtPercent(lane, 0);
        const bx = this.laneXAtPercent(lane, 1);
        g.moveTo(tx, topY);
        g.lineTo(bx, bottomY);
      }
    }

    if (!judgeLineTexture) {
      g.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 0.9 });
      g.moveTo(this.laneXAtPercent(0, 1), geometry.stageBottom);
      g.lineTo(this.laneXAtPercent(6, 1), geometry.stageBottom);
    }
    this.lanesDirty = false;
  }

  private drawNotes(
    notes: readonly ActiveNote[],
    activeSlides: readonly ActiveSlide[],
    activeNotesMap: ReadonlyMap<number, ActiveNote>,
    elapsedMs: number,
  ): void {
    const lineG = this.linesG!;
    const fallbackG = this.fallbackNoteG!;
    lineG.clear();
    fallbackG.clear();
    const slideBottomMarkers = this.resolveActiveSlideBottomMarkers(activeSlides, elapsedMs);
    const noteRenderStates = new Map<ActiveNote, ActiveNoteBodyRenderState>();
    for (const n of notes) {
      const inWindowState = this.resolveActiveNoteInWindowState(n, elapsedMs);
      if (!inWindowState) {
        continue;
      }
      this.markNoteInWindow(n, true);
      const renderState = this.resolveActiveNoteBodyRenderState(n, inWindowState, elapsedMs);
      if (!renderState) {
        continue;
      }
      noteRenderStates.set(n, renderState);
    }

    this.drawSlideConnections(lineG, elapsedMs, activeNotesMap);
    this.drawSimultaneousLines(lineG, elapsedMs, activeNotesMap, noteRenderStates);

    for (const n of notes) {
      const renderState = noteRenderStates.get(n);
      if (!renderState) {
        continue;
      }
      const {
        color,
        visual,
        noteScale,
        directional,
        renderX,
        alpha,
        tex,
      } = renderState;

      if (!directional) {
        if (tex && this.noteSpriteLayer) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, tex, renderX, visual.y, this.noteSpriteScale(noteScale), alpha);
        } else {
          const fallbackRadius = Math.max(5, noteScale * 39.76);
          const fallbackColor = n.gray ? 0xb3b7c2 : color;
          fallbackG.fill({ color: fallbackColor, alpha });
          fallbackG.circle(renderX, visual.y, fallbackRadius);
          fallbackG.fill();
        }
      }

      if (shouldRenderFlickTop(n.note)) {
        const flickTex = this.assets ? resolveFlickTopTexture(this.assets, rhythmWidthForNote(n.note)) : null;
        const flickFps = Math.max(1, Math.floor(this.settings.fps / 3));
        const flickTravel = noteScale * NOTE_BASE_TEXTURE_WIDTH * 0.213;
        const flickY = visual.y - flickTravel - (this.flickFrame * flickTravel) / flickFps;

        if (flickTex && this.noteSpriteLayer) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, flickTex, renderX, flickY, this.noteSpriteScale(noteScale), 1);
        } else {
          const fs = Math.max(6, noteScale * 31.24);
          lineG.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 1 });
          lineG.moveTo(renderX - fs * 0.45, flickY + fs * 0.2);
          lineG.lineTo(renderX, flickY - fs * 0.35);
          lineG.lineTo(renderX + fs * 0.45, flickY + fs * 0.2);
        }
      }

      this.drawDirectional(n, noteScale, visual.percent, visual.y, lineG);
    }

    this.drawSlideBottomMarkers(slideBottomMarkers, elapsedMs, fallbackG);
  }

  private drawSimultaneousLines(
    lineG: Graphics,
    elapsedMs: number,
    activeNotesMap: ReadonlyMap<number, ActiveNote>,
    noteRenderStates: ReadonlyMap<ActiveNote, ActiveNoteBodyRenderState>,
  ): void {
    void elapsedMs;
    for (const group of this.simultaneousGroups) {
      const eventIndices = group.eventIndices;
      let previousRenderable: {
        event: NoteChartEvent;
        activeNote: ActiveNote;
        renderState: ActiveNoteBodyRenderState;
      } | null = null;
      for (const eventIndex of eventIndices) {
        const event = this.chartEvents[eventIndex];
        if (event?.eventType !== "note") {
          continue;
        }
        const activeNote = activeNotesMap.get(eventIndex);
        if (!activeNote) {
          continue;
        }
        const renderState = noteRenderStates.get(activeNote);
        if (!renderState) {
          continue;
        }
        const currentRenderable = { event, activeNote, renderState };
        if (previousRenderable) {
          this.drawSimultaneousLine(
            lineG,
            previousRenderable.activeNote,
            currentRenderable.activeNote,
            previousRenderable.renderState,
            currentRenderable.renderState,
          );
        }
        previousRenderable = currentRenderable;
      }
    }
  }

  private drawSimultaneousLine(
    lineG: Graphics,
    fromActiveNote: ActiveNote,
    toActiveNote: ActiveNote,
    fromRenderState: ActiveNoteBodyRenderState,
    toRenderState: ActiveNoteBodyRenderState,
  ): void {
    const fromPoint = this.resolveSimultaneousLineEndpointRenderPoint(fromActiveNote, fromRenderState, "from");
    const toPoint = this.resolveSimultaneousLineEndpointRenderPoint(toActiveNote, toRenderState, "to");
    const lineLength = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
    if (lineLength > 1e-6) {
      const simultaneousLineTexture = this.assets?.lines.simultaneousLine ?? null;
      if (simultaneousLineTexture) {
        const s = this.allocSimultaneousLineSprite();
        if (s) {
          const noteBaseWidth = this.assets?.rhythm.noteNormal[this.textureLaneIndex(toActiveNote.lane)]?.width ?? 308;
          const noteScale = toRenderState.noteScale;
          const spriteScale = this.noteSpriteScale(noteScale);
          const lineHeight = Math.max(
            1,
            spriteScale * noteBaseWidth * SIMULTANEOUS_LINE_HEIGHT_TO_NOTE_WIDTH,
          );
          this.applyStretchSpriteBetweenPoints(
            s,
            simultaneousLineTexture,
            fromPoint.x,
            fromPoint.y,
            toPoint.x,
            toPoint.y,
            lineHeight,
          );
        }
      } else {
        const percent = toRenderState.visual.percent;
        lineG.setStrokeStyle({ width: 1 + percent * 8, color: 0xffffff, alpha: 0.8 });
        lineG.moveTo(fromPoint.x, fromPoint.y);
        lineG.lineTo(toPoint.x, toPoint.y);
      }
    }
  }

  private resolveSimultaneousLineEndpointRenderPoint(
    activeNote: ActiveNote,
    renderState: ActiveNoteBodyRenderState,
    side: "from" | "to",
  ): { x: number; y: number } {
    const lane = this.resolveSimultaneousLineEndpointLane(activeNote, side);
    return {
      x: this.laneXAtPercent(lane, renderState.visual.percent),
      y: renderState.visual.y,
    };
  }

  private resolveSimultaneousLineEndpointLane(activeNote: ActiveNote, side: "from" | "to"): number {
    const note = activeNote.note;
    if (!isDirectionalNote(note)) {
      return renderCenterLaneForNote(activeNote.lane, note);
    }
    const width = Math.max(1, Math.round(note.directionalWidth));
    const baseLane = Math.round(activeNote.lane);
    const leftLane = note.baseType === "directional_flick_right"
      ? baseLane
      : baseLane - width + 1;
    const rightLane = note.baseType === "directional_flick_right"
      ? baseLane + width - 1
      : baseLane;
    return side === "from" ? rightLane : leftLane;
  }

  private clearNoteInWindowStates(notes: readonly ActiveNote[]): void {
    for (const note of notes) {
      this.markNoteInWindow(note, false);
    }
  }

  private markNoteInWindow(note: ActiveNote, inWindow: boolean): void {
    note.inWindow = inWindow;
    const state = this.noteLifecycleStates.get(note.eventIndex);
    if (state) {
      state.inWindow = inWindow;
    }
  }

  private resolveActiveNoteBodyRenderState(
    note: ActiveNote,
    windowState: ActiveNoteBodyWindowState,
    elapsedMs: number,
  ): ActiveNoteBodyRenderState | null {
    if (!this.isActiveNoteWithinVisibilityWindow(note, elapsedMs)) {
      return null;
    }
    if (note.note.baseType === "hidden") {
      return null;
    }

    const { visual, noteScale, directional, renderX, tex } = windowState;
    if (!this.isPercentRenderable(visual.percent)) {
      return null;
    }

    const alpha = 1;

    return {
      color: colorForNote(note.note),
      visual,
      noteScale,
      directional,
      renderX,
      alpha,
      tex,
    };
  }

  private resolveActiveNoteInWindowState(
    note: ActiveNote,
    elapsedMs: number,
  ): ActiveNoteBodyWindowState | null {
    if (!note.started) {
      return null;
    }
    if (!this.isActiveNoteUnconsumedAndNotExpired(note, elapsedMs)) {
      return null;
    }

    return this.resolveActiveNoteBodyWindowState(note, elapsedMs);
  }

  private resolveActiveNoteBodyWindowState(
    note: ActiveNote,
    elapsedMs: number,
  ): ActiveNoteBodyWindowState | null {
    const visual = this.resolveNoteVisualState(note, elapsedMs);
    const noteScale = visual.scale;
    const directional = isDirectionalNote(note.note);
    const renderLane = renderCenterLaneForNote(note.lane, note.note);
    const renderX = this.laneXAtPercent(renderLane, visual.percent);
    const tex = this.assets
      ? resolveRhythmNoteTexture(this.assets, note.note, note.lane, note.gray, renderLane)
      : null;

    if (!this.isNoteBodyFullyWithinFrameStart(note, visual.y, noteScale, tex)) {
      return null;
    }

    return {
      visual,
      noteScale,
      directional,
      renderX,
      tex,
    };
  }

  private isActiveNoteUnconsumedAndNotExpired(note: ActiveNote, elapsedMs: number): boolean {
    const state = this.noteLifecycleStates.get(note.eventIndex);
    if (state?.consumed === true) {
      return false;
    }
    return elapsedMs <= note.visibleEndMs + 1e-6;
  }

  private isActiveNoteWithinVisibilityWindow(note: ActiveNote, elapsedMs: number): boolean {
    if (note.visibilityWindows.length === 0) {
      return true;
    }
    return note.visibilityWindows.some((window) => (
      elapsedMs >= window.startMs - 1e-6
      && elapsedMs <= window.endMs + 1e-6
    ));
  }

  private resolveNoteVisualState(
    note: ActiveNote,
    elapsedMs: number,
  ): NoteVisualState {
    const frameRaw = this.frameRawAt(elapsedMs, note.startMs, note.tgId, note.tgPos);
    const percent = this.percentFromFrameRaw(frameRaw);
    return {
      x: this.laneXAtPercent(note.lane, percent),
      y: this.laneYAtPercent(percent),
      percent,
      scale: Math.max(NOTE_SCALE_MIN, percent * this.settings.noteSize),
    };
  }

  private isNoteBodyFullyWithinFrameStart(
    note: ActiveNote,
    y: number,
    noteScale: number,
    texture: Texture | null,
  ): boolean {
    const topY = this.noteBodyTopY(note, y, noteScale, texture);
    return topY >= this.frameStartBoundaryY() - 1e-6;
  }

  private noteBodyTopY(
    note: ActiveNote,
    y: number,
    noteScale: number,
    texture: Texture | null,
  ): number {
    const spriteScale = this.noteSpriteScale(noteScale);
    return y - this.noteMainBodyHalfHeight(note, noteScale, spriteScale, texture);
  }

  private noteMainBodyHalfHeight(
    note: ActiveNote,
    noteScale: number,
    spriteScale: number,
    texture: Texture | null,
  ): number {
    if (note.note.baseType === "hidden") {
      return 0;
    }
    if (isDirectionalNote(note.note)) {
      const directionalTexture = this.resolveDirectionalNoteBodyTexture(note);
      return directionalTexture
        ? (directionalTexture.height * spriteScale) / 2
        : Math.max(6, noteScale * 28.4);
    }
    return texture
      ? (texture.height * spriteScale) / 2
      : Math.max(5, noteScale * 39.76);
  }

  private resolveDirectionalNoteBodyTexture(note: ActiveNote): Texture | null {
    if (!this.assets || !isDirectionalNote(note.note)) {
      return null;
    }
    const originalLeft = note.note.baseType === "directional_flick_left";
    const textureFamilyLeft = this.settings.mirror ? !originalLeft : originalLeft;
    return resolveDirectionalLaneTexture(
      this.assets,
      textureFamilyLeft,
      note.lane,
    );
  }

  private frameStartBoundaryY(): number {
    return this.laneYAtPercent(this.percentFromFrameRaw(0));
  }

  private resolveActiveNoteRenderPoint(
    note: ActiveNote | undefined,
    elapsedMs: number,
  ): SlideConnectionRenderPoint | null {
    if (!note) {
      return null;
    }
    const visual = this.resolveNoteVisualState(note, elapsedMs);
    if (!Number.isFinite(visual.percent)) {
      return null;
    }
    const renderLane = renderCenterLaneForNote(note.lane, note.note);
    return {
      x: this.laneXAtPercent(renderLane, visual.percent),
      y: visual.y,
      percent: visual.percent,
    };
  }

  private drawConnector(
    graphics: Graphics,
    connection: SlideConnection,
    headX: number,
    headY: number,
    headWp: number,
    tailX: number,
    tailY: number,
    tailWp: number,
    lineAlpha: number,
  ): void {
    const clampedAlpha = Math.max(0, Math.min(1, lineAlpha));
    const topIsHead = headY <= tailY;
    const topX = topIsHead ? headX : tailX;
    const topY = topIsHead ? headY : tailY;
    const bottomX = topIsHead ? tailX : headX;
    const bottomY = topIsHead ? tailY : headY;
    const topWp = topIsHead ? headWp : tailWp;
    const bottomWp = topIsHead ? tailWp : headWp;
    const height = bottomY - topY;
    if (!Number.isFinite(height) || height <= 1e-6) {
      return;
    }

    const lineTexture = this.pickConnectionTexture(connection);
    if (lineTexture) {
      const mesh = this.allocSlideLineMesh(lineTexture);
      if (mesh) {
        mesh.alpha = clampedAlpha;
        mesh.setCorners(
          topX - topWp,
          topY,
          topX + topWp,
          topY,
          bottomX + bottomWp,
          bottomY,
          bottomX - bottomWp,
          bottomY,
        );
        return;
      }
    }

    const baseColor = 0x62e591;
    graphics.setStrokeStyle({
      width: Math.max(1, (topWp + bottomWp) * 0.5 * 2),
      color: baseColor,
      alpha: 0.85 * clampedAlpha,
    });
    graphics.moveTo(topX, topY);
    graphics.lineTo(bottomX, bottomY);
  }

  private drawSlideConnections(
    graphics: Graphics,
    elapsedMs: number,
    activeNotesMap: ReadonlyMap<number, ActiveNote>,
  ): void {
    if (this.slideConnections.length === 0) {
      return;
    }
    for (const connection of this.slideConnections) {
      const fromActiveNote = activeNotesMap.get(connection.fromEventIndex);
      const toActiveNote = activeNotesMap.get(connection.toEventIndex);
      const endpointState = this.resolveSlideConnectionEndpointState(connection);
      const fromInWindow = endpointState.from?.spawned === true && endpointState.from.inWindow === true;
      const toInWindow = endpointState.to?.spawned === true && endpointState.to.inWindow === true;
      const fromConsumed = this.isSlideConnectionFrontConsumed(connection);
      const toConsumed = this.isSlideConnectionBackConsumed(connection);
      const fromEndpointAvailable = fromConsumed || fromInWindow;
      const toEndpointAvailable = toConsumed || toInWindow;
      if ((!fromEndpointAvailable && !toEndpointAvailable) || (fromConsumed && toConsumed)) {
        continue;
      }

      const fromPoint = this.resolveSlideConnectionEndpointRenderPoint(
        connection,
        "from",
        fromActiveNote,
        fromInWindow,
        fromConsumed,
        elapsedMs,
      );
      const toPoint = this.resolveSlideConnectionEndpointRenderPoint(
        connection,
        "to",
        toActiveNote,
        toInWindow,
        toConsumed,
        elapsedMs,
      );
      if (!fromPoint || !toPoint) {
        continue;
      }

      this.drawConnector(
        graphics,
        connection,
        fromPoint.x,
        fromPoint.y,
        this.connectorHalfWidthAtPercent(fromPoint.percent, connection.slideRhythmWidth),
        toPoint.x,
        toPoint.y,
        this.connectorHalfWidthAtPercent(toPoint.percent, connection.slideRhythmWidth),
        this.slideConnectionRenderAlpha(connection),
      );
    }
  }

  private resolveSlideConnectionEndpointRenderPoint(
    connection: SlideConnection,
    endpoint: SlideConnectionEndpoint,
    activeNote: ActiveNote | undefined,
    activeNoteInWindow: boolean,
    consumed: boolean,
    elapsedMs: number,
  ): SlideConnectionRenderPoint | null {
    if (consumed) {
      return this.resolveSlideConnectionMarkerRenderPoint(connection, elapsedMs);
    }
    if (activeNote && activeNoteInWindow) {
      return this.resolveActiveNoteRenderPoint(activeNote, elapsedMs);
    }
    return this.resolveStaticSlideConnectionEndpointRenderPoint(connection, endpoint);
  }

  private resolveSlideConnectionMarkerRenderPoint(
    connection: SlideConnection,
    elapsedMs: number,
  ): SlideConnectionRenderPoint {
    const markerLane = this.laneAtConnectionElapsed(connection, elapsedMs);
    return {
      x: this.laneXAtPercent(markerLane, 1),
      y: this.stageBottomY(),
      percent: 1,
    };
  }

  private resolveStaticSlideConnectionEndpointRenderPoint(
    connection: SlideConnection,
    endpoint: SlideConnectionEndpoint,
  ): SlideConnectionRenderPoint | null {
    const anchorLane = endpoint === "from" ? connection.fromAnchorLane : connection.toAnchorLane;
    const percent = this.percentFromFrameRaw(0);
    if (!Number.isFinite(percent)) {
      return null;
    }
    return {
      x: this.laneXAtPercent(anchorLane, percent),
      y: this.laneYAtPercent(percent),
      percent,
    };
  }

  private resolveSlideConnectionMode(
    slideEvent: SlideChartEvent,
    toNodeIndex: number,
    events: readonly ChartEvent[],
  ): SlideConnection["mode"] {
    if (slideEvent.slideType === "hidden") {
      return "normal";
    }
    const fromNodeIndex = toNodeIndex - 1;
    const lastNodeIndex = slideEvent.nodeEventIndices.length - 1;
    if (
      this.isSlideNodeHidden(slideEvent, events, 0)
      && this.areSlideNodesHidden(slideEvent, events, 0, fromNodeIndex)
    ) {
      return "leadingIgnored";
    }
    if (
      this.isSlideNodeHidden(slideEvent, events, lastNodeIndex)
      && this.areSlideNodesHidden(slideEvent, events, toNodeIndex, lastNodeIndex)
    ) {
      return "trailingIgnored";
    }
    return "normal";
  }

  private isSlideNodeHidden(
    slideEvent: SlideChartEvent,
    events: readonly ChartEvent[],
    nodeIndex: number,
  ): boolean {
    const eventIndex = slideEvent.nodeEventIndices[nodeIndex] ?? -1;
    const event = events[eventIndex];
    return event?.eventType === "note" && event.note.baseType === "hidden";
  }

  private areSlideNodesHidden(
    slideEvent: SlideChartEvent,
    events: readonly ChartEvent[],
    startNodeIndex: number,
    endNodeIndex: number,
  ): boolean {
    for (let nodeIndex = startNodeIndex; nodeIndex <= endNodeIndex; nodeIndex += 1) {
      if (!this.isSlideNodeHidden(slideEvent, events, nodeIndex)) {
        return false;
      }
    }
    return true;
  }

  private resolveSlideConnectionEndpointState(connection: SlideConnection): SlideConnectionEndpointState {
    return {
      from: this.noteLifecycleStates.get(connection.fromEventIndex) ?? null,
      to: this.noteLifecycleStates.get(connection.toEventIndex) ?? null,
    };
  }

  private slideConnectionRenderAlpha(
    connection: SlideConnection,
  ): number {
    const endpointState = this.resolveSlideConnectionEndpointState(connection);
    const runtimeEndpointKnown = endpointState.from !== null || endpointState.to !== null;
    void runtimeEndpointKnown;
    return connection.slideType === "hidden" ? 0.5 : 1;
  }

  private frameRawAt(elapsedMs: number, startMs: number, tgId: number, tgPos: number): number {
    if (tgId < 0) {
      return ((elapsedMs - startMs) * SIMULATOR_TIMING_FPS) / 1000;
    }
    const nowPos = this.timingGroupPosAt(tgId, elapsedMs);
    return (nowPos * SIMULATOR_TIMING_FPS) / 1000
      + this.settings.noteSpeedFrames
      - (tgPos * SIMULATOR_TIMING_FPS) / 1000;
  }

  private timingGroupPosAt(tgId: number, elapsedMs: number): number {
    const group = this.timingGroups[tgId];
    if (!group) {
      return elapsedMs;
    }
    const x = elapsedMs - this.settings.offsetMs;
    return axisAtMs(group, x);
  }

  private buildBpmFlashCycleSegments(events: readonly ChartEvent[]): void {
    const isPositiveBpm = (value: number): boolean => Number.isFinite(value) && value > 0;
    let initialBpm = 120;
    for (const event of events) {
      if ((event.eventType === "music_start" || event.eventType === "bpm") && isPositiveBpm(event.bpm)) {
        initialBpm = event.bpm;
        break;
      }
    }

    const rawChanges: { startMs: number; bpm: number; order: number }[] = [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.eventType !== "bpm" || !isPositiveBpm(event.bpm)) {
        continue;
      }
      rawChanges.push({
        startMs: event.startMs,
        bpm: event.bpm,
        order: index,
      });
    }

    rawChanges.sort((left, right) => {
      if (Math.abs(left.startMs - right.startMs) > 1e-9) {
        return left.startMs - right.startMs;
      }
      return left.order - right.order;
    });

    const dedupedChanges: { startMs: number; bpm: number }[] = [];
    for (const change of rawChanges) {
      const last = dedupedChanges[dedupedChanges.length - 1];
      if (last && Math.abs(last.startMs - change.startMs) <= 1e-9) {
        last.bpm = change.bpm;
        continue;
      }
      dedupedChanges.push({ startMs: change.startMs, bpm: change.bpm });
    }

    let bpmAtZero = initialBpm;
    for (const change of dedupedChanges) {
      if (change.startMs > 0) {
        break;
      }
      bpmAtZero = change.bpm;
    }

    const segments: BpmFlashCycleSegment[] = [{
      startMs: 0,
      bpm: bpmAtZero,
      cyclesAtStart: 0,
    }];
    let lastStartMs = 0;
    let lastBpm = bpmAtZero;
    let cyclesAtStart = 0;

    for (const change of dedupedChanges) {
      if (change.startMs <= 0) {
        continue;
      }
      const dt = Math.max(0, change.startMs - lastStartMs);
      cyclesAtStart += (dt * lastBpm) / 120000;
      segments.push({
        startMs: change.startMs,
        bpm: change.bpm,
        cyclesAtStart,
      });
      lastStartMs = change.startMs;
      lastBpm = change.bpm;
    }

    this.bpmFlashCycleSegments = segments;
  }

  private flashCycleAtElapsed(elapsedMs: number): number {
    const t = Math.max(0, elapsedMs);
    const segments = this.bpmFlashCycleSegments;
    if (segments.length === 0) {
      return t / 1000;
    }

    let low = 0;
    let high = segments.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (segments[mid].startMs <= t) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const segment = segments[Math.max(0, high)];
    const bpm = Number.isFinite(segment.bpm) && segment.bpm > 0 ? segment.bpm : 120;
    return segment.cyclesAtStart + ((t - segment.startMs) * bpm) / 120000;
  }

  private percentFromFrameRaw(frameRaw: number): number {
    return calculatePercentFromFrameRaw(frameRaw, this.settings.noteSpeedFrames);
  }

  private laneAtConnectionProgress(
    fromLane: number,
    toLane: number,
    connection: SlideConnection,
    elapsedMs: number,
  ): number {
    const denominator = connection.toEvent.hitMs - connection.fromEvent.hitMs;
    if (Math.abs(denominator) < 1e-6) {
      return toLane;
    }
    const progress = Math.max(0, Math.min(1, (elapsedMs - connection.fromEvent.hitMs) / denominator));
    return fromLane + (toLane - fromLane) * progress;
  }

  private resolveActiveSlideBottomMarkers(
    activeSlides: readonly ActiveSlide[],
    elapsedMs: number,
  ): SlideBottomMarker[] {
    const markers: SlideBottomMarker[] = [];
    for (const slide of activeSlides) {
      const marker = slide.marker;
      if (!marker) {
        continue;
      }
      const connection = this.resolveActiveSlideMarkerConnection(slide, marker.sourceEventIndex, elapsedMs);
      if (!connection) {
        continue;
      }
      markers.push({
        lane: this.laneAtConnectionProgress(
          connection.fromEvent.lane,
          connection.toEvent.lane,
          connection,
          elapsedMs,
        ),
        renderLane: this.laneAtConnectionElapsed(connection, elapsedMs),
        slideChainEventIndex: slide.eventIndex,
        sourceBaseType: marker.sourceBaseType,
        sourceIsHead: marker.sourceIsHead,
        sourceRhythmWidth: marker.sourceRhythmWidth,
        slideRhythmWidth: connection.slideRhythmWidth,
      });
    }
    return markers;
  }

  private resolveActiveSlideMarkerConnection(
    slide: ActiveSlide,
    sourceEventIndex: number,
    elapsedMs: number,
  ): SlideConnection | null {
    const sourceConnection = this.slideConnectionByFromEventIndex.get(sourceEventIndex) ?? null;
    if (
      sourceConnection
      && sourceConnection.slideChainEventIndex === slide.eventIndex
      && elapsedMs < sourceConnection.toEvent.hitMs - 1e-6
    ) {
      return sourceConnection;
    }

    for (const connection of this.slideConnections) {
      if (connection.slideChainEventIndex !== slide.eventIndex) {
        continue;
      }
      if (
        elapsedMs >= connection.fromEvent.hitMs - 1e-6
        && elapsedMs < connection.toEvent.hitMs - 1e-6
      ) {
        return connection;
      }
    }
    return null;
  }

  private isSlideConnectionFrontConsumed(connection: SlideConnection): boolean {
    return this.noteLifecycleStates.get(connection.fromEventIndex)?.consumed === true;
  }

  private isSlideConnectionBackConsumed(connection: SlideConnection): boolean {
    return this.noteLifecycleStates.get(connection.toEventIndex)?.consumed === true;
  }

  private laneAtConnectionElapsed(
    connection: SlideConnection,
    elapsedMs: number,
  ): number {
    return this.laneAtConnectionProgress(connection.fromAnchorLane, connection.toAnchorLane, connection, elapsedMs);
  }

  private drawSlideBottomMarkers(
    slideBottomMarkers: readonly SlideBottomMarker[],
    elapsedMs: number,
    fallbackG: Graphics,
  ): void {
    if (slideBottomMarkers.length === 0) {
      return;
    }
    const currentFlashCycle = this.flashCycleAtElapsed(elapsedMs);

    for (const marker of slideBottomMarkers) {
      const lane = marker.lane;
      const markerRhythmWidth = Math.max(
        1,
        marker.slideRhythmWidth,
        marker.sourceRhythmWidth,
      );
      const markerRenderLane = marker.renderLane;
      const x = this.laneXAtPercent(markerRenderLane, 1);
      const y = this.stageBottomY();
      const markerIsMiddle = !marker.sourceIsHead;

      const markerTex = this.assets
        ? resolveSlideBottomMarkerTexture(
          this.assets,
          lane,
          marker.sourceBaseType,
          marker.sourceIsHead,
          markerRhythmWidth,
          markerRenderLane,
        )
        : null;
      const flashTex = this.assets && markerIsMiddle
        ? resolveSlideBottomMarkerFlashTexture(
          this.assets,
          lane,
          marker.sourceIsHead,
          markerRhythmWidth,
          markerRenderLane,
        )
        : null;
      if (markerTex && this.noteSpriteLayer) {
        if (flashTex) {
          let cycleBase = this.slideFlashFirstTriggerCycleByChainEventIndex.get(marker.slideChainEventIndex);
          if (cycleBase === undefined) {
            cycleBase = currentFlashCycle;
            this.slideFlashFirstTriggerCycleByChainEventIndex.set(marker.slideChainEventIndex, cycleBase);
          }
          const flashProgressRaw = currentFlashCycle - cycleBase;
          const flashProgress = ((flashProgressRaw % 1) + 1) % 1;
          const flashAlphaRaw = flashProgress < 0.5
            ? flashProgress * 2
            : (1 - flashProgress) * 2;
          const flashAlpha = flashAlphaRaw * 0.5;
          const flashSprite = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(
            flashSprite,
            flashTex,
            x,
            y,
            this.noteSpriteScale(this.settings.noteSize),
            flashAlpha,
          );
        }
        const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
        this.applySprite(s, markerTex, x, y, this.noteSpriteScale(this.settings.noteSize), 1);
      } else {
        const fallbackRadius = Math.max(5, this.settings.noteSize * 39.76);
        fallbackG.fill({ color: 0x9be9b6, alpha: 1 });
        fallbackG.ellipse(x, y, fallbackRadius * markerRhythmWidth, fallbackRadius);
        fallbackG.fill();
      }
    }
  }

  private drawDirectional(
    n: ActiveNote,
    noteScale: number,
    percent: number,
    y: number,
    lineG: Graphics,
  ): void {
    if (!isDirectionalNote(n.note)) {
      return;
    }

    const originalLeft = n.note.baseType === "directional_flick_left";
    const width = Math.max(1, Math.round(n.note.directionalWidth));
    const step = originalLeft ? -1 : 1;
    const textureFamilyLeft = this.settings.mirror ? !originalLeft : originalLeft;

    let edgeLane = Math.round(n.lane);
    for (let i = 0; i < width; i += 1) {
      const lane = Math.round(n.lane) + step * i;
      edgeLane = lane;

      const x = this.laneXAtPercent(lane, percent);
      if (this.assets && this.noteSpriteLayer) {
        const texLane = this.textureLaneIndex(lane);
        const tex = resolveDirectionalLaneTexture(this.assets, textureFamilyLeft, texLane);
        if (tex) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, tex, x, y, this.noteSpriteScale(noteScale), 1);
          continue;
        }
      }

      const fs = Math.max(6, noteScale * 28.4);
      lineG.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 1 });
      lineG.moveTo(x - fs * 0.6, y);
      lineG.lineTo(x + fs * 0.6, y);
    }

    const renderLeft = this.settings.mirror ? !originalLeft : originalLeft;
    const arrowTex = this.assets
      ? resolveDirectionalArrowTexture(this.assets, renderLeft)
      : null;
    const edgeX = this.laneXAtPercent(edgeLane, percent);
    const flickFps = Math.max(1, Math.floor(this.settings.fps / 3));
    const flickProgress = this.flickFrame / flickFps;
    const flickWidth = this.assets?.rhythm.noteFlick[this.textureLaneIndex(n.lane)]?.width ?? 96;
    const flickShift = flickProgress * (noteScale * flickWidth * 0.213);
    const arrowOffset = noteScale * 117.15;
    const arrowX = renderLeft
      ? edgeX - arrowOffset - flickShift
      : edgeX + arrowOffset + flickShift;
    const arrowY = y + noteScale * 3.55;

    if (arrowTex && this.noteSpriteLayer) {
      const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
      this.applySprite(s, arrowTex, arrowX, arrowY, this.noteSpriteScale(noteScale), 1);
    } else {
      const headOffset = Math.max(8, noteScale * 19.88);
      lineG.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 1 });
      if (renderLeft) {
        lineG.moveTo(edgeX - headOffset * 1.1, arrowY);
        lineG.lineTo(edgeX - headOffset * 1.7, arrowY);
      } else {
        lineG.moveTo(edgeX + headOffset * 1.1, arrowY);
        lineG.lineTo(edgeX + headOffset * 1.7, arrowY);
      }
    }
  }

  private spawnParticleEmittersForTrigger(trigger: ParticleTriggerEvent): void {
    const note = trigger.note;
    const particleLane = renderCenterLaneForNote(trigger.lane, note);
    const lane = isDirectionalNote(note) ? trigger.lane : particleLane;
    const laneEffectWidth = isDirectionalNote(note) ? 1 : rhythmWidthForNote(note);
    const startMs = trigger.elapsedMs;
    this.startOfficialLaneEffect(trigger.lane, startMs, false);

    const pack = this.assets?.particleEffects;
    if (!pack) {
      return;
    }
    const rawDirectionalLeft = note.baseType === "directional_flick_left";
    const rawDirectionalRight = note.baseType === "directional_flick_right";
    const directionalLeft = this.settings.mirror ? rawDirectionalRight : rawDirectionalLeft;
    const directionalRight = this.settings.mirror ? rawDirectionalLeft : rawDirectionalRight;
    const isDirectional = directionalLeft || directionalRight;
    const isFlickHit = note.baseType === "flick";
    const isTapLike = !isDirectional && !isFlickHit;
    const directionalWidth = Math.max(1, Math.round(note.directionalWidth));
    const directionalAdvanceScale = directionalWidth / 2;
    const shouldDoubleDirectionalLinear = directionalWidth >= DIRECTIONAL_LINEAR_DOUBLE_PLAY_WIDTH_THRESHOLD;

    if (isTapLike) {
      this.startSpriteParticleEffect("tapNoteLinear", lane, startMs);
      this.startHitTrapezoidEffect(lane, startMs, laneEffectWidth);
      this.startHitRoundedRectangleEffect("tapNoteLinear", lane, startMs, laneEffectWidth);
      this.enqueueParticleEmitterBySlot(
        "tapNoteCircular",
        lane,
        startMs,
        600,
        false,
        "circular",
        undefined,
        1,
        HIT_CIRCLE_LAYOUT_SCALE_NON_DIRECTIONAL,
      );
    } else if (isFlickHit) {
      this.startSpriteParticleEffect("flickNoteLinear", lane, startMs);
      this.startHitRoundedRectangleEffect("flickNoteLinear", lane, startMs, laneEffectWidth);
      this.enqueueParticleEmitterBySlot(
        "flickNoteCircular",
        lane,
        startMs,
        600,
        false,
        "circular",
        undefined,
        1,
        HIT_CIRCLE_LAYOUT_SCALE_NON_DIRECTIONAL,
      );
    } else if (directionalLeft) {
      this.enqueueParticleEmitterBySlot(
        "directionalFlickNoteLeftLinear",
        lane,
        startMs,
        400,
        false,
        "directionalLinearLeft",
        "directionalFlickNoteLeftLinearFallback",
        directionalAdvanceScale,
      );
      if (shouldDoubleDirectionalLinear) {
        this.enqueueParticleEmitterBySlot(
          "directionalFlickNoteLeftLinear",
          lane,
          startMs + DIRECTIONAL_LINEAR_DOUBLE_PLAY_DELAY_MS,
          400,
          false,
          "directionalLinearLeft",
          "directionalFlickNoteLeftLinearFallback",
          directionalAdvanceScale,
        );
      }
      this.enqueueParticleEmitterBySlot(
        "directionalFlickNoteLeftCircular",
        lane,
        startMs,
        600,
        false,
        "circular",
        "directionalFlickNoteLeftCircularFallback",
        1,
        HIT_CIRCLE_LAYOUT_SCALE_DIRECTIONAL,
      );
    } else if (directionalRight) {
      this.enqueueParticleEmitterBySlot(
        "directionalFlickNoteRightLinear",
        lane,
        startMs,
        400,
        false,
        "directionalLinearRight",
        "directionalFlickNoteRightLinearFallback",
        directionalAdvanceScale,
      );
      if (shouldDoubleDirectionalLinear) {
        this.enqueueParticleEmitterBySlot(
          "directionalFlickNoteRightLinear",
          lane,
          startMs + DIRECTIONAL_LINEAR_DOUBLE_PLAY_DELAY_MS,
          400,
          false,
          "directionalLinearRight",
          "directionalFlickNoteRightLinearFallback",
          directionalAdvanceScale,
        );
      }
      this.enqueueParticleEmitterBySlot(
        "directionalFlickNoteRightCircular",
        lane,
        startMs,
        600,
        false,
        "circular",
        "directionalFlickNoteRightCircularFallback",
        1,
        HIT_CIRCLE_LAYOUT_SCALE_DIRECTIONAL,
      );
    }

    this.startSpriteParticleEffect("slot", particleLane, startMs);

    if (isHoldRenderableSlideNote(note)) {
      this.activateHoldEffect(trigger);
    }
  }

  private enqueueParticleEmitterBySlot(
    slotKey: string,
    lane: number,
    startMs: number,
    durationMs: number,
    loop: boolean,
    preset: ParticleLayoutPreset,
    fallbackSlotKey?: string,
    advanceScale = 1,
    layoutScale = 1,
    seedBaseOverride?: number,
    laneWidth = 1,
    visualLayer?: ParticleVisualLayer,
  ): ActiveParticleEmitter | null {
    const pack = this.assets?.particleEffects;
    if (!pack) {
      return null;
    }

    const effect = this.resolveParticleEffectBySlot(pack, slotKey)
      ?? (fallbackSlotKey ? this.resolveParticleEffectBySlot(pack, fallbackSlotKey) : null);
    if (!effect) {
      return null;
    }

    const seedBase = typeof seedBaseOverride === "number" && Number.isFinite(seedBaseOverride) && seedBaseOverride > 0
      ? seedBaseOverride
      : this.allocateEmitterSeed(slotKey, startMs, lane);
    const emitter: ActiveParticleEmitter = {
      effect,
      lane,
      startMs,
      durationMs: Math.max(1, durationMs),
      loop,
      preset,
      seedBase,
      advanceScale: Number.isFinite(advanceScale) && advanceScale > 0 ? advanceScale : 1,
      layoutScale: Number.isFinite(layoutScale) && layoutScale > 0 ? layoutScale : 1,
      laneWidth: Number.isFinite(laneWidth) && laneWidth > 0 ? laneWidth : 1,
      visualLayer,
    };
    this.activeParticleEmitters.push(emitter);
    return emitter;
  }

  private startSpriteParticleEffect(slotKey: "tapNoteLinear" | "flickNoteLinear" | "slot", lane: number, startMs: number): void {
    const preset: ParticleLayoutPreset = slotKey === "slot" ? "slot" : "linear";
    const durationMs = slotKey === "slot" ? SLOT_EFFECT_DURATION_MS : 400;
    this.enqueueParticleEmitterBySlot(
      slotKey,
      lane,
      startMs,
      durationMs,
      false,
      preset,
      undefined,
      1,
      1,
      undefined,
      1,
      "spriteParticles",
    );
  }

  private startHitTrapezoidEffect(lane: number, startMs: number, laneWidth: number): void {
    const effectLaneWidth = Math.max(1, Number.isFinite(laneWidth) ? laneWidth : 1);
    this.enqueueParticleEmitterBySlot(
      "tapNoteLinear",
      lane,
      startMs,
      400,
      false,
      "linear",
      undefined,
      1,
      1,
      undefined,
      effectLaneWidth,
      "trapezoid",
    );
  }

  private startHitRoundedRectangleEffect(slotKey: "tapNoteLinear" | "flickNoteLinear", lane: number, startMs: number, laneWidth: number): void {
    const effectLaneWidth = Math.max(1, Number.isFinite(laneWidth) ? laneWidth : 1);
    this.enqueueParticleEmitterBySlot(
      slotKey,
      lane,
      startMs,
      400,
      false,
      "linear",
      undefined,
      1,
      1,
      undefined,
      effectLaneWidth,
      "roundedRect",
    );
  }

  private startOfficialLaneEffect(lane: number, startMs: number, hold: boolean): void {
    if (!this.settings.effectEnable) {
      return;
    }
    const normalizedLane = Math.max(0, Math.min(6, Math.round(Number.isFinite(lane) ? lane : 0)));
    const visualLane = this.visualLaneIndex(normalizedLane);
    if (hold) {
      const active = this.activeEmptyTouchLaneEffect;
      if (
        active
        && Math.abs(active.lane - normalizedLane) <= 1e-6
      ) {
        return;
      }
      if (active) {
        this.releaseEmptyTouchLaneEffect(startMs);
      }
      this.activeEmptyTouchLaneEffect = {
        lane: normalizedLane,
      };
    }
    this.activeLaneEffects[visualLane] = {
      lane: normalizedLane,
      visualLane,
      state: "idle",
      startMs,
      fadeStartMs: hold ? null : startMs + NOTE_LANE_EFFECT_OFF_RESERVE_MS,
    };
  }

  private releaseEmptyTouchLaneEffect(elapsedMs: number): void {
    const active = this.activeEmptyTouchLaneEffect;
    if (!active) {
      return;
    }
    const visualLane = this.visualLaneIndex(active.lane);
    const laneEffect = this.activeLaneEffects[visualLane];
    if (laneEffect) {
      laneEffect.state = "fadeOut";
      laneEffect.fadeStartMs = elapsedMs;
    }
    this.activeEmptyTouchLaneEffect = null;
  }

  private clearLaneEffects(): void {
    this.activeLaneEffects = new Array(7).fill(null);
    this.activeEmptyTouchLaneEffect = null;
  }

  private visualLaneIndex(lane: number): number {
    const normalizedLane = Math.max(0, Math.min(6, Math.round(Number.isFinite(lane) ? lane : 0)));
    return this.settings.mirror ? 6 - normalizedLane : normalizedLane;
  }

  private laneXAtVisualPercentRaw(visualLane: number, percent: number): number {
    const geometry = this.stageGeometry();
    const centeredLane = visualLane - 3;
    return geometry.viewportWidth * 0.5 + centeredLane * this.stageLaneWidth() * percent;
  }

  private laneEffectTextureIndex(visualLane: number): number {
    const distanceFromCenter = Math.abs(Math.max(0, Math.min(6, Math.round(visualLane))) - 3);
    switch (distanceFromCenter) {
      case 3:
        return 1;
      case 2:
        return 2;
      case 1:
        return 3;
      default:
        return 4;
    }
  }

  private drawOfficialLaneEffects(elapsedMs: number): void {
    if (!this.settings.effectEnable || !this.assets) {
      this.clearLaneEffects();
      return;
    }
    const geometry = this.stageGeometry();
    const targetHeight = this.stageLaneWidth() * NOTE_LANE_EFFECT_HEIGHT_TO_LANE_WIDTH_RATIO;

    for (let visualLane = 0; visualLane < this.activeLaneEffects.length; visualLane += 1) {
      const effect = this.activeLaneEffects[visualLane];
      if (!effect) {
        continue;
      }
      if (elapsedMs < effect.startMs) {
        continue;
      }
      if (effect.state === "idle" && effect.fadeStartMs !== null && elapsedMs >= effect.fadeStartMs) {
        effect.state = "fadeOut";
      }

      let alpha = 1;
      let animationScale = 1;
      if (effect.state === "fadeOut") {
        const fadeStartMs = effect.fadeStartMs ?? elapsedMs;
        const phase = clamp01((elapsedMs - fadeStartMs) / NOTE_LANE_EFFECT_FADE_DURATION_MS);
        if (phase >= 1) {
          this.activeLaneEffects[visualLane] = null;
          continue;
        }
        animationScale = lerpNumber(1, 0.7, phase);
        alpha = 1 - phase;
      }

      const texture = this.assets.hud.laneEffects[this.laneEffectTextureIndex(effect.visualLane)] ?? null;
      if (!texture) {
        continue;
      }
      const textureIndex = this.laneEffectTextureIndex(effect.visualLane);
      const sprite = this.allocEffectSprite();
      if (!sprite) {
        return;
      }
      const baseScale = targetHeight / Math.max(1, texture.height);
      const anchor = NOTE_LANE_EFFECT_ANCHOR_BY_TEXTURE_INDEX[textureIndex] ?? { x: 0.5, y: 1 };
      const flipX = effect.visualLane > 3;
      sprite.texture = texture;
      sprite.anchor.set(anchor.x, anchor.y);
      sprite.x = this.laneXAtVisualPercentRaw(effect.visualLane, 1);
      sprite.y = geometry.stageBottom;
      sprite.alpha = alpha;
      sprite.rotation = 0;
      sprite.scale.set(
        baseScale * animationScale * (flipX ? -1 : 1),
        baseScale * animationScale,
      );
    }
  }

  private resolveParticleEffectBySlot(
    pack: NonNullable<NoteSkinTextureBundle["particleEffects"]>,
    slotKey: string,
  ): ParticleEffectDefinition | null {
    const effectName = pack.slotToEffectName[slotKey];
    if (!effectName) {
      return null;
    }
    return pack.effectsByName.get(effectName) ?? null;
  }

  private findFirstSlideConnectionFromChain(slideChainEventIndex: number): number | null {
    for (const connection of this.slideConnections) {
      if (connection.slideChainEventIndex === slideChainEventIndex && connection.mode === "normal") {
        return connection.fromEventIndex;
      }
    }
    return null;
  }

  private activateHoldEffect(trigger: ParticleTriggerEvent): void {
    const slideChainEventIndex = this.eventSlideChainIndexByEventIndex.get(trigger.eventIndex) ?? -1;
    if (slideChainEventIndex < 0) {
      return;
    }
    if (this.activeHoldEffects.has(slideChainEventIndex)) {
      return;
    }
    const triggerConnection = this.slideConnectionByFromEventIndex.get(trigger.eventIndex) ?? null;
    const fromEventIndex = triggerConnection?.mode === "normal"
      ? trigger.eventIndex
      : this.findFirstSlideConnectionFromChain(slideChainEventIndex);
    if (fromEventIndex === null) {
      return;
    }
    const pack = this.assets?.particleEffects;
    if (!pack) {
      return;
    }
    const linearEmitter = this.spawnHoldEmitterBySlot(
      pack,
      "holdLinear",
      trigger.lane,
      trigger.elapsedMs,
      "holdLinear",
    );
    const circularEmitter = this.spawnHoldEmitterBySlot(
      pack,
      "holdCircular",
      trigger.lane,
      trigger.elapsedMs,
      "holdCircular",
    );
    if (!linearEmitter && !circularEmitter) {
      return;
    }

    this.activeHoldEffects.set(slideChainEventIndex, {
      slideChainEventIndex,
      currentFromEventIndex: fromEventIndex,
      linearEmitter,
      circularEmitter,
    });
  }

  private spawnHoldEmitterBySlot(
    pack: NonNullable<NoteSkinTextureBundle["particleEffects"]>,
    slotKey: string,
    lane: number,
    startMs: number,
    preset: ParticleLayoutPreset,
  ): ActiveParticleEmitter | null {
    const effect = this.resolveParticleEffectBySlot(pack, slotKey);
    if (!effect) {
      return null;
    }
    const emitter: ActiveParticleEmitter = {
      effect,
      lane,
      startMs,
      durationMs: 1000,
      loop: true,
      preset,
      seedBase: this.allocateEmitterSeed(slotKey, startMs, lane),
      advanceScale: 1,
      layoutScale: 1,
      laneWidth: 1,
    };
    this.activeParticleEmitters.push(emitter);
    return emitter;
  }

  private allocateEmitterSeed(slotKey: string, startMs: number, lane: number): number {
    const slotHash = hashString32(slotKey);
    const serialHash = mixUint32(this.particleEmitterSeedSerial++);
    const laneHash = mixUint32(Math.round(lane * 1024));
    const timeHash = mixUint32(Math.round(startMs * 1000));
    return mixUint32(slotHash ^ serialHash ^ laneHash ^ timeHash);
  }

  private removeEmitterInstance(emitter: ActiveParticleEmitter | null): void {
    if (!emitter) {
      return;
    }
    const index = this.activeParticleEmitters.indexOf(emitter);
    if (index >= 0) {
      this.activeParticleEmitters.splice(index, 1);
    }
  }

  private destroyHoldEffectEmitters(hold: ActiveHoldEffect): void {
    this.removeEmitterInstance(hold.linearEmitter);
    this.removeEmitterInstance(hold.circularEmitter);
    hold.linearEmitter = null;
    hold.circularEmitter = null;
  }

  private resolveActiveHoldConnection(
    hold: ActiveHoldEffect,
    elapsedMs: number,
  ): SlideConnection | null {
    let connection = this.slideConnectionByFromEventIndex.get(hold.currentFromEventIndex) ?? null;
    while (connection) {
      if (connection.mode === "normal" && elapsedMs <= connection.toEvent.hitMs + 1e-6) {
        break;
      }
      hold.currentFromEventIndex = connection.toEventIndex;
      connection = this.slideConnectionByFromEventIndex.get(hold.currentFromEventIndex) ?? null;
    }
    return connection;
  }

  private holdLaneAtConnection(connection: SlideConnection, elapsedMs: number): number {
    return this.laneAtConnectionElapsed(connection, elapsedMs);
  }

  private updateHoldParticleEmitters(elapsedMs: number): void {
    if (this.activeHoldEffects.size <= 0) {
      return;
    }

    for (const [slideChainEventIndex, hold] of this.activeHoldEffects) {
      const connection = this.resolveActiveHoldConnection(hold, elapsedMs);
      if (!connection) {
        this.destroyHoldEffectEmitters(hold);
        this.activeHoldEffects.delete(slideChainEventIndex);
        continue;
      }

      const lane = this.holdLaneAtConnection(connection, elapsedMs);
      if (hold.linearEmitter) {
        hold.linearEmitter.lane = lane;
      }
      if (hold.circularEmitter) {
        hold.circularEmitter.lane = lane;
      }
    }
  }

  private drawParticleEffects(elapsedMs: number): void {
    const pack = this.assets?.particleEffects;
    if (!pack) {
      this.activeParticleEmitters = [];
      this.activeHoldEffects.clear();
      return;
    }
    const fallbackG = this.fallbackNoteG!;
    const drawContext = this.particleEmitterDrawContext();
    this.updateHoldParticleEmitters(elapsedMs);

    for (let i = this.activeParticleEmitters.length - 1; i >= 0; i -= 1) {
      const emitter = this.activeParticleEmitters[i];
      const elapsed = elapsedMs - emitter.startMs;
      if (elapsed < 0) {
        continue;
      }

      const lifeMs = Math.max(1, emitter.durationMs * emitter.effect.maxLife);
      if (!emitter.loop && elapsed > lifeMs) {
        this.activeParticleEmitters.splice(i, 1);
        continue;
      }

      this.drawParticleEmitterAtElapsed(drawContext, pack, emitter, elapsed, fallbackG);
    }

  }

  private drawParticleEmitterAtElapsed(
    drawContext: ParticleEmitterDrawContext,
    pack: NonNullable<NoteSkinTextureBundle["particleEffects"]>,
    emitter: ActiveParticleEmitter,
    elapsedMs: number,
    fallbackG: Graphics,
  ): void {
    if (elapsedMs < 0) {
      return;
    }

    const durationMs = Math.max(1, emitter.durationMs);
    if (!emitter.loop) {
      const unitElapsed = emitter.preset === "laneHold"
        ? 1
        : (elapsedMs / durationMs);
      drawParticleEmitter(drawContext, pack, emitter, unitElapsed, fallbackG);
      return;
    }

    const phase = ((elapsedMs / durationMs) % 1 + 1) % 1;
    const overlapCycles = Math.max(1, Math.ceil(emitter.effect.maxLife));
    for (let cycleOffset = 0; cycleOffset < overlapCycles; cycleOffset += 1) {
      drawParticleEmitter(drawContext, pack, emitter, phase + cycleOffset, fallbackG);
    }
  }

  private particleEmitterDrawContext(): ParticleEmitterDrawContext {
    const geometry = this.stageGeometry();
    const stageWToH = (geometry.stageWidth / 6) / Math.max(1e-6, geometry.stageHeight);
    const viewportWidth = this.viewportWidth();
    const viewportHeight = this.viewportHeight();
    return {
      settings: this.settings,
      viewportWidth,
      viewportHeight,
      stageWToH,
      laneXAtPercentRaw: (lane, percent) => this.laneXAtPercentRaw(lane, percent),
      laneYAtPercentRaw: (percent) => this.laneYAtPercentRaw(percent),
      allocEffectMesh: (texture) => this.allocEffectMesh(texture),
    };
  }

  private connectorHalfWidthAtPercent(percent: number, laneWidth = 1): number {
    const laneSpacing = this.stageLaneWidth() * percent;
    const widthScale = Math.max(1, Number.isFinite(laneWidth) ? laneWidth : 1);
    return Math.max(1, laneSpacing * this.settings.noteSize * LONG_NOTE_LINE_HALF_WIDTH_TO_LANE_WIDTH * widthScale);
  }

  private noteSpriteScale(noteScale: number): number {
    const widthScale = (this.stageLaneWidth() * NOTE_WIDTH_TO_LANE_WIDTH_RATIO) / NOTE_BASE_TEXTURE_WIDTH;
    const scale = noteScale * widthScale;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  private laneXAtPercentRaw(lane: number, percent: number): number {
    const geometry = this.stageGeometry();
    const logicalLane = this.settings.mirror ? 6 - lane : lane;
    const centeredLane = logicalLane - 3;
    return geometry.viewportWidth * 0.5 + centeredLane * this.stageLaneWidth() * percent;
  }

  private laneXAtPercent(lane: number, percent: number): number {
    return this.laneXAtPercentRaw(lane, percent);
  }

  private textureLaneIndex(lane: number): number {
    return Math.max(1, Math.min(7, Math.round(lane) + 1));
  }

  private laneYAtPercentRaw(percent: number): number {
    const geometry = this.stageGeometry();
    return geometry.stageTop + geometry.stageHeight * percent;
  }

  private laneYAtPercent(percent: number): number {
    return this.laneYAtPercentRaw(percent);
  }

  private viewportWidth(): number {
    return this.app?.screen.width ?? this.settings.windowX;
  }

  private viewportHeight(): number {
    return this.app?.screen.height ?? this.settings.windowY;
  }

  private viewportBottomPercent(): number {
    return this.stageGeometry().viewportBottomPercent;
  }

  private isPercentRenderable(percent: number): boolean {
    return Number.isFinite(percent) && percent <= this.viewportBottomPercent();
  }

  private stageGeometry(): StageGeometry {
    const viewportWidth = this.viewportWidth();
    const viewportHeight = this.viewportHeight();
    const cached = this.stageGeometryCache;
    if (
      cached
      && Math.abs(cached.viewportWidth - viewportWidth) < 1e-6
      && Math.abs(cached.viewportHeight - viewportHeight) < 1e-6
    ) {
      return cached;
    }

    const geometry = calculateStageGeometry(viewportWidth, viewportHeight);
    this.stageGeometryCache = geometry;
    return geometry;
  }

  private stageLaneWidth(): number {
    return this.stageGeometry().stageWidth / 6;
  }

  private stageFieldBgWidth(): number {
    return this.stageGeometry().stageWidth * FIELD_BG_WIDTH_TO_STAGE_WIDTH_RATIO;
  }

  private stageJudgeLineWidth(): number {
    return this.stageGeometry().stageWidth * JUDGE_LINE_WIDTH_TO_STAGE_WIDTH_RATIO;
  }

  private stageBottomY(): number {
    return this.stageGeometry().stageBottom;
  }

  private pickConnectionTexture(connection: SlideConnection): Texture | null {
    if (!this.assets) {
      return null;
    }
    const { longNoteLine, longNoteLine2 } = this.assets.lines;
    if (connection.useSpecialTexture) {
      return longNoteLine2 ?? longNoteLine ?? null;
    }
    return longNoteLine ?? longNoteLine2 ?? null;
  }

}
