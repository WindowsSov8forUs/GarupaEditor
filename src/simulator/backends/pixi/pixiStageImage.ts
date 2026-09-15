import { GlProgram, Mesh, MeshGeometry, Shader, UniformGroup, type Texture } from "pixi.js";
import { pixiFlashBlendMode } from "./pixiFlashBlend";

// Stage UI textures multiply straight texture RGBA by widget RGBA. Pixi's
// default Sprite shader premultiplies vertex RGB by alpha before NPM blending.
let program: GlProgram | null = null;
export function createStageImage(texture: Texture, width: number, height: number, additive: boolean) {
  program ??= GlProgram.from({ name: "stage-widget-rgba", vertex: `
    in vec2 aPosition; in vec2 aUV; out vec2 vUV;
    uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
    void main() { vec3 p = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
      gl_Position = vec4(p.xy, 0.0, 1.0); vUV = aUV; }`, fragment: `
    in vec2 vUV; out vec4 finalColor; uniform sampler2D uTexture; uniform float uAlpha;
    void main() { finalColor = texture(uTexture, vUV) * vec4(1.0, 1.0, 1.0, uAlpha); }`,
  });
  const uniforms = new UniformGroup({ uAlpha: { value: 1, type: "f32" } });
  const shader = new Shader({ glProgram: program, resources: { uTexture: texture.source, uSampler: texture.source.style, uniforms } });
  const mesh = new Mesh({ texture, shader, geometry: new MeshGeometry({
    positions: new Float32Array([-width / 2, -height / 2, width / 2, -height / 2, width / 2, height / 2, -width / 2, height / 2]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  }) });
  mesh.blendMode = additive ? pixiFlashBlendMode(false) : "normal-npm";
  return { mesh, setAlpha(alpha: number) { uniforms.uniforms.uAlpha = Math.max(0, Math.min(1, alpha)); uniforms.update(); },
    dispose() { mesh.removeFromParent(); shader.destroy(false); mesh.geometry.destroy(true); mesh.destroy(); } };
}
