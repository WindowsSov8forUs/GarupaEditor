export interface GameClearClipBinding {
  readonly channels: readonly string[];
}
export interface GameClearClipKey { readonly index: number; readonly coefficients: readonly [number, number, number, number]; }
export interface GameClearClipFrame { readonly time: number; readonly keys: readonly GameClearClipKey[]; }
export interface GameClearClipProfile {
  readonly name: string;
  readonly sample_rate: number;
  readonly stop_time: number;
  readonly curve_count: number;
  readonly bindings: readonly GameClearClipBinding[];
  readonly streamed_curve_count: number;
  readonly streamed_frames: readonly GameClearClipFrame[];
  /** Includes the serialized stop-time keyframe when the clip owns one. */
  readonly streamed_frames_inclusive?: readonly GameClearClipFrame[];
  readonly constants: readonly number[];
}
export interface GameClearWidgetProfile {
  readonly path: string;
  readonly color_f32_bits: readonly [string, string, string, string];
  readonly pivot: string;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly asset: string;
}
import type {
  ParticleBundleProfile,
  ParticleModuleProfileMap,
  ParticlePortableProfile,
  ParticleProfileDefinition,
  ParticleRendererProfile,
  ParticleRootId,
  ParticleSystemDefinition,
  ParticleTransformProfile,
} from "../particleContracts";

export interface GameClearGraphObject {
  readonly path: string;
  readonly active: boolean;
  readonly local_position: readonly [number, number, number];
  readonly local_rotation: readonly [number, number, number, number];
  readonly local_scale: readonly [number, number, number];
  readonly components: readonly {
    readonly class: string;
    readonly widget?: GameClearWidgetProfile;
    readonly serializedTree?: Readonly<Record<string, unknown>>;
    readonly asset?: string;
  }[];
}
export interface GameClearAdditionalBranch {
  readonly graph: { readonly objects: readonly GameClearGraphObject[] };
  /** Animator state 1: *_text_in. */
  readonly clip: GameClearClipProfile;
  /** Animator state 2: *_text_out; this terminal state has no outgoing transition. */
  readonly textOutClip: GameClearClipProfile;
}

import {
  isParsedGameClearNativeSemanticProfile,
  parseGameClearNativeSemanticProfile,
  type GameClearNativeBranch,
  type GameClearNativeSemanticProfile,
  type GameClearNativeSystemIdentity,
} from "./currentGameClearNativeSemanticProfile";

export interface GameClearRuntimeProfile {
  readonly schemaVersion: 2;
  readonly durationSeconds: number;
  readonly exitAfterFinishedSeconds: number;
  readonly clearStatusMapping: Readonly<Record<"1" | "2" | "3", string>>;
  readonly assets: readonly { readonly logical_key: string; readonly file: string; readonly width: number; readonly height: number }[];
  readonly base: { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile };
  readonly fullCombo: GameClearAdditionalBranch;
  readonly allPerfect: GameClearAdditionalBranch;
  /** Required by production; optional only for legacy source compilation. */
  readonly nativeSemantic?: GameClearNativeSemanticProfile;
}

export type GameClearAdditionalState = "text-in" | "text-out" | "text-out-terminal";
export interface GameClearAdditionalAnimationSample {
  readonly state: GameClearAdditionalState;
  readonly clipName: string;
  readonly phaseSeconds: number;
  readonly channels: readonly string[];
  readonly values: readonly number[];
}

export function parseCurrentGameClearProfile(
  value: unknown,
  nativeSemantic?: GameClearNativeSemanticProfile,
): GameClearRuntimeProfile | null {
  if (!record(value)) return null;
  const embeddedNative = nativeSemantic ?? (
    value.nativeSemantic === undefined
      ? undefined
      : isParsedGameClearNativeSemanticProfile(value.nativeSemantic)
      ? value.nativeSemantic
      : parseGameClearNativeSemanticProfile(value.nativeSemantic) ?? undefined
  );
  if (value.nativeSemantic !== undefined && embeddedNative === undefined) return null;
  const clearStatusMapping = asRecord(value.clearStatusMapping);
  if (value.schemaVersion !== 2 || value.durationSeconds !== 3.233 ||
      value.exitAfterFinishedSeconds !== 0.015 || clearStatusMapping?.["1"] !== "base clear only" ||
      clearStatusMapping?.["2"] !== "base + FullCombo_text_in" ||
      clearStatusMapping?.["3"] !== "base + AllPerfect_text_in" ||
      !Array.isArray(value.assets) || value.assets.length === 0 ||
      !validAdditionalBranch(value.fullCombo, "FullCombo_text_in", 104, "FullCombo_text_out", 32, 25) ||
      !validAdditionalBranch(value.allPerfect, "AllPerfect_text_in", 129, "AllPerfect_text_out", 44, 36) ||
      !validBranch(value.base, "MusicGameClear", 44, 43, 3)) return null;
  const keys = new Set<string>();
  for (const asset of value.assets) {
    if (!record(asset) || typeof asset.logical_key !== "string" || keys.has(asset.logical_key) ||
        typeof asset.file !== "string" || !positiveInt(asset.width) || !positiveInt(asset.height)) return null;
    keys.add(asset.logical_key);
  }
  if (embeddedNative !== undefined && (
    value.assets.length !== embeddedNative.assets.length ||
    value.assets.some((asset: any) => {
      const expected = embeddedNative.assets.find((candidate) => candidate.logical_key === asset.logical_key);
      return expected === undefined || expected.file !== asset.file ||
        expected.width !== asset.width || expected.height !== asset.height;
    }) ||
    !validNativeParticleGraph(value, embeddedNative)
  )) return null;
  for (const rawBranch of [value.fullCombo, value.allPerfect]) {
    if (!record(rawBranch) || !record(rawBranch.graph) || !Array.isArray(rawBranch.graph.objects)) return null;
    for (const objectValue of rawBranch.graph.objects) {
      if (!record(objectValue) || !validObject(objectValue)) return null;
      const components = objectValue.components;
      if (!Array.isArray(components)) return null;
      for (const componentValue of components) {
        if (!record(componentValue)) return null;
        if (componentValue.class === "UITexture") {
          if (!record(componentValue.widget) || typeof componentValue.widget.asset !== "string" ||
              !keys.has(componentValue.widget.asset)) return null;
        }
      }
    }
  }
  return deepFreeze({
    ...value,
    ...(embeddedNative === undefined ? {} : { nativeSemantic: embeddedNative }),
  } as unknown as GameClearRuntimeProfile);
}

