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
import { calculateNativeParticleHierarchyScale, type ParticleHierarchyTransform } from "./particleHierarchyScale";
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
  birthCount: number;
}

interface EmissionBatch {
  readonly at: number;
  readonly count: number;
}

interface BirthRandomSample {
  readonly particleSeed: number;
  readonly slots: readonly number[];
  readonly shapeValues: readonly number[];
}

interface SimulatedParticle {
  readonly particleId: string;
  readonly creationSequence: number;
  readonly emitterOrigin: Vector3;
  readonly particleSystemSetupScale: number;
  age: number;
  agePercent: number;
  readonly lifetime: number;
  readonly inverseLifetime: number;
  readonly randomSeed: number;
  position: Vector3;
  velocity: Vector3;
  renderVelocity: Vector3;
  readonly baseSize: Vector3;
  readonly baseColor: ColorBytes;
  rotation: Vector3;
  readonly slots: readonly number[];
}

interface OwnerSystemRuntime {
  readonly instanceStateKey: string;
  playing: boolean;
  elapsed: number;
  first: boolean;
  particles: SimulatedParticle[];
}

interface OwnerRuntime {
  readonly ownerKey: string;
  readonly generation: number;
  readonly particleSystemSetupScale: number;
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
        owner.particleSystemSetupScale !== instanceParticleSystemSetupScale(instance, this.gameplayTransformScale)) {
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
      owner.particleSystemSetupScale !== instanceParticleSystemSetupScale(instance, this.gameplayTransformScale)) {
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
      if (profile.system.autoRandomSeed) {
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
      birthCount: 0,
    });
    return {
      instanceStateKey,
      playing: true,
      elapsed: f32(0),
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
    if (!profile.system.prewarm) return;
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
      owner.particleSystemSetupScale !== instanceParticleSystemSetupScale(instance, this.gameplayTransformScale)) {
      throw fault("particle.simulation.missing-slide-owner", "Slide root movement requires the exact active persistent owner.");
    }
    owner.instance = Object.freeze({ ...instance });
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
        const effectiveDelta = multiply(delta, profile.system.simulationSpeed);
        const before = runtime.elapsed;
        const after = add(before, effectiveDelta);
        const batches = this.events(record.bundle, profile, runtime, before, after, runtime.first);
        let cursor = before;
        for (const batch of batches) {
          const segment = subtract(batch.at, cursor);
          if (segment > 0) {
            for (const particle of runtime.particles) this.updateParticle(record, particle, segment);
          }
          this.spawnBatch(owner, record, profile, runtime, batch, batch.at);
          cursor = batch.at;
        }
        const finalSegment = subtract(after, cursor);
        if (finalSegment > 0) {
          for (const particle of runtime.particles) this.updateParticle(record, particle, finalSegment);
        }
        // Native admission observes the still-owned outer-update list. Expired
        // rows therefore do not free maxNumParticles until publication.
        removeExpiredParticles(runtime.particles);
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
        const transformSize = particleSizeScale(record.definition, profile.system.scalingMode, owner.particleSystemSetupScale);
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
            const sampled = colorToBytes(minMaxColor(
              colorModule.gradient,
              normalizedAge,
              particleSeedRatio((particle.randomSeed + 0x591BC05C) >>> 0),
            ));
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
            position: vectorBits(particle.position),
            velocity: vectorBits(particle.renderVelocity),
            size: vectorBits(size),
            sizeBeforeTransform,
            transformSize: vectorBits(transformSize),
            rotation: vectorBits(particle.rotation),
            color: colorBits(color),
            ageBits: bits(particle.age),
            lifetimeBits: bits(particle.lifetime),
            uvFrame,
            sortingOrder: renderer.m_SortingOrder,
            sortingLayerId: renderer.m_SortingLayerID!,
            sortingFudgeBits: bits(renderer.m_SortingFudge!),
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
      particleFloat32FromBits(left.sortingFudgeBits!)! - particleFloat32FromBits(right.sortingFudgeBits!)! ||
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
    const admitted = Math.max(0, Math.min(batch.count, initial.maxNumParticles - runtime.particles.length));
    const shape = getModule(record.bundle, profile, "ShapeModule");
    for (let groupStart = 0; groupStart < admitted; groupStart += 4) {
      const initialRandom = particleSimdRandomValues(state.initialModuleStream, initialModuleRandomDrawCount(initial));
      state.initialModuleStream = initialRandom.state;
      const shapeRandom = particleSimdRandomValues(state.shapeModuleStream, shapeRandomDrawCount(shape));
      state.shapeModuleStream = shapeRandom.state;
      const groupCount = Math.min(4, admitted - groupStart);
      for (let lane = 0; lane < groupCount; lane += 1) {
        const sample = buildBirthRandomSample(initial, initialRandom, shapeRandom, lane);
        const batchIndex = groupStart + lane;
        this.spawn(
          owner,
          record,
          profile,
          runtime,
          batch.at,
          subtract(frameEnd, batch.at),
          batchIndex,
          admitted,
          sample,
        );
      }
    }
  }

  private spawn(
    owner: OwnerRuntime,
    record: SystemRecord,
    profile: ParticleProfileDefinition,
    runtime: OwnerSystemRuntime,
    _eventTime: number,
    initialAge: number,
    batchIndex: number,
    batchCount: number,
    random: BirthRandomSample,
  ): void {
    const initial = getModule(record.bundle, profile, "InitialModule");
    if (initial === null || runtime.particles.length >= initial.maxNumParticles) return;
    const instanceState = this.instanceStates.get(runtime.instanceStateKey);
    if (instanceState === undefined) {
      throw fault("particle.simulation.instance-random-state-missing", "Every concrete ParticleSystem instance must retain its own initialized native random state.");
    }
    const slots = random.slots;
    const [lifetime, inverseLifetime] = nativeParticleLifetime(minMax(initial.startLifetime, 0, slots[0]!));
    const speed = minMax(initial.startSpeed, 0, slots[1]!);
    const sx = Math.max(0, minMax(initial.startSize, 0, slots[2]!));
    const sy = initial.size3D ? Math.max(0, minMax(initial.startSizeY, 0, slots[3]!)) : sx;
    const sz = initial.size3D ? Math.max(0, minMax(initial.startSizeZ, 0, slots[4]!)) : sx;
    const baseColor = colorToBytes(minMaxColor(initial.startColor, 0, slots[5]!));
    const rotation: Vector3 = [
      minMax(initial.startRotationX, 0, slots[6]!),
      minMax(initial.startRotationY, 0, slots[7]!),
      minMax(initial.startRotation, 0, slots[8]!),
    ];
    const shape = getModule(record.bundle, profile, "ShapeModule");
    const birth = sampleShape(shape, random.shapeValues, batchIndex, batchCount);
    let position: Vector3 = birth.position;
    let velocity = birth.direction.map((value) => multiply(value, speed)) as Vector3;
    let emitterOrigin: Vector3 = [0, 0, 0];
    const particleSystemSetupScale = owner.particleSystemSetupScale;
    emitterOrigin = applyTransform(emitterOrigin, record.definition.transform, true, particleSystemSetupScale);
    for (let index = record.definition.parentTransforms.length - 1; index >= 0; index -= 1) {
      const parent = record.definition.parentTransforms[index]!;
      const setupScale = parentSetupScale(record.definition, index, particleSystemSetupScale);
      emitterOrigin = applyTransform(emitterOrigin, parent, true, setupScale);
    }
    position = applyTransform(position, record.definition.transform, true, particleSystemSetupScale);
    velocity = applyTransform(velocity, record.definition.transform, false, particleSystemSetupScale);
    for (let index = record.definition.parentTransforms.length - 1; index >= 0; index -= 1) {
      const parent = record.definition.parentTransforms[index]!;
      const setupScale = parentSetupScale(record.definition, index, particleSystemSetupScale);
      position = applyTransform(position, parent, true, setupScale);
      velocity = applyTransform(velocity, parent, false, setupScale);
    }
    instanceState.birthCount += 1;
    this.creationSequence += 1;
    const particle: SimulatedParticle = {
      particleId: `${owner.ownerKey}\u0000${owner.generation}\u0000${record.definition.identity}#${instanceState.birthCount}`,
      creationSequence: this.creationSequence,
      emitterOrigin: emitterOrigin.map(f32) as Vector3,
      particleSystemSetupScale,
      age: f32(0),
      agePercent: f32(0),
      lifetime,
      inverseLifetime,
      randomSeed: random.particleSeed,
      position: position.map(f32) as Vector3,
      velocity: velocity.map(f32) as Vector3,
      renderVelocity: velocity.map(f32) as Vector3,
      baseSize: [sx, sy, sz],
      baseColor,
      rotation,
      slots,
    };
    runtime.particles.push(particle);
    if (initialAge > 0) this.updateParticle(record, particle, f32(initialAge));
    void owner;
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
    particle.velocity[1] = add(particle.velocity[1], multiply(multiply(-9.81, gravity), delta));

    // 0x109669C phase 2: RotationModule.
    const rotation = getModule(bundle, profile, "RotationModule");
    if (rotation !== null) {
      const rotationRandom = particleSeedRatio((particle.randomSeed + 0x6AED452E) >>> 0);
      if (rotation.separateAxes) {
        particle.rotation[0] = add(particle.rotation[0], multiply(minMax(rotation.x, normalizedAge, rotationRandom), delta));
        particle.rotation[1] = add(particle.rotation[1], multiply(minMax(rotation.y, normalizedAge, rotationRandom), delta));
      }
      particle.rotation[2] = add(particle.rotation[2], multiply(minMax(rotation.curve, normalizedAge, rotationRandom), delta));
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
      let centerOffset = offset;
      if (!velocity.inWorldSpace) {
        moduleVelocity = applySystemVector(moduleVelocity, definition, particle.particleSystemSetupScale);
        centerOffset = applySystemVector(centerOffset, definition, particle.particleSystemSetupScale);
      }
      const relative = particle.position.map((value, index) =>
        subtract(value, add(particle.emitterOrigin[index]!, centerOffset[index]!))) as Vector3;
      speedModifier = minMax(velocity.speedModifier, normalizedAge, particle.slots[4]!);
      const orbitalStep: Vector3 = angular.map((value) =>
        multiply(multiply(value, delta), speedModifier)) as Vector3;
      const rotatedRelative = rotateEulerRadians(relative, orbitalStep);
      const orbitalDuration = multiply(delta, speedModifier);
      let orbital: Vector3 = Math.abs(orbitalDuration) > 0
        ? scaleVector(subtractVector(rotatedRelative, relative), divide(1, orbitalDuration))
        : [0, 0, 0];
      if (!velocity.inWorldSpace) orbital = applySystemVector(orbital, definition, particle.particleSystemSetupScale);
      const radialAmount = minMax(velocity.radial, normalizedAge, particle.slots[5]!);
      const radial = scaleVector(normalizeOrZero(rotatedRelative), radialAmount);
      moduleVelocity = addVector(moduleVelocity, addVector(orbital, radial));
    }

    // 0x109669C phase 4: ForceModule. Current active Force curves are
    // constants, so accumulating force*delta in base velocity is equivalent
    // to the native age-integrated transient velocity owner.
    const force = getModule(bundle, profile, "ForceModule");
    if (force !== null) {
      let acceleration: Vector3 = [
        minMax(force.x, normalizedAge, particle.slots[9]!),
        minMax(force.y, normalizedAge, particle.slots[10]!),
        minMax(force.z, normalizedAge, particle.slots[11]!),
      ];
      if (!force.inWorldSpace) acceleration = applySystemVector(acceleration, definition, particle.particleSystemSetupScale);
      particle.velocity = particle.velocity.map((value, index) =>
        add(value, multiply(acceleration[index]!, delta))) as Vector3;
    }

    // 0x109669C phase 5: ClampVelocityModule.
    let combinedVelocity = addVector(particle.velocity, moduleVelocity);
    const clamp = getModule(bundle, profile, "ClampVelocityModule");
    if (clamp !== null) {
      if (clamp.inWorldSpace) {
        combinedVelocity = limitVelocity(combinedVelocity, clamp, normalizedAge, particle.slots, delta, particle.baseSize);
      } else {
        const localVelocity = inverseSystemVector(
          combinedVelocity,
          definition,
          particle.particleSystemSetupScale,
        );
        combinedVelocity = applySystemVector(
          limitVelocity(localVelocity, clamp, normalizedAge, particle.slots, delta, particle.baseSize),
          definition,
          particle.particleSystemSetupScale,
        );
      }
    }
    const effectiveVelocity = scaleVector(combinedVelocity, speedModifier);
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
      particle.rotation[2] = add(particle.rotation[2], multiply(minMax(
        bySpeed.curve,
        normalizedSpeed,
        particleSeedRatio((particle.randomSeed + 0xDEC4AEA1) >>> 0),
      ), delta));
    }

    // 0x108AF6C integration follows the complete module pipeline.
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

