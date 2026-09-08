import type {
  ParticleAnimationCurve,
  ParticleBundleProfile,
  ParticleClampVelocityModule,
  ParticleColorModule,
  ParticleCustomDataModule,
  ParticleEmissionModule,
  ParticleForceModule,
  ParticleInitialModule,
  ParticleInstanceIdentity,
  ParticleMinMaxCurve,
  ParticleMinMaxGradient,
  ParticleOwnerTransform,
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
  ParticleVelocityModule,
} from "../../backends/particleContracts";
import { particleFloat32FromBits } from "../../backends/particleValidation";
import { selectedParticleRangeLength } from "./particleRangePrefabs";
import {
  applyNativeParticleMatrixVector,
  applyNativeParticleSetupScale,
  type ParticleSetupScale,
  applyNativeParticleWorldModuleVector,
  calculateNativeParticleEmitterOrigin,
  calculateNativeParticleHierarchyScale,
  calculateNativeParticleRuntimeTransform,
  calculateNativeParticleWorldPosition,
  type ParticleHierarchyPositionTransform,
  type ParticleHierarchyTransform,
  type ParticleRuntimeTransform,
} from "./particleHierarchyScale";
import particleReciprocalSqrtEstimates from "./arm64ReciprocalSqrtEstimate.json";
import { calculateNativeParticleActualBounds, calculateNativeParticleLinearAnalyticBounds, calculateNativeParticleShapeAnalyticBounds, calculateNativeParticleWorldBounds, calculateNativeParticleRendererSortDistance } from "./particleBounds";
import { getNativeParticleMeshBounds } from "./particleMeshGeometry";
import {
  PARTICLE_AUTO_SEED_INITIAL_STATE,
  particleSimdRandomValues,
  particleSimdStateFromSeed,
  particleSeedRatio,
  particleStateFromSeed,
  particleWordRatio,
  particleXorshift128,
  type ParticleRandomSimdState,
  type ParticleRandomStateU32,
} from "./particleRandom";

const TWO_PI = float32FromBits(0x40C90FDB);
const DEG_TO_RAD = float32FromBits(0x3C8EFA35);
const INVERSE_TWO_PI = float32FromBits(0x3E22F983);
const TRIG_POLY_1 = float32FromBits(0x42255DDC);
const TRIG_POLY_2 = float32FromBits(0x42A33422);
const TRIG_POLY_3 = float32FromBits(0x42992322);
const TRIG_POLY_4 = float32FromBits(0x421EA0CD);
const TRIG_POLY_TWO_PI = float32FromBits(0x40C90FDA);
const CUBE_LOG_LINEAR = float32FromBits(0x3FB80D57);
const CUBE_LOG_QUADRATIC = float32FromBits(0xBF21DDA4);
const CUBE_LOG_CUBIC = float32FromBits(0x3E470BD9);
const CUBE_EXP_LINEAR = float32FromBits(0x3F2EA941);
const CUBE_EXP_QUADRATIC = float32FromBits(0x3EA2AD7F);
const ONE_THIRD = float32FromBits(0x3EAAAAAB);
const SHAPE_DIRECTION_EPSILON_SQUARED = float32FromBits(0x0da24260);

type Vector3 = [number, number, number];
type Color4 = [number, number, number, number];
type ColorBytes = [number, number, number, number];
interface ParticleGradientCache {
  readonly mode: 0 | 1;
  readonly times: readonly number[];
  readonly colors: readonly ColorBytes[];
  readonly inverses: readonly number[];
}
const particleGradientCaches = new WeakMap<ParticleMinMaxGradient["maxGradient"], ParticleGradientCache>();
type ParticleSimdDraws = ReturnType<typeof particleSimdRandomValues>;

interface SystemRecord {
  readonly bundle: ParticleBundleProfile;
  readonly definition: ParticleSystemDefinition;
  readonly ordinal: number;
}

function matchesInstanceRoot(record: SystemRecord, root: ParticleRootId, instance: ParticleInstanceIdentity): boolean {
  return record.definition.root === root && (
    record.bundle.rangePrefabSelection !== "habahiro-width-arrays" ||
    record.definition.sourceRangeLength === null ||
    record.definition.sourceRangeLength === selectedParticleRangeLength(instance)
  );
}

interface InstanceSystemState {
  readonly key: string;
  readonly ownerKey: string;
  readonly ownerGeneration: number;
  readonly systemId: string;
  readonly seed: number;
  stream: ParticleRandomStateU32;
  emissionStream: ParticleRandomStateU32;
  initialModuleStream: ParticleRandomSimdState;
  shapeModuleStream: ParticleRandomSimdState;
  rateAccumulator: number;
  burstFraction: number;
  birthCount: number;
}

interface EmissionBatch {
  readonly at: number;
  readonly count: number;
  readonly nativeTiming?: ParticleEmissionStep & { readonly delta: number };
}

interface AnalyticEmissionRecord {
  readonly phase: number;
  age: number;
  readonly rateRemainder: number;
  readonly rateInterval: number;
  readonly count: number;
  readonly rateCount: number;
}

interface AnalyticBirthState {
  readonly lifetime: number;
  readonly inverseLifetime: number;
  readonly agePercent: number;
  readonly ageSeconds: number;
}

interface ParticleEmissionStep {
  readonly count: number;
  readonly rateCount: number;
  readonly inverseRate: number;
  readonly rateRemainder: number;
  readonly burstFraction: number;
}

interface BirthRandomSample {
  readonly particleSeed: number;
  readonly slots: readonly number[];
  readonly shapeValues: readonly number[];
}

// true: instantiate reset before setup; slide-play: later Play overwrites root scale.
type ParticleRootTransformReset = boolean | "slide-play";

interface SimulatedParticle {
  readonly particleId: string;
  readonly creationSequence: number;
  readonly emitterOrigin: Vector3;
  readonly particleSystemSetupScale: ParticleSetupScale;
  readonly resetRootTransform: ParticleRootTransformReset;
  ownerParents: readonly ParticleHierarchyPositionTransform[];
  age: number;
  agePercent: number;
  readonly lifetime: number;
  readonly inverseLifetime: number;
  readonly randomSeed: number;
  position: Vector3;
  velocity: Vector3;
  renderVelocity: Vector3;
  moduleVelocity: Vector3;
  readonly baseSize: Vector3;
  readonly baseColor: ColorBytes;
  rotation: Vector3;
  readonly slots: readonly number[];
}

interface OwnerSystemRuntime {
  readonly instanceStateKey: string;
  playing: boolean;
  elapsed: number;
  remainingDelta: number;
  delayRemaining: number;
  cycleCount: number;
  emissionStopped: boolean;
  first: boolean;
  particles: SimulatedParticle[];
}

interface OwnerRuntime {
  readonly ownerKey: string;
  readonly generation: number;
  readonly particleSystemSetupScale: ParticleSetupScale;
  instance: ParticleInstanceIdentity;
  readonly root: ParticleRootId;
  readonly systems: Map<string, OwnerSystemRuntime>;
}

export interface ParticleSystemTransformUpdate {
  readonly systemId: string;
  readonly transform: ParticleTransformProfile;
  readonly parentTransforms: readonly ParticleTransformProfile[];
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
  private readonly instanceStates = new Map<string, InstanceSystemState>();
  private readonly owners = new Map<string, OwnerRuntime>();
  private readonly constructedOwners = new Map<string, ParticleRootId>();
  private autoSeedState: ParticleRandomStateU32 = PARTICLE_AUTO_SEED_INITIAL_STATE;
  private ownerGenerationSequence = 0;
  private creationSequence = 0;

