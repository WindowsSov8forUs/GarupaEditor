export type ParticleBackendState =
  | "unprepared"
  | "preparing"
  | "ready"
  | "faulted"
  | "disposed";

export type ParticleFailureCode =
  | "integrity-failure"
  | "particle-resource-unavailable"
  | "particle-resource-integrity"
  | "particle-resource-decode"
  | "particle-backend-fault"
  | "terminal-disposed";

export interface ParticleFailure {
  readonly code: ParticleFailureCode;
  readonly capability: string;
  readonly boundary: string;
}

export type ParticleOperationResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: ParticleFailureCode; readonly failure: ParticleFailure };

export interface ParticleSampleIdentity {
  readonly package: "jp.co.craftegg.band";
  readonly versionName: "10.1.4";
  readonly versionCode: 230;
  readonly abi: "arm64-v8a";
  readonly unityVersion: "2022.3.62f1";
}

export interface ParticleVector2 {
  readonly x: number;
  readonly y: number;
}

export interface ParticleVector3 extends ParticleVector2 {
  readonly z: number;
}

export interface ParticleQuaternion extends ParticleVector3 {
  readonly w: number;
}

export interface ParticleTransformProfile {
  readonly m_LocalPosition: ParticleVector3;
  readonly m_LocalRotation: ParticleQuaternion;
  readonly m_LocalScale: ParticleVector3;
}

export type ParticleCurveSlope = number | "number:+infinity" | "number:-infinity";

export interface ParticleCurveKey {
  readonly time: number;
  readonly value: number;
  readonly inSlope: ParticleCurveSlope;
  readonly outSlope: ParticleCurveSlope;
  readonly weightedMode: number;
  readonly inWeight: number;
  readonly outWeight: number;
}

export interface ParticleAnimationCurve {
  readonly m_Curve: readonly ParticleCurveKey[];
  readonly m_PreInfinity: number;
  readonly m_PostInfinity: number;
  readonly m_RotationOrder: number;
}

export interface ParticleMinMaxCurve {
  readonly minMaxState: 0 | 1 | 2 | 3;
  readonly scalar: number;
  readonly minScalar: number;
  readonly maxCurve: ParticleAnimationCurve;
  readonly minCurve: ParticleAnimationCurve;
}

export interface ParticleColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ParticleGradient {
  readonly key0: ParticleColor;
  readonly key1: ParticleColor;
  readonly key2: ParticleColor;
  readonly key3: ParticleColor;
  readonly key4: ParticleColor;
  readonly key5: ParticleColor;
  readonly key6: ParticleColor;
  readonly key7: ParticleColor;
  readonly ctime0: number;
  readonly ctime1: number;
  readonly ctime2: number;
  readonly ctime3: number;
  readonly ctime4: number;
  readonly ctime5: number;
  readonly ctime6: number;
  readonly ctime7: number;
  readonly atime0: number;
  readonly atime1: number;
  readonly atime2: number;
  readonly atime3: number;
  readonly atime4: number;
  readonly atime5: number;
  readonly atime6: number;
  readonly atime7: number;
  readonly m_Mode: 0 | 1;
  readonly m_ColorSpace: -1;
  readonly m_NumColorKeys: number;
  readonly m_NumAlphaKeys: number;
}

export interface ParticleMinMaxGradient {
  readonly minMaxState: 0 | 1 | 2 | 3 | 4;
  readonly minColor: ParticleColor;
  readonly maxColor: ParticleColor;
  readonly maxGradient: ParticleGradient;
  readonly minGradient: ParticleGradient;
}

export interface ParticleSystemProfile {
  readonly lengthInSec: number;
  readonly simulationSpeed: number;
  readonly stopAction: number;
  readonly cullingMode: 0 | 1 | 3;
  readonly ringBufferMode: number;
  readonly ringBufferLoopRange: ParticleVector2;
  readonly emitterVelocityMode: number;
  readonly looping: boolean;
  readonly prewarm: boolean;
  readonly playOnAwake: boolean;
  readonly useUnscaledTime: boolean;
  readonly autoRandomSeed: boolean;
  readonly startDelay: ParticleMinMaxCurve;
  readonly moveWithTransform: number;
  readonly moveWithCustomTransform: unknown;
  readonly scalingMode: 0 | 1;
  readonly randomSeed: number;
}

