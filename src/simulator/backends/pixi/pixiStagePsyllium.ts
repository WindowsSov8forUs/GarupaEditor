import { Container, GlProgram, Mesh, MeshGeometry, Shader, type Texture } from "pixi.js";
import profile from "../../engine/skin/stagePsyllium.json";
import { StagePsylliumAnimation } from "../../engine/rendering/stagePsylliumAnimation";
import { srgbChannelToLinear } from "./hud/nguiMaterialPipeline";
import { pixiFlashBlendMode } from "./pixiFlashBlend";
import type { StartupStagePhase } from "../../scene/startupDirectionScene";
import type { StagePsylliumCommand } from "../../engine/data/stageCommand";

let program: GlProgram | null = null;

/** One retained batch for the original 73 pairs; no per-frame object creation. */
export class PixiStagePsyllium {
  readonly root = new Container({ label: "StagePsyllium" });
  private readonly animation = new StagePsylliumAnimation();
  private readonly positions = new Float32Array(profile.positions.length * profile.nodes.length * 8);
  private readonly colors = new Float32Array(profile.positions.length * profile.nodes.length * 16);
  private readonly poses = profile.nodes.map(node => ({
    x: node.position[0]!, y: node.position[1]!, cosine: 1, sine: 0, sx: 1, sy: 1,
    indices: Object.fromEntries(Object.entries(profile.clips).map(([name, clip]) => [name, {
      position: clip.bindings.find(b => b.path === node.path && b.property === "position")!.index,
      rotation: clip.bindings.find(b => b.path === node.path && b.property === "euler")!.index,
      scale: clip.bindings.find(b => b.path === node.path && b.property === "scale")?.index,
      alpha: clip.bindings.find(b => b.path === node.path && b.property === "alpha")?.index,
      active: clip.bindings.find(b => b.path === node.path && b.property === "active")?.index,
    }])),
  }));
  private readonly mesh;
  private phase: StartupStagePhase = "dark";
  private transformCompleted = false;

  constructor(texture: Texture) {
    const quads = profile.positions.length * profile.nodes.length;
    const uvs = new Float32Array(quads * 8), indices = new Uint32Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      const rect = profile.nodes[Math.floor(i / profile.positions.length)]!.uvRect;
      const left = rect[0]!, right = left + rect[2]!;
      const top = 1 - rect[1]! - rect[3]!, bottom = 1 - rect[1]!;
      uvs.set([left, top, right, top, right, bottom, left, bottom], i * 8);
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const geometry = new MeshGeometry({ positions: this.positions, uvs, indices });
    geometry.addAttribute("aStageColor", { buffer: this.colors, format: "float32x4" });
    program ??= GlProgram.from({ name: "stage-psyllium-batch", vertex: `
      in vec2 aPosition; in vec2 aUV; in vec4 aStageColor; out vec2 vUV; out vec4 vColor;
      uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
      void main() { vec3 p = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
        gl_Position = vec4(p.xy, 0.0, 1.0); vUV = aUV; vColor = aStageColor; }`, fragment: `
      in vec2 vUV; in vec4 vColor; out vec4 finalColor; uniform sampler2D uTexture;
      void main() { finalColor = texture(uTexture, vUV) * vColor; }`,
    });
    this.mesh = new Mesh({ texture, geometry, shader: new Shader({ glProgram: program,
      resources: { uTexture: texture.source, uSampler: texture.source.style } }) });
    this.mesh.blendMode = pixiFlashBlendMode(false);
    this.root.addChild(this.mesh);
    this.publish();
  }

  beginFade(): void { if (this.animation.beginFade()) this.publish(); }

  executeCommand(command: StagePsylliumCommand | null, speed: number): void {
    this.animation.executeCommand(command, speed);
    this.publish();
  }

  advance(deltaSeconds: number): void {
    if (this.animation.advance(deltaSeconds)) this.publish();
  }

