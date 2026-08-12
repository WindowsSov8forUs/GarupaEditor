import type {
  ParticleFrameBatch,
  ParticleOperationResult,
  ParticleRendererFrameBatch,
  SimulatorParticleBackend,
  SimulatorParticleRendererBackend,
} from "../../backends/particleContracts";
import {
  particleFloat32ToBits,
} from "../../backends/particleValidation";
import type { OneFrameJudgementBatch } from "../data/oneFrameData";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import {
  ParticleCommandOwnerTransaction,
  ParticleCommandProducer,
} from "./particleCommandProducer";

export class ParticleOuterFrameTransaction {
  private state: "pending" | "domain-committed" | "committed" | "discarded" = "pending";

  constructor(
    private readonly coordinator: ParticleFrameCoordinator,
    private readonly backendBatch: ParticleFrameBatch,
    private readonly rendererBatch: ParticleRendererFrameBatch | null,
    private readonly ownerTransaction: ParticleCommandOwnerTransaction | null,
  ) {}

  commitDomain(): SimulatorResult<void> {
    if (this.state !== "pending") return transactionRejected("domain commit", this.state);
    const committed = mapParticleResult(this.coordinator.backend.commitFrame(this.backendBatch));
    if (committed.status !== "ok") {
      if (this.rendererBatch !== null) this.coordinator.renderer!.discardFrame(this.rendererBatch);
      this.ownerTransaction?.discard();
      return committed;
    }
    const owner = this.ownerTransaction?.commit() ?? ok(undefined);
    if (owner.status !== "ok") {
      if (this.rendererBatch !== null) this.coordinator.renderer!.discardFrame(this.rendererBatch);
      return owner;
    }
    this.state = "domain-committed";
    if (this.rendererBatch === null) {
      this.state = "committed";
      this.coordinator.finishFrame(this.backendBatch.frame);
    }
    return ok(undefined);
  }

  commitRender(): SimulatorResult<void> {
    if (this.rendererBatch === null) {
      return this.state === "committed"
        ? ok(undefined)
        : transactionRejected("render commit", this.state);
    }
    if (this.state !== "domain-committed") return transactionRejected("render commit", this.state);
    const committed = mapParticleResult(this.coordinator.renderer!.commitFrame(this.rendererBatch));
    if (committed.status === "ok") {
      this.state = "committed";
      this.coordinator.finishFrame(this.backendBatch.frame);
    }
    return committed;
  }

  discardRenderAfterDomainFault(): SimulatorResult<void> {
    if (this.state !== "domain-committed" || this.rendererBatch === null) {
      return this.state === "committed"
        ? ok(undefined)
        : transactionRejected("post-domain render discard", this.state);
    }
    const discarded = mapParticleResult(this.coordinator.renderer!.discardFrame(this.rendererBatch));
    if (discarded.status === "ok") this.state = "discarded";
    return discarded;
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") return transactionRejected("discard", this.state);
    if (this.rendererBatch !== null) {
      const renderer = mapParticleResult(this.coordinator.renderer!.discardFrame(this.rendererBatch));
      if (renderer.status !== "ok") return renderer;
    }
    const backend = mapParticleResult(this.coordinator.backend.discardFrame(this.backendBatch));
    if (backend.status !== "ok") return backend;
    const owner = this.ownerTransaction?.discard() ?? ok(undefined);
    if (owner.status !== "ok") return owner;
    this.state = "discarded";
    return ok(undefined);
  }
}

export class ParticleFrameCoordinator {
  private frame = 0;

  constructor(
    readonly sessionId: string,
    readonly producer: ParticleCommandProducer,
    readonly backend: SimulatorParticleBackend,
    readonly renderer: SimulatorParticleRendererBackend | null,
  ) {}

  validate(): SimulatorResult<void> {
    if (typeof this.sessionId !== "string" || this.sessionId.length === 0) {
      return rejected("particle.session.invalid-id", "Particle sessions require one non-empty host identity.");
    }
    const backend = this.backend.snapshot();
    if (backend.state !== "ready" || backend.sessionId !== this.sessionId || backend.fault !== null ||
      backend.nextFrame !== null || backend.nextSequence !== 0) {
      return rejected(
        "particle.session.backend-not-fresh-ready",
        "Engine creation requires a freshly prepared exact-session particle backend with zero committed frames/commands.",
      );
    }
    if (this.renderer !== null) {
      const renderer = this.renderer.snapshot();
      if (renderer.state !== "ready" || renderer.sessionId !== this.sessionId || renderer.fault !== null ||
        renderer.nextFrame !== null || renderer.nodeCount !== 0) {
        return rejected(
          "particle.session.renderer-not-fresh-ready",
          "Particle Pixi mapping requires a freshly prepared exact-session empty renderer.",
        );
      }
    }
    return this.producer.validate();
  }

  pollFaults(): SimulatorResult<void> {
    const backend = this.backend.snapshot();
    if (backend.fault !== null) {
      return evidenceRequired(
        `particle.${backend.fault.code}.${backend.fault.capability}`,
        [],
        backend.fault.boundary,
      );
    }
    if (backend.state !== "ready") {
      return rejected("particle.session.backend-left-ready-state", "An active particle backend cannot leave ready state.");
    }
    if (this.renderer !== null) {
      const renderer = this.renderer.snapshot();
      if (renderer.fault !== null) {
        return evidenceRequired(
          `particle.renderer.${renderer.fault.code}.${renderer.fault.capability}`,
          [],
          renderer.fault.boundary,
        );
      }
      if (renderer.state !== "ready") {
        return rejected("particle.session.renderer-left-ready-state", "An active particle renderer cannot leave ready state.");
      }
    }
    return ok(undefined);
  }

