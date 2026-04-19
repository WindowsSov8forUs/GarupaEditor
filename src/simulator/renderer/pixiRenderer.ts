import { Application, Color, Container, Graphics, PerspectiveMesh, Sprite, Text, TextStyle, Texture } from "pixi.js";
import {
  NoteSkinTextureBundle,
  resolveDirectionalArrowTexture,
  resolveDirectionalLaneTexture,
  resolveFlickTopTexture,
  resolveRhythmNoteTexture,
  resolveSlideBottomMarkerTexture,
} from "../engine/assets";
import { LEGACY_TIMING_FPS, legacyOffsetToMs } from "../engine/legacyMath";
import {
  ActiveNote,
  ChartEvent,
  HitEffectEvent,
  RuntimeStats,
  RuntimeNoteSemantic,
  SimulatorSettings,
  TimingGroupDef,
} from "../engine/types";

type MvRenderFrame =
  | {
      kind: "image";
      src: string;
      alpha: number;
      sourceWidth: number;
      sourceHeight: number;
    }
  | {
      kind: "video";
      video: HTMLVideoElement;
      alpha: number;
      sourceWidth: number;
      sourceHeight: number;
    };

interface ActiveEffect {
  kind: "normal" | "flick";
  lane: number;
  frame: number;
}

interface SlideConnection {
  fromLane: number;
  toLane: number;
  fromHitMs: number;
  toHitMs: number;
  fromStartMs: number;
  toStartMs: number;
  fromTgId: number;
  toTgId: number;
  fromTgPos: number;
  toTgPos: number;
  useSpecialTexture: boolean;
}

interface StageGeometry {
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  stageBottom: number;
  stageTop: number;
  stageJudge: number;
}

function isDirectionalNote(note: RuntimeNoteSemantic): boolean {
  return note.baseType === "directional_flick_left" || note.baseType === "directional_flick_right";
}