export interface ParticleInitialModule {
  readonly enabled: true;
  readonly startLifetime: ParticleMinMaxCurve;
  readonly startSpeed: ParticleMinMaxCurve;
  readonly startColor: ParticleMinMaxGradient;
  readonly startSize: ParticleMinMaxCurve;
  readonly startSizeY: ParticleMinMaxCurve;
  readonly startSizeZ: ParticleMinMaxCurve;
  readonly startRotation: ParticleMinMaxCurve;
  readonly startRotationX: ParticleMinMaxCurve;
  readonly startRotationY: ParticleMinMaxCurve;
  readonly gravityModifier: ParticleMinMaxCurve;
  readonly maxNumParticles: number;
  readonly size3D: boolean;
  readonly rotation3D: boolean;
  readonly randomizeRotationDirection: number;
  readonly gravitySource: number;
  readonly customEmitterVelocity: ParticleVector3;
}

export interface ParticleBurstProfile {
  readonly time: number;
  readonly countCurve: ParticleMinMaxCurve;
  readonly cycleCount: number;
  readonly repeatInterval: number;
  readonly probability: number;
}

export interface ParticleEmissionModule {
  readonly enabled: true;
  readonly rateOverTime: ParticleMinMaxCurve;
  readonly rateOverDistance: ParticleMinMaxCurve;
  readonly m_BurstCount: number;
  readonly m_Bursts: readonly ParticleBurstProfile[];
}

export interface ParticleShapeScalar {
  readonly value: number;
  readonly mode: number;
  readonly spread: number;
  readonly speed: ParticleMinMaxCurve;
}

export interface ParticleShapeModule {
  readonly enabled: true;
  readonly type: 0 | 4 | 5 | 8 | 10;
  readonly radius: ParticleShapeScalar;
  readonly radiusThickness: number;
  readonly angle: number;
  readonly length: number;
  readonly boxThickness: ParticleVector3;
  readonly donutRadius: number;
  readonly arc: ParticleShapeScalar;
  readonly placementMode: 0;
  readonly m_MeshMaterialIndex: number;
  readonly m_MeshNormalOffset: number;
  readonly m_MeshSpawn: Omit<ParticleShapeScalar, "value">;
  readonly m_Mesh: null;
  readonly m_MeshRenderer: null;
  readonly m_SkinnedMeshRenderer: null;
  readonly m_Sprite: null;
  readonly m_SpriteRenderer: null;
  readonly m_UseMeshMaterialIndex: boolean;
  readonly m_UseMeshColors: boolean;
  readonly m_Position: ParticleVector3;
  readonly m_Rotation: ParticleVector3;
  readonly m_Scale: ParticleVector3;
  readonly alignToDirection: boolean;
  readonly randomDirectionAmount: number;
  readonly sphericalDirectionAmount: number;
  readonly randomPositionAmount: number;
  readonly m_Texture: null;
  readonly m_TextureClipChannel: number;
  readonly m_TextureClipThreshold: number;
  readonly m_TextureUVChannel: number;
  readonly m_TextureColorAffectsParticles: boolean;
  readonly m_TextureAlphaAffectsParticles: boolean;
  readonly m_TextureBilinearFiltering: boolean;
}

export interface ParticleColorModule {
  readonly enabled: true;
  readonly gradient: ParticleMinMaxGradient;
}

export interface ParticleSizeModule {
  readonly enabled: true;
  readonly curve: ParticleMinMaxCurve;
  readonly separateAxes: boolean;
  readonly y: ParticleMinMaxCurve;
  readonly z: ParticleMinMaxCurve;
}

export interface ParticleRotationModule {
  readonly enabled: true;
  readonly curve: ParticleMinMaxCurve;
  readonly separateAxes: boolean;
  readonly x: ParticleMinMaxCurve;
  readonly y: ParticleMinMaxCurve;
}

export interface ParticleRotationBySpeedModule extends ParticleRotationModule {
  readonly range: ParticleVector2;
}

