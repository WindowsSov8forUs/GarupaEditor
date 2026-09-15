import { isSerializedTouchRelease } from "../../../components/SerializedButtonInput";
import { Container, NineSliceSprite, RenderLayer, Sprite, Text, TilingSprite, type Texture } from "pixi.js";
import headerProfile from "../../../data/simulator/resultHeaderProfile.json";
import labelLayouts from "../../../data/simulator/resultLabelLayoutProfile.json";
import { fitNguiWidgetText, type OriginalLabelLayout } from "./hud/nguiTextLayout";
import mediaProfile from "../../../data/simulator/resultMediaProfile.json";
import type { PreparedSessionPresentation } from "../../assembly/sessionPresentationDerivation";
import profile from "../../../data/simulator/resultDetailProfile.json";
import type { OriginalSurfaceLayout } from "../../scene/originalSurfaceLayout";
import { ManualTouchPhase, type ManualInputFrame } from "../../engine/data/manualInput";
import type { SimulatorResultRecord } from "../../host/resultPresentation";
import { StageClipAnimation } from "../../engine/rendering/stageClipAnimation";
import clearProfile from "../../../data/simulator/resultClearProfile.json";
import { PixiResultClearPage } from "./pixiResultClearPage";
import { PixiResultWidgetGraph } from "./pixiResultWidgetGraph";
import { DIFFICULTY_LABEL_STYLE } from "../../scene/difficultyLabelStyle";
import { PixiResultNumberLabel } from "./pixiResultNumberLabel";
import effectsProfile from "../../../data/simulator/resultEffectsProfile.json";
import { PixiResultRank } from "./pixiResultRank";
import { createSerializedButtonPressCover, createSerializedButtonSprite, PixiSerializedButtonInput } from "../../../components/pixi/SerializedButton";
import { RESULT_BUTTON_COLLIDER } from "../../scene/resultButtonProfile";
import { linearTintFromSrgbChannels, linearTintFromSrgbColor } from "./hud/nguiMaterialPipeline";
import navigation from "../../../data/simulator/resultNavigationProfile.json";
import { PixiResultNavigationButtons } from "./pixiResultNavigationButtons";

type NodeProfile = (typeof profile.nodes)[number] | (typeof navigation.unrecordNodes)[number];
type LabelProfile = NonNullable<NodeProfile["label"]>;
type CounterRole = "score" | "perfect" | "great" | "good" | "bad" | "miss" | "maxCombo" | "fast" | "slow";
const judgementPath = "RightContainer/MyResult/Detail/Judgement/";
const timingPath = judgementPath + "ResultFastSlowUIAnimationController/";
const buttonPath = "RightContainer/Buttons/NextButton";
const eventRoles: Readonly<Record<string, readonly CounterRole[]>> = {
  countUpScore: ["score"], countUpPerfect: ["perfect", "fast"], countUpGreat: ["great", "slow"],
  countUpGood: ["good"], countUpBad: ["bad"], countUpMiss: ["miss"], countUpCombo: ["maxCombo"],
};

/** Application-level decimal counting from LabelUtility.CountUpLabel. */
class ResultCounter {
  private remainder: number;
  private suffix = "";
  private digit = 1;
  private scale: StageClipAnimation | null = null;
  started = false;
  settled = false;
  private readonly number: PixiResultNumberLabel;
  readonly labelRoot: Container;

  constructor(private readonly owner: Container, label: LabelProfile,
    private readonly target: number, digits: number, font: string, private readonly initial: string) {
    this.remainder = target;
    this.number = new PixiResultNumberLabel(font, label.fontSize, label.spacing, label.size[0], digits,
      label.role === "score" ? 0xff3b72 : 0x505050);
    this.labelRoot = this.number.root;
    this.labelRoot.zIndex = label.depth;
    owner.addChild(this.labelRoot);
    this.setText(initial);
  }

  get counting(): boolean { return this.started && !this.settled && this.scale === null && this.target !== 0; }

