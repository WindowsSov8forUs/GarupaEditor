import type {
  ParticleAnimationCurve,
  ParticleBundleProfile,
  ParticleClampVelocityModule,
  ParticleColorModule,
  ParticleEmissionModule,
  ParticleInitialModule,
  ParticleInstanceIdentity,
  ParticleMinMaxCurve,
  ParticleMinMaxGradient,
  ParticlePortableProfile,
  ParticleProfileDefinition,
  ParticleRandomStateSnapshot,
  ParticleRenderSample,
  ParticleRootId,
  ParticleRotationBySpeedModule,
  ParticleRotationModule,
  ParticleShapeModule,
  ParticleSizeModule,
  ParticleSystemDefinition,
  ParticleTransformProfile,
  ParticleUvModule,
} from "../../backends/particleContracts";
import {
  particleRandomSlots,
  type ParticleRandomStateU32,
} from "./particleRandom";

const TWO_PI = 6.283185307179586;
const MIN_LIFETIME = Math.fround(1e-6);

type Vector3 = [number, number, number];
type Color4 = [number, number, number, number];

interface SystemRecord {
  readonly bundle: ParticleBundleProfile;
  readonly definition: ParticleSystemDefinition;
}

interface GlobalSystemState {
  stream: ParticleRandomStateU32;
  birthCount: number;
}

interface SimulatedParticle {
  readonly particleId: string;
  readonly creationSequence: number;
  age: number;
  readonly lifetime: number;
  position: Vector3;
  velocity: Vector3;
  readonly baseSize: Vector3;
  readonly baseColor: Color4;
  rotation: Vector3;
  readonly slots: readonly number[];
}

interface OwnerSystemRuntime {
  playing: boolean;
  elapsed: number;
  first: boolean;
  particles: SimulatedParticle[];
}

interface OwnerRuntime {
  readonly ownerKey: string;
  instance: ParticleInstanceIdentity;
  readonly root: ParticleRootId;
  readonly systems: Map<string, OwnerSystemRuntime>;
}

export class ParticleSimulationFault extends Error {
  constructor(
    readonly capability: string,
    readonly boundary: string,
  ) {
    super(boundary);
  }
}

export class DeterministicParticleSimulation {
  private readonly definitions = new Map<string, SystemRecord>();
  private readonly global = new Map<string, GlobalSystemState>();
  private readonly owners = new Map<string, OwnerRuntime>();
  private creationSequence = 0;

  constructor(
    readonly profile: ParticlePortableProfile,
    readonly gameplayTransformScale: number = Math.fround(1),
  ) {
    if (!Number.isFinite(gameplayTransformScale) || gameplayTransformScale <= 0 ||
      gameplayTransformScale !== Math.fround(gameplayTransformScale)) {
      throw fault("particle.simulation.invalid-gameplay-transform-scale", "ParticleSystem hierarchy scale must be one positive binary32 value.");
    }
    for (const bundle of profile.bundles) {
      for (const definition of bundle.systems) {
        if (this.definitions.has(definition.identity)) {
          throw fault("particle.simulation.duplicate-system", "System semantic identities must be globally unique.");
        }
        this.definitions.set(definition.identity, { bundle, definition });
        this.global.set(definition.identity, {
          stream: Object.freeze([...definition.randomStateU32]) as ParticleRandomStateU32,
          birthCount: 0,
        });
      }
    }
    if (this.definitions.size !== profile.systemCount || profile.systemCount <= 0) {
      throw fault("particle.simulation.incomplete-system-inventory", "The deterministic world requires the exact prepared profile system inventory.");
    }
  }

  clone(): DeterministicParticleSimulation {
    const cloned = Object.create(DeterministicParticleSimulation.prototype) as DeterministicParticleSimulation;
    Object.defineProperty(cloned, "profile", { value: this.profile, enumerable: true });
    Object.defineProperty(cloned, "gameplayTransformScale", { value: this.gameplayTransformScale, enumerable: true });
    Object.defineProperty(cloned, "definitions", { value: new Map(this.definitions) });
    Object.defineProperty(cloned, "global", {
      value: new Map([...this.global].map(([identity, state]) => [identity, {
        stream: Object.freeze([...state.stream]) as ParticleRandomStateU32,
        birthCount: state.birthCount,
      }])),
    });
    Object.defineProperty(cloned, "owners", {
      value: new Map([...this.owners].map(([ownerKey, owner]) => [ownerKey, cloneOwner(owner)])),
    });
    Object.defineProperty(cloned, "creationSequence", { value: this.creationSequence, writable: true });
    return cloned;
  }