/**
 * Samples the serialized additional AnimatorController sequence. State 1 exits
 * unconditionally at normalized time 1 into state 2; state 2 holds its exact
 * alpha-zero stop-time pose and never returns to default.
 */
export function sampleGameClearAdditionalAnimation(
  profile: GameClearRuntimeProfile,
  clearStatus: 2 | 3,
  elapsedSeconds: number,
): GameClearAdditionalAnimationSample {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("Game-clear additional animation requires one finite non-negative scene phase");
  }
  const branch = clearStatus === 2 ? profile.fullCombo : profile.allPerfect;
  const elapsed = Math.fround(elapsedSeconds);
  if (elapsed < branch.clip.stop_time) {
    return sampleGameClearClip(branch.clip, elapsed, "text-in");
  }
  const terminalAt = Math.fround(branch.clip.stop_time + branch.textOutClip.stop_time);
  if (elapsed >= terminalAt) {
    return sampleGameClearClip(branch.textOutClip, branch.textOutClip.stop_time, "text-out-terminal");
  }
  return sampleGameClearClip(
    branch.textOutClip,
    canonicalClipPhase(
      Math.fround(elapsed - branch.clip.stop_time),
      branch.textOutClip.sample_rate,
    ),
    "text-out",
  );
}

/** Builds the one source-bound Game-clear bundle shared by simulation and Pixi primitive execution. */
export function buildGameClearParticleBundle(
  profile: GameClearRuntimeProfile,
): ParticleBundleProfile {
  const native = profile.nativeSemantic;
  if (native === undefined) {
    throw new Error("Game-clear native semantic authority is required before particle preparation");
  }
  const systems: ParticleSystemDefinition[] = [];
  const profiles: Record<string, ParticleProfileDefinition> = {};
  const moduleProfiles: Record<string, Record<string, unknown>> = {};
  const rendererProfiles: Record<string, ParticleRendererProfile> = {};
  let globalOrdinal = 0;
  for (const branch of ["base", "fullCombo", "allPerfect"] as const) {
    const source = gameClearBranch(profile, branch);
    const objects = source.graph.objects;
    const byPath = new Map(objects.map((object) => [object.path, object]));
    const overrides = particleChannelOverrides(objects, source.clip, 0);
    const branchSystems = native.systems
      .filter((system) => system.branch === branch)
      .sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
    for (const semantic of branchSystems) {
      const object = byPath.get(semantic.path);
      const particle = object?.components.find((component) => component.class === "ParticleSystem")?.serializedTree;
      const rendererComponent = object?.components.find((component) => component.class === "ParticleSystemRenderer");
      const renderer = rendererComponent?.serializedTree;
      if (object === undefined || particle === undefined || renderer === undefined ||
        !sameVector(object.local_position, semantic.localPosition) ||
        !sameVector(object.local_rotation, semantic.localRotation) ||
        !sameVector(object.local_scale, semantic.localScale) ||
        (rendererComponent?.asset ?? null) !== semantic.materialAsset) {
        throw new Error(`Game-clear serialized/native system relation diverged: ${semantic.path}`);
      }
      const profileId = `game-clear-profile:${branch}:${semantic.sourceOrdinal}`;
      const rendererId = `game-clear-renderer:${branch}:${semantic.sourceOrdinal}`;
      const modules: Record<string, string> = {};
      for (const moduleName of semantic.enabledModules) {
        const module = asRecord(particle[moduleName]);
        if (module === null || module.enabled !== true) {
          throw new Error(`Game-clear enabled module relation diverged: ${semantic.path}:${moduleName}`);
        }
        const moduleId = `${profileId}:${moduleName}`;
        const overridden = moduleName === "InitialModule" && overrides.get(object.path)?.startRotation !== undefined
          ? initialModuleWithStartRotation(module, overrides.get(object.path)!.startRotation!)
          : module;
        (moduleProfiles[moduleName] ??= {})[moduleId] = normalizeGameClearModule(moduleName, overridden);
        modules[moduleName] = moduleId;
      }
      const system = Object.freeze({
        lengthInSec: numberValue(particle.lengthInSec),
        simulationSpeed: numberValue(particle.simulationSpeed),
        stopAction: numberValue(particle.stopAction),
        cullingMode: numberValue(particle.cullingMode) as 0 | 1 | 3,
        ringBufferMode: numberValue(particle.ringBufferMode),
        ringBufferLoopRange: freezeVector2(particle.ringBufferLoopRange),
        emitterVelocityMode: numberValue(particle.emitterVelocityMode),
        looping: overrides.get(object.path)?.looping ?? particle.looping === true,
        prewarm: particle.prewarm === true,
        playOnAwake: particle.playOnAwake === true,
        useUnscaledTime: particle.useUnscaledTime === true,
        autoRandomSeed: particle.autoRandomSeed === true,
        startDelay: particle.startDelay,
        moveWithTransform: numberValue(particle.moveWithTransform),
        moveWithCustomTransform: null,
        scalingMode: numberValue(particle.scalingMode) as 0 | 1,
        randomSeed: numberValue(particle.randomSeed),
      }) as ParticleProfileDefinition["system"];
      profiles[profileId] = Object.freeze({
        system,
        modules: Object.freeze(modules) as ParticleProfileDefinition["modules"],
        renderer: rendererId,
      });
      rendererProfiles[rendererId] = normalizeGameClearRenderer(renderer, semantic);
      systems.push(Object.freeze({
        identity: `game-clear:${branch}:${semantic.particleSystemPathId}`,
        sourceOrdinal: globalOrdinal,
        root: gameClearRoot(branch),
        path: semantic.path,
        transform: transform(object, overrides.get(object.path)),
        parentTransforms: Object.freeze(parentTransforms(object.path, byPath, overrides)),
        parentParticleSystemFlags: semantic.parentParticleSystemFlagsRootToImmediate,
        profile: profileId,
        meshProfile: null,
        particleSourcePathId: semantic.particleSystemPathId,
        particleSerializedBytes: semantic.particleSystemSerializedBytes,
        particleSerializedSha256: semantic.particleSystemSerializedSha256,
        rendererSourcePathId: semantic.rendererPathId,
        rendererSerializedBytes: semantic.rendererSerializedBytes,
        rendererSerializedSha256: semantic.rendererSerializedSha256,
        gameObjectSourcePathId: semantic.gameObjectPathId,
        transformSourcePathId: semantic.transformPathId,
        sourceBranch: branch,
        sourceBranchOrdinal: semantic.sourceOrdinal,
        activeSerialized: semantic.activeSerialized,
      } as ParticleSystemDefinition));
      globalOrdinal += 1;
    }
  }
  const textureNames = new Set(native.systems.flatMap((system) =>
    system.materialAsset === null ? [] : [system.materialAsset]));
  const textures = native.assets
    .filter((asset) => textureNames.has(asset.logical_key))
    .map((asset) => Object.freeze({
      name: asset.logical_key,
      width: asset.width,
      height: asset.height,
      rgbaBytes: asset.width * asset.height * 4,
      rgbaSha256: asset.rgba_sha256,
      filterMode: 1 as const,
      wrapU: asset.texture_settings.wrap_u,
      wrapV: asset.texture_settings.wrap_v,
    }));
  const materialPathIds = new Map(native.systems.flatMap((system) =>
    system.materialAsset === null || system.materialPathId === null
      ? []
      : [[system.materialAsset, system.materialPathId] as const]));
  const materials = [...textureNames].sort().map((name) => Object.freeze({
    name,
    shader: "Mobile/Particles/Additive",
    texture: name,
    blend: "add" as const,
    sourcePathId: materialPathIds.get(name),
    renderQueue: 3000 as const,
    sourceBlendFactor: 5 as const,
    destinationBlendFactor: 1 as const,
    zWrite: false as const,
    cull: "off" as const,
    fragment: "straight-rgba-modulate" as const,
    mainTextureScale: Object.freeze({ x: 1, y: 1 }),
    mainTextureOffset: Object.freeze({ x: 0, y: 0 }),
  }));
  if (systems.length !== native.systems.length || textures.length !== textureNames.size) {
    throw new Error("Game-clear native particle inventory is incomplete");
  }
  return Object.freeze({
    key: "game-clear",
    systems: Object.freeze(systems),
    profiles: Object.freeze(profiles),
    moduleProfiles: deepFreeze(moduleProfiles) as ParticleModuleProfileMap,
    rendererProfiles: Object.freeze(rendererProfiles),
    meshProfiles: Object.freeze({}),
    materials: Object.freeze(materials),
    textures: Object.freeze(textures),
  });
}