  updateStage(phase: StartupStagePhase, progress: number, width: number, height: number, speed: number): void {
    this.animation.speed = speed;
    if (phase === "leaving" && this.phase !== "leaving") {
      this.animation.beginClear();
      this.transformCompleted = false;
      this.publish();
    }
    const complete = phase === "idle" || (phase === "leaving" && progress === 0);
    if (complete && !this.transformCompleted) {
      // The original tests the main widget's inward upper corner, not its centre.
      const pose = this.poses[0]!;
      for (let i = 0; i < profile.positions.length; i++) {
        const source = profile.positions[i]!;
        const sx = source.scale[0]! * (source.mirror ? -1 : 1);
        const x = source.position[0]! * sx > 0 ? -profile.nodes[0]!.width / 2 : profile.nodes[0]!.width / 2;
        const y = profile.nodes[0]!.height;
        const worldX = this.root.x + (source.position[0]! + (pose.x + pose.cosine * x - pose.sine * y) * sx) * this.root.scale.x;
        const worldY = this.root.y - (source.position[1]! + (pose.y + pose.sine * x + pose.cosine * y) * source.scale[1]!) * this.root.scale.y;
        if (!(worldX >= 0 && worldX < width && worldY > 0 && worldY <= height)) this.animation.hide(i);
      }
      this.transformCompleted = true;
      this.publish();
    }
    this.phase = phase;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.shader!.destroy(false);
    this.mesh.geometry.destroy(true);
    this.mesh.destroy();
  }

  private publish(): void {
    this.mesh.visible = this.animation.hasVisible;
    const values = this.animation.animation.values;
    for (let n = 0; n < profile.nodes.length; n++) {
      const node = profile.nodes[n]!, pose = this.poses[n]!;
      const indices = pose.indices[this.animation.clipName]!;
      pose.x = values[indices.position]!; pose.y = values[indices.position + 1]!;
      const angle = values[indices.rotation + 2]! * Math.PI / 180;
      pose.cosine = Math.cos(angle); pose.sine = Math.sin(angle);
      pose.sx = indices.scale === undefined ? node.scale[0]! : values[indices.scale]!;
      pose.sy = indices.scale === undefined ? node.scale[1]! : values[indices.scale + 1]!;
      const visible = indices.active === undefined || values[indices.active]! >= 0.5;
      for (let i = 0; i < profile.positions.length; i++) {
        const factor = this.animation.colorFactors[i]!;
        const color = n === 0 ? this.animation.mainColors : profile.coreColor, offset = n === 0 ? i * 3 : 0;
        const r = srgbChannelToLinear(color[offset]! * factor);
        const g = srgbChannelToLinear(color[offset + 1]! * factor);
        const b = srgbChannelToLinear(color[offset + 2]! * factor);
        const source = profile.positions[i]!, quad = n * profile.positions.length + i;
        const sx = source.scale[0]! * (source.mirror ? -1 : 1), sy = source.scale[1]!;
        for (let corner = 0; corner < 4; corner++) {
          const x = (corner === 0 || corner === 3 ? -0.5 : 0.5) * node.width * pose.sx;
          const y = (corner < 2 ? 1 : 0) * node.height * pose.sy;
          const vertex = quad * 4 + corner;
          this.positions[vertex * 2] = source.position[0]! + (pose.x + pose.cosine * x - pose.sine * y) * sx;
          this.positions[vertex * 2 + 1] = -(source.position[1]! + (pose.y + pose.sine * x + pose.cosine * y) * sy);
          this.colors[vertex * 4] = r; this.colors[vertex * 4 + 1] = g; this.colors[vertex * 4 + 2] = b;
          this.colors[vertex * 4 + 3] = visible ?
            (indices.alpha === undefined ? this.animation.alphas[i]! : values[indices.alpha]!) * this.animation.active[i]! : 0;
        }
      }
    }
    this.mesh.geometry.getBuffer("aPosition").update();
    this.mesh.geometry.getBuffer("aStageColor").update();
  }
}