function shouldRenderFlickTop(note: RuntimeNoteSemantic): boolean {
  return note.baseType === "flick" && (note.slideRole === "none" || note.slideRole === "end");
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
const NOTE_SCALE_MIN = 0.028169014084507;
const NOTE_BASE_TEXTURE_WIDTH = 308;
const NOTE_WIDTH_TO_LANE_WIDTH_RATIO = 1.35;
const FIELD_BG_TO_JUDGE_WIDTH_RATIO = 1.35 / 0.875;
const SIMULTANEOUS_LINE_HEIGHT_TO_NOTE_WIDTH = 27 / 308;
const STAGE_HEIGHT_TO_WIDTH_RATIO = 634141 / 940938;
const STAGE_JUDGE_TO_HEIGHT_RATIO = 338256 / 877231;
const STAGE_TO_WINDOW_RATIO = 462 / 667;
const FIELD_BG_WIDTH_TO_STAGE_WIDTH_RATIO = (7 / 8) / STAGE_TO_WINDOW_RATIO;
const JUDGE_LINE_WIDTH_TO_STAGE_WIDTH_RATIO = 1.35 / STAGE_TO_WINDOW_RATIO;

export class PixiRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private liveBgSprite: Sprite | null = null;
  private laneBgSprite: Sprite | null = null;
  private lanesG: Graphics | null = null;
  private judgeLineSprite: Sprite | null = null;
  private linesG: Graphics | null = null;
  private simultaneousLineLayer: Container | null = null;
  private fallbackNoteG: Graphics | null = null;
  private hudG: Graphics | null = null;
  private hudText: Text | null = null;
  private mvSprite: Sprite | null = null;
  private slideLineLayer: Container | null = null;
  private noteSpriteLayer: Container | null = null;
  private effectSpriteLayer: Container | null = null;

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
  private activeEffects: ActiveEffect[] = [];
  private slideConnections: SlideConnection[] = [];
  private timingGroups: readonly TimingGroupDef[] = [];
  private lanesDirty = true;
  private flickFrame = 0;
  private frameTick = 0;

  private mvTextureCache = new Map<string, Texture>();
  private mvTextureOrder: string[] = [];
  private mvCurrentPath = "";
  private mvVideoKeyByElement = new WeakMap<HTMLVideoElement, string>();
  private mvVideoKeySerial = 0;
  private settings: SimulatorSettings;
  private assets: NoteSkinTextureBundle | null = null;
  private stageGeometryCache: StageGeometry | null = null;

  constructor(settings: SimulatorSettings) {
    this.settings = settings;
  }

  setAssets(bundle: NoteSkinTextureBundle | null): void {
    this.assets = bundle;
    this.lanesDirty = true;
  }

  setChartEvents(events: readonly ChartEvent[], timingGroups: readonly TimingGroupDef[] = []): void {
    const travelMs = Math.max(1, this.settings.noteSpeedSeconds * 1000);
    this.timingGroups = timingGroups;
    const rootIndexMemo = new Map<number, number>();
    const resolveRootIndex = (index: number): number => {
      const memoized = rootIndexMemo.get(index);
      if (memoized !== undefined) {
        return memoized;
      }
      const path: number[] = [];
      let cursor = index;
      while (cursor >= 0 && cursor < events.length) {
        path.push(cursor);
        const parentIndex = events[cursor]?.parentEventIndex ?? -1;
        if (parentIndex < 0 || parentIndex >= events.length) {
          break;
        }
        const cachedParentRoot = rootIndexMemo.get(parentIndex);
        if (cachedParentRoot !== undefined) {
          for (const p of path) {
            rootIndexMemo.set(p, cachedParentRoot);
          }
          return cachedParentRoot;
        }
        cursor = parentIndex;
      }
      const root = cursor >= 0 && cursor < events.length ? cursor : index;
      for (const p of path) {
        rootIndexMemo.set(p, root);
      }
      return root;
    };
    const hiddenRoots = new Set<number>();
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (!event) {
        continue;
      }
      if (event.eventType === "note" && event.note?.baseType === "hidden") {
        hiddenRoots.add(resolveRootIndex(index));
      }
    }

    const connections: SlideConnection[] = [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.parentEventIndex < 0 || event.parentEventIndex >= events.length) {
        continue;
      }
      const parent = events[event.parentEventIndex];
      if (!parent) {
        continue;
      }
      connections.push({
        fromLane: parent.lane,
        toLane: event.lane,
        fromHitMs: parent.startMs + travelMs,
        toHitMs: event.startMs + travelMs,
        fromStartMs: parent.startMs,
        toStartMs: event.startMs,
        fromTgId: parent.tgId,
        toTgId: event.tgId,
        fromTgPos: parent.tgPos,
        toTgPos: event.tgPos,
        useSpecialTexture: hiddenRoots.has(resolveRootIndex(index)),
      });
    }
    connections.sort((left, right) => {
      if (left.fromHitMs !== right.fromHitMs) {
        return left.fromHitMs - right.fromHitMs;
      }
      return left.toHitMs - right.toHitMs;
    });
    this.slideConnections = connections;
  }

  pushHitEffects(events: HitEffectEvent[]): void {
    if (!events.length) {
      return;
    }
    for (const e of events) {
      this.activeEffects.push({ kind: e.kind, lane: e.lane, frame: 0 });
    }
  }

  async mount(host: HTMLElement): Promise<void> {
    const initialWidth = Math.max(1, Math.floor(this.settings.windowX));
    const initialHeight = Math.max(1, Math.floor(this.settings.windowY));

    this.app = new Application();
    await this.app.init({
      width: initialWidth,
      height: initialHeight,
      background: new Color("#0b1020"),
      antialias: true,
      autoDensity: true,
      resolution: Math.max(1, window.devicePixelRatio || 1)
    });

    host.innerHTML = "";
    host.appendChild(this.app.canvas);

    this.root = new Container();
    this.app.stage.addChild(this.root);

    this.liveBgSprite = new Sprite();
    this.liveBgSprite.visible = false;
    this.mvSprite = new Sprite();
    this.mvSprite.visible = false;

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
    this.hudG = new Graphics();
    this.hudText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Segoe UI",
        fontSize: 16,
        fill: 0xffffff,
        stroke: { width: 2, color: 0x081226 }
      })
    });

    this.root.addChild(
      this.liveBgSprite,
      this.mvSprite,
      this.laneBgSprite,
      this.lanesG,
      this.judgeLineSprite,
      this.linesG,
      this.simultaneousLineLayer,
      this.slideLineLayer,
      this.effectSpriteLayer,
      this.noteSpriteLayer,
      this.fallbackNoteG,
      this.hudG,
      this.hudText
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

  render(notes: readonly ActiveNote[], stats: RuntimeStats, progress: number, mvFrame: MvRenderFrame | null): void {
    if (
      !this.lanesG
      || !this.linesG
      || !this.fallbackNoteG
      || !this.hudG
      || !this.hudText
      || !this.mvSprite
      || !this.liveBgSprite
    ) {
      return;
    }

    this.noteSpriteCursor = 0;
    this.slideLineMeshCursor = 0;
    this.simultaneousLineSpriteCursor = 0;
    this.effectSpriteCursor = 0;
    this.frameTick += 1;
    this.flickFrame = Math.floor((stats.elapsedMs * this.settings.fps) / 1000) % Math.max(1, Math.floor(this.settings.fps / 3));

    this.updateLiveBackgroundFrame();
    this.updateMvFrame(mvFrame);
    this.drawLanes();
    this.drawNotes(notes, stats.elapsedMs);
    this.drawEffects();
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
    this.drawHud(stats, progress);
  }

  destroy(): void {
    if (this.assets) {
      this.assets.destroy();
      this.assets = null;
    }
    for (const tex of this.mvTextureCache.values()) {
      tex.destroy(true);
    }
    this.mvTextureCache.clear();
    this.mvTextureOrder = [];
    this.activeEffects = [];
    this.slideConnections = [];
    this.noteSpritePool = [];
    this.slideLineMeshPool = [];
    this.simultaneousLineSpritePool = [];
    this.effectSpritePool = [];
    this.stageGeometryCache = null;
    this.noteSpritePrevUsed = 0;
    this.slideLineMeshPrevUsed = 0;
    this.simultaneousLineSpritePrevUsed = 0;
    this.effectSpritePrevUsed = 0;
    this.liveBgSprite = null;
    this.laneBgSprite = null;
    this.judgeLineSprite = null;
    this.simultaneousLineLayer = null;
    this.app?.destroy(true);
    this.app = null;
  }

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
    const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);

    this.liveBgSprite.texture = texture;
    this.liveBgSprite.visible = true;
    this.liveBgSprite.alpha = 1;
    this.liveBgSprite.anchor.set(0.5, 0.5);
    this.liveBgSprite.x = viewportWidth * 0.5;
    this.liveBgSprite.y = viewportHeight * 0.5;
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

    const path = mvFrame.kind === "image"
      ? `image:${browserPath(mvFrame.src)}`
      : this.resolveVideoTextureKey(mvFrame.video);
    this.mvSprite.visible = true;
    this.mvSprite.alpha = mvFrame.alpha;

    if (this.mvCurrentPath !== path) {
      let tex = this.mvTextureCache.get(path);
      if (!tex) {
        if (mvFrame.kind === "image") {
          tex = Texture.from(browserPath(mvFrame.src));
        } else {
          tex = Texture.from(mvFrame.video);
        }
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

  private resolveVideoTextureKey(video: HTMLVideoElement): string {
    const cached = this.mvVideoKeyByElement.get(video);
    if (cached) {
      return cached;
    }
    const next = `video:${this.mvVideoKeySerial += 1}`;
    this.mvVideoKeyByElement.set(video, next);
    return next;
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

  private drawNotes(notes: readonly ActiveNote[], elapsedMs: number): void {
    const lineG = this.linesG!;
    const fallbackG = this.fallbackNoteG!;
    lineG.clear();
    fallbackG.clear();
    const slideBottomLanes: number[] = [];
    this.drawSlideConnections(lineG, elapsedMs, slideBottomLanes);

    for (const n of notes) {
      if (!n.started) {
        continue;
      }
      if (!this.settings.displayHiddenSlideAmong && n.note.baseType === "hidden") {
        continue;
      }

      const color = colorForNote(n.note);
      const visual = this.resolveNoteVisualState(n, elapsedMs);
      const noteScale = visual.scale;
      const directional = isDirectionalNote(n.note);

      if (n.issameline !== null && Number.isFinite(n.issameline)) {
        const x2 = this.laneXAtPercent(n.issameline, visual.percent);
        const fromX = Math.min(visual.x, x2);
        const toX = Math.max(visual.x, x2);
        const width = toX - fromX;
        if (width > 1e-6) {
          const simultaneousLineTexture = this.assets?.lines.simultaneousLine ?? null;
          if (simultaneousLineTexture) {
            const s = this.allocSimultaneousLineSprite();
            if (s) {
              const noteBaseWidth = this.assets?.rhythm.noteNormal[this.textureLaneIndex(n.lane)]?.width ?? 308;
              const spriteScale = this.noteSpriteScale(noteScale);
              const lineHeight = Math.max(
                1,
                spriteScale * noteBaseWidth * SIMULTANEOUS_LINE_HEIGHT_TO_NOTE_WIDTH,
              );
              this.applyStretchSprite(s, simultaneousLineTexture, fromX, visual.y, width, lineHeight, 1, 0, 0.5);
            }
          } else {
            lineG.setStrokeStyle({ width: 1 + visual.percent * 8, color: 0xffffff, alpha: 0.8 });
            lineG.moveTo(fromX, visual.y);
            lineG.lineTo(toX, visual.y);
          }
        }
      }

      const lane = this.textureLaneIndex(n.lane);
      const alpha = n.note.baseType === "hidden" ? 0.45 : 1;
      const tex = this.assets
        ? resolveRhythmNoteTexture(this.assets, n.note, lane, n.gray)
        : null;

      if (!directional) {
        if (tex && this.noteSpriteLayer) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, tex, visual.x, visual.y, this.noteSpriteScale(noteScale), alpha);
        } else {
          const fallbackRadius = Math.max(5, noteScale * 39.76);
          const fallbackColor = n.gray ? 0xb3b7c2 : color;
          fallbackG.fill({ color: fallbackColor, alpha });
          fallbackG.circle(visual.x, visual.y, fallbackRadius);
          fallbackG.fill();
        }
      }

      if (shouldRenderFlickTop(n.note)) {
        const flickTex = this.assets ? resolveFlickTopTexture(this.assets) : null;
        const flickFps = Math.max(1, Math.floor(this.settings.fps / 3));
        const flickBaseTex = tex ?? flickTex;
        const flickNoteWidth = Math.max(1, flickBaseTex?.width ?? 96);
        const flickTravel = noteScale * flickNoteWidth * 0.213;
        const flickY = visual.y - flickTravel - (this.flickFrame * flickTravel) / flickFps;

        if (flickTex && this.noteSpriteLayer) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, flickTex, visual.x, flickY, this.noteSpriteScale(noteScale), 1);
        } else {
          const fs = Math.max(6, noteScale * 31.24);
          lineG.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 1 });
          lineG.moveTo(visual.x - fs * 0.45, flickY + fs * 0.2);
          lineG.lineTo(visual.x, flickY - fs * 0.35);
          lineG.lineTo(visual.x + fs * 0.45, flickY + fs * 0.2);
        }
      }

      this.drawDirectional(n, noteScale, visual.percent, visual.y, lineG);
    }

    this.drawSlideBottomMarkers(slideBottomLanes, fallbackG);
  }

  private resolveNoteVisualState(
    note: ActiveNote,
    elapsedMs: number,
  ): { x: number; y: number; percent: number; scale: number } {
    const frameRaw = this.frameRawAt(elapsedMs, note.startMs, note.tgId, note.tgPos);
    const percent = this.percentFromFrameRaw(frameRaw);
    return {
      x: this.laneXAtPercent(note.lane, percent),
      y: this.laneYAtPercent(percent),
      percent,
      scale: Math.max(NOTE_SCALE_MIN, percent * this.settings.noteSize),
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
    slideBottomLanes: number[],
  ): void {
    if (this.slideConnections.length === 0) {
      return;
    }
    const travelMs = Math.max(1, this.settings.noteSpeedSeconds * 1000);
    const windowEndMs = elapsedMs + travelMs;

    for (const connection of this.slideConnections) {
      if (connection.fromHitMs >= windowEndMs) {
        break;
      }
      if (connection.toHitMs < elapsedMs) {
        continue;
      }
      const fromFrameRaw = this.frameRawAt(
        elapsedMs,
        connection.fromStartMs,
        connection.fromTgId,
        connection.fromTgPos,
      );
      const toFrameRaw = this.frameRawAt(
        elapsedMs,
        connection.toStartMs,
        connection.toTgId,
        connection.toTgPos,
      );
      const fromPercent = this.percentFromFrameRaw(fromFrameRaw);
      const toPercent = this.percentFromFrameRaw(toFrameRaw);
      const fromPassed = fromFrameRaw >= this.settings.noteSpeedFrames;
      const fromLane = fromPassed
        ? this.interpolateLane(
          connection.fromLane,
          connection.toLane,
          this.axisNowAt(elapsedMs, connection.fromTgId),
          this.axisHitAt(connection.fromHitMs, connection.fromTgId, connection.fromTgPos),
          this.axisHitAt(connection.toHitMs, connection.toTgId, connection.toTgPos),
        )
        : connection.fromLane;
      const toLane = connection.toLane;

      this.drawConnector(
        graphics,
        connection,
        this.laneXAtPercent(fromLane, fromPercent),
        this.laneYAtPercent(fromPercent),
        this.connectorHalfWidthAtPercent(fromPercent),
        this.laneXAtPercent(toLane, toPercent),
        this.laneYAtPercent(toPercent),
        this.connectorHalfWidthAtPercent(toPercent),
        1,
      );

      if (fromPassed) {
        slideBottomLanes.push(fromLane);
      }
    }
  }

  private axisNowAt(elapsedMs: number, tgId: number): number {
    if (tgId < 0) {
      return elapsedMs;
    }
    return this.timingGroupPosAt(tgId, elapsedMs);
  }

  private axisHitAt(hitMs: number, tgId: number, tgPos: number): number {
    if (tgId < 0) {
      return hitMs;
    }
    return tgPos;
  }

  private frameRawAt(elapsedMs: number, startMs: number, tgId: number, tgPos: number): number {
    if (tgId < 0) {
      return ((elapsedMs - startMs) * LEGACY_TIMING_FPS) / 1000;
    }
    const nowPos = this.timingGroupPosAt(tgId, elapsedMs);
    return (nowPos * LEGACY_TIMING_FPS) / 100
      + this.settings.noteSpeedFrames
      - (tgPos * LEGACY_TIMING_FPS) / 100;
  }

  private timingGroupPosAt(tgId: number, elapsedMs: number): number {
    const group = this.timingGroups[tgId];
    if (!group) {
      return elapsedMs;
    }
    const x = elapsedMs - legacyOffsetToMs(this.settings.offset);
    let speed = 1;
    let pos = 0;
    for (const change of group.changes) {
      if (x + 1e-9 < change.atMs) {
        break;
      }
      speed = change.speed;
      pos = change.pos;
    }
    return pos + speed * x;
  }

  private percentFromFrameRaw(frameRaw: number): number {
    const frames = Math.max(1, this.settings.noteSpeedFrames);
    const exponent = (50 * (frameRaw - frames)) / frames;
    return Math.max(0, Math.min(1, 0.05 + 0.95 * Math.pow(1.1, exponent)));
  }

  private interpolateLane(fromLane: number, toLane: number, nowAxis: number, fromAxis: number, toAxis: number): number {
    const denominator = toAxis - fromAxis;
    if (Math.abs(denominator) < 1e-6) {
      return toLane;
    }
    return fromLane + ((toLane - fromLane) * (nowAxis - fromAxis)) / denominator;
  }

  private drawSlideBottomMarkers(slideBottomLanes: readonly number[], fallbackG: Graphics): void {
    if (slideBottomLanes.length === 0) {
      return;
    }

    for (const laneValue of slideBottomLanes) {
      const lane = this.textureLaneIndex(laneValue);
      const x = this.laneXAtPercent(laneValue, 1);
      const y = this.stageBottomY();

      const markerTex = this.assets
        ? resolveSlideBottomMarkerTexture(this.assets, lane)
        : null;
      if (markerTex && this.noteSpriteLayer) {
        const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
        this.applySprite(s, markerTex, x, y, this.noteSpriteScale(this.settings.noteSize), 1);
      } else {
        const fallbackRadius = Math.max(5, this.settings.noteSize * 39.76);
        fallbackG.fill({ color: 0x9be9b6, alpha: 1 });
        fallbackG.circle(x, y, fallbackRadius);
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

  private drawEffects(): void {
    const fallbackG = this.fallbackNoteG!;

    for (let i = this.activeEffects.length - 1; i >= 0; i -= 1) {
      const e = this.activeEffects[i];
      const frames = e.kind === "normal"
        ? this.assets?.effects.normal
        : this.assets?.effects.flick;
      const drawX = this.laneXAtPercent(e.lane, 1);
      const y = this.stageBottomY();

      if (frames && frames.length > 0) {
        if (e.frame >= frames.length) {
          this.removeActiveEffectAt(i);
          continue;
        }
        const tex = frames[e.frame];
        if (this.effectSpriteLayer) {
          const s = this.allocSprite(this.effectSpritePool, this.effectSpriteLayer);
          const { anchorX, anchorY } = this.effectAnchor(e.kind, tex);
          this.applySprite(s, tex, drawX, y, this.settings.effectSize, 1, anchorX, anchorY);
        }
      } else {
        const alpha = Math.max(0, 1 - e.frame / 8);
        fallbackG.fill({ color: e.kind === "flick" ? 0xffb184 : 0xb6d2ff, alpha });
        fallbackG.circle(drawX, y, Math.max(8, this.settings.effectSize * (26 + e.frame * 5)));
        fallbackG.fill();
      }

      e.frame += 1;
      const cap = frames && frames.length > 0 ? frames.length : 8;
      if (e.frame >= cap) {
        this.removeActiveEffectAt(i);
      }
    }
  }

  private removeActiveEffectAt(index: number): void {
    const last = this.activeEffects.length - 1;
    if (index < 0 || index > last) {
      return;
    }
    if (index !== last) {
      this.activeEffects[index] = this.activeEffects[last];
    }
    this.activeEffects.pop();
  }

  private connectorHalfWidthAtPercent(percent: number): number {
    const p = Math.max(0, Math.min(1, percent));
    const laneSpacing = this.stageLaneWidth() * p;
    return Math.max(1, laneSpacing * this.settings.noteSize * 0.5);
  }

  private noteSpriteScale(noteScale: number): number {
    const widthScale = (this.stageLaneWidth() * NOTE_WIDTH_TO_LANE_WIDTH_RATIO) / NOTE_BASE_TEXTURE_WIDTH;
    const scale = noteScale * widthScale;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  private effectAnchor(kind: "normal" | "flick" | "slide", texture: Texture): { anchorX: number; anchorY: number } {
    const originX = kind === "normal"
      ? this.settings.effectNormalX
      : kind === "flick"
        ? this.settings.effectFlickX
        : this.settings.effectSlideX;
    const originY = kind === "normal"
      ? this.settings.effectNormalY
      : kind === "flick"
        ? this.settings.effectFlickY
        : this.settings.effectSlideY;
    return {
      anchorX: originX / Math.max(1, texture.width),
      anchorY: originY / Math.max(1, texture.height)
    };
  }

  private drawHud(stats: RuntimeStats, progress: number): void {
    const g = this.hudG!;
    g.clear();

    const w = this.app?.screen.width ?? this.settings.windowX;
    g.fill({ color: 0xffffff, alpha: 0.23 });
    g.rect(0, 0, w * progress, 6);
    g.fill();

    g.fill({ color: 0x0f152a, alpha: 0.75 });
    g.roundRect(w - 340, 16, 320, 188, 10);
    g.fill();

    this.hudText!.x = w - 326;
    this.hudText!.y = 26;

    const lines = [
      `Combo: ${stats.combo}/${stats.notes}`,
      `Score: ${Math.floor(stats.score)}`,
      `BPM: ${stats.bpmText}`,
      `NPS: ${stats.nps} (Max ${stats.npsMax})`,
      `Objects: ${stats.activeObjects}/${stats.totalObjects}`,
      `Processed: ${stats.processedObjects}`
    ];

    this.hudText!.text = lines.join("\n");
  }

  private laneXAtPercent(lane: number, percent: number): number {
    const geometry = this.stageGeometry();
    const p = Math.max(0, Math.min(1, percent));
    const logicalLane = this.settings.mirror ? 6 - lane : lane;
    const centeredLane = logicalLane - 3;
    return geometry.viewportWidth * 0.5 + centeredLane * this.stageLaneWidth() * p;
  }

  private textureLaneIndex(lane: number): number {
    return Math.max(1, Math.min(7, Math.round(lane) + 1));
  }

  private laneYAtPercent(percent: number): number {
    const geometry = this.stageGeometry();
    const p = Math.max(0, Math.min(1, percent));
    return geometry.stageTop + geometry.stageHeight * p;
  }

  private viewportWidth(): number {
    return this.app?.screen.width ?? this.settings.windowX;
  }

  private viewportHeight(): number {
    return this.app?.screen.height ?? this.settings.windowY;
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

    const stageWidthByViewportWidth = viewportWidth * STAGE_TO_WINDOW_RATIO;
    const stageHeightByViewportWidth = stageWidthByViewportWidth * STAGE_HEIGHT_TO_WIDTH_RATIO;

    let stageWidth: number;
    let stageHeight: number;
    if (stageHeightByViewportWidth <= viewportHeight + 1e-6) {
      stageWidth = stageWidthByViewportWidth;
      stageHeight = stageHeightByViewportWidth;
    } else {
      stageHeight = viewportHeight * STAGE_TO_WINDOW_RATIO;
      stageWidth = stageHeight / STAGE_HEIGHT_TO_WIDTH_RATIO;
    }

    const stageJudge = stageHeight * STAGE_JUDGE_TO_HEIGHT_RATIO;
    const stageBottom = viewportHeight * 0.5 + stageJudge;
    const stageTop = stageBottom - stageHeight;

    const geometry: StageGeometry = {
      viewportWidth,
      viewportHeight,
      stageWidth,
      stageHeight,
      stageBottom,
      stageTop,
      stageJudge,
    };
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