/** Legacy call shape retained for source compatibility; production merges this bundle at launch. */
export function buildGameClearParticleProfile(
  profile: GameClearRuntimeProfile,
  clearStatus: 1 | 2 | 3,
): ParticlePortableProfile {
  const bundle = buildGameClearParticleBundle(profile);
  return Object.freeze({
    schemaVersion: 2,
    sample: Object.freeze({
      package: "jp.co.craftegg.band", versionName: "10.1.4", versionCode: 230,
      abi: "arm64-v8a", unityVersion: "2022.3.62f1",
    }),
    packIdentity: `particle-game-clear-source-bound-v2-${clearStatus}`,
    fidelity: "current-native-semantic-v2",
    networkAllowed: false,
    automaticFallbackAllowed: false,
    systemCount: bundle.systems.length,
    profileCount: Object.keys(bundle.profiles).length,
    bundles: Object.freeze([bundle]),
  });
}

export interface GameClearParticleActivation {
  readonly systemId: string;
  readonly activateAtSeconds: number;
}

export interface GameClearParticleLifecycleMutation {
  readonly systemId: string;
  readonly atSeconds: number;
  readonly active: boolean;
}

export interface GameClearParticleTransformSample {
  readonly systemId: string;
  readonly transform: ParticleTransformProfile;
  readonly parentTransforms: readonly ParticleTransformProfile[];
}