  playRoot(
    ownerKey: string,
    instance: ParticleInstanceIdentity,
    root: ParticleRootId,
  ): void {
    const selected = [...this.definitions]
      .filter(([, record]) => record.definition.root === root)
      .map(([identity]) => identity)
      .sort();
    // Root Play preserves the original restart-if-active contract. The
    // incremental API below is reserved for serialized child GameObject
    // activation under one already-playing root.
    this.owners.delete(ownerKey);
    this.playRootSystems(ownerKey, instance, root, selected);
  }

  playRootSystems(
    ownerKey: string,
    instance: ParticleInstanceIdentity,
    root: ParticleRootId,
    selectedSystemIds: readonly string[],
  ): void {
    if (!Array.isArray(selectedSystemIds) || selectedSystemIds.length === 0) {
      throw fault("particle.simulation.unknown-root", "Play requires at least one prepared semantic particle system owner.");
    }
    let owner = this.owners.get(ownerKey);
    if (owner === undefined) {
      owner = {
        ownerKey,
        instance: Object.freeze({ ...instance }),
        root,
        systems: new Map<string, OwnerSystemRuntime>(),
      };
      this.owners.set(ownerKey, owner);
    } else if (owner.root !== root || !sameParticleInstance(owner.instance, instance)) {
      throw fault("particle.simulation.owner-identity-mismatch", "Incremental ParticleSystem activation requires the same stable root owner identity.");
    }
    for (const identity of [...new Set(selectedSystemIds)].sort()) {
      const record = this.definitions.get(identity);
      if (record === undefined || record.definition.root !== root || owner.systems.has(identity)) {
        throw fault("particle.simulation.invalid-system-activation", "Every incremental activation must name one inactive prepared ParticleSystem under the selected root.");
      }
      const profile = record.bundle.profiles[record.definition.profile];
      if (profile === undefined) throw fault("particle.simulation.missing-profile", "Every selected system profile must resolve.");
      const runtime: OwnerSystemRuntime = {
        playing: true,
        elapsed: f32(0),
        first: true,
        particles: [],
      };
      owner.systems.set(identity, runtime);
      if (profile.system.prewarm) {
        const duration = f32(profile.system.lengthInSec);
        const events = this.events(record.bundle, profile, -duration, 0, true).filter((at) => at < 0);
        for (const at of events) this.spawn(owner, record, profile, runtime, at, subtract(0, at));
      }
    }
  }

  moveOwner(ownerKey: string, instance: Extract<ParticleInstanceIdentity, { readonly kind: "note-slide" }>): void {
    const owner = this.owners.get(ownerKey);
    if (owner === undefined || owner.instance.kind !== "note-slide" ||
      owner.instance.noteIndex !== instance.noteIndex ||
      owner.instance.absolutePosition !== instance.absolutePosition) {
      throw fault("particle.simulation.missing-slide-owner", "Slide root movement requires the exact active persistent owner.");
    }
    owner.instance = Object.freeze({ ...instance });
  }

  stopOwner(ownerKey: string): void {
    this.owners.delete(ownerKey);
  }

  clearAll(): void {
    this.owners.clear();
  }

  step(deltaTime: number, paused: boolean): void {
    const delta = f32(deltaTime);
    if (!Number.isFinite(delta) || delta < 0) {
      throw fault("particle.simulation.invalid-delta", "Simulation accepts one finite non-negative binary32 outer-frame delta.");
    }
    if (paused) return;
    for (const owner of this.owners.values()) {
      for (const identity of [...owner.systems.keys()].sort()) {
        const runtime = owner.systems.get(identity)!;
        if (!runtime.playing) continue;
        const record = this.definitions.get(identity)!;
        const profile = record.bundle.profiles[record.definition.profile]!;
        const before = runtime.elapsed;
        const after = add(before, multiply(delta, profile.system.simulationSpeed));
        for (const particle of [...runtime.particles]) {
          this.updateParticle(record.bundle, profile, particle, delta);
        }
        runtime.particles = runtime.particles.filter((particle) => particle.age < particle.lifetime);
        for (const at of this.events(record.bundle, profile, before, after, runtime.first)) {
          this.spawn(owner, record, profile, runtime, at, subtract(after, at));
        }
        runtime.particles = runtime.particles.filter((particle) => particle.age < particle.lifetime);
        runtime.elapsed = after;
        runtime.first = false;
        if (!profile.system.looping &&
          after >= add(profile.system.startDelay.scalar, profile.system.lengthInSec) &&
          runtime.particles.length === 0) {
          runtime.playing = false;
        }
      }
    }
  }

