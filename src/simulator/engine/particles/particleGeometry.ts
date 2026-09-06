import type {
  ParticleBundleProfile,
  ParticleFloat32Vector4,
  ParticleInstanceIdentity,
  ParticleMaterialProfile,
  ParticleMeshProfile,
  ParticleOwnerTransform,
  ParticlePixiSceneProfile,
  ParticlePortableProfile,
  ParticleRenderSample,
  ParticleRendererProfile,
  ParticleSystemDefinition,
  ParticleTextureProfile,
  ParticleTransformProfile,
} from "../../backends/particleContracts";
import { particleFloat32FromBits } from "../../backends/particleValidation";
import { calculateNativeStretchArithmetic } from "./particleStretchedGeometry";
import { calculateNativeParticleLocalBillboardBasis, calculateNativeParticleViewBillboardBasis } from "./particleHierarchyScale";
import { calculateNativeParticleOrthographicHalfSize, calculateNativeParticleOrthographicWidth } from "./particleSizeLimit";

const SCREEN_REFLECTED_QUAD_INDICES = Object.freeze([0, 1, 3, 3, 2, 0]);
const ZERO_EPSILON = Math.fround(1e-10);

type Vector2 = readonly [number, number];
type Vector3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

export interface ParticleNativePrimitiveBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly nearZ: number;
  readonly farZ: number;
}

export interface ParticleNativeRenderPrimitive {
  readonly particleId: string;
  readonly ownerKey: string;
  readonly systemId: string;
  readonly sourceOrdinal: number;
  readonly ownerSortOrdinal: number;
  readonly creationSequence: number;
  readonly sortingLayerId: number;
  readonly sortingOrder: number;
  readonly sortingFudge: number;
  readonly rendererPriority: number;
  readonly renderMode: 0 | 1 | 4;
  readonly renderAlignment: 0 | 2;
  readonly materialName: string;
  readonly logicalTextureId: string;
  readonly shader: ParticleMaterialProfile["shader"];
  readonly fragment: NonNullable<ParticleMaterialProfile["fragment"]>;
  readonly sourceBlendFactor: 1 | 5;
  readonly destinationBlendFactor: 1 | 10;
  readonly linearColor: readonly [number, number, number, number];
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: ParticleNativePrimitiveBounds;
}

interface GeometryBinding {
  readonly bundle: ParticleBundleProfile;
  readonly system: ParticleSystemDefinition;
  readonly renderer: ParticleRendererProfile;
  readonly material: ParticleMaterialProfile;
  readonly texture: ParticleTextureProfile;
  readonly mesh: ParticleMeshProfile | null;
  readonly tilesX: number;
  readonly tilesY: number;
}

export class ParticleGeometryFault extends Error {
  constructor(readonly capability: string, readonly boundary: string) {
    super(boundary);
  }
}

export function buildCurrentParticlePrimitives(
  profile: ParticlePortableProfile,
  scene: ParticlePixiSceneProfile,
  samples: readonly ParticleRenderSample[],
): readonly ParticleNativeRenderPrimitive[] {
  const bindings = buildBindings(profile);
  const primitives = samples.map((sample) => buildPrimitive(sample, bindings, scene));
  primitives.sort((left, right) => left.sortingLayerId - right.sortingLayerId ||
    left.sortingOrder - right.sortingOrder || left.sortingFudge - right.sortingFudge ||
    left.rendererPriority - right.rendererPriority || left.ownerSortOrdinal - right.ownerSortOrdinal ||
    left.sourceOrdinal - right.sourceOrdinal || left.creationSequence - right.creationSequence);
  const grouped = new Map<string, ParticleNativeRenderPrimitive[]>();
  for (const primitive of primitives) {
    const key = `${primitive.ownerKey}\u0000${primitive.systemId}`;
    const rows = grouped.get(key) ?? [];
    rows.push(primitive);
    grouped.set(key, rows);
  }
  const visible = new Set<ParticleNativeRenderPrimitive>();
  for (const rows of grouped.values()) {
    const bounds = unionBounds(rows.map((row) => row.bounds));
    if (intersectsOrthographicViewport(bounds, scene)) {
      for (const row of rows) visible.add(row);
    }
  }
  return Object.freeze(primitives.filter((primitive) => visible.has(primitive)));
}

