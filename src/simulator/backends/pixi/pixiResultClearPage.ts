import { isSerializedTouchRelease } from "../../../components/SerializedButtonInput";
import labelLayouts from "../../../data/simulator/resultLabelLayoutProfile.json";
import { Container, Graphics, type NineSliceSprite, type Texture } from "pixi.js";
import { createSerializedButtonPressCover, PixiSerializedButtonInput } from "../../../components/pixi/SerializedButton";
import profile from "../../../data/simulator/resultClearProfile.json";
import { StageClipAnimation } from "../../engine/rendering/stageClipAnimation";
import type { SimulatorResultRecord } from "../../host/resultPresentation";
import { ManualTouchPhase, type ManualInputFrame } from "../../engine/data/manualInput";
import { PixiResultWidgetGraph, type ResultWidgetResources } from "./pixiResultWidgetGraph";
import { PixiResultNumberLabel } from "./pixiResultNumberLabel";
import effects from "../../../data/simulator/resultEffectsProfile.json";
import { PixiResultParticles } from "./pixiResultParticles";
import { PixiStageLights } from "./pixiStageLights";
import type { OriginalSurfaceLayout } from "../../scene/originalSurfaceLayout";
import { RESULT_BUTTON_COLLIDER } from "../../scene/resultButtonProfile";

const middle = "ComponentRoot/ClearJudgement/Window/MiddleContainer";
const scoreRoot = middle + "/TotalScoreComponentRoot/TotalScoreInfo";
const gaugeRoot = scoreRoot + "/ScoreGauge";
const nextPath = middle + "/NextButton";
export type ResultClearAction = "stay" | "success" | "failed" | "decide-next" | "show-detail";

/** SoloClearJudgement and the transition into MyResultDetail, without account rewards. */
export class PixiResultClearPage {
  readonly root = new Container();
  private readonly widgets: PixiResultWidgetGraph;
  private readonly banner: PixiResultWidgetGraph;
  private readonly ranks: PixiResultWidgetGraph[] = [];
  private readonly bannerAnimation: StageClipAnimation;
  private readonly nextAnimation = new StageClipAnimation(profile.clips, "next");
  private readonly gaugeMask = new Graphics();
  private readonly targetRatio: number;
  private readonly failed: boolean;
  private readonly scoreLabel: PixiResultNumberLabel;
  private phase: "waiting" | "evaluating" | "next" | "transition" = "waiting";
  private elapsed = 0;
  private gaugeProgress = -1;
  private readonly skipPresses = new Set<number>();
  private readonly nextButton: PixiSerializedButtonInput;
  private readonly particles: PixiResultParticles;
  private readonly lights: PixiStageLights | null;
  private shineElapsed: number | null = null;

  constructor(private readonly result: SimulatorResultRecord, resources: ResultWidgetResources,
    private readonly viewportHeight: number, layout: OriginalSurfaceLayout, sceneRoot: Container,
    stageLight: Texture, particleTexture: (name: string) => Texture) {
    this.failed = result.record.score < result.scoreThresholds.scoreC;
    this.targetRatio = Math.min(1, result.record.score / result.scoreThresholds.scoreMaximum);
    this.bannerAnimation = new StageClipAnimation(effects.bannerClips,
      result.isEnablePractice ? "practice" : this.failed ? "failed" : "success");
    this.widgets = new PixiResultWidgetGraph(profile.clearNodes, resources, labelLayouts["result-clear.json"].clearNodes, [gaugeRoot + "/RankObjectRoot"]);
    this.banner = new PixiResultWidgetGraph(effects.bannerNodes, resources, labelLayouts["result-effects.json"].bannerNodes,
      effects.particles.bundles[0]!.systems.filter(s => s.root === "result:banner").map(s => s.path));
    this.lights = result.isEnablePractice ? null : new PixiStageLights(stageLight, effects);
    if (this.lights !== null) this.widgets.root.addChildAt(this.lights.root, 0);
    this.particles = new PixiResultParticles(this.banner, "banner", layout, particleTexture);
    sceneRoot.addChild(this.particles.root);
    this.root.addChild(this.widgets.root, this.banner.root);
    this.banner.apply(this.bannerAnimation); this.banner.root.visible = false;
    this.widgets.nodes.get(nextPath)!.visible = false;
    const nextNode = this.widgets.nodes.get(nextPath)!;
    const cover = createSerializedButtonPressCover(this.widgets.sprites.get(nextPath)! as NineSliceSprite, nextPath + "/Cover");
    nextNode.addChild(cover); this.widgets.order.attach(cover);
    this.nextButton = new PixiSerializedButtonInput(nextNode, sceneRoot, cover, RESULT_BUTTON_COLLIDER);
    const label = profile.clearNodes.find(n => n.path === scoreRoot + "/Background/Score")!.label!;
    this.scoreLabel = new PixiResultNumberLabel(resources.font, label.fontSize, label.spacing, label.size[0]!, 7, 0xff3b72);
    this.widgets.replaceNumber(scoreRoot + "/Background/Score", this.scoreLabel);
    this.widgets.sprites.get(gaugeRoot + "/Mask")!.mask = this.gaugeMask;
    this.widgets.nodes.get(gaugeRoot + "/Mask")!.addChild(this.gaugeMask);
    this.setScore(0);
    const width = this.widgets.sprites.get(gaugeRoot + "/Gauge")!.width;
    for (const [name, score] of [["C", result.scoreThresholds.scoreC], ["B", result.scoreThresholds.scoreB],
      ["A", result.scoreThresholds.scoreA], ["S", result.scoreThresholds.scoreS], ["SS", result.scoreThresholds.scoreSS]] as const) {
      const rank = new PixiResultWidgetGraph(profile.rankNodes, resources, labelLayouts["result-clear.json"].rankNodes, [], this.widgets.order);
      rank.root.x = score / result.scoreThresholds.scoreMaximum * width;
      rank.setText("Label", name);
      this.widgets.nodes.get(gaugeRoot + "/RankObjectRoot")!.addChild(rank.root); this.ranks.push(rank);
    }
  }

