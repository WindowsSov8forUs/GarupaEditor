import {
  GlProgram,
  Matrix,
  Mesh,
  MeshGeometry,
  Shader,
  Texture,
  UniformGroup,
} from "pixi.js";
import type { ParticleNativeRenderPrimitive } from "../../engine/particles/particleGeometry";

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
uniform float uPremultiplyOutput;
void main(void) {
  vec4 value = texture(uTexture, vTextureCoord) * uParticleColor;
  if (uPremultiplyOutput > 0.5) {
    value.rgb *= value.a;
  }
  finalColor = value;
}`;

let program: GlProgram | null = null;

function currentProgram(): GlProgram {
  if (typeof document === "undefined") {
    throw new Error("Particle Linear shader program is available only in the production Browser renderer.");
  }
  program ??= GlProgram.from({
    vertex: VERTEX,
    fragment: FRAGMENT,
    name: "particle-native-primitive-linear-color-mesh",
  });
  return program;
}

export interface PixiParticleLinearColorMesh extends Mesh<MeshGeometry, Shader> {
  readonly particleLinearColor: readonly [number, number, number, number];
  readonly particleTextureLabel: string;
  readonly particleMaterialName: string;
}

export function createPixiParticleNativePrimitiveMesh(
  texture: Texture,
  primitive: ParticleNativeRenderPrimitive,
): PixiParticleLinearColorMesh {
  const premultiplyOutput = primitive.fragment === "premultiply-rgb-after-rgba-modulate";
  const mesh = createMesh(
    texture,
    primitive.particleId,
    primitive.materialName,
    primitive.positions,
    primitive.uvs,
    primitive.indices,
    primitive.linearColor,
    premultiplyOutput,
  );
  if (primitive.sourceBlendFactor === 5 && primitive.destinationBlendFactor === 1) {
    mesh.blendMode = "add-npm";
  } else if (primitive.sourceBlendFactor === 5 && primitive.destinationBlendFactor === 10) {
    mesh.blendMode = "normal-npm";
  } else if (primitive.sourceBlendFactor === 1 && primitive.destinationBlendFactor === 10 && premultiplyOutput) {
    // MeshPipe derives state adjustment from mesh.texture. A premultiplied
    // pipeline texture keeps native Blend One/OneMinusSrcAlpha while the
    // shader samples the separately bound exact source texture.
    mesh.blendMode = "normal";
  } else {
    destroyPixiParticleLinearColorMesh(mesh);
    throw new Error("Unsupported current particle blend tuple");
  }
  return mesh;
}

/** Legacy source-compile helper; production uses native primitive geometry. */
export function createPixiParticleLinearColorMesh(
  texture: Texture,
  particleId: string,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): PixiParticleLinearColorMesh {
  const halfWidth = Math.fround(texture.width / 2);
  const halfHeight = Math.fround(texture.height / 2);
  return createMesh(
    texture,
    particleId,
    "legacy-compile-only",
    new Float32Array([
      -halfWidth, -halfHeight,
      halfWidth, -halfHeight,
      -halfWidth, halfHeight,
      halfWidth, halfHeight,
    ]),
    new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
    new Uint32Array([0, 1, 3, 3, 2, 0]),
    Object.freeze([red, green, blue, alpha].map(Math.fround)) as readonly [number, number, number, number],
    false,
  );
}

function createMesh(
  texture: Texture,
  particleId: string,
  materialName: string,
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
  color: readonly [number, number, number, number],
  premultiplyOutput: boolean,
): PixiParticleLinearColorMesh {
  const values = [...color].map(Math.fround);
  if (texture.destroyed || typeof particleId !== "string" || particleId.length === 0 ||
    positions.length < 8 || positions.length % 2 !== 0 || uvs.length !== positions.length ||
    indices.length < 3 || indices.length % 3 !== 0 ||
    [...positions, ...uvs].some((value) => !Number.isFinite(value)) ||
    [...indices].some((value) => !Number.isSafeInteger(value) || value < 0 || value >= positions.length / 2) ||
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("Particle native mesh requires exact finite primitive, source texture and unit color fields.");
  }
  const geometry = new MeshGeometry({
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
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
          particleUniforms: new UniformGroup({
            uParticleColor: {
              value: new Float32Array(values),
              type: "vec4<f32>",
            },
            uPremultiplyOutput: {
              value: premultiplyOutput ? 1 : 0,
              type: "f32",
            },
          }),
        },
      });
  const pipelineTexture = premultiplyOutput ? Texture.WHITE : texture;
  const mesh = new Mesh({
    geometry,
    ...(shader === null ? {} : { shader }),
    texture: pipelineTexture,
    label: particleId,
    roundPixels: false,
  }) as PixiParticleLinearColorMesh;
  Object.defineProperties(mesh, {
    particleLinearColor: {
      value: Object.freeze(values) as readonly [number, number, number, number],
      enumerable: true,
    },
    particleTextureLabel: { value: texture.label ?? "", enumerable: true },
    particleMaterialName: { value: materialName, enumerable: true },
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
