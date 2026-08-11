import type {
  ParticleBackendFault,
  ParticleBackendSnapshot,
  ParticleCommand,
  ParticleFrameBatch,
  ParticleFrameRequest,
  ParticleFrameSnapshot,
  ParticleInstanceIdentity,
  ParticleOperationResult,
  ParticleOwnerSnapshot,
  ParticlePortableProfile,
  ParticleRenderSample,
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
  ParticleRootId,
  SimulatorParticleBackend,
} from "../particleContracts";
import {
  freezeParticleCommand,
  particleAccepted,
  particleFloat32FromBits,
  particleRejected,
  validateParticleFrameRequest,
} from "../particleValidation";
import {
  ParticlePreparationInvariantError,
  prepareCurrentParticleResources,
} from "../resources/particleResourcePreparation";
import {
  DeterministicParticleSimulation,
  ParticleSimulationFault,
} from "../../engine/particles/particleSimulation";

interface MutableOwner {
  readonly root: ParticleRootId;
  readonly instance: ParticleInstanceIdentity;
  restartCount: number;
}

interface PendingFrame {
  readonly capability: ParticleFrameBatch;
  readonly request: ParticleFrameRequest;
  readonly owners: Map<string, MutableOwner>;
  readonly simulation: DeterministicParticleSimulation;
  readonly samples: readonly ParticleRenderSample[];
  readonly suppressedUntilReplay: boolean;
}

export class DeterministicSimulatorParticleBackend implements SimulatorParticleBackend {
  readonly id = "deterministic-particle-portable-v1";

  private state: ParticleBackendSnapshot["state"] = "unprepared";
  private sessionId: string | null = null;
  private profile: ParticlePortableProfile | null = null;
  private simulation: DeterministicParticleSimulation | null = null;
  private resourceCount = 0;
  private nextFrame: number | null = null;
  private nextSequence = 0;
  private owners = new Map<string, MutableOwner>();
  private suppressedUntilReplay = false;
  private readonly frames: ParticleFrameSnapshot[] = [];
  private pendingFrame: PendingFrame | null = null;
  private fault: ParticleBackendFault | null = null;

