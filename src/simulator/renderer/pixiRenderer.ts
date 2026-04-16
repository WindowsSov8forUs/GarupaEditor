import { Application, Color, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import {
  NoteSkinTextureBundle,
  resolveDirectionalArrowTexture,
  resolveDirectionalLaneTexture,
  resolveFlickTopTexture,
  resolveRhythmNoteTexture,
} from "../engine/assets";
import { ActiveNote, HitEffectEvent, RuntimeStats, SimulatorSettings } from "../engine/types";

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

function isSlideType(type: number): boolean {
  return (
    type === 4 ||
    type === 7 ||
    type === 14 ||
    type === 15 ||
    type === 16 ||
    type === 37 ||
    type === 38 ||
    type === 39 ||
    type === 72 ||
    type === 77 ||
    type === 78 ||
    type === 104 ||
    type === 107 ||
    type === 108
  );
}

function isDirectionalType(type: number): boolean {
  return type >= 51 && type <= 69;
}

function colorForType(type: number): number {
  if (type === 2 || type === 12 || type === 13 || type === 26 || type === 74 || type === 102 || type === 106) {
    return 0xff9d66;
  }
  if (type === 11 || type === 31 || type === 32 || type === 33 || type === 34 || type === 35 || type === 36 || type === 75 || type === 76 || type === 109) {
    return 0xffe77a;
  }
  if ((type >= 51 && type <= 59) || (type >= 61 && type <= 69)) {
    return 0xc6a7ff;
  }
  if (type === 4 || type === 7 || type === 14 || type === 15 || type === 16 || type === 37 || type === 38 || type === 39 || type === 72 || type === 77 || type === 78 || type === 104 || type === 107 || type === 108) {
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

export class PixiRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private lanesG: Graphics | null = null;
  private linesG: Graphics | null = null;
  private fallbackNoteG: Graphics | null = null;
  private hudG: Graphics | null = null;
  private hudText: Text | null = null;
  private mvSprite: Sprite | null = null;
  private noteSpriteLayer: Container | null = null;
  private effectSpriteLayer: Container | null = null;

  private noteSpritePool: Sprite[] = [];
  private noteSpriteCursor = 0;
  private noteSpritePrevUsed = 0;

  private effectSpritePool: Sprite[] = [];
  private effectSpriteCursor = 0;
  private effectSpritePrevUsed = 0;
  private activeEffects: ActiveEffect[] = [];
  private noteById = new Map<number, ActiveNote>();
  private slideEffectFrameByNote = new Map<number, number>();
  private laneTopX = new Float32Array(9);
  private laneBottomX = new Float32Array(9);
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

  constructor(settings: SimulatorSettings) {
    this.settings = settings;
  }

  setAssets(bundle: NoteSkinTextureBundle | null): void {
    this.assets = bundle;
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
    this.rebuildLaneCache();

    this.mvSprite = new Sprite();
    this.mvSprite.visible = false;

    this.lanesG = new Graphics();
    this.linesG = new Graphics();
    this.fallbackNoteG = new Graphics();
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
      this.mvSprite,
      this.lanesG,
      this.linesG,
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
  }

  render(notes: readonly ActiveNote[], stats: RuntimeStats, progress: number, mvFrame: MvRenderFrame | null): void {
    if (!this.lanesG || !this.linesG || !this.fallbackNoteG || !this.hudG || !this.hudText || !this.mvSprite) {
      return;
    }

    this.noteSpriteCursor = 0;
    this.effectSpriteCursor = 0;
    this.frameTick += 1;
    this.flickFrame = Math.floor((stats.elapsedMs * this.settings.fps) / 1000) % Math.max(1, Math.floor(this.settings.fps / 3));

    this.updateMvFrame(mvFrame);
    this.drawLanes();
    this.drawNotes(notes);
    this.drawEffects();
    this.noteSpritePrevUsed = this.compactSpritePool(this.noteSpritePool, this.noteSpriteCursor, this.noteSpritePrevUsed);
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
    this.slideEffectFrameByNote.clear();
    this.noteSpritePool = [];
    this.effectSpritePool = [];
    this.noteSpritePrevUsed = 0;
    this.effectSpritePrevUsed = 0;
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

  private allocSprite(pool: Sprite[], layer: Container): Sprite {
    if (pool.length <= (pool === this.noteSpritePool ? this.noteSpriteCursor : this.effectSpriteCursor)) {
      const s = new Sprite(Texture.WHITE);
      s.visible = false;
      layer.addChild(s);
      pool.push(s);
    }
    const idx = pool === this.noteSpritePool ? this.noteSpriteCursor++ : this.effectSpriteCursor++;
    const sprite = pool[idx];
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

    const topY = this.settings.topY;
    const bottomY = this.settings.bottomY;

    g.setStrokeStyle({ width: 1, color: 0x4762a8, alpha: 0.7 });
    for (let lane = 1; lane <= 7; lane += 1) {
      const tx = this.laneTopX[lane];
      const bx = this.laneBottomX[lane];
      g.moveTo(tx, topY);
      g.lineTo(bx, bottomY);
    }

    g.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 0.9 });
    g.moveTo(this.settings.bottomX, this.settings.bottomY);
    g.lineTo(this.settings.bottomX + this.settings.bottomDistance * 6, this.settings.bottomY);
    this.lanesDirty = false;
  }

  private drawNotes(notes: readonly ActiveNote[]): void {
    const lineG = this.linesG!;
    const fallbackG = this.fallbackNoteG!;
    lineG.clear();
    fallbackG.clear();

    const noteById = this.noteById;
    noteById.clear();
    for (const n of notes) {
      noteById.set(n.id, n);
    }

    for (const n of notes) {
      if (!n.started) {
        continue;
      }
      if (!this.settings.displayHiddenSlideAmong && (n.type === 77 || n.type === 107)) {
        continue;
      }
      if (n.parentActiveId > 0) {
        const p = noteById.get(n.parentActiveId);
        if (p && p.started) {
          lineG.setStrokeStyle({ width: this.connectorWidthFor(n), color: 0x4be090, alpha: 0.9 });
          lineG.moveTo(n.x, n.y);
          lineG.lineTo(p.x, p.y);

          const slideFrames = this.assets?.effects.slide;
          if (this.settings.effectEnable && slideFrames && slideFrames.length > 0 && this.effectSpriteLayer && isSlideType(n.type)) {
            const frame = this.slideEffectFrameByNote.get(n.id) ?? 0;
            const tex = slideFrames[frame];
            const { anchorX, anchorY } = this.effectAnchor("slide", tex);
            const s = this.allocSprite(this.effectSpritePool, this.effectSpriteLayer);
            this.applySprite(s, tex, p.x, p.y, this.settings.effectSize, 0.95, anchorX, anchorY);
            this.slideEffectFrameByNote.set(n.id, (frame + 1) % slideFrames.length);
          }
        }
      }
    }

    if ((this.frameTick & 127) === 0 && this.slideEffectFrameByNote.size > notes.length + 8) {
      for (const id of this.slideEffectFrameByNote.keys()) {
        if (!noteById.has(id)) {
          this.slideEffectFrameByNote.delete(id);
        }
      }
    }

    for (const n of notes) {
      if (!n.started) {
        continue;
      }
      if (!this.settings.displayHiddenSlideAmong && (n.type === 77 || n.type === 107)) {
        continue;
      }

      const color = colorForType(n.type);
      const noteScale = Math.max(0.02, n.scale);
      const directional = isDirectionalType(n.type);

      if (n.issameline > 0) {
        const x2 = this.laneXAtPercent(n.issameline, n.percent);
        lineG.setStrokeStyle({ width: 1 + n.percent * 8, color: 0xffffff, alpha: 0.8 });
        lineG.moveTo(n.x, n.y);
        lineG.lineTo(x2, n.y);
      }

      const lane = Math.max(1, Math.min(7, Math.round(n.lane)));
      const alpha = n.type === 77 || n.type === 107 ? 0.45 : 1;
      const tex = this.assets
        ? resolveRhythmNoteTexture(this.assets, n.type, lane, n.gray)
        : null;

      if (!directional) {
        if (tex && this.noteSpriteLayer) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, tex, n.x, n.y, noteScale, alpha);
        } else {
          const fallbackRadius = Math.max(5, noteScale * 56);
          const fallbackColor = n.gray ? 0xb3b7c2 : color;
          fallbackG.fill({ color: fallbackColor, alpha });
          fallbackG.circle(n.x, n.y, fallbackRadius);
          fallbackG.fill();
        }
      }

      if (n.isFlick) {
        const flickTex = this.assets ? resolveFlickTopTexture(this.assets) : null;
        const flickFps = Math.max(1, Math.floor(this.settings.fps / 3));
        const flickBaseTex = tex ?? flickTex;
        const flickNoteWidth = Math.max(1, flickBaseTex?.width ?? 96);
        const flickTravel = noteScale * flickNoteWidth * 0.3;
        const flickY = n.y - flickTravel - (this.flickFrame * flickTravel) / flickFps;

        if (flickTex && this.noteSpriteLayer) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, flickTex, n.x, flickY, noteScale, 1);
        } else {
          const fs = Math.max(6, noteScale * 44);
          lineG.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 1 });
          lineG.moveTo(n.x - fs * 0.45, flickY + fs * 0.2);
          lineG.lineTo(n.x, flickY - fs * 0.35);
          lineG.lineTo(n.x + fs * 0.45, flickY + fs * 0.2);
        }
      }

      this.drawDirectional(n, noteScale, lineG);
    }
  }

  private drawDirectional(n: ActiveNote, noteScale: number, lineG: Graphics): void {
    if (n.type < 51 || n.type > 69) {
      return;
    }

    const originalLeft = n.type >= 51 && n.type <= 59;
    const width = originalLeft ? n.type - 50 : n.type - 60;
    const step = originalLeft ? -1 : 1;
    const textureFamilyLeft = this.settings.mirror ? !originalLeft : originalLeft;

    let edgeLane = Math.max(0, Math.min(8, Math.round(n.lane)));
    for (let i = 0; i < width; i += 1) {
      const lane = Math.round(n.lane) + step * i;
      if (lane < 0 || lane > 8) {
        continue;
      }
      edgeLane = lane;

      const x = this.laneXAtPercent(lane, n.percent);
      if (this.assets && this.noteSpriteLayer) {
        const texLane = lane <= 0 ? 1 : lane >= 8 ? 7 : lane;
        const tex = resolveDirectionalLaneTexture(this.assets, textureFamilyLeft, texLane);
        if (tex) {
          const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
          this.applySprite(s, tex, x, n.y, noteScale, 1);
          continue;
        }
      }

      const fs = Math.max(6, noteScale * 40);
      lineG.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 1 });
      lineG.moveTo(x - fs * 0.6, n.y);
      lineG.lineTo(x + fs * 0.6, n.y);
    }

    const renderLeft = this.settings.mirror ? !originalLeft : originalLeft;
    const arrowTex = this.assets
      ? resolveDirectionalArrowTexture(this.assets, renderLeft)
      : null;
    const edgeX = this.laneXAtPercent(edgeLane, n.percent);
    const flickFps = Math.max(1, Math.floor(this.settings.fps / 3));
    const flickProgress = this.flickFrame / flickFps;
    const flickWidth = this.assets?.rhythm.noteFlick[Math.max(1, Math.min(7, Math.round(n.lane)))]?.width ?? 96;
    const flickShift = flickProgress * (noteScale * flickWidth * 0.3);
    const arrowOffset = 165 * noteScale;
    const arrowX = renderLeft
      ? edgeX - arrowOffset - flickShift
      : edgeX + arrowOffset + flickShift;
    const arrowY = n.y + 5 * noteScale;

    if (arrowTex && this.noteSpriteLayer) {
      const s = this.allocSprite(this.noteSpritePool, this.noteSpriteLayer);
      this.applySprite(s, arrowTex, arrowX, arrowY, noteScale, 1);
    } else {
      const headOffset = Math.max(8, noteScale * 28);
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
      const x = this.settings.bottomX + this.settings.bottomDistance * (e.lane - 1);
      const drawX = this.settings.mirror ? 2 * (this.settings.bottomX + this.settings.bottomDistance * 3) - x : x;
      const y = this.settings.bottomY;

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

  private connectorWidthFor(n: ActiveNote): number {
    const lane = Math.max(1, Math.min(7, Math.round(n.lane)));
    const longTex = this.assets
      ? resolveRhythmNoteTexture(this.assets, 3, lane, false)
      : null;
    if (longTex) {
      return Math.max(2, (longTex.width / 3.2) * Math.max(0.02, n.scale));
    }
    return Math.max(2, Math.max(0.02, n.scale) * 28);
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
    const logicalLane = this.settings.mirror ? 8 - lane : lane;
    const clampedLane = Math.max(0, Math.min(8, logicalLane));
    const laneLower = Math.floor(clampedLane);
    const laneUpper = Math.min(8, laneLower + 1);
    const laneMix = clampedLane - laneLower;
    const tx = this.laneTopX[laneLower] + (this.laneTopX[laneUpper] - this.laneTopX[laneLower]) * laneMix;
    const bx = this.laneBottomX[laneLower] + (this.laneBottomX[laneUpper] - this.laneBottomX[laneLower]) * laneMix;
    return tx + (bx - tx) * percent;
  }

  private rebuildLaneCache(): void {
    for (let lane = 0; lane <= 8; lane += 1) {
      this.laneTopX[lane] = this.settings.topX + this.settings.topDistance * (lane - 1);
      this.laneBottomX[lane] = this.settings.bottomX + this.settings.bottomDistance * (lane - 1);
    }
    this.lanesDirty = true;
  }

}
