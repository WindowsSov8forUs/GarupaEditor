import type {
  ParticleGameClearFramePlan,
  ParticleGameClearRuntimeInstance,
  ParticleGameClearSystemGroup,
  ParticleGameClearTimelinePhase,
  ParticleGameClearTransformUpdate,
  ParticlePixiSceneProfile,
} from "../../backends/particleContracts";
import {
  particleFloat32FromBits,
  particleFloat32ToBits,
  validateGameClearFramePlan,
} from "../../backends/particleValidation";
import {
  buildGameClearParticleLifecycleSchedule,
  gameClearRoot,
  gameClearSystemId,
  sampleGameClearParticleTransforms,
  type GameClearRuntimeProfile,
} from "../../backends/resources/currentGameClearProfile";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";

const ZERO_BITS = "0x00000000";
const ROOT_ORDER = Object.freeze([
  "game-clear:base",
  "game-clear:full-combo",
  "game-clear:all-perfect",
] as const);
type GameClearRoot = typeof ROOT_ORDER[number];

interface MutableGameClearParticleState {
  readonly status: 1 | 2 | 3;
  readonly elapsedSeconds: number;
  readonly activeByRoot: ReadonlyMap<GameClearRoot, ReadonlySet<string>>;
}

export interface GameClearParticleOwnerSnapshot {
  readonly state: "idle" | "running";
  readonly clearStatus: 1 | 2 | 3 | null;
  readonly elapsedSeconds: number | null;
  readonly activeSystemIds: readonly string[];
}

export class GameClearParticleOwnerTransaction {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    readonly plan: ParticleGameClearFramePlan,
    private readonly publish: () => void,
    private readonly release: () => void,
  ) {}

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") return rejected("particle.game-clear.owner-repeated-commit", this.state);
    this.state = "committed";
    this.publish();
    return ok(undefined);
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") return rejected("particle.game-clear.owner-repeated-discard", this.state);
    this.state = "discarded";
    this.release();
    return ok(undefined);
  }
}

/** Owns the Animator-driven ParticleSystem timeline, not a second simulation. */
export class GameClearParticleOwner {
  private committed: MutableGameClearParticleState | null = null;
  private pending: GameClearParticleOwnerTransaction | null = null;

  constructor(
    private readonly profile: GameClearRuntimeProfile,
    private readonly scene: ParticlePixiSceneProfile,
  ) {}

  validateFresh(): SimulatorResult<void> {
    const native = this.profile.nativeSemantic;
    const owner = this.scene.gameClearOwner;
    const ppu = particleFloat32FromBits(this.scene.pixelsPerWorldUnitBits);
    const authoredScale = owner === undefined ? null : particleFloat32FromBits(owner.authoredUiScaleBits);
    const scale = owner === undefined ? null : particleFloat32FromBits(owner.transform.scale.xBits);
    if (native === undefined || native.projection.portableOwnerScale !== "screenToSafeChildScale / pixelsPerWorldUnit" ||
      owner === undefined || owner.transform.source !== "game-clear-ui-root" ||
      owner.particleSystemSetupScaleBits !== "0x3F800000" || ppu === null || ppu <= 0 ||
      authoredScale === null || authoredScale <= 0 || scale === null || scale <= 0 ||
      scale !== Math.fround(authoredScale / ppu) ||
      owner.transform.position.xBits !== ZERO_BITS || owner.transform.position.yBits !== ZERO_BITS ||
      owner.transform.position.zBits !== ZERO_BITS || owner.transform.rotation.xBits !== ZERO_BITS ||
      owner.transform.rotation.yBits !== ZERO_BITS || owner.transform.rotation.zBits !== ZERO_BITS ||
      owner.transform.rotation.wBits !== "0x3F800000" || owner.transform.scale.yBits !== owner.transform.scale.xBits ||
      owner.transform.scale.zBits !== owner.transform.scale.xBits || this.committed !== null || this.pending !== null) {
      return integrityFailure(
        "particle.game-clear.invalid-fresh-owner",
        [],
        "Game-clear requires one fresh source-bound profile and the typed UI_Root scale screenToSafeChildScale / pixelsPerWorldUnit.",
      );
    }
    return ok(undefined);
  }