  async prepare(
    sessionId: string,
    provider: ParticleResourceProvider,
    preflight: ParticleResourcePreflightAdapter,
  ): Promise<ParticleOperationResult<void>> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "unprepared") {
      return this.reject("particle.prepare.invalid-state", "A deterministic particle backend prepares one session exactly once.");
    }
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return this.reject("particle.prepare.invalid-session", "Prepare requires one non-empty host-authored session identity.");
    }
    if (provider === null || typeof provider !== "object" || typeof provider.read !== "function" ||
      preflight === null || typeof preflight !== "object" || typeof preflight.sha256 !== "function" ||
      typeof preflight.inspectPng !== "function") {
      return this.reject("particle.prepare.missing-provider", "Deterministic preparation requires explicit offline provider and preflight capabilities.");
    }
    this.state = "preparing";
    try {
      const prepared = await prepareCurrentParticleResources(provider, preflight);
      if (prepared.status !== "accepted") return this.abortPrepare(prepared);
      const simulation = new DeterministicParticleSimulation(prepared.value.profile);
      this.sessionId = sessionId;
      this.profile = prepared.value.profile;
      this.simulation = simulation;
      this.resourceCount = prepared.value.pngBytes.size + 2;
      this.state = "ready";
      return particleAccepted(undefined);
    } catch (error) {
      if (error instanceof ParticlePreparationInvariantError || error instanceof ParticleSimulationFault) {
        return this.latchFault(error.capability, error.boundary);
      }
      return this.latchFault(
        "particle.prepare.provider-preflight-or-simulation-threw",
        "A provider, preflight, parser or simulation construction exception is the first terminal particle backend fault.",
      );
    }
  }

  preflightFrame(request: ParticleFrameRequest): ParticleOperationResult<ParticleFrameBatch> {
    const terminal = this.terminalResult<ParticleFrameBatch>();
    if (terminal !== null) return terminal;
    if (this.state !== "ready" || this.sessionId === null || this.profile === null || this.simulation === null) {
      return this.reject("particle.frame.backend-not-ready", "Particle frames require a fully prepared deterministic session.");
    }
    if (this.pendingFrame !== null) {
      return this.reject("particle.frame.overlapping-batch", "Only one one-use deterministic frame capability may be pending.");
    }
    const validated = validateParticleFrameRequest(request);
    if (validated.status !== "accepted") return validated;
    if (this.nextFrame !== null && request.frame !== this.nextFrame) {
      return this.reject("particle.frame.non-contiguous", "After its first host index, deterministic outer frames commit contiguously exactly once.");
    }
    if (this.suppressedUntilReplay && request.commands.length !== 0) {
      return this.reject("particle.frame.suppressed-command", "MoveTime suppression can only end through whole-engine checkpoint/replay reconstruction.");
    }
    const lifecycle = validateLifecycleSequence(request.commands);
    if (lifecycle.status !== "accepted") return lifecycle;

    try {
      const simulation = this.simulation.clone();
      const owners = cloneOwners(this.owners);
      let suppressed = this.suppressedUntilReplay;
      const commands: ParticleCommand[] = [];
      for (const command of request.commands) {
        const transition = applyCommand(command, owners, simulation, suppressed);
        if (transition.status !== "accepted") return transition;
        suppressed = transition.value;
        commands.push(freezeParticleCommand(command));
      }
      const delta = particleFloat32FromBits(request.deltaTimeBits);
      if (delta === null) {
        return this.reject("particle.frame.invalid-delta-after-validation", "The validated binary32 delta must remain decodable.");
      }
      simulation.step(delta, request.paused);
      const samples = simulation.samples();
      const frozenRequest: ParticleFrameRequest = Object.freeze({
        frame: request.frame,
        deltaTimeBits: request.deltaTimeBits,
        paused: request.paused,
        commands: Object.freeze(commands),
      });
      const capability = Object.freeze({
        sessionId: this.sessionId,
        frame: request.frame,
        firstSequence: this.nextSequence,
        commandCount: commands.length,
      });
      this.pendingFrame = Object.freeze({
        capability,
        request: frozenRequest,
        owners,
        simulation,
        samples,
        suppressedUntilReplay: suppressed,
      });
      return particleAccepted(capability);
    } catch (error) {
      return error instanceof ParticleSimulationFault
        ? this.latchFault(error.capability, error.boundary)
        : this.latchFault(
            "particle.simulation.unexpected-exception",
            "An unexpected deterministic simulation exception is the first terminal particle backend fault.",
          );
    }
  }

  commitFrame(batch: ParticleFrameBatch): ParticleOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    const pending = this.pendingFrame;
    if (this.state !== "ready" || pending === null || pending.capability !== batch ||
      batch.sessionId !== this.sessionId || (this.nextFrame !== null && batch.frame !== this.nextFrame) ||
      batch.firstSequence !== this.nextSequence || batch.commandCount !== pending.request.commands.length) {
      return this.reject("particle.frame.invalid-batch-capability", "Only the exact one-use deterministic frame capability may commit.");
    }
    this.owners = pending.owners;
    this.simulation = pending.simulation;
    this.suppressedUntilReplay = pending.suppressedUntilReplay;
    this.frames.push(Object.freeze({
      frame: pending.request.frame,
      deltaTimeBits: pending.request.deltaTimeBits,
      paused: pending.request.paused,
      commands: pending.request.commands,
      samples: pending.samples,
    }));
    this.nextFrame = pending.request.frame + 1;
    this.nextSequence += pending.request.commands.length;
    this.pendingFrame = null;
    return particleAccepted(undefined);
  }

  discardFrame(batch: ParticleFrameBatch): ParticleOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    if (this.pendingFrame?.capability !== batch) {
      return this.reject("particle.frame.invalid-discard-capability", "Only the exact pending deterministic frame may be discarded.");
    }
    this.pendingFrame = null;
    return particleAccepted(undefined);
  }

  recordTerminalFault(capability: string, boundary: string): ParticleOperationResult<never> {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
    return this.latchFault(capability, boundary);
  }

  snapshot(): ParticleBackendSnapshot {
    const activeOwners: ParticleOwnerSnapshot[] = [...this.owners]
      .sort(([left], [right]) => compareOrdinal(left, right))
      .map(([ownerKey, owner]) => Object.freeze({
        ownerKey,
        instance: Object.freeze({ ...owner.instance }),
        root: owner.root,
        restartCount: owner.restartCount,
      }));
    return Object.freeze({
      state: this.state,
      sessionId: this.sessionId,
      fidelity: this.profile?.fidelity ?? null,
      nextFrame: this.nextFrame,
      nextSequence: this.nextSequence,
      resourceCount: this.resourceCount,
      suppressedUntilReplay: this.suppressedUntilReplay,
      activeOwners: Object.freeze(activeOwners),
      randomState: this.simulation?.randomStateSnapshot() ?? Object.freeze([]),
      frames: Object.freeze(this.frames.map(freezeFrameSnapshot)),
      fault: this.fault === null ? null : Object.freeze({ ...this.fault }),
    });
  }

  dispose(): ParticleOperationResult<void> {
    if (this.state === "disposed") return particleAccepted(undefined);
    this.pendingFrame = null;
    this.profile = null;
    this.simulation = null;
    this.sessionId = null;
    this.resourceCount = 0;
    this.owners.clear();
    this.suppressedUntilReplay = false;
    this.state = "disposed";
    return particleAccepted(undefined);
  }

  private abortPrepare<T>(result: ParticleOperationResult<T>): ParticleOperationResult<void> {
    this.state = "unprepared";
    return result.status === "accepted" ? particleAccepted(undefined) : result;
  }

  private terminalResult<T>(): ParticleOperationResult<T> | null {
    if (this.state === "disposed") return this.disposedResult();
    if (this.fault !== null) return this.faultResult();
    return null;
  }

  private latchFault(capability: string, boundary: string): ParticleOperationResult<never> {
    if (this.fault === null) {
      this.fault = Object.freeze({ code: "particle-backend-fault", capability, boundary });
      this.pendingFrame = null;
      this.state = "faulted";
    }
    return this.faultResult();
  }

  private faultResult<T = never>(): ParticleOperationResult<T> {
    return particleRejected("particle-backend-fault", this.fault!.capability, this.fault!.boundary);
  }

  private disposedResult<T = never>(): ParticleOperationResult<T> {
    return particleRejected(
      "terminal-disposed",
      "particle.lifecycle.terminal-disposed",
      "Disposed deterministic particle sessions reject every API except idempotent repeated dispose.",
    );
  }

  private reject(capability: string, boundary: string): ParticleOperationResult<never> {
    return particleRejected("evidence-required", capability, boundary);
  }
}