export interface ParticleClampVelocityModule {
  readonly enabled: true;
  readonly magnitude: ParticleMinMaxCurve;
  readonly dampen: number;
  readonly separateAxis: boolean;
  readonly inWorldSpace: boolean;
  readonly x: ParticleMinMaxCurve;
  readonly y: ParticleMinMaxCurve;
  readonly z: ParticleMinMaxCurve;
  readonly drag: ParticleMinMaxCurve;
  readonly multiplyDragByParticleSize: boolean;
  readonly multiplyDragByParticleVelocity: boolean;
}

export interface ParticleVelocityModule {
  readonly enabled: true;
  readonly x: ParticleMinMaxCurve;
  readonly y: ParticleMinMaxCurve;
  readonly z: ParticleMinMaxCurve;
  readonly orbitalX: ParticleMinMaxCurve;
  readonly orbitalY: ParticleMinMaxCurve;
  readonly orbitalZ: ParticleMinMaxCurve;
  readonly orbitalOffsetX: ParticleMinMaxCurve;
  readonly orbitalOffsetY: ParticleMinMaxCurve;
  readonly orbitalOffsetZ: ParticleMinMaxCurve;
  readonly radial: ParticleMinMaxCurve;
  readonly speedModifier: ParticleMinMaxCurve;
  readonly inWorldSpace: boolean;
}

export interface ParticleForceModule {
  readonly enabled: true;
  readonly x: ParticleMinMaxCurve;
  readonly y: ParticleMinMaxCurve;
  readonly z: ParticleMinMaxCurve;
  readonly inWorldSpace: boolean;
  readonly randomizePerFrame: boolean;
}

export interface ParticleCustomDataModule {
  readonly enabled: true;
  readonly mode0: number;
  readonly vectorComponentCount0: number;
  readonly color0: ParticleMinMaxGradient;
  readonly vector0_0: ParticleMinMaxCurve;
  readonly vector0_1: ParticleMinMaxCurve;
  readonly vector0_2: ParticleMinMaxCurve;
  readonly vector0_3: ParticleMinMaxCurve;
  readonly mode1: number;
  readonly vectorComponentCount1: number;
  readonly color1: ParticleMinMaxGradient;
  readonly vector1_0: ParticleMinMaxCurve;
  readonly vector1_1: ParticleMinMaxCurve;
  readonly vector1_2: ParticleMinMaxCurve;
  readonly vector1_3: ParticleMinMaxCurve;
}

export interface ParticleUvModule {
  readonly enabled: true;
  readonly frameOverTime: ParticleMinMaxCurve;
  readonly startFrame: ParticleMinMaxCurve;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly animationType: number;
  readonly rowMode: number;
  readonly rowIndex: number;
  readonly cycles: number;
  readonly timeMode: number;
  readonly fps: number;
  readonly uvChannelMask: number;
  readonly flipU: number;
  readonly flipV: number;
  readonly mode: number;
  readonly sprites: readonly unknown[];
  readonly speedRange: ParticleVector2;
}

export interface ParticleProfileDefinition {
  readonly system: ParticleSystemProfile;
  readonly modules: Readonly<Partial<Record<ParticleModuleType, string>>>;
  readonly renderer: string;
}

export type ParticleModuleType =
  | "InitialModule"
  | "EmissionModule"
  | "ShapeModule"
  | "ColorModule"
  | "SizeModule"
  | "RotationModule"
  | "RotationBySpeedModule"
  | "ClampVelocityModule"
  | "VelocityModule"
  | "ForceModule"
  | "CustomDataModule"
  | "UVModule";

export interface ParticleModuleProfileMap {
  readonly InitialModule?: Readonly<Record<string, ParticleInitialModule>>;
  readonly EmissionModule?: Readonly<Record<string, ParticleEmissionModule>>;
  readonly ShapeModule?: Readonly<Record<string, ParticleShapeModule>>;
  readonly ColorModule?: Readonly<Record<string, ParticleColorModule>>;
  readonly SizeModule?: Readonly<Record<string, ParticleSizeModule>>;
  readonly RotationModule?: Readonly<Record<string, ParticleRotationModule>>;
  readonly RotationBySpeedModule?: Readonly<Record<string, ParticleRotationBySpeedModule>>;
  readonly ClampVelocityModule?: Readonly<Record<string, ParticleClampVelocityModule>>;
  readonly VelocityModule?: Readonly<Record<string, ParticleVelocityModule>>;
  readonly ForceModule?: Readonly<Record<string, ParticleForceModule>>;
  readonly CustomDataModule?: Readonly<Record<string, ParticleCustomDataModule>>;
  readonly UVModule?: Readonly<Record<string, ParticleUvModule>>;
}