  preflightStart(clearStatus: 1 | 2 | 3): SimulatorResult<GameClearParticleOwnerTransaction> {
    const fresh = this.validateFresh();
    if (fresh.status !== "ok") return fresh;
    if (clearStatus !== 1 && clearStatus !== 2 && clearStatus !== 3) {
      return integrityFailure("particle.game-clear.invalid-status", [], "Game-clear status is exactly base, Full Combo or All Perfect.");
    }
    const activeByRoot = emptyActiveRoots();
    const initialMutations = buildGameClearParticleLifecycleSchedule(this.profile, clearStatus)
      .filter((mutation) => mutation.atSeconds === 0 && mutation.active);
    for (const mutation of initialMutations) {
      const root = this.rootForSystem(mutation.systemId, clearStatus);
      activeByRoot.get(root)!.add(mutation.systemId);
    }
    const instance = this.instance(clearStatus);
    const phase: ParticleGameClearTimelinePhase = Object.freeze({
      sampledAtSecondsBits: ZERO_BITS,
      deltaTimeBits: ZERO_BITS,
      transforms: this.transforms(clearStatus, 0),
      deactivate: Object.freeze([]),
      activate: groupsFrom(activeByRoot),
    });
    const plan = Object.freeze({
      clearStatus,
      elapsedBeforeBits: ZERO_BITS,
      elapsedAfterBits: ZERO_BITS,
      instance,
      phases: Object.freeze([phase]),
    });
    const projected: MutableGameClearParticleState = Object.freeze({
      status: clearStatus,
      elapsedSeconds: Math.fround(0),
      activeByRoot: freezeActiveRoots(activeByRoot),
    });
    return this.stage(plan, projected);
  }

  preflightAdvance(deltaTimeSeconds: number): SimulatorResult<GameClearParticleOwnerTransaction> {
    if (this.pending !== null || this.committed === null) {
      return integrityFailure(
        "particle.game-clear.advance-without-owner",
        [],
        "Game-clear advances only one committed presentation owner with no overlapping transaction.",
      );
    }
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0 ||
      deltaTimeSeconds !== Math.fround(deltaTimeSeconds)) {
      return integrityFailure(
        "particle.game-clear.invalid-delta",
        [],
        "Game-clear presentation delta must be one finite non-negative binary32 value.",
      );
    }
    const before = this.committed.elapsedSeconds;
    const after = Math.fround(before + deltaTimeSeconds);
    if (after < before || after > Math.fround(this.profile.durationSeconds)) {
      return integrityFailure(
        "particle.game-clear.elapsed-out-of-range",
        [],
        "Game-clear native presentation advances monotonically through the exact 3.233-second callback endpoint.",
      );
    }
    const activeByRoot = cloneActiveRoots(this.committed.activeByRoot);
    const schedule = buildGameClearParticleLifecycleSchedule(this.profile, this.committed.status);
    const due = schedule.filter((mutation) => mutation.atSeconds > before && mutation.atSeconds <= after);
    const phases: ParticleGameClearTimelinePhase[] = [];
    let cursor = before;
    for (let index = 0; index < due.length;) {
      const at = Math.fround(due[index]!.atSeconds);
      const activate = emptyActiveRoots();
      const deactivate = emptyActiveRoots();
      while (index < due.length && due[index]!.atSeconds === at) {
        const mutation = due[index]!;
        const root = this.rootForSystem(mutation.systemId, this.committed.status);
        if (mutation.active) {
          if (activeByRoot.get(root)!.has(mutation.systemId)) {
            return integrityFailure("particle.game-clear.duplicate-activation", [], "Animator activation must target one inactive Game-clear system.");
          }
          activeByRoot.get(root)!.add(mutation.systemId);
          activate.get(root)!.add(mutation.systemId);
        } else {
          if (!activeByRoot.get(root)!.delete(mutation.systemId)) {
            return integrityFailure("particle.game-clear.missing-deactivation", [], "Animator deactivation must target one active Game-clear system.");
          }
          deactivate.get(root)!.add(mutation.systemId);
        }
        index += 1;
      }
      phases.push(Object.freeze({
        sampledAtSecondsBits: requiredBits(at),
        deltaTimeBits: requiredBits(Math.fround(at - cursor)),
        transforms: this.transforms(this.committed.status, at),
        deactivate: groupsFrom(deactivate),
        activate: groupsFrom(activate),
      }));
      cursor = at;
    }
    if (phases.length === 0 || cursor < after) {
      phases.push(Object.freeze({
        sampledAtSecondsBits: requiredBits(after),
        deltaTimeBits: requiredBits(Math.fround(after - cursor)),
        transforms: this.transforms(this.committed.status, after),
        deactivate: Object.freeze([]),
        activate: Object.freeze([]),
      }));
    }
    const plan: ParticleGameClearFramePlan = Object.freeze({
      clearStatus: this.committed.status,
      elapsedBeforeBits: requiredBits(before),
      elapsedAfterBits: requiredBits(after),
      instance: this.instance(this.committed.status),
      phases: Object.freeze(phases),
    });
    const projected: MutableGameClearParticleState = Object.freeze({
      status: this.committed.status,
      elapsedSeconds: after,
      activeByRoot: freezeActiveRoots(activeByRoot),
    });
    return this.stage(plan, projected);
  }

  snapshot(): GameClearParticleOwnerSnapshot {
    return Object.freeze({
      state: this.committed === null ? "idle" : "running",
      clearStatus: this.committed?.status ?? null,
      elapsedSeconds: this.committed?.elapsedSeconds ?? null,
      activeSystemIds: Object.freeze(this.committed === null ? [] :
        [...this.committed.activeByRoot.values()].flatMap((systems) => [...systems]).sort()),
    });
  }

  private transforms(clearStatus: 1 | 2 | 3, elapsed: number): readonly ParticleGameClearTransformUpdate[] {
    return Object.freeze(sampleGameClearParticleTransforms(this.profile, clearStatus, elapsed).map((sample) => Object.freeze({
      systemId: sample.systemId,
      transform: sample.transform,
      parentTransforms: sample.parentTransforms,
    })));
  }

  private rootForSystem(systemId: string, clearStatus: 1 | 2 | 3): GameClearRoot {
    const semantic = this.profile.nativeSemantic!.systems.find((system) =>
      gameClearSystemId(this.profile, system.path) === systemId);
    if (semantic === undefined || semantic.branch === "fullCombo" && clearStatus !== 2 ||
      semantic.branch === "allPerfect" && clearStatus !== 3) {
      throw new Error(`Game-clear timeline referenced a foreign status/system: ${systemId}`);
    }
    return gameClearRoot(semantic.branch) as GameClearRoot;
  }

  private instance(clearStatus: 1 | 2 | 3): ParticleGameClearRuntimeInstance {
    return Object.freeze({
      kind: "game-clear",
      buttonType: 0,
      rangeLength: null,
      clearStatus,
      ownerTransform: this.scene.gameClearOwner!.transform,
      particleSystemSetupScaleBits: this.scene.gameClearOwner!.particleSystemSetupScaleBits,
    });
  }

  private stage(
    plan: ParticleGameClearFramePlan,
    projected: MutableGameClearParticleState,
  ): SimulatorResult<GameClearParticleOwnerTransaction> {
    const validated = validateGameClearFramePlan(plan);
    if (validated.status !== "accepted") {
      return integrityFailure(`particle.${validated.status}.${validated.failure.capability}`, [], validated.failure.boundary);
    }
    let transaction!: GameClearParticleOwnerTransaction;
    transaction = new GameClearParticleOwnerTransaction(
      plan,
      () => {
        if (this.pending !== transaction) throw new Error("Game-clear owner commit lost its one-use capability");
        this.committed = projected;
        this.pending = null;
      },
      () => {
        if (this.pending !== transaction) throw new Error("Game-clear owner discard lost its one-use capability");
        this.pending = null;
      },
    );
    this.pending = transaction;
    return ok(transaction);
  }
}

