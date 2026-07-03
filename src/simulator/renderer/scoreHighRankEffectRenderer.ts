import { Application, Assets, Container, Filter, GlProgram, NineSliceSprite, Rectangle, Sprite, Texture, UniformGroup } from "pixi.js";
import highRankEffectData from "../assets/ui/score-high-rank-effect-current.json";
import ssKiraUrl from "../assets/ui/ss_kira.png";
import ssOverlayUrl from "../assets/ui/ss_overlay.png";
import sssStarLongUrl from "../assets/ui/sss_star_long.png";

export type ScoreHighRankEffectClipName = "ScoreGaugeSS" | "ScoreGaugeSSS";

export interface ScoreHighRankEffectLayoutState {
  screenWidth: number;
  screenHeight: number;
  rootX: number;
  rootY: number;
  nguiScale: number;
  scoreRatio: number;
}

type HighRankChildName =
  | "Flash"
  | "BigStar_1"
  | "BigStar_2"
  | "kira_1"
  | "kira_2"
  | "kira_3"
  | "kira_4"
  | "kira_5"
  | "kira_6"
  | "kira_7"
  | "kira_8";

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface HighRankWidget {
  pivot: number;
  width: number;
  height: number;
  color: [number, number, number, number];
}

interface HighRankTexture {
  name: "ss_overlay" | "sss_star_long" | "ss_kira";
  border: [number, number, number, number];
}

interface HighRankChildData {
  localPosition: Vector3;
  localScale: Vector3;
  widget: HighRankWidget;
  texture: HighRankTexture;
}

interface ValueArrayDelta {
  m_Start?: number;
  m_Stop?: number;
}

interface HighRankCurveKey {
  time: number;
  coefficients: [number, number, number, number];
  value: number;
}

interface HighRankCurve {
  target: HighRankChildName;
  property: "position" | "scale" | "rotationEuler" | "active" | "tweenAlphaTo";
  axis: "x" | "y" | "z" | null;
  valueArrayDelta?: ValueArrayDelta;
  keys: HighRankCurveKey[];
}

interface HighRankClip {
  stopTime: number;
  loopTime: boolean;
  curves: HighRankCurve[];
}

interface HighRankTweenAlpha {
  method: number;
  methodName: "Linear";
  styleValue: number;
  style: "PingPong";
  duration: number;
  from: number;
  to: number;
}

interface HighRankAnchorPoint {
  relative: number;
  absolute: number;
}

interface HighRankScoreRatioClip {
  scoreRatioRightAnchorScale: number;
  scoreRatioFullRightAnchorAbsolute: number;
  panel: {
    clipRange: [number, number, number, number];
    clipSoftness: [number, number];
    anchors: {
      left: HighRankAnchorPoint;
      right: HighRankAnchorPoint;
      bottom: HighRankAnchorPoint;
      top: HighRankAnchorPoint;
    };
  };
  anchorTarget: {
    localPosition: Vector3;
  };
  effectRootLocalPosition: Vector3;
}

interface HighRankEffectData {
  children: Record<HighRankChildName, HighRankChildData>;
  tweenAlpha: Partial<Record<HighRankChildName, HighRankTweenAlpha>>;
  scoreRatioClip: HighRankScoreRatioClip;
  clips: Record<ScoreHighRankEffectClipName, HighRankClip>;
}

interface ChildSprite {
  container: Container;
  base: HighRankChildData;
}

type PropertyCurveMap = Partial<Record<"x" | "y" | "z" | "value", HighRankCurve>>;
type ChildCurveMap = Partial<Record<"position" | "scale" | "rotationEuler" | "active" | "tweenAlphaTo", PropertyCurveMap>>;