  advance(delta: number, input: ManualInputFrame | null): ResultClearAction {
    this.lights?.advance(delta);
    this.advanceShine(delta);
    const action = this.advanceContent(delta, input);
    this.particles.advance(delta);
    return action;
  }

  private advanceContent(delta: number, input: ManualInputFrame | null): ResultClearAction {
    for (const touch of input?.touches ?? []) {
      const x = touch.position.x, y = this.viewportHeight - touch.position.y;
      if (touch.phase === ManualTouchPhase.Began) {
        if (this.phase === "waiting" || this.phase === "evaluating") this.skipPresses.add(touch.fingerId);
        else if (this.phase === "next" && this.widgets.enabled.get(nextPath) === true) this.nextButton.press(touch.fingerId, x, y);
      } else if (isSerializedTouchRelease(touch.phase)) {
        const skip = this.skipPresses.delete(touch.fingerId);
        const clicked = this.nextButton.release(touch.fingerId, x, y);
        if (skip && (this.phase === "waiting" || this.phase === "evaluating")) {
          // AnimationChain propagates Skip only after starting the next chain.
          const action = this.phase === "waiting" ? this.startEvaluation() : "stay";
          this.finishEvaluation(); return action;
        }
        if (clicked && this.phase === "next") {
          this.phase = "transition"; this.elapsed = 0; this.nextButton.clear(); return "decide-next";
        }
      }
    }
    this.elapsed += delta;
    if (this.phase === "waiting") {
      if (this.elapsed < 0.7) return "stay";
      return this.startEvaluation();
    }
    if (this.phase === "evaluating") {
      this.bannerAnimation.advance(delta); this.banner.apply(this.bannerAnimation);
      this.setScore(Math.min(this.elapsed / 0.5, 1));
      if (this.elapsed >= this.bannerAnimation.clip.duration) this.finishEvaluation();
    } else if (this.phase === "next") {
      if (this.nextAnimation.advance(delta)) this.widgets.apply(this.nextAnimation, nextPath);
    } else if (this.phase === "transition") {
      // DOTween SetEase(Linear): only the evaluation content leaves; the header stays.
      this.widgets.root.x = -1600 * Math.min(this.elapsed / 0.25, 1);
      if (this.elapsed >= 0.5) return "show-detail";
    }
    return "stay";
  }

  dispose(): void {
    this.particles.dispose();
    for (const rank of this.ranks) rank.dispose();
    this.nextButton.clear();
    this.widgets.dispose(); this.banner.dispose(); this.root.destroy(); this.skipPresses.clear();
  }

  private finishEvaluation(): void {
    this.setScore(1);
    this.bannerAnimation.advance(this.bannerAnimation.clip.duration); this.banner.apply(this.bannerAnimation);
    this.banner.root.visible = false;
    this.widgets.nodes.get(nextPath)!.visible = true;
    this.widgets.apply(this.nextAnimation, nextPath);
    this.phase = "next"; this.elapsed = 0; this.skipPresses.clear(); this.nextButton.clear();
  }

  private setScore(progress: number): void {
    if (progress === this.gaugeProgress) return;
    this.gaugeProgress = progress;
    this.scoreLabel.setText(String(Math.floor(this.result.record.score * progress)));
    const mask = this.widgets.sprites.get(gaugeRoot + "/Mask")!;
    const left = this.targetRatio * progress * mask.width;
    // UISlider RightToLeft crops the remaining mask, keeping the score texture fixed.
    this.gaugeMask.clear().rect(left, -mask.height / 2, mask.width - left, mask.height).fill(0xffffff);
  }

  private startEvaluation(): "success" | "failed" {
    this.phase = "evaluating"; this.elapsed = 0;
    this.banner.root.visible = true;
    const showShine = !this.failed && !this.result.isAutoLive;
    this.widgets.nodes.get(gaugeRoot + "/GaugeShine")!.visible = showShine;
    this.widgets.sprites.get(gaugeRoot + "/GaugeShine")!.alpha = effects.gaugeShine.start;
    this.shineElapsed = showShine ? 0 : null;
    // Auto's playEffectsOnStart bypasses rank effects but still plays success SE.
    return this.failed && !this.result.isAutoLive ? "failed" : "success";
  }

  private advanceShine(delta: number): void {
    if (this.shineElapsed === null) return;
    const { duration, start, end } = effects.gaugeShine;
    this.shineElapsed += delta;
    const progress = Math.max(0, 1 - Math.abs(this.shineElapsed / duration - 1));
    this.widgets.sprites.get(gaugeRoot + "/GaugeShine")!.alpha = start + (end - start) * progress;
    if (this.shineElapsed >= duration * 2) this.shineElapsed = null;
  }
}