function emptyActiveRoots(): Map<GameClearRoot, Set<string>> {
  return new Map(ROOT_ORDER.map((root) => [root, new Set<string>()]));
}
function cloneActiveRoots(source: ReadonlyMap<GameClearRoot, ReadonlySet<string>>): Map<GameClearRoot, Set<string>> {
  return new Map(ROOT_ORDER.map((root) => [root, new Set(source.get(root) ?? [])]));
}
function freezeActiveRoots(source: ReadonlyMap<GameClearRoot, ReadonlySet<string>>): ReadonlyMap<GameClearRoot, ReadonlySet<string>> {
  return new Map(ROOT_ORDER.map((root) => [root, new Set(source.get(root) ?? [])]));
}
function groupsFrom(source: ReadonlyMap<GameClearRoot, ReadonlySet<string>>): readonly ParticleGameClearSystemGroup[] {
  return Object.freeze(ROOT_ORDER.flatMap((root) => {
    const systemIds = [...(source.get(root) ?? [])].sort();
    return systemIds.length === 0 ? [] : [Object.freeze({
      ownerKey: `game-clear-owner:${root.slice("game-clear:".length)}`,
      root,
      systemIds: Object.freeze(systemIds),
    })];
  }));
}
function requiredBits(value: number): string {
  const bits = particleFloat32ToBits(Math.fround(value));
  if (bits === null) throw new Error("Game-clear timeline produced a non-finite Float32 value");
  return bits;
}
function rejected(capability: string, state: string): SimulatorResult<never> {
  return integrityFailure(capability, [], `Game-clear particle owner transaction is already ${state}.`);
}