  samples(): readonly ParticleRenderSample[] {
    const samples: ParticleRenderSample[] = [];
    for (const owner of this.owners.values()) {
      for (const identity of [...owner.systems.keys()].sort()) {
        const runtime = owner.systems.get(identity)!;
        const record = this.definitions.get(identity)!;
        const profile = record.bundle.profiles[record.definition.profile]!;
        const renderer = record.bundle.rendererProfiles[profile.renderer];
        if (renderer === undefined) throw fault("particle.simulation.missing-renderer", "Every current profile renderer must resolve.");
        if (!renderer.m_Enabled) continue;
        const material = renderer.m_Materials.find((candidate) => candidate !== null) ?? null;
        for (const particle of runtime.particles) {
          const normalizedAge = clamp01(divide(particle.age, particle.lifetime));
          let size: Vector3 = [...particle.baseSize];
          const sizeModule = getModule(record.bundle, profile, "SizeModule");
          if (sizeModule !== null) {
            const scale = minMax(sizeModule.curve, normalizedAge, particle.slots[2]!);
            size = size.map((value) => multiply(value, scale)) as Vector3;
          }
          let color: Color4 = [...particle.baseColor];
          const colorModule = getModule(record.bundle, profile, "ColorModule");
          if (colorModule !== null) {
            const sampled = minMaxColor(colorModule.gradient, normalizedAge, particle.slots[5]!);
            color = color.map((value, index) => multiply(value, sampled[index]!)) as Color4;
          }
          const uv = getModule(record.bundle, profile, "UVModule");
          let uvFrame = 0;
          if (uv !== null) {
            const frame = minMax(uv.frameOverTime, normalizedAge, particle.slots[9]!);
            const start = minMax(uv.startFrame, normalizedAge, particle.slots[8]!);
            const tileCount = uv.tilesX * uv.tilesY;
            uvFrame = modulo(Math.floor((start + frame * uv.cycles) * tileCount), tileCount);
          }
          samples.push(Object.freeze({
            particleId: particle.particleId,
            ownerKey: owner.ownerKey,
            instance: Object.freeze({ ...owner.instance }),
            root: owner.root,
            systemId: identity,
            creationSequence: particle.creationSequence,
            position: vectorBits(particle.position),
            velocity: vectorBits(particle.velocity),
            size: vectorBits(size),
            rotation: vectorBits(particle.rotation),
            color: colorBits(color),
            ageBits: bits(particle.age),
            lifetimeBits: bits(particle.lifetime),
            uvFrame,
            sortingOrder: renderer.m_SortingOrder,
            renderMode: renderer.m_RenderMode,
            renderAlignment: renderer.m_RenderAlignment,
            material: material?.name ?? null,
          }));
        }
      }
    }
    samples.sort((left, right) => left.sortingOrder - right.sortingOrder ||
      compareOrdinal(left.systemId, right.systemId) || left.creationSequence - right.creationSequence);
    return Object.freeze(samples);
  }

  randomStateSnapshot(): readonly ParticleRandomStateSnapshot[] {
    return Object.freeze([...this.global]
      .sort(([left], [right]) => compareOrdinal(left, right))
      .map(([systemId, state]) => Object.freeze({
        systemId,
        stateU32: Object.freeze([...state.stream]) as ParticleRandomStateU32,
        birthCount: state.birthCount,
      })));
  }