export interface ParticleRendererMaterialReference {
  readonly type: "Material";
  readonly name: string;
  /** Schema-2 renderer authority; optional only for legacy compile compatibility. */
  readonly fileId?: number;
  readonly pathId?: string;
}

export interface ParticleRendererObjectReference {
  readonly fileId: number;
  readonly pathId: string;
  readonly external?: string;
  readonly type?: string;
  readonly name?: string;
}

export interface ParticleRendererProfile {
  readonly m_Enabled: boolean;
  readonly m_Materials: readonly (ParticleRendererMaterialReference | null)[];
  readonly m_SortingLayerID?: number;
  readonly m_SortingLayer?: number;
  readonly m_SortingOrder: number;
  readonly m_SortingFudge?: number;
  readonly m_RendererPriority?: number;
  readonly m_RenderMode: 0 | 1 | 4;
  readonly m_RenderAlignment: 0 | 2;
  readonly m_MinParticleSize: number;
  readonly m_MaxParticleSize: number;
  readonly m_VelocityScale: number;
  readonly m_LengthScale: number;
  readonly m_NormalDirection: number;
  readonly m_SortMode: number;
  readonly m_ApplyActiveColorSpace: boolean;
  readonly m_RotateWithStretchDirection: boolean;
  readonly m_Pivot: ParticleVector3;
  readonly m_ShadowBias?: number;
  readonly m_Flip?: ParticleVector3;
  readonly m_EnableGPUInstancing?: boolean;
  readonly m_UseCustomVertexStreams?: boolean;
  readonly m_VertexStreams?: readonly number[];
  readonly m_UseCustomTrailVertexStreams?: boolean;
  readonly m_TrailVertexStreams?: readonly number[];
  readonly m_Mesh?: ParticleRendererObjectReference | null;
  readonly m_Mesh1?: ParticleRendererObjectReference | null;
  readonly m_Mesh2?: ParticleRendererObjectReference | null;
  readonly m_Mesh3?: ParticleRendererObjectReference | null;
  readonly m_MeshWeighting?: number;
  readonly m_MeshWeighting1?: number;
  readonly m_MeshWeighting2?: number;
  readonly m_MeshWeighting3?: number;
  readonly m_MaskInteraction?: number;
}

export interface ParticleMeshSubMeshProfile {
  readonly firstByte: number;
  readonly indexCount: number;
  readonly topology: 0;
  readonly baseVertex: number;
  readonly firstVertex: number;
  readonly vertexCount: number;
}

export interface ParticleMeshProfile {
  readonly kind: "builtin" | "embedded";
  readonly sourcePathId: string;
  readonly name: string;
  readonly serializedBytes: number;
  readonly serializedSha256: string;
  readonly vertices: readonly (readonly [number, number, number])[];
  readonly uv0: readonly (readonly [number, number])[];
  readonly normals: readonly (readonly [number, number, number])[];
  readonly indices: readonly number[];
  readonly screenYReflectionIndices: readonly number[];
  readonly subMeshes: readonly ParticleMeshSubMeshProfile[];
}

export interface ParticleMaterialProfile {
  readonly name: string;
  /** Exact resolved serialized shader name; renderer support is validated separately. */
  readonly shader: string;
  readonly texture: string | null;
  readonly blend: "add" | "normal";
  readonly sourcePathId?: string;
  readonly serializedBytes?: number;
  readonly serializedSha256?: string;
  readonly renderQueue?: 3000;
  readonly sourceBlendFactor?: 1 | 5;
  readonly destinationBlendFactor?: 1 | 10;
  readonly zWrite?: false;
  readonly cull?: "off";
  readonly fragment?:
    | "straight-rgba-modulate"
    | "premultiply-rgb-after-rgba-modulate"
    | "straight-rgba-modulate-custom0-yx-uv-offset";
  readonly mainTextureScale?: ParticleVector2;
  readonly mainTextureOffset?: ParticleVector2;
}