const EFFECT_DATA = highRankEffectData as unknown as HighRankEffectData;
const CHILD_ORDER: readonly HighRankChildName[] = [
  "Flash",
  "BigStar_1",
  "BigStar_2",
  "kira_1",
  "kira_2",
  "kira_3",
  "kira_4",
  "kira_5",
  "kira_6",
  "kira_7",
  "kira_8",
];
const TEXTURE_URLS: Record<HighRankTexture["name"], string> = {
  ss_overlay: ssOverlayUrl,
  sss_star_long: sssStarLongUrl,
  ss_kira: ssKiraUrl,
};
const DEFAULT_FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vFilterPosition;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vFilterPosition = (aPosition * uOutputFrame.zw) + uOutputFrame.xy;
}
`;
const NGUI_SOFT_CLIP_FRAGMENT = `
in vec2 vTextureCoord;
in vec2 vFilterPosition;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uClipBounds;
uniform vec2 uClipSoftness;

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    vec2 softness = max(uClipSoftness, vec2(0.0001));
    vec4 edge = vec4(
        vFilterPosition.x - uClipBounds.x,
        uClipBounds.z - vFilterPosition.x,
        vFilterPosition.y - uClipBounds.y,
        uClipBounds.w - vFilterPosition.y
    ) / vec4(softness.x, softness.x, softness.y, softness.y);
    float clipAlpha = clamp(min(min(edge.x, edge.y), min(edge.z, edge.w)), 0.0, 1.0);
    finalColor = color * clipAlpha;
}
`;

class NguiSoftClipFilter extends Filter {
  private readonly softClipUniforms: UniformGroup;

  constructor() {
    const softClipUniforms = new UniformGroup({
      uClipBounds: { value: new Float32Array([0, 0, 0, 0]), type: "vec4<f32>" },
      uClipSoftness: { value: new Float32Array([1000, 1000]), type: "vec2<f32>" },
    });
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERTEX,
        fragment: NGUI_SOFT_CLIP_FRAGMENT,
        name: "ngui-soft-clip-filter",
      }),
      resources: {
        softClipUniforms,
      },
    });
    this.softClipUniforms = softClipUniforms;
    this.padding = 0;
  }

  setPanelClipBounds(left: number, top: number, right: number, bottom: number, softX: number, softY: number): void {
    const bounds = this.softClipUniforms.uniforms.uClipBounds as Float32Array;
    bounds[0] = left;
    bounds[1] = top;
    bounds[2] = right;
    bounds[3] = bottom;
    const softness = this.softClipUniforms.uniforms.uClipSoftness as Float32Array;
    softness[0] = Math.max(0.0001, softX);
    softness[1] = Math.max(0.0001, softY);
    this.softClipUniforms.update();
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function tintFromColor(color: [number, number, number, number]): number {
  const r = Math.round(clamp01(color[0]) * 255);
  const g = Math.round(clamp01(color[1]) * 255);
  const b = Math.round(clamp01(color[2]) * 255);
  return (r << 16) | (g << 8) | b;
}

function pivotAnchor(pivot: number): { x: number; y: number } {
  switch (pivot) {
    case 0:
      return { x: 0, y: 0 };
    case 1:
      return { x: 0.5, y: 0 };
    case 2:
      return { x: 1, y: 0 };
    case 3:
      return { x: 0, y: 0.5 };
    case 5:
      return { x: 1, y: 0.5 };
    case 6:
      return { x: 0, y: 1 };
    case 7:
      return { x: 0.5, y: 1 };
    case 8:
      return { x: 1, y: 1 };
    case 4:
    default:
      return { x: 0.5, y: 0.5 };
  }
}

function evaluateCurve(curve: HighRankCurve | undefined, time: number): number | null {
  if (!curve) {
    return null;
  }
  if (curve.keys.length === 0) {
    const delta = curve.valueArrayDelta;
    if (typeof delta?.m_Start === "number") {
      return delta.m_Start;
    }
    if (typeof delta?.m_Stop === "number") {
      return delta.m_Stop;
    }
    return null;
  }

  let key = curve.keys[0];
  for (const candidate of curve.keys) {
    if (candidate.time > time) {
      break;
    }
    key = candidate;
  }

  const deltaTime = Math.max(0, time - key.time);
  const [a, b, c, d] = key.coefficients;
  return (((a * deltaTime) + b) * deltaTime + c) * deltaTime + d;
}

function buildCurveMap(clip: HighRankClip): Partial<Record<HighRankChildName, ChildCurveMap>> {
  const output: Partial<Record<HighRankChildName, ChildCurveMap>> = {};
  for (const curve of clip.curves) {
    const child = output[curve.target] ?? {};
    const property = child[curve.property] ?? {};
    property[curve.axis ?? "value"] = curve;
    child[curve.property] = property;
    output[curve.target] = child;
  }
  return output;
}

function pingPongLinearTween(tween: HighRankTweenAlpha, elapsedSeconds: number, toOverride: number | null): number {
  const duration = Math.max(1e-6, tween.duration);
  const cycle = duration * 2;
  const cycleTime = ((elapsedSeconds % cycle) + cycle) % cycle;
  const factor = cycleTime <= duration ? cycleTime / duration : 1 - ((cycleTime - duration) / duration);
  const to = toOverride ?? tween.to;
  return tween.from + (factor * (to - tween.from));
}

export class ScoreHighRankEffectRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private readonly softClipFilter = new NguiSoftClipFilter();
  private readonly sprites = new Map<HighRankChildName, ChildSprite>();
  private readonly textures = new Map<HighRankTexture["name"], Texture>();
  private pendingLayout: ScoreHighRankEffectLayoutState | null = null;
  private currentClipName: ScoreHighRankEffectClipName | null = null;
  private currentCurveMap: Partial<Record<HighRankChildName, ChildCurveMap>> = {};
  private currentStartedAtMs = 0;
  private rafId = 0;
  private isDestroyed = false;

  async mount(host: HTMLElement): Promise<void> {
    const initialLayout = this.pendingLayout ?? {
      screenWidth: 1,
      screenHeight: 1,
      rootX: 0,
      rootY: 0,
      nguiScale: 1,
      scoreRatio: 0,
    };

    const app = new Application();
    await app.init({
      width: Math.max(1, initialLayout.screenWidth),
      height: Math.max(1, initialLayout.screenHeight),
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
    app.canvas.className = "simulator-score-high-rank-canvas";
    app.canvas.style.background = "transparent";

    for (const [name, url] of Object.entries(TEXTURE_URLS) as Array<[HighRankTexture["name"], string]>) {
      this.textures.set(name, await Assets.load<Texture>(url));
    }

    if (this.isDestroyed || this.app !== app) {
      return;
    }

    const root = new Container();
    const effectRoot = new Container();
    effectRoot.position.set(
      EFFECT_DATA.scoreRatioClip.effectRootLocalPosition.x,
      -EFFECT_DATA.scoreRatioClip.effectRootLocalPosition.y,
    );
    root.visible = false;
    root.addChild(effectRoot);
    root.filters = [this.softClipFilter];
    app.stage.addChild(root);
    this.root = root;
    this.buildSprites(effectRoot);
    this.applyLayout(initialLayout);
    if (this.currentClipName) {
      this.renderAnimationFrame(performance.now());
      root.visible = true;
      this.startRenderLoop();
    }
    app.render();
  }

  updateLayout(layout: ScoreHighRankEffectLayoutState): void {
    this.pendingLayout = layout;
    this.applyLayout(layout);
  }

  updateScoreRatio(scoreRatio: number): void {
    const layout = this.pendingLayout;
    if (!layout) {
      return;
    }
    this.updateLayout({
      ...layout,
      scoreRatio,
    });
  }

  play(clipName: ScoreHighRankEffectClipName): void {
    const clip = EFFECT_DATA.clips[clipName];
    this.currentClipName = clipName;
    this.currentCurveMap = buildCurveMap(clip);
    this.currentStartedAtMs = performance.now();
    if (this.root) {
      this.renderAnimationFrame(this.currentStartedAtMs);
      this.root.visible = true;
      this.app?.render();
    }
    this.startRenderLoop();
  }

  stop(): void {
    if (!this.currentClipName && !this.root?.visible) {
      return;
    }
    this.currentClipName = null;
    this.currentCurveMap = {};
    if (this.root) {
      this.root.visible = false;
    }
    this.stopRenderLoop();
    this.app?.render();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.stopRenderLoop();
    this.sprites.clear();
    this.textures.clear();
    this.root = null;
    this.currentClipName = null;
    this.app?.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    this.app = null;
  }

  private buildSprites(root: Container): void {
    for (const name of CHILD_ORDER) {
      const child = EFFECT_DATA.children[name];
      const texture = this.textures.get(child.texture.name);
      if (!texture) {
        throw new Error(`HighRankEffect texture is unavailable: ${child.texture.name}`);
      }
      const container = new Container();
      const anchor = pivotAnchor(child.widget.pivot);
      const tint = tintFromColor(child.widget.color);
      const border = child.texture.border;
      if (border.some((value) => value > 0)) {
        const sprite = new NineSliceSprite({
          texture,
          leftWidth: border[0],
          rightWidth: border[2],
          topHeight: border[1],
          bottomHeight: border[3],
          width: child.widget.width,
          height: child.widget.height,
          anchor,
        });
        sprite.tint = tint;
        container.addChild(sprite);
      } else {
        const sprite = new Sprite(texture);
        sprite.anchor.set(anchor.x, anchor.y);
        sprite.tint = tint;
        sprite.width = child.widget.width;
        sprite.height = child.widget.height;
        container.addChild(sprite);
      }
      root.addChild(container);
      this.sprites.set(name, { container, base: child });
    }
  }

  private applyLayout(layout: ScoreHighRankEffectLayoutState): void {
    const app = this.app;
    const root = this.root;
    if (!app || !root) {
      return;
    }
    app.renderer.resize(Math.max(1, layout.screenWidth), Math.max(1, layout.screenHeight));
    root.position.set(layout.rootX, layout.rootY);
    root.scale.set(Math.max(0.001, layout.nguiScale));
    this.applyPanelClip(layout);
    app.render();
  }

  private applyPanelClip(layout: ScoreHighRankEffectLayoutState): void {
    const clip = EFFECT_DATA.scoreRatioClip;
    const scoreRatio = clamp01(layout.scoreRatio);
    const rightAnchorAbsolute = scoreRatio >= 1
      ? clip.scoreRatioFullRightAnchorAbsolute
      : Math.trunc(scoreRatio * clip.scoreRatioRightAnchorScale);
    const targetX = clip.anchorTarget.localPosition.x;
    const leftLocalX = targetX + clip.panel.anchors.left.absolute;
    const rightLocalX = targetX + rightAnchorAbsolute;
    const width = Math.max(0, rightLocalX - leftLocalX);
    const [, clipCenterY, , clipHeight] = clip.panel.clipRange;
    const topLocalY = clipCenterY + (clipHeight * 0.5);
    const bottomLocalY = clipCenterY - (clipHeight * 0.5);
    this.softClipFilter.padding = Math.ceil(Math.max(
      clip.panel.clipSoftness[0],
      clip.panel.clipSoftness[1],
    ) * layout.nguiScale);
    const left = layout.rootX + (leftLocalX * layout.nguiScale);
    const top = layout.rootY - (topLocalY * layout.nguiScale);
    const right = left + (width * layout.nguiScale);
    const bottom = layout.rootY - (bottomLocalY * layout.nguiScale);
    // Source chain:
    // Score.onChangeScoreRatio -> rightAnchor.absolute = int(ratio * 422)
    // -> UIDrawCall.SetClipping(_ClipRangeN/_ClipArgsN)
    // -> GLES soft-clip fragment alpha. The shader applies the edge factor per
    // fragment, so do not use a Graphics hard mask or per-sprite center alpha.
    if (this.root) {
      const scale = Math.max(0.001, layout.nguiScale);
      // Pixi filterArea is expressed in the filtered container's local space
      // and then transformed by worldTransform. Use the inverse of root's
      // current projection so the filter input covers the whole canvas, while
      // the shader below still clips by the recovered NGUI panel rectangle.
      this.root.filterArea = new Rectangle(
        -layout.rootX / scale,
        -layout.rootY / scale,
        layout.screenWidth / scale,
        layout.screenHeight / scale,
      );
    }
    this.softClipFilter.setPanelClipBounds(
      left,
      top,
      right,
      bottom,
      Math.max(0, clip.panel.clipSoftness[0]) * layout.nguiScale,
      Math.max(0, clip.panel.clipSoftness[1]) * layout.nguiScale,
    );
  }

  private startRenderLoop(): void {
    if (this.rafId) {
      return;
    }
    const tick = () => {
      this.rafId = 0;
      this.renderAnimationFrame(performance.now());
      if (this.currentClipName && !this.isDestroyed) {
        this.rafId = window.requestAnimationFrame(tick);
      }
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private stopRenderLoop(): void {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private renderAnimationFrame(nowMs: number): void {
    const app = this.app;
    const clipName = this.currentClipName;
    if (!app || !clipName) {
      return;
    }
    const clip = EFFECT_DATA.clips[clipName];
    const elapsedSeconds = Math.max(0, (nowMs - this.currentStartedAtMs) / 1000);
    const clipDuration = Math.max(1e-6, clip.stopTime);
    const clipTime = clip.loopTime ? elapsedSeconds % clipDuration : Math.min(elapsedSeconds, clipDuration);

    for (const [name, sprite] of this.sprites) {
      this.applyChildFrame(name, sprite, clipTime, elapsedSeconds);
    }
    app.render();
  }

  private applyChildFrame(
    name: HighRankChildName,
    sprite: ChildSprite,
    clipTime: number,
    elapsedSeconds: number,
  ): void {
    const curves = this.currentCurveMap[name] ?? {};
    const base = sprite.base;
    const position = curves.position ?? {};
    const scale = curves.scale ?? {};
    const rotation = curves.rotationEuler ?? {};
    const x = evaluateCurve(position.x, clipTime) ?? base.localPosition.x;
    const y = evaluateCurve(position.y, clipTime) ?? base.localPosition.y;
    const scaleX = evaluateCurve(scale.x, clipTime) ?? base.localScale.x;
    const scaleY = evaluateCurve(scale.y, clipTime) ?? base.localScale.y;
    const rotationZ = evaluateCurve(rotation.z, clipTime) ?? 0;
    const active = evaluateCurve(curves.active?.value, clipTime);

    sprite.container.position.set(x, -y);
    sprite.container.scale.set(scaleX, scaleY);
    sprite.container.rotation = -rotationZ * (Math.PI / 180);
    sprite.container.visible = active === null ? true : active > 0.5;

    const tween = EFFECT_DATA.tweenAlpha[name];
    const tweenToOverride = evaluateCurve(curves.tweenAlphaTo?.value, clipTime);
    const alpha = tween
      ? pingPongLinearTween(tween, elapsedSeconds, tweenToOverride)
      : base.widget.color[3];
    sprite.container.alpha = clamp01(alpha);
  }
}