function buildBindings(profile: ParticlePortableProfile): ReadonlyMap<string, GeometryBinding> {
  const result = new Map<string, GeometryBinding>();
  for (const bundle of profile.bundles) {
    const materials = new Map(bundle.materials.map((material) => [material.name, material]));
    const textures = new Map(bundle.textures.map((texture) => [texture.name, texture]));
    const meshes = bundle.meshProfiles ?? {};
    for (const system of bundle.systems) {
      const definition = bundle.profiles[system.profile];
      const renderer = definition === undefined ? undefined : bundle.rendererProfiles[definition.renderer];
      if (definition === undefined || renderer === undefined) {
        throw fault("particle.geometry.profile-relation", "Every system must resolve one exact native renderer profile.");
      }
      if (!renderer.m_Enabled) continue;
      const materialReference = renderer.m_Materials[0] ?? null;
      const material = materialReference === null ? undefined : materials.get(materialReference.name);
      const texture = material?.texture === null || material?.texture === undefined
        ? undefined
        : textures.get(material.texture);
      if (material === undefined || texture === undefined ||
        material.renderQueue !== 3000 ||
        (material.sourceBlendFactor !== 1 && material.sourceBlendFactor !== 5) ||
        (material.destinationBlendFactor !== 1 && material.destinationBlendFactor !== 10) ||
        material.fragment === undefined || material.mainTextureScale === undefined || material.mainTextureOffset === undefined ||
        material.fragment === "straight-rgba-modulate-custom0-yx-uv-offset" &&
          (renderer.m_UseCustomVertexStreams !== true || !renderer.m_VertexStreams?.includes(34))) {
        throw fault("particle.geometry.material-relation", "Every enabled current renderer requires its exact slot-0 material, texture, blend and shader equation.");
      }
      const mesh = renderer.m_RenderMode === 4
        ? (system.meshProfile === undefined || system.meshProfile === null ? undefined : meshes[system.meshProfile])
        : null;
      if (renderer.m_RenderMode === 4 && mesh === undefined) {
        throw fault("particle.geometry.mesh-relation", "Every current mode-4 renderer requires its exact source-bound mesh geometry.");
      }
      if (renderer.m_RenderMode !== 4 && system.meshProfile !== null && system.meshProfile !== undefined) {
        throw fault("particle.geometry.inactive-mesh-relation", "A non-mesh renderer cannot publish active mesh geometry.");
      }
      const uvKey = definition.modules.UVModule;
      const uv = uvKey === undefined ? null : bundle.moduleProfiles.UVModule?.[uvKey] ?? null;
      result.set(system.identity, Object.freeze({
        bundle,
        system,
        renderer,
        material,
        texture,
        mesh: mesh ?? null,
        tilesX: uv?.tilesX ?? 1,
        tilesY: uv?.tilesY ?? 1,
      }));
    }
  }
  return result;
}