function nativeParticleLifetime(sampled: number): readonly [number, number] {
  const lifetime = Math.max(f32(sampled), f32(1e-5));
  const estimate = nativeParticleReciprocalEstimate(lifetime);
  // FRECPS rounds 2-a*b once; rounding the product separately changes it.
  const first = multiply(estimate, f32(2 - lifetime * estimate));
  return [lifetime, multiply(first, f32(2 - lifetime * first))];
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
        if (times[index] === times[index - 1] || (value.m_Mode === 1 && t16 === times[index])) {
          return f32(values[index]!);
        }
        if (value.m_Mode === 1) return f32(values[index - 1]!);
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

function colorToBytes(color: Color4): ColorBytes {
  return color.map((value) => Math.max(0, Math.min(255, roundHalfEven(f32(value) * 255)))) as ColorBytes;
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
  const log2Approximation = add(
    exponent,
    add(
      multiply(mantissa, CUBE_LOG_LINEAR),
      multiply(square, add(multiply(mantissa, CUBE_LOG_CUBIC), CUBE_LOG_QUADRATIC)),
    ),
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
      const radial = multiply(radius, f32(Math.sqrt(add(
        multiply(Math.max(inner, 0.001), radiusDraw),
        subtract(1, radiusDraw),
      ))));
      const angle = multiply(shape.angle, DEG_TO_RAD);
      const [cosAngle, sinAngle] = nativeSinCos(angle);
      position = [multiply(radial, cosine), multiply(radial, sine), 0];
      direction = [
        multiply(sinAngle, cosine),
        multiply(sinAngle, sine),
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
      const radial = multiply(radius, f32(Math.sqrt(add(
        multiply(Math.max(inner, 0.001), radiusDraw),
        subtract(1, radiusDraw),
      ))));
      const angle = multiply(shape.angle, DEG_TO_RAD);
      const [cosAngle, sinAngle] = nativeSinCos(angle);
      direction = [
        multiply(sinAngle, cosine),
        multiply(sinAngle, sine),
        cosAngle,
      ];
      position = addVector(
        [multiply(radial, cosine), multiply(radial, sine), 0],
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
  direction = normalizeOrFallback(direction);
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
    const radialDirection = normalizeOrFallback(position);
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
  position = rotateEulerDegrees([
    multiply(position[0], shape.m_Scale.x),
    multiply(position[1], shape.m_Scale.y),
    multiply(position[2], shape.m_Scale.z),
  ], shape.m_Rotation);
  position = [
    add(position[0], shape.m_Position.x),
    add(position[1], shape.m_Position.y),
    add(position[2], shape.m_Position.z),
  ];
  direction = rotateEulerDegrees([
    multiply(direction[0], shape.m_Scale.x),
    multiply(direction[1], shape.m_Scale.y),
    multiply(direction[2], shape.m_Scale.z),
  ], shape.m_Rotation);
  return Object.freeze({ position, direction: normalizeOrFallback(direction) });
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
  } else {
    const speed = vectorLength(result);
    const limit = Math.max(0, minMax(module.magnitude, time, slots[10]!));
    if (speed > limit && speed > 0) {
      result = scaleVector(result, divide(lerp(speed, limit, dampen), speed));
    }
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
  gameplayTransformScale: number,
): number {
  const flags = definition.parentParticleSystemFlags;
  return flags === undefined || flags[parentIndex] === true ? gameplayTransformScale : 1;
}

function inverseSystemVector(
  vector: Vector3,
  definition: ParticleSystemDefinition,
  gameplayTransformScale: number,
): Vector3 {
  let result: Vector3 = [...vector];
  for (let index = 0; index < definition.parentTransforms.length; index += 1) {
    result = inverseTransformVector(
      result,
      definition.parentTransforms[index]!,
      parentSetupScale(definition, index, gameplayTransformScale),
    );
  }
  return inverseTransformVector(result, definition.transform, gameplayTransformScale);
}

function inverseTransformVector(
  vector: Vector3,
  transform: ParticleTransformProfile,
  gameplayTransformScale: number,
): Vector3 {
  const rotation = transform.m_LocalRotation;
  const unrotated = quaternionRotate(vector, {
    x: -rotation.x,
    y: -rotation.y,
    z: -rotation.z,
    w: rotation.w,
  });
  return [
    divide(unrotated[0], multiply(transform.m_LocalScale.x, gameplayTransformScale)),
    divide(unrotated[1], multiply(transform.m_LocalScale.y, gameplayTransformScale)),
    divide(unrotated[2], multiply(transform.m_LocalScale.z, gameplayTransformScale)),
  ];
}

function particleSizeScale(
  definition: ParticleSystemDefinition,
  scalingMode: 0 | 1,
  gameplayTransformScale: number,
): Vector3 {
  const self = hierarchyTransform(definition.transform, gameplayTransformScale);
  if (scalingMode === 1) return [...self.scale];
  const parents = definition.parentTransforms.map((parent, index) =>
    hierarchyTransform(parent, parentSetupScale(definition, index, gameplayTransformScale)));
  return [...calculateNativeParticleHierarchyScale(self, parents)];
}

function hierarchyTransform(transform: ParticleTransformProfile, setupScale: number): ParticleHierarchyTransform {
  const rotation = transform.m_LocalRotation;
  const scale = transform.m_LocalScale;
  return {
    rotation: [f32(rotation.x), f32(rotation.y), f32(rotation.z), f32(rotation.w)],
    scale: [multiply(scale.x, setupScale), multiply(scale.y, setupScale), multiply(scale.z, setupScale)],
  };
}

function applySystemVector(
  vector: Vector3,
  definition: ParticleSystemDefinition,
  gameplayTransformScale: number,
): Vector3 {
  let result = applyTransform(vector, definition.transform, false, gameplayTransformScale);
  for (let index = definition.parentTransforms.length - 1; index >= 0; index -= 1) {
    result = applyTransform(
      result,
      definition.parentTransforms[index]!,
      false,
      parentSetupScale(definition, index, gameplayTransformScale),
    );
  }
  return result;
}

function rotateEulerDegrees(vector: Vector3, rotation: ParticleVector3Like): Vector3 {
  return rotateEulerRadians(vector, [
    multiply(rotation.x, DEG_TO_RAD),
    multiply(rotation.y, DEG_TO_RAD),
    multiply(rotation.z, DEG_TO_RAD),
  ]);
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

type ParticleVector3Like = { readonly x: number; readonly y: number; readonly z: number };

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
  const normalized = normalizeOrZero(vector);
  return vectorLengthSquared(normalized) > 0 ? normalized : [0, 0, 1];
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
  if (left.kind !== "note-slide" || right.kind !== "note-slide") return true;
  return left.noteIndex === right.noteIndex && left.absolutePosition === right.absolutePosition &&
    left.poolSlot === right.poolSlot && left.route === right.route;
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
): number {
  const value = instance.particleSystemSetupScaleBits === undefined
    ? legacyFallback
    : particleFloat32FromBits(instance.particleSystemSetupScaleBits);
  if (value === null || value <= 0) {
    throw fault("particle.simulation.invalid-owner-setup-scale", "Every current gameplay particle owner requires one positive binary32 ParticleSystem setup scale.");
  }
  return value;
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
      first: runtime.first,
      particles: runtime.particles.map((particle) => ({
        ...particle,
        emitterOrigin: [...particle.emitterOrigin] as Vector3,
        position: [...particle.position] as Vector3,
        velocity: [...particle.velocity] as Vector3,
        renderVelocity: [...particle.renderVelocity] as Vector3,
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
