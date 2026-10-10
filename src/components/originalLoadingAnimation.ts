import profile from "../data/originalLoadingProfile.json";
import { OriginalPrefabModel, originalRef, type OriginalPrefab, type OriginalData } from "./originalPrefabModel";
import type { OriginalLoadingKind } from "./originalLoadingState";
import { ORIGINAL_PROGRESS_HIDE_THRESHOLD } from "./originalSpriteGeometry";

const prefabs = profile.prefabs as unknown as Record<string, OriginalPrefab>;

function evaluateCurve(keys: OriginalData[], factor: number): number {
  if (factor <= keys[0]!.time) return keys[0]!.value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (factor > b.time) continue;
    const span = b.time - a.time, t = (factor - a.time) / span;
    return (2 * t ** 3 - 3 * t ** 2 + 1) * a.value + (t ** 3 - 2 * t ** 2 + t) * span * a.outSlope
      + (-2 * t ** 3 + 3 * t ** 2) * b.value + (t ** 3 - t ** 2) * span * b.inSlope;
  }
  return keys[keys.length - 1]!.value;
}

/** Active prefab TweenPosition/TweenScale paths; do not activate the retained old Animator. */
export class OriginalLoadingAnimation {
  readonly prefab: OriginalPrefab;
  private readonly initial: OriginalPrefabModel;
  private readonly controller: OriginalData;
  private readonly tweens;
  private elapsed = 0;
  private periodTimer = 0;
  private periodPattern = 0;
  private started = false;
  constructor(readonly kind: OriginalLoadingKind) {
    this.prefab = prefabs[kind === "network" ? "networkindicator" : "transmitting"]!;
    this.initial = new OriginalPrefabModel(this.prefab);
    this.controller = this.prefab.components.find(c => c.kind === (kind === "network" ? "ScreenLayerNetworkIndicator" : "ScreenLayerTransmitting"))!.data;
    this.tweens = this.prefab.components.filter(c => ["TweenPosition", "TweenScale"].includes(c.kind)
      && c.data.m_Enabled && this.initial.isActive(c.node)).map(component => ({ component, factor: 0, direction: 1, sampled: false }));
  }
  step(delta: number) {
    this.periodTimer += delta;
    if (this.periodTimer >= Math.fround(0.3)) { this.periodTimer = 0; this.periodPattern = (this.periodPattern + 1) & 3; }
    if (!this.started) { this.started = true; delta = 0; }
    this.elapsed += delta;
    for (const tween of this.tweens) {
      const data = tween.component.data;
      if (this.elapsed < data.delay) continue;
      tween.sampled = true;
      tween.factor += delta / data.duration * tween.direction;
      // UITweener.DoUpdate, PingPong: reflect the overrun and reverse the increment.
      if (tween.factor > 1) { tween.factor = 1 - (tween.factor - Math.floor(tween.factor)); tween.direction *= -1; }
      else if (tween.factor < 0) { tween.factor = -tween.factor - Math.floor(-tween.factor); tween.direction *= -1; }
    }
  }
  model(progress?: number): OriginalPrefabModel {
    const c = this.controller;
    const nodes: Record<number, { active?: boolean; x?: number; y?: number; scaleX?: number; scaleY?: number }> = {};
    const components: Record<number, OriginalData> = {};
    const anchor = this.prefab.components.find(v => v.kind === (this.kind === "network" ? "StarUIAnchor" : "CameraAnchor"))!;
    nodes[anchor.node] = { x: 0, y: 0 };
    nodes[originalRef(c.downloadProgressParentObj)] = { active: progress !== undefined };
    nodes[originalRef(c.noticeObject)] = { y: progress === undefined ? 30 : 64 };
    components[originalRef(c.backGroundObject)] = { mHeight: progress === undefined ? 70 : 100 };
    components[originalRef(c.noticeLabel)] = { mText: ".".repeat(this.periodPattern) };
    const slider = this.initial.components.get(originalRef(c.oneProgress))!.data;
    const foreground = this.initial.components.get(originalRef(slider.mFG))!;
    components[foreground.id] = { mDrawRegion: { x: 0, y: 0, z: progress ?? 0, w: 1 } };
    nodes[foreground.node] = { active: progress !== undefined && progress >= ORIGINAL_PROGRESS_HIDE_THRESHOLD };
    // CameraAnchorSetting's screen-sized grayout is provided by the host, outside design scaling.
    if (this.kind === "transmitting") nodes[this.initial.nodeAt("Grayout").id] = { active: false };
    for (const tween of this.tweens) {
      if (!tween.sampled) continue;
      const { component } = tween, data = component.data;
      const amount = evaluateCurve(data.animationCurve.m_Curve, tween.factor);
      const value = (axis: "x" | "y") => data.from[axis] + (data.to[axis] - data.from[axis]) * amount;
      nodes[component.node] = { ...nodes[component.node], ...(component.kind === "TweenScale"
        ? { scaleX: value("x"), scaleY: value("y") } : { x: value("x"), y: value("y") }) };
    }
    return new OriginalPrefabModel(this.prefab, { nodes, components });
  }
}
