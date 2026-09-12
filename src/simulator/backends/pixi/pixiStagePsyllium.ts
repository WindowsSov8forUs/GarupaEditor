import { Container, GlProgram, Mesh, MeshGeometry, Shader, type Texture } from "pixi.js";
import profile from "../../engine/skin/stagePsyllium.json";
import { StagePsylliumAnimation } from "../../engine/rendering/stagePsylliumAnimation";
import { srgbChannelToLinear } from "./hud/nguiMaterialPipeline";
import { pixiFlashBlendMode } from "./pixiFlashBlend";
import type { StartupStagePhase } from "../../scene/startupDirectionScene";

let program: GlProgram | null = null;

/** One retained batch for the original 73 pairs; no per-frame object creation. */
export class PixiStagePsyllium {
  readonly root = new Container({ label: "StagePsyllium" });
  private readonly animation = new StagePsylliumAnimation();
  private readonly active = new Uint8Array(profile.positions.length).fill(1);
  private readonly positions = new Float32Array(profile.positions.length * profile.nodes.length * 8);
  private readonly colors = new Float32Array(profile.positions.length * profile.nodes.length * 16);
  private readonly poses = profile.nodes.map(node => ({
    x: node.position[0]!, y: node.position[1]!, cosine: 1, sine: 0,
    positionIndex: profile.clip.bindings.find(b => b.path === node.path && b.property === "position")!.index,
    rotationIndex: profile.clip.bindings.find(b => b.path === node.path && b.property === "euler")!.index,
  }));
  private readonly mesh;
  private phase: StartupStagePhase = "dark";
  private transformCompleted = false;

  constructor(texture: Texture) {
    const quads = profile.positions.length * profile.nodes.length;
    const uvs = new Float32Array(quads * 8), indices = new Uint32Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      uvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
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

  advance(deltaSeconds: number): void {
    if (this.animation.advance(deltaSeconds)) this.publish();
  }

  updateStage(phase: StartupStagePhase, progress: number, width: number, height: number): void {
    if (phase === "leaving" && this.phase !== "leaving") {
      this.active.fill(1);
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
        this.active[i] = worldX >= 0 && worldX < width && worldY > 0 && worldY <= height ? 1 : 0;
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
    this.mesh.visible = this.animation.alpha !== 0;
    const values = this.animation.animation.values;
    for (let n = 0; n < profile.nodes.length; n++) {
      const node = profile.nodes[n]!, pose = this.poses[n]!;
      pose.x = values[pose.positionIndex]!; pose.y = values[pose.positionIndex + 1]!;
      const angle = values[pose.rotationIndex + 2]! * Math.PI / 180;
      pose.cosine = Math.cos(angle); pose.sine = Math.sin(angle);
      const color = n === 0 ? profile.initialColor : profile.coreColor;
      const r = srgbChannelToLinear(color[0]! * this.animation.colorFactor);
      const g = srgbChannelToLinear(color[1]! * this.animation.colorFactor);
      const b = srgbChannelToLinear(color[2]! * this.animation.colorFactor);
      for (let i = 0; i < profile.positions.length; i++) {
        const source = profile.positions[i]!, quad = n * profile.positions.length + i;
        const sx = source.scale[0]! * (source.mirror ? -1 : 1), sy = source.scale[1]!;
        for (let corner = 0; corner < 4; corner++) {
          const x = (corner === 0 || corner === 3 ? -0.5 : 0.5) * node.width;
          const y = (corner < 2 ? 1 : 0) * node.height;
          const vertex = quad * 4 + corner;
          this.positions[vertex * 2] = source.position[0]! + (pose.x + pose.cosine * x - pose.sine * y) * sx;
          this.positions[vertex * 2 + 1] = -(source.position[1]! + (pose.y + pose.sine * x + pose.cosine * y) * sy);
          this.colors[vertex * 4] = r; this.colors[vertex * 4 + 1] = g; this.colors[vertex * 4 + 2] = b;
          this.colors[vertex * 4 + 3] = this.animation.alpha * this.active[i]!;
        }
      }
    }
    this.mesh.geometry.getBuffer("aPosition").update();
    this.mesh.geometry.getBuffer("aStageColor").update();
  }
}