  preflightAdvance(
    deltaTimeSeconds: number,
    paused: boolean,
  ): SimulatorResult<ParticleOuterFrameTransaction> {
    if (this.producer.snapshot().terminal) {
      return rejected(
        "particle.frame.advance-after-terminal",
        "No additional particle outer frame may follow terminal cleanup before a fresh retry/reset session.",
      );
    }
    return this.preflight(deltaTimeSeconds, paused, null);
  }

  preflightJudgement(
    deltaTimeSeconds: number,
    batch: OneFrameJudgementBatch,
  ): SimulatorResult<ParticleOuterFrameTransaction> {
    const owner = this.producer.preflightJudgement(batch);
    return owner.status === "ok"
      ? this.preflight(deltaTimeSeconds, false, owner.value)
      : owner;
  }

  preflightTerminal(
    reason: "natural-end",
  ): SimulatorResult<ParticleOuterFrameTransaction> {
    const owner = this.producer.preflightTerminal(reason);
    return owner.status === "ok" ? this.preflight(0, false, owner.value) : owner;
  }

  preflightMoveTime(): SimulatorResult<ParticleOuterFrameTransaction> {
    const owner = this.producer.preflightMoveTime();
    return owner.status === "ok" ? this.preflight(0, false, owner.value) : owner;
  }

  preflightDispose(): SimulatorResult<ParticleOuterFrameTransaction> {
    const owner = this.producer.preflightDispose();
    return owner.status === "ok" ? this.preflight(0, false, owner.value) : owner;
  }

  rejectParticleOnlyReturnTime(): SimulatorResult<never> {
    return this.producer.preflightReturnTime();
  }

  disposeBackends(): SimulatorResult<void> {
    const renderer = this.renderer?.dispose() ?? null;
    if (renderer !== null && renderer.status !== "accepted") return mapParticleResult(renderer);
    return mapParticleResult(this.backend.dispose());
  }

  finishFrame(frame: number): void {
    if (frame !== this.frame) throw new Error("Particle frame coordinator committed a foreign frame");
    this.frame += 1;
  }

  private preflight(
    deltaTimeSeconds: number,
    paused: boolean,
    ownerTransaction: ParticleCommandOwnerTransaction | null,
  ): SimulatorResult<ParticleOuterFrameTransaction> {
    const faults = this.pollFaults();
    if (faults.status !== "ok") {
      ownerTransaction?.discard();
      return faults;
    }
    if (typeof deltaTimeSeconds !== "number" ||
      !Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      ownerTransaction?.discard();
      return rejected(
        "particle.frame.invalid-host-delta",
        "Particle outer-frame time is one finite non-negative host delta converted once to binary32.",
      );
    }
    const rounded = Math.fround(deltaTimeSeconds);
    const deltaTimeBits = particleFloat32ToBits(rounded);
    if (deltaTimeBits === null) {
      ownerTransaction?.discard();
      return rejected(
        "particle.frame.invalid-host-delta",
        "Particle outer-frame time is one finite non-negative host delta converted once to binary32.",
      );
    }
    const commands = ownerTransaction?.commands ?? Object.freeze([]);
    const backendBatch = this.backend.preflightFrame(Object.freeze({
      frame: this.frame,
      deltaTimeBits,
      paused,
      commands,
    }));
    if (backendBatch.status !== "accepted") {
      ownerTransaction?.discard();
      return mapParticleResult(backendBatch);
    }
    const preview = this.backend.previewFrame(backendBatch.value);
    if (preview.status !== "accepted") {
      this.backend.discardFrame(backendBatch.value);
      ownerTransaction?.discard();
      return mapParticleResult(preview);
    }
    const rendererBatch = this.renderer?.preflightFrame(Object.freeze({
      sessionId: this.sessionId,
      frame: this.frame,
      samples: preview.value,
    })) ?? null;
    if (rendererBatch !== null && rendererBatch.status !== "accepted") {
      this.backend.discardFrame(backendBatch.value);
      ownerTransaction?.discard();
      return mapParticleResult(rendererBatch);
    }
    return ok(new ParticleOuterFrameTransaction(
      this,
      backendBatch.value,
      rendererBatch?.value ?? null,
      ownerTransaction,
    ));
  }
}

export function mapParticleResult<T>(result: ParticleOperationResult<T>): SimulatorResult<T> {
  return result.status === "accepted"
    ? ok(result.value)
    : evidenceRequired(
        `particle.${result.status}.${result.failure.capability}`,
        [],
        result.failure.boundary,
      );
}

function transactionRejected(action: string, state: string): SimulatorResult<never> {
  return rejected(
    "particle.transaction.invalid-state",
    `Particle outer-frame ${action} cannot run from ${state}.`,
  );
}

function rejected<T = never>(capability: string, boundary: string): SimulatorResult<T> {
  return evidenceRequired(capability, [], boundary);
}