/** Samples animated emitter/parent Transforms for the real ParticleSystem owners. */
export function sampleGameClearParticleTransforms(
  profile: GameClearRuntimeProfile,
  clearStatus: 1 | 2 | 3,
  elapsedSeconds: number,
): readonly GameClearParticleTransformSample[] {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("Game-clear particle Transform sampling requires one finite monotonic scene phase");
  }
  const additionalObjects = clearStatus === 2 ? profile.fullCombo.graph.objects : profile.allPerfect.graph.objects;
  const additionalClip = clearStatus === 2 ? profile.fullCombo.clip : profile.allPerfect.clip;
  const objects = clearStatus === 1
    ? profile.base.graph.objects
    : [...profile.base.graph.objects, ...additionalObjects];
  const overrides = new Map([
    ...particleChannelOverrides(profile.base.graph.objects, profile.base.clip, elapsedSeconds),
    ...(clearStatus === 1 ? [] : particleChannelOverrides(additionalObjects, additionalClip, elapsedSeconds)),
  ]);
  const byPath = new Map(objects.map((object) => [object.path, object]));
  return Object.freeze(objects
    .filter((object) => object.components.some((component) => component.class === "ParticleSystem"))
    .map((object) => Object.freeze({
      systemId: gameClearSystemId(profile, object.path),
      transform: transform(object, overrides.get(object.path)),
      parentTransforms: Object.freeze(parentTransforms(object.path, byPath, overrides)),
    }))
    .sort((left, right) => left.systemId.localeCompare(right.systemId)));
}

export function buildGameClearParticleLifecycleSchedule(
  profile: GameClearRuntimeProfile,
  clearStatus: 1 | 2 | 3,
): readonly GameClearParticleLifecycleMutation[] {
  const additional = clearStatus === 2 ? profile.fullCombo : profile.allPerfect;
  const phaseSet = new Set<number>([
    0,
    ...profile.base.clip.streamed_frames.map((frame) => frame.time),
    ...(clearStatus === 1 ? [] : additional.clip.streamed_frames.map((frame) => frame.time)),
  ]);
  const phases = [...phaseSet].sort((left, right) => left - right);
  let before = new Set<string>();
  const mutations: GameClearParticleLifecycleMutation[] = [];
  for (const phase of phases) {
    const active = activeGameClearParticleSystems(profile, clearStatus, phase);
    for (const systemId of [...before].filter((identity) => !active.has(identity)).sort()) {
      mutations.push(Object.freeze({ systemId, atSeconds: Math.fround(phase), active: false }));
    }
    for (const systemId of [...active].filter((identity) => !before.has(identity)).sort()) {
      mutations.push(Object.freeze({ systemId, atSeconds: Math.fround(phase), active: true }));
    }
    before = active;
  }
  return Object.freeze(mutations.sort((left, right) => left.atSeconds - right.atSeconds ||
    Number(left.active) - Number(right.active) || left.systemId.localeCompare(right.systemId)));
}

export function buildGameClearParticleActivationSchedule(
  profile: GameClearRuntimeProfile,
  clearStatus: 1 | 2 | 3,
): readonly GameClearParticleActivation[] {
  const first = new Map<string, number>();
  for (const mutation of buildGameClearParticleLifecycleSchedule(profile, clearStatus)) {
    if (mutation.active && !first.has(mutation.systemId)) first.set(mutation.systemId, mutation.atSeconds);
  }
  return Object.freeze([...first].map(([systemId, activateAtSeconds]) => Object.freeze({ systemId, activateAtSeconds }))
    .sort((left, right) => left.activateAtSeconds - right.activateAtSeconds || left.systemId.localeCompare(right.systemId)));
}

