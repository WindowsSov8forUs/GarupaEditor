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

export interface GameClearRuntimeProfile {
  readonly schemaVersion: 2;
  readonly durationSeconds: number;
  readonly exitAfterFinishedSeconds: number;
  readonly clearStatusMapping: Readonly<Record<"1" | "2" | "3", string>>;
  readonly assets: readonly { readonly logical_key: string; readonly file: string; readonly width: number; readonly height: number }[];
  readonly base: { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile };
  readonly fullCombo: GameClearAdditionalBranch;
  readonly allPerfect: GameClearAdditionalBranch;
}

export type GameClearAdditionalState = "text-in" | "text-out" | "text-out-terminal";
export interface GameClearAdditionalAnimationSample {
  readonly state: GameClearAdditionalState;
  readonly clipName: string;
  readonly phaseSeconds: number;
  readonly channels: readonly string[];
  readonly values: readonly number[];
}

export function parseCurrentGameClearProfile(value: unknown): GameClearRuntimeProfile | null {
  if (!record(value) || value.schemaVersion !== 2 || value.durationSeconds !== 3.233 ||
      value.exitAfterFinishedSeconds !== 0.015 || !Array.isArray(value.assets) || value.assets.length !== 34 ||
      !validAdditionalBranch(value.fullCombo, "FullCombo_text_in", 104, "FullCombo_text_out", 32, 25) ||
      !validAdditionalBranch(value.allPerfect, "AllPerfect_text_in", 129, "AllPerfect_text_out", 44, 36) ||
      !validBranch(value.base, "MusicGameClear", 44, 43, 3)) return null;
  const keys = new Set<string>();
  for (const asset of value.assets) {
    if (!record(asset) || typeof asset.logical_key !== "string" || keys.has(asset.logical_key) ||
        typeof asset.file !== "string" || !positiveInt(asset.width) || !positiveInt(asset.height)) return null;
    keys.add(asset.logical_key);
  }
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
  return deepFreeze(value as unknown as GameClearRuntimeProfile);
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

export function buildGameClearParticleProfile(
  profile: GameClearRuntimeProfile,
  clearStatus: 1 | 2 | 3,
): ParticlePortableProfile {
  const root: ParticleRootId = clearStatus === 1
    ? "game-clear:base"
    : clearStatus === 2 ? "game-clear:full-combo" : "game-clear:all-perfect";
  const objects = clearStatus === 1
    ? profile.base.graph.objects
    : [...profile.base.graph.objects, ...(clearStatus === 2 ? profile.fullCombo.graph.objects : profile.allPerfect.graph.objects)];
  const byPath = new Map(objects.map((object) => [object.path, object]));
  const additionalObjects = clearStatus === 2 ? profile.fullCombo.graph.objects : profile.allPerfect.graph.objects;
  const additionalClip = clearStatus === 2 ? profile.fullCombo.clip : profile.allPerfect.clip;
  const particleOverrides = new Map([
    ...particleChannelOverrides(profile.base.graph.objects, profile.base.clip, 0),
    ...(clearStatus === 1 ? [] : particleChannelOverrides(additionalObjects, additionalClip, 0)),
  ]);
  const systems: ParticleSystemDefinition[] = [];
  const profiles: Record<string, ParticleProfileDefinition> = {};
  const moduleProfiles: Record<string, Record<string, unknown>> = {};
  const rendererProfiles: Record<string, ParticleRendererProfile> = {};
  const textureNames = new Set<string>();
  for (const object of objects) {
    const particle = object.components.find((component) => component.class === "ParticleSystem")?.serializedTree;
    const rendererComponent = object.components.find((component) => component.class === "ParticleSystemRenderer");
    const renderer = rendererComponent?.serializedTree;
    const texture = rendererComponent?.asset ?? null;
    if (particle === undefined || renderer === undefined) continue;
    const profileId = `game-clear-profile:${object.path}`;
    const rendererId = `game-clear-renderer:${object.path}`;
    const modules: Record<string, string> = {};
    for (const moduleName of [
      "InitialModule", "EmissionModule", "ShapeModule", "ColorModule", "SizeModule",
      "RotationModule", "RotationBySpeedModule", "ClampVelocityModule", "UVModule",
    ] as const) {
      const module = particle[moduleName];
      if (!record(module) || module.enabled !== true) continue;
      const id = `${profileId}:${moduleName}`;
      const override = particleOverrides.get(object.path);
      (moduleProfiles[moduleName] ??= {})[id] = moduleName === "InitialModule" && override?.startRotation !== undefined
        ? initialModuleWithStartRotation(module, override.startRotation)
        : module;
      modules[moduleName] = id;
    }
    profiles[profileId] = Object.freeze({
      system: Object.freeze({
        lengthInSec: numberValue(particle.lengthInSec),
        simulationSpeed: 1 as const,
        stopAction: 0 as const,
        cullingMode: numberValue(particle.cullingMode) as 0 | 1 | 3,
        ringBufferMode: 0 as const,
        ringBufferLoopRange: particle.ringBufferLoopRange as ParticleProfileDefinition["system"]["ringBufferLoopRange"],
        emitterVelocityMode: 0 as const,
        looping: particleOverrides.get(object.path)?.looping ?? particle.looping === true,
        prewarm: particle.prewarm === true,
        playOnAwake: false as const,
        useUnscaledTime: false as const,
        autoRandomSeed: true as const,
        startDelay: particle.startDelay as ParticleProfileDefinition["system"]["startDelay"],
        moveWithTransform: 0 as const,
        moveWithCustomTransform: null,
        scalingMode: 1 as const,
        randomSeed: 0 as const,
      }),
      modules: Object.freeze(modules) as ParticleProfileDefinition["modules"],
      renderer: rendererId,
    });
    rendererProfiles[rendererId] = Object.freeze({
      m_Enabled: renderer.m_Enabled === true,
      m_Materials: Object.freeze(texture === null ? [] : [{ type: "Material" as const, name: texture }]),
      m_SortingOrder: numberValue(renderer.m_SortingOrder),
      m_RenderMode: numberValue(renderer.m_RenderMode) as 0 | 1,
      m_RenderAlignment: numberValue(renderer.m_RenderAlignment) as 0 | 2,
      m_MinParticleSize: 0 as const,
      m_MaxParticleSize: numberValue(renderer.m_MaxParticleSize),
      m_VelocityScale: numberValue(renderer.m_VelocityScale),
      m_LengthScale: numberValue(renderer.m_LengthScale),
      m_NormalDirection: numberValue(renderer.m_NormalDirection),
      m_SortMode: 0 as const,
      m_ApplyActiveColorSpace: renderer.m_ApplyActiveColorSpace === true,
      m_RotateWithStretchDirection: true as const,
      m_Pivot: renderer.m_Pivot as ParticleRendererProfile["m_Pivot"],
    });
    if (texture !== null) textureNames.add(texture);
    systems.push(Object.freeze({
      identity: `game-clear:${object.path}`,
      root,
      path: object.path,
      transform: transform(object, particleOverrides.get(object.path)),
      parentTransforms: Object.freeze(parentTransforms(object.path, byPath, particleOverrides)),
      profile: profileId,
      randomStateU32: randomWords(object.path),
    }));
  }
  const textures = profile.assets.filter((asset) => textureNames.has(asset.logical_key)).map((asset) => Object.freeze({
    name: asset.logical_key,
    width: asset.width,
    height: asset.height,
    rgbaBytes: asset.width * asset.height * 4,
    rgbaSha256: "0".repeat(64),
    filterMode: 1 as const,
    wrapU: 1 as const,
    wrapV: 1 as const,
  }));
  const bundle: ParticleBundleProfile = Object.freeze({
    key: "game-clear" as const,
    systems: Object.freeze(systems),
    profiles: Object.freeze(profiles),
    moduleProfiles: Object.freeze(moduleProfiles) as unknown as ParticleModuleProfileMap,
    rendererProfiles: Object.freeze(rendererProfiles),
    materials: Object.freeze([...textureNames].map((name) => Object.freeze({
      name, shader: "Mobile/Particles/Additive" as const, texture: name, blend: "add" as const,
    }))),
    textures: Object.freeze(textures),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    sample: Object.freeze({ package: "jp.co.craftegg.band" as const, versionName: "10.1.4" as const, versionCode: 230 as const, abi: "arm64-v8a" as const, unityVersion: "2022.3.62f1" as const }),
    packIdentity: `game-clear-${clearStatus}-current-portable-v1`,
    fidelity: "current-static-portable" as const,
    networkAllowed: false as const,
    automaticFallbackAllowed: false as const,
    systemCount: systems.length,
    profileCount: systems.length,
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
      systemId: `game-clear:${object.path}`,
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
        active.add(`game-clear:${object.path}`);
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
  return output;
}
function randomWords(value: string): readonly [number, number, number, number] {
  const result: number[] = [];
  for (let lane = 0; lane < 4; lane += 1) {
    let hash = (2166136261 ^ lane) >>> 0;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    result.push(hash || ((0x9E3779B9 ^ lane) >>> 0));
  }
  return Object.freeze(result) as unknown as readonly [number, number, number, number];
}
function numberValue(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("invalid game-clear particle number"); return Math.fround(value); }

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
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
