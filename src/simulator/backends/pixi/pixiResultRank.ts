import labelLayouts from "../../../data/simulator/resultLabelLayoutProfile.json";
import { StageClipAnimation } from "../../engine/rendering/stageClipAnimation";
import { rankForScore } from "../../engine/managers/singlePlayScoreGauge";
import { LiveClearRank } from "../../engine/data/singlePlayScoreGauge";
import profile from "../../../data/simulator/resultEffectsProfile.json";
import type { SimulatorResultRecord } from "../../host/resultPresentation";
import type { OriginalSurfaceLayout } from "../../scene/originalSurfaceLayout";
import { PixiResultWidgetGraph, type ResultWidgetResources } from "./pixiResultWidgetGraph";
import { PixiResultParticles } from "./pixiResultParticles";
import type { Container, RenderLayer, Texture } from "pixi.js";

/** ScoreRankIconAnimator; account clear-status upgrades are a separate original owner. */
export class PixiResultRank {
  readonly graph: PixiResultWidgetGraph;
  private readonly animation: StageClipAnimation;
  private readonly selection: { appear: string; loop: string };
  private readonly particles: PixiResultParticles;
  private elapsed = 0;
  private appearing = false;
  private playing = false;
  private rotation = 0;

  constructor(result: SimulatorResultRecord, resources: ResultWidgetResources, order: RenderLayer,
    layout: OriginalSurfaceLayout, sceneRoot: Container, particleTexture: (name: string) => Texture) {
    const value = rankForScore(result.record.score, result.scoreThresholds);
    const rank = Object.entries(LiveClearRank).find(([, rank]) => rank === value)![0] as keyof typeof profile.rankSelection;
    const selection = profile.rankSelection[rank]; this.selection = selection;
    const anchors = profile.particles.bundles[0]!.systems.filter(s => s.root === "result:rank").map(s => s.path);
    this.graph = new PixiResultWidgetGraph(profile.rankNodes, resources, labelLayouts["result-effects.json"].rankNodes, anchors, order);
    const icon = this.graph.sprites.get("rankBase/rankSprite")!;
    icon.texture = resources.texture("menu", selection.sprite);
    icon.width = icon.texture.width; icon.height = icon.texture.height;
    this.animation = new StageClipAnimation(profile.rankClips, selection.appear);
    this.graph.apply(this.animation); this.graph.root.visible = false;
    this.particles = new PixiResultParticles(this.graph, "rank", layout, particleTexture);
    sceneRoot.addChild(this.particles.root);
  }

  play(onlyLoop = false): void {
    this.playing = true; this.appearing = !onlyLoop; this.elapsed = 0;
    this.graph.root.visible = true;
    this.graph.resetAnimationDefaults();
    this.animation.play(onlyLoop ? this.selection.loop : this.selection.appear);
    this.graph.apply(this.animation);
    this.graph.setEuler("rankBase/circleLight", [0, 0, this.rotation]);
  }

  advance(delta: number): void {
    if (!this.playing) return;
    this.elapsed += delta;
    if (this.animation.advance(delta)) this.graph.apply(this.animation);
    if (this.appearing && this.elapsed >= this.animation.clip.duration) {
      this.appearing = false; this.graph.resetAnimationDefaults();
      this.animation.play(this.selection.loop); this.graph.apply(this.animation);
    }
    if (this.graph.nodes.get("rankBase")!.visible && this.graph.nodes.get("rankBase/circleLight")!.visible) {
      this.rotation = (this.rotation + 1) % 360;
    }
    this.graph.setEuler("rankBase/circleLight", [0, 0, this.rotation]);
    this.particles.advance(delta);
  }

  dispose(): void { this.particles.dispose(); this.graph.dispose(); }
}