  private events(
    bundle: ParticleBundleProfile,
    profile: ParticleProfileDefinition,
    before: number,
    after: number,
    includeZero: boolean,
  ): number[] {
    const emission = getModule(bundle, profile, "EmissionModule");
    if (emission === null) return [];
    const delay = f32(profile.system.startDelay.scalar);
    const duration = f32(profile.system.lengthInSec);
    const firstLoop = Math.floor((before - delay) / duration) - 1;
    const lastLoopExclusive = Math.floor((after - delay) / duration) + 2;
    const events: number[] = [];
    for (let loop = profile.system.looping ? firstLoop : 0;
      loop < (profile.system.looping ? lastLoopExclusive : 1);
      loop += 1) {
      const base = add(delay, multiply(loop, duration));
      for (const burst of emission.m_Bursts) {
        const at = add(base, burst.time);
        const lower = includeZero && before === 0 ? at >= before : at > before;
        if (lower && at <= after) {
          const count = Math.trunc(f32(burst.countCurve.scalar));
          for (let index = 0; index < count; index += 1) events.push(at);
        }
      }
      const rate = f32(emission.rateOverTime.scalar);
      if (rate > 0) {
        const interval = divide(1, rate);
        for (let n = 1; ; n += 1) {
          const at = add(base, multiply(n, interval));
          if (at > after || at > add(base, duration)) break;
          if (at > before) events.push(at);
        }
      }
    }
    return events.sort((left, right) => left - right);
  }

  private spawn(
    owner: OwnerRuntime,
    record: SystemRecord,
    profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime,
    _eventTime: number,
    initialAge = 0,
  ): void {
    const initial = getModule(record.bundle, profile, "InitialModule");
    if (initial === null || runtime.particles.length >= initial.maxNumParticles) return;
    const global = this.global.get(record.definition.identity)!;
    const random = particleRandomSlots(global.stream);
    global.stream = random.state;
    const slots = random.slots;
    const lifetime = Math.max(MIN_LIFETIME, minMax(initial.startLifetime, 0, slots[0]!));
    const speed = minMax(initial.startSpeed, 0, slots[1]!);
    const sx = minMax(initial.startSize, 0, slots[2]!);
    const sy = initial.size3D ? minMax(initial.startSizeY, 0, slots[3]!) : sx;
    const sz = initial.size3D ? minMax(initial.startSizeZ, 0, slots[4]!) : sx;
    const baseColor = minMaxColor(initial.startColor, 0, slots[5]!);
    const rotation: Vector3 = [
      minMax(initial.startRotationX, 0, slots[6]!),
      minMax(initial.startRotationY, 0, slots[7]!),
      minMax(initial.startRotation, 0, slots[8]!),
    ];
    const shape = getModule(record.bundle, profile, "ShapeModule");
    let position: Vector3 = [0, 0, 0];
    let direction: Vector3 = [0, 1, 0];
    if (shape !== null) {
      const theta = multiply(TWO_PI, slots[11]!);
      const cosine = f32(Math.cos(theta));
      const sine = f32(Math.sin(theta));
      const radius = f32(shape.radius.value);
      const radial = multiply(radius, add(
        subtract(1, shape.radiusThickness),
        multiply(shape.radiusThickness, f32(Math.sqrt(slots[10]!))),
      ));
      if (shape.type === 4) {
        const angle = f32(shape.angle * Math.PI / 180);
        position = [multiply(radial, cosine), multiply(radial, sine), 0];
        direction = [
          multiply(f32(Math.sin(angle)), cosine),
          multiply(f32(Math.sin(angle)), sine),
          f32(Math.cos(angle)),
        ];
      } else if (shape.type === 5) {
        position = [
          multiply(subtract(slots[9]!, 0.5), shape.m_Scale.x),
          multiply(subtract(slots[10]!, 0.5), shape.m_Scale.y),
          multiply(subtract(slots[11]!, 0.5), shape.m_Scale.z),
        ];
      } else if (shape.type === 10) {
        position = [multiply(radial, cosine), multiply(radial, sine), 0];
        direction = [cosine, sine, 0];
      } else {
        throw fault("particle.simulation.unsupported-shape", "Only current shape types 4, 5 and 10 are portable.");
      }
    }
    let velocity = direction.map((value) => multiply(value, speed)) as Vector3;
    position = applyTransform(position, record.definition.transform, true, this.gameplayTransformScale);
    velocity = applyTransform(velocity, record.definition.transform, false, this.gameplayTransformScale);
    for (const parent of record.definition.parentTransforms) {
      position = applyTransform(position, parent, true, this.gameplayTransformScale);
      velocity = applyTransform(velocity, parent, false, this.gameplayTransformScale);
    }
    global.birthCount += 1;
    this.creationSequence += 1;
    const particle: SimulatedParticle = {
      particleId: `${record.definition.identity}#${global.birthCount}`,
      creationSequence: this.creationSequence,
      age: f32(0),
      lifetime,
      position: position.map(f32) as Vector3,
      velocity: velocity.map(f32) as Vector3,
      baseSize: [sx, sy, sz],
      baseColor,
      rotation,
      slots,
    };
    runtime.particles.push(particle);
    if (initialAge > 0) this.updateParticle(record.bundle, profile, particle, f32(initialAge));
    void owner;
  }