  advance(delta: number): void {
    if (!this.started || this.settled) return;
    if (this.scale !== null) {
      if (!this.scale.advance(delta)) { this.settled = true; return; }
      this.owner.scale.set(this.scale.values[0]!, this.scale.values[1]!);
      return;
    }
    if (this.remainder <= 0) {
      if (this.target !== 0) this.setText(String(this.target));
      this.scale = new StageClipAnimation(profile.clips, "result_label_scale");
      this.owner.scale.set(this.scale.values[0]!, this.scale.values[1]!);
      return;
    }
    const lastDigit = this.remainder % 10;
    if (this.digit < lastDigit) this.setText(String(this.digit++) + this.suffix);
    else {
      this.suffix = String(lastDigit) + this.suffix;
      this.setText(this.suffix);
      this.remainder = Math.trunc(this.remainder / 10);
      this.digit = 1;
    }
  }

  finish(): void {
    this.started = true; this.settled = true;
    this.setText(this.target === 0 ? this.initial : String(this.target));
    this.owner.scale.set(1);
  }

  private setText(text: string): void {
    this.number.setText(text);
  }
}

export class PixiResultScene {
  readonly root = new Container({ label: "SimulatorResult", eventMode: "none" });
  private readonly graph = new Container();
  private readonly drawOrder = new RenderLayer({ sortableChildren: true });
  private readonly nodes = new Map<string, Container>();
  private readonly sprites = new Map<string, Sprite | NineSliceSprite | TilingSprite>();
  private readonly counters = new Map<CounterRole, ResultCounter>();
  private readonly sceneAnimation: StageClipAnimation;
  private readonly detailClip: typeof profile.clips.live_result_show_solo;
  private readonly timingAnimation = new StageClipAnimation(profile.clips, "ShowResultFastSlowUIAnimation");
  private elapsed = 0;
  private eventIndex = 0;
  private animationFinished = false;
  private settled = false;
  private readonly skipPresses = new Set<number>();
  private readonly exitButton: PixiSerializedButtonInput;
  private clearPage: PixiResultClearPage | null;
  private readonly headerExtras: PixiResultWidgetGraph;
  private readonly difficulty: PixiResultWidgetGraph;
  private readonly headerOrder = new RenderLayer({ sortableChildren: true });
  private readonly header = new Container({ label: "ResultHeader", sortableChildren: true });
  private readonly rank: PixiResultRank;
  private entryElapsed = 0;
  private readonly isAutoLive: boolean;
  private readonly isPractice: boolean;
  private readonly rewardButtons: PixiResultNavigationButtons;
  private readonly practiceReplay: PixiResultNavigationButtons | null;
  private rewardVisible = false;

