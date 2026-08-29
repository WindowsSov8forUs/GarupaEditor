import {
  GlProgram,
  Matrix,
  Mesh,
  MeshGeometry,
  Shader,
  UniformGroup,
  type Texture,
} from "pixi.js";

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vTextureCoord;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform mat3 uTextureMatrix;
void main(void) {
  vec3 position = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
  vTextureCoord = (uTextureMatrix * vec3(aUV, 1.0)).xy;
}`;

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uParticleColor;
void main(void) {
  vec4 sampled = texture(uTexture, vTextureCoord);
  // SVL-R01: add-npm applies source alpha in the blend state exactly once.
  finalColor = vec4(
    sampled.rgb * uParticleColor.rgb,
    sampled.a * uParticleColor.a
  );
}`;

let program: GlProgram | null = null;

function currentProgram(): GlProgram {
  if (typeof document === "undefined") {
    throw new Error("Particle Linear shader program is available only in the production Browser renderer.");
  }
  program ??= GlProgram.from({
    vertex: VERTEX,
    fragment: FRAGMENT,
    name: "particle-linear-float-color-mesh",
  });
  return program;
}

export interface PixiParticleLinearColorMesh extends Mesh<MeshGeometry, Shader> {
  readonly particleLinearColor: readonly [number, number, number, number];
}

export function createPixiParticleLinearColorMesh(
  texture: Texture,
  particleId: string,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): PixiParticleLinearColorMesh {
  const values = [red, green, blue, alpha].map(Math.fround);
  if (texture.destroyed || typeof particleId !== "string" || particleId.length === 0 ||
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("Particle Linear mesh requires one live texture, identity and four Float32 unit color channels.");
  }
  const halfWidth = Math.fround(texture.width / 2);
  const halfHeight = Math.fround(texture.height / 2);
  const geometry = new MeshGeometry({
    positions: new Float32Array([
      -halfWidth, -halfHeight,
      halfWidth, -halfHeight,
      halfWidth, halfHeight,
      -halfWidth, halfHeight,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = typeof document === "undefined"
    ? null
    : new Shader({
        glProgram: currentProgram(),
        resources: {
          uTexture: texture.source,
          uSampler: texture.source.style,
          textureUniforms: {
            uTextureMatrix: { type: "mat3x3<f32>", value: texture.textureMatrix.mapCoord ?? new Matrix() },
          },
          particleColorUniforms: new UniformGroup({
            uParticleColor: {
              value: new Float32Array(values),
              type: "vec4<f32>",
            },
          }),
        },
      });
  const mesh = new Mesh({
    geometry,
    ...(shader === null ? {} : { shader }),
    texture,
    label: particleId,
    roundPixels: false,
  }) as PixiParticleLinearColorMesh;
  Object.defineProperty(mesh, "particleLinearColor", {
    value: Object.freeze(values) as readonly [number, number, number, number],
    enumerable: true,
  });
  return mesh;
}

export function destroyPixiParticleLinearColorMesh(mesh: PixiParticleLinearColorMesh): void {
  if (mesh.destroyed) return;
  mesh.removeFromParent();
  mesh.shader?.destroy(false);
  mesh.geometry.destroy();
  mesh.destroy({ children: true });
}