  private updateParticle(
    bundle: ParticleBundleProfile,
    profile: ParticleProfileDefinition,
    particle: SimulatedParticle,
    delta: number,
  ): void {
    const initial = getModule(bundle, profile, "InitialModule");
    if (initial === null) throw fault("particle.simulation.missing-initial-module", "Every emitted current particle requires InitialModule.");
    const gravity = minMax(initial.gravityModifier, divide(particle.age, particle.lifetime), particle.slots[9]!);
    particle.velocity[1] = add(particle.velocity[1], multiply(multiply(-9.81, gravity), delta));
    const clamp = getModule(bundle, profile, "ClampVelocityModule");
    if (clamp !== null) {
      const speed = f32(Math.sqrt(particle.velocity.reduce((sum, value) => sum + multiply(value, value), 0)));
      const limit = minMax(clamp.magnitude, divide(particle.age, particle.lifetime), particle.slots[10]!);
      if (speed > limit && speed > 0) {
        const target = lerp(speed, limit, clamp.dampen);
        const factor = divide(target, speed);
        particle.velocity = particle.velocity.map((value) => multiply(value, factor)) as Vector3;
      }
    }
    particle.position = particle.position.map((value, index) =>
      add(value, multiply(particle.velocity[index]!, delta))) as Vector3;
    const rotation = getModule(bundle, profile, "RotationModule");
    if (rotation !== null) {
      const normalizedAge = divide(particle.age, particle.lifetime);
      if (rotation.separateAxes) {
        particle.rotation[0] = add(particle.rotation[0], multiply(minMax(rotation.x, normalizedAge, particle.slots[6]!), delta));
        particle.rotation[1] = add(particle.rotation[1], multiply(minMax(rotation.y, normalizedAge, particle.slots[7]!), delta));
      }
      particle.rotation[2] = add(particle.rotation[2], multiply(minMax(rotation.curve, normalizedAge, particle.slots[8]!), delta));
    }
    const bySpeed = getModule(bundle, profile, "RotationBySpeedModule");
    if (bySpeed !== null) {
      const speed = f32(Math.sqrt(particle.velocity.reduce((sum, value) => sum + multiply(value, value), 0)));
      const lower = bySpeed.range.x;
      const upper = bySpeed.range.y;
      const normalizedSpeed = upper !== lower
        ? clamp01(divide(subtract(speed, lower), subtract(upper, lower)))
        : 0;
      particle.rotation[2] = add(particle.rotation[2], multiply(minMax(
        bySpeed.curve,
        normalizedSpeed,
        particle.slots[7]!,
      ), delta));
    }
    particle.age = add(particle.age, delta);
  }
}

function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "InitialModule"): ParticleInitialModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "EmissionModule"): ParticleEmissionModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "ShapeModule"): ParticleShapeModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "ColorModule"): ParticleColorModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "SizeModule"): ParticleSizeModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "RotationModule"): ParticleRotationModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "RotationBySpeedModule"): ParticleRotationBySpeedModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "ClampVelocityModule"): ParticleClampVelocityModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "UVModule"): ParticleUvModule | null;
function getModule(
  bundle: ParticleBundleProfile,
  profile: ParticleProfileDefinition,
  name: keyof typeof profile.modules,
): unknown {
  const key = profile.modules[name];
  if (key === undefined) return null;
  const group = bundle.moduleProfiles[name] as Readonly<Record<string, unknown>> | undefined;
  const value = group?.[key];
  if (value === undefined) throw fault("particle.simulation.missing-module-profile", "Every enabled module relation must resolve in its bundle.");
  return value;
}