function buildPrimitive(
  sample: ParticleRenderSample,
  bindings: ReadonlyMap<string, GeometryBinding>,
  scene: ParticlePixiSceneProfile,
): ParticleNativeRenderPrimitive {
  const binding = bindings.get(sample.systemId);
  if (binding === undefined || sample.sourceOrdinal === undefined || sample.ownerSortOrdinal === undefined ||
    sample.sortingLayerId === undefined || sample.sortingFudgeBits === undefined || sample.rendererPriority === undefined ||
    sample.material !== binding.material.name || sample.renderMode !== binding.renderer.m_RenderMode ||
    sample.renderAlignment !== binding.renderer.m_RenderAlignment ||
    sample.sortingLayerId !== binding.renderer.m_SortingLayerID ||
    requiredBits(sample.sortingFudgeBits) !== binding.renderer.m_SortingFudge ||
    sample.rendererPriority !== binding.renderer.m_RendererPriority ||
    sample.meshProfile !== (binding.system.meshProfile ?? null)) {
    throw fault("particle.geometry.sample-relation", "Every render sample must retain its source ordinal and exact renderer/material/mesh relation.");
  }
  const transform = requiredOwnerTransform(sample.instance);
  const localCenter = bitsVector3(sample.position);
  const worldCenter = transformPoint(localCenter, transform);
  const size = bitsVector3(sample.size);
  const rotation = bitsVector3(sample.rotation);
  const velocity = transformVector(bitsVector3(sample.velocity), transform);
  const outerScale = bitsVector3(transform.scale);
  const outerRotation = bitsQuaternion(transform.rotation);
  const isStretched = binding.renderer.m_RenderMode === 1;
  const source = isStretched
    ? stretchedBillboard(binding, size, velocity, worldCenter, outerScale, scene)
    : sourceGeometry(binding, size, rotation, sample, scene);
  const offsets = isStretched ? source.vertices : source.vertices.map((vertex) => quaternionRotate([
    multiply(vertex[0], outerScale[0]),
    multiply(vertex[1], outerScale[1]),
    multiply(vertex[2], outerScale[2]),
  ], outerRotation));
  const worldNormals = isStretched ? source.normals : source.normals.map((normal) => normalizeOr(quaternionRotate(normal, outerRotation), [0, 0, -1]));
  const maximumPixels = multiply(binding.renderer.m_MaxParticleSize, scene.viewportHeight);
  const hasNativeSizeLimit = isStretched || binding.renderer.m_RenderMode === 0;
  const largest = hasNativeSizeLimit ? 0 : projectedLargestDimension(offsets.map((offset) => projectVector(offset, scene)));
  // Billboard limits are already applied to raw size before vertex construction.
  const limitRatio = !hasNativeSizeLimit && maximumPixels > 0 && largest > maximumPixels
    ? divide(maximumPixels, largest)
    : Math.fround(1);
  const projectedCenter = projectPoint(worldCenter, scene);
  const positions = new Float32Array(offsets.length * 2);
  const worldVertices: Vector3[] = [];
  for (let index = 0; index < offsets.length; index += 1) {
    const offset = scaleVector(offsets[index]!, limitRatio);
    // The native stretched worker publishes world vertices directly. Turning
    // its tail into an offset and adding the head again adds Float32 cancellation.
    const world = isStretched ? offsets[index]! : addVector(worldCenter, offset);
    worldVertices.push(world);
    const projected = projectPoint(world, scene);
    positions[index * 2] = projected[0];
    positions[index * 2 + 1] = projected[1];
  }
  const uvs = buildUvs(source.uv0, sample, binding);
  const normals = new Float32Array(worldNormals.length * 3);
  for (let index = 0; index < worldNormals.length; index += 1) {
    normals[index * 3] = worldNormals[index]![0];
    normals[index * 3 + 1] = -worldNormals[index]![1];
    normals[index * 3 + 2] = worldNormals[index]![2];
  }
  const color = currentLinearColor(sample, binding.renderer.m_ApplyActiveColorSpace);
  const sortingFudge = requiredBits(sample.sortingFudgeBits!);
  const bounds = primitiveBounds(positions, worldVertices);
  if (!Number.isFinite(projectedCenter[0]) || !Number.isFinite(projectedCenter[1])) {
    throw fault("particle.geometry.non-finite-projection", "A current particle primitive cannot publish non-finite projected coordinates.");
  }
  return Object.freeze({
    particleId: sample.particleId,
    ownerKey: sample.ownerKey,
    systemId: sample.systemId,
    sourceOrdinal: sample.sourceOrdinal,
    ownerSortOrdinal: sample.ownerSortOrdinal,
    creationSequence: sample.creationSequence,
    sortingLayerId: sample.sortingLayerId!,
    sortingOrder: sample.sortingOrder,
    sortingFudge,
    rendererPriority: sample.rendererPriority!,
    renderMode: sample.renderMode,
    renderAlignment: sample.renderAlignment,
    materialName: binding.material.name,
    logicalTextureId: `particle-texture:${binding.bundle.key}:${binding.texture.name}`,
    shader: binding.material.shader,
    fragment: binding.material.fragment!,
    sourceBlendFactor: binding.material.sourceBlendFactor!,
    destinationBlendFactor: binding.material.destinationBlendFactor!,
    linearColor: color,
    positions,
    uvs,
    normals,
    indices: new Uint32Array(source.indices),
    bounds,
  });
}