function activeGameClearParticleSystems(
  profile: GameClearRuntimeProfile,
  clearStatus: 1 | 2 | 3,
  phase: number,
): Set<string> {
  const branches = [profile.base, ...(clearStatus === 1 ? [] : [clearStatus === 2 ? profile.fullCombo : profile.allPerfect])];
  const active = new Set<string>();
  for (const branch of branches) {
    const objects = branch.graph.objects;
    const root = [...objects].sort((left, right) => left.path.split("/").length - right.path.split("/").length)[0]!.path;
    const own = new Map(objects.map((object) => [object.path, object.active]));
    const channels = branch.clip.bindings.flatMap((binding) => binding.channels);
    for (let index = 0; index < channels.length; index += 1) {
      const channel = channels[index]!;
      if (!channel.endsWith(".m_IsActive.value")) continue;
      const relative = channel.slice(0, -".m_IsActive.value".length);
      const path = relative.length === 0 ? root : `${root}/${relative}`;
      own.set(path, clipValue(branch.clip, index, Math.min(phase, branch.clip.stop_time - 1 / 6000)) >= 0.5);
    }
    const effective = new Map<string, boolean>();
    const resolve = (path: string): boolean => {
      const cached = effective.get(path); if (cached !== undefined) return cached;
      const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
      const value = (own.get(path) ?? true) && (parentPath === null || !own.has(parentPath) || resolve(parentPath));
      effective.set(path, value); return value;
    };
    for (const object of objects) {
      if (object.components.some((component) => component.class === "ParticleSystem") && resolve(object.path)) {
        active.add(gameClearSystemId(profile, object.path));
      }
    }
  }
  return active;
}

function canonicalClipPhase(phase: number, sampleRate: number): number {
  // The outer owner publishes Float32 total elapsed time, while Animator state
  // 2 owns a fresh local clock. Recover exact authored frame boundaries after
  // the Float32 subtraction (for example 5/60 must not become 0.0833332538).
  const authoredFrame = Math.fround(Math.round(phase * sampleRate) / sampleRate);
  return Math.abs(phase - authoredFrame) <= 1e-6 ? authoredFrame : phase;
}

function sampleGameClearClip(
  clip: GameClearClipProfile,
  requestedPhase: number,
  state: GameClearAdditionalState,
): GameClearAdditionalAnimationSample {
  const phase = Math.min(Math.fround(requestedPhase), Math.fround(clip.stop_time));
  const frames = clip.streamed_frames_inclusive ?? clip.streamed_frames;
  const values: number[] = [];
  for (let index = 0; index < clip.streamed_curve_count; index += 1) {
    values.push(clipValue(clip, index, phase, frames));
  }
  values.push(...clip.constants.map(Math.fround));
  const channels = clip.bindings.flatMap((binding) => binding.channels);
  if (channels.length !== clip.curve_count || values.length !== clip.curve_count) {
    throw new Error(`Game-clear clip channel/value coverage mismatch: ${channels.length}/${values.length}/${clip.curve_count}`);
  }
  return Object.freeze({
    state,
    clipName: clip.name,
    phaseSeconds: phase,
    channels: Object.freeze(channels),
    values: Object.freeze(values),
  });
}

function clipValue(
  clip: GameClearClipProfile,
  index: number,
  phase: number,
  frames: readonly GameClearClipFrame[] = clip.streamed_frames,
): number {
  if (index >= clip.streamed_curve_count) return clip.constants[index - clip.streamed_curve_count] ?? 0;
  let latest: GameClearClipKey | null = null;
  let time = 0;
  for (const frame of frames) {
    if (frame.time > phase) break;
    const key = frame.keys.find((candidate) => candidate.index === index);
    if (key !== undefined) { latest = key; time = frame.time; }
  }
  if (latest === null) return 0;
  const delta = Math.fround(phase - time);
  let value = Math.fround(Math.fround(latest.coefficients[0] * delta) + latest.coefficients[1]);
  value = Math.fround(Math.fround(value * delta) + latest.coefficients[2]);
  return Math.fround(Math.fround(value * delta) + latest.coefficients[3]);
}
interface GameClearParticleChannelOverride {
  readonly position?: Readonly<{ readonly x?: number; readonly y?: number; readonly z?: number }>;
  readonly startRotation?: number;
  readonly looping?: boolean;
}

function particleChannelOverrides(
  objects: readonly GameClearGraphObject[],
  clip: GameClearClipProfile,
  elapsedSeconds: number,
): ReadonlyMap<string, GameClearParticleChannelOverride> {
  const root = [...objects].sort((left, right) => left.path.split("/").length - right.path.split("/").length)[0]!.path;
  const channels = clip.bindings.flatMap((binding) => binding.channels);
  const mutable = new Map<string, {
    position?: { x?: number; y?: number; z?: number };
    startRotation?: number;
    looping?: boolean;
  }>();
  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index]!;
    const marker = channel.includes(".m_LocalPosition.") ? ".m_LocalPosition."
      : channel.includes(".attribute_hash:") ? ".attribute_hash:"
      : null;
    if (marker === null || !(channel.includes("effect_par") || channel.startsWith("GameClearParticle"))) continue;
    const markerIndex = channel.indexOf(marker);
    const relative = channel.slice(0, markerIndex);
    const path = relative.length === 0 ? root : `${root}/${relative}`;
    const override = mutable.get(path) ?? {};
    const phase = Math.min(Math.fround(elapsedSeconds), Math.fround(clip.stop_time - 1 / 6000));
    const value = clipValue(clip, index, phase);
    if (marker === ".m_LocalPosition.") {
      const axis = channel.slice(markerIndex + marker.length);
      if (axis === "x" || axis === "y" || axis === "z") {
        (override.position ??= {})[axis] = value;
      }
    } else if (channel.includes("attribute_hash:1133446416")) {
      override.startRotation = value;
    } else if (channel.includes("attribute_hash:925582877")) {
      override.looping = value >= 0.5;
    }
    mutable.set(path, override);
  }
  return new Map([...mutable].map(([path, value]) => [path, Object.freeze({
    ...(value.position === undefined ? {} : { position: Object.freeze(value.position) }),
    ...(value.startRotation === undefined ? {} : { startRotation: Math.fround(value.startRotation) }),
    ...(value.looping === undefined ? {} : { looping: value.looping }),
  })]));
}

