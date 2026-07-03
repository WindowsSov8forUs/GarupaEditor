import { Application, Assets, Container, NineSliceSprite, Texture } from "pixi.js";
import embeddedRhythmGameUiUrl from "../assets/ui/RhythmGameUI.png";
import type { SimulatorScoreGaugeSpriteKey } from "../engine/scoreHud";
import {
  cropPixiAtlasTexture,
  RHYTHM_GAME_UI_RECTS,
  RHYTHM_GAME_UI_SLICED_SPRITES,
} from "../engine/uiAtlas";

export interface ScoreGaugeMeshState {
  screenWidth: number;
  screenHeight: number;
  localWidth: number;
  localHeight: number;
  nguiScale: number;
  scoreMeterSpriteKey: SimulatorScoreGaugeSpriteKey;
}

export class ScoreGaugeMeshRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private gauge: NineSliceSprite | null = null;
  private sourceTexture: Texture | null = null;
  private gaugeTextures = new Map<SimulatorScoreGaugeSpriteKey, Texture>();
  private currentScoreMeterSpriteKey: SimulatorScoreGaugeSpriteKey | null = null;
  private pendingState: ScoreGaugeMeshState | null = null;
  private isDestroyed = false;

  async mount(host: HTMLElement): Promise<void> {
    const initialState = this.pendingState ?? {
      screenWidth: 1,
      screenHeight: 1,
      localWidth: 1,
      localHeight: 1,
      nguiScale: 1,
      scoreMeterSpriteKey: "scoreMeterBlue",
    };

    const app = new Application();
    await app.init({
      width: Math.max(1, initialState.screenWidth),
      height: Math.max(1, initialState.screenHeight),
      backgroundAlpha: 0,
      clearBeforeRender: true,
      preference: "webgl",
      premultipliedAlpha: true,
      antialias: false,
      autoStart: false,
      autoDensity: true,
      resolution: Math.max(1, window.devicePixelRatio || 1),
    });

    if (this.isDestroyed) {
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      return;
    }

    this.app = app;
    host.innerHTML = "";
    host.appendChild(app.canvas);
    app.canvas.className = "simulator-score-gauge-canvas";
    app.canvas.style.background = "transparent";
    app.canvas.style.backgroundColor = "transparent";

    const sourceTexture = await Assets.load<Texture>(embeddedRhythmGameUiUrl)
      .catch((error: unknown) => {
        this.destroy();
        throw error;
      });
    if (this.isDestroyed || this.app !== app) {
      return;
    }
    this.sourceTexture = sourceTexture;

    const root = new Container();
    app.stage.addChild(root);
    this.root = root;
    this.renderState(initialState);
  }

  update(state: ScoreGaugeMeshState): void {
    this.pendingState = state;
    this.renderState(state);
  }

  destroy(): void {
    this.isDestroyed = true;
    for (const texture of this.gaugeTextures.values()) {
      texture.destroy(false);
    }
    this.gaugeTextures.clear();
    this.sourceTexture = null;
    this.gauge = null;
    this.root = null;
    this.currentScoreMeterSpriteKey = null;
    this.app?.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    this.app = null;
  }

  private getScoreMeterTexture(spriteKey: SimulatorScoreGaugeSpriteKey): Texture {
    const cached = this.gaugeTextures.get(spriteKey);
    if (cached) {
      return cached;
    }
    const sourceTexture = this.sourceTexture;
    const rect = RHYTHM_GAME_UI_RECTS[spriteKey];
    const texture = cropPixiAtlasTexture(sourceTexture, rect);
    if (!texture) {
      throw new Error(`${spriteKey} texture frame is unavailable`);
    }
    this.gaugeTextures.set(spriteKey, texture);
    return texture;
  }

  private applyScoreMeterSprite(spriteKey: SimulatorScoreGaugeSpriteKey, state: ScoreGaugeMeshState): NineSliceSprite {
    const root = this.root;
    if (!root) {
      throw new Error("score gauge root is unavailable");
    }
    const sprite = RHYTHM_GAME_UI_SLICED_SPRITES[spriteKey];
    const texture = this.getScoreMeterTexture(spriteKey);
    let gauge = this.gauge;
    if (!gauge) {
      gauge = new NineSliceSprite({
        texture,
        leftWidth: sprite.borderLeft,
        rightWidth: sprite.borderRight,
        topHeight: sprite.borderTop,
        bottomHeight: sprite.borderBottom,
        width: state.localWidth,
        height: state.localHeight,
        anchor: { x: 0, y: 0 },
      });
      root.addChild(gauge);
      this.gauge = gauge;
      this.currentScoreMeterSpriteKey = spriteKey;
      return gauge;
    }
    if (this.currentScoreMeterSpriteKey !== spriteKey) {
      gauge.texture = texture;
      gauge.leftWidth = sprite.borderLeft;
      gauge.rightWidth = sprite.borderRight;
      gauge.topHeight = sprite.borderTop;
      gauge.bottomHeight = sprite.borderBottom;
      this.currentScoreMeterSpriteKey = spriteKey;
    }
    return gauge;
  }

  private renderState(state: ScoreGaugeMeshState): void {
    const app = this.app;
    const root = this.root;
    if (!app || !root || !this.sourceTexture) {
      return;
    }
    const screenWidth = Math.max(1, state.screenWidth);
    const screenHeight = Math.max(1, state.screenHeight);
    app.renderer.resize(screenWidth, screenHeight);

    // Source chain:
    // Score/Progress UISlider mFill=LeftToRight -> UIProgressBar.ForceUpdate
    // writes Foreground UIWidget.drawRegion. SinglePlayScoreGauge.updateScoreRank
    // changes that same Foreground UISprite through UISprite.set_spriteName
    // (score_meter_blue/green/orange/pink/s), all still rendered as the
    // widget-local sliced sprite mesh.
    const gauge = this.applyScoreMeterSprite(state.scoreMeterSpriteKey, state);
    gauge.setSize(Math.max(0.001, state.localWidth), Math.max(0.001, state.localHeight));
    root.scale.set(Math.max(0.001, state.nguiScale));
    app.render();
  }
}