function sourceGeometry(
  binding: GeometryBinding,
  size: Vector3,
  rotation: Vector3,
  sample: ParticleRenderSample,
  scene: ParticlePixiSceneProfile,
): {
  readonly vertices: readonly Vector3[];
  readonly uv0: readonly Vector2[];
  readonly normals: readonly Vector3[];
  readonly indices: readonly number[];
} {
  if (binding.renderer.m_RenderMode === 4) {
    const mesh = binding.mesh!;
    const basis = alignmentBasis(binding);
    const particleRotation = eulerQuaternion(rotation);
    const pivot = binding.renderer.m_Pivot;
    return Object.freeze({
      vertices: Object.freeze(mesh.vertices.map((vertex) => {
        const scaled: Vector3 = [
          multiply(subtract(vertex[0], pivot.x), size[0]),
          multiply(subtract(vertex[1], pivot.y), size[1]),
          multiply(subtract(vertex[2], pivot.z), size[2]),
        ];
        return applyBasis(quaternionRotate(scaled, particleRotation), basis);
      })),
      uv0: mesh.uv0,
      normals: Object.freeze(mesh.normals.map((normal) => {
        const inverseScaled: Vector3 = [
          divide(normal[0], Math.abs(size[0]) > ZERO_EPSILON ? size[0] : 1),
          divide(normal[1], Math.abs(size[1]) > ZERO_EPSILON ? size[1] : 1),
          divide(normal[2], Math.abs(size[2]) > ZERO_EPSILON ? size[2] : 1),
        ];
        return normalizeOr(applyBasis(quaternionRotate(inverseScaled, particleRotation), basis), [0, 0, -1]);
      })),
      indices: mesh.screenYReflectionIndices,
    });
  }
  if (sample.sizeBeforeTransform === undefined) {
    throw fault("particle.geometry.billboard-size", "Billboards require current particle size before Transform scaling.");
  }
  size = bitsVector3(sample.sizeBeforeTransform);
  const halfSize = billboardHalfSize(binding, sample, scene);
  size = [multiply(halfSize[0], 2), multiply(halfSize[1], 2), size[2]];
  let basis: readonly [Vector3, Vector3, Vector3];
  if (binding.renderer.m_RenderAlignment === 2) {
    if (sample.instance.particleSystemSetupScaleBits === undefined) {
      throw fault("particle.geometry.local-billboard-transform", "Local billboards require current particle size before Transform scaling and their concrete owner setup scale.");
    }
    basis = localBillboardBasis(binding.system, requiredBits(sample.instance.particleSystemSetupScaleBits),
      binding.bundle.profiles[binding.system.profile]!.system.scalingMode);
  } else {
    basis = viewBillboardBasis(sample);
  }
  const particleRotation = eulerQuaternion(rotation);
  const pivot = binding.renderer.m_Pivot;
  const canonical: readonly Vector3[] = [
    [-0.5, -0.5, 0], [0.5, -0.5, 0], [-0.5, 0.5, 0], [0.5, 0.5, 0],
  ];
  const coordinates = hasSignificantBillboardPivot(pivot)
    ? billboardPivotCoordinates(sample, halfSize, pivot)
    : canonical.map((vertex): Vector3 => [
      multiply(subtract(vertex[0], pivot.x), size[0]),
      multiply(subtract(vertex[1], pivot.y), size[1]),
      multiply(subtract(vertex[2], pivot.z), size[2]),
    ]);
  // The normal stream has its own native consumer; BND-C33 binds positions.
  const normalBasis = alignmentBasis(binding);
  const billboardNormal = rendererNormal(
    normalizeOr(applyBasis(quaternionRotate([0, 0, -1], particleRotation), normalBasis), [0, 0, -1]),
    binding.renderer.m_NormalDirection,
  );
  return Object.freeze({
    vertices: Object.freeze(coordinates.map((vertex) => applyBasis(quaternionRotate(vertex, particleRotation), basis))),
    uv0: Object.freeze([[0, 0], [1, 0], [0, 1], [1, 1]] as const),
    normals: Object.freeze(canonical.map(() => billboardNormal)),
    indices: SCREEN_REFLECTED_QUAD_INDICES,
  });
}

function hasSignificantBillboardPivot(pivot: ParticleRendererProfile["m_Pivot"]): boolean {
  return add(add(multiply(pivot.x, pivot.x), multiply(pivot.y, pivot.y)), multiply(pivot.z, pivot.z)) > Math.fround(1e-5);
}

function billboardPivotCoordinates(
  sample: ParticleRenderSample,
  halfSize: Vector2,
  pivot: ParticleRendererProfile["m_Pivot"],
): readonly Vector3[] {
  if (sample.sizeBeforeTransform === undefined) {
    throw fault("particle.geometry.billboard-pivot", "Billboard pivot requires current particle size before Transform scaling and size limits.");
  }
  return complexBillboardCoordinates(bitsVector3(sample.sizeBeforeTransform), halfSize, pivot);
}

