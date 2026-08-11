export type ParticleBackendState =
  | "unprepared"
  | "preparing"
  | "ready"
  | "faulted"
  | "disposed";

export type ParticleFailureCode =
  | "evidence-required"
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

export interface ParticleCurveKey {
  readonly time: number;
  readonly value: number;
  readonly inSlope: number;
  readonly outSlope: number;
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
  readonly m_Mode: 0;
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
  readonly simulationSpeed: 1;
  readonly stopAction: 0;
  readonly cullingMode: 0 | 1 | 3;
  readonly ringBufferMode: 0;
  readonly ringBufferLoopRange: ParticleVector2;
  readonly emitterVelocityMode: 0;
  readonly looping: boolean;
  readonly prewarm: boolean;
  readonly playOnAwake: false;
  readonly useUnscaledTime: false;
  readonly autoRandomSeed: true;
  readonly startDelay: ParticleMinMaxCurve;
  readonly moveWithTransform: 0;
  readonly moveWithCustomTransform: null;
  readonly scalingMode: 1;
  readonly randomSeed: 0;
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
  readonly rotation3D: false;
  readonly randomizeRotationDirection: 0;
  readonly gravitySource: 0;
  readonly customEmitterVelocity: ParticleVector3;
}

export interface ParticleBurstProfile {
  readonly time: number;
  readonly countCurve: ParticleMinMaxCurve;
  readonly cycleCount: 1;
  readonly repeatInterval: number;
  readonly probability: 1;
}

export interface ParticleEmissionModule {
  readonly enabled: true;
  readonly rateOverTime: ParticleMinMaxCurve;
  readonly rateOverDistance: ParticleMinMaxCurve;
  readonly m_BurstCount: 1 | 2;
  readonly m_Bursts: readonly ParticleBurstProfile[];
}

export interface ParticleShapeScalar {
  readonly value: number;
  readonly mode: 0;
  readonly spread: 0;
  readonly speed: ParticleMinMaxCurve;
}

export interface ParticleShapeModule {
  readonly enabled: true;
  readonly type: 4 | 5 | 10;
  readonly radius: ParticleShapeScalar;
  readonly radiusThickness: 0 | 1;
  readonly angle: number;
  readonly length: number;
  readonly arc: ParticleShapeScalar;
  readonly m_Position: ParticleVector3;
  readonly m_Rotation: ParticleVector3;
  readonly m_Scale: ParticleVector3;
  readonly alignToDirection: false;
  readonly randomDirectionAmount: 0;
  readonly sphericalDirectionAmount: 0;
  readonly randomPositionAmount: 0;
}

export interface ParticleColorModule {
  readonly enabled: true;
  readonly gradient: ParticleMinMaxGradient;
}

export interface ParticleSizeModule {
  readonly enabled: true;
  readonly curve: ParticleMinMaxCurve;
  readonly separateAxes: false;
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
  readonly separateAxes: false;
  readonly range: ParticleVector2;
}

export interface ParticleClampVelocityModule {
  readonly enabled: true;
  readonly magnitude: ParticleMinMaxCurve;
  readonly dampen: number;
  readonly separateAxis: false;
  readonly inWorldSpace: false;
  readonly x: ParticleMinMaxCurve;
  readonly y: ParticleMinMaxCurve;
  readonly z: ParticleMinMaxCurve;
  readonly drag: ParticleMinMaxCurve;
  readonly multiplyDragByParticleSize: true;
  readonly multiplyDragByParticleVelocity: true;
}

export interface ParticleUvModule {
  readonly enabled: true;
  readonly frameOverTime: ParticleMinMaxCurve;
  readonly startFrame: ParticleMinMaxCurve;
  readonly tilesX: 4;
  readonly tilesY: 4;
  readonly animationType: 0;
  readonly rowMode: 1;
  readonly rowIndex: 0;
  readonly cycles: 1;
  readonly timeMode: 0;
  readonly fps: 30;
  readonly uvChannelMask: -1;
  readonly flipU: 0;
  readonly flipV: 0;
  readonly mode: 0;
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
  readonly UVModule?: Readonly<Record<string, ParticleUvModule>>;
}

export interface ParticleRendererMaterialReference {
  readonly type: "Material";
  readonly name: string;
}

export interface ParticleRendererProfile {
  readonly m_Enabled: boolean;
  readonly m_Materials: readonly (ParticleRendererMaterialReference | null)[];
  readonly m_SortingOrder: number;
  readonly m_RenderMode: 0 | 1;
  readonly m_RenderAlignment: 0 | 2;
  readonly m_MinParticleSize: 0;
  readonly m_MaxParticleSize: number;
  readonly m_VelocityScale: number;
  readonly m_LengthScale: number;
  readonly m_NormalDirection: number;
  readonly m_SortMode: 0;
  readonly m_ApplyActiveColorSpace: boolean;
  readonly m_RotateWithStretchDirection: true;
  readonly m_Pivot: ParticleVector3;
}