function initialModuleWithStartRotation(
  module: Readonly<Record<string, unknown>>,
  value: number,
): Readonly<Record<string, unknown>> {
  const startRotation = module.startRotation;
  if (!record(startRotation)) throw new Error("game-clear animated startRotation owner is missing");
  return Object.freeze({
    ...module,
    startRotation: Object.freeze({
      ...startRotation,
      scalar: Math.fround(value),
      minScalar: Math.fround(value),
    }),
  });
}

function transform(
  value: GameClearGraphObject,
  override?: GameClearParticleChannelOverride,
): ParticleSystemDefinition["transform"] {
  return Object.freeze({
    m_LocalPosition: Object.freeze({
      x: override?.position?.x ?? value.local_position[0],
      y: override?.position?.y ?? value.local_position[1],
      z: override?.position?.z ?? value.local_position[2],
    }),
    m_LocalRotation: Object.freeze({ x: value.local_rotation[0], y: value.local_rotation[1], z: value.local_rotation[2], w: value.local_rotation[3] }),
    m_LocalScale: Object.freeze({ x: value.local_scale[0], y: value.local_scale[1], z: value.local_scale[2] }),
  });
}
function parentTransforms(
  path: string,
  objects: ReadonlyMap<string, GameClearGraphObject>,
  overrides: ReadonlyMap<string, GameClearParticleChannelOverride>,
): ParticleSystemDefinition["parentTransforms"] {
  const output = [];
  let current = path;
  while (current.includes("/")) {
    current = current.slice(0, current.lastIndexOf("/"));
    const parent = objects.get(current);
    if (parent !== undefined) output.push(transform(parent, overrides.get(current)));
  }
  return output.reverse();
}

function gameClearBranch(
  profile: GameClearRuntimeProfile,
  branch: GameClearNativeBranch,
): { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile } {
  return branch === "base" ? profile.base : branch === "fullCombo" ? profile.fullCombo : profile.allPerfect;
}

export function gameClearRoot(branch: GameClearNativeBranch): ParticleRootId {
  return branch === "base"
    ? "game-clear:base"
    : branch === "fullCombo" ? "game-clear:full-combo" : "game-clear:all-perfect";
}

export function gameClearSystemId(profile: GameClearRuntimeProfile, path: string): string {
  const semantic = profile.nativeSemantic?.systems.find((system) => system.path === path);
  if (semantic === undefined) throw new Error(`Game-clear system has no native semantic identity: ${path}`);
  return `game-clear:${semantic.branch}:${semantic.particleSystemPathId}`;
}

function normalizeGameClearModule(
  moduleName: string,
  module: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (moduleName === "InitialModule") {
    return deepFreeze({ ...module, gravitySource: module.gravitySource ?? 0 });
  }
  if (moduleName === "ShapeModule") {
    return deepFreeze({
      ...module,
      m_Mesh: null,
      m_MeshRenderer: null,
      m_SkinnedMeshRenderer: null,
      m_Sprite: null,
      m_SpriteRenderer: null,
      m_Texture: null,
    });
  }
  return deepFreeze({ ...module });
}