  constructor(private readonly layout: OriginalSurfaceLayout, result: SimulatorResultRecord,
    presentation: Pick<PreparedSessionPresentation, "song" | "difficulty">, backgroundTexture: Texture,
    font: string, texture: (atlas: string, key: string) => Texture,
    border: (atlas: string, key: string) => Readonly<{ left: number; right: number; top: number; bottom: number }>,
    stageLight: Texture, particleTexture: (name: string) => Texture) {
    const scale = layout.ui.screenToSafeChildScale;
    const resources = { font, texture, border };
    this.isAutoLive = result.isAutoLive;
    this.isPractice = result.isEnablePractice;
    const unrecord = result.isAutoLive || result.isEnablePractice;
    const details = unrecord ? navigation.unrecordNodes : profile.nodes;
    const detailLabels: Readonly<Record<string, OriginalLabelLayout>> = unrecord
      ? labelLayouts["result-navigation.json"].unrecordNodes : labelLayouts["result-detail.json"].nodes;
    this.detailClip = unrecord ? navigation.clips.unrecord : profile.clips.live_result_show_solo;
    this.sceneAnimation = new StageClipAnimation({ show: this.detailClip }, "show");
    this.clearPage = new PixiResultClearPage(result, resources, layout.surface.viewportHeight, layout, this.root, stageLight, particleTexture);
    this.clearPage.root.position.set(layout.surface.viewportWidth / 2, layout.surface.viewportHeight / 2);
    this.clearPage.root.scale.set(scale);
    this.graph.position.set(layout.surface.viewportWidth / 2, layout.surface.viewportHeight / 2);
    this.graph.scale.set(scale);
    const background = new Sprite({ texture: backgroundTexture, anchor: 0.5 });
    background.position.copyFrom(this.graph.position);
    background.width = mediaProfile.background.widgetWidth * layout.ui.pixelsPerAuthoredUnit;
    background.height = mediaProfile.background.widgetHeight * layout.ui.pixelsPerAuthoredUnit;
    this.root.addChild(background, this.graph);
    this.root.addChild(this.drawOrder);
    this.graph.visible = false;
    this.drawOrder.visible = false;
    this.root.addChild(this.clearPage.root);
    const r = result.record;
    const omitScore = result.isDemoPlayMode || r.moveTimeCount > 0;
    const omitJudge = result.isAutoLive || r.moveTimeCount > 0;
    const values: Record<CounterRole, number> = { score: omitScore ? 0 : r.score, perfect: omitJudge ? 0 : r.resultCounts[4], great: omitJudge ? 0 : r.resultCounts[3],
      good: omitJudge ? 0 : r.resultCounts[2], bad: omitJudge ? 0 : r.resultCounts[1], miss: omitJudge ? 0 : r.resultCounts[0], maxCombo: omitJudge ? 0 : r.maxCombo,
      fast: omitJudge ? 0 : r.fastCount, slow: omitJudge ? 0 : r.slowCount };
    const nodeEntries = details.map(n => {
      const node = new Container({ label: n.path, sortableChildren: true });
      node.position.set(n.position[0]!, -n.position[1]!); node.scale.set(n.scale[0]!, n.scale[1]!);
      node.visible = n.active;
      this.nodes.set(n.path, node);
      return { n, node };
    });
    // Authored static siblings can share a name (the judgment separator Lines).
    // Each serialized entry owns its container; unique animated paths still use the map.
    for (const { n, node } of nodeEntries) {
      (n.parent === null ? this.graph : this.nodes.get(n.parent)!).addChild(node);
      if (n.sprite !== undefined) {
        const s = n.sprite;
        const tex = texture(s.atlas, s.name);
        const anchor = { x: (s.pivot % 3) / 2, y: Math.floor(s.pivot / 3) / 2 };
        const edges = border(s.atlas, s.name);
        const sprite = s.type === 1 && (s.name === "button_pink" || s.name === "button_gray")
          ? createSerializedButtonSprite(tex, s.size, edges, anchor, n.path)
          : s.type === 1 ? new NineSliceSprite({ texture: tex,
          width: s.size[0], height: s.size[1], anchor,
          leftWidth: edges.left, rightWidth: edges.right, topHeight: edges.top, bottomHeight: edges.bottom })
          : s.type === 2 ? new TilingSprite({ texture: tex, anchor, width: s.size[0], height: s.size[1] })
          : new Sprite({ texture: tex, anchor, width: s.size[0], height: s.size[1] });
        // The five primary judgment sprites call MakePixelPerfect after binding the chosen skin atlas.
        if (s.atlas === "judge" && !n.path.includes("Name_ef") && !n.path.includes("ResultFastSlow")) {
          sprite.width = tex.width; sprite.height = tex.height;
        }
        sprite.tint = linearTintFromSrgbChannels(s.color[0]!, s.color[1]!, s.color[2]!);
        sprite.alpha = s.color[3]!; sprite.zIndex = s.depth;
        node.zIndex = s.depth;
        this.sprites.set(n.path, sprite); node.addChild(sprite); this.drawOrder.attach(sprite);
      }
      if (n.label !== undefined) {
        const l = n.label;
        if (l.role === "scoreTitle" || l.role === "next" || l.role === "caution" || l.role === "autoCaption") {
          const wording = navigation.wording;
          const caption = r.moveTimeCount > 0 ? wording.word_practice_caution_time_moved : result.isDemoPlayMode ? wording.word_practice_caution_demo
            : result.isAutoLive ? wording.word_resultDetail_caution_autoLive : wording.word_practice_caution;
          const value = l.role === "caution" ? caption : l.text;
          const text = new Text({ text: value, style: {
            fontFamily: font, fontSize: l.fontSize, letterSpacing: l.spacing,
            align: l.pivot % 3 === 0 ? "left" : l.pivot % 3 === 2 ? "right" : "center",
            fill: linearTintFromSrgbChannels(l.color[0]!, l.color[1]!, l.color[2]!),
          } });
          fitNguiWidgetText(text, l.size, l.pivot, detailLabels[n.path]!); text.zIndex = l.depth;
          text.alpha = l.color[3]!;
          if (l.role === "autoCaption") node.visible = result.isAutoLive;
          node.addChild(text); node.zIndex = l.depth; this.drawOrder.attach(text);
        } else if (l.role === "demoScore") {
          const placeholder = new PixiResultNumberLabel(font, l.fontSize, l.spacing, l.size[0], 7, 0xaaaaaa);
          placeholder.setText(""); node.addChild(placeholder.root); placeholder.root.zIndex = l.depth;
          this.drawOrder.attach(placeholder.root); node.visible = omitScore;
        } else {
          const role = l.role as CounterRole;
          const counter = new ResultCounter(node, l, values[role], role === "score" ? 7 : 4,
            font, omitJudge && role !== "score" ? "" : "0");
          if (role === "score") node.visible = !omitScore;
          this.counters.set(role, counter); this.drawOrder.attach(counter.labelRoot);
          node.zIndex = l.depth;
        }
      }
    }
    const exitNode = this.nodes.get(buttonPath)!;
    const exitCover = createSerializedButtonPressCover(this.sprites.get(buttonPath)! as NineSliceSprite, buttonPath + "/Cover");
    exitNode.addChild(exitCover); this.drawOrder.attach(exitCover);
    this.exitButton = new PixiSerializedButtonInput(exitNode, this.root, exitCover, RESULT_BUTTON_COLLIDER);
    this.rewardButtons = new PixiResultNavigationButtons(navigation.rewardNodes, resources, this.root, layout.surface.viewportHeight,
      [{ path: navigation.rewardNextPath, decision: "decide-exit" }, { path: navigation.rewardReplayPath, decision: "decide-replay" }], labelLayouts["result-navigation.json"].rewardNodes);
    this.rewardButtons.root.position.copyFrom(this.graph.position); this.rewardButtons.root.scale.set(scale);
    this.root.addChild(this.rewardButtons.root);
    this.practiceReplay = result.isEnablePractice ? new PixiResultNavigationButtons(navigation.unrecordReplayNodes, resources,
      this.root, layout.surface.viewportHeight, [{ path: navigation.unrecordReplayPath, decision: "decide-replay" }], labelLayouts["result-navigation.json"].unrecordReplayNodes) : null;
    if (this.practiceReplay !== null) this.graph.addChild(this.practiceReplay.root);
    // JudgeTimingController.changeToFastSlowUI, shared by manual and auto results.
    const comboBack = this.nodes.get(judgementPath + "COMBO/Back")!;
    comboBack.position.set(-1, 39);
    const back = this.sprites.get(judgementPath + "COMBO/Back")! as NineSliceSprite;
    back.texture = texture("menu", "bg_maxcombo_other");
    const b = border("menu", "bg_maxcombo_other");
    back.leftWidth = b.left; back.rightWidth = b.right; back.topHeight = b.top; back.bottomHeight = b.bottom;
    back.width = 154; back.height = 68;
    const name = this.nodes.get(judgementPath + "COMBO/Back/Name")!;
    name.position.set(0, -18);
    const nameSprite = this.sprites.get(judgementPath + "COMBO/Back/Name")!;
    nameSprite.texture = texture("menu", "maxcombo_wide"); nameSprite.width = nameSprite.texture.width; nameSprite.height = nameSprite.texture.height;
    this.nodes.get(judgementPath + "COMBO/Value")!.position.set(40, 53);
    this.applyAnimation(this.sceneAnimation);
    this.applyAnimation(this.timingAnimation, timingPath);
    const header = this.header;
    header.position.copyFrom(this.graph.position); header.scale.set(scale);
    this.root.addChild(header);
    for (const item of headerProfile) {
      const anchor = { x: (item.pivot % 3) / 2, y: Math.floor(item.pivot / 3) / 2 };
      let widget: NineSliceSprite | Text;
      if (item.sprite !== undefined) {
        const edges = border("menu", item.sprite);
        widget = new NineSliceSprite({ texture: texture("menu", item.sprite), anchor,
          width: item.size[0], height: item.size[1], leftWidth: edges.left, rightWidth: edges.right,
          topHeight: edges.top, bottomHeight: edges.bottom });
      } else {
        const value = item.role === "title" ? presentation.song.title : item.role === "level" ? String(presentation.difficulty.level) : "Lv.";
        widget = new Text({ text: value, style: { fontFamily: font, fontSize: item.fontSize,
          letterSpacing: item.spacing, fill: linearTintFromSrgbChannels(item.color[0]!, item.color[1]!, item.color[2]!),
          stroke: item.outline === undefined ? undefined : { color: 0xffffff, width: item.outline * 2 } } });
        const layouts: Readonly<Record<string, OriginalLabelLayout>> = labelLayouts["result-header.json"];
        fitNguiWidgetText(widget, item.size, item.pivot, layouts[item.role]!);
      }
      widget.position.set(item.position[0]!, -item.position[1]!); widget.zIndex = item.depth;
      widget.alpha = item.color[3]!;
      header.addChild(widget); this.headerOrder.attach(widget);
    }
    const rankAnchor = effectsProfile.rankAnchor;
    this.headerExtras = new PixiResultWidgetGraph([...clearProfile.headerNodes, rankAnchor], resources, labelLayouts["result-clear.json"].headerNodes,
      ["ComponentRoot/DifficultyLabelPos", rankAnchor.path], this.headerOrder);
    header.addChild(this.headerExtras.root);
    const clearRoot = "ComponentRoot/ClearStarRoot/";
    const clearName = { 1: "ClearStar", 2: "FullComboStar", 3: "APStar" }[result.clearStatus];
    for (const name of ["NoClearStar", "ClearStar", "FullComboStar", "APStar"]) {
      this.headerExtras.nodes.get(clearRoot + name)!.visible = name === clearName;
    }
    this.difficulty = new PixiResultWidgetGraph(clearProfile.difficultyNodes, resources, labelLayouts["result-clear.json"].difficultyNodes, [], this.headerOrder);
    this.headerExtras.nodes.get("ComponentRoot/DifficultyLabelPos")!.addChild(this.difficulty.root);
    const style = DIFFICULTY_LABEL_STYLE[presentation.difficulty.type];
    this.difficulty.nodes.get("Frame")!.visible = false; // DifficultyLabelObject.Setup(type, false)
    this.difficulty.sprites.get("Bg")!.tint = linearTintFromSrgbColor(style.background);
    this.difficulty.nodes.get("Difficulty")!.x = style.offsetX;
    const label = this.difficulty.labels.get("Difficulty")!;
    label.style.stroke = { color: linearTintFromSrgbColor(style.outline), width: 2 };
    label.style.letterSpacing = style.spacing;
    this.difficulty.setText("Difficulty", presentation.difficulty.type);
    this.rank = new PixiResultRank(result, resources, this.headerOrder, layout, this.root, particleTexture);
    this.headerExtras.nodes.get(rankAnchor.path)!.addChild(this.rank.graph.root);
    header.addChild(this.headerOrder);
    this.applyEntry();
  }

