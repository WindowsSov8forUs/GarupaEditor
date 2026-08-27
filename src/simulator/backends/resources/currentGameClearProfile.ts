export interface GameClearClipBinding {
  readonly channels: readonly string[];
}
export interface GameClearClipKey { readonly index: number; readonly coefficients: readonly [number, number, number, number]; }
export interface GameClearClipFrame { readonly time: number; readonly keys: readonly GameClearClipKey[]; }
export interface GameClearClipProfile {
  readonly stop_time: number;
  readonly curve_count: number;
  readonly bindings: readonly GameClearClipBinding[];
  readonly streamed_curve_count: number;
  readonly streamed_frames: readonly GameClearClipFrame[];
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
export interface GameClearRuntimeProfile {
  readonly schemaVersion: 1;
  readonly durationSeconds: number;
  readonly exitAfterFinishedSeconds: number;
  readonly clearStatusMapping: Readonly<Record<"1" | "2" | "3", string>>;
  readonly assets: readonly { readonly logical_key: string; readonly file: string; readonly width: number; readonly height: number }[];
  readonly base: { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile };
  readonly fullCombo: { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile };
  readonly allPerfect: { readonly graph: { readonly objects: readonly GameClearGraphObject[] }; readonly clip: GameClearClipProfile };
}

export function parseCurrentGameClearProfile(value: unknown): GameClearRuntimeProfile | null {
  if (!record(value) || value.schemaVersion !== 1 || value.durationSeconds !== 3.233 ||
      value.exitAfterFinishedSeconds !== 0.015 || !Array.isArray(value.assets) || value.assets.length !== 34 ||
      !validBranch(value.fullCombo, 104, 25, 2.2833333015441895) ||
      !validBranch(value.allPerfect, 129, 36, 2.2833333015441895) ||
      !validBranch(value.base, 44, 43, 3)) return null;
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
  const offsets = new Map([
    ...activationOffsets(profile.base.graph.objects, profile.base.clip),
    ...(clearStatus === 1 ? [] : activationOffsets(
      clearStatus === 2 ? profile.fullCombo.graph.objects : profile.allPerfect.graph.objects,
      clearStatus === 2 ? profile.fullCombo.clip : profile.allPerfect.clip,
    )),
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
    const observedOffset = offsets.get(object.path) ?? 0;
    const activationOffset = Number.isFinite(observedOffset) ? observedOffset : Math.fround(profile.durationSeconds + 1);
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
      (moduleProfiles[moduleName] ??= {})[id] = module;
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
        looping: particle.looping === true,
        prewarm: particle.prewarm === true,
        playOnAwake: false as const,
        useUnscaledTime: false as const,
        autoRandomSeed: true as const,
        startDelay: delayedCurve(
          particle.startDelay as ParticleProfileDefinition["system"]["startDelay"],
          activationOffset,
        ),
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
      transform: transform(object),
      parentTransforms: Object.freeze(parentTransforms(object.path, byPath)),
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
function activationOffsets(
  objects: readonly GameClearGraphObject[],
  clip: GameClearClipProfile,
): ReadonlyMap<string, number> {
  const root = [...objects].sort((left, right) => left.path.split("/").length - right.path.split("/").length)[0]!.path;
  const own = new Map(objects.map((object) => [object.path, object.active ? 0 : Number.POSITIVE_INFINITY]));
  const channels = clip.bindings.flatMap((binding) => binding.channels);
  const activeChannels = channels.map((channel, index) => ({ channel, index }))
    .filter((row) => row.channel.endsWith(".m_IsActive.value"));
  const phases = Object.freeze([0, ...clip.streamed_frames.map((frame) => frame.time), Math.fround(clip.stop_time - 1 / 6000)]);
  for (const row of activeChannels) {
    const relative = row.channel.slice(0, -".m_IsActive.value".length);
    const path = relative.length === 0 ? root : `${root}/${relative}`;
    let first = Number.POSITIVE_INFINITY;
    for (const phase of phases) {
      const value = clipValue(clip, row.index, phase);
      if (value >= 0.5) { first = phase; break; }
    }
    own.set(path, first);
  }
  const effective = new Map<string, number>();
  const resolve = (path: string): number => {
    const cached = effective.get(path); if (cached !== undefined) return cached;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
    const value = Math.max(own.get(path) ?? 0, parentPath !== null && own.has(parentPath) ? resolve(parentPath) : 0);
    effective.set(path, value); return value;
  };
  for (const object of objects) resolve(object.path);
  return effective;
}
function clipValue(clip: GameClearClipProfile, index: number, phase: number): number {
  if (index >= clip.streamed_curve_count) return clip.constants[index - clip.streamed_curve_count] ?? 0;
  let latest: GameClearClipKey | null = null;
  let time = 0;
  for (const frame of clip.streamed_frames) {
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
function delayedCurve(
  curve: ParticleProfileDefinition["system"]["startDelay"],
  delay: number,
): ParticleProfileDefinition["system"]["startDelay"] {
  return Object.freeze({
    ...curve,
    scalar: Math.fround(curve.scalar + delay),
    minScalar: Math.fround(curve.minScalar + delay),
  });
}

function transform(value: GameClearGraphObject): ParticleSystemDefinition["transform"] {
  return Object.freeze({
    m_LocalPosition: Object.freeze({ x: value.local_position[0], y: value.local_position[1], z: value.local_position[2] }),
    m_LocalRotation: Object.freeze({ x: value.local_rotation[0], y: value.local_rotation[1], z: value.local_rotation[2], w: value.local_rotation[3] }),
    m_LocalScale: Object.freeze({ x: value.local_scale[0], y: value.local_scale[1], z: value.local_scale[2] }),
  });
}
function parentTransforms(path: string, objects: ReadonlyMap<string, GameClearGraphObject>): ParticleSystemDefinition["parentTransforms"] {
  const output = [];
  let current = path;
  while (current.includes("/")) {
    current = current.slice(0, current.lastIndexOf("/"));
    const parent = objects.get(current);
    if (parent !== undefined) output.push(transform(parent));
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

function validBranch(value: unknown, curves: number, objects: number, duration: number): boolean {
  if (!record(value) || !record(value.graph) || !Array.isArray(value.graph.objects) || value.graph.objects.length !== objects || !record(value.clip)) return false;
  const clip = value.clip;
  return clip.stop_time === duration && clip.curve_count === curves &&
    Array.isArray(clip.bindings) && Array.isArray(clip.streamed_frames) && Array.isArray(clip.constants) &&
    clip.bindings.every((binding: unknown) => record(binding) && Array.isArray(binding.channels));
}
function validObject(value: unknown): boolean {
  return record(value) && typeof value.path === "string" && typeof value.active === "boolean" &&
    vector(value.local_position, 3) && vector(value.local_rotation, 4) && vector(value.local_scale, 3) && Array.isArray(value.components);
}
function vector(value: unknown, size: number): boolean { return Array.isArray(value) && value.length === size && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)); }
function positiveInt(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
