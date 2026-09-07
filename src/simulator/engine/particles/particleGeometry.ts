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
import { calculateNativeStretchArithmetic, calculateNativeStretchNormals, calculateNativeBillboardNormals } from "./particleStretchedGeometry";
import { calculateNativeMeshPivotOffset, calculateNativeMeshVertices, calculateNativeMeshMatrixColumns } from "./particleMeshGeometry";
import { calculateNativeParticleLocalBillboardBasis, calculateNativeParticleViewBillboardBasis } from "./particleHierarchyScale";
import { calculateNativeParticleOrthographicHalfSize, calculateNativeParticleOrthographicWidth } from "./particleSizeLimit";
import { calculateNativeScalarBillboardRotation, calculateNative3DBillboardRotation, calculateNativeSimpleBillboardDiagonals, calculateNativeBillboardVertices, calculateNativeMeshEulerQuaternion, calculateNativeMeshScalarQuaternion } from "./particleBillboardRotation";
import { calculateNativeMeshNormals } from "./particleNormalGeometry";

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
  const systemSamples = new Map(samples.map((sample) => [`${sample.ownerKey}\u0000${sample.systemId}`, sample]));
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
  for (const [key, rows] of grouped) {
    const bounds = nativeRendererBounds(systemSamples.get(key)!, scene) ?? unionBounds(rows.map((row) => row.bounds));
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
  const worldCenter = particleWorldCenter(sample, transform);
  const size = bitsVector3(sample.size);
  const rotation = bitsVector3(sample.rotation);
  const outerScale = bitsVector3(transform.scale);
  const outerRotation = bitsQuaternion(transform.rotation);
  const isStretched = binding.renderer.m_RenderMode === 1;
  const hasIdentityOwner = outerScale.every((value) => value === 1) && outerRotation[0] === 0 &&
    outerRotation[1] === 0 && outerRotation[2] === 0 && outerRotation[3] === 1;
  const hasIdentityMeshOwner = binding.renderer.m_RenderMode === 4 && hasIdentityOwner;
  const hasNativeWorldVertices = isStretched || hasIdentityMeshOwner;
  const source = isStretched
    ? stretchedBillboard(binding, sample, transform, worldCenter, outerScale, scene)
    : sourceGeometry(binding, size, rotation, sample, scene, hasIdentityMeshOwner ? worldCenter : [0, 0, 0]);
  const offsets = hasNativeWorldVertices ? source.vertices : (source.simpleDiagonals ?? source.vertices).map((vertex) => quaternionRotate([
    multiply(vertex[0], outerScale[0]),
    multiply(vertex[1], outerScale[1]),
    multiply(vertex[2], outerScale[2]),
  ], outerRotation));
  // BND-C127/C141: preserve native mesh and quad normal stores. Quad normals
  // need not have unit length; identity owners must not normalize them again.
  const worldNormals = isStretched || hasIdentityOwner ? source.normals
    : source.normals.map((normal) => normalizeOr(quaternionRotate(normal, outerRotation), [0, 0, -1]));
  const projectedCenter = projectPoint(worldCenter, scene);
  const worldVertices = source.simpleDiagonals === undefined ? offsets.map((offset) => {
    // The native stretched worker publishes world vertices directly. Turning
    // its tail into an offset and adding the head again adds Float32 cancellation.
    // BND-C131/C133: mesh center and pivot enter the native matrix before its
    // vertex stores. Preserve those world points without a later screen clamp.
    return hasNativeWorldVertices ? offset : addVector(worldCenter, offset);
  }) : calculateNativeBillboardVertices(worldCenter, [offsets[0]!, offsets[1]!]);
  const positions = new Float32Array(worldVertices.length * 2);
  for (let index = 0; index < worldVertices.length; index += 1) {
    const projected = projectPoint(worldVertices[index]!, scene);
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
  _size: Vector3,
  rotation: Vector3,
  sample: ParticleRenderSample,
  scene: ParticlePixiSceneProfile,
  meshCenter: Vector3 = [0, 0, 0],
): {
  readonly vertices: readonly Vector3[];
  readonly simpleDiagonals?: readonly [Vector3, Vector3];
  readonly uv0: readonly Vector2[];
  readonly normals: readonly Vector3[];
  readonly indices: readonly number[];
} {
  if (binding.renderer.m_RenderMode === 4) {
    if (sample.sizeBeforeTransform === undefined || sample.transformSize === undefined) {
      throw fault("particle.geometry.mesh-size", "Mesh matrices require raw particle size and its separate Transform scale.");
    }
    const mesh = binding.mesh!;
    const basis = alignmentBasis(binding);
    const particleRotation = meshRotationQuaternion(binding, rotation);
    const pivot = binding.renderer.m_Pivot;
    const rawSize = bitsVector3(sample.sizeBeforeTransform);
    const transformSize = bitsVector3(sample.transformSize);
    const visibleSize = visibleMeshSize(rawSize, sample);
    const pivotOffset = calculateNativeMeshPivotOffset(mesh.serializedSha256, [pivot.x, pivot.y, pivot.z]);
    if (pivotOffset === undefined) {
      throw fault("particle.geometry.mesh-bounds", "Mesh pivot requires the exact source-bound native mesh bounds.");
    }
    return Object.freeze({
      vertices: Object.freeze(calculateNativeMeshVertices(mesh.vertices, particleRotation, visibleSize, basis, pivotOffset, transformSize, meshCenter)),
      uv0: mesh.uv0,
      normals: Object.freeze(calculateNativeMeshNormals(mesh.normals,
        calculateNativeMeshMatrixColumns(particleRotation, visibleSize, basis, transformSize))),
      indices: mesh.screenYReflectionIndices,
    });
  }
  if (sample.sizeBeforeTransform === undefined) {
    throw fault("particle.geometry.billboard-size", "Billboards require current particle size before Transform scaling.");
  }
  const halfSize = visibleBillboardHalfSize(billboardHalfSize(binding, sample, scene), sample);
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
  const pivot = binding.renderer.m_Pivot;
  const complexBillboard = hasSignificantBillboardPivot(pivot) || hasBillboardSizeAxes(binding);
  const coordinates = complexBillboard
    ? billboardPivotCoordinates(sample, halfSize, pivot)
    : [];
  const positionBasis = complexBillboard
    ? billboardRotationBasis(binding, basis, rotation)
    : basis;
  const simpleDiagonals = complexBillboard ? undefined : simpleBillboardDiagonals(binding, basis, rotation, halfSize);
  const vertices = simpleDiagonals === undefined
    ? coordinates.map((vertex) => applyBasis(vertex, positionBasis))
    : calculateNativeBillboardVertices([0, 0, 0], simpleDiagonals);
  // BND-C137: complex normals include the raw pivot through native offsets.
  // Simple workers pass their diagonals directly, preserving signed zeros.
  const normalOffsets = simpleDiagonals ?? [vertices[2]!, vertices[3]!];
  const normals = calculateNativeBillboardNormals(normalOffsets[0]!, normalOffsets[1]!, binding.renderer.m_NormalDirection);
  return Object.freeze({
    vertices: Object.freeze(vertices),
    simpleDiagonals,
    uv0: Object.freeze([[0, 0], [1, 0], [0, 1], [1, 1]] as const),
    normals: Object.freeze(normals),
    indices: SCREEN_REFLECTED_QUAD_INDICES,
  });
}

function simpleBillboardDiagonals(
  binding: GeometryBinding,
  basis: readonly [Vector3, Vector3, Vector3],
  rotation: Vector3,
  halfSize: Vector2,
): readonly [Vector3, Vector3] {
  const keys = binding.bundle.profiles[binding.system.profile]!.modules;
  const modules = binding.bundle.moduleProfiles;
  const initial = keys.InitialModule === undefined ? undefined : modules.InitialModule?.[keys.InitialModule];
  const shape = keys.ShapeModule === undefined ? undefined : modules.ShapeModule?.[keys.ShapeModule];
  const lifetime = keys.RotationModule === undefined ? undefined : modules.RotationModule?.[keys.RotationModule];
  const speed = keys.RotationBySpeedModule === undefined ? undefined : modules.RotationBySpeedModule?.[keys.RotationBySpeedModule];
  const requires3D = initial?.rotation3D === true || shape?.alignToDirection === true ||
    lifetime?.separateAxes === true || speed?.separateAxes === true;
  return calculateNativeSimpleBillboardDiagonals(basis, rotation, halfSize, requires3D);
}

function hasBillboardSizeAxes(binding: GeometryBinding): boolean {
  const keys = binding.bundle.profiles[binding.system.profile]!.modules;
  const modules = binding.bundle.moduleProfiles;
  const initial = keys.InitialModule === undefined ? undefined : modules.InitialModule?.[keys.InitialModule];
  const lifetime = keys.SizeModule === undefined ? undefined : modules.SizeModule?.[keys.SizeModule];
  // The registered source domain has no enabled SizeBySpeedModule.
  return initial?.size3D === true || lifetime?.separateAxes === true;
}

function billboardRotationBasis(
  binding: GeometryBinding,
  basis: readonly [Vector3, Vector3, Vector3],
  rotation: Vector3,
): readonly [Vector3, Vector3, Vector3] {
  const keys = binding.bundle.profiles[binding.system.profile]!.modules;
  const modules = binding.bundle.moduleProfiles;
  const initial = keys.InitialModule === undefined ? undefined : modules.InitialModule?.[keys.InitialModule];
  const shape = keys.ShapeModule === undefined ? undefined : modules.ShapeModule?.[keys.ShapeModule];
  const lifetime = keys.RotationModule === undefined ? undefined : modules.RotationModule?.[keys.RotationModule];
  const speed = keys.RotationBySpeedModule === undefined ? undefined : modules.RotationBySpeedModule?.[keys.RotationBySpeedModule];
  const requires3D = initial?.rotation3D === true || shape?.alignToDirection === true ||
    lifetime?.separateAxes === true || speed?.separateAxes === true;
  return requires3D
    ? calculateNative3DBillboardRotation(basis, rotation)
    : calculateNativeScalarBillboardRotation(basis, rotation[2]);
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

function visibleMeshSize(size: Vector3, sample: ParticleRenderSample): Vector3 {
  // BND-C107: the mesh matrix masks all size axes at age>=100. Its normal
  // matrix is constructed before this mask and does not use the masked size.
  return requiredBits(sample.agePercentBits!) >= 100 ? [0, 0, 0] : size;
}

function visibleBillboardHalfSize(halfSize: Vector2, sample: ParticleRenderSample): Vector2 {
  // All four native workers mask limited half sizes with 100>percentageAge.
  // Raw size remains available to the complex worker's pivot displacement.
  return requiredBits(sample.agePercentBits!) < 100 ? halfSize : [0, 0];
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
  sample: ParticleRenderSample,
  ownerTransform: ParticleOwnerTransform,
  worldCenter: Vector3,
  outerScale: Vector3,
  scene: ParticlePixiSceneProfile,
): {
  readonly vertices: readonly Vector3[];
  readonly simpleDiagonals?: readonly [Vector3, Vector3];
  readonly uv0: readonly Vector2[];
  readonly normals: readonly Vector3[];
  readonly indices: readonly number[];
} {
  // Current non-Freeform worker, not a centered rotated billboard. The native
  // camera is at (0,0,-15), looking +Z; Unity view space reflects its Z axis.
  const cameraPosition: Vector3 = [worldCenter[0], worldCenter[1], -add(worldCenter[2], 15)];
  // BND-C95: the stretch worker limits raw sizes using the same camera-width
  // coefficients as billboards. Its side basis applies runtime scale afterward.
  const halfSize = billboardHalfSize(binding, sample, scene);
  // 12C8794/9C clears all half-width bits at age100, while the removal
  // predicate remains age>100. Keep this separate from diagnostic seconds.
  const halfWidth = requiredBits(sample.agePercentBits!) < 100 ? halfSize[0] : 0;
  const rawSize = bitsVector3(sample.sizeBeforeTransform!);
  const transformSize = bitsVector3(sample.transformSize!);
  const sideBasis = viewBillboardBasis(sample);
  const arithmetic = calculateNativeStretchArithmetic({
    cameraPosition,
    cameraVelocity: nativeStretchCameraVelocity(sample, ownerTransform),
    sizeY: rawSize[1],
    scaledLength: multiply(multiply(binding.renderer.m_LengthScale, transformSize[0]), outerScale[0]),
    velocityScale: binding.renderer.m_VelocityScale,
    halfWidth,
  });
  const tail: Vector3 = [
    arithmetic.tail[0],
    arithmetic.tail[1],
    subtract(-15, arithmetic.tail[2]),
  ];
  const side = applyBasis([arithmetic.sideXY[0], arithmetic.sideXY[1], 0], sideBasis)
    .map((value, axis) => multiply(value, outerScale[axis]!)) as unknown as Vector3;
  const opposite = scaleVector(side, -1);
  const longitudinal: Vector3 = [subtract(tail[0], worldCenter[0]), subtract(tail[1], worldCenter[1]), subtract(tail[2], worldCenter[2])];
  const normals = calculateNativeStretchNormals(side, longitudinal, binding.renderer.m_NormalDirection);
  return Object.freeze({
    // Reorder the native perimeter head+,tail+,tail-,head- to our grid indices.
    // Absolute world vertices: do not rotate by the emitter or re-add the head.
    vertices: Object.freeze([addVector(worldCenter, side), addVector(tail, side), addVector(worldCenter, opposite), addVector(tail, opposite)]),
    uv0: Object.freeze([[0, 1], [1, 1], [0, 0], [1, 0]] as const),
    normals: Object.freeze(normals),
    indices: SCREEN_REFLECTED_QUAD_INDICES,
  });
}

function nativeStretchCameraVelocity(sample: ParticleRenderSample, ownerTransform: ParticleOwnerTransform): Vector3 {
  if (sample.simulationVelocity === undefined || sample.simulationToWorld === undefined) {
    throw fault("particle.geometry.stretch-velocity", "Native stretch requires the gathered simulation velocity and its matrix columns.");
  }
  // BND-C93, 12C814C..12C81F8 and 12C8C00..12C8CE4. Compose
  // camera/local columns first; reflecting an already summed world velocity
  // loses the original zero terms and their signs. Current camera is stationary.
  const view: readonly [Vector3, Vector3, Vector3] = [[1, 0, 0], [0, 1, 0], [0, 0, -1]];
  const ownerToCamera = [
    applyBasis(transformVector([1, 0, 0], ownerTransform), view),
    applyBasis(transformVector([0, 1, 0], ownerTransform), view),
    applyBasis(transformVector([0, 0, 1], ownerTransform), view),
  ] as const;
  const columns = sample.simulationToWorld.map((column) => applyBasis(bitsVector3(column), ownerToCamera)) as unknown as readonly [Vector3, Vector3, Vector3];
  const velocity = applyBasis(bitsVector3(sample.simulationVelocity), columns);
  return [subtract(velocity[0], 0), subtract(velocity[1], 0), subtract(velocity[2], 0)];
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

function particleWorldCenter(sample: ParticleRenderSample, transform: ParticleOwnerTransform): Vector3 {
  const position = bitsVector3(sample.position);
  // BND-C177: the full native matrix has already rounded the owner hierarchy.
  if (sample.nativeOwnerHierarchy === true) {
    if (sample.instance.kind !== "game-play-button" || transform.source !== "game-play-button") {
      throw fault("particle.geometry.owner-hierarchy", "Native owner composition is bound to gameplay button particles.");
    }
    return position;
  }
  return transformPoint(position, transform);
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

function meshRotationQuaternion(binding: GeometryBinding, rotation: Vector3): Quaternion {
  const keys = binding.bundle.profiles[binding.system.profile]!.modules;
  const modules = binding.bundle.moduleProfiles;
  const initial = keys.InitialModule === undefined ? undefined : modules.InitialModule?.[keys.InitialModule];
  const shape = keys.ShapeModule === undefined ? undefined : modules.ShapeModule?.[keys.ShapeModule];
  const lifetime = keys.RotationModule === undefined ? undefined : modules.RotationModule?.[keys.RotationModule];
  const speed = keys.RotationBySpeedModule === undefined ? undefined : modules.RotationBySpeedModule?.[keys.RotationBySpeedModule];
  const requires3D = initial?.rotation3D === true || shape?.alignToDirection === true ||
    lifetime?.separateAxes === true || speed?.separateAxes === true;
  return requires3D ? calculateNativeMeshEulerQuaternion(rotation) : calculateNativeMeshScalarQuaternion(rotation[2]);
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

function nativeRendererBounds(sample: ParticleRenderSample, scene: ParticlePixiSceneProfile): ParticleNativePrimitiveBounds | undefined {
  if (sample.rendererWorldBounds === undefined) return undefined;
  const owner = requiredOwnerTransform(sample.instance);
  // The source C153 publication is bound to the native runtime Transform.
  // BND-C176/C177 button matrices already include their complete owner chain.
  if (sample.nativeOwnerHierarchy !== true && (bitsVector3(owner.position).some((v) => v !== 0) || bitsVector3(owner.scale).some((v) => v !== 1) ||
    bitsQuaternion(owner.rotation).some((v, i) => v !== (i === 3 ? 1 : 0)))) return undefined;
  const center = bitsVector3(sample.rendererWorldBounds.center), extent = bitsVector3(sample.rendererWorldBounds.extents);
  const min: Vector3 = [subtract(center[0], extent[0]), subtract(center[1], extent[1]), subtract(center[2], extent[2])];
  const max: Vector3 = [add(center[0], extent[0]), add(center[1], extent[1]), add(center[2], extent[2])];
  const lo = projectPoint(min, scene), hi = projectPoint(max, scene);
  return Object.freeze({ left: lo[0], top: hi[1], right: hi[0], bottom: lo[1], nearZ: min[2], farZ: max[2] });
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