  /** Returns exit only on an explicit result-button release. */
  advance(delta: number, input: ManualInputFrame | null): "stay" | "decide-exit" | "decide-next" | "decide-replay" | "success" | "failed" {
    if (this.entryElapsed < 0.2) { this.entryElapsed = Math.min(0.2, this.entryElapsed + delta); this.applyEntry(); }
    this.rank.advance(delta);
    if (this.rewardVisible) return this.rewardButtons.advance(delta, input);
    if (this.clearPage !== null) {
      const action = this.clearPage.advance(delta, input);
      if ((action === "success" || action === "failed") && !this.isAutoLive) this.rank.play();
      if (action !== "show-detail") return action;
      this.clearPage.dispose(); this.clearPage = null;
      this.rank.play(true);
      this.graph.visible = true;
      this.drawOrder.visible = true;
      return "stay";
    }
    const replay = this.practiceReplay?.advance(delta, this.animationFinished ? input : null);
    if (replay === "decide-replay") { this.exitButton.clear(); return replay; }
    for (const touch of input?.touches ?? []) {
      const x = touch.position.x, y = this.layout.surface.viewportHeight - touch.position.y;
      if (touch.phase === ManualTouchPhase.Began) {
        if (!this.animationFinished) this.skipPresses.add(touch.fingerId);
        else this.exitButton.press(touch.fingerId, x, y);
      } else if (isSerializedTouchRelease(touch.phase)) {
        const skip = this.skipPresses.delete(touch.fingerId);
        const clicked = this.exitButton.release(touch.fingerId, x, y);
        if (skip) this.skip();
        else if (clicked) {
          this.exitButton.clear();
          if (this.isPractice) return "decide-exit";
          this.graph.visible = false; this.drawOrder.visible = false;
          this.rewardVisible = true; this.rewardButtons.show();
          return "decide-next";
        }
      }
    }
    if (this.settled) return "stay";
    this.elapsed += delta;
    if (!this.animationFinished) {
      this.sceneAnimation.advance(delta); this.applyAnimation(this.sceneAnimation);
      this.timingAnimation.advance(delta); this.applyAnimation(this.timingAnimation, timingPath);
      const events = this.detailClip.events;
      while (this.eventIndex < events.length && events[this.eventIndex]!.time <= this.elapsed) {
        const event = events[this.eventIndex++]!.name;
        if (event === "onShowNextButton") this.practiceReplay?.show();
        for (const role of eventRoles[event] ?? []) this.counters.get(role)!.started = true;
      }
      this.animationFinished = this.elapsed >= this.sceneAnimation.clip.duration;
    }
    for (const counter of this.counters.values()) counter.advance(delta);
    this.settled = this.animationFinished && [...this.counters.values()].every(counter => counter.settled);
    return "stay";
  }