function validateLifecycleSequence(commands: readonly ParticleCommand[]): ParticleOperationResult<void> {
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]!;
    if (command.kind === "clear-all" && command.reason === "movetime" &&
      commands[index + 1]?.kind !== "suppress-until-replay") {
      return transitionRejected(
        "particle.command.incomplete-movetime-sequence",
        "MoveTime Clear-all and suppress-until-replay are one adjacent atomic transition.",
      );
    }
    if (command.kind === "suppress-until-replay") {
      const previous = commands[index - 1];
      if (previous?.kind !== "clear-all" || previous.reason !== "movetime") {
        return transitionRejected(
          "particle.command.orphan-movetime-suppression",
          "MoveTime suppression requires its immediately preceding Clear-all.",
        );
      }
    }
  }
  return particleAccepted(undefined);
}

function applyCommand(
  command: ParticleCommand,
  owners: Map<string, MutableOwner>,
  simulation: DeterministicParticleSimulation,
  suppressedUntilReplay: boolean,
): ParticleOperationResult<boolean> {
  switch (command.kind) {
    case "play-root": {
      if (suppressedUntilReplay) {
        return transitionRejected("particle.command.play-while-suppressed", "MoveTime rejects Play until whole-engine replay.");
      }
      const owner = owners.get(command.ownerKey);
      if (owner === undefined) {
        owners.set(command.ownerKey, {
          root: command.root,
          instance: Object.freeze({ ...command.instance }),
          restartCount: 0,
        });
      } else if (owner.root === command.root && sameInstance(owner.instance, command.instance)) {
        owner.restartCount += 1;
      } else {
        return transitionRejected("particle.command.owner-root-mismatch", "A live owner cannot switch roots without exact Stop/Clear/deactivate.");
      }
      simulation.playRoot(command.ownerKey, command.instance, command.root);
      return particleAccepted(false);
    }
    case "stop-clear-deactivate-root": {
      const owner = owners.get(command.ownerKey);
      if (owner === undefined || owner.root !== command.root || !sameInstance(owner.instance, command.instance)) {
        return transitionRejected("particle.command.missing-active-owner", "Stop/Clear/deactivate requires the exact live owner/root/instance.");
      }
      owners.delete(command.ownerKey);
      simulation.stopOwner(command.ownerKey);
      return particleAccepted(suppressedUntilReplay);
    }
    case "clear-all":
      owners.clear();
      simulation.clearAll();
      return particleAccepted(false);
    case "suppress-until-replay":
      return owners.size === 0
        ? particleAccepted(true)
        : transitionRejected("particle.command.suppress-with-active-owner", "MoveTime must clear all live owners before suppression.");
    default:
      return transitionRejected("particle.command.unknown-transition", "Unknown particle commands cannot mutate deterministic state.");
  }
}

function sameInstance(left: ParticleInstanceIdentity, right: ParticleInstanceIdentity): boolean {
  if (left.kind !== right.kind || left.rangeLength !== right.rangeLength) return false;
  return left.kind === "game-play-button" && right.kind === "game-play-button"
    ? left.buttonType === right.buttonType
    : left.kind === "note-slide" && right.kind === "note-slide" &&
      left.noteIndex === right.noteIndex && left.buttonType === right.buttonType;
}

function cloneOwners(source: ReadonlyMap<string, MutableOwner>): Map<string, MutableOwner> {
  return new Map([...source].map(([key, value]) => [key, {
    root: value.root,
    instance: Object.freeze({ ...value.instance }),
    restartCount: value.restartCount,
  }]));
}

function freezeFrameSnapshot(frame: ParticleFrameSnapshot): ParticleFrameSnapshot {
  return Object.freeze({
    frame: frame.frame,
    deltaTimeBits: frame.deltaTimeBits,
    paused: frame.paused,
    commands: Object.freeze(frame.commands.map(freezeParticleCommand)),
    samples: Object.freeze([...frame.samples]),
  });
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function transitionRejected(capability: string, boundary: string): ParticleOperationResult<never> {
  return particleRejected("evidence-required", capability, boundary);
}