function curve(value: ParticleAnimationCurve, time: number): number {
  const keys = value.m_Curve;
  if (keys.length === 0) return 0;
  const t = f32(time);
  if (t <= keys[0]!.time) return f32(keys[0]!.value);
  if (t >= keys[keys.length - 1]!.time) return f32(keys[keys.length - 1]!.value);
  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = keys[index]!;
    const right = keys[index + 1]!;
    if (t <= right.time) {
      const width = subtract(right.time, left.time);
      const u = divide(subtract(t, left.time), width);
      const u2 = multiply(u, u);
      const u3 = multiply(multiply(u, u), u);
      const h00 = add(subtract(multiply(2, u3), multiply(3, u2)), 1);
      const h10 = add(subtract(u3, multiply(2, u2)), u);
      const h01 = add(multiply(-2, u3), multiply(3, u2));
      const h11 = subtract(u3, u2);
      return add(
        add(multiply(h00, left.value), multiply(multiply(h10, width), left.outSlope)),
        add(multiply(h01, right.value), multiply(multiply(h11, width), right.inSlope)),
      );
    }
  }
  throw fault("particle.simulation.curve-interval", "A current animation curve must resolve one interpolation interval.");
}

function minMax(value: ParticleMinMaxCurve, time: number, ratio: number): number {
  switch (value.minMaxState) {
    case 0: return f32(value.scalar);
    case 1: return multiply(value.scalar, curve(value.maxCurve, time));
    case 2: return lerp(
      multiply(value.minScalar, curve(value.minCurve, time)),
      multiply(value.scalar, curve(value.maxCurve, time)),
      ratio,
    );
    case 3: return lerp(value.minScalar, value.scalar, ratio);
    default: throw fault("particle.simulation.unsupported-curve-state", "Only current MinMaxCurve states 0..3 are portable.");
  }
}

function gradient(value: ParticleMinMaxGradient["maxGradient"], time: number): Color4 {
  const t16 = Math.max(0, Math.min(65535, roundHalfEven(clamp01(time) * 65535)));
  const channel = (
    prefix: "c" | "a",
    component: "r" | "g" | "b" | "a",
    count: number,
  ): number => {
    const times = Array.from({ length: count }, (_, index) =>
      value[`${prefix}time${index}` as keyof typeof value] as number);
    const values = Array.from({ length: count }, (_, index) =>
      (value[`key${index}` as keyof typeof value] as unknown as { readonly [key: string]: number })[component]!);
    if (t16 <= times[0]!) return f32(values[0]!);
    for (let index = 1; index < count; index += 1) {
      if (t16 <= times[index]!) {
        if (times[index] === times[index - 1]) return f32(values[index]!);
        return lerp(
          values[index - 1]!,
          values[index]!,
          (t16 - times[index - 1]!) / (times[index]! - times[index - 1]!),
        );
      }
    }
    return f32(values[values.length - 1]!);
  };
  return [
    channel("c", "r", value.m_NumColorKeys),
    channel("c", "g", value.m_NumColorKeys),
    channel("c", "b", value.m_NumColorKeys),
    channel("a", "a", value.m_NumAlphaKeys),
  ];
}

function minMaxColor(value: ParticleMinMaxGradient, time: number, ratio: number): Color4 {
  switch (value.minMaxState) {
    case 0: return [value.maxColor.r, value.maxColor.g, value.maxColor.b, value.maxColor.a].map(f32) as Color4;
    case 1: return gradient(value.maxGradient, time);
    case 2: return (["r", "g", "b", "a"] as const).map((component) =>
      lerp(value.minColor[component], value.maxColor[component], ratio)) as Color4;
    case 3: {
      const minimum = gradient(value.minGradient, time);
      const maximum = gradient(value.maxGradient, time);
      return minimum.map((component, index) => lerp(component, maximum[index]!, ratio)) as Color4;
    }
    case 4: return gradient(value.maxGradient, ratio);
    default: throw fault("particle.simulation.unsupported-gradient-state", "Only current MinMaxGradient states 0..4 are portable.");
  }
}