  get isCounting(): boolean {
    if (this.rewardVisible) return false;
    for (const counter of this.counters.values()) if (counter.counting) return true;
    return false;
  }

  dispose(): void {
    this.clearPage?.dispose(); this.rank.dispose(); this.difficulty.dispose(); this.headerExtras.dispose();
    this.rewardButtons.dispose(); this.practiceReplay?.dispose();
    this.exitButton.clear(); this.skipPresses.clear(); this.drawOrder.detachAll(); this.headerOrder.detachAll(); this.root.destroy({ children: true });
  }

  private applyEntry(): void {
    // ScreenSlideInOut uses NGUI EaseOut, not DOTween OutCubic.
    const remaining = this.entryElapsed >= 0.2 ? 0 : 1 - Math.sin(this.entryElapsed / 0.2 * Math.PI / 2);
    const scale = this.layout.ui.screenToSafeChildScale;
    this.header.y = this.layout.surface.viewportHeight / 2 - 800 * remaining * scale;
    if (this.clearPage !== null) this.clearPage.root.x = this.layout.surface.viewportWidth / 2 +
      1200 * this.layout.starUi.widthBaseToScreenRatio * remaining * scale;
  }

  private skip(): void {
    this.sceneAnimation.advance(this.sceneAnimation.clip.duration); this.applyAnimation(this.sceneAnimation);
    this.timingAnimation.advance(this.timingAnimation.clip.duration); this.applyAnimation(this.timingAnimation, timingPath);
    for (const counter of this.counters.values()) counter.finish();
    this.animationFinished = true; this.settled = true;
    this.skipPresses.clear(); this.exitButton.clear();
    this.practiceReplay?.show(true);
  }

  private applyAnimation(animation: StageClipAnimation, prefix = ""): void {
    for (const b of animation.clip.bindings) {
      const node = this.nodes.get(prefix + b.path);
      if (node === undefined) continue;
      const v = animation.values; const i = b.index;
      if (b.property === "position") node.position.set(v[i]!, -v[i + 1]!);
      else if (b.property === "scale") node.scale.set(v[i]!, v[i + 1]!);
      else if (b.property === "active") node.visible = v[i]! !== 0;
      else if (b.property === "alpha") node.alpha = v[i]!;
      else if (b.property === "spriteAlpha") {
        const sprite = this.sprites.get(prefix + b.path);
        if (sprite !== undefined) sprite.alpha = v[i]!;
      }
    }
    if (this.practiceReplay !== null) {
      const source = this.nodes.get("RightContainer")!;
      const target = this.practiceReplay.graph.nodes.get("RightContainer")!;
      target.position.copyFrom(source.position); target.scale.copyFrom(source.scale); target.visible = source.visible;
    }
  }
}