export interface ParticleMaterialProfile {
  readonly name: string;
  readonly shader:
    | "Legacy Shaders/Particles/Alpha Blended Premultiply"
    | "Mobile/Particles/Additive"
    | "Particles/Standard Unlit";
  readonly texture: string | null;
  readonly blend: "add" | "normal";
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
  readonly root: ParticleRootId;
  readonly path: string;
  readonly transform: ParticleTransformProfile;
  readonly parentTransforms: readonly ParticleTransformProfile[];
  readonly profile: string;
  readonly randomStateU32: readonly [number, number, number, number];
}

export interface ParticleBundleProfile {
  readonly key: "ordinary" | "directional";
  readonly systems: readonly ParticleSystemDefinition[];
  readonly profiles: Readonly<Record<string, ParticleProfileDefinition>>;
  readonly moduleProfiles: ParticleModuleProfileMap;
  readonly rendererProfiles: Readonly<Record<string, ParticleRendererProfile>>;
  readonly materials: readonly ParticleMaterialProfile[];
  readonly textures: readonly ParticleTextureProfile[];
}

export interface ParticlePortableProfile {
  readonly schemaVersion: 1;
  readonly sample: ParticleSampleIdentity;
  readonly packIdentity: "particle-current-10.1.4-portable-v1";
  readonly fidelity: "current-static-portable-complete";
  readonly networkAllowed: false;
  readonly automaticFallbackAllowed: false;
  readonly systemCount: 120;
  readonly profileCount: 100;
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
  | "directional:effect_tap_directional_flick_r_finger";

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
  readonly status: "eight-logical-textures-seven-unique-png-snapshots";
  readonly logicalTextureCount: 8;
  readonly uniquePngCount: 7;
  readonly entries: readonly ParticleTextureManifestEntry[];
  readonly productionBoundary: string;
}

export interface ParticlePreparedResourcePack {
  readonly profile: ParticlePortableProfile;
  readonly textures: ParticleTextureManifest;
  readonly pngBytes: ReadonlyMap<string, Uint8Array>;
}

export interface ParticleResourceProvider {
  read(logicalAssetId: string): Promise<ParticleOperationResult<Uint8Array>>;
}

export interface ParticleDecodedResourceMetadata {
  readonly width: number;
  readonly height: number;
}

export interface ParticleResourcePreflightAdapter {
  sha256(bytes: Uint8Array): Promise<ParticleOperationResult<string>>;
  inspectPng(bytes: Uint8Array): Promise<ParticleOperationResult<ParticleDecodedResourceMetadata>>;
}

export type ParticleCommand =
  | {
      readonly kind: "play-root";
      readonly ownerKey: string;
      readonly root: ParticleRootId;
      readonly restartIfActive: true;
    }
  | {
      readonly kind: "stop-clear-deactivate-root";
      readonly ownerKey: string;
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

export interface ParticleFloat32Color {
  readonly redBits: string;
  readonly greenBits: string;
  readonly blueBits: string;
  readonly alphaBits: string;
}

export interface ParticleRenderSample {
  readonly particleId: string;
  readonly ownerKey: string;
  readonly root: ParticleRootId;
  readonly systemId: string;
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
  readonly renderMode: 0 | 1;
  readonly renderAlignment: 0 | 2;
  readonly material: string | null;
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
  readonly root: ParticleRootId;
  readonly restartCount: number;
}

export interface ParticleBackendFault {
  readonly code: "particle-backend-fault";
  readonly capability: string;
  readonly boundary: string;
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
  readonly frames: readonly ParticleFrameSnapshot[];
  readonly fault: ParticleBackendFault | null;
}

export interface SimulatorParticleBackend {
  readonly id: string;
  prepare(
    sessionId: string,
    provider: ParticleResourceProvider,
    preflight: ParticleResourcePreflightAdapter,
  ): Promise<ParticleOperationResult<void>>;
  preflightFrame(request: ParticleFrameRequest): ParticleOperationResult<ParticleFrameBatch>;
  commitFrame(batch: ParticleFrameBatch): ParticleOperationResult<void>;
  discardFrame(batch: ParticleFrameBatch): ParticleOperationResult<void>;
  recordTerminalFault(capability: string, boundary: string): ParticleOperationResult<never>;
  snapshot(): ParticleBackendSnapshot;
  dispose(): ParticleOperationResult<void>;
}
