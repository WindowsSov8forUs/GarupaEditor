import { Application, Assets, Container, NineSliceSprite, Texture } from "pixi.js";
import embeddedRhythmGameUiUrl from "../assets/ui/RhythmGameUI.png";
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
}

const SCORE_METER_BLUE = RHYTHM_GAME_UI_SLICED_SPRITES.scoreMeterBlue;

export class ScoreGaugeMeshRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private gauge: NineSliceSprite | null = null;
  private gaugeTexture: Texture | null = null;
  private pendingState: ScoreGaugeMeshState | null = null;
  private isDestroyed = false;

  async mount(host: HTMLElement): Promise<void> {
    const initialState = this.pendingState ?? {
      screenWidth: 1,
      screenHeight: 1,
      localWidth: 1,
      localHeight: 1,
      nguiScale: 1,
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
    const gaugeTexture = cropPixiAtlasTexture(sourceTexture, RHYTHM_GAME_UI_RECTS.scoreMeterBlue);
    if (!gaugeTexture) {
      this.destroy();
      throw new Error("score_meter_blue texture frame is unavailable");
    }

    this.gaugeTexture = gaugeTexture;
    const root = new Container();
    const gauge = new NineSliceSprite({
      texture: gaugeTexture,
      leftWidth: SCORE_METER_BLUE.borderLeft,
      rightWidth: SCORE_METER_BLUE.borderRight,
      topHeight: SCORE_METER_BLUE.borderTop,
      bottomHeight: SCORE_METER_BLUE.borderBottom,
      width: initialState.localWidth,
      height: initialState.localHeight,
      anchor: { x: 0, y: 0 },
    });
    root.addChild(gauge);
    app.stage.addChild(root);
    this.root = root;
    this.gauge = gauge;
    this.renderState(initialState);
  }

  update(state: ScoreGaugeMeshState): void {
    this.pendingState = state;
    this.renderState(state);
  }

  destroy(): void {
    this.isDestroyed = true;
    this.gaugeTexture?.destroy(false);
    this.gaugeTexture = null;
    this.gauge = null;
    this.root = null;
    this.app?.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    this.app = null;
  }

  private renderState(state: ScoreGaugeMeshState): void {
    const app = this.app;
    const root = this.root;
    const gauge = this.gauge;
    if (!app || !root || !gauge) {
      return;
    }
    const screenWidth = Math.max(1, state.screenWidth);
    const screenHeight = Math.max(1, state.screenHeight);
    app.renderer.resize(screenWidth, screenHeight);

    // Source chain:
    // Score/Progress UISlider mFill=LeftToRight -> UIProgressBar.ForceUpdate
    // writes Foreground UIWidget.drawRegion. The Foreground UISprite is
    // score_meter_blue with type=Sliced, so rendering is UIBasicSprite.SlicedFill
    // over the current widget-local draw rect. Keep NGUI-local units inside the
    // mesh and apply the UIRoot projection scale on the root container.
    gauge.setSize(Math.max(0.001, state.localWidth), Math.max(0.001, state.localHeight));
    root.scale.set(Math.max(0.001, state.nguiScale));
    app.render();
  }
}
