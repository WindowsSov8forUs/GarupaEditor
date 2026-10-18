import {
  ColorMask,
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
in vec4 aParticleColor;
out vec2 vTextureCoord;
out vec4 vParticleColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform mat3 uTextureMatrix;
void main(void) {
  vec3 position = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
  vTextureCoord = (uTextureMatrix * vec3(aUV, 1.0)).xy;
  vParticleColor = aParticleColor;
}`;

const FRAGMENT = `
in vec2 vTextureCoord;
in vec4 vParticleColor;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uPremultiplyOutput;
void main(void) {
  vec4 value = texture(uTexture, vTextureCoord) * vParticleColor;
  if (uPremultiplyOutput > 0.5) {
    value *= vParticleColor.a;
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
  const premultiplyOutput = primitive.fragment === "rgba-modulate-times-particle-alpha";
  const mesh = createMesh(
    texture,
    primitive.particleId,
    primitive.materialName,
    primitive.positions,
    primitive.uvs,
    primitive.indices,
    primitive.linearColor,
    premultiplyOutput,
    primitive.vertexColors,
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
  mesh.addEffect(new ColorMask({ mask: primitive.colorWriteMask }));
  return mesh;
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
  vertexColors: Float32Array,
): PixiParticleLinearColorMesh {
  const values = validateMeshData(texture, particleId, positions, uvs, indices, color, vertexColors);
  const geometry = new MeshGeometry({
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  });
  geometry.addAttribute("aParticleColor", {
    buffer: new Float32Array(vertexColors),
    format: "float32x4",
    stride: 16,
    offset: 0,
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
      writable: true,
    },
    particleTextureLabel: { value: texture.label ?? "", enumerable: true },
    particleMaterialName: { value: materialName, enumerable: true },
  });
  return mesh;
}

function validateMeshData(texture: Texture, particleId: string, positions: Float32Array,
  uvs: Float32Array, indices: Uint32Array, color: readonly [number, number, number, number],
  vertexColors: Float32Array): readonly [number, number, number, number] {
  const values = [...color].map(Math.fround);
  const vertexCount = positions.length / 2;
  if (texture.destroyed || typeof particleId !== "string" || particleId.length === 0 ||
    positions.length < 8 || positions.length % 2 !== 0 || uvs.length !== positions.length ||
    indices.length < 3 || indices.length % 3 !== 0 ||
    !everyValue(positions, Number.isFinite) || !everyValue(uvs, Number.isFinite) ||
    !everyValue(indices, (value) => Number.isSafeInteger(value) && value >= 0 && value < vertexCount) ||
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    vertexColors.length !== positions.length * 2 ||
    !everyValue(vertexColors, (value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("Particle native mesh requires exact finite primitive, source texture and unit color fields.");
  }
  return Object.freeze(values) as readonly [number, number, number, number];
}

function everyValue(values: Float32Array | Uint32Array, check: (value: number) => boolean): boolean {
  for (let index = 0; index < values.length; index += 1) if (!check(values[index]!)) return false;
  return true;
}

/** Whether two adjacent sorted primitives may share one draw: identical material binding and the
 * same per-system draw-order key, so no other gameplay draw can sort between them. */
export function sameParticleDraw(a: ParticleNativeRenderPrimitive, b: ParticleNativeRenderPrimitive): boolean {
  return a.logicalTextureId === b.logicalTextureId && a.materialName === b.materialName &&
    a.shader === b.shader && a.fragment === b.fragment && a.colorWriteMask === b.colorWriteMask &&
    a.sourceBlendFactor === b.sourceBlendFactor && a.destinationBlendFactor === b.destinationBlendFactor &&
    a.sortingLayerId === b.sortingLayerId && a.sortingOrder === b.sortingOrder &&
    a.sortingDistance === b.sortingDistance && a.rendererPriority === b.rendererPriority;
}

/** Concatenates a run of same-draw primitives in draw order. Triangles keep their order and every
 * colour is per vertex, so one draw blends exactly as the sequential per-particle draws did. */
export function mergeParticlePrimitives(run: readonly ParticleNativeRenderPrimitive[]): ParticleNativeRenderPrimitive {
  const first = run[0]!;
  if (run.length === 1) return first;
  let positionLength = 0, indexLength = 0;
  for (const primitive of run) { positionLength += primitive.positions.length; indexLength += primitive.indices.length; }
  const positions = new Float32Array(positionLength), uvs = new Float32Array(positionLength);
  const vertexColors = new Float32Array(positionLength * 2), indices = new Uint32Array(indexLength);
  let positionOffset = 0, indexOffset = 0;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, nearZ = Infinity, farZ = -Infinity;
  for (const primitive of run) {
    positions.set(primitive.positions, positionOffset);
    uvs.set(primitive.uvs, positionOffset);
    vertexColors.set(primitive.vertexColors, positionOffset * 2);
    const vertexOffset = positionOffset / 2;
    for (let index = 0; index < primitive.indices.length; index += 1) indices[indexOffset + index] = primitive.indices[index]! + vertexOffset;
    positionOffset += primitive.positions.length;
    indexOffset += primitive.indices.length;
    left = Math.min(left, primitive.bounds.left); top = Math.min(top, primitive.bounds.top);
    right = Math.max(right, primitive.bounds.right); bottom = Math.max(bottom, primitive.bounds.bottom);
    nearZ = Math.min(nearZ, primitive.bounds.nearZ); farZ = Math.max(farZ, primitive.bounds.farZ);
  }
  return Object.freeze({ ...first, positions, uvs, vertexColors, indices,
    bounds: Object.freeze({ left, top, right, bottom, nearZ, farZ }) });
}

export function updatePixiParticleNativePrimitiveMesh(mesh: PixiParticleLinearColorMesh,
  texture: Texture, primitive: ParticleNativeRenderPrimitive): void {
  // The caller supplies a hidden generation with the same texture/shader/blend
  // binding. Updating it cannot change the currently displayed generation.
  applyPixiParticleNativePrimitiveMesh(mesh, primitive, validatePixiParticleNativePrimitive(texture, primitive));
}

/** Validates a primitive for a mesh bound to `texture`; the result is the mesh's linear colour. */
export function validatePixiParticleNativePrimitive(texture: Texture,
  primitive: ParticleNativeRenderPrimitive): readonly [number, number, number, number] {
  return validateMeshData(texture, primitive.particleId, primitive.positions, primitive.uvs,
    primitive.indices, primitive.linearColor, primitive.vertexColors);
}

/** Writes already validated primitive data into a mesh with the same material binding. */
export function applyPixiParticleNativePrimitiveMesh(mesh: PixiParticleLinearColorMesh,
  primitive: ParticleNativeRenderPrimitive, color: readonly [number, number, number, number]): void {
  mesh.geometry.uvs = primitive.uvs;
  mesh.geometry.positions = primitive.positions;
  mesh.geometry.indices = primitive.indices;
  mesh.geometry.getBuffer("aParticleColor").data = primitive.vertexColors;
  Object.defineProperty(mesh, "particleLinearColor", { value: color });
}

export function destroyPixiParticleLinearColorMesh(mesh: PixiParticleLinearColorMesh): void {
  if (mesh.destroyed) return;
  mesh.removeFromParent();
  mesh.shader?.destroy(false);
  mesh.geometry.destroy(true);
  mesh.destroy({ children: true });
}