function complexBillboardCoordinates(
  rawSize: Vector3,
  halfSize: Vector2,
  pivot: ParticleRendererProfile["m_Pivot"],
): readonly Vector3[] {
  // Both original complex workers add the raw-size pivot before rotation.
  // The Z displacement deliberately uses raw X, not the particle's Z size.
  const x = multiply(pivot.x, rawSize[0]);
  const y = multiply(pivot.y, rawSize[1]);
  const z = multiply(pivot.z, rawSize[0]);
  const xMinus = subtract(x, halfSize[0]);
  const xPlus = add(x, halfSize[0]);
  const yPlus = add(y, halfSize[1]);
  const yMinus = subtract(y, halfSize[1]);
  return [[xMinus, yMinus, z], [xPlus, yMinus, z], [xMinus, yPlus, z], [xPlus, yPlus, z]];
}

function viewBillboardBasis(sample: ParticleRenderSample): readonly [Vector3, Vector3, Vector3] {
  if (sample.transformSize === undefined) {
    throw fault("particle.geometry.view-billboard-transform", "View billboards require the separate native Transform size scale.");
  }
  return calculateNativeParticleViewBillboardBasis(bitsVector3(sample.transformSize));
}

function billboardHalfSize(
  binding: GeometryBinding,
  sample: ParticleRenderSample,
  scene: ParticlePixiSceneProfile,
): readonly [number, number] {
  if (sample.sizeBeforeTransform === undefined || sample.transformSize === undefined) {
    throw fault("particle.geometry.billboard-size-limit", "Billboard limits require raw particle size and the separate native Transform size scale.");
  }
  const size = bitsVector3(sample.sizeBeforeTransform);
  const scale = bitsVector3(sample.transformSize);
  // Current GameCamera has orthographic size1 and a full normalized viewport.
  const width = calculateNativeParticleOrthographicWidth(1, divide(scene.viewportWidth, scene.viewportHeight));
  return calculateNativeParticleOrthographicHalfSize([size[0], size[1]], scale[0],
    binding.renderer.m_MinParticleSize, binding.renderer.m_MaxParticleSize, width);
}

function stretchedBillboard(
  binding: GeometryBinding,
  size: Vector3,
  velocity: Vector3,
  worldCenter: Vector3,
  outerScale: Vector3,
  scene: ParticlePixiSceneProfile,
): {
  readonly vertices: readonly Vector3[];
  readonly uv0: readonly Vector2[];
  readonly normals: readonly Vector3[];
  readonly indices: readonly number[];
} {
  // Current non-Freeform worker, not a centered rotated billboard. The native
  // camera is at (0,0,-15), looking +Z; Unity view space reflects its Z axis.
  const cameraPosition: Vector3 = [worldCenter[0], worldCenter[1], -add(worldCenter[2], 15)];
  const maximumSize = Math.max(size[0], size[1], Math.fround(1e-6));
  // Retain the portable orthographic screen-size conversion here; complete
  // native camera-uniform consumption remains open (SRC-PARTICLE-STRETCH).
  const maximumSourceSize = divide(
    divide(multiply(binding.renderer.m_MaxParticleSize, scene.viewportHeight), requiredBits(scene.pixelsPerWorldUnitBits)),
    Math.max(outerScale[0], Math.fround(0.00001)),
  );
  const halfWidth = multiply(size[0], divide(multiply(Math.min(maximumSize, maximumSourceSize), 0.5), maximumSize));
  const arithmetic = calculateNativeStretchArithmetic({
    cameraPosition,
    cameraVelocity: [velocity[0], velocity[1], -velocity[2]],
    sizeY: size[1],
    scaledLength: multiply(binding.renderer.m_LengthScale, outerScale[0]),
    velocityScale: binding.renderer.m_VelocityScale,
    halfWidth,
  });
  const tail: Vector3 = [
    arithmetic.tail[0],
    arithmetic.tail[1],
    subtract(-15, arithmetic.tail[2]),
  ];
  const side: Vector3 = [
    multiply(arithmetic.sideXY[0], outerScale[0]),
    multiply(arithmetic.sideXY[1], outerScale[1]),
    0,
  ];
  const opposite = scaleVector(side, -1);
  const normal = rendererNormal([0, 0, -1], binding.renderer.m_NormalDirection);
  return Object.freeze({
    // Reorder the native perimeter head+,tail+,tail-,head- to our grid indices.
    // Absolute world vertices: do not rotate by the emitter or re-add the head.
    vertices: Object.freeze([addVector(worldCenter, side), addVector(tail, side), addVector(worldCenter, opposite), addVector(tail, opposite)]),
    uv0: Object.freeze([[0, 1], [1, 1], [0, 0], [1, 0]] as const),
    normals: Object.freeze([normal, normal, normal, normal]),
    indices: SCREEN_REFLECTED_QUAD_INDICES,
  });
}