export interface ParticleTextureProfile {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaBytes: number;
  readonly rgbaSha256: string;
  readonly filterMode: 1;
  readonly wrapU: 0 | 1;
  readonly wrapV: 0 | 1;
}

export interface ParticleSystemDefinition {
  readonly identity: string;
  readonly sourceOrdinal?: number;
  readonly root: ParticleRootId;
  readonly path: string;
  readonly transform: ParticleTransformProfile;
  readonly parentTransforms: readonly ParticleTransformProfile[];
  /** root→immediate-parent flags identifying which ancestor Transforms receive ParticleSystem setup scale g. */
  readonly parentParticleSystemFlags?: readonly boolean[];
  readonly profile: string;
  /** Exact renderer/mesh object relation introduced by the current renderer-domain authority. */
  readonly meshProfile?: string | null;
  readonly rendererSourcePathId?: string;
  readonly rendererSerializedBytes?: number;
  readonly rendererSerializedSha256?: string;
  /** Legacy Schema-1 fixture field; native-semantic Schema 2 allocates runtime state per concrete instance. */
  readonly randomStateU32?: readonly [number, number, number, number];
}

export interface ParticleBundleProfile {
  readonly key: "ordinary" | "directional" | "game-clear";
  readonly systems: readonly ParticleSystemDefinition[];
  readonly profiles: Readonly<Record<string, ParticleProfileDefinition>>;
  readonly moduleProfiles: ParticleModuleProfileMap;
  readonly rendererProfiles: Readonly<Record<string, ParticleRendererProfile>>;
  /** Required for native-semantic production; optional only for legacy fixture source compatibility. */
  readonly meshProfiles?: Readonly<Record<string, ParticleMeshProfile>>;
  readonly materials: readonly ParticleMaterialProfile[];
  readonly textures: readonly ParticleTextureProfile[];
}

export interface ParticlePortableProfile {
  readonly schemaVersion: 1 | 2;
  readonly sample: ParticleSampleIdentity;
  readonly packIdentity: string;
  readonly fidelity: "current-static-portable" | "current-native-semantic-v2";
  readonly networkAllowed: false;
  readonly automaticFallbackAllowed: false;
  readonly systemCount: number;
  readonly profileCount: number;
  readonly bundles: readonly ParticleBundleProfile[];
}

export type ParticleRootId =
  | "ordinary:effect_TapKeep"
  | "ordinary:effect_tap"
  | "ordinary:effect_tap_good"
  | "ordinary:effect_tap_great"
  | "ordinary:effect_tap_perfect"
  | "ordinary:effect_tap_skill_good"
  | "ordinary:effect_tap_skill_great"
  | "ordinary:effect_tap_skill_perfect"
  | "ordinary:effect_tap_swipe"
  | "directional:effect_tap_directional_flick_l"
  | "directional:effect_tap_directional_flick_l_2"
  | "directional:effect_tap_directional_flick_l_3"
  | "directional:effect_tap_directional_flick_r"
  | "directional:effect_tap_directional_flick_r_2"
  | "directional:effect_tap_directional_flick_r_3"
  | "directional:effect_tap_directional_flick_l_finger"
  | "directional:effect_tap_directional_flick_r_finger"
  | "game-clear:base"
  | "game-clear:full-combo"
  | "game-clear:all-perfect";

export interface ParticleResourceAllowlistEntry {
  readonly logicalAssetId: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly mime: "application/json" | "image/png";
  readonly width: number | null;
  readonly height: number | null;
}

export interface ParticleCurrentResourceManifest {
  readonly schemaVersion: 1;
  readonly profileAssetId: "particle/profile/current-portable-v1";
  readonly textureManifestAssetId: "particle/textures/current-portable-v1";
  readonly resources: readonly ParticleResourceAllowlistEntry[];
}