function normalizeGameClearRenderer(
  renderer: Readonly<Record<string, unknown>>,
  semantic: GameClearNativeSystemIdentity,
): ParticleRendererProfile {
  const material = semantic.materialAsset === null || semantic.materialPathId === null
    ? null
    : Object.freeze({
        type: "Material" as const,
        name: semantic.materialAsset,
        fileId: rendererMaterialFileId(renderer),
        pathId: semantic.materialPathId,
      });
  return deepFreeze({
    m_Enabled: renderer.m_Enabled === true,
    m_Materials: Object.freeze([material]),
    m_CastShadows: numberValue(renderer.m_CastShadows),
    m_ReceiveShadows: numberValue(renderer.m_ReceiveShadows),
    m_DynamicOccludee: numberValue(renderer.m_DynamicOccludee),
    m_StaticShadowCaster: numberValue(renderer.m_StaticShadowCaster),
    m_MotionVectors: numberValue(renderer.m_MotionVectors),
    m_LightProbeUsage: numberValue(renderer.m_LightProbeUsage),
    m_ReflectionProbeUsage: numberValue(renderer.m_ReflectionProbeUsage),
    m_RayTracingMode: numberValue(renderer.m_RayTracingMode),
    m_RayTraceProcedural: numberValue(renderer.m_RayTraceProcedural),
    m_RenderingLayerMask: numberValue(renderer.m_RenderingLayerMask),
    m_RendererPriority: numberValue(renderer.m_RendererPriority),
    m_SortingLayerID: numberValue(renderer.m_SortingLayerID),
    m_SortingLayer: numberValue(renderer.m_SortingLayer),
    m_SortingOrder: numberValue(renderer.m_SortingOrder),
    m_SortingFudge: numberValue(renderer.m_SortingFudge),
    m_RenderMode: numberValue(renderer.m_RenderMode) as 0 | 1,
    m_RenderAlignment: numberValue(renderer.m_RenderAlignment) as 0,
    m_SortMode: numberValue(renderer.m_SortMode),
    m_MeshDistribution: numberValue(renderer.m_MeshDistribution),
    m_MinParticleSize: numberValue(renderer.m_MinParticleSize),
    m_MaxParticleSize: numberValue(renderer.m_MaxParticleSize),
    m_CameraVelocityScale: numberValue(renderer.m_CameraVelocityScale),
    m_VelocityScale: numberValue(renderer.m_VelocityScale),
    m_LengthScale: numberValue(renderer.m_LengthScale),
    m_NormalDirection: numberValue(renderer.m_NormalDirection),
    m_ShadowBias: numberValue(renderer.m_ShadowBias),
    m_ApplyActiveColorSpace: renderer.m_ApplyActiveColorSpace === true,
    m_AllowRoll: renderer.m_AllowRoll === true,
    m_FreeformStretching: renderer.m_FreeformStretching === true,
    m_RotateWithStretchDirection: renderer.m_RotateWithStretchDirection === true,
    m_EnableGPUInstancing: renderer.m_EnableGPUInstancing === true,
    m_UseCustomVertexStreams: renderer.m_UseCustomVertexStreams === true,
    m_VertexStreams: freezeNumberArray(renderer.m_VertexStreams),
    m_UseCustomTrailVertexStreams: renderer.m_UseCustomTrailVertexStreams === true,
    m_TrailVertexStreams: freezeNumberArray(renderer.m_TrailVertexStreams),
    m_Pivot: freezeVector3(renderer.m_Pivot),
    m_Flip: freezeVector3(renderer.m_Flip),
    m_Mesh: null,
    m_Mesh1: null,
    m_Mesh2: null,
    m_Mesh3: null,
    m_MeshWeighting: numberValue(renderer.m_MeshWeighting),
    m_MeshWeighting1: numberValue(renderer.m_MeshWeighting1),
    m_MeshWeighting2: numberValue(renderer.m_MeshWeighting2),
    m_MeshWeighting3: numberValue(renderer.m_MeshWeighting3),
    m_MaskInteraction: numberValue(renderer.m_MaskInteraction),
    m_StaticBatchRoot: null,
    m_ProbeAnchor: null,
    m_LightProbeVolumeOverride: null,
  } as ParticleRendererProfile);
}

function rendererMaterialFileId(renderer: Readonly<Record<string, unknown>>): number {
  const materials = renderer.m_Materials;
  const first = Array.isArray(materials) ? asRecord(materials[0]) : null;
  return first === null ? 0 : numberValue(first.m_FileID);
}

function freezeVector2(value: unknown): Readonly<{ readonly x: number; readonly y: number }> {
  const row = asRecord(value);
  if (row === null) throw new Error("Game-clear particle Vector2 is missing");
  return Object.freeze({ x: numberValue(row.x), y: numberValue(row.y) });
}
function freezeVector3(value: unknown): Readonly<{ readonly x: number; readonly y: number; readonly z: number }> {
  const row = asRecord(value);
  if (row === null) throw new Error("Game-clear particle Vector3 is missing");
  return Object.freeze({ x: numberValue(row.x), y: numberValue(row.y), z: numberValue(row.z) });
}
function freezeNumberArray(value: unknown): readonly number[] {
  if (!Array.isArray(value)) throw new Error("Game-clear renderer stream inventory is missing");
  return Object.freeze(value.map(numberValue));
}
function sameVector(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(Math.fround(value), Math.fround(right[index]!)));
}
function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("invalid game-clear particle number");
  return Math.fround(value);
}