function rendererNormal(base: Vector3, normalDirection: number): Vector3 {
  const ratio = Math.max(0, Math.min(1, f32(normalDirection)));
  return normalizeOr(addVector(
    scaleVector(base, subtract(1, ratio)),
    scaleVector([0, 0, -1], ratio),
  ), [0, 0, -1]);
}

function localBillboardBasis(
  system: ParticleSystemDefinition,
  setupScale: number,
  scalingMode: 0 | 1,
): readonly [Vector3, Vector3, Vector3] {
  const transform = (value: ParticleTransformProfile, scale: number) => ({
    rotation: transformQuaternion(value),
    scale: [multiply(value.m_LocalScale.x, scale), multiply(value.m_LocalScale.y, scale),
      multiply(value.m_LocalScale.z, scale)] as Vector3,
  });
  const parents = system.parentTransforms.map((parent, index) => transform(parent,
    system.parentParticleSystemFlags === undefined || system.parentParticleSystemFlags[index] === true ? setupScale : 1));
  return calculateNativeParticleLocalBillboardBasis(transform(system.transform, setupScale), parents, scalingMode);
}

function alignmentBasis(binding: GeometryBinding): readonly [Vector3, Vector3, Vector3] {
  if (binding.renderer.m_RenderAlignment === 0) {
    return Object.freeze([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const);
  }
  let x: Vector3 = [1, 0, 0];
  let y: Vector3 = [0, 1, 0];
  let z: Vector3 = [0, 0, 1];
  const transforms = [binding.system.transform, ...[...binding.system.parentTransforms].reverse()];
  for (const transform of transforms) {
    const rotation = transformQuaternion(transform);
    x = quaternionRotate(x, rotation);
    y = quaternionRotate(y, rotation);
    z = quaternionRotate(z, rotation);
  }
  return Object.freeze([x, y, z] as const);
}

function buildUvs(
  sourceUvs: readonly Vector2[],
  sample: ParticleRenderSample,
  binding: GeometryBinding,
): Float32Array {
  const tileCount = binding.tilesX * binding.tilesY;
  if (sample.uvFrame < 0 || sample.uvFrame >= tileCount) {
    throw fault("particle.geometry.uv-frame", "Texture-sheet frame must remain inside the exact current tile inventory.");
  }
  const column = sample.uvFrame % binding.tilesX;
  const rowFromTop = Math.floor(sample.uvFrame / binding.tilesX);
  const materialScale = binding.material.mainTextureScale!;
  const materialOffset = binding.material.mainTextureOffset!;
  const custom = binding.material.fragment === "straight-rgba-modulate-custom0-yx-uv-offset"
    ? requiredCustomData(sample.customData0)
    : [0, 0, 0, 0] as const;
  const output = new Float32Array(sourceUvs.length * 2);
  for (let index = 0; index < sourceUvs.length; index += 1) {
    const native = sourceUvs[index]!;
    const tileU = divide(add(column, native[0]), binding.tilesX);
    const tileNativeV = divide(add(binding.tilesY - 1 - rowFromTop, native[1]), binding.tilesY);
    const transformedU = add(add(multiply(tileU, materialScale.x), materialOffset.x), custom[1]);
    const transformedNativeV = add(add(multiply(tileNativeV, materialScale.y), materialOffset.y), custom[0]);
    output[index * 2] = transformedU;
    output[index * 2 + 1] = subtract(1, transformedNativeV);
  }
  return output;
}

function currentLinearColor(
  sample: ParticleRenderSample,
  applyActiveColorSpace: boolean,
): readonly [number, number, number, number] {
  const color = [
    requiredBits(sample.color.redBits), requiredBits(sample.color.greenBits),
    requiredBits(sample.color.blueBits), requiredBits(sample.color.alphaBits),
  ] as const;
  return Object.freeze([
    applyActiveColorSpace ? gammaToLinear(color[0]) : color[0],
    applyActiveColorSpace ? gammaToLinear(color[1]) : color[1],
    applyActiveColorSpace ? gammaToLinear(color[2]) : color[2],
    color[3],
  ] as const);
}

function gammaToLinear(value: number): number {
  return f32(value <= Math.fround(0.04045)
    ? divide(value, Math.fround(12.92))
    : Math.pow(divide(add(value, Math.fround(0.055)), Math.fround(1.055)), Math.fround(2.4)));
}

function requiredCustomData(value: ParticleFloat32Vector4 | null): readonly [number, number, number, number] {
  if (value === null) {
    throw fault("particle.geometry.custom-data", "The current custom-data shader requires one exact CustomData0 vector.");
  }
  return Object.freeze([
    requiredBits(value.xBits), requiredBits(value.yBits), requiredBits(value.zBits), requiredBits(value.wBits),
  ] as const);
}

function requiredOwnerTransform(instance: ParticleInstanceIdentity): ParticleOwnerTransform {
  if (instance.ownerTransform === undefined) {
    throw fault("particle.geometry.owner-transform", "Current particle primitive generation requires one explicit typed outer owner transform, including Game-clear UI_Root.");
  }
  return instance.ownerTransform;
}

function bitsVector3(value: { readonly xBits: string; readonly yBits: string; readonly zBits: string }): Vector3 {
  return [requiredBits(value.xBits), requiredBits(value.yBits), requiredBits(value.zBits)];
}

function bitsQuaternion(value: { readonly xBits: string; readonly yBits: string; readonly zBits: string; readonly wBits: string }): Quaternion {
  return [requiredBits(value.xBits), requiredBits(value.yBits), requiredBits(value.zBits), requiredBits(value.wBits)];
}

function requiredBits(bits: string): number {
  const value = particleFloat32FromBits(bits);
  if (value === null) throw fault("particle.geometry.float32-bits", "Primitive generation accepts only finite exact binary32 fields.");
  return value;
}

function transformPoint(value: Vector3, transform: ParticleOwnerTransform): Vector3 {
  return addVector(transformVector(value, transform), bitsVector3(transform.position));
}

function transformVector(value: Vector3, transform: ParticleOwnerTransform): Vector3 {
  const scale = bitsVector3(transform.scale);
  return quaternionRotate([
    multiply(value[0], scale[0]), multiply(value[1], scale[1]), multiply(value[2], scale[2]),
  ], bitsQuaternion(transform.rotation));
}

function transformQuaternion(transform: ParticleTransformProfile): Quaternion {
  return [
    f32(transform.m_LocalRotation.x), f32(transform.m_LocalRotation.y),
    f32(transform.m_LocalRotation.z), f32(transform.m_LocalRotation.w),
  ];
}

function eulerQuaternion(rotation: Vector3): Quaternion {
  const hx = multiply(rotation[0], 0.5);
  const hy = multiply(rotation[1], 0.5);
  const hz = multiply(rotation[2], 0.5);
  const sx = f32(Math.sin(hx)); const cx = f32(Math.cos(hx));
  const sy = f32(Math.sin(hy)); const cy = f32(Math.cos(hy));
  const sz = f32(Math.sin(hz)); const cz = f32(Math.cos(hz));
  return [
    add(multiply(multiply(sx, cy), cz), multiply(multiply(cx, sy), sz)),
    subtract(multiply(multiply(cx, sy), cz), multiply(multiply(sx, cy), sz)),
    add(multiply(multiply(cx, cy), sz), multiply(multiply(sx, sy), cz)),
    subtract(multiply(multiply(cx, cy), cz), multiply(multiply(sx, sy), sz)),
  ];
}

function quaternionRotate(vector: Vector3, quaternion: Quaternion): Vector3 {
  const [x, y, z] = vector.map(f32) as [number, number, number];
  const [qx, qy, qz, qw] = quaternion.map(f32) as [number, number, number, number];
  const tx = multiply(2, subtract(multiply(qy, z), multiply(qz, y)));
  const ty = multiply(2, subtract(multiply(qz, x), multiply(qx, z)));
  const tz = multiply(2, subtract(multiply(qx, y), multiply(qy, x)));
  return [
    add(x, add(multiply(qw, tx), subtract(multiply(qy, tz), multiply(qz, ty)))),
    add(y, add(multiply(qw, ty), subtract(multiply(qz, tx), multiply(qx, tz)))),
    add(z, add(multiply(qw, tz), subtract(multiply(qx, ty), multiply(qy, tx)))),
  ];
}

function applyBasis(value: Vector3, basis: readonly [Vector3, Vector3, Vector3]): Vector3 {
  return addVector(scaleVector(basis[0], value[0]), addVector(
    scaleVector(basis[1], value[1]), scaleVector(basis[2], value[2]),
  ));
}

function projectPoint(value: Vector3, scene: ParticlePixiSceneProfile): Vector2 {
  const ppu = requiredBits(scene.pixelsPerWorldUnitBits);
  const centerX = requiredBits(scene.worldCenterXBits);
  const centerY = requiredBits(scene.worldCenterYBits);
  return [
    f32(scene.viewportWidth / 2 + multiply(subtract(value[0], centerX), ppu)),
    f32(scene.viewportHeight / 2 - multiply(subtract(value[1], centerY), ppu)),
  ];
}

function projectVector(value: Vector3, scene: ParticlePixiSceneProfile): Vector2 {
  const ppu = requiredBits(scene.pixelsPerWorldUnitBits);
  return [multiply(value[0], ppu), multiply(-value[1], ppu)];
}

function projectedLargestDimension(values: readonly Vector2[]): number {
  const xs = values.map((value) => value[0]);
  const ys = values.map((value) => value[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function primitiveBounds(positions: Float32Array, world: readonly Vector3[]): ParticleNativePrimitiveBounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < positions.length; index += 2) {
    xs.push(positions[index]!);
    ys.push(positions[index + 1]!);
  }
  const zs = world.map((value) => value[2]);
  return Object.freeze({
    left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys),
    nearZ: Math.min(...zs), farZ: Math.max(...zs),
  });
}

function unionBounds(values: readonly ParticleNativePrimitiveBounds[]): ParticleNativePrimitiveBounds {
  return Object.freeze({
    left: Math.min(...values.map((value) => value.left)),
    top: Math.min(...values.map((value) => value.top)),
    right: Math.max(...values.map((value) => value.right)),
    bottom: Math.max(...values.map((value) => value.bottom)),
    nearZ: Math.min(...values.map((value) => value.nearZ)),
    farZ: Math.max(...values.map((value) => value.farZ)),
  });
}

function intersectsOrthographicViewport(bounds: ParticleNativePrimitiveBounds, scene: ParticlePixiSceneProfile): boolean {
  // The current gameplay camera is at Z=-15 with near=0/far=25.
  return bounds.right >= 0 && bounds.left <= scene.viewportWidth &&
    bounds.bottom >= 0 && bounds.top <= scene.viewportHeight &&
    bounds.farZ >= -15 && bounds.nearZ <= 10;
}

function addVector(left: Vector3, right: Vector3): Vector3 {
  return [add(left[0], right[0]), add(left[1], right[1]), add(left[2], right[2])];
}
function scaleVector(value: Vector3, scalar: number): Vector3 {
  return [multiply(value[0], scalar), multiply(value[1], scalar), multiply(value[2], scalar)];
}
function vectorLength(value: Vector3): number {
  return f32(Math.sqrt(add(add(multiply(value[0], value[0]), multiply(value[1], value[1])), multiply(value[2], value[2]))));
}
function normalizeOr(value: Vector3, fallback: Vector3): Vector3 {
  const length = vectorLength(value);
  return length > ZERO_EPSILON ? scaleVector(value, divide(1, length)) : fallback;
}
function f32(value: number): number { return Math.fround(value); }
function add(left: number, right: number): number { return f32(f32(left) + f32(right)); }
function subtract(left: number, right: number): number { return f32(f32(left) - f32(right)); }
function multiply(left: number, right: number): number { return f32(f32(left) * f32(right)); }
function divide(left: number, right: number): number { return f32(f32(left) / f32(right)); }
function fault(capability: string, boundary: string): ParticleGeometryFault {
  return new ParticleGeometryFault(capability, boundary);
}