export type ParticleTextureManifestEntry =
  | {
      readonly logicalAssetId: string;
      readonly bytes: number;
      readonly sha256: string;
      readonly width: number;
      readonly height: number;
      readonly rgbaBytes: number;
      readonly rgbaSha256: string;
    }
  | {
      readonly logicalAssetId: string;
      readonly aliasOf: string;
      readonly width: number;
      readonly height: number;
      readonly rgbaBytes: number;
      readonly rgbaSha256: string;
    };

export interface ParticleTextureManifest {
  readonly schemaVersion: 1;
  readonly status:
    | "eight-logical-textures-seven-unique-png-snapshots"
    | "selected-skin-portable-textures";
  readonly logicalTextureCount: number;
  readonly uniquePngCount: number;
  readonly entries: readonly ParticleTextureManifestEntry[];
  readonly productionBoundary: string;
}

export interface ParticlePreparedSourceFileIdentity {
  readonly logicalPath: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface ParticlePreparedSourceResourceIdentity {
  readonly logicalResource: string;
  readonly applicationRevision: string;
  readonly officialUnityFs: Readonly<{ readonly bytes: number; readonly sha256: string }> | null;
  readonly files: readonly ParticlePreparedSourceFileIdentity[];
}

export interface ParticlePreparedSourceIdentity {
  readonly kind: "application-snapshot";
  readonly semanticsSource:
    | "current-official-unityfs-profile"
    | "built-in-default-evidence-profile";
  readonly resources: readonly ParticlePreparedSourceResourceIdentity[];
}

export interface ParticlePreparedResourcePack {
  readonly profile: ParticlePortableProfile;
  readonly textures: ParticleTextureManifest;
  readonly pngBytes: ReadonlyMap<string, Uint8Array>;
  /** Optional only for legacy compile compatibility; production validation requires it. */
  readonly source?: ParticlePreparedSourceIdentity;
}

export interface ParticleResourceProvider {
  read(logicalAssetId: string): Promise<ParticleOperationResult<Uint8Array>>;
  readPreparedSkinPack?(): Promise<ParticleOperationResult<ParticlePreparedResourcePack>>;
}

export interface ParticleDecodedResourceMetadata {
  readonly width: number;
  readonly height: number;
}

export interface ParticleResourcePreflightAdapter {
  sha256(bytes: Uint8Array): Promise<ParticleOperationResult<string>>;
  inspectPng(bytes: Uint8Array): Promise<ParticleOperationResult<ParticleDecodedResourceMetadata>>;
}

export interface ParticleOwnerTransform {
  readonly source:
    | "game-play-button"
    | "original-note-slide"
    | "product-extension-note-slide";
  readonly position: ParticleFloat32Vector3;
  readonly rotation: ParticleFloat32Quaternion;
  readonly scale: ParticleFloat32Vector3;
}

export type ParticleInstanceIdentity =
  | {
      readonly kind: "game-clear";
      readonly buttonType: 0;
      readonly rangeLength: null;
    }
  | {
      readonly kind: "game-play-button";
      readonly buttonType: number;
      readonly rangeLength: number | null;
      /** Required by Schema-2 production; optional only for legacy source compilation. */
      readonly ownerTransform?: ParticleOwnerTransform;
      readonly particleSystemSetupScaleBits?: string;
    }
  | {
      readonly kind: "note-slide";
      readonly noteIndex: number;
      readonly absolutePosition: number;
      readonly buttonType: number;
      readonly rangeLength: number;
      /** Required by Schema-2 production; optional only for legacy source compilation. */
      readonly ownerTransform?: ParticleOwnerTransform;
      readonly particleSystemSetupScaleBits?: string;
      readonly poolSlot?: number;
      readonly route?: "original" | "product-extension";
      /** Deprecated compile-only fields; production command validation rejects nullable transform ownership. */
      readonly rootPositionXBits: string | null;
      readonly rootPositionYBits: string | null;
      readonly rootScaleBits: string | null;
    };

export type ParticleCommand =
  | {
      readonly kind: "play-root";
      readonly ownerKey: string;
      readonly instance: ParticleInstanceIdentity;
      readonly root: ParticleRootId;
      readonly restartIfActive: true;
    }
  | {
      readonly kind: "move-note-slide-root";
      readonly ownerKey: string;
      readonly instance: Extract<ParticleInstanceIdentity, { readonly kind: "note-slide" }>;
    }
  | {
      readonly kind: "stop-clear-deactivate-root";
      readonly ownerKey: string;
      readonly instance: ParticleInstanceIdentity;
      readonly root: ParticleRootId;
    }
  | {
      readonly kind: "clear-all";
      readonly reason: "movetime" | "game-over" | "natural-end" | "retry" | "reset" | "dispose";
    }
  | {
      readonly kind: "suppress-until-replay";
      readonly reason: "movetime";
    };

export interface ParticleFrameRequest {
  readonly frame: number;
  readonly deltaTimeBits: string;
  readonly paused: boolean;
  readonly commands: readonly ParticleCommand[];
}

export interface ParticleFrameBatch {
  readonly sessionId: string;
  readonly frame: number;
  readonly firstSequence: number;
  readonly commandCount: number;
}

export interface ParticleFloat32Vector3 {
  readonly xBits: string;
  readonly yBits: string;
  readonly zBits: string;
}

export interface ParticleFloat32Quaternion extends ParticleFloat32Vector3 {
  readonly wBits: string;
}

export interface ParticleFloat32Color {
  readonly redBits: string;
  readonly greenBits: string;
  readonly blueBits: string;
  readonly alphaBits: string;
}

export interface ParticleFloat32Vector4 {
  readonly xBits: string;
  readonly yBits: string;
  readonly zBits: string;
  readonly wBits: string;
}

export interface ParticleRenderSample {
  readonly particleId: string;
  readonly ownerKey: string;
  readonly instance: ParticleInstanceIdentity;
  readonly root: ParticleRootId;
  readonly systemId: string;
  readonly sourceOrdinal?: number;
  readonly ownerGeneration?: number;
  readonly ownerSortOrdinal?: number;
  readonly creationSequence: number;
  readonly position: ParticleFloat32Vector3;
  readonly velocity: ParticleFloat32Vector3;
  readonly size: ParticleFloat32Vector3;
  readonly rotation: ParticleFloat32Vector3;
  readonly color: ParticleFloat32Color;
  readonly ageBits: string;
  readonly lifetimeBits: string;
  readonly uvFrame: number;
  readonly sortingOrder: number;
  readonly sortingLayerId?: number;
  readonly sortingFudgeBits?: string;
  readonly rendererPriority?: number;
  readonly renderMode: 0 | 1 | 4;
  readonly renderAlignment: 0 | 2;
  readonly material: string | null;
  readonly meshProfile?: string | null;
  readonly customData0: ParticleFloat32Vector4 | null;
  readonly customData1: ParticleFloat32Vector4 | null;
}

export interface ParticleFrameSnapshot {
  readonly frame: number;
  readonly deltaTimeBits: string;
  readonly paused: boolean;
  readonly commands: readonly ParticleCommand[];
  readonly samples: readonly ParticleRenderSample[];
}

export interface ParticleOwnerSnapshot {
  readonly ownerKey: string;
  readonly instance: ParticleInstanceIdentity;
  readonly root: ParticleRootId;
  readonly restartCount: number;
}

export interface ParticleBackendFault {
  readonly code: "particle-backend-fault";
  readonly capability: string;
  readonly boundary: string;
}

export interface ParticleRandomStateSnapshot {
  readonly systemId: string;
  readonly ownerKey: string;
  readonly ownerGeneration: number;
  readonly seed: number;
  readonly stateU32: readonly [number, number, number, number];
  readonly emissionStateU32: readonly [number, number, number, number];
  readonly initialModuleStateU32: readonly (readonly [number, number, number, number])[];
  readonly shapeModuleStateU32: readonly (readonly [number, number, number, number])[];
  readonly rateAccumulatorBits: string;
  readonly birthCount: number;
}

export interface ParticleBackendSnapshot {
  readonly state: ParticleBackendState;
  readonly sessionId: string | null;
  readonly fidelity: ParticlePortableProfile["fidelity"] | null;
  readonly nextFrame: number | null;
  readonly nextSequence: number;
  readonly resourceCount: number;
  readonly suppressedUntilReplay: boolean;
  readonly activeOwners: readonly ParticleOwnerSnapshot[];
  readonly randomState: readonly ParticleRandomStateSnapshot[];
  readonly frames: readonly ParticleFrameSnapshot[];
  readonly fault: ParticleBackendFault | null;
}

export interface ParticlePixiButtonAnchor {
  readonly buttonType: number;
  readonly position: ParticleFloat32Vector3;
}

export interface ParticlePixiButtonOwner {
  readonly buttonType: number;
  readonly transform: ParticleOwnerTransform;
  readonly particleSystemSetupScaleBits: string;
}

export interface ParticleSlidePoolSceneProfile {
  readonly poolSize: 8;
  readonly initialCursor: 0;
  readonly firstAcquiredSlot: 1;
  readonly outerScaleBits: string;
  readonly particleSystemSetupScaleBits: string;
  readonly childLocalPosition: ParticleFloat32Vector3;
  readonly childLocalRotation: ParticleFloat32Quaternion;
  readonly childLocalScale: ParticleFloat32Vector3;
}

export interface ParticleSimulationSceneProfile {
  readonly gameplayTransformScaleBits: string;
}

export interface ParticlePixiSceneProfile {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly worldCenterXBits: string;
  readonly worldCenterYBits: string;
  readonly pixelsPerWorldUnitBits: string;
  readonly gameplayTransformScaleBits: string;
  readonly roundPixels: false;
  readonly buttonAnchors: readonly ParticlePixiButtonAnchor[];
  /** Required by production owner resolution; optional only for legacy source compilation. */
  readonly buttonOwners?: readonly ParticlePixiButtonOwner[];
  readonly slidePool?: ParticleSlidePoolSceneProfile;
}

export interface ParticleRendererFrameRequest {
  readonly sessionId: string;
  readonly frame: number;
  readonly samples: readonly ParticleRenderSample[];
}

export interface ParticleRendererFrameBatch {
  readonly sessionId: string;
  readonly frame: number;
  readonly sampleCount: number;
}

export interface ParticleRendererBackendSnapshot {
  readonly state: ParticleBackendState;
  readonly sessionId: string | null;
  readonly nextFrame: number | null;
  readonly resourceCount: number;
  readonly nodeCount: number;
  readonly lastSampleCount: number;
  readonly fault: ParticleBackendFault | null;
}

export interface SimulatorParticleRendererBackend {
  readonly id: string;
  prepare(
    sessionId: string,
    scene: ParticlePixiSceneProfile,
    provider: ParticleResourceProvider,
    preflight: ParticleResourcePreflightAdapter,
  ): Promise<ParticleOperationResult<void>>;
  preflightFrame(request: ParticleRendererFrameRequest): ParticleOperationResult<ParticleRendererFrameBatch>;
  commitFrame(batch: ParticleRendererFrameBatch): ParticleOperationResult<void>;
  discardFrame(batch: ParticleRendererFrameBatch): ParticleOperationResult<void>;
  recordTerminalFault(capability: string, boundary: string): ParticleOperationResult<never>;
  notifyContextLoss(): ParticleOperationResult<never>;
  snapshot(): ParticleRendererBackendSnapshot;
  dispose(): ParticleOperationResult<void>;
}

export interface SimulatorParticleBackend {
  readonly id: string;
  prepare(
    sessionId: string,
    scene: ParticleSimulationSceneProfile,
    provider: ParticleResourceProvider,
    preflight: ParticleResourcePreflightAdapter,
  ): Promise<ParticleOperationResult<void>>;
  preflightFrame(request: ParticleFrameRequest): ParticleOperationResult<ParticleFrameBatch>;
  previewFrame(batch: ParticleFrameBatch): ParticleOperationResult<readonly ParticleRenderSample[]>;
  commitFrame(batch: ParticleFrameBatch): ParticleOperationResult<void>;
  discardFrame(batch: ParticleFrameBatch): ParticleOperationResult<void>;
  recordTerminalFault(capability: string, boundary: string): ParticleOperationResult<never>;
  snapshot(): ParticleBackendSnapshot;
  dispose(): ParticleOperationResult<void>;
}