  constructor(
    readonly profile: ParticlePortableProfile,
    readonly gameplayTransformScale: number = Math.fround(1),
  ) {
    if (!Number.isFinite(gameplayTransformScale) || gameplayTransformScale <= 0 ||
      gameplayTransformScale !== Math.fround(gameplayTransformScale)) {
      throw fault("particle.simulation.invalid-gameplay-transform-scale", "ParticleSystem hierarchy scale must be one positive binary32 value.");
    }
    let ordinal = 0;
    for (const bundle of profile.bundles) {
      for (let bundleOrdinal = 0; bundleOrdinal < bundle.systems.length; bundleOrdinal += 1) {
        const definition = bundle.systems[bundleOrdinal]!;
        if (this.definitions.has(definition.identity)) {
          throw fault("particle.simulation.duplicate-system", "System semantic identities must be globally unique.");
        }
        if (profile.schemaVersion === 2 && definition.sourceOrdinal !== bundleOrdinal) {
          throw fault("particle.simulation.source-ordinal-drift", "Native-semantic Schema 2 requires contiguous serialized/component order in every bundle.");
        }
        this.definitions.set(definition.identity, { bundle, definition, ordinal });
        ordinal += 1;
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
    Object.defineProperty(cloned, "instanceStates", {
      value: new Map([...this.instanceStates].map(([key, state]) => [key, {
        key: state.key,
        ownerKey: state.ownerKey,
        ownerGeneration: state.ownerGeneration,
        systemId: state.systemId,
        seed: state.seed,
        stream: Object.freeze([...state.stream]) as ParticleRandomStateU32,
        emissionStream: Object.freeze([...state.emissionStream]) as ParticleRandomStateU32,
        initialModuleStream: cloneSimdState(state.initialModuleStream),
        shapeModuleStream: cloneSimdState(state.shapeModuleStream),
        rateAccumulator: state.rateAccumulator,
        burstFraction: state.burstFraction,
        birthCount: state.birthCount,
      }])),
    });
    Object.defineProperty(cloned, "owners", {
      value: new Map([...this.owners].map(([ownerKey, owner]) => [ownerKey, cloneOwner(owner)])),
    });
    Object.defineProperty(cloned, "constructedOwners", { value: new Map(this.constructedOwners) });
    Object.defineProperty(cloned, "autoSeedState", {
      value: Object.freeze([...this.autoSeedState]) as ParticleRandomStateU32,
      writable: true,
    });
    Object.defineProperty(cloned, "ownerGenerationSequence", { value: this.ownerGenerationSequence, writable: true });
    Object.defineProperty(cloned, "creationSequence", { value: this.creationSequence, writable: true });
    return cloned;
  }

  playRoot(
    ownerKey: string,
    instance: ParticleInstanceIdentity,
    root: ParticleRootId,
  ): void {
    const selected = [...this.definitions.values()]
      .filter((record) => matchesInstanceRoot(record, root, instance))
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((record) => record.definition.identity);
    const owner = this.owners.get(ownerKey);
    if (owner !== undefined) {
      if (owner.root !== root || !sameParticleInstance(owner.instance, instance) ||
        !sameParticleSetupScale(owner.particleSystemSetupScale, instanceParticleSystemSetupScale(instance, this.gameplayTransformScale))) {
        throw fault("particle.simulation.owner-identity-mismatch", "A live native ParticleSystem instance cannot switch owner/root identity during Stop/Clear/Play restart.");
      }
      // The managed routes execute Stop(withChildren) + Clear(withChildren)
      // before Play. Native fresh Play observes an empty particle store and
      // re-runs 0x108F26C for each component, consuming a new auto seed.
      this.removeOwnerRuntime(owner);
    }
    this.playRootSystems(ownerKey, instance, root, selected);
  }

  playRootSystems(
    ownerKey: string,
    instance: ParticleInstanceIdentity,
    root: ParticleRootId,
    selectedSystemIds: readonly string[],
  ): void {
    if (!Array.isArray(selectedSystemIds) || selectedSystemIds.length === 0) {
      throw fault("particle.simulation.unknown-root", "Play requires at least one prepared semantic ParticleSystem owner.");
    }
    let owner = this.owners.get(ownerKey);
    if (owner === undefined) {
      this.ensureConstructedOwner(ownerKey, instance, root);
      this.ownerGenerationSequence += 1;
      owner = {
        ownerKey,
        generation: this.ownerGenerationSequence,
        particleSystemSetupScale: instanceParticleSystemSetupScale(instance, this.gameplayTransformScale),
        instance: Object.freeze({ ...instance }),
        root,
        systems: new Map<string, OwnerSystemRuntime>(),
      };
      this.owners.set(ownerKey, owner);
    } else if (owner.root !== root || !sameParticleInstance(owner.instance, instance) ||
      !sameParticleSetupScale(owner.particleSystemSetupScale, instanceParticleSystemSetupScale(instance, this.gameplayTransformScale))) {
      throw fault("particle.simulation.owner-identity-mismatch", "Incremental ParticleSystem activation requires the same stable root owner identity.");
    }
    const selected = [...new Set(selectedSystemIds)].map((identity) => {
      const record = this.definitions.get(identity);
      if (record === undefined || !matchesInstanceRoot(record, root, instance) || owner!.systems.has(identity)) {
        throw fault("particle.simulation.invalid-system-activation", "Every incremental activation must name one inactive prepared ParticleSystem under the selected root.");
      }
      return record;
    }).sort((left, right) => left.ordinal - right.ordinal);
    for (const record of selected) {
      const profile = record.bundle.profiles[record.definition.profile];
      if (profile === undefined) throw fault("particle.simulation.missing-profile", "Every selected system profile must resolve.");
      const runtime = this.createSystemRuntime(owner, record, profile);
      owner.systems.set(record.definition.identity, runtime);
      this.prewarm(owner, record, profile, runtime);
    }
  }

  private ensureConstructedOwner(
    ownerKey: string,
    instance: ParticleInstanceIdentity,
    root: ParticleRootId,
  ): void {
    const constructionKey = particleConstructionKey(ownerKey, instance);
    const existing = this.constructedOwners.get(constructionKey);
    if (existing !== undefined) {
      if (existing !== root) {
        throw fault("particle.simulation.constructed-owner-root-mismatch", "A concrete pooled particle owner cannot change its serialized prefab root.");
      }
      return;
    }
    const records = [...this.definitions.values()]
      .filter((record) => matchesInstanceRoot(record, root, instance))
      .sort((left, right) => left.ordinal - right.ordinal);
    for (const record of records) {
      const profile = record.bundle.profiles[record.definition.profile];
      if (profile === undefined) throw fault("particle.simulation.missing-profile", "Every constructed system profile must resolve.");
      // Native activation enters Play only for playOnAwake systems. An idle
      // component does not consume an auto seed merely because it was created.
      if (profile.system.playOnAwake && profile.system.autoRandomSeed &&
        record.definition.activeInHierarchySerialized === true) {
        const constructionSeed = particleXorshift128(this.autoSeedState);
        this.autoSeedState = constructionSeed.state;
      }
    }
    this.constructedOwners.set(constructionKey, root);
  }

  private createSystemRuntime(
    owner: OwnerRuntime,
    record: SystemRecord,
    profile: ParticleProfileDefinition,
  ): OwnerSystemRuntime {
    const instanceStateKey = `${owner.ownerKey}\u0000${owner.generation}\u0000${record.definition.identity}`;
    let seed: number;
    if (profile.system.autoRandomSeed) {
      const assigned = particleXorshift128(this.autoSeedState);
      this.autoSeedState = assigned.state;
      seed = assigned.value;
    } else {
      seed = profile.system.randomSeed >>> 0;
    }
    this.instanceStates.set(instanceStateKey, {
      key: instanceStateKey,
      ownerKey: owner.ownerKey,
      ownerGeneration: owner.generation,
      systemId: record.definition.identity,
      seed,
      stream: particleStateFromSeed(seed),
      emissionStream: particleStateFromSeed(seed),
      initialModuleStream: particleSimdStateFromSeed(seed),
      shapeModuleStream: particleSimdStateFromSeed(seed),
      rateAccumulator: f32(0),
      burstFraction: f32(0),
      birthCount: 0,
    });
    return {
      instanceStateKey,
      playing: true,
      elapsed: f32(0),
      remainingDelta: f32(0),
      delayRemaining: profile.system.prewarm ? f32(0) : minMax(profile.system.startDelay, 0, 0),
      cycleCount: 0,
      emissionStopped: false,
      first: true,
      particles: [],
    };
  }

  private prewarm(
    owner: OwnerRuntime,
    record: SystemRecord,
    profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime,
  ): void {
    if (!profile.system.prewarm || !profile.system.looping) return;
    if (!nativeParticlePrewarmAnalyticEligible(record.bundle, profile)) {
      const initial = getModule(record.bundle, profile, "InitialModule");
      if (initial === null) return;
      const prepared = nativeParticlePrewarmPreparation(profile.system, initial.startLifetime);
      runtime.elapsed = prepared.phase;
      const frameElapsed = runtime.elapsed;
      // Play's normal prewarm uses the explicit-delta batch job (flags 8).
      const steps = nativeParticleFrameSteps(prepared.delta, profile.system.simulationSpeed,
        profile.system.lengthInSec, runtime);
      for (const effectiveDelta of steps) {
        const timing = nativeParticleSystemClock(runtime, effectiveDelta,
          profile.system.lengthInSec, profile.system.looping, frameElapsed);
        for (const particle of runtime.particles) this.updateParticle(record, particle, effectiveDelta);
        removeExpiredParticles(runtime.particles);
        const batches = timing.delta === null ? []
          : this.emitStep(record.bundle, profile, runtime, timing.before, timing.after, timing.delta);
        for (const batch of batches) this.spawnBatch(owner, record, profile, runtime, batch, timing.after);
        runtime.first = false;
      }
      return;
    }
    const analyticInitial = getModule(record.bundle, profile, "InitialModule");
    if (analyticInitial !== null && analyticInitial.gravityModifier.scalar === 0 &&
      nativeParticleAnalyticMotionCacheable(record.bundle, profile) &&
      getModule(record.bundle, profile, "ForceModule") === null) {
      this.reconstructAnalyticPrewarm(owner, record, profile, runtime, analyticInitial);
      return;
    }
    // Non-cached integral curves and nonzero gravity/Force remain open.
    const duration = f32(profile.system.lengthInSec);
    const events = this.events(record.bundle, profile, runtime, -duration, 0, true)
      .filter((batch) => batch.at < 0);
    let cursor = f32(-duration);
    for (const batch of events) {
      const segment = subtract(batch.at, cursor);
      if (segment > 0) {
        for (const particle of runtime.particles) this.updateParticle(record, particle, segment);
      }
      this.spawnBatch(owner, record, profile, runtime, batch, batch.at);
      cursor = batch.at;
    }
    const finalSegment = subtract(0, cursor);
    if (finalSegment > 0) {
      for (const particle of runtime.particles) this.updateParticle(record, particle, finalSegment);
    }
    removeExpiredParticles(runtime.particles);
  }

  private reconstructAnalyticPrewarm(
    owner: OwnerRuntime, record: SystemRecord, profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime, initial: ParticleInitialModule,
  ): void {
    const state = this.instanceStates.get(runtime.instanceStateKey);
    if (state === undefined) throw fault("particle.simulation.instance-random-state-missing", "Analytic birth requires its concrete random owner.");
    const queue = nativeParticleAnalyticPrewarmQueue(record.bundle, profile, initial, runtime, state);
    const births: Array<{ phase: number; random: BirthRandomSample; state: AnalyticBirthState }> = [];
    const emptyShape = particleSimdRandomValues(state.shapeModuleStream, 0);
    for (const entry of queue) {
      const phase = divide(entry.phase, profile.system.lengthInSec);
      let remainingCount = entry.count;
      let motionIndex = entry.rateRemainder;
      for (let group = 0; group < entry.count; group += 4) {
        const lifetimeDraw = particleSimdRandomValues(state.initialModuleStream, 1);
        state.initialModuleStream = lifetimeDraw.state;
        const lifetimes = lifetimeDraw.values[0]!.map((ratio) => nativeParticleLifetime(
          minMax(initial.startLifetime, phase, ratio), f32(0.000001)));
        const remaining = lifetimes.map(([lifetime], lane) => subtract(subtract(lifetime, entry.age),
          group + lane < entry.rateCount ? multiply(entry.rateInterval, add(entry.rateRemainder, group + lane)) : 0));
        // 10616B0 skips the other draws only when all four SIMD lanes are dead.
        if (remaining.every((value) => value <= 0)) continue;
        const rest = particleSimdRandomValues(state.initialModuleStream, initialModuleRandomDrawCount(initial) - 1);
        state.initialModuleStream = rest.state;
        const draws = { state: rest.state,
          words: [rest.words[0]!, lifetimeDraw.words[0]!, ...rest.words.slice(1)],
          values: [rest.values[0]!, lifetimeDraw.values[0]!, ...rest.values.slice(1)] };
        // The original remaining counter advances only for published groups.
        const count = Math.min(4, remainingCount);
        remainingCount -= 4;
        for (let lane = 0; lane < count; lane += 1) {
          const [lifetime, inverseLifetime] = lifetimes[lane]!;
          births.push({ phase, random: buildBirthRandomSample(initial, draws, emptyShape, lane), state: {
            lifetime, inverseLifetime,
            agePercent: multiply(clamp01(subtract(1, multiply(remaining[lane]!, inverseLifetime))), 100),
            ageSeconds: add(entry.age, motionIndex < entry.rateCount ? multiply(motionIndex, entry.rateInterval) : 0),
          } });
          motionIndex = add(motionIndex, 1);
        }
      }
    }
    const shape = getModule(record.bundle, profile, "ShapeModule");
    for (let group = 0; group < births.length; group += 4) {
      const shapeDraws = particleSimdRandomValues(state.shapeModuleStream, shapeRandomDrawCount(shape));
      state.shapeModuleStream = shapeDraws.state;
      for (let lane = 0; lane < Math.min(4, births.length - group); lane += 1) {
        const birth = births[group + lane]!;
        this.spawn(owner, record, profile, runtime, birth.phase, 0, group + lane, births.length,
          { ...birth.random, shapeValues: shapeDraws.values.map((values) => values[lane]!) }, birth.state);
      }
    }
    runtime.first = false;
  }

  updateSystemTransforms(updates: readonly ParticleSystemTransformUpdate[]): void {
    if (!Array.isArray(updates)) {
      throw fault("particle.simulation.invalid-transform-updates", "Animated ParticleSystem Transforms require one immutable update list.");
    }
    const staged = new Map<string, SystemRecord>();
    for (const update of updates) {
      const record = this.definitions.get(update.systemId);
      if (record === undefined || staged.has(update.systemId) ||
        !validTransform(update.transform) || !Array.isArray(update.parentTransforms) ||
        update.parentTransforms.some((transform: ParticleTransformProfile) => !validTransform(transform))) {
        throw fault("particle.simulation.invalid-transform-update", "Every animated Transform update must target one unique prepared ParticleSystem with finite serialized local state.");
      }
      staged.set(update.systemId, {
        bundle: record.bundle,
        ordinal: record.ordinal,
        definition: Object.freeze({
          ...record.definition,
          transform: freezeTransform(update.transform),
          parentTransforms: Object.freeze(update.parentTransforms.map(freezeTransform)),
        }),
      });
    }
    for (const [identity, record] of staged) this.definitions.set(identity, record);
  }

  particleEmitterOrigin(particleId: string): readonly [number, number, number] {
    for (const owner of this.owners.values()) {
      for (const runtime of owner.systems.values()) {
        const particle = runtime.particles.find((candidate) => candidate.particleId === particleId);
        if (particle !== undefined) return Object.freeze([...particle.emitterOrigin] as const);
      }
    }
    throw fault("particle.simulation.particle-origin-missing", "A rendered particle must retain the emitter Transform origin captured at birth.");
  }

  currentSystemDefinition(systemId: string): ParticleSystemDefinition {
    const record = this.definitions.get(systemId);
    if (record === undefined) throw fault("particle.simulation.system-definition-missing", "A rendered particle must retain its prepared system definition.");
    return record.definition;
  }

  deactivateRootSystems(ownerKey: string, systemIds: readonly string[]): void {
    const owner = this.owners.get(ownerKey);
    if (owner === undefined || !Array.isArray(systemIds) || systemIds.some((identity) => !owner.systems.has(identity))) {
      throw fault("particle.simulation.invalid-system-deactivation", "Serialized GameObject deactivation requires active ParticleSystems under the same stable root owner.");
    }
    for (const identity of new Set(systemIds)) {
      const runtime = owner.systems.get(identity)!;
      this.instanceStates.delete(runtime.instanceStateKey);
      owner.systems.delete(identity);
    }
  }

  moveOwner(ownerKey: string, instance: Extract<ParticleInstanceIdentity, { readonly kind: "note-slide" }>): void {
    const owner = this.owners.get(ownerKey);
    if (owner === undefined || owner.instance.kind !== "note-slide" ||
      owner.instance.noteIndex !== instance.noteIndex ||
      owner.instance.absolutePosition !== instance.absolutePosition ||
      owner.instance.poolSlot !== instance.poolSlot || owner.instance.route !== instance.route ||
      !sameParticleSetupScale(owner.particleSystemSetupScale, instanceParticleSystemSetupScale(instance, this.gameplayTransformScale))) {
      throw fault("particle.simulation.missing-slide-owner", "Slide root movement requires the exact active persistent owner.");
    }
    const ownerParents = particleOwnerParents(instance);
    owner.instance = Object.freeze({ ...instance });
    for (const runtime of owner.systems.values()) {
      for (const particle of runtime.particles) particle.ownerParents = ownerParents;
    }
  }

  stopOwner(ownerKey: string): void {
    const owner = this.owners.get(ownerKey);
    if (owner !== undefined) this.removeOwnerRuntime(owner);
  }

  clearAll(): void {
    for (const owner of [...this.owners.values()]) this.removeOwnerRuntime(owner);
  }

  private removeOwnerRuntime(owner: OwnerRuntime): void {
    for (const runtime of owner.systems.values()) this.instanceStates.delete(runtime.instanceStateKey);
    this.owners.delete(owner.ownerKey);
  }

  step(deltaTime: number, paused: boolean): void {
    const delta = f32(deltaTime);
    if (!Number.isFinite(delta) || delta < 0) {
      throw fault("particle.simulation.invalid-delta", "Simulation accepts one finite non-negative binary32 outer-frame delta.");
    }
    // Current managed pause does not call ParticleSystem.Pause. The gameplay,
    // input and score clocks may be frozen while native ParticleSystem jobs
    // continue to consume the supplied outer-frame delta.
    void paused;
    for (const owner of this.owners.values()) {
      const orderedSystems = [...owner.systems.keys()].sort((left, right) =>
        this.definitions.get(left)!.ordinal - this.definitions.get(right)!.ordinal);
      for (const identity of orderedSystems) {
        const runtime = owner.systems.get(identity)!;
        if (!runtime.playing) continue;
        const record = this.definitions.get(identity)!;
        const profile = record.bundle.profiles[record.definition.profile]!;
        const frameElapsed = runtime.elapsed;
        const steps = nativeParticleFrameSteps(delta, profile.system.simulationSpeed, profile.system.lengthInSec, runtime);
        for (const effectiveDelta of steps) {
          const timing = nativeParticleSystemClock(runtime, effectiveDelta,
            profile.system.lengthInSec, profile.system.looping, frameElapsed);
          const before = timing.before;
          const after = timing.after;
          // 0x1097D34/58/78 update existing rows once with the native step,
          // including death removal, before 0x1097DF0/EA0 emission/admission.
          for (const particle of runtime.particles) this.updateParticle(record, particle, effectiveDelta);
          removeExpiredParticles(runtime.particles);
          const batches = timing.delta === null ? []
            : this.emitStep(record.bundle, profile, runtime, before, after, timing.delta);
          for (const batch of batches) {
            this.spawnBatch(owner, record, profile, runtime, batch, after);
          }
          runtime.first = false;
          if (runtime.emissionStopped && runtime.particles.length === 0) {
            runtime.playing = false;
            break;
          }
        }
      }
    }
  }

  samples(): readonly ParticleRenderSample[] {
    const samples: ParticleRenderSample[] = [];
    for (const owner of this.owners.values()) {
      const orderedSystems = [...owner.systems.keys()].sort((left, right) =>
        this.definitions.get(left)!.ordinal - this.definitions.get(right)!.ordinal);
      for (const identity of orderedSystems) {
        const runtime = owner.systems.get(identity)!;
        const record = this.definitions.get(identity)!;
        const profile = record.bundle.profiles[record.definition.profile]!;
        const renderer = record.bundle.rendererProfiles[profile.renderer];
        if (renderer === undefined) throw fault("particle.simulation.missing-renderer", "Every current profile renderer must resolve.");
        if (!renderer.m_Enabled) continue;
        const material = renderer.m_Materials[0] ?? null;
        const resetRootTransform = owner.instance.kind === "note-slide" ? "slide-play" : owner.instance.kind === "game-play-button";
        const emitterTransform = positionedHierarchyTransform(record.definition.transform, owner.particleSystemSetupScale,
          record.definition.parentTransforms.length === 0 && resetRootTransform);
        const parentTransforms = [...particleOwnerParents(owner.instance), ...record.definition.parentTransforms.map((parent, index) =>
          positionedHierarchyTransform(parent, parentSetupScale(record.definition, index, owner.particleSystemSetupScale), index === 0 && resetRootTransform))];
        const runtimeTransform = calculateNativeParticleRuntimeTransform(emitterTransform, parentTransforms, profile.system.scalingMode);
        const transformSize: Vector3 = resetRootTransform ? [...runtimeTransform.scalingModeScale]
          : particleSizeScale(record.definition, profile.system.scalingMode, owner.particleSystemSetupScale, resetRootTransform);
        const rendererWorldBounds = currentActualRendererBounds(record, profile, runtime.particles, runtimeTransform);
        const rendererSortDistanceBits = bits(calculateNativeParticleRendererSortDistance([
          particleFloat32FromBits(rendererWorldBounds.center.xBits)!,
          particleFloat32FromBits(rendererWorldBounds.center.yBits)!,
          particleFloat32FromBits(rendererWorldBounds.center.zBits)!,
        ], renderer.m_SortingFudge!));
        const simulationToWorld = Object.freeze([0, 4, 8].map((offset) => vectorBits([
          runtimeTransform.localToWorld[offset]!, runtimeTransform.localToWorld[offset + 1]!,
          runtimeTransform.localToWorld[offset + 2]!,
        ]))) as NonNullable<ParticleRenderSample["simulationToWorld"]>;
        for (const particle of runtime.particles) {
          const normalizedAge = normalizedParticleAge(particle.agePercent);
          let size: Vector3 = [...particle.baseSize];
          const sizeModule = getModule(record.bundle, profile, "SizeModule");
          if (sizeModule !== null) {
            const sizeRandom = particleSeedRatio((particle.randomSeed + 0x8D2C8431) >>> 0);
            if (sizeModule.separateAxes) {
              size = [
                multiply(size[0], Math.max(0, minMax(sizeModule.curve, normalizedAge, sizeRandom))),
                multiply(size[1], Math.max(0, minMax(sizeModule.y, normalizedAge, sizeRandom))),
                multiply(size[2], Math.max(0, minMax(sizeModule.z, normalizedAge, sizeRandom))),
              ];
            } else {
              const scale = Math.max(0, minMax(sizeModule.curve, normalizedAge, sizeRandom));
              size = size.map((value) => multiply(value, scale)) as Vector3;
            }
          }
          const sizeBeforeTransform = vectorBits(size);
          size = size.map((value, index) => multiply(value, transformSize[index]!)) as Vector3;
          let colorBytes: ColorBytes = [...particle.baseColor];
          const colorModule = getModule(record.bundle, profile, "ColorModule");
          if (colorModule !== null) {
            const sampled = lifetimeColorToBytes(
              colorModule.gradient,
              normalizedAge,
              particleSeedRatio((particle.randomSeed + 0x591BC05C) >>> 0),
            );
            colorBytes = colorBytes.map((value, index) => multiplyColorByte(value, sampled[index]!)) as ColorBytes;
          }
          const color = colorBytes.map((value) => divide(value, 255)) as Color4;
          const uv = getModule(record.bundle, profile, "UVModule");
          let uvFrame = 0;
          if (uv !== null) {
            uvFrame = textureSheetFrame(uv, normalizedAge, particle.randomSeed);
          }
          const custom = getModule(record.bundle, profile, "CustomDataModule");
          const customData0 = custom === null ? null : customData(custom, 0, normalizedAge, particle.randomSeed);
          const customData1 = custom === null ? null : customData(custom, 1, normalizedAge, particle.randomSeed);
          // Native local SoA is projected only after integration, using the
          // current system Transform. The sample position remains world-space.
          const worldPosition = calculateNativeParticleWorldPosition(emitterTransform, parentTransforms, profile.system.scalingMode, particle.position);
          samples.push(Object.freeze({
            particleId: particle.particleId,
            ownerKey: owner.ownerKey,
            instance: Object.freeze({ ...owner.instance }),
            root: owner.root,
            systemId: identity,
            sourceOrdinal: record.definition.sourceOrdinal!,
            ownerGeneration: owner.generation,
            ownerSortOrdinal: particleOwnerSortOrdinal(owner.instance),
            creationSequence: particle.creationSequence,
            position: vectorBits([...worldPosition]),
            nativeOwnerHierarchy: resetRootTransform !== false || owner.instance.kind === "game-clear",
            velocity: vectorBits([...applyNativeParticleMatrixVector(runtimeTransform.localToWorld, particle.renderVelocity)]),
            simulationVelocity: vectorBits(particle.renderVelocity),
            simulationToWorld,
            ...(rendererWorldBounds === undefined ? {} : { rendererWorldBounds }),
            size: vectorBits(size),
            sizeBeforeTransform,
            transformSize: vectorBits(transformSize),
            rotation: vectorBits(particle.rotation),
            color: colorBits(color),
            agePercentBits: bits(particle.agePercent),
            ageBits: bits(particle.age),
            lifetimeBits: bits(particle.lifetime),
            uvFrame,
            sortingOrder: renderer.m_SortingOrder,
            sortingLayerId: renderer.m_SortingLayerID!,
            sortingFudgeBits: bits(renderer.m_SortingFudge!),
            rendererSortDistanceBits,
            rendererPriority: renderer.m_RendererPriority!,
            renderMode: renderer.m_RenderMode,
            renderAlignment: renderer.m_RenderAlignment,
            material: material?.name ?? null,
            meshProfile: record.definition.meshProfile ?? null,
            customData0: customData0 === null ? null : vector4Bits(customData0),
            customData1: customData1 === null ? null : vector4Bits(customData1),
          }));
        }
      }
    }
    samples.sort((left, right) => left.sortingLayerId! - right.sortingLayerId! ||
      left.sortingOrder - right.sortingOrder ||
      particleFloat32FromBits(left.rendererSortDistanceBits!)! - particleFloat32FromBits(right.rendererSortDistanceBits!)! ||
      left.rendererPriority! - right.rendererPriority! ||
      left.ownerSortOrdinal! - right.ownerSortOrdinal! ||
      left.sourceOrdinal! - right.sourceOrdinal! ||
      left.creationSequence - right.creationSequence);
    return Object.freeze(samples);
  }

  randomStateSnapshot(): readonly ParticleRandomStateSnapshot[] {
    return Object.freeze([...this.instanceStates.values()]
      .sort((left, right) => left.ownerGeneration - right.ownerGeneration ||
        this.definitions.get(left.systemId)!.ordinal - this.definitions.get(right.systemId)!.ordinal ||
        compareOrdinal(left.ownerKey, right.ownerKey))
      .map((state) => Object.freeze({
        ownerKey: state.ownerKey,
        ownerGeneration: state.ownerGeneration,
        systemId: state.systemId,
        seed: state.seed,
        stateU32: Object.freeze([...state.stream]) as ParticleRandomStateU32,
        emissionStateU32: Object.freeze([...state.emissionStream]) as ParticleRandomStateU32,
        initialModuleStateU32: cloneSimdState(state.initialModuleStream),
        shapeModuleStateU32: cloneSimdState(state.shapeModuleStream),
        rateAccumulatorBits: bits(state.rateAccumulator),
        birthCount: state.birthCount,
      })));
  }

  private emitStep(
    bundle: ParticleBundleProfile,
    profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime,
    before: number,
    after: number,
    delta: number,
  ): EmissionBatch[] {
    const emission = getModule(bundle, profile, "EmissionModule");
    if (emission === null) return [];
    const state = this.instanceStates.get(runtime.instanceStateKey);
    if (state === undefined) {
      throw fault("particle.simulation.instance-random-state-missing", "Emission requires the concrete ParticleSystem random owner.");
    }
    const duration = f32(profile.system.lengthInSec);
    const result = nativeParticleEmissionStep(emission, before, after, duration, state);
    return result.count === 0 ? [] : [{ at: before, count: result.count, nativeTiming: { ...result, delta } }];
  }

  // Prewarm retains its separate scheduling path until the original deferred
  // and fixed-step Play branches have been closed independently.
  private events(
    bundle: ParticleBundleProfile,
    profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime,
    before: number,
    after: number,
    includeLowerBoundary: boolean,
  ): EmissionBatch[] {
    const emission = getModule(bundle, profile, "EmissionModule");
    if (emission === null) return [];
    const state = this.instanceStates.get(runtime.instanceStateKey);
    if (state === undefined) {
      throw fault("particle.simulation.instance-random-state-missing", "Emission requires the concrete ParticleSystem random owner.");
    }
    const drawWord = (): number => {
      const step = particleXorshift128(state.emissionStream);
      state.emissionStream = step.state;
      state.stream = step.state;
      return step.value;
    };
    const draw = (): number => particleWordRatio(drawWord());
    // 0x103DFE8 advances the runtime stream once on every emission pass,
    // before rate integration and any burst probability/count draws.
    const rateRandom = draw();
    const delay = minMax(profile.system.startDelay, 0, 0);
    const duration = f32(profile.system.lengthInSec);
    const firstLoop = Math.floor((before - delay) / duration) - 1;
    const lastLoopExclusive = Math.floor((after - delay) / duration) + 2;
    const counts = new Map<number, number>();
    const activeIntervals: Array<readonly [number, number]> = [];
    const append = (at: number, count: number): void => {
      if (count <= 0) return;
      counts.set(at, (counts.get(at) ?? 0) + count);
    };
    for (let loop = profile.system.looping ? firstLoop : 0;
      loop < (profile.system.looping ? lastLoopExclusive : 1);
      loop += 1) {
      const base = add(delay, multiply(loop, duration));
      const activeStart = Math.max(before, base);
      const activeEnd = Math.min(after, add(base, duration));
      if (activeEnd > activeStart) activeIntervals.push(Object.freeze([activeStart, activeEnd] as const));
      for (const burst of emission.m_Bursts) {
        for (let cycle = 0; cycle < burst.cycleCount; cycle += 1) {
          const at = add(add(base, burst.time), multiply(cycle, burst.repeatInterval));
          const lower = includeLowerBoundary ? at >= before : at > before;
          if (!lower || at >= after || at > add(base, duration)) continue;
          if (burst.probability < 1 && draw() >= burst.probability) continue;
          append(at, currentBurstCount(
            burst.countCurve,
            clamp01(divide(subtract(at, base), duration)),
            drawWord,
          ));
        }
      }
    }
    const rate = minMax(emission.rateOverTime, 0, rateRandom);
    if (rate > 0) {
      const interval = divide(1, rate);
      const initial = getModule(bundle, profile, "InitialModule");
      const boundedCandidates = initial?.maxNumParticles ?? 0;
      let emittedCandidates = 0;
      for (const [activeStart, activeEnd] of activeIntervals) {
        const activeDelta = subtract(activeEnd, activeStart);
        const previousAccumulator = state.rateAccumulator;
        const total = add(previousAccumulator, multiply(activeDelta, rate));
        const emitted = Math.max(0, Math.floor(total));
        const firstOffset = divide(subtract(1, previousAccumulator), rate);
        for (let index = 0; index < emitted && emittedCandidates < boundedCandidates; index += 1) {
          append(add(activeStart, add(firstOffset, multiply(index, interval))), 1);
          emittedCandidates += 1;
        }
        state.rateAccumulator = subtract(total, emitted);
      }
    }
    return [...counts].sort(([left], [right]) => left - right)
      .map(([at, count]) => Object.freeze({ at, count }));
  }

  private spawnBatch(
    owner: OwnerRuntime,
    record: SystemRecord,
    profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime,
    batch: EmissionBatch,
    frameEnd: number,
  ): void {
    const initial = getModule(record.bundle, profile, "InitialModule");
    if (initial === null) return;
    const state = this.instanceStates.get(runtime.instanceStateKey);
    if (state === undefined) {
      throw fault("particle.simulation.instance-random-state-missing", "Birth admission requires the concrete ParticleSystem random owner.");
    }
    const existingCount = runtime.particles.length;
    const admitted = Math.max(0, Math.min(batch.count, initial.maxNumParticles - existingCount));
    const shape = getModule(record.bundle, profile, "ShapeModule");
    const birthPhase = batch.nativeTiming === undefined ? 0
      : nativeParticleBirthPhase(frameEnd, profile.system.lengthInSec);
    for (let groupStart = 0; groupStart < admitted; groupStart += 4) {
      const initialRandom = particleSimdRandomValues(state.initialModuleStream, initialModuleRandomDrawCount(initial));
      state.initialModuleStream = initialRandom.state;
      const shapeRandom = particleSimdRandomValues(state.shapeModuleStream, shapeRandomDrawCount(shape));
      state.shapeModuleStream = shapeRandom.state;
      // 1090584/108C5B8 publish and initialize complete SIMD groups. Padding
      // participates in the newborn death scan before the admitted prefix.
      for (let lane = 0; lane < 4; lane += 1) {
        const sample = buildBirthRandomSample(initial, initialRandom, shapeRandom, lane);
        const batchIndex = groupStart + lane;
        this.spawn(
          owner,
          record,
          profile,
          runtime,
          birthPhase,
          batch.nativeTiming === undefined ? subtract(frameEnd, batch.at)
            : nativeParticleBirthAge(batch.nativeTiming, batch.nativeTiming.delta, batchIndex),
          batchIndex,
          admitted,
          sample,
          undefined,
          true,
        );
      }
    }
    removeExpiredNewbornParticles(runtime.particles, existingCount, admitted);
    compactParticleBirths(runtime.particles, existingCount);
  }

  private spawn(
    owner: OwnerRuntime,
    record: SystemRecord,
    profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime,
    birthPhase: number,
    initialAge: number,
    batchIndex: number,
    batchCount: number,
    random: BirthRandomSample,
    analytic?: AnalyticBirthState,
    paddedBirth = false,
  ): void {
    const initial = getModule(record.bundle, profile, "InitialModule");
    if (initial === null || (!paddedBirth && runtime.particles.length >= initial.maxNumParticles)) return;
    const instanceState = this.instanceStates.get(runtime.instanceStateKey);
    if (instanceState === undefined) {
      throw fault("particle.simulation.instance-random-state-missing", "Every concrete ParticleSystem instance must retain its own initialized native random state.");
    }
    const slots = random.slots;
    const [lifetime, inverseLifetime] = analytic === undefined
      ? nativeParticleLifetime(minMax(initial.startLifetime, birthPhase, slots[0]!))
      : [analytic.lifetime, analytic.inverseLifetime];
    const speed = minMax(initial.startSpeed, 0, slots[1]!);
    const sx = Math.max(0, minMax(initial.startSize, birthPhase, slots[2]!));
    const sy = initial.size3D ? Math.max(0, minMax(initial.startSizeY, birthPhase, slots[3]!)) : sx;
    const sz = initial.size3D ? Math.max(0, minMax(initial.startSizeZ, birthPhase, slots[4]!)) : sx;
    const baseColor = colorToBytes(minMaxColor(initial.startColor, birthPhase, slots[5]!));
    const rotation: Vector3 = [
      minMax(initial.startRotationX, birthPhase, slots[6]!),
      minMax(initial.startRotationY, birthPhase, slots[7]!),
      minMax(initial.startRotation, birthPhase, slots[8]!),
    ];
    if (analytic !== undefined) {
      const sign = particleSeedRatio((random.particleSeed + 0xFF2BB1A4) >>> 0) > initial.randomizeRotationDirection ? 1 : -1;
      for (let axis = 0; axis < 3; axis += 1) rotation[axis] = multiply(rotation[axis]!, sign);
    }
    const shape = getModule(record.bundle, profile, "ShapeModule");
    const birth = sampleShape(shape, random.shapeValues, batchIndex, batchCount);
    const position: Vector3 = birth.position;
    const velocity = birth.direction.map((value) => multiply(value, speed)) as Vector3;
    const particleSystemSetupScale = owner.particleSystemSetupScale;
    const resetRootTransform = owner.instance.kind === "note-slide" ? "slide-play" : owner.instance.kind === "game-play-button";
    const ownerParents = particleOwnerParents(owner.instance);
    const emitterTransform = positionedHierarchyTransform(record.definition.transform, particleSystemSetupScale,
      record.definition.parentTransforms.length === 0 && resetRootTransform);
    const parentTransforms = [...ownerParents, ...record.definition.parentTransforms.map((parent, index) =>
      positionedHierarchyTransform(parent, parentSetupScale(record.definition, index, particleSystemSetupScale), index === 0 && resetRootTransform))];
    const emitterOrigin = calculateNativeParticleEmitterOrigin(emitterTransform, parentTransforms, profile.system.scalingMode);
    instanceState.birthCount += 1;
    this.creationSequence += 1;
    const particle: SimulatedParticle = {
      particleId: `${owner.ownerKey}\u0000${owner.generation}\u0000${record.definition.identity}#${instanceState.birthCount}`,
      creationSequence: this.creationSequence,
      emitterOrigin: emitterOrigin.map(f32) as Vector3,
      particleSystemSetupScale,
      resetRootTransform,
      ownerParents,
      age: f32(0),
      agePercent: f32(0),
      lifetime,
      inverseLifetime,
      randomSeed: random.particleSeed,
      position: position.map(f32) as Vector3,
      velocity: velocity.map(f32) as Vector3,
      renderVelocity: velocity.map(f32) as Vector3,
      moduleVelocity: [0, 0, 0],
      baseSize: [sx, sy, sz],
      baseColor,
      rotation,
      slots,
    };
    runtime.particles.push(particle);
    if (analytic !== undefined) {
      // 10985B4..109860C, source zero gravity: retain the native zero additions.
      particle.position = addVector(addVector([0, 0, 0], scaleVector(particle.velocity, analytic.ageSeconds)), particle.position);
      particle.velocity = addVector([0, 0, 0], particle.velocity);
      particle.renderVelocity = [...particle.velocity];
      particle.age = analytic.ageSeconds;
      particle.agePercent = analytic.agePercent;
      this.rebuildAnalyticMotion(record, particle, initial);
    } else if (initialAge > 0) this.updateParticle(record, particle, f32(initialAge));
    void owner;
  }

  private rebuildAnalyticMotion(record: SystemRecord, particle: SimulatedParticle, initial: ParticleInitialModule): void {
    const profile = record.bundle.profiles[record.definition.profile]!;
    const age = Math.max(normalizedParticleAge(particle.agePercent), 0);
    const rotation = getModule(record.bundle, profile, "RotationModule");
    if (rotation !== null) {
      // 105614C: integrate before applying direction and refined lifetime.
      const random = particleSeedRatio((particle.randomSeed + 0x6AED452E) >>> 0);
      const sign = particleSeedRatio((particle.randomSeed + 0xFF2BB1A4) >>> 0) > initial.randomizeRotationDirection ? 1 : -1;
      const estimate = nativeParticleReciprocalEstimate(particle.inverseLifetime);
      const first = multiply(estimate, f32(2 - particle.inverseLifetime * estimate));
      const lifetime = multiply(first, f32(2 - particle.inverseLifetime * first));
      const curves = [rotation.x, rotation.y, rotation.curve];
      for (let axis = rotation.separateAxes ? 0 : 2; axis < 3; axis += 1) {
        const integral = nativeParticleAnalyticIntegral(curves[axis]!, age, random);
        particle.rotation[axis] = add(particle.rotation[axis]!, multiply(lifetime, multiply(integral, sign)));
      }
    }
    const velocity = getModule(record.bundle, profile, "VelocityModule");
    if (velocity !== null) {
      // 126F704: three sequential draws from the particle-seeded local tuple.
      let random = particleStateFromSeed((particle.randomSeed + 0xE0FBD834) >>> 0);
      const displacement: Vector3 = [0, 0, 0];
      const instant: Vector3 = [0, 0, 0];
      for (const [axis, value] of [velocity.x, velocity.y, velocity.z].entries()) {
        const step = particleXorshift128(random);
        random = step.state;
        const ratio = particleWordRatio(step.value);
        displacement[axis] = divide(nativeParticleAnalyticIntegral(value, age, ratio), particle.inverseLifetime);
        instant[axis] = minMax(value, age, ratio);
      }
      const transform = (value: Vector3): Vector3 => velocity.inWorldSpace
        ? [...applyNativeParticleWorldModuleVector(particleRuntimeTransform(record, particle.particleSystemSetupScale, particle.resetRootTransform, particle.ownerParents), value)] : value;
      particle.position = addVector(particle.position, transform(displacement));
      particle.moduleVelocity = addVector(transform(instant), particle.moduleVelocity);
      particle.renderVelocity = addVector(particle.velocity, particle.moduleVelocity);
    }
  }

  private updateParticle(
    record: SystemRecord,
    particle: SimulatedParticle,
    delta: number,
  ): void {
    const { bundle, definition } = record;
    const profile = bundle.profiles[definition.profile]!;
    const initial = getModule(bundle, profile, "InitialModule");
    if (initial === null) throw fault("particle.simulation.missing-initial-module", "Every emitted current particle requires InitialModule.");
    const normalizedAge = normalizedParticleAge(particle.agePercent);

    // 0x109669C phase 1: Initial/gravity owner.
    const gravity = minMax(initial.gravityModifier, normalizedAge, particle.slots[9]!);
    const runtimeTransform = particleRuntimeTransform(record, particle.particleSystemSetupScale, particle.resetRootTransform, particle.ownerParents);
    // 105FBF0 returns zero gravity for scalar0; 10612C4 modes0/1 then
    // skip accumulation entirely, preserving signed-zero base velocities.
    if (initial.gravityModifier.scalar !== 0 || initial.gravityModifier.minMaxState > 1) {
      const gravityStep = multiply(gravity, delta);
      const localGravity = applyNativeParticleMatrixVector(runtimeTransform.worldToLocal, [
        multiply(gravityStep, 0), multiply(gravityStep, -9.81), multiply(gravityStep, 0),
      ]);
      particle.velocity = addVector([...localGravity], particle.velocity);
    }

    // 0x109669C phase 2: RotationModule.
    const angularVelocity: Vector3 = [0, 0, 0];
    const rotation = getModule(bundle, profile, "RotationModule");
    if (rotation !== null) {
      const rotationRandom = particleSeedRatio((particle.randomSeed + 0x6AED452E) >>> 0);
      // 1055940 signs angular velocity before 108AF6C multiplies it by delta.
      const rotationDirection = particleSeedRatio((particle.randomSeed + 0xFF2BB1A4) >>> 0) > initial.randomizeRotationDirection ? 1 : -1;
      const rotationRate = (value: ParticleMinMaxCurve): number =>
        multiply(minMax(value, normalizedAge, rotationRandom), rotationDirection);
      if (rotation.separateAxes) {
        angularVelocity[0] = add(angularVelocity[0], rotationRate(rotation.x));
        angularVelocity[1] = add(angularVelocity[1], rotationRate(rotation.y));
      }
      angularVelocity[2] = add(angularVelocity[2], rotationRate(rotation.curve));
    }

    // 0x109669C phase 3: VelocityModule.
    const velocity = getModule(bundle, profile, "VelocityModule");
    let moduleVelocity: Vector3 = [0, 0, 0];
    let speedModifier = f32(1);
    if (velocity !== null) {
      moduleVelocity = [
        minMax(velocity.x, normalizedAge, particle.slots[9]!),
        minMax(velocity.y, normalizedAge, particle.slots[10]!),
        minMax(velocity.z, normalizedAge, particle.slots[11]!),
      ];
      const offset: Vector3 = [
        minMax(velocity.orbitalOffsetX, normalizedAge, particle.slots[6]!),
        minMax(velocity.orbitalOffsetY, normalizedAge, particle.slots[7]!),
        minMax(velocity.orbitalOffsetZ, normalizedAge, particle.slots[8]!),
      ];
      const angular: Vector3 = [
        minMax(velocity.orbitalX, normalizedAge, particle.slots[6]!),
        minMax(velocity.orbitalY, normalizedAge, particle.slots[7]!),
        minMax(velocity.orbitalZ, normalizedAge, particle.slots[8]!),
      ];
      if (velocity.inWorldSpace) {
        moduleVelocity = [...applyNativeParticleWorldModuleVector(runtimeTransform, moduleVelocity)];
      }
      // 126D318 passes literal module-space flag0 to 107DAC4 for orbital
      // motion. Source local simulation keeps it local even when linear
      // velocity uses inWorldSpace; orbital offsets are local points too.
      const relative = subtractVector(particle.position, offset);
      speedModifier = minMax(velocity.speedModifier, normalizedAge, particle.slots[4]!);
      const scaledDelta = multiply(delta, speedModifier);
      const orbitalStep = scaleVector(angular, scaledDelta);
      const rotatedRelative = rotateEulerRadians(relative, orbitalStep);
      // 1271598/127278C: divide displacement by speed, then multiply the
      // refined inverse delta. Tiny deltas do not contribute orbital velocity.
      let inverseDelta = f32(0);
      if (delta > f32(0.000001)) {
        const estimate = nativeParticleReciprocalEstimate(delta);
        const first = multiply(estimate, f32(2 - delta * estimate));
        inverseDelta = multiply(first, f32(2 - delta * first));
      }
      const radialAmount = minMax(velocity.radial, normalizedAge, particle.slots[5]!);
      const radial = scaleVector(normalizeOrZero(rotatedRelative), multiply(scaledDelta, radialAmount));
      const displacement = subtractVector(addVector(rotatedRelative, radial), relative);
      const orbital = displacement.map((value) => multiply(
        Math.abs(speedModifier) > f32(0.000000001) ? divide(value, speedModifier) : 0,
        inverseDelta,
      )) as Vector3;
      moduleVelocity = addVector(orbital, moduleVelocity);
    }

    // 0x109669C phase 4: ordinary 103FB08 accumulates force*delta directly
    // into base velocity. Analytic Force reconstruction is a separate path.
    const force = getModule(bundle, profile, "ForceModule");
    if (force !== null) {
      let acceleration: Vector3 = [
        minMax(force.x, normalizedAge, particle.slots[9]!),
        minMax(force.y, normalizedAge, particle.slots[10]!),
        minMax(force.z, normalizedAge, particle.slots[11]!),
      ];
      if (force.inWorldSpace) acceleration = [...applyNativeParticleWorldModuleVector(runtimeTransform, acceleration)];
      particle.velocity = particle.velocity.map((value, index) =>
        add(value, multiply(acceleration[index]!, delta))) as Vector3;
    }

    // 0x109669C phase 5: ClampVelocityModule.
    let combinedVelocity = addVector(particle.velocity, moduleVelocity);
    const clamp = getModule(bundle, profile, "ClampVelocityModule");
    if (clamp !== null && (clamp.dampen > 0 || clamp.drag.scalar !== 0)) {
      if (!clamp.inWorldSpace || !clamp.separateAxis) {
        combinedVelocity = limitVelocity(combinedVelocity, clamp, normalizedAge, particle.slots, delta, particle.baseSize);
      } else {
        const worldVelocity = applyNativeParticleMatrixVector(runtimeTransform.localToWorld, combinedVelocity);
        combinedVelocity = [...applyNativeParticleMatrixVector(runtimeTransform.worldToLocal,
          limitVelocity([...worldVelocity], clamp, normalizedAge, particle.slots, delta, particle.baseSize))];
      }
      // 104C0F8 persists the limited base velocity; 108AF6C then recombines
      // the two streams before integration, retaining both F32 roundings.
      particle.velocity = subtractVector(combinedVelocity, moduleVelocity);
      combinedVelocity = addVector(particle.velocity, moduleVelocity);
    }
    const effectiveVelocity = scaleVector(combinedVelocity, speedModifier);
    particle.moduleVelocity = moduleVelocity;
    particle.renderVelocity = effectiveVelocity;

    // 0x109669C phase 6: RotationBySpeedModule observes clamped velocity.
    const bySpeed = getModule(bundle, profile, "RotationBySpeedModule");
    if (bySpeed !== null) {
      const speed = vectorLength(effectiveVelocity);
      const lower = bySpeed.range.x;
      const upper = bySpeed.range.y;
      const normalizedSpeed = upper !== lower
        ? clamp01(divide(subtract(speed, lower), subtract(upper, lower)))
        : 0;
      const random = particleSeedRatio((particle.randomSeed + 0xDEC4AEA1) >>> 0);
      const direction = particleSeedRatio((particle.randomSeed + 0xFF2BB1A4) >>> 0) > initial.randomizeRotationDirection ? 1 : -1;
      const curves = [bySpeed.x, bySpeed.y, bySpeed.curve];
      for (let axis = bySpeed.separateAxes ? 0 : 2; axis < 3; axis += 1) {
        angularVelocity[axis] = add(angularVelocity[axis]!, multiply(minMax(curves[axis]!, normalizedSpeed, random), direction));
      }
    }

    // 0x108AF6C integration follows the complete module pipeline.
    if (rotation !== null || bySpeed !== null) {
      for (let axis = rotation?.separateAxes || bySpeed?.separateAxes ? 0 : 2; axis < 3; axis += 1) {
        particle.rotation[axis] = add(particle.rotation[axis]!, multiply(angularVelocity[axis]!, delta));
      }
    }
    particle.position = particle.position.map((value, index) =>
      add(value, multiply(effectiveVelocity[index]!, delta))) as Vector3;
    particle.age = add(particle.age, delta);
    particle.agePercent = advanceParticleAge(particle.agePercent, particle.inverseLifetime, delta);
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
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "VelocityModule"): ParticleVelocityModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "ForceModule"): ParticleForceModule | null;
function getModule(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, name: "CustomDataModule"): ParticleCustomDataModule | null;
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

function curve(
  value: ParticleAnimationCurve,
  time: number,
  scalar: number,
  cached = textureSheetCurveCacheable(value),
): number {
  // BND-C47: source unweighted clamp curves; cache scaling precedes evaluation.
  const keys = value.m_Curve;
  if (keys.length === 0) return 0;
  const t = f32(time);
  if (keys.length === 1) return multiply(keys[0]!.value, scalar);
  if (cached) {
    const second = keys.length > 2 && Math.min(t, f32(0.9999899864196777)) >= keys[1]!.time;
    const left = keys[second ? 1 : 0]!;
    const right = keys[second ? 2 : 1]!;
    const coefficients = textureSheetCurveCoefficients(left, right).map((coefficient) => multiply(coefficient, scalar));
    return textureSheetCurvePolynomial(coefficients, second ? subtract(t, left.time) : t);
  }
  if (t < keys[0]!.time) return multiply(keys[0]!.value, scalar);
  if (t >= keys[keys.length - 1]!.time) return multiply(keys[keys.length - 1]!.value, scalar);
  let index = 0;
  while (index + 1 < keys.length - 1 && t >= keys[index + 1]!.time) index += 1;
  const left = keys[index]!;
  return multiply(textureSheetCurvePolynomial(textureSheetCurveCoefficients(left, keys[index + 1]!), subtract(t, left.time)), scalar);
}

function nativeParticleReciprocalEstimate(value: number): number {
  const word = uint32Bits(value);
  const exponent = ((word >>> 23) & 0xFF) - 127;
  const bucket = 256 + ((word >>> 15) & 0xFF);
  // BND-C45: original FRECPE outputs for positive normal lifetime values.
  return f32(Math.round(262144 / (2 * bucket + 1)) * 2 ** (-exponent - 9));
}

function nativeParticleLifetime(sampled: number, minimum = f32(1e-5)): readonly [number, number] {
  const lifetime = Math.max(f32(sampled), minimum);
  const estimate = nativeParticleReciprocalEstimate(lifetime);
  // FRECPS rounds 2-a*b once; rounding the product separately changes it.
  const first = multiply(estimate, f32(2 - lifetime * estimate));
  return [lifetime, multiply(first, f32(2 - lifetime * first))];
}

function nativeParticleBirthPhase(after: number, duration: number): number {
  // BND-C61: normal InitialModule receives the step-end phase; source durations
  // are positive normal Float32 values. Analytic reconstruction is separate.
  const length = f32(duration);
  const estimate = nativeParticleReciprocalEstimate(length);
  const first = multiply(estimate, f32(2 - length * estimate));
  return multiply(multiply(first, f32(2 - length * first)), after);
}

function advanceParticleAge(agePercent: number, inverseLifetime: number, delta: number): number {
  // Current source ringBufferMode=0. Already expired rows retain their age.
  if (agePercent > 100) return agePercent;
  return Math.min(add(agePercent, multiply(multiply(delta, 100), inverseLifetime)), f32(100.00000762939453));
}

function normalizedParticleAge(agePercent: number): number {
  return multiply(agePercent, f32(0.01));
}

function particleIsAlive(agePercent: number): boolean {
  return !(agePercent > 100);
}

function removeExpiredNewbornParticles(particles: SimulatedParticle[], existingCount: number, admitted: number): void {
  // BND-C205: 108CCE0 scans ascending newborn rows, including SIMD padding.
  // Each removal swaps the physical tail and rechecks this index. The native
  // admitted counter saturates at zero; only that surviving prefix publishes.
  let index = existingCount;
  while (index < particles.length) {
    if (particles[index]!.agePercent <= 100) {
      index += 1;
      continue;
    }
    const last = particles.pop()!;
    if (index < particles.length) particles[index] = last;
    if (admitted > 0) admitted -= 1;
  }
  particles.length = existingCount + admitted;
}

function compactParticleBirths(particles: SimulatedParticle[], existingCount: number): void {
  // BND-C48: native births start at the next four-row boundary. The finalizer
  // fills that alignment gap from the last birth rows before publishing count.
  const copiedCount = Math.min((4 - existingCount % 4) % 4, particles.length - existingCount);
  if (copiedCount === 0) return;
  const copied = particles.splice(particles.length - copiedCount, copiedCount);
  particles.splice(existingCount, 0, ...copied);
}

function nativeParticleSystemClock(
  runtime: Pick<OwnerSystemRuntime, "elapsed" | "delayRemaining" | "cycleCount" | "emissionStopped">,
  delta: number,
  duration: number,
  looping: boolean,
  frameElapsed: number,
): { readonly before: number; readonly after: number; readonly delta: number | null } {
  let before = Math.min(runtime.elapsed, f32(duration));
  if (delta >= duration) before = add(before, 0.000001);
  if (runtime.delayRemaining < delta) {
    runtime.elapsed = add(runtime.elapsed, subtract(delta, runtime.delayRemaining));
    if (looping) {
      while (runtime.elapsed >= duration) {
        runtime.elapsed = subtract(runtime.elapsed, duration);
        runtime.cycleCount = (runtime.cycleCount + 1) >>> 0;
      }
    } else {
      runtime.elapsed = Math.min(runtime.elapsed, f32(duration));
    }
  }
  if (!looping && runtime.elapsed >= duration) runtime.emissionStopped = true;
  const after = runtime.elapsed;
  if (runtime.emissionStopped) return { before, after, delta: null };
  let emissionDelta = delta;
  if (frameElapsed === 0 && runtime.delayRemaining > 0) {
    const remaining = subtract(runtime.delayRemaining, delta);
    runtime.delayRemaining = Math.max(remaining, 0);
    if (remaining > 0) return { before, after, delta: null };
    emissionDelta = -remaining;
  }
  return { before, after, delta: emissionDelta > 0 ? emissionDelta : null };
}

function nativeParticleEmissionStep(
  emission: ParticleEmissionModule,
  before: number,
  after: number,
  duration: number,
  state: Pick<InstanceSystemState, "emissionStream" | "stream" | "rateAccumulator" | "burstFraction">,
): ParticleEmissionStep {
  const drawWord = (): number => {
    const step = particleXorshift128(state.emissionStream);
    state.emissionStream = step.state;
    state.stream = step.state;
    return step.value;
  };
  const rateRandom = particleWordRatio(drawWord());
  const start = Math.max(f32(before), 0);
  const end = Math.max(f32(after), 0);
  let integratedRate = f32(0);
  if (emission.rateOverTime.scalar > 0) {
    let segmentEnd = end;
    if (end < start) {
      integratedRate = add(multiply(end,
        Math.max(minMax(emission.rateOverTime, divide(end, duration), rateRandom), 0)), 0);
      segmentEnd = f32(duration);
    }
    integratedRate = add(integratedRate, multiply(subtract(segmentEnd, start),
      Math.max(minMax(emission.rateOverTime, divide(segmentEnd, duration), rateRandom), 0)));
  }
  const bursts = (from: number, to: number, repeat: boolean): number => {
    let count = 0;
    for (const burst of emission.m_Bursts) {
      let matched = burst.time >= from && burst.time < to;
      if (!matched && repeat && burst.time < from && burst.cycleCount !== 1) {
        const previousCycle = divide(subtract(from, burst.time), burst.repeatInterval);
        if (burst.cycleCount === 0 || previousCycle < burst.cycleCount - 1) {
          matched = Math.trunc(divide(subtract(to, burst.time), burst.repeatInterval)) > Math.trunc(previousCycle);
        }
      }
      if (!matched) continue;
      if (burst.probability !== 0 &&
        (burst.probability >= 1 || particleWordRatio(drawWord()) < burst.probability)) {
        count += currentBurstCount(burst.countCurve, divide(to, duration), drawWord);
      }
      const offset = divide(subtract(burst.time, from), subtract(to, from));
      state.burstFraction = offset >= 0 ? subtract(1, Math.min(offset, 1)) : f32(1);
    }
    return count;
  };
  const burstCount = end < start
    ? bursts(0, end, true) + bursts(start, add(duration, 0.0001), false)
    : bursts(start, end, true);
  const totalRate = add(integratedRate, state.rateAccumulator);
  const rateCount = Math.trunc(totalRate);
  state.rateAccumulator = subtract(totalRate, f32(rateCount));
  return {
    count: burstCount + rateCount,
    rateCount,
    inverseRate: integratedRate >= f32(0.0001) ? divide(1, integratedRate) : f32(1),
    rateRemainder: state.rateAccumulator,
    burstFraction: state.burstFraction,
  };
}

function nativeParticleBirthAge(emission: ParticleEmissionStep, delta: number, index: number): number {
  const fraction = index < emission.rateCount
    ? multiply(add(emission.rateRemainder, f32(index)), emission.inverseRate)
    : emission.burstFraction;
  return subtract(multiply(delta, Math.min(Math.max(fraction, f32(0.000001)), 1)), 0);
}

function nativeParticleAnalyticPrewarmQueue(
  bundle: ParticleBundleProfile, profile: ParticleProfileDefinition, initial: ParticleInitialModule,
  runtime: OwnerSystemRuntime, state: InstanceSystemState,
): AnalyticEmissionRecord[] {
  // BND-C55/C67: fixed-step flags3 age queue records before each emission pass.
  const prepared = nativeParticlePrewarmPreparation(profile.system, initial.startLifetime);
  runtime.elapsed = prepared.phase;
  runtime.remainingDelta = add(runtime.remainingDelta, multiply(prepared.delta, Math.max(f32(profile.system.simulationSpeed), 0)));
  const fixed = f32(0.02);
  const frameElapsed = runtime.elapsed;
  const queue: AnalyticEmissionRecord[] = [];
  const emission = getModule(bundle, profile, "EmissionModule");
  let previousStep = fixed;
  let queuedCount = 0;
  while (runtime.remainingDelta >= previousStep) {
    let step = Math.min(runtime.remainingDelta, fixed);
    if (runtime.remainingDelta > 10) step = previousStep <= 1 ? Math.min(f32(profile.system.lengthInSec), 1) : previousStep;
    else if (runtime.remainingDelta > 5) step = previousStep <= f32(0.2) ? Math.min(f32(profile.system.lengthInSec), f32(0.2)) : previousStep;
    const timing = nativeParticleSystemClock(runtime, step, profile.system.lengthInSec, true, frameElapsed);
    for (const entry of queue) entry.age = add(step, entry.age);
    if (emission !== null && timing.delta !== null && timing.delta > 0) {
      const result = nativeParticleEmissionStep(emission, timing.before, timing.after, profile.system.lengthInSec, state);
      const admitted = Math.min(result.count, Math.max(0, initial.maxNumParticles - queuedCount));
      if (admitted > 0) {
        const dropped = result.count - admitted;
        const retainedRate = Math.max(result.rateCount - dropped, 0);
        const bursts = admitted - retainedRate + (dropped >= result.rateCount ? result.rateCount : 0);
        const fields = { phase: timing.after, rateRemainder: result.rateRemainder, rateInterval: multiply(result.inverseRate, timing.delta) };
        if (bursts !== 0) queue.push({ ...fields, age: timing.delta, count: bursts, rateCount: 0 });
        if (dropped < result.rateCount) queue.push({ ...fields, age: 0, count: retainedRate, rateCount: retainedRate });
        queuedCount += bursts + retainedRate;
      }
    }
    runtime.remainingDelta = subtract(runtime.remainingDelta, step);
    previousStep = step;
  }
  return queue;
}

function nativeParticleFrameSteps(
  delta: number,
  speed: number,
  duration: number,
  runtime: Pick<OwnerSystemRuntime, "remainingDelta">,
): number[] {
  // 0x1089CE4 / 0x108C534 / 0x1097B30, normal-frame flags 0.
  const effectiveDelta = multiply(delta, Math.max(f32(speed), 0));
  const maximumStep = f32(0.03); // Source TimeManager.maximumParticleDeltaTime.
  const baseStep = effectiveDelta > maximumStep
    ? divide(effectiveDelta, Math.ceil(divide(effectiveDelta, maximumStep)))
    : effectiveDelta;
  if (baseStep < f32(0.00001)) return [];
  runtime.remainingDelta = add(runtime.remainingDelta, effectiveDelta);
  const steps: number[] = [];
  let previousStep = baseStep;
  while (runtime.remainingDelta >= f32(0.000001)) {
    let step = Math.min(runtime.remainingDelta, baseStep);
    if (runtime.remainingDelta > 10) {
      step = previousStep <= 1 ? Math.min(f32(duration), 1) : previousStep;
    } else if (runtime.remainingDelta > 5) {
      step = previousStep <= f32(0.2) ? Math.min(f32(duration), f32(0.2)) : previousStep;
    }
    steps.push(step);
    runtime.remainingDelta = subtract(runtime.remainingDelta, step);
    previousStep = step;
  }
  return steps;
}

function nativeParticlePrewarmPreparation(
  system: ParticleProfileDefinition["system"],
  lifetime: ParticleMinMaxCurve,
): { delta: number; phase: number } {
  // 0x108EC04, Play time 0; all current source lifetimes use mode 0 or 3.
  let maximumLifetime = lifetime.minMaxState === 3
    ? Math.max(f32(lifetime.minScalar), f32(lifetime.scalar)) : Math.max(f32(lifetime.scalar), 0);
  const duration = f32(system.lengthInSec);
  if (maximumLifetime === Infinity) maximumLifetime = duration;
  maximumLifetime = Math.max(maximumLifetime, 0); // No enabled source subemitters.
  let start = subtract(0, maximumLifetime);
  if (start < 0) start = add(start, multiply(duration, f32(Math.ceil(divide(-start, duration)))));
  return {
    delta: divide(maximumLifetime, Math.max(f32(system.simulationSpeed), f32(0.001))),
    phase: f32(start % duration),
  };
}

function nativeParticleIntegralCurveEligible(value: ParticleAnimationCurve): boolean {
  // 0xEF8B6C counts the cache segments after adding missing domain endpoints.
  const keys = value.m_Curve;
  if (keys.length === 0) return true;
  let segments = keys.length;
  if (keys[0]!.time === 0) segments -= 1;
  else if (value.m_PreInfinity < 2) return false;
  if (keys[keys.length - 1]!.time !== 1) {
    if (value.m_PostInfinity < 2) return false;
    segments += 1;
  }
  return segments < 9;
}

function nativeParticleIntegralMinMaxEligible(value: ParticleMinMaxCurve): boolean {
  return value.minMaxState === 0 || value.minMaxState === 3 ||
    (nativeParticleIntegralCurveEligible(value.maxCurve) &&
      (value.minMaxState !== 2 || nativeParticleIntegralCurveEligible(value.minCurve)));
}

function nativeParticleAnalyticMotionCacheable(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition): boolean {
  const cached = (value: ParticleMinMaxCurve): boolean => value.minMaxState === 0 || value.minMaxState === 3 ||
    (textureSheetCurveCacheable(value.maxCurve) && (value.minMaxState !== 2 || textureSheetCurveCacheable(value.minCurve)));
  const rotation = getModule(bundle, profile, "RotationModule");
  const velocity = getModule(bundle, profile, "VelocityModule");
  return (rotation === null || [rotation.curve, ...(rotation.separateAxes ? [rotation.x, rotation.y] : [])].every(cached)) &&
    (velocity === null || [velocity.x, velocity.y, velocity.z].every(cached));
}

function nativeParticleAnalyticIntegral(value: ParticleMinMaxCurve, age: number, ratio: number): number {
  if (value.minMaxState === 0 || value.minMaxState === 3) return multiply(age, minMax(value, age, ratio));
  const integral = (curve: ParticleAnimationCurve): number => {
    const keys = curve.m_Curve;
    const split = keys.length > 2 ? f32(keys[1]!.time) : f32(1);
    const segment = (second: boolean, time: number): number => {
      const index = second && keys.length > 2 ? 1 : 0;
      const coefficients = keys.length < 2 ? [0, 0, 0, f32(keys[0]?.value ?? 0)]
        : textureSheetCurveCoefficients(keys[index]!, keys[index + 1]!);
      // EF7FE4 scales cached cubic coefficients by 1/4,1/3,1/2,1.
      const integrated = coefficients.map((coefficient, axis) =>
        multiply(multiply(coefficient, value.scalar), [0.25, ONE_THIRD, 0.5, 1][axis]!));
      return multiply(time, textureSheetCurvePolynomial(integrated, time));
    };
    return add(segment(false, Math.min(age, split)), segment(true, Math.max(subtract(age, split), 0)));
  };
  const maximum = integral(value.maxCurve);
  return lerp(value.minMaxState === 2 ? integral(value.minCurve) : maximum, maximum, ratio);
}

function nativeParticlePrewarmAnalyticEligible(bundle: ParticleBundleProfile, profile: ParticleProfileDefinition): boolean {
  // 0x108E6CC over the current source module domain. ExternalForces, Collision,
  // Noise, Trigger, SubEmitters and Trails are disabled in all source prewarms.
  if (profile.system.moveWithTransform !== 0 || profile.system.stopAction !== 0 ||
    getModule(bundle, profile, "ClampVelocityModule") !== null ||
    getModule(bundle, profile, "RotationBySpeedModule") !== null) return false;
  const emission = getModule(bundle, profile, "EmissionModule");
  if (emission !== null && emission.rateOverDistance.scalar !== 0) return false;
  const initial = getModule(bundle, profile, "InitialModule");
  if (initial !== null && (initial.gravityModifier.minMaxState !== 0 || initial.startLifetime.scalar === Infinity)) return false;
  const shape = getModule(bundle, profile, "ShapeModule");
  if (shape !== null && (shape.type === 4 || shape.type === 8 || shape.type === 10) && shape.arc.mode !== 0) return false;
  const rotation = getModule(bundle, profile, "RotationModule");
  if (rotation !== null && (!nativeParticleIntegralMinMaxEligible(rotation.curve) ||
    (rotation.separateAxes && (!nativeParticleIntegralMinMaxEligible(rotation.x) || !nativeParticleIntegralMinMaxEligible(rotation.y))))) return false;
  const velocity = getModule(bundle, profile, "VelocityModule");
  if (velocity !== null && (![velocity.x, velocity.y, velocity.z].every(nativeParticleIntegralMinMaxEligible) ||
    [velocity.orbitalX, velocity.orbitalY, velocity.orbitalZ, velocity.radial].some((value) => value.scalar !== 0))) return false;
  const force = getModule(bundle, profile, "ForceModule");
  return force === null || (!force.randomizePerFrame && [force.x, force.y, force.z].every(nativeParticleIntegralMinMaxEligible));
}

function currentActualRendererBounds(
  record: SystemRecord, profile: ParticleProfileDefinition, particles: readonly SimulatedParticle[],
  transform: ParticleRuntimeTransform,
): NonNullable<ParticleRenderSample["rendererWorldBounds"]> {
  // BND-C181/C182 include the game-clear source domain in the same native branches.
  const initial = getModule(record.bundle, profile, "InitialModule");
  if (initial === null) throw fault("particle.bounds.initial-module", "Actual bounds require their source InitialModule size curves.");
  const analytic = nativeParticlePrewarmAnalyticEligible(record.bundle, profile);
  const shape = getModule(record.bundle, profile, "ShapeModule");
  const force = getModule(record.bundle, profile, "ForceModule");
  const velocity = getModule(record.bundle, profile, "VelocityModule");
  // C151/SORT-01: every analytic-eligible source in the registered union is
  // covered by these native branches. Bounds are required by renderer sorting.
  const renderer = record.bundle.rendererProfiles[profile.renderer]!;
  const size = getModule(record.bundle, profile, "SizeModule");
  const mesh = record.definition.meshProfile == null ? undefined : record.bundle.meshProfiles?.[record.definition.meshProfile];
  const meshBounds = mesh === undefined ? undefined : getNativeParticleMeshBounds(mesh.serializedSha256);
  if (renderer.m_RenderMode === 4 && meshBounds === undefined) {
    throw fault("particle.bounds.mesh-cache", "Mesh bounds require the exact source Mesh.localAABB cache.");
  }
  const settings = {
    renderMode: renderer.m_RenderMode,
    velocityScale: renderer.m_VelocityScale,
    lengthScale: renderer.m_LengthScale,
    pivot: [renderer.m_Pivot.x, renderer.m_Pivot.y, renderer.m_Pivot.z] as const,
    meshBounds: meshBounds ?? null,
    size3D: initial.size3D || size?.separateAxes === true,
    startSize: [initial.startSize, initial.startSizeY, initial.startSizeZ] as const,
    sizeLifetime: size === null ? null : [size.curve, size.y, size.z] as const,
    sizeBySpeed: null, // Disabled in the complete registered gameplay source union.
    runtimeSize: 0, // Fresh reset; this API admits no EmitParams/SetParticles size overrides.
    simulationSpace: profile.system.moveWithTransform,
    scale: transform.scalingModeScale,
    translation: [transform.localToWorld[12]!, transform.localToWorld[13]!, transform.localToWorld[14]!] as const,
  };
  const boundsVelocity = velocity === null ? null : {
    axes: [velocity.x, velocity.y, velocity.z] as const,
    inWorldSpace: velocity.inWorldSpace,
    worldToLocal: transform.worldToLocal,
  };
  const bounds = analytic ? shape === null
    ? calculateNativeParticleLinearAnalyticBounds(initial.startLifetime, initial.startSpeed, initial.size3D, settings,
      force === null ? null : [force.x, force.y, force.z], boundsVelocity)
    // C81 selector0/scalingMode0/1 prepares runtime336 as unit, separately from348.
    : calculateNativeParticleShapeAnalyticBounds(initial.startLifetime, initial.startSpeed, initial.size3D, shape, [1, 1, 1], settings, boundsVelocity)
    : calculateNativeParticleActualBounds(particles, settings);
  const world = calculateNativeParticleWorldBounds(bounds, transform.localToWorld, transform.scalingModeScale,
    profile.system.moveWithTransform, renderer.m_RenderAlignment);
  return Object.freeze({ center: vectorBits([world[0], world[1], world[2]]), extents: vectorBits([world[3], world[4], world[5]]) });
}

function removeExpiredParticles(particles: SimulatedParticle[]): void {
  let first = 0;
  while (first < particles.length) {
    // BND-C46: capture a four-row mask before any swap, then remove high to low.
    let mask = 0;
    for (let lane = 0; lane < 4 && first + lane < particles.length; lane += 1) {
      const particle = particles[first + lane]!;
      if (!particleIsAlive(particle.agePercent)) mask |= 1 << lane;
    }
    if (mask === 0) {
      first += 4;
      continue;
    }
    for (let lane = 3; lane >= 0; lane -= 1) {
      if ((mask & (1 << lane)) === 0) continue;
      const index = first + lane;
      const last = particles.pop()!;
      if (index < particles.length) particles[index] = last;
    }
    // Copied tail rows must be checked again at this same group boundary.
  }
}

function textureSheetFrame(uv: ParticleUvModule, normalizedAge: number, seed: number): number {
  const random = particleSeedRatio((seed + 0x13740583) >>> 0);
  const phase = textureSheetPhase(normalizedAge, uv.cycles);
  const frame = uv.frameOverTime.minMaxState === 1
    ? textureSheetCurve(uv.frameOverTime, phase)
    : minMax(uv.frameOverTime, phase, random);
  const start = minMax(uv.startFrame, normalizedAge, random);
  return textureSheetFrameIndex(start, frame, uv.tilesX * uv.tilesY);
}

function textureSheetPhase(normalizedAge: number, cycles: number): number {
  const time = multiply(cycles, Math.max(f32(normalizedAge), 0));
  return subtract(time, Math.floor(time) || 0);
}

function textureSheetCurveCacheable(value: ParticleAnimationCurve): boolean {
  const keys = value.m_Curve;
  if (keys.length > 3) return false;
  if (keys.length < 2) return true;
  const previous = keys[keys.length - 2]!;
  const last = keys[keys.length - 1]!;
  if (Math.abs(subtract(previous.value, last.value)) > f32(1e-9) &&
    (typeof previous.outSlope !== "number" || typeof last.inSlope !== "number")) return false;
  return keys.every((key) => key.weightedMode === 0) &&
    Math.abs(keys[0]!.time) <= f32(0.0001) && Math.abs(subtract(last.time, 1)) <= f32(0.0001);
}

function textureSheetCurveCoefficients(
  left: ParticleAnimationCurve["m_Curve"][number],
  right: ParticleAnimationCurve["m_Curve"][number],
): readonly [number, number, number, number] {
  if (left.outSlope === "number:+infinity" || right.inSlope === "number:+infinity") {
    return [0, 0, 0, f32(left.value)];
  }
  if (left.outSlope === "number:-infinity" || right.inSlope === "number:-infinity") {
    return [0, 0, 0, f32(right.value)];
  }
  const difference = subtract(right.value, left.value);
  const width = Math.max(subtract(right.time, left.time), f32(0.0001));
  const inverse = divide(1, width);
  const square = multiply(inverse, inverse);
  const outgoing = multiply(left.outSlope, width);
  const incoming = multiply(width, right.inSlope);
  const cubic = subtract(subtract(add(outgoing, incoming), difference), difference);
  const quadratic = subtract(subtract(subtract(add(difference, add(difference, difference)), outgoing), outgoing), incoming);
  return [multiply(inverse, multiply(square, cubic)), multiply(square, quadratic), f32(left.outSlope), f32(left.value)];
}

function textureSheetCurvePolynomial(coefficients: readonly number[], time: number): number {
  return add(coefficients[3]!, multiply(time,
    add(coefficients[2]!, multiply(time, add(coefficients[1]!, multiply(time, coefficients[0]!)))),
  ));
}

function textureSheetCurve(value: ParticleMinMaxCurve, time: number): number {
  // BND-C44: the registered UV curves are unweighted and clamp outside their keys.
  // Fast caches scale coefficients before Horner evaluation; general curves scale after it.
  const keys = value.maxCurve.m_Curve;
  if (keys.length === 0) return 0;
  if (keys.length === 1) return multiply(keys[0]!.value, value.scalar);
  if (textureSheetCurveCacheable(value.maxCurve)) {
    const second = keys.length > 2 && Math.min(time, f32(0.9999899864196777)) >= keys[1]!.time;
    const left = keys[second ? 1 : 0]!;
    const right = keys[second ? 2 : 1]!;
    const coefficients = textureSheetCurveCoefficients(left, right).map((coefficient) => multiply(coefficient, value.scalar));
    return textureSheetCurvePolynomial(coefficients, second ? subtract(time, left.time) : time);
  }
  if (time < keys[0]!.time) return multiply(keys[0]!.value, value.scalar);
  if (time >= keys[keys.length - 1]!.time) return multiply(keys[keys.length - 1]!.value, value.scalar);
  let index = 0;
  while (index + 1 < keys.length - 1 && time >= keys[index + 1]!.time) index += 1;
  const left = keys[index]!;
  return multiply(textureSheetCurvePolynomial(textureSheetCurveCoefficients(left, keys[index + 1]!), subtract(time, left.time)), value.scalar);
}

function textureSheetFrameIndex(start: number, frame: number, tileCount: number): number {
  // BND-C43: wrap the Float32 sum before scaling to the integer frame cell.
  const sum = add(start, frame);
  const whole = Math.floor(sum) || 0;
  const normalized = subtract(sum, whole);
  return Math.trunc(multiply(normalized, tileCount)) || 0;
}

function minMax(value: ParticleMinMaxCurve, time: number, ratio: number): number {
  switch (value.minMaxState) {
    case 0: return f32(value.scalar);
    case 1: return curve(value.maxCurve, time, value.scalar);
    case 2: {
      // Both curves use scalar, and either failed cache forces both general paths.
      const cached = textureSheetCurveCacheable(value.maxCurve) && textureSheetCurveCacheable(value.minCurve);
      return lerp(curve(value.minCurve, time, value.scalar, cached), curve(value.maxCurve, time, value.scalar, cached), ratio);
    }
    case 3: return lerp(value.minScalar, value.scalar, ratio);
    default: throw fault("particle.simulation.unsupported-curve-state", "Only current MinMaxCurve states 0..3 are portable.");
  }
}

function gradient(value: ParticleMinMaxGradient["maxGradient"], time: number): Color4 {
  // BND-C58: native retains the fractional Float32 time coordinate.
  const t16 = multiply(time, 65535);
  const channel = (
    prefix: "c" | "a",
    component: "r" | "g" | "b" | "a",
    count: number,
  ): number => {
    if (count < 2) return 1;
    const times = Array.from({ length: count }, (_, index) =>
      value[`${prefix}time${index}` as keyof typeof value] as number);
    const values = Array.from({ length: count }, (_, index) =>
      (value[`key${index}` as keyof typeof value] as unknown as { readonly [key: string]: number })[component]!);
    const coordinate = Math.min(Math.max(t16, times[0]!), times[count - 1]!);
    let index = value.m_Mode === 1 ? 0 : 1;
    while (index < count - 1 && coordinate > times[index]!) index += 1;
    if (value.m_Mode === 1) return f32(values[index]!);
    const weight = Math.min(divide(subtract(coordinate, times[index - 1]!),
      Math.max(subtract(times[index]!, times[index - 1]!), f32(1e-6))), 1);
    return add(values[index - 1]!, multiply(subtract(values[index]!, values[index - 1]!), weight));
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

function colorToBytes(color: Color4): ColorBytes {
  // BND-C57: native FMUL/FADD round separately before FCVTZS truncates.
  return color.map((value) => Math.trunc(add(multiply(clamp01(value), 255), 0.5))) as ColorBytes;
}

function nativeParticleGradientCache(value: ParticleMinMaxGradient["maxGradient"]): ParticleGradientCache {
  const existing = particleGradientCaches.get(value);
  if (existing !== undefined) return existing;
  // BND-C59: color times multiply a rounded reciprocal; alpha times divide.
  const unit = float32FromBits(0x37800080);
  const times = [
    ...Array.from({ length: value.m_NumColorKeys }, (_, index) =>
      multiply(value[`ctime${index}` as keyof typeof value] as number, unit)),
    ...Array.from({ length: value.m_NumAlphaKeys }, (_, index) =>
      divide(value[`atime${index}` as keyof typeof value] as number, 65535)),
  ].filter((time, index, all) => all.indexOf(time) === index)
    .map((time) => value.m_Mode === 1 ? subtract(time, unit) : time)
    .sort((left, right) => left - right);
  if (times.length < 16) times.push(1);
  else times[times.length - 1] = 1;
  const colors = times.map((time) => colorToBytes(gradient(value, time)));
  const inverses = times.map((time, index) => {
    if (index === 0) return 0;
    const width = Math.max(subtract(time, times[index - 1]!), f32(1e-6));
    const estimate = nativeParticleReciprocalEstimate(width);
    const first = multiply(estimate, f32(2 - width * estimate));
    return multiply(first, f32(2 - width * first));
  });
  const cache = { mode: value.m_Mode, times, colors, inverses };
  particleGradientCaches.set(value, cache);
  return cache;
}

function sampleParticleGradientCache(cache: ParticleGradientCache, time: number): ColorBytes {
  const coordinate = f32(time);
  const { times, colors, inverses } = cache;
  if (coordinate > times[times.length - 1]!) return [255, 255, 255, 255];
  let index = cache.mode === 1 ? 0 : 1;
  while (index < times.length - 1 && coordinate >= times[index]!) index += 1;
  if (index >= times.length) return [255, 255, 255, 255];
  if (cache.mode === 1) return [...colors[index]!];
  // Native clamps the time difference before multiplying the cached reciprocal.
  const weight = Math.trunc(multiply(multiply(clamp01(subtract(coordinate, times[index - 1]!)), inverses[index]!), 255));
  return colors[index - 1]!.map((left, channel) =>
    (left + ((128 + weight * (colors[index]![channel]! - left)) >> 8)) & 255) as ColorBytes;
}

function lifetimeColorToBytes(value: ParticleMinMaxGradient, time: number, ratio: number): ColorBytes {
  if (value.minMaxState === 1) return sampleParticleGradientCache(nativeParticleGradientCache(value.maxGradient), time);
  if (value.minMaxState === 3) {
    // BND-C60: interpolate the two sampled Color32 caches with an integer weight.
    const minimum = sampleParticleGradientCache(nativeParticleGradientCache(value.minGradient), time);
    const maximum = sampleParticleGradientCache(nativeParticleGradientCache(value.maxGradient), time);
    const weight = Math.trunc(multiply(ratio, 255));
    return minimum.map((left, channel) =>
      (left + ((128 + weight * (maximum[channel]! - left)) >> 8)) & 255) as ColorBytes;
  }
  return colorToBytes(minMaxColor(value, time, ratio));
}

function multiplyColorByte(left: number, right: number): number {
  const product = left * right + 128;
  return (product + (product >>> 8)) >>> 8;
}

function nativeSinCos(radians: number): readonly [number, number] {
  const turns = multiply(radians, INVERSE_TWO_PI);
  const evaluate = (phase: number): number => {
    const sign = uint32Bits(phase) & 0x80000000;
    const magic = float32FromBits(sign | 0x4B000000);
    const nearestInteger = subtract(add(phase, magic), magic);
    const quarterWave = subtract(0.25, Math.abs(subtract(phase, nearestInteger)));
    const square = multiply(quarterWave, quarterWave);
    const fourth = multiply(square, square);
    const eighth = multiply(fourth, fourth);
    return multiply(quarterWave, add(
      multiply(eighth, TRIG_POLY_4),
      add(
        subtract(TRIG_POLY_TWO_PI, multiply(square, TRIG_POLY_1)),
        multiply(fourth, subtract(TRIG_POLY_2, multiply(square, TRIG_POLY_3))),
      ),
    ));
  };
  return Object.freeze([
    evaluate(turns),
    evaluate(add(turns, -0.25)),
  ] as const);
}

function nativeCubeRoot(value: number): number {
  const sourceBits = uint32Bits(value);
  const mantissa = add(float32FromBits((sourceBits & 0x807FFFFF) | 0x3F800000), -1);
  const square = multiply(mantissa, mantissa);
  const exponent = f32((sourceBits >>> 23) - 127);
  // BND-C66, 12393DC..1239408: exponent and linear term are rounded first.
  const log2Approximation = add(
    add(exponent, multiply(mantissa, CUBE_LOG_LINEAR)),
    multiply(square, add(multiply(mantissa, CUBE_LOG_CUBIC), CUBE_LOG_QUADRATIC)),
  );
  const divided = Math.max(-127, multiply(log2Approximation, ONE_THIRD));
  const truncated = Math.trunc(divided);
  const integral = truncated - (truncated > divided ? 1 : 0);
  const fraction = subtract(divided, integral);
  const exponential = add(
    multiply(multiply(fraction, fraction), CUBE_EXP_QUADRATIC),
    add(multiply(fraction, CUBE_EXP_LINEAR), 1),
  );
  return multiply(exponential, float32FromBits((0x3F800000 + (integral << 23)) >>> 0));
}

function initialModuleRandomDrawCount(initial: ParticleInitialModule): number {
  // 0x105FD50: particle seed, lifetime, size[X,(Y,Z)], rotation[Z,(X,Y)], color.
  // startSpeed is sampled from the stored per-particle seed in the following
  // 0x1091C7C initialization phase and does not advance InitialModule SIMD state.
  return 5 + (initial.size3D ? 2 : 0) + (initial.rotation3D ? 2 : 0);
}

function shapeRandomDrawCount(shape: ParticleShapeModule | null): number {
  if (shape === null) return 0;
  let count: number;
  switch (shape.type) {
    case 0: count = 3; break;
    case 4: count = shape.arc.mode === 3 ? 1 : 2; break;
    case 5: count = 3; break;
    case 8: count = shape.arc.mode === 3 ? 2 : 3; break;
    case 10: count = shape.arc.mode === 3 ? 1 : 2; break;
    default: throw fault("particle.simulation.unsupported-shape", "Current native semantic profiles admit only Shape types 0, 4, 5, 8 and 10.");
  }
  if (shape.randomDirectionAmount > 0) count += 2;
  if (shape.randomPositionAmount > 0) count += 2;
  return count;
}

function buildBirthRandomSample(
  initial: ParticleInitialModule,
  initialRandom: ParticleSimdDraws,
  shapeRandom: ParticleSimdDraws,
  lane: number,
): BirthRandomSample {
  let cursor = 0;
  const next = (): number => initialRandom.values[cursor++]![lane]!;
  const nextWord = (): number => initialRandom.words[cursor++]![lane]!;
  const particleSeed = nextWord();
  const lifetime = next();
  const sizeX = next();
  const sizeY = initial.size3D ? next() : sizeX;
  const sizeZ = initial.size3D ? next() : sizeX;
  const rotationZ = next();
  const rotationX = initial.rotation3D ? next() : 0;
  const rotationY = initial.rotation3D ? next() : 0;
  const color = next();
  if (cursor !== initialModuleRandomDrawCount(initial)) {
    throw fault("particle.simulation.initial-random-schedule", "InitialModule random draw ownership must consume its exact current branch schedule.");
  }
  const seeded = (salt: number): number => particleSeedRatio((particleSeed + salt) >>> 0);
  return Object.freeze({
    particleSeed,
    slots: Object.freeze([
      lifetime, seeded(0x96AA4DE3), sizeX, sizeY, sizeZ, color, rotationX, rotationY, rotationZ,
      seeded(0xE2B7C3C3), seeded(0xBA821F34), seeded(0x12460F3B),
    ]),
    shapeValues: Object.freeze(shapeRandom.values.map((row) => row[lane]!)),
  });
}

function sampleShape(
  shape: ParticleShapeModule | null,
  values: readonly number[],
  batchIndex: number,
  batchCount: number,
): { readonly position: Vector3; readonly direction: Vector3 } {
  if (shape === null) return Object.freeze({ position: [0, 0, 0], direction: [0, 0, 1] });
  let cursor = 0;
  const next = (): number => {
    const value = values[cursor];
    if (value === undefined) {
      throw fault("particle.simulation.shape-random-schedule", "Shape branch consumed more random values than its current native schedule owns.");
    }
    cursor += 1;
    return value;
  };
  const arcAngle = (): number => {
    const spreadDenominator = shape.arc.value === 360
      ? batchCount
      : (batchCount === 1 ? 1 : batchCount - 1);
    const ratio = shape.arc.mode === 3
      ? (spreadDenominator > 0 ? f32(batchIndex / spreadDenominator) : 0)
      : next();
    return multiply(multiply(shape.arc.value, DEG_TO_RAD), ratio);
  };
  const radius = f32(shape.radius.value);
  const inner = clamp01(subtract(1, shape.radiusThickness));
  let position: Vector3;
  let direction: Vector3;
  switch (shape.type) {
    case 0: {
      const theta = multiply(TWO_PI, next());
      const [cosine, sine] = nativeSinCos(theta);
      const z = subtract(multiply(2, next()), 1);
      const radial = f32(Math.sqrt(Math.max(0, subtract(1, multiply(z, z)))));
      direction = [multiply(radial, cosine), multiply(radial, sine), z];
      const innerCubed = multiply(multiply(inner, inner), inner);
      const radiusDraw = next();
      const radiusRatio = nativeCubeRoot(add(multiply(innerCubed, radiusDraw), subtract(1, radiusDraw)));
      position = scaleVector(direction, multiply(radius, radiusRatio));
      break;
    }
    case 4: {
      const theta = arcAngle();
      const [cosine, sine] = nativeSinCos(theta);
      const radiusDraw = next();
      const radial = f32(Math.sqrt(add(
        multiply(Math.max(inner, 0.001), radiusDraw),
        subtract(1, radiusDraw),
      )));
      const radialX = multiply(radial, cosine);
      const radialY = multiply(radial, sine);
      const angle = multiply(shape.angle, DEG_TO_RAD);
      const [cosAngle, sinAngle] = nativeSinCos(angle);
      position = [multiply(radius, radialX), multiply(radius, radialY), 0];
      direction = [
        multiply(sinAngle, radialX),
        multiply(sinAngle, radialY),
        cosAngle,
      ];
      break;
    }
    case 5:
      position = [subtract(next(), 0.5), subtract(next(), 0.5), subtract(next(), 0.5)];
      direction = [0, 0, 1];
      break;
    case 8: {
      const theta = arcAngle();
      const [cosine, sine] = nativeSinCos(theta);
      const radiusDraw = next();
      const radial = f32(Math.sqrt(add(
        multiply(Math.max(inner, 0.001), radiusDraw),
        subtract(1, radiusDraw),
      )));
      const radialX = multiply(radial, cosine);
      const radialY = multiply(radial, sine);
      const angle = multiply(shape.angle, DEG_TO_RAD);
      const [cosAngle, sinAngle] = nativeSinCos(angle);
      direction = [
        multiply(sinAngle, radialX),
        multiply(sinAngle, radialY),
        cosAngle,
      ];
      position = addVector(
        [multiply(radius, radialX), multiply(radius, radialY), 0],
        scaleVector(normalizeOrFallback(direction), multiply(shape.length, next())),
      );
      break;
    }
    case 10: {
      const theta = arcAngle();
      const [cosine, sine] = nativeSinCos(theta);
      const innerSquared = multiply(inner, inner);
      const radial = multiply(radius, f32(Math.sqrt(add(innerSquared, multiply(subtract(1, innerSquared), next())))));
      position = [multiply(radial, cosine), multiply(radial, sine), 0];
      direction = [cosine, sine, 0];
      break;
    }
    default:
      throw fault("particle.simulation.unsupported-shape", "Current native semantic profiles admit only Shape types 0, 4, 5, 8 and 10.");
  }
  direction = nativeShapeDirection(direction);
  if (shape.randomDirectionAmount > 0) {
    const randomTheta = multiply(TWO_PI, next());
    const randomZ = subtract(multiply(2, next()), 1);
    const randomRadial = f32(Math.sqrt(Math.max(0, subtract(1, multiply(randomZ, randomZ)))));
    const [randomCosine, randomSine] = nativeSinCos(randomTheta);
    const randomDirection: Vector3 = [
      multiply(randomRadial, randomCosine),
      multiply(randomRadial, randomSine),
      randomZ,
    ];
    direction = direction.map((value, index) =>
      lerp(value, randomDirection[index]!, shape.randomDirectionAmount)) as Vector3;
  }
  if (shape.sphericalDirectionAmount > 0) {
    const radialDirection = nativeShapeDirection(position);
    direction = direction.map((value, index) =>
      lerp(value, radialDirection[index]!, shape.sphericalDirectionAmount)) as Vector3;
  }
  if (shape.randomPositionAmount > 0) {
    const randomTheta = multiply(TWO_PI, next());
    const randomZ = subtract(multiply(2, next()), 1);
    const randomRadial = f32(Math.sqrt(Math.max(0, subtract(1, multiply(randomZ, randomZ)))));
    const [randomCosine, randomSine] = nativeSinCos(randomTheta);
    const randomPosition: Vector3 = [
      multiply(randomRadial, randomCosine),
      multiply(randomRadial, randomSine),
      randomZ,
    ];
    position = addVector(position, scaleVector(randomPosition, shape.randomPositionAmount));
  }
  if (cursor !== values.length) {
    throw fault("particle.simulation.shape-random-schedule", "Shape branch must consume every random value assigned by its current native schedule.");
  }
  const matrix = nativeShapeMatrix(shape);
  position = nativeShapeMatrixVector(matrix, position, true);
  direction = nativeShapeMatrixVector(matrix, direction, false);
  return Object.freeze({ position, direction: nativeShapeDirection(direction) });
}

function nativeShapeMatrix(shape: ParticleShapeModule): readonly [Vector3, Vector3, Vector3, Vector3] {
  // BND-C65: 12357F0 constructs a ZXY quaternion from half angles, then
  // multiplies the separately rounded matrix columns by Shape scale.
  const [cx, sx] = nativeSinCos(multiply(multiply(shape.m_Rotation.x, DEG_TO_RAD), 0.5));
  const [cy, sy] = nativeSinCos(multiply(multiply(shape.m_Rotation.y, DEG_TO_RAD), 0.5));
  const [cz, sz] = nativeSinCos(multiply(multiply(shape.m_Rotation.z, DEG_TO_RAD), 0.5));
  const products = [multiply(cz, sx), multiply(sx, sz), multiply(cx, sz), multiply(cx, cz)];
  const firstSigns = [1, -1, 1, 1];
  const secondSigns = [1, 1, -1, 1];
  const q = products.map((value, index) => add(
    multiply(firstSigns[index]!, multiply(value, cy)),
    multiply(multiply(secondSigns[index]!, sy), products[(index + 2) % 4]!),
  ));
  const reversed = [q[1]!, q[0]!, q[3]!, q[2]!];
  const halfSwap = [q[2]!, q[3]!, q[0]!, q[1]!];
  const reversedHalf = [q[3]!, q[2]!, q[1]!, q[0]!];
  const column = (left: readonly number[], leftSigns: readonly number[], leftValue: number,
    right: readonly number[], rightSigns: readonly number[], rightValue: number,
    axis: number, scale: number): Vector3 => [0, 1, 2].map((index) => multiply(add(add(
      multiply(left[index]!, multiply(leftSigns[index]!, leftValue)),
      multiply(right[index]!, multiply(rightSigns[index]!, rightValue)),
    ), index === axis ? 1 : 0), scale)) as Vector3;
  return [
    column(reversed, [-2, 2, -2], q[1]!, halfSwap, [-2, 2, 2], q[2]!, 0, shape.m_Scale.x),
    column(reversedHalf, [-2, -2, 2], q[2]!, reversed, [2, -2, 2], q[0]!, 1, shape.m_Scale.y),
    column(halfSwap, [2, -2, -2], q[0]!, reversedHalf, [2, 2, -2], q[1]!, 2, shape.m_Scale.z),
    [f32(shape.m_Position.x), f32(shape.m_Position.y), f32(shape.m_Position.z)],
  ];
}

function nativeShapeMatrixVector(
  matrix: readonly [Vector3, Vector3, Vector3, Vector3], vector: Vector3, position: boolean,
): Vector3 {
  // 1241914: position translation joins the Z term before Y and X.
  return [0, 1, 2].map((index) => {
    const z = multiply(matrix[2][index]!, vector[2]);
    return add(multiply(matrix[0][index]!, vector[0]), add(
      multiply(matrix[1][index]!, vector[1]), position ? add(z, matrix[3][index]!) : z,
    ));
  }) as Vector3;
}

function customData(
  module: ParticleCustomDataModule,
  stream: 0 | 1,
  time: number,
  particleSeed: number,
): Color4 | null {
  const mode = stream === 0 ? module.mode0 : module.mode1;
  if (mode === 0) return null;
  if (mode === 2) {
    return minMaxColor(
      stream === 0 ? module.color0 : module.color1,
      time,
      particleSeedRatio((particleSeed + ((4 * stream) | 0x73A7F7BB)) >>> 0),
    );
  }
  if (mode !== 1) {
    throw fault("particle.simulation.unsupported-custom-data-mode", "Current CustomData streams admit only disabled, vector and color modes.");
  }
  const count = stream === 0 ? module.vectorComponentCount0 : module.vectorComponentCount1;
  const curves = stream === 0
    ? [module.vector0_0, module.vector0_1, module.vector0_2, module.vector0_3]
    : [module.vector1_0, module.vector1_1, module.vector1_2, module.vector1_3];
  return curves.map((value, index) => index < count
    ? minMax(
        value!,
        time,
        particleSeedRatio((particleSeed + (((4 * stream) | 0x73A7F7BB) + index)) >>> 0),
      )
    : 0) as Color4;
}

function limitVelocity(
  velocity: Vector3,
  module: ParticleClampVelocityModule,
  time: number,
  slots: readonly number[],
  delta: number,
  size: Vector3,
): Vector3 {
  let result: Vector3 = [...velocity];
  const dampen = module.dampen > 0
    ? subtract(1, f32(Math.pow(subtract(1, module.dampen), multiply(Math.abs(delta), 30))))
    : 0;
  if (module.separateAxis) {
    const limits = [
      minMax(module.x, time, slots[9]!),
      minMax(module.y, time, slots[10]!),
      minMax(module.z, time, slots[11]!),
    ];
    result = result.map((value, index) => {
      const limit = Math.max(0, limits[index]!);
      if (Math.abs(value) <= limit) return value;
      return lerp(value, Math.sign(value) * limit, dampen);
    }) as Vector3;
  } else if (module.dampen > 0) {
    const speed = vectorLength(result);
    const limit = minMax(module.magnitude, time, slots[10]!);
    const magnitude = speed > limit ? lerp(speed, limit, dampen) : speed;
    // 104C2B0..104C354 normalizes even below the limit, using the same
    // twice-refined estimate as Shape but a zero-vector threshold result.
    const direction: Vector3 = vectorLengthSquared(result) > SHAPE_DIRECTION_EPSILON_SQUARED
      ? nativeShapeDirection(result) : [0, 0, 0];
    result = scaleVector(direction, multiply(magnitude, speed > 0 ? 1 : 0));
  }
  let drag = Math.max(0, minMax(module.drag, time, slots[11]!));
  if (module.multiplyDragByParticleSize) drag = multiply(drag, Math.max(size[0], size[1], size[2]));
  if (module.multiplyDragByParticleVelocity) drag = multiply(drag, vectorLength(result));
  if (drag > 0) result = scaleVector(result, Math.max(0, subtract(1, multiply(drag, delta))));
  return result;
}

function parentSetupScale(
  definition: ParticleSystemDefinition,
  parentIndex: number,
  gameplayTransformScale: ParticleSetupScale,
): ParticleSetupScale {
  const flags = definition.parentParticleSystemFlags;
  return flags === undefined || flags[parentIndex] === true ? gameplayTransformScale : 1;
}

function particleOwnerParents(instance: ParticleInstanceIdentity): readonly ParticleHierarchyPositionTransform[] {
  if (instance.kind === "note-slide") {
    const owner = instance.ownerTransform;
    if (owner === undefined || (owner.source !== "original-note-slide" && owner.source !== "product-extension-note-slide") ||
      [owner.position.zBits, owner.rotation.xBits, owner.rotation.yBits, owner.rotation.zBits].some((value) => value !== "0x00000000") ||
      owner.rotation.wBits !== "0x3F800000" || owner.scale.yBits !== owner.scale.xBits || owner.scale.zBits !== owner.scale.xBits) {
      throw fault("particle.simulation.slide-owner-hierarchy", "Slide particles require their NoteSlide owner with identity rotation, uniform scale and world Z zero.");
    }
    const x = particleFloat32FromBits(owner.position.xBits), y = particleFloat32FromBits(owner.position.yBits);
    const scale = particleFloat32FromBits(owner.scale.xBits);
    if (x === null || y === null || scale === null || scale <= 0) {
      throw fault("particle.simulation.slide-owner-hierarchy", "NoteSlide owner position and positive scale must be finite binary32.");
    }
    // BND-C195: GamePlay -> NoteParentTrans -> NoteSlide. Parent scale belongs
    // in the runtime matrix, including Local-mode emitter-origin evaluation.
    return [
      { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      { position: [x, y, 0], rotation: [0, 0, 0, 1], scale: [scale, scale, scale] },
    ];
  }
  if (instance.kind === "game-clear") {
    const owner = instance.ownerTransform;
    if (owner === undefined || owner.source !== "game-clear-ui-root" ||
      [owner.position.xBits, owner.position.yBits, owner.position.zBits,
        owner.rotation.xBits, owner.rotation.yBits, owner.rotation.zBits].some((value) => value !== "0x00000000") ||
      owner.rotation.wBits !== "0x3F800000" || owner.scale.yBits !== owner.scale.xBits || owner.scale.zBits !== owner.scale.xBits) {
      throw fault("particle.simulation.game-clear-owner-hierarchy", "Game-clear requires its centered UI_Root with identity rotation and uniform scale.");
    }
    const scale = particleFloat32FromBits(owner.scale.xBits);
    if (scale === null || scale <= 0) {
      throw fault("particle.simulation.game-clear-owner-hierarchy", "UI_Root scale must be positive finite binary32.");
    }
    // BND-C184/C186: GamePlay -> UI_Root -> Animator precedes each clear branch.
    // Local scaling mode applies this scale to emitter origins within the matrix.
    return [
      { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [scale, scale, scale] },
      { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    ];
  }
  if (instance.kind !== "game-play-button") return [];
  const owner = instance.ownerTransform;
  if (owner === undefined || owner.source !== "game-play-button") {
    throw fault("particle.simulation.button-owner-hierarchy", "Button particles require their explicit gameplay owner.");
  }
  const read = (value: string): number => {
    const decoded = particleFloat32FromBits(value);
    if (decoded === null) throw fault("particle.simulation.button-owner-hierarchy", "Button owner fields must be finite binary32.");
    return decoded;
  };
  const position = [read(owner.position.xBits), read(owner.position.yBits), read(owner.position.zBits)];
  const rotation = [read(owner.rotation.xBits), read(owner.rotation.yBits), read(owner.rotation.zBits), read(owner.rotation.wBits)];
  const scale = [read(owner.scale.xBits), read(owner.scale.yBits), read(owner.scale.zBits)];
  if (position[2] !== 0 || rotation.some((value, index) => value !== (index === 3 ? 1 : 0)) || scale.some((value) => value !== 1)) {
    throw fault("particle.simulation.button-owner-hierarchy", "Current button owners retain identity rotation, unit scale and world Z zero.");
  }
  // BND-C176/C177: GamePlay -> MusicObjects -> Button. Preserve both Z
  // translations: collapsing +15 and -15 before child evaluation changes F32.
  return [
    { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    { position: [0, 0, -15], rotation: [-0, -0, -0, 1], scale: [1, 1, 1] },
    { position: [position[0]!, position[1]!, 15], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  ];
}

function particleRuntimeTransform(
  record: SystemRecord,
  setupScale: ParticleSetupScale,
  resetRootTransform: ParticleRootTransformReset = false,
  ownerParents: readonly ParticleHierarchyPositionTransform[] = [],
): ParticleRuntimeTransform {
  const { definition } = record;
  return calculateNativeParticleRuntimeTransform(
    positionedHierarchyTransform(definition.transform, setupScale, definition.parentTransforms.length === 0 && resetRootTransform),
    [...ownerParents, ...definition.parentTransforms.map((parent, index) =>
      positionedHierarchyTransform(parent, parentSetupScale(definition, index, setupScale), index === 0 && resetRootTransform))],
    record.bundle.profiles[definition.profile]!.system.scalingMode,
  );
}

function positionedHierarchyTransform(transform: ParticleTransformProfile, setupScale: ParticleSetupScale, resetRootTransform: ParticleRootTransformReset = false) {
  return {
    ...hierarchyTransform(transform, setupScale, resetRootTransform),
    // BND-C174/C193: instantiate and Slide Play both reset only the prefab root.
    position: (resetRootTransform ? [0, 0, 0]
      : [f32(transform.m_LocalPosition.x), f32(transform.m_LocalPosition.y), f32(transform.m_LocalPosition.z)]) as Vector3,
  };
}

function particleSizeScale(
  definition: ParticleSystemDefinition,
  scalingMode: 0 | 1,
  gameplayTransformScale: ParticleSetupScale,
  resetRootTransform: ParticleRootTransformReset = false,
): Vector3 {
  const self = hierarchyTransform(definition.transform, gameplayTransformScale, definition.parentTransforms.length === 0 && resetRootTransform);
  if (scalingMode === 1) return [...self.scale];
  const parents = definition.parentTransforms.map((parent, index) =>
    hierarchyTransform(parent, parentSetupScale(definition, index, gameplayTransformScale), index === 0 && resetRootTransform));
  return [...calculateNativeParticleHierarchyScale(self, parents)];
}

function hierarchyTransform(transform: ParticleTransformProfile, setupScale: ParticleSetupScale, resetRootTransform: ParticleRootTransformReset = false): ParticleHierarchyTransform {
  const rotation = transform.m_LocalRotation;
  const scale = transform.m_LocalScale;
  return {
    rotation: [f32(rotation.x), f32(rotation.y), f32(rotation.z), f32(rotation.w)],
    scale: resetRootTransform === "slide-play" ? [1, 1, 1]
      : applyNativeParticleSetupScale(resetRootTransform ? [1, 1, 1] : [scale.x, scale.y, scale.z], setupScale),
  };
}

function rotateEulerRadians(vector: Vector3, rotation: Vector3): Vector3 {
  const [x, y, z] = rotation;
  let result: Vector3 = [...vector];
  if (x !== 0) {
    const [cosine, sine] = nativeSinCos(x);
    result = [result[0], subtract(multiply(result[1], cosine), multiply(result[2], sine)), add(multiply(result[1], sine), multiply(result[2], cosine))];
  }
  if (y !== 0) {
    const [cosine, sine] = nativeSinCos(y);
    result = [add(multiply(result[0], cosine), multiply(result[2], sine)), result[1], subtract(multiply(result[2], cosine), multiply(result[0], sine))];
  }
  if (z !== 0) {
    const [cosine, sine] = nativeSinCos(z);
    result = [subtract(multiply(result[0], cosine), multiply(result[1], sine)), add(multiply(result[0], sine), multiply(result[1], cosine)), result[2]];
  }
  return result;
}

function addVector(left: Vector3, right: Vector3): Vector3 {
  return left.map((value, index) => add(value, right[index]!)) as Vector3;
}
function subtractVector(left: Vector3, right: Vector3): Vector3 {
  return left.map((value, index) => subtract(value, right[index]!)) as Vector3;
}
function scaleVector(vector: Vector3, scalar: number): Vector3 {
  return vector.map((value) => multiply(value, scalar)) as Vector3;
}
function vectorLengthSquared(vector: Vector3): number {
  return add(multiply(vector[0], vector[0]), add(multiply(vector[1], vector[1]), multiply(vector[2], vector[2])));
}
function vectorLength(vector: Vector3): number {
  return f32(Math.sqrt(Math.max(0, vectorLengthSquared(vector))));
}
function normalizeOrZero(vector: Vector3): Vector3 {
  const squared = vectorLengthSquared(vector);
  if (!(squared > SHAPE_DIRECTION_EPSILON_SQUARED)) return [0, 0, 0];
  return scaleVector(vector, divide(1, f32(Math.sqrt(squared))));
}
function normalizeOrFallback(vector: Vector3): Vector3 {
  // BND-C64: source cone-volume directions are nonzero and use two refinements.
  return nativeShapeDirection(vector);
}
function nativeShapeReciprocalSqrtEstimate(value: number): number {
  const word = uint32Bits(value);
  const exponent = ((word >>> 23) & 0xFF) - 127;
  const halfExponent = Math.floor(exponent / 2);
  const index = (exponent - halfExponent * 2) * 256 + ((word & 0x7FFFFF) >>> 15);
  return float32FromBits(particleReciprocalSqrtEstimates.estimateBits[index]! - halfExponent * 0x800000);
}
function nativeShapeDirection(vector: Vector3): Vector3 {
  const squared = vectorLengthSquared(vector);
  if (!(squared > SHAPE_DIRECTION_EPSILON_SQUARED)) return [0, 0, 1];
  let inverse = nativeShapeReciprocalSqrtEstimate(squared);
  // BND-C62: FRSQRTS rounds (3-a*b)/2 once, after the separate FMUL.
  inverse = multiply(inverse, f32((3 - multiply(squared, inverse) * inverse) / 2));
  inverse = multiply(inverse, f32((3 - multiply(squared, inverse) * inverse) / 2));
  return scaleVector(vector, inverse);
}
function currentBurstCount(
  value: ParticleMinMaxCurve,
  time: number,
  drawWord: () => number,
): number {
  if (value.minMaxState === 3) {
    const minimum = Math.trunc(Math.min(value.minScalar, value.scalar));
    const maximum = Math.trunc(Math.max(value.minScalar, value.scalar));
    const range = maximum - minimum + 1;
    return Math.max(0, minimum + (range > 0 ? drawWord() % range : 0));
  }
  const ratio = value.minMaxState === 2 ? particleWordRatio(drawWord()) : 0;
  return Math.max(0, Math.trunc(minMax(value, time, ratio)));
}

function cloneSimdState(state: ParticleRandomSimdState): ParticleRandomSimdState {
  return Object.freeze(state.map((lane) => Object.freeze([...lane]) as ParticleRandomStateU32)) as ParticleRandomSimdState;
}

function sameParticleInstance(left: ParticleInstanceIdentity, right: ParticleInstanceIdentity): boolean {
  if (left.kind !== right.kind || left.buttonType !== right.buttonType || left.rangeLength !== right.rangeLength ||
    !sameOwnerTransform(left.ownerTransform, right.ownerTransform) ||
    left.particleSystemSetupScaleBits !== right.particleSystemSetupScaleBits) return false;
  if (left.kind === "game-clear" || right.kind === "game-clear") {
    return left.kind === "game-clear" && right.kind === "game-clear" && left.clearStatus === right.clearStatus;
  }
  if (left.kind === "game-play-button" && right.kind === "game-play-button") {
    return left.particleSystemSetupScaleFactorsBits?.[0] === right.particleSystemSetupScaleFactorsBits?.[0] &&
      left.particleSystemSetupScaleFactorsBits?.[1] === right.particleSystemSetupScaleFactorsBits?.[1];
  }
  if (left.kind !== "note-slide" || right.kind !== "note-slide") return true;
  return left.noteIndex === right.noteIndex && left.absolutePosition === right.absolutePosition &&
    left.poolSlot === right.poolSlot && left.route === right.route &&
    left.particleSystemSetupScaleFactorsBits?.[0] === right.particleSystemSetupScaleFactorsBits?.[0] &&
    left.particleSystemSetupScaleFactorsBits?.[1] === right.particleSystemSetupScaleFactorsBits?.[1];
}

function sameOwnerTransform(
  left: ParticleOwnerTransform | undefined,
  right: ParticleOwnerTransform | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.source === right.source &&
    left.position.xBits === right.position.xBits && left.position.yBits === right.position.yBits && left.position.zBits === right.position.zBits &&
    left.rotation.xBits === right.rotation.xBits && left.rotation.yBits === right.rotation.yBits &&
    left.rotation.zBits === right.rotation.zBits && left.rotation.wBits === right.rotation.wBits &&
    left.scale.xBits === right.scale.xBits && left.scale.yBits === right.scale.yBits && left.scale.zBits === right.scale.zBits;
}

function instanceParticleSystemSetupScale(
  instance: ParticleInstanceIdentity,
  legacyFallback: number,
): ParticleSetupScale {
  if (instance.kind === "game-play-button" || instance.kind === "note-slide") {
    const factors = instance.particleSystemSetupScaleFactorsBits;
    if (factors === undefined || factors.length !== 2) {
      throw fault("particle.simulation.invalid-owner-setup-scale", "Gameplay setup requires both original scale factors.");
    }
    const first = particleFloat32FromBits(factors[0]), second = particleFloat32FromBits(factors[1]);
    if (first === null || second === null || first <= 0 || second <= 0) {
      throw fault("particle.simulation.invalid-owner-setup-scale", "Gameplay setup factors must be positive binary32.");
    }
    return [first, second];
  }
  const value = instance.particleSystemSetupScaleBits === undefined
    ? legacyFallback
    : particleFloat32FromBits(instance.particleSystemSetupScaleBits);
  if (value === null || value <= 0) {
    throw fault("particle.simulation.invalid-owner-setup-scale", "Every current gameplay particle owner requires one positive binary32 ParticleSystem setup scale.");
  }
  return value;
}

function sameParticleSetupScale(left: ParticleSetupScale, right: ParticleSetupScale): boolean {
  return typeof left === "number" ? left === right
    : typeof right !== "number" && left[0] === right[0] && left[1] === right[1];
}

function particleConstructionKey(ownerKey: string, instance: ParticleInstanceIdentity): string {
  return instance.kind === "note-slide" && instance.poolSlot !== undefined
    ? `note-slide-pool:${instance.poolSlot}`
    : ownerKey;
}

function particleOwnerSortOrdinal(instance: ParticleInstanceIdentity): number {
  if (instance.kind === "game-clear") return 10_000;
  if (instance.kind === "game-play-button") return instance.buttonType;
  return 32 + (instance.poolSlot ?? 0);
}

function cloneOwner(owner: OwnerRuntime): OwnerRuntime {
  return {
    ownerKey: owner.ownerKey,
    generation: owner.generation,
    particleSystemSetupScale: owner.particleSystemSetupScale,
    instance: Object.freeze({ ...owner.instance }),
    root: owner.root,
    systems: new Map([...owner.systems].map(([identity, runtime]) => [identity, {
      instanceStateKey: runtime.instanceStateKey,
      playing: runtime.playing,
      elapsed: runtime.elapsed,
      remainingDelta: runtime.remainingDelta,
      delayRemaining: runtime.delayRemaining,
      cycleCount: runtime.cycleCount,
      emissionStopped: runtime.emissionStopped,
      first: runtime.first,
      particles: runtime.particles.map((particle) => ({
        ...particle,
        emitterOrigin: [...particle.emitterOrigin] as Vector3,
        position: [...particle.position] as Vector3,
        velocity: [...particle.velocity] as Vector3,
        renderVelocity: [...particle.renderVelocity] as Vector3,
        moduleVelocity: [...particle.moduleVelocity] as Vector3,
        baseSize: [...particle.baseSize] as Vector3,
        baseColor: [...particle.baseColor] as ColorBytes,
        rotation: [...particle.rotation] as Vector3,
        slots: [...particle.slots],
      })),
    }])),
  };
}

function validTransform(transform: ParticleTransformProfile): boolean {
  return transform !== null && typeof transform === "object" && [
    transform.m_LocalPosition.x, transform.m_LocalPosition.y, transform.m_LocalPosition.z,
    transform.m_LocalRotation.x, transform.m_LocalRotation.y, transform.m_LocalRotation.z, transform.m_LocalRotation.w,
    transform.m_LocalScale.x, transform.m_LocalScale.y, transform.m_LocalScale.z,
  ].every((value) => Number.isFinite(value) && value === Math.fround(value));
}

function freezeTransform(transform: ParticleTransformProfile): ParticleTransformProfile {
  return Object.freeze({
    m_LocalPosition: Object.freeze({ ...transform.m_LocalPosition }),
    m_LocalRotation: Object.freeze({ ...transform.m_LocalRotation }),
    m_LocalScale: Object.freeze({ ...transform.m_LocalScale }),
  });
}

function vectorBits(value: Vector3) {
  return Object.freeze({ xBits: bits(value[0]), yBits: bits(value[1]), zBits: bits(value[2]) });
}

function vector4Bits(value: Color4) {
  return Object.freeze({ xBits: bits(value[0]), yBits: bits(value[1]), zBits: bits(value[2]), wBits: bits(value[3]) });
}

function colorBits(value: Color4) {
  return Object.freeze({
    redBits: bits(value[0]),
    greenBits: bits(value[1]),
    blueBits: bits(value[2]),
    alphaBits: bits(value[3]),
  });
}

function uint32Bits(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, f32(value), true);
  return view.getUint32(0, true);
}

function float32FromBits(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, value >>> 0, true);
  return view.getFloat32(0, true);
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
function compareOrdinal(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fault(capability: string, boundary: string): ParticleSimulationFault {
  return new ParticleSimulationFault(capability, boundary);
}
