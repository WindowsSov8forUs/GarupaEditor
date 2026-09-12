import { Container, type Texture } from "pixi.js";
import profile from "../../engine/skin/stageSpeakers.json";
import type { OneFrameJudgementBatch } from "../../engine/data/oneFrameData";
import { stageSpeakerClipForJudgement } from "../../engine/rendering/stageSpeakerAnimation";
import { StageClipAnimation } from "../../engine/rendering/stageClipAnimation";
import { createStageImage } from "./pixiStageImage";

export class PixiStageSpeakers {
  readonly root = new Container({ label: "StageSpeakers" });
  private readonly speakers;
  constructor(texture: Texture, glow: Texture) {
    this.speakers = profile.speakers.map((source) => {
      const parent = new Container({ label: source.name });
      parent.position.set(source.parentPosition[0]!, -source.parentPosition[1]!);
      parent.scale.set(source.parentScale[0]!, source.parentScale[1]!);
      this.root.addChild(parent);
      const nodes = new Map<string, { container: Container; image: ReturnType<typeof createStageImage> | null }>();
      for (const node of source.nodes) {
        const container = new Container({ label: node.path, sortableChildren: true });
        const widget = node.widget;
        const image = widget === undefined ? null : createStageImage(widget.texture === "speaker" ? texture : glow, widget.width, widget.height, widget.additive);
        if (image !== null) { container.addChild(image.mesh); container.zIndex = widget!.depth; }
        (node.parent === null ? parent : nodes.get(node.parent)!.container).addChild(container);
        nodes.set(node.path, { container, image });
      }
      const animation = new StageClipAnimation(profile.clips, "idle");
      return { source, nodes, animation };
    });
    for (const speaker of this.speakers) this.publish(speaker, true);
  }

  reflect(batch: OneFrameJudgementBatch): void {
    for (const entry of batch.entries) {
      const clip = stageSpeakerClipForJudgement(entry.noteType, entry.rawResult);
      if (clip === null) continue;
      for (const button of entry.buttonTypes) {
        if (button !== 0 && button !== 6) continue;
        const speaker = this.speakers[button === 6 ? 1 : 0]!;
        speaker.animation.play(clip);
        this.publish(speaker, true);
      }
    }
  }

  advance(deltaSeconds: number): void {
    for (const speaker of this.speakers) if (speaker.animation.advance(deltaSeconds)) this.publish(speaker, false);
  }

  dispose(): void {
    for (const speaker of this.speakers) for (const node of speaker.nodes.values()) node.image?.dispose();
  }

  private publish(speaker: (typeof this.speakers)[number], reset: boolean): void {
    if (reset) for (const source of speaker.source.nodes) {
      const node = speaker.nodes.get(source.path)!;
      node.container.position.set(source.position[0]!, -source.position[1]!);
      node.container.scale.set(source.scale[0]!, source.scale[1]!);
      if (source.widget !== undefined) node.image!.setAlpha(source.widget.color[3]!);
    }
    for (const binding of speaker.animation.clip.bindings) {
      const node = speaker.nodes.get(binding.path)!;
      const values = speaker.animation.values;
      if (binding.property === "position") node.container.position.set(values[binding.index]!, -values[binding.index + 1]!);
      else if (binding.property === "scale") node.container.scale.set(values[binding.index]!, values[binding.index + 1]!);
      else node.image!.setAlpha(values[binding.index]!);
    }
  }
}