function applyTransform(
  vector: Vector3,
  transform: ParticleTransformProfile,
  position: boolean,
  gameplayTransformScale: number,
): Vector3 {
  const scale = transform.m_LocalScale;
  const translation = transform.m_LocalPosition;
  let value: Vector3 = [
    multiply(vector[0], multiply(scale.x, gameplayTransformScale)),
    multiply(vector[1], multiply(scale.y, gameplayTransformScale)),
    multiply(vector[2], multiply(scale.z, gameplayTransformScale)),
  ];
  value = quaternionRotate(value, transform.m_LocalRotation);
  if (position) {
    value = [
      add(value[0], translation.x),
      add(value[1], translation.y),
      add(value[2], translation.z),
    ];
  }
  return value;
}

function quaternionRotate(vector: Vector3, quaternion: ParticleTransformProfile["m_LocalRotation"]): Vector3 {
  const [x, y, z] = vector.map(f32) as Vector3;
  const qx = f32(quaternion.x);
  const qy = f32(quaternion.y);
  const qz = f32(quaternion.z);
  const qw = f32(quaternion.w);
  const tx = multiply(2, subtract(multiply(qy, z), multiply(qz, y)));
  const ty = multiply(2, subtract(multiply(qz, x), multiply(qx, z)));
  const tz = multiply(2, subtract(multiply(qx, y), multiply(qy, x)));
  return [
    add(x, add(multiply(qw, tx), subtract(multiply(qy, tz), multiply(qz, ty)))),
    add(y, add(multiply(qw, ty), subtract(multiply(qz, tx), multiply(qx, tz)))),
    add(z, add(multiply(qw, tz), subtract(multiply(qx, ty), multiply(qy, tx)))),
  ];
}

function sameParticleInstance(left: ParticleInstanceIdentity, right: ParticleInstanceIdentity): boolean {
  if (left.kind !== right.kind || left.buttonType !== right.buttonType || left.rangeLength !== right.rangeLength) return false;
  if (left.kind !== "note-slide" || right.kind !== "note-slide") return true;
  return left.noteIndex === right.noteIndex && left.absolutePosition === right.absolutePosition &&
    left.rootPositionXBits === right.rootPositionXBits && left.rootPositionYBits === right.rootPositionYBits &&
    left.rootScaleBits === right.rootScaleBits;
}

function cloneOwner(owner: OwnerRuntime): OwnerRuntime {
  return {
    ownerKey: owner.ownerKey,
    instance: Object.freeze({ ...owner.instance }),
    root: owner.root,
    systems: new Map([...owner.systems].map(([identity, runtime]) => [identity, {
      playing: runtime.playing,
      elapsed: runtime.elapsed,
      first: runtime.first,
      particles: runtime.particles.map((particle) => ({
        ...particle,
        position: [...particle.position] as Vector3,
        velocity: [...particle.velocity] as Vector3,
        baseSize: [...particle.baseSize] as Vector3,
        baseColor: [...particle.baseColor] as Color4,
        rotation: [...particle.rotation] as Vector3,
        slots: [...particle.slots],
      })),
    }])),
  };
}

function vectorBits(value: Vector3) {
  return Object.freeze({ xBits: bits(value[0]), yBits: bits(value[1]), zBits: bits(value[2]) });
}

function colorBits(value: Color4) {
  return Object.freeze({
    redBits: bits(value[0]),
    greenBits: bits(value[1]),
    blueBits: bits(value[2]),
    alphaBits: bits(value[3]),
  });
}

function bits(value: number): string {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, f32(value), true);
  return `0x${view.getUint32(0, true).toString(16).toUpperCase().padStart(8, "0")}`;
}

function f32(value: number): number { return Math.fround(value); }
function add(left: number, right: number): number { return f32(f32(left) + f32(right)); }
function subtract(left: number, right: number): number { return f32(f32(left) - f32(right)); }
function multiply(left: number, right: number): number { return f32(f32(left) * f32(right)); }
function divide(left: number, right: number): number { return f32(f32(left) / f32(right)); }
function clamp01(value: number): number { return f32(Math.max(0, Math.min(1, f32(value)))); }
function lerp(left: number, right: number, time: number): number {
  return add(left, multiply(subtract(right, left), clamp01(time)));
}
function modulo(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }
function compareOrdinal(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}
function fault(capability: string, boundary: string): ParticleSimulationFault {
  return new ParticleSimulationFault(capability, boundary);
}