function validNativeParticleGraph(
  value: Record<string, unknown>,
  native: GameClearNativeSemanticProfile,
): boolean {
  const seen = new Set<string>();
  for (const branch of ["base", "fullCombo", "allPerfect"] as const) {
    const source = asRecord(value[branch]);
    const graph = asRecord(source?.graph);
    if (graph === null || !Array.isArray(graph.objects)) return false;
    const objects = graph.objects.filter((entry): entry is GameClearGraphObject => validObject(entry));
    if (objects.length !== graph.objects.length) return false;
    const byPath = new Map(objects.map((object) => [object.path, object]));
    const expected = native.systems.filter((system) => system.branch === branch);
    const particleObjects = objects.filter((object) =>
      object.components.some((component) => component.class === "ParticleSystem"));
    if (particleObjects.length !== expected.length) return false;
    for (const semantic of expected) {
      const object = byPath.get(semantic.path);
      const particle = object?.components.find((component) => component.class === "ParticleSystem")?.serializedTree;
      const rendererComponent = object?.components.find((component) => component.class === "ParticleSystemRenderer");
      const renderer = rendererComponent?.serializedTree;
      if (object === undefined || particle === undefined || renderer === undefined || seen.has(semantic.path) ||
        !sameVector(object.local_position, semantic.localPosition) ||
        !sameVector(object.local_rotation, semantic.localRotation) ||
        !sameVector(object.local_scale, semantic.localScale) ||
        (rendererComponent?.asset ?? null) !== semantic.materialAsset ||
        renderer.m_Enabled !== semantic.rendererEnabled ||
        renderer.m_RenderMode !== semantic.renderMode ||
        renderer.m_RenderAlignment !== semantic.renderAlignment ||
        renderer.m_SortingOrder !== semantic.sortingOrder ||
        parentTransforms(semantic.path, byPath, new Map()).length !==
          semantic.parentParticleSystemFlagsRootToImmediate.length) return false;
      const enabled = Object.entries(particle)
        .filter(([name, module]) => name.endsWith("Module") && asRecord(module)?.enabled === true)
        .map(([name]) => name)
        .filter((name) => [
          "InitialModule", "EmissionModule", "ShapeModule", "ColorModule", "SizeModule",
          "RotationModule", "RotationBySpeedModule", "ClampVelocityModule", "UVModule",
        ].includes(name));
      if (enabled.length !== semantic.enabledModules.length ||
        semantic.enabledModules.some((name) => !enabled.includes(name))) return false;
      const shape = asRecord(particle.ShapeModule);
      const shapeType = shape?.enabled === true ? shape.type : null;
      if (shapeType !== semantic.shapeType) return false;
      seen.add(semantic.path);
    }
  }
  return seen.size === native.systems.length;
}

function validAdditionalBranch(
  value: unknown,
  textInName: string,
  textInCurves: number,
  textOutName: string,
  textOutCurves: number,
  objects: number,
): boolean {
  return validBranch(value, textInName, textInCurves, objects, 2.2833333015441895) &&
    record(value) && record(value.graph) && Array.isArray(value.graph.objects) &&
    validClip(value.textOutClip, textOutName, textOutCurves, 0.3333333432674408, value.graph.objects, true);
}

function validBranch(value: unknown, name: string, curves: number, objects: number, duration: number): boolean {
  if (!record(value) || !record(value.graph) || !Array.isArray(value.graph.objects) ||
      value.graph.objects.length !== objects) return false;
  return validClip(value.clip, name, curves, duration, value.graph.objects, false);
}

function validClip(
  value: unknown,
  name: string,
  curves: number,
  duration: number,
  graphObjects: readonly unknown[],
  requireInclusiveStopFrame: boolean,
): boolean {
  if (!record(value) || value.name !== name || value.sample_rate !== 60 || value.stop_time !== duration ||
      value.curve_count !== curves || !Array.isArray(value.bindings) ||
      !Array.isArray(value.streamed_frames) || !Array.isArray(value.constants) ||
      !value.bindings.every((binding: unknown) => record(binding) && Array.isArray(binding.channels)) ||
      requireInclusiveStopFrame && (!Array.isArray(value.streamed_frames_inclusive) ||
        !value.streamed_frames_inclusive.some((frame: unknown) => record(frame) && frame.time === duration))) return false;
  const channels = value.bindings.flatMap((binding) => (binding as { readonly channels: readonly unknown[] }).channels);
  return channels.length === curves && channels.every((channel) =>
    typeof channel === "string" && validGameClearChannelOwner(channel, graphObjects));
}

function validGameClearChannelOwner(channel: string, objects: readonly unknown[]): boolean {
  const rows = objects.filter((value): value is GameClearGraphObject => record(value) && validObject(value));
  if (rows.length !== objects.length) return false;
  const root = [...rows].sort((left, right) => left.path.split("/").length - right.path.split("/").length)[0]?.path;
  if (root === undefined) return false;
  const markers = [
    [".m_IsActive.", new Set(["value"])],
    [".mColor.a.", new Set(["value"])],
    [".m_LocalPosition.", new Set(["x", "y", "z"])],
    [".m_LocalScale.", new Set(["x", "y", "z"])],
    [".localEulerAnglesRaw.", new Set(["x", "y", "z"])],
    [".attribute_hash:", new Set(["1133446416.value", "925582877.value"])],
  ] as const;
  for (const [marker, suffixes] of markers) {
    const markerIndex = channel.indexOf(marker);
    if (markerIndex < 0) continue;
    const relative = channel.slice(0, markerIndex);
    const suffix = channel.slice(markerIndex + marker.length);
    const path = relative.length === 0 ? root : `${root}/${relative}`;
    return suffixes.has(suffix as never) && rows.some((row) => row.path === path);
  }
  return false;
}
function validObject(value: unknown): boolean {
  return record(value) && typeof value.path === "string" && typeof value.active === "boolean" &&
    vector(value.local_position, 3) && vector(value.local_rotation, 4) && vector(value.local_scale, 3) && Array.isArray(value.components);
}
function vector(value: unknown, size: number): boolean { return Array.isArray(value) && value.length === size && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)); }
function positiveInt(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function asRecord(value: unknown): Record<string, any> | null { return record(value) ? value : null; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
