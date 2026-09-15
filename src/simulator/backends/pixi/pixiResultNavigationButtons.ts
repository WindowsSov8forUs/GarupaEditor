import { isSerializedTouchRelease } from "../../../components/SerializedButtonInput";
import { Container, NineSliceSprite } from "pixi.js";
import { ManualTouchPhase, type ManualInputFrame } from "../../engine/data/manualInput";
import { StageClipAnimation } from "../../engine/rendering/stageClipAnimation";
import navigation from "../../../data/simulator/resultNavigationProfile.json";
import { RESULT_BUTTON_COLLIDER } from "../../scene/resultButtonProfile";
import { createSerializedButtonPressCover, PixiSerializedButtonInput } from "../../../components/pixi/SerializedButton";
import { PixiResultWidgetGraph, type ResultWidgetNode, type ResultWidgetResources } from "./pixiResultWidgetGraph";
import type { OriginalLabelLayout } from "./hud/nguiTextLayout";

type Decision = "decide-exit" | "decide-replay";

/** Original PlayAgainButton/NextButton share StarUIButton input and showNextButton. */
export class PixiResultNavigationButtons {
  readonly graph: PixiResultWidgetGraph;
  readonly root: Container;
  private readonly animation = new StageClipAnimation(navigation.clips, "button");
  private readonly buttons: readonly { path: string; decision: Decision; input: PixiSerializedButtonInput }[];
  private started = false;

  constructor(nodes: readonly ResultWidgetNode[], resources: ResultWidgetResources, coordinateRoot: Container,
    private readonly viewportHeight: number, bindings: readonly { path: string; decision: Decision }[],
    labelLayouts: Readonly<Record<string, OriginalLabelLayout>>) {
    this.graph = new PixiResultWidgetGraph(nodes, resources, labelLayouts);
    this.root = this.graph.root;
    this.root.visible = false;
    this.buttons = bindings.map(b => {
      const node = this.graph.nodes.get(b.path)!;
      const cover = createSerializedButtonPressCover(this.graph.sprites.get(b.path)! as NineSliceSprite, b.path + "/Cover");
      node.addChild(cover); this.graph.order.attach(cover);
      return { ...b, input: new PixiSerializedButtonInput(node, coordinateRoot, cover, RESULT_BUTTON_COLLIDER) };
    });
  }

  show(finished = false): void {
    if (!this.started) {
      this.started = true; this.root.visible = true;
      // The result controller activates selected buttons; showNextButton only
      // animates scale and collider state, leaving the prefab's inactive OK hidden.
      for (const b of this.buttons) this.graph.nodes.get(b.path)!.visible = true;
    }
    if (finished) this.animation.advance(this.animation.clip.duration);
    this.apply();
  }

  advance(delta: number, frame: ManualInputFrame | null): Decision | "stay" {
    if (!this.started) return "stay";
    this.animation.advance(delta); this.apply();
    for (const touch of frame?.touches ?? []) {
      const x = touch.position.x, y = this.viewportHeight - touch.position.y;
      for (const b of this.buttons) {
        if (touch.phase === ManualTouchPhase.Began && this.graph.enabled.get(b.path) === true) b.input.press(touch.fingerId, x, y);
        else if (isSerializedTouchRelease(touch.phase) && b.input.release(touch.fingerId, x, y)) {
          this.clear(); return b.decision;
        }
      }
    }
    return "stay";
  }

  clear(): void { for (const b of this.buttons) b.input.clear(); }
  dispose(): void { this.clear(); this.graph.dispose(); }
  private apply(): void { for (const b of this.buttons) this.graph.apply(this.animation, b.path); }
}
